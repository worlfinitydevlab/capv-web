import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "../AuthContext.jsx";
import { getAuthedClient } from "../supabaseClient.js";
import { useSettings } from "../SettingsContext.jsx";

export default function Settings() {
  const { token, user } = useAuth();
  const { reloadSettings } = useSettings();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const [nom, setNom] = useState("");
  const [taux, setTaux] = useState("");
  const [adresse, setAdresse] = useState("");
  const [telephone, setTelephone] = useState("");
  const [email, setEmail] = useState("");
  const [logo, setLogo] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [formatRecu, setFormatRecu] = useState("a5");
  const [formatLargeur, setFormatLargeur] = useState("80");
  const [formatHauteur, setFormatHauteur] = useState("150");
  const [delaiRecu, setDelaiRecu] = useState("72");
  const [petiteCaissePlafond, setPetiteCaissePlafond] = useState("");
  const [decaissementSeuil, setDecaissementSeuil] = useState("");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingQr, setUploadingQr] = useState(false);

  const [msgConfig, setMsgConfig] = useState({});

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

  const logoInputRef = useRef(null);
  const qrInputRef = useRef(null);

  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(""), 2500); };

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const supabase = getAuthedClient(token);
      const { data: inst } = await supabase.from("institution_settings").select("*").eq("id", 1).maybeSingle();
      if (inst) {
        setNom(inst.nom_etablissement || "");
        setTaux(inst.taux_usd_htg || "");
        setAdresse(inst.adresse || "");
        setTelephone(inst.telephone || "");
        setEmail(inst.email || "");
        setLogo(inst.logo || "");
        setQrCode(inst.qr_code || "");
        setFormatRecu(inst.format_recu || "a5");
        setFormatLargeur(inst.format_recu_largeur_mm || "80");
        setFormatHauteur(inst.format_recu_hauteur_mm || "150");
        setDelaiRecu(inst.delai_recu_heures || "72");
        setPetiteCaissePlafond(inst.petite_caisse_plafond || "");
        setDecaissementSeuil(inst.decaissement_seuil_cheque || "");
        setMsgConfig(inst.message_engine_config || {});
      }
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
        nom_etablissement: nom, taux_usd_htg: Number(taux) || 0,
        adresse, telephone, email,
        modified_by: user.username
      }).eq("id", 1);
      if (e) throw e;
      flash("Informations enregistrees");
      reloadSettings();
    } catch (e) { setError(e.message || "Erreur"); }
  };

  const saveRecuConfig = async () => {
    try {
      const supabase = getAuthedClient(token);
      const { error: e } = await supabase.from("institution_settings").update({
        format_recu: formatRecu,
        format_recu_largeur_mm: Number(formatLargeur) || 80,
        format_recu_hauteur_mm: Number(formatHauteur) || 150,
        delai_recu_heures: Number(delaiRecu) || 72,
        petite_caisse_plafond: Number(petiteCaissePlafond) || 0,
        decaissement_seuil_cheque: Number(decaissementSeuil) || 0,
        modified_by: user.username
      }).eq("id", 1);
      if (e) throw e;
      flash("Configuration enregistree");
    } catch (e) { setError(e.message || "Erreur"); }
  };

  const uploadImage = async (file, prefix) => {
    const supabase = getAuthedClient(token);
    const ext = file.name.split(".").pop();
    const filePath = prefix + "-" + Date.now() + "." + ext;
    const { error: upErr } = await supabase.storage.from("logos").upload(filePath, file, { upsert: true, cacheControl: "3600" });
    if (upErr) throw upErr;
    const { data: urlData } = supabase.storage.from("logos").getPublicUrl(filePath);
    return urlData.publicUrl;
  };

  const handleLogoChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingLogo(true);
    setError("");
    try {
      const url = await uploadImage(file, "logo");
      const supabase = getAuthedClient(token);
      await supabase.from("institution_settings").update({ logo: url, modified_by: user.username }).eq("id", 1);
      setLogo(url);
      flash("Logo mis a jour");
      reloadSettings();
    } catch (e) { setError(e.message || "Erreur lors de l'envoi du logo"); }
    setUploadingLogo(false);
  };

  const handleQrChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingQr(true);
    setError("");
    try {
      const url = await uploadImage(file, "qrcode");
      const supabase = getAuthedClient(token);
      await supabase.from("institution_settings").update({ qr_code: url, modified_by: user.username }).eq("id", 1);
      setQrCode(url);
      flash("QR code mis a jour");
    } catch (e) { setError(e.message || "Erreur lors de l'envoi du QR code"); }
    setUploadingQr(false);
  };

  const setMsgField = (k, v) => setMsgConfig({ ...msgConfig, [k]: v });
  const saveMsgConfig = async () => {
    try {
      const supabase = getAuthedClient(token);
      const { error: e } = await supabase.from("institution_settings").update({
        message_engine_config: msgConfig, modified_by: user.username
      }).eq("id", 1);
      if (e) throw e;
      flash("Messages enregistres");
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
        <div style={{ display: "flex", gap: "24px", marginBottom: "20px", flexWrap: "wrap" }}>
          <div>
            <label style={{ display: "block", fontSize: "13px", color: "var(--text-dim)", marginBottom: "8px", fontWeight: 600 }}>Logo</label>
            {logo ? <img src={logo} alt="Logo" style={{ width: "84px", height: "84px", borderRadius: "16px", objectFit: "cover", border: "1.5px solid var(--line)" }} />
              : <div style={{ width: "84px", height: "84px", borderRadius: "16px", background: "var(--bg-soft)", border: "1.5px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", color: "var(--text-soft)" }}>Aucun</div>}
            <input ref={logoInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleLogoChange} />
            <button className="btn-sm btn-blue" style={{ marginTop: "8px" }} onClick={() => logoInputRef.current.click()} disabled={uploadingLogo}>{uploadingLogo ? "Envoi..." : "Changer"}</button>
          </div>
          <div>
            <label style={{ display: "block", fontSize: "13px", color: "var(--text-dim)", marginBottom: "8px", fontWeight: 600 }}>QR code</label>
            {qrCode ? <img src={qrCode} alt="QR" style={{ width: "84px", height: "84px", borderRadius: "16px", objectFit: "contain", border: "1.5px solid var(--line)", background: "#fff" }} />
              : <div style={{ width: "84px", height: "84px", borderRadius: "16px", background: "var(--bg-soft)", border: "1.5px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", color: "var(--text-soft)" }}>Aucun</div>}
            <input ref={qrInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleQrChange} />
            <button className="btn-sm btn-blue" style={{ marginTop: "8px" }} onClick={() => qrInputRef.current.click()} disabled={uploadingQr}>{uploadingQr ? "Envoi..." : "Changer"}</button>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group"><label>Nom de l'etablissement</label><input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Collège Adventiste de Pétion-Ville" /></div>
          <div className="form-group"><label>Taux de change (1 USD = ? HTG)</label><input type="number" value={taux} onChange={(e) => setTaux(e.target.value)} placeholder="135" /></div>
        </div>
        <div className="form-row">
          <div className="form-group"><label>Adresse</label><input value={adresse} onChange={(e) => setAdresse(e.target.value)} placeholder="Petion-Ville, Haiti" /></div>
          <div className="form-group"><label>Telephone</label><input value={telephone} onChange={(e) => setTelephone(e.target.value)} /></div>
          <div className="form-group"><label>Email</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        </div>
        <button className="btn-primary" onClick={saveInfos}>Enregistrer</button>
      </div>

      <div className="form-card" style={{ marginBottom: "24px" }}>
        <h3 className="form-card-title">Recus et caisse</h3>
        <div className="form-row">
          <div className="form-group">
            <label>Format des recus</label>
            <select value={formatRecu} onChange={(e) => setFormatRecu(e.target.value)}>
              <option value="a5">A5</option>
              <option value="thermal80">Thermique 80mm</option>
              <option value="a4">A4</option>
              <option value="custom">Personnalise</option>
            </select>
          </div>
          {formatRecu === "custom" && (
            <>
              <div className="form-group"><label>Largeur (mm)</label><input type="number" value={formatLargeur} onChange={(e) => setFormatLargeur(e.target.value)} /></div>
              <div className="form-group"><label>Hauteur (mm)</label><input type="number" value={formatHauteur} onChange={(e) => setFormatHauteur(e.target.value)} /></div>
            </>
          )}
          <div className="form-group"><label>Delai d'annulation d'un recu (heures)</label><input type="number" value={delaiRecu} onChange={(e) => setDelaiRecu(e.target.value)} /></div>
        </div>
        <div className="form-row">
          <div className="form-group"><label>Plafond petite caisse (HTG)</label><input type="number" value={petiteCaissePlafond} onChange={(e) => setPetiteCaissePlafond(e.target.value)} /></div>
          <div className="form-group"><label>Seuil decaissement par cheque (HTG)</label><input type="number" value={decaissementSeuil} onChange={(e) => setDecaissementSeuil(e.target.value)} /></div>
        </div>
        <button className="btn-primary" onClick={saveRecuConfig}>Enregistrer</button>
      </div>

      <div className="form-card" style={{ marginBottom: "24px" }}>
        <h3 className="form-card-title">Messages de rappel automatiques</h3>
        <p style={{ fontSize: "13px", color: "var(--text-dim)", marginBottom: "16px" }}>Ces messages s'affichent automatiquement dans l'application aux moments cles de la journee.</p>

        <div style={{ marginBottom: "18px", paddingBottom: "16px", borderBottom: "1px solid var(--line)" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px", cursor: "pointer" }}>
            <input type="checkbox" checked={msgConfig.msg_welcome_enabled === "1" || msgConfig.msg_welcome_enabled === true} onChange={(e) => setMsgField("msg_welcome_enabled", e.target.checked ? "1" : "0")} />
            <strong style={{ fontSize: "14px" }}>Message de bienvenue</strong>
          </label>
          <input value={msgConfig.msg_welcome_text || ""} onChange={(e) => setMsgField("msg_welcome_text", e.target.value)} placeholder="Bienvenue {prenom} !" style={{ width: "100%", maxWidth: "500px" }} />
        </div>

        <div style={{ marginBottom: "18px", paddingBottom: "16px", borderBottom: "1px solid var(--line)" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px", cursor: "pointer" }}>
            <input type="checkbox" checked={msgConfig.msg_prayer_enabled === "1" || msgConfig.msg_prayer_enabled === true} onChange={(e) => setMsgField("msg_prayer_enabled", e.target.checked ? "1" : "0")} />
            <strong style={{ fontSize: "14px" }}>Rappel de priere</strong>
          </label>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "8px" }}>
            <input type="time" value={msgConfig.msg_prayer_time || "12:00"} onChange={(e) => setMsgField("msg_prayer_time", e.target.value)} style={{ width: "120px" }} />
            <input type="number" value={msgConfig.msg_prayer_lead_min || "10"} onChange={(e) => setMsgField("msg_prayer_lead_min", e.target.value)} placeholder="Minutes avant" style={{ width: "140px" }} />
          </div>
          <input value={msgConfig.msg_prayer_text || ""} onChange={(e) => setMsgField("msg_prayer_text", e.target.value)} placeholder="{prenom}, c'est bientot l'heure de la priere." style={{ width: "100%", maxWidth: "500px" }} />
        </div>

        <div style={{ marginBottom: "18px", paddingBottom: "16px", borderBottom: "1px solid var(--line)" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px", cursor: "pointer" }}>
            <input type="checkbox" checked={msgConfig.msg_closing_enabled === "1" || msgConfig.msg_closing_enabled === true} onChange={(e) => setMsgField("msg_closing_enabled", e.target.checked ? "1" : "0")} />
            <strong style={{ fontSize: "14px" }}>Fin de journee</strong>
          </label>
          <div style={{ marginBottom: "8px" }}>
            <input type="time" value={msgConfig.msg_closing_time || "16:00"} onChange={(e) => setMsgField("msg_closing_time", e.target.value)} style={{ width: "120px" }} />
          </div>
          <input value={msgConfig.msg_closing_text || ""} onChange={(e) => setMsgField("msg_closing_text", e.target.value)} placeholder="{prenom}, la journee touche a sa fin." style={{ width: "100%", maxWidth: "500px" }} />
        </div>

        <div style={{ marginBottom: "18px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px", cursor: "pointer" }}>
            <input type="checkbox" checked={msgConfig.msg_holiday_enabled === "1" || msgConfig.msg_holiday_enabled === true} onChange={(e) => setMsgField("msg_holiday_enabled", e.target.checked ? "1" : "0")} />
            <strong style={{ fontSize: "14px" }}>Rappel de jour ferie</strong>
          </label>
          <input value={msgConfig.msg_holiday_text || ""} onChange={(e) => setMsgField("msg_holiday_text", e.target.value)} placeholder="{prenom}, rappel : demain c'est {nom_conge}." style={{ width: "100%", maxWidth: "500px" }} />
        </div>

        <button className="btn-primary" onClick={saveMsgConfig}>Enregistrer les messages</button>
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