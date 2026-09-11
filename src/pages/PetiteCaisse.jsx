import React, { useState, useEffect } from "react";
import { useAuth } from "../AuthContext.jsx";
import { getAuthedClient, EDGE_FUNCTION_URL, SUPABASE_ANON_KEY } from "../supabaseClient.js";
import { useYear } from "../YearContext.jsx";

const STATUT_BADGE = {
  en_attente: { t: "En attente", c: "badge-gold" },
  approuve: { t: "Approuvee", c: "badge-ok" },
  rejete: { t: "Rejetee", c: "badge-err" },
  annule: { t: "Annulee", c: "badge-gray" }
};

export default function PetiteCaisse() {
  const { token, user } = useAuth();
  const { currentYear: year } = useYear();
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [catUsage, setCatUsage] = useState({});
  const [config, setConfig] = useState({ petite_caisse_plafond: 0 });
  const [solde, setSolde] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [canCreer, setCanCreer] = useState(false);
  const [canModifier, setCanModifier] = useState(false);
  const [canAnnuler, setCanAnnuler] = useState(false);
  const [canAlimenter, setCanAlimenter] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ categorie: "", montant: "", monnaie: "HTG", description: "" });

  const [authAction, setAuthAction] = useState(null);
  const [creds, setCreds] = useState({ username: "", password: "" });
  const [authError, setAuthError] = useState("");

  const [catModalOpen, setCatModalOpen] = useState(false);
  const [newCat, setNewCat] = useState("");
  const [catPwdOpen, setCatPwdOpen] = useState(false);
  const [catPwd, setCatPwd] = useState("");
  const [catPwdError, setCatPwdError] = useState("");
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [archiveCreds, setArchiveCreds] = useState({ username: "", password: "" });
  const [archiveError, setArchiveError] = useState("");
  const [catHistTarget, setCatHistTarget] = useState(null);
  const [catHistData, setCatHistData] = useState(null);

  const [transferOpen, setTransferOpen] = useState(false);
  const [transferMontant, setTransferMontant] = useState("");
  const [transferCheque, setTransferCheque] = useState("");
  const [transferCreds, setTransferCreds] = useState({ username: "", password: "" });
  const [transferError, setTransferError] = useState("");
  const [transferBusy, setTransferBusy] = useState(false);

  const [configOpen, setConfigOpen] = useState(false);
  const [configForm, setConfigForm] = useState({ petite_caisse_plafond: "" });
  const [configCreds, setConfigCreds] = useState({ username: "", password: "" });
  const [configError, setConfigError] = useState("");

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

  const getUserRoleName = async (supabase, username) => {
    const { data: u } = await supabase.from("users").select("role_nom").eq("username", username).maybeSingle();
    return u ? u.role_nom : null;
  };

  const checkUserPerm = async (supabase, username, moduleKey, action) => {
    const roleNom = await getUserRoleName(supabase, username);
    if (!roleNom) return false;
    if (roleNom === "Administrateur") return true;
    const { data: role } = await supabase.from("roles").select("id").eq("nom", roleNom).maybeSingle();
    if (!role) return false;
    const { data: perm } = await supabase.from("role_permissions").select("*").eq("role_uuid", role.id).eq("module", moduleKey).maybeSingle();
    return !!(perm && perm[action]);
  };

  const checkPerm = async (supabase, moduleKey, action) => {
    if (user.role === "Administrateur") return true;
    const { data: role } = await supabase.from("roles").select("id").eq("nom", user.role).maybeSingle();
    if (!role) return false;
    const { data: perm } = await supabase.from("role_permissions").select("*").eq("role_uuid", role.id).eq("module", moduleKey).maybeSingle();
    return !!(perm && perm[action]);
  };

  const loadSolde = async () => {
    const supabase = getAuthedClient(token);
    const { data: transferts } = await supabase.from("caisse_decaissements").select("montant").eq("caisse_type", "grande").eq("motif", "Transfert vers Petite Caisse").neq("statut", "annule");
    const { data: decs } = await supabase.from("caisse_decaissements").select("montant").eq("caisse_type", "petite").neq("statut", "annule");
    const { data: directes } = await supabase.from("expenses").select("montant").eq("caisse_type", "petite").is("decaissement_id", null).in("statut", ["finalisee", "approuve"]);
    const recu = (transferts || []).reduce((a, t) => a + t.montant, 0);
    const sorti = (decs || []).reduce((a, d) => a + d.montant, 0);
    const directesTotal = (directes || []).reduce((a, d) => a + d.montant, 0);
    setSolde(recu - sorti - directesTotal);
  };

  const loadAux = async () => {
    const supabase = getAuthedClient(token);
    setCanCreer(await checkPerm(supabase, "expenses_petite", "peut_creer"));
    setCanModifier(await checkPerm(supabase, "expenses_petite", "peut_modifier"));
    setCanAnnuler(await checkPerm(supabase, "expenses_petite", "peut_annuler"));
    setCanAlimenter(await checkPerm(supabase, "petite_caisse_alimentation", "peut_creer"));

    const { data: cats } = await supabase.from("expense_categories").select("*").eq("actif", 1).order("nom");
    setCategories(cats || []);
    const usage = {};
    for (const c of (cats || [])) {
      const { count } = await supabase.from("expenses").select("id", { count: "exact", head: true }).eq("categorie", c.nom);
      usage[c.id] = (count || 0) > 0;
    }
    setCatUsage(usage);

    const { data: cfg } = await supabase.from("depenses_config").select("*").eq("id", 1).maybeSingle();
    if (cfg) { setConfig(cfg); setConfigForm({ petite_caisse_plafond: cfg.petite_caisse_plafond }); }
    loadSolde();
  };

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const supabase = getAuthedClient(token);
      const { data, error: e } = await supabase.from("expenses").select("*").eq("caisse_type", "petite").order("created_at", { ascending: false });
      if (e) throw e;
      let filtered = data || [];
      if (search) {
        const q = search.toLowerCase();
        filtered = filtered.filter((x) => (x.categorie + " " + (x.description || "")).toLowerCase().includes(q));
      }
      setExpenses(filtered);
    } catch (e) {
      setError(e.message || "Erreur de chargement");
    }
    setLoading(false);
  };

  useEffect(() => { loadAux(); }, [token]);
  useEffect(() => { load(); }, [token, search]);

  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(""), 4000); };
  const fmt = (n) => Number(n || 0).toLocaleString();
  const prenom = user ? user.nom_complet.split(" ")[0] : "collegue";

  const setField = (k, v) => setForm({ ...form, [k]: v });
  const openModal = () => { setForm({ categorie: "", montant: "", monnaie: "HTG", description: "" }); setError(""); setModalOpen(true); };

  const submit = async () => {
    setError("");
    if (!form.categorie) { setError("Choisissez une categorie"); return; }
    if (!form.montant || Number(form.montant) <= 0) { setError("Montant invalide"); return; }
    if (Number(form.montant) > solde) { setError("Solde insuffisant dans la Petite Caisse (disponible : " + fmt(solde) + " HTG)"); return; }
    try {
      const supabase = getAuthedClient(token);
      const { error: e } = await supabase.from("expenses").insert({
        categorie: form.categorie, montant: Number(form.montant), monnaie: form.monnaie, description: form.description || null,
        statut: "en_attente", caisse_type: "petite", academic_year_uuid: year ? year.id : null, modified_by: user.username
      });
      if (e) throw e;
      setModalOpen(false);
      flash(prenom + ", depense enregistree avec succes.");
      load(); loadSolde();
    } catch (e) { setError(e.message || "Erreur"); }
  };

  const submitAuth = async () => {
    setAuthError("");
    const check = await verifyCredentials(creds.username, creds.password);
    if (!check.ok) { setAuthError(check.error); return; }
    try {
      const supabase = getAuthedClient(token);
      const roleNom = await getUserRoleName(supabase, creds.username);
      if (roleNom !== "Administrateur") { setAuthError("Ce compte n'a pas les droits d'administrateur"); return; }
      let payload = {};
      if (authAction.type === "decision") payload = { statut: authAction.decision };
      else payload = { statut: "annule" };
      const { error: e } = await supabase.from("expenses").update({ ...payload, modified_by: creds.username }).eq("id", authAction.id);
      if (e) throw e;
      setAuthAction(null); setCreds({ username: "", password: "" });
      load(); loadSolde();
    } catch (e) { setAuthError(e.message || "Erreur"); }
  };

  const requestAddCategory = () => { if (!newCat.trim()) return; setCatPwd(""); setCatPwdError(""); setCatPwdOpen(true); };
  const confirmAddCategory = async () => {
    setCatPwdError("");
    if (!catPwd) { setCatPwdError("Entrez votre mot de passe."); return; }
    const check = await verifyCredentials(user.username, catPwd);
    if (!check.ok) { setCatPwdError(check.error); return; }
    try {
      const supabase = getAuthedClient(token);
      const { error: e } = await supabase.from("expense_categories").insert({ nom: newCat, modified_by: user.username });
      if (e) throw e;
      setNewCat(""); setCatPwdOpen(false);
      loadAux();
    } catch (e) { setCatPwdError(e.message || "Erreur"); }
  };

  const requestArchive = (c) => { setArchiveTarget(c); setArchiveCreds({ username: "", password: "" }); setArchiveError(""); };
  const confirmArchive = async () => {
    setArchiveError("");
    const check = await verifyCredentials(archiveCreds.username, archiveCreds.password);
    if (!check.ok) { setArchiveError(check.error); return; }
    try {
      const supabase = getAuthedClient(token);
      const roleNom = await getUserRoleName(supabase, archiveCreds.username);
      if (roleNom !== "Administrateur") { setArchiveError("Ce compte n'a pas les droits d'administrateur"); return; }
      const { error: e } = await supabase.from("expense_categories").update({ actif: 0, modified_by: archiveCreds.username }).eq("id", archiveTarget.id);
      if (e) throw e;
      setArchiveTarget(null);
      loadAux();
    } catch (e) { setArchiveError(e.message || "Erreur"); }
  };

  const openCatHistory = async (c) => {
    setCatHistTarget(c); setCatHistData(null);
    const supabase = getAuthedClient(token);
    const { data } = await supabase.from("expenses").select("*").eq("categorie", c.nom).order("created_at", { ascending: false });
    const total = (data || []).reduce((a, x) => a + x.montant, 0);
    setCatHistData({ liste: data || [], total, nb: (data || []).length });
  };

  const submitTransfer = async () => {
    setTransferError("");
    if (!transferMontant || Number(transferMontant) <= 0) { setTransferError("Montant invalide"); return; }
    const check = await verifyCredentials(transferCreds.username, transferCreds.password);
    if (!check.ok) { setTransferError(check.error); return; }
    setTransferBusy(true);
    try {
      const supabase = getAuthedClient(token);
      const allowed = await checkUserPerm(supabase, transferCreds.username, "petite_caisse_alimentation", "peut_creer");
      if (!allowed) { setTransferError("Ce compte n'a pas la permission d'alimenter la Petite Caisse"); setTransferBusy(false); return; }

      const { data: encGrande } = await supabase.from("expenses").select("montant").eq("caisse_type", "grande").in("statut", ["finalisee", "approuve"]);
      const soldeGrandeExpenses = (encGrande || []).reduce((a, x) => a + x.montant, 0);

      const yr = new Date().getFullYear();
      const { count } = await supabase.from("caisse_decaissements").select("id", { count: "exact", head: true }).eq("motif", "Transfert vers Petite Caisse");
      const numero = "TR-" + yr + "-" + String((count || 0) + 1).padStart(4, "0");

      const { error: e1 } = await supabase.from("caisse_decaissements").insert({
        numero, caisse_type: "grande", date: new Date().toISOString().slice(0, 10),
        description: "Alimentation Petite Caisse" + (transferCheque ? " (cheque " + transferCheque + ")" : ""),
        montant: Number(transferMontant), beneficiaire: "Petite Caisse", motif: "Transfert vers Petite Caisse",
        caissier: transferCreds.username, statut: "actif", modified_by: transferCreds.username
      });
      if (e1) throw e1;

      const { data: adminUser } = await supabase.from("users").select("id").eq("username", transferCreds.username).maybeSingle();
      const { error: e2 } = await supabase.from("expenses").insert({
        categorie: "Transfert Petite Caisse", montant: Number(transferMontant), monnaie: "HTG",
        description: "Alimentation Petite Caisse - Recu " + numero, statut: "finalisee", caisse_type: "grande",
        numero_cheque: transferCheque || null, modified_by: transferCreds.username
      });
      if (e2) throw e2;

      setTransferOpen(false);
      setTransferMontant(""); setTransferCheque(""); setTransferCreds({ username: "", password: "" });
      flash(prenom + ", Petite Caisse alimentee avec succes (" + numero + ").");
      loadSolde();
    } catch (e) { setTransferError(e.message || "Erreur"); }
    setTransferBusy(false);
  };

  const saveConfig = async () => {
    setConfigError("");
    const check = await verifyCredentials(configCreds.username, configCreds.password);
    if (!check.ok) { setConfigError(check.error); return; }
    try {
      const supabase = getAuthedClient(token);
      const allowed = await checkUserPerm(supabase, configCreds.username, "petite_caisse_alimentation", "peut_modifier");
      if (!allowed) { setConfigError("Ce compte n'a pas la permission de modifier ces parametres"); return; }
      const { error: e } = await supabase.from("depenses_config").update({
        petite_caisse_plafond: Number(configForm.petite_caisse_plafond) || 0, modified_by: configCreds.username
      }).eq("id", 1);
      if (e) throw e;
      setConfigOpen(false);
      loadAux();
    } catch (e) { setConfigError(e.message || "Erreur"); }
  };

  const badge = (st) => { const b = STATUT_BADGE[st] || STATUT_BADGE.en_attente; return <span className={"badge " + b.c}>{b.t}</span>; };

  const totalApprouve = expenses.filter((e) => e.statut === "approuve").reduce((a, e) => a + e.montant, 0);
  const nbAttente = expenses.filter((e) => e.statut === "en_attente").length;

  if (loading) return <div className="page"><p style={{ color: "var(--text-dim)" }}>Chargement...</p></div>;

  return (
    <div className="page">
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div><h1 className="page-title">D&eacute;penses - Petite Caisse</h1></div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button className="btn-sm btn-gray-cancel" onClick={() => setCatModalOpen(true)}>Cat&eacute;gories</button>
          {canAlimenter && <button className="btn-sm btn-gray-cancel" onClick={() => { setConfigCreds({ username: "", password: "" }); setConfigError(""); setConfigOpen(true); }}>Plafond</button>}
          {canAlimenter && <button className="btn-sm btn-blue" onClick={() => { setTransferMontant(""); setTransferCheque(""); setTransferCreds({ username: "", password: "" }); setTransferError(""); setTransferOpen(true); }}>+ Alimenter</button>}
          {canCreer && <button className="btn-primary" onClick={openModal}>+ Nouvelle d&eacute;pense</button>}
        </div>
      </div>

      {msg && <div className="receipt-banner" style={{ marginBottom: "18px" }}>{msg}</div>}
      {error && <div className="login-error" style={{ marginBottom: "16px" }}>{error}</div>}

      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <div className="kpi-card"><div className="kpi-label">Solde disponible</div><div className="kpi-value" style={{ color: solde < 0 ? "var(--err)" : "var(--ok)" }}>{fmt(solde)} HTG</div></div>
        <div className="kpi-card"><div className="kpi-label">Plafond</div><div className="kpi-value">{fmt(config.petite_caisse_plafond)} HTG</div></div>
        <div className="kpi-card"><div className="kpi-label">Total approuv&eacute;</div><div className="kpi-value" style={{ color: "var(--err)" }}>{fmt(totalApprouve)} HTG</div></div>
        <div className="kpi-card"><div className="kpi-label">En attente</div><div className="kpi-value" style={{ color: "var(--gold)" }}>{nbAttente}</div></div>
      </div>

      <div className="form-card" style={{ marginBottom: "22px" }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher cat&eacute;gorie, description..."
          style={{ width: "100%", maxWidth: "400px", padding: "11px 14px", borderRadius: "10px", border: "1.5px solid var(--line)", background: "var(--bg-soft)", fontSize: "14px" }} />
      </div>

      <div className="table-card">
        <table className="data-table">
          <thead><tr><th>Date</th><th>Cat&eacute;gorie</th><th>Description</th><th>Montant</th><th>Statut</th><th>Actions</th></tr></thead>
          <tbody>
            {expenses.length === 0 && <tr><td colSpan="6" className="table-empty">Aucune d&eacute;pense.</td></tr>}
            {expenses.map((e) => (
              <tr key={e.id} style={{ opacity: (e.statut === "annule" || e.statut === "rejete") ? 0.55 : 1 }}>
                <td>{e.created_at ? e.created_at.slice(0, 16).replace("T", " ") : "-"}</td>
                <td><strong>{e.categorie}</strong></td>
                <td>{e.description || "-"}</td>
                <td><strong>{fmt(e.montant)} {e.monnaie}</strong></td>
                <td>{badge(e.statut)}</td>
                <td>
                  <div style={{ display: "flex", gap: "6px" }}>
                    {e.statut === "en_attente" && canModifier && (
                      <>
                        <button className="btn-sm btn-green" onClick={() => { setAuthAction({ type: "decision", id: e.id, decision: "approuve" }); setCreds({ username: "", password: "" }); setAuthError(""); }}>Approuver</button>
                        <button className="btn-sm btn-red" onClick={() => { setAuthAction({ type: "decision", id: e.id, decision: "rejete" }); setCreds({ username: "", password: "" }); setAuthError(""); }}>Rejeter</button>
                      </>
                    )}
                    {e.statut === "approuve" && canAnnuler && (
                      <button className="btn-sm btn-red" onClick={() => { setAuthAction({ type: "cancel", id: e.id }); setCreds({ username: "", password: "" }); setAuthError(""); }}>Annuler</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {catModalOpen && (
        <div className="modal-overlay" onClick={() => setCatModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "520px" }}>
            <div className="modal-header"><h3>Cat&eacute;gories de d&eacute;penses</h3><button className="modal-close" onClick={() => setCatModalOpen(false)}>x</button></div>
            <div style={{ display: "flex", gap: "10px", marginBottom: "16px" }}>
              <input value={newCat} onChange={(e) => setNewCat(e.target.value)} onKeyDown={(e) => e.key === "Enter" && requestAddCategory()} placeholder="Ex: Salaires, Fournitures..."
                style={{ flex: 1, padding: "11px 14px", borderRadius: "10px", border: "1.5px solid var(--line)", background: "var(--bg-soft)", fontSize: "14px" }} />
              <button className="btn-primary btn-sm" onClick={requestAddCategory}>+ Ajouter</button>
            </div>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              {categories.length === 0 && <span style={{ color: "var(--text-soft)", fontStyle: "italic" }}>Aucune cat&eacute;gorie.</span>}
              {categories.map((c) => (
                <span key={c.id} className="section-chip" style={{ cursor: "pointer" }} onClick={() => openCatHistory(c)}>
                  {c.nom}{catUsage[c.id] && <span style={{ fontSize: "10px", opacity: 0.6, marginLeft: "4px" }}>(utilis&eacute;e)</span>}
                  <button onClick={(ev) => { ev.stopPropagation(); requestArchive(c); }} className="chip-x">x</button>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {catPwdOpen && (
        <div className="modal-overlay" onClick={() => setCatPwdOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "400px" }}>
            <div className="modal-header"><h3>Confirmez votre mot de passe</h3><button className="modal-close" onClick={() => setCatPwdOpen(false)}>x</button></div>
            {catPwdError && <div className="login-error" style={{ marginBottom: "14px" }}>{catPwdError}</div>}
            <div className="form-group" style={{ marginBottom: "20px" }}><label>Votre mot de passe</label><input type="password" value={catPwd} onChange={(e) => setCatPwd(e.target.value)} autoFocus /></div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setCatPwdOpen(false)}>Annuler</button>
              <button className="btn-primary" onClick={confirmAddCategory}>Cr&eacute;er la cat&eacute;gorie</button>
            </div>
          </div>
        </div>
      )}

      {archiveTarget && (
        <div className="modal-overlay" onClick={() => setArchiveTarget(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "420px" }}>
            <div className="modal-header"><h3>Supprimer "{archiveTarget.nom}"</h3><button className="modal-close" onClick={() => setArchiveTarget(null)}>x</button></div>
            <p style={{ fontSize: "13px", color: "var(--text-dim)", marginBottom: "16px" }}>Cette cat&eacute;gorie sera archiv&eacute;e. Confirmation d'un administrateur requise.</p>
            {archiveError && <div className="login-error" style={{ marginBottom: "14px" }}>{archiveError}</div>}
            <div className="form-group" style={{ marginBottom: "14px" }}><label>Identifiant administrateur</label><input value={archiveCreds.username} onChange={(e) => setArchiveCreds({ ...archiveCreds, username: e.target.value })} autoFocus /></div>
            <div className="form-group" style={{ marginBottom: "20px" }}><label>Mot de passe</label><input type="password" value={archiveCreds.password} onChange={(e) => setArchiveCreds({ ...archiveCreds, password: e.target.value })} /></div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setArchiveTarget(null)}>Annuler</button>
              <button className="btn-primary" onClick={confirmArchive}>Archiver</button>
            </div>
          </div>
        </div>
      )}

      {catHistTarget && (
        <div className="modal-overlay" onClick={() => setCatHistTarget(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "600px", maxHeight: "80vh", overflowY: "auto" }}>
            <div className="modal-header"><h3>Historique - {catHistTarget.nom}</h3><button className="modal-close" onClick={() => setCatHistTarget(null)}>x</button></div>
            {!catHistData && <p style={{ color: "var(--text-dim)" }}>Chargement...</p>}
            {catHistData && (
              <>
                <div className="receipt-line"><span>Total</span><strong>{fmt(catHistData.total)} HTG</strong></div>
                <div className="receipt-line"><span>Nombre d'op&eacute;rations</span><strong>{catHistData.nb}</strong></div>
                <table className="data-table" style={{ marginTop: "14px" }}>
                  <thead><tr><th>Date</th><th>Caisse</th><th>Description</th><th>Montant</th><th>Statut</th></tr></thead>
                  <tbody>
                    {catHistData.liste.map((e) => (
                      <tr key={e.id}>
                        <td>{e.created_at ? e.created_at.slice(0, 10) : "-"}</td>
                        <td>{e.caisse_type === "grande" ? "Grande" : e.caisse_type === "petite" ? "Petite" : "-"}</td>
                        <td>{e.description || "-"}</td>
                        <td><strong>{fmt(e.montant)} {e.monnaie}</strong></td>
                        <td>{badge(e.statut)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        </div>
      )}

      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "500px" }}>
            <div className="modal-header"><h3>Nouvelle d&eacute;pense - Petite Caisse</h3><button className="modal-close" onClick={() => setModalOpen(false)}>x</button></div>
            {error && <div className="login-error" style={{ marginBottom: "16px" }}>{error}</div>}
            <div className="form-row">
              <div className="form-group"><label>Cat&eacute;gorie *</label><select value={form.categorie} onChange={(e) => setField("categorie", e.target.value)}><option value="">-- Choisir --</option>{categories.map((c) => <option key={c.id} value={c.nom}>{c.nom}</option>)}</select></div>
              <div className="form-group"><label>Montant *</label><input type="number" value={form.montant} onChange={(e) => setField("montant", e.target.value)} /></div>
            </div>
            <div className="form-group" style={{ marginBottom: "16px" }}><label>Description</label><input value={form.description} onChange={(e) => setField("description", e.target.value)} /></div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setModalOpen(false)}>Annuler</button>
              <button className="btn-primary" onClick={submit}>Enregistrer</button>
            </div>
          </div>
        </div>
      )}

      {transferOpen && (
        <div className="modal-overlay" onClick={() => setTransferOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "440px" }}>
            <div className="modal-header"><h3>Alimenter la Petite Caisse</h3><button className="modal-close" onClick={() => setTransferOpen(false)}>x</button></div>
            <p style={{ fontSize: "13px", color: "var(--text-dim)", marginBottom: "16px" }}>Transfert depuis la Grande Caisse. Autorisation requise.</p>
            {transferError && <div className="login-error" style={{ marginBottom: "14px" }}>{transferError}</div>}
            <div className="form-group" style={{ marginBottom: "14px" }}><label>Montant (HTG) *</label><input type="number" value={transferMontant} onChange={(e) => setTransferMontant(e.target.value)} autoFocus /></div>
            <div className="form-group" style={{ marginBottom: "18px" }}><label>N&deg; de ch&egrave;que</label><input value={transferCheque} onChange={(e) => setTransferCheque(e.target.value)} /></div>
            <div style={{ borderTop: "1px solid var(--line)", paddingTop: "14px" }}>
              <div className="form-group" style={{ marginBottom: "14px" }}><label>Identifiant autoris&eacute;</label><input value={transferCreds.username} onChange={(e) => setTransferCreds({ ...transferCreds, username: e.target.value })} /></div>
              <div className="form-group" style={{ marginBottom: "20px" }}><label>Mot de passe</label><input type="password" value={transferCreds.password} onChange={(e) => setTransferCreds({ ...transferCreds, password: e.target.value })} /></div>
            </div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setTransferOpen(false)}>Annuler</button>
              <button className="btn-primary" onClick={submitTransfer} disabled={transferBusy}>{transferBusy ? "Enregistrement..." : "Confirmer le transfert"}</button>
            </div>
          </div>
        </div>
      )}

      {configOpen && (
        <div className="modal-overlay" onClick={() => setConfigOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "440px" }}>
            <div className="modal-header"><h3>Plafond Petite Caisse</h3><button className="modal-close" onClick={() => setConfigOpen(false)}>x</button></div>
            {configError && <div className="login-error" style={{ marginBottom: "14px" }}>{configError}</div>}
            <div className="form-group" style={{ marginBottom: "18px" }}><label>Plafond (HTG)</label><input type="number" value={configForm.petite_caisse_plafond} onChange={(e) => setConfigForm({ ...configForm, petite_caisse_plafond: e.target.value })} /></div>
            <div style={{ borderTop: "1px solid var(--line)", paddingTop: "14px" }}>
              <div className="form-group" style={{ marginBottom: "14px" }}><label>Votre identifiant</label><input value={configCreds.username} onChange={(e) => setConfigCreds({ ...configCreds, username: e.target.value })} /></div>
              <div className="form-group" style={{ marginBottom: "20px" }}><label>Votre mot de passe</label><input type="password" value={configCreds.password} onChange={(e) => setConfigCreds({ ...configCreds, password: e.target.value })} /></div>
            </div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setConfigOpen(false)}>Annuler</button>
              <button className="btn-primary" onClick={saveConfig}>Enregistrer</button>
            </div>
          </div>
        </div>
      )}

      {authAction && (
        <div className="modal-overlay" onClick={() => setAuthAction(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "420px" }}>
            <div className="modal-header"><h3>Confirmation administrateur</h3><button className="modal-close" onClick={() => setAuthAction(null)}>x</button></div>
            {authError && <div className="login-error" style={{ marginBottom: "14px" }}>{authError}</div>}
            <div className="form-group" style={{ marginBottom: "14px" }}><label>Identifiant</label><input value={creds.username} onChange={(e) => setCreds({ ...creds, username: e.target.value })} autoFocus /></div>
            <div className="form-group" style={{ marginBottom: "20px" }}><label>Mot de passe</label><input type="password" value={creds.password} onChange={(e) => setCreds({ ...creds, password: e.target.value })} /></div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setAuthAction(null)}>Annuler</button>
              <button className="btn-primary" onClick={submitAuth}>Confirmer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}