// Matieres, categories, affectations par classe, enseignants, parametres pedagogiques (port du poste de travail).
import { Erreur, texte, alpha } from "./commun.js";
import { lirePartsActives, memesParts, sommeParts, MESSAGE_SQL, tableAbsente } from "./parts.js";

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
    const parts = await lirePartsActives(store, cs.map((c) => c.id));
    return cs.filter((c) => mp[c.subject_uuid]).map((c) => ({
      id: c.id, subject_id: c.subject_uuid, matiere_nom: mp[c.subject_uuid].nom, matiere_code: mp[c.subject_uuid].code,
      coefficient: c.coefficient, heures_semaine: c.heures_semaine, employee_id: c.employee_uuid, category_id: c.category_uuid,
      statut: c.statut || "active", enseignant_nom: c.employee_uuid ? en[c.employee_uuid] || null : null,
      sous_matieres: (parts[c.id] || []).map((p) => ({ id: p.id, nom: p.nom, maximum: p.maximum }))
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
      return ex.id;
    }
    return (await store.inserer("class_subjects", { class_uuid: classId, subject_uuid: subjectId, coefficient: coef, heures_semaine: heures, employee_uuid: employeeId || null, category_uuid: categoryId || null, statut: statut || "active" })).id;
  }

  app.post("/api/matieres-classe", async ({ body: b }, { store, outils }) => {
    const classId = b.class_id, subjectId = b.subject_id;
    if (!classId || !subjectId) throw new Erreur(400, "Classe et matiere requises");
    const coef = Number(b.coefficient) > 0 ? Number(b.coefficient) : 1;
    const categoryId = b.category_id === undefined ? undefined : (b.category_id || null);
    const statut = b.statut === "inactive" ? "inactive" : (b.statut === "active" ? "active" : undefined);
    const ex = (await store.lire("class_subjects", { eq: { class_uuid: classId, subject_uuid: subjectId }, ...V }))[0];
    // une matiere qui a des sous-matieres (meme retiree puis remise) garde un coefficient egal a leur total
    const existante = ex || (await store.lire("class_subjects", { eq: { class_uuid: classId, subject_uuid: subjectId } }))[0];
    if (existante) {
      const sp = (await lirePartsActives(store, [existante.id]))[existante.id] || [];
      if (sp.length && Math.round(sommeParts(sp) * 100) !== Math.round(coef * 100)) {
        throw new Erreur(409, "Cette matiere est divisee en sous-matieres dont le total est " + sommeParts(sp) + ". Garde ce coefficient (" + sommeParts(sp) + "), ou change d'abord ses sous-matieres.");
      }
    }
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
      const srcRows = await store.lire("class_subjects", { eq: { class_uuid: o.id }, ...V });
      const srcParts = await lirePartsActives(store, srcRows.map((x) => x.id));
      for (const m of srcRows) {
        // une affectation de l'annee d'arrivee qui a deja ses sous-matieres avec un autre total n'est pas modifiee
        const tous = await store.lire("class_subjects", { eq: { class_uuid: c.id, subject_uuid: m.subject_uuid } });
        const ex = tous.find((x) => !x.deleted_at) || tous[0];
        const partsCible = ex ? (await lirePartsActives(store, [ex.id]))[ex.id] || [] : [];
        if (partsCible.length && Math.round(sommeParts(partsCible) * 100) !== Math.round(Number(m.coefficient) * 100)) continue;
        const id = await enregistrerAffectation(store, c.id, m.subject_uuid, m.coefficient, m.heures_semaine, m.employee_uuid, m.category_uuid || null, m.statut || "active");
        const sp = srcParts[m.id] || [];
        if (sp.length && !partsCible.length && (await outils.nbNotesAffectation(id)) === 0) await ajouterParts(store, id, sp);
        copiees++;
      }
    }
    return { success: true, copiees };
  });

  // ---- sous-matieres d'une affectation (une matiere dans une classe) ----
  async function ajouterParts(store, csId, parts) {
    let i = 0;
    for (const p of parts) await store.inserer("class_subject_parts", { class_subject_uuid: csId, nom: p.nom, maximum: p.maximum, ordre: ++i });
  }
  // retire des sous-matieres (avec leurs evaluations, qui n'ont pas de notes : c'est verifie avant)
  async function retirerParts(store, parts) {
    if (!parts.length) return;
    const t = store.maintenant();
    const evs = await store.lire("evaluations", { in: { part_uuid: parts.map((p) => p.id) }, ...V });
    for (const e of evs) await store.maj("evaluations", e.id, { deleted_at: t });
    for (const p of parts) await store.maj("class_subject_parts", p.id, { deleted_at: t });
  }
  // notes deja saisies sur une affectation : { parPart: { <part_id>: n }, matiere: n (notes de la matiere sans sous-matiere) }
  async function notesAffectation(store, csId) {
    const evs = await store.lire("evaluations", { eq: { class_subject_uuid: csId }, ...V });
    const gs = evs.length ? await store.lire("grades", { cols: "id, evaluation_uuid", in: { evaluation_uuid: evs.map((e) => e.id) }, ...V, notNull: ["note"] }) : [];
    const n = {};
    gs.forEach((g) => { n[g.evaluation_uuid] = (n[g.evaluation_uuid] || 0) + 1; });
    const sortie = { parPart: {}, matiere: 0 };
    for (const e of evs) {
      const k = n[e.id] || 0;
      if (e.part_uuid) sortie.parPart[e.part_uuid] = (sortie.parPart[e.part_uuid] || 0) + k; else sortie.matiere += k;
    }
    return sortie;
  }
  async function affectationActive(store, id) {
    const cs = (await store.lire("class_subjects", { eq: { id }, ...V }))[0];
    if (!cs) throw new Erreur(404, "Affectation introuvable");
    return cs;
  }

  app.get("/api/matieres-classe/:id/sous-matieres", async ({ params }, { store }) => {
    const cs = await affectationActive(store, params.id);
    const m = (await store.lire("subjects", { cols: "id, nom", eq: { id: cs.subject_uuid } }))[0];
    const parts = (await lirePartsActives(store, [cs.id]))[cs.id] || [];
    const n = await notesAffectation(store, cs.id);
    return {
      id: cs.id, matiere_nom: m ? m.nom : "", coefficient: Number(cs.coefficient), total: sommeParts(parts), nb_notes_matiere: n.matiere,
      sous_matieres: parts.map((p) => ({ ...p, nb_notes: n.parPart[p.id] || 0 }))
    };
  });

  // remplace la liste des sous-matieres d'une affectation : { sous_matieres: [ { id?, nom, maximum } ] } (liste vide = plus de sous-matieres)
  app.put("/api/matieres-classe/:id/sous-matieres", async ({ params, body: b }, { store, ctx }) => {
    const cs = await affectationActive(store, params.id);
    const demandees = Array.isArray(b.sous_matieres) ? b.sous_matieres : [];
    if (demandees.length === 1) throw new Erreur(400, "Une seule sous-matiere n'a pas de sens : ajoute-en une deuxieme, ou retire-la.");
    if (demandees.length > 30) throw new Erreur(400, "Trop de sous-matieres (30 au maximum).");
    const coef = Number(cs.coefficient);
    const noms = [], idsVus = new Set();
    const voulues = demandees.map((p, i) => {
      const nom = texte(p.nom);
      if (!nom) throw new Erreur(400, "Chaque sous-matiere a besoin d'un nom.");
      if (nom.length > 60) throw new Erreur(400, "Nom trop long : " + nom);
      if (noms.some((x) => alpha(x, nom) === 0)) throw new Erreur(409, "Deux sous-matieres portent le nom « " + nom + " ».");
      noms.push(nom);
      const brut = p.maximum === undefined || p.maximum === null ? "" : String(p.maximum).replace(",", ".");
      const maximum = Math.round(Number(brut) * 100) / 100;
      if (brut === "" || !(maximum > 0)) throw new Erreur(400, "Le maximum de « " + nom + " » doit etre superieur a 0.");
      const id = p.id ? String(p.id) : null;
      if (id) { if (idsVus.has(id)) throw new Erreur(400, "Sous-matiere en double."); idsVus.add(id); }
      return { id, nom, maximum, ordre: i + 1 };
    });
    if (voulues.length && Math.round(sommeParts(voulues) * 100) !== Math.round(coef * 100)) {
      throw new Erreur(400, "Le total des sous-matieres (" + sommeParts(voulues) + ") doit etre egal au maximum de la matiere (" + coef + ").");
    }
    const actuelles = (await lirePartsActives(store, [cs.id]))[cs.id] || [];
    const parId = Object.fromEntries(actuelles.map((a) => [a.id, a]));
    for (const v of voulues) if (v.id && !parId[v.id]) throw new Erreur(404, "Sous-matiere introuvable : recharge la fenetre.");
    const n = await notesAffectation(store, cs.id);
    if (!actuelles.length && voulues.length && n.matiere > 0) {
      throw new Erreur(409, "Des notes existent deja pour cette matiere dans cette classe (" + n.matiere + "). On ne peut plus la diviser en sous-matieres sans changer les bulletins.");
    }
    const retirees = actuelles.filter((a) => !voulues.some((v) => v.id === a.id));
    for (const a of retirees) {
      if ((n.parPart[a.id] || 0) > 0) throw new Erreur(409, "« " + a.nom + " » a deja des notes : elle ne peut pas etre retiree.");
    }
    for (const v of voulues) {
      const a = v.id ? parId[v.id] : null;
      if (a && Math.round(a.maximum * 100) !== Math.round(v.maximum * 100) && (n.parPart[a.id] || 0) > 0) {
        throw new Erreur(409, "« " + a.nom + " » a deja des notes : son maximum ne peut plus changer.");
      }
    }
    try {
      await retirerParts(store, retirees);
      // les noms changes passent d'abord par un nom provisoire (deux sous-matieres peuvent echanger leurs noms)
      const renommees = voulues.filter((v) => v.id && parId[v.id].nom !== v.nom);
      for (const v of renommees) await store.maj("class_subject_parts", v.id, { nom: "~" + v.id });
      for (const v of voulues) {
        if (!v.id) continue;
        const a = parId[v.id];
        const patch = {};
        if (renommees.includes(v)) patch.nom = v.nom;
        if (Math.round(a.maximum * 100) !== Math.round(v.maximum * 100)) patch.maximum = v.maximum;
        if (a.ordre !== v.ordre) patch.ordre = v.ordre;
        if (Object.keys(patch).length) await store.maj("class_subject_parts", v.id, patch);
      }
      for (const v of voulues) if (!v.id) await store.inserer("class_subject_parts", { class_subject_uuid: cs.id, nom: v.nom, maximum: v.maximum, ordre: v.ordre });
    } catch (e) {
      if (tableAbsente(e)) throw new Erreur(503, MESSAGE_SQL);
      throw e;
    }
    const u = ctx && ctx.utilisateur ? ctx.utilisateur() : null;
    if (u) {
      try {
        const m = (await store.lire("subjects", { cols: "id, nom", eq: { id: cs.subject_uuid } }))[0];
        const cl = (await store.lire("classes", { cols: "id, nom", eq: { id: cs.class_uuid } }))[0];
        await store.inserer("audit_pedagogie", { username: u.username, action: "SOUS_MATIERES", details: (cl ? cl.nom : "") + " / " + (m ? m.nom : "") + " : " + (voulues.length ? voulues.map((v) => v.nom + " " + v.maximum).join(", ") : "aucune sous-matiere") });
      } catch (e) { /* journal best-effort */ }
    }
    return { success: true, total: sommeParts(voulues), nb: voulues.length };
  });

  // ---- affectation en lot : copier les matieres d'une classe vers d'autres classes, ou affecter une matiere a plusieurs classes ----
  // spec (corps du POST, ou parametres du GET d'apercu ; une liste peut etre un tableau ou "a,b,c") :
  //   copie    : { source_class_id, subject_ids?, class_ids, copier_enseignants?, si_existe? }
  //   affecter : { subject_id, class_ids, coefficient, heures_semaine?, category_id?, employee_id?, si_existe? }
  //   si_existe : "laisser" (defaut) = une affectation deja presente n'est pas touchee ; "remplacer" = elle prend les valeurs donnees
  // Un champ non fourni n'est jamais modifie sur une affectation qui existe deja. Rien n'est ecrit par l'apercu.
  const liste = (v) => (Array.isArray(v) ? v : String(v === undefined || v === null ? "" : v).split(",")).map((x) => String(x).trim()).filter(Boolean);
  const vrai = (v) => v === true || v === 1 || v === "1" || v === "true";
  const vide = (v) => v === undefined || v === null || v === "";
  const MAX_LOT = 3000;

  async function elementsDuLot(store, spec) {
    const cibles = [...new Set(liste(spec.class_ids))];
    if (!cibles.length) throw new Erreur(400, "Choisis au moins une classe.");
    const si = spec.si_existe === "remplacer" ? "remplacer" : "laisser";
    const elements = [];
    if (spec.source_class_id) {
      const srcId = String(spec.source_class_id);
      let src = await store.lire("class_subjects", { eq: { class_uuid: srcId }, ...V });
      const choix = liste(spec.subject_ids);
      if (choix.length) src = src.filter((x) => choix.includes(String(x.subject_uuid)));
      if (!src.length) throw new Erreur(400, "Aucune matière à copier.");
      const avecEns = vrai(spec.copier_enseignants);
      const partsSrc = await lirePartsActives(store, src.map((m) => m.id));
      for (const c of cibles) {
        if (c === srcId) continue;
        for (const m of src) {
          elements.push({
            class_id: c, subject_id: m.subject_uuid, coefficient: Number(m.coefficient), heures_semaine: Number(m.heures_semaine) || 0,
            category_id: m.category_uuid || null, statut: m.statut || "active", employee_id: avecEns ? (m.employee_uuid || null) : undefined,
            parts: (partsSrc[m.id] || []).map((q) => ({ nom: q.nom, maximum: q.maximum })) // la cible aura les memes sous-matieres (liste vide : aucune)
          });
        }
      }
      if (!elements.length) throw new Erreur(400, "Choisis au moins une classe autre que la classe modèle.");
    } else {
      if (!spec.subject_id) throw new Erreur(400, "Choisis une matière.");
      const coef = Number(spec.coefficient) > 0 ? Number(spec.coefficient) : 1;
      for (const c of cibles) {
        elements.push({
          class_id: c, subject_id: String(spec.subject_id), coefficient: coef,
          heures_semaine: vide(spec.heures_semaine) ? undefined : Number(spec.heures_semaine) || 0,
          category_id: vide(spec.category_id) ? undefined : spec.category_id,
          employee_id: vide(spec.employee_id) ? undefined : spec.employee_id
        });
      }
    }
    if (elements.length > MAX_LOT) throw new Erreur(400, "Trop d'affectations d'un coup (" + elements.length + "). Réduis le nombre de classes ou de matières.");
    return { elements, si };
  }

  async function planifierLot(store, outils, spec) {
    const { elements, si } = await elementsDuLot(store, spec);
    const classIds = [...new Set(elements.map((e) => e.class_id))];
    const subjIds = [...new Set(elements.map((e) => e.subject_id))];
    const classes = await store.lire("classes", { cols: "id, nom", in: { id: classIds }, ...V });
    const cn = Object.fromEntries(classes.map((c) => [c.id, c.nom]));
    const sujets = await store.lire("subjects", { cols: "id, nom", in: { id: subjIds }, ...V });
    const sn = Object.fromEntries(sujets.map((s) => [s.id, s.nom]));
    const rows = await store.lire("class_subjects", { in: { class_uuid: classIds } });
    const partsCibles = await lirePartsActives(store, rows.map((r) => r.id));
    const parCle = {};
    for (const r of rows) (parCle[r.class_uuid + ":" + r.subject_uuid] = parCle[r.class_uuid + ":" + r.subject_uuid] || []).push(r);
    const c100 = (v) => Math.round(Number(v) * 100);

    const lignes = [];
    for (const e of elements) {
      const base = { class_id: e.class_id, classe: cn[e.class_id] || "?", subject_id: e.subject_id, matiere: sn[e.subject_id] || "?" };
      if (!cn[e.class_id]) { lignes.push({ ...base, action: "introuvable", raison: "classe introuvable" }); continue; }
      if (!sn[e.subject_id]) { lignes.push({ ...base, action: "introuvable", raison: "matière introuvable" }); continue; }
      const tous = parCle[e.class_id + ":" + e.subject_id] || [];
      const actif = tous.find((x) => !x.deleted_at);
      const modeCopie = Array.isArray(e.parts); // en mode copie, la cible doit avoir les memes sous-matieres que la source
      if (!actif) {
        // une affectation retiree plus tot est reactivee, avec toutes ses valeurs remplacees (aucune ancienne valeur ne revient)
        const retiree = tous.find((x) => x.deleted_at);
        const ligne = {
          ...base, action: "ajouter", ancienne: retiree ? retiree.id : null,
          valeurs: {
            coefficient: e.coefficient, heures_semaine: e.heures_semaine === undefined ? 0 : e.heures_semaine,
            employee_uuid: e.employee_id || null, category_uuid: e.category_id || null, statut: e.statut || "active"
          }
        };
        const voulues = modeCopie && e.parts.length ? e.parts : null;
        if (retiree) {
          const anc = partsCibles[retiree.id] || [];
          const nbN = anc.length || voulues ? await outils.nbNotesAffectation(retiree.id) : 0;
          if (anc.length) {
            if (nbN === 0) { ligne.retirer_parts = anc; if (voulues) ligne.ajouter_parts = voulues; }
            else if (!modeCopie && c100(sommeParts(anc)) === c100(e.coefficient)) { /* elle retrouve ses sous-matieres et ses notes telles quelles */ }
            else { lignes.push({ ...base, action: "ignorer_notes", raison: "des notes existent avec des sous-matières : modifie-la à la main" }); continue; }
          } else if (voulues) {
            if (nbN === 0) ligne.ajouter_parts = voulues; else ligne.sans_parts = true;
          }
        } else if (voulues) ligne.ajouter_parts = voulues;
        lignes.push(ligne);
        continue;
      }
      if (si === "laisser") { lignes.push({ ...base, action: "laisser", raison: "déjà dans la classe" }); continue; }
      const patch = {};
      if (e.coefficient !== undefined && Number(actif.coefficient) !== e.coefficient) patch.coefficient = e.coefficient;
      if (e.category_id !== undefined && (actif.category_uuid || null) !== (e.category_id || null)) patch.category_uuid = e.category_id || null;
      if (e.heures_semaine !== undefined && Number(actif.heures_semaine) !== e.heures_semaine) patch.heures_semaine = e.heures_semaine;
      if (e.employee_id !== undefined && (actif.employee_uuid || null) !== (e.employee_id || null)) patch.employee_uuid = e.employee_id || null;
      if (e.statut !== undefined && (actif.statut || "active") !== e.statut) patch.statut = e.statut;
      const actParts = partsCibles[actif.id] || [];
      const changeParts = modeCopie && !memesParts(actParts, e.parts);
      if (!modeCopie && "coefficient" in patch && actParts.length && c100(sommeParts(actParts)) !== c100(e.coefficient)) {
        lignes.push({ ...base, action: "ignorer_notes", raison: "elle est divisée en sous-matières dont le total est " + sommeParts(actParts) + " : change d'abord ses sous-matières" });
        continue;
      }
      if (!Object.keys(patch).length && !changeParts) { lignes.push({ ...base, action: "identique" }); continue; }
      if (("coefficient" in patch || "category_uuid" in patch || changeParts) && (await outils.nbNotesAffectation(actif.id)) > 0) {
        lignes.push({ ...base, action: "ignorer_notes", raison: "des notes existent : le coefficient, la catégorie ou les sous-matières changeraient les bulletins, modifie-la à la main" });
        continue;
      }
      const ligne = { ...base, action: "remplacer", id: actif.id, patch, changements: Object.keys(patch) };
      if (changeParts) {
        ligne.changements.push("sous_matieres");
        if (actParts.length) ligne.retirer_parts = actParts;
        if (e.parts.length) ligne.ajouter_parts = e.parts;
      }
      lignes.push(ligne);
    }
    const n = (a) => lignes.filter((l) => l.action === a).length;
    const resume = {
      ajoutees: n("ajouter"), remplacees: n("remplacer"), laissees: n("laisser"), identiques: n("identique"), ignorees: n("ignorer_notes"), introuvables: n("introuvable"),
      avec_sous_matieres: lignes.filter((l) => (l.action === "ajouter" || l.action === "remplacer") && l.ajouter_parts && l.ajouter_parts.length).length,
      sans_sous_matieres: lignes.filter((l) => l.sans_parts).length
    };
    return { lignes, resume };
  }
  const publique = (l) => ({
    class_id: l.class_id, classe: l.classe, subject_id: l.subject_id, matiere: l.matiere, action: l.action, raison: l.raison || null, changements: l.changements || null,
    nb_sous_matieres: l.ajouter_parts ? l.ajouter_parts.length : 0, sans_sous_matieres: !!l.sans_parts
  });

  // apercu en lecture seule (GET : aucun mot de passe) puis ecriture (POST) calculee par le meme plan
  app.get("/api/apercu-matieres-classe", async ({ query }, { store, outils }) => {
    const p = await planifierLot(store, outils, query);
    return { resume: p.resume, lignes: p.lignes.map(publique) };
  });

  app.post("/api/matieres-classe/lot", async ({ body: b }, { store, outils }) => {
    const p = await planifierLot(store, outils, b);
    for (const l of p.lignes) {
      if (l.action === "ajouter") {
        if (l.retirer_parts) await retirerParts(store, l.retirer_parts);
        let csId = l.ancienne;
        if (l.ancienne) await store.maj("class_subjects", l.ancienne, { ...l.valeurs, deleted_at: null });
        else csId = (await store.inserer("class_subjects", { class_uuid: l.class_id, subject_uuid: l.subject_id, ...l.valeurs })).id;
        if (l.ajouter_parts) await ajouterParts(store, csId, l.ajouter_parts);
      } else if (l.action === "remplacer") {
        if (Object.keys(l.patch).length) await store.maj("class_subjects", l.id, l.patch);
        if (l.retirer_parts) await retirerParts(store, l.retirer_parts);
        if (l.ajouter_parts) await ajouterParts(store, l.id, l.ajouter_parts);
      }
    }
    return { success: true, ...p.resume, lignes: p.lignes.map(publique) };
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
