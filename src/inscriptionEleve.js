// Inscription (etape B) : champs obligatoires, telephones (+509), conversion formulaire <-> base, statistiques par ecole precedente.
// Fonctions pures (testables) ; la page Inscriptions.jsx les utilise.
import { debutIdentifiant } from "./identifiantEleve.js";
import { plusBasseQue } from "./classeSouhaitee.js";
import { cleListe } from "./geographie.js";
import { analyserTelephone, afficherTelephone } from "./telephone.js";
// Telephones : indicatif du pays (+509 Haiti par defaut) + numero ; analyse, formatage et liste des pays dans telephone.js
export { analyserTelephone, afficherTelephone };

export const LIENS_PARENTE = ["Mère", "Père", "Tuteur / Tutrice", "Grand-père", "Grand-mère", "Oncle", "Tante", "Frère", "Sœur"];

export const FORM_VIDE = {
  nom: "", prenom: "", date_naissance: "", sexe: "", nationalite: "",
  departement_naissance: "", commune_naissance: "", section_communale: "", pays_naissance: "", lieu_naissance: "",
  a_handicap: "", handicap_besoins: "",
  adresse: "", numero_ordre: "", numero_identifiant: "", nisu: "", telephone: "", email: "",
  congregation_religieuse: "", rang_famille: "",
  pere_connu: true, pere_nom: "", pere_prenom: "", pere_statut: "", pere_occupation: "", pere_nif: "", pere_telephone: "",
  mere_connue: true, mere_nom: "", mere_prenom: "", mere_statut: "", mere_occupation: "", mere_nif: "", mere_telephone: "",
  responsable_lien: "", responsable_nom: "", responsable_prenom: "", responsable_occupation: "", responsable_nif: "", responsable_ninu: "",
  responsable_email: "", responsable_telephone: "", responsable_telephone2: "",
  urgence_telephone: "", urgence_lien: "",
  ecole_precedente: "", classe_precedente: "", classe_souhaitee_uuid: "", remarques: ""
};

const CHAMPS_PERE = ["pere_nom", "pere_prenom", "pere_statut", "pere_occupation", "pere_nif", "pere_telephone"];
const CHAMPS_MERE = ["mere_nom", "mere_prenom", "mere_statut", "mere_occupation", "mere_nif", "mere_telephone"];
const CHAMPS_TEL = ["telephone", "pere_telephone", "mere_telephone", "responsable_telephone", "responsable_telephone2", "urgence_telephone"];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const vide = (v) => String(v == null ? "" : v).trim() === "";

// ---- Controle avant enregistrement ----
//   ctx : { ordre, classes } (ordre des classes de l'ecole ; classes de l'annee [{ id, nom }])
//   renvoie [{ champ, type: "manque" | "invalide", message }]
export function erreursInscription(f, ctx) {
  const e = [];
  const manque = (champ, message) => e.push({ champ, type: "manque", message });
  const invalide = (champ, message) => e.push({ champ, type: "invalide", message });
  if (vide(f.prenom)) manque("prenom", "Prénom");
  if (vide(f.nom)) manque("nom", "Nom");
  if (vide(f.date_naissance)) manque("date_naissance", "Date de naissance");
  else if (debutIdentifiant({ ...f, nom: "X", prenom: "X", sexe: "M", departement_naissance: 1 }).manque.includes("date de naissance")) invalide("date_naissance", "La date de naissance n'est pas valide");
  if (f.sexe !== "M" && f.sexe !== "F") manque("sexe", "Genre");
  const dep = Number(f.departement_naissance);
  if (!Number.isInteger(dep) || dep < 1 || dep > 11) manque("departement_naissance", "Département de naissance");
  else if (dep === 11) { if (vide(f.pays_naissance)) manque("pays_naissance", "Pays de naissance"); }
  else if (vide(f.commune_naissance)) manque("commune_naissance", "Commune de naissance");
  if (f.a_handicap !== "oui" && f.a_handicap !== "non") manque("a_handicap", "Handicap (Oui ou Non)");
  else if (f.a_handicap === "oui" && vide(f.handicap_besoins)) manque("handicap_besoins", "Type de handicap");
  if (vide(f.classe_souhaitee_uuid)) manque("classe_souhaitee_uuid", "Classe souhaitée");
  else if (ctx && ctx.classes && !vide(f.classe_precedente)) {
    const c = ctx.classes.find((x) => x.id === f.classe_souhaitee_uuid);
    if (c && plusBasseQue(ctx.ordre, c.nom, f.classe_precedente)) invalide("classe_souhaitee_uuid", "La classe souhaitée (" + c.nom + ") ne peut pas être plus basse que la classe précédente (" + f.classe_precedente + ")");
  }
  for (const [p, fem] of [["mere", true], ["pere", false]]) {
    if (!f[p === "mere" ? "mere_connue" : "pere_connu"]) continue;
    const du = fem ? "de la mère" : "du père";
    if (vide(f[p + "_nom"])) manque(p + "_nom", "Nom " + du);
    if (vide(f[p + "_prenom"])) manque(p + "_prenom", "Prénom " + du);
    if (vide(f[p + "_statut"])) manque(p + "_statut", "Statut " + du + (fem ? " (Vivante ou Décédée)" : " (Vivant ou Décédé)"));
    if (vide(f[p + "_occupation"])) manque(p + "_occupation", "Occupation " + du);
  }
  if (vide(f.responsable_lien)) manque("responsable_lien", "Lien de parenté de la personne responsable");
  if (vide(f.responsable_nom)) manque("responsable_nom", "Nom de la personne responsable");
  if (vide(f.responsable_prenom)) manque("responsable_prenom", "Prénom de la personne responsable");
  if (vide(f.responsable_nif) && vide(f.responsable_ninu)) manque("responsable_nif", "NIF ou NINU de la personne responsable (un des deux suffit)");
  if (vide(f.responsable_telephone)) manque("responsable_telephone", "Téléphone de la personne responsable");
  const libTel = { telephone: "Téléphone de l'élève", pere_telephone: "Téléphone du père", mere_telephone: "Téléphone de la mère", responsable_telephone: "Téléphone de la personne responsable", responsable_telephone2: "Téléphone additionnel", urgence_telephone: "Téléphone d'urgence" };
  for (const k of CHAMPS_TEL) {
    if (vide(f[k])) continue;
    if ((k === "pere_telephone" && !f.pere_connu) || (k === "mere_telephone" && !f.mere_connue)) continue;
    if (!analyserTelephone(f[k]).ok) invalide(k, libTel[k] + " : Haïti = 8 chiffres ; autre pays = choisir l'indicatif du pays puis le numéro complet");
  }
  if (!vide(f.responsable_email) && !EMAIL.test(String(f.responsable_email).trim())) invalide("responsable_email", "Email de la personne responsable : adresse non valide");
  if (!vide(f.email) && !EMAIL.test(String(f.email).trim())) invalide("email", "Email de l'élève : adresse non valide");
  return e;
}

// ---- Formulaire -> base ----
export function versBaseInscription(f) {
  const { a_handicap, classe_souhaitee_uuid, date_naissance, pere_connu, mere_connue, ...reste } = f;
  const out = { ...reste };
  out.date_naissance = date_naissance || null;
  out.classe_souhaitee_uuid = classe_souhaitee_uuid || null;
  out.departement_naissance = f.departement_naissance ? Number(f.departement_naissance) : null;
  out.a_handicap = a_handicap === "oui" ? true : a_handicap === "non" ? false : null;
  out.handicap_besoins = a_handicap === "oui" ? String(f.handicap_besoins || "").trim() : "";
  out.pere_connu = !!pere_connu;
  out.mere_connue = !!mere_connue;
  if (!pere_connu) for (const k of CHAMPS_PERE) out[k] = "";    // rien n'est garde pour un parent « non connu »
  if (!mere_connue) for (const k of CHAMPS_MERE) out[k] = "";
  for (const k of CHAMPS_TEL) { const a = analyserTelephone(out[k]); if (a.ok) out[k] = a.compact; }
  for (const k of ["responsable_email", "email"]) out[k] = String(out[k] || "").trim();
  return out;
}

// ---- Base -> formulaire (modification d'un candidat) ----
export function depuisBaseInscription(row) {
  const f = { ...FORM_VIDE };
  for (const k of Object.keys(FORM_VIDE)) if (row && row[k] != null) f[k] = typeof FORM_VIDE[k] === "boolean" ? !!row[k] : String(row[k]);
  f.date_naissance = row && row.date_naissance ? String(row.date_naissance).slice(0, 10) : "";
  f.departement_naissance = row && row.departement_naissance ? String(row.departement_naissance) : "";
  f.a_handicap = row && row.a_handicap === true ? "oui" : row && row.a_handicap === false ? "non" : (row && row.handicap_besoins ? "oui" : "");
  f.pere_connu = !row || row.pere_connu !== false;     // ancienne inscription (vide) : a confirmer par la personne qui complete la fiche
  f.mere_connue = !row || row.mere_connue !== false;
  for (const k of CHAMPS_TEL) f[k] = afficherTelephone(f[k]);
  return f;
}

// ---- Statistiques par ecole precedente ----
//   ecolesListe : noms de la liste memorisee ; inscriptions : [{ ecole_precedente, statut_inscription }] de l'annee ; eleves : [{ ecole_precedente }] (tous les eleves)
//   -> [{ nom, candidats: { total, en_attente, admis, refuse }, eleves }] ; ecoles sans aucun inscrit gardees ; tri : plus d'inscrits d'abord
export function statistiquesEcoles({ ecolesListe, inscriptions, eleves }) {
  const lignes = new Map();
  const ligne = (texte) => {
    const k = cleListe(texte);
    if (!k) return null;
    if (!lignes.has(k)) lignes.set(k, { nom: String(texte).replace(/\s+/g, " ").trim(), candidats: { total: 0, en_attente: 0, admis: 0, refuse: 0 }, eleves: 0 });
    return lignes.get(k);
  };
  for (const n of ecolesListe || []) ligne(n);
  for (const i of inscriptions || []) {
    const l = ligne(i.ecole_precedente);
    if (!l) continue;
    l.candidats.total++;
    const s = i.statut_inscription === "admis" ? "admis" : i.statut_inscription === "refuse" ? "refuse" : "en_attente";
    l.candidats[s]++;
  }
  for (const s of eleves || []) { const l = ligne(s.ecole_precedente); if (l) l.eleves++; }
  return [...lignes.values()].sort((a, b) => (b.candidats.total + b.eleves) - (a.candidats.total + a.eleves) || a.nom.localeCompare(b.nom, "fr", { sensitivity: "base" }));
}
