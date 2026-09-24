import React, { useState, useEffect } from "react";
import { useAuth } from "../AuthContext.jsx";
import { getAuthedClient, EDGE_FUNCTION_URL, SUPABASE_ANON_KEY } from "../supabaseClient.js";
import { genererEcritureAjustementBancaire } from "../accountingHelpers.js";

export default function RapprochementBancaire() {
  const { token } = useAuth();
  const [comptes, setComptes] = useState([]);
  const [compteId, setCompteId] = useState("");
  const [data, setData] = useState(null);

  const [ajustModalOpen, setAjustModalOpen] = useState(false);
  const [ajustForm, setAjustForm] = useState({ date: "", montant: "", description: "" });
  const [ajustCreds, setAjustCreds] = useState({ username: "", password: "" });
  const [ajustError, setAjustError] = useState("");

  const [dateReleve, setDateReleve] = useState("");
  const [soldeReleve, setSoldeReleve] = useState("");
  const [clotureModalOpen, setClotureModalOpen] = useState(false);
  const [clotureCreds, setClotureCreds] = useState({ username: "", password: "" });
  const [clotureError, setClotureError] = useState("");

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

  const loadComptes = async () => {
    const supabase = getAuthedClient(token);
    const { data: list } = await supabase.from("comptes_bancaires").select("*").eq("statut", "actif").order("nom");
    setComptes(list || []);
    if (!compteId && list && list.length > 0) setCompteId(list[0].id);
  };

  const loadRapprochement = async () => {
    if (!compteId) return;
    const supabase = getAuthedClient(token);
    const { data: compte } = await supabase.from("comptes_bancaires").select("*").eq("id", compteId).maybeSingle();
    if (!compte) return;
    const { data: transfertsSource } = await supabase.from("transferts_internes").select("*").eq("source_type", "banque").eq("source_compte_uuid", compteId);
    const { data: transfertsDest } = await supabase.from("transferts_internes").select("*").eq("destination_type", "banque").eq("destination_compte_uuid", compteId);
    const transferts = [...(transfertsSource || []), ...(transfertsDest || [])];
    const { data: ajustements } = await supabase.from("ajustements_bancaires").select("*").eq("compte_bancaire_uuid", compteId);
    const items = [];
    transferts.forEach((t) => {
      const montant = (t.destination_type === "banque" && t.destination_compte_uuid === compteId) ? Number(t.montant) : -Number(t.montant);
      items.push({ id: t.id, type: "transfert", date: t.created_at, description: t.motif || t.reference || ("Transfert #" + t.id), montant, rapproche: !!t.rapproche });
    });
    (ajustements || []).forEach((a) => {
      items.push({ id: a.id, type: "ajustement", date: a.date, description: a.description || "Frais bancaire", montant: -Number(a.montant), rapproche: !!a.rapproche });
    });
    items.sort((x, y) => new Date(y.date) - new Date(x.date));
    const entrees = transferts.filter((t) => t.destination_type === "banque" && t.destination_compte_uuid === compteId).reduce((s, t) => s + Number(t.montant), 0);
    const sorties = transferts.filter((t) => t.source_type === "banque" && t.source_compte_uuid === compteId).reduce((s, t) => s + Number(t.montant), 0);
    const totalAjustements = (ajustements || []).reduce((s, a) => s + Number(a.montant), 0);
    const soldeComptable = Number(compte.solde_initial) + entrees - sorties - totalAjustements;
    const soldePointe = Number(compte.solde_initial) + items.filter((i) => i.rapproche).reduce((s, i) => s + i.montant, 0);
    const { data: dernierRapprochements } = await supabase.from("rapprochements_bancaires").select("*").eq("compte_bancaire_uuid", compteId).order("created_at", { ascending: false }).limit(1);
    setData({ items, solde_comptable: soldeComptable, solde_pointe: soldePointe, dernier_rapprochement: (dernierRapprochements && dernierRapprochements[0]) || null });
  };

  useEffect(() => { loadComptes(); }, []);
  useEffect(() => { loadRapprochement(); }, [compteId]);

  const fmt = (n) => Number(n || 0).toLocaleString();

  const togglePointer = async (item) => {
    const supabase = getAuthedClient(token);
    const table = item.type === "ajustement" ? "ajustements_bancaires" : "transferts_internes";
    await supabase.from(table).update({ rapproche: !item.rapproche }).eq("id", item.id);
    loadRapprochement();
  };

  const openAjustModal = () => { setAjustForm({ date: new Date().toISOString().slice(0, 10), montant: "", description: "" }); setAjustCreds({ username: "", password: "" }); setAjustError(""); setAjustModalOpen(true); };
  const submitAjust = async () => {
    setAjustError("");
    if (!ajustForm.montant || Number(ajustForm.montant) <= 0) { setAjustError("Montant invalide"); return; }
    try {
      const check = await verifyCredentials(ajustCreds.username, ajustCreds.password);
      if (!check.ok) { setAjustError(check.error); return; }
      const supabase = getAuthedClient(token);
      const allowed = await checkUserPerm(supabase, ajustCreds.username, "po_decaissement", "peut_modifier");
      if (!allowed) { setAjustError("Ce compte n'a pas la permission requise"); return; }
      const { data: ajustement, error: eAjust } = await supabase.from("ajustements_bancaires").insert({
        compte_bancaire_uuid: compteId, date: ajustForm.date, montant: Number(ajustForm.montant), description: ajustForm.description || "Frais bancaire",
        nom_utilisateur: ajustCreds.username, modified_by: ajustCreds.username
      }).select().single();
      if (eAjust) throw eAjust;
      await genererEcritureAjustementBancaire(supabase, { id: ajustement.id, date: ajustForm.date, description: ajustForm.description || "Frais bancaire", montant: Number(ajustForm.montant), compte_bancaire_uuid: compteId, modified_by: ajustCreds.username });
      setAjustModalOpen(false);
      loadRapprochement();
    } catch (e) { setAjustError(e.message || "Erreur"); }
  };

  const openClotureModal = () => { setClotureCreds({ username: "", password: "" }); setClotureError(""); setClotureModalOpen(true); };
  const submitCloture = async () => {
    setClotureError("");
    if (!dateReleve || !soldeReleve) { setClotureError("Date et solde du releve requis"); return; }
    try {
      const check = await verifyCredentials(clotureCreds.username, clotureCreds.password);
      if (!check.ok) { setClotureError(check.error); return; }
      const supabase = getAuthedClient(token);
      const allowed = await checkUserPerm(supabase, clotureCreds.username, "po_decaissement", "peut_modifier");
      if (!allowed) { setClotureError("Ce compte n'a pas la permission requise"); return; }
      const { error: eRappro } = await supabase.from("rapprochements_bancaires").insert({
        compte_bancaire_uuid: compteId, date_releve: dateReleve, solde_releve: Number(soldeReleve), solde_comptable: data.solde_pointe, ecart: Number(soldeReleve) - data.solde_pointe,
        statut: "cloture", nom_utilisateur: clotureCreds.username, modified_by: clotureCreds.username
      });
      if (eRappro) throw eRappro;
      setClotureModalOpen(false);
      setDateReleve(""); setSoldeReleve("");
      loadRapprochement();
    } catch (e) { setClotureError(e.message || "Erreur"); }
  };

  const ecart = data && soldeReleve ? Number(soldeReleve) - data.solde_pointe : null;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Rapprochement Bancaire</h1>
          <p className="page-subtitle">Pointage des transactions et frais bancaires</p>
        </div>
      </div>

      <div className="form-card" style={{ marginBottom: "22px" }}>
        <div className="form-group">
          <label>Compte bancaire</label>
          <select value={compteId} onChange={(e) => setCompteId(e.target.value)}>
            {comptes.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
        </div>
      </div>

      {data && (
        <>
          <div style={{ display: "flex", gap: "20px", marginBottom: "22px" }}>
            <div className="form-card" style={{ flex: 1, textAlign: "center" }}>
              <p style={{ fontSize: "12px", color: "var(--text-dim)" }}>Solde comptable</p>
              <strong style={{ fontSize: "20px" }}>{fmt(data.solde_comptable)} HTG</strong>
            </div>
            <div className="form-card" style={{ flex: 1, textAlign: "center" }}>
              <p style={{ fontSize: "12px", color: "var(--text-dim)" }}>Solde pointe</p>
              <strong style={{ fontSize: "20px" }}>{fmt(data.solde_pointe)} HTG</strong>
            </div>
          </div>

          <div className="form-card" style={{ marginBottom: "22px" }}>
            <h3 className="form-card-title">Cloture du rapprochement</h3>
            <div style={{ display: "flex", gap: "14px", alignItems: "flex-end", flexWrap: "wrap" }}>
              <div className="form-group"><label>Date du releve</label><input type="date" value={dateReleve} onChange={(e) => setDateReleve(e.target.value)} /></div>
              <div className="form-group"><label>Solde du releve</label><input type="number" value={soldeReleve} onChange={(e) => setSoldeReleve(e.target.value)} /></div>
              {ecart !== null && (
                <div className="form-group">
                  <label>Ecart</label>
                  <strong style={{ color: Math.abs(ecart) < 0.01 ? "var(--ok)" : "var(--err)", fontSize: "16px" }}>{fmt(ecart)} HTG</strong>
                </div>
              )}
              <button className="btn-sm btn-primary" onClick={openClotureModal}>Cloturer le rapprochement</button>
            </div>
            {data.dernier_rapprochement && (
              <p style={{ fontSize: "12px", color: "var(--text-dim)", marginTop: "10px" }}>Dernier rapprochement clos le {data.dernier_rapprochement.date_releve} - ecart: {fmt(data.dernier_rapprochement.ecart)} HTG</p>
            )}
          </div>

          <div className="page-header" style={{ marginBottom: "14px" }}>
            <h3 className="form-card-title">Transactions</h3>
            <button className="btn-sm btn-gold" onClick={openAjustModal}>+ Frais bancaire</button>
          </div>

          <div className="table-card">
            <table className="data-table">
              <thead><tr><th></th><th>Date</th><th>Description</th><th>Montant</th></tr></thead>
              <tbody>
                {data.items.length === 0 && <tr><td colSpan="4" className="table-empty">Aucune transaction.</td></tr>}
                {data.items.map((item) => (
                  <tr key={item.type + "-" + item.id}>
                    <td><input type="checkbox" checked={item.rapproche} onChange={() => togglePointer(item)} /></td>
                    <td>{item.date}</td>
                    <td>{item.description}</td>
                    <td style={{ color: item.montant >= 0 ? "var(--ok)" : "var(--err)" }}><strong>{fmt(item.montant)} HTG</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {ajustModalOpen && (
        <div className="modal-overlay" onClick={() => setAjustModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "460px" }}>
            <div className="modal-header"><h3>Frais bancaire</h3><button className="modal-close" onClick={() => setAjustModalOpen(false)}>x</button></div>
            {ajustError && <div className="login-error" style={{ marginBottom: "14px" }}>{ajustError}</div>}
            <div className="form-group" style={{ marginBottom: "14px" }}>
              <label>Date</label>
              <input type="date" value={ajustForm.date} onChange={(e) => setAjustForm({ ...ajustForm, date: e.target.value })} />
            </div>
            <div className="form-group" style={{ marginBottom: "14px" }}>
              <label>Montant (HTG)</label>
              <input type="number" value={ajustForm.montant} onChange={(e) => setAjustForm({ ...ajustForm, montant: e.target.value })} />
            </div>
            <div className="form-group" style={{ marginBottom: "20px" }}>
              <label>Description</label>
              <input value={ajustForm.description} onChange={(e) => setAjustForm({ ...ajustForm, description: e.target.value })} placeholder="Ex: Frais de tenue de compte" />
            </div>
            <div style={{ background: "var(--bg-soft)", borderRadius: "10px", padding: "12px 14px", marginBottom: "18px" }}>
              <p style={{ fontSize: "12px", color: "var(--text-soft)", marginBottom: "10px", fontWeight: 600 }}>Confirmation Tresorier</p>
              <div className="form-group" style={{ marginBottom: "10px" }}>
                <label>Identifiant</label>
                <input value={ajustCreds.username} onChange={(e) => setAjustCreds({ ...ajustCreds, username: e.target.value })} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Mot de passe</label>
                <input type="password" value={ajustCreds.password} onChange={(e) => setAjustCreds({ ...ajustCreds, password: e.target.value })} />
              </div>
            </div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setAjustModalOpen(false)}>Annuler</button>
              <button className="btn-primary" onClick={submitAjust}>Enregistrer</button>
            </div>
          </div>
        </div>
      )}

      {clotureModalOpen && (
        <div className="modal-overlay" onClick={() => setClotureModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "460px" }}>
            <div className="modal-header"><h3>Cloturer le rapprochement</h3><button className="modal-close" onClick={() => setClotureModalOpen(false)}>x</button></div>
            {clotureError && <div className="login-error" style={{ marginBottom: "14px" }}>{clotureError}</div>}
            <div className="receipt-line"><span>Date du releve</span><strong>{dateReleve}</strong></div>
            <div className="receipt-line"><span>Solde du releve</span><strong>{fmt(soldeReleve)} HTG</strong></div>
            <div className="receipt-line"><span>Solde pointe</span><strong>{fmt(data ? data.solde_pointe : 0)} HTG</strong></div>
            <div className="receipt-total" style={{ marginBottom: "18px" }}><span>Ecart</span><strong>{fmt(ecart)} HTG</strong></div>
            <div style={{ background: "var(--bg-soft)", borderRadius: "10px", padding: "12px 14px", marginBottom: "18px" }}>
              <p style={{ fontSize: "12px", color: "var(--text-soft)", marginBottom: "10px", fontWeight: 600 }}>Confirmation Tresorier</p>
              <div className="form-group" style={{ marginBottom: "10px" }}>
                <label>Identifiant</label>
                <input value={clotureCreds.username} onChange={(e) => setClotureCreds({ ...clotureCreds, username: e.target.value })} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Mot de passe</label>
                <input type="password" value={clotureCreds.password} onChange={(e) => setClotureCreds({ ...clotureCreds, password: e.target.value })} />
              </div>
            </div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setClotureModalOpen(false)}>Annuler</button>
              <button className="btn-primary" onClick={submitCloture}>Confirmer la cloture</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}