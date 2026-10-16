// Espace Discipline : suivi des parents (avertissements ecrits, convocations, appels telephoniques).
// Un suivi repond a un seuil atteint (faute dont toutes les cases du carnet sont cochees) ou a un contact decide par le responsable.
import { nowIso, aujourdhui, nomComplet } from "./outils.js";

export const TYPES = {
  avertissement: { libelle: "Avertissement écrit", court: "Avertissement", lettre: true },
  convocation: { libelle: "Convocation des parents", court: "Convocation", lettre: true },
  appel: { libelle: "Appel téléphonique", court: "Appel", lettre: false }
};
export const typeLibelle = (t) => (TYPES[t] ? TYPES[t].libelle : String(t || ""));

// statut en base : envoye (en attente) | honore (accuse recu / parents venus / parents joints) | sans_reponse | annule
export function statutLibelle(type, statut) {
  if (statut === "annule") return "Annulé";
  if (statut === "sans_reponse") return type === "convocation" ? "Parents absents" : type === "appel" ? "Sans réponse" : "Sans accusé";
  if (statut === "honore") return type === "convocation" ? "Parents venus" : type === "appel" ? "Parents joints" : "Accusé reçu";
  return type === "convocation" ? "Convocation envoyée" : "En attente d'accusé";
}
// Resume court pour le tableau de bord : « Avertissement : accusé reçu », « Convocation envoyée »...
export function resumeSuivi(type, statut) {
  if (type === "convocation" && statut === "envoye") return "Convocation envoyée";
  const t = TYPES[type] ? TYPES[type].court : String(type || "");
  return t + " : " + statutLibelle(type, statut).toLowerCase();
}
export const classeStatut = (s) => (s === "honore" ? "ok" : s === "sans_reponse" ? "bad" : s === "annule" ? "" : "warn");
export const STATUTS = ["envoye", "honore", "sans_reponse"];

// Reglages des lettres (modifiables par l'ecole dans la page Suivi des parents)
export const REGLAGES_LETTRES = {
  lettre_ville: "Pétion-Ville",
  lettre_signataire_titre: "La Direction",
  lettre_signataire_nom: "",
  lettre_delai_jours: "3",
  lettre_lieu_rdv: "Bureau de la Direction"
};

export async function chargerReglagesLettres(supabase) {
  const m = { ...REGLAGES_LETTRES };
  const { data } = await supabase.from("discipline_reglages").select("cle, valeur").is("deleted_at", null).like("cle", "lettre_%");
  (data || []).forEach((x) => { if (x.valeur !== null && x.valeur !== undefined && x.valeur !== "") m[x.cle] = x.valeur; });
  return m;
}

export async function enregistrerReglagesLettres(supabase, user, valeurs) {
  const delai = parseInt(valeurs.lettre_delai_jours, 10);
  if (!(delai >= 1 && delai <= 60)) throw new Error("Le délai de réponse doit être entre 1 et 60 jours.");
  const lignes = {
    lettre_ville: String(valeurs.lettre_ville || "").trim() || REGLAGES_LETTRES.lettre_ville,
    lettre_signataire_titre: String(valeurs.lettre_signataire_titre || "").trim() || REGLAGES_LETTRES.lettre_signataire_titre,
    lettre_signataire_nom: String(valeurs.lettre_signataire_nom || "").trim(),
    lettre_delai_jours: String(delai),
    lettre_lieu_rdv: String(valeurs.lettre_lieu_rdv || "").trim() || REGLAGES_LETTRES.lettre_lieu_rdv
  };
  const par = user ? user.username : null;
  for (const cle of Object.keys(lignes)) {
    const { data: ex, error: e0 } = await supabase.from("discipline_reglages").select("id").eq("cle", cle).is("deleted_at", null).limit(1);
    if (e0) throw e0;
    if (ex && ex[0]) {
      const { error } = await supabase.from("discipline_reglages").update({ valeur: lignes[cle], modified_by: par, last_modified_at: nowIso() }).eq("id", ex[0].id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("discipline_reglages").insert({ cle, valeur: lignes[cle], modified_by: par });
      if (error) throw error;
    }
  }
  return lignes;
}

// ---------- dates ----------
const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
function dateDepuisIso(iso) {
  const s = String(iso || "").slice(0, 10).split("-");
  if (s.length !== 3) return null;
  const d = new Date(Number(s[0]), Number(s[1]) - 1, Number(s[2]), 12, 0, 0);
  return isNaN(d.getTime()) ? null : d;
}
const isoLocal = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
export function dateLongue(iso, avecJour) {
  const d = dateDepuisIso(iso);
  if (!d) return "";
  return (avecJour ? JOURS[d.getDay()] + " " : "") + (d.getDate() === 1 ? "1er" : String(d.getDate())) + " " + MOIS[d.getMonth()] + " " + d.getFullYear();
}

// Un avertissement sans accuse apres le delai, ou une convocation dont la date est passee, est « en retard »
export function enRetard(s, reglages) {
  if (!s || s.statut !== "envoye") return false;
  const auj = aujourdhui();
  if (s.type === "convocation" && s.date_rdv) return String(s.date_rdv).slice(0, 10) < auj;
  const d = dateDepuisIso(s.date_suivi);
  if (!d) return false;
  d.setDate(d.getDate() + (Number(reglages && reglages.lettre_delai_jours) || 3));
  return auj > isoLocal(d);
}

export const libelleRetard = (s) => (s && s.type === "convocation" ? "Rendez-vous passé" : "Délai dépassé");

// ---------- lecture paginee (Supabase renvoie 1000 lignes au maximum par requete) ----------
export async function toutesLesLignes(construire, pas) {
  const taille = pas || 1000;
  const sortie = [];
  for (let debut = 0; ; debut += taille) {
    const { data, error } = await construire().range(debut, debut + taille - 1);
    if (error) throw error;
    const l = data || [];
    l.forEach((x) => sortie.push(x));
    if (l.length < taille) break;
  }
  return sortie;
}

async function parLots(ids, fn) {
  const sortie = [];
  for (let i = 0; i < ids.length; i += 120) {
    const part = await fn(ids.slice(i, i + 120));
    (part || []).forEach((x) => sortie.push(x));
  }
  return sortie;
}

// Incidents valides + suivis de l'annee, eleves concernes et leur classe
export async function chargerSuiviAnnee(supabase, yearId) {
  const incidents = await toutesLesLignes(() => supabase.from("discipline_incidents").select("*").eq("academic_year_uuid", yearId).eq("statut", "valide").is("deleted_at", null).order("created_at", { ascending: true }).order("id", { ascending: true }));
  const suivis = await toutesLesLignes(() => supabase.from("discipline_suivis").select("*").eq("academic_year_uuid", yearId).is("deleted_at", null).order("created_at", { ascending: true }).order("id", { ascending: true }));
  const ids = Array.from(new Set(incidents.map((i) => i.student_uuid).concat(suivis.map((s) => s.student_uuid))));
  const eleves = await parLots(ids, async (lot) => (await supabase.from("students").select("id, matricule, nom, prenom, nisu").in("id", lot)).data);
  const asg = await parLots(ids, async (lot) => (await supabase.from("assignments").select("student_uuid, class_uuid").eq("academic_year_uuid", yearId).is("deleted_at", null).in("student_uuid", lot)).data);
  const { data: cls } = await supabase.from("classes").select("id, nom").eq("academic_year_uuid", yearId).is("deleted_at", null);
  const nomClasse = Object.fromEntries((cls || []).map((c) => [c.id, c.nom]));
  const classeDe = {};
  asg.forEach((a) => { if (!classeDe[a.student_uuid]) classeDe[a.student_uuid] = { id: a.class_uuid, nom: nomClasse[a.class_uuid] || "" }; });
  return { incidents, suivis, eleves: Object.fromEntries(eleves.map((s) => [s.id, s])), classeDe };
}

// ---------- seuils ----------
// Un seuil = un eleve dont une faute a atteint (ou depasse) le nombre de cases du carnet
export function calculerSeuils(incidents, fautes) {
  const fMap = Object.fromEntries(fautes.map((f) => [f.id, f]));
  const groupes = {};
  incidents.forEach((i) => {
    if (i.statut !== "valide" || i.deleted_at) return;
    const f = fMap[i.faute_uuid];
    if (!f) return;
    const k = i.student_uuid + "|" + i.faute_uuid;
    (groupes[k] = groupes[k] || { studentId: i.student_uuid, faute: f, incidents: [] }).incidents.push(i);
  });
  const seuils = [];
  Object.keys(groupes).forEach((k) => {
    const g = groupes[k];
    g.incidents.sort((a, b) => String(a.date_incident).localeCompare(String(b.date_incident)) || String(a.created_at).localeCompare(String(b.created_at)));
    g.n = g.incidents.length;
    if (g.n >= g.faute.cases) seuils.push(g);
  });
  seuils.sort((a, b) => (b.n - b.faute.cases) - (a.n - a.faute.cases) || ((b.faute.niveau && b.faute.niveau.ordre) || 0) - ((a.faute.niveau && a.faute.niveau.ordre) || 0));
  return seuils;
}

// Le suivi (avertissement ou convocation, non annule) qui couvre ce seuil, ou null s'il reste a traiter.
// Si l'eleve commet la faute une fois de plus, le suivi precedent ne couvre plus le nouveau seuil.
export function suiviCouvrant(seuil, suivis) {
  const l = (suivis || []).filter((s) => !s.deleted_at && s.statut !== "annule" && (s.type === "avertissement" || s.type === "convocation")
    && s.student_uuid === seuil.studentId && s.faute_uuid === seuil.faute.id && Number(s.nb_incidents) >= seuil.n);
  l.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return l[0] || null;
}

// ---------- parents ----------
const cleNom = (x) => String(x || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

// Pere, mere, responsable legal et « parent » de la fiche eleve : { parents:[{cle,lien,nom,tel}], adresse }
export async function chargerParents(supabase, studentId) {
  const { data, error } = await supabase.from("students").select("*").eq("id", studentId).maybeSingle();
  if (error) throw error;
  const s = data || {};
  const nom = (n, p) => [p, n].map((x) => String(x || "").trim()).filter(Boolean).join(" ");
  const liste = [];
  const ajouter = (cle, lien, n, tel) => { if (n && !liste.some((p) => cleNom(p.nom) === cleNom(n))) liste.push({ cle, lien, nom: n, tel: String(tel || "").trim() }); };
  ajouter("responsable", "Responsable légal", nom(s.responsable_nom, s.responsable_prenom), s.responsable_telephone);
  ajouter("pere", "Père", nom(s.pere_nom, s.pere_prenom), s.pere_telephone);
  ajouter("mere", "Mère", nom(s.mere_nom, s.mere_prenom), s.mere_telephone);
  ajouter("parent", "Parent", String(s.nom_parent || "").trim(), s.telephone_parent);
  return { parents: liste, adresse: s.adresse || "", telUrgence: s.urgence_telephone || "" };
}

// ---------- ecriture ----------
export async function creerSuivi(supabase, user, p) {
  const { studentId, year, faute, type, date, destinataire, destinataireTel, dateRdv, heureRdv, lieuRdv, note, nbIncidents } = p;
  if (!TYPES[type]) throw new Error("Type de suivi inconnu.");
  const annee = String(year.nom || "").replace(/[^0-9]/g, "").slice(0, 8) || "ANNEE";
  const par = user ? user.username : null;
  const emisPar = user ? (user.nom_complet || user.username) : null;
  for (let essai = 0; essai < 6; essai++) {
    const { count, error: e0 } = await supabase.from("discipline_suivis").select("id", { count: "exact", head: true }).eq("academic_year_uuid", year.id);
    if (e0) throw e0;
    const numero = "SUI-" + annee + "-" + String((count || 0) + 1 + essai).padStart(4, "0");
    const ligne = {
      student_uuid: studentId, academic_year_uuid: year.id, faute_uuid: faute ? faute.id : null, type,
      date_suivi: date || aujourdhui(), note: (note || "").trim() || null,
      statut: type === "appel" ? "honore" : "envoye",
      numero, nb_incidents: faute && nbIncidents != null ? nbIncidents : null,
      destinataire: (destinataire || "").trim() || null, destinataire_tel: (destinataireTel || "").trim() || null,
      date_rdv: type === "convocation" ? dateRdv || null : null, heure_rdv: type === "convocation" ? (heureRdv || "").trim() || null : null,
      lieu_rdv: type === "convocation" ? (lieuRdv || "").trim() || null : null,
      emis_par: emisPar, modified_by: par
    };
    if (type === "appel") { ligne.date_resultat = date || aujourdhui(); ligne.resultat_par = par; }
    const { data, error } = await supabase.from("discipline_suivis").insert(ligne).select("*").single();
    if (!error) return data;
    if (!/duplicate|unique/i.test(error.message || "")) throw error;
  }
  throw new Error("Impossible d'attribuer un numéro de suivi. Réessayez.");
}

export async function majResultat(supabase, user, suivi, { statut, resultat, date }) {
  if (!STATUTS.includes(statut)) throw new Error("Statut inconnu.");
  const { error } = await supabase.from("discipline_suivis").update({
    statut, resultat: (resultat || "").trim() || null, date_resultat: statut === "envoye" ? null : date || aujourdhui(),
    resultat_par: user ? user.username : null, modified_by: user ? user.username : null, last_modified_at: nowIso()
  }).eq("id", suivi.id);
  if (error) throw error;
}

export async function annulerSuivi(supabase, user, suivi, motif) {
  const { error } = await supabase.from("discipline_suivis").update({
    statut: "annule", annule_par: user ? user.username : null, annule_motif: motif, annule_le: nowIso(),
    modified_by: user ? user.username : null, last_modified_at: nowIso()
  }).eq("id", suivi.id);
  if (error) throw error;
}

// libelle court d'un eleve pour les listes
export const libelleEleve = (e) => (e ? nomComplet(e) : "");
