import React, { useState, useEffect } from "react";
import { useAuth } from "../AuthContext.jsx";
import { getAuthedClient } from "../supabaseClient.js";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const MOIS = ["Jan", "Fev", "Mar", "Avr", "Mai", "Jun", "Jul", "Aou", "Sep", "Oct", "Nov", "Dec"];

export default function Dashboard() {
  const { token } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const supabase = getAuthedClient(token);

        const { data: students, error: e1 } = await supabase
          .from("students")
          .select("id, statut");
        if (e1) throw e1;

        const { data: payments, error: e2 } = await supabase
          .from("payments")
          .select("montant, monnaie, created_at");
        if (e2) throw e2;

        const { data: classes, error: e3 } = await supabase
          .from("classes")
          .select("id, nom");
        if (e3) throw e3;

        const totalHTG = payments.filter((p) => p.monnaie === "HTG").reduce((s, p) => s + Number(p.montant), 0);
        const totalUSD = payments.filter((p) => p.monnaie === "USD").reduce((s, p) => s + Number(p.montant), 0);
        const activeStudents = students.filter((s) => s.statut === "actif").length;

        const now = new Date();
        const monthly = [];
        for (let i = 5; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const label = MOIS[d.getMonth()];
          const total = payments
            .filter((p) => {
              const pd = new Date(p.created_at);
              return pd.getFullYear() === d.getFullYear() && pd.getMonth() === d.getMonth() && p.monnaie === "HTG";
            })
            .reduce((s, p) => s + Number(p.montant), 0);
          monthly.push({ mois: label, montant: total });
        }

        setData({
          nbEleves: students.length,
          activeStudents,
          nbPaiements: payments.length,
          totalHTG,
          totalUSD,
          nbClasses: classes.length,
          monthly
        });
      } catch (e) {
        setError(e.message || "Erreur de chargement");
      }
      setLoading(false);
    };
    load();
  }, [token]);

  const fmt = (n) => Number(n || 0).toLocaleString();

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Tableau de bord</h1>
        <p className="page-subtitle">Vue d'ensemble financiere et scolaire</p>
      </div>

      {loading && <p style={{ color: "var(--text-dim)" }}>Chargement...</p>}
      {error && <div className="login-error">{error}</div>}

      {data && (
        <>
          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", marginBottom: "24px" }}>
            <div className="form-card" style={{ flex: "1", minWidth: "180px" }}>
              <h3 className="form-card-title">Eleves actifs</h3>
              <p style={{ fontSize: "30px", fontWeight: 800, color: "var(--navy)", fontFamily: "Georgia, serif" }}>{data.activeStudents}</p>
              <p style={{ fontSize: "12px", color: "var(--text-dim)" }}>sur {data.nbEleves} au total</p>
            </div>
            <div className="form-card" style={{ flex: "1", minWidth: "180px" }}>
              <h3 className="form-card-title">Classes</h3>
              <p style={{ fontSize: "30px", fontWeight: 800, color: "var(--navy)", fontFamily: "Georgia, serif" }}>{data.nbClasses}</p>
            </div>
            <div className="form-card" style={{ flex: "1", minWidth: "180px" }}>
              <h3 className="form-card-title">Encaisse (HTG)</h3>
              <p style={{ fontSize: "30px", fontWeight: 800, color: "var(--navy)", fontFamily: "Georgia, serif" }}>{fmt(data.totalHTG)}</p>
              <p style={{ fontSize: "12px", color: "var(--text-dim)" }}>{data.nbPaiements} paiement(s)</p>
            </div>
            <div className="form-card" style={{ flex: "1", minWidth: "180px" }}>
              <h3 className="form-card-title">Encaisse (USD)</h3>
              <p style={{ fontSize: "30px", fontWeight: 800, color: "var(--navy)", fontFamily: "Georgia, serif" }}>{fmt(data.totalUSD)}</p>
            </div>
          </div>

          <div className="form-card">
            <h3 className="form-card-title">Encaissements des 6 derniers mois (HTG)</h3>
            <div style={{ width: "100%", height: "260px" }}>
              <ResponsiveContainer>
                <BarChart data={data.monthly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--line, #e2e8f0)" />
                  <XAxis dataKey="mois" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip formatter={(v) => fmt(v) + " HTG"} />
                  <Bar dataKey="montant" fill="#1e2a78" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );
}