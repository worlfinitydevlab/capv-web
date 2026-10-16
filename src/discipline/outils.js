// Espace Discipline (web) : acces aux donnees et regles communes aux pages.
import { EDGE_FUNCTION_URL, SUPABASE_ANON_KEY } from "../supabaseClient.js";
import { trierClasses } from "../ordreClasses.js";

export const nowIso = () => new Date().toISOString();
export const aujourdhui = () => {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
};
export const fmtDate = (iso) => {
  if (!iso) return "";
  const s = String(iso).slice(0, 10).split("-");
  return s.length === 3 ? s[2] + "/" + s[1] + "/" + s[0] : String(iso);
};
export const nomComplet = (s) => (s ? [s.nom, s.prenom].filter(Boolean).join(" ") : "");
export const nettoyer = (q) => String(q || "").replace(/[^\p{L}\p{N} \-]/gu, " ").replace(/\s+/g, " ").trim();

// Meme controle de mot de passe que la connexion de l'application
export async function verifierMotDePasse(username, password) {
  if (!password) throw new Error("Entrez votre mot de passe.");
  let r, d = {};
  try {
    r = await fetch(EDGE_FUNCTION_URL, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
  } catch (e) { throw new Error("Verification impossible (reseau)."); }
  try { d = await r.json(); } catch (e) { d = {}; }
  if (!r.ok || d.error) throw new Error("Mot de passe incorrect");
}

// Niveaux et fautes (cases = nombre de cases du carnet pour la faute)
export async function chargerReferentiel(supabase) {
  const [n, f] = await Promise.all([
    supabase.from("discipline_niveaux").select("*").is("deleted_at", null).order("ordre"),
    supabase.from("discipline_fautes").select("*").is("deleted_at", null).order("numero")
  ]);
  if (n.error) throw n.error;
  if (f.error) throw f.error;
  const niveaux = n.data || [];
  const parCode = Object.fromEntries(niveaux.map((x) => [x.code, x]));
  const fautes = (f.data || []).slice().sort((p, q) => Number(p.numero) - Number(q.numero)).map((x) => {
    const niv = parCode[x.niveau_code] || null;
    return { ...x, niveau: niv, cases: Number(x.nb_cases) || (niv ? Number(niv.nb_cases) : 3) || 3 };
  });
  return { niveaux, fautes };
}

// Rang de chaque incident dans sa faute (1, 2, 3...) : calcule a l'affichage, donc une annulation ne laisse jamais de trou
export function calculerRangs(incidents) {
  const groupes = {};
  incidents.filter((i) => i.statut === "valide" && !i.deleted_at).forEach((i) => { (groupes[i.faute_uuid] = groupes[i.faute_uuid] || []).push(i); });
  const rang = {};
  Object.values(groupes).forEach((l) => {
    l.sort((a, b) => String(a.date_incident).localeCompare(String(b.date_incident)) || String(a.created_at).localeCompare(String(b.created_at)));
    l.forEach((i, k) => { rang[i.id] = k + 1; });
  });
  return { groupes, rang };
}

export async function chargerCarnet(supabase, studentId, yearId) {
  const { data: student, error: e1 } = await supabase.from("students").select("id, matricule, nom, prenom, nisu, sexe, photo").eq("id", studentId).maybeSingle();
  if (e1) throw e1;
  const { data: ass } = await supabase.from("assignments").select("class_uuid, room_uuid").eq("student_uuid", studentId).eq("academic_year_uuid", yearId).is("deleted_at", null).limit(1);
  let classe = "", salle = "";
  if (ass && ass[0]) {
    const { data: c } = await supabase.from("classes").select("nom").eq("id", ass[0].class_uuid).maybeSingle();
    classe = (c && c.nom) || "";
    if (ass[0].room_uuid) {
      const { data: r } = await supabase.from("rooms").select("nom").eq("id", ass[0].room_uuid).maybeSingle();
      salle = (r && r.nom) || "";
    }
  }
  const { data: carnets } = await supabase.from("discipline_carnets").select("*").eq("student_uuid", studentId).eq("academic_year_uuid", yearId).is("deleted_at", null).order("created_at", { ascending: false });
  const { data: incidents } = await supabase.from("discipline_incidents").select("*").eq("student_uuid", studentId).eq("academic_year_uuid", yearId).is("deleted_at", null).order("date_incident", { ascending: true });
  const { data: suivis } = await supabase.from("discipline_suivis").select("*").eq("student_uuid", studentId).eq("academic_year_uuid", yearId).is("deleted_at", null).order("date_suivi", { ascending: false });
  const liste = carnets || [];
  return { student, classe, salle, carnets: liste, carnet: liste.find((c) => c.statut === "actif") || null, incidents: incidents || [], suivis: suivis || [] };
}

export async function creerIncident(supabase, user, { studentId, yearId, faute, date, heure, lieu, commentaire, signalePar, source }) {
  const { data: ex, error: e0 } = await supabase.from("discipline_incidents").select("id").eq("student_uuid", studentId).eq("academic_year_uuid", yearId).eq("faute_uuid", faute.id).eq("statut", "valide").is("deleted_at", null);
  if (e0) throw e0;
  const numero = (ex || []).length + 1;
  const { data, error } = await supabase.from("discipline_incidents").insert({
    student_uuid: studentId, academic_year_uuid: yearId, faute_uuid: faute.id, numero_case: numero,
    date_incident: date || aujourdhui(), heure: heure || null, lieu: lieu || null, commentaire: commentaire || null,
    signale_par: signalePar || (user && (user.nom_complet || user.username)) || null,
    source: source || "saisie", statut: "valide", modified_by: user ? user.username : null
  }).select("*").single();
  if (error) throw error;
  return { incident: data, numero, plein: numero >= faute.cases, depasse: numero > faute.cases };
}

export async function annulerIncident(supabase, user, incident, motif) {
  const { error } = await supabase.from("discipline_incidents").update({
    statut: "annule", annule_par: user ? user.username : null, annule_motif: motif, annule_le: nowIso(), modified_by: user ? user.username : null
  }).eq("id", incident.id);
  if (error) throw error;
}

function codeAleatoire(n) {
  const alpha = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const buf = new Uint32Array(n);
  try { window.crypto.getRandomValues(buf); } catch (e) { for (let i = 0; i < n; i++) buf[i] = Math.floor(Math.random() * 4294967295); }
  let s = "";
  for (let i = 0; i < n; i++) s += alpha[buf[i] % alpha.length];
  return s;
}

// Emet le carnet de l'annee (ou un duplicata qui remplace le carnet perdu) ; l'ancien carnet reste dans l'historique
export async function emettreCarnet(supabase, user, { studentId, year, remplace, motif }) {
  const annee = String(year.nom || "").replace(/[^0-9]/g, "").slice(0, 8) || "ANNEE";
  let base;
  if (remplace) {
    base = String(remplace.numero).split("-D")[0];
    const { data: dups } = await supabase.from("discipline_carnets").select("id").like("numero", base + "-D%");
    base = base + "-D" + (((dups || []).length) + 1);
  }
  for (let essai = 0; essai < 6; essai++) {
    let numero = base;
    if (!remplace) {
      const { count } = await supabase.from("discipline_carnets").select("id", { count: "exact", head: true }).eq("academic_year_uuid", year.id);
      numero = "DISC-" + annee + "-" + String((count || 0) + 1 + essai).padStart(4, "0");
    }
    if (remplace) {
      const { error: e1 } = await supabase.from("discipline_carnets").update({ statut: "perdu", motif: motif || "Carnet perdu", modified_by: user ? user.username : null }).eq("id", remplace.id);
      if (e1) throw e1;
    }
    const { data, error } = await supabase.from("discipline_carnets").insert({
      student_uuid: studentId, academic_year_uuid: year.id, numero, code_verif: codeAleatoire(8), statut: "actif",
      remplace_uuid: remplace ? remplace.id : null, motif: remplace ? (motif || "Carnet perdu") : null,
      emis_par: user ? (user.nom_complet || user.username) : null, modified_by: user ? user.username : null
    }).select("*").single();
    if (!error) return data;
    if (remplace) {
      // l'ancien carnet est redevenu actif si l'insertion echoue
      await supabase.from("discipline_carnets").update({ statut: "actif", motif: null }).eq("id", remplace.id);
      throw error;
    }
    if (!/duplicate|unique/i.test(error.message || "")) throw error;
  }
  throw new Error("Impossible d'attribuer un numero de carnet. Reessayez.");
}

// Texte code dans le QR du carnet et lu par le champ « Verifier un carnet »
export const contenuQr = (carnet) => "CAPV-DISC|" + carnet.numero + "|" + carnet.code_verif;
export function lireCodeCarnet(texte) {
  const t = String(texte || "").trim();
  const m = t.match(/CAPV-DISC\|([A-Z0-9\-]+)\|([A-Z0-9]+)/i);
  if (m) return { numero: m[1].toUpperCase(), code: m[2].toUpperCase() };
  const n = t.match(/^DISC-[A-Z0-9]+-\d{4}(-D\d+)?$/i);
  return n ? { numero: t.toUpperCase(), code: null } : null;
}

// ---------- classes, eleves, reglages, logo (pages Imprimables et Saisie) ----------
const alpha = (a, b) => String(a || "").localeCompare(String(b || ""), "fr", { sensitivity: "base" });

export async function chargerClasses(supabase, yearId) {
  const { data, error } = await supabase.from("classes").select("id, nom, section_uuid").eq("academic_year_uuid", yearId).is("deleted_at", null);
  if (error) throw error;
  return trierClasses(supabase, data || []);
}

export async function chargerSalles(supabase, classId) {
  const { data } = await supabase.from("rooms").select("id, nom").eq("class_uuid", classId).is("deleted_at", null).order("nom");
  return data || [];
}

// Eleves d'une classe (et salle) pour l'annee, tries par nom puis prenom
export async function chargerElevesClasse(supabase, yearId, classId, roomId) {
  let rq = supabase.from("assignments").select("student_uuid").eq("academic_year_uuid", yearId).eq("class_uuid", classId).is("deleted_at", null);
  if (roomId) rq = rq.eq("room_uuid", roomId);
  const { data: as, error } = await rq;
  if (error) throw error;
  const ids = Array.from(new Set((as || []).map((a) => a.student_uuid).filter(Boolean)));
  const sortie = [];
  for (let i = 0; i < ids.length; i += 120) {
    const { data } = await supabase.from("students").select("id, matricule, nom, prenom, nisu").in("id", ids.slice(i, i + 120)).is("deleted_at", null);
    (data || []).forEach((x) => sortie.push(x));
  }
  return sortie.sort((a, b) => alpha(a.nom, b.nom) || alpha(a.prenom, b.prenom));
}

export async function chargerReglages(supabase) {
  const m = { format_carnet: "a5", carnet_largeur_mm: "148", carnet_hauteur_mm: "210", titre_carnet: "CARNET DE DISCIPLINE" };
  const { data } = await supabase.from("discipline_reglages").select("cle, valeur").is("deleted_at", null);
  (data || []).forEach((x) => { if (x.valeur !== null && x.valeur !== undefined && x.valeur !== "") m[x.cle] = x.valeur; });
  return m;
}

function urlLogo(settings) {
  if (!settings || !settings.logo) return null;
  if (/^(https?:|data:)/.test(String(settings.logo))) return settings.logo;
  const o = window.location.origin;
  return (o.startsWith("http") ? o : "http://localhost:3001") + "/uploads/" + settings.logo;
}

// Logo de l'etablissement pret pour jsPDF : { data, fmt, ratio } ou null
export async function logoPourPdf(settings) {
  const url = urlLogo(settings);
  if (!url) return null;
  let du = url;
  if (!/^data:/.test(url)) {
    try {
      const r = await fetch(url);
      if (!r.ok) return null;
      const blob = await r.blob();
      du = await new Promise((ok) => { const f = new FileReader(); f.onload = () => ok(f.result); f.onerror = () => ok(null); f.readAsDataURL(blob); });
    } catch (e) { return null; }
  }
  if (!du || !String(du).startsWith("data:image/")) return null;
  const fmt = /^data:image\/png/.test(du) ? "PNG" : /^data:image\/jpe?g/.test(du) ? "JPEG" : null;
  if (!fmt) return null;
  const dim = await new Promise((ok) => { const i = new Image(); i.onload = () => ok({ w: i.width, h: i.height }); i.onerror = () => ok(null); i.src = du; });
  return dim && dim.w && dim.h ? { data: du, fmt, ratio: dim.w / dim.h } : null;
}

// Fiche prete pour le PDF du carnet a partir de chargerCarnet()
export function ficheDepuisCarnet(data) {
  const c = data && data.carnet;
  if (!c) return null;
  const ancien = data.carnets.find((x) => x.id === c.remplace_uuid);
  return { eleve: data.student, classe: data.classe, salle: data.salle, carnet: { ...c, remplace_numero: ancien ? ancien.numero : null }, incidents: data.incidents };
}

// Carnets et incidents d'une classe en quelques requetes : { fiches (eleves ayant un carnet actif), carnetsParEleve }
export async function chargerFichesClasse(supabase, yearId, classeNom, salleNom, eleves) {
  const ids = eleves.map((e) => e.id);
  const carnets = [], incidents = [];
  for (let i = 0; i < ids.length; i += 100) {
    const lot = ids.slice(i, i + 100);
    const c = await supabase.from("discipline_carnets").select("*").eq("academic_year_uuid", yearId).is("deleted_at", null).in("student_uuid", lot);
    if (c.error) throw c.error;
    (c.data || []).forEach((x) => carnets.push(x));
    const n = await supabase.from("discipline_incidents").select("*").eq("academic_year_uuid", yearId).eq("statut", "valide").is("deleted_at", null).in("student_uuid", lot);
    if (n.error) throw n.error;
    (n.data || []).forEach((x) => incidents.push(x));
  }
  const numeros = Object.fromEntries(carnets.map((c) => [c.id, c.numero]));
  const carnetsParEleve = {};
  const fiches = [];
  eleves.forEach((e) => {
    const siens = carnets.filter((x) => x.student_uuid === e.id);
    carnetsParEleve[e.id] = siens;
    const actif = siens.find((x) => x.statut === "actif");
    if (!actif) return;
    fiches.push({ eleve: e, classe: classeNom, salle: salleNom, carnet: { ...actif, remplace_numero: actif.remplace_uuid ? numeros[actif.remplace_uuid] || null : null }, incidents: incidents.filter((i) => i.student_uuid === e.id) });
  });
  return { fiches, carnetsParEleve };
}
