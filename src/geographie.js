// Geographie d'Haiti pour l'identifiant eleve et la fiche : communes par departement (liste de depart, a verifier par l'ecole).
// Les sections communales ne sont pas pre-remplies : elles s'ajoutent au fil des inscriptions (liste partagee, table listes_reference).
// Les communes ajoutees par l'ecole (non listees ici) sont aussi gardees dans listes_reference.

export const COMMUNES = {
  1: ["Anse-à-Galets", "Arcahaie", "Cabaret", "Carrefour", "Cité Soleil", "Cornillon", "Croix-des-Bouquets", "Delmas", "Fonds-Verrettes", "Ganthier", "Grand-Goâve", "Gressier", "Kenscoff", "Léogâne", "Pétion-Ville", "Petit-Goâve", "Pointe-à-Raquette", "Port-au-Prince", "Tabarre", "Thomazeau"],
  2: ["Anse-Rouge", "Desdunes", "Dessalines", "Ennery", "Gonaïves", "Grande-Saline", "Gros-Morne", "La Chapelle", "L'Estère", "Liancourt", "Marmelade", "Petite-Rivière-de-l'Artibonite", "Saint-Marc", "Saint-Michel-de-l'Attalaye", "Terre-Neuve", "Verrettes"],
  3: ["Acul-du-Nord", "Bahon", "Bas-Limbé", "Borgne", "Cap-Haïtien", "Dondon", "Grande-Rivière-du-Nord", "La Victoire", "Limbé", "Limonade", "Milot", "Pignon", "Pilate", "Plaine-du-Nord", "Plaisance", "Port-Margot", "Quartier-Morin", "Ranquitte", "Saint-Raphaël"],
  4: ["Aquin", "Arniquet", "Camp-Perrin", "Cavaillon", "Chantal", "Chardonnières", "Côteaux", "Île-à-Vache", "Les Anglais", "Les Cayes", "Maniche", "Port-à-Piment", "Port-Salut", "Roche-à-Bateaux", "Saint-Jean-du-Sud", "Saint-Louis-du-Sud", "Tiburon", "Torbeck"],
  5: ["Baptiste", "Belladère", "Boucan-Carré", "Cerca-Carvajal", "Cerca-la-Source", "Hinche", "Lascahobas", "Maïssade", "Mirebalais", "Saut-d'Eau", "Savanette", "Thomassique", "Thomonde"],
  6: ["Anse-à-Foleur", "Baie-de-Henne", "Bassin-Bleu", "Bombardopolis", "Chansolme", "Jean-Rabel", "La Tortue", "Môle-Saint-Nicolas", "Port-de-Paix", "Saint-Louis-du-Nord"],
  7: ["Anse-à-Pitres", "Bainet", "Belle-Anse", "Cayes-Jacmel", "Côtes-de-Fer", "Grand-Gosier", "Jacmel", "La Vallée-de-Jacmel", "Marigot", "Thiotte"],
  8: ["Abricots", "Anse-d'Hainault", "Beaumont", "Bonbon", "Chambellan", "Corail", "Dame-Marie", "Jérémie", "Les Irois", "Marfranc", "Moron", "Pestel", "Roseaux"],
  9: ["Capotille", "Caracol", "Carice", "Ferrier", "Fort-Liberté", "Mombin-Crochu", "Mont-Organisé", "Ouanaminthe", "Perches", "Sainte-Suzanne", "Terrier-Rouge", "Trou-du-Nord", "Vallières"],
  10: ["Anse-à-Veau", "Arnaud", "Baradères", "Fonds-des-Nègres", "Grand-Boucan", "L'Asile", "Miragoâne", "Paillant", "Petite-Rivière-de-Nippes", "Petit-Trou-de-Nippes", "Plaisance-du-Sud"]
};

export const PAYS_FREQUENTS = ["États-Unis", "Canada", "France", "République dominicaine", "Bahamas", "Chili", "Brésil", "Guyane française", "Guadeloupe", "Martinique", "Belgique", "Suisse", "Mexique", "Cuba", "Îles Turques-et-Caïques", "Panama"];

// Cle de comparaison : sans accents, sans majuscules, espaces / tirets / apostrophes ignores ("Pétion Ville" = "petion-ville")
export const cleListe = (s) => String(s == null ? "" : s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

export const nettoyerValeur = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim();

export const trierFr = (liste) => [...liste].sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));

// Liste d'un parent : valeurs de depart + valeurs ajoutees, sans doublon (comparaison par cle), triees
export function fusionnerListe(depart, ajoutees, valeurActuelle) {
  const vus = new Set();
  const out = [];
  [...(depart || []), ...(ajoutees || [])].forEach((v) => {
    const n = nettoyerValeur(v);
    const k = cleListe(n);
    if (n && !vus.has(k)) { vus.add(k); out.push(n); }
  });
  const actuelle = nettoyerValeur(valeurActuelle);
  if (actuelle && !vus.has(cleListe(actuelle))) out.push(actuelle);   // valeur d'avant (texte libre) : on la garde visible
  return trierFr(out);
}

export const cleParentSection = (departement, commune) => String(departement || "") + "|" + nettoyerValeur(commune);
