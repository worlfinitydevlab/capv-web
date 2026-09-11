import React, { useState, useEffect } from "react";
import { useAuth } from "../AuthContext.jsx";
import { getAuthedClient } from "../supabaseClient.js";

export default function Settings() {
  const { token, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const [nom, setNom] = useState("");
  const [taux, setTaux] = useState("");

  const [holidays, setHolidays] = useState([]);
  const [newHoliday, setNewHoliday] = useState({ date: "", nom: "" });

  const [adminMsgs, setAdminMsgs] = useState([]);
  const [msgModalOpen, setMsgModalOpen] = useState(false);
  const [newMsg, setNewMsg] = useState("");
  const [msgCible, setMsgCible] = useState("tous");
  const [msgCibleIds, setMsgCibleIds] = useState([]);
  const [allRoles, setAllRoles] = useState([]);
  const [allUsers, setAllUsers] = useState([]);

  const [categories, setCategories] = useState([]);
  const [newCat, setNewCat] = useState("");

  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(""), 2500); };

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const supabase = getAuthedClient(token);
      const { data: inst } = await supabase.from("institution_settings").select("*").eq("id", 1).maybeSingle();
      if (inst) { setNom(inst.nom_etablissement || ""); setTaux(inst.taux_usd_htg || ""); }
      const { data: hol } = await supabase.from("holidays").select("*").order("date");
      setHolidays(hol || []);
      const { data: msgs } = await supabase.from("admin_messages").select("*").order("created_at", { ascending: false });
      setAdminMsgs(msgs || []);
      const { data: cats } = await supabase.from("expense_categories").select("*").order("nom");
      setCategories(cats || []);
      const { data: roles } = await supabase.from("roles").select("*").order("nom");
      setAllRoles(roles || []);
      const { data: users } = await supabase.from("users").select("id, nom_complet").order("nom_complet");
      setAllUsers(users || []);
    } catch (e) {
      setError(e.message || "Erreur de chargement");
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [token]);

  const saveInfos = async () => {
    try {
      const supabase = getAuthedClient(token);
      const { error: e } = await supabase.from("institution_settings").update({
        nom_etablissement: nom, taux_usd_htg: Number(taux) || 0, modified_by: user.username
      }).eq("id", 1);
      if (e) throw e;
      flash("Informations enregistrees");
    } catch (e) { setError(e.message || "Erreur"); }
  };

  const addHoliday = async () => {
    if (!newHoliday.date) return;
    try {
      const supabase = getAuthedClient(token);
      const { error: e } = await supabase.from("holidays").insert({ ...newHoliday, modified_by: user.username });
      if (e) throw e;
      setNewHoliday({ date: "", nom: "" });
      load();
    } catch (e) { setError(e.message || "Erreur"); }
  };
  const removeHoliday = async (id) => {
    try {
      const supabase = getAuthedClient(token);
      await supabase.from("holidays").delete().eq("id", id);
      load();
    } catch (e) { setError(e.message || "Erreur"); }
  };

  const addCategory = async () => {
    if (!newCat.trim()) return;
    try {
      const supabase = getAuthedClient(token);
      const { error: e } = await supabase.from("expense_categories").insert({ nom: newCat, modified_by: user.username });
      if (e) throw e;
      setNewCat("");
      load();
    } catch (e) { setError(e.message || "Erreur"); }
  };
  const delCategory = async (id) => {
    try {
      const supabase = getAuthedClient(token);
      await supabase.from("expense_categories").delete().eq("id", id);
      load();
    } catch (e) { setError(e.message || "Erreur"); }
  };

  const openMsgModal = () => { setNewMsg(""); setMsgCible("tous"); setMsgCibleIds([]); setMsgModalOpen(true); };
  const addMessage = async () => {
    if (!newMsg.trim()) return;
    try {
      const supabase = getAuthedClient(token);
      const { error: e } = await supabase.from("admin_messages").insert({
        message: newMsg, cible_type: msgCible, cible_ids: msgCibleIds.length > 0 ? JSON.stringify(msgCibleIds) : null,
        actif: 1, modified_by: user.username
      });
      if (e) throw e;
      setNewMsg(""); setMsgCible("tous"); setMsgCibleIds([]);
      load();
    } catch (e) { setError(e.message || "Erreur"); }
  };
  const toggleMessage = async (m) => {
    try {
      const supabase = getAuthedClient(token);
      await supabase.from("admin_messages").update({ actif: m.actif ? 0 : 1, modified_by: user.username }).eq("id", m.id);
      load();
    } catch (e) { setError(e.message || "Erreur"); }
  };
  const deleteMessage = async (id) => {
    try {
      const supabase = getAuthedClient(token);
      await supabase.from("admin_messages").delete().eq("id", id);
      load();
    } catch (e) { setError(e.message || "Erreur"); }
  };

  const cibleLabel = (m) => {
    if (!m.cible_type || m.cible_type === "tous") return "Tout le monde";
    const ids = m.cible_ids ? JSON.parse(m.cible_ids) : [];
    if (m.cible_type === "role") return ids.map((id) => (allRoles.find((r) => r.id === id) || {}).nom || id).join(", ");
    return ids.map((id) => (allUsers.find((u) => u.id === id) || {}).nom_complet || id).join(", ");
  };

  if (loading) return <div className="page"><p style={{ color: "var(--text-dim)" }}>Chargement...</p></div>;

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Parametres</h1>
      </div>

      {msg && <div className="receipt-banner" style={{ marginBottom: "18px" }}>{msg}</div>}
      {error && <div className="login-error" style={{ marginBottom: "16px" }}>{error}</div>}

      <div className="form-card" style={{ marginBottom: "24px" }}>
        <h3 className="form-card-title">Informations de l'etablissement</h3>
        <div className="form-group" style={{ marginBottom: "16px", maxWidth: "440px" }}>
          <label>Nom de l'etablissement</label>
          <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="College Adventiste de Petion-Ville" />
        </div>
        <div className="form-group" style={{ marginBottom: "16px", maxWidth: "440px" }}>
          <label>Taux de change (1 USD = ? HTG)</label>
          <input type="number" value={taux} onChange={(e) => setTaux(e.target.value)} placeholder="135" />
        </div>
        <button className="btn-primary" onClick={saveInfos}>Enregistrer</button>
        <p style={{ fontSize: "12px", color: "var(--text-dim)", marginTop: "14px" }}>Le logo et le QR code se gerent uniquement depuis le poste local (.exe).</p>
      </div>

      <div className="form-card" style={{ marginBottom: "24px" }}>
        <h3 className="form-card-title">Categories de depenses</h3>
        <p style={{ fontSize: "13px", color: "var(--text-dim)", marginBottom: "16px" }}>Ces categories seront proposees lors de l'enregistrement d'une depense.</p>
        <div style={{ display: "flex", gap: "10px", marginBottom: "18px", maxWidth: "440px" }}>
          <input value={newCat} onChange={(e) => setNewCat(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addCategory()} placeholder="Ex: Salaires, Fournitures, Electricite..."
            style={{ flex: 1, padding: "11px 14px", borderRadius: "10px", border: "1.5px solid var(--line)", background: "var(--bg-soft)", fontSize: "14px" }} />
          <button className="btn-primary" onClick={addCategory}>+ Ajouter</button>
        </div>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          {categories.length === 0 && <span style={{ color: "var(--text-soft)", fontStyle: "italic" }}>Aucune categorie. Ajoutez-en une.</span>}
          {categories.map((c) => (
            <span key={c.id} className="section-chip">{c.nom}<button onClick={() => delCategory(c.id)} className="chip-x">x</button></span>
          ))}
        </div>
      </div>

      <div className="form-card" style={{ marginBottom: "24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h3 className="form-card-title" style={{ marginBottom: "4px" }}>Messages aux utilisateurs</h3>
          <p style={{ fontSize: "13px", color: "var(--text-dim)", margin: 0 }}>{adminMsgs.filter((m) => m.actif).length} message(s) actif(s) sur {adminMsgs.length}</p>
        </div>
        <button className="btn-primary" onClick={openMsgModal}>Gerer les messages</button>
      </div>

      <div className="form-card" style={{ marginBottom: "24px" }}>
        <h3 className="form-card-title">Jours feries / conges</h3>
        <div className="form-row" style={{ marginBottom: "12px" }}>
          <div className="form-group" style={{ flex: "0 0 160px" }}>
            <label>Date</label>
            <input type="date" value={newHoliday.date} onChange={(e) => setNewHoliday({ ...newHoliday, date: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Nom du conge</label>
            <input value={newHoliday.nom} onChange={(e) => setNewHoliday({ ...newHoliday, nom: e.target.value })} placeholder="ex: Fete de l'independance" />
          </div>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button className="btn-primary btn-sm" onClick={addHoliday}>Ajouter</button>
          </div>
        </div>
        <table className="data-table">
          <thead><tr><th>Date</th><th>Nom</th><th></th></tr></thead>
          <tbody>
            {holidays.length === 0 && <tr><td colSpan="3" className="table-empty">Aucun jour ferie enregistre.</td></tr>}
            {holidays.map((h) => (
              <tr key={h.id}><td>{h.date}</td><td>{h.nom}</td><td><button className="btn-sm btn-red" onClick={() => removeHoliday(h.id)}>x</button></td></tr>
            ))}
          </tbody>
        </table>
      </div>

      {msgModalOpen && (
        <div className="modal-overlay" onClick={() => setMsgModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "720px", maxHeight: "90vh", overflowY: "auto" }}>
            <div className="modal-header"><h3>Messages aux utilisateurs</h3><button className="modal-close" onClick={() => setMsgModalOpen(false)}>x</button></div>
            <p style={{ fontSize: "13px", color: "var(--text-dim)", marginBottom: "14px" }}>Ces messages apparaissent de facon animee et aleatoire.</p>

            <div style={{ display: "flex", gap: "10px", marginBottom: "10px", flexWrap: "wrap" }}>
              <input value={newMsg} onChange={(e) => setNewMsg(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addMessage()} placeholder="Ecrivez un message..."
                style={{ flex: 1, minWidth: "250px", padding: "11px 14px", borderRadius: "10px", border: "1.5px solid var(--line)", background: "var(--bg-soft)", fontSize: "14px" }} />
              <button className="btn-primary" onClick={addMessage}>Ajouter</button>
            </div>
            <div style={{ display: "flex", gap: "10px", marginBottom: "16px", alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: "13px", color: "var(--text-dim)" }}>Visible par :</span>
              <select value={msgCible} onChange={(e) => { setMsgCible(e.target.value); setMsgCibleIds([]); }} style={{ padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--line)", fontSize: "13px" }}>
                <option value="tous">Tout le monde</option>
                <option value="role">Un role</option>
                <option value="utilisateur">Un utilisateur</option>
              </select>
              {msgCible === "role" && (
                <select onChange={(e) => { if (e.target.value) setMsgCibleIds([...msgCibleIds, e.target.value]); e.target.value = ""; }} style={{ padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--line)", fontSize: "13px" }}>
                  <option value="">-- Choisir un role --</option>
                  {allRoles.map((r) => <option key={r.id} value={r.id}>{r.nom}</option>)}
                </select>
              )}
              {msgCible === "utilisateur" && (
                <select onChange={(e) => { if (e.target.value) setMsgCibleIds([...msgCibleIds, e.target.value]); e.target.value = ""; }} style={{ padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--line)", fontSize: "13px" }}>
                  <option value="">-- Choisir --</option>
                  {allUsers.map((u) => <option key={u.id} value={u.id}>{u.nom_complet}</option>)}
                </select>
              )}
              {msgCibleIds.length > 0 && (
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  {msgCibleIds.map((id, i) => (
                    <span key={i} className="section-chip">
                      {msgCible === "role" ? ((allRoles.find((r) => r.id === id) || {}).nom || id) : ((allUsers.find((u) => u.id === id) || {}).nom_complet || id)}
                      <button className="chip-x" onClick={() => setMsgCibleIds(msgCibleIds.filter((x) => x !== id))}>x</button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div style={{ borderTop: "1px solid var(--line)", paddingTop: "14px" }}>
              <table className="data-table">
                <thead><tr><th>Message</th><th>Visible par</th><th>Statut</th><th></th></tr></thead>
                <tbody>
                  {adminMsgs.length === 0 && <tr><td colSpan="4" className="table-empty">Aucun message.</td></tr>}
                  {adminMsgs.map((m) => (
                    <tr key={m.id}>
                      <td>{m.message}</td>
                      <td style={{ fontSize: "12px", color: "var(--text-dim)" }}>{cibleLabel(m)}</td>
                      <td>{m.actif ? <span className="badge badge-ok">Actif</span> : <span className="badge badge-gray">Inactif</span>}</td>
                      <td>
                        <div style={{ display: "flex", gap: "6px" }}>
                          <button className="btn-sm btn-blue" onClick={() => toggleMessage(m)}>{m.actif ? "Desactiver" : "Activer"}</button>
                          <button className="btn-sm btn-red" onClick={() => deleteMessage(m.id)}>x</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}