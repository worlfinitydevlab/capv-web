// Regles academiques : ordre des classes, regles de decision par portee, calcul des decisions de fin d'annee (port du poste de travail).
import { Erreur, texte, alpha } from "./commun.js";
import { calculerBulletin, elevesDeClasse, anneeDeClasse } from "./h-notes.js";

const V = { isNull: ["deleted_at"] };
const DECISIONS = ["admis", "ailleurs", "maintenu", "exclu"];
const CLE_ORDRE = "ordre_classes";
const bas = (x) => String(x || "").trim().toLowerCase();

function lireTiers(j) {
  try { const t = JSON.parse(j.tiers_json || "[]"); return Array.isArray(t) ? t.slice().sort((a, b) => a.min_moyenne - b.min_moyenne) : []; } catch (e) { return []; }
}

export function enregistrerRegles(app) {
  // ---- ordre des classes (une liste de noms, de la plus basse a la plus haute) ----
  async function lireOrdre(store) {
    const l = (await store.lire("pedagogie_reglages", { eq: { cle: CLE_ORDRE }, ...V }))[0];
    if (!l) return [];
    try { const a = JSON.parse(l.valeur || "[]"); return Array.isArray(a) ? a.map((n) => String(n).trim()).filter(Boolean) : []; } catch (e) { return []; }
  }

  async function jeuxActifs(store) {
    const jeux = await store.lire("promotion_rule_sets", V);
    return jeux.filter((j) => (j.statut || "active") === "active").map((j) => ({ ...j, section_id: j.section_uuid, tiers: lireTiers(j) }));
  }

  function jeuDeClasse(classe, jeux, ordre) {
    const pos = (nom) => ordre.indexOf(bas(nom));
    let meilleur = null, score = -1;
    for (const j of jeux) {
      let s = 0;
      if (j.portee === "toutes") s = 1;
      else if (j.portee === "section") { if (j.section_id && classe.section_id === j.section_id) s = 2000; }
      else if (j.portee === "intervalle") {
        const a = pos(j.classe_debut), b = pos(j.classe_fin), p = pos(classe.nom);
        if (a >= 0 && b >= 0 && p >= 0 && Math.min(a, b) <= p && p <= Math.max(a, b)) s = 3000 - Math.abs(b - a);
      }
      if (s > score) { meilleur = j; score = s; }
    }
    return meilleur;
  }

  function validerJeu(b, ordreBas) {
    const nom = texte(b.nom);
    if (!nom) return "Le nom de la regle est requis";
    if (!["toutes", "section", "intervalle"].includes(b.portee)) return "Portee invalide";
    if (b.portee === "section" && !b.section_id) return "Choisis une section";
    if (b.portee === "intervalle") {
      const a = bas(b.classe_debut), z = bas(b.classe_fin);
      if (!a || !z) return "Choisis la premiere et la derniere classe de l'intervalle";
      if (ordreBas.indexOf(a) < 0 || ordreBas.indexOf(z) < 0) return "Ces classes ne sont pas dans l'ordre des classes. Definis d'abord l'ordre.";
    }
    if (!["compter", "ignorer"].includes(b.manquant)) return "Regle des controles non evalues invalide";
    const tiers = Array.isArray(b.tiers) ? b.tiers : [];
    if (tiers.length < 2) return "Il faut au moins deux paliers";
    let prec = -1;
    for (let i = 0; i < tiers.length; i++) {
      const t = tiers[i];
      const m = Number(t.min);
      if (!Number.isFinite(m) || m < 0) return "Palier " + (i + 1) + " : seuil invalide";
      if (i === 0 && m !== 0) return "Le premier palier doit commencer a 0 pour couvrir toutes les moyennes";
      if (m <= prec) return "Les seuils doivent etre strictement croissants";
      prec = m;
      if (!DECISIONS.includes(t.decision)) return "Palier " + (i + 1) + " : decision invalide";
      if (!texte(t.libelle)) return "Palier " + (i + 1) + " : libelle requis";
    }
    return null;
  }

  const tiersJson = (tiers) => JSON.stringify(tiers.slice().sort((x, y) => Number(x.min) - Number(y.min)).map((t, i) => ({ min_moyenne: Number(t.min), decision: t.decision, libelle: texte(t.libelle), ordre: i + 1 })));
  const champsJeu = (b) => ({
    nom: texte(b.nom), portee: b.portee, section_uuid: b.portee === "section" ? b.section_id : null,
    classe_debut: b.portee === "intervalle" ? texte(b.classe_debut) : null, classe_fin: b.portee === "intervalle" ? texte(b.classe_fin) : null,
    manquant: b.manquant, statut: b.statut === "inactive" ? "inactive" : "active", tiers_json: tiersJson(b.tiers)
  });

  app.get("/api/ordre-classes", async (req, { store }) => {
    const classes = (await store.lire("classes", V)).sort((a, b) => alpha(a.created_at, b.created_at)); // la plus recente l'emporte
    const parNom = {};
    for (const c of classes) parNom[bas(c.nom)] = c;
    const secs = await store.lire("sections", { cols: "id, nom" });
    const sn = Object.fromEntries(secs.map((s) => [s.id, s.nom]));
    const noms = await lireOrdre(store);
    const ordre = {};
    noms.forEach((n, i) => { ordre[bas(n)] = i + 1; });
    const liste = Object.keys(parNom).map((k) => ({
      nom: parNom[k].nom, ordre: ordre[k] || null, ordonnee: !!ordre[k],
      section_id: parNom[k].section_uuid || null, section: parNom[k].section_uuid ? (sn[parNom[k].section_uuid] || null) : null
    }));
    liste.sort((a, b) => (a.ordonnee && b.ordonnee ? a.ordre - b.ordre : a.ordonnee ? -1 : b.ordonnee ? 1 : alpha(a.nom, b.nom)));
    return liste;
  });

  app.put("/api/ordre-classes", async ({ body: b }, { store }) => {
    const noms = Array.isArray(b.noms) ? b.noms.map((n) => String(n).trim()).filter(Boolean) : [];
    if (!noms.length) throw new Erreur(400, "Liste vide");
    if (new Set(noms.map(bas)).size !== noms.length) throw new Erreur(400, "Classe en double dans la liste");
    const tous = await store.lire("pedagogie_reglages", { eq: { cle: CLE_ORDRE } });
    const ex = tous.find((x) => !x.deleted_at) || tous[0];
    if (ex) await store.maj("pedagogie_reglages", ex.id, { valeur: JSON.stringify(noms), deleted_at: null });
    else await store.inserer("pedagogie_reglages", { cle: CLE_ORDRE, valeur: JSON.stringify(noms) });
  });

  // ---- regles ----
  app.get("/api/regles", async ({ query }, { store, outils }) => {
    const jeux = await jeuxActifs(store);
    const tous = (await store.lire("promotion_rule_sets", V)).sort((a, b) => alpha(a.created_at, b.created_at)).map((j) => ({
      ...j, section_id: j.section_uuid, tiers: lireTiers(j).map((t) => ({ min_moyenne: t.min_moyenne, decision: t.decision, libelle: t.libelle }))
    }));
    const noms = await lireOrdre(store);
    const ordre = noms.map(bas);
    const couverture = query.year ? (await outils.classesDeAnnee(query.year)).map((c) => {
      const j = jeuDeClasse(c, jeux, ordre);
      return { classe: c.nom, regle: j ? j.nom : null, ordonnee: ordre.indexOf(bas(c.nom)) >= 0 };
    }) : [];
    return { regles: tous, couverture };
  });

  app.post("/api/regles", async ({ body: b }, { store }) => {
    const ordre = (await lireOrdre(store)).map(bas);
    const err = validerJeu(b, ordre);
    if (err) throw new Erreur(400, err);
    const r = await store.inserer("promotion_rule_sets", champsJeu(b));
    return { id: r.id };
  });

  app.put("/api/regles/:id", async ({ params, body: b }, { store }) => {
    const ordre = (await lireOrdre(store)).map(bas);
    const err = validerJeu(b, ordre);
    if (err) throw new Erreur(400, err);
    const ex = (await store.lire("promotion_rule_sets", { eq: { id: params.id }, ...V }))[0];
    if (!ex) throw new Erreur(404, "Regle introuvable");
    await store.maj("promotion_rule_sets", params.id, champsJeu(b));
  });

  app.delete("/api/regles/:id", async ({ params }, { store }) => {
    await store.maj("promotion_rule_sets", params.id, { deleted_at: store.maintenant() });
  });

  app.post("/api/regles/modele", async (req, { store }) => {
    const r = await store.inserer("promotion_rule_sets", {
      nom: "Regle generale", portee: "toutes", manquant: "compter", statut: "active",
      tiers_json: tiersJson([{ min: 0, decision: "maintenu", libelle: "Echec" }, { min: 4.99, decision: "ailleurs", libelle: "Admis ailleurs" }, { min: 5.5, decision: "admis", libelle: "Admis" }])
    });
    return { id: r.id };
  });

  // ---- calcul des decisions de fin d'annee ----
  async function calculerPromotionClasse(store, outils, classId, roomId) {
    const { classe: c, annee } = await anneeDeClasse(store, classId);
    if (!c) throw new Erreur(404, "Classe introuvable");
    const classe = { id: c.id, nom: c.nom, section_id: c.section_uuid || null };
    const noms = await lireOrdre(store);
    const ordre = noms.map(bas);
    const jeu = jeuDeClasse(classe, await jeuxActifs(store), ordre);
    const periodes = (await store.lire("grading_periods", { eq: { academic_year_uuid: annee }, ...V })).sort((a, b) => (a.ordre || 0) - (b.ordre || 0)).map((p) => ({ id: p.id, nom: p.nom }));
    const bulletins = [];
    for (const p of periodes) bulletins.push(await calculerBulletin(store, outils, classId, p.id));
    const base = bulletins.length ? bulletins[0].base : ((await outils.parametresPedagogie(annee)).base || 10);
    const liste = (await elevesDeClasse(store, classId, roomId || null)).map((s) => ({ id: s.id, nom: s.nom, prenom: s.prenom }));
    const pos = ordre.indexOf(bas(classe.nom));
    const suivanteNom = pos >= 0 && pos + 1 < noms.length ? noms[pos + 1] : null;
    const manq = jeu ? jeu.manquant : "compter";
    const resume = { admis: 0, ailleurs: 0, maintenu: 0, exclu: 0, sans_decision: 0 };
    for (const e of liste) {
      e.moyennes = bulletins.map((b) => { const x = b.eleves.find((y) => y.id === e.id); return x && x.moyenne !== null && x.moyenne !== undefined ? x.moyenne : null; });
      const vals = e.moyennes.filter((v) => v !== null);
      if (!vals.length || !periodes.length) e.annuelle = null;
      else e.annuelle = Math.round((vals.reduce((a, v) => a + v, 0) / (manq === "compter" ? periodes.length : vals.length)) * 100) / 100;
      e.decision = null; e.libelle = null; e.suivante = null;
      if (e.annuelle === null || !jeu) resume.sans_decision++;
      else {
        let palier = null;
        for (const t of jeu.tiers) if (e.annuelle >= t.min_moyenne) palier = t;
        if (palier) {
          e.decision = palier.decision; e.libelle = palier.libelle; resume[palier.decision]++;
          if (palier.decision === "admis") e.suivante = pos < 0 ? null : (suivanteNom || "Fin de cycle");
          else if (palier.decision === "maintenu") e.suivante = classe.nom;
        } else resume.sans_decision++;
      }
    }
    const classes = liste.filter((e) => e.annuelle !== null).sort((a, b) => b.annuelle - a.annuelle);
    classes.forEach((e, i) => { e.rang = i > 0 && classes[i - 1].annuelle === e.annuelle ? classes[i - 1].rang : i + 1; });
    return {
      classe: { id: classe.id, nom: classe.nom, ordonnee: pos >= 0, derniere: pos >= 0 && !suivanteNom },
      base, periodes, manquant: manq, annee,
      regle: jeu ? { id: jeu.id, nom: jeu.nom, portee: jeu.portee, tiers: jeu.tiers.map((t) => ({ min_moyenne: t.min_moyenne, decision: t.decision, libelle: t.libelle })) } : null,
      eleves: liste, resume
    };
  }

  app.get("/api/promotion/calcul", async ({ query }, { store, outils }) => {
    if (!query.class_id) throw new Erreur(400, "Classe requise");
    const { annee, ...res } = await calculerPromotionClasse(store, outils, query.class_id, query.room_id);
    return res;
  });

  // Applique les decisions calculees : remplit student_decisions (la migration d'annee fait ensuite le passage)
  app.post("/api/promotion/appliquer", async ({ body: b }, { store, outils }) => {
    const classId = b.class_id;
    if (!classId) throw new Erreur(400, "Classe requise");
    const calc = await calculerPromotionClasse(store, outils, classId, b.room_id);
    if (!calc.regle) throw new Erreur(400, "Aucune regle ne s'applique a cette classe");
    const yearId = calc.annee;
    const aEcrire = calc.eleves.filter((e) => e.decision);
    if (!aEcrire.length) throw new Erreur(400, "Aucun eleve n'a de decision calculable (notes manquantes)");
    const existant = await store.lire("student_decisions", { eq: { academic_year_uuid: yearId, class_uuid: classId }, ...V });
    const exMap = Object.fromEntries(existant.map((x) => [x.student_uuid, x.decision]));
    const ecrases = aEcrire.filter((e) => exMap[e.id] && exMap[e.id] !== e.decision).length;
    if (ecrases > 0 && !b.confirmer) throw new Erreur(409, ecrases + " decision(s) deja enregistree(s) seront remplacees.", { confirmation: true, nb_ecrases: ecrases });
    const classesAnnee = await outils.classesDeAnnee(yearId);
    const destDe = (nom) => { if (!nom) return null; const r = classesAnnee.find((c) => bas(c.nom) === bas(nom)); return r ? r.id : null; };
    const sansSuite = [];
    for (const e of aEcrire) {
      const dest = e.decision === "admis" ? destDe(e.suivante) : null;
      if (e.decision === "admis" && !dest) sansSuite.push(e.nom + " " + e.prenom);
      // une seule decision par eleve et par annee (index unique) : on la retrouve, meme si elle venait d'une autre classe
      const tous = await store.lire("student_decisions", { eq: { student_uuid: e.id, academic_year_uuid: yearId } });
      const ex = tous.find((x) => !x.deleted_at) || tous[0];
      const valeurs = { decision: e.decision, class_uuid: classId, classe_destination_uuid: dest, salle_destination_uuid: null, deleted_at: null };
      if (ex) await store.maj("student_decisions", ex.id, valeurs);
      else await store.inserer("student_decisions", { student_uuid: e.id, academic_year_uuid: yearId, ...valeurs });
    }
    return { success: true, ecrites: aEcrire.length, remplacees: ecrases, sans_decision: calc.eleves.length - aEcrire.length, sans_classe_suivante: sansSuite };
  });
}
