import React, { useState, useEffect } from "react";
import { useAuth } from "../AuthContext.jsx";
import { getAuthedClient } from "../supabaseClient.js";

export default function MiscFees() {
  const { token } = useAuth();
  const [payments, setPayments] = useState([]);
  const [feeTypes, setFeeTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const supabase = getAuthedClient(token);
      const { data: pays, error: e1 } = await supabase.from("misc_fee_payments").select("*").order("created_at", { ascending: false }).limit(300);
      if (e1) throw e1;
      const { data: types } = await supabase.from("misc_fee_types").select("*").order("nom");
      setFeeTypes(types || []);

      const studentIds = [...new Set((pays || []).filter((p) => p.student_uuid).map((p) => p.student_uuid))];
      const customerIds = [...new Set((pays || []).filter((p) => p.customer_uuid).map((p) => p.customer_uuid))];
      const { data: students } = studentIds.length ? await supabase.from("students").select("id, nom, prenom, matricule").in("id", studentIds) : { data: [] };
      const { data: customers } = customerIds.length ? await supabase.from("customers").select("id, nom").in("id", customerIds) : { data: [] };

      const enriched = (pays || []).map((p) => {
        const st = students && students.find((s) => s.id === p.student_uuid);
        const cu = customers && customers.find((c) => c.id === p.customer_uuid);
        return { ...p, payeur: st ? st.prenom + " " + st.nom + " (" + st.matricule + ")" : (cu ? cu.nom : "?") };
      });
      setPayments(enriched);
    } catch (e) {
      setError(e.message || "Erreur de chargement");
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [token]);

  const fmt = (n) => Number(n || 0).toLocaleString();
  const filtered = payments.filter((p) => !search || (p.receipt_number + " " + p.payeur + " " + p.fee_type_nom).toLowerCase().includes(search.toLowerCase()));

  if (loading) return <div className="page"><p style={{ color: "var(--text-dim)" }}>Chargement...</p></div>;

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Frais Divers</h1>
        <p className="page-subtitle">Consultation seule - l'encaissement se fait depuis le poste local (.exe)</p>
      </div>

      {error && <div className="login-error" style={{ marginBottom: "16px" }}>{error}</div>}

      <div className="form-card" style={{ marginBottom: "20px" }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher (recu, payeur, type)..."
          style={{ width: "100%", maxWidth: "400px", padding: "11px 14px", borderRadius: "10px", border: "1.5px solid var(--line)", background: "var(--bg-soft)", fontSize: "14px" }} />
      </div>

      <div className="table-card">
        <table className="data-table">
          <thead><tr><th>Recu</th><th>Date</th><th>Payeur</th><th>Type</th><th>Montant</th><th>Statut</th></tr></thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan="6" className="table-empty">Aucun paiement.</td></tr>}
            {filtered.map((p) => (
              <tr key={p.id} style={{ opacity: p.statut === "annule" ? 0.5 : 1 }}>
                <td><strong style={{ color: "var(--accent)" }}>{p.receipt_number}</strong></td>
                <td>{new Date(p.created_at).toLocaleString()}</td>
                <td>{p.payeur}</td>
                <td>{p.fee_type_nom}</td>
                <td><strong>{fmt(p.montant)} {p.monnaie}</strong></td>
                <td>{p.statut === "valide" ? <span className="badge badge-ok">Valide</span> : <span className="badge badge-gray">Annule</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {feeTypes.length > 0 && (
        <div className="form-card" style={{ marginTop: "24px" }}>
          <h3 className="form-card-title">Types de frais</h3>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            {feeTypes.map((t) => (
              <span key={t.id} className="section-chip">{t.nom} - {fmt(t.montant_defaut)} {t.monnaie}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}