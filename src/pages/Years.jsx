import React, { useState, useEffect } from "react";
import { useAuth } from "../AuthContext.jsx";
import { getAuthedClient } from "../supabaseClient.js";

export default function Years() {
  const { token, user } = useAuth();
  const [years, setYears] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [nom, setNom] = useState("");
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(true);

  const loadYears = async () => {
    setListLoading(true);
    try {
      const supabase = getAuthedClient(token);
      const { data, error: e } = await supabase.from("academic_years").select("*").order("created_at", { ascending: false });
      if (e) throw e;
      setYears(data);
    } catch (e) {
      setError(e.message || "Impossible de charger les annees");
    }
    setListLoading(false);
  };

  useEffect(() => { loadYears(); }, [token]);

  const handleCreate = async () => {
    setError("");
    if (!nom) { setError("Le nom de l'annee est requis"); return; }
    setLoading(true);
    try {
      const supabase = getAuthedClient(token);
      const { error: e } = await supabase.from("academic_years").insert({
        nom, date_debut: dateDebut || null, date_fin: dateFin || null, statut: "inactive", modified_by: user.username
      });
      if (e) throw e;
      setNom(""); setDateDebut(""); setDateFin("");
      setShowForm(false);
      await loadYears();
    } catch (e) {
      setError(e.message || "Erreur");
    }
    setLoading(false);
  };

  const handleActivate = async (id) => {
    try {
      const supabase = getAuthedClient(token);
      await supabase.from("academic_years").update({ statut: "inactive", modified_by: user.username }).eq("statut", "active");
      const { error: e } = await supabase.from("academic_years").update({ statut: "active", modified_by: user.username }).eq("id", id);
      if (e) throw e;
      await loadYears();
    } catch (e) {
      setError(e.message || "Erreur");
    }
  };

  const handleClose = async (id) => {
    if (!confirm("Cloturer cette annee academique ?")) return;
    try {
      const supabase = getAuthedClient(token);
      const { error: e } = await supabase.from("academic_years").update({ statut: "cloturee", modified_by: user.username }).eq("id", id);
      if (e) throw e;
      await loadYears();
    } catch (e) {
      setError(e.message || "Erreur");
    }
  };

  const badge = (statut) => {
    const map = {
      active: { txt: "Active", cls: "badge-ok" },
      inactive: { txt: "Inactive", cls: "badge-gray" },
      cloturee: { txt: "Cloturee", cls: "badge-err" }
    };
    const b = map[statut] || map.inactive;
    return <span className={"badge " + b.cls}>{b.txt}</span>;
  };

  return (
    <div className="page">
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 className="page-title">Annees academiques</h1>
          <p className="page-subtitle">{years.length} annee(s) enregistree(s)</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? "Annuler" : "+ Nouvelle annee"}
        </button>
      </div>

      {showForm && (
        <div className="form-card">
          <h3 className="form-card-title">Creer une annee academique</h3>
          {error && <div className="login-error">{error}</div>}
          <div className="form-row">
            <div className="form-group">
              <label>Nom de l'annee *</label>
              <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Ex: 2026-2027" />
            </div>
            <div className="form-group">
              <label>Date de debut</label>
              <input type="date" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Date de fin</label>
              <input type="date" value={dateFin} onChange={(e) => setDateFin(e.target.value)} />
            </div>
          </div>
          <button className="btn-primary" onClick={handleCreate} disabled={loading}>
            {loading ? "Creation..." : "Creer l'annee"}
          </button>
        </div>
      )}

      {error && !showForm && <div className="login-error" style={{ marginBottom: "16px" }}>{error}</div>}
      {listLoading && <p style={{ color: "var(--text-dim)" }}>Chargement...</p>}

      {!listLoading && (
        <div className="table-card">
          <table className="data-table">
            <thead>
              <tr><th>Nom</th><th>Debut</th><th>Fin</th><th>Statut</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {years.length === 0 && (
                <tr><td colSpan="5" className="table-empty">Aucune annee academique. Creez-en une pour commencer.</td></tr>
              )}
              {years.map((y) => (
                <tr key={y.id}>
                  <td><strong>{y.nom}</strong></td>
                  <td>{y.date_debut || "-"}</td>
                  <td>{y.date_fin || "-"}</td>
                  <td>{badge(y.statut)}</td>
                  <td>
                    <div className="table-actions">
                      {y.statut !== "active" && y.statut !== "cloturee" && (
                        <button className="btn-sm btn-green" onClick={() => handleActivate(y.id)}>Activer</button>
                      )}
                      {y.statut !== "cloturee" && (
                        <button className="btn-sm btn-red" onClick={() => handleClose(y.id)}>Cloturer</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}