import React, { useState, useEffect } from "react";
import { useAuth } from "../AuthContext.jsx";
import { getAuthedClient, EDGE_FUNCTION_URL, SUPABASE_ANON_KEY } from "../supabaseClient.js";
import { genererEcritureTransfert, genererEcritureAcquisitionImmobilisation, genererEcritureAmortissement } from "../accountingHelpers.js";

export default function Immobilisations() {
  const { token } = useAuth();
  const [list, setList] = useState([]);
  const [comptesBancaires, setComptesBancaires] = useState([]);
  const [detail, setDetail] = useState(null);
  const [amortissements, setAmortissements] = useState([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ nom: "", categorie: "", date_acquisition: "", valeur_acquisition: "", duree_amortissement_annees: "", valeur_residuelle: "0", numero_cheque: "", compte_bancaire_id: "" });
  const [creds, setCreds] = useState({ username: "", password: "" });
  const [error, setError] = useState("");

  const [dotationsModalOpen, setDotationsModalOpen] = useState(false);
  const [dotationsAnnee, setDotationsAnnee] = useState(String(new Date().getFullYear()));
  const [dotationsCreds, setDotationsCreds] = useState({ username: "", password: "" });
  const [dotationsError, setDotationsError] = useState("");
  const [dotationsResult, setDotationsResult] = useState(null);

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

  const load = async () => {
    const supabase = getAuthedClient(token);
    const { data: imms } = await supabase.from("immobilisations").select("*").order("date_acquisition", { ascending: false });
    const withDetails = await Promise.all((imms || []).map(async (imm) => {
      const { data: amorts } = await supabase.from("amortissements").select("montant").eq("immobilisation_uuid", imm.id);
      const cumul = (amorts || []).reduce((s, a) => s + Number(a.montant), 0);
      return { ...imm, amortissement_cumule: cumul, valeur_nette: Number(imm.valeur_acquisition) - cumul };
    }));
    setList(withDetails);
  };
  const loadComptesBancaires = async () => {
    const supabase = getAuthedClient(token);
    const { data } = await supabase.from("comptes_bancaires").select("*").eq("statut", "actif").order("nom");
    setComptesBancaires(data || []);
  };
  const loadAmortissements = async (id) => {
    const supabase = getAuthedClient(token);
    const { data } = await supabase.from("amortissements").select("*").eq("immobilisation_uuid", id).order("annee", { ascending: false });
    setAmortissements(data || []);
  };

  useEffect(() => { load(); loadComptesBancaires(); }, []);

  const fmt = (n) => Number(n || 0).toLocaleString();

  const openDetail = (imm) => {
    setDetail(imm);
    loadAmortissements(imm.id);
  };

  const openModal = () => {
    setForm({ nom: "", categorie: "", date_acquisition: new Date().toISOString().slice(0, 10), valeur_acquisition: "", duree_amortissement_annees: "", valeur_residuelle: "0", numero_cheque: "", compte_bancaire_id: "" });
    setCreds({ username: "", password: "" });
    setError("");
    setModalOpen(true);
  };
  const submit = async () => {
    setError("");
    if (!form.nom.trim()) { setError("Le nom est requis"); return; }
    if (!form.valeur_acquisition || Number(form.valeur_acquisition) <= 0) { setError("Valeur d'acquisition invalide"); return; }
    if (!form.duree_amortissement_annees || Number(form.duree_amortissement_annees) <= 0) { setError("Duree d'amortissement invalide"); return; }
    if (!form.numero_cheque.trim()) { setError("Numero de cheque obligatoire"); return; }
    if (!form.compte_bancaire_id) { setError("Choisissez le compte bancaire du cheque"); return; }
    try {
      const check = await verifyCredentials(creds.username, creds.password);
      if (!check.ok) { setError(check.error); return; }
      const supabase = getAuthedClient(token);
      const allowed = await checkUserPerm(supabase, creds.username, "po_decaissement", "peut_modifier");
      if (!allowed) { setError("Ce compte n'a pas la permission requise"); return; }
      const { count } = await supabase.from("immobilisations").select("id", { count: "exact", head: true });
      const yr = new Date().getFullYear();
      const numero = "IMM-" + yr + "-" + String((count || 0) + 1).padStart(4, "0");
      const { data: transfert, error: eTr } = await supabase.from("transferts_internes").insert({
        source_type: "banque", source_compte_uuid: form.compte_bancaire_id, destination_type: "grande", destination_compte_uuid: null,
        montant: Number(form.valeur_acquisition), devise: "HTG", motif: "Cheque " + form.numero_cheque.trim() + " - " + form.nom,
        nom_utilisateur: creds.username, statut: "valide", modified_by: creds.username
      }).select().single();
      if (eTr) throw eTr;
      await genererEcritureTransfert(supabase, transfert);
      const { data: imm, error: eImm } = await supabase.from("immobilisations").insert({
        numero, nom: form.nom, categorie: form.categorie || null, date_acquisition: form.date_acquisition,
        valeur_acquisition: Number(form.valeur_acquisition), duree_amortissement_annees: Number(form.duree_amortissement_annees), valeur_residuelle: Number(form.valeur_residuelle) || 0,
        numero_cheque: form.numero_cheque.trim(), compte_bancaire_uuid: form.compte_bancaire_id, transfert_uuid: transfert.id,
        nom_utilisateur: creds.username, modified_by: creds.username
      }).select().single();
      if (eImm) throw eImm;
      await genererEcritureAcquisitionImmobilisation(supabase, { id: imm.id, nom: form.nom, date_acquisition: form.date_acquisition, valeur_acquisition: Number(form.valeur_acquisition), modified_by: creds.username });
      setModalOpen(false);
      load();
    } catch (e) { setError(e.message || "Erreur"); }
  };

  const openDotationsModal = () => { setDotationsAnnee(String(new Date().getFullYear())); setDotationsCreds({ username: "", password: "" }); setDotationsError(""); setDotationsResult(null); setDotationsModalOpen(true); };
  const submitDotations = async () => {
    setDotationsError("");
    try {
      const check = await verifyCredentials(dotationsCreds.username, dotationsCreds.password);
      if (!check.ok) { setDotationsError(check.error); return; }
      const supabase = getAuthedClient(token);
      const allowed = await checkUserPerm(supabase, dotationsCreds.username, "po_decaissement", "peut_modifier");
      if (!allowed) { setDotationsError("Ce compte n'a pas la permission requise"); return; }
      const anneeCalc = Number(dotationsAnnee);
      const { data: imms } = await supabase.from("immobilisations").select("*").eq("statut", "active");
      let compteur = 0;
      for (const imm of (imms || [])) {
        const { data: dejaFait } = await supabase.from("amortissements").select("id").eq("immobilisation_uuid", imm.id).eq("annee", anneeCalc).maybeSingle();
        if (dejaFait) continue;
        const { data: existants } = await supabase.from("amortissements").select("montant").eq("immobilisation_uuid", imm.id);
        const cumulAvant = (existants || []).reduce((s, a) => s + Number(a.montant), 0);
        const valeurAmortissable = Number(imm.valeur_acquisition) - Number(imm.valeur_residuelle);
        const dotationAnnuelle = valeurAmortissable / imm.duree_amortissement_annees;
        if (cumulAvant >= valeurAmortissable) continue;
        const montant = Math.min(dotationAnnuelle, valeurAmortissable - cumulAvant);
        const cumulApres = cumulAvant + montant;
        const { data: amort, error: eAmort } = await supabase.from("amortissements").insert({
          immobilisation_uuid: imm.id, annee: anneeCalc, date: anneeCalc + "-12-31", montant, cumul_apres: cumulApres,
          nom_utilisateur: dotationsCreds.username, modified_by: dotationsCreds.username
        }).select().single();
        if (eAmort) throw eAmort;
        await genererEcritureAmortissement(supabase, { id: amort.id, date: anneeCalc + "-12-31", annee: anneeCalc, nom_immobilisation: imm.nom, montant, modified_by: dotationsCreds.username });
        compteur++;
      }
      setDotationsResult(compteur);
      load();
      if (detail) loadAmortissements(detail.id);
    } catch (e) { setDotationsError(e.message || "Erreur"); }
  };

  return (
    <div className="page">
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 className="page-title">Immobilisations</h1>
          <p className="page-subtitle">{list.length} immobilisation(s)</p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button className="btn-sm btn-gold" onClick={openDotationsModal}>Calculer les dotations</button>
          <button className="btn-primary" onClick={openModal}>+ Nouvelle immobilisation</button>
        </div>
      </div>

      <div style={{ display: "flex", gap: "20px" }}>
        <div className="table-card" style={{ flex: 2 }}>
          <table className="data-table">
            <thead><tr><th>Numero</th><th>Nom</th><th>Acquisition</th><th>Valeur nette</th></tr></thead>
            <tbody>
              {list.length === 0 && <tr><td colSpan="4" className="table-empty">Aucune immobilisation.</td></tr>}
              {list.map((imm) => (
                <tr key={imm.id} onClick={() => openDetail(imm)} style={{ cursor: "pointer", background: detail && detail.id === imm.id ? "var(--bg-soft)" : "transparent" }}>
                  <td><strong style={{ color: "var(--accent)" }}>{imm.numero}</strong></td>
                  <td>{imm.nom}</td>
                  <td>{imm.date_acquisition}</td>
                  <td><strong>{fmt(imm.valeur_nette)} HTG</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="form-card" style={{ flex: 1 }}>
          {!detail ? (
            <p style={{ color: "var(--text-dim)" }}>Selectionnez une immobilisation pour voir son detail.</p>
          ) : (
            <>
              <h3 className="form-card-title">{detail.nom}</h3>
              <div className="receipt-line"><span>Categorie</span><strong>{detail.categorie || "-"}</strong></div>
              <div className="receipt-line"><span>Date acquisition</span><strong>{detail.date_acquisition}</strong></div>
              <div className="receipt-line"><span>Valeur acquisition</span><strong>{fmt(detail.valeur_acquisition)} HTG</strong></div>
              <div className="receipt-line"><span>Duree</span><strong>{detail.duree_amortissement_annees} an(s)</strong></div>
              <div className="receipt-line"><span>Amortissement cumule</span><strong>{fmt(detail.amortissement_cumule)} HTG</strong></div>
              <div className="receipt-total" style={{ marginBottom: "16px" }}><span>Valeur nette</span><strong>{fmt(detail.valeur_nette)} HTG</strong></div>
              <p style={{ fontSize: "12px", color: "var(--text-soft)", fontWeight: 600, marginBottom: "8px" }}>Historique des dotations</p>
              {amortissements.length === 0 && <p style={{ fontSize: "13px", color: "var(--text-dim)" }}>Aucune dotation enregistree.</p>}
              {amortissements.map((a) => (
                <div key={a.id} className="receipt-line"><span>{a.annee}</span><strong>{fmt(a.montant)} HTG</strong></div>
              ))}
            </>
          )}
        </div>
      </div>

      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal-card modal-large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h3>Nouvelle immobilisation</h3><button className="modal-close" onClick={() => setModalOpen(false)}>x</button></div>
            {error && <div className="login-error" style={{ marginBottom: "16px" }}>{error}</div>}
            <div className="form-row">
              <div className="form-group"><label>Nom</label><input value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} /></div>
              <div className="form-group"><label>Categorie</label><input value={form.categorie} onChange={(e) => setForm({ ...form, categorie: e.target.value })} placeholder="Ex: Vehicule, Batiment, Equipement" /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Date d'acquisition</label><input type="date" value={form.date_acquisition} onChange={(e) => setForm({ ...form, date_acquisition: e.target.value })} /></div>
              <div className="form-group"><label>Valeur d'acquisition (HTG)</label><input type="number" value={form.valeur_acquisition} onChange={(e) => setForm({ ...form, valeur_acquisition: e.target.value })} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Duree amortissement (annees)</label><input type="number" value={form.duree_amortissement_annees} onChange={(e) => setForm({ ...form, duree_amortissement_annees: e.target.value })} /></div>
              <div className="form-group"><label>Valeur residuelle (HTG)</label><input type="number" value={form.valeur_residuelle} onChange={(e) => setForm({ ...form, valeur_residuelle: e.target.value })} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Numero de cheque</label><input value={form.numero_cheque} onChange={(e) => setForm({ ...form, numero_cheque: e.target.value })} /></div>
              <div className="form-group"><label>Compte bancaire</label><select value={form.compte_bancaire_id} onChange={(e) => setForm({ ...form, compte_bancaire_id: e.target.value })}><option value="">-- Choisir --</option>{comptesBancaires.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}</select></div>
            </div>
            <div style={{ background: "var(--bg-soft)", borderRadius: "10px", padding: "12px 14px", marginBottom: "18px", marginTop: "10px" }}>
              <p style={{ fontSize: "12px", color: "var(--text-soft)", marginBottom: "10px", fontWeight: 600 }}>Confirmation Tresorier</p>
              <div className="form-group" style={{ marginBottom: "10px" }}>
                <label>Identifiant</label>
                <input value={creds.username} onChange={(e) => setCreds({ ...creds, username: e.target.value })} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Mot de passe</label>
                <input type="password" value={creds.password} onChange={(e) => setCreds({ ...creds, password: e.target.value })} />
              </div>
            </div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setModalOpen(false)}>Annuler</button>
              <button className="btn-primary" onClick={submit}>Enregistrer</button>
            </div>
          </div>
        </div>
      )}

      {dotationsModalOpen && (
        <div className="modal-overlay" onClick={() => setDotationsModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "440px" }}>
            <div className="modal-header"><h3>Calculer les dotations</h3><button className="modal-close" onClick={() => setDotationsModalOpen(false)}>x</button></div>
            {dotationsError && <div className="login-error" style={{ marginBottom: "14px" }}>{dotationsError}</div>}
            {dotationsResult !== null && <div className="form-card" style={{ marginBottom: "14px", background: "#dcfce7" }}><strong>{dotationsResult} dotation(s) enregistree(s).</strong></div>}
            <div className="form-group" style={{ marginBottom: "18px" }}>
              <label>Annee</label>
              <input type="number" value={dotationsAnnee} onChange={(e) => setDotationsAnnee(e.target.value)} />
            </div>
            <div style={{ background: "var(--bg-soft)", borderRadius: "10px", padding: "12px 14px", marginBottom: "18px" }}>
              <p style={{ fontSize: "12px", color: "var(--text-soft)", marginBottom: "10px", fontWeight: 600 }}>Confirmation Tresorier</p>
              <div className="form-group" style={{ marginBottom: "10px" }}>
                <label>Identifiant</label>
                <input value={dotationsCreds.username} onChange={(e) => setDotationsCreds({ ...dotationsCreds, username: e.target.value })} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Mot de passe</label>
                <input type="password" value={dotationsCreds.password} onChange={(e) => setDotationsCreds({ ...dotationsCreds, password: e.target.value })} />
              </div>
            </div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setDotationsModalOpen(false)}>Fermer</button>
              <button className="btn-primary" onClick={submitDotations}>Calculer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}