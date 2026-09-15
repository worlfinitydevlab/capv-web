import React, { useState, useEffect } from "react";
import { useAuth } from "../AuthContext.jsx";
import { getAuthedClient, EDGE_FUNCTION_URL, SUPABASE_ANON_KEY } from "../supabaseClient.js";
import PiecesJustificatives from "../components/PiecesJustificatives.jsx";

export default function ClotureCaisse() {
  const { token, user } = useAuth();
  const [clotures, setClotures] = useState([]);
  const [comptes, setComptes] = useState([]);
  const [error, setError] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ caisse_type: "grande", montant_physique: "", justification_ecart: "", montant_remis: "", compte_bancaire_uuid: "" });
  const [theorique, setTheorique] = useState(null);
  const [saving, setSaving] = useState(false);

  const [depotModal, setDepotModal] = useState(null);
  const [depotForm, setDepotForm] = useState({ numero_depot: "", bordereau_depot: "", date_depot: "" });

  const [piecesModal, setPiecesModal] = useState(null);
  const [authModal, setAuthModal] = useState(null);
  const [authCreds, setAuthCreds] = useState({ username: "", password: "" });
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);

  const fmt = (n) => Number(n || 0).toLocaleString();

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

  const computeSolde = async (type) => {
    const supabase = getAuthedClient(token);
    let encaissements = 0;
    if (type === "grande") {
      const { data: p1 } = await supabase.from("payments").select("montant").eq("statut", "valide");
      const { data: p2 } = await supabase.from("sales").select("montant_total").neq("statut", "annule");
      const { data: p3 } = await supabase.from("misc_fee_payments").select("montant").eq("statut", "valide");
      const { data: p4 } = await supabase.from("program_payments").select("montant").eq("statut", "valide");
      encaissements = (p1 || []).reduce((s, r) => s + Number(r.montant), 0) + (p2 || []).reduce((s, r) => s + Number(r.montant_total), 0) + (p3 || []).reduce((s, r) => s + Number(r.montant), 0) + (p4 || []).reduce((s, r) => s + Number(r.montant), 0);
    }
    const { data: decs } = await supabase.from("caisse_decaissements").select("montant").eq("caisse_type", type).neq("statut", "annule");
    const decaissements = (decs || []).reduce((s, r) => s + Number(r.montant), 0);
    const { data: exps } = await supabase.from("expenses").select("montant").eq("caisse_type", type).is("decaissement_id", null).in("statut", ["finalisee", "approuve"]);
    const depensesDirectes = (exps || []).reduce((s, r) => s + Number(r.montant), 0);
    let transfertsRecus = 0;
    if (type === "petite") {
      const { data: tr } = await supabase.from("caisse_decaissements").select("montant").eq("caisse_type", "grande").eq("motif", "Transfert vers Petite Caisse").neq("statut", "annule");
      transfertsRecus = (tr || []).reduce((s, r) => s + Number(r.montant), 0);
    }
    const { data: transfersOut } = await supabase.from("transferts_internes").select("montant").eq("source_type", type).eq("statut", "valide");
    const transfersOutTotal = (transfersOut || []).reduce((s, r) => s + Number(r.montant), 0);
    const { data: transfersIn } = await supabase.from("transferts_internes").select("montant").eq("destination_type", type).eq("statut", "valide");
    const transfersInTotal = (transfersIn || []).reduce((s, r) => s + Number(r.montant), 0);
    return encaissements - decaissements - depensesDirectes + transfertsRecus - transfersOutTotal + transfersInTotal;
  };

  const loadClotures = async () => {
    if (!token) return;
    const supabase = getAuthedClient(token);
    const { data } = await supabase.from("clotures_caisse").select("*").order("created_at", { ascending: false }).limit(100);
    setClotures(data || []);
  };
  const loadComptes = async () => {
    if (!token) return;
    const supabase = getAuthedClient(token);
    const { data } = await supabase.from("comptes_bancaires").select("*").eq("statut", "actif").order("nom");
    setComptes(data || []);
  };

  useEffect(() => { loadClotures(); loadComptes(); }, [token]);

  const openModal = async () => {
    setForm({ caisse_type: "grande", montant_physique: "", justification_ecart: "", montant_remis: "", compte_bancaire_uuid: "" });
    setError(""); setModalOpen(true); setTheorique(null);
    const t = await computeSolde("grande");
    setTheorique(t);
  };
  const onCaisseTypeChange = async (type) => {
    setForm((f) => ({ ...f, caisse_type: type }));
    setTheorique(null);
    const t = await computeSolde(type);
    setTheorique(t);
  };

  const ecart = form.montant_physique !== "" && theorique !== null ? Number(form.montant_physique) - theorique : null;

  const submit = async () => {
    setError("");
    if (form.montant_physique === "") { setError("Entrez le montant compte physiquement"); return; }
    if (ecart !== 0 && !form.justification_ecart.trim()) { setError("Justifiez l'ecart constate"); return; }
    const montantRemis = Number(form.montant_remis) || 0;
    if (montantRemis > 0 && !form.compte_bancaire_uuid) { setError("Choisissez le compte bancaire destinataire"); return; }
    if (montantRemis > Number(form.montant_physique)) { setError("Le montant remis ne peut pas depasser le montant physique"); return; }

    setSaving(true);
    try {
      const supabase = getAuthedClient(token);
      const montantRestant = Number(form.montant_physique) - montantRemis;
      const { error: e } = await supabase.from("clotures_caisse").insert({
        caisse_type: form.caisse_type,
        caissier_uuid: user.id, nom_caissier: user.nom_complet || user.username,
        montant_theorique: theorique, montant_physique: Number(form.montant_physique),
        ecart, justification_ecart: form.justification_ecart || null,
        montant_remis: montantRemis, montant_restant: montantRestant,
        compte_bancaire_uuid: montantRemis > 0 ? form.compte_bancaire_uuid : null,
        statut: montantRemis > 0 ? "en_attente" : "verifie",
        modified_by: user.username
      });
      if (e) throw e;
      setModalOpen(false);
      loadClotures();
    } catch (e) {
      setError(e.message || "Erreur");
    }
    setSaving(false);
  };

  const requestDepot = (c) => {
    setDepotForm({ numero_depot: "", bordereau_depot: "", date_depot: new Date().toISOString().slice(0, 10) });
    setError(""); setDepotModal(c);
  };
  const requestVerifie = (c) => {
    setAuthCreds({ username: "", password: "" }); setAuthError("");
    setAuthModal({ type: "verifie", target: c });
  };
  const proceedToDepotAuth = () => {
    setAuthCreds({ username: "", password: "" }); setAuthError("");
    setAuthModal({ type: "depot", target: depotModal });
  };

  const confirmAuthAndProceed = async () => {
    setAuthError("");
    if (!authCreds.username || !authCreds.password) { setAuthError("Identifiant et mot de passe requis"); return; }
    setAuthBusy(true);
    try {
      const check = await verifyCredentials(authCreds.username, authCreds.password);
      if (!check.ok) { setAuthError(check.error); setAuthBusy(false); return; }
      const supabase = getAuthedClient(token);
      const allowed = await checkUserPerm(supabase, authCreds.username, "cloture_caisse", "peut_modifier");
      if (!allowed) { setAuthError("Ce compte n'a pas les droits pour finaliser une cloture"); setAuthBusy(false); return; }

      if (authModal.type === "depot") {
        const c = authModal.target;
        const { data: transfert, error: e1 } = await supabase.from("transferts_internes").insert({
          source_type: c.caisse_type, source_compte_uuid: null,
          destination_type: "banque", destination_compte_uuid: c.compte_bancaire_uuid,
          montant: c.montant_remis, devise: "HTG",
          motif: "Depot caisse - " + c.id.slice(0, 8),
          user_uuid: user.id, nom_utilisateur: authCreds.username,
          statut: "valide", modified_by: authCreds.username
        }).select().single();
        if (e1) throw e1;
        const { error: e2 } = await supabase.from("clotures_caisse").update({
          numero_depot: depotForm.numero_depot, bordereau_depot: depotForm.bordereau_depot || null,
          date_depot: depotForm.date_depot, transfert_uuid: transfert.id,
          statut: "depose", modified_by: authCreds.username
        }).eq("id", c.id);
        if (e2) throw e2;
        setDepotModal(null);
      } else if (authModal.type === "verifie") {
        const c = authModal.target;
        await supabase.from("clotures_caisse").update({ statut: "verifie", responsable_validation: authCreds.username, modified_by: authCreds.username }).eq("id", c.id);
      }
      setAuthModal(null);
      loadClotures();
    } catch (e) {
      setAuthError(e.message || "Erreur");
    }
    setAuthBusy(false);
  };

  const compteNom = (id) => { const c = comptes.find((x) => x.id === id); return c ? c.nom : "-"; };

  return (
    <div className="page">
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 className="page-title">Cloture de Caisse</h1>
          <p className="page-subtitle">Comptage physique et remise en banque</p>
        </div>
        <button className="btn-primary" onClick={openModal}>+ Nouvelle cloture</button>
      </div>

      {error && !modalOpen && !depotModal && !authModal && <div className="login-error" style={{ marginBottom: "16px" }}>{error}</div>}

      <div className="table-card">
        <table className="data-table">
          <thead><tr><th>Date</th><th>Caisse</th><th>Caissier</th><th>Theorique</th><th>Physique</th><th>Ecart</th><th>Remis</th><th>Compte</th><th>Statut</th><th>Pieces</th><th>Actions</th></tr></thead>
          <tbody>
            {clotures.length === 0 && <tr><td colSpan="10" className="table-empty">Aucune cloture enregistree.</td></tr>}
            {clotures.map((c) => (
              <tr key={c.id}>
                <td>{c.created_at ? new Date(c.created_at).toLocaleString() : ""}</td>
                <td>{c.caisse_type === "grande" ? "Grande Caisse" : "Petite Caisse"}</td>
                <td>{c.nom_caissier}</td>
                <td>{fmt(c.montant_theorique)} HTG</td>
                <td>{fmt(c.montant_physique)} HTG</td>
                <td style={{ color: Number(c.ecart) !== 0 ? "var(--err)" : "var(--ok)", fontWeight: 700 }}>{fmt(c.ecart)} HTG</td>
                <td>{fmt(c.montant_remis)} HTG</td>
                <td>{c.compte_bancaire_uuid ? compteNom(c.compte_bancaire_uuid) : "-"}</td>
                <td>
                  {c.statut === "en_attente" && <span className="badge badge-gold">En attente</span>}
                  {c.statut === "depose" && <span className="badge badge-blue">Depose</span>}
                  {c.statut === "verifie" && <span className="badge badge-ok">Verifie</span>}
                </td>
                <td><button className="btn-sm btn-gray-cancel" onClick={() => setPiecesModal(c)}>Voir</button></td>
                <td>
                  {c.statut === "en_attente" && <button className="btn-sm btn-blue" onClick={() => requestDepot(c)}>Confirmer le depot</button>}
                  {c.statut === "depose" && <button className="btn-sm btn-green" onClick={() => requestVerifie(c)}>Marquer verifie</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "480px" }}>
            <div className="modal-header"><h3>Nouvelle cloture de caisse</h3><button className="modal-close" onClick={() => setModalOpen(false)}>x</button></div>
            {error && <div className="login-error" style={{ marginBottom: "14px" }}>{error}</div>}
            <div className="form-group" style={{ marginBottom: "14px" }}>
              <label>Caisse concernee</label>
              <select value={form.caisse_type} onChange={(e) => onCaisseTypeChange(e.target.value)}>
                <option value="grande">Grande Caisse</option>
                <option value="petite">Petite Caisse</option>
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: "14px" }}>
              <label>Montant theorique (calcule)</label>
              <div style={{ padding: "10px 14px", background: "var(--bg-soft)", borderRadius: "8px", fontWeight: 700 }}>{theorique !== null ? fmt(theorique) + " HTG" : "Calcul..."}</div>
            </div>
            <div className="form-group" style={{ marginBottom: "14px" }}>
              <label>Montant compte physiquement *</label>
              <input type="number" value={form.montant_physique} onChange={(e) => setForm({ ...form, montant_physique: e.target.value })} />
            </div>
            {ecart !== null && (
              <div className="form-group" style={{ marginBottom: "14px" }}>
                <label>Ecart constate</label>
                <div style={{ padding: "10px 14px", background: ecart === 0 ? "#dcfce7" : "#fef2f2", borderRadius: "8px", fontWeight: 700, color: ecart === 0 ? "var(--ok)" : "var(--err)" }}>{fmt(ecart)} HTG</div>
              </div>
            )}
            {ecart !== null && ecart !== 0 && (
              <div className="form-group" style={{ marginBottom: "14px" }}>
                <label>Justification de l'ecart *</label>
                <input value={form.justification_ecart} onChange={(e) => setForm({ ...form, justification_ecart: e.target.value })} />
              </div>
            )}
            <div className="form-row">
              <div className="form-group"><label>Montant a remettre en banque <span style={{ fontWeight: 400, color: "var(--text-dim)" }}>(optionnel)</span></label><input type="number" value={form.montant_remis} onChange={(e) => setForm({ ...form, montant_remis: e.target.value })} placeholder="0" /></div>
              {Number(form.montant_remis) > 0 && (
                <div className="form-group"><label>Compte destinataire</label>
                  <select value={form.compte_bancaire_uuid} onChange={(e) => setForm({ ...form, compte_bancaire_uuid: e.target.value })}>
                    <option value="">-- Choisir --</option>
                    {comptes.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "10px" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setModalOpen(false)}>Annuler</button>
              <button className="btn-primary" onClick={submit} disabled={saving}>{saving ? "Enregistrement..." : "Valider la cloture"}</button>
            </div>
          </div>
        </div>
      )}

      {depotModal && (
        <div className="modal-overlay" onClick={() => setDepotModal(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "440px" }}>
            <div className="modal-header"><h3>Confirmer le depot bancaire</h3><button className="modal-close" onClick={() => setDepotModal(null)}>x</button></div>
            {error && <div className="login-error" style={{ marginBottom: "14px" }}>{error}</div>}
            <p style={{ fontSize: "13px", color: "var(--text-dim)", marginBottom: "16px" }}>Montant a deposer : <strong>{fmt(depotModal.montant_remis)} HTG</strong> vers <strong>{compteNom(depotModal.compte_bancaire_uuid)}</strong></p>
            <div className="form-group" style={{ marginBottom: "14px" }}><label>Numero de depot *</label><input value={depotForm.numero_depot} onChange={(e) => setDepotForm({ ...depotForm, numero_depot: e.target.value })} /></div>
            <div className="form-group" style={{ marginBottom: "14px" }}><label>Bordereau de depot</label><input value={depotForm.bordereau_depot} onChange={(e) => setDepotForm({ ...depotForm, bordereau_depot: e.target.value })} /></div>
            <div className="form-group" style={{ marginBottom: "16px" }}><label>Date du depot</label><input type="date" value={depotForm.date_depot} onChange={(e) => setDepotForm({ ...depotForm, date_depot: e.target.value })} /></div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setDepotModal(null)}>Annuler</button>
              <button className="btn-primary" onClick={proceedToDepotAuth} disabled={!depotForm.numero_depot.trim()}>Continuer</button>
            </div>
          </div>
        </div>
      )}

      {authModal && (
        <div className="modal-overlay" onClick={() => setAuthModal(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "420px", textAlign: "center" }}>
            <div className="modal-header"><h3>Autorisation requise</h3><button className="modal-close" onClick={() => setAuthModal(null)}>x</button></div>
            <p style={{ fontSize: "13px", color: "var(--text-dim)", marginBottom: "16px" }}>Cette action doit etre confirmee par une personne autorisee a finaliser les clotures de caisse.</p>
            {authError && <div className="login-error" style={{ marginBottom: "14px" }}>{authError}</div>}
            <div className="form-group" style={{ marginBottom: "14px", textAlign: "left" }}><label>Identifiant</label><input value={authCreds.username} onChange={(e) => setAuthCreds({ ...authCreds, username: e.target.value })} autoFocus /></div>
            <div className="form-group" style={{ marginBottom: "20px", textAlign: "left" }}><label>Mot de passe</label><input type="password" value={authCreds.password} onChange={(e) => setAuthCreds({ ...authCreds, password: e.target.value })} onKeyDown={(e) => e.key === "Enter" && confirmAuthAndProceed()} /></div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setAuthModal(null)}>Annuler</button>
              <button className="btn-primary" onClick={confirmAuthAndProceed} disabled={authBusy}>{authBusy ? "Verification..." : "Confirmer"}</button>
            </div>
          </div>
        </div>
      )}

      {piecesModal && (
        <div className="modal-overlay" onClick={() => setPiecesModal(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "420px" }}>
            <div className="modal-header"><h3>Pieces justificatives</h3><button className="modal-close" onClick={() => setPiecesModal(null)}>x</button></div>
            <PiecesJustificatives operationType="cloture_caisse" operationUuid={piecesModal.id} compact />
          </div>
        </div>
      )}
    </div>
  );
}
