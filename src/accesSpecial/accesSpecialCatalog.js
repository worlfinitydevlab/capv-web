// Catalogue des taches d'acces special : copie de TACHES dans la fonction serveur acces-special (supabase/functions/acces-special/index.ts).
// Les deux doivent rester identiques (cles, noms, actif). `actif: false` = prevu dans la structure mais CACHE et refuse par le serveur
// (Finance : on ouvrira ces taches le jour ou on en aura besoin, sans rien reconstruire).

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
