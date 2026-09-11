import React, { useState, useEffect } from "react";
import { useAuth } from "../AuthContext.jsx";
import { getAuthedClient, EDGE_FUNCTION_URL, SUPABASE_ANON_KEY } from "../supabaseClient.js";
import { useYear } from "../YearContext.jsx";
import StudentProfile from "../components/StudentProfile.jsx";

export default function Classes() {
  const { token, user } = useAuth();
  const { currentYear: year } = useYear();
  const [view, setView] = useState("sections");
  const [sections, setSections] = useState([]);
  const [classes, setClasses] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [roomStudents, setRoomStudents] = useState([]);
  const [fees, setFees] = useState([]);
  const [selSection, setSelSection] = useState(null);
  const [selClass, setSelClass] = useState(null);
  const [selRoom, setSelRoom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [profileId, setProfileId] = useState(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [mNom, setMNom] = useState("");
  const [mDesc, setMDesc] = useState("");
  const [saving, setSaving] = useState(false);

  const [showFees, setShowFees] = useState(null);
  const [feeName, setFeeName] = useState("");
  const [feeAmount, setFeeAmount] = useState("");
  const [feeCur, setFeeCur] = useState("HTG");
  const [feeDate, setFeeDate] = useState("");

  const [feeAction, setFeeAction] = useState(null);
  const [feePassword, setFeePassword] = useState("");
  const [feeError, setFeeError] = useState("");

  const [dualAction, setDualAction] = useState(null);
  const [dualCreds, setDualCreds] = useState({ username: "", password: "" });
  const [dualError, setDualError] = useState("");

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

  const loadSections = async (y) => {
    if (!y) return;
    const supabase = getAuthedClient(token);
    const { data, error: e } = await supabase.from("sections").select("*").eq("academic_year_uuid", y.id).order("nom");
    if (e) { setError(e.message); return; }
    setSections(data || []);
  };
  const loadClasses = async (section) => {
    const supabase = getAuthedClient(token);
    const { data, error: e } = await supabase.from("classes").select("*").eq("section_uuid", section.id).order("nom");
    if (e) { setError(e.message); return; }
    setClasses(data || []);
  };
  const loadRooms = async (cls) => {
    const supabase = getAuthedClient(token);
    const { data, error: e } = await supabase.from("rooms").select("*").eq("class_uuid", cls.id).order("nom");
    if (e) { setError(e.message); return; }
    setRooms(data || []);
  };
  const loadRoomStudents = async (room) => {
    const supabase = getAuthedClient(token);
    const { data: assigns } = await supabase.from("assignments").select("student_uuid").eq("room_uuid", room.id);
    const ids = (assigns || []).map((a) => a.student_uuid);
    if (ids.length === 0) { setRoomStudents([]); return; }
    const { data } = await supabase.from("students").select("id, matricule, nom, prenom, photo, sexe").in("id", ids).order("nom");
    setRoomStudents(data || []);
  };
  const loadFees = async (cls) => {
    const supabase = getAuthedClient(token);
    const { data, error: e } = await supabase.from("class_fees").select("*").eq("class_uuid", cls.id).order("created_at");
    if (e) { setError(e.message); return; }
    setFees(data || []);
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      setError("");
      if (year) await loadSections(year);
      setLoading(false);
    };
    init();
  }, [token, year]);

  const openSection = async (s) => { setSelSection(s); setView("classes"); setLoading(true); await loadClasses(s); setLoading(false); };
  const openClass = async (c) => { setSelClass(c); setView("rooms"); setLoading(true); await loadRooms(c); setLoading(false); };
  const openRoom = async (r) => { setSelRoom(r); setView("students"); setLoading(true); await loadRoomStudents(r); setLoading(false); };
  const backToSections = () => { setView("sections"); setSelSection(null); setSelClass(null); setSelRoom(null); loadSections(year); };
  const backToClasses = () => { setView("classes"); setSelClass(null); setSelRoom(null); loadClasses(selSection); };
  const backToRooms = () => { setView("rooms"); setSelRoom(null); loadRooms(selClass); };

  const openModal = () => { setMNom(""); setMDesc(""); setError(""); setModalOpen(true); };

  const submitModal = async () => {
    setError("");
    if (!mNom.trim()) { setError("Le nom est requis"); return; }
    setSaving(true);
    try {
      const supabase = getAuthedClient(token);
      if (view === "sections") {
        const { error: e } = await supabase.from("sections").insert({ nom: mNom, description: mDesc || null, academic_year_uuid: year.id, modified_by: user.username });
        if (e) throw e;
        setModalOpen(false); loadSections(year);
      } else if (view === "classes") {
        const { error: e } = await supabase.from("classes").insert({ nom: mNom, description: mDesc || null, section_uuid: selSection.id, academic_year_uuid: year.id, modified_by: user.username });
        if (e) throw e;
        setModalOpen(false); loadClasses(selSection);
      } else if (view === "rooms") {
        const { error: e } = await supabase.from("rooms").insert({ nom: mNom, description: mDesc || null, class_uuid: selClass.id, modified_by: user.username });
        if (e) throw e;
        setModalOpen(false); loadRooms(selClass);
      }
    } catch (e) { setError(e.message || "Erreur"); }
    setSaving(false);
  };

  const requestDelSection = (s, e) => { e.stopPropagation(); setDualAction({ type: "section", target: s }); setDualCreds({ username: "", password: "" }); setDualError(""); };
  const requestDelClass = (c, e) => { e.stopPropagation(); setDualAction({ type: "classe", target: c }); setDualCreds({ username: "", password: "" }); setDualError(""); };
  const deleteRoom = async (r, e) => {
    e.stopPropagation();
    const supabase = getAuthedClient(token);
    await supabase.from("rooms").delete().eq("id", r.id);
    loadRooms(selClass);
  };

  const confirmDualDelete = async () => {
    setDualError("");
    const check = await verifyCredentials(dualCreds.username, dualCreds.password);
    if (!check.ok) { setDualError(check.error); return; }
    if (dualCreds.username === user.username) { setDualError("Le verificateur doit etre une personne differente"); return; }
    const supabase = getAuthedClient(token);
    const { data: verifierUser } = await supabase.from("users").select("role_nom, nom_complet").eq("username", dualCreds.username).maybeSingle();
    if (!verifierUser || verifierUser.role_nom !== "Administrateur") { setDualError("Seul un administrateur peut autoriser cette action"); return; }

    if (dualAction.type === "section") {
      await supabase.from("sections").delete().eq("id", dualAction.target.id);
      setDualAction(null); loadSections(year);
    } else if (dualAction.type === "classe") {
      await supabase.from("classes").delete().eq("id", dualAction.target.id);
      setDualAction(null); loadClasses(selSection);
    } else if (dualAction.type === "suspend_fee") {
      const fee = dualAction.target;
      const newStatut = fee.statut === "actif" ? "suspendu" : "actif";
      await supabase.from("class_fees").update({ statut: newStatut, modified_by: dualCreds.username }).eq("id", fee.id);
      setDualAction(null); loadFees(selClass);
    }
  };

  const openFees = async (c, e) => { e.stopPropagation(); setShowFees(c); await loadFees(c); };
  const addFee = async () => {
    if (!feeName) return;
    const supabase = getAuthedClient(token);
    const { error: e } = await supabase.from("class_fees").insert({
      nom: feeName, montant: Number(feeAmount) || 0, monnaie: feeCur, date_echeance: feeDate || null,
      class_uuid: showFees.id, statut: "actif", modified_by: user.username
    });
    if (!e) { setFeeName(""); setFeeAmount(""); setFeeDate(""); loadFees(showFees); }
  };
  const updateFeeDate = async (feeId, date) => {
    const supabase = getAuthedClient(token);
    await supabase.from("class_fees").update({ date_echeance: date, modified_by: user.username }).eq("id", feeId);
    loadFees(showFees);
  };

  const requestDelFee = (fee) => { setFeeAction({ fee, mode: "delete" }); setFeePassword(""); setFeeError(""); };
  const submitFeeAction = async () => {
    setFeeError("");
    try {
      const check = await verifyCredentials(user.username, feePassword);
      if (!check.ok) { setFeeError(check.error); return; }
      const supabase = getAuthedClient(token);
      const { count } = await supabase.from("payments").select("id", { count: "exact", head: true }).eq("fee_uuid", feeAction.fee.id);
      if (count > 0) { setFeeAction({ ...feeAction, mode: "has_payments" }); return; }
      await supabase.from("class_fees").delete().eq("id", feeAction.fee.id);
      setFeeAction(null); loadFees(showFees);
    } catch (e) { setFeeError(e.message || "Erreur"); }
  };
  const requestSuspend = (fee) => { setDualAction({ type: "suspend_fee", target: fee }); setDualCreds({ username: "", password: "" }); setDualError(""); };

  const fmt = (n) => Number(n || 0).toLocaleString();
  const addLabel = view === "sections" ? "+ Nouvelle section" : view === "classes" ? "+ Nouvelle classe" : view === "rooms" ? "+ Nouvelle salle" : null;
  const modalTitle = view === "sections" ? "Nouvelle section" : view === "classes" ? "Nouvelle classe" : "Nouvelle salle";
  const nomPlaceholder = view === "sections" ? "Ex: Fondamentale" : view === "classes" ? "Ex: 7 AF" : "Ex: Salle A";

  if (!year) {
    return (
      <div className="page">
        <div className="page-header"><h1 className="page-title">Classes & Sections</h1></div>
        <div className="dash-placeholder"><p>Aucune annee academique active.</p></div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 className="page-title">Classes & Sections</h1>
          <p className="page-subtitle">Annee {year.nom}</p>
        </div>
        {addLabel && view !== "students" && <button className="btn-primary" onClick={openModal}>{addLabel}</button>}
      </div>

      <div className="breadcrumb">
        <span className={"crumb" + (view === "sections" ? " active" : "")} onClick={backToSections}>Sections</span>
        {selSection && <><span className="crumb-sep">{">"}</span>
          <span className={"crumb" + (view === "classes" ? " active" : "")} onClick={backToClasses}>{selSection.nom}</span></>}
        {selClass && <><span className="crumb-sep">{">"}</span>
          <span className={"crumb" + (view === "rooms" ? " active" : "")} onClick={view === "students" ? backToRooms : undefined}>{selClass.nom}</span></>}
        {selRoom && <><span className="crumb-sep">{">"}</span>
          <span className="crumb active">{selRoom.nom}</span></>}
      </div>

      {error && !modalOpen && <div className="login-error" style={{ maxWidth: "500px", marginBottom: "16px" }}>{error}</div>}
      {loading && <p style={{ color: "var(--text-dim)" }}>Chargement...</p>}

      {!loading && (
        <div className="card-grid">
          {view === "sections" && sections.map((s) => (
            <div key={s.id} className="folder-card" onClick={() => openSection(s)}>
              <button className="folder-del" onClick={(e) => requestDelSection(s, e)}>x</button>
              <div className="folder-icon folder-section">SEC</div>
              <div className="folder-name">{s.nom}</div>
              {s.description && <div className="folder-desc">{s.description}</div>}
            </div>
          ))}
          {view === "sections" && sections.length === 0 && <div className="grid-empty">Aucune section pour {year.nom}. Ajoutez-en une.</div>}

          {view === "classes" && classes.map((c) => (
            <div key={c.id} className="folder-card" onClick={() => openClass(c)}>
              <button className="folder-del" onClick={(e) => requestDelClass(c, e)}>x</button>
              <div className="folder-icon folder-class">CLS</div>
              <div className="folder-name">{c.nom}</div>
              {c.description && <div className="folder-desc">{c.description}</div>}
              <button className="folder-fees-btn" onClick={(e) => openFees(c, e)}>Gerer les frais</button>
            </div>
          ))}
          {view === "classes" && classes.length === 0 && <div className="grid-empty">Aucune classe dans {selSection.nom}. Ajoutez-en une.</div>}

          {view === "rooms" && rooms.map((r) => (
            <div key={r.id} className="folder-card" onClick={() => openRoom(r)}>
              <button className="folder-del" onClick={(e) => deleteRoom(r, e)}>x</button>
              <div className="folder-icon folder-room">SAL</div>
              <div className="folder-name">{r.nom}</div>
              {r.description && <div className="folder-desc">{r.description}</div>}
            </div>
          ))}
          {view === "rooms" && rooms.length === 0 && <div className="grid-empty">Aucune salle dans {selClass.nom}. Ajoutez-en une.</div>}

          {view === "students" && roomStudents.map((s) => (
            <div key={s.id} className="folder-card folder-student" onClick={() => setProfileId(s.id)} style={{ cursor: "pointer" }}>
              {s.photo
                ? <img src={s.photo} className="student-card-photo" alt="" />
                : <div className="student-card-photo-empty">{(s.prenom ? s.prenom[0] : "") + (s.nom ? s.nom[0] : "")}</div>}
              <div className="folder-name">{s.prenom} {s.nom}</div>
              <div className="folder-meta">{s.matricule}</div>
            </div>
          ))}
          {view === "students" && roomStudents.length === 0 && <div className="grid-empty">Aucun eleve dans {selRoom.nom}. Assignez des eleves via le module Assignations.</div>}
        </div>
      )}

      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h3>{modalTitle}</h3><button className="modal-close" onClick={() => setModalOpen(false)}>x</button></div>
            {error && <div className="login-error" style={{ marginBottom: "14px" }}>{error}</div>}
            <div className="form-group" style={{ marginBottom: "16px" }}>
              <label>Nom *</label>
              <input value={mNom} onChange={(e) => setMNom(e.target.value)} placeholder={nomPlaceholder} autoFocus onKeyDown={(e) => e.key === "Enter" && submitModal()} />
            </div>
            <div className="form-group" style={{ marginBottom: "20px" }}>
              <label>Description (optionnel)</label>
              <input value={mDesc} onChange={(e) => setMDesc(e.target.value)} />
            </div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setModalOpen(false)}>Annuler</button>
              <button className="btn-primary" onClick={submitModal} disabled={saving}>{saving ? "Enregistrement..." : "Creer"}</button>
            </div>
          </div>
        </div>
      )}

      {showFees && (
        <div className="modal-overlay" onClick={() => setShowFees(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h3>Frais - {showFees.nom}</h3><button className="modal-close" onClick={() => setShowFees(null)}>x</button></div>
            <div className="fee-add-row">
              <input placeholder="Nom du frais (ex: Ecolage)" value={feeName} onChange={(e) => setFeeName(e.target.value)} />
              <input type="number" placeholder="Montant" value={feeAmount} onChange={(e) => setFeeAmount(e.target.value)} />
              <input type="date" value={feeDate} onChange={(e) => setFeeDate(e.target.value)} title="Date d''echeance" style={{ maxWidth: "160px" }} />
              <select value={feeCur} onChange={(e) => setFeeCur(e.target.value)}>
                <option value="HTG">HTG</option><option value="USD">USD</option>
              </select>
              <button className="btn-primary" onClick={addFee}>Ajouter</button>
            </div>
            <table className="data-table" style={{ marginTop: "14px" }}>
              <thead><tr><th>Frais</th><th>Montant</th><th>Echeance</th><th></th></tr></thead>
              <tbody>
                {fees.length === 0 && <tr><td colSpan="4" className="table-empty">Aucun frais defini.</td></tr>}
                {fees.map((f) => (
                  <tr key={f.id}>
                    <td><strong>{f.nom}</strong></td>
                    <td>{fmt(f.montant)} {f.monnaie}</td>
                    <td><input type="date" defaultValue={f.date_echeance || ""} onBlur={(e) => updateFeeDate(f.id, e.target.value)} style={{ padding: "6px", borderRadius: "6px", border: "1px solid var(--line)", fontSize: "12px" }} /></td>
                    <td>
                      <div className="table-actions">
                        {f.statut === "suspendu" ? <span className="badge badge-gray">Suspendu</span> : null}
                        <button className="btn-sm btn-red" onClick={(e) => { e.stopPropagation(); requestDelFee(f); }}>Suppr.</button>
                        {f.statut === "actif"
                          ? <button className="btn-sm btn-gold" onClick={(e) => { e.stopPropagation(); requestSuspend(f); }}>Suspendre</button>
                          : <button className="btn-sm btn-green" onClick={(e) => { e.stopPropagation(); requestSuspend(f); }}>Reactiver</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {profileId && <StudentProfile studentId={profileId} onClose={() => setProfileId(null)} />}

      {feeAction && (feeAction.mode === "delete" || feeAction.mode === "has_payments") && (
        <div className="modal-overlay" onClick={() => setFeeAction(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "440px" }}>
            <div className="modal-header">
              <h3 style={{ color: "var(--err)" }}>{feeAction.mode === "has_payments" ? "Suppression impossible" : "Supprimer le frais"}</h3>
              <button className="modal-close" onClick={() => setFeeAction(null)}>x</button>
            </div>
            {feeAction.mode === "has_payments" ? (
              <div>
                <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "10px", padding: "14px", marginBottom: "18px" }}>
                  <p style={{ fontSize: "13px", color: "#991b1b", margin: 0 }}>Le frais <strong>{feeAction.fee.nom}</strong> a des paiements enregistres. Il ne peut pas etre supprime.</p>
                  <p style={{ fontSize: "12px", color: "#b91c1c", margin: "8px 0 0" }}>Vous pouvez le <strong>suspendre</strong> a la place (il ne sera plus visible a la Caisse mais l''historique sera conserve).</p>
                </div>
                <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                  <button className="btn-gray-cancel btn-sm" onClick={() => setFeeAction(null)}>Fermer</button>
                  <button className="btn-sm btn-gold" onClick={() => { setFeeAction(null); requestSuspend(feeAction.fee); }}>Suspendre ce frais</button>
                </div>
              </div>
            ) : (
              <div>
                {feeError && <div className="login-error" style={{ marginBottom: "14px" }}>{feeError}</div>}
                <p style={{ fontSize: "13px", color: "var(--text-dim)", marginBottom: "14px" }}>Entrez votre mot de passe pour confirmer la suppression de <strong>{feeAction.fee.nom}</strong>.</p>
                <div className="form-group" style={{ marginBottom: "20px" }}>
                  <label>Votre mot de passe</label>
                  <input type="password" value={feePassword} onChange={(e) => setFeePassword(e.target.value)} autoFocus onKeyDown={(e) => e.key === "Enter" && submitFeeAction()} />
                </div>
                <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                  <button className="btn-gray-cancel btn-sm" onClick={() => setFeeAction(null)}>Annuler</button>
                  <button className="btn-sm btn-red" onClick={submitFeeAction}>Supprimer</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {dualAction && (
        <div className="modal-overlay" onClick={() => setDualAction(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "420px" }}>
            <div className="modal-header">
              <h3 style={{ color: "var(--err)" }}>Autorisation requise</h3>
              <button className="modal-close" onClick={() => setDualAction(null)}>x</button>
            </div>
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "10px", padding: "14px", marginBottom: "18px" }}>
              <p style={{ fontSize: "13px", color: "#991b1b", margin: 0 }}>
                <strong>Action sensible :</strong> {dualAction.type === "section" ? "Suppression de section" : dualAction.type === "classe" ? "Suppression de classe" : (dualAction.target.statut === "actif" ? "Suspendre le frais " + dualAction.target.nom : "Reactiver le frais " + dualAction.target.nom)}
              </p>
              <p style={{ fontSize: "12px", color: "#b91c1c", margin: "6px 0 0" }}>Un administrateur different doit confirmer cette action avec ses identifiants.</p>
            </div>
            {dualError && <div className="login-error" style={{ marginBottom: "14px" }}>{dualError}</div>}
            <div className="form-group" style={{ marginBottom: "14px" }}>
              <label>Identifiant de l''administrateur</label>
              <input value={dualCreds.username} onChange={(e) => setDualCreds({ ...dualCreds, username: e.target.value })} autoFocus />
            </div>
            <div className="form-group" style={{ marginBottom: "20px" }}>
              <label>Mot de passe</label>
              <input type="password" value={dualCreds.password} onChange={(e) => setDualCreds({ ...dualCreds, password: e.target.value })} onKeyDown={(e) => e.key === "Enter" && confirmDualDelete()} />
            </div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setDualAction(null)}>Annuler</button>
              <button className="btn-primary" onClick={confirmDualDelete}>Autoriser</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}