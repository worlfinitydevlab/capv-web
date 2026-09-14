import React, { useState, useEffect } from "react";
import { useAuth } from "../AuthContext.jsx";
import { getAuthedClient } from "../supabaseClient.js";
import { useYear } from "../YearContext.jsx";
import StudentProfile from "../components/StudentProfile.jsx";

const TYPES = {
  bourse_complete: "Bourse complete (100%)",
  demi_bourse: "Demi-bourse (50%)",
  reduction_fixe: "Reduction fixe",
  reduction_pct: "Reduction en pourcentage",
  exoneration: "Exoneration de frais",
  exceptionnelle: "Reduction exceptionnelle"
};

export default function Reductions() {
  const { token, user } = useAuth();
  const { currentYear: year } = useYear();
  const [list, setList] = useState([]);
  const [studentMap, setStudentMap] = useState({});
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [profileId, setProfileId] = useState(null);
  const [error, setError] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [allStudents, setAllStudents] = useState([]);
  const [studentSearch, setStudentSearch] = useState("");
  const [selStudent, setSelStudent] = useState(null);
  const [allFees, setAllFees] = useState([]);
  const [form, setForm] = useState({ type: "demi_bourse", portee: "globale", fee_ids: [], valeur: "", mode: "pourcentage", motif: "", autorite: "", date_debut: "", date_fin: "" });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const supabase = getAuthedClient(token);
      let redsQuery = supabase.from("reductions").select("*").order("created_at", { ascending: false });
      if (year) redsQuery = redsQuery.or("academic_year_uuid.is.null,academic_year_uuid.eq." + year.id);
      const { data: reds, error: e1 } = await redsQuery;
      if (e1) throw e1;

      const { data: students, error: e2 } = await supabase.from("students").select("id, nom, prenom, matricule");
      if (e2) throw e2;
      const sMap = Object.fromEntries(students.map((s) => [s.id, s]));
      setStudentMap(sMap);
      setAllStudents(students);

      const { data: fees, error: e3 } = await supabase.from("class_fees").select("id, nom, montant, monnaie, statut").eq("statut", "actif");
      if (e3) throw e3;
      setAllFees(fees);

      setList(reds);
    } catch (e) {
      setError(e.message || "Erreur de chargement");
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [token, year]);

  const filtered = list.filter((r) => {
    if (!search) return true;
    const s = studentMap[r.student_uuid];
    if (!s) return false;
    const q = search.toLowerCase();
    return (s.nom + " " + s.prenom + " " + s.matricule).toLowerCase().includes(q);
  });

  const studentResults = studentSearch
    ? allStudents.filter((s) => (s.nom + " " + s.prenom + " " + s.matricule).toLowerCase().includes(studentSearch.toLowerCase())).slice(0, 8)
    : [];

  const openModal = () => {
    setSelStudent(null); setStudentSearch("");
    setForm({ type: "demi_bourse", portee: "globale", fee_ids: [], valeur: "", mode: "pourcentage", motif: "", autorite: user.nom_complet || user.username, date_debut: "", date_fin: "" });
    setError(""); setModalOpen(true);
  };

  const setField = (k, v) => setForm({ ...form, [k]: v });
  const toggleFee = (id) => setForm((f) => ({ ...f, fee_ids: f.fee_ids.includes(id) ? f.fee_ids.filter((x) => x !== id) : [...f.fee_ids, id] }));

  const submit = async () => {
    setError("");
    if (!selStudent) { setError("Choisissez un eleve"); return; }
    if (form.portee === "ciblee" && form.fee_ids.length === 0) { setError("Choisissez au moins un frais"); return; }
    setSaving(true);
    try {
      let mode = form.mode;
      if (form.type === "bourse_complete" || form.type === "demi_bourse" || form.type === "exoneration") mode = "auto";
      else if (form.type === "reduction_pct") mode = "pourcentage";
      else if (form.type === "reduction_fixe") mode = "montant";

      const supabase = getAuthedClient(token);
      const baseRow = {
        student_uuid: selStudent.id,
        academic_year_uuid: year ? year.id : null,
        type: form.type, portee: form.portee,
        valeur: Number(form.valeur) || 0, mode,
        motif: form.motif || null, autorite: form.autorite || null,
        date_debut: form.date_debut || null, date_fin: form.date_fin || null,
        statut: "active", modified_by: user.username
      };
      const rows = form.portee === "ciblee"
        ? form.fee_ids.map((fid) => ({ ...baseRow, fee_uuid: fid }))
        : [{ ...baseRow, fee_uuid: null }];
      const { error: e } = await supabase.from("reductions").insert(rows);
      if (e) throw e;
      setModalOpen(false);
      load();
    } catch (e) {
      setError(e.message || "Erreur");
    }
    setSaving(false);
  };

  const cancelReduction = async (id) => {
    if (!confirm("Annuler cette reduction ?")) return;
    try {
      const supabase = getAuthedClient(token);
      const { error: e } = await supabase.from("reductions").update({ statut: "annulee", modified_by: user.username }).eq("id", id);
      if (e) throw e;
      load();
    } catch (e) {
      setError(e.message || "Erreur");
    }
  };

  const fmt = (n) => Number(n || 0).toLocaleString();
  const needsValeur = form.type === "reduction_fixe" || form.type === "reduction_pct" || form.type === "exceptionnelle";

  if (loading) return <div className="page"><p style={{ color: "var(--text-dim)" }}>Chargement...</p></div>;

  return (
    <div className="page">
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 className="page-title">Bourses & Reductions</h1>
          <p className="page-subtitle">{year ? "Annee " + year.nom + " - " : ""}{list.filter((r) => r.statut === "active").length} reduction(s) active(s)</p>
        </div>
        <button className="btn-primary" onClick={openModal}>+ Accorder une reduction</button>
      </div>

      {error && !modalOpen && <div className="login-error" style={{ marginBottom: "16px" }}>{error}</div>}

      <div className="form-card" style={{ marginBottom: "22px" }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un eleve..."
          style={{ width: "100%", maxWidth: "400px", padding: "11px 14px", borderRadius: "10px", border: "1.5px solid var(--line)", background: "var(--bg-soft)", fontSize: "14px" }} />
      </div>

      <div className="table-card">
        <table className="data-table">
          <thead><tr><th>Eleve</th><th>Type</th><th>Portee</th><th>Valeur</th><th>Motif</th><th>Autorite</th><th>Statut</th><th>Actions</th></tr></thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan="8" className="table-empty">Aucune reduction.</td></tr>}
            {filtered.map((r) => {
              const s = studentMap[r.student_uuid];
              return (
                <tr key={r.id} style={{ opacity: r.statut === "annulee" ? 0.5 : 1, cursor: "pointer" }} onClick={() => s && setProfileId(r.student_uuid)}>
                  <td><strong>{s ? s.prenom + " " + s.nom : "?"}</strong><br /><span style={{ fontSize: "12px", color: "var(--text-dim)" }}>{s ? s.matricule : ""}</span></td>
                  <td>{TYPES[r.type] || r.type}</td>
                  <td>{r.portee === "ciblee" ? <span className="badge badge-blue">Ciblee</span> : <span className="badge badge-gray">Globale</span>}</td>
                  <td>{r.type === "bourse_complete" ? "100%" : r.type === "demi_bourse" ? "50%" : r.type === "exoneration" ? "Exonere" : r.mode === "pourcentage" ? r.valeur + "%" : fmt(r.valeur) + " HTG"}</td>
                  <td>{r.motif || "-"}</td>
                  <td>{r.autorite || "-"}</td>
                  <td>{r.statut === "active" ? <span className="badge badge-ok">Active</span> : <span className="badge badge-gray">Annulee</span>}</td>
                  <td>{r.statut === "active" && <button className="btn-sm btn-red" onClick={(e) => { e.stopPropagation(); cancelReduction(r.id); }}>Annuler</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal-card modal-large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h3>Accorder une reduction</h3><button className="modal-close" onClick={() => setModalOpen(false)}>x</button></div>
            {error && <div className="login-error" style={{ marginBottom: "16px" }}>{error}</div>}

            <div className="form-group" style={{ marginBottom: "16px", position: "relative" }}>
              <label>Eleve *</label>
              {selStudent
                ? <div className="selected-client">{selStudent.prenom} {selStudent.nom} ({selStudent.matricule}) <button onClick={() => setSelStudent(null)} className="chip-x">x</button></div>
                : <input value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} placeholder="Rechercher un eleve..." />}
              {studentResults.length > 0 && !selStudent && (
                <div className="search-dropdown">
                  {studentResults.map((s) => (
                    <div key={s.id} className="search-item" onClick={() => { setSelStudent(s); setStudentSearch(""); }}>
                      <div><strong>{s.prenom} {s.nom}</strong><div style={{ fontSize: "12px", color: "var(--text-dim)" }}>{s.matricule}</div></div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="form-row">
              <div className="form-group"><label>Type *</label>
                <select value={form.type} onChange={(e) => setField("type", e.target.value)}>
                  {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="form-group"><label>Portee</label>
                <select value={form.portee} onChange={(e) => setField("portee", e.target.value)}>
                  <option value="globale">Toute la scolarite</option>
                  <option value="ciblee">Un frais specifique</option>
                </select>
              </div>
            </div>

            {form.portee === "ciblee" && (
              <div className="form-group" style={{ marginBottom: "16px" }}>
                <label>Frais concernes (un ou plusieurs)</label>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "180px", overflowY: "auto", border: "1.5px solid var(--line)", borderRadius: "8px", padding: "10px", background: "var(--bg-soft)" }}>
                  {allFees.map((f) => (
                    <label key={f.id} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", cursor: "pointer", fontWeight: 400 }}>
                      <input type="checkbox" checked={form.fee_ids.includes(f.id)} onChange={() => toggleFee(f.id)} />
                      {f.nom} ({fmt(f.montant)} {f.monnaie})
                    </label>
                  ))}
                </div>
              </div>
            )}

            {needsValeur && (
              <div className="form-row">
                <div className="form-group"><label>Valeur</label><input type="number" value={form.valeur} onChange={(e) => setField("valeur", e.target.value)} /></div>
                {form.type === "exceptionnelle" && (
                  <div className="form-group"><label>Mode</label><select value={form.mode} onChange={(e) => setField("mode", e.target.value)}><option value="pourcentage">Pourcentage</option><option value="montant">Montant fixe</option></select></div>
                )}
              </div>
            )}

            <div className="form-group" style={{ marginBottom: "16px" }}><label>Motif</label><input value={form.motif} onChange={(e) => setField("motif", e.target.value)} placeholder="ex: Situation familiale, merite..." /></div>
            <div className="form-row">
              <div className="form-group"><label>Autorite ayant accorde</label><input value={form.autorite} onChange={(e) => setField("autorite", e.target.value)} /></div>
              <div className="form-group"><label>Debut validite</label><input type="date" value={form.date_debut} onChange={(e) => setField("date_debut", e.target.value)} /></div>
              <div className="form-group"><label>Fin validite</label><input type="date" value={form.date_fin} onChange={(e) => setField("date_fin", e.target.value)} /></div>
            </div>

            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "12px" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setModalOpen(false)}>Annuler</button>
              <button className="btn-primary" onClick={submit} disabled={saving}>{saving ? "Enregistrement..." : "Accorder"}</button>
            </div>
          </div>
        </div>
      )}
      {profileId && <StudentProfile studentId={profileId} onClose={() => setProfileId(null)} />}
    </div>
  );
}
