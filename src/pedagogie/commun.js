// Outils communs aux gestionnaires de la pedagogie.
export class Erreur extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra || {}; }
}

export const r2 = (v) => Math.round(v * 100) / 100;
export const texte = (v) => String(v === undefined || v === null ? "" : v).trim();
export const alpha = (a, b) => String(a || "").localeCompare(String(b || ""), "fr", { sensitivity: "base" });

export const PARAMS_DEFAUT = { base: 10, mode_moyenne_generale: "total", note_manquante: "ignorer", ponderation_periodes: 0 };

export function creerOutils(store) {
  const { lire } = store;
  const vivants = { isNull: ["deleted_at"] };

  async function parametresPedagogie(yearId) {
    const p = { ...PARAMS_DEFAUT };
    if (!yearId) return p;
    const l = await lire("pedagogy_settings", { eq: { academic_year_uuid: yearId }, ...vivants });
    const r = l[0];
    if (r) for (const k of Object.keys(p)) if (r[k] !== null && r[k] !== undefined) p[k] = r[k];
    return p;
  }

  // evaluations -> notes saisies : compte les notes non vides
  async function compterNotes(evaluationIds) {
    if (!evaluationIds.length) return 0;
    const g = await lire("grades", { cols: "id", in: { evaluation_uuid: evaluationIds }, ...vivants, notNull: ["note"] });
    return g.length;
  }

  async function nbNotesAnnee(yearId) {
    if (!yearId) return 0;
    const periodes = await lire("grading_periods", { cols: "id", eq: { academic_year_uuid: yearId }, ...vivants });
    if (!periodes.length) return 0;
    const evs = await lire("evaluations", { cols: "id", in: { period_uuid: periodes.map((p) => p.id) }, ...vivants });
    return compterNotes(evs.map((e) => e.id));
  }

  async function nbNotesAffectation(classSubjectId) {
    const evs = await lire("evaluations", { cols: "id", eq: { class_subject_uuid: classSubjectId }, ...vivants });
    return compterNotes(evs.map((e) => e.id));
  }

  // classes d'une annee : par colonne academic_year_uuid ou via les sections de l'annee
  async function classesDeAnnee(yearId) {
    if (!yearId) return [];
    const direct = await lire("classes", { eq: { academic_year_uuid: yearId }, ...vivants });
    const secs = await lire("sections", { cols: "id, nom", eq: { academic_year_uuid: yearId }, ...vivants });
    const viaSections = secs.length ? await lire("classes", { in: { section_uuid: secs.map((s) => s.id) }, ...vivants }) : [];
    const vu = new Set();
    const sortie = [];
    const nomSection = Object.fromEntries(secs.map((s) => [s.id, s.nom]));
    for (const c of direct.concat(viaSections)) {
      if (vu.has(c.id)) continue;
      vu.add(c.id);
      sortie.push({ id: c.id, nom: c.nom, section_id: c.section_uuid || null, section_nom: nomSection[c.section_uuid] || null, salle: c.salle || null });
    }
    return sortie.sort((a, b) => alpha(a.nom, b.nom));
  }

  return { vivants, parametresPedagogie, compterNotes, nbNotesAnnee, nbNotesAffectation, classesDeAnnee };
}
