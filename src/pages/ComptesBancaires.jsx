import React, { useState, useEffect } from "react";
import { useAuth } from "../AuthContext.jsx";
import { getAuthedClient } from "../supabaseClient.js";
import { usePermissions } from "../PermissionsContext.jsx";

import { genererEcritureTransfert } from "../accountingHelpers.js";

export default function ComptesBancaires() {
  const { token, user } = useAuth();
  const { can } = usePermissions();
  const [tab, setTab] = useState("comptes");
  const [comptes, setComptes] = useState([]);
  const [transferts, setTransferts] = useState([]);
  const [soldes, setSoldes] = useState({});
  const [error, setError] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingCompte, setEditingCompte] = useState(null);
  const [form, setForm] = useState({ nom: "", banque: "", numero_compte: "", titulaire: "", type_compte: "Courant", devise: "HTG", solde_initial: "", date_solde_initial: "", description: "", agence: "" });

  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [tForm, setTForm] = useState({ source_type: "banque", source_compte_uuid: "", destination_type: "grande", destination_compte_uuid: "", montant: "", devise: "HTG", motif: "" });
  const [tSaving, setTSaving] = useState(false);

  const fmt = (n) => Number(n || 0).toLocaleString();

  const loadComptes = async () => {
    if (!token) return;
    const supabase = getAuthedClient(token);
    const { data } = await supabase.from("comptes_bancaires").select("*").order("nom");
    setComptes(data || []);
    return data || [];
  };

  const loadTransferts = async () => {
    if (!token) return;
    const supabase = getAuthedClient(token);
    const { data } = await supabase.from("transferts_internes").select("*").order("created_at", { ascending: false }).limit(200);
    setTransferts(data || []);
  };

  const computeSoldes = async (comptesList) => {
    if (!token || !comptesList.length) return;
    const supabase = getAuthedClient(token);
    const { data: allTransferts } = await supabase.from("transferts_internes").select("*").eq("statut", "valide");
    const map = {};
    for (const c of comptesList) {
      const entrees = (allTransferts || []).filter((t) => t.destination_type === "banque" && t.destination_compte_uuid === c.id).reduce((s, t) => s + Number(t.montant), 0);
      const sorties = (allTransferts || []).filter((t) => t.source_type === "banque" && t.source_compte_uuid === c.id).reduce((s, t) => s + Number(t.montant), 0);
      map[c.id] = Number(c.solde_initial) + entrees - sorties;
    }
    setSoldes(map);
  };

  const loadAll = async () => {
    const list = await loadComptes();
    await loadTransferts();
    await computeSoldes(list);
  };

  useEffect(() => { loadAll(); }, [token]);

  const openNewCompte = () => {
    setEditingCompte(null);
    setForm({ nom: "", banque: "", numero_compte: "", titulaire: "", type_compte: "Courant", devise: "HTG", solde_initial: "", date_solde_initial: "", description: "", agence: "" });
    setError(""); setModalOpen(true);
  };
  const openEditCompte = (c) => {
    setEditingCompte(c);
    setForm({ nom: c.nom, banque: c.banque || "", numero_compte: c.numero_compte || "", titulaire: c.titulaire || "", type_compte: c.type_compte || "Courant", devise: c.devise, solde_initial: c.solde_initial, date_solde_initial: c.date_solde_initial || "", description: c.description || "", agence: c.agence || "" });
    setError(""); setModalOpen(true);
  };
  const submitCompte = async () => {
    setError("");
    if (!form.nom.trim()) { setError("Le nom du compte est requis"); return; }
    try {
      const supabase = getAuthedClient(token);
      const payload = { nom: form.nom, banque: form.banque || null, numero_compte: form.numero_compte || null, titulaire: form.titulaire || null, type_compte: form.type_compte, devise: form.devise, solde_initial: Number(form.solde_initial) || 0, date_solde_initial: form.date_solde_initial || null, description: form.description || null, agence: form.agence || null, modified_by: user.username };
      if (editingCompte) {
        const { error: e } = await supabase.from("comptes_bancaires").update(payload).eq("id", editingCompte.id);
        if (e) throw e;
      } else {
        const { error: e } = await supabase.from("comptes_bancaires").insert(payload);
        if (e) throw e;
      }
      setModalOpen(false);
      loadAll();
    } catch (e) {
      setError(e.message || "Erreur");
    }
  };
  const toggleStatut = async (c) => {
    const supabase = getAuthedClient(token);
    await supabase.from("comptes_bancaires").update({ statut: c.statut === "actif" ? "inactif" : "actif", modified_by: user.username }).eq("id", c.id);
    loadAll();
  };

  const openTransferModal = () => {
    setTForm({ source_type: "banque", source_compte_uuid: comptes[0] ? comptes[0].id : "", destination_type: "grande", destination_compte_uuid: "", montant: "", devise: "HTG", motif: "" });
    setError(""); setTransferModalOpen(true);
  };
  const submitTransfer = async () => {
    setError("");
    if (tForm.source_type === "banque" && !tForm.source_compte_uuid) { setError("Choisissez le compte source"); return; }
    if (tForm.destination_type === "banque" && !tForm.destination_compte_uuid) { setError("Choisissez le compte destination"); return; }
    if (tForm.source_type !== "banque" && tForm.destination_type !== "banque") { setError("Au moins un cote du transfert doit etre un compte bancaire"); return; }
    const m = Number(tForm.montant);
    if (!m || m <= 0) { setError("Montant invalide"); return; }
    setTSaving(true);
    try {
      const supabase = getAuthedClient(token);
      const { data: newTransfert, error: e } = await supabase.from("transferts_internes").insert({
        source_type: tForm.source_type, source_compte_uuid: tForm.source_type === "banque" ? tForm.source_compte_uuid : null,
        destination_type: tForm.destination_type, destination_compte_uuid: tForm.destination_type === "banque" ? tForm.destination_compte_uuid : null,
        montant: m, devise: tForm.devise, motif: tForm.motif || null,
        user_uuid: user.id, nom_utilisateur: user.nom_complet || user.username,
        statut: "valide", modified_by: user.username
      }).select().single();
      if (e) throw e;
      await genererEcritureTransfert(supabase, newTransfert);
      setTransferModalOpen(false);
      loadAll();
    } catch (e) {
      setError(e.message || "Erreur");
    }
    setTSaving(false);
  };

  const compteLabel = (type, id) => {
    if (type === "grande") return "Grande Caisse";
    if (type === "petite") return "Petite Caisse";
    const c = comptes.find((x) => x.id === id);
    return c ? c.nom : "Compte inconnu";
  };

  return (
    <div className="page">
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 className="page-title">Comptes Bancaires</h1>
          <p className="page-subtitle">Gestion des comptes bancaires et transferts internes</p>
        </div>
      </div>

      <div className="store-tabs">
        <button className={"store-tab" + (tab === "comptes" ? " active" : "")} onClick={() => setTab("comptes")}>Comptes bancaires</button>
        <button className={"store-tab" + (tab === "transferts" ? " active" : "")} onClick={() => setTab("transferts")}>Transferts internes</button>
      </div>

      {error && !modalOpen && !transferModalOpen && <div className="login-error" style={{ margin: "16px 0" }}>{error}</div>}

      {tab === "comptes" && (
        <>
          <div style={{ marginBottom: "16px" }}>{can("comptes_bancaires","creer") && <button className="btn-primary btn-sm" onClick={openNewCompte}>+ Nouveau compte bancaire</button>}</div>
          <div className="kpi-grid">
            {comptes.map((c) => (
              <div key={c.id} className="kpi-card" style={{ opacity: c.statut === "actif" ? 1 : 0.5 }}>
                <div className="kpi-label">{c.nom} {c.statut !== "actif" && <span className="badge badge-gray">Inactif</span>}</div>
                <div className="kpi-value" style={{ color: "var(--navy)" }}>{fmt(soldes[c.id])} {c.devise}</div>
                <div className="kpi-hint">{c.banque || "-"} {c.numero_compte ? "- " + c.numero_compte : ""}</div>
                <div style={{ marginTop: "8px", display: "flex", gap: "6px" }}>
                  {can("comptes_bancaires","modifier") && <button className="btn-sm btn-blue" onClick={() => openEditCompte(c)}>Modifier</button>}
                  {can("comptes_bancaires","modifier") && <button className="btn-sm btn-gray-cancel" onClick={() => toggleStatut(c)}>{c.statut === "actif" ? "Desactiver" : "Activer"}</button>}
                </div>
              </div>
            ))}
            {comptes.length === 0 && <div className="grid-empty">Aucun compte bancaire. Ajoutez-en un.</div>}
          </div>
        </>
      )}

      {tab === "transferts" && (
        <>
          <div style={{ marginBottom: "16px" }}>{can("comptes_bancaires","creer") && <button className="btn-primary btn-sm" onClick={openTransferModal}>+ Nouveau transfert</button>}</div>
          <div className="table-card">
            <table className="data-table">
              <thead><tr><th>Date</th><th>De</th><th>Vers</th><th>Montant</th><th>Motif</th><th>Utilisateur</th></tr></thead>
              <tbody>
                {transferts.length === 0 && <tr><td colSpan="6" className="table-empty">Aucun transfert.</td></tr>}
                {transferts.map((t) => (
                  <tr key={t.id}>
                    <td>{t.created_at ? new Date(t.created_at).toLocaleString() : ""}</td>
                    <td>{compteLabel(t.source_type, t.source_compte_uuid)}</td>
                    <td>{compteLabel(t.destination_type, t.destination_compte_uuid)}</td>
                    <td><strong>{fmt(t.montant)} {t.devise}</strong></td>
                    <td>{t.motif || "-"}</td>
                    <td>{t.nom_utilisateur || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "520px" }}>
            <div className="modal-header"><h3>{editingCompte ? "Modifier le compte" : "Nouveau compte bancaire"}</h3><button className="modal-close" onClick={() => setModalOpen(false)}>x</button></div>
            {error && <div className="login-error" style={{ marginBottom: "14px" }}>{error}</div>}
            <div className="form-group" style={{ marginBottom: "14px" }}><label>Nom du compte *</label><input value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} placeholder="ex: Compte principal CAPV" /></div>
            <div className="form-row">
              <div className="form-group"><label>Banque</label><input value={form.banque} onChange={(e) => setForm({ ...form, banque: e.target.value })} /></div>
              <div className="form-group"><label>Numero de compte</label><input value={form.numero_compte} onChange={(e) => setForm({ ...form, numero_compte: e.target.value })} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Titulaire</label><input value={form.titulaire} onChange={(e) => setForm({ ...form, titulaire: e.target.value })} /></div>
              <div className="form-group"><label>Type de compte</label>
                <select value={form.type_compte} onChange={(e) => setForm({ ...form, type_compte: e.target.value })}>
                  <option value="Courant">Courant</option>
                  <option value="Epargne">Epargne</option>
                  <option value="Projet">Projet</option>
                  <option value="Autre">Autre</option>
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Devise</label><select value={form.devise} onChange={(e) => setForm({ ...form, devise: e.target.value })}><option value="HTG">HTG</option><option value="USD">USD</option></select></div>
              <div className="form-group"><label>Solde initial</label><input type="number" value={form.solde_initial} onChange={(e) => setForm({ ...form, solde_initial: e.target.value })} disabled={!!editingCompte} /></div>
              <div className="form-group"><label>Date du solde initial</label><input type="date" value={form.date_solde_initial} onChange={(e) => setForm({ ...form, date_solde_initial: e.target.value })} disabled={!!editingCompte} /></div>
            </div>
            <div className="form-group" style={{ marginBottom: "14px" }}><label>Agence</label><input value={form.agence} onChange={(e) => setForm({ ...form, agence: e.target.value })} /></div>
            <div className="form-group" style={{ marginBottom: "14px" }}><label>Description</label><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setModalOpen(false)}>Annuler</button>
              <button className="btn-primary" onClick={submitCompte}>{editingCompte ? "Enregistrer" : "Creer"}</button>
            </div>
          </div>
        </div>
      )}

      {transferModalOpen && (
        <div className="modal-overlay" onClick={() => setTransferModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "480px" }}>
            <div className="modal-header"><h3>Nouveau transfert interne</h3><button className="modal-close" onClick={() => setTransferModalOpen(false)}>x</button></div>
            {error && <div className="login-error" style={{ marginBottom: "14px" }}>{error}</div>}
            <p style={{ fontSize: "12px", color: "var(--text-dim)", marginBottom: "16px" }}>Au moins un cote du transfert doit etre un compte bancaire. Pour Grande vers Petite Caisse, utilisez le bouton dedie dans le module Grande Caisse.</p>
            <div className="form-row">
              <div className="form-group"><label>De</label>
                <select value={tForm.source_type} onChange={(e) => setTForm({ ...tForm, source_type: e.target.value, source_compte_uuid: "" })}>
                  <option value="grande">Grande Caisse</option>
                  <option value="petite">Petite Caisse</option>
                  <option value="banque">Compte bancaire</option>
                </select>
              </div>
              {tForm.source_type === "banque" && (
                <div className="form-group"><label>Compte source</label>
                  <select value={tForm.source_compte_uuid} onChange={(e) => setTForm({ ...tForm, source_compte_uuid: e.target.value })}>
                    <option value="">-- Choisir --</option>
                    {comptes.filter((c) => c.statut === "actif").map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div className="form-row">
              <div className="form-group"><label>Vers</label>
                <select value={tForm.destination_type} onChange={(e) => setTForm({ ...tForm, destination_type: e.target.value, destination_compte_uuid: "" })}>
                  <option value="grande">Grande Caisse</option>
                  <option value="petite">Petite Caisse</option>
                  <option value="banque">Compte bancaire</option>
                </select>
              </div>
              {tForm.destination_type === "banque" && (
                <div className="form-group"><label>Compte destination</label>
                  <select value={tForm.destination_compte_uuid} onChange={(e) => setTForm({ ...tForm, destination_compte_uuid: e.target.value })}>
                    <option value="">-- Choisir --</option>
                    {comptes.filter((c) => c.statut === "actif").map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div className="form-row">
              <div className="form-group"><label>Montant</label><input type="number" value={tForm.montant} onChange={(e) => setTForm({ ...tForm, montant: e.target.value })} /></div>
              <div className="form-group"><label>Devise</label><select value={tForm.devise} onChange={(e) => setTForm({ ...tForm, devise: e.target.value })}><option value="HTG">HTG</option><option value="USD">USD</option></select></div>
            </div>
            <div className="form-group" style={{ marginBottom: "16px" }}><label>Motif</label><input value={tForm.motif} onChange={(e) => setTForm({ ...tForm, motif: e.target.value })} placeholder="ex: Approvisionnement, depot..." /></div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setTransferModalOpen(false)}>Annuler</button>
              <button className="btn-primary" onClick={submitTransfer} disabled={tSaving}>{tSaving ? "Enregistrement..." : "Transferer"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}