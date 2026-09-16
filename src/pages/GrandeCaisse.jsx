import React, { useState, useEffect } from "react";
import { useAuth } from "../AuthContext.jsx";
import DepensesRapports from "./DepensesRapports.jsx";
import { getAuthedClient, EDGE_FUNCTION_URL, SUPABASE_ANON_KEY } from "../supabaseClient.js";
import { useYear } from "../YearContext.jsx";

const STATUT_BADGE = {
  en_attente: { t: "En attente", c: "badge-gold" },
  en_attente_finalisation: { t: "A finaliser", c: "badge-gold" },
  approuve: { t: "Approuvee", c: "badge-ok" },
  finalisee: { t: "Finalisee", c: "badge-ok" },
  rejete: { t: "Rejetee", c: "badge-err" },
  annule: { t: "Annulee", c: "badge-gray" }
};

export default function GrandeCaisse() {
  const { token, user } = useAuth();
  const { currentYear: year } = useYear();
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [catUsage, setCatUsage] = useState({});
  const [config, setConfig] = useState({ petite_caisse_plafond: 0, seuil_cheque: 0 });
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [canCreer, setCanCreer] = useState(false);
  const [canModifier, setCanModifier] = useState(false);
  const [canAnnuler, setCanAnnuler] = useState(false);
  const [canAlimenter, setCanAlimenter] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ categorie: "", montant: "", monnaie: "HTG", description: "", numero_cheque: "", compte_bancaire_uuid: "" });

  const [finalizeItem, setFinalizeItem] = useState(null);
  const [finalizeCheque, setFinalizeCheque] = useState("");
  const [finalizeCompteBancaire, setFinalizeCompteBancaire] = useState("");
  const [comptesBancaires, setComptesBancaires] = useState([]);
  const [finalizeError, setFinalizeError] = useState("");
  const [finalizeCreds, setFinalizeCreds] = useState({ username: "", password: "" });

  const [authAction, setAuthAction] = useState(null);
  const [creds, setCreds] = useState({ username: "", password: "" });
  const [authError, setAuthError] = useState("");

  const [catModalOpen, setCatModalOpen] = useState(false);
  const [rapportsOpen, setRapportsOpen] = useState(false);
  const [newCat, setNewCat] = useState("");
  const [catPwdOpen, setCatPwdOpen] = useState(false);
  const [catPwd, setCatPwd] = useState("");
  const [catPwdError, setCatPwdError] = useState("");
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [archiveCreds, setArchiveCreds] = useState({ username: "", password: "" });
  const [archiveError, setArchiveError] = useState("");
  const [catHistTarget, setCatHistTarget] = useState(null);
  const [catHistData, setCatHistData] = useState(null);

  const [configOpen, setConfigOpen] = useState(false);
  const [configForm, setConfigForm] = useState({ petite_caisse_plafond: "", seuil_cheque: "" });
  const [configCreds, setConfigCreds] = useState({ username: "", password: "" });
  const [configError, setConfigError] = useState("");

  const checkPerm = async (supabase, moduleKey, action) => {
    if (user.role === "Administrateur") return true;
    const { data: role } = await supabase.from("roles").select("id").eq("nom", user.role).maybeSingle();
    if (!role) return false;
    const { data: perm } = await supabase.from("role_permissions").select("*").eq("role_uuid", role.id).eq("module", moduleKey).maybeSingle();
    return !!(perm && perm[action]);
  };

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

  const loadAux = async () => {
    const supabase = getAuthedClient(token);
    setCanCreer(await checkPerm(supabase, "expenses_grande", "peut_creer"));
    setCanModifier(await checkPerm(supabase, "expenses_grande", "peut_modifier"));
    setCanAnnuler(await checkPerm(supabase, "expenses_grande", "peut_annuler"));
    setCanAlimenter(await checkPerm(supabase, "petite_caisse_alimentation", "peut_modifier"));
    const { data: comptes } = await supabase.from("comptes_bancaires").select("*").eq("statut", "actif").order("nom");
    setComptesBancaires(comptes || []);

    const { data: cats } = await supabase.from("expense_categories").select("*").eq("actif", 1).order("nom");
    setCategories(cats || []);
    const usage = {};
    for (const c of (cats || [])) {
      const { count } = await supabase.from("expenses").select("id", { count: "exact", head: true }).eq("categorie", c.nom);
      usage[c.id] = (count || 0) > 0;
    }
    setCatUsage(usage);

    const { data: cfg } = await supabase.from("depenses_config").select("*").eq("id", 1).maybeSingle();
    if (cfg) {
      setConfig(cfg);
      setConfigForm({ petite_caisse_plafond: cfg.petite_caisse_plafond, seuil_cheque: cfg.seuil_cheque });
    }
  };

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const supabase = getAuthedClient(token);
      const { data, error: e } = await supabase.from("expenses").select("*").eq("caisse_type", "grande").order("created_at", { ascending: false });
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

  const setField = (k, v) => setForm({ ...form, [k]: v });
  const openModal = () => { setForm({ categorie: "", montant: "", monnaie: "HTG", description: "", numero_cheque: "", compte_bancaire_uuid: "" }); setError(""); setModalOpen(true); };
  const seuilDepasse = Number(form.montant) > config.seuil_cheque;

  const genererId = () => crypto.randomUUID ? crypto.randomUUID() : Date.now().toString();

  const submit = async () => {
    setError("");
    if (!form.categorie) { setError("Choisissez une categorie"); return; }
    if (!form.montant || Number(form.montant) <= 0) { setError("Montant invalide"); return; }
    if (seuilDepasse && !form.numero_cheque.trim()) { setError("Numero de cheque obligatoire (montant superieur au seuil de " + fmt(config.seuil_cheque) + " HTG)"); return; }
    if (seuilDepasse && !form.compte_bancaire_uuid) { setError("Choisissez le compte bancaire du cheque"); return; }
    try {
      const supabase = getAuthedClient(token);
      if (form.numero_cheque) {
        const { data: dup } = await supabase.from("expenses").select("id").eq("numero_cheque", form.numero_cheque).eq("compte_bancaire_uuid", form.compte_bancaire_uuid).maybeSingle();
        if (dup) { setError("Ce numero de cheque est deja utilise pour ce compte"); return; }
      }
      const { error: e } = await supabase.from("expenses").insert({
        categorie: form.categorie, montant: Number(form.montant), monnaie: form.monnaie, description: form.description || null,
        statut: "en_attente", caisse_type: "grande", numero_cheque: form.numero_cheque || null, compte_bancaire_uuid: form.compte_bancaire_uuid || null,
        academic_year_uuid: year ? year.id : null, modified_by: user.username
      });
      if (e) throw e;
      setModalOpen(false);
      flash(user.nom_complet.split(" ")[0] + ", depense enregistree avec succes.");
      load();
    } catch (e) { setError(e.message || "Erreur"); }
  };

  const openFinalize = (e) => { setFinalizeItem(e); setFinalizeCheque(""); setFinalizeCompteBancaire(""); setFinalizeCreds({ username: "", password: "" }); setFinalizeError(""); };
  const submitFinalize = async () => {
    setFinalizeError("");
    if (!finalizeCheque.trim()) { setFinalizeError("Numero de cheque obligatoire"); return; }
    if (!finalizeCompteBancaire) { setFinalizeError("Choisissez le compte bancaire du cheque"); return; }
    try {
      const check = await verifyCredentials(finalizeCreds.username, finalizeCreds.password);
      if (!check.ok) { setFinalizeError(check.error); return; }
      const supabase = getAuthedClient(token);
      const allowed = await checkUserPerm(supabase, finalizeCreds.username, "decaissement_approbation", "peut_modifier");
      if (!allowed) { setFinalizeError("Ce compte n'a pas la permission requise"); return; }

      const { data: dup } = await supabase.from("expenses").select("id").eq("numero_cheque", finalizeCheque.trim()).eq("compte_bancaire_uuid", finalizeCompteBancaire).neq("id", finalizeItem.id).maybeSingle();
      if (dup) { setFinalizeError("Ce numero de cheque est deja utilise"); return; }
      const { data: transfert, error: eT } = await supabase.from("transferts_internes").insert({
        source_type: "banque", source_compte_uuid: finalizeCompteBancaire,
        destination_type: "grande", destination_compte_uuid: null,
        montant: finalizeItem.montant, devise: finalizeItem.monnaie || "HTG",
        motif: "Cheque " + finalizeCheque.trim() + " - " + finalizeItem.categorie,
        user_uuid: user.id, nom_utilisateur: finalizeCreds.username,
        statut: "valide", modified_by: finalizeCreds.username
      }).select().single();
      if (eT) throw eT;

      const { error: e } = await supabase.from("expenses").update({
        statut: "finalisee", numero_cheque: finalizeCheque.trim(), compte_bancaire_uuid: finalizeCompteBancaire, transfert_uuid: transfert.id, modified_by: finalizeCreds.username
      }).eq("id", finalizeItem.id);
      if (e) throw e;
      if (e) throw e;
      setFinalizeItem(null);
      flash(user.nom_complet.split(" ")[0] + ", depense finalisee avec succes.");
      load();
    } catch (e) { setFinalizeError(e.message || "Erreur"); }
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
      if (authAction.type === "decision") {
        payload = { statut: authAction.decision };
        if (authAction.decision === "approuve") {
          const { data: exp } = await supabase.from("expenses").select("*").eq("id", authAction.id).single();
          if (exp && exp.caisse_type === "grande" && exp.compte_bancaire_uuid && !exp.transfert_uuid) {
            const { data: transfert, error: eT } = await supabase.from("transferts_internes").insert({
              source_type: "banque", source_compte_uuid: exp.compte_bancaire_uuid,
              destination_type: "grande", destination_compte_uuid: null,
              montant: exp.montant, devise: exp.monnaie || "HTG",
              motif: "Cheque " + (exp.numero_cheque || "") + " - " + exp.categorie,
              user_uuid: user.id, nom_utilisateur: creds.username,
              statut: "valide", modified_by: creds.username
            }).select().single();
            if (eT) throw eT;
            payload.transfert_uuid = transfert.id;
          }
        }
      }
      else payload = { statut: "annule" };
      const { error: e } = await supabase.from("expenses").update({ ...payload, modified_by: creds.username }).eq("id", authAction.id);
      if (e) throw e;
      setAuthAction(null); setCreds({ username: "", password: "" });
      load();
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

  const saveConfig = async () => {
    setConfigError("");
    const check = await verifyCredentials(configCreds.username, configCreds.password);
    if (!check.ok) { setConfigError(check.error); return; }
    try {
      const supabase = getAuthedClient(token);
      const allowed = await checkUserPerm(supabase, configCreds.username, "petite_caisse_alimentation", "peut_modifier");
      if (!allowed) { setConfigError("Ce compte n'a pas la permission de modifier ces parametres"); return; }
      const { error: e } = await supabase.from("depenses_config").update({
        petite_caisse_plafond: Number(configForm.petite_caisse_plafond) || 0,
        seuil_cheque: Number(configForm.seuil_cheque) || 0,
        modified_by: configCreds.username
      }).eq("id", 1);
      if (e) throw e;
      setConfigOpen(false);
      loadAux();
    } catch (e) { setConfigError(e.message || "Erreur"); }
  };

  const badge = (st) => { const b = STATUT_BADGE[st] || STATUT_BADGE.en_attente; return <span className={"badge " + b.c}>{b.t}</span>; };

  const totalFinalise = expenses.filter((e) => e.statut === "finalisee" || e.statut === "approuve").reduce((a, e) => a + e.montant, 0);
  const nbAttente = expenses.filter((e) => e.statut === "en_attente" || e.statut === "en_attente_finalisation").length;

  if (loading) return <div className="page"><p style={{ color: "var(--text-dim)" }}>Chargement...</p></div>;

  return (
    <div className="page">
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 className="page-title">D&eacute;penses - Grande Caisse</h1>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button className="btn-sm btn-gray-cancel" onClick={() => setCatModalOpen(true)}>Cat&eacute;gories</button>
          <button className="btn-sm btn-gray-cancel" onClick={() => setRapportsOpen(true)}>Rapports</button>
          {canAlimenter && <button className="btn-sm btn-gray-cancel" onClick={() => { setConfigCreds({ username: "", password: "" }); setConfigError(""); setConfigOpen(true); }}>Seuil ch&egrave;que</button>}
          {canCreer && <button className="btn-primary" onClick={openModal}>+ Nouvelle d&eacute;pense</button>}
        </div>
      </div>

      {msg && <div className="receipt-banner" style={{ marginBottom: "18px" }}>{msg}</div>}
      {error && <div className="login-error" style={{ marginBottom: "16px" }}>{error}</div>}

      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        <div className="kpi-card"><div className="kpi-label">Total finalis&eacute;</div><div className="kpi-value" style={{ color: "var(--err)" }}>{fmt(totalFinalise)} HTG</div></div>
        <div className="kpi-card"><div className="kpi-label">En attente</div><div className="kpi-value" style={{ color: "var(--gold)" }}>{nbAttente}</div></div>
        <div className="kpi-card"><div className="kpi-label">Total op&eacute;rations</div><div className="kpi-value">{expenses.length}</div></div>
      </div>

      <div className="form-card" style={{ marginBottom: "22px" }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher cat&eacute;gorie, description..."
          style={{ width: "100%", maxWidth: "400px", padding: "11px 14px", borderRadius: "10px", border: "1.5px solid var(--line)", background: "var(--bg-soft)", fontSize: "14px" }} />
      </div>

      <div className="table-card">
        <table className="data-table">
          <thead><tr><th>Date</th><th>Cat&eacute;gorie</th><th>Description</th><th>Montant</th><th>N&deg; ch&egrave;que</th><th>Statut</th><th>Actions</th></tr></thead>
          <tbody>
            {expenses.length === 0 && <tr><td colSpan="7" className="table-empty">Aucune d&eacute;pense.</td></tr>}
            {expenses.map((e) => (
              <tr key={e.id} style={{ opacity: (e.statut === "annule" || e.statut === "rejete") ? 0.55 : 1 }}>
                <td>{e.created_at ? e.created_at.slice(0, 16).replace("T", " ") : "-"}</td>
                <td><strong>{e.categorie}</strong></td>
                <td>{e.description || "-"}</td>
                <td><strong>{fmt(e.montant)} {e.monnaie}</strong></td>
                <td>{e.numero_cheque || "-"}</td>
                <td>{badge(e.statut)}</td>
                <td>
                  <div style={{ display: "flex", gap: "6px" }}>
                    {e.statut === "en_attente_finalisation" && canModifier && <button className="btn-sm btn-green" onClick={() => openFinalize(e)}>Finaliser</button>}
                    {e.statut === "en_attente" && canModifier && (
                      <>
                        <button className="btn-sm btn-green" onClick={() => { setAuthAction({ type: "decision", id: e.id, decision: "approuve" }); setCreds({ username: "", password: "" }); setAuthError(""); }}>Approuver</button>
                        <button className="btn-sm btn-red" onClick={() => { setAuthAction({ type: "decision", id: e.id, decision: "rejete" }); setCreds({ username: "", password: "" }); setAuthError(""); }}>Rejeter</button>
                      </>
                    )}
                    {(e.statut === "approuve" || e.statut === "finalisee") && canAnnuler && (
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
            <div className="form-group" style={{ marginBottom: "20px" }}>
              <label>Votre mot de passe</label>
              <input type="password" value={catPwd} onChange={(e) => setCatPwd(e.target.value)} autoFocus onKeyDown={(e) => e.key === "Enter" && confirmAddCategory()} />
            </div>
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
            <p style={{ fontSize: "13px", color: "var(--text-dim)", marginBottom: "16px" }}>Cette cat&eacute;gorie sera archiv&eacute;e (jamais supprim&eacute;e d&eacute;finitivement). Confirmation d'un administrateur requise.</p>
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
                    {catHistData.liste.length === 0 && <tr><td colSpan="5" className="table-empty">Aucune op&eacute;ration.</td></tr>}
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
            <div className="modal-header"><h3>Nouvelle d&eacute;pense - Grande Caisse</h3><button className="modal-close" onClick={() => setModalOpen(false)}>x</button></div>
            {error && <div className="login-error" style={{ marginBottom: "16px" }}>{error}</div>}
            <div className="form-row">
              <div className="form-group">
                <label>Cat&eacute;gorie *</label>
                <select value={form.categorie} onChange={(e) => setField("categorie", e.target.value)}>
                  <option value="">-- Choisir --</option>
                  {categories.map((c) => <option key={c.id} value={c.nom}>{c.nom}</option>)}
                </select>
              </div>
              <div className="form-group"><label>Montant *</label><input type="number" value={form.montant} onChange={(e) => setField("montant", e.target.value)} /></div>
            </div>
            <div className="form-group" style={{ marginBottom: "14px" }}><label>Description</label><input value={form.description} onChange={(e) => setField("description", e.target.value)} /></div>
            {seuilDepasse && (
              <>
              <div className="form-group" style={{ marginBottom: "16px" }}>
                <label>Num&eacute;ro de ch&egrave;que * <span style={{ fontWeight: 400, color: "var(--text-dim)" }}>(obligatoire au-dessus de {fmt(config.seuil_cheque)} HTG)</span></label>
                <input value={form.numero_cheque} onChange={(e) => setField("numero_cheque", e.target.value)} />
              </div>
              <div className="form-group" style={{ marginBottom: "16px" }}>
                <label>Compte bancaire *</label>
                <select value={form.compte_bancaire_uuid} onChange={(e) => setField("compte_bancaire_uuid", e.target.value)}>
                  <option value="">-- Choisir --</option>
                  {comptesBancaires.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
                </select>
              </div>
              </>
            )}
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setModalOpen(false)}>Annuler</button>
              <button className="btn-primary" onClick={submit}>Enregistrer</button>
            </div>
          </div>
        </div>
      )}

      {finalizeItem && (
        <div className="modal-overlay" onClick={() => setFinalizeItem(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "480px" }}>
            <div className="modal-header"><h3>Finaliser - {finalizeItem.categorie}</h3><button className="modal-close" onClick={() => setFinalizeItem(null)}>x</button></div>
            <p style={{ fontSize: "13px", color: "var(--text-dim)", marginBottom: "16px" }}>{finalizeItem.description} - <strong>{fmt(finalizeItem.montant)} {finalizeItem.monnaie}</strong></p>
            {finalizeError && <div className="login-error" style={{ marginBottom: "14px" }}>{finalizeError}</div>}
            <div className="form-group" style={{ marginBottom: "16px" }}>
              <label>Numero de cheque *</label>
              <input value={finalizeCheque} onChange={(e) => setFinalizeCheque(e.target.value)} autoFocus />
            <div className="form-group" style={{ marginBottom: "16px" }}>
              <label>Compte bancaire du cheque *</label>
              <select value={finalizeCompteBancaire} onChange={(e) => setFinalizeCompteBancaire(e.target.value)}>
                <option value="">-- Choisir --</option>
                {comptesBancaires.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
              </select>
            </div>
            </div>
            <div style={{ background: "var(--bg-soft)", borderRadius: "10px", padding: "12px 14px", marginBottom: "18px" }}>
              <p style={{ fontSize: "12px", color: "var(--text-soft)", marginBottom: "10px", fontWeight: 600 }}>Confirmation Comptable</p>
              <div className="form-group" style={{ marginBottom: "10px" }}>
                <label>Identifiant</label>
                <input value={finalizeCreds.username} onChange={(e) => setFinalizeCreds({ ...finalizeCreds, username: e.target.value })} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Mot de passe</label>
                <input type="password" value={finalizeCreds.password} onChange={(e) => setFinalizeCreds({ ...finalizeCreds, password: e.target.value })} />
              </div>
            </div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setFinalizeItem(null)}>Annuler</button>
              <button className="btn-primary" onClick={submitFinalize}>Finaliser la d&eacute;pense</button>
            </div>
          </div>
        </div>
      )}

      {configOpen && (
        <div className="modal-overlay" onClick={() => setConfigOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "440px" }}>
            <div className="modal-header"><h3>Param&egrave;tres</h3><button className="modal-close" onClick={() => setConfigOpen(false)}>x</button></div>
            {configError && <div className="login-error" style={{ marginBottom: "14px" }}>{configError}</div>}
            <div className="form-group" style={{ marginBottom: "14px" }}><label>Plafond Petite Caisse (HTG)</label><input type="number" value={configForm.petite_caisse_plafond} onChange={(e) => setConfigForm({ ...configForm, petite_caisse_plafond: e.target.value })} /></div>
            <div className="form-group" style={{ marginBottom: "18px" }}><label>Seuil n&deg; de ch&egrave;que obligatoire (HTG)</label><input type="number" value={configForm.seuil_cheque} onChange={(e) => setConfigForm({ ...configForm, seuil_cheque: e.target.value })} /></div>
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

      {rapportsOpen && <DepensesRapports onClose={() => setRapportsOpen(false)} />}
    </div>
  );
}
