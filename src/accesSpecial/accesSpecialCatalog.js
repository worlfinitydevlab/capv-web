// Catalogue des acces speciaux : copie de TACHES et de MODULES dans la fonction serveur acces-special (supabase/functions/acces-special/index.ts).
// Les deux doivent rester identiques (cles, noms, actif). `actif: false` = prevu dans la structure mais CACHE et refuse par le serveur
// (Finance : on ouvrira ces taches / ces modules le jour ou on en aura besoin, sans rien reconstruire).
import { CATALOGUE } from "../permissionsCatalog.js";

// ---------------------------------------------------------------- taches (levee de la double authentification)
export const TACHES = {
  retrait_assignation: {
    nom: "Retirer un élève de sa classe", court: "Retrait de classe", module: "Scolarité", actif: true,
    aide: "Boutons « Retirer » (page Assignations, y compris « Retirer la sélection ») et « Retirer de la salle » (Classes & Sections). Les factures de l'élève sont conservées. Un retrait de plusieurs élèves compte pour autant d'actions que d'élèves."
  },
  suppression_eleve: {
    nom: "Supprimer un élève", court: "Suppression d'élève", module: "Scolarité", actif: true,
    aide: "Bouton « Supprimer » de la page Élèves. Action sérieuse : prévois de préférence une seule action."
  },
  suppression_section_classe: {
    nom: "Supprimer une section ou une classe", court: "Suppression section/classe", module: "Scolarité", actif: true,
    aide: "Bouton « x » d'une section ou d'une classe (Classes & Sections). Ne permet pas de supprimer une salle."
  },
  suspension_frais_classe: {
    nom: "Suspendre ou réactiver un frais de classe", court: "Suspension de frais", module: "Scolarité", actif: true,
    aide: "Boutons « Suspendre » / « Réactiver » dans « Gérer les frais » d'une classe. Ne permet pas de changer les montants ni les dates."
  },
  // ---- Finance : structure seulement (cache et refuse tant que actif = false)
  approbation_depense: { nom: "Approuver ou refuser une dépense (Grande ou Petite caisse)", court: "Approbation de dépense", module: "Finance", actif: false, aide: "" },
  archivage_categorie_depense: { nom: "Archiver une catégorie de dépense", court: "Archivage de catégorie", module: "Finance", actif: false, aide: "" },
  verification_cloture: { nom: "Vérifier une clôture de caisse", court: "Vérification de clôture", module: "Finance", actif: false, aide: "" },
  depot_cloture: { nom: "Déposer une clôture de caisse en banque", court: "Dépôt de clôture", module: "Finance", actif: false, aide: "" }
};

export const nomTache = (cle) => (TACHES[cle] ? TACHES[cle].nom : cle);
export const courtTache = (cle) => (TACHES[cle] ? TACHES[cle].court : cle);
export const TACHES_ACTIVES = Object.keys(TACHES).filter((k) => TACHES[k].actif);

export const DUREE_MIN = 5, DUREE_MAX = 240, MAX_ACTIONS = 500;
export const DUREES = [
  { min: 15, nom: "15 min" }, { min: 30, nom: "30 min" }, { min: 60, nom: "1 h" }, { min: 120, nom: "2 h" }, { min: 240, nom: "4 h" }
];

// ---------------------------------------------------------------- droits temporaires (acces a des modules, par niveau)
// Un acces peut donner, pour la duree choisie, des droits sur des modules du catalogue des permissions :
// voir (ouvrir la page), creer, modifier, annuler. Les cles et les niveaux viennent de permissionsCatalog.js.
export const ACTIONS_DROITS = ["voir", "creer", "modifier", "annuler"];
export const NOMS_ACTIONS = { voir: "voir", creer: "créer", modifier: "modifier", annuler: "annuler" };
export const COLONNES_DROITS = { voir: "Voir", creer: "Créer", modifier: "Modifier", annuler: "Annuler" };

// Jamais accordables (gestion des comptes et des droits : la page Utilisateurs, la page Appareils reservee a l'Administrateur).
// La page "Acces speciaux" n'a pas de cle de droit : elle reste reservee a l'Administrateur.
export const MODULES_EXCLUS = ["users", "devices"];
// Prevus dans la structure mais CACHES et refuses par le serveur : toute la Finance, plus les salaires et les approbations d'achat.
// Pour en ouvrir un plus tard : le retirer de ces deux listes ici ET (meme ligne) dans la fonction serveur, puis redeployer.
export const SECTIONS_MASQUEES = ["finances"];
export const CLES_MASQUEES = ["dashboard_finance", "settings_finance", "employees", "employees_fiches", "payroll", "po_approbation"];

// [{ cle, nom, aide, section, sectionTitre, actions: ["voir", ...], labels: { voir: "Voir", creer: "Ajouter un eleve", ... }, actif }]
export function listerModulesDroits() {
  const liste = [];
  CATALOGUE.forEach((s) => s.modules.forEach((m) => {
    if (MODULES_EXCLUS.includes(m.cle)) return;
    const actions = ACTIONS_DROITS.filter((a) => m.a && m.a[a]);
    if (!actions.length) return;
    liste.push({
      cle: m.cle, nom: m.nom, aide: m.aide || "", section: s.id, sectionTitre: s.titre, actions, labels: m.a,
      actif: !SECTIONS_MASQUEES.includes(s.id) && !CLES_MASQUEES.includes(m.cle)
    });
  }));
  return liste;
}
export const MODULES_DROITS = listerModulesDroits();
export const MODULES_ACTIFS = MODULES_DROITS.filter((m) => m.actif);
const PAR_CLE = Object.fromEntries(MODULES_DROITS.map((m) => [m.cle, m]));
export const nomModule = (cle) => (PAR_CLE[cle] ? PAR_CLE[cle].nom : cle);

// Sections (avec leurs modules actifs) pour le formulaire
export function sectionsDroits() {
  const sections = [];
  MODULES_ACTIFS.forEach((m) => {
    let s = sections.find((x) => x.id === m.section);
    if (!s) { s = { id: m.section, titre: m.sectionTitre, modules: [] }; sections.push(s); }
    s.modules.push(m);
  });
  return sections;
}

// "Eleves (voir, créer), Assignations (voir)" ; au-dela de `max` modules : "+ N autre(s)"
export function resumeDroits(droits, max) {
  const cles = Object.keys(droits || {}).filter((k) => droits[k] && droits[k].length);
  if (!cles.length) return "";
  const vus = (max && cles.length > max ? cles.slice(0, max) : cles).map((k) => nomModule(k) + " (" + droits[k].map((a) => NOMS_ACTIONS[a] || a).join(", ") + ")");
  return vus.join(", ") + (max && cles.length > max ? " + " + (cles.length - max) + " autre(s)" : "");
}
export const aDesDroits = (droits) => !!droits && Object.keys(droits).some((k) => droits[k] && droits[k].length);

// Noms lisibles des tables de la base (rapport des modifications). Une table inconnue est affichee telle quelle.
export const NOMS_TABLES = {
  students: "Élèves", student_history: "Historique des élèves", student_decisions: "Décisions de fin d'année", classes: "Classes", sections: "Sections",
  rooms: "Salles", class_fees: "Frais de classe", assignments: "Assignations", academic_years: "Années académiques", inscriptions: "Inscriptions",
  programs: "Programmes", program_students: "Élèves des programmes", program_targets: "Cibles des programmes", program_payments: "Paiements de programmes",
  reductions: "Bourses et réductions", discipline_incidents: "Incidents de discipline", discipline_carnets: "Carnets de discipline",
  discipline_suivis: "Suivis des parents", discipline_fautes: "Fautes", discipline_niveaux: "Niveaux de discipline", discipline_reglages: "Réglages de discipline",
  pedagogie_reglages: "Réglages pédagogiques", institution_settings: "Paramètres de l'établissement", holidays: "Jours fériés", logos: "Logos",
  items: "Articles du magasin", item_variants: "Tailles des articles", item_categories: "Catégories d'articles", item_movements: "Mouvements de stock",
  suppliers: "Fournisseurs", purchase_orders: "Bons de commande", purchase_order_items: "Lignes de bons de commande", bsa: "Bons de sortie", bsa_items: "Lignes de bons de sortie",
  internal_requests: "Demandes internes", internal_request_items: "Lignes de demandes internes", customers: "Clients", services: "Services",
  admin_messages: "Messages", pieces_justificatives: "Pièces justificatives",
  examens_admission_config: "Examens d'admission (configuration)", examens_admission_matieres: "Examens d'admission (matières)", examens_admission_notes: "Examens d'admission (notes)"
};
export const nomTable = (t) => NOMS_TABLES[t] || t;
