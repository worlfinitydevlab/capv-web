import React, { useState, useEffect } from "react";
import { useAuth } from "../AuthContext.jsx";
import { getAuthedClient, EDGE_FUNCTION_URL, SUPABASE_ANON_KEY } from "../supabaseClient.js";
import { useYear } from "../YearContext.jsx";

function computeParticipants(program, targets, programStudents, assignments, classes, students, year) {
  const ids = new Set();
  if (program.cible_type === "etablissement") {
    assignments.filter((a) => a.academic_year_uuid === (program.academic_year_uuid || year.id)).forEach((a) => ids.add(a.student_uuid));
  } else if (program.cible_type === "liste") {
    programStudents.filter((ps) => ps.program_uuid === program.id).forEach((ps) => ids.add(ps.student_uuid));
  } else {
    const progTargets = targets.filter((t) => t.program_uuid === program.id);
    const yr = program.academic_year_uuid || year.id;
    for (const t of progTargets) {
      if (t.target_type === "classe") {
        assignments.filter((a) => a.class_uuid === t.target_uuid && a.academic_year_uuid === yr).forEach((a) => ids.add(a.student_uuid));
      } else if (t.target_type === "salle") {
        assignments.filter((a) => a.room_uuid === t.target_uuid && a.academic_year_uuid === yr).forEach((a) => ids.add(a.student_uuid));
      } else if (t.target_type === "section") {
        const classIds = classes.filter((c) => c.section_uuid === t.target_uuid).map((c) => c.id);
        assignments.filter((a) => classIds.includes(a.class_uuid) && a.academic_year_uuid === yr).forEach((a) => ids.add(a.student_uuid));
      }
    }
  }
  return [...ids].map((id) => students.find((s) => s.id === id)).filter(Boolean);
}

const EMPTY_FORM = { nom: "", description: "", responsable: "", date_evenement: "", inscription_debut: "", inscription_fin: "", cout: "", monnaie: "HTG", max_participants: "", date_limite_paiement: "", cible_type: "etablissement" };

export default function Programs() {
  const { token, user } = useAuth();
  const { currentYear: year } = useYear();
  const [programs, setPrograms] = useState([]);
  const [targets, setTargets] = useState([]);
  const [programStudents, setProgramStudents] = useState([]);
  const [payments, setPayments] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [classes, setClasses] = useState([]);
  const [sections, setSections] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const [view, setView] = useState("list");
  const [selProgram, setSelProgram] = useState(null);
  const [detailTab, setDetailTab] = useState("dashboard");
  const [detailFilter, setDetailFilter] = useState("tous");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingProgram, setEditingProgram] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [selTargets, setSelTargets] = useState([]);
  const [filterSection, setFilterSection] = useState("");
  const [classesForFilter, setClassesForFilter] = useState([]);
  const [filterClasse, setFilterClasse] = useState("");
  const [roomsForFilter, setRoomsForFilter] = useState([]);
  const [studentSearch, setStudentSearch] = useState("");
  const [selStudents, setSelStudents] = useState([]);

  const [editConfirmOpen, setEditConfirmOpen] = useState(false);
  const [editPassword, setEditPassword] = useState("");
  const [editError, setEditError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const supabase = getAuthedClient(token);
      const { data: progs } = await supabase.from("programs").select("*").order("created_at", { ascending: false });
      setPrograms(progs || []);
      const { data: tgts } = await supabase.from("program_targets").select("*");
      setTargets(tgts || []);
      const { data: ps } = await supabase.from("program_students").select("*");
      setProgramStudents(ps || []);
      const { data: pays } = await supabase.from("program_payments").select("*").eq("statut", "valide");
      setPayments(pays || []);
      const { data: asg } = await supabase.from("assignments").select("*");
      setAssignments(asg || []);
      const { data: cls } = await supabase.from("classes").select("*");
      setClasses(cls || []);
      const { data: secs } = await supabase.from("sections").select("*");
      setSections(secs || []);
      const { data: rms } = await supabase.from("rooms").select("*");
      setRooms(rms || []);
      const { data: sts } = await supabase.from("students").select("id, matricule, nom, prenom");
      setStudents(sts || []);
    } catch (e) {
      setError(e.message || "Erreur de chargement");
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [token]);

  const fmt = (n) => Number(n || 0).toLocaleString();

  const programStats = (p) => {
    if (!year) return { nb: 0, payeurs: 0, encaisse: 0 };
    const parts = computeParticipants(p, targets, programStudents, assignments, classes, students, year);
    const progPayments = payments.filter((pay) => pay.program_uuid === p.id);
    let payeurs = 0, encaisse = 0;
    for (const s of parts) {
      const paye = progPayments.filter((pay) => pay.student_uuid === s.id).reduce((sum, pay) => sum + Number(pay.montant), 0);
      encaisse += paye;
      if (paye > 0) payeurs++;
    }
    return { nb: parts.length, payeurs, encaisse };
  };

  const filteredPrograms = programs.filter((p) => !search || p.nom.toLowerCase().includes(search.toLowerCase()));

  const resetTargetPickers = () => { setFilterSection(""); setClassesForFilter([]); setFilterClasse(""); setRoomsForFilter([]); };

  const openNew = () => {
    setEditingProgram(null);
    setForm({ ...EMPTY_FORM, responsable: user.nom_complet || user.username });
    setSelTargets([]); setSelStudents([]); setStudentSearch(""); resetTargetPickers(); setError(""); setModalOpen(true);
  };
  const labelForTarget = (type, id) => {
    if (type === "section") { const s = sections.find((x) => x.id === id); return s ? s.nom : "?"; }
    if (type === "classe") { const c = classes.find((x) => x.id === id); return c ? c.nom : "?"; }
    if (type === "salle") { const r = rooms.find((x) => x.id === id); return r ? r.nom : "?"; }
    return "?";
  };
  const openEdit = (p) => {
    setEditingProgram(p);
    setForm({ nom: p.nom, description: p.description || "", responsable: p.responsable || "", date_evenement: p.date_evenement || "", inscription_debut: p.inscription_debut || "", inscription_fin: p.inscription_fin || "", cout: p.cout || "", monnaie: p.monnaie || "HTG", max_participants: p.max_participants || "", date_limite_paiement: p.date_limite_paiement || "", cible_type: p.cible_type || "etablissement" });
    setSelTargets(targets.filter((t) => t.program_uuid === p.id).map((t) => ({ type: t.target_type, id: t.target_uuid, label: labelForTarget(t.target_type, t.target_uuid) })));
    setSelStudents(programStudents.filter((ps) => ps.program_uuid === p.id).map((ps) => { const s = students.find((x) => x.id === ps.student_uuid); return s ? { id: s.id, label: s.prenom + " " + s.nom + " (" + s.matricule + ")" } : null; }).filter(Boolean));
    resetTargetPickers(); setStudentSearch(""); setError(""); setModalOpen(true);
  };
  const setField = (k, v) => setForm({ ...form, [k]: v });

  const addTarget = (type, id) => {
    if (!id) return;
    if (selTargets.find((t) => t.type === type && t.id === id)) return;
    setSelTargets([...selTargets, { type, id, label: labelForTarget(type, id) }]);
  };
  const removeTarget = (type, id) => setSelTargets(selTargets.filter((t) => !(t.type === type && t.id === id)));

  const onFilterSection = (sectionId) => {
    setFilterSection(sectionId); setFilterClasse(""); setRoomsForFilter([]);
    setClassesForFilter(sectionId ? classes.filter((c) => c.section_uuid === sectionId) : []);
  };
  const onFilterClasse = (classId) => {
    setFilterClasse(classId);
    setRoomsForFilter(classId ? rooms.filter((r) => r.class_uuid === classId) : []);
  };

  const studentResults = studentSearch
    ? students.filter((s) => (s.nom + " " + s.prenom + " " + s.matricule).toLowerCase().includes(studentSearch.toLowerCase())).slice(0, 8)
    : [];
  const addStudent = (s) => {
    if (selStudents.find((x) => x.id === s.id)) return;
    setSelStudents([...selStudents, { id: s.id, label: s.prenom + " " + s.nom + " (" + s.matricule + ")" }]);
    setStudentSearch("");
  };
  const removeStudent = (id) => setSelStudents(selStudents.filter((s) => s.id !== id));

  const buildPayload = () => ({
    nom: form.nom, description: form.description || null, responsable: form.responsable || null,
    date_evenement: form.date_evenement || null, inscription_debut: form.inscription_debut || null, inscription_fin: form.inscription_fin || null,
    cout: Number(form.cout) || 0, monnaie: form.monnaie, max_participants: form.max_participants ? Number(form.max_participants) : null,
    date_limite_paiement: form.date_limite_paiement || null, cible_type: form.cible_type,
    academic_year_uuid: year ? year.id : null, modified_by: user.username
  });

  const saveTargetsAndStudents = async (supabase, progId) => {
    await supabase.from("program_targets").delete().eq("program_uuid", progId);
    await supabase.from("program_students").delete().eq("program_uuid", progId);
    if (["section", "classe", "salle"].includes(form.cible_type)) {
      for (const t of selTargets) {
        await supabase.from("program_targets").insert({ program_uuid: progId, target_type: t.type, target_uuid: t.id, modified_by: user.username });
      }
    }
    if (form.cible_type === "liste") {
      for (const s of selStudents) {
        await supabase.from("program_students").insert({ program_uuid: progId, student_uuid: s.id, modified_by: user.username });
      }
    }
  };

  const requestSubmit = () => {
    setError("");
    if (!form.nom.trim()) { setError("Le nom est requis"); return; }
    if (editingProgram) {
      setEditPassword(""); setEditError(""); setEditConfirmOpen(true);
    } else {
      doCreate();
    }
  };

  const doCreate = async () => {
    try {
      const supabase = getAuthedClient(token);
      const { data: prog, error: e } = await supabase.from("programs").insert({ ...buildPayload(), actif: 1 }).select().single();
      if (e) throw e;
      await saveTargetsAndStudents(supabase, prog.id);
      setModalOpen(false);
      load();
    } catch (e) { setError(e.message || "Erreur"); }
  };

  const submitEdit = async () => {
    setEditError("");
    if (!editPassword) { setEditError("Entrez votre mot de passe."); return; }
    try {
      const r = await fetch(EDGE_FUNCTION_URL, {
        method: "POST",
        headers: { "apikey": SUPABASE_ANON_KEY, "Authorization": "Bearer " + SUPABASE_ANON_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ username: user.username, password: editPassword })
      });
      const d = await r.json();
      if (!r.ok) { setEditError(d.error || "Mot de passe incorrect"); return; }

      const supabase = getAuthedClient(token);
      const { error: e } = await supabase.from("programs").update(buildPayload()).eq("id", editingProgram.id);
      if (e) throw e;
      await saveTargetsAndStudents(supabase, editingProgram.id);
      setEditConfirmOpen(false);
      setModalOpen(false);
      load();
    } catch (e) { setEditError(e.message || "Erreur"); }
  };

  const toggleActive = async (p) => {
    try {
      const supabase = getAuthedClient(token);
      const { error: e } = await supabase.from("programs").update({ actif: p.actif ? 0 : 1, modified_by: user.username }).eq("id", p.id);
      if (e) throw e;
      load();
    } catch (e) { setError(e.message || "Erreur"); }
  };

  const openDetail = (p) => { setSelProgram(p); setDetailTab("dashboard"); setDetailFilter("tous"); setView("detail"); };
  const backToList = () => { setView("list"); setSelProgram(null); load(); };

  const statutBadge = (s) => {
    if (s === "complet") return <span className="badge badge-ok">Paye</span>;
    if (s === "partiel") return <span className="badge badge-gold">Partiel</span>;
    return <span className="badge badge-gray">Aucun</span>;
  };

  if (loading) return <div className="page"><p style={{ color: "var(--text-dim)" }}>Chargement...</p></div>;

  if (view === "detail" && selProgram) {
    const participants = year ? computeParticipants(selProgram, targets, programStudents, assignments, classes, students, year) : [];
    const progPayments = payments.filter((p) => p.program_uuid === selProgram.id).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const enriched = participants.map((s) => {
      const paye = progPayments.filter((p) => p.student_uuid === s.id).reduce((sum, p) => sum + Number(p.montant), 0);
      let statut = "aucun";
      if (paye >= selProgram.cout && selProgram.cout > 0) statut = "complet";
      else if (paye > 0) statut = "partiel";
      return { ...s, paye, restant: Math.max(0, selProgram.cout - paye), statut };
    });
    const complets = enriched.filter((e) => e.statut === "complet").length;
    const partiels = enriched.filter((e) => e.statut === "partiel").length;
    const aucun = enriched.filter((e) => e.statut === "aucun").length;
    const encaisse = enriched.reduce((s, e) => s + e.paye, 0);
    const attendu = enriched.length * selProgram.cout;
    const nbInscrits = complets + partiels;
    const tauxParticipation = enriched.length > 0 ? Math.round((nbInscrits / enriched.length) * 100) : 0;
    const filteredParticipants = enriched.filter((e) => detailFilter === "tous" ? true : e.statut === detailFilter);
    const paymentsWithNames = progPayments.map((p) => { const s = students.find((x) => x.id === p.student_uuid); return { ...p, prenom: s ? s.prenom : "?", nom: s ? s.nom : "?" }; });

    return (
      <div className="page">
        <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1 className="page-title">{selProgram.nom}</h1>
            <p className="page-subtitle">{selProgram.date_evenement || "Date non definie"} - {fmt(selProgram.cout)} {selProgram.monnaie}</p>
          </div>
          <button className="btn-gray-cancel btn-sm" onClick={backToList}>Retour</button>
        </div>

        <div className="store-tabs">
          <button className={"store-tab" + (detailTab === "dashboard" ? " active" : "")} onClick={() => setDetailTab("dashboard")}>Tableau de bord</button>
          <button className={"store-tab" + (detailTab === "participants" ? " active" : "")} onClick={() => setDetailTab("participants")}>Participants</button>
          <button className={"store-tab" + (detailTab === "paiements" ? " active" : "")} onClick={() => setDetailTab("paiements")}>Paiements</button>
        </div>

        {detailTab === "dashboard" && (
          <>
            <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
              <div className="kpi-card"><div className="kpi-label">Eleves concernes</div><div className="kpi-value">{enriched.length}</div></div>
              <div className="kpi-card"><div className="kpi-label">Inscrits (ont paye)</div><div className="kpi-value">{nbInscrits}</div></div>
              <div className="kpi-card"><div className="kpi-label">Taux participation</div><div className="kpi-value" style={{ color: "var(--gold)" }}>{tauxParticipation}%</div></div>
              <div className="kpi-card"><div className="kpi-label">Encaisse</div><div className="kpi-value" style={{ color: "var(--ok)" }}>{fmt(encaisse)} {selProgram.monnaie}</div></div>
            </div>
            <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
              <div className="kpi-card"><div className="kpi-label">Paiements complets</div><div className="kpi-value" style={{ color: "var(--ok)" }}>{complets}</div></div>
              <div className="kpi-card"><div className="kpi-label">Paiements partiels</div><div className="kpi-value" style={{ color: "var(--gold)" }}>{partiels}</div></div>
              <div className="kpi-card"><div className="kpi-label">Sans paiement</div><div className="kpi-value" style={{ color: "var(--err)" }}>{aucun}</div></div>
              <div className="kpi-card"><div className="kpi-label">Montant attendu</div><div className="kpi-value">{fmt(attendu)} {selProgram.monnaie}</div></div>
            </div>
            {selProgram.description && <div className="form-card"><h3 className="form-card-title">Description</h3><p style={{ color: "var(--text-dim)" }}>{selProgram.description}</p>{selProgram.responsable && <p style={{ marginTop: "8px", fontSize: "13px" }}>Responsable : <strong>{selProgram.responsable}</strong></p>}</div>}
          </>
        )}

        {detailTab === "participants" && (
          <>
            <div className="store-tabs" style={{ marginBottom: "18px" }}>
              {["tous", "complet", "partiel", "aucun"].map((f) => (
                <button key={f} className={"store-tab" + (detailFilter === f ? " active" : "")} onClick={() => setDetailFilter(f)}>
                  {f === "tous" ? "Tous" : f === "complet" ? "Payes" : f === "partiel" ? "Partiels" : "Aucun paiement"}
                </button>
              ))}
            </div>
            <div className="table-card">
              <table className="data-table">
                <thead><tr><th>Matricule</th><th>Eleve</th><th>Paye</th><th>Restant</th><th>Statut</th></tr></thead>
                <tbody>
                  {filteredParticipants.length === 0 && <tr><td colSpan="5" className="table-empty">Aucun eleve.</td></tr>}
                  {filteredParticipants.map((s) => (
                    <tr key={s.id}>
                      <td><strong>{s.matricule}</strong></td>
                      <td>{s.prenom} {s.nom}</td>
                      <td style={{ color: "var(--ok)" }}>{fmt(s.paye)} {selProgram.monnaie}</td>
                      <td style={{ color: s.restant > 0 ? "var(--err)" : "var(--ok)", fontWeight: 700 }}>{fmt(s.restant)} {selProgram.monnaie}</td>
                      <td>{statutBadge(s.statut)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ fontSize: "12px", color: "var(--text-dim)", marginTop: "12px" }}>Consultation seule - l'encaissement se fait depuis le poste local (.exe).</p>
          </>
        )}

        {detailTab === "paiements" && (
          <div className="table-card">
            <table className="data-table">
              <thead><tr><th>Recu</th><th>Date</th><th>Eleve</th><th>Montant</th></tr></thead>
              <tbody>
                {paymentsWithNames.length === 0 && <tr><td colSpan="4" className="table-empty">Aucun paiement.</td></tr>}
                {paymentsWithNames.map((p) => (
                  <tr key={p.id}>
                    <td><strong style={{ color: "var(--accent)" }}>{p.receipt_number}</strong></td>
                    <td>{new Date(p.created_at).toLocaleDateString()}</td>
                    <td>{p.prenom} {p.nom}</td>
                    <td><strong>{fmt(p.montant)} {p.monnaie}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 className="page-title">Programmes & Activites</h1>
          <p className="page-subtitle">{year ? "Annee " + year.nom + " - " : ""}{programs.length} programme(s)</p>
        </div>
        <button className="btn-primary" onClick={openNew}>+ Nouveau programme</button>
      </div>

      {error && !modalOpen && <div className="login-error" style={{ marginBottom: "16px" }}>{error}</div>}

      <div className="form-card" style={{ marginBottom: "22px" }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un programme..."
          style={{ width: "100%", maxWidth: "400px", padding: "11px 14px", borderRadius: "10px", border: "1.5px solid var(--line)", background: "var(--bg-soft)", fontSize: "14px" }} />
      </div>

      <div className="card-grid">
        {filteredPrograms.length === 0 && <div className="grid-empty">Aucun programme. Creez-en un.</div>}
        {filteredPrograms.map((p) => {
          const stats = programStats(p);
          return (
            <div key={p.id} className="program-card" onClick={() => openDetail(p)}>
              <div className="program-card-head">
                <h3>{p.nom}</h3>
                {p.actif ? <span className="badge badge-ok">Actif</span> : <span className="badge badge-gray">Inactif</span>}
              </div>
              <div className="program-card-body">
                <div className="program-meta">{p.date_evenement || "Date non definie"}</div>
                <div className="program-cost">{fmt(p.cout)} {p.monnaie}</div>
              </div>
              <div className="program-card-stats">
                <div><strong>{stats.nb}</strong><span>concernes</span></div>
                <div><strong>{stats.payeurs}</strong><span>payeurs</span></div>
                <div><strong>{fmt(stats.encaisse)}</strong><span>encaisse</span></div>
              </div>
              <div style={{ display: "flex", gap: "8px", margin: "0 16px 16px" }}>
                <button className="btn-sm btn-blue" onClick={(e) => { e.stopPropagation(); openEdit(p); }}>Modifier</button>
                <button className="btn-sm btn-gray-cancel" onClick={(e) => { e.stopPropagation(); toggleActive(p); }}>{p.actif ? "Desactiver" : "Activer"}</button>
              </div>
            </div>
          );
        })}
      </div>

      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal-card modal-large" onClick={(e) => e.stopPropagation()} style={{ maxHeight: "88vh", overflowY: "auto" }}>
            <div className="modal-header"><h3>{editingProgram ? "Modifier le programme" : "Nouveau programme"}</h3><button className="modal-close" onClick={() => setModalOpen(false)}>x</button></div>
            {error && <div className="login-error" style={{ marginBottom: "16px" }}>{error}</div>}

            <div className="form-row">
              <div className="form-group"><label>Nom *</label><input value={form.nom} onChange={(e) => setField("nom", e.target.value)} placeholder="ex: Sortie pedagogique au musee" /></div>
              <div className="form-group"><label>Responsable</label><input value={form.responsable} onChange={(e) => setField("responsable", e.target.value)} /></div>
            </div>
            <div className="form-group" style={{ marginBottom: "16px" }}><label>Description</label><textarea className="modal-textarea" rows="2" value={form.description} onChange={(e) => setField("description", e.target.value)} /></div>
            <div className="form-row">
              <div className="form-group"><label>Date de l'evenement</label><input type="date" value={form.date_evenement} onChange={(e) => setField("date_evenement", e.target.value)} /></div>
              <div className="form-group"><label>Cout de participation</label><input type="number" value={form.cout} onChange={(e) => setField("cout", e.target.value)} /></div>
              <div className="form-group"><label>Monnaie</label><select value={form.monnaie} onChange={(e) => setField("monnaie", e.target.value)}><option value="HTG">HTG</option><option value="USD">USD</option></select></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Inscription du</label><input type="date" value={form.inscription_debut} onChange={(e) => setField("inscription_debut", e.target.value)} /></div>
              <div className="form-group"><label>au</label><input type="date" value={form.inscription_fin} onChange={(e) => setField("inscription_fin", e.target.value)} /></div>
              <div className="form-group"><label>Nb max participants</label><input type="number" value={form.max_participants} onChange={(e) => setField("max_participants", e.target.value)} /></div>
              <div className="form-group"><label>Date limite paiement</label><input type="date" value={form.date_limite_paiement} onChange={(e) => setField("date_limite_paiement", e.target.value)} /></div>
            </div>

            <div style={{ borderTop: "1px solid var(--line)", paddingTop: "14px", marginBottom: "12px" }}>
              <label style={{ fontWeight: 600, fontSize: "13px" }}>Public concerne</label>
              <select value={form.cible_type} onChange={(e) => { setField("cible_type", e.target.value); setSelTargets([]); setSelStudents([]); resetTargetPickers(); }} style={{ marginTop: "8px" }}>
                <option value="etablissement">Tout l'etablissement</option>
                <option value="section">Section(s)</option>
                <option value="classe">Classe(s)</option>
                <option value="salle">Salle(s)</option>
                <option value="liste">Liste d'eleves</option>
              </select>
            </div>

            {form.cible_type === "section" && (
              <div className="form-group" style={{ marginBottom: "12px" }}>
                <select onChange={(e) => { addTarget("section", e.target.value); e.target.value = ""; }}>
                  <option value="">-- Ajouter une section --</option>
                  {sections.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
                </select>
              </div>
            )}
            {form.cible_type === "classe" && (
              <div className="form-row" style={{ marginBottom: "12px" }}>
                <select value={filterSection} onChange={(e) => onFilterSection(e.target.value)}>
                  <option value="">-- Section --</option>
                  {sections.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
                </select>
                <select onChange={(e) => { addTarget("classe", e.target.value); e.target.value = ""; }} disabled={!filterSection}>
                  <option value="">-- Ajouter une classe --</option>
                  {classesForFilter.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
                </select>
              </div>
            )}
            {form.cible_type === "salle" && (
              <div className="form-row" style={{ marginBottom: "12px" }}>
                <select value={filterSection} onChange={(e) => onFilterSection(e.target.value)}>
                  <option value="">-- Section --</option>
                  {sections.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
                </select>
                <select value={filterClasse} onChange={(e) => onFilterClasse(e.target.value)} disabled={!filterSection}>
                  <option value="">-- Classe --</option>
                  {classesForFilter.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
                </select>
                <select onChange={(e) => { addTarget("salle", e.target.value); e.target.value = ""; }} disabled={!filterClasse}>
                  <option value="">-- Ajouter une salle --</option>
                  {roomsForFilter.map((r) => <option key={r.id} value={r.id}>{r.nom}</option>)}
                </select>
              </div>
            )}
            {form.cible_type === "liste" && (
              <div style={{ position: "relative", marginBottom: "12px" }}>
                <input value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} placeholder="Rechercher un eleve a ajouter..."
                  style={{ width: "100%", padding: "11px 14px", borderRadius: "10px", border: "1.5px solid var(--line)", background: "var(--bg-soft)", fontSize: "14px" }} />
                {studentResults.length > 0 && (
                  <div className="search-dropdown">
                    {studentResults.map((s) => (
                      <div key={s.id} className="search-item" onClick={() => addStudent(s)}>
                        <div><strong>{s.prenom} {s.nom}</strong><div style={{ fontSize: "12px", color: "var(--text-dim)" }}>{s.matricule}</div></div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {(selTargets.length > 0 || selStudents.length > 0) && (
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "16px" }}>
                {selTargets.map((t) => <span key={t.type + t.id} className="section-chip">{t.label}<button onClick={() => removeTarget(t.type, t.id)} className="chip-x">x</button></span>)}
                {selStudents.map((s) => <span key={s.id} className="section-chip">{s.label}<button onClick={() => removeStudent(s.id)} className="chip-x">x</button></span>)}
              </div>
            )}

            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "8px" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setModalOpen(false)}>Annuler</button>
              <button className="btn-primary" onClick={requestSubmit}>{editingProgram ? "Enregistrer les modifications" : "Creer le programme"}</button>
            </div>
          </div>
        </div>
      )}

      {editConfirmOpen && (
        <div className="modal-overlay" style={{ zIndex: 10000 }} onClick={() => setEditConfirmOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "440px", textAlign: "center" }}>
            <h3 style={{ color: "var(--navy)", marginBottom: "12px" }}>Confirmez la modification</h3>
            <p style={{ fontSize: "14px", color: "var(--text-dim)", marginBottom: "16px" }}>Vous allez modifier le programme <strong>{form.nom}</strong>.</p>
            {editError && <div className="login-error" style={{ marginBottom: "14px" }}>{editError}</div>}
            <div className="form-group" style={{ marginBottom: "20px", textAlign: "left" }}>
              <label>Votre mot de passe</label>
              <input type="password" value={editPassword} onChange={(e) => setEditPassword(e.target.value)} autoFocus onKeyDown={(e) => e.key === "Enter" && submitEdit()} />
            </div>
            <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setEditConfirmOpen(false)}>Annuler</button>
              <button className="btn-primary" onClick={submitEdit}>Confirmer la modification</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}