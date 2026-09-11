import React, { useState, useEffect } from "react";
import { useAuth } from "../AuthContext.jsx";
import { getAuthedClient } from "../supabaseClient.js";

export default function Sales() {
  const { token } = useAuth();
  const [sales, setSales] = useState([]);
  const [items, setItems] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const supabase = getAuthedClient(token);

        const { data: salesData, error: e1 } = await supabase
          .from("sales")
          .select("id, receipt_number, student_uuid, customer_uuid, montant_total, monnaie, statut, date_emission, date_livraison, nom_caissier, livre_par")
          .order("date_emission", { ascending: false });
        if (e1) throw e1;

        const { data: studentsData, error: e2 } = await supabase
          .from("students")
          .select("id, nom, prenom");
        if (e2) throw e2;

        const { data: customersData, error: e3 } = await supabase
          .from("customers")
          .select("id, nom");
        if (e3) throw e3;

        const studentMap = Object.fromEntries(studentsData.map((s) => [s.id, s.prenom + " " + s.nom]));
        const customerMap = Object.fromEntries(customersData.map((c) => [c.id, c.nom]));

        const enriched = salesData.map((s) => ({
          ...s,
          client: s.student_uuid ? (studentMap[s.student_uuid] || "Eleve") : (s.customer_uuid ? (customerMap[s.customer_uuid] || "Client") : "-")
        }));

        setSales(enriched);
      } catch (e) {
        setError(e.message || "Erreur de chargement");
      }
      setLoading(false);
    };
    load();
  }, [token]);

  const openDetails = async (sale) => {
    if (expanded === sale.id) { setExpanded(null); return; }
    setExpanded(sale.id);
    if (!items.some((it) => it.sale_uuid === sale.id)) {
      try {
        const supabase = getAuthedClient(token);
        const { data, error: e } = await supabase
          .from("sale_items")
          .select("item_nom, quantite, prix_unitaire, etat_livraison, sale_uuid")
          .eq("sale_uuid", sale.id);
        if (e) throw e;
        setItems((prev) => [...prev, ...data]);
      } catch (e) {
        setError(e.message || "Erreur de chargement des articles");
      }
    }
  };

  const fmt = (n) => Number(n || 0).toLocaleString();
  const statutLabel = (s) => ({ reserve: "Reserve", livre: "Livre", partiel: "Partiel", annule: "Annule" }[s] || s);

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Ventes magasin</h1>
        <p className="page-subtitle">Consultation des recus et du statut de livraison</p>
      </div>

      {loading && <p style={{ color: "var(--text-dim)" }}>Chargement...</p>}
      {error && <div className="login-error">{error}</div>}

      {!loading && (
        <div className="form-card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Recu</th><th>Date</th><th>Client</th><th>Montant</th><th>Statut</th><th>Caissier</th><th></th>
              </tr>
            </thead>
            <tbody>
              {sales.length === 0 && <tr><td colSpan="7" className="table-empty">Aucune vente.</td></tr>}
              {sales.map((s) => (
                <React.Fragment key={s.id}>
                  <tr onClick={() => openDetails(s)} style={{ cursor: "pointer" }}>
                    <td>{s.receipt_number}</td>
                    <td>{s.date_emission ? new Date(s.date_emission).toLocaleDateString() : "-"}</td>
                    <td>{s.client}</td>
                    <td>{fmt(s.montant_total)} {s.monnaie}</td>
                    <td>{statutLabel(s.statut)}</td>
                    <td>{s.nom_caissier || "-"}</td>
                    <td>{expanded === s.id ? "haut" : "bas"}</td>
                  </tr>
                  {expanded === s.id && (
                    <tr>
                      <td colSpan="7" style={{ background: "var(--bg-soft, #f8fafc)" }}>
                        <table className="data-table" style={{ margin: "8px 0" }}>
                          <thead><tr><th>Article</th><th>Quantite</th><th>Prix</th><th>Livraison</th></tr></thead>
                          <tbody>
                            {items.filter((it) => it.sale_uuid === s.id).map((it, idx) => (
                              <tr key={idx}>
                                <td>{it.item_nom}</td>
                                <td>{it.quantite}</td>
                                <td>{fmt(it.prix_unitaire)}</td>
                                <td>{it.etat_livraison === "livre" ? "Livre" : "Non livre"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}