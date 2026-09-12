import React, { useState, useEffect } from "react";
import { useAuth } from "../AuthContext.jsx";
import { getAuthedClient } from "../supabaseClient.js";
import { useYear } from "../YearContext.jsx";
import { useSettings } from "../SettingsContext.jsx";
import { useDevice } from "../DeviceContext.jsx";
import { printUnifiedReceipt, buildUnifiedReceiptHTML, downloadUnifiedReceiptPDF } from "../receiptTemplate.js";
import MiscFees from "./MiscFees.jsx";

export default function Cashier() {
  const { token, user } = useAuth();
  const { currentYear } = useYear();
  const { settings } = useSettings();
  const { hasCapability, loaded: deviceLoaded, label: deviceLabel } = useDevice();
  const [tab, setTab] = useState("frais");

  const [stats, setStats] = useState({});
  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);
  const [situation, setSituation] = useState(null);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState("");
  const [recent, setRecent] = useState([]);

  const [payModal, setPayModal] = useState(null);
  const [confirmPay, setConfirmPay] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payMontantRecu, setPayMontantRecu] = useState("");
  const [lastReceipt, setLastReceipt] = useState(null);
  const [receiptPreview, setReceiptPreview] = useState(null);
  const [paying, setPaying] = useState(false);

  const fmt = (n) => Number(n || 0).toLocaleString();
  const prenom = user ? (user.nom_complet || user.username).split(" ")[0] : "collegue";

  const genererRecu = async (supabase, prefix, academicYear) => {
    const yearLabel = academicYear ? academicYear.nom.split("-")[0] : String(new Date().getFullYear());
    const counterKey = "recu_" + prefix + "_WEB_" + yearLabel;
    const { data, error: e } = await supabase.rpc("next_counter_value", { counter_key: counterKey });
    if (e) throw e;
    const suffix = "WEB-" + String(data).padStart(4, "0");
    return "CAPV-" + prefix + "-" + yearLabel + "-" + suffix;
  };

  const calculerReductions = (reductions, feesList) => {
    const parFrais = {};
    for (const r of reductions) {
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
    for (const r of reductions) {
      if (r.portee !== "ciblee" && r.mode === "montant" && r.type !== "bourse_complete" && r.type !== "demi_bourse") {
        let reste = r.valeur;
        for (const frais of feesList) {
          if (reste <= 0) break;
          const dejaReduit = parFrais[frais.id] || 0;
          const dispo = frais.montant - dejaReduit;
          if (dispo <= 0) continue;
          const applique = Math.min(dispo, reste);
          parFrais[frais.id] = dejaReduit + applique;
          reste -= applique;
        }
      }
    }
    return parFrais;
  };

  const loadStats = async () => {
    if (!currentYear || !token) return;
    const supabase = getAuthedClient(token);
    const today = new Date().toISOString().slice(0, 10);
    const monthPrefix = new Date().toISOString().slice(0, 7);
    const { data: pays } = await supabase.from("payments").select("montant, created_at").eq("academic_year_uuid", currentYear.id).eq("statut", "valide");
    const jour = (pays || []).filter((p) => (p.created_at || "").startsWith(today)).reduce((s, p) => s + Number(p.montant), 0);
    const mois = (pays || []).filter((p) => (p.created_at || "").startsWith(monthPrefix)).reduce((s, p) => s + Number(p.montant), 0);
    const nbJour = (pays || []).filter((p) => (p.created_at || "").startsWith(today)).length;
    let ventesJour = 0;
    try {
      const { data: sales } = await supabase.from("sales").select("montant_total, date_emission, statut").eq("academic_year_uuid", currentYear.id).neq("statut", "annule");
      ventesJour = (sales || []).filter((v) => (v.date_emission || "").startsWith(today)).reduce((s, v) => s + Number(v.montant_total), 0);
    } catch (e) {}
    setStats({ encaisse_jour: jour, encaisse_mois: mois, nb_transactions_jour: nbJour, ventes_jour: ventesJour });
  };

  const loadRecent = async () => {
    if (!currentYear || !token) return;
    const supabase = getAuthedClient(token);
    const { data: pays } = await supabase.from("payments").select("*").eq("academic_year_uuid", currentYear.id).order("created_at", { ascending: false }).limit(8);
    if (!pays || pays.length === 0) { setRecent([]); return; }
    const studentIds = [...new Set(pays.map((p) => p.student_uuid))];
    const { data: studs } = await supabase.from("students").select("id, nom, prenom, matricule").in("id", studentIds);
    const withNames = pays.map((p) => {
      const s = (studs || []).find((x) => x.id === p.student_uuid);
      return { ...p, nom: s ? s.nom : "?", prenom: s ? s.prenom : "?" };
    });
    setRecent(withNames);
  };

  useEffect(() => { loadStats(); loadRecent(); }, [currentYear, token]);

  useEffect(() => {
    if (!search) { setResults([]); return; }
    const t = setTimeout(async () => {
      const supabase = getAuthedClient(token);
      const like = "%" + search + "%";
      const { data } = await supabase.from("students").select("id, matricule, nom, prenom, photo, sexe").or("matricule.ilike." + like + ",nom.ilike." + like + ",prenom.ilike." + like).order("nom").limit(15);
      setResults(data || []);
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  const selectStudent = async (s) => {
    setSearch(""); setResults([]); setError("");
    await loadSituation(s.id);
    await loadHistory(s.id);
  };

  const loadSituation = async (studentId) => {
    const supabase = getAuthedClient(token);
    const { data: student } = await supabase.from("students").select("*").eq("id", studentId).maybeSingle();
    if (!student) { setError("Eleve introuvable"); return; }

    const { data: asg } = await supabase.from("assignments").select("class_uuid, room_uuid").eq("student_uuid", studentId).eq("academic_year_uuid", currentYear.id).maybeSingle();
    if (!asg) { setSituation({ student, assigned: false, fees: [] }); return; }

    const { data: cls } = await supabase.from("classes").select("nom, section_uuid").eq("id", asg.class_uuid).maybeSingle();
    const { data: sec } = cls ? await supabase.from("sections").select("nom").eq("id", cls.section_uuid).maybeSingle() : { data: null };
    const { data: room } = asg.room_uuid ? await supabase.from("rooms").select("nom").eq("id", asg.room_uuid).maybeSingle() : { data: null };

    const { data: fees } = await supabase.from("class_fees").select("*").eq("class_uuid", asg.class_uuid);
    const feesList = fees || [];

    const { data: reds } = await supabase.from("reductions").select("*").eq("student_uuid", studentId).eq("statut", "active");
    const filteredReds = (reds || []).filter((r) => !r.academic_year_uuid || r.academic_year_uuid === currentYear.id);
    const redParFrais = calculerReductions(filteredReds, feesList);

    const { data: allPays } = await supabase.from("payments").select("fee_uuid, montant").eq("student_uuid", studentId).eq("academic_year_uuid", currentYear.id).eq("statut", "valide");

    const feesWithBalance = feesList.map((f) => {
      const paid = (allPays || []).filter((p) => p.fee_uuid === f.id).reduce((s, p) => s + Number(p.montant), 0);
      const redFrais = redParFrais[f.id] || 0;
      const montantNet = Math.max(0, f.montant - redFrais);
      return {
        fee_id: f.id, nom: f.nom, montant: f.montant, monnaie: f.monnaie, date_echeance: f.date_echeance || null,
        reduction: redFrais, montant_net: montantNet, paye: paid, restant: Math.max(0, montantNet - paid)
      };
    });

    setSituation({
      student, assigned: true,
      section: sec ? sec.nom : "", classe: cls ? cls.nom : "", salle: room ? room.nom : "",
      fees: feesWithBalance
    });
  };

  const loadHistory = async (studentId) => {
    const supabase = getAuthedClient(token);
    const { data } = await supabase.from("payments").select("*").eq("student_uuid", studentId).eq("academic_year_uuid", currentYear.id).order("created_at", { ascending: false });
    setHistory(data || []);
  };

  const openPay = (fee) => { setPayModal(fee); setPayAmount(String(fee.restant)); setError(""); };

  const requestPay = () => {
    setError("");
    const montant = Number(payAmount);
    if (!montant || montant <= 0) { setError(prenom + ", veuillez saisir un montant valide."); return; }
    if (montant > payModal.restant) { setError(prenom + ", le montant ne peut pas depasser le solde restant de " + fmt(payModal.restant) + " " + payModal.monnaie + "."); return; }
    setConfirmPay(true);
  };

  const submitPay = async () => {
    setConfirmPay(false);
    setError("");
    if (!hasCapability("caisse")) { setError("Cet appareil n'est pas autorise a utiliser la Caisse. Contactez un administrateur."); return; }
    setPaying(true);
    try {
      const supabase = getAuthedClient(token);
      const montant = Number(payAmount);
      const montantRecu = payMontantRecu ? Number(payMontantRecu) : null;
      const receiptNumber = await genererRecu(supabase, "R", currentYear);

      const soldeRestant = payModal.restant - montant;
      const autresFrais = situation.fees.filter((f) => f.fee_id !== payModal.fee_id);
      const echeances = autresFrais.map((f) => ({ label: f.nom, montant: f.restant, date_echeance: f.date_echeance })).filter((f) => f.montant > 0)
        .sort((a, b) => (a.date_echeance || "9999") < (b.date_echeance || "9999") ? -1 : 1);
      const totalRestantAnnee = soldeRestant + echeances.reduce((s, e) => s + e.montant, 0);

      const { data: newPay, error: e1 } = await supabase.from("payments").insert({
        receipt_number: receiptNumber, student_uuid: situation.student.id, academic_year_uuid: currentYear.id,
        fee_uuid: payModal.fee_id, fee_nom: payModal.nom, montant, monnaie: payModal.monnaie,
        user_uuid: user.id, nom_caissier: user.nom_complet, montant_recu: montantRecu,
        solde_restant: soldeRestant, echeances_json: JSON.stringify(echeances), total_restant_annee: totalRestantAnnee,
        statut: "valide", modified_by: user.username
      }).select().single();
      if (e1) throw e1;

      setLastReceipt({
        ...newPay, prenom: situation.student.prenom, nom: situation.student.nom, matricule: situation.student.matricule,
        montant_recu: montantRecu, solde_restant: soldeRestant, echeances, total_restant_annee: totalRestantAnnee,
        code_caissier: user.code_caissier || user.username
      });
      setPayModal(null);
      setPayMontantRecu("");
      await loadSituation(situation.student.id);
      await loadHistory(situation.student.id);
      await loadStats(); await loadRecent();
    } catch (e) { setError(e.message || "Erreur lors de l'encaissement"); }
    setPaying(false);
  };

  const toReceiptRec = (p) => ({
    receipt_number: p.receipt_number,
    type_label: "Frais scolaires",
    lines: [
      { label: "Eleve", value: (p.prenom || "") + " " + (p.nom || "") },
      { label: "Matricule", value: p.matricule || "" },
      { label: "Frais", value: p.fee_nom }
    ],
    montant: p.montant, monnaie: p.monnaie,
    montant_label: "Montant paye",
    code_caissier: p.code_caissier || user.username,
    created_at: p.created_at,
    statut_annule: p.statut === "annule",
    montant_recu: p.montant_recu,
    solde_restant: p.solde_restant,
    echeances: Array.isArray(p.echeances) ? p.echeances : (p.echeances_json ? JSON.parse(p.echeances_json) : []),
    total_restant_annee: p.total_restant_annee
  });

  if (!currentYear) {
    return (
      <div className="page">
        <div className="page-header"><h1 className="page-title">Caisse</h1></div>
        <div className="dash-placeholder"><p>Aucune annee academique active.</p></div>
      </div>
    );
  }

  if (deviceLoaded && !hasCapability("caisse")) {
    return (
      <div className="page">
        <div className="page-header"><h1 className="page-title">Caisse</h1></div>
        <div className="dash-placeholder">
          <p><strong>Cet appareil n'est pas autorise a utiliser la Caisse.</strong></p>
          <p style={{ marginTop: "10px", fontSize: "13px" }}>Demandez a un administrateur d'activer cette capacite pour cet appareil dans la page "Appareils".</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Caisse</h1>
        <p className="page-subtitle">Annee {currentYear.nom}</p>
      </div>

      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)", marginBottom: "24px" }}>
        <div className="kpi-card"><div className="kpi-label">Encaisse aujourd'hui</div><div className="kpi-value" style={{ color: "var(--ok)", fontSize: "24px" }}>{fmt(stats.encaisse_jour || 0)} HTG</div></div>
        <div className="kpi-card"><div className="kpi-label">Encaisse ce mois</div><div className="kpi-value" style={{ color: "var(--accent-light)", fontSize: "24px" }}>{fmt(stats.encaisse_mois || 0)} HTG</div></div>
        <div className="kpi-card"><div className="kpi-label">Transactions du jour</div><div className="kpi-value">{stats.nb_transactions_jour || 0}</div></div>
        <div className="kpi-card"><div className="kpi-label">Ventes magasin (jour)</div><div className="kpi-value" style={{ color: "var(--gold)", fontSize: "24px" }}>{fmt(stats.ventes_jour || 0)} HTG</div></div>
      </div>

      <div className="store-tabs">
        <button className={"store-tab" + (tab === "frais" ? " active" : "")} onClick={() => setTab("frais")}>Frais scolaires</button>
        <button className={"store-tab" + (tab === "frais_divers" ? " active" : "")} onClick={() => setTab("frais_divers")}>Frais Divers</button>
      </div>

      {tab === "frais" && (
        <>
          <div className="cashier-search">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un eleve par matricule ou nom..." />
            {results.length > 0 && (
              <div className="search-dropdown">
                {results.map((s) => (
                  <div key={s.id} className="search-item" onClick={() => selectStudent(s)}>
                    {s.photo ? <img src={s.photo} className="student-photo" alt="" /> : <div className="student-photo-empty">{(s.prenom[0]||"")+(s.nom[0]||"")}</div>}
                    <div><div style={{ fontWeight: 600 }}>{s.prenom} {s.nom}</div><div style={{ fontSize: "12px", color: "var(--text-dim)" }}>{s.matricule}</div></div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {lastReceipt && (
            <div className="receipt-banner">
              <span>Paiement enregistre — Recu <strong>{lastReceipt.receipt_number}</strong> ({fmt(lastReceipt.montant)} {lastReceipt.monnaie})</span>
              <span style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                <button onClick={() => printUnifiedReceipt(toReceiptRec(lastReceipt), settings)} className="btn-sm btn-blue">Imprimer le recu</button>
                <button onClick={() => downloadUnifiedReceiptPDF(toReceiptRec(lastReceipt), settings)} className="btn-sm btn-gold">Telecharger PDF</button>
                <button onClick={() => setLastReceipt(null)} className="receipt-banner-x">x</button>
              </span>
            </div>
          )}

          {error && !payModal && <div className="login-error" style={{ maxWidth: "500px", marginBottom: "16px" }}>{error}</div>}

          {situation && (
            <>
              <div className="student-banner">
                {situation.student.photo ? <img src={situation.student.photo} className="student-banner-photo" alt="" /> : <div className="student-banner-photo-empty">{(situation.student.prenom[0]||"")+(situation.student.nom[0]||"")}</div>}
                <div>
                  <div className="student-banner-name">{situation.student.prenom} {situation.student.nom}</div>
                  <div className="student-banner-mat">{situation.student.matricule}</div>
                  {situation.assigned ? <div className="student-banner-class">{situation.section} › {situation.classe} › {situation.salle}</div> : <div className="badge badge-err" style={{ marginTop: "6px" }}>Non assigne cette annee</div>}
                </div>
              </div>

              {situation.assigned && (
                <div className="table-card" style={{ marginBottom: "24px" }}>
                  <table className="data-table">
                    <thead><tr><th>Frais</th><th>Montant</th><th>Paye</th><th>Restant</th><th>Echeance</th><th>Action</th></tr></thead>
                    <tbody>
                      {situation.fees.length === 0 && <tr><td colSpan="6" className="table-empty">Aucun frais defini pour cette classe.</td></tr>}
                      {situation.fees.map((f) => (
                        <tr key={f.fee_id}>
                          <td><strong>{f.nom}</strong></td>
                          <td>{fmt(f.montant)} {f.monnaie}</td>
                          <td style={{ color: "var(--ok)" }}>{fmt(f.paye)} {f.monnaie}</td>
                          <td style={{ color: f.restant > 0 ? "var(--err)" : "var(--ok)", fontWeight: 700 }}>{fmt(f.restant)} {f.monnaie}</td>
                          <td>{(() => { if (!f.date_echeance) return <span className="badge badge-gray">-</span>; const today = new Date().toISOString().slice(0, 10); if (f.restant <= 0) return <span className="badge badge-ok">Paye</span>; if (f.date_echeance < today) return <span className="badge badge-err">{f.date_echeance}</span>; return <span className="badge badge-blue">{f.date_echeance}</span>; })()}</td>
                          <td>{f.restant > 0 ? <button className="btn-sm btn-green" onClick={() => openPay(f)}>Encaisser</button> : <span className="badge badge-ok">Solde</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <h3 className="form-card-title">Historique des paiements</h3>
              <div className="table-card">
                <table className="data-table">
                  <thead><tr><th>Recu</th><th>Date</th><th>Frais</th><th>Montant</th><th>Caissier</th></tr></thead>
                  <tbody>
                    {history.length === 0 && <tr><td colSpan="5" className="table-empty">Aucun paiement.</td></tr>}
                    {history.map((p) => (
                      <tr key={p.id} onClick={() => setReceiptPreview({ ...p, prenom: situation.student.prenom, nom: situation.student.nom, matricule: situation.student.matricule })} style={{ cursor: "pointer" }}><td><strong style={{ color: "var(--accent)" }}>{p.receipt_number}</strong></td><td>{p.created_at ? p.created_at.slice(0, 10) : ""}</td><td>{p.fee_nom}</td><td>{fmt(p.montant)} {p.monnaie}</td><td>{p.nom_caissier || "-"}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {!situation && (
            <>
              <div className="dash-placeholder" style={{ marginBottom: "24px" }}><p>Recherchez un eleve pour voir sa situation et encaisser.</p></div>
              <h3 className="form-card-title">Derniers paiements</h3>
              <div className="table-card">
                <table className="data-table">
                  <thead><tr><th>Recu</th><th>Date</th><th>Eleve</th><th>Frais</th><th>Montant</th><th>Caissier</th></tr></thead>
                  <tbody>
                    {recent.length === 0 && <tr><td colSpan="6" className="table-empty">Aucun paiement.</td></tr>}
                    {recent.map((p) => (
                      <tr key={p.id} onClick={() => setReceiptPreview(p)} style={{ cursor: "pointer", opacity: p.statut === "annule" ? 0.55 : 1 }}><td><strong style={{ color: "var(--accent)" }}>{p.receipt_number}</strong></td><td>{p.created_at ? p.created_at.slice(0, 10) : ""}</td><td>{p.prenom} {p.nom}</td><td>{p.fee_nom}</td><td><strong>{fmt(p.montant)} {p.monnaie}</strong></td><td>{p.nom_caissier || "-"}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {tab === "frais_divers" && <MiscFees />}

      {payModal && (
        <div className="modal-overlay" onClick={() => setPayModal(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "440px" }}>
            <div className="modal-header"><h3>Encaisser - {payModal.nom}</h3><button className="modal-close" onClick={() => setPayModal(null)}>x</button></div>
            {error && <div className="login-error" style={{ marginBottom: "14px" }}>{error}</div>}
            <div style={{ marginBottom: "16px", fontSize: "14px", color: "var(--text-dim)" }}>Solde restant : <strong style={{ color: "var(--err)" }}>{fmt(payModal.restant)} {payModal.monnaie}</strong></div>
            <div className="form-group" style={{ marginBottom: "20px" }}>
              <label>Montant a encaisser ({payModal.monnaie})</label>
              <input type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} autoFocus onKeyDown={(e) => e.key === "Enter" && requestPay()} />
            </div>
            <div className="form-group" style={{ marginBottom: "20px" }}>
              <label>Montant recu <span style={{ fontWeight: 400, color: "var(--text-dim)" }}>(optionnel)</span></label>
              <input type="number" value={payMontantRecu} onChange={(e) => setPayMontantRecu(e.target.value)} placeholder="ex: 1000" />
            </div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setPayModal(null)}>Annuler</button>
              <button className="btn-primary" onClick={requestPay}>Valider</button>
            </div>
          </div>
        </div>
      )}

      {confirmPay && payModal && (
        <div className="modal-overlay" style={{ zIndex: 10000 }} onClick={() => setConfirmPay(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "420px", textAlign: "center" }}>
            <div style={{ fontSize: "40px", marginBottom: "10px" }}>💰</div>
            <h3 style={{ color: "var(--navy)", marginBottom: "12px" }}>{prenom}, confirmez-vous ?</h3>
            <p style={{ fontSize: "14px", color: "var(--text-dim)", marginBottom: "8px" }}>Vous allez encaisser <strong style={{ color: "var(--accent)", fontSize: "18px" }}>{fmt(Number(payAmount))} {payModal.monnaie}</strong></p>
            <p style={{ fontSize: "13px", color: "var(--text-soft)", marginBottom: "20px" }}>pour le frais <strong>{payModal.nom}</strong> de <strong>{situation ? situation.student.prenom + " " + situation.student.nom : ""}</strong></p>
            <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setConfirmPay(false)}>Revenir</button>
              <button className="btn-primary" onClick={submitPay} disabled={paying}>{paying ? "Enregistrement..." : "Oui, encaisser"}</button>
            </div>
          </div>
        </div>
      )}

      {receiptPreview && (
        <div className="modal-overlay" onClick={() => setReceiptPreview(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ maxHeight: "90vh", overflowY: "auto" }}>
            <div dangerouslySetInnerHTML={{ __html: buildUnifiedReceiptHTML(toReceiptRec(receiptPreview), settings) }} />
            <div style={{ display: "flex", gap: "10px", justifyContent: "center", marginTop: "14px" }}>
              <button className="btn-sm btn-gold" onClick={() => downloadUnifiedReceiptPDF(toReceiptRec(receiptPreview), settings)}>Telecharger PDF</button>
              <button className="btn-sm btn-blue" onClick={() => printUnifiedReceipt(toReceiptRec(receiptPreview), settings)}>Imprimer</button>
              <button className="btn-gray-cancel btn-sm" onClick={() => setReceiptPreview(null)}>Fermer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}