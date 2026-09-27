import React, { useState, useEffect } from "react";
import { useAuth } from "../AuthContext.jsx";
import { getAuthedClient } from "../supabaseClient.js";

export default function RevenusDepenses() {
  const { token } = useAuth();
  const [debut, setDebut] = useState("");
  const [fin, setFin] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const f = (d) => d.toISOString().slice(0, 10);
    setDebut(f(first)); setFin(f(last));
  }, []);

  const load = async () => {
    if (!debut || !fin) return;
    setLoading(true);
    const supabase = getAuthedClient(token);

    const { data: payments } = await supabase.from("payments").select("montant").eq("statut", "valide").gte("created_at", debut).lte("created_at", fin + "T23:59:59");
    const fraisTotal = (payments || []).reduce((s, p) => s + Number(p.montant), 0);

    const { data: sales } = await supabase.from("sales").select("montant_total").neq("statut", "annule").gte("date_emission", debut).lte("date_emission", fin);
    const ventesTotal = (sales || []).reduce((s, v) => s + Number(v.montant_total), 0);

    const { data: expenses } = await supabase.from("expenses").select("categorie, montant").eq("statut", "approuve").gte("created_at", debut).lte("created_at", fin + "T23:59:59");
    const depMap = {};
    (expenses || []).forEach((e) => { depMap[e.categorie] = (depMap[e.categorie] || 0) + Number(e.montant); });
    const depParCat = Object.entries(depMap).map(([categorie, total]) => ({ categorie, total })).sort((a, b) => b.total - a.total);
    const depensesTotal = depParCat.reduce((a, d) => a + d.total, 0);

    const revenus = [
      { categorie: "Frais scolaires", total: fraisTotal },
      { categorie: "Ventes magasin", total: ventesTotal }
    ];
    const revenusTotal = fraisTotal + ventesTotal;

    setData({ debut, fin, revenus, revenus_total: revenusTotal, depenses: depParCat, depenses_total: depensesTotal, balance: revenusTotal - depensesTotal });
    setLoading(false);
  };

  useEffect(() => { if (debut && fin) load(); }, [debut, fin]);

  const setToday = () => { const t = new Date().toISOString().slice(0, 10); setDebut(t); setFin(t); };
  const setMonth = () => { const n = new Date(); setDebut(new Date(n.getFullYear(), n.getMonth(), 1).toISOString().slice(0, 10)); setFin(new Date(n.getFullYear(), n.getMonth() + 1, 0).toISOString().slice(0, 10)); };
  const setYear = () => { const n = new Date(); setDebut(n.getFullYear() + "-01-01"); setFin(n.getFullYear() + "-12-31"); };

  const fmt = (n) => Number(n || 0).toLocaleString();
  const palette = ["#2563eb", "#c79a3a", "#16a34a", "#dc2626", "#9333ea", "#0891b2", "#ea580c", "#65a30d"];

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Revenus &amp; Depenses</h1>
        <p className="page-subtitle">Synthese des revenus et depenses</p>
      </div>

      <div className="form-card" style={{ marginBottom: "22px" }}>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "flex-end" }}>
          <div className="form-group" style={{ margin: 0 }}><label>Du</label><input type="date" value={debut} onChange={(e) => setDebut(e.target.value)} /></div>
          <div className="form-group" style={{ margin: 0 }}><label>Au</label><input type="date" value={fin} onChange={(e) => setFin(e.target.value)} /></div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button className="btn-sm btn-blue" onClick={setToday}>Aujourd'hui</button>
            <button className="btn-sm btn-blue" onClick={setMonth}>Ce mois</button>
            <button className="btn-sm btn-blue" onClick={setYear}>Cette annee</button>
          </div>
        </div>
      </div>

      {loading && <div className="dash-placeholder"><p>Calcul en cours...</p></div>}

      {data && !loading && (
        <>
          <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
            <div className="kpi-card"><div className="kpi-label">Revenus</div><div className="kpi-value" style={{ color: "var(--ok)" }}>{fmt(data.revenus_total)} HTG</div></div>
            <div className="kpi-card"><div className="kpi-label">Depenses</div><div className="kpi-value" style={{ color: "var(--err)" }}>{fmt(data.depenses_total)} HTG</div></div>
            <div className="kpi-card"><div className="kpi-label">Balance</div><div className="kpi-value" style={{ color: data.balance >= 0 ? "var(--ok)" : "var(--err)" }}>{fmt(data.balance)} HTG</div></div>
          </div>

          <div className="form-card" style={{ marginBottom: "22px" }}>
            <h3 className="form-card-title">Revenus vs Depenses</h3>
            {(() => {
              const max = Math.max(data.revenus_total, data.depenses_total, 1);
              const barW = 120;
              return (
                <svg viewBox="0 0 400 220" style={{ width: "100%", maxWidth: "400px", height: "auto" }}>
                  <rect x="60" y={200 - (data.revenus_total / max) * 160} width={barW} height={(data.revenus_total / max) * 160} fill="#16a34a" rx="6" />
                  <text x={60 + barW / 2} y="215" textAnchor="middle" fontSize="13" fill="#64748b">Revenus</text>
                  <text x={60 + barW / 2} y={195 - (data.revenus_total / max) * 160} textAnchor="middle" fontSize="12" fontWeight="700" fill="#16a34a">{fmt(data.revenus_total)}</text>
                  <rect x="220" y={200 - (data.depenses_total / max) * 160} width={barW} height={(data.depenses_total / max) * 160} fill="#dc2626" rx="6" />
                  <text x={220 + barW / 2} y="215" textAnchor="middle" fontSize="13" fill="#64748b">Depenses</text>
                  <text x={220 + barW / 2} y={195 - (data.depenses_total / max) * 160} textAnchor="middle" fontSize="12" fontWeight="700" fill="#dc2626">{fmt(data.depenses_total)}</text>
                </svg>
              );
            })()}
          </div>

          <h3 className="form-card-title">Detail des revenus</h3>
          <div className="table-card" style={{ marginBottom: "22px" }}>
            <table className="data-table">
              <thead><tr><th>Source</th><th style={{ textAlign: "right" }}>Montant</th></tr></thead>
              <tbody>
                {data.revenus.map((r, i) => (
                  <tr key={i}><td><strong>{r.categorie}</strong></td><td style={{ textAlign: "right", color: "var(--ok)" }}>{fmt(r.total)} HTG</td></tr>
                ))}
                <tr style={{ background: "var(--bg-soft)" }}><td><strong>Total revenus</strong></td><td style={{ textAlign: "right", fontWeight: 800 }}>{fmt(data.revenus_total)} HTG</td></tr>
              </tbody>
            </table>
          </div>

          <h3 className="form-card-title">Detail des depenses par categorie</h3>
          <div className="table-card">
            <table className="data-table">
              <thead><tr><th>Categorie</th><th style={{ textAlign: "right" }}>Montant</th><th style={{ width: "40%" }}>Part</th></tr></thead>
              <tbody>
                {data.depenses.length === 0 && <tr><td colSpan="3" className="table-empty">Aucune depense sur cette periode.</td></tr>}
                {data.depenses.map((d, i) => {
                  const pct = data.depenses_total > 0 ? (d.total / data.depenses_total) * 100 : 0;
                  return (
                    <tr key={i}>
                      <td><strong>{d.categorie}</strong></td>
                      <td style={{ textAlign: "right", color: "var(--err)" }}>{fmt(d.total)} HTG</td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <div style={{ flex: 1, height: "10px", background: "var(--line)", borderRadius: "5px", overflow: "hidden" }}>
                            <div style={{ width: pct + "%", height: "100%", background: palette[i % palette.length], borderRadius: "5px" }} />
                          </div>
                          <span style={{ fontSize: "12px", color: "var(--text-dim)", minWidth: "42px" }}>{pct.toFixed(1)}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {data.depenses.length > 0 && <tr style={{ background: "var(--bg-soft)" }}><td><strong>Total depenses</strong></td><td style={{ textAlign: "right", fontWeight: 800 }}>{fmt(data.depenses_total)} HTG</td><td></td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}