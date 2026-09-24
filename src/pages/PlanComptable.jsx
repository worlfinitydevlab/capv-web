import React, { useState, useEffect } from "react";
import { useAuth } from "../AuthContext.jsx";
import { getAuthedClient } from "../supabaseClient.js";

const TYPE_LABELS = {
  actif: "Actif",
  passif: "Passif",
  capitaux_propres: "Capitaux propres",
  produits: "Produits",
  charges: "Charges"
};

export default function PlanComptable() {
  const { token, user } = useAuth();
  const [comptes, setComptes] = useState([]);
  const [error, setError] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ numero: "", nom: "", type: "actif", compte_parent_uuid: "", description: "" });

  const load = async () => {
    if (!token) return;
    const supabase = getAuthedClient(token);
    const { data } = await supabase.from("comptes_comptables").select("*").order("numero");
    setComptes(data || []);
  };
  useEffect(() => { load(); }, [token]);

  const racines = comptes.filter((c) => !c.compte_parent_uuid);
  const enfants = (parentId) => comptes.filter((c) => c.compte_parent_uuid === parentId);

  const openNew = (parent) => {
    setForm({ numero: "", nom: "", type: parent ? parent.type : "actif", compte_parent_uuid: parent ? parent.id : "", description: "" });
    setError(""); setModalOpen(true);
  };

  const submit = async () => {
    setError("");
    if (!form.numero.trim()) { setError("Le numero de compte est requis"); return; }
    if (!form.nom.trim()) { setError("Le nom du compte est requis"); return; }
    const supabase = getAuthedClient(token);
    const { error: e } = await supabase.from("comptes_comptables").insert({ ...form, compte_parent_uuid: form.compte_parent_uuid || null, modified_by: user.username });
    if (e) { setError(e.message); return; }
    setModalOpen(false);
    load();
  };

  const toggleStatut = async (c) => {
    const supabase = getAuthedClient(token);
    await supabase.from("comptes_comptables").update({ statut: c.statut === "actif" ? "inactif" : "actif", modified_by: user.username }).eq("id", c.id);
    load();
  };

  const renderCompte = (c, depth) => (
    <React.Fragment key={c.id}>
      <tr style={{ opacity: c.statut === "actif" ? 1 : 0.5 }}>
        <td style={{ paddingLeft: (depth * 24) + "px", fontWeight: depth === 0 ? 700 : 400 }}>{c.numero}</td>
        <td style={{ fontWeight: depth === 0 ? 700 : 400 }}>{c.nom} {c.statut !== "actif" && <span className="badge badge-gray">Inactif</span>}</td>
        <td>
          <button className="btn-sm btn-blue" onClick={() => openNew(c)}>+ Sous-compte</button>
          {depth > 0 && <> <button className="btn-sm btn-gray-cancel" onClick={() => toggleStatut(c)}>{c.statut === "actif" ? "Desactiver" : "Activer"}</button></>}
        </td>
      </tr>
      {enfants(c.id).map((e) => renderCompte(e, depth + 1))}
    </React.Fragment>
  );

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Plan Comptable</h1>
          <p className="page-subtitle">Structure des comptes de l'etablissement</p>
        </div>
      </div>

      {error && !modalOpen && <div className="login-error" style={{ marginBottom: "16px" }}>{error}</div>}

      <div className="table-card">
        <table className="data-table">
          <thead><tr><th>Numero</th><th>Nom</th><th>Actions</th></tr></thead>
          <tbody>
            {racines.map((r) => renderCompte(r, 0))}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "440px" }}>
            <div className="modal-header"><h3>Nouveau compte</h3><button className="modal-close" onClick={() => setModalOpen(false)}>x</button></div>
            {error && <div className="login-error" style={{ marginBottom: "14px" }}>{error}</div>}
            <div className="form-row">
              <div className="form-group"><label>Numero *</label><input value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} placeholder="ex: 1013" /></div>
              <div className="form-group"><label>Type</label>
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: "14px" }}><label>Nom *</label><input value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} /></div>
            <div className="form-group" style={{ marginBottom: "16px" }}><label>Description</label><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setModalOpen(false)}>Annuler</button>
              <button className="btn-primary" onClick={submit}>Creer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}