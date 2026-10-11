// Matieres, categories, affectations par classe, enseignants, parametres pedagogiques (port du poste de travail).
import { Erreur, texte, alpha } from "./commun.js";

export function enregistrerMatieres(app) {
  const V = { isNull: ["deleted_at"] };

  async function genererCode(nom, lire) {
    const base = (String(nom).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z]/g, "").toUpperCase() + "XXX").slice(0, 3);
    const pris = new Set((await lire("subjects", { cols: "id, code", ...V })).map((s) => String(s.code || "").toLowerCase()));
    for (let i = 1; i < 1000; i++) {
      const c = base + String(i).padStart(3, "0");
      if (!pris.has(c.toLowerCase())) return c;
    }
    return null;
  }

  // ---- catalogue ----
  app.get("/api/matieres", async (req, { store }) => {
    const ms = await store.lire("subjects", V);
    const cs = await store.lire("class_subjects", { cols: "id, subject_uuid", ...V });
    const n = {};
    cs.forEach((c) => { n[c.subject_uuid] = (n[c.subject_uuid] || 0) + 1; });
    return ms.sort((a, b) => alpha(a.nom, b.nom)).map((s) => ({ id: s.id, nom: s.nom, code: s.code, description: s.description, statut: s.statut || "active", nb_classes: n[s.id] || 0, version: s.version }));
  });

  app.post("/api/matieres", async ({ body: b }, { store }) => {
    const nom = texte(b.nom);
    if (!nom) throw new Erreur(400, "Le nom est requis");
    const ex = await store.lire("subjects", { cols: "id, nom, code", ...V });
    if (ex.some((x) => alpha(x.nom, nom) === 0)) throw new Erreur(409, "Cette matiere existe deja");
    let code = texte(b.code);
    if (code && ex.some((x) => alpha(x.code, code) === 0)) throw new Erreur(409, "Cet identifiant existe deja : " + code);
    if (!code) code = await genererCode(nom, store.lire);
    const r = await store.inserer("subjects", { nom, code, description: texte(b.description) || null, statut: b.statut === "inactive" ? "inactive" : "active" });
    return { id: r.id, code };
  });

  app.put("/api/matieres/:id", async ({ params, body: b }, { store }) => {
    const nom = texte(b.nom);
    if (!nom) throw new Erreur(400, "Le nom est requis");
    const ex = await store.lire("subjects", { cols: "id, nom, code", ...V, neq: { id: params.id } });
    if (ex.some((x) => alpha(x.nom, nom) === 0)) throw new Erreur(409, "Cette matiere existe deja");
    const code = texte(b.code);
    if (code && ex.some((x) => alpha(x.code, code) === 0)) throw new Erreur(409, "Cet identifiant existe deja : " + code);
    await store.maj("subjects", params.id, { nom, code: code || null, description: texte(b.description) || null, statut: b.statut === "inactive" ? "inactive" : "active" });
  });

  app.delete("/api/matieres/:id", async ({ params }, { store }) => {
    const t = store.maintenant();
    for (const cs of await store.lire("class_subjects", { cols: "id", eq: { subject_uuid: params.id }, ...V })) await store.maj("class_subjects", cs.id, { deleted_at: t });
    await store.maj("subjects", params.id, { deleted_at: t });
  });

  // ---- affectations par classe ----
  app.get("/api/matieres-classe", async ({ query }, { store }) => {
    if (!query.class_id) return [];
    const cs = await store.lire("class_subjects", { eq: { class_uuid: query.class_id }, ...V });
    if (!cs.length) return [];
    const ms = await store.lire("subjects", { in: { id: [...new Set(cs.map((c) => c.subject_uuid))] }, ...V });
    const mp = Object.fromEntries(ms.map((m) => [m.id, m]));
    const ids = [...new Set(cs.map((c) => c.employee_uuid).filter(Boolean))];
    const es = ids.length ? await store.lire("employees", { cols: "id, nom", in: { id: ids } }) : [];
    const en = Object.fromEntries(es.map((e) => [e.id, e.nom]));
    return cs.filter((c) => mp[c.subject_uuid]).map((c) => ({
      id: c.id, subject_id: c.subject_uuid, matiere_nom: mp[c.subject_uuid].nom, matiere_code: mp[c.subject_uuid].code,
      coefficient: c.coefficient, heures_semaine: c.heures_semaine, employee_id: c.employee_uuid, category_id: c.category_uuid,
      statut: c.statut || "active", enseignant_nom: c.employee_uuid ? en[c.employee_uuid] || null : null
    })).sort((a, b) => alpha(a.matiere_nom, b.matiere_nom));
  });

  // categoryId / statut : undefined = ne pas modifier l'existant
  async function enregistrerAffectation(store, classId, subjectId, coef, heures, employeeId, categoryId, statut) {
    const tous = await store.lire("class_subjects", { eq: { class_uuid: classId, subject_uuid: subjectId } });
    const ex = tous.find((x) => !x.deleted_at) || tous[0];
    if (ex) {
      const patch = { coefficient: coef, heures_semaine: heures, employee_uuid: employeeId || null, deleted_at: null };
      if (categoryId !== undefined) patch.category_uuid = categoryId;
      if (statut) patch.statut = statut;
      await store.maj("class_subjects", ex.id, patch);
    } else {
      await store.inserer("class_subjects", { class_uuid: classId, subject_uuid: subjectId, coefficient: coef, heures_semaine: heures, employee_uuid: employeeId || null, category_uuid: categoryId || null, statut: statut || "active" });
    }
  }

  app.post("/api/matieres-classe", async ({ body: b }, { store, outils }) => {
    const classId = b.class_id, subjectId = b.subject_id;
    if (!classId || !subjectId) throw new Erreur(400, "Classe et matiere requises");
    const coef = Number(b.coefficient) > 0 ? Number(b.coefficient) : 1;
    const categoryId = b.category_id === undefined ? undefined : (b.category_id || null);
    const statut = b.statut === "inactive" ? "inactive" : (b.statut === "active" ? "active" : undefined);
    const ex = (await store.lire("class_subjects", { eq: { class_uuid: classId, subject_uuid: subjectId }, ...V }))[0];
    if (ex && !b.confirmer) {
      const coefChange = Number(ex.coefficient) !== coef;
      const catChange = categoryId !== undefined && (ex.category_uuid || null) !== categoryId;
      if ((coefChange || catChange) && (await outils.nbNotesAffectation(ex.id)) > 0) {
        throw new Erreur(409, "Des notes existent deja pour cette matiere dans cette classe. Modifier le coefficient ou la categorie change les totaux et les moyennes des bulletins. Confirmer la modification ?", { confirmation: true });
      }
    }
    await enregistrerAffectation(store, classId, subjectId, coef, Number(b.heures_semaine) || 0, b.employee_id || null, categoryId, statut);
  });

  app.delete("/api/matieres-classe/:id", async ({ params, query }, { store, outils }) => {
    if (!query.confirmer && (await outils.nbNotesAffectation(params.id)) > 0) {
      throw new Erreur(409, "Des notes existent pour cette matiere dans cette classe. La retirer fait disparaitre ces notes des bulletins. Confirmer le retrait ?", { confirmation: true });
    }
    await store.maj("class_subjects", params.id, { deleted_at: store.maintenant() });
  });

  app.post("/api/matieres-classe/copier-annee", async ({ body: b }, { store, outils }) => {
    const de = b.from_year, vers = b.to_year;
    if (!de || !vers || de === vers) throw new Erreur(400, "Annees invalides");
    const cibles = await outils.classesDeAnnee(vers);
    const sources = await outils.classesDeAnnee(de);
    let copiees = 0;
    for (const c of cibles) {
      const o = sources.find((s) => s.nom === c.nom);
      if (!o) continue;
      for (const m of await store.lire("class_subjects", { eq: { class_uuid: o.id }, ...V })) {
        await enregistrerAffectation(store, c.id, m.subject_uuid, m.coefficient, m.heures_semaine, m.employee_uuid, m.category_uuid || null, m.statut || "active");
        copiees++;
      }
    }
    return { success: true, copiees };
  });

  app.get("/api/classes-par-annee", async ({ query }, { outils }) => outils.classesDeAnnee(query.year));

  // ---- categories ----
  app.get("/api/categories-matieres", async (req, { store }) => {
    const cats = await store.lire("subject_categories", V);
    const cs = await store.lire("class_subjects", { cols: "id, category_uuid", ...V, notNull: ["category_uuid"] });
    const n = {};
    cs.forEach((c) => { n[c.category_uuid] = (n[c.category_uuid] || 0) + 1; });
    return cats.sort((a, b) => (a.ordre || 0) - (b.ordre || 0) || alpha(a.created_at, b.created_at))
      .map((c) => ({ id: c.id, nom: c.nom, ordre: c.ordre, description: c.description, statut: c.statut || "active", poids: c.poids === null || c.poids === undefined ? 1 : c.poids, nb_matieres: n[c.id] || 0 }));
  });

  const poidsDe = (v) => (v !== "" && v !== undefined && v !== null && Number(v) >= 0 ? Number(v) : 1);

  app.post("/api/categories-matieres", async ({ body: b }, { store }) => {
    const nom = texte(b.nom);
    if (!nom) throw new Erreur(400, "Le nom est requis");
    const ex = await store.lire("subject_categories", V);
    if (ex.some((x) => alpha(x.nom, nom) === 0)) throw new Erreur(409, "Cette categorie existe deja");
    const ordre = ex.reduce((m, x) => Math.max(m, x.ordre || 0), 0) + 1;
    const r = await store.inserer("subject_categories", { nom, ordre, description: texte(b.description) || null, statut: b.statut === "inactive" ? "inactive" : "active", poids: poidsDe(b.poids) });
    return { id: r.id };
  });

  app.put("/api/categories-matieres/:id", async ({ params, body: b }, { store }) => {
    const nom = texte(b.nom);
    if (!nom) throw new Erreur(400, "Le nom est requis");
    const ex = await store.lire("subject_categories", { ...V, neq: { id: params.id } });
    if (ex.some((x) => alpha(x.nom, nom) === 0)) throw new Erreur(409, "Cette categorie existe deja");
    await store.maj("subject_categories", params.id, { nom, ordre: Number(b.ordre) || 1, description: texte(b.description) || null, statut: b.statut === "inactive" ? "inactive" : "active", poids: poidsDe(b.poids) });
  });

  app.delete("/api/categories-matieres/:id", async ({ params }, { store }) => {
    const n = (await store.lire("class_subjects", { cols: "id", eq: { category_uuid: params.id }, ...V })).length;
    if (n > 0) throw new Erreur(409, "Cette categorie est utilisee par " + n + " affectation(s) de matiere. Reaffecte-les d'abord (Matieres par classe).");
    await store.maj("subject_categories", params.id, { deleted_at: store.maintenant() });
  });

  // ---- enseignants ----
  app.get("/api/enseignants", async (req, { store }) => {
    const es = await store.lire("employees", { cols: "id, matricule, nom, fonction, telephone, statut", eq: { est_enseignant: 1 } });
    const cs = await store.lire("class_subjects", { cols: "employee_uuid, subject_uuid, class_uuid", ...V, notNull: ["employee_uuid"] });
    const ms = await store.lire("subjects", { cols: "id, nom" });
    const cl = await store.lire("classes", { cols: "id, nom" });
    const mn = Object.fromEntries(ms.map((m) => [m.id, m.nom])), cn = Object.fromEntries(cl.map((c) => [c.id, c.nom]));
    return es.sort((a, b) => alpha(a.nom, b.nom)).map((e) => ({ ...e, cours: cs.filter((c) => c.employee_uuid === e.id && mn[c.subject_uuid]).map((c) => mn[c.subject_uuid] + " - " + (cn[c.class_uuid] || "?")).join(", ") }));
  });

  app.get("/api/enseignants/disponibles", async (req, { store }) => {
    const es = await store.lire("employees", { cols: "id, nom, fonction, statut, est_enseignant" });
    return es.filter((e) => !Number(e.est_enseignant) && (e.statut || "actif") === "actif").sort((a, b) => alpha(a.nom, b.nom)).map((e) => ({ id: e.id, nom: e.nom, fonction: e.fonction }));
  });

  app.post("/api/enseignants", async ({ body: b }, { store }) => {
    if (b.employee_id) { await store.maj("employees", b.employee_id, { est_enseignant: 1 }); return { id: b.employee_id }; }
    const nom = texte(b.nom);
    if (!nom) throw new Erreur(400, "Le nom est requis");
    const lettres = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const matricule = "ENS-" + Array.from({ length: 6 }, () => lettres[Math.floor(Math.random() * lettres.length)]).join("");
    const r = await store.inserer("employees", { matricule, nom, fonction: "Enseignant", departement: "Pedagogie", salaire: 0, telephone: texte(b.telephone) || null, statut: "actif", est_enseignant: 1 });
    return { id: r.id };
  });

  app.delete("/api/enseignants/:id", async ({ params }, { store }) => {
    const cs = await store.lire("class_subjects", { cols: "id", eq: { employee_uuid: params.id }, ...V });
    if (cs.length) throw new Erreur(409, "Cet enseignant a encore " + cs.length + " cours. Reassigne-les d'abord (Affectation par classe).");
    await store.maj("employees", params.id, { est_enseignant: 0 });
  });

  // ---- parametres pedagogiques par annee ----
  app.get("/api/pedagogie/parametres", async ({ query }, { outils }) => ({
    ...(await outils.parametresPedagogie(query.year)), academic_year_id: query.year || null, nb_notes: await outils.nbNotesAnnee(query.year)
  }));

  app.put("/api/pedagogie/parametres", async ({ body: b }, { store, outils }) => {
    const year = b.academic_year_id;
    if (!year) throw new Erreur(400, "Annee requise");
    const base = Number(b.base);
    if (!(base > 0 && base <= 100)) throw new Erreur(400, "La base de notation doit etre entre 1 et 100");
    if (!["total", "moyenne_categories"].includes(b.mode_moyenne_generale)) throw new Erreur(400, "Mode de moyenne generale invalide");
    if (!["ignorer", "zero"].includes(b.note_manquante)) throw new Erreur(400, "Regle des notes manquantes invalide");
    const pond = b.ponderation_periodes ? 1 : 0;
    const avant = await outils.parametresPedagogie(year);
    const change = Number(avant.base) !== base || avant.mode_moyenne_generale !== b.mode_moyenne_generale || avant.note_manquante !== b.note_manquante || Number(avant.ponderation_periodes) !== pond;
    if (change && !b.confirmer && (await outils.nbNotesAnnee(year)) > 0) {
      throw new Erreur(409, "Des notes existent deja pour cette annee. Changer ces parametres modifie les moyennes, totaux et rangs des bulletins (les calculs sont refaits a l'affichage). Confirmer la modification ?", { confirmation: true });
    }
    const valeurs = { base, mode_moyenne_generale: b.mode_moyenne_generale, note_manquante: b.note_manquante, ponderation_periodes: pond, deleted_at: null };
    const tous = await store.lire("pedagogy_settings", { eq: { academic_year_uuid: year } });
    const ex = tous.find((x) => !x.deleted_at) || tous[0];
    if (ex) await store.maj("pedagogy_settings", ex.id, valeurs);
    else await store.inserer("pedagogy_settings", { academic_year_uuid: year, ...valeurs });
  });
}
