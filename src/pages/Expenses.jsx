import React, { useState, useEffect } from "react";
import { useAuth } from "../AuthContext.jsx";
import { getAuthedClient } from "../supabaseClient.js";
import { useYear } from "../YearContext.jsx";

export default function Expenses() {
  const { token, user } = useAuth();
  const isAdmin = user && user.role === "Administrateur";
  const { currentYear: year } = useYear();
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [statut, setStatut] = useState("tous");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ categorie: "", categorieLibre: "", montant: "", monnaie: "HTG", description: "" });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const supabase = getAuthedClient(token);
      const { data: cats, error: e1 } = await supabase.from("expense_categories").select("*").order("nom");
      if (e1) throw e1;
      setCategories(cats || []);

      if (year) {
        let query = supabase.from("expenses").select("*").eq("academic_year_uuid", year.id).order("created_at", { ascending: false });
        if (statut !== "tous") query = query.eq("statut", statut);
        const { data: exps, error: e2 } = await query;
        if (e2) throw e2;
        setExpenses(exps || []);
      } else {
        setExpenses([]);
      }
    } catch (e) {
      setError(e.message || "Erreur de chargement");
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [token, statut, year]);

  const filtered = expenses.filter((e) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (e.categorie + " " + (e.description || "")).toLowerCase().includes(q);
  });

  const setField = (k, v) => setForm({ ...form, [k]: v });

  const openModal = () => {
    setForm({ categorie: "", categorieLibre: "", montant: "", monnaie: "HTG", description: "" });
    setError(""); setModalOpen(true);
  };

  const submit = async () => {
    setError("");
    const cat = form.categorie === "__autre__" ? form.categorieLibre : form.categorie;
    if (!cat) { setError("Choisissez ou saisissez une categorie"); return; }
    if (!form.montant || Number(form.montant) <= 0) { setError("Montant invalide"); return; }
    setSaving(true);
    try {
      const supabase = getAuthedClient(token);
      const { error: e } = await supabase.from("expenses").insert({
        categorie: cat, montant: Number(form.montant), monnaie: form.monnaie,
        description: form.description || null, statut: "en_attente",
        academic_year_uuid: year ? year.id : null, modified_by: user.username
      });
      if (e) throw e;
      setModalOpen(false);
      load();
    } catch (e) {
      setError(e.message || "Erreur");
    }
    setSaving(false);
  };

  const decide = async (id, decision) => {
    try {
      const supabase = getAuthedClient(token);
      const { error: e } = await supabase.from("expenses").update({ statut: decision, modified_by: user.username }).eq("id", id);
      if (e) throw e;
      load();
    } catch (e) {
      setError(e.message || "Erreur (droits administrateur requis)");
    }
  };

  const cancelExpense = async (id) => {
    if (!confirm("Annuler cette depense approuvee ?")) return;
    try {
      const supabase = getAuthedClient(token);
      const { error: e } = await supabase.from("expenses").update({ statut: "annule", modified_by: user.username }).eq("id", id);
      if (e) throw e;
      load();
    } catch (e) {
      setError(e.message || "Erreur (droits administrateur requis)");
    }
  };

  const fmt = (n) => Number(n || 0).toLocaleString();
  const totalApprouve = expenses.filter((e) => e.statut === "approuve").reduce((a, e) => a + Number(e.montant), 0);
  const nbAttente = expenses.filter((e) => e.statut === "en_attente").length;

  const badge = (st) => {
    const map = {
      en_attente: { t: "En attente", c: "badge-gold" },
      approuve: { t: "Approuvee", c: "badge-ok" },
      rejete: { t: "Rejetee", c: "badge-err" },
      annule: { t: "Annulee", c: "badge-gray" }
    };
    const b = map[st] || map.en_attente;
    return <span className={"badge " + b.c}>{b.t}</span>;
  };

  if (loading) return <div className="page"><p style={{ color: "var(--text-dim)" }}>Chargement...</p></div>;

  if (!year) {
    return <div className="page"><div className="page-header"><h1 className="page-title">Depenses</h1></div><div className="dash-placeholder"><p>Aucune annee active.</p></div></div>;
  }

  return (
    <div className="page">
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 className="page-title">Depenses</h1>
          <p className="page-subtitle">Annee {year.nom} - {expenses.length} depense(s)</p>
        </div>
        <button className="btn-primary" onClick={openModal}>+ Nouvelle depense</button>
      </div>

      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        <div className="kpi-card"><div className="kpi-label">Total approuve</div><div className="kpi-value" style={{ color: "var(--err)" }}>{fmt(totalApprouve)} HTG</div></div>
        <div className="kpi-card"><div className="kpi-label">En attente</div><div className="kpi-value" style={{ color: "var(--gold)" }}>{nbAttente}</div></div>
        <div className="kpi-card"><div className="kpi-label">Total operations</div><div className="kpi-value">{expenses.length}</div></div>
      </div>

      {error && <div className="login-error" style={{ marginBottom: "16px" }}>{error}</div>}

      <div className="form-card" style={{ marginBottom: "22px" }}>
        <div style={{ display: "flex", gap: "14px", flexWrap: "wrap" }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher categorie, description..."
            style={{ flex: 1, minWidth: "240px", padding: "11px 14px", borderRadius: "10px", border: "1.5px solid var(--line)", background: "var(--bg-soft)", fontSize: "14px" }} />
          <select value={statut} onChange={(e) => setStatut(e.target.value)}
            style={{ padding: "11px 14px", borderRadius: "10px", border: "1.5px solid var(--line)", background: "var(--bg-soft)", fontSize: "14px" }}>
            <option value="tous">Tous statuts</option>
            <option value="en_attente">En attente</option>
            <option value="approuve">Approuvees</option>
            <option value="rejete">Rejetees</option>
            <option value="annule">Annulees</option>
          </select>
        </div>
      </div>

      <div className="table-card">
        <table className="data-table">
          <thead><tr><th>Date</th><th>Categorie</th><th>Description</th><th>Montant</th><th>Statut</th><th>Actions</th></tr></thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan="6" className="table-empty">Aucune depense.</td></tr>}
            {filtered.map((e) => (
              <tr key={e.id} style={{ opacity: (e.statut === "annule" || e.statut === "rejete") ? 0.55 : 1 }}>
                <td>{new Date(e.created_at).toLocaleDateString()}</td>
                <td><strong>{e.categorie}</strong></td>
                <td>{e.description || "-"}</td>
                <td><strong>{fmt(e.montant)} {e.monnaie}</strong></td>
                <td>{badge(e.statut)}</td>
                <td>
                  {isAdmin && e.statut === "en_attente" && (
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button className="btn-sm btn-green" onClick={() => decide(e.id, "approuve")}>Approuver</button>
                      <button className="btn-sm btn-red" onClick={() => decide(e.id, "rejete")}>Rejeter</button>
                    </div>
                  )}
                  {isAdmin && e.statut === "approuve" && (
                    <button className="btn-sm btn-red" onClick={() => cancelExpense(e.id)}>Annuler</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "460px" }}>
            <div className="modal-header"><h3>Nouvelle depense</h3><button className="modal-close" onClick={() => setModalOpen(false)}>x</button></div>
            {error && <div className="login-error" style={{ marginBottom: "14px" }}>{error}</div>}
            <div className="form-group" style={{ marginBottom: "14px" }}>
              <label>Categorie</label>
              <select value={form.categorie} onChange={(e) => setField("categorie", e.target.value)}>
                <option value="">-- Choisir --</option>
                {categories.map((c) => <option key={c.id} value={c.nom}>{c.nom}</option>)}
                <option value="__autre__">Autre (preciser)...</option>
              </select>
            </div>
            {form.categorie === "__autre__" && (
              <div className="form-group" style={{ marginBottom: "14px" }}>
                <label>Preciser la categorie</label>
                <input value={form.categorieLibre} onChange={(e) => setField("categorieLibre", e.target.value)} />
              </div>
            )}
            <div className="form-row">
              <div className="form-group"><label>Montant</label><input type="number" value={form.montant} onChange={(e) => setField("montant", e.target.value)} /></div>
              <div className="form-group">
                <label>Monnaie</label>
                <select value={form.monnaie} onChange={(e) => setField("monnaie", e.target.value)}>
                  <option value="HTG">HTG</option><option value="USD">USD</option>
                </select>
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: "20px" }}>
              <label>Description</label>
              <input value={form.description} onChange={(e) => setField("description", e.target.value)} />
            </div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setModalOpen(false)}>Annuler</button>
              <button className="btn-primary" onClick={submit} disabled={saving}>{saving ? "Enregistrement..." : "Soumettre"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
