import React, { useState, useEffect } from "react";
import { useAuth } from "../AuthContext.jsx";
import { getAuthedClient, EDGE_FUNCTION_URL, SUPABASE_ANON_KEY } from "../supabaseClient.js";
import { useSettings } from "../SettingsContext.jsx";
import { useYear } from "../YearContext.jsx";
import { printUnifiedReceipt, downloadUnifiedReceiptPDF } from "../receiptTemplate.js";

export default function CaisseDecaissement() {
  const { token, user } = useAuth();
  const { settings } = useSettings();
  const { currentYear } = useYear();
  const [journal, setJournal] = useState({ encaissements: 0, decaissements: 0, solde: 0, mouvements: [] });
  const [lastReceipt, setLastReceipt] = useState(null);
  const [description, setDescription] = useState("");
  const [montant, setMontant] = useState("");
  const [beneficiaire, setBeneficiaire] = useState("");
  const [motif, setMotif] = useState("");
  const [categorie, setCategorie] = useState("");
  const [observation, setObservation] = useState("");
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmError, setConfirmError] = useState("");
  const [confirmBusy, setConfirmBusy] = useState(false);

  const fmt = (n) => Number(n || 0).toLocaleString();
  const prenom = user ? (user.nom_complet || user.username).split(" ")[0] : "collegue";

  const verifyCredentials = async (username, password) => {
    const r = await fetch(EDGE_FUNCTION_URL, {
      method: "POST",
      headers: { "apikey": SUPABASE_ANON_KEY, "Authorization": "Bearer " + SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    const d = await r.json();
    if (!r.ok) return { ok: false, error: d.error || "Mot de passe incorrect" };
    return { ok: true };
  };

  const loadJournal = async () => {
    const supabase = getAuthedClient(token);
    const today = new Date().toISOString().slice(0, 10);

    const { data: pays } = await supabase.from("payments").select("receipt_number, created_at, montant").eq("statut", "valide");
    const { data: sales } = await supabase.from("sales").select("receipt_number, date_emission, montant_total").neq("statut", "annule");
    const { data: miscs } = await supabase.from("misc_fee_payments").select("receipt_number, created_at, montant").eq("statut", "valide");
    const { data: progs } = await supabase.from("program_payments").select("receipt_number, created_at, montant").eq("statut", "valide");
    const { data: decs } = await supabase.from("caisse_decaissements").select("*").eq("caisse_type", "grande").neq("statut", "annule");

    const isToday = (d) => (d || "").startsWith(today);

    const encFrais = (pays || []).filter((p) => isToday(p.created_at)).reduce((s, p) => s + Number(p.montant), 0);
    const encVentes = (sales || []).filter((s) => isToday(s.date_emission)).reduce((s, v) => s + Number(v.montant_total), 0);
    const encDivers = (miscs || []).filter((p) => isToday(p.created_at)).reduce((s, p) => s + Number(p.montant), 0);
    const encProgs = (progs || []).filter((p) => isToday(p.created_at)).reduce((s, p) => s + Number(p.montant), 0);
    const totalEnc = encFrais + encVentes + encDivers + encProgs;

    const decsToday = (decs || []).filter((d) => isToday(d.date));
    const totalDec = decsToday.reduce((s, d) => s + Number(d.montant), 0);

    const mouvements = [];
    (pays || []).filter((p) => isToday(p.created_at)).forEach((p) => mouvements.push({ ref: p.receipt_number, heure: p.created_at, type: "Frais scolaires", entree: p.montant, sortie: 0 }));
    (sales || []).filter((s) => isToday(s.date_emission)).forEach((s) => mouvements.push({ ref: s.receipt_number, heure: s.date_emission, type: "Vente magasin", entree: s.montant_total, sortie: 0 }));
    (miscs || []).filter((p) => isToday(p.created_at)).forEach((p) => mouvements.push({ ref: p.receipt_number, heure: p.created_at, type: "Frais divers", entree: p.montant, sortie: 0 }));
    (progs || []).filter((p) => isToday(p.created_at)).forEach((p) => mouvements.push({ ref: p.receipt_number, heure: p.created_at, type: "Programme", entree: p.montant, sortie: 0 }));
    decsToday.forEach((d) => mouvements.push({ ref: d.numero, heure: d.created_at, type: "Decaissement", entree: 0, sortie: d.montant, monnaie: d.monnaie, beneficiaire: d.beneficiaire, motif: d.motif, code_caissier: d.caissier }));
    mouvements.sort((a, b) => new Date(a.heure) - new Date(b.heure));
    let running = 0;
    for (const m of mouvements) { running += m.entree - m.sortie; m.solde = running; }

    setJournal({ encaissements: totalEnc, decaissements: totalDec, solde: totalEnc - totalDec, mouvements });
  };

  const loadCategories = async () => {
    const supabase = getAuthedClient(token);
    const { data } = await supabase.from("expense_categories").select("*").order("nom");
    setCategories(data || []);
  };

  useEffect(() => { if (token) { loadJournal(); loadCategories(); } }, [token]);

  const toReceiptRec = (rec) => ({
    receipt_number: rec.numero,
    type_label: "Decaissement",
    lines: [
      { label: "Beneficiaire", value: rec.beneficiaire },
      { label: "Motif", value: rec.motif || "-" }
    ],
    montant: rec.montant, monnaie: rec.monnaie || "HTG",
    montant_label: "Montant",
    code_caissier: rec.code_caissier || user.username,
    created_at: rec.date,
    note: "Statut : en attente de finalisation"
  });

  const resetForm = () => {
    setDescription(""); setMontant(""); setBeneficiaire(""); setMotif(""); setCategorie(""); setObservation(""); setError("");
  };

  const montantNum = Number(montant) || 0;
  const soldeApres = journal.solde - montantNum;

  const requestSubmit = () => {
    setError("");
    if (!montant || montantNum <= 0) { setError("Montant invalide"); return; }
    if (!beneficiaire.trim()) { setError("Le beneficiaire est requis"); return; }
    if (montantNum > journal.solde) { setError("Solde insuffisant dans la caisse aujourd'hui (disponible: " + fmt(journal.solde) + " HTG)"); return; }
    setConfirmPassword(""); setConfirmError(""); setConfirmOpen(true);
  };

  const confirmSubmit = async () => {
    setConfirmError("");
    if (!confirmPassword) { setConfirmError("Entrez votre mot de passe."); return; }
    setConfirmBusy(true);
    const check = await verifyCredentials(user.username, confirmPassword);
    if (!check.ok) { setConfirmError(check.error); setConfirmBusy(false); return; }

    try {
      const supabase = getAuthedClient(token);
      const year = new Date().getFullYear();
      const { data: counterVal, error: ce } = await supabase.rpc("next_counter_value", { counter_key: "decaissement_" + year });
      if (ce) throw ce;
      const numero = "DC-" + year + "-" + String(counterVal).padStart(4, "0");

      const { data: newExp, error: e1 } = await supabase.from("expenses").insert({
        categorie: categorie || null, montant: montantNum, monnaie: "HTG",
        description: description || motif || ("Decaissement " + numero),
        statut: "en_attente_finalisation", user_uuid: user.id, caisse_type: "grande",
        academic_year_uuid: currentYear ? currentYear.id : null,
        modified_by: user.username
      }).select().single();
      if (e1) throw e1;

      const { data: newDec, error: e2 } = await supabase.from("caisse_decaissements").insert({
        numero, caisse_type: "grande", date: new Date().toISOString().slice(0, 10),
        description: description || null, montant: montantNum, beneficiaire, motif: motif || null,
        categorie: categorie || null, observation: observation || null, caissier: user.nom_complet,
        user_uuid: user.id, expense_uuid: newExp.id, modified_by: user.username
      }).select().single();
      if (e2) throw e2;

      await supabase.from("expenses").update({ decaissement_id: newDec.id }).eq("id", newExp.id);

      setConfirmOpen(false);
      setLastReceipt(newDec);
      setMsg(prenom + ", decaissement " + newDec.numero + " cree avec succes ! Il est maintenant en attente de finalisation par le responsable des depenses.");
      setTimeout(() => setMsg(""), 8000);
      resetForm();
      loadJournal();
    } catch (e) { setConfirmError(e.message || "Erreur"); }
    setConfirmBusy(false);
  };

  return (
    <div>
      {msg && (
        <div className="receipt-banner" style={{ marginBottom: "18px" }}>
          <span>{msg}</span>
          {lastReceipt && <button onClick={() => printUnifiedReceipt(toReceiptRec(lastReceipt), settings)} className="btn-sm btn-blue">Imprimer le recu</button>}
          {lastReceipt && <button onClick={() => downloadUnifiedReceiptPDF(toReceiptRec(lastReceipt), settings)} className="btn-sm btn-primary">Telecharger PDF</button>}
        </div>
      )}

      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)", marginBottom: "20px" }}>
        <div className="kpi-card"><div className="kpi-label">Encaisse en caisse aujourd'hui</div><div className="kpi-value" style={{ color: "var(--ok)" }}>{fmt(journal.encaissements)} HTG</div></div>
        <div className="kpi-card"><div className="kpi-label">Decaisse en caisse aujourd'hui</div><div className="kpi-value" style={{ color: "var(--err)" }}>{fmt(journal.decaissements)} HTG</div></div>
        <div className="kpi-card"><div className="kpi-label">Solde du jour</div><div className="kpi-value" style={{ color: journal.solde < 0 ? "var(--err)" : "var(--navy)" }}>{fmt(journal.solde)} HTG</div></div>
      </div>

      <div className="form-card" style={{ maxWidth: "560px", marginBottom: "24px" }}>
        <h3 className="form-card-title">Nouveau decaissement</h3>
        <p style={{ fontSize: "12px", color: "var(--text-dim)", marginBottom: "16px" }}>Cas exceptionnel : sortie d'argent immediate depuis les encaissements du jour. Sera transmis au responsable des depenses pour finalisation.</p>

        {error && <div className="login-error" style={{ marginBottom: "16px" }}>{error}</div>}

        <div className="form-row">
          <div className="form-group"><label>Montant *</label><input type="number" value={montant} onChange={(e) => setMontant(e.target.value)} /></div>
          <div className="form-group"><label>Beneficiaire *</label><input value={beneficiaire} onChange={(e) => setBeneficiaire(e.target.value)} placeholder="Nom de la personne/entite" /></div>
        </div>

        <div className="form-group" style={{ marginBottom: "14px" }}><label>Description</label><input value={description} onChange={(e) => setDescription(e.target.value)} /></div>

        <div className="form-row">
          <div className="form-group"><label>Motif</label><input value={motif} onChange={(e) => setMotif(e.target.value)} /></div>
          <div className="form-group">
            <label>Categorie</label>
            <select value={categorie} onChange={(e) => setCategorie(e.target.value)}>
              <option value="">-- Aucune --</option>
              {categories.map((c) => <option key={c.id} value={c.nom}>{c.nom}</option>)}
            </select>
          </div>
        </div>

        <div className="form-group" style={{ marginBottom: "14px" }}><label>Observation</label><input value={observation} onChange={(e) => setObservation(e.target.value)} /></div>

        {montant && (
          <div style={{ background: "var(--bg-soft)", borderRadius: "10px", padding: "12px 14px", marginBottom: "16px", fontSize: "13px" }}>
            <div className="receipt-line"><span>Solde du jour avant</span><strong>{fmt(journal.solde)} HTG</strong></div>
            <div className="receipt-line"><span>Decaissement</span><strong style={{ color: "var(--err)" }}>-{fmt(montantNum)} HTG</strong></div>
            <div className="receipt-line"><span>Solde du jour apres</span><strong style={{ color: soldeApres < 0 ? "var(--err)" : "var(--ok)" }}>{fmt(soldeApres)} HTG</strong></div>
          </div>
        )}

        <button className="btn-primary" onClick={requestSubmit} style={{ width: "100%" }}>Creer le decaissement</button>
      </div>

      {confirmOpen && (
        <div className="modal-overlay" onClick={() => setConfirmOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "420px", textAlign: "center" }}>
            <h3 style={{ color: "var(--navy)", marginBottom: "12px" }}>{prenom}, confirmez le decaissement</h3>
            <p style={{ fontSize: "14px", color: "var(--text-dim)", marginBottom: "16px" }}>Vous allez retirer <strong>{fmt(montantNum)} HTG</strong> de la caisse pour <strong>{beneficiaire}</strong>.</p>
            {confirmError && <div className="login-error" style={{ marginBottom: "14px" }}>{confirmError}</div>}
            <div className="form-group" style={{ marginBottom: "20px", textAlign: "left" }}>
              <label>Votre mot de passe</label>
              <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoFocus onKeyDown={(e) => e.key === "Enter" && confirmSubmit()} />
            </div>
            <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setConfirmOpen(false)}>Annuler</button>
              <button className="btn-primary" onClick={confirmSubmit} disabled={confirmBusy}>{confirmBusy ? "Verification..." : "Confirmer le decaissement"}</button>
            </div>
          </div>
        </div>
      )}

      <div className="form-card">
        <h3 className="form-card-title">Journal de caisse - Aujourd'hui</h3>
        <div className="table-card">
          <table className="data-table">
            <thead><tr><th>Heure</th><th>Reference</th><th>Type</th><th>Entree</th><th>Sortie</th><th>Solde</th><th></th></tr></thead>
            <tbody>
              {journal.mouvements.length === 0 && <tr><td colSpan="7" className="table-empty">Aucun mouvement aujourd'hui.</td></tr>}
              {journal.mouvements.map((m, i) => (
                <tr key={i}>
                  <td>{new Date(m.heure).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</td>
                  <td><strong style={{ color: "var(--accent)" }}>{m.ref}</strong></td>
                  <td>{m.type}</td>
                  <td style={{ color: "var(--ok)" }}>{m.entree > 0 ? fmt(m.entree) : "-"}</td>
                  <td style={{ color: "var(--err)" }}>{m.sortie > 0 ? fmt(m.sortie) : "-"}</td>
                  <td><strong>{fmt(m.solde)}</strong></td>
                  <td>{m.type === "Decaissement" && <div style={{ display: "flex", gap: "6px" }}><button className="btn-sm btn-blue" onClick={() => printUnifiedReceipt(toReceiptRec({ numero: m.ref, beneficiaire: m.beneficiaire, motif: m.motif, date: m.heure, code_caissier: m.code_caissier, montant: m.sortie, monnaie: m.monnaie }), settings)}>Recu</button><button className="btn-sm btn-primary" onClick={() => downloadUnifiedReceiptPDF(toReceiptRec({ numero: m.ref, beneficiaire: m.beneficiaire, motif: m.motif, date: m.heure, code_caissier: m.code_caissier, montant: m.sortie, monnaie: m.monnaie }), settings)}>PDF</button></div>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}