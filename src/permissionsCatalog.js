// Catalogue unique des droits de l'ERP CAPV (web).
// Un droit = une cle (colonne `module` de role_permissions) + 4 cases : voir, creer, modifier, annuler.
// `a` donne le libelle de chaque case QUE LE SITE APPLIQUE REELLEMENT. Une case absente est "sans objet" :
// elle est grisee dans l'ecran Permissions (cocher n'aurait aucun effet).
// `nouveau` = cle ajoutee avec ce decoupage. Les cles historiques ne sont jamais renommees ni supprimees.

export const CHAMP = { voir: "peut_voir", creer: "peut_creer", modifier: "peut_modifier", annuler: "peut_annuler" };
export const ACTIONS = ["voir", "creer", "modifier", "annuler"];
export const COLONNES = { voir: "Voir", creer: "Creer", modifier: "Modifier", annuler: "Annuler" };

export const CATALOGUE = [
  { id: "tableaux", titre: "Tableaux de bord", modules: [
    { cle: "dashboard_finance", nom: "Tableau de bord Finance", aide: "Revenus, depenses, caisse du jour : chiffres de l'argent.", a: { voir: "Voir" }, nouveau: true },
    { cle: "dashboard_pedagogie", nom: "Tableau de bord Pedagogie", aide: "Effectifs, inscriptions, classes.", a: { voir: "Voir" }, nouveau: true },
    { cle: "dashboard_discipline", nom: "Tableau de bord Discipline", aide: "Incidents, carnets, parents a prevenir.", a: { voir: "Voir" }, nouveau: true }
  ] },
  { id: "scolarite", titre: "Scolarite", modules: [
    { cle: "inscriptions", nom: "Inscription", a: { voir: "Voir", creer: "Nouveau candidat", modifier: "Decider apres l'examen" } },
    { cle: "students", nom: "Eleves", a: { voir: "Voir", creer: "Ajouter un eleve", modifier: "Modifier une fiche, annees passees", annuler: "Supprimer un eleve" } },
    { cle: "classes", nom: "Classes & Sections", aide: "Structure seulement : sections, classes, salles. Les frais sont dans \"Frais de classe\".", a: { voir: "Voir", creer: "Creer section, classe ou salle", annuler: "Supprimer section, classe ou salle" } },
    { cle: "class_fees", nom: "Frais de classe", aide: "Bouton \"Gerer les frais\" d'une classe.", a: { voir: "Voir la liste des frais", creer: "Ajouter un frais", modifier: "Changer l'echeance, suspendre ou reactiver", annuler: "Supprimer un frais" }, nouveau: true },
    { cle: "years", nom: "Annees academiques", a: { voir: "Voir", creer: "Creer une annee", modifier: "Activer une annee", annuler: "Cloturer une annee" } },
    { cle: "annees_passees", nom: "Annees passees", a: { voir: "Voir", creer: "Placer des eleves dans une annee passee" } },
    { cle: "assignments", nom: "Assignations", a: { voir: "Voir", creer: "Assigner a une classe", annuler: "Retirer d'une classe ou d'une salle" } },
    { cle: "programs", nom: "Programmes & Activites", aide: "Les paiements des programmes se reglent avec la Caisse.", a: { voir: "Voir", creer: "Creer un programme", modifier: "Modifier, activer ou desactiver" } }
  ] },
  { id: "discipline", titre: "Discipline", modules: [
    { cle: "disc_carnets", nom: "Discipline : carnets", a: { voir: "Voir", creer: "Saisir un incident, emettre un carnet ou un duplicata", annuler: "Annuler un incident ou declarer un carnet perdu" } },
    { cle: "disc_suivi", nom: "Discipline : suivi des parents", a: { voir: "Voir", creer: "Avertir, convoquer ou appeler", modifier: "Enregistrer la reponse, regler les lettres", annuler: "Annuler un suivi" } },
    { cle: "disc_saisie", nom: "Discipline : saisie depuis la feuille", a: { voir: "Voir", creer: "Enregistrer les incidents de la feuille" } },
    { cle: "disc_imprimables", nom: "Discipline : imprimables", a: { voir: "Voir" } },
    { cle: "disc_config", nom: "Discipline : configuration", a: { voir: "Voir", modifier: "Modifier niveaux, fautes et carnet" } }
  ] },
  { id: "pedagogie", titre: "Pedagogie", modules: [
    { cle: "matieres", nom: "Matieres : catalogue et categories", a: { voir: "Voir", creer: "Ajouter", modifier: "Modifier", annuler: "Supprimer" } },
    { cle: "matieres_affectation", nom: "Matieres par classe", aide: "Affecter une matiere a une classe, copier en lot, sous-matieres, reprise d'une annee.", a: { voir: "Voir", creer: "Affecter ou copier", modifier: "Modifier l'affectation, les sous-matieres", annuler: "Retirer une matiere d'une classe" }, nouveau: true },
    { cle: "enseignants", nom: "Enseignants", a: { voir: "Voir", creer: "Ajouter un enseignant", annuler: "Retirer un enseignant" }, nouveau: true },
    { cle: "periodes", nom: "Periodes", aide: "Onglet Periodes de Notes & Evaluations.", a: { voir: "Voir", creer: "Creer ou copier d'une annee", modifier: "Modifier, poids, verrouiller, ouvrir la saisie", annuler: "Supprimer une periode" }, nouveau: true },
    { cle: "notes", nom: "Notes & Evaluations", aide: "Bulletin de classe, evaluations et notes.", a: { voir: "Voir", creer: "Creer une evaluation", modifier: "Modifier une evaluation ou une note", annuler: "Supprimer une evaluation" } },
    { cle: "notes_parametres", nom: "Parametres pedagogiques", aide: "Onglet Parametres de Notes & Evaluations (moyenne generale, impression).", a: { voir: "Voir", modifier: "Modifier" }, nouveau: true },
    { cle: "saisie-notes", nom: "Saisie des notes", a: { voir: "Voir", modifier: "Saisir et corriger des notes" } },
    { cle: "regles-academiques", nom: "Regles academiques", aide: "Regles de decision et ordre des classes.", a: { voir: "Voir", creer: "Ajouter une regle", modifier: "Modifier", annuler: "Supprimer" } },
    { cle: "promotion", nom: "Promotion des eleves", aide: "Calcul des decisions de fin d'annee et leur application.", a: { voir: "Voir le calcul", modifier: "Appliquer la promotion" }, nouveau: true },
    { cle: "documents-imprimables", nom: "Documents imprimables", aide: "Palmares, cahier de presence, bulletins.", a: { voir: "Voir et imprimer" } }
  ] },
  { id: "finances", titre: "Finances", modules: [
    { cle: "cashier", nom: "Caisse", aide: "Tous les encaissements. Le detail par type d'encaissement viendra avec la phase Finance.", a: { voir: "Voir" } },
    { cle: "misc_fees", nom: "Frais divers", a: { voir: "Voir" } },
    { cle: "sales", nom: "Ventes magasin", a: { voir: "Voir" } },
    { cle: "expenses_grande", nom: "Grande caisse", a: { voir: "Voir", creer: "Nouvelle depense", modifier: "Approuver ou finaliser", annuler: "Annuler une depense" } },
    { cle: "expenses_petite", nom: "Petite caisse", a: { voir: "Voir", creer: "Nouvelle depense", modifier: "Approuver", annuler: "Annuler une depense" } },
    { cle: "petite_caisse_alimentation", nom: "Alimentation de la petite caisse", a: { creer: "Transferer vers la petite caisse", modifier: "Alimenter ou configurer" } },
    { cle: "decaissement_approbation", nom: "Approbation des decaissements", a: { modifier: "Approuver un decaissement" } },
    { cle: "comptes_bancaires", nom: "Comptes bancaires", a: { voir: "Voir", creer: "Nouveau compte ou transfert", modifier: "Modifier, activer ou desactiver" } },
    { cle: "sous_caisses", nom: "Sous-caisses", a: { voir: "Voir" } },
    { cle: "sous_caisse_gestion", nom: "Sous-caisses : gestion", a: { modifier: "Ouvrir ou gerer une sous-caisse" } },
    { cle: "plan_comptable", nom: "Plan comptable", a: { voir: "Voir" } },
    { cle: "ecritures", nom: "Comptabilite generale", a: { voir: "Voir" } },
    { cle: "accounting", nom: "Revenus & Depenses", a: { voir: "Voir" } },
    { cle: "fournisseurs", nom: "Comptes fournisseurs", a: { voir: "Voir" } },
    { cle: "clients", nom: "Comptes clients", a: { voir: "Voir" } },
    { cle: "po_decaissement", nom: "Paiements et rapprochements", aide: "Payer un fournisseur, rapprochement bancaire, immobilisations, comptes clients.", a: { modifier: "Autoriser ces operations" } },
    { cle: "etats_financiers", nom: "Etats financiers", a: { voir: "Voir" } },
    { cle: "rapprochement", nom: "Rapprochement bancaire", a: { voir: "Voir" } },
    { cle: "immobilisations", nom: "Immobilisations", a: { voir: "Voir" } },
    { cle: "cloture_caisse", nom: "Cloture de caisse", a: { voir: "Voir", modifier: "Cloturer la caisse" } },
    { cle: "debts", nom: "Creances", a: { voir: "Voir" } },
    { cle: "journal", nom: "Journal des versements", a: { voir: "Voir" } },
    { cle: "reductions", nom: "Bourses & Reductions", a: { voir: "Voir", creer: "Accorder une reduction", annuler: "Annuler une reduction" } }
  ] },
  { id: "rh", titre: "Ressources humaines et Logistique", modules: [
    { cle: "employees", nom: "Employes", a: { voir: "Voir", modifier: "Autoriser les changements" } },
    { cle: "store", nom: "Magasin", a: { voir: "Voir" } },
    { cle: "store_profitability", nom: "Rentabilite magasin", a: { voir: "Voir" } },
    { cle: "delivery", nom: "Livraison", a: { voir: "Voir" } },
    { cle: "bsa", nom: "Bons de sortie", a: { voir: "Voir" } },
    { cle: "purchasing", nom: "Approvisionnement", a: { voir: "Voir" } },
    { cle: "po_approbation", nom: "Approbation des bons de commande", a: { modifier: "Approuver" } },
    { cle: "inventory", nom: "Magasin : approbations", aide: "Bons de sortie et demandes internes.", a: { modifier: "Approuver ou traiter" } },
    { cle: "internal_requests", nom: "Demandes internes", a: { voir: "Voir" } }
  ] },
  { id: "systeme", titre: "Systeme", modules: [
    { cle: "users", nom: "Utilisateurs", aide: "Creer des comptes, gerer les roles et les permissions : reserve a l'Administrateur.", a: { voir: "Voir la liste" } },
    { cle: "reports", nom: "Rapports", a: { voir: "Voir" } },
    { cle: "settings", nom: "Parametres : etablissement", aide: "Informations, papier des documents, messages, jours feries.", a: { voir: "Voir", modifier: "Modifier" } },
    { cle: "settings_finance", nom: "Parametres : recus et caisse", aide: "Format des recus, plafonds, categories de depenses.", a: { voir: "Voir", modifier: "Modifier" }, nouveau: true },
    { cle: "settings_securite", nom: "Parametres : securite", aide: "Verrouillage automatique de la session.", a: { voir: "Voir", modifier: "Modifier" }, nouveau: true },
    { cle: "devices", nom: "Appareils", aide: "La page reste reservee a l'Administrateur.", a: { voir: "Voir" } }
  ] }
];

// Cles qu'on peut trouver en base mais que le site n'utilise plus (ancien catalogue, bureau) : montrees dans "Autres".
export const HERITEES = {
  dashboard: "Ancien tableau de bord unique (remplace par les trois tableaux de bord)",
  payments: "Paiements (ancien catalogue / bureau)",
  store_sales: "Ventes magasin (ancien catalogue / bureau)",
  expenses: "Depenses (ancien catalogue / bureau)",
  audit: "Journal d'audit (ancien catalogue / bureau)",
  cashier_rapport_global: "Rapport global de caisse (ancien catalogue / bureau)"
};

export const TOUTES_LES_CLES = CATALOGUE.flatMap((s) => s.modules.map((m) => m.cle));
export const MODULE_PAR_CLE = Object.fromEntries(CATALOGUE.flatMap((s) => s.modules.map((m) => [m.cle, m])));

// Cle de droit de l'element de menu `id` (le tableau de bord depend de l'espace affiche).
export function cleDePage(id, espace) {
  if (id === "dashboard") return "dashboard_" + (espace || "finance");
  return id;
}

// Pages a onglets : la page s'ouvre des qu'un de ses droits est accorde (chaque onglet reste protege par son propre droit).
export const CLES_DE_PAGE = {
  matieres: ["matieres", "matieres_affectation", "enseignants"],
  notes: ["notes", "periodes", "notes_parametres"],
  "regles-academiques": ["regles-academiques", "promotion"],
  settings: ["settings", "settings_finance", "settings_securite"]
};

// Le role peut-il ouvrir la page `id` ? `can` vient de usePermissions().
export function peutOuvrir(can, id, espace) {
  return (CLES_DE_PAGE[id] || [cleDePage(id, espace)]).some((cle) => can(cle, "voir"));
}

