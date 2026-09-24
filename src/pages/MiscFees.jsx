import React, { useState, useEffect } from "react";
import { useAuth } from "../AuthContext.jsx";
import { useYear } from "../YearContext.jsx";
import { useSettings } from "../SettingsContext.jsx";
import { getAuthedClient } from "../supabaseClient.js";
import { printUnifiedReceipt, downloadUnifiedReceiptPDF } from "../receiptTemplate.js";

import { genererEcritureEncaissement } from "../accountingHelpers.js";

export default function MiscFees({ activeSession }) {
  const { token, user } = useAuth();
  const { currentYear } = useYear();
  const { settings } = useSettings();

  const toReceiptRec = (p) => ({
    receipt_number: p.receipt_number,
    type_label: "Frais divers",
    lines: [
      { label: "Payeur", value: p.payeur_nom || "" },
      { label: "Type de frais", value: p.fee_type_nom }
    ],
    montant: p.montant, monnaie: p.monnaie,
    montant_label: "Montant paye",
    code_caissier: p.code_caissier || "-",
    created_at: p.created_at,
    statut_annule: p.statut === "annule",
    montant_recu: p.montant_recu
  });

  const [tab, setTab] = useState("caisse");
  const [feeTypes, setFeeTypes] = useState([]);
  const [payments, setPayments] = useState([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [lastReceipt, setLastReceipt] = useState(null);

  const [clientType, setClientType] = useState("eleve");
  const [studentSearch, setStudentSearch] = useState("");
  const [studentResults, setStudentResults] = useState([]);
  const [selStudent, setSelStudent] = useState(null);
  const [custSearch, setCustSearch] = useState("");
  const [custResults, setCustResults] = useState([]);
  const [selCust, setSelCust] = useState(null);
  const [newCustOpen, setNewCustOpen] = useState(false);
  const [newCust, setNewCust] = useState({ nom: "", telephone: "" });

  const [selFeeType, setSelFeeType] = useState("");
  const [montant, setMontant] = useState("");
  const [payMontantRecu, setPayMontantRecu] = useState("");
  const [monnaie, setMonnaie] = useState("HTG");
  const [busy, setBusy] = useState(false);

  const [typeModal, setTypeModal] = useState(false);
  const [editingType, setEditingType] = useState(null);
  const [typeForm, setTypeForm] = useState({ nom: "", montant_defaut: "", monnaie: "HTG" });

  const loadFeeTypes = async () => {
    if (!token) return;
    const supabase = getAuthedClient(token);
    const { data } = await supabase.from("misc_fee_types").select("*").order("nom");
    setFeeTypes(data || []);
  };

  const loadPayments = async () => {
    if (!token) return;
    const supabase = getAuthedClient(token);
    const { data } = await supabase.from("misc_fee_payments").select("*").order("created_at", { ascending: false }).limit(300);
    let list = data || [];
    if (search) {
      const s = search.toLowerCase();
      list = list.filter((p) => (p.receipt_number + " " + (p.fee_type_nom || "")).toLowerCase().includes(s));
    }
    const studentIds = [...new Set(list.filter((p) => p.student_uuid).map((p) => p.student_uuid))];
    const customerIds = [...new Set(list.filter((p) => p.customer_uuid).map((p) => p.customer_uuid))];
    const { data: students } = studentIds.length ? await supabase.from("students").select("id, nom, prenom, matricule").in("id", studentIds) : { data: [] };
    const { data: customers } = customerIds.length ? await supabase.from("customers").select("id, nom").in("id", customerIds) : { data: [] };
    list = list.map((p) => {
      const st = (students || []).find((s) => s.id === p.student_uuid);
      const cu = (customers || []).find((c) => c.id === p.customer_uuid);
      return { ...p, student_prenom: st ? st.prenom : "", student_nom: st ? st.nom : "", matricule: st ? st.matricule : "", customer_nom: cu ? cu.nom : "" };
    });
    setPayments(list);
  };

  useEffect(() => { loadFeeTypes(); loadPayments(); }, [token]);
  useEffect(() => { const t = setTimeout(loadPayments, 300); return () => clearTimeout(t); }, [search]);

  useEffect(() => {
    if (!studentSearch || !token) { setStudentResults([]); return; }
    const t = setTimeout(async () => {
      const supabase = getAuthedClient(token);
      const like = "%" + studentSearch + "%";
      const { data } = await supabase.from("students").select("id, nom, prenom, matricule").or("nom.ilike." + like + ",prenom.ilike." + like + ",matricule.ilike." + like).limit(10);
      setStudentResults(data || []);
    }, 250);
    return () => clearTimeout(t);
  }, [studentSearch, token]);

  useEffect(() => {
    if (!custSearch || !token) { setCustResults([]); return; }
    const t = setTimeout(async () => {
      const supabase = getAuthedClient(token);
      const { data } = await supabase.from("customers").select("*").ilike("nom", "%" + custSearch + "%").limit(10);
      setCustResults(data || []);
    }, 250);
    return () => clearTimeout(t);
  }, [custSearch, token]);

  const createCustomer = async () => {
    if (!newCust.nom || !token) return;
    const supabase = getAuthedClient(token);
    const { data, error: e } = await supabase.from("customers").insert({ nom: newCust.nom, telephone: newCust.telephone, modified_by: user.username }).select().single();
    if (e) { setError(e.message); return; }
    setSelCust(data); setNewCustOpen(false); setNewCust({ nom: "", telephone: "" });
  };

  const onSelectFeeType = (id) => {
    setSelFeeType(id);
    const ft = feeTypes.find((f) => f.id === id);
    if (ft) { setMontant(String(ft.montant_defaut)); setMonnaie(ft.monnaie); }
  };

  const resetForm = () => {
    setClientType("eleve"); setStudentSearch(""); setStudentResults([]); setSelStudent(null);
    setCustSearch(""); setCustResults([]); setSelCust(null); setNewCustOpen(false);
    setSelFeeType(""); setMontant(""); setMonnaie("HTG"); setError("");
  };

  const fmt = (n) => Number(n || 0).toLocaleString();
  const prenom = user ? (user.prenom || (user.nom_complet || user.username).split(" ")[0]) : "collegue";

  const genererRecu = async (supabase) => {
    const yearLabel = currentYear ? currentYear.nom.split("-")[0] : String(new Date().getFullYear());
    const counterKey = "recu_D_WEB_" + yearLabel;
    const { data, error: e } = await supabase.rpc("next_counter_value", { counter_key: counterKey });
    if (e) throw e;
    const suffix = "WEB-" + String(data).padStart(4, "0");
    return "CAPV-D-" + yearLabel + "-" + suffix;
  };

  const submit = async () => {
    setError("");
    if (clientType === "eleve" && !selStudent) { setError("Choisissez un eleve"); return; }
    if (clientType === "externe" && !selCust) { setError("Choisissez ou creez un client"); return; }
    if (!selFeeType) { setError("Choisissez un type de frais"); return; }
    const m = Number(montant);
    if (!m || m <= 0) { setError("Montant invalide"); return; }
    const ft = feeTypes.find((f) => f.id === selFeeType);
    if (ft && ft.montant_defaut > 0 && m > ft.montant_defaut) { setError("Le montant depasse le prix standard de ce frais (" + fmt(ft.montant_defaut) + " " + ft.monnaie + ")"); return; }
    if (!activeSession) { setError("Ouvrez d'abord votre session sur une sous-caisse."); return; }

    setBusy(true);
    try {
      const supabase = getAuthedClient(token);
      const receiptNumber = await genererRecu(supabase);
      const montantRecu = payMontantRecu ? Number(payMontantRecu) : null;
      const { data, error: e } = await supabase.from("misc_fee_payments").insert({
        receipt_number: receiptNumber,
        fee_type_uuid: selFeeType, fee_type_nom: ft ? ft.nom : "",
        student_uuid: clientType === "eleve" ? selStudent.id : null,
        customer_uuid: clientType === "externe" ? selCust.id : null,
        montant: m, montant_recu: montantRecu, monnaie,
        user_uuid: user.id, nom_caissier: user.nom_complet || user.username,
        statut: "valide",
        academic_year_uuid: currentYear ? currentYear.id : null,
        session_sous_caisse_uuid: activeSession.id,
        modified_by: user.username
      }).select().single();
      if (e) throw e;

      await genererEcritureEncaissement(supabase, {
        sousCaisseUuid: activeSession.sous_caisse_uuid, compteProduitNumero: "4200",
        montant: m, origine_type: "misc_fee_payment", origine_id: data.id,
        description: "Frais divers - Recu " + data.receipt_number,
        user_uuid: user.id, nom_utilisateur: user.nom_complet || user.username, modified_by: user.username,
        date_ecriture: new Date().toISOString().slice(0, 10)
      });

      const payeur = clientType === "eleve" ? (selStudent.prenom + " " + selStudent.nom) : selCust.nom;
      setLastReceipt({ ...data, payeur_nom: payeur });
      setPayMontantRecu("");
      resetForm();
      loadPayments();
    } catch (e) {
      setError(e.message || "Erreur lors de l'encaissement");
    }
    setBusy(false);
  };

  const cancelPayment = async (id) => {
    if (!confirm("Annuler ce paiement ?")) return;
    const supabase = getAuthedClient(token);
    await supabase.from("misc_fee_payments").update({ statut: "annule", modified_by: user.username }).eq("id", id);
    loadPayments();
  };

  const openNewType = () => { setEditingType(null); setTypeForm({ nom: "", montant_defaut: "", monnaie: "HTG" }); setTypeModal(true); };
  const openEditType = (t) => { setEditingType(t); setTypeForm({ nom: t.nom, montant_defaut: t.montant_defaut, monnaie: t.monnaie }); setTypeModal(true); };
  const submitType = async () => {
    if (!typeForm.nom.trim()) return;
    const supabase = getAuthedClient(token);
    if (editingType) {
      await supabase.from("misc_fee_types").update({ nom: typeForm.nom, montant_defaut: Number(typeForm.montant_defaut) || 0, monnaie: typeForm.monnaie, modified_by: user.username }).eq("id", editingType.id);
    } else {
      await supabase.from("misc_fee_types").insert({ nom: typeForm.nom, montant_defaut: Number(typeForm.montant_defaut) || 0, monnaie: typeForm.monnaie, actif: 1, modified_by: user.username });
    }
    setTypeModal(false);
    loadFeeTypes();
  };
  const deleteType = async (id) => {
    if (!confirm("Supprimer ce type de frais ?")) return;
    const supabase = getAuthedClient(token);
    await supabase.from("misc_fee_types").delete().eq("id", id);
    loadFeeTypes();
  };

  const inputStyle = { padding: "10px 12px", borderRadius: "8px", border: "1.5px solid var(--line)", background: "var(--bg-soft)", fontSize: "14px" };

  return (
    <div className="page">
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 className="page-title">Frais Divers</h1>
          <p className="page-subtitle">Inscriptions, attestations et autres frais ponctuels</p>
        </div>
      </div>

      <div className="store-tabs">
        <button className={"store-tab" + (tab === "caisse" ? " active" : "")} onClick={() => setTab("caisse")}>Caisse</button>
        <button className={"store-tab" + (tab === "historique" ? " active" : "")} onClick={() => setTab("historique")}>Historique</button>
        <button className={"store-tab" + (tab === "types" ? " active" : "")} onClick={() => setTab("types")}>Types de frais</button>
      </div>

      {lastReceipt && (
        <div className="receipt-banner">
          <span>{prenom}, paiement enregistre - {lastReceipt.receipt_number}</span>
          <span style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <button onClick={() => printUnifiedReceipt(toReceiptRec(lastReceipt), settings)} className="btn-sm btn-blue">Imprimer</button>
            <button onClick={() => downloadUnifiedReceiptPDF(toReceiptRec(lastReceipt), settings)} className="btn-sm btn-gold">PDF</button>
            <button onClick={() => setLastReceipt(null)} className="receipt-banner-x">x</button>
          </span>
        </div>
      )}

      {tab === "caisse" && (
        <div className="form-card" style={{ maxWidth: "560px" }}>
          {error && <div className="login-error" style={{ marginBottom: "16px" }}>{error}</div>}

          <div style={{ display: "flex", gap: "10px", marginBottom: "16px" }}>
            <button className={"btn-sm " + (clientType === "eleve" ? "btn-primary" : "btn-gray-cancel")} onClick={() => setClientType("eleve")}>Eleve du CAPV</button>
            <button className={"btn-sm " + (clientType === "externe" ? "btn-primary" : "btn-gray-cancel")} onClick={() => setClientType("externe")}>Personne externe</button>
          </div>

          {clientType === "eleve" && (
            <div style={{ position: "relative", marginBottom: "16px" }}>
              {selStudent ? (
                <div className="section-chip" style={{ padding: "10px 14px" }}>
                  {selStudent.prenom} {selStudent.nom} ({selStudent.matricule})
                  <button className="chip-x" onClick={() => setSelStudent(null)}>x</button>
                </div>
              ) : (
                <>
                  <input value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} placeholder="Rechercher un eleve (nom, matricule)..." style={{ ...inputStyle, width: "100%" }} />
                  {studentResults.length > 0 && (
                    <div className="search-dropdown">
                      {studentResults.map((s) => (
                        <div key={s.id} className="search-item" onClick={() => { setSelStudent(s); setStudentSearch(""); setStudentResults([]); }}>
                          <strong>{s.prenom} {s.nom}</strong> <span style={{ fontSize: "12px", color: "var(--text-dim)" }}>{s.matricule}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {clientType === "externe" && (
            <div style={{ position: "relative", marginBottom: "16px" }}>
              {selCust ? (
                <div className="section-chip" style={{ padding: "10px 14px" }}>
                  {selCust.nom}{selCust.telephone ? " - " + selCust.telephone : ""}
                  <button className="chip-x" onClick={() => setSelCust(null)}>x</button>
                </div>
              ) : (
                <>
                  <input value={custSearch} onChange={(e) => setCustSearch(e.target.value)} placeholder="Rechercher une personne (nom)..." style={{ ...inputStyle, width: "100%" }} />
                  {custResults.length > 0 && (
                    <div className="search-dropdown">
                      {custResults.map((c) => (
                        <div key={c.id} className="search-item" onClick={() => { setSelCust(c); setCustSearch(""); setCustResults([]); }}>
                          <strong>{c.nom}</strong> {c.telephone && <span style={{ fontSize: "12px", color: "var(--text-dim)" }}>{c.telephone}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                  {!newCustOpen
                    ? <button className="btn-sm btn-gray-cancel" style={{ marginTop: "8px" }} onClick={() => setNewCustOpen(true)}>+ Nouvelle personne</button>
                    : (
                      <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                        <input value={newCust.nom} onChange={(e) => setNewCust({ ...newCust, nom: e.target.value })} placeholder="Nom" style={{ ...inputStyle, flex: 1 }} />
                        <input value={newCust.telephone} onChange={(e) => setNewCust({ ...newCust, telephone: e.target.value })} placeholder="Telephone" style={{ ...inputStyle, flex: 1 }} />
                        <button className="btn-primary" onClick={createCustomer}>Creer</button>
                      </div>
                    )}
                </>
              )}
            </div>
          )}

          <div className="form-group" style={{ marginBottom: "14px" }}>
            <label>Type de frais *</label>
            <select value={selFeeType} onChange={(e) => onSelectFeeType(e.target.value)}>
              <option value="">-- Choisir --</option>
              {feeTypes.filter((f) => f.actif).map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
            </select>
          </div>

          <div className="form-row">
            <div className="form-group"><label>Montant *</label><input type="number" value={montant} onChange={(e) => setMontant(e.target.value)} /></div>
            <div className="form-group"><label>Montant recu <span style={{ fontWeight: 400, color: "var(--text-dim)" }}>(optionnel)</span></label><input type="number" value={payMontantRecu} onChange={(e) => setPayMontantRecu(e.target.value)} placeholder="ex: 1000" /></div>
            <div className="form-group"><label>Monnaie</label><select value={monnaie} onChange={(e) => setMonnaie(e.target.value)}><option value="HTG">HTG</option><option value="USD">USD</option></select></div>
          </div>

          <button className="btn-primary" style={{ marginTop: "10px", width: "100%" }} onClick={submit} disabled={busy}>{busy ? "Enregistrement..." : "Encaisser"}</button>
        </div>
      )}

      {tab === "historique" && (
        <>
          <div className="form-card" style={{ marginBottom: "20px" }}>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher (recu, type)..." style={{ ...inputStyle, width: "100%", maxWidth: "400px" }} />
          </div>
          <div className="table-card">
            <table className="data-table">
              <thead><tr><th>Recu</th><th>Date</th><th>Payeur</th><th>Type</th><th>Montant</th><th>Statut</th><th>Actions</th></tr></thead>
              <tbody>
                {payments.length === 0 && <tr><td colSpan="7" className="table-empty">Aucun paiement.</td></tr>}
                {payments.map((p) => (
                  <tr key={p.id} style={{ opacity: p.statut === "annule" ? 0.5 : 1 }}>
                    <td><strong style={{ color: "var(--accent)" }}>{p.receipt_number}</strong></td>
                    <td>{p.created_at ? new Date(p.created_at).toLocaleString() : ""}</td>
                    <td>{p.student_uuid ? p.student_prenom + " " + p.student_nom + " (" + p.matricule + ")" : p.customer_nom}</td>
                    <td>{p.fee_type_nom}</td>
                    <td><strong>{fmt(p.montant)} {p.monnaie}</strong></td>
                    <td>{p.statut === "valide" ? <span className="badge badge-ok">Valide</span> : <span className="badge badge-gray">Annule</span>}</td>
                    <td>
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button className="btn-sm btn-blue" onClick={() => printUnifiedReceipt(toReceiptRec({ ...p, payeur_nom: p.student_uuid ? p.student_prenom + " " + p.student_nom : p.customer_nom }), settings)}>Imprimer</button>
                        <button className="btn-sm btn-gold" onClick={() => downloadUnifiedReceiptPDF(toReceiptRec({ ...p, payeur_nom: p.student_uuid ? p.student_prenom + " " + p.student_nom : p.customer_nom }), settings)}>PDF</button>
                        {p.statut === "valide" && <button className="btn-sm btn-red" onClick={() => cancelPayment(p.id)}>Annuler</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "types" && (
        <>
          <div style={{ marginBottom: "16px" }}><button className="btn-primary btn-sm" onClick={openNewType}>+ Nouveau type de frais</button></div>
          <div className="table-card">
            <table className="data-table">
              <thead><tr><th>Nom</th><th>Montant par defaut</th><th>Statut</th><th>Actions</th></tr></thead>
              <tbody>
                {feeTypes.length === 0 && <tr><td colSpan="4" className="table-empty">Aucun type de frais.</td></tr>}
                {feeTypes.map((t) => (
                  <tr key={t.id}>
                    <td><strong>{t.nom}</strong></td>
                    <td>{fmt(t.montant_defaut)} {t.monnaie}</td>
                    <td>{t.actif ? <span className="badge badge-ok">Actif</span> : <span className="badge badge-gray">Inactif</span>}</td>
                    <td>
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button className="btn-sm btn-blue" onClick={() => openEditType(t)}>Modifier</button>
                        <button className="btn-sm btn-red" onClick={() => deleteType(t.id)}>Suppr.</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {typeModal && (
        <div className="modal-overlay" onClick={() => setTypeModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "440px" }}>
            <div className="modal-header"><h3>{editingType ? "Modifier le type" : "Nouveau type de frais"}</h3><button className="modal-close" onClick={() => setTypeModal(false)}>x</button></div>
            <div className="form-group" style={{ marginBottom: "14px" }}><label>Nom</label><input value={typeForm.nom} onChange={(e) => setTypeForm({ ...typeForm, nom: e.target.value })} placeholder="ex: Attestation de scolarite" /></div>
            <div className="form-row">
              <div className="form-group"><label>Montant par defaut</label><input type="number" value={typeForm.montant_defaut} onChange={(e) => setTypeForm({ ...typeForm, montant_defaut: e.target.value })} /></div>
              <div className="form-group"><label>Monnaie</label><select value={typeForm.monnaie} onChange={(e) => setTypeForm({ ...typeForm, monnaie: e.target.value })}><option value="HTG">HTG</option><option value="USD">USD</option></select></div>
            </div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "16px" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setTypeModal(false)}>Annuler</button>
              <button className="btn-primary" onClick={submitType}>{editingType ? "Enregistrer" : "Creer"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
