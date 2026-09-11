import React, { useState, useEffect } from "react";
import { useAuth } from "../AuthContext.jsx";
import { getAuthedClient } from "../supabaseClient.js";
import { useYear } from "../YearContext.jsx";

export default function StoreProfitability() {
  const { token } = useAuth();
  const { currentYear } = useYear();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!currentYear) return;
    setLoading(true);
    const supabase = getAuthedClient(token);

    const { data: sales } = await supabase.from("sales").select("id").eq("academic_year_uuid", currentYear.id).neq("statut", "annule");
    const saleIds = (sales || []).map((s) => s.id);

    let lines = [];
    if (saleIds.length > 0) {
      const { data: li } = await supabase.from("sale_items").select("*").in("sale_uuid", saleIds);
      lines = li || [];
    }

    const { data: items } = await supabase.from("items").select("*");

    const parArticleMap = {};
    for (const l of lines) {
      const key = l.item_nom;
      if (!parArticleMap[key]) parArticleMap[key] = { item_nom: key, quantite_vendue: 0, revenu: 0, cout: 0 };
      const qte = Number(l.quantite) || 0;
      const prixVente = Number(l.prix_unitaire) || 0;
      const item = items ? items.find((i) => i.nom === l.item_nom) : null;
      const cout = l.cout_unitaire != null ? Number(l.cout_unitaire) : (item ? Number(item.prix_achat) || 0 : 0);
      parArticleMap[key].quantite_vendue += qte;
      parArticleMap[key].revenu += prixVente * qte;
      parArticleMap[key].cout += cout * qte;
    }
    const parArticle = Object.values(parArticleMap).map((r) => ({
      ...r,
      marge: r.revenu - r.cout,
      marge_pct: r.revenu > 0 ? ((r.revenu - r.cout) / r.revenu) * 100 : 0
    })).sort((a, b) => b.revenu - a.revenu);

    const chiffreAffaires = parArticle.reduce((s, r) => s + r.revenu, 0);
    const coutMarchandises = parArticle.reduce((s, r) => s + r.cout, 0);
    const margeBrute = chiffreAffaires - coutMarchandises;
    const margePct = chiffreAffaires > 0 ? (margeBrute / chiffreAffaires) * 100 : 0;

    const valeurStock = (items || []).reduce((s, i) => {
      const stock = i.a_tailles ? (i.stock_initial_total || 0) : (i.stock_disponible || 0);
      return s + stock * (i.prix_achat || 0);
    }, 0);

    setData({ chiffre_affaires: chiffreAffaires, cout_marchandises: coutMarchandises, marge_brute: margeBrute, marge_pct: margePct, par_article: parArticle, valeur_stock: valeurStock });
    setLoading(false);
  };
  useEffect(() => { load(); }, [token, currentYear]);

  const fmt = (n) => Number(n || 0).toLocaleString();

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Rentabilite Magasin</h1>
          <p className="page-subtitle">Annee {currentYear ? currentYear.nom : ""}</p>
        </div>
      </div>

      {loading || !data ? (
        <p className="page-subtitle">Chargement...</p>
      ) : (
        <>
          <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
            <div className="kpi-card"><div className="kpi-label">Chiffre d''affaires</div><div className="kpi-value">{fmt(data.chiffre_affaires)} HTG</div></div>
            <div className="kpi-card"><div className="kpi-label">Cout des marchandises vendues</div><div className="kpi-value">{fmt(data.cout_marchandises)} HTG</div></div>
            <div className="kpi-card"><div className="kpi-label">Marge brute</div><div className="kpi-value" style={{ color: data.marge_brute >= 0 ? "var(--ok)" : "var(--err)" }}>{fmt(data.marge_brute)} HTG</div></div>
            <div className="kpi-card"><div className="kpi-label">Marge</div><div className="kpi-value">{data.marge_pct.toFixed(1)}%</div></div>
          </div>

          <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(1, 1fr)", maxWidth: "320px" }}>
            <div className="kpi-card"><div className="kpi-label">Valeur actuelle du stock (au cout)</div><div className="kpi-value">{fmt(data.valeur_stock)} HTG</div></div>
          </div>

          <div className="table-card">
            <table className="data-table">
              <thead><tr><th>Article</th><th>Qte vendue</th><th>Revenu</th><th>Cout</th><th>Marge</th><th>Marge %</th></tr></thead>
              <tbody>
                {data.par_article.length === 0 && <tr><td colSpan="6" className="table-empty">Aucune vente enregistree pour cette annee.</td></tr>}
                {data.par_article.map((a) => (
                  <tr key={a.item_nom}>
                    <td>{a.item_nom}</td>
                    <td>{a.quantite_vendue}</td>
                    <td>{fmt(a.revenu)} HTG</td>
                    <td>{fmt(a.cout)} HTG</td>
                    <td style={{ color: a.marge >= 0 ? "var(--ok)" : "var(--err)" }}>{fmt(a.marge)} HTG</td>
                    <td>{a.marge_pct.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}