import React, { useState, useEffect, useMemo, useRef } from "react";
import { useAuth } from "../AuthContext.jsx";
import { getAuthedClient } from "../supabaseClient.js";
import { useYear } from "../YearContext.jsx";
import { trierClasses, trierSections } from "../ordreClasses.js";
import StudentProfile from "../components/StudentProfile.jsx";
import RetraitAssignation from "../components/RetraitAssignation.jsx";
import { genererFacturesEleve } from "../accountingHelpers.js";
import { lireTout, chargerPropositions, libelleOrigine, LIBELLE_DECISION } from "../classeProposee.js";

const norm = (s) => String(s == null ? "" : s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const champ = { padding: "9px 12px", border: "1px solid var(--line)", borderRadius: "10px", background: "var(--card)", color: "var(--text)", fontSize: "13px" };
const VIDE = { sections: [], classes: [], rooms: [] };
const par = (liste, n) => { const r = []; for (let i = 0; i < liste.length; i += n) r.push(liste.slice(i, i + n)); return r; };
const barre = { display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1e3a8a", borderRadius: "10px", padding: "10px 14px", marginBottom: "12px", fontSize: "13px" };

export default function Assignments() {
  const { token, user } = useAuth();
  const { currentYear: year } = useYear();
  const [assigned, setAssigned] = useState([]);
  const [unassigned, setUnassigned] = useState([]);
  const [ctx, setCtx] = useState(VIDE);
  const [prop, setProp] = useState({ propositions: {}, precedentes: {}, anneePrecedente: null, avertissements: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const [onglet, setOnglet] = useState("assignes");
  const choisi = useRef(false);
  const [q, setQ] = useState("");
  const [fSection, setFSection] = useState("");
  const [fClasse, setFClasse] = useState("");
  const [fSalle, setFSalle] = useState("");
  const [fSexe, setFSexe] = useState("");

  const [profileId, setProfileId] = useState(null);
  const [retrait, setRetrait] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [selStudent, setSelStudent] = useState("");
  const [rechEleve, setRechEleve] = useState("");
  const [selSection, setSelSection] = useState("");
  const [selClass, setSelClass] = useState("");
  const [selRoom, setSelRoom] = useState("");
  const [saving, setSaving] = useState(false);
  const [coches, setCoches] = useState(new Set());
  const [cochesA, setCochesA] = useState(new Set());
  const [groupe, setGroupe] = useState(null);
  const [gSection, setGSection] = useState("");
  const [gClasse, setGClasse] = useState("");
  const [gSalle, setGSalle] = useState("");
  const [gSalles, setGSalles] = useState({});
  const [progres, setProgres] = useState(null);
  const [rapport, setRapport] = useState(null);
  const [erreurGroupe, setErreurGroupe] = useState("");
  const [retraitGroupe, setRetraitGroupe] = useState(null);

  const classById = useMemo(() => Object.fromEntries(ctx.classes.map((c) => [c.id, c])), [ctx]);
  const roomsDe = (classId) => ctx.rooms.filter((r) => r.class_uuid === classId);
  const classesDe = (sectionId) => ctx.classes.filter((c) => c.section_uuid === sectionId);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      if (!year) { setAssigned([]); setUnassigned([]); setLoading(false); return; }
      const supabase = getAuthedClient(token);

      const asg = await lireTout((a, b) => supabase.from("assignments").select("id, student_uuid, class_uuid, room_uuid").eq("academic_year_uuid", year.id).is("deleted_at", null).order("id").range(a, b));
      const students = await lireTout((a, b) => supabase.from("students").select("id, matricule, nom, prenom, sexe").eq("statut", "actif").is("deleted_at", null).order("id").range(a, b));

      const { data: secs, error: eS } = await supabase.from("sections").select("id, nom, deleted_at").eq("academic_year_uuid", year.id);
      if (eS) throw eS;
      const secIds = (secs || []).map((s) => s.id);
      const colonnes = "id, nom, section_uuid, deleted_at";
      const r1 = await supabase.from("classes").select(colonnes).eq("academic_year_uuid", year.id);
      const r2 = secIds.length ? await supabase.from("classes").select(colonnes).in("section_uuid", secIds) : { data: [] };
      if (r1.error) throw r1.error;
      const toutesClasses = new Map();
      for (const c of [...(r1.data || []), ...(r2.data || [])]) toutesClasses.set(c.id, c);
      const manquantes = [...new Set(asg.map((a) => a.class_uuid).filter((id) => id && !toutesClasses.has(id)))];
      if (manquantes.length) {
        const r3 = await supabase.from("classes").select(colonnes).in("id", manquantes);
        for (const c of r3.data || []) toutesClasses.set(c.id, c);
      }
      const idsClasses = [...toutesClasses.keys()];
      const { data: salles } = idsClasses.length ? await supabase.from("rooms").select("id, nom, class_uuid, deleted_at").in("class_uuid", idsClasses) : { data: [] };
      const toutesSalles = new Map((salles || []).map((r) => [r.id, r]));

      const sectionsActives = (secs || []).filter((s) => !s.deleted_at);
      const sectionsTriees = await trierSections(supabase, sectionsActives, year);
      const classesActives = [...toutesClasses.values()].filter((c) => !c.deleted_at);
      const classesTriees = await trierClasses(supabase, classesActives);
      const sallesActives = (salles || []).filter((r) => !r.deleted_at).sort((x, y) => String(x.nom || "").localeCompare(String(y.nom || ""), "fr", { numeric: true }));
      const nomSection = Object.fromEntries((secs || []).map((s) => [s.id, s.nom]));
      const rang = new Map(classesTriees.map((c, i) => [c.id, i]));

      const parEleve = new Map(students.map((s) => [s.id, s]));
      const lignes = [];
      for (const a of asg) {
        const st = parEleve.get(a.student_uuid);
        if (!st) continue;
        const cls = toutesClasses.get(a.class_uuid);
        const room = toutesSalles.get(a.room_uuid);
        lignes.push({
          assignment_id: a.id, student_id: a.student_uuid, matricule: st.matricule, nom: st.nom || "", prenom: st.prenom || "", sexe: st.sexe || "",
          classe_id: a.class_uuid, classe_nom: cls ? cls.nom : "-", section_id: cls ? cls.section_uuid : "", section_nom: cls ? (nomSection[cls.section_uuid] || "-") : "-",
          salle_id: a.room_uuid || "", salle_nom: room ? room.nom : "Salle 1"
        });
      }
      lignes.sort((x, y) => (rang.has(x.classe_id) ? rang.get(x.classe_id) : 99999) - (rang.has(y.classe_id) ? rang.get(y.classe_id) : 99999)
        || String(x.salle_nom).localeCompare(String(y.salle_nom), "fr", { numeric: true })
        || (x.nom + " " + x.prenom).localeCompare(y.nom + " " + y.prenom, "fr", { sensitivity: "base" }));

      // non assignes = eleves actifs sans assignation POUR CETTE ANNEE (les assignations des annees passees ne comptent pas)
      const dejaCetteAnnee = new Set(asg.map((a) => a.student_uuid));
      const aAssigner = students.filter((s) => !dejaCetteAnnee.has(s.id)).sort((x, y) => ((x.nom || "") + " " + (x.prenom || "")).localeCompare((y.nom || "") + " " + (y.prenom || ""), "fr", { sensitivity: "base" }));

      const proposees = await chargerPropositions(supabase, year, classesActives);
      setCtx({ sections: sectionsTriees, classes: classesTriees, rooms: sallesActives });
      setProp(proposees);
      setAssigned(lignes);
      setUnassigned(aAssigner);
      if (!choisi.current) setOnglet(lignes.length === 0 && aAssigner.length > 0 ? "a_assigner" : "assignes");
    } catch (e) {
      setError(e.message || "Erreur de chargement");
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [token, year]);

  const changerOnglet = (o) => { choisi.current = true; setOnglet(o); setFClasse(""); setFSalle(""); };
  const effacerFiltres = () => { setQ(""); setFSection(""); setFClasse(""); setFSalle(""); setFSexe(""); };
  const filtresActifs = !!(q || fSection || fClasse || fSalle || fSexe);
  // la selection ne vaut que pour ce qui est affiche : elle est videe quand on change de filtre ou d'onglet
  useEffect(() => { setCoches(new Set()); setCochesA(new Set()); }, [q, fSection, fClasse, fSalle, fSexe, onglet]);

  // ---------- listes filtrees ----------
  const rangClasse = useMemo(() => new Map(ctx.classes.map((c, i) => [c.id, i])), [ctx]);
  const assignesFiltres = useMemo(() => {
    const nq = norm(q);
    return assigned.filter((a) => {
      if (fSection && a.section_id !== fSection) return false;
      if (fClasse && a.classe_id !== fClasse) return false;
      if (fSalle && (a.salle_id || "__defaut__") !== fSalle) return false;
      if (fSexe && a.sexe !== fSexe) return false;
      if (nq && !norm(a.prenom + " " + a.nom + " " + a.nom + " " + a.prenom + " " + a.matricule).includes(nq)) return false;
      return true;
    });
  }, [assigned, q, fSection, fClasse, fSalle, fSexe]);

  const aAssignerFiltres = useMemo(() => {
    const nq = norm(q);
    const rangDe = (s) => { const p = prop.propositions[s.id]; return p && p.classe_id && rangClasse.has(p.classe_id) ? rangClasse.get(p.classe_id) : 99999; };
    return unassigned.filter((s) => {
      const p = prop.propositions[s.id];
      const cid = p && p.classe_id ? p.classe_id : "";
      if (fSection && !(p && p.section_id === fSection)) return false;
      if (fClasse === "__aucune__") { if (p) return false; } else if (fClasse && cid !== fClasse) return false;
      if (fSexe && s.sexe !== fSexe) return false;
      if (nq && !norm((s.prenom || "") + " " + (s.nom || "") + " " + (s.nom || "") + " " + (s.prenom || "") + " " + (s.matricule || "")).includes(nq)) return false;
      return true;
    }).sort((x, y) => rangDe(x) - rangDe(y));
  }, [unassigned, prop, q, fSection, fClasse, fSexe, rangClasse]);

  const optionsClasse = fSection ? classesDe(fSection) : ctx.classes;
  const sallesFiltre = useMemo(() => {
    if (!fClasse || fClasse === "__aucune__") return [];
    const liste = roomsDe(fClasse).map((r) => ({ id: r.id, nom: r.nom }));
    if (assigned.some((a) => a.classe_id === fClasse && !a.salle_id)) liste.push({ id: "__defaut__", nom: "Salle 1 (par défaut)" });
    return liste;
  }, [fClasse, ctx, assigned]);

  // ---------- fenetre d'assignation ----------
  const proposition = selStudent ? prop.propositions[selStudent] : null;
  const derniere = selStudent ? prop.precedentes[selStudent] : null;
  const appliquerProposition = (sid) => {
    const p = prop.propositions[sid];
    const c = p && p.classe_id ? classById[p.classe_id] : null;
    if (!c) return;
    setSelSection(c.section_uuid); setSelClass(c.id);
    const rs = roomsDe(c.id);
    setSelRoom(rs.length === 1 ? rs[0].id : "");
  };
  const choisirEleve = (sid) => { setSelStudent(sid); setError(""); if (sid) appliquerProposition(sid); };
  const openModal = (sid) => {
    setSelStudent(""); setRechEleve(""); setSelSection(""); setSelClass(""); setSelRoom(""); setError(""); setInfo("");
    setModalOpen(true);
    if (sid && typeof sid === "string") choisirEleve(sid);
  };
  const onSectionChange = (sectionId) => { setSelSection(sectionId); setSelClass(""); setSelRoom(""); };
  const onClassChange = (classId) => {
    setSelClass(classId); setSelRoom("");
    if (classId) { const rs = roomsDe(classId); if (rs.length === 1) setSelRoom(rs[0].id); }
  };

  const submit = async () => {
    setError("");
    if (!selStudent) { setError("Choisissez un élève"); return; }
    if (!selClass) { setError("Choisissez une classe"); return; }
    if (!selRoom && roomsDe(selClass).length > 0) { setError("Choisissez une salle"); return; }
    if (saving) return;
    setSaving(true);
    try {
      const supabase = getAuthedClient(token);
      const { error: e } = await supabase.from("assignments").insert({
        student_uuid: selStudent, class_uuid: selClass, room_uuid: selRoom || null, academic_year_uuid: year.id,
        date_assignation: new Date().toISOString(), modified_by: user.username
      });
      if (e) throw e;

      const { count: dejaFacture } = await supabase.from("client_factures").select("id", { count: "exact", head: true }).eq("student_uuid", selStudent).eq("academic_year_uuid", year.id);
      if (!dejaFacture) {
        await genererFacturesEleve(supabase, { studentId: selStudent, classUuid: selClass, academicYearId: year.id, nomUtilisateur: user.username, userUuid: user.id });
      }

      const st = unassigned.find((s) => s.id === selStudent);
      const cl = classById[selClass];
      setInfo((st ? (st.prenom || "") + " " + (st.nom || "") : "L'élève") + " est assigné(e) à " + (cl ? cl.nom : "la classe") + ".");
      setModalOpen(false);
      load();
    } catch (e) {
      const m = String((e && e.message) || "");
      if ((e && e.code === "23505") || m.indexOf("duplicate key") >= 0) setError("Cet élève est déjà assigné à cette classe pour cette année.");
      else setError(m || "Erreur");
    } finally { setSaving(false); }
  };

  const demanderRetrait = (a) => setRetrait({
    assignment_id: a.assignment_id, student_id: a.student_id, nom_complet: (a.prenom + " " + a.nom).trim(), matricule: a.matricule,
    class_id: a.classe_id, classe_nom: a.classe_nom, room_id: a.salle_id || null, salle_nom: a.salle_nom
  });

  // ---------- cases a cocher ----------
  const basculer = (set, setSet, id) => { const n = new Set(set); if (n.has(id)) n.delete(id); else n.add(id); setSet(n); };
  const toutBasculer = (ids, set, setSet) => setSet(ids.length > 0 && ids.every((i) => set.has(i)) ? new Set() : new Set(ids));
  const caseTout = (ids, set) => (el) => { if (el) el.indeterminate = ids.some((i) => set.has(i)) && !ids.every((i) => set.has(i)); };
  const elevesCoches = aAssignerFiltres.filter((s) => coches.has(s.id));
  const lignesCochees = assignesFiltres.filter((a) => cochesA.has(a.assignment_id));
  const nbAvecProposition = elevesCoches.filter((s) => { const p = prop.propositions[s.id]; return p && p.classe_id && classById[p.classe_id]; }).length;
  const nomE = (s) => ((s.prenom || "") + " " + (s.nom || "")).trim();

  // ---------- assignation groupee ----------
  const ouvrirGroupe = (mode) => {
    setGroupe({ mode, ids: elevesCoches.map((s) => s.id) });
    setGSection(""); setGClasse(""); setGSalle(""); setGSalles({}); setErreurGroupe(""); setProgres(null); setInfo(""); setRapport(null);
  };
  const construireGroupes = () => {
    if (!groupe) return { groupes: [], ignores: [], manque: false };
    const parId = new Map(unassigned.map((s) => [s.id, s]));
    const sel = groupe.ids.map((id) => parId.get(id)).filter(Boolean);
    let groupes = [];
    const ignores = [];
    if (groupe.mode === "proposee") {
      const m = new Map();
      for (const s of sel) {
        const p = prop.propositions[s.id];
        if (p && p.classe_id && classById[p.classe_id]) { if (!m.has(p.classe_id)) m.set(p.classe_id, []); m.get(p.classe_id).push(s); }
        else ignores.push(s);
      }
      groupes = [...m.entries()].sort((a, b) => (rangClasse.has(a[0]) ? rangClasse.get(a[0]) : 99999) - (rangClasse.has(b[0]) ? rangClasse.get(b[0]) : 99999)).map(([classId, eleves]) => ({ classId, eleves }));
    } else if (gClasse) groupes = [{ classId: gClasse, eleves: sel }];
    groupes = groupes.map((g) => {
      const rooms = roomsDe(g.classId);
      const choix = groupe.mode === "proposee" ? gSalles[g.classId] : gSalle;
      const roomId = rooms.length === 1 ? rooms[0].id : rooms.length > 1 ? (choix || "") : null;
      return { ...g, rooms, roomId, manque: rooms.length > 1 && !roomId };
    });
    return { groupes, ignores, manque: groupes.some((g) => g.manque) };
  };
  const messageErreur = (e) => {
    const m = String((e && e.message) || "");
    return (e && e.code === "23505") || m.indexOf("duplicate key") >= 0 ? "déjà assigné(e) à cette classe pour cette année" : (m || "erreur");
  };
  const executerGroupe = async () => {
    const { groupes, manque } = construireGroupes();
    if (groupes.length === 0) { setErreurGroupe(groupe.mode === "proposee" ? "Aucun des élèves sélectionnés n'a de classe proposée utilisable." : "Choisissez une classe."); return; }
    if (manque) { setErreurGroupe("Choisissez la salle pour chaque classe."); return; }
    if (saving) return;
    const plan = [];
    for (const g of groupes) for (const s of g.eleves) plan.push({ s, classId: g.classId, roomId: g.roomId });
    setSaving(true); setErreurGroupe(""); setProgres({ fait: 0, total: plan.length });
    const reussis = [], erreurs = [], sansFactures = [];
    try {
      const supabase = getAuthedClient(token);
      // eleves deja assignes entre-temps (autre poste) : on ne les assigne pas une 2e fois
      const deja = new Map();
      for (const lot of par(plan.map((x) => x.s.id), 50)) {
        const { data } = await supabase.from("assignments").select("student_uuid, class_uuid").eq("academic_year_uuid", year.id).is("deleted_at", null).in("student_uuid", lot);
        for (const a of data || []) deja.set(a.student_uuid, a.class_uuid);
      }
      let fait = 0;
      // un par un (la numerotation des factures depend du nombre deja cree)
      for (const x of plan) {
        const nom = nomE(x.s);
        try {
          if (deja.has(x.s.id)) { const c = classById[deja.get(x.s.id)]; throw new Error("déjà assigné(e) à " + (c ? c.nom : "une classe") + " cette année"); }
          const { error: e } = await supabase.from("assignments").insert({
            student_uuid: x.s.id, class_uuid: x.classId, room_uuid: x.roomId || null, academic_year_uuid: year.id,
            date_assignation: new Date().toISOString(), modified_by: user.username
          });
          if (e) throw e;
          reussis.push(nom);
          try {
            const { count: dejaFacture } = await supabase.from("client_factures").select("id", { count: "exact", head: true }).eq("student_uuid", x.s.id).eq("academic_year_uuid", year.id);
            if (!dejaFacture) await genererFacturesEleve(supabase, { studentId: x.s.id, classUuid: x.classId, academicYearId: year.id, nomUtilisateur: user.username, userUuid: user.id });
          } catch (e2) { sansFactures.push(nom); }
        } catch (e) { erreurs.push(nom + " : " + messageErreur(e)); }
        fait++; setProgres({ fait, total: plan.length });
      }
    } catch (e) { erreurs.push(messageErreur(e)); }
    setSaving(false); setProgres(null); setGroupe(null); setCoches(new Set());
    setRapport({ ok: reussis.length, erreurs, sansFactures });
    load();
  };
  const demanderRetraitGroupe = () => setRetraitGroupe(lignesCochees.map((a) => ({
    assignment_id: a.assignment_id, student_id: a.student_id, nom_complet: (a.prenom + " " + a.nom).trim(), matricule: a.matricule,
    class_id: a.classe_id, classe_nom: a.classe_nom, room_id: a.salle_id || null, salle_nom: a.salle_nom
  })));

  if (loading) return <div className="page"><p style={{ color: "var(--text-dim)" }}>Chargement...</p></div>;

  if (!year) {
    return <div className="page"><div className="page-header"><h1 className="page-title">Assignations</h1></div><div className="dash-placeholder"><p>Aucune ann&eacute;e acad&eacute;mique active.</p></div></div>;
  }

  const total = onglet === "assignes" ? assigned.length : unassigned.length;
  const affiches = onglet === "assignes" ? assignesFiltres.length : aAssignerFiltres.length;
  const optionsEleves = unassigned.filter((s) => s.id === selStudent || !rechEleve || norm((s.prenom || "") + " " + (s.nom || "") + " " + (s.nom || "") + " " + (s.prenom || "") + " " + (s.matricule || "")).includes(norm(rechEleve)));
  const different = !!(proposition && proposition.classe_id && selClass && selClass !== proposition.classe_id);

  return (
    <div className="page">
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 className="page-title">Assignations</h1>
          <p className="page-subtitle">Ann&eacute;e {year.nom} - {assigned.length} assign&eacute;(s), {unassigned.length} non assign&eacute;(s)</p>
        </div>
        <button className="btn-primary" onClick={() => openModal()}>+ Assigner un &eacute;l&egrave;ve</button>
      </div>

      {error && !modalOpen && <div className="login-error" style={{ maxWidth: "500px", marginBottom: "16px" }}>{error}</div>}
      {info && <div style={{ background: "#e6f4ea", color: "#1e6b34", padding: "10px 14px", borderRadius: "8px", marginBottom: "14px" }}>{info}</div>}
      {rapport && (
        <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderLeft: "4px solid " + (rapport.erreurs.length ? "var(--gold)" : "var(--ok)"), borderRadius: "8px", padding: "10px 14px", marginBottom: "14px", fontSize: "13px", color: "var(--text)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}>
            <strong>{rapport.ok} élève(s) assigné(s).</strong>
            <button type="button" className="btn-gray-cancel btn-sm" onClick={() => setRapport(null)}>Fermer</button>
          </div>
          {rapport.sansFactures.length > 0 && <div style={{ marginTop: "6px", color: "#92400e" }}>Assignés, mais les factures n&apos;ont pas pu être générées pour : {rapport.sansFactures.join(", ")}. Vérifiez-les dans Comptes clients.</div>}
          {rapport.erreurs.length > 0 && (
            <div style={{ marginTop: "6px", color: "#991b1b" }}>
              <strong>{rapport.erreurs.length} non assigné(s) :</strong>
              <ul style={{ margin: "4px 0 0 18px", padding: 0 }}>{rapport.erreurs.map((m, i) => <li key={i}>{m}</li>)}</ul>
            </div>
          )}
        </div>
      )}
      {prop.avertissements.length > 0 && (
        <div style={{ background: "#fffbeb", border: "1px solid #fde68a", color: "#92400e", padding: "8px 12px", borderRadius: "8px", marginBottom: "14px", fontSize: "12px" }}>
          Certaines informations n&apos;ont pas pu &ecirc;tre lues ({prop.avertissements.join(", ")}) : les classes propos&eacute;es peuvent &ecirc;tre incompl&egrave;tes.
        </div>
      )}

      <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "12px" }}>
        <button className={"btn-sm " + (onglet === "assignes" ? "btn-primary" : "btn-gray-cancel")} onClick={() => changerOnglet("assignes")}>Assign&eacute;s ({assigned.length})</button>
        <button className={"btn-sm " + (onglet === "a_assigner" ? "btn-primary" : "btn-gray-cancel")} onClick={() => changerOnglet("a_assigner")}>&Agrave; assigner ({unassigned.length})</button>
        {prop.anneePrecedente && onglet === "a_assigner" && <span style={{ fontSize: "12px", color: "var(--text-soft)", marginLeft: "6px" }}>Classe propos&eacute;e d&apos;apr&egrave;s l&apos;inscription et la d&eacute;cision de {prop.anneePrecedente.nom}</span>}
      </div>

      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center", marginBottom: "14px" }}>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher (nom, pr&eacute;nom, matricule)..." style={{ ...champ, flex: "1 1 220px", minWidth: "200px" }} />
        <select value={fSection} onChange={(e) => { setFSection(e.target.value); setFClasse(""); setFSalle(""); }} style={champ}>
          <option value="">Toutes les sections</option>
          {ctx.sections.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
        </select>
        <select value={fClasse} onChange={(e) => { setFClasse(e.target.value); setFSalle(""); }} style={champ}>
          <option value="">{onglet === "assignes" ? "Toutes les classes" : "Toutes les classes proposées"}</option>
          {optionsClasse.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
          {onglet === "a_assigner" && <option value="__aucune__">Sans classe propos&eacute;e</option>}
        </select>
        {onglet === "assignes" && (
          <select value={fSalle} onChange={(e) => setFSalle(e.target.value)} disabled={!fClasse || sallesFiltre.length === 0} style={champ}>
            <option value="">Toutes les salles</option>
            {sallesFiltre.map((r) => <option key={r.id} value={r.id}>{r.nom}</option>)}
          </select>
        )}
        <select value={fSexe} onChange={(e) => setFSexe(e.target.value)} style={champ}>
          <option value="">Tous les sexes</option>
          <option value="M">Masculin</option>
          <option value="F">F&eacute;minin</option>
        </select>
        {filtresActifs && <button className="btn-gray-cancel btn-sm" onClick={effacerFiltres}>Effacer les filtres</button>}
        <span style={{ marginLeft: "auto", fontSize: "13px", color: "var(--text-soft)" }}>{affiches} sur {total}</span>
      </div>

      {onglet === "assignes" && lignesCochees.length > 0 && (
        <div style={barre}>
          <strong>{lignesCochees.length} élève(s) sélectionné(s)</strong>
          <button className="btn-sm btn-red" onClick={demanderRetraitGroupe}>Retirer la sélection ({lignesCochees.length})</button>
          <button className="btn-gray-cancel btn-sm" onClick={() => setCochesA(new Set())}>Tout décocher</button>
        </div>
      )}
      {onglet === "assignes" && (
        <div className="table-card">
          <table className="data-table">
            <thead><tr><th style={{ width: "34px" }}><input type="checkbox" title="Tout cocher / décocher (selon les filtres)" ref={caseTout(assignesFiltres.map((a) => a.assignment_id), cochesA)} checked={assignesFiltres.length > 0 && assignesFiltres.every((a) => cochesA.has(a.assignment_id))} onChange={() => toutBasculer(assignesFiltres.map((a) => a.assignment_id), cochesA, setCochesA)} /></th><th>Matricule</th><th>&Eacute;l&egrave;ve</th><th>Sexe</th><th>Section</th><th>Classe</th><th>Salle</th><th>Actions</th></tr></thead>
            <tbody>
              {assigned.length === 0 && <tr><td colSpan="8" className="table-empty">Aucun &eacute;l&egrave;ve assign&eacute; pour cette ann&eacute;e.</td></tr>}
              {assigned.length > 0 && assignesFiltres.length === 0 && <tr><td colSpan="8" className="table-empty">Aucun &eacute;l&egrave;ve ne correspond &agrave; ces filtres.</td></tr>}
              {assignesFiltres.map((a) => (
                <tr key={a.assignment_id} onClick={() => setProfileId(a.student_id)} style={{ cursor: "pointer" }}>
                  <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={cochesA.has(a.assignment_id)} onChange={() => basculer(cochesA, setCochesA, a.assignment_id)} /></td>
                  <td><strong>{a.matricule}</strong></td>
                  <td>{a.prenom} {a.nom}</td>
                  <td>{a.sexe}</td>
                  <td>{a.section_nom}</td>
                  <td>{a.classe_nom}</td>
                  <td><span className="badge badge-blue">{a.salle_nom}</span></td>
                  <td><button className="btn-sm btn-red" onClick={(e) => { e.stopPropagation(); demanderRetrait(a); }}>Retirer</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {onglet === "a_assigner" && elevesCoches.length > 0 && (
        <div style={barre}>
          <strong>{elevesCoches.length} élève(s) sélectionné(s)</strong>
          <button className="btn-sm btn-green" disabled={nbAvecProposition === 0} onClick={() => ouvrirGroupe("proposee")}>Assigner à leur classe proposée ({nbAvecProposition})</button>
          <button className="btn-sm btn-primary" onClick={() => ouvrirGroupe("choisie")}>Assigner à une classe...</button>
          <button className="btn-gray-cancel btn-sm" onClick={() => setCoches(new Set())}>Tout décocher</button>
        </div>
      )}
      {onglet === "a_assigner" && (
        <div className="table-card">
          <table className="data-table">
            <thead><tr><th style={{ width: "34px" }}><input type="checkbox" title="Tout cocher / décocher (selon les filtres)" ref={caseTout(aAssignerFiltres.map((s) => s.id), coches)} checked={aAssignerFiltres.length > 0 && aAssignerFiltres.every((s) => coches.has(s.id))} onChange={() => toutBasculer(aAssignerFiltres.map((s) => s.id), coches, setCoches)} /></th><th>Matricule</th><th>&Eacute;l&egrave;ve</th><th>Sexe</th><th>Classe propos&eacute;e</th><th>Derni&egrave;re classe connue</th><th>Actions</th></tr></thead>
            <tbody>
              {unassigned.length === 0 && <tr><td colSpan="7" className="table-empty">Tous les &eacute;l&egrave;ves actifs sont d&eacute;j&agrave; assign&eacute;s pour cette ann&eacute;e.</td></tr>}
              {unassigned.length > 0 && aAssignerFiltres.length === 0 && <tr><td colSpan="7" className="table-empty">Aucun &eacute;l&egrave;ve ne correspond &agrave; ces filtres.</td></tr>}
              {aAssignerFiltres.map((s) => {
                const p = prop.propositions[s.id];
                const pr = prop.precedentes[s.id];
                return (
                  <tr key={s.id} onClick={() => setProfileId(s.id)} style={{ cursor: "pointer" }}>
                    <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={coches.has(s.id)} onChange={() => basculer(coches, setCoches, s.id)} /></td>
                    <td><strong>{s.matricule}</strong></td>
                    <td>{s.prenom} {s.nom}</td>
                    <td>{s.sexe || ""}</td>
                    <td>
                      {p ? (
                        <div>
                          <span className={"badge " + (p.introuvable ? "badge-gold" : "badge-ok")}>{p.classe_nom}</span>
                          <div style={{ fontSize: "11px", color: "var(--text-soft)", marginTop: "3px" }}>
                            {libelleOrigine(p.origine)}{p.introuvable ? " - cette classe n'existe pas encore pour " + year.nom : ""}
                          </div>
                        </div>
                      ) : <span style={{ color: "var(--text-soft)" }}>&mdash;</span>}
                    </td>
                    <td style={{ fontSize: "12px", color: "var(--text-dim)" }}>
                      {pr && pr.classe ? (
                        <div>{pr.classe} ({pr.annee})<div style={{ fontSize: "11px", color: "var(--text-soft)" }}>{LIBELLE_DECISION[pr.decision || ""]}{pr.note ? " - " + pr.note : ""}</div></div>
                      ) : <span style={{ color: "var(--text-soft)" }}>&mdash;</span>}
                    </td>
                    <td><button className="btn-sm btn-green" onClick={(e) => { e.stopPropagation(); openModal(s.id); }}>Assigner</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h3>Assigner un &eacute;l&egrave;ve</h3><button className="modal-close" onClick={() => setModalOpen(false)}>x</button></div>
            {error && <div className="login-error" style={{ marginBottom: "16px" }}>{error}</div>}

            <div className="form-group" style={{ marginBottom: "14px" }}>
              <label>&Eacute;l&egrave;ve (non assign&eacute;s cette ann&eacute;e) *</label>
              {unassigned.length > 8 && <input type="search" value={rechEleve} onChange={(e) => setRechEleve(e.target.value)} placeholder="Rechercher un élève..." style={{ marginBottom: "6px" }} />}
              <select value={selStudent} onChange={(e) => choisirEleve(e.target.value)}>
                <option value="">-- Choisir un &eacute;l&egrave;ve --</option>
                {optionsEleves.map((s) => {
                  const p = prop.propositions[s.id];
                  return <option key={s.id} value={s.id}>{s.matricule} - {s.prenom} {s.nom}{p ? "  →  " + p.classe_nom : ""}</option>;
                })}
              </select>
              {unassigned.length === 0 && (
                <p style={{ fontSize: "12px", color: "var(--text-soft)", marginTop: "6px" }}>
                  Tous les &eacute;l&egrave;ves sont d&eacute;ja assign&eacute;s. Cr&eacute;ez de nouveaux &eacute;l&egrave;ves ou retirez une assignation.
                </p>
              )}
            </div>

            {selStudent && proposition && (
              <div style={{ background: proposition.introuvable ? "#fffbeb" : "#ecfdf5", border: "1px solid " + (proposition.introuvable ? "#fde68a" : "#a7f3d0"), borderRadius: "10px", padding: "10px 14px", marginBottom: "14px", fontSize: "13px", color: proposition.introuvable ? "#92400e" : "#065f46" }}>
                <div><strong>Classe propos&eacute;e : {proposition.classe_nom}</strong>{proposition.introuvable ? " (cette classe n'existe pas encore pour " + year.nom + ")" : ""}</div>
                <div style={{ fontSize: "12px", marginTop: "3px" }}>{proposition.detail}</div>
                {!proposition.introuvable && selClass !== proposition.classe_id && (
                  <button type="button" className="btn-sm btn-green" style={{ marginTop: "8px" }} onClick={() => appliquerProposition(selStudent)}>Utiliser cette classe</button>
                )}
              </div>
            )}
            {selStudent && !proposition && (
              <div style={{ background: "var(--bg-soft)", border: "1px solid var(--line)", borderRadius: "10px", padding: "10px 14px", marginBottom: "14px", fontSize: "12px", color: "var(--text-dim)" }}>
                Aucune classe propos&eacute;e pour cet &eacute;l&egrave;ve.
                {derniere && derniere.classe ? " Dernière classe connue : " + derniere.classe + " (" + derniere.annee + ")" + (derniere.decision ? ", " + LIBELLE_DECISION[derniere.decision].toLowerCase() : ", décision non précisée") + "." : ""}
              </div>
            )}

            <div className="form-row">
              <div className="form-group">
                <label>Section *</label>
                <select value={selSection} onChange={(e) => onSectionChange(e.target.value)}>
                  <option value="">-- Choisir --</option>
                  {ctx.sections.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Classe *</label>
                <select value={selClass} onChange={(e) => onClassChange(e.target.value)} disabled={!selSection}>
                  <option value="">-- Choisir --</option>
                  {classesDe(selSection).map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>{roomsDe(selClass).length > 0 ? "Salle *" : "Salle 1 (par defaut)"}</label>
                <select value={selRoom} onChange={(e) => setSelRoom(e.target.value)} disabled={!selClass}>
                  <option value="">-- Choisir --</option>
                  {roomsDe(selClass).map((r) => <option key={r.id} value={r.id}>{r.nom}</option>)}
                </select>
              </div>
            </div>
            {different && (
              <p style={{ fontSize: "12px", color: "#92400e", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "8px", padding: "7px 10px", margin: "0 0 4px" }}>
                Cette classe est diff&eacute;rente de la classe propos&eacute;e ({proposition.classe_nom}).
              </p>
            )}

            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "20px" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setModalOpen(false)}>Annuler</button>
              <button className="btn-primary" onClick={submit} disabled={saving}>{saving ? "Assignation..." : "Assigner"}</button>
            </div>
          </div>
        </div>
      )}
      {groupe && (() => {
        const { groupes, ignores, manque } = construireGroupes();
        const nbOk = groupes.reduce((n, g) => n + g.eleves.length, 0);
        const autresProp = groupe.mode === "choisie" && gClasse
          ? groupes.reduce((n, g) => n + g.eleves.filter((s) => { const p = prop.propositions[s.id]; return p && p.classe_id && p.classe_id !== g.classId; }).length, 0) : 0;
        return (
          <div className="modal-overlay" onClick={saving ? undefined : () => setGroupe(null)}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "580px", maxHeight: "88vh", overflowY: "auto" }}>
              <div className="modal-header"><h3>Assigner {groupe.ids.length} &eacute;l&egrave;ve(s)</h3><button className="modal-close" disabled={saving} onClick={() => setGroupe(null)}>x</button></div>
              {erreurGroupe && <div className="login-error" style={{ marginBottom: "14px" }}>{erreurGroupe}</div>}
              {groupe.mode === "proposee" && <p style={{ fontSize: "12px", color: "var(--text-dim)", margin: "0 0 12px" }}>Chaque &eacute;l&egrave;ve est assign&eacute; &agrave; sa classe propos&eacute;e pour {year.nom}.</p>}
              {groupe.mode === "choisie" && (
                <div className="form-row" style={{ marginBottom: "12px" }}>
                  <div className="form-group">
                    <label>Section *</label>
                    <select value={gSection} onChange={(e) => { setGSection(e.target.value); setGClasse(""); setGSalle(""); }}>
                      <option value="">-- Choisir --</option>
                      {ctx.sections.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Classe *</label>
                    <select value={gClasse} onChange={(e) => { setGClasse(e.target.value); setGSalle(""); }} disabled={!gSection}>
                      <option value="">-- Choisir --</option>
                      {classesDe(gSection).map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
                    </select>
                  </div>
                </div>
              )}
              {groupes.map((g) => (
                <div key={g.classId} style={{ border: "1px solid var(--line)", borderRadius: "10px", padding: "10px 14px", marginBottom: "10px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center" }}>
                    <strong>{classById[g.classId].nom}</strong>
                    <span className="badge badge-ok">{g.eleves.length} &eacute;l&egrave;ve(s)</span>
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--text-dim)", margin: "4px 0 8px", maxHeight: "72px", overflowY: "auto" }}>{g.eleves.map(nomE).join(", ")}</div>
                  {g.rooms.length > 1 ? (
                    <select value={(groupe.mode === "proposee" ? gSalles[g.classId] : gSalle) || ""} style={champ}
                      onChange={(e) => (groupe.mode === "proposee" ? setGSalles({ ...gSalles, [g.classId]: e.target.value }) : setGSalle(e.target.value))}>
                      <option value="">-- Salle * --</option>
                      {g.rooms.map((r) => <option key={r.id} value={r.id}>Salle {r.nom}</option>)}
                    </select>
                  ) : <span style={{ fontSize: "12px", color: "var(--text-soft)" }}>{g.rooms.length === 1 ? "Salle : " + g.rooms[0].nom : "Salle 1 (par d\u00e9faut)"}</span>}
                </div>
              ))}
              {ignores.length > 0 && (
                <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "10px", padding: "10px 14px", marginBottom: "10px", fontSize: "12px", color: "#92400e" }}>
                  <strong>{ignores.length} &eacute;l&egrave;ve(s) ne seront pas assign&eacute;s</strong> (aucune classe propos&eacute;e utilisable) : {ignores.map(nomE).join(", ")}.
                </div>
              )}
              {autresProp > 0 && (
                <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "10px", padding: "10px 14px", marginBottom: "10px", fontSize: "12px", color: "#92400e" }}>
                  {autresProp} &eacute;l&egrave;ve(s) ont une autre classe propos&eacute;e que celle choisie.
                </div>
              )}
              <p style={{ fontSize: "11px", color: "var(--text-soft)", margin: "6px 0 0" }}>Les factures de la classe sont g&eacute;n&eacute;r&eacute;es pour chaque &eacute;l&egrave;ve, comme &agrave; l&apos;assignation individuelle.</p>
              {progres && <p style={{ fontSize: "13px", color: "var(--text)", margin: "10px 0 0" }}>Assignation en cours : {progres.fait} / {progres.total}...</p>}
              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "18px" }}>
                <button className="btn-gray-cancel btn-sm" disabled={saving} onClick={() => setGroupe(null)}>Annuler</button>
                <button className="btn-primary" onClick={executerGroupe} disabled={saving || nbOk === 0 || manque}>{saving ? "Assignation..." : "Assigner " + nbOk + " \u00e9l\u00e8ve(s)"}</button>
              </div>
            </div>
          </div>
        );
      })()}
      {retraitGroupe && (
        <RetraitAssignation
          cibles={retraitGroupe} anneeId={year.id} anneeNom={year.nom}
          onClose={() => setRetraitGroupe(null)}
          onDone={(l, r) => {
            setRetraitGroupe(null); setCochesA(new Set()); setRapport(null);
            const n = r && typeof r.retires === "number" ? r.retires : l.length;
            setInfo(n + " élève(s) retiré(s) de leur classe." + (n < l.length ? " (" + (l.length - n) + " n'étaient déjà plus assigné(s).)" : ""));
            load();
          }}
        />
      )}
      {retrait && (
        <RetraitAssignation
          cible={retrait} anneeId={year.id} anneeNom={year.nom}
          onClose={() => setRetrait(null)}
          onDone={(c, r) => { setRetrait(null); setInfo(c.nom_complet + (r && r.dejaRetire ? " n'était déjà plus assigné(e)." : " a été retiré(e) de " + (c.classe_nom || "sa classe") + ".")); load(); }}
        />
      )}
      {profileId && <StudentProfile studentId={profileId} onClose={() => setProfileId(null)} />}
    </div>
  );
}
