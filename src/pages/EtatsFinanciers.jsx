import React, { useState, useEffect } from "react";
import { useAuth } from "../AuthContext.jsx";
import { getAuthedClient } from "../supabaseClient.js";

export default function EtatsFinanciers() {
  const { token } = useAuth();
  const [tab, setTab] = useState("bilan");
  const [bilan, setBilan] = useState(null);
  const [resultat, setResultat] = useState(null);
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");

  const computeSoldeCompte = (compte, lignesByCompte) => {
    const lignes = lignesByCompte[compte.id] || [];
    const d = lignes.reduce((s, l) => s + Number(l.debit || 0), 0);
    const c = lignes.reduce((s, l) => s + Number(l.credit || 0), 0);
    const soldeDebiteur = ["actif", "charges"].includes(compte.type);
    return soldeDebiteur ? (d - c) : (c - d);
  };

  const loadBilan = async () => {
    const supabase = getAuthedClient(token);
    const { data: comptes } = await supabase.from("comptes_comptables").select("*").eq("statut", "actif").not("compte_parent_uuid", "is", null).order("numero");
    const { data: lignes } = await supabase.from("lignes_ecriture").select("*");
    const lignesByCompte = {};
    (lignes || []).forEach((l) => {
      if (!lignesByCompte[l.compte_uuid]) lignesByCompte[l.compte_uuid] = [];
      lignesByCompte[l.compte_uuid].push(l);
    });
    const withSolde = (comptes || []).map((c) => ({ ...c, solde: computeSoldeCompte(c, lignesByCompte) }));
    const actifs = withSolde.filter((c) => c.type === "actif");
    const passifs = withSolde.filter((c) => c.type === "passif");
    const capitauxPropres = withSolde.filter((c) => c.type === "capitaux_propres");
    const produits = withSolde.filter((c) => c.type === "produits");
    const charges = withSolde.filter((c) => c.type === "charges");
    const totalActif = actifs.reduce((s, c) => s + c.solde, 0);
    const totalPassif = passifs.reduce((s, c) => s + c.solde, 0);
    const totalCapExist = capitauxPropres.reduce((s, c) => s + c.solde, 0);
    const totalProduits = produits.reduce((s, c) => s + c.solde, 0);
    const totalCharges = charges.reduce((s, c) => s + c.solde, 0);
    const resultatExercice = totalProduits - totalCharges;
    const totalCapitauxPropres = totalCapExist + resultatExercice;
    setBilan({
      date: new Date().toISOString().slice(0, 10),
      actifs, passifs, capitaux_propres: capitauxPropres,
      total_actif: totalActif, total_passif: totalPassif,
      resultat_exercice: resultatExercice, total_capitaux_propres: totalCapitauxPropres,
      total_passif_capitaux: totalPassif + totalCapitauxPropres,
      equilibre: Math.abs(totalActif - (totalPassif + totalCapitauxPropres)) < 0.01
    });
  };

  const loadResultat = async () => {
    const supabase = getAuthedClient(token);
    const { data: comptes } = await supabase.from("comptes_comptables").select("*").eq("statut", "actif").not("compte_parent_uuid", "is", null).in("type", ["produits", "charges"]).order("numero");
    const { data: lignes } = await supabase.from("lignes_ecriture").select("*, ecritures_comptables(date_ecriture)");
    let filteredLignes = lignes || [];
    if (dateDebut) filteredLignes = filteredLignes.filter((l) => l.ecritures_comptables && l.ecritures_comptables.date_ecriture >= dateDebut);
    if (dateFin) filteredLignes = filteredLignes.filter((l) => l.ecritures_comptables && l.ecritures_comptables.date_ecriture <= dateFin);
    const lignesByCompte = {};
    filteredLignes.forEach((l) => {
      if (!lignesByCompte[l.compte_uuid]) lignesByCompte[l.compte_uuid] = [];
      lignesByCompte[l.compte_uuid].push(l);
    });
    const withSolde = (comptes || []).map((c) => ({ ...c, solde: computeSoldeCompte(c, lignesByCompte) }));
    const produits = withSolde.filter((c) => c.type === "produits");
    const charges = withSolde.filter((c) => c.type === "charges");
    const totalProduits = produits.reduce((s, c) => s + c.solde, 0);
    const totalCharges = charges.reduce((s, c) => s + c.solde, 0);
    setResultat({ produits, charges, total_produits: totalProduits, total_charges: totalCharges, resultat_net: totalProduits - totalCharges });
  };

  useEffect(() => { loadBilan(); loadResultat(); }, []);

  const fmt = (n) => Number(n || 0).toLocaleString();

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Etats Financiers</h1>
          <p className="page-subtitle">Bilan et Compte de resultat</p>
        </div>
      </div>

      <div style={{ display: "flex", gap: "10px", marginBottom: "22px" }}>
        <button className={tab === "bilan" ? "btn-primary btn-sm" : "btn-gray-cancel btn-sm"} onClick={() => setTab("bilan")}>Bilan</button>
        <button className={tab === "resultat" ? "btn-primary btn-sm" : "btn-gray-cancel btn-sm"} onClick={() => setTab("resultat")}>Compte de resultat</button>
      </div>

      {tab === "bilan" && bilan && (
        <div>
          <p style={{ color: "var(--text-dim)", marginBottom: "16px" }}>Situation au {bilan.date}</p>
          <div style={{ display: "flex", gap: "20px" }}>
            <div className="form-card" style={{ flex: 1 }}>
              <h3 className="form-card-title">ACTIF</h3>
              {bilan.actifs.map((c) => (
                <div key={c.id} className="receipt-line"><span>{c.numero} - {c.nom}</span><strong>{fmt(c.solde)} HTG</strong></div>
              ))}
              <div className="receipt-total" style={{ marginTop: "14px" }}><span>Total Actif</span><strong>{fmt(bilan.total_actif)} HTG</strong></div>
            </div>
            <div className="form-card" style={{ flex: 1 }}>
              <h3 className="form-card-title">PASSIF</h3>
              {bilan.passifs.map((c) => (
                <div key={c.id} className="receipt-line"><span>{c.numero} - {c.nom}</span><strong>{fmt(c.solde)} HTG</strong></div>
              ))}
              <div className="receipt-line" style={{ marginTop: "10px" }}><span>Total Passif</span><strong>{fmt(bilan.total_passif)} HTG</strong></div>
              <h3 className="form-card-title" style={{ marginTop: "20px" }}>CAPITAUX PROPRES</h3>
              {bilan.capitaux_propres.map((c) => (
                <div key={c.id} className="receipt-line"><span>{c.numero} - {c.nom}</span><strong>{fmt(c.solde)} HTG</strong></div>
              ))}
              <div className="receipt-line"><span>Resultat de l'exercice</span><strong style={{ color: bilan.resultat_exercice >= 0 ? "var(--ok)" : "var(--err)" }}>{fmt(bilan.resultat_exercice)} HTG</strong></div>
              <div className="receipt-total" style={{ marginTop: "14px" }}><span>Total Passif + Capitaux Propres</span><strong>{fmt(bilan.total_passif_capitaux)} HTG</strong></div>
            </div>
          </div>
          <div className="form-card" style={{ marginTop: "18px", background: bilan.equilibre ? "#dcfce7" : "#fee2e2", textAlign: "center" }}>
            <strong style={{ color: bilan.equilibre ? "var(--ok)" : "var(--err)" }}>{bilan.equilibre ? "Bilan equilibre" : "Bilan desequilibre - verifier les ecritures"}</strong>
          </div>
        </div>
      )}

      {tab === "resultat" && resultat && (
        <div>
          <div className="form-card" style={{ marginBottom: "18px" }}>
            <div style={{ display: "flex", gap: "14px", alignItems: "flex-end", flexWrap: "wrap" }}>
              <div className="form-group"><label>Date debut</label><input type="date" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} /></div>
              <div className="form-group"><label>Date fin</label><input type="date" value={dateFin} onChange={(e) => setDateFin(e.target.value)} /></div>
              <button className="btn-sm btn-primary" onClick={loadResultat}>Filtrer</button>
            </div>
          </div>
          <div style={{ display: "flex", gap: "20px" }}>
            <div className="form-card" style={{ flex: 1 }}>
              <h3 className="form-card-title">PRODUITS</h3>
              {resultat.produits.map((c) => (
                <div key={c.id} className="receipt-line"><span>{c.numero} - {c.nom}</span><strong>{fmt(c.solde)} HTG</strong></div>
              ))}
              <div className="receipt-total" style={{ marginTop: "14px" }}><span>Total Produits</span><strong>{fmt(resultat.total_produits)} HTG</strong></div>
            </div>
            <div className="form-card" style={{ flex: 1 }}>
              <h3 className="form-card-title">CHARGES</h3>
              {resultat.charges.map((c) => (
                <div key={c.id} className="receipt-line"><span>{c.numero} - {c.nom}</span><strong>{fmt(c.solde)} HTG</strong></div>
              ))}
              <div className="receipt-total" style={{ marginTop: "14px" }}><span>Total Charges</span><strong>{fmt(resultat.total_charges)} HTG</strong></div>
            </div>
          </div>
          <div className="form-card" style={{ marginTop: "18px", textAlign: "center" }}>
            <p style={{ fontSize: "13px", color: "var(--text-dim)", marginBottom: "8px" }}>Resultat net</p>
            <strong style={{ fontSize: "22px", color: resultat.resultat_net >= 0 ? "var(--ok)" : "var(--err)" }}>{fmt(resultat.resultat_net)} HTG</strong>
          </div>
        </div>
      )}
    </div>
  );
}