import React, { useState, useEffect } from "react";
import { useAuth } from "../AuthContext.jsx";
import { getAuthedClient, EDGE_FUNCTION_URL, SUPABASE_ANON_KEY } from "../supabaseClient.js";
import { useYear } from "../YearContext.jsx";
import QrCaptureModal from "../components/QrCaptureModal.jsx";
import bcrypt from "bcryptjs";

export default function Employees() {
  const { token, user } = useAuth();
  const { currentYear } = useYear();
  const [tab, setTab] = useState("employes");

  const [employees, setEmployees] = useState([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  const [identTarget, setIdentTarget] = useState(null);
  const [identPin, setIdentPin] = useState("");
  const [identMsg, setIdentMsg] = useState("");
  const [identError, setIdentError] = useState("");
  const [qrCaptureOpen, setQrCaptureOpen] = useState(false);
  const [adminCreds, setAdminCreds] = useState({ username: "", password: "" });

  const [payroll, setPayroll] = useState([]);
  const [paySearch, setPaySearch] = useState("");
  const [payModal, setPayModal] = useState(false);
  const [payForm, setPayForm] = useState({ employee_id: "", periode: "", salaire_base: "", primes: "", deductions: "" });
  const [payError, setPayError] = useState("");
  const [lastPay, setLastPay] = useState(null);

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
  const checkUserPerm = async (supabase, username, moduleKey, action) => {
    const { data: u } = await supabase.from("users").select("role_nom").eq("username", username).maybeSingle();
    if (!u) return false;
    if (u.role_nom === "Administrateur") return true;
    const { data: role } = await supabase.from("roles").select("id").eq("nom", u.role_nom).maybeSingle();
    if (!role) return false;
    const { data: perm } = await supabase.from("role_permissions").select("*").eq("role_uuid", role.id).eq("module", moduleKey).maybeSingle();
    return !!(perm && perm[action]);
  };

  const loadEmployees = async () => {
    const supabase = getAuthedClient(token);
    let query = supabase.from("employees").select("*").order("nom");
    if (search) query = query.or("nom.ilike.%" + search + "%,matricule.ilike.%" + search + "%");
    const { data, error: e } = await query;
    if (e) { setError(e.message); return; }
    setEmployees(data || []);
  };
  const loadPayroll = async () => {
    const supabase = getAuthedClient(token);
    const { data: pr } = await supabase.from("payroll").select("*").order("date_paiement", { ascending: false });
    const { data: emps } = await supabase.from("employees").select("id, nom, matricule");
    const withNames = (pr || []).map((p) => {
      const e = (emps || []).find((x) => x.id === p.employee_uuid);
      return { ...p, employe_nom: e ? e.nom : "?", matricule: e ? e.matricule : "?" };
    });
    const filtered = paySearch
      ? withNames.filter((p) => (p.employe_nom + " " + p.periode).toLowerCase().includes(paySearch.toLowerCase()))
      : withNames;
    setPayroll(filtered);
  };

  useEffect(() => { const t = setTimeout(loadEmployees, 300); return () => clearTimeout(t); }, [search, token]);
  useEffect(() => { const t = setTimeout(loadPayroll, 300); return () => clearTimeout(t); }, [paySearch, token]);

  const setField = (k, v) => setForm({ ...form, [k]: v });
  const fmt = (n) => Number(n || 0).toLocaleString();

  const genererMatricule = async (supabase) => {
    const { count } = await supabase.from("employees").select("id", { count: "exact", head: true });
    return "EMP-" + String((count || 0) + 1).padStart(4, "0");
  };

  const openNew = () => { setEditing(null); setForm({ nom: "", fonction: "", departement: "", salaire: "", monnaie: "HTG", date_embauche: "", telephone: "" }); setError(""); setModalOpen(true); };
  const openEdit = (e) => { setEditing(e); setForm({ nom: e.nom, fonction: e.fonction || "", departement: e.departement || "", salaire: e.salaire, monnaie: e.monnaie, date_embauche: e.date_embauche || "", telephone: e.telephone || "", statut: e.statut }); setError(""); setModalOpen(true); };

  const submit = async () => {
    const salaireNum = form.salaire === "" || form.salaire === undefined ? 0 : Number(form.salaire);
    setError("");
    if (!form.nom.trim()) { setError("Le nom est requis"); return; }
    setSaving(true);
    try {
      const supabase = getAuthedClient(token);
      if (editing) {
        const { error: e } = await supabase.from("employees").update({ ...form, salaire: salaireNum, modified_by: user.username }).eq("id", editing.id);
        if (e) throw e;
      } else {
        const matricule = await genererMatricule(supabase);
        const { error: e } = await supabase.from("employees").insert({ ...form, salaire: salaireNum, matricule, statut: "actif", modified_by: user.username });
        if (e) throw e;
      }
      setModalOpen(false); loadEmployees();
    } catch (e) { setError(e.message || "Erreur"); }
    setSaving(false);
  };

  const openIdent = (e) => { setIdentTarget(e); setIdentPin(""); setIdentMsg(""); setIdentError(""); setAdminCreds({ username: "", password: "" }); };

  const handleQrCaptured = async (qrValue) => {
    setQrCaptureOpen(false);
    setIdentError(""); setIdentMsg("");
    const check = await verifyCredentials(adminCreds.username, adminCreds.password);
    if (!check.ok) { setIdentError(check.error); return; }
    const supabase = getAuthedClient(token);
    const allowed = await checkUserPerm(supabase, adminCreds.username, "employees", "peut_modifier");
    if (!allowed) { setIdentError("Ce compte n''a pas la permission requise"); return; }

    const { data: dup } = await supabase.from("employees").select("id").eq("qr_value", qrValue).neq("id", identTarget.id).maybeSingle();
    if (dup) { setIdentError("Ce badge est deja associe a un autre employe"); return; }

    const { error: e } = await supabase.from("employees").update({ qr_value: qrValue, modified_by: adminCreds.username }).eq("id", identTarget.id);
    if (e) { setIdentError(e.message); return; }
    setIdentMsg("Badge associe avec succes.");
    setIdentTarget({ ...identTarget, qr_value: qrValue });
    loadEmployees();
  };

  const handleSetPin = async () => {
    setIdentError(""); setIdentMsg("");
    if (!identPin || identPin.length < 4) { setIdentError("Le code doit contenir au moins 4 caracteres"); return; }
    const check = await verifyCredentials(adminCreds.username, adminCreds.password);
    if (!check.ok) { setIdentError(check.error); return; }
    const supabase = getAuthedClient(token);
    const allowed = await checkUserPerm(supabase, adminCreds.username, "employees", "peut_modifier");
    if (!allowed) { setIdentError("Ce compte n''a pas la permission requise"); return; }

    const hash = bcrypt.hashSync(identPin, 10);
    const { error: e } = await supabase.from("employees").update({ pin_hash: hash, modified_by: adminCreds.username }).eq("id", identTarget.id);
    if (e) { setIdentError(e.message); return; }
    setIdentMsg("Code PIN defini avec succes.");
    setIdentPin("");
  };

  const openPay = () => { setPayForm({ employee_id: "", periode: "", salaire_base: "", primes: "", deductions: "" }); setPayError(""); setPayModal(true); };
  const onSelectEmp = (id) => {
    const e = employees.find((x) => x.id === id);
    setPayForm({ ...payForm, employee_id: id, salaire_base: e ? e.salaire : "" });
  };
  const submitPay = async () => {
    setPayError("");
    if (!payForm.employee_id) { setPayError("Choisissez un employe"); return; }
    if (!payForm.periode) { setPayError("Indiquez la periode (ex: 2026-01)"); return; }
    try {
      const supabase = getAuthedClient(token);
      const emp = employees.find((e) => e.id === payForm.employee_id);
      if (!emp) { setPayError("Employe introuvable"); return; }

      const { data: dup } = await supabase.from("payroll").select("id").eq("employee_uuid", emp.id).eq("periode", payForm.periode).maybeSingle();
      if (dup) { setPayError("Cet employe a deja ete paye pour la periode " + payForm.periode); return; }

      const base = Number(payForm.salaire_base) || emp.salaire || 0;
      const pr = Number(payForm.primes) || 0;
      const ded = Number(payForm.deductions) || 0;
      const net = base + pr - ded;

      const { data: newPay, error: e1 } = await supabase.from("payroll").insert({
        employee_uuid: emp.id, periode: payForm.periode, salaire_base: base, primes: pr, deductions: ded,
        net_a_payer: net, monnaie: emp.monnaie || "HTG", date_paiement: new Date().toISOString(), modified_by: user.username
      }).select().single();
      if (e1) throw e1;

      await supabase.from("expenses").insert({
        categorie: "Salaires", montant: net, monnaie: emp.monnaie || "HTG",
        description: "Paie " + emp.nom + " - " + payForm.periode, statut: "approuve",
        academic_year_uuid: currentYear ? currentYear.id : null, modified_by: user.username
      });

      setPayModal(false); setLastPay({ ...newPay, employe_nom: emp.nom }); loadPayroll();
    } catch (e) { setPayError(e.message || "Erreur"); }
  };

  const totalMasse = employees.filter(e => e.statut === "actif").reduce((a, e) => a + (e.salaire || 0), 0);

  return (
    <div className="page">
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 className="page-title">Ressources Humaines</h1>
          <p className="page-subtitle">{employees.length} employe(s)</p>
        </div>
        {tab === "employes"
          ? <button className="btn-primary" onClick={openNew}>+ Nouvel employe</button>
          : <button className="btn-primary" onClick={openPay}>+ Verser un salaire</button>}
      </div>

      <div className="store-tabs">
        <button className={"store-tab" + (tab === "employes" ? " active" : "")} onClick={() => setTab("employes")}>Employes</button>
        <button className={"store-tab" + (tab === "paie" ? " active" : "")} onClick={() => setTab("paie")}>Paie</button>
      </div>

      {tab === "employes" && (
        <>
          <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
            <div className="kpi-card"><div className="kpi-label">Employes actifs</div><div className="kpi-value">{employees.filter(e => e.statut === "actif").length}</div></div>
            <div className="kpi-card"><div className="kpi-label">Masse salariale mensuelle</div><div className="kpi-value" style={{ color: "var(--accent-light)" }}>{fmt(totalMasse)} HTG</div></div>
          </div>

          <div className="form-card" style={{ marginBottom: "22px" }}>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un employe..."
              style={{ width: "100%", maxWidth: "400px", padding: "11px 14px", borderRadius: "10px", border: "1.5px solid var(--line)", background: "var(--bg-soft)", fontSize: "14px" }} />
          </div>

          <div className="table-card">
            <table className="data-table">
              <thead><tr><th>Matricule</th><th>Nom</th><th>Fonction</th><th>Departement</th><th>Salaire</th><th>Statut</th><th>Actions</th></tr></thead>
              <tbody>
                {error && <tr><td colSpan="7" className="table-empty">{error}</td></tr>}
                {employees.length === 0 && !error && <tr><td colSpan="7" className="table-empty">Aucun employe.</td></tr>}
                {employees.map((e) => (
                  <tr key={e.id} style={{ opacity: e.statut === "inactif" ? 0.5 : 1 }}>
                    <td><strong>{e.matricule}</strong></td>
                    <td>{e.nom}</td>
                    <td>{e.fonction || "-"}</td>
                    <td>{e.departement || "-"}</td>
                    <td><strong>{fmt(e.salaire)} {e.monnaie}</strong></td>
                    <td>{e.statut === "actif" ? <span className="badge badge-ok">Actif</span> : <span className="badge badge-gray">Inactif</span>}</td>
                    <td><div className="table-actions"><button className="btn-sm btn-blue" onClick={() => openEdit(e)}>Modifier</button><button className="btn-sm btn-gray-cancel" onClick={() => openIdent(e)}>Identification</button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "paie" && (
        <>
          {lastPay && <div className="receipt-banner" style={{ marginBottom: "18px" }}>Salaire verse ({fmt(lastPay.net_a_payer)} {lastPay.monnaie}) pour {lastPay.employe_nom} - periode {lastPay.periode}.<button onClick={() => setLastPay(null)} className="receipt-banner-x">x</button></div>}
          <div className="form-card" style={{ marginBottom: "22px" }}>
            <input value={paySearch} onChange={(e) => setPaySearch(e.target.value)} placeholder="Rechercher (employe, periode)..."
              style={{ width: "100%", maxWidth: "400px", padding: "11px 14px", borderRadius: "10px", border: "1.5px solid var(--line)", background: "var(--bg-soft)", fontSize: "14px" }} />
          </div>
          <div className="table-card">
            <table className="data-table">
              <thead><tr><th>Employe</th><th>Periode</th><th>Base</th><th>Primes</th><th>Deductions</th><th>Net paye</th><th>Date</th></tr></thead>
              <tbody>
                {payroll.length === 0 && <tr><td colSpan="7" className="table-empty">Aucun versement.</td></tr>}
                {payroll.map((p) => (
                  <tr key={p.id}>
                    <td><strong>{p.employe_nom}</strong><br/><span style={{ fontSize: "12px", color: "var(--text-dim)" }}>{p.matricule}</span></td>
                    <td><span className="badge badge-blue">{p.periode}</span></td>
                    <td>{fmt(p.salaire_base)}</td>
                    <td style={{ color: "var(--ok)" }}>{fmt(p.primes)}</td>
                    <td style={{ color: "var(--err)" }}>{fmt(p.deductions)}</td>
                    <td><strong>{fmt(p.net_a_payer)} {p.monnaie}</strong></td>
                    <td>{p.date_paiement ? p.date_paiement.slice(0, 10) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal-card modal-large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h3>{editing ? "Modifier l''employe" : "Nouvel employe"}</h3><button className="modal-close" onClick={() => setModalOpen(false)}>x</button></div>
            {error && <div className="login-error" style={{ marginBottom: "16px" }}>{error}</div>}
            <div className="form-row">
              <div className="form-group"><label>Nom complet *</label><input value={form.nom} onChange={(e) => setField("nom", e.target.value)} /></div>
              <div className="form-group"><label>Fonction</label><input value={form.fonction} onChange={(e) => setField("fonction", e.target.value)} placeholder="ex: Enseignant" /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Departement</label><input value={form.departement} onChange={(e) => setField("departement", e.target.value)} placeholder="ex: Secondaire" /></div>
              <div className="form-group"><label>Telephone</label><input value={form.telephone} onChange={(e) => setField("telephone", e.target.value)} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Salaire de base</label><input type="number" value={form.salaire} onChange={(e) => setField("salaire", e.target.value)} /></div>
              <div className="form-group"><label>Monnaie</label><select value={form.monnaie} onChange={(e) => setField("monnaie", e.target.value)}><option value="HTG">HTG</option><option value="USD">USD</option></select></div>
              <div className="form-group"><label>Date d''embauche</label><input type="date" value={form.date_embauche} onChange={(e) => setField("date_embauche", e.target.value)} /></div>
            </div>
            {editing && (
              <div className="form-group" style={{ marginBottom: "16px" }}><label>Statut</label><select value={form.statut} onChange={(e) => setField("statut", e.target.value)}><option value="actif">Actif</option><option value="inactif">Inactif</option></select></div>
            )}
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "12px" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setModalOpen(false)}>Annuler</button>
              <button className="btn-primary" onClick={submit} disabled={saving}>{saving ? "Enregistrement..." : (editing ? "Enregistrer" : "Creer")}</button>
            </div>
          </div>
        </div>
      )}

      {payModal && (
        <div className="modal-overlay" onClick={() => setPayModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "500px" }}>
            <div className="modal-header"><h3>Verser un salaire</h3><button className="modal-close" onClick={() => setPayModal(false)}>x</button></div>
            {payError && <div className="login-error" style={{ marginBottom: "16px" }}>{payError}</div>}
            <div className="form-group" style={{ marginBottom: "14px" }}>
              <label>Employe *</label>
              <select value={payForm.employee_id} onChange={(e) => onSelectEmp(e.target.value)}>
                <option value="">-- Choisir --</option>
                {employees.filter(e => e.statut === "actif").map((e) => <option key={e.id} value={e.id}>{e.nom} ({e.matricule})</option>)}
              </select>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Periode * (ex: 2026-01)</label><input value={payForm.periode} onChange={(e) => setPayForm({ ...payForm, periode: e.target.value })} placeholder="2026-01" /></div>
              <div className="form-group"><label>Salaire de base</label><input type="number" value={payForm.salaire_base} onChange={(e) => setPayForm({ ...payForm, salaire_base: e.target.value })} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Primes</label><input type="number" value={payForm.primes} onChange={(e) => setPayForm({ ...payForm, primes: e.target.value })} placeholder="0" /></div>
              <div className="form-group"><label>Deductions</label><input type="number" value={payForm.deductions} onChange={(e) => setPayForm({ ...payForm, deductions: e.target.value })} placeholder="0" /></div>
            </div>
            <p style={{ fontSize: "12px", color: "var(--text-soft)", marginBottom: "16px" }}>Net a payer = base + primes - deductions. Ce versement sera enregistre comme depense "Salaires".</p>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setPayModal(false)}>Annuler</button>
              <button className="btn-primary" onClick={submitPay}>Verser</button>
            </div>
          </div>
        </div>
      )}

      {identTarget && (
        <div className="modal-overlay" onClick={() => setIdentTarget(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "460px" }}>
            <div className="modal-header"><h3>Identification - {identTarget.nom}</h3><button className="modal-close" onClick={() => setIdentTarget(null)}>x</button></div>
            {identMsg && <div className="receipt-banner" style={{ marginBottom: "16px" }}>{identMsg}</div>}
            {identError && <div className="login-error" style={{ marginBottom: "16px" }}>{identError}</div>}
            <div style={{ background: "var(--bg-soft)", borderRadius: "10px", padding: "12px 14px", marginBottom: "18px" }}>
              <p style={{ fontSize: "12px", color: "var(--text-soft)", marginBottom: "10px", fontWeight: 600 }}>Confirmation administrateur requise</p>
              <div className="form-group" style={{ marginBottom: "10px" }}>
                <label>Identifiant</label>
                <input value={adminCreds.username} onChange={(e) => setAdminCreds({ ...adminCreds, username: e.target.value })} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Mot de passe</label>
                <input type="password" value={adminCreds.password} onChange={(e) => setAdminCreds({ ...adminCreds, password: e.target.value })} />
              </div>
            </div>
            <div style={{ marginBottom: "20px" }}>
              <p style={{ fontSize: "13px", color: "var(--text-dim)", marginBottom: "10px" }}>Badge QR : <strong>{identTarget.qr_value ? "Associe" : "Non associe"}</strong></p>
              <button className="btn-sm btn-blue" onClick={() => setQrCaptureOpen(true)}>Scanner et associer un badge</button>
            </div>
            <div style={{ borderTop: "1px solid var(--line)", paddingTop: "16px" }}>
              <div className="form-group" style={{ marginBottom: "16px" }}>
                <label>Nouveau code PIN (4 caracteres minimum)</label>
                <input type="password" value={identPin} onChange={(e) => setIdentPin(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSetPin()} />
              </div>
              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                <button className="btn-primary" onClick={handleSetPin}>Definir le code</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {qrCaptureOpen && (
        <QrCaptureModal
          title={"Scanner le badge de " + (identTarget ? identTarget.nom : "")}
          onCaptured={handleQrCaptured}
          onClose={() => setQrCaptureOpen(false)}
        />
      )}
    </div>
  );
}