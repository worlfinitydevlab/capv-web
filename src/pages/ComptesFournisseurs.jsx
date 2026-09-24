import React, { useState, useEffect } from "react";
import { useAuth } from "../AuthContext.jsx";
import { getAuthedClient, EDGE_FUNCTION_URL, SUPABASE_ANON_KEY } from "../supabaseClient.js";
import { genererEcritureFactureFournisseur, genererEcriturePaiementFournisseur, genererEcritureTransfert, getCompteComptableByNumero } from "../accountingHelpers.js";

const STATUT_BADGE = {
  impayee: { t: "Impayee", c: "badge-gray" },
  partiellement_payee: { t: "Partiellement payee", c: "badge-gold" },
  payee: { t: "Payee", c: "badge-ok" },
  annulee: { t: "Annulee", c: "badge-err" }
};

export default function ComptesFournisseurs() {
  const { token, user } = useAuth();
  const [canPay, setCanPay] = useState(false);
  const [fournisseurs, setFournisseurs] = useState([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [factures, setFactures] = useState([]);
  const [comptesBancaires, setComptesBancaires] = useState([]);
  const [loading, setLoading] = useState(true);

  const [fModalOpen, setFModalOpen] = useState(false);
  const [fForm, setFForm] = useState({ nom: "", telephone: "", adresse: "" });
  const [fError, setFError] = useState("");

  const [factModalOpen, setFactModalOpen] = useState(false);
  const [factForm, setFactForm] = useState({ date_facture: "", date_echeance: "", description: "", montant_total: "" });
  const [factError, setFactError] = useState("");

  const [payModal, setPayModal] = useState(null);
  const [payMontant, setPayMontant] = useState("");
  const [payCheque, setPayCheque] = useState("");
  const [payCompteBancaire, setPayCompteBancaire] = useState("");
  const [payCreds, setPayCreds] = useState({ username: "", password: "" });
  const [payError, setPayError] = useState("");

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

  const computeFournisseurSolde = async (supabase, fournisseurId) => {
    const { data: facs } = await supabase.from("fournisseur_factures").select("id, montant_total, statut").eq("fournisseur_uuid", fournisseurId);
    const actives = (facs || []).filter((f) => f.statut !== "annulee");
    const totalFactures = actives.reduce((s, f) => s + Number(f.montant_total), 0);
    const ids = actives.map((f) => f.id);
    if (ids.length === 0) return totalFactures;
    const { data: paiements } = await supabase.from("fournisseur_paiements").select("montant").in("facture_uuid", ids);
    const totalPaye = (paiements || []).reduce((s, p) => s + Number(p.montant), 0);
    return totalFactures - totalPaye;
  };

  const load = async () => {
    setLoading(true);
    const supabase = getAuthedClient(token);
    const { data: fours } = await supabase.from("suppliers").select("*").order("nom");
    const withSolde = await Promise.all((fours || []).map(async (f) => ({ ...f, solde: await computeFournisseurSolde(supabase, f.id) })));
    setFournisseurs(withSolde);
    if (selected) {
      const updated = withSolde.find((f) => f.id === selected.id);
      if (updated) setSelected(updated);
    }

    const { data: banks } = await supabase.from("comptes_bancaires").select("*").eq("statut", "actif").order("nom");
    setComptesBancaires(banks || []);

    if (user.role === "Administrateur") {
      setCanPay(true);
    } else {
      const { data: role } = await supabase.from("roles").select("id").eq("nom", user.role).maybeSingle();
      if (role) {
        const { data: perm } = await supabase.from("role_permissions").select("peut_modifier").eq("role_uuid", role.id).eq("module", "po_decaissement").maybeSingle();
        setCanPay(!!(perm && perm.peut_modifier));
      }
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const fmt = (n) => Number(n || 0).toLocaleString();

  const loadFactures = async (fournisseurId) => {
    const supabase = getAuthedClient(token);
    const { data: facs } = await supabase.from("fournisseur_factures").select("*").eq("fournisseur_uuid", fournisseurId).order("created_at", { ascending: false });
    const withPaye = await Promise.all((facs || []).map(async (f) => {
      const { data: pays } = await supabase.from("fournisseur_paiements").select("montant").eq("facture_uuid", f.id);
      const paye = (pays || []).reduce((s, p) => s + Number(p.montant), 0);
      return { ...f, montant_paye: paye, solde: f.montant_total - paye };
    }));
    setFactures(withPaye);
  };

  const openFournisseur = (f) => {
    setSelected(f);
    loadFactures(f.id);
  };

  const openFModal = () => { setFForm({ nom: "", telephone: "", adresse: "" }); setFError(""); setFModalOpen(true); };
  const submitFournisseur = async () => {
    setFError("");
    if (!fForm.nom.trim()) { setFError("Le nom est requis"); return; }
    const supabase = getAuthedClient(token);
    const compteParentId = await getCompteComptableByNumero(supabase, "2100");
    const { data: enfants } = await supabase.from("comptes_comptables").select("numero").eq("compte_parent_uuid", compteParentId);
    let maxSeq = 0;
    (enfants || []).forEach((e) => {
      const parts = e.numero.split(".");
      if (parts.length === 2) { const n = parseInt(parts[1]); if (n > maxSeq) maxSeq = n; }
    });
    const numero = "2100." + (maxSeq + 1);
    const { data: compte, error: eCompte } = await supabase.from("comptes_comptables").insert({ numero, nom: fForm.nom, type: "passif", compte_parent_uuid: compteParentId, modified_by: user.username }).select().single();
    if (eCompte) { setFError(eCompte.message); return; }
    const { error: eSup } = await supabase.from("suppliers").insert({ nom: fForm.nom, telephone: fForm.telephone || null, adresse: fForm.adresse || null, compte_comptable_uuid: compte.id });
    if (eSup) { setFError(eSup.message); return; }
    setFModalOpen(false);
    load();
  };

  const openFactModal = () => { setFactForm({ date_facture: new Date().toISOString().slice(0, 10), date_echeance: "", description: "", montant_total: "" }); setFactError(""); setFactModalOpen(true); };
  const submitFacture = async () => {
    setFactError("");
    if (!factForm.date_facture) { setFactError("Date de facture requise"); return; }
    if (!factForm.montant_total || Number(factForm.montant_total) <= 0) { setFactError("Montant invalide"); return; }
    const supabase = getAuthedClient(token);
    const { count } = await supabase.from("fournisseur_factures").select("id", { count: "exact", head: true });
    const yr = new Date().getFullYear();
    const numero = "FF-" + yr + "-" + String((count || 0) + 1).padStart(4, "0");
    const { data: facture, error: eFact } = await supabase.from("fournisseur_factures").insert({
      numero, fournisseur_uuid: selected.id, date_facture: factForm.date_facture, date_echeance: factForm.date_echeance || null,
      description: factForm.description || null, montant_total: Number(factForm.montant_total),
      nom_utilisateur: user.username, modified_by: user.username
    }).select().single();
    if (eFact) { setFactError(eFact.message); return; }
    await genererEcritureFactureFournisseur(supabase, { id: facture.id, numero, date_facture: factForm.date_facture, description: factForm.description, montant_total: Number(factForm.montant_total), compte_fournisseur_uuid: selected.compte_comptable_uuid, nom_utilisateur: user.username });
    setFactModalOpen(false);
    loadFactures(selected.id);
    load();
  };

  const openPayModal = (f) => { setPayModal(f); setPayMontant(""); setPayCheque(""); setPayCompteBancaire(""); setPayCreds({ username: "", password: "" }); setPayError(""); };
  const submitPay = async () => {
    setPayError("");
    if (!payMontant || Number(payMontant) <= 0) { setPayError("Montant invalide"); return; }
    if (!payCheque.trim()) { setPayError("Numero de cheque obligatoire"); return; }
    if (!payCompteBancaire) { setPayError("Choisissez le compte bancaire du cheque"); return; }
    try {
      const check = await verifyCredentials(payCreds.username, payCreds.password);
      if (!check.ok) { setPayError(check.error); return; }
      const supabase = getAuthedClient(token);
      const allowed = await checkUserPerm(supabase, payCreds.username, "po_decaissement", "peut_modifier");
      if (!allowed) { setPayError("Ce compte n'a pas la permission requise"); return; }

      const yr = new Date().getFullYear();
      const { count } = await supabase.from("fournisseur_paiements").select("id", { count: "exact", head: true });
      const numero = "PF-" + yr + "-" + String((count || 0) + 1).padStart(4, "0");

      const { data: transfert, error: eTr } = await supabase.from("transferts_internes").insert({
        source_type: "banque", source_compte_uuid: payCompteBancaire, destination_type: "grande", destination_compte_uuid: null,
        montant: Number(payMontant), devise: "HTG", motif: "Cheque " + payCheque.trim() + " - " + selected.nom,
        nom_utilisateur: payCreds.username, statut: "valide", modified_by: payCreds.username
      }).select().single();
      if (eTr) throw eTr;
      await genererEcritureTransfert(supabase, transfert);

      const { data: exp, error: eExp } = await supabase.from("expenses").insert({
        categorie: "Fournisseur", montant: Number(payMontant), monnaie: "HTG",
        description: "Paiement facture " + payModal.numero + " - " + selected.nom,
        statut: "finalisee", caisse_type: "grande", numero_cheque: payCheque.trim(),
        compte_bancaire_uuid: payCompteBancaire, transfert_uuid: transfert.id, modified_by: payCreds.username
      }).select().single();
      if (eExp) throw eExp;

      const { count: countDC } = await supabase.from("caisse_decaissements").select("id", { count: "exact", head: true });
      const numeroDec = "DC-" + yr + "-" + String((countDC || 0) + 1).padStart(4, "0");
      const { data: dec, error: eDec } = await supabase.from("caisse_decaissements").insert({
        numero: numeroDec, caisse_type: "grande", date: new Date().toISOString().slice(0, 10),
        description: "Paiement facture " + payModal.numero, montant: Number(payMontant),
        beneficiaire: selected.nom, motif: "Fournisseur", categorie: "Fournisseur",
        caissier: payCreds.username, modified_by: payCreds.username
      }).select().single();
      if (eDec) throw eDec;
      await supabase.from("expenses").update({ decaissement_id: dec.id, modified_by: payCreds.username }).eq("id", exp.id);

      const { data: paiement, error: ePay } = await supabase.from("fournisseur_paiements").insert({
        numero, facture_uuid: payModal.id, fournisseur_uuid: selected.id, date: new Date().toISOString().slice(0, 10),
        montant: Number(payMontant), compte_bancaire_uuid: payCompteBancaire, numero_cheque: payCheque.trim(),
        transfert_uuid: transfert.id, expense_uuid: exp.id, nom_utilisateur: payCreds.username, modified_by: payCreds.username
      }).select().single();
      if (ePay) throw ePay;
      await genererEcriturePaiementFournisseur(supabase, { id: paiement.id, numero, numero_cheque: payCheque.trim(), montant: Number(payMontant), compte_fournisseur_uuid: selected.compte_comptable_uuid, modified_by: payCreds.username });

      const nouveauPaye = payModal.montant_paye + Number(payMontant);
      const nouveauStatut = nouveauPaye >= payModal.montant_total ? "payee" : "partiellement_payee";
      await supabase.from("fournisseur_factures").update({ statut: nouveauStatut, modified_by: payCreds.username }).eq("id", payModal.id);

      setPayModal(null);
      loadFactures(selected.id);
      load();
    } catch (e) { setPayError(e.message || "Erreur"); }
  };

  const filtered = fournisseurs.filter((f) => f.nom.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="page">
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 className="page-title">Comptes Fournisseurs</h1>
          <p className="page-subtitle">{fournisseurs.length} fournisseur(s)</p>
        </div>
        <button className="btn-primary" onClick={openFModal}>+ Nouveau fournisseur</button>
      </div>

      <div className="form-card" style={{ marginBottom: "22px" }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un fournisseur..."
          style={{ width: "100%", padding: "11px 14px", borderRadius: "10px", border: "1.5px solid var(--line)", background: "var(--bg-soft)", fontSize: "14px" }} />
      </div>

      <div style={{ display: "flex", gap: "20px" }}>
        <div className="form-card" style={{ flex: 1 }}>
          <h3 className="form-card-title">Fournisseurs</h3>
          {loading && <p style={{ color: "var(--text-dim)" }}>Chargement...</p>}
          {!loading && filtered.map((f) => (
            <div key={f.id} onClick={() => openFournisseur(f)}
              style={{ padding: "12px", borderRadius: "10px", cursor: "pointer", marginBottom: "8px", background: selected && selected.id === f.id ? "var(--bg-soft)" : "transparent", border: "1px solid var(--line)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong>{f.nom}</strong>
                <span style={{ color: f.solde > 0 ? "var(--err)" : "var(--text-dim)", fontWeight: 600 }}>{fmt(f.solde)} HTG</span>
              </div>
              {f.telephone && <div style={{ fontSize: "12px", color: "var(--text-dim)" }}>{f.telephone}</div>}
            </div>
          ))}
          {!loading && filtered.length === 0 && <p style={{ color: "var(--text-dim)" }}>Aucun fournisseur.</p>}
        </div>

        <div className="form-card" style={{ flex: 2 }}>
          {!selected ? (
            <p style={{ color: "var(--text-dim)" }}>Selectionnez un fournisseur pour voir ses factures.</p>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
                <div>
                  <h3 className="form-card-title">{selected.nom}</h3>
                  <p style={{ color: "var(--text-dim)", fontSize: "13px" }}>{selected.telephone || "-"} - {selected.adresse || "-"}</p>
                </div>
                <button className="btn-sm btn-primary" onClick={openFactModal}>+ Nouvelle facture</button>
              </div>
              <div className="receipt-total" style={{ marginBottom: "18px" }}><span>Solde du</span><strong>{fmt(selected.solde)} HTG</strong></div>

              {factures.map((fa) => (
                <div key={fa.id} style={{ padding: "12px", borderRadius: "10px", border: "1px solid var(--line)", marginBottom: "10px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <strong>{fa.numero}</strong>
                      <span className={STATUT_BADGE[fa.statut] ? STATUT_BADGE[fa.statut].c : "badge-gray"} style={{ marginLeft: "8px" }}>{STATUT_BADGE[fa.statut] ? STATUT_BADGE[fa.statut].t : fa.statut}</span>
                    </div>
                    {(fa.statut === "impayee" || fa.statut === "partiellement_payee") && canPay && (
                      <button className="btn-sm btn-green" onClick={() => openPayModal(fa)}>Payer</button>
                    )}
                  </div>
                  <div style={{ fontSize: "13px", color: "var(--text-dim)", marginTop: "6px" }}>{fa.date_facture} - {fa.description || "-"}</div>
                  <div style={{ display: "flex", gap: "16px", marginTop: "8px", fontSize: "13px" }}>
                    <span>Total: <strong>{fmt(fa.montant_total)} HTG</strong></span>
                    <span>Paye: <strong>{fmt(fa.montant_paye)} HTG</strong></span>
                    <span>Solde: <strong>{fmt(fa.solde)} HTG</strong></span>
                  </div>
                </div>
              ))}
              {factures.length === 0 && <p style={{ color: "var(--text-dim)" }}>Aucune facture pour ce fournisseur.</p>}
            </>
          )}
        </div>
      </div>

      {fModalOpen && (
        <div className="modal-overlay" onClick={() => setFModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "420px" }}>
            <div className="modal-header"><h3>Nouveau fournisseur</h3><button className="modal-close" onClick={() => setFModalOpen(false)}>x</button></div>
            {fError && <div className="login-error" style={{ marginBottom: "14px" }}>{fError}</div>}
            <div className="form-group" style={{ marginBottom: "14px" }}>
              <label>Nom *</label>
              <input value={fForm.nom} onChange={(e) => setFForm({ ...fForm, nom: e.target.value })} autoFocus />
            </div>
            <div className="form-group" style={{ marginBottom: "14px" }}>
              <label>Telephone</label>
              <input value={fForm.telephone} onChange={(e) => setFForm({ ...fForm, telephone: e.target.value })} />
            </div>
            <div className="form-group" style={{ marginBottom: "20px" }}>
              <label>Adresse</label>
              <input value={fForm.adresse} onChange={(e) => setFForm({ ...fForm, adresse: e.target.value })} />
            </div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setFModalOpen(false)}>Annuler</button>
              <button className="btn-primary" onClick={submitFournisseur}>Enregistrer</button>
            </div>
          </div>
        </div>
      )}

      {factModalOpen && (
        <div className="modal-overlay" onClick={() => setFactModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "460px" }}>
            <div className="modal-header"><h3>Nouvelle facture - {selected.nom}</h3><button className="modal-close" onClick={() => setFactModalOpen(false)}>x</button></div>
            {factError && <div className="login-error" style={{ marginBottom: "14px" }}>{factError}</div>}
            <div className="form-group" style={{ marginBottom: "14px" }}>
              <label>Date de facture *</label>
              <input type="date" value={factForm.date_facture} onChange={(e) => setFactForm({ ...factForm, date_facture: e.target.value })} />
            </div>
            <div className="form-group" style={{ marginBottom: "14px" }}>
              <label>Date d'echeance (optionnel)</label>
              <input type="date" value={factForm.date_echeance} onChange={(e) => setFactForm({ ...factForm, date_echeance: e.target.value })} />
            </div>
            <div className="form-group" style={{ marginBottom: "14px" }}>
              <label>Description</label>
              <input value={factForm.description} onChange={(e) => setFactForm({ ...factForm, description: e.target.value })} placeholder="Ex: Fournitures scolaires" />
            </div>
            <div className="form-group" style={{ marginBottom: "20px" }}>
              <label>Montant total (HTG) *</label>
              <input type="number" value={factForm.montant_total} onChange={(e) => setFactForm({ ...factForm, montant_total: e.target.value })} />
            </div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setFactModalOpen(false)}>Annuler</button>
              <button className="btn-primary" onClick={submitFacture}>Creer la facture</button>
            </div>
          </div>
        </div>
      )}

      {payModal && (
        <div className="modal-overlay" onClick={() => setPayModal(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "460px" }}>
            <div className="modal-header"><h3>Paiement - {payModal.numero}</h3><button className="modal-close" onClick={() => setPayModal(null)}>x</button></div>
            {payError && <div className="login-error" style={{ marginBottom: "14px" }}>{payError}</div>}
            <div className="receipt-line"><span>Solde du</span><strong>{fmt(payModal.solde)} HTG</strong></div>
            <div className="form-group" style={{ marginBottom: "14px", marginTop: "14px" }}>
              <label>Montant a payer</label>
              <input type="number" value={payMontant} onChange={(e) => setPayMontant(e.target.value)} placeholder={String(payModal.solde)} />
            </div>
            <div className="form-group" style={{ marginBottom: "14px" }}>
              <label>Numero de cheque</label>
              <input value={payCheque} onChange={(e) => setPayCheque(e.target.value)} placeholder="Ex: 001234" />
            </div>
            <div className="form-group" style={{ marginBottom: "18px" }}>
              <label>Compte bancaire</label>
              <select value={payCompteBancaire} onChange={(e) => setPayCompteBancaire(e.target.value)}>
                <option value="">-- Choisir --</option>
                {comptesBancaires.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
              </select>
            </div>
            <div style={{ background: "var(--bg-soft)", borderRadius: "10px", padding: "12px 14px", marginBottom: "18px" }}>
              <p style={{ fontSize: "12px", color: "var(--text-soft)", marginBottom: "10px", fontWeight: 600 }}>Confirmation Tresorier</p>
              <div className="form-group" style={{ marginBottom: "10px" }}>
                <label>Identifiant</label>
                <input value={payCreds.username} onChange={(e) => setPayCreds({ ...payCreds, username: e.target.value })} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Mot de passe</label>
                <input type="password" value={payCreds.password} onChange={(e) => setPayCreds({ ...payCreds, password: e.target.value })} />
              </div>
            </div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setPayModal(null)}>Annuler</button>
              <button className="btn-primary" onClick={submitPay}>Confirmer le paiement</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}