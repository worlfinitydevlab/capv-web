import React, { useState, useEffect } from "react";
import { useAuth } from "../AuthContext.jsx";
import { getAuthedClient } from "../supabaseClient.js";
import { useYear } from "../YearContext.jsx";
import StudentProfile from "../components/StudentProfile.jsx";

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

export default function Debts() {
  const { token } = useAuth();
  const { currentYear: year } = useYear();
  const [sections, setSections] = useState([]);
  const [classes, setClasses] = useState([]);
  const [selSection, setSelSection] = useState("");
  const [selClass, setSelClass] = useState("");
  const [debtors, setDebtors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [profileId, setProfileId] = useState(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      if (!year) { setDebtors([]); setLoading(false); return; }
      const supabase = getAuthedClient(token);

      const { data: secs } = await supabase.from("sections").select("*").eq("academic_year_uuid", year.id).order("nom");
      setSections(secs || []);

      let asgQuery = supabase.from("assignments").select("*").eq("academic_year_uuid", year.id);
      const { data: asg } = await asgQuery;

      const { data: allClasses } = await supabase.from("classes").select("*");
      let relevantAsg = asg || [];
      if (selClass) relevantAsg = relevantAsg.filter((a) => a.class_uuid === selClass);
      else if (selSection) {
        const classIds = (allClasses || []).filter((c) => c.section_uuid === selSection).map((c) => c.id);
        relevantAsg = relevantAsg.filter((a) => classIds.includes(a.class_uuid));
      }

      const studentIds = relevantAsg.map((a) => a.student_uuid);
      if (studentIds.length === 0) { setDebtors([]); setLoading(false); return; }

      const { data: students } = await supabase.from("students").select("*").in("id", studentIds);
      const { data: allFees } = await supabase.from("class_fees").select("*");
      const { data: allReds } = await supabase.from("reductions").select("*").eq("statut", "active");
      const { data: allPays } = await supabase.from("payments").select("*").eq("academic_year_uuid", year.id).eq("statut", "valide");

      const results = [];
      for (const a of relevantAsg) {
        const st = (students || []).find((s) => s.id === a.student_uuid);
        if (!st) continue;
        const classFees = (allFees || []).filter((f) => f.class_uuid === a.class_uuid);
        const reds = (allReds || []).filter((r) => r.student_uuid === st.id && (r.academic_year_uuid === null || r.academic_year_uuid === year.id));
        const pays = (allPays || []).filter((p) => p.student_uuid === st.id);
        const parFrais = calculerReductions(reds, classFees);

        let totalDu = 0, totalPaye = 0;
        for (const f of classFees) {
          const reduction = parFrais[f.id] || 0;
          const montantNet = Math.max(0, f.montant - reduction);
          const paye = pays.filter((p) => p.fee_uuid === f.id).reduce((sum, p) => sum + Number(p.montant), 0);
          totalDu += montantNet;
          totalPaye += Math.min(paye, montantNet);
        }
        const solde = totalDu - totalPaye;
        if (solde > 0) {
          const cls = allClasses.find((c) => c.id === a.class_uuid);
          results.push({ student_id: st.id, matricule: st.matricule, nom: st.nom, prenom: st.prenom, classe_nom: cls ? cls.nom : "-", total_du: totalDu, total_paye: totalPaye, solde });
        }
      }
      results.sort((a, b) => b.solde - a.solde);
      setDebtors(results);
    } catch (e) {
      setError(e.message || "Erreur de chargement");
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [token, year, selSection, selClass]);

  const onSectionChange = async (sid) => {
    setSelSection(sid); setSelClass(""); setClasses([]);
    if (sid) {
      const supabase = getAuthedClient(token);
      const { data } = await supabase.from("classes").select("*").eq("section_uuid", sid).order("nom");
      setClasses(data || []);
    }
  };

  const fmt = (n) => Number(n || 0).toLocaleString();
  const totalCreances = debtors.reduce((a, d) => a + d.solde, 0);

  if (loading) return <div className="page"><p style={{ color: "var(--text-dim)" }}>Chargement...</p></div>;

  if (!year) {
    return <div className="page"><div className="page-header"><h1 className="page-title">Creances</h1></div><div className="dash-placeholder"><p>Aucune annee active.</p></div></div>;
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Creances</h1>
        <p className="page-subtitle">Annee {year.nom} - {debtors.length} eleve(s) debiteur(s)</p>
      </div>

      {error && <div className="login-error" style={{ marginBottom: "16px" }}>{error}</div>}

      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
        <div className="kpi-card"><div className="kpi-label">Total des creances</div><div className="kpi-value" style={{ color: "var(--err)" }}>{fmt(totalCreances)} HTG</div></div>
        <div className="kpi-card"><div className="kpi-label">Eleves debiteurs</div><div className="kpi-value" style={{ color: "var(--gold)" }}>{debtors.length}</div></div>
      </div>

      <div className="form-card" style={{ marginBottom: "22px" }}>
        <div style={{ display: "flex", gap: "14px", flexWrap: "wrap" }}>
          <div className="form-group" style={{ flex: 1, minWidth: "200px", margin: 0 }}>
            <label>Section</label>
            <select value={selSection} onChange={(e) => onSectionChange(e.target.value)}>
              <option value="">Toutes les sections</option>
              {sections.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ flex: 1, minWidth: "200px", margin: 0 }}>
            <label>Classe</label>
            <select value={selClass} onChange={(e) => setSelClass(e.target.value)} disabled={!selSection}>
              <option value="">Toutes les classes</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="table-card">
        <table className="data-table">
          <thead><tr><th>Matricule</th><th>Eleve</th><th>Classe</th><th>Total du</th><th>Paye</th><th>Solde</th></tr></thead>
          <tbody>
            {debtors.length === 0 && <tr><td colSpan="6" className="table-empty">Aucun eleve debiteur. Tout est paye !</td></tr>}
            {debtors.map((d) => (
              <tr key={d.student_id} onClick={() => setProfileId(d.student_id)} style={{ cursor: "pointer" }}>
                <td><strong>{d.matricule}</strong></td>
                <td>{d.prenom} {d.nom}</td>
                <td>{d.classe_nom}</td>
                <td>{fmt(d.total_du)} HTG</td>
                <td style={{ color: "var(--ok)" }}>{fmt(d.total_paye)} HTG</td>
                <td><strong style={{ color: "var(--err)" }}>{fmt(d.solde)} HTG</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ fontSize: "12px", color: "var(--text-dim)", marginTop: "12px" }}>Cliquez sur un eleve pour voir sa fiche complete. L'encaissement se fait depuis le poste local (.exe).</p>

      {profileId && <StudentProfile studentId={profileId} onClose={() => setProfileId(null)} />}
    </div>
  );
}