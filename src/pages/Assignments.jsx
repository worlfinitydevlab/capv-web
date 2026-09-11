import React, { useState, useEffect } from "react";
import { useAuth } from "../AuthContext.jsx";
import { getAuthedClient, EDGE_FUNCTION_URL, SUPABASE_ANON_KEY } from "../supabaseClient.js";
import { useYear } from "../YearContext.jsx";
import StudentProfile from "../components/StudentProfile.jsx";

export default function Assignments() {
  const { token, user } = useAuth();
  const { currentYear: year } = useYear();
  const [assigned, setAssigned] = useState([]);
  const [unassigned, setUnassigned] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [profileId, setProfileId] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [sections, setSections] = useState([]);
  const [classes, setClasses] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [selStudent, setSelStudent] = useState("");
  const [selSection, setSelSection] = useState("");
  const [selClass, setSelClass] = useState("");
  const [selRoom, setSelRoom] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      if (!year) { setAssigned([]); setUnassigned([]); setLoading(false); return; }
      const supabase = getAuthedClient(token);

      const { data: asg, error: e1 } = await supabase.from("assignments").select("*").eq("academic_year_uuid", year.id);
      if (e1) throw e1;

      const { data: students, error: e2 } = await supabase.from("students").select("id, matricule, nom, prenom").eq("statut", "actif");
      if (e2) throw e2;

      const { data: allClasses } = await supabase.from("classes").select("id, nom");
      const { data: allSections } = await supabase.from("sections").select("id, nom");
      const { data: allRooms } = await supabase.from("rooms").select("id, nom, class_uuid");
      const classMap = Object.fromEntries((allClasses || []).map((c) => [c.id, c]));
      const roomMap = Object.fromEntries((allRooms || []).map((r) => [r.id, r]));

      const secMapByClass = {};
      for (const r of allClasses || []) secMapByClass[r.id] = r.section_uuid;
      const sectionNameMap = Object.fromEntries((allSections || []).map((s) => [s.id, s.nom]));

      const assignedRows = (asg || []).map((a) => {
        const st = students.find((s) => s.id === a.student_uuid);
        const cls = classMap[a.class_uuid];
        const room = roomMap[a.room_uuid];
        return {
          assignment_id: a.id,
          student_id: a.student_uuid,
          matricule: st ? st.matricule : "?",
          nom: st ? st.nom : "?",
          prenom: st ? st.prenom : "",
          classe_nom: cls ? cls.nom : "-",
          section_nom: cls ? sectionNameMap[cls.section_uuid] : "-",
          salle_nom: room ? room.nom : "-"
        };
      }).filter((a) => a.matricule !== "?");
      setAssigned(assignedRows);

      const { data: allAsg } = await supabase.from("assignments").select("student_uuid");
      const assignedIds = new Set((allAsg || []).map((a) => a.student_uuid));
      setUnassigned((students || []).filter((s) => !assignedIds.has(s.id)));
    } catch (e) {
      setError(e.message || "Erreur de chargement");
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [token, year]);

  const onSectionChange = async (sectionId) => {
    setSelSection(sectionId); setSelClass(""); setSelRoom(""); setClasses([]); setRooms([]);
    if (sectionId) {
      const supabase = getAuthedClient(token);
      const { data } = await supabase.from("classes").select("*").eq("section_uuid", sectionId).order("nom");
      setClasses(data || []);
    }
  };
  const onClassChange = async (classId) => {
    setSelClass(classId); setSelRoom(""); setRooms([]);
    if (classId) {
      const supabase = getAuthedClient(token);
      const { data } = await supabase.from("rooms").select("*").eq("class_uuid", classId).order("nom");
      setRooms(data || []);
    }
  };

  const openModal = async () => {
    setSelStudent(""); setSelSection(""); setSelClass(""); setSelRoom("");
    setClasses([]); setRooms([]); setError(""); setModalOpen(true);
    const supabase = getAuthedClient(token);
    const { data } = await supabase.from("sections").select("*").eq("academic_year_uuid", year.id).order("nom");
    setSections(data || []);
  };

  const submit = async () => {
    setError("");
    if (!selStudent) { setError("Choisissez un élève"); return; }
    if (!selClass) { setError("Choisissez une classe"); return; }
    if (!selRoom) { setError("Choisissez une salle"); return; }
    try {
      const supabase = getAuthedClient(token);
      const { error: e } = await supabase.from("assignments").insert({
        student_uuid: selStudent, class_uuid: selClass, room_uuid: selRoom, academic_year_uuid: year.id,
        date_assignation: new Date().toISOString(), modified_by: user.username
      });
      if (e) throw e;
      setModalOpen(false);
      load();
    } catch (e) { setError(e.message || "Erreur"); }
  };

  const [dualTarget, setDualTarget] = useState(null);
  const [dualCreds, setDualCreds] = useState({ username: "", password: "" });
  const [dualError, setDualError] = useState("");
  const [dualBusy, setDualBusy] = useState(false);

  const verifyCredentials = async (username, password) => {
    const r = await fetch(EDGE_FUNCTION_URL, {
      method: "POST",
      headers: { "apikey": SUPABASE_ANON_KEY, "Authorization": "Bearer " + SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    const d = await r.json();
    if (!r.ok) return { ok: false, error: d.error || "Mot de passe incorrect" };
    return { ok: true };
  };

  const requestRemove = (id) => { setDualTarget(id); setDualCreds({ username: "", password: "" }); setDualError(""); };

  const confirmRemove = async () => {
    setDualError("");
    if (!dualCreds.username || !dualCreds.password) { setDualError("Identifiant et mot de passe requis"); return; }
    if (dualCreds.username === user.username) { setDualError("Le vérificateur doit être une personne différente"); return; }
    setDualBusy(true);
    const check = await verifyCredentials(dualCreds.username, dualCreds.password);
    if (!check.ok) { setDualError(check.error); setDualBusy(false); return; }
    try {
      const supabase = getAuthedClient(token);
      const { data: verifier } = await supabase.from("users").select("role_nom").eq("username", dualCreds.username).maybeSingle();
      if (!verifier || verifier.role_nom !== "Administrateur") { setDualError("Seul un administrateur peut autoriser cette action"); setDualBusy(false); return; }
      const { error: e } = await supabase.from("assignments").delete().eq("id", dualTarget);
      if (e) throw e;
      setDualTarget(null);
      load();
    } catch (e) {
      setDualError(e.message || "Erreur");
    }
    setDualBusy(false);
  };

  if (loading) return <div className="page"><p style={{ color: "var(--text-dim)" }}>Chargement...</p></div>;

  if (!year) {
    return <div className="page"><div className="page-header"><h1 className="page-title">Assignations</h1></div><div className="dash-placeholder"><p>Aucune ann&eacute;e acad&eacute;mique active.</p></div></div>;
  }

  return (
    <div className="page">
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 className="page-title">Assignations</h1>
          <p className="page-subtitle">Ann&eacute;e {year.nom} - {assigned.length} assign&eacute;(s), {unassigned.length} non assign&eacute;(s)</p>
        </div>
        <button className="btn-primary" onClick={openModal}>+ Assigner un &eacute;l&egrave;ve</button>
      </div>

      {error && !modalOpen && <div className="login-error" style={{ maxWidth: "500px", marginBottom: "16px" }}>{error}</div>}

      <div className="table-card">
        <table className="data-table">
          <thead><tr><th>Matricule</th><th>&Eacute;l&egrave;ve</th><th>Section</th><th>Classe</th><th>Salle</th><th>Actions</th></tr></thead>
          <tbody>
            {assigned.length === 0 && <tr><td colSpan="6" className="table-empty">Aucun &eacute;l&egrave;ve assign&eacute; pour cette ann&eacute;e.</td></tr>}
            {assigned.map((a) => (
              <tr key={a.assignment_id} onClick={() => setProfileId(a.student_id)} style={{ cursor: "pointer" }}>
                <td><strong>{a.matricule}</strong></td>
                <td>{a.prenom} {a.nom}</td>
                <td>{a.section_nom}</td>
                <td>{a.classe_nom}</td>
                <td><span className="badge badge-blue">{a.salle_nom}</span></td>
                <td><button className="btn-sm btn-red" onClick={(e) => { e.stopPropagation(); requestRemove(a.assignment_id); }}>Retirer</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h3>Assigner un &eacute;l&egrave;ve</h3><button className="modal-close" onClick={() => setModalOpen(false)}>x</button></div>
            {error && <div className="login-error" style={{ marginBottom: "16px" }}>{error}</div>}

            <div className="form-group" style={{ marginBottom: "16px" }}>
              <label>&Eacute;l&egrave;ve (non assign&eacute;s cette ann&eacute;e) *</label>
              <select value={selStudent} onChange={(e) => setSelStudent(e.target.value)}>
                <option value="">-- Choisir un &eacute;l&egrave;ve --</option>
                {unassigned.map((s) => <option key={s.id} value={s.id}>{s.matricule} - {s.prenom} {s.nom}</option>)}
              </select>
              {unassigned.length === 0 && (
                <p style={{ fontSize: "12px", color: "var(--text-soft)", marginTop: "6px" }}>
                  Tous les &eacute;l&egrave;ves sont d&eacute;ja assign&eacute;s. Cr&eacute;ez de nouveaux &eacute;l&egrave;ves ou retirez une assignation.
                </p>
              )}
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Section *</label>
                <select value={selSection} onChange={(e) => onSectionChange(e.target.value)}>
                  <option value="">-- Choisir --</option>
                  {sections.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Classe *</label>
                <select value={selClass} onChange={(e) => onClassChange(e.target.value)} disabled={!selSection}>
                  <option value="">-- Choisir --</option>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Salle *</label>
                <select value={selRoom} onChange={(e) => setSelRoom(e.target.value)} disabled={!selClass}>
                  <option value="">-- Choisir --</option>
                  {rooms.map((r) => <option key={r.id} value={r.id}>{r.nom}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "20px" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setModalOpen(false)}>Annuler</button>
              <button className="btn-primary" onClick={submit}>Assigner</button>
            </div>
          </div>
        </div>
      )}
      {dualTarget && (
        <div className="modal-overlay" onClick={() => setDualTarget(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "420px" }}>
            <div className="modal-header">
              <h3 style={{ color: "var(--err)" }}>Autorisation requise</h3>
              <button className="modal-close" onClick={() => setDualTarget(null)}>x</button>
            </div>
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "10px", padding: "14px", marginBottom: "18px" }}>
              <p style={{ fontSize: "13px", color: "#991b1b", margin: 0 }}><strong>Action sensible :</strong> Retrait d&apos;une assignation</p>
              <p style={{ fontSize: "12px", color: "#b91c1c", margin: "6px 0 0" }}>Un administrateur doit confirmer cette action avec ses identifiants.</p>
            </div>
            {dualError && <div className="login-error" style={{ marginBottom: "14px" }}>{dualError}</div>}
            <div className="form-group" style={{ marginBottom: "14px" }}>
              <label>Identifiant de l&apos;administrateur</label>
              <input value={dualCreds.username} onChange={(e) => setDualCreds({ ...dualCreds, username: e.target.value })} autoFocus />
            </div>
            <div className="form-group" style={{ marginBottom: "20px" }}>
              <label>Mot de passe</label>
              <input type="password" value={dualCreds.password} onChange={(e) => setDualCreds({ ...dualCreds, password: e.target.value })} onKeyDown={(e) => e.key === "Enter" && confirmRemove()} />
            </div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setDualTarget(null)}>Annuler</button>
              <button className="btn-primary" onClick={confirmRemove} disabled={dualBusy}>{dualBusy ? "Vérification..." : "Autoriser"}</button>
            </div>
          </div>
        </div>
      )}
      {profileId && <StudentProfile studentId={profileId} onClose={() => setProfileId(null)} />}
    </div>
  );
}