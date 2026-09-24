import React, { useState, useEffect } from "react";
import { useAuth } from "../AuthContext.jsx";
import { getAuthedClient } from "../supabaseClient.js";

export default function Ecritures() {
  const { token, user } = useAuth();
  const [tab, setTab] = useState("ecritures");
  const [ecritures, setEcritures] = useState([]);
  const [comptes, setComptes] = useState([]);
  const [error, setError] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ date_ecriture: new Date().toISOString().slice(0, 10), description: "" });
  const [lignes, setLignes] = useState([{ compte_uuid: "", debit: "", credit: "" }, { compte_uuid: "", debit: "", credit: "" }]);
  const [saving, setSaving] = useState(false);

  const [glCompteId, setGlCompteId] = useState("");
  const [glData, setGlData] = useState(null);

  const [balanceData, setBalanceData] = useState(null);

  const fmt = (n) => Number(n || 0).toLocaleString();

  const loadEcritures = async () => {
    if (!token) return;
    const supabase = getAuthedClient(token);
    const { data: ecs } = await supabase.from("ecritures_comptables").select("*").order("created_at", { ascending: false }).limit(200);
    const withLignes = [];
    for (const e of (ecs || [])) {
      const { data: ls } = await supabase.from("lignes_ecriture").select("*, comptes_comptables(numero, nom)").eq("ecriture_uuid", e.id);
      withLignes.push({ ...e, lignes: (ls || []).map((l) => ({ ...l, compte_numero: l.comptes_comptables ? l.comptes_comptables.numero : "", compte_nom: l.comptes_comptables ? l.comptes_comptables.nom : "" })) });
    }
    setEcritures(withLignes);
  };
  const loadComptes = async () => {
    if (!token) return;
    const supabase = getAuthedClient(token);
    const { data } = await supabase.from("comptes_comptables").select("*").order("numero");
    setComptes(data || []);
  };
  useEffect(() => { loadEcritures(); loadComptes(); }, [token]);

  const comptesActifs = comptes.filter((c) => c.compte_parent_uuid && c.statut === "actif");

  const openNew = () => {
    setForm({ date_ecriture: new Date().toISOString().slice(0, 10), description: "" });
    setLignes([{ compte_uuid: "", debit: "", credit: "" }, { compte_uuid: "", debit: "", credit: "" }]);
    setError(""); setModalOpen(true);
  };

  const updateLigne = (i, field, value) => {
    const copy = [...lignes];
    copy[i] = { ...copy[i], [field]: value };
    setLignes(copy);
  };
  const addLigne = () => setLignes([...lignes, { compte_uuid: "", debit: "", credit: "" }]);
  const removeLigne = (i) => setLignes(lignes.filter((_, idx) => idx !== i));

  const totalDebit = lignes.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const totalCredit = lignes.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const equilibre = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;

  const submit = async () => {
    setError("");
    if (!form.date_ecriture) { setError("Date requise"); return; }
    if (lignes.some((l) => !l.compte_uuid)) { setError("Choisissez un compte sur chaque ligne"); return; }
    if (!equilibre) { setError("L'ecriture doit etre equilibree (debit = credit) et non nulle"); return; }
    setSaving(true);
    try {
      const supabase = getAuthedClient(token);
      const { data: ecriture, error: e1 } = await supabase.from("ecritures_comptables").insert({
        date_ecriture: form.date_ecriture, description: form.description || null, origine_type: "manuel",
        user_uuid: user.id, nom_utilisateur: user.nom_complet || user.username, modified_by: user.username
      }).select().single();
      if (e1) { setError(e1.message); setSaving(false); return; }
      const lignesInsert = lignes.map((l) => ({ ecriture_uuid: ecriture.id, compte_uuid: l.compte_uuid, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0, modified_by: user.username }));
      const { error: e2 } = await supabase.from("lignes_ecriture").insert(lignesInsert);
      if (e2) { setError(e2.message); setSaving(false); return; }
      setModalOpen(false);
      loadEcritures();
    } catch (e) { setError(e.message || "Erreur"); }
    setSaving(false);
  };

  const loadGrandLivre = async (compteId) => {
    setGlCompteId(compteId);
    if (!compteId) { setGlData(null); return; }
    const supabase = getAuthedClient(token);
    const { data: compte } = await supabase.from("comptes_comptables").select("*").eq("id", compteId).single();
    const { data: ls } = await supabase.from("lignes_ecriture").select("*, ecritures_comptables(reference, date_ecriture, description, origine_type)").eq("compte_uuid", compteId);
    const sorted = (ls || []).slice().sort((a, b) => {
      const da = (a.ecritures_comptables && a.ecritures_comptables.date_ecriture) || "";
      const db = (b.ecritures_comptables && b.ecritures_comptables.date_ecriture) || "";
      return da < db ? -1 : (da > db ? 1 : (a.id < b.id ? -1 : 1));
    });
    const soldeDebiteur = ["actif", "charges"].includes(compte.type);
    let running = 0;
    const mouvements = sorted.map((l) => {
      running += soldeDebiteur ? (Number(l.debit) - Number(l.credit)) : (Number(l.credit) - Number(l.debit));
      return {
        ...l,
        reference: l.ecritures_comptables ? l.ecritures_comptables.reference : "",
        date_ecriture: l.ecritures_comptables ? l.ecritures_comptables.date_ecriture : "",
        ecriture_description: l.ecritures_comptables ? l.ecritures_comptables.description : "",
        origine_type: l.ecritures_comptables ? l.ecritures_comptables.origine_type : "",
        solde_courant: running
      };
    });
    setGlData({ compte, mouvements, solde: running });
  };

  const loadBalance = async () => {
    const supabase = getAuthedClient(token);
    const { data: comptesLeaf } = await supabase.from("comptes_comptables").select("*").not("compte_parent_uuid", "is", null).order("numero");
    const { data: allLignes } = await supabase.from("lignes_ecriture").select("compte_uuid, debit, credit");
    let totalDebiteur = 0, totalCrediteur = 0;
    const rows = (comptesLeaf || []).map((c) => {
      const mesLignes = (allLignes || []).filter((l) => l.compte_uuid === c.id);
      const d = mesLignes.reduce((s, l) => s + Number(l.debit), 0);
      const cr = mesLignes.reduce((s, l) => s + Number(l.credit), 0);
      const soldeDebiteur = ["actif", "charges"].includes(c.type);
      const solde = soldeDebiteur ? (d - cr) : (cr - d);
      let colDebit = 0, colCredit = 0;
      if (solde >= 0) { if (soldeDebiteur) colDebit = solde; else colCredit = solde; }
      else { if (soldeDebiteur) colCredit = -solde; else colDebit = -solde; }
      totalDebiteur += colDebit; totalCrediteur += colCredit;
      return { ...c, total_debit: d, total_credit: cr, solde_debit: colDebit, solde_credit: colCredit };
    });
    setBalanceData({ comptes: rows, total_debit: totalDebiteur, total_credit: totalCrediteur, equilibre: Math.abs(totalDebiteur - totalCrediteur) < 0.01 });
  };

  return (
    <div className="page">
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 className="page-title">Comptabilite</h1>
          <p className="page-subtitle">Ecritures comptables et grand livre</p>
        </div>
        {tab === "ecritures" && <button className="btn-primary" onClick={openNew}>+ Nouvelle ecriture</button>}
      </div>

      <div className="store-tabs">
        <button className={"store-tab" + (tab === "ecritures" ? " active" : "")} onClick={() => setTab("ecritures")}>Ecritures</button>
        <button className={"store-tab" + (tab === "grand_livre" ? " active" : "")} onClick={() => setTab("grand_livre")}>Grand Livre</button>
        <button className={"store-tab" + (tab === "balance" ? " active" : "")} onClick={() => { setTab("balance"); loadBalance(); }}>Balance</button>
      </div>

      {error && !modalOpen && <div className="login-error" style={{ margin: "16px 0" }}>{error}</div>}

      {tab === "ecritures" && (
        <div className="table-card">
          <table className="data-table">
            <thead><tr><th>Reference</th><th>Date</th><th>Description</th><th>Origine</th><th>Lignes</th></tr></thead>
            <tbody>
              {ecritures.length === 0 && <tr><td colSpan="5" className="table-empty">Aucune ecriture.</td></tr>}
              {ecritures.map((e) => (
                <tr key={e.id}>
                  <td>{e.reference || "-"}</td>
                  <td>{e.date_ecriture}</td>
                  <td>{e.description || "-"}</td>
                  <td>{e.origine_type}</td>
                  <td>
                    {e.lignes.map((l) => (
                      <div key={l.id} style={{ fontSize: "12px" }}>
                        {l.compte_numero} {l.compte_nom} - {l.debit > 0 ? "Debit " + fmt(l.debit) : "Credit " + fmt(l.credit)}
                      </div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "grand_livre" && (
        <div>
          <div className="form-group" style={{ maxWidth: "400px", marginBottom: "16px" }}>
            <label>Compte</label>
            <select value={glCompteId} onChange={(e) => loadGrandLivre(e.target.value)}>
              <option value="">-- Choisir un compte --</option>
              {comptesActifs.map((c) => <option key={c.id} value={c.id}>{c.numero} - {c.nom}</option>)}
            </select>
          </div>
          {glData && (
            <>
              <div className="kpi-card" style={{ marginBottom: "16px", maxWidth: "300px" }}>
                <div className="kpi-label">Solde actuel</div>
                <div className="kpi-value" style={{ color: "var(--navy)" }}>{fmt(glData.solde)} HTG</div>
              </div>
              <div className="table-card">
                <table className="data-table">
                  <thead><tr><th>Date</th><th>Reference</th><th>Description</th><th>Debit</th><th>Credit</th><th>Solde</th></tr></thead>
                  <tbody>
                    {glData.mouvements.length === 0 && <tr><td colSpan="6" className="table-empty">Aucun mouvement.</td></tr>}
                    {glData.mouvements.map((m) => (
                      <tr key={m.id}>
                        <td>{m.date_ecriture}</td>
                        <td>{m.reference || "-"}</td>
                        <td>{m.description || m.ecriture_description || "-"}</td>
                        <td>{m.debit > 0 ? fmt(m.debit) : "-"}</td>
                        <td>{m.credit > 0 ? fmt(m.credit) : "-"}</td>
                        <td><strong>{fmt(m.solde_courant)}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {tab === "balance" && balanceData && (
        <div>
          <div className="table-card">
            <table className="data-table">
              <thead><tr><th>Numero</th><th>Compte</th><th>Debit</th><th>Credit</th></tr></thead>
              <tbody>
                {balanceData.comptes.map((c) => (
                  <tr key={c.id}>
                    <td>{c.numero}</td>
                    <td>{c.nom}</td>
                    <td>{c.solde_debit > 0 ? fmt(c.solde_debit) : "-"}</td>
                    <td>{c.solde_credit > 0 ? fmt(c.solde_credit) : "-"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan="2"><strong>Total</strong></td>
                  <td><strong>{fmt(balanceData.total_debit)}</strong></td>
                  <td><strong>{fmt(balanceData.total_credit)}</strong></td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div style={{ marginTop: "12px", padding: "10px 14px", background: balanceData.equilibre ? "#dcfce7" : "#fef2f2", borderRadius: "8px", color: balanceData.equilibre ? "var(--ok)" : "var(--err)", fontWeight: 700, display: "inline-block" }}>
            {balanceData.equilibre ? "Balance equilibree" : "Balance non equilibree"}
          </div>
        </div>
      )}

      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "620px" }}>
            <div className="modal-header"><h3>Nouvelle ecriture comptable</h3><button className="modal-close" onClick={() => setModalOpen(false)}>x</button></div>
            {error && <div className="login-error" style={{ marginBottom: "14px" }}>{error}</div>}
            <div className="form-row">
              <div className="form-group"><label>Date *</label><input type="date" value={form.date_ecriture} onChange={(e) => setForm({ ...form, date_ecriture: e.target.value })} /></div>
              <div className="form-group"><label>Description</label><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            </div>

            <div style={{ marginTop: "10px", marginBottom: "10px" }}>
              {lignes.map((l, i) => (
                <div key={i} style={{ display: "flex", gap: "8px", marginBottom: "8px", alignItems: "center" }}>
                  <select style={{ flex: 2 }} value={l.compte_uuid} onChange={(e) => updateLigne(i, "compte_uuid", e.target.value)}>
                    <option value="">-- Compte --</option>
                    {comptesActifs.map((c) => <option key={c.id} value={c.id}>{c.numero} - {c.nom}</option>)}
                  </select>
                  <input style={{ flex: 1 }} type="number" placeholder="Debit" value={l.debit} onChange={(e) => updateLigne(i, "debit", e.target.value)} />
                  <input style={{ flex: 1 }} type="number" placeholder="Credit" value={l.credit} onChange={(e) => updateLigne(i, "credit", e.target.value)} />
                  {lignes.length > 2 && <button className="btn-sm btn-gray-cancel" onClick={() => removeLigne(i)}>x</button>}
                </div>
              ))}
              <button className="btn-sm btn-gray-cancel" onClick={addLigne}>+ Ajouter une ligne</button>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", background: equilibre ? "#dcfce7" : "#fef2f2", borderRadius: "8px", marginBottom: "16px" }}>
              <span>Total Debit: <strong>{fmt(totalDebit)}</strong></span>
              <span>Total Credit: <strong>{fmt(totalCredit)}</strong></span>
              <span style={{ color: equilibre ? "var(--ok)" : "var(--err)" }}>{equilibre ? "Equilibre" : "Non equilibre"}</span>
            </div>

            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setModalOpen(false)}>Annuler</button>
              <button className="btn-primary" onClick={submit} disabled={saving || !equilibre}>{saving ? "Enregistrement..." : "Enregistrer"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}