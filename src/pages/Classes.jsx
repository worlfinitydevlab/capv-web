import React, { useState, useEffect } from "react";
import { useAuth } from "../AuthContext.jsx";
import { getAuthedClient } from "../supabaseClient.js";
import { useYear } from "../YearContext.jsx";

export default function Classes() {
  const { token, user } = useAuth();
  const { currentYear: year } = useYear();
  const [view, setView] = useState("sections");
  const [sections, setSections] = useState([]);
  const [classes, setClasses] = useState([]);
  const [fees, setFees] = useState([]);
  const [selSection, setSelSection] = useState(null);
  const [selClass, setSelClass] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [mNom, setMNom] = useState("");
  const [mDesc, setMDesc] = useState("");
  const [saving, setSaving] = useState(false);

  const [feeModalOpen, setFeeModalOpen] = useState(false);
  const [feeName, setFeeName] = useState("");
  const [feeAmount, setFeeAmount] = useState("");
  const [feeCur, setFeeCur] = useState("HTG");
  const [feeDate, setFeeDate] = useState("");

  const loadSections = async (y) => {
    if (!y) return;
    const supabase = getAuthedClient(token);
    const { data, error: e } = await supabase.from("sections").select("*").eq("academic_year_uuid", y.id).order("nom");
    if (e) { setError(e.message); return; }
    setSections(data);
  };

  const loadClasses = async (section) => {
    const supabase = getAuthedClient(token);
    const { data, error: e } = await supabase.from("classes").select("*").eq("section_uuid", section.id).order("nom");
    if (e) { setError(e.message); return; }
    setClasses(data);
  };

  const loadFees = async (cls) => {
    const supabase = getAuthedClient(token);
    const { data, error: e } = await supabase.from("class_fees").select("*").eq("class_uuid", cls.id).order("created_at");
    if (e) { setError(e.message); return; }
    setFees(data);
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

  const openSection = async (s) => {
    setSelSection(s); setView("classes"); setLoading(true);
    await loadClasses(s);
    setLoading(false);
  };
  const openClass = async (c) => {
    setSelClass(c); setView("fees"); setLoading(true);
    await loadFees(c);
    setLoading(false);
  };
  const backToSections = () => { setView("sections"); setSelSection(null); setSelClass(null); loadSections(year); };
  const backToClasses = () => { setView("classes"); setSelClass(null); loadClasses(selSection); };

  const openModal = () => { setMNom(""); setMDesc(""); setError(""); setModalOpen(true); };

  const submitModal = async () => {
    setError("");
    if (!mNom.trim()) { setError("Le nom est requis"); return; }
    setSaving(true);
    try {
      const supabase = getAuthedClient(token);
      if (view === "sections") {
        const { error: e } = await supabase.from("sections").insert({
          nom: mNom, description: mDesc || null, academic_year_uuid: year.id, modified_by: user.username
        });
        if (e) throw e;
        setModalOpen(false);
        loadSections(year);
      } else {
        const { error: e } = await supabase.from("classes").insert({
          nom: mNom, description: mDesc || null, section_uuid: selSection.id, academic_year_uuid: year.id, modified_by: user.username
        });
        if (e) throw e;
        setModalOpen(false);
        loadClasses(selSection);
      }
    } catch (e) {
      setError(e.message || "Erreur");
    }
    setSaving(false);
  };

  const openFeeModal = () => { setFeeName(""); setFeeAmount(""); setFeeCur("HTG"); setFeeDate(""); setError(""); setFeeModalOpen(true); };

  const submitFee = async () => {
    setError("");
    if (!feeName.trim()) { setError("Le nom du frais est requis"); return; }
    setSaving(true);
    try {
      const supabase = getAuthedClient(token);
      const { error: e } = await supabase.from("class_fees").insert({
        nom: feeName, montant: Number(feeAmount) || 0, monnaie: feeCur, date_echeance: feeDate || null,
        class_uuid: selClass.id, statut: "actif", modified_by: user.username
      });
      if (e) throw e;
      setFeeModalOpen(false);
      loadFees(selClass);
    } catch (e) {
      setError(e.message || "Erreur");
    }
    setSaving(false);
  };

  const fmt = (n) => Number(n || 0).toLocaleString();
  const addLabel = view === "sections" ? "+ Nouvelle section" : view === "classes" ? "+ Nouvelle classe" : null;
  const modalTitle = view === "sections" ? "Nouvelle section" : "Nouvelle classe";
  const nomPlaceholder = view === "sections" ? "Ex: Fondamentale" : "Ex: 7 AF";

  if (loading && !year) return <div className="page"><p style={{ color: "var(--text-dim)" }}>Chargement...</p></div>;

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
        {addLabel && <button className="btn-primary" onClick={openModal}>{addLabel}</button>}
      </div>

      <div className="breadcrumb">
        <span className={"crumb" + (view === "sections" ? " active" : "")} onClick={backToSections}>Sections</span>
        {selSection && <><span className="crumb-sep">&gt;</span>
          <span className={"crumb" + (view === "classes" ? " active" : "")} onClick={backToClasses}>{selSection.nom}</span></>}
        {selClass && <><span className="crumb-sep">&gt;</span>
          <span className="crumb active">{selClass.nom}</span></>}
      </div>

      {error && !modalOpen && !feeModalOpen && <div className="login-error" style={{ maxWidth: "500px", marginBottom: "16px" }}>{error}</div>}
      {loading && <p style={{ color: "var(--text-dim)" }}>Chargement...</p>}

      {!loading && (
        <div className="card-grid">
          {view === "sections" && sections.map((s) => (
            <div key={s.id} className="folder-card" onClick={() => openSection(s)}>
              <div className="folder-icon folder-section">SEC</div>
              <div className="folder-name">{s.nom}</div>
              {s.description && <div className="folder-desc">{s.description}</div>}
            </div>
          ))}
          {view === "sections" && sections.length === 0 && <div className="grid-empty">Aucune section pour {year.nom}. Ajoutez-en une.</div>}

          {view === "classes" && classes.map((c) => (
            <div key={c.id} className="folder-card" onClick={() => openClass(c)}>
              <div className="folder-icon folder-class">CLS</div>
              <div className="folder-name">{c.nom}</div>
              {c.description && <div className="folder-desc">{c.description}</div>}
            </div>
          ))}
          {view === "classes" && classes.length === 0 && <div className="grid-empty">Aucune classe dans {selSection.nom}. Ajoutez-en une.</div>}
        </div>
      )}

      {!loading && view === "fees" && (
        <div className="form-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
            <h3 className="form-card-title">Frais - {selClass.nom}</h3>
            <button className="btn-primary btn-sm" onClick={openFeeModal}>+ Nouveau frais</button>
          </div>
          <table className="data-table">
            <thead><tr><th>Nom</th><th>Montant</th><th>Echeance</th><th>Statut</th></tr></thead>
            <tbody>
              {fees.length === 0 && <tr><td colSpan="4" className="table-empty">Aucun frais.</td></tr>}
              {fees.map((f) => (
                <tr key={f.id}>
                  <td>{f.nom}</td>
                  <td>{fmt(f.montant)} {f.monnaie}</td>
                  <td>{f.date_echeance || "-"}</td>
                  <td>{f.statut}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{modalTitle}</h3>
              <button className="modal-close" onClick={() => setModalOpen(false)}>x</button>
            </div>
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

      {feeModalOpen && (
        <div className="modal-overlay" onClick={() => setFeeModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "460px" }}>
            <div className="modal-header">
              <h3>Nouveau frais</h3>
              <button className="modal-close" onClick={() => setFeeModalOpen(false)}>x</button>
            </div>
            {error && <div className="login-error" style={{ marginBottom: "14px" }}>{error}</div>}
            <div className="form-group" style={{ marginBottom: "14px" }}>
              <label>Nom du frais</label>
              <input value={feeName} onChange={(e) => setFeeName(e.target.value)} placeholder="Ex: Frais generaux" autoFocus />
            </div>
            <div className="form-row">
              <div className="form-group"><label>Montant</label><input type="number" value={feeAmount} onChange={(e) => setFeeAmount(e.target.value)} /></div>
              <div className="form-group">
                <label>Monnaie</label>
                <select value={feeCur} onChange={(e) => setFeeCur(e.target.value)}>
                  <option value="HTG">HTG</option><option value="USD">USD</option>
                </select>
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: "20px" }}>
              <label>Date d'echeance</label>
              <input type="date" value={feeDate} onChange={(e) => setFeeDate(e.target.value)} />
            </div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setFeeModalOpen(false)}>Annuler</button>
              <button className="btn-primary" onClick={submitFee} disabled={saving}>{saving ? "Enregistrement..." : "Creer"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}