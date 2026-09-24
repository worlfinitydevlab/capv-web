import React, { useState, useEffect } from "react";
import { useAuth } from "../AuthContext.jsx";
import { getAuthedClient } from "../supabaseClient.js";
import { useYear } from "../YearContext.jsx";
import { useSettings } from "../SettingsContext.jsx";
import { printUnifiedReceipt, downloadUnifiedReceiptPDF, buildUnifiedReceiptHTML } from "../receiptTemplate.js";

function computeParticipants(program, targets, programStudents, assignments, classes, students, year) {
  const ids = new Set();
  if (program.cible_type === "etablissement") {
    assignments.filter((a) => a.academic_year_uuid === (program.academic_year_uuid || year.id)).forEach((a) => ids.add(a.student_uuid));
  } else if (program.cible_type === "liste") {
    programStudents.filter((ps) => ps.program_uuid === program.id).forEach((ps) => ids.add(ps.student_uuid));
  } else {
    const progTargets = targets.filter((t) => t.program_uuid === program.id);
    const yr = program.academic_year_uuid || year.id;
    for (const t of progTargets) {
      if (t.target_type === "classe") {
        assignments.filter((a) => a.class_uuid === t.target_uuid && a.academic_year_uuid === yr).forEach((a) => ids.add(a.student_uuid));
      } else if (t.target_type === "salle") {
        assignments.filter((a) => a.room_uuid === t.target_uuid && a.academic_year_uuid === yr).forEach((a) => ids.add(a.student_uuid));
      } else if (t.target_type === "section") {
        const classIds = classes.filter((c) => c.section_uuid === t.target_uuid).map((c) => c.id);
        assignments.filter((a) => classIds.includes(a.class_uuid) && a.academic_year_uuid === yr).forEach((a) => ids.add(a.student_uuid));
      }
    }
  }
  return [...ids].map((id) => students.find((s) => s.id === id)).filter(Boolean);
}

import { genererEcritureEncaissement } from "../accountingHelpers.js";

export default function ProgramPay({ activeSession }) {
  const { token, user } = useAuth();
  const { currentYear } = useYear();
  const { settings } = useSettings();

  const [mode, setMode] = useState("eleve");
  const [studentSearch, setStudentSearch] = useState("");
  const [studentResults, setStudentResults] = useState([]);
  const [selStudent, setSelStudent] = useState(null);
  const [eligibles, setEligibles] = useState([]);

  const [programs, setPrograms] = useState([]);
  const [selProgram, setSelProgram] = useState(null);
  const [progParticipants, setProgParticipants] = useState([]);

  const [allTargets, setAllTargets] = useState([]);
  const [allProgramStudents, setAllProgramStudents] = useState([]);
  const [allAssignments, setAllAssignments] = useState([]);
  const [allClasses, setAllClasses] = useState([]);
  const [allStudents, setAllStudents] = useState([]);

  const [payModal, setPayModal] = useState(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMontantRecu, setPayMontantRecu] = useState("");
  const [error, setError] = useState("");
  const [lastReceipt, setLastReceipt] = useState(null);
  const [confirmPay, setConfirmPay] = useState(false);
  const [recent, setRecent] = useState([]);
  const [preview, setPreview] = useState(null);
  const [paying, setPaying] = useState(false);

  const fmt = (n) => Number(n || 0).toLocaleString();
  const prenom = user ? (user.nom_complet || user.username).split(" ")[0] : "collegue";

  const toReceiptRec = (p) => ({
    receipt_number: p.receipt_number,
    type_label: "Programme",
    lines: [
      { label: "Eleve", value: (p.prenom || "") + " " + (p.nom || "") },
      { label: "Matricule", value: p.matricule || "" },
      { label: "Programme", value: p.programme_nom || "" }
    ],
    montant: p.montant, monnaie: p.monnaie,
    montant_label: "Montant paye",
    code_caissier: p.code_caissier || user.username,
    created_at: p.created_at,
    statut_annule: p.statut === "annule",
    montant_recu: p.montant_recu,
    solde_restant: p.solde_restant
  });

  const loadBaseData = async () => {
    const supabase = getAuthedClient(token);
    const { data: tgts } = await supabase.from("program_targets").select("*");
    setAllTargets(tgts || []);
    const { data: ps } = await supabase.from("program_students").select("*");
    setAllProgramStudents(ps || []);
    const { data: asg } = await supabase.from("assignments").select("*");
    setAllAssignments(asg || []);
    const { data: cls } = await supabase.from("classes").select("*");
    setAllClasses(cls || []);
    const { data: studs } = await supabase.from("students").select("*");
    setAllStudents(studs || []);
  };

  const loadRecent = async () => {
    if (!token) return;
    const supabase = getAuthedClient(token);
    const { data: pays } = await supabase.from("program_payments").select("*").order("id", { ascending: false }).limit(20);
    if (!pays || pays.length === 0) { setRecent([]); return; }
    const progIds = [...new Set(pays.map((p) => p.program_uuid))];
    const studentIds = [...new Set(pays.map((p) => p.student_uuid))];
    const { data: progs } = await supabase.from("programs").select("id, nom").in("id", progIds);
    const { data: studs } = await supabase.from("students").select("id, nom, prenom, matricule").in("id", studentIds);
    const withNames = pays.map((p) => ({
      ...p,
      programme_nom: (progs || []).find((pr) => pr.id === p.program_uuid)?.nom || "?",
      nom: (studs || []).find((s) => s.id === p.student_uuid)?.nom || "?",
      prenom: (studs || []).find((s) => s.id === p.student_uuid)?.prenom || "?",
      matricule: (studs || []).find((s) => s.id === p.student_uuid)?.matricule || "?"
    }));
    setRecent(withNames.slice(0, 8));
  };

  useEffect(() => { if (token) { loadBaseData(); loadRecent(); } }, [token]);

  useEffect(() => {
    if (!studentSearch) { setStudentResults([]); return; }
    const t = setTimeout(async () => {
      const supabase = getAuthedClient(token);
      const like = "%" + studentSearch + "%";
      const { data } = await supabase.from("students").select("id, matricule, nom, prenom").or("matricule.ilike." + like + ",nom.ilike." + like + ",prenom.ilike." + like).limit(15);
      setStudentResults(data || []);
    }, 250);
    return () => clearTimeout(t);
  }, [studentSearch]);

  const selectStudent = async (s) => {
    setSelStudent(s); setStudentSearch(""); setStudentResults([]);
    const supabase = getAuthedClient(token);
    const { data: progs } = await supabase.from("programs").select("*").eq("actif", true);
    const active = (progs || []).filter((p) => !p.academic_year_uuid || p.academic_year_uuid === currentYear.id);
    const elig = [];
    for (const p of active) {
      const concernes = computeParticipants(p, allTargets, allProgramStudents, allAssignments, allClasses, allStudents, currentYear);
      if (concernes.find((c) => c.id === s.id)) {
        const { data: pays } = await supabase.from("program_payments").select("montant").eq("program_uuid", p.id).eq("student_uuid", s.id).eq("statut", "valide");
        const paye = (pays || []).reduce((sum, x) => sum + Number(x.montant), 0);
        elig.push({ ...p, paye, restant: Math.max(0, p.cout - paye) });
      }
    }
    setEligibles(elig);
  };

  const loadPrograms = async () => {
    const supabase = getAuthedClient(token);
    const { data } = await supabase.from("programs").select("*").order("created_at", { ascending: false });
    setPrograms(data || []);
  };
  useEffect(() => { if (mode === "programme" && token) loadPrograms(); }, [mode, token]);

  const selectProgram = async (p) => {
    setSelProgram(p);
    const supabase = getAuthedClient(token);
    const concernes = computeParticipants(p, allTargets, allProgramStudents, allAssignments, allClasses, allStudents, currentYear);
    const { data: pays } = await supabase.from("program_payments").select("student_uuid, montant").eq("program_uuid", p.id).eq("statut", "valide");
    const participants = concernes.map((s) => {
      const paye = (pays || []).filter((x) => x.student_uuid === s.id).reduce((sum, x) => sum + Number(x.montant), 0);
      let statut = "aucun";
      if (paye >= p.cout && p.cout > 0) statut = "complet";
      else if (paye > 0) statut = "partiel";
      return { student_id: s.id, matricule: s.matricule, nom: s.nom, prenom: s.prenom, paye, restant: Math.max(0, p.cout - paye), statut };
    });
    setProgParticipants(participants);
  };

  const openPayFromEleve = (prog) => { setPayModal({ student: selStudent, program: prog, restant: prog.restant }); setPayAmount(String(prog.restant || prog.cout)); setError(""); };
  const openPayFromProg = (part) => { setPayModal({ student: { id: part.student_id, prenom: part.prenom, nom: part.nom, matricule: part.matricule }, program: selProgram, restant: part.restant }); setPayAmount(String(part.restant || selProgram.cout)); setError(""); };

  const requestPay = () => {
    setError("");
    const m = Number(payAmount);
    if (!m || m <= 0) { setError(prenom + ", veuillez saisir un montant valide."); return; }
    if (m > payModal.restant && payModal.restant > 0) { setError(prenom + ", le montant ne peut pas depasser le solde restant de " + fmt(payModal.restant) + " " + payModal.program.monnaie + "."); return; }
    if (!activeSession) { setError(prenom + ", ouvrez d'abord votre session sur une sous-caisse."); return; }
    setConfirmPay(true);
  };

  const submitPay = async () => {
    setConfirmPay(false);
    setError("");
    const m = Number(payAmount);
    if (!m || m <= 0) return;
    setPaying(true);
    try {
      const supabase = getAuthedClient(token);
      const { data: dejaPaye } = await supabase.from("program_payments").select("montant").eq("program_uuid", payModal.program.id).eq("student_uuid", payModal.student.id).eq("statut", "valide");
      const totalDejaPaye = (dejaPaye || []).reduce((s, p) => s + Number(p.montant), 0);
      const restantAvant = payModal.program.cout - totalDejaPaye;
      if (m > restantAvant) { setError("Le montant depasse le solde restant (" + fmt(restantAvant) + " " + payModal.program.monnaie + ")"); setPaying(false); return; }

      const year = new Date().getFullYear();
      const { data: counterVal, error: ce } = await supabase.rpc("next_counter_value", { counter_key: "recu_P_WEB_" + year });
      if (ce) throw ce;
      const receipt = "CAPV-P-" + year + "-WEB-" + String(counterVal).padStart(4, "0");
      const soldeRestant = restantAvant - m;
      const montantRecu = payMontantRecu ? Number(payMontantRecu) : null;

      const { data: newPay, error: e1 } = await supabase.from("program_payments").insert({
        receipt_number: receipt, program_uuid: payModal.program.id, student_uuid: payModal.student.id,
        montant: m, monnaie: payModal.program.monnaie, nom_caissier: user.nom_complet, user_uuid: user.id,
        montant_recu: montantRecu, solde_restant: soldeRestant, statut: "valide", session_sous_caisse_uuid: activeSession.id, modified_by: user.username
      }).select().single();
      if (e1) throw e1;

      await genererEcritureEncaissement(supabase, {
        sousCaisseUuid: activeSession.sous_caisse_uuid, compteProduitNumero: "4400",
        montant: m, origine_type: "program_payment", origine_id: newPay.id,
        description: "Paiement programme - Recu " + receipt,
        user_uuid: user.id, nom_utilisateur: user.nom_complet, modified_by: user.username,
        date_ecriture: new Date().toISOString().slice(0, 10)
      });

      setLastReceipt({
        ...newPay, prenom: payModal.student.prenom, nom: payModal.student.nom, matricule: payModal.student.matricule,
        programme_nom: payModal.program.nom, montant_recu: montantRecu, solde_restant: soldeRestant, code_caissier: user.username
      });
      setPayModal(null);
      setPayMontantRecu("");
      if (selStudent) selectStudent(selStudent);
      if (selProgram) selectProgram(selProgram);
      loadRecent();
    } catch (e) { setError(e.message || "Erreur lors de l'encaissement"); }
    setPaying(false);
  };

  return (
    <div>
      {lastReceipt && (
        <div className="receipt-banner" style={{ marginBottom: "18px" }}>
          <span>Paiement enregistre — Recu <strong>{lastReceipt.receipt_number}</strong> ({fmt(lastReceipt.montant)} {lastReceipt.monnaie})</span>
          <span style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <button onClick={() => printUnifiedReceipt(toReceiptRec(lastReceipt), settings)} className="btn-sm btn-blue">Imprimer</button>
            <button onClick={() => downloadUnifiedReceiptPDF(toReceiptRec(lastReceipt), settings)} className="btn-sm btn-gold">PDF</button>
            <button onClick={() => setLastReceipt(null)} className="receipt-banner-x">x</button>
          </span>
        </div>
      )}
      {error && !payModal && <div className="login-error" style={{ maxWidth: "500px", marginBottom: "16px" }}>{error}</div>}

      <div className="store-tabs" style={{ marginBottom: "18px" }}>
        <button className={"store-tab" + (mode === "eleve" ? " active" : "")} onClick={() => { setMode("eleve"); setSelProgram(null); }}>Par eleve</button>
        <button className={"store-tab" + (mode === "programme" ? " active" : "")} onClick={() => { setMode("programme"); setSelStudent(null); setEligibles([]); }}>Par programme</button>
      </div>

      {mode === "eleve" && (
        <>
          <div className="cashier-search" style={{ marginBottom: "18px" }}>
            {selStudent
              ? <div className="selected-client">{selStudent.prenom} {selStudent.nom} ({selStudent.matricule}) <button onClick={() => { setSelStudent(null); setEligibles([]); }} className="chip-x">x</button></div>
              : <input value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} placeholder="Rechercher un eleve..." />}
            {studentResults.length > 0 && !selStudent && (
              <div className="search-dropdown">
                {studentResults.map((s) => (
                  <div key={s.id} className="search-item" onClick={() => selectStudent(s)}>
                    <div><strong>{s.prenom} {s.nom}</strong><div style={{ fontSize: "12px", color: "var(--text-dim)" }}>{s.matricule}</div></div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {selStudent && (
            <div className="table-card">
              <table className="data-table">
                <thead><tr><th>Programme</th><th>Cout</th><th>Paye</th><th>Restant</th><th>Action</th></tr></thead>
                <tbody>
                  {eligibles.length === 0 && <tr><td colSpan="5" className="table-empty">Cet eleve n'est concerne par aucun programme actif.</td></tr>}
                  {eligibles.map((p) => (
                    <tr key={p.id}>
                      <td><strong>{p.nom}</strong></td>
                      <td>{fmt(p.cout)} {p.monnaie}</td>
                      <td style={{ color: "var(--ok)" }}>{fmt(p.paye)}</td>
                      <td style={{ color: p.restant > 0 ? "var(--err)" : "var(--ok)", fontWeight: 700 }}>{fmt(p.restant)} {p.monnaie}</td>
                      <td>{p.restant > 0 ? <button className="btn-sm btn-green" onClick={() => openPayFromEleve(p)}>Encaisser</button> : <span className="badge badge-ok">Solde</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {mode === "programme" && (
        <>
          {!selProgram ? (
            <div className="card-grid">
              {programs.filter((p) => p.actif).length === 0 && <div className="grid-empty">Aucun programme actif.</div>}
              {programs.filter((p) => p.actif).map((p) => (
                <div key={p.id} className="folder-card" onClick={() => selectProgram(p)}>
                  <div className="folder-icon folder-class">PRG</div>
                  <div className="folder-name">{p.nom}</div>
                  <div className="folder-meta">{fmt(p.cout)} {p.monnaie}</div>
                </div>
              ))}
            </div>
          ) : (
            <>
              <div className="breadcrumb" style={{ marginBottom: "16px" }}>
                <span className="crumb" onClick={() => { setSelProgram(null); setProgParticipants([]); }}>Programmes</span>
                <span className="crumb-sep">›</span><span className="crumb active">{selProgram.nom}</span>
              </div>
              <div className="table-card">
                <table className="data-table">
                  <thead><tr><th>Matricule</th><th>Eleve</th><th>Paye</th><th>Restant</th><th>Action</th></tr></thead>
                  <tbody>
                    {progParticipants.length === 0 && <tr><td colSpan="5" className="table-empty">Aucun eleve concerne.</td></tr>}
                    {progParticipants.map((p) => (
                      <tr key={p.student_id}>
                        <td><strong>{p.matricule}</strong></td>
                        <td>{p.prenom} {p.nom}</td>
                        <td style={{ color: "var(--ok)" }}>{fmt(p.paye)}</td>
                        <td style={{ color: p.restant > 0 ? "var(--err)" : "var(--ok)", fontWeight: 700 }}>{fmt(p.restant)} {selProgram.monnaie}</td>
                        <td>{p.restant > 0 ? <button className="btn-sm btn-green" onClick={() => openPayFromProg(p)}>Encaisser</button> : <span className="badge badge-ok">Solde</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      <div style={{ marginTop: "28px" }}>
        <h3 className="form-card-title">Paiements de programmes recents</h3>
        <div className="table-card">
          <table className="data-table">
            <thead><tr><th>Recu</th><th>Date</th><th>Eleve</th><th>Programme</th><th>Montant</th><th>Actions</th></tr></thead>
            <tbody>
              {recent.length === 0 && <tr><td colSpan="6" className="table-empty">Aucun paiement.</td></tr>}
              {recent.map((p) => (
                <tr key={p.id}>
                  <td><strong style={{ color: "var(--accent)" }}>{p.receipt_number}</strong></td>
                  <td>{p.created_at ? p.created_at.slice(0, 10) : ""}</td>
                  <td>{p.prenom} {p.nom}</td>
                  <td>{p.programme_nom}</td>
                  <td><strong>{fmt(p.montant)} {p.monnaie}</strong></td>
                  <td>
                    <div className="table-actions">
                      <button className="btn-sm btn-blue" onClick={() => setPreview(p)}>Apercu</button>
                      <button className="btn-sm btn-gold" onClick={() => downloadUnifiedReceiptPDF(toReceiptRec(p), settings)}>PDF</button>
                      <button className="btn-sm btn-green" onClick={() => printUnifiedReceipt(toReceiptRec(p), settings)}>Imprimer</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {preview && (
        <div className="modal-overlay" onClick={() => setPreview(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ maxHeight: "90vh", overflowY: "auto" }}>
            <div dangerouslySetInnerHTML={{ __html: buildUnifiedReceiptHTML(toReceiptRec(preview), settings) }} />
            <div style={{ display: "flex", gap: "10px", justifyContent: "center", marginTop: "14px" }}>
              <button className="btn-sm btn-gold" onClick={() => downloadUnifiedReceiptPDF(toReceiptRec(preview), settings)}>Telecharger PDF</button>
              <button className="btn-primary" onClick={() => printUnifiedReceipt(toReceiptRec(preview), settings)}>Imprimer</button>
              <button className="btn-gray-cancel btn-sm" onClick={() => setPreview(null)}>Fermer</button>
            </div>
          </div>
        </div>
      )}

      {confirmPay && payModal && (
        <div className="modal-overlay" style={{ zIndex: 10000 }} onClick={() => setConfirmPay(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "420px", textAlign: "center" }}>
            <div style={{ fontSize: "40px", marginBottom: "10px" }}>💰</div>
            <h3 style={{ color: "var(--navy)", marginBottom: "12px" }}>{prenom}, confirmez-vous ?</h3>
            <p style={{ fontSize: "14px", color: "var(--text-dim)", marginBottom: "8px" }}>Vous allez encaisser <strong style={{ color: "var(--accent)", fontSize: "18px" }}>{fmt(Number(payAmount))} {payModal.program.monnaie}</strong></p>
            <p style={{ fontSize: "13px", color: "var(--text-soft)", marginBottom: "20px" }}>pour le programme <strong>{payModal.program.nom}</strong> de <strong>{payModal.student.prenom} {payModal.student.nom}</strong></p>
            <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setConfirmPay(false)}>Revenir</button>
              <button className="btn-primary" onClick={submitPay} disabled={paying}>{paying ? "Enregistrement..." : "Oui, encaisser"}</button>
            </div>
          </div>
        </div>
      )}

      {payModal && (
        <div className="modal-overlay" onClick={() => setPayModal(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "440px" }}>
            <div className="modal-header"><h3>Encaisser - {payModal.student.prenom} {payModal.student.nom}</h3><button className="modal-close" onClick={() => setPayModal(null)}>x</button></div>
            {error && <div className="login-error" style={{ marginBottom: "14px" }}>{error}</div>}
            <div style={{ marginBottom: "16px", fontSize: "14px", color: "var(--text-dim)" }}>Programme : <strong>{payModal.program.nom}</strong><br/>Restant : <strong style={{ color: "var(--err)" }}>{fmt(payModal.restant)} {payModal.program.monnaie}</strong></div>
            <div className="form-group" style={{ marginBottom: "14px" }}><label>Montant a encaisser</label><input type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} autoFocus onKeyDown={(e) => e.key === "Enter" && requestPay()} /></div>
            <div className="form-group" style={{ marginBottom: "20px" }}><label>Montant recu <span style={{ fontWeight: 400, color: "var(--text-dim)" }}>(optionnel)</span></label><input type="number" value={payMontantRecu} onChange={(e) => setPayMontantRecu(e.target.value)} placeholder="ex: 1000" /></div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setPayModal(null)}>Annuler</button>
              <button className="btn-primary" onClick={requestPay}>Valider</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
