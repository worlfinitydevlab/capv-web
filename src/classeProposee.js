// Classe proposee : pour chaque eleve, la classe que le systeme propose pour l'annee en cours.
//   1. Eleve admis a l'inscription cette annee : la classe souhaitee notee sur son inscription.
//   2. Ancien eleve : sa decision de fin d'annee precedente
//        - admis    -> classe suivante (destination enregistree, sinon suivante dans l'ordre des classes de Regles academiques)
//        - maintenu -> la meme classe (redoublement)
//        - admis ailleurs / exclu / pas de decision -> pas de proposition (la derniere classe connue est seulement affichee)
// Lecture seule : rien n'est jamais ecrit ici. Une source illisible n'empeche pas la page de fonctionner.

export const bas = (s) => String(s == null ? "" : s).trim().replace(/\s+/g, " ").toLowerCase();

// Lit toutes les lignes d'une requete, par pages de 1000 (limite du serveur).
export async function lireTout(fabrique, taille = 1000) {
  const tout = [];
  for (let debut = 0; ; debut += taille) {
    const { data, error } = await fabrique(debut, debut + taille - 1);
    if (error) throw error;
    const lot = data || [];
    for (const x of lot) tout.push(x);
    if (lot.length < taille) break;
  }
  return tout;
}

export function normDecision(v) {
  const s = bas(v).replace(/_/g, " ");
  if (s === "admis") return "admis";
  if (s === "maintenu") return "maintenu";
  if (s === "ailleurs" || s === "admis ailleurs") return "ailleurs";
  if (s === "exclu") return "exclu";
  return "";
}

export const LIBELLE_DECISION = { admis: "Admis", maintenu: "Maintenu (redouble)", ailleurs: "Admis ailleurs", exclu: "Exclu", "": "Décision non précisée" };

export function libelleOrigine(origine) {
  if (origine === "inscription") return "Souhaitée à l'inscription";
  if (origine === "passage") return "Passage de classe";
  if (origine === "redoublement") return "Redoublement";
  return "";
}

// Fonction pure (testable) : construit les propositions a partir des donnees deja lues.
//   classesAnnee : classes de l'annee en cours [{ id, nom, section_uuid }]
//   inscriptions : inscriptions admises de l'annee en cours [{ student_uuid, classe_souhaitee_uuid }]
//   precedente   : annee precedente { id, nom } ou null
//   decisions    : student_decisions de l'annee precedente [{ student_uuid, decision, class_uuid, classe_destination_uuid }]
//   affectations : assignments de l'annee precedente [{ student_uuid, class_uuid }]
//   historique   : student_history de l'annee precedente [{ student_uuid, classe_nom, decision }]
//   classesPrec  : classes de l'annee precedente [{ id, nom }]
//   ordre        : noms des classes, de la plus basse a la plus haute
export function construirePropositions({ classesAnnee, inscriptions, precedente, decisions, affectations, historique, classesPrec, ordre }) {
  const propositions = {};
  const precedentes = {};
  const parNom = new Map();
  for (const c of classesAnnee || []) if (!parNom.has(bas(c.nom))) parNom.set(bas(c.nom), c);
  const parId = new Map((classesAnnee || []).map((c) => [c.id, c]));
  const nomDe = new Map();
  for (const c of classesPrec || []) nomDe.set(c.id, c.nom);
  for (const c of classesAnnee || []) if (!nomDe.has(c.id)) nomDe.set(c.id, c.nom);
  const noms = (ordre || []).map((n) => String(n == null ? "" : n).trim()).filter(Boolean);
  const rang = noms.map(bas);

  if (precedente) {
    const dec = new Map(); for (const d of decisions || []) if (d.student_uuid) dec.set(d.student_uuid, d);
    const aff = new Map(); for (const a of affectations || []) if (a.student_uuid && !aff.has(a.student_uuid)) aff.set(a.student_uuid, a);
    const his = new Map(); for (const h of historique || []) if (h.student_uuid && !his.has(h.student_uuid)) his.set(h.student_uuid, h);
    const ids = new Set([...dec.keys(), ...aff.keys(), ...his.keys()]);
    for (const sid of ids) {
      const d = dec.get(sid), a = aff.get(sid), h = his.get(sid);
      const classePrec = (d && nomDe.get(d.class_uuid)) || (a && nomDe.get(a.class_uuid)) || (h && h.classe_nom) || "";
      const decision = normDecision((d && d.decision) || (h && h.decision) || "");
      const info = { annee: precedente.nom, classe: classePrec, decision, note: "" };
      precedentes[sid] = info;
      let cible = "", origine = "", detail = "";
      if (decision === "admis") {
        let dest = d && d.classe_destination_uuid ? (nomDe.get(d.classe_destination_uuid) || "") : "";
        if (!dest && classePrec) {
          const i = rang.indexOf(bas(classePrec));
          if (i < 0) info.note = "cette classe n'est pas dans l'ordre des classes";
          else if (i + 1 >= noms.length) info.note = "dernière classe de l'ordre : pas de classe suivante";
          else dest = noms[i + 1];
        } else if (!dest) info.note = "classe précédente inconnue";
        if (dest) { cible = dest; origine = "passage"; detail = "Admis en " + classePrec + " (" + precedente.nom + ")"; }
      } else if (decision === "maintenu") {
        if (classePrec) { cible = classePrec; origine = "redoublement"; detail = "Maintenu en " + classePrec + " (" + precedente.nom + ")"; }
        else info.note = "classe précédente inconnue";
      }
      if (cible) {
        const c = parNom.get(bas(cible));
        propositions[sid] = { classe_id: c ? c.id : null, classe_nom: c ? c.nom : cible, section_id: c ? c.section_uuid : null, origine, detail, introuvable: !c };
      }
    }
  }
  // l'inscription de cette annee l'emporte : c'est la classe voulue pour cette annee-la
  for (const i of inscriptions || []) {
    if (!i.student_uuid || !i.classe_souhaitee_uuid) continue;
    const c = parId.get(i.classe_souhaitee_uuid);
    if (!c) continue;
    propositions[i.student_uuid] = { classe_id: c.id, classe_nom: c.nom, section_id: c.section_uuid, origine: "inscription", detail: "Classe souhaitée à l'inscription", introuvable: false };
  }
  return { propositions, precedentes };
}

// Lit ce qu'il faut dans Supabase (lecture seule) et construit les propositions.
//   annee : { id, nom } de l'annee en cours ; classesAnnee : [{ id, nom, section_uuid }] non supprimees
export async function chargerPropositions(supabase, annee, classesAnnee) {
  const sortie = { propositions: {}, precedentes: {}, anneePrecedente: null, avertissements: [] };
  // table absente (fonction jamais utilisee dans cette base) : rien a signaler ; autre erreur : on le dit sur la page
  const tableAbsente = (e) => !!e && (e.code === "PGRST205" || e.code === "42P01" || /does not exist|could not find the table/i.test(String(e.message || "")));
  const essayer = async (nom, f, defaut) => {
    try { return await f(); } catch (e) { if (!tableAbsente(e)) sortie.avertissements.push(nom); return defaut; }
  };

  const inscriptions = await essayer("inscriptions", () => lireTout((a, b) =>
    supabase.from("inscriptions").select("student_uuid, classe_souhaitee_uuid, statut_inscription")
      .eq("academic_year_uuid", annee.id).eq("statut_inscription", "admis").is("deleted_at", null).order("id").range(a, b)), []);

  const annees = await essayer("annees", async () => {
    const { data, error } = await supabase.from("academic_years").select("id, nom").is("deleted_at", null);
    if (error) throw error;
    return data || [];
  }, []);
  const avant = annees.filter((y) => y.id !== annee.id && String(y.nom).localeCompare(String(annee.nom), "fr", { numeric: true }) < 0)
    .sort((x, y) => String(y.nom).localeCompare(String(x.nom), "fr", { numeric: true }));
  const precedente = avant.length ? avant[0] : null;
  sortie.anneePrecedente = precedente;

  let decisions = [], affectations = [], historique = [], classesPrec = [], ordre = [];
  if (precedente) {
    classesPrec = await essayer("classes de l'année précédente", async () => {
      const { data: secs } = await supabase.from("sections").select("id").eq("academic_year_uuid", precedente.id);
      const sids = (secs || []).map((s) => s.id);
      const r1 = await supabase.from("classes").select("id, nom").eq("academic_year_uuid", precedente.id);
      const r2 = sids.length ? await supabase.from("classes").select("id, nom").in("section_uuid", sids) : { data: [] };
      if (r1.error) throw r1.error;
      const m = new Map();
      for (const c of [...(r1.data || []), ...(r2.data || [])]) m.set(c.id, c);
      return [...m.values()];
    }, []);
    decisions = await essayer("décisions de fin d'année", () => lireTout((a, b) =>
      supabase.from("student_decisions").select("student_uuid, decision, class_uuid, classe_destination_uuid")
        .eq("academic_year_uuid", precedente.id).is("deleted_at", null).order("id").range(a, b)), []);
    affectations = await essayer("classes de l'année précédente (élèves)", () => lireTout((a, b) =>
      supabase.from("assignments").select("student_uuid, class_uuid").eq("academic_year_uuid", precedente.id).is("deleted_at", null).order("id").range(a, b)), []);
    historique = await essayer("parcours scolaire", () => lireTout((a, b) =>
      supabase.from("student_history").select("student_uuid, classe_nom, decision").eq("annee_nom", precedente.nom).is("deleted_at", null).order("id").range(a, b)), []);
    ordre = await essayer("ordre des classes", async () => {
      const { data, error } = await supabase.from("pedagogie_reglages").select("valeur").eq("cle", "ordre_classes").is("deleted_at", null).limit(1);
      if (error) throw error;
      let noms = [];
      try { noms = JSON.parse((data && data[0] && data[0].valeur) || "[]"); } catch (e) { noms = []; }
      return Array.isArray(noms) ? noms : [];
    }, []);
  }
  const r = construirePropositions({ classesAnnee, inscriptions, precedente, decisions, affectations, historique, classesPrec, ordre });
  sortie.propositions = r.propositions;
  sortie.precedentes = r.precedentes;
  return sortie;
}
