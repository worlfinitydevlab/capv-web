// Sujets d'examens : libelles, dates et echeances (partage entre « Mes examens » et « Dossiers »).
export const TYPES = [["sujet", "Sujet"], ["corrige", "Corrigé"], ["bareme", "Barème"], ["autre", "Autre"]];
export const libelleType = (t) => { const x = TYPES.find((y) => y[0] === t); return x ? x[1] : t || ""; };

// statut -> [libelle, classe du badge]
export const STATUTS = {
  a_preparer: ["À préparer", "badge-gold"], en_cours: ["En cours", "badge-blue"], en_revision: ["En révision", "badge-blue"],
  soumis: ["Soumis", "badge-blue"], a_corriger: ["À corriger", "badge-err"], valide: ["Validé", "badge-ok"],
  refuse: ["Refusé", "badge-err"], archive: ["Archivé", "badge-gray"], annule: ["Annulé", "badge-gray"]
};
export const statutDoc = (s) => STATUTS[s] || [s || "", "badge-gray"];
// decision de validation -> [libelle, classe du badge]
export const LIBELLE_DECISION = { valide: ["Validé", "badge-ok"], a_corriger: ["À corriger", "badge-err"], refuse: ["Refusé", "badge-err"] };
export function octetsFr(n) {
  const x = Number(n);
  if (!Number.isFinite(x) || x < 0) return "";
  if (x < 1024) return x + " o";
  if (x < 1048576) return Math.round(x / 1024) + " Ko";
  return (Math.round((x / 1048576) * 10) / 10).toString().replace(".", ",") + " Mo";
}
// un document a rendre (une date limite peut etre depassee) : tant qu'il n'est ni soumis, ni valide, ni archive, ni annule
const A_RENDRE = ["a_preparer", "en_cours", "en_revision", "a_corriger"];

export const STATUTS_DOSSIER = { ouvert: ["Ouvert", "badge-ok"], clos: ["Clos", "badge-gray"], archive: ["Archivé", "badge-gray"] };

// « 2026-12-01 » -> « 01/12/2026 » (sans passer par un fuseau horaire)
export function dateFr(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  return m ? m[3] + "/" + m[2] + "/" + m[1] : "";
}
export function aujourdhuiLocal() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function jours(deIso, aIso) {
  const a = Date.UTC(+deIso.slice(0, 4), +deIso.slice(5, 7) - 1, +deIso.slice(8, 10));
  const b = Date.UTC(+aIso.slice(0, 4), +aIso.slice(5, 7) - 1, +aIso.slice(8, 10));
  return Math.round((b - a) / 86400000);
}
// { texte, classe } a afficher a cote d'une date limite ; null si rien a signaler
export function echeance(dateIso, statut, aujourdhui) {
  if (!dateIso || !A_RENDRE.includes(statut)) return null;
  const n = jours(aujourdhui || aujourdhuiLocal(), dateIso);
  if (n < 0) return { texte: n === -1 ? "En retard d'un jour" : "En retard de " + (-n) + " jours", classe: "badge-err", retard: true };
  if (n === 0) return { texte: "Aujourd'hui", classe: "badge-gold", retard: false };
  if (n <= 3) return { texte: "Dans " + n + " jour" + (n > 1 ? "s" : ""), classe: "badge-gold", retard: false };
  return null;
}
export const nomPersonne = (a) => (a && (a.nom || a.employee_id)) || "";

// ---- Etape S3 : journal (historique)
// action du journal -> [libelle en francais, sensible par nature]
export const ACTIONS_JOURNAL = {
  dossier_creer: "Dossier créé", dossier_modifier: "Dossier modifié", dossier_clos: "Dossier clos", dossier_rouvert: "Dossier rouvert",
  document_creer: "Document créé", document_modifier: "Document modifié", document_annule: "Document annulé", document_restaure: "Document rétabli",
  attribution: "Attribution", lien_enseignant: "Compte lié à un enseignant",
  fichier_modele: "Fichier Word créé", telechargement: "Fichier téléchargé", lecture: "Fichier lu en ligne",
  verrou_pris: "Main prise sur un document", verrou_libere: "Main rendue", verrou_force: "Verrou libéré de force",
  version_deposee: "Version déposée", version_conflit: "Version déposée à vérifier", version_resolue: "Version retenue",
  depot_refuse: "Dépôt refusé", refus: "Accès refusé",
  // poste principal (etape S5a)
  poste_cree: "Poste principal créé", poste_revoque: "Poste principal révoqué", poste_telechargement: "Fichier pris par le poste", poste_recu: "Fichier reçu au poste",
  poste_ecart: "Écart d'empreinte au poste", poste_pdf: "PDF fabriqué par le poste", poste_pdf_erreur: "PDF non fabriqué", poste_pdf_refuse: "PDF refusé", lecture_pdf: "PDF lu en ligne",
  // soumission, validation et archivage (etape S4)
  soumission: "Document soumis", decision: "Décision de validation", rouverture: "Document rouvert", archivage: "Document archivé", purge: "Anciennes versions purgées"
};
export const libelleAction = (a) => ACTIONS_JOURNAL[a] || String(a || "").replace(/_/g, " ");
export const LIBELLES_CIBLE = { dossier: "Dossier", document: "Document", compte: "Compte" };

// Une phrase courte qui resume le detail d'une ligne du journal (jamais de donnees brutes affichees telles quelles)
export function resumeDetail(action, d) {
  if (!d || typeof d !== "object") return "";
  const t = (x) => (x === null || x === undefined ? "" : String(x));
  const titre = d.titre ? "« " + d.titre + " »" : "";
  const nom = (p) => (p && (p.nom || p.employee_id)) || "";
  switch (action) {
    case "dossier_creer": case "dossier_clos": case "dossier_rouvert": return d.nom ? "« " + d.nom + " »" : "";
    case "document_creer": return [titre, d.dossier ? "dans « " + d.dossier + " »" : ""].filter(Boolean).join(" ");
    case "document_modifier": case "document_restaure": return titre;
    case "document_annule": return [titre, d.motif ? "motif : " + d.motif : ""].filter(Boolean).join(" - ");
    case "attribution": {
      const morceaux = [];
      if (d.responsable_apres) morceaux.push("responsable : " + nom(d.responsable_apres));
      else if (d.responsable_avant) morceaux.push("responsable retiré : " + nom(d.responsable_avant));
      if (Array.isArray(d.co_ajoutes) && d.co_ajoutes.length) morceaux.push("co-rédacteurs ajoutés : " + d.co_ajoutes.map(nom).join(", "));
      if (Array.isArray(d.co_retires) && d.co_retires.length) morceaux.push("retirés : " + d.co_retires.map(nom).join(", "));
      return [titre].concat(morceaux).filter(Boolean).join(" - ");
    }
    case "fichier_modele": return [titre, d.numero ? "version " + d.numero : ""].filter(Boolean).join(" - ");
    case "telechargement": case "lecture": case "lecture_pdf": return [titre, d.numero ? "version " + d.numero : ""].filter(Boolean).join(" - ");
    case "poste_cree": case "poste_revoque": return d.nom ? "« " + d.nom + " »" : "";
    case "poste_telechargement": case "poste_recu": case "poste_pdf": case "poste_pdf_refuse": return [titre, d.numero ? "version " + d.numero : "", d.poste ? "poste « " + d.poste + " »" : ""].filter(Boolean).join(" - ");
    case "poste_ecart": return [titre, d.numero ? "version " + d.numero : "", d.poste ? "poste « " + d.poste + " »" : "", "empreintes différentes"].filter(Boolean).join(" - ");
    case "poste_pdf_erreur": return [titre, d.numero ? "version " + d.numero : "", d.poste ? "poste « " + d.poste + " »" : "", d.message ? t(d.message) : ""].filter(Boolean).join(" - ");
    case "verrou_pris": return [titre, d.remplace ? "reprise après " + d.remplace : ""].filter(Boolean).join(" - ");
    case "verrou_libere": return [titre, d.detenteur ? d.detenteur + " : " + (d.raison || "libéré") : ""].filter(Boolean).join(" - ");
    case "verrou_force": return [titre, d.detenteur ? "verrou de " + d.detenteur : "", d.motif ? "motif : " + d.motif : ""].filter(Boolean).join(" - ");
    case "version_deposee": case "version_conflit": return [titre, d.numero ? "version " + d.numero : "", d.nom_fichier ? "fichier « " + d.nom_fichier + " »" : "", d.motif ? "note : " + d.motif : ""].filter(Boolean).join(" - ");
    case "version_resolue": return [titre, d.retenue ? "version " + d.retenue + " retenue" : "", d.note ? "note : " + d.note : ""].filter(Boolean).join(" - ");
    case "depot_refuse": return [titre, d.nom_fichier ? "fichier « " + d.nom_fichier + " »" : "", d.raison ? t(d.raison) : ""].filter(Boolean).join(" - ");
    case "refus": return [d.action ? "action « " + d.action + " »" : "", d.droit ? "droit manquant : " + d.droit : d.raison ? t(d.raison) : ""].filter(Boolean).join(" - ");
    case "soumission": return [titre, d.version ? "version " + d.version : "", d.dossier ? "dossier « " + d.dossier + " »" : "", d.avec_note ? "avec une note" : ""].filter(Boolean).join(" - ");
    case "decision": return [titre, ({ valide: "validé", a_corriger: "corrections demandées", refuse: "refusé" })[d.decision] || t(d.decision), d.version ? "version " + d.version : "", d.observation ? "« " + d.observation + " »" : ""].filter(Boolean).join(" - ");
    case "rouverture": return [titre, d.de && d.vers ? "de « " + (STATUTS[d.de] ? STATUTS[d.de][0] : d.de).toLowerCase() + " » à « " + (STATUTS[d.vers] ? STATUTS[d.vers][0] : d.vers).toLowerCase() + " »" : "", d.motif ? "motif : " + d.motif : ""].filter(Boolean).join(" - ");
    case "archivage": return [titre, d.version_validee ? "version officielle " + d.version_validee : ""].filter(Boolean).join(" - ");
    case "purge": {
      const n = Array.isArray(d.purgees) ? d.purgees.length : 0;
      return [titre, d.version_officielle ? "version officielle " + d.version_officielle + " gardée" : "", n ? n + " version" + (n > 1 ? "s" : "") + " purgée" + (n > 1 ? "s" : "") + " (" + d.purgees.join(", ") + ")" : "rien à purger", d.octets_liberes ? octetsFr(d.octets_liberes) + " libérés" : "", Array.isArray(d.echecs) && d.echecs.length ? d.echecs.length + " échec(s)" : ""].filter(Boolean).join(" - ");
    }
    case "lien_enseignant": return d.enseignant ? "enseignant : " + d.enseignant : (d.employee_id === null ? "lien retiré" : "");
    default: return titre;
  }
}

// « 2026-11-08 » (jour local choisi) -> debut / fin de ce jour en ISO (le serveur compare en UTC)
export function debutDeJour(jourIso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(jourIso || "")); if (!m) return undefined;
  return new Date(+m[1], +m[2] - 1, +m[3], 0, 0, 0, 0).toISOString();
}
export function finDeJour(jourIso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(jourIso || "")); if (!m) return undefined;
  return new Date(+m[1], +m[2] - 1, +m[3], 23, 59, 59, 999).toISOString();
}
