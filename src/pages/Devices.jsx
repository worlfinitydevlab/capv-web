import React, { useState, useEffect } from "react";
import { useAuth } from "../AuthContext.jsx";
import { getAuthedClient, EDGE_FUNCTION_URL, SUPABASE_ANON_KEY } from "../supabaseClient.js";
import { useDevice } from "../DeviceContext.jsx";

const CAPABILITY_LABELS = {
  caisse: "Caisse (encaissement des frais)",
  livraison: "Livraison (sortie de marchandise)"
};

export default function Devices() {
  const { token, user } = useAuth();
  const { deviceId: myDeviceId } = useDevice();
  const [devices, setDevices] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const [manageTarget, setManageTarget] = useState(null);
  const [manageCaps, setManageCaps] = useState([]);
  const [manageLabel, setManageLabel] = useState("");
  const [password, setPassword] = useState("");
  const [manageError, setManageError] = useState("");
  const [saving, setSaving] = useState(false);

  const [delTarget, setDelTarget] = useState(null);
  const [delPassword, setDelPassword] = useState("");
  const [delError, setDelError] = useState("");

  const verifyCredentials = async (username, pwd) => {
    const r = await fetch(EDGE_FUNCTION_URL, {
      method: "POST",
      headers: { "apikey": SUPABASE_ANON_KEY, "Authorization": "Bearer " + SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ username, password: pwd })
    });
    const d = await r.json();
    if (!r.ok) return { ok: false, error: d.error || "Mot de passe incorrect" };
    return { ok: true };
  };

  const loadDevices = async () => {
    setLoading(true);
    const supabase = getAuthedClient(token);
    const { data, error: e } = await supabase.from("device_registrations").select("*").order("last_seen_at", { ascending: false });
    if (e) { setError(e.message); setLoading(false); return; }
    setDevices(data || []);
    setLoading(false);
  };

  useEffect(() => { loadDevices(); }, [token]);

  const fmtDate = (d) => {
    if (!d) return "-";
    const dt = new Date(d);
    return dt.toLocaleDateString("fr-FR") + " " + dt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  };

  const openManage = (dev) => {
    setManageTarget(dev);
    setManageCaps((dev.capabilities || "").split(",").filter(Boolean));
    setManageLabel(dev.label || "");
    setPassword("");
    setManageError("");
  };

  const toggleCap = (cap) => {
    setManageCaps((prev) => prev.includes(cap) ? prev.filter((c) => c !== cap) : [...prev, cap]);
  };

  const submitManage = async () => {
    setManageError("");
    if (!password) { setManageError("Votre mot de passe est requis pour confirmer"); return; }
    setSaving(true);
    const check = await verifyCredentials(user.username, password);
    if (!check.ok) { setManageError(check.error); setSaving(false); return; }
    try {
      const supabase = getAuthedClient(token);
      const { error: e } = await supabase.from("device_registrations").update({
        capabilities: manageCaps.join(","),
        label: manageLabel,
        approved_by: user.username
      }).eq("id", manageTarget.id);
      if (e) throw e;
      await supabase.from("audit_logs").insert({
        username: user.username,
        action: "CAPACITES_APPAREIL_WEB",
        details: "Appareil " + (manageLabel || manageTarget.device_id) + " -> " + (manageCaps.join(",") || "aucune")
      });
      setManageTarget(null);
      loadDevices();
    } catch (e) { setManageError(e.message || "Erreur"); }
    setSaving(false);
  };

  const submitDelete = async () => {
    setDelError("");
    if (!delPassword) { setDelError("Votre mot de passe est requis pour confirmer"); return; }
    const check = await verifyCredentials(user.username, delPassword);
    if (!check.ok) { setDelError(check.error); return; }
    const supabase = getAuthedClient(token);
    await supabase.from("device_registrations").delete().eq("id", delTarget.id);
    setDelTarget(null);
    loadDevices();
  };

  if (!user || user.role !== "Administrateur") {
    return (
      <div className="page">
        <div className="page-header"><h1 className="page-title">Appareils</h1></div>
        <div className="dash-placeholder"><p>Acces reserve aux administrateurs.</p></div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Appareils autorises</h1>
        <p className="page-subtitle">Gerez quels appareils peuvent utiliser la Caisse et la Livraison, independamment des permissions de role.</p>
      </div>

      {error && <div className="login-error" style={{ maxWidth: "500px", marginBottom: "16px" }}>{error}</div>}
      {loading && <p style={{ color: "var(--text-dim)" }}>Chargement...</p>}

      {!loading && (
        <div className="table-card">
          <table className="data-table">
            <thead><tr><th>Appareil</th><th>Dernier utilisateur</th><th>Derniere activite</th><th>Capacites</th><th>Actions</th></tr></thead>
            <tbody>
              {devices.length === 0 && <tr><td colSpan="5" className="table-empty">Aucun appareil enregistre pour le moment.</td></tr>}
              {devices.map((d) => {
                const caps = (d.capabilities || "").split(",").filter(Boolean);
                return (
                  <tr key={d.id}>
                    <td>
                      <strong>{d.label || "Appareil sans nom"}</strong>
                      {d.device_id === myDeviceId && <span className="badge badge-blue" style={{ marginLeft: "8px" }}>Cet appareil</span>}
                    </td>
                    <td>{d.last_username || "-"}</td>
                    <td>{fmtDate(d.last_seen_at)}</td>
                    <td>
                      {caps.length === 0 && <span className="badge badge-gray">Aucune</span>}
                      {caps.map((c) => <span key={c} className="badge badge-ok" style={{ marginRight: "6px" }}>{CAPABILITY_LABELS[c] || c}</span>)}
                    </td>
                    <td>
                      <div className="table-actions">
                        <button className="btn-sm btn-blue" onClick={() => openManage(d)}>Gerer</button>
                        <button className="btn-sm btn-red" onClick={() => { setDelTarget(d); setDelPassword(""); setDelError(""); }}>Supprimer</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {manageTarget && (
        <div className="modal-overlay" onClick={() => setManageTarget(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "460px" }}>
            <div className="modal-header"><h3>Gerer l'appareil</h3><button className="modal-close" onClick={() => setManageTarget(null)}>x</button></div>
            {manageError && <div className="login-error" style={{ marginBottom: "16px" }}>{manageError}</div>}
            <div className="form-group" style={{ marginBottom: "16px" }}>
              <label>Nom de l'appareil</label>
              <input value={manageLabel} onChange={(e) => setManageLabel(e.target.value)} placeholder="ex: PC bureau magasin" />
            </div>
            <div style={{ marginBottom: "18px" }}>
              <p style={{ fontSize: "13px", color: "var(--text-dim)", marginBottom: "10px", fontWeight: 600 }}>Capacites autorisees</p>
              {Object.entries(CAPABILITY_LABELS).map(([key, lbl]) => (
                <label key={key} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 0", cursor: "pointer" }}>
                  <input type="checkbox" checked={manageCaps.includes(key)} onChange={() => toggleCap(key)} />
                  <span style={{ fontSize: "14px" }}>{lbl}</span>
                </label>
              ))}
            </div>
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "10px", padding: "14px", marginBottom: "18px" }}>
              <p style={{ fontSize: "12px", color: "#991b1b", margin: "0 0 10px" }}>Confirmez avec votre mot de passe pour appliquer ces changements.</p>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Votre mot de passe" onKeyDown={(e) => e.key === "Enter" && submitManage()} />
            </div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setManageTarget(null)}>Annuler</button>
              <button className="btn-primary" onClick={submitManage} disabled={saving}>{saving ? "Enregistrement..." : "Enregistrer"}</button>
            </div>
          </div>
        </div>
      )}

      {delTarget && (
        <div className="modal-overlay" onClick={() => setDelTarget(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "420px" }}>
            <div className="modal-header"><h3 style={{ color: "var(--err)" }}>Supprimer l'appareil</h3><button className="modal-close" onClick={() => setDelTarget(null)}>x</button></div>
            {delError && <div className="login-error" style={{ marginBottom: "16px" }}>{delError}</div>}
            <p style={{ fontSize: "13px", color: "var(--text-dim)", marginBottom: "14px" }}>Cet appareil devra se reenregistrer et sera de nouveau sans capacites. Confirmez avec votre mot de passe.</p>
            <input type="password" value={delPassword} onChange={(e) => setDelPassword(e.target.value)} placeholder="Votre mot de passe" style={{ marginBottom: "18px" }} onKeyDown={(e) => e.key === "Enter" && submitDelete()} />
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setDelTarget(null)}>Annuler</button>
              <button className="btn-sm btn-red" onClick={submitDelete}>Supprimer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}