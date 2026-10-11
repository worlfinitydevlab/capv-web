// Periodes (controles), evaluations, bulletin, format d'impression, saisie des notes (port du poste de travail).
import { Erreur, texte, alpha, r2 } from "./commun.js";

const vrai = (v) => v === true || Number(v) === 1;
const V = { isNull: ["deleted_at"] };
const nomEleve = (a, b) => alpha(a.nom, b.nom) || alpha(a.prenom, b.prenom);

async function periodeVerrouillee(store, periodId) {
  const p = (await store.lire("grading_periods", { eq: { id: periodId }, ...V }))[0];
  return !!(p && vrai(p.verrouillee));
}

// eleves distincts d'une classe (optionnellement d'une salle), tries
async function elevesDeClasse(store, classId, roomId) {
  const eq = { class_uuid: classId };
  if (roomId) eq.room_uuid = roomId;
  const as = await store.lire("assignments", { cols: "student_uuid", eq, ...V });
  const ids = [...new Set(as.map((a) => a.student_uuid).filter(Boolean))];
  if (!ids.length) return [];
  const st = await store.lire("students", { in: { id: ids }, ...V });
  return st.sort(nomEleve);
}

async function anneeDeClasse(store, classId) {
  const c = (await store.lire("classes", { eq: { id: classId } }))[0];
  if (!c) return { classe: null, annee: null };
  let annee = c.academic_year_uuid;
  if (!annee && c.section_uuid) {
    const s = (await store.lire("sections", { eq: { id: c.section_uuid } }))[0];
    annee = s ? s.academic_year_uuid : null;
  }
  return { classe: c, annee };
}


export { elevesDeClasse, anneeDeClasse };

export async function calculerBulletin(store, outils, classId, periodRef) {
  const { annee: yearId } = await anneeDeClasse(store, classId);
  const P = await outils.parametresPedagogie(yearId);
  const base = Number(P.base) > 0 ? Number(P.base) : 10;
  const estCG = String(periodRef) === "cg";
  const pond = !!Number(P.ponderation_periodes);
  const periodes = (await store.lire("grading_periods", { eq: { academic_year_uuid: yearId }, ...V }))
    .sort((a, b) => (a.ordre || 0) - (b.ordre || 0)).map((p) => ({ id: p.id, nom: p.nom, poids: p.poids === null || p.poids === undefined ? 1 : Number(p.poids) }));
  const prises = estCG ? periodes : periodes.filter((p) => p.id === periodRef);
  const cs = (await store.lire("class_subjects", { eq: { class_uuid: classId }, ...V })).filter((c) => (c.statut || "active") === "active");
  const subs = cs.length ? await store.lire("subjects", { in: { id: [...new Set(cs.map((c) => c.subject_uuid))] }, ...V }) : [];
  const sn = Object.fromEntries(subs.map((s) => [s.id, s.nom]));
  const matieres = cs.filter((c) => sn[c.subject_uuid]).map((c) => ({ id: c.id, nom: sn[c.subject_uuid], coefficient: Number(c.coefficient), cat_id: c.category_uuid })).sort((a, b) => alpha(a.nom, b.nom));
  const cats = (await store.lire("subject_categories", V)).sort((a, b) => (a.ordre || 0) - (b.ordre || 0)).map((c) => ({ id: c.id, nom: c.nom, poids: c.poids === null || c.poids === undefined ? 1 : Number(c.poids) }));
  const idsCat = new Set(cats.map((c) => c.id));
  const categories = [];
  for (const c of cats) {
    const ms = matieres.filter((m) => m.cat_id === c.id);
    if (ms.length) categories.push({ key: "c" + c.id, id: c.id, nom: c.nom, poids: c.poids, matieres: ms.map((m) => ({ id: m.id, nom: m.nom, coefficient: m.coefficient })) });
  }
  const orphelines = matieres.filter((m) => !m.cat_id || !idsCat.has(m.cat_id));
  if (orphelines.length) categories.push({ key: "c0", id: 0, nom: "Sans categorie", poids: 1, matieres: orphelines.map((m) => ({ id: m.id, nom: m.nom, coefficient: m.coefficient })) });
  categories.forEach((k) => { k.max_total = k.matieres.reduce((a, m) => a + (m.coefficient || 0), 0); });
  const eleves = (await elevesDeClasse(store, classId)).map((s) => ({ id: s.id, nom: s.nom, prenom: s.prenom }));

  const index = {};
  if (prises.length && matieres.length) {
    const priseIds = new Set(prises.map((p) => p.id));
    const evs = (await store.lire("evaluations", { in: { class_subject_uuid: matieres.map((m) => m.id) }, ...V })).filter((e) => priseIds.has(e.period_uuid));
    const ev = Object.fromEntries(evs.map((e) => [e.id, e]));
    const gs = evs.length ? await store.lire("grades", { in: { evaluation_uuid: evs.map((e) => e.id) }, ...V, notNull: ["note"] }) : [];
    const agr = {};
    for (const g of gs) {
      if (vrai(g.absent)) continue;
      const e = ev[g.evaluation_uuid];
      const cle = e.class_subject_uuid + ":" + g.student_uuid + ":" + e.period_uuid;
      const t = (agr[cle] = agr[cle] || { cs: e.class_subject_uuid, st: g.student_uuid, pid: e.period_uuid, pts: 0, bar: 0 });
      t.pts += Number(g.note); t.bar += Number(e.bareme);
    }
    for (const t of Object.values(agr)) {
      if (!(t.bar > 0)) continue;
      const cle = t.cs + ":" + t.st;
      (index[cle] = index[cle] || []).push({ pid: t.pid, ratio: t.pts / t.bar });
    }
  }
  const ratioMatiere = (csId, stId) => {
    const l = index[csId + ":" + stId] || [];
    if (!l.length) return null;
    if (!estCG) return l[0].ratio;
    let num = 0, den = 0;
    if (P.note_manquante === "zero") {
      for (const p of prises) {
        const w = pond ? p.poids : 1;
        const x = l.find((z) => z.pid === p.id);
        num += (x ? x.ratio : 0) * w; den += w;
      }
    } else {
      for (const x of l) {
        const p = prises.find((q) => q.id === x.pid);
        const w = pond ? p.poids : 1;
        num += x.ratio * w; den += w;
      }
    }
    return den > 0 ? num / den : null;
  };
  for (const e of eleves) {
    e.points = {}; e.cats = {};
    let total = 0, max = 0, sMoy = 0, sPoids = 0;
    for (const k of categories) {
      let tc = 0, mc = 0;
      for (const m of k.matieres) {
        const ratio = ratioMatiere(m.id, e.id);
        if (ratio !== null) {
          const pts = ratio * (m.coefficient || 0);
          e.points[m.id] = r2(pts);
          tc += pts; mc += (m.coefficient || 0);
        }
      }
      const moyCat = mc > 0 ? (tc / mc) * base : null;
      e.cats[k.key] = { total: mc > 0 ? r2(tc) : null, max: mc, moyenne: moyCat === null ? null : r2(moyCat) };
      total += tc; max += mc;
      if (moyCat !== null) { sMoy += moyCat * (k.poids || 0); sPoids += (k.poids || 0); }
    }
    e.total = max > 0 ? r2(total) : null;
    e.max = max;
    if (P.mode_moyenne_generale === "moyenne_categories") e.moyenne = sPoids > 0 ? r2(sMoy / sPoids) : null;
    else e.moyenne = max > 0 ? r2((total / max) * base) : null;
  }
  const classes = eleves.filter((e) => e.moyenne !== null).sort((a, b) => b.moyenne - a.moyenne);
  classes.forEach((e, i) => { e.rang = i > 0 && classes[i - 1].moyenne === e.moyenne ? classes[i - 1].rang : i + 1; });
  return { base, parametres: P, controle_general: estCG, periodes_prises: prises.length, categories, max_total: categories.reduce((a, k) => a + k.max_total, 0), matieres_sans_categorie: orphelines.length, eleves };
}

export function enregistrerNotes(app) {

  // ================= periodes =================
  app.get("/api/periodes", async ({ query }, { store }) => {
    if (!query.year) return [];
    const ps = await store.lire("grading_periods", { eq: { academic_year_uuid: query.year }, ...V });
    const evs = ps.length ? await store.lire("evaluations", { cols: "id, period_uuid", in: { period_uuid: ps.map((p) => p.id) }, ...V }) : [];
    const n = {};
    evs.forEach((e) => { n[e.period_uuid] = (n[e.period_uuid] || 0) + 1; });
    return ps.sort((a, b) => (a.ordre || 0) - (b.ordre || 0) || alpha(a.created_at, b.created_at))
      .map((p) => ({ ...p, academic_year_id: p.academic_year_uuid, verrouillee: vrai(p.verrouillee) ? 1 : 0, nb_evaluations: n[p.id] || 0 }));
  });

  app.post("/api/periodes", async ({ body: b }, { store }) => {
    const annee = b.academic_year_id, nom = texte(b.nom);
    if (!annee || !nom) throw new Erreur(400, "Annee et nom requis");
    const ex = await store.lire("grading_periods", { eq: { academic_year_uuid: annee }, ...V });
    if (ex.some((x) => alpha(x.nom, nom) === 0)) throw new Erreur(409, "Cette periode existe deja");
    const ordre = Number(b.ordre) || ex.reduce((m, x) => Math.max(m, x.ordre || 0), 0) + 1;
    const r = await store.inserer("grading_periods", { academic_year_uuid: annee, nom, ordre, date_debut: b.date_debut || null, date_fin: b.date_fin || null });
    return { id: r.id };
  });

  app.put("/api/periodes/:id", async ({ params, body: b }, { store }) => {
    const nom = texte(b.nom);
    if (!nom) throw new Erreur(400, "Nom requis");
    await store.maj("grading_periods", params.id, { nom, ordre: Number(b.ordre) || 1, date_debut: b.date_debut || null, date_fin: b.date_fin || null, verrouillee: b.verrouillee ? 1 : 0 });
  });

  app.delete("/api/periodes/:id", async ({ params }, { store }) => {
    const n = (await store.lire("evaluations", { cols: "id", eq: { period_uuid: params.id }, ...V })).length;
    if (n > 0) throw new Erreur(409, "Cette periode a encore " + n + " evaluation(s). Supprime-les d'abord.");
    await store.maj("grading_periods", params.id, { deleted_at: store.maintenant() });
  });

  app.post("/api/periodes/copier-annee", async ({ body: b }, { store }) => {
    const de = b.from_year, vers = b.to_year;
    if (!de || !vers || de === vers) throw new Erreur(400, "Annees invalides");
    const src = (await store.lire("grading_periods", { eq: { academic_year_uuid: de }, ...V })).sort((a, c) => (a.ordre || 0) - (c.ordre || 0));
    const dst = await store.lire("grading_periods", { eq: { academic_year_uuid: vers }, ...V });
    let n = 0;
    for (const p of src) {
      if (dst.some((x) => alpha(x.nom, p.nom) === 0)) continue;
      await store.inserer("grading_periods", { academic_year_uuid: vers, nom: p.nom, ordre: p.ordre });
      n++;
    }
    return { success: true, copiees: n };
  });

  app.put("/api/periodes/:id/poids", async ({ params, body: b }, { store, outils }) => {
    const poids = Number(b.poids);
    if (!(poids >= 0)) throw new Erreur(400, "Poids invalide");
    const p = (await store.lire("grading_periods", { eq: { id: params.id }, ...V }))[0];
    if (!p) throw new Erreur(404, "Periode introuvable");
    if (!b.confirmer && (await outils.nbNotesAnnee(p.academic_year_uuid)) > 0) {
      throw new Erreur(409, "Des notes existent deja pour cette annee. Changer le poids d'une periode modifie le Controle general si la ponderation est activee. Confirmer ?", { confirmation: true });
    }
    await store.maj("grading_periods", params.id, { poids });
  });

  // ================= evaluations =================
  app.get("/api/evaluations", async ({ query }, { store }) => {
    if (!query.class_subject_id || !query.period_id) return [];
    const evs = await store.lire("evaluations", { eq: { class_subject_uuid: query.class_subject_id, period_uuid: query.period_id }, ...V });
    const gs = evs.length ? await store.lire("grades", { cols: "id, evaluation_uuid, note, absent", in: { evaluation_uuid: evs.map((e) => e.id) }, ...V }) : [];
    const n = {};
    gs.forEach((g) => { if (g.note !== null || vrai(g.absent)) n[g.evaluation_uuid] = (n[g.evaluation_uuid] || 0) + 1; });
    return evs.sort((a, b) => alpha(a.date_evaluation, b.date_evaluation) || alpha(a.created_at, b.created_at))
      .map((e) => ({ ...e, class_subject_id: e.class_subject_uuid, period_id: e.period_uuid, nb_notes: n[e.id] || 0 }));
  });

  app.post("/api/evaluations", async ({ body: b }, { store }) => {
    const cs = b.class_subject_id, per = b.period_id, nom = texte(b.nom), bareme = Number(b.bareme);
    if (!cs || !per || !nom) throw new Erreur(400, "Matiere, periode et nom requis");
    if (!(bareme > 0)) throw new Erreur(400, "Le bareme doit etre superieur a 0");
    if (await periodeVerrouillee(store, per)) throw new Erreur(403, "Periode verrouillee");
    const r = await store.inserer("evaluations", { class_subject_uuid: cs, period_uuid: per, nom, type: b.type || "devoir", bareme, date_evaluation: b.date_evaluation || null });
    return { id: r.id };
  });

  app.put("/api/evaluations/:id", async ({ params, body: b }, { store }) => {
    const ev = (await store.lire("evaluations", { eq: { id: params.id } }))[0];
    if (!ev) throw new Erreur(404, "Evaluation introuvable");
    if (await periodeVerrouillee(store, ev.period_uuid)) throw new Erreur(403, "Periode verrouillee");
    const nom = texte(b.nom), bareme = Number(b.bareme);
    if (!nom || !(bareme > 0)) throw new Erreur(400, "Nom et bareme valides requis");
    const gs = await store.lire("grades", { cols: "note", eq: { evaluation_uuid: params.id }, ...V, notNull: ["note"] });
    const max = gs.reduce((m, g) => Math.max(m, Number(g.note)), -Infinity);
    if (gs.length && max > bareme) throw new Erreur(409, "Une note existante (" + max + ") depasse ce bareme");
    await store.maj("evaluations", params.id, { nom, type: b.type || "devoir", bareme, date_evaluation: b.date_evaluation || null });
  });

  app.delete("/api/evaluations/:id", async ({ params }, { store }) => {
    const ev = (await store.lire("evaluations", { eq: { id: params.id } }))[0];
    if (!ev) throw new Erreur(404, "Evaluation introuvable");
    if (await periodeVerrouillee(store, ev.period_uuid)) throw new Erreur(403, "Periode verrouillee");
    const t = store.maintenant();
    for (const g of await store.lire("grades", { cols: "id", eq: { evaluation_uuid: params.id }, ...V })) await store.maj("grades", g.id, { deleted_at: t });
    await store.maj("evaluations", params.id, { deleted_at: t });
  });

  app.get("/api/evaluations/:id/notes", async ({ params }, { store }) => {
    const ev = (await store.lire("evaluations", { eq: { id: params.id } }))[0];
    if (!ev) throw new Erreur(404, "Evaluation introuvable");
    const cs = (await store.lire("class_subjects", { eq: { id: ev.class_subject_uuid } }))[0];
    if (!cs) return [];
    const eleves = await elevesDeClasse(store, cs.class_uuid);
    const gs = await store.lire("grades", { eq: { evaluation_uuid: params.id }, ...V });
    const gp = Object.fromEntries(gs.map((g) => [g.student_uuid, g]));
    return eleves.map((s) => ({ id: s.id, nom: s.nom, prenom: s.prenom, note: gp[s.id] ? gp[s.id].note : null, absent: gp[s.id] && vrai(gp[s.id].absent) ? 1 : 0 }));
  });

  async function ecrireNote(store, evId, studentId, note, absent) {
    const tous = await store.lire("grades", { eq: { evaluation_uuid: evId, student_uuid: studentId } });
    const ex = tous.find((g) => !g.deleted_at) || tous[0];
    if (ex) await store.maj("grades", ex.id, { note, absent, deleted_at: null });
    else await store.inserer("grades", { evaluation_uuid: evId, student_uuid: studentId, note, absent });
  }

  app.post("/api/evaluations/:id/notes", async ({ params, body: b }, { store }) => {
    const ev = (await store.lire("evaluations", { eq: { id: params.id }, ...V }))[0];
    if (!ev) throw new Erreur(404, "Evaluation introuvable");
    if (await periodeVerrouillee(store, ev.period_uuid)) throw new Erreur(403, "Periode verrouillee");
    const items = Array.isArray(b.items) ? b.items : [];
    for (const it of items) {
      if (it.note !== null && it.note !== undefined && (Number(it.note) < 0 || Number(it.note) > ev.bareme)) throw new Erreur(400, "Une note depasse le bareme (" + ev.bareme + ")");
    }
    for (const it of items) {
      const absent = it.absent ? 1 : 0;
      const note = absent || it.note === null || it.note === undefined ? null : Number(it.note);
      await ecrireNote(store, params.id, it.student_id, note, absent);
    }
    return { success: true, enregistrees: items.length };
  });

  // ================= bulletin =================
  app.get("/api/notes/bulletin", async ({ query }, { store, outils }) => calculerBulletin(store, outils, query.class_id, query.period_id));

  // ================= format d'impression du bulletin =================
  const IMP = { format: "a5", largeur_mm: 148, hauteur_mm: 210, orientation: "portrait", marge_mm: 8, afficher_logo: 1 };

  app.get("/api/pedagogie/impression", async (req, { store }) => {
    const rows = await store.lire("pedagogie_reglages", V);
    const lire = (cle) => { const r = rows.find((x) => x.cle === cle); return r ? r.valeur : null; };
    const p = { ...IMP };
    const f = lire("bulletin_format"); if (f) p.format = f;
    const l = Number(lire("bulletin_largeur_mm")); if (l > 0) p.largeur_mm = l;
    const h = Number(lire("bulletin_hauteur_mm")); if (h > 0) p.hauteur_mm = h;
    const o = lire("bulletin_orientation"); if (o) p.orientation = o;
    const m = lire("bulletin_marge_mm"); if (m !== null && m !== "" && Number(m) >= 0) p.marge_mm = Number(m);
    const lg = lire("bulletin_afficher_logo"); if (lg !== null) p.afficher_logo = lg === "0" ? 0 : 1;
    return p;
  });

  app.put("/api/pedagogie/impression", async ({ body: b }, { store }) => {
    if (!["a4", "a5", "a6", "letter", "legal", "custom"].includes(b.format)) throw new Erreur(400, "Format invalide");
    if (!["portrait", "paysage"].includes(b.orientation)) throw new Erreur(400, "Orientation invalide");
    const l = Number(b.largeur_mm), h = Number(b.hauteur_mm), m = Number(b.marge_mm);
    if (b.format === "custom" && !(l >= 50 && l <= 500 && h >= 50 && h <= 500)) throw new Erreur(400, "Dimensions personnalisees : entre 50 et 500 mm");
    if (!(m >= 0 && m <= 30)) throw new Erreur(400, "Marge : entre 0 et 30 mm");
    const valeurs = { bulletin_format: b.format, bulletin_largeur_mm: b.format === "custom" ? l : 0, bulletin_hauteur_mm: b.format === "custom" ? h : 0, bulletin_orientation: b.orientation, bulletin_marge_mm: m, bulletin_afficher_logo: b.afficher_logo ? 1 : 0 };
    const rows = await store.lire("pedagogie_reglages");
    for (const [cle, v] of Object.entries(valeurs)) {
      const ex = rows.find((x) => x.cle === cle);
      if (ex) await store.maj("pedagogie_reglages", ex.id, { valeur: String(v), deleted_at: null });
      else await store.inserer("pedagogie_reglages", { cle, valeur: String(v) });
    }
  });

  // ================= saisie des notes =================
  const sessions = new Map();
  const DUREE = 6 * 60 * 60 * 1000;
  let file = Promise.resolve(); // les enregistrements se font un par un (evite les doublons de controle)

  app.get("/api/saisie/structure", async ({ query }, { store, outils }) => {
    const classes = await outils.classesDeAnnee(query.year);
    const rooms = classes.length ? await store.lire("rooms", { in: { class_uuid: classes.map((c) => c.id) }, ...V }) : [];
    const rp = {};
    rooms.sort((a, b) => alpha(a.nom, b.nom)).forEach((r) => { (rp[r.class_uuid] = rp[r.class_uuid] || []).push({ id: r.id, nom: r.nom }); });
    const sections = [], parId = {};
    for (const c of classes) {
      const sid = c.section_id || 0;
      if (!parId[sid]) { parId[sid] = { id: sid, nom: sid ? (c.section_nom || "Section") : "Toutes les classes", classes: [] }; sections.push(parId[sid]); }
      parId[sid].classes.push({ id: c.id, nom: c.nom, rooms: rp[c.id] || [] });
    }
    sections.sort((a, b) => alpha(a.nom, b.nom));
    const periodes = query.year ? (await store.lire("grading_periods", { eq: { academic_year_uuid: query.year }, ...V })).sort((a, b) => (a.ordre || 0) - (b.ordre || 0))
      .map((p) => ({ id: p.id, nom: p.nom, ordre: p.ordre, verrouillee: vrai(p.verrouillee) ? 1 : 0 })) : [];
    return { sections, periodes };
  });

  app.get("/api/saisie/grille", async ({ query }, { store }) => {
    const classId = query.class_id, periodId = query.period_id, roomId = query.room_id || null;
    if (!classId || !periodId) throw new Erreur(400, "Classe et controle requis");
    const p = (await store.lire("grading_periods", { eq: { id: periodId }, ...V }))[0];
    const periode = p ? { id: p.id, nom: p.nom, verrouillee: vrai(p.verrouillee) ? 1 : 0 } : null;
    const cs = (await store.lire("class_subjects", { eq: { class_uuid: classId }, ...V })).filter((c) => (c.statut || "active") === "active");
    const subs = cs.length ? await store.lire("subjects", { in: { id: [...new Set(cs.map((c) => c.subject_uuid))] }, ...V }) : [];
    const sp = Object.fromEntries(subs.map((s) => [s.id, s]));
    const cats = await store.lire("subject_categories", V);
    const cp = Object.fromEntries(cats.map((c) => [c.id, c]));
    const matieres = cs.filter((c) => sp[c.subject_uuid]).map((c) => ({
      id: c.id, nom: sp[c.subject_uuid].nom, code: sp[c.subject_uuid].code, coefficient: Number(c.coefficient),
      categorie: c.category_uuid && cp[c.category_uuid] ? cp[c.category_uuid].nom : null, _o: c.category_uuid && cp[c.category_uuid] ? (cp[c.category_uuid].ordre || 0) : 999
    })).sort((a, b) => a._o - b._o || alpha(a.nom, b.nom)).map(({ _o, ...m }) => m);
    const eleves = (await elevesDeClasse(store, classId, roomId)).map((s) => ({ id: s.id, nom: s.nom, prenom: s.prenom, photo: s.photo_url || s.photo || null }));
    const notes = {};
    let anciennes = 0;
    if (matieres.length) {
      const evs = (await store.lire("evaluations", { in: { class_subject_uuid: matieres.map((m) => m.id) }, ...V })).filter((e) => e.period_uuid === periodId);
      const ev = Object.fromEntries(evs.map((e) => [e.id, e]));
      const gs = evs.length ? await store.lire("grades", { in: { evaluation_uuid: evs.map((e) => e.id) }, ...V }) : [];
      for (const g of gs) {
        const e = ev[g.evaluation_uuid];
        if (e.type === "controle") notes[e.class_subject_uuid + ":" + g.student_uuid] = { note: g.note, absent: vrai(g.absent) ? 1 : 0 };
        else if (g.note !== null) anciennes++;
      }
    }
    return { periode, matieres, eleves, notes, anciennes };
  });

  app.post("/api/saisie/demarrer", async ({ body: b }, { store, ctx }) => {
    const u = ctx.utilisateur();
    if (!u) throw new Erreur(401, "Session expirée : reconnecte-toi.");
    if (String(b.username || "").trim().toLowerCase() !== String(u.username || "").toLowerCase()) throw new Erreur(401, "L'identifiant doit être celui de la session ouverte.");
    if (!(ctx.peut("saisie-notes", "modifier") || ctx.peut("saisie-notes", "creer") || ctx.peut("notes", "modifier"))) throw new Erreur(403, "Tu n'as pas la permission de saisir des notes.");
    await ctx.verifier(String(b.username).trim(), String(b.password || ""));
    const octets = new Uint8Array(24);
    globalThis.crypto.getRandomValues(octets);
    const token = Array.from(octets, (x) => x.toString(16).padStart(2, "0")).join("");
    const acteur = u.nom_complet || u.username;
    sessions.set(token, { acteur, username: u.username, exp: Date.now() + DUREE, nb: 0, matieres: new Set(), cache: {}, inscrits: new Set() });
    try { await store.inserer("audit_pedagogie", { username: u.username, action: "SAISIE_NOTES_DEBUT", details: "Session de saisie des notes demarree" }); } catch (e) { /* journal best-effort */ }
    return { token, nom: acteur };
  });

  async function enregistrerUneNote(b, store) {
    const session = sessions.get(String(b.token || ""));
    if (!session || session.exp < Date.now()) throw new Erreur(401, "Session de saisie expiree. Redemarre la saisie.", { session: true });
    const cleCache = b.class_subject_id + ":" + b.period_id;
    let c = session.cache[cleCache];
    if (!c || Date.now() - c.t > 60000) {
      const cs = (await store.lire("class_subjects", { eq: { id: b.class_subject_id }, ...V }))[0];
      if (!cs) throw new Erreur(404, "Matiere de classe introuvable");
      const sub = (await store.lire("subjects", { eq: { id: cs.subject_uuid } }))[0];
      const { classe, annee } = await anneeDeClasse(store, cs.class_uuid);
      const per = (await store.lire("grading_periods", { eq: { id: b.period_id, academic_year_uuid: annee }, ...V }))[0];
      if (!per) throw new Erreur(404, "Controle introuvable pour cette annee");
      c = { t: Date.now(), cs, matiere: sub ? sub.nom : "", classe: classe ? classe.nom : "", per, evId: c ? c.evId : null };
      session.cache[cleCache] = c;
    }
    const { cs } = c;
    const per = c.per;
    if (vrai(per.verrouillee)) {
      // le verrou a pu etre leve depuis la mise en cache : on relit avant de refuser
      const frais = (await store.lire("grading_periods", { eq: { id: per.id }, ...V }))[0];
      if (frais) c.per = frais;
      if (!frais || vrai(frais.verrouillee)) throw new Erreur(423, "Ce controle est verrouille");
    }
    const studentId = b.student_id;
    const cleEleve = cs.class_uuid + ":" + studentId;
    let nomComplet = session.inscrits.has(cleEleve) ? null : "";
    if (!session.inscrits.has(cleEleve)) {
      const as = await store.lire("assignments", { cols: "id", eq: { student_uuid: studentId, class_uuid: cs.class_uuid }, ...V });
      if (!as.length) throw new Erreur(404, "Eleve non inscrit dans cette classe");
      const st = (await store.lire("students", { cols: "nom, prenom", eq: { id: studentId } }))[0];
      nomComplet = st ? st.nom + " " + (st.prenom || "") : "";
      session.inscrits.add(cleEleve);
      session["nom:" + studentId] = nomComplet;
    } else nomComplet = session["nom:" + studentId] || "";

    const absent = b.absent ? 1 : 0;
    let note = null;
    if (!absent && b.note !== null && b.note !== undefined && String(b.note).trim() !== "") {
      note = Number(String(b.note).replace(",", "."));
      if (!Number.isFinite(note) || note < 0) throw new Erreur(400, "Note invalide");
      if (note > Number(cs.coefficient)) throw new Erreur(400, "La note ne peut pas depasser le coefficient (" + cs.coefficient + ")");
      note = Math.round(note * 100) / 100;
    }
    if (!c.evId) {
      const evs = (await store.lire("evaluations", { eq: { class_subject_uuid: cs.id, period_uuid: per.id, type: "controle" }, ...V }));
      if (evs.length) {
        c.evId = evs[0].id;
        if (Number(evs[0].bareme) !== Number(cs.coefficient)) await store.maj("evaluations", c.evId, { bareme: cs.coefficient });
      } else {
        c.evId = (await store.inserer("evaluations", { class_subject_uuid: cs.id, period_uuid: per.id, nom: per.nom, type: "controle", bareme: cs.coefficient })).id;
      }
    }
    const tous = await store.lire("grades", { eq: { evaluation_uuid: c.evId, student_uuid: studentId } });
    const avant = tous.find((g) => !g.deleted_at);
    const memeValeur = avant && (vrai(avant.absent) ? 1 : 0) === absent && (avant.note === null || avant.note === undefined ? null : Number(avant.note)) === note;
    if (!memeValeur) {
      await ecrireNote(store, c.evId, studentId, note, absent);
      const txt = (n, a) => (a ? "ABS" : n === null || n === undefined ? "vide" : String(n));
      try {
        await store.inserer("audit_pedagogie", { username: session.username, action: "NOTE_SAISIE", details: c.classe + " / " + c.matiere + " / " + per.nom + " / " + nomComplet + " : " + txt(avant ? avant.note : null, avant ? vrai(avant.absent) : 0) + " -> " + txt(note, absent) + " (max " + cs.coefficient + ")" });
      } catch (e) { /* journal best-effort */ }
      session.nb += 1;
      session.matieres.add(c.matiere);
    }
    session.exp = Date.now() + DUREE;
    return { success: true, note, absent, max: Number(cs.coefficient) };
  }

  app.put("/api/saisie/note", ({ body: b }, { store }) => {
    const suite = file.then(() => enregistrerUneNote(b, store));
    file = suite.catch(() => {});
    return suite;
  });

  app.post("/api/saisie/terminer", async ({ body: b }, { store }) => {
    const token = String(b.token || "");
    const s = sessions.get(token);
    if (!s) return { success: true, nb: 0, matieres: [] };
    sessions.delete(token);
    try { await store.inserer("audit_pedagogie", { username: s.username, action: "SAISIE_NOTES_FIN", details: s.nb + " note(s) modifiee(s) - " + Array.from(s.matieres).join(", ") }); } catch (e) { /* journal best-effort */ }
    return { success: true, nb: s.nb, matieres: Array.from(s.matieres) };
  });
}
