import React, { useState, useEffect } from "react";
import { useAuth } from "../AuthContext.jsx";
import { getAuthedClient, EDGE_FUNCTION_URL, SUPABASE_ANON_KEY } from "../supabaseClient.js";
import { genererEcritureTransfert } from "../accountingHelpers.js";

export default function SousCaisses() {
  const { token, user } = useAuth();
  const [sousCaisses, setSousCaisses] = useState([]);
  const [error, setError] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ nom: "", description: "" });

  const [ouvrirModal, setOuvrirModal] = useState(null);
  const [ouvrirForm, setOuvrirForm] = useState({ password: "", montant_supplementaire: "", admin_username: "", admin_password: "" });
  const [ouvrirSaving, setOuvrirSaving] = useState(false);

  const [fermerModal, setFermerModal] = useState(null);
  const [fermerForm, setFermerForm] = useState({ montant_physique: "", justification_ecart: "", montant_remis: "", password: "" });
  const [fermerSaving, setFermerSaving] = useState(false);

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

  const computeSessionSolde = async (supabase, session) => {
    const { data: p1 } = await supabase.from("payments").select("montant").eq("session_sous_caisse_uuid", session.id).eq("statut", "valide");
    const { data: p2 } = await supabase.from("sales").select("montant_total").eq("session_sous_caisse_uuid", session.id).neq("statut", "annule");
    const { data: p3 } = await supabase.from("misc_fee_payments").select("montant").eq("session_sous_caisse_uuid", session.id).eq("statut", "valide");
    const { data: p4 } = await supabase.from("program_payments").select("montant").eq("session_sous_caisse_uuid", session.id).eq("statut", "valide");
    const enc = (p1 || []).reduce((s, r) => s + Number(r.montant), 0) + (p2 || []).reduce((s, r) => s + Number(r.montant_total), 0) + (p3 || []).reduce((s, r) => s + Number(r.montant), 0) + (p4 || []).reduce((s, r) => s + Number(r.montant), 0);
    return Number(session.fond_initial || 0) + enc;
  };

  const load = async () => {
    if (!token) return;
    const supabase = getAuthedClient(token);
    const { data: scs } = await supabase.from("sous_caisses").select("*").order("nom");
    const result = [];
    for (const sc of (scs || [])) {
      const { data: session } = await supabase.from("sessions_sous_caisse").select("*").eq("sous_caisse_uuid", sc.id).eq("statut", "ouverte").order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (session) {
        const theorique = await computeSessionSolde(supabase, session);
        result.push({ ...sc, session_active: { ...session, montant_theorique_actuel: theorique } });
      } else {
        const { data: derniere } = await supabase.from("sessions_sous_caisse").select("montant_restant").eq("sous_caisse_uuid", sc.id).eq("statut", "fermee").order("created_at", { ascending: false }).limit(1).maybeSingle();
        result.push({ ...sc, session_active: null, montant_a_reporter: derniere ? (Number(derniere.montant_restant) || 0) : 0 });
      }
    }
    setSousCaisses(result);
  };
  useEffect(() => { load(); }, [token]);

  const openNewModal = () => { setForm({ nom: "", description: "" }); setError(""); setModalOpen(true); };
  const submitNew = async () => {
    setError("");
    if (!form.nom.trim()) { setError("Le nom de la sous-caisse est requis"); return; }
    const supabase = getAuthedClient(token);
    const { data: parent } = await supabase.from("comptes_comptables").select("id, type").eq("numero", "1012").maybeSingle();
    const { data: enfants } = await supabase.from("comptes_comptables").select("numero").eq("compte_parent_uuid", parent.id);
    let maxSeq = 0;
    for (const e of (enfants || [])) { const parts = e.numero.split("."); if (parts.length === 2) { const n = parseInt(parts[1]); if (n > maxSeq) maxSeq = n; } }
    const numero = "1012." + (maxSeq + 1);
    const { data: compteComptable, error: eCC } = await supabase.from("comptes_comptables").insert({ numero, nom: form.nom.trim(), type: parent.type, compte_parent_uuid: parent.id, modified_by: user.username }).select().single();
    if (eCC) { setError(eCC.message); return; }
    const { error: e1 } = await supabase.from("sous_caisses").insert({ nom: form.nom.trim(), description: form.description || null, compte_comptable_uuid: compteComptable.id, modified_by: user.username });
    if (e1) { setError(e1.message); return; }
    setModalOpen(false);
    load();
  };

  const openOuvrirModal = (sc) => { setOuvrirModal(sc); setOuvrirForm({ password: "", montant_supplementaire: "", admin_username: "", admin_password: "" }); setError(""); };
  const submitOuvrir = async () => {
    setError("");
    if (!ouvrirForm.password) { setError("Entrez votre mot de passe"); return; }
    setOuvrirSaving(true);
    try {
      const check = await verifyCredentials(user.username, ouvrirForm.password);
      if (!check.ok) { setError(check.error); setOuvrirSaving(false); return; }
      const supabase = getAuthedClient(token);

      const { data: dejaOuverteIci } = await supabase.from("sessions_sous_caisse").select("id").eq("sous_caisse_uuid", ouvrirModal.id).eq("statut", "ouverte").maybeSingle();
      if (dejaOuverteIci) { setError("Cette sous-caisse a deja une session ouverte"); setOuvrirSaving(false); return; }
      const { data: dejaAilleurs } = await supabase.from("sessions_sous_caisse").select("id").eq("caissier_uuid", user.id).eq("statut", "ouverte").maybeSingle();
      if (dejaAilleurs) { setError("Vous avez deja une session ouverte sur une autre sous-caisse"); setOuvrirSaving(false); return; }

      if (ouvrirModal.caissier_titulaire_uuid && ouvrirModal.caissier_titulaire_uuid !== user.id) {
        if (!ouvrirForm.admin_username || !ouvrirForm.admin_password) { setError("Cette sous-caisse est assignee a un autre caissier. Autorisation d'un responsable requise."); setOuvrirSaving(false); return; }
        const adminCheck = await verifyCredentials(ouvrirForm.admin_username, ouvrirForm.admin_password);
        const allowed = await checkUserPerm(supabase, ouvrirForm.admin_username, "sous_caisse_gestion", "peut_modifier");
        if (!adminCheck.ok || !allowed) { setError("Autorisation responsable invalide ou insuffisante"); setOuvrirSaving(false); return; }
        await supabase.from("sous_caisses").update({ caissier_titulaire_uuid: user.id, modified_by: user.username }).eq("id", ouvrirModal.id);
      } else if (!ouvrirModal.caissier_titulaire_uuid) {
        await supabase.from("sous_caisses").update({ caissier_titulaire_uuid: user.id, modified_by: user.username }).eq("id", ouvrirModal.id);
      }

      const { data: derniere } = await supabase.from("sessions_sous_caisse").select("montant_restant").eq("sous_caisse_uuid", ouvrirModal.id).eq("statut", "fermee").order("created_at", { ascending: false }).limit(1).maybeSingle();
      const montantReport = derniere ? (Number(derniere.montant_restant) || 0) : 0;

      const supplementaire = Number(ouvrirForm.montant_supplementaire) || 0;
      if (supplementaire > 0) {
        if (!ouvrirForm.admin_username || !ouvrirForm.admin_password) { setError("Autorisation d'un responsable requise pour ajouter des fonds supplementaires"); setOuvrirSaving(false); return; }
        const adminCheck2 = await verifyCredentials(ouvrirForm.admin_username, ouvrirForm.admin_password);
        const allowed2 = await checkUserPerm(supabase, ouvrirForm.admin_username, "sous_caisse_gestion", "peut_modifier");
        if (!adminCheck2.ok || !allowed2) { setError("Autorisation responsable invalide ou insuffisante"); setOuvrirSaving(false); return; }
      }

      let transfertId = null;
      if (supplementaire > 0) {
        const { data: transfert, error: eT } = await supabase.from("transferts_internes").insert({
          source_type: "grande", source_compte_uuid: null, destination_type: "sous_caisse", destination_compte_uuid: ouvrirModal.id,
          montant: supplementaire, devise: "HTG", motif: "Reapprovisionnement sous-caisse - " + (user.nom_complet || user.username),
          user_uuid: user.id, nom_utilisateur: user.nom_complet || user.username, statut: "valide", modified_by: user.username
        }).select().single();
        if (eT) { setError(eT.message); setOuvrirSaving(false); return; }
        transfertId = transfert.id;
        await genererEcritureTransfert(supabase, transfert);
      }

      const fondInitial = montantReport + supplementaire;
      const { error: eS } = await supabase.from("sessions_sous_caisse").insert({
        sous_caisse_uuid: ouvrirModal.id, caissier_uuid: user.id, nom_caissier: user.nom_complet || user.username,
        fond_initial: fondInitial, transfert_ouverture_uuid: transfertId, statut: "ouverte", modified_by: user.username
      });
      if (eS) { setError(eS.message); setOuvrirSaving(false); return; }

      setOuvrirModal(null);
      load();
    } catch (e) { setError(e.message || "Erreur"); }
    setOuvrirSaving(false);
  };

  const openFermerModal = (sc) => { setFermerModal(sc); setFermerForm({ montant_physique: "", justification_ecart: "", montant_remis: "", password: "" }); setError(""); };
  const theoriqueFermer = fermerModal ? fermerModal.session_active.montant_theorique_actuel : 0;
  const ecartFermer = fermerForm.montant_physique !== "" ? Number(fermerForm.montant_physique) - theoriqueFermer : null;
  const submitFermer = async () => {
    setError("");
    if (fermerForm.montant_physique === "") { setError("Entrez le montant compte physiquement"); return; }
    if (ecartFermer !== 0 && !fermerForm.justification_ecart.trim()) { setError("Justifiez l'ecart constate"); return; }
    if (!fermerForm.password) { setError("Entrez votre mot de passe"); return; }
    setFermerSaving(true);
    try {
      const check = await verifyCredentials(user.username, fermerForm.password);
      if (!check.ok) { setError(check.error); setFermerSaving(false); return; }
      const supabase = getAuthedClient(token);
      const session = fermerModal.session_active;
      if (session.caissier_uuid && session.caissier_uuid !== user.id) {
        const roleNom = await getUserRoleName(supabase, user.username);
        if (roleNom !== "Administrateur") { setError("Seul le caissier ayant ouvert cette session peut la fermer"); setFermerSaving(false); return; }
      }

      const physique = Number(fermerForm.montant_physique);
      const ecart = physique - theoriqueFermer;
      const remis = Number(fermerForm.montant_remis) || 0;
      if (remis > physique) { setError("Le montant remis ne peut pas depasser le montant physique"); setFermerSaving(false); return; }
      const restant = physique - remis;

      let transfertId = null;
      if (remis > 0) {
        const { data: transfert, error: eT } = await supabase.from("transferts_internes").insert({
          source_type: "sous_caisse", source_compte_uuid: session.sous_caisse_uuid, destination_type: "grande", destination_compte_uuid: null,
          montant: remis, devise: "HTG", motif: "Fermeture sous-caisse - " + (session.nom_caissier || ""),
          user_uuid: session.caissier_uuid || null, nom_utilisateur: session.nom_caissier || user.username, statut: "valide", modified_by: user.username
        }).select().single();
        if (eT) { setError(eT.message); setFermerSaving(false); return; }
        transfertId = transfert.id;
        await genererEcritureTransfert(supabase, transfert);
      }

      const { error: eU } = await supabase.from("sessions_sous_caisse").update({
        statut: "fermee", montant_theorique: theoriqueFermer, montant_physique: physique, ecart, justification_ecart: fermerForm.justification_ecart || null,
        montant_remis: remis, montant_restant: restant, transfert_fermeture_uuid: transfertId, responsable_validation: user.username, date_fermeture: new Date().toISOString(), modified_by: user.username
      }).eq("id", session.id);
      if (eU) { setError(eU.message); setFermerSaving(false); return; }

      setFermerModal(null);
      load();
    } catch (e) { setError(e.message || "Erreur"); }
    setFermerSaving(false);
  };

  return (
    <div className="page">
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 className="page-title">Sous-Caisses</h1>
          <p className="page-subtitle">Caisses de guichet rattachees a la Grande Caisse</p>
        </div>
        <button className="btn-primary" onClick={openNewModal}>+ Nouvelle sous-caisse</button>
      </div>

      {error && !modalOpen && !ouvrirModal && !fermerModal && <div className="login-error" style={{ marginBottom: "16px" }}>{error}</div>}

      <div className="kpi-grid">
        {sousCaisses.map((sc) => (
          <div key={sc.id} className="kpi-card">
            <div className="kpi-label">{sc.nom} {sc.statut !== "actif" && <span className="badge badge-gray">Inactif</span>}</div>
            {sc.session_active ? (
              <>
                <div className="kpi-value" style={{ color: "var(--navy)" }}>{fmt(sc.session_active.montant_theorique_actuel)} HTG</div>
                <div className="kpi-hint">Ouverte par {sc.session_active.nom_caissier || "-"}</div>
                <div style={{ marginTop: "8px" }}>
                  <button className="btn-sm btn-blue" onClick={() => openFermerModal(sc)}>Fermer la session</button>
                </div>
              </>
            ) : (
              <>
                <div className="kpi-hint">A reporter : {fmt(sc.montant_a_reporter)} HTG</div>
                <div style={{ marginTop: "8px" }}>
                  <button className="btn-sm btn-green" onClick={() => openOuvrirModal(sc)}>Ouvrir une session</button>
                </div>
              </>
            )}
          </div>
        ))}
        {sousCaisses.length === 0 && <div className="grid-empty">Aucune sous-caisse. Creez-en une.</div>}
      </div>

      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "440px" }}>
            <div className="modal-header"><h3>Nouvelle sous-caisse</h3><button className="modal-close" onClick={() => setModalOpen(false)}>x</button></div>
            {error && <div className="login-error" style={{ marginBottom: "14px" }}>{error}</div>}
            <div className="form-group" style={{ marginBottom: "14px" }}><label>Nom *</label><input value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} placeholder="ex: Caisse Guichet 1" /></div>
            <div className="form-group" style={{ marginBottom: "16px" }}><label>Description</label><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setModalOpen(false)}>Annuler</button>
              <button className="btn-primary" onClick={submitNew}>Creer</button>
            </div>
          </div>
        </div>
      )}

      {ouvrirModal && (
        <div className="modal-overlay" onClick={() => setOuvrirModal(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "440px" }}>
            <div className="modal-header"><h3>Ouvrir - {ouvrirModal.nom}</h3><button className="modal-close" onClick={() => setOuvrirModal(null)}>x</button></div>
            {error && <div className="login-error" style={{ marginBottom: "14px" }}>{error}</div>}
            <div className="form-group" style={{ marginBottom: "14px" }}>
              <label>Montant a reporter</label>
              <div style={{ padding: "10px 14px", background: "var(--bg-soft)", borderRadius: "8px", fontWeight: 700 }}>{fmt(ouvrirModal.montant_a_reporter)} HTG</div>
            </div>
            <div className="form-group" style={{ marginBottom: "16px" }}>
              <label>Votre mot de passe *</label>
              <input type="password" value={ouvrirForm.password} onChange={(e) => setOuvrirForm({ ...ouvrirForm, password: e.target.value })} autoFocus />
            </div>
            <div className="form-group" style={{ marginBottom: "16px" }}>
              <label>Montant supplementaire <span style={{ fontWeight: 400, color: "var(--text-dim)" }}>(optionnel, necessite une autorisation responsable)</span></label>
              <input type="number" value={ouvrirForm.montant_supplementaire} onChange={(e) => setOuvrirForm({ ...ouvrirForm, montant_supplementaire: e.target.value })} placeholder="0" />
            </div>
            <div style={{ background: "var(--bg-soft)", borderRadius: "10px", padding: "12px 14px", marginBottom: "16px" }}>
              <p style={{ fontSize: "12px", color: "var(--text-soft)", marginBottom: "10px", fontWeight: 600 }}>Autorisation responsable (si necessaire)</p>
              <div className="form-group" style={{ marginBottom: "10px" }}>
                <label>Identifiant</label>
                <input value={ouvrirForm.admin_username} onChange={(e) => setOuvrirForm({ ...ouvrirForm, admin_username: e.target.value })} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Mot de passe</label>
                <input type="password" value={ouvrirForm.admin_password} onChange={(e) => setOuvrirForm({ ...ouvrirForm, admin_password: e.target.value })} />
              </div>
            </div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setOuvrirModal(null)}>Annuler</button>
              <button className="btn-primary" onClick={submitOuvrir} disabled={ouvrirSaving}>{ouvrirSaving ? "Ouverture..." : "Ouvrir la session"}</button>
            </div>
          </div>
        </div>
      )}

      {fermerModal && (
        <div className="modal-overlay" onClick={() => setFermerModal(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "460px" }}>
            <div className="modal-header"><h3>Fermer - {fermerModal.nom}</h3><button className="modal-close" onClick={() => setFermerModal(null)}>x</button></div>
            {error && <div className="login-error" style={{ marginBottom: "14px" }}>{error}</div>}
            <div className="form-group" style={{ marginBottom: "14px" }}>
              <label>Montant theorique</label>
              <div style={{ padding: "10px 14px", background: "var(--bg-soft)", borderRadius: "8px", fontWeight: 700 }}>{fmt(theoriqueFermer)} HTG</div>
            </div>
            <div className="form-group" style={{ marginBottom: "14px" }}>
              <label>Montant compte physiquement *</label>
              <input type="number" value={fermerForm.montant_physique} onChange={(e) => setFermerForm({ ...fermerForm, montant_physique: e.target.value })} />
            </div>
            {ecartFermer !== null && (
              <div className="form-group" style={{ marginBottom: "14px" }}>
                <label>Ecart constate</label>
                <div style={{ padding: "10px 14px", background: ecartFermer === 0 ? "#dcfce7" : "#fef2f2", borderRadius: "8px", fontWeight: 700, color: ecartFermer === 0 ? "var(--ok)" : "var(--err)" }}>{fmt(ecartFermer)} HTG</div>
              </div>
            )}
            {ecartFermer !== null && ecartFermer !== 0 && (
              <div className="form-group" style={{ marginBottom: "14px" }}>
                <label>Justification de l'ecart *</label>
                <input value={fermerForm.justification_ecart} onChange={(e) => setFermerForm({ ...fermerForm, justification_ecart: e.target.value })} />
              </div>
            )}
            <div className="form-group" style={{ marginBottom: "14px" }}>
              <label>Montant a reverser a la Grande Caisse <span style={{ fontWeight: 400, color: "var(--text-dim)" }}>(optionnel)</span></label>
              <input type="number" value={fermerForm.montant_remis} onChange={(e) => setFermerForm({ ...fermerForm, montant_remis: e.target.value })} placeholder="0" />
            </div>
            <div className="form-group" style={{ marginBottom: "16px" }}>
              <label>Votre mot de passe *</label>
              <input type="password" value={fermerForm.password} onChange={(e) => setFermerForm({ ...fermerForm, password: e.target.value })} />
            </div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setFermerModal(null)}>Annuler</button>
              <button className="btn-primary" onClick={submitFermer} disabled={fermerSaving}>{fermerSaving ? "Fermeture..." : "Fermer la session"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}