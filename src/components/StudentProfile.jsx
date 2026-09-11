import React, { useState, useEffect } from "react";
import { useAuth } from "../AuthContext.jsx";
import { getAuthedClient } from "../supabaseClient.js";
import { useYear } from "../YearContext.jsx";

const TYPES_RED = {
  bourse_complete: "Bourse 100%", demi_bourse: "Demi-bourse 50%",
  reduction_fixe: "Red. fixe", reduction_pct: "Red. %",
  exoneration: "Exoneration", exceptionnelle: "Exceptionnelle"
};

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

export default function StudentProfile({ studentId, onClose }) {
  const { token } = useAuth();
  const { currentYear: year } = useYear();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!studentId || !year) return;
    setLoading(true);
    const load = async () => {
      try {
        const supabase = getAuthedClient(token);

        const { data: s } = await supabase.from("students").select("*").eq("id", studentId).single();

        const { data: asg } = await supabase.from("assignments").select("*").eq("student_uuid", studentId).eq("academic_year_uuid", year.id).maybeSingle();

        let section = null, classe = null, salle = null, fees = [], reductions = [], totalDu = 0, totalPaye = 0, totalReduction = 0, restant = 0;
        let statut = "Non assigne";

        if (asg) {
          const { data: cls } = await supabase.from("classes").select("*").eq("id", asg.class_uuid).maybeSingle();
          if (cls) {
            classe = cls.nom;
            const { data: sec } = await supabase.from("sections").select("*").eq("id", cls.section_uuid).maybeSingle();
            section = sec ? sec.nom : null;
          }
          const { data: room } = await supabase.from("rooms").select("*").eq("id", asg.room_uuid).maybeSingle();
          salle = room ? room.nom : null;

          const { data: classFees } = await supabase.from("class_fees").select("*").eq("class_uuid", asg.class_uuid);
          const { data: reds } = await supabase.from("reductions").select("*").eq("student_uuid", studentId).eq("statut", "active");
          const activeReds = (reds || []).filter((r) => r.academic_year_uuid === null || r.academic_year_uuid === year.id);
          reductions = activeReds;

          const { data: pays } = await supabase.from("payments").select("*").eq("student_uuid", studentId).eq("academic_year_uuid", year.id).eq("statut", "valide");

          const parFrais = calculerReductions(activeReds, classFees || []);
          const today = new Date().toISOString().slice(0, 10);
          fees = (classFees || []).map((f) => {
            const reduction = parFrais[f.id] || 0;
            const montantNet = Math.max(0, f.montant - reduction);
            const paye = (pays || []).filter((p) => p.fee_uuid === f.id).reduce((sum, p) => sum + Number(p.montant), 0);
            const rest = Math.max(0, montantNet - paye);
            totalDu += montantNet; totalPaye += Math.min(paye, montantNet); totalReduction += reduction;
            return { nom: f.nom, montant: f.montant, monnaie: f.monnaie, reduction, paye: Math.min(paye, montantNet), restant: rest, date_echeance: f.date_echeance };
          });
          restant = totalDu - totalPaye;

          const enRetard = fees.some((f) => f.restant > 0 && f.date_echeance && f.date_echeance < today);
          if (restant <= 0 && totalDu > 0) statut = "Solde";
          else if (enRetard) statut = "En retard";
          else if (totalPaye > 0) statut = "Partiellement paye";
          else statut = "Aucun paiement";
        }

        const { data: recentPays } = await supabase.from("payments").select("*").eq("student_uuid", studentId).order("created_at", { ascending: false }).limit(10);

        setData({
          student: s, assigned: !!asg, section, classe, salle, statut,
          total_du: totalDu, total_paye: totalPaye, total_reduction: totalReduction, restant,
          fees, reductions, paiements: recentPays || []
        });
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    };
    load();
  }, [studentId, year, token]);

  const fmt = (n) => Number(n || 0).toLocaleString();

  if (loading) return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "600px", textAlign: "center", padding: "40px" }}>
        Chargement...
      </div>
    </div>
  );

  if (!data || !data.student) return null;
  const s = data.student;
  const initials = ((s.prenom || "")[0] + (s.nom || "")[0]).toUpperCase();

  const statutBadge = () => {
    const map = { "Solde": "badge-ok", "En retard": "badge-err", "Partiellement paye": "badge-gold", "Aucun paiement": "badge-gray", "Non assigne": "badge-gray" };
    return <span className={"badge " + (map[data.statut] || "badge-gray")}>{data.statut}</span>;
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card modal-large" onClick={(e) => e.stopPropagation()} style={{ maxHeight: "90vh", overflowY: "auto", width: "680px" }}>

        <div style={{ display: "flex", gap: "18px", alignItems: "center", padding: "20px 20px 16px", borderBottom: "2px solid var(--line)", marginBottom: "18px" }}>
          <div style={{ width: "70px", height: "70px", borderRadius: "16px", background: "linear-gradient(135deg, var(--navy), var(--accent))", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "22px" }}>{initials}</div>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: "20px", color: "var(--navy)", fontFamily: "Georgia, serif" }}>{s.prenom} {s.nom}</h2>
            <div style={{ fontSize: "13px", color: "var(--text-dim)", marginTop: "4px" }}>{s.matricule} - {s.sexe || "-"}</div>
            {data.assigned && <div style={{ fontSize: "13px", color: "var(--accent)", marginTop: "4px" }}>{data.section} &gt; {data.classe} &gt; {data.salle}</div>}
          </div>
          <div style={{ textAlign: "right" }}>
            {statutBadge()}
            <button className="modal-close" onClick={onClose} style={{ marginLeft: "10px" }}>x</button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 20px", marginBottom: "20px", padding: "0 20px" }}>
          <div className="receipt-line"><span>Date de naissance</span><strong>{s.date_naissance || "-"}</strong></div>
          <div className="receipt-line"><span>Adresse</span><strong>{s.adresse || "-"}</strong></div>
          <div className="receipt-line"><span>Telephone</span><strong>{s.telephone || "-"}</strong></div>
          <div className="receipt-line"><span>Parent / Tuteur</span><strong>{s.nom_parent || "-"}</strong></div>
          <div className="receipt-line"><span>Tel. parent</span><strong>{s.telephone_parent || "-"}</strong></div>
          <div className="receipt-line"><span>Email</span><strong>{s.email || "-"}</strong></div>
        </div>

        {data.assigned && (
          <>
            <h3 style={{ fontSize: "14px", color: "var(--navy)", fontFamily: "Georgia, serif", padding: "0 20px", marginBottom: "12px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Etat financier</h3>
            <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)", padding: "0 20px", marginBottom: "16px" }}>
              <div className="kpi-card"><div className="kpi-label">Total du</div><div className="kpi-value" style={{ fontSize: "16px" }}>{fmt(data.total_du)}</div></div>
              <div className="kpi-card"><div className="kpi-label">Paye</div><div className="kpi-value" style={{ fontSize: "16px", color: "var(--ok)" }}>{fmt(data.total_paye)}</div></div>
              <div className="kpi-card"><div className="kpi-label">Reductions</div><div className="kpi-value" style={{ fontSize: "16px", color: "var(--gold)" }}>{fmt(data.total_reduction)}</div></div>
              <div className="kpi-card"><div className="kpi-label">Restant</div><div className="kpi-value" style={{ fontSize: "16px", color: data.restant > 0 ? "var(--err)" : "var(--ok)" }}>{fmt(data.restant)}</div></div>
            </div>

            <div style={{ padding: "0 20px", marginBottom: "16px" }}>
              <table className="data-table">
                <thead><tr><th>Frais</th><th>Montant</th><th>Reduction</th><th>Paye</th><th>Restant</th><th>Echeance</th></tr></thead>
                <tbody>
                  {data.fees.map((f, i) => {
                    const today = new Date().toISOString().slice(0, 10);
                    let echBadge = <span className="badge badge-gray">-</span>;
                    if (f.restant <= 0) echBadge = <span className="badge badge-ok">Paye</span>;
                    else if (f.date_echeance && f.date_echeance < today) echBadge = <span className="badge badge-err">{f.date_echeance}</span>;
                    else if (f.date_echeance) echBadge = <span className="badge badge-blue">{f.date_echeance}</span>;
                    return (
                      <tr key={i}>
                        <td><strong>{f.nom}</strong></td>
                        <td>{fmt(f.montant)} {f.monnaie}</td>
                        <td style={{ color: "var(--gold)" }}>{f.reduction > 0 ? "-" + fmt(f.reduction) : "-"}</td>
                        <td style={{ color: "var(--ok)" }}>{fmt(f.paye)}</td>
                        <td style={{ color: f.restant > 0 ? "var(--err)" : "var(--ok)", fontWeight: 700 }}>{fmt(f.restant)} {f.monnaie}</td>
                        <td>{echBadge}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {data.reductions && data.reductions.length > 0 && (
          <div style={{ padding: "0 20px", marginBottom: "16px" }}>
            <h3 style={{ fontSize: "13px", color: "var(--text-soft)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>Reductions actives</h3>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {data.reductions.map((r) => (
                <span key={r.id} className="badge badge-gold" style={{ padding: "6px 12px" }}>{TYPES_RED[r.type] || r.type}{r.motif ? " - " + r.motif : ""}</span>
              ))}
            </div>
          </div>
        )}

        {data.paiements && data.paiements.length > 0 && (
          <div style={{ padding: "0 20px", marginBottom: "20px" }}>
            <h3 style={{ fontSize: "13px", color: "var(--text-soft)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>Derniers paiements</h3>
            <table className="data-table">
              <thead><tr><th>Recu</th><th>Date</th><th>Frais</th><th>Montant</th></tr></thead>
              <tbody>
                {data.paiements.map((p) => (
                  <tr key={p.id}>
                    <td><strong style={{ color: "var(--accent)" }}>{p.receipt_number}</strong></td>
                    <td>{new Date(p.created_at).toLocaleDateString()}</td>
                    <td>{p.fee_nom}</td>
                    <td><strong>{fmt(p.montant)} {p.monnaie}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ textAlign: "center", padding: "10px 0 16px" }}>
          <button className="btn-gray-cancel btn-sm" onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  );
}