// Sujets d'examens : lecture des annees, periodes, classes, matieres et affectations deja saisies dans la pedagogie (aucune ecriture).
// Memes regles que le reste du site : on ignore les lignes supprimees (deleted_at) et on lit par pages de 1000.
import { getAuthedClient } from "../supabaseClient.js";

const PAGE = 1000;
async function lireTout(construire) {
  let sortie = [];
  for (let de = 0; ; de += PAGE) {
    const { data, error } = await construire().range(de, de + PAGE - 1);
    if (error) throw new Error(error.message || "Lecture impossible.");
    sortie = sortie.concat(data || []);
    if (!data || data.length < PAGE) break;
  }
  return sortie;
}
const alpha = (a, b) => String(a || "").localeCompare(String(b || ""), "fr", { numeric: true });

export function clientPedagogie(token) { return getAuthedClient(token); }

export async function periodesDeAnnee(sb, anneeId) {
  if (!anneeId) return [];
  const l = await lireTout(() => sb.from("grading_periods").select("id, nom, ordre").eq("academic_year_uuid", anneeId).is("deleted_at", null).order("id", { ascending: true }));
  return l.sort((a, b) => (a.ordre || 0) - (b.ordre || 0) || alpha(a.nom, b.nom)).map((p) => ({ id: String(p.id), nom: p.nom }));
}

// classes d'une annee : par la colonne academic_year_uuid ou via les sections de l'annee (comme la pedagogie)
export async function classesDeAnnee(sb, anneeId) {
  if (!anneeId) return [];
  const direct = await lireTout(() => sb.from("classes").select("id, nom, section_uuid").eq("academic_year_uuid", anneeId).is("deleted_at", null).order("id", { ascending: true }));
  const secs = await lireTout(() => sb.from("sections").select("id").eq("academic_year_uuid", anneeId).is("deleted_at", null).order("id", { ascending: true }));
  let viaSections = [];
  for (let i = 0; i < secs.length; i += 100) {
    const lot = secs.slice(i, i + 100).map((s) => s.id);
    viaSections = viaSections.concat(await lireTout(() => sb.from("classes").select("id, nom, section_uuid").in("section_uuid", lot).is("deleted_at", null).order("id", { ascending: true })));
  }
  const vu = new Set(), sortie = [];
  for (const c of direct.concat(viaSections)) { if (vu.has(String(c.id))) continue; vu.add(String(c.id)); sortie.push({ id: String(c.id), nom: c.nom }); }
  return sortie.sort((a, b) => alpha(a.nom, b.nom));
}

export async function matieresActives(sb) {
  const l = await lireTout(() => sb.from("subjects").select("id, nom, code, statut").is("deleted_at", null).order("id", { ascending: true }));
  return l.filter((m) => !m.statut || m.statut === "active").map((m) => ({ id: String(m.id), nom: m.nom, code: m.code || null })).sort((a, b) => alpha(a.nom, b.nom));
}

// matieres donnees a une classe, avec l'enseignant prevu (Matieres & Enseignants)
export async function affectationsClasse(sb, classeId) {
  if (!classeId) return [];
  const l = await lireTout(() => sb.from("class_subjects").select("id, subject_uuid, employee_uuid").eq("class_uuid", classeId).is("deleted_at", null).order("id", { ascending: true }));
  return l.map((x) => ({ matiere_id: String(x.subject_uuid), employee_id: x.employee_uuid ? String(x.employee_uuid) : null }));
}
