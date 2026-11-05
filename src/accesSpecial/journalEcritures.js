// Journal des ecritures faites pendant un acces a droits temporaires.
// Toutes les requetes du client Supabase passent par la fonction fetch fabriquee ici (voir supabaseClient.js). Quand la personne a un acces a
// droits temporaires en cours, chaque ECRITURE (ajout, modification, suppression) laisse une ligne dans son journal : table, operation, filtres,
// noms des champs et valeurs courtes. accesSpecialStore.js envoie ces lignes au serveur. Les lectures ne sont jamais enregistrees.
// Sans acces a droits en cours : aucun effet (un seul test, la requete part telle quelle). Le journal ne bloque, ne retarde et ne modifie jamais une requete.

// Branche par accesSpecialStore.js (evite une dependance circulaire avec supabaseClient.js)
export const crochet = { actif: () => false, enregistrer: () => {} };

const TABLES_IGNOREES = ["audit_logs", "device_registrations"];   // ecritures propres au site (journal d'audit, enregistrement de l'appareil)
const RPC_IGNORES = ["next_counter_value", "next_eleve_seq"];     // compteurs de numeros (recus, matricules) : effet secondaire d'une vraie operation
const CHAMP_SENSIBLE = /pass|mdp|pin|token|secret|hash|api_?key/i;
const FILTRES_IGNORES = ["select", "order", "limit", "offset", "on_conflict", "columns"];
const OPERATIONS = { POST: "insert", PATCH: "update", PUT: "upsert", DELETE: "delete" };
const CORPS_MAX = 200000;   // au-dela, le corps n'est pas lu (images, logos)

function lireEntete(entetes, nom) {
  if (!entetes) return "";
  try {
    if (typeof entetes.get === "function") return entetes.get(nom) || "";
    if (Array.isArray(entetes)) { const p = entetes.find((x) => String(x[0]).toLowerCase() === nom); return p ? String(p[1]) : ""; }
    const cle = Object.keys(entetes).find((k) => k.toLowerCase() === nom);
    return cle ? String(entetes[cle]) : "";
  } catch (e) { return ""; }
}

function resumerCorps(corps) {
  const lignes = Array.isArray(corps) ? corps : corps && typeof corps === "object" ? [corps] : [];
  const nb = lignes.length || 1;
  const premiere = lignes[0] && typeof lignes[0] === "object" ? lignes[0] : null;
  if (!premiere) return { nb, champs: [], valeurs: null };
  const champs = Object.keys(premiere).slice(0, 16);
  const valeurs = {};
  champs.forEach((k) => {
    if (CHAMP_SENSIBLE.test(k)) return;
    const v = premiere[k];
    if (v === null || typeof v === "number" || typeof v === "boolean") valeurs[k] = v;
    else if (typeof v === "string") valeurs[k] = v.length > 80 ? v.slice(0, 80) + "…" : v;
  });
  return { nb, champs, valeurs: JSON.stringify(valeurs).length <= 1200 ? valeurs : null };
}

// Decrit une requete d'ecriture envoyee a l'API REST de Supabase ; null si ce n'est pas une ecriture a journaliser.
export function decrireRequete(url, init) {
  const methode = String((init && init.method) || "GET").toUpperCase();
  let operation = OPERATIONS[methode];
  if (!operation) return null;
  let u;
  try { u = new URL(String(url)); } catch (e) { return null; }
  const m = u.pathname.match(/\/rest\/v1\/(.+)$/);
  if (!m) return null;
  let nom = decodeURIComponent(m[1]);
  if (nom.startsWith("rpc/")) {
    nom = nom.slice(4);
    if (RPC_IGNORES.includes(nom)) return null;
    operation = "rpc";
    nom = "rpc:" + nom;
  } else if (TABLES_IGNOREES.includes(nom)) return null;
  const prefer = lireEntete(init && init.headers, "prefer");
  if (operation === "insert" && (/resolution=/.test(prefer) || u.searchParams.has("on_conflict"))) operation = "upsert";
  const filtres = [];
  u.searchParams.forEach((v, k) => { if (!FILTRES_IGNORES.includes(k) && filtres.length < 8) filtres.push(k + "=" + v.slice(0, 80)); });
  let corps = null;
  if (operation !== "delete" && init && typeof init.body === "string" && init.body.length <= CORPS_MAX) {
    try { corps = JSON.parse(init.body); } catch (e) { corps = null; }
  }
  const r = resumerCorps(corps);
  return { table: nom, operation, filtres, nb: operation === "insert" || operation === "upsert" ? r.nb : 1, champs: operation === "delete" ? [] : r.champs, valeurs: operation === "delete" ? null : r.valeurs };
}

async function consigner(infos, reponse) {
  try {
    let resultat = "reussi", message = null;
    if (!reponse) { resultat = "echec"; message = "Connexion impossible"; }
    else if (!reponse.ok) {
      resultat = "echec"; message = "HTTP " + reponse.status;
      const copie = reponse.clone();   // avant tout await : le corps n'est pas encore lu par le client
      try { const d = await copie.json(); if (d && d.message) message += " : " + String(d.message).slice(0, 200); } catch (e) { /* pas de detail */ }
    }
    crochet.enregistrer({
      type: "ecriture", tache: infos.table, cible: infos.filtres.join(" & ").slice(0, 300), nb: infos.nb, resultat, message,
      detail: { op: infos.operation, table: infos.table, filtres: infos.filtres, champs: infos.champs, valeurs: infos.valeurs }
    });
  } catch (e) { /* le journal ne doit jamais gener une ecriture */ }
}

// Enrobe une fonction fetch : meme resultat, meme delai ; en plus, journalise les ecritures quand un acces a droits est en cours.
export function creerFetchJournal(base) {
  return function fetchJournal(entree, init) {
    const promesse = base(entree, init);
    try {
      if (!crochet.actif()) return promesse;
      const url = typeof entree === "string" ? entree : entree && entree.url ? entree.url : String(entree);
      const options = init || (entree && typeof entree === "object" && entree.method ? { method: entree.method, headers: entree.headers } : undefined);
      const infos = decrireRequete(url, options);
      if (infos) promesse.then((reponse) => { consigner(infos, reponse); }, () => { consigner(infos, null); });
    } catch (e) { /* idem */ }
    return promesse;
  };
}

// Texte lisible d'un filtre PostgREST : "id=eq.12" -> "id = 12"
const SIGNES = { eq: "=", neq: "≠", gt: ">", gte: "≥", lt: "<", lte: "≤", like: "contient", ilike: "contient", is: "est", in: "parmi", cs: "contient", not: "pas" };
export function filtreLisible(f) {
  const i = String(f).indexOf("=");
  if (i < 1) return String(f);
  const col = f.slice(0, i), reste = f.slice(i + 1), j = reste.indexOf(".");
  if (col === "or" || col === "and" || j < 1) return col + " " + reste;
  const op = reste.slice(0, j), val = reste.slice(j + 1);
  return col + " " + (SIGNES[op] || op) + " " + (val === "null" ? "vide" : val);
}
