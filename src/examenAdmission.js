// Examens d'admission : calcul de la moyenne et decision automatique. Fonctions pures (testables sans navigateur).
//   Une classe souhaitee a, au plus, un examen : des matieres (avec une note maximale chacune) et une moyenne de reussite sur 10.
//   Moyenne sur 10 = total des notes / total des notes maximales x 10 (comme le palmares : une matiere compte selon sa note maximale).
//   Decision : Reussi si moyenne >= moyenne de reussite, Echoue sinon ; tant que toutes les notes ne sont pas saisies : En attente.

export const ETATS = {
  sans_examen: "Sans examen",
  non_configure: "Examen à configurer",
  en_attente: "Résultats en attente",
  reussi: "Réussi",
  echoue: "Échoué"
};

export const arrondi2 = (x) => Math.round((Number(x) + Number.EPSILON) * 100) / 100;

// Nombre saisi a la main : « 12,5 » = 12.5. -> { vide:true } | { ok:true, valeur } | { ok:false }
export function lireNombre(saisie) {
  if (saisie === null || saisie === undefined) return { vide: true };
  if (typeof saisie === "number") return Number.isFinite(saisie) ? { ok: true, valeur: saisie } : { ok: false };
  const t = String(saisie).trim().replace(/\s/g, "").replace(",", ".");
  if (t === "") return { vide: true };
  if (!/^\d+(\.\d{0,2})?$/.test(t) && !/^\.\d{1,2}$/.test(t)) return { ok: false };
  return { ok: true, valeur: Number(t) };
}

// Message d'erreur d'une note saisie pour une matiere de note maximale `max` ("" si la note est correcte ou vide)
export function erreurNote(saisie, max) {
  const n = lireNombre(saisie);
  if (n.vide) return "";
  if (!n.ok) return "Nombre invalide (exemple : 12,5)";
  if (n.valeur < 0) return "La note ne peut pas être négative";
  if (n.valeur > Number(max)) return "La note ne peut pas dépasser " + String(Number(max)).replace(".", ",");
  return "";
}

// Verification de la configuration saisie dans la fenetre. Retourne la liste des messages ("" = correcte).
export function erreursConfiguration(moyenne, matieres) {
  const e = [];
  const m = lireNombre(moyenne);
  if (m.vide || !m.ok) e.push("La moyenne de réussite est requise (nombre de 0 à 10, exemple : 5 ou 6,5).");
  else if (m.valeur < 0 || m.valeur > 10) e.push("La moyenne de réussite doit être comprise entre 0 et 10.");
  if (!matieres || !matieres.length) e.push("Ajoute au moins une matière à l'examen.");
  const vus = new Set();
  (matieres || []).forEach((x, i) => {
    if (!x.subject_uuid) { e.push("Matière " + (i + 1) + " : choisis la matière."); return; }
    if (vus.has(x.subject_uuid)) e.push((x.nom || "Une matière") + " est ajoutée deux fois.");
    vus.add(x.subject_uuid);
    const n = lireNombre(x.note_max);
    if (n.vide || !n.ok || n.valeur <= 0) e.push((x.nom || "Matière " + (i + 1)) + " : la note maximale doit être un nombre supérieur à 0.");
    else if (n.valeur > 1000) e.push((x.nom || "Matière " + (i + 1)) + " : la note maximale est trop grande.");
  });
  return e;
}

// config : { moyenne_reussite } | null ; matieres : [{ id, nom, note_max }] ; notes : { [matiere_id]: nombre | texte | null }
export function calculerExamen(config, matieres, notes) {
  if (!config) return { etat: "sans_examen", saisies: 0, attendues: 0, manque: [], total: 0, totalMax: 0, moyenne: null, seuil: null };
  const liste = matieres || [];
  const seuil = Number(config.moyenne_reussite);
  if (!liste.length) return { etat: "non_configure", saisies: 0, attendues: 0, manque: [], total: 0, totalMax: 0, moyenne: null, seuil };
  let total = 0, totalMax = 0, saisies = 0;
  const manque = [];
  for (const m of liste) {
    totalMax += Number(m.note_max);
    const n = lireNombre(notes ? notes[m.id] : null);
    if (n.ok && !erreurNote(n.valeur, m.note_max)) { total += n.valeur; saisies++; }
    else manque.push(m.nom || "?");
  }
  const r = { saisies, attendues: liste.length, manque, total: arrondi2(total), totalMax: arrondi2(totalMax), moyenne: null, seuil };
  if (manque.length) return { ...r, etat: "en_attente" };
  const moyenne = arrondi2(total / totalMax * 10);
  return { ...r, moyenne, etat: moyenne >= seuil ? "reussi" : "echoue" };
}

// Affichage : 7.5 -> « 7,50 »
export const formatNombre = (x) => (x === null || x === undefined || Number.isNaN(Number(x)) ? "-" : Number(x).toFixed(2).replace(".", ","));
export const formatNote = (x) => (x === null || x === undefined ? "" : String(Number(x)).replace(".", ","));

// Decision de chaque candidat. configs : { [class_uuid]: { id, moyenne_reussite } } ; matieresParConfig : { [config_id]: [..] } ; notesParCandidat : { [inscription_id]: { [matiere_id]: note } }
export function decisionsCandidats(candidats, configs, matieresParConfig, notesParCandidat) {
  return (candidats || []).map((c) => {
    const cfg = c.classe_souhaitee_uuid ? (configs || {})[c.classe_souhaitee_uuid] || null : null;
    const ms = cfg ? ((matieresParConfig || {})[cfg.id] || []) : [];
    return { candidat: c, config: cfg, ...calculerExamen(cfg, ms, (notesParCandidat || {})[c.id] || {}) };
  });
}

export function compter(decisions) {
  const n = { sans_examen: 0, non_configure: 0, en_attente: 0, reussi: 0, echoue: 0 };
  (decisions || []).forEach((d) => { n[d.etat] = (n[d.etat] || 0) + 1; });
  return n;
}

// Le script SQL des examens n'est pas (encore) installe sur la base : table ou colonne introuvable
export const MESSAGE_SQL_EXAMENS = "Le script « examens-admission.sql » n'est pas encore installé sur cette base. Lance-le dans Supabase (SQL Editor), puis recharge la page.";
export const manqueSql = (e) => !!e && (["PGRST205", "PGRST204", "42P01", "42703"].includes(e.code) || /schema cache|does not exist|Could not find/i.test(String(e.message || "")));
// Erreur Supabase -> phrase pour l'ecran
export const messageErreur = (e) => (manqueSql(e) ? MESSAGE_SQL_EXAMENS : (e && e.message) || "Une erreur est survenue.");
