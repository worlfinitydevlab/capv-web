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
      let montantRed = 0;
      if (r.type === "exoneration" || r.type === "bourse_complete") montantRed = frais.montant;
      else if (r.type === "demi_bourse") montantRed = frais.montant * 0.5;
      else if (r.mode === "pourcentage") montantRed = frais.montant * (r.valeur / 100);
      else montantRed = Math.min(r.valeur, frais.montant);
      montantRed = Math.round(montantRed);
      parFrais[frais.id] = Math.min(frais.montant, (parFrais[frais.id] || 0) + montantRed);
    } else {
      for (const frais of feesList) {
        let montantRed = 0;
        if (r.type === "bourse_complete") montantRed = frais.montant;
        else if (r.type === "demi_bourse") montantRed = frais.montant * 0.5;
        else if (r.mode === "pourcentage") montantRed = frais.montant * (r.valeur / 100);
        else if (r.mode === "montant") continue;
        montantRed = Math.round(montantRed);
        parFrais[frais.id] = Math.min(frais.montant, (parFrais[frais.id] || 0) + montantRed);
      }
    }
  }

  for (const r of reds) {
    if ((r.portee !== "ciblee") && r.mode === "montant" && r.type !== "bourse_complete" && r.type !== "demi_bourse") {
      let reste = r.valeur;
      for (const frais of feesList) {
        if (reste <= 0) break;
        const dejaReduit = parFrais[frais.id] || 0;
        const dispo = frais.montant - dejaReduit;
        const applique = Math.min(reste, dispo);
        parFrais[frais.id] = dejaReduit + applique;
        reste -= applique;
      }
    }
  }

  return parFrais;
}

export default function JournalVersements() {
  const { token } = useAuth();
  const { currentYear: year } = useYear();
  const [sections, setSections] = useState([]);
  const [selSection, setSelSection] = useState("");
  const [classes, setClasses] = useState([]);
  const [selClass, setSelClass] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [profileId, setProfileId] = useState(null);

  useEffect(() => {
    const init = async () => {
      if (!year) { setSections([]); return; }
      const supabase = getAuthedClient(token);
      const { data: secs } = await supabase.from("sections").select("*").eq("academic_year_uuid", year.id).order("nom");
      setSections(secs || []);
    };
    init();
  }, [token, year]);

  useEffect(() => {
    if (!selSection) { setClasses([]); setSelClass(""); return; }
    const load = async () => {
      const supabase = getAuthedClient(token);
      const { data: cls } = await supabase.from("classes").select("*").eq("section_uuid", selSection).order("nom");
      setClasses(cls || []);
    };
    load();
  }, [selSection]);

  useEffect(() => {
    if (!selClass || !year) { setData(null); return; }
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const supabase = getAuthedClient(token);

        const classeInfo = classes.find((c) => c.id === selClass);

        const { data: fees, error: e1 } = await supabase.from("class_fees").select("id, nom, montant, monnaie").eq("class_uuid", selClass).order("created_at");
        if (e1) throw e1;

        const { data: asg, error: e2 } = await supabase.from("assignments").select("student_uuid").eq("class_uuid", selClass).eq("academic_year_uuid", year.id);
        if (e2) throw e2;
        const studentUuids = asg.map((a) => a.student_uuid);

        if (studentUuids.length === 0) {
          setData({ classe_nom: classeInfo ? classeInfo.nom : "", frais: fees, eleves: [] });
          setLoading(false);
          return;
        }

        const { data: students, error: e3 } = await supabase.from("students").select("id, matricule, nom, prenom").in("id", studentUuids);
        if (e3) throw e3;

        const { data: reds, error: e4 } = await supabase.from("reductions").select("*").in("student_uuid", studentUuids).eq("statut", "active");
        if (e4) throw e4;

        const { data: pays, error: e5 } = await supabase.from("payments").select("student_uuid, fee_uuid, montant").in("student_uuid", studentUuids).eq("academic_year_uuid", year.id).eq("statut", "valide");
        if (e5) throw e5;

        const eleves = students.map((st) => {
          const stReds = reds.filter((r) => r.student_uuid === st.id && (r.academic_year_uuid === null || r.academic_year_uuid === year.id));
          const parFrais = calculerReductions(stReds, fees);

          const paiements = {};
          let prixScolarite = 0;
          let totalPaye = 0;
          for (const f of fees) {
            const redFrais = parFrais[f.id] || 0;
            const montantNet = Math.max(0, f.montant - redFrais);
            const paye = pays.filter((p) => p.student_uuid === st.id && p.fee_uuid === f.id).reduce((s, p) => s + Number(p.montant), 0);
            paiements[f.id] = paye;
            prixScolarite += montantNet;
            totalPaye += Math.min(paye, montantNet);
          }

          return {
            student_id: st.id, matricule: st.matricule, nom: st.nom, prenom: st.prenom,
            paiements, prix_scolarite: prixScolarite, balance: prixScolarite - totalPaye
          };
        });

        eleves.sort((a, b) => (a.nom + a.prenom).localeCompare(b.nom + b.prenom));

        setData({ classe_nom: classeInfo ? classeInfo.nom : "", frais: fees, eleves });
      } catch (e) {
        setError(e.message || "Erreur de chargement");
      }
      setLoading(false);
    };
    load();
  }, [selClass, year]);

  const fmt = (n) => Number(n || 0).toLocaleString();

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Journal des versements</h1>
        <p className="page-subtitle">Vue type tableur des paiements par classe, avec prix scolarite et balance calcules automatiquement.</p>
      </div>

      <div className="form-card" style={{ marginBottom: "20px" }}>
        <div className="form-row">
          <div className="form-group">
            <label>Section</label>
            <select value={selSection} onChange={(e) => setSelSection(e.target.value)}>
              <option value="">-- Choisir --</option>
              {sections.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Classe</label>
            <select value={selClass} onChange={(e) => setSelClass(e.target.value)} disabled={!selSection}>
              <option value="">-- Choisir --</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
          </div>
        </div>
      </div>

      {error && <div className="login-error" style={{ marginBottom: "16px" }}>{error}</div>}
      {loading && <p style={{ color: "var(--text-dim)" }}>Chargement...</p>}

      {data && (
        <div className="form-card" style={{ overflowX: "auto" }}>
          <h3 className="form-card-title">{data.classe_nom} &mdash; {data.eleves.length} eleve(s)</h3>
          <table className="data-table">
            <thead>
              <tr>
                <th>Matricule</th>
                <th>Nom</th>
                <th>Prenom</th>
                {data.frais.map((f) => (
                  <th key={f.id}>
                    {f.nom}
                    <br />
                    <span style={{ fontWeight: 400, fontSize: "11px", color: "var(--text-dim)" }}>({fmt(f.montant)} {f.monnaie})</span>
                  </th>
                ))}
                <th>Prix scolarite</th>
                <th>Balance</th>
              </tr>
            </thead>
            <tbody>
              {data.eleves.length === 0 && (
                <tr><td colSpan={4 + data.frais.length} className="table-empty">Aucun eleve dans cette classe pour cette annee.</td></tr>
              )}
              {data.eleves.map((el) => (
                <tr key={el.student_id} onClick={() => setProfileId(el.student_id)} style={{ cursor: "pointer" }}>
                  <td>{el.matricule}</td>
                  <td>{el.nom}</td>
                  <td>{el.prenom}</td>
                  {data.frais.map((f) => <td key={f.id}>{fmt(el.paiements[f.id] || 0)}</td>)}
                  <td><strong>{fmt(el.prix_scolarite)}</strong></td>
                  <td><strong style={{ color: el.balance > 0 ? "var(--err)" : "var(--ok)" }}>{fmt(el.balance)}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {profileId && <StudentProfile studentId={profileId} onClose={() => setProfileId(null)} />}
    </div>
  );
}
