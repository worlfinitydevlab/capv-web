// Identifiant eleve (remplace le matricule) : 3 premieres lettres du nom + 1ere lettre du 1er prenom + date de naissance (AAAAMMJJ)
// + sexe (G/F) + departement de naissance sur 2 chiffres + numero d'ordre sur 5 chiffres.
// Exemple : ST FORT, JOSEPH JEFFERESON, ne le 03/02/2014, garcon, Ouest  ->  STFJ20140203G0100001
// Tant qu'une information manque (date, sexe, departement), l'eleve garde un matricule provisoire (ancien format STFJ-0001).

export const DEPARTEMENTS = [
  { code: 1, nom: "Ouest" }, { code: 2, nom: "Artibonite" }, { code: 3, nom: "Nord" }, { code: 4, nom: "Sud" },
  { code: 5, nom: "Centre" }, { code: 6, nom: "Nord-Ouest" }, { code: 7, nom: "Sud-Est" }, { code: 8, nom: "Grand'Anse" },
  { code: 9, nom: "Nord-Est" }, { code: 10, nom: "Nippes" }, { code: 11, nom: "Diaspora" }
];
export const nomDepartement = (code) => { const d = DEPARTEMENTS.find((x) => x.code === Number(code)); return d ? d.nom : ""; };

const FORMAT_NORMAL = /^[A-Z]{4}\d{8}[GF]\d{7}$/;
const FORMAT_ANCIEN = /^[A-Z]{3,4}-\d{3,}$/;

// Lettres A-Z seulement (accents retires, espaces, tirets et apostrophes ignores)
export const lettres = (s) => String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z]/g, "").toUpperCase();

function dateValide(d) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d || "").slice(0, 10));
  if (!m) return null;
  const an = Number(m[1]), mois = Number(m[2]), jour = Number(m[3]);
  const t = new Date(Date.UTC(an, mois - 1, jour));
  if (t.getUTCFullYear() !== an || t.getUTCMonth() !== mois - 1 || t.getUTCDate() !== jour) return null;
  if (an < 1900 || an > new Date().getFullYear() + 1) return null;
  return m[1] + m[2] + m[3];
}

// Ce qu'il faut pour l'identifiant normal. Renvoie { complet, manque: [libelles], debut } ; debut = les 15 premiers caracteres
export function debutIdentifiant(e) {
  const manque = [];
  const nom = lettres(e && e.nom), prenom = lettres(e && e.prenom);
  if (!nom) manque.push("nom");
  if (!prenom) manque.push("prénom");
  const date = dateValide(e && e.date_naissance);
  if (!date) manque.push("date de naissance");
  const sexe = e && e.sexe === "M" ? "G" : e && e.sexe === "F" ? "F" : "";
  if (!sexe) manque.push("sexe");
  const dep = Number(e && e.departement_naissance);
  if (!Number.isInteger(dep) || dep < 1 || dep > 11) manque.push("département de naissance");
  if (manque.length) return { complet: false, manque, debut: "" };
  return { complet: true, manque: [], debut: (nom + "XXX").slice(0, 3) + prenom.slice(0, 1) + date + sexe + String(dep).padStart(2, "0") };
}

export const completerNumero = (debut, numero) => debut + String(numero).padStart(5, "0");

// "normal" (STFJ20140203G0100001) | "ancien" (STFJ-0001, provisoire ou d'avant) | "autre"
export function typeIdentifiant(matricule) {
  const m = String(matricule || "");
  if (FORMAT_NORMAL.test(m)) return "normal";
  if (FORMAT_ANCIEN.test(m)) return "ancien";
  return "autre";
}

// L'identifiant normal correspond-il encore aux informations de la fiche ?
export function identifiantCorrespond(e, matricule) {
  const d = debutIdentifiant(e);
  return d.complet && String(matricule || "").slice(0, 15) === d.debut;
}

// Etat d'une fiche pour l'identifiant : { etat, texte, manque }
//   normal    : identifiant normal, correspond a la fiche
//   decale    : identifiant normal mais la fiche a change (nom, date, sexe, departement)
//   pret      : ancien format / provisoire, la fiche est complete : le nouvel identifiant peut etre genere
//   a_completer : ancien format / provisoire, il manque des informations
export function etatIdentifiant(e) {
  const t = typeIdentifiant(e && e.matricule);
  const d = debutIdentifiant(e);
  if (t === "normal") return d.complet && identifiantCorrespond(e, e.matricule)
    ? { etat: "normal", texte: "Identifiant normal", manque: [] }
    : { etat: "decale", texte: d.complet ? "La fiche ne correspond plus à l'identifiant" : "Identifiant normal (fiche incomplète)", manque: d.manque };
  return d.complet
    ? { etat: "pret", texte: "Le nouvel identifiant peut être généré", manque: [] }
    : { etat: "a_completer", texte: "À compléter : " + d.manque.join(", "), manque: d.manque };
}

// ---- Supabase ----
const tableAbsente = (e) => !!e && (e.code === "PGRST205" || e.code === "PGRST202" || e.code === "42P01" || e.code === "42883" || /does not exist|could not find the (table|function)/i.test(String(e.message || "")));
export const installationIncomplete = (e) => tableAbsente(e);

// Nouveau matricule pour un eleve qui va etre CREE : { matricule, provisoire }
//   fiche complete -> identifiant normal (numero reserve sur le serveur) ; sinon matricule provisoire (ancien format, compteur existant)
export async function matriculePourNouvelEleve(supabase, e, genererAncien) {
  const d = debutIdentifiant(e);
  if (d.complet) {
    const { data, error } = await supabase.rpc("reserver_numero_identifiant", { p_debut: d.debut });
    if (!error && Number.isInteger(data)) return { matricule: completerNumero(d.debut, data), provisoire: false, manque: [] };
    if (!tableAbsente(error)) throw error || new Error("Numéro d'identifiant introuvable");
    // le SQL n'est pas encore installe : on garde l'ancien fonctionnement
  }
  return { matricule: await genererAncien(), provisoire: true, manque: d.manque };
}

// Applique le nouvel identifiant a un eleve EXISTANT (serveur : numero reserve, matricule change, ancien garde en historique)
export async function appliquerIdentifiant(supabase, studentId, e, motif, par) {
  const d = debutIdentifiant(e);
  if (!d.complet) throw new Error("Il manque : " + d.manque.join(", "));
  const { data, error } = await supabase.rpc("appliquer_identifiant_eleve", { p_student: studentId, p_debut: d.debut, p_motif: motif || null, p_par: par || null });
  if (error) {
    if (tableAbsente(error)) throw new Error("Le script SQL « identifiant-eleve.sql » n'est pas encore installé sur cette base.");
    throw error;
  }
  return data;
}

// Anciens identifiants d'un eleve (historique) ; liste vide si la table n'existe pas encore
export async function historiqueIdentifiants(supabase, studentId) {
  try {
    const { data, error } = await supabase.from("eleve_identifiants").select("id, ancien, nouveau, motif, modified_by, created_at").eq("student_uuid", studentId).order("created_at", { ascending: false });
    if (error) return [];
    return data || [];
  } catch (e) { return []; }
}

// Eleves dont un ANCIEN identifiant ressemble a la recherche (pour retrouver un eleve par son ancien matricule)
export async function elevesParAncienIdentifiant(supabase, texte) {
  const t = String(texte || "").trim().replace(/[%,()]/g, "");
  if (t.length < 3) return [];
  try {
    const { data, error } = await supabase.from("eleve_identifiants").select("student_uuid").ilike("ancien", "%" + t + "%").limit(50);
    if (error) return [];
    return [...new Set((data || []).map((x) => x.student_uuid))];
  } catch (e) { return []; }
}
