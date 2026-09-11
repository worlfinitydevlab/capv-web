import React, { useState } from "react";
import { useAuth } from "../AuthContext.jsx";
import { getAuthedClient } from "../supabaseClient.js";
import { exportExcel, exportPDF } from "../exportUtils.js";
import { useYear } from "../YearContext.jsx";

function calculerReductions(reds, feesList) {
  const parFrais = {};
  for (const r of reds) {
    if (r.portee === "ciblee" && r.fee_uuid) {
      const frais = feesList.find((f) => f.id === r.fee_uuid);
      if (!frais) continue;
      let m = 0;
      if (r.type === "exoneration" || r.type === "bourse_complete") m = frais.montant;
      else if (r.type === "demi_bourse") m = frais.montant * 0.5;
      else if (r.mode === "pourcentage") m = frais.montant * (r.valeur / 100);
      else m = Math.min(r.valeur, frais.montant);
      m = Math.round(m);
      parFrais[frais.id] = Math.min(frais.montant, (parFrais[frais.id] || 0) + m);
    } else {
      for (const frais of feesList) {
        let m = 0;
        if (r.type === "bourse_complete") m = frais.montant;
        else if (r.type === "demi_bourse") m = frais.montant * 0.5;
        else if (r.mode === "pourcentage") m = frais.montant * (r.valeur / 100);
        else if (r.mode === "montant") continue;
        m = Math.round(m);
        parFrais[frais.id] = Math.min(frais.montant, (parFrais[frais.id] || 0) + m);
      }
    }
  }
  for (const r of reds) {
    if ((r.portee !== "ciblee") && r.mode === "montant" && r.type !== "bourse_complete" && r.type !== "demi_bourse") {
      let reste = r.valeur;
      for (const frais of feesList) {
        if (reste <= 0) break;
        const deja = parFrais[frais.id] || 0;
        const dispo = frais.montant - deja;
        const app = Math.min(reste, dispo);
        parFrais[frais.id] = deja + app;
        reste -= app;
      }
    }
  }
  return parFrais;
}

export default function Reports() {
  const { token } = useAuth();
  const { currentYear: year } = useYear();
  const now = new Date();
  const [debut, setDebut] = useState(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10));
  const [fin, setFin] = useState(new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10));
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const buildStudents = async () => {
    const supabase = getAuthedClient(token);
    const { data } = await supabase.from("students").select("matricule, nom, prenom, sexe, telephone, nom_parent, telephone_parent, statut").order("nom");
    return {
      columns: [
        { header: "Matricule", key: "matricule" }, { header: "Nom", key: "nom" }, { header: "Prenom", key: "prenom" },
        { header: "Sexe", key: "sexe" }, { header: "Telephone", key: "telephone" },
        { header: "Parent", key: "nom_parent" }, { header: "Tel. parent", key: "telephone_parent" }, { header: "Statut", key: "statut" }
      ],
      rows: data || []
    };
  };

  const buildPayments = async () => {
    const supabase = getAuthedClient(token);
    if (!year) return { columns: [], rows: [] };
    const { data: pays } = await supabase.from("payments").select("receipt_number, fee_nom, montant, monnaie, nom_caissier, statut, created_at, student_uuid").eq("academic_year_uuid", year.id).order("created_at", { ascending: false });
    const { data: students } = await supabase.from("students").select("id, nom, prenom");
    const sMap = Object.fromEntries((students || []).map((s) => [s.id, s.prenom + " " + s.nom]));
    const rows = (pays || []).map((p) => ({ ...p, eleve: sMap[p.student_uuid] || "-", date: new Date(p.created_at).toLocaleDateString() }));
    return {
      columns: [
        { header: "Recu", key: "receipt_number" }, { header: "Date", key: "date" }, { header: "Eleve", key: "eleve" },
        { header: "Frais", key: "fee_nom" }, { header: "Montant", key: "montant" }, { header: "Monnaie", key: "monnaie" },
        { header: "Caissier", key: "nom_caissier" }, { header: "Statut", key: "statut" }
      ],
      rows
    };
  };

  const buildSales = async () => {
    const supabase = getAuthedClient(token);
    if (!year) return { columns: [], rows: [] };
    const { data: sales } = await supabase.from("sales").select("receipt_number, montant_total, monnaie, statut, date_emission, nom_caissier, student_uuid, customer_uuid").eq("academic_year_uuid", year.id).order("date_emission", { ascending: false });
    const { data: students } = await supabase.from("students").select("id, nom, prenom");
    const { data: customers } = await supabase.from("customers").select("id, nom");
    const sMap = Object.fromEntries((students || []).map((s) => [s.id, s.prenom + " " + s.nom]));
    const cMap = Object.fromEntries((customers || []).map((c) => [c.id, c.nom]));
    const rows = (sales || []).map((s) => ({
      ...s,
      client: s.student_uuid ? (sMap[s.student_uuid] || "Eleve") : (s.customer_uuid ? (cMap[s.customer_uuid] || "Client") : "-"),
      date: s.date_emission ? new Date(s.date_emission).toLocaleDateString() : "-"
    }));
    return {
      columns: [
        { header: "Recu", key: "receipt_number" }, { header: "Date", key: "date" }, { header: "Client", key: "client" },
        { header: "Montant", key: "montant_total" }, { header: "Monnaie", key: "monnaie" },
        { header: "Caissier", key: "nom_caissier" }, { header: "Statut", key: "statut" }
      ],
      rows
    };
  };

  const buildDebts = async () => {
    const supabase = getAuthedClient(token);
    if (!year) return { columns: [], rows: [] };

    const { data: assign } = await supabase.from("assignments").select("student_uuid, class_uuid").eq("academic_year_uuid", year.id);
    const { data: classes } = await supabase.from("classes").select("id, nom");
    const { data: fees } = await supabase.from("class_fees").select("id, class_uuid, nom, montant, monnaie");
    const { data: students } = await supabase.from("students").select("id, matricule, nom, prenom");
    const { data: reds } = await supabase.from("reductions").select("*").eq("statut", "active");
    const { data: pays } = await supabase.from("payments").select("student_uuid, fee_uuid, montant").eq("academic_year_uuid", year.id).eq("statut", "valide");

    const classMap = Object.fromEntries((classes || []).map((c) => [c.id, c.nom]));
    const studentMap = Object.fromEntries((students || []).map((s) => [s.id, s]));

    const rows = [];
    for (const a of (assign || [])) {
      const st = studentMap[a.student_uuid];
      if (!st) continue;
      const classFees = (fees || []).filter((f) => f.class_uuid === a.class_uuid);
      if (classFees.length === 0) continue;
      const stReds = (reds || []).filter((r) => r.student_uuid === a.student_uuid && (r.academic_year_uuid === null || r.academic_year_uuid === year.id));
      const parFrais = calculerReductions(stReds, classFees);
      let prixScolarite = 0, totalPaye = 0;
      for (const f of classFees) {
        const red = parFrais[f.id] || 0;
        const net = Math.max(0, f.montant - red);
        const paye = (pays || []).filter((p) => p.student_uuid === a.student_uuid && p.fee_uuid === f.id).reduce((s, p) => s + Number(p.montant), 0);
        prixScolarite += net;
        totalPaye += Math.min(paye, net);
      }
      const balance = prixScolarite - totalPaye;
      if (balance > 0) {
        rows.push({ matricule: st.matricule, nom: st.nom, prenom: st.prenom, classe: classMap[a.class_uuid] || "-", prix_scolarite: prixScolarite, paye: totalPaye, balance });
      }
    }
    rows.sort((a, b) => b.balance - a.balance);
    return {
      columns: [
        { header: "Matricule", key: "matricule" }, { header: "Nom", key: "nom" }, { header: "Prenom", key: "prenom" },
        { header: "Classe", key: "classe" }, { header: "Prix scolarite", key: "prix_scolarite" }, { header: "Paye", key: "paye" }, { header: "Balance", key: "balance" }
      ],
      rows
    };
  };

  const buildAccounting = async () => {
    const supabase = getAuthedClient(token);
    const debutISO = new Date(debut).toISOString();
    const finISO = new Date(new Date(fin).getTime() + 24 * 60 * 60 * 1000 - 1).toISOString();

    const { data: pays } = await supabase.from("payments").select("montant, monnaie, created_at").eq("statut", "valide").gte("created_at", debutISO).lte("created_at", finISO);
    const { data: exps } = await supabase.from("expenses").select("categorie, montant, monnaie, created_at").eq("statut", "approuve").gte("created_at", debutISO).lte("created_at", finISO);

    const revenuHTG = (pays || []).filter((p) => p.monnaie === "HTG").reduce((s, p) => s + Number(p.montant), 0);
    const revenuUSD = (pays || []).filter((p) => p.monnaie === "USD").reduce((s, p) => s + Number(p.montant), 0);
    const depenseHTG = (exps || []).filter((e) => e.monnaie === "HTG").reduce((s, e) => s + Number(e.montant), 0);
    const depenseUSD = (exps || []).filter((e) => e.monnaie === "USD").reduce((s, e) => s + Number(e.montant), 0);

    const rows = [
      { poste: "Revenus (paiements)", htg: revenuHTG, usd: revenuUSD },
      { poste: "Depenses approuvees", htg: -depenseHTG, usd: -depenseUSD },
      { poste: "Balance", htg: revenuHTG - depenseHTG, usd: revenuUSD - depenseUSD }
    ];
    return {
      columns: [{ header: "Poste", key: "poste" }, { header: "HTG", key: "htg" }, { header: "USD", key: "usd" }],
      rows
    };
  };

  const rapports = [
    { type: "students", titre: "Liste des eleves", desc: "Tous les eleves avec matricule, parent et contact.", needsDates: false, build: buildStudents },
    { type: "debts", titre: "Creances (debiteurs)", desc: "Eleves ayant un solde impaye pour l'annee active.", needsDates: false, build: buildDebts },
    { type: "payments", titre: "Paiements encaisses", desc: "Historique des paiements de frais scolaires.", needsDates: false, build: buildPayments },
    { type: "sales", titre: "Ventes magasin", desc: "Toutes les ventes du magasin avec leur statut.", needsDates: false, build: buildSales },
    { type: "accounting", titre: "Synthese comptable", desc: "Revenus, depenses et balance sur une periode.", needsDates: true, build: buildAccounting }
  ];

  const handleExport = async (r, format) => {
    setBusy(r.type + format);
    setError("");
    try {
      const { columns, rows } = await r.build();
      if (columns.length === 0) { setError("Aucune donnee (annee active introuvable ?)"); setBusy(""); return; }
      if (format === "excel") await exportExcel(r.type, r.titre, columns, rows);
      else exportPDF(r.type, r.titre, columns, rows);
    } catch (e) {
      setError(e.message || "Erreur d'export");
    }
    setBusy("");
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Rapports</h1>
        <p className="page-subtitle">Exportez vos donnees en Excel ou PDF</p>
      </div>

      {error && <div className="login-error" style={{ marginBottom: "16px" }}>{error}</div>}

      <div className="reports-grid">
        {rapports.map((r) => (
          <div key={r.type} className="report-card">
            <div className="report-card-body">
              <h3 className="report-card-title">{r.titre}</h3>
              <p className="report-card-desc">{r.desc}</p>
              {r.needsDates && (
                <div style={{ display: "flex", gap: "10px", marginBottom: "14px", flexWrap: "wrap" }}>
                  <div className="form-group" style={{ margin: 0, flex: 1, minWidth: "120px" }}><label>Du</label><input type="date" value={debut} onChange={(e) => setDebut(e.target.value)} /></div>
                  <div className="form-group" style={{ margin: 0, flex: 1, minWidth: "120px" }}><label>Au</label><input type="date" value={fin} onChange={(e) => setFin(e.target.value)} /></div>
                </div>
              )}
            </div>
            <div className="report-card-actions">
              <button className="btn-sm btn-green" onClick={() => handleExport(r, "excel")} disabled={busy === r.type + "excel"}>{busy === r.type + "excel" ? "..." : "Excel"}</button>
              <button className="btn-sm btn-red" onClick={() => handleExport(r, "pdf")} disabled={busy === r.type + "pdf"}>{busy === r.type + "pdf" ? "..." : "PDF"}</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
