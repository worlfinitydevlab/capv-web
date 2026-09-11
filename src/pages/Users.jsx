import React, { useState, useEffect } from "react";
import { useAuth } from "../AuthContext.jsx";
import { getAuthedClient, MANAGE_USERS_URL, EDGE_FUNCTION_URL, SUPABASE_ANON_KEY } from "../supabaseClient.js";

const APP_MODULES = [
  { key: "dashboard", label: "Tableau de bord" },
  { key: "students", label: "Eleves" },
  { key: "classes", label: "Classes & Sections" },
  { key: "assignments", label: "Assignations" },
  { key: "years", label: "Annees academiques" },
  { key: "cashier", label: "Caisse" },
  { key: "payments", label: "Paiements" },
  { key: "store_sales", label: "Ventes magasin" },
  { key: "debts", label: "Creances" },
  { key: "expenses", label: "Depenses" },
  { key: "inventory", label: "Magasin" },
  { key: "delivery", label: "Livraison" },
  { key: "audit", label: "Journal d'audit" },
  { key: "users", label: "Utilisateurs" },
  { key: "settings", label: "Parametres" }
];

const EMPTY_FORM = { username: "", prenom: "", nom: "", email: "", telephone: "", role_nom: "", statut: "actif", password: "" };

export default function Users() {
  const { token, user } = useAuth();
  const isAdmin = user && user.role === "Administrateur";

  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const [userModal, setUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [newRole, setNewRole] = useState({ nom: "", description: "" });

  const [permModal, setPermModal] = useState(null);
  const [permError, setPermError] = useState("");
  const [permSaving, setPermSaving] = useState(false);

  // Confirmation par mot de passe personnel avant toute action sensible
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmError, setConfirmError] = useState("");
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [pendingAction, setPendingAction] = useState(null); // () => Promise

  // Modal reset mot de passe
  const [resetModal, setResetModal] = useState(null); // user
  const [resetPasswordValue, setResetPasswordValue] = useState("");

  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(""), 6000); };

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const supabase = getAuthedClient(token);
      const { data: us, error: e1 } = await supabase.from("users").select("id, username, nom_complet, prenom, nom, email, telephone, role_nom, code_caissier, statut, version, last_modified_at, modified_by, created_at").order("username");
      if (e1) throw e1;
      setUsers(us || []);
      const { data: rs, error: e2 } = await supabase.from("roles").select("*").order("nom");
      if (e2) throw e2;
      setRoles(rs || []);
    } catch (e) {
      setError(e.message || "Erreur de chargement");
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [token]);

  const setField = (k, v) => setForm({ ...form, [k]: v });

  const openNewUser = () => { setEditingUser(null); setForm(EMPTY_FORM); setError(""); setUserModal(true); };
  const openEditUser = (u) => {
    setEditingUser(u);
    setForm({ username: u.username, prenom: u.prenom || "", nom: u.nom || "", email: u.email || "", telephone: u.telephone || "", role_nom: u.role_nom || "", statut: u.statut, password: "" });
    setError(""); setUserModal(true);
  };

  const callManageUsers = async (adminPassword, payload) => {
    const r = await fetch(MANAGE_USERS_URL, {
      method: "POST",
      headers: { "apikey": SUPABASE_ANON_KEY, "Authorization": "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || "Erreur");
    return d;
  };

  // Demande la confirmation par mot de passe personnel, puis execute l'action si le mot de passe est correct
  const requestConfirm = (actionFn) => {
    setConfirmPassword(""); setConfirmError("");
    setPendingAction(() => actionFn);
    setConfirmOpen(true);
  };

  const submitConfirm = async () => {
    setConfirmError("");
    if (!confirmPassword) { setConfirmError("Entrez votre mot de passe."); return; }
    setConfirmBusy(true);
    try {
      // Verifie le mot de passe de l'admin connecte via la fonction de connexion
      const r = await fetch(EDGE_FUNCTION_URL, {
        method: "POST",
        headers: { "apikey": SUPABASE_ANON_KEY, "Authorization": "Bearer " + SUPABASE_ANON_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ username: user.username, password: confirmPassword })
      });
      const d = await r.json();
      if (!r.ok) { setConfirmError(d.error || "Mot de passe incorrect"); setConfirmBusy(false); return; }

      await pendingAction();
      setConfirmOpen(false);
    } catch (e) {
      setConfirmError(e.message || "Erreur");
    }
    setConfirmBusy(false);
  };

  const requestSubmitUser = () => {
    setError("");
    if (!editingUser && !form.username.trim()) { setError("Identifiant requis"); return; }
    if (!form.role_nom) { setError("Role requis"); return; }
    requestConfirm(async () => {
      setSaving(true);
      try {
        if (editingUser) {
          await callManageUsers(confirmPassword, { action: "edit", user_id: editingUser.id, prenom: form.prenom, nom: form.nom, email: form.email, telephone: form.telephone, role_nom: form.role_nom, statut: form.statut });
        } else {
          const d = await callManageUsers(confirmPassword, { action: "create", username: form.username, prenom: form.prenom, nom: form.nom, email: form.email, telephone: form.telephone, role_nom: form.role_nom, password: form.password });
          flash("Compte cree. Mot de passe : " + d.used_password);
        }
        setUserModal(false);
        load();
      } catch (e) {
        setError(e.message || "Erreur");
      }
      setSaving(false);
    });
  };

  const openResetModal = (u) => { setResetModal(u); setResetPasswordValue(""); };

  const requestResetPassword = () => {
    requestConfirm(async () => {
      try {
        const d = await callManageUsers(confirmPassword, { action: "reset-password", user_id: resetModal.id, password: resetPasswordValue });
        flash("Mot de passe de " + resetModal.username + " reinitialise : " + d.used_password);
        setResetModal(null);
      } catch (e) {
        setError(e.message || "Erreur");
      }
    });
  };

  const toggleStatut = (u) => {
    requestConfirm(async () => {
      try {
        await callManageUsers(confirmPassword, { action: "edit", user_id: u.id, prenom: u.prenom, nom: u.nom, email: u.email, telephone: u.telephone, role_nom: u.role_nom, statut: u.statut === "actif" ? "inactif" : "actif" });
        load();
      } catch (e) {
        setError(e.message || "Erreur");
      }
    });
  };

  const addRole = async () => {
    if (!newRole.nom) return;
    try {
      const supabase = getAuthedClient(token);
      const { error: e } = await supabase.from("roles").insert({ nom: newRole.nom, description: newRole.description || null, modified_by: user.username });
      if (e) throw e;
      setNewRole({ nom: "", description: "" });
      load();
    } catch (e) {
      setError(e.message || "Erreur");
    }
  };

  const delRole = async (id) => {
    if (!confirm("Supprimer ce role ?")) return;
    try {
      const supabase = getAuthedClient(token);
      const { error: e } = await supabase.from("roles").delete().eq("id", id);
      if (e) throw e;
      load();
    } catch (e) {
      setError(e.message || "Erreur (le role est peut-etre encore utilise)");
    }
  };

  const openPermissions = async (role) => {
    setPermError("");
    try {
      const supabase = getAuthedClient(token);
      const isRoleAdmin = role.nom === "Administrateur";
      const { data: saved, error: e } = await supabase.from("role_permissions").select("*").eq("role_uuid", role.id);
      if (e) throw e;
      const map = {};
      (saved || []).forEach((p) => { map[p.module] = p; });
      const permissions = APP_MODULES.map((m) => ({
        module: m.key, label: m.label,
        peut_voir: isRoleAdmin ? 1 : (map[m.key]?.peut_voir || 0),
        peut_creer: isRoleAdmin ? 1 : (map[m.key]?.peut_creer || 0),
        peut_modifier: isRoleAdmin ? 1 : (map[m.key]?.peut_modifier || 0),
        peut_annuler: isRoleAdmin ? 1 : (map[m.key]?.peut_annuler || 0)
      }));
      setPermModal({ role, isAdmin: isRoleAdmin, permissions });
    } catch (e) {
      setError(e.message || "Erreur de chargement des permissions");
    }
  };

  const togglePerm = (moduleKey, action) => {
    setPermModal({
      ...permModal,
      permissions: permModal.permissions.map((p) => p.module === moduleKey ? { ...p, [action]: p[action] ? 0 : 1 } : p)
    });
  };

  const savePermissions = async () => {
    setPermError("");
    setPermSaving(true);
    try {
      const supabase = getAuthedClient(token);
      for (const p of permModal.permissions) {
        const { error: e } = await supabase.from("role_permissions").upsert({
          role_uuid: permModal.role.id, module: p.module,
          peut_voir: p.peut_voir, peut_creer: p.peut_creer, peut_modifier: p.peut_modifier, peut_annuler: p.peut_annuler,
          modified_by: user.username
        }, { onConflict: "role_uuid,module" });
        if (e) throw e;
      }
      setPermModal(null);
      flash("Permissions du role " + permModal.role.nom + " enregistrees");
    } catch (e) {
      setPermError(e.message || "Erreur");
    }
    setPermSaving(false);
  };

  if (loading) return <div className="page"><p style={{ color: "var(--text-dim)" }}>Chargement...</p></div>;

  return (
    <div className="page">
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 className="page-title">Utilisateurs</h1>
          <p className="page-subtitle">{users.length} compte(s)</p>
        </div>
        {isAdmin && <button className="btn-primary" onClick={openNewUser}>+ Nouveau compte</button>}
      </div>

      {msg && <div style={{ background: "#dcfce7", color: "#065f46", padding: "10px 14px", borderRadius: "8px", fontSize: "13px", marginBottom: "14px" }}>{msg}</div>}
      {error && <div className="login-error" style={{ marginBottom: "16px" }}>{error}</div>}
      {!isAdmin && <div className="login-error" style={{ marginBottom: "16px" }}>Seul un compte Administrateur peut gerer les utilisateurs.</div>}

      <div className="table-card" style={{ marginBottom: "26px" }}>
        <table className="data-table">
          <thead><tr><th>Identifiant</th><th>Nom complet</th><th>Role</th><th>Statut</th><th>Actions</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td><strong>{u.username}</strong></td>
                <td>{u.nom_complet}</td>
                <td>{u.role_nom}</td>
                <td><span className={"badge " + (u.statut === "actif" ? "badge-ok" : "badge-gray")}>{u.statut === "actif" ? "Actif" : "Inactif"}</span></td>
                <td>
                  {isAdmin && (
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button className="btn-sm btn-blue" onClick={() => openEditUser(u)}>Modifier</button>
                      <button className="btn-sm btn-gray-cancel" onClick={() => toggleStatut(u)}>{u.statut === "actif" ? "Desactiver" : "Activer"}</button>
                      <button className="btn-sm btn-red" onClick={() => openResetModal(u)}>Reset mdp</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="page-title" style={{ fontSize: "20px", marginBottom: "12px" }}>Roles & Permissions</h2>
      {isAdmin && (
        <div className="form-card" style={{ marginBottom: "18px" }}>
          <div className="form-row">
            <div className="form-group"><label>Nouveau role</label><input value={newRole.nom} onChange={(e) => setNewRole({ ...newRole, nom: e.target.value })} placeholder="Ex: Comptable" /></div>
            <div className="form-group"><label>Description</label><input value={newRole.description} onChange={(e) => setNewRole({ ...newRole, description: e.target.value })} /></div>
          </div>
          <button className="btn-primary btn-sm" onClick={addRole}>+ Ajouter le role</button>
        </div>
      )}

      <div className="table-card">
        <table className="data-table">
          <thead><tr><th>Role</th><th>Description</th><th>Actions</th></tr></thead>
          <tbody>
            {roles.map((r) => (
              <tr key={r.id}>
                <td><strong>{r.nom}</strong></td>
                <td>{r.description || "-"}</td>
                <td>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button className="btn-sm btn-blue" onClick={() => openPermissions(r)}>Permissions</button>
                    {isAdmin && r.nom !== "Administrateur" && <button className="btn-sm btn-red" onClick={() => delRole(r.id)}>Supprimer</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {userModal && (
        <div className="modal-overlay" onClick={() => setUserModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "480px" }}>
            <div className="modal-header"><h3>{editingUser ? "Modifier le compte" : "Nouveau compte"}</h3><button className="modal-close" onClick={() => setUserModal(false)}>x</button></div>
            {error && <div className="login-error" style={{ marginBottom: "14px" }}>{error}</div>}
            {!editingUser && (
              <div className="form-group" style={{ marginBottom: "14px" }}><label>Identifiant</label><input value={form.username} onChange={(e) => setField("username", e.target.value)} /></div>
            )}
            <div className="form-row">
              <div className="form-group"><label>Prenom</label><input value={form.prenom} onChange={(e) => setField("prenom", e.target.value)} /></div>
              <div className="form-group"><label>Nom</label><input value={form.nom} onChange={(e) => setField("nom", e.target.value)} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Email</label><input value={form.email} onChange={(e) => setField("email", e.target.value)} /></div>
              <div className="form-group"><label>Telephone</label><input value={form.telephone} onChange={(e) => setField("telephone", e.target.value)} /></div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Role</label>
                <select value={form.role_nom} onChange={(e) => setField("role_nom", e.target.value)}>
                  <option value="">-- Choisir --</option>
                  {roles.map((r) => <option key={r.id} value={r.nom}>{r.nom}</option>)}
                </select>
              </div>
              {editingUser && (
                <div className="form-group">
                  <label>Statut</label>
                  <select value={form.statut} onChange={(e) => setField("statut", e.target.value)}>
                    <option value="actif">Actif</option><option value="inactif">Inactif</option>
                  </select>
                </div>
              )}
            </div>
            {!editingUser && (
              <div className="form-group" style={{ marginBottom: "8px" }}>
                <label>Mot de passe (optionnel)</label>
                <input type="password" value={form.password} onChange={(e) => setField("password", e.target.value)} placeholder="Laisser vide pour capv123 par defaut" />
              </div>
            )}
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "8px" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setUserModal(false)}>Annuler</button>
              <button className="btn-primary" onClick={requestSubmitUser} disabled={saving}>{saving ? "Enregistrement..." : (editingUser ? "Enregistrer" : "Creer")}</button>
            </div>
          </div>
        </div>
      )}

      {resetModal && (
        <div className="modal-overlay" onClick={() => setResetModal(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "440px" }}>
            <div className="modal-header"><h3>Reinitialiser le mot de passe de {resetModal.username}</h3><button className="modal-close" onClick={() => setResetModal(null)}>x</button></div>
            <div className="form-group" style={{ marginBottom: "20px" }}>
              <label>Nouveau mot de passe (optionnel)</label>
              <input type="password" value={resetPasswordValue} onChange={(e) => setResetPasswordValue(e.target.value)} placeholder="Laisser vide pour capv123 par defaut" />
            </div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setResetModal(null)}>Annuler</button>
              <button className="btn-primary" onClick={requestResetPassword}>Continuer</button>
            </div>
          </div>
        </div>
      )}

      {confirmOpen && (
        <div className="modal-overlay" onClick={() => setConfirmOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "420px" }}>
            <div className="modal-header"><h3>Confirmation requise</h3><button className="modal-close" onClick={() => setConfirmOpen(false)}>x</button></div>
            <p style={{ fontSize: "13px", color: "var(--text-soft)", marginBottom: "14px" }}>Action sensible sur un compte utilisateur. Confirmez avec votre propre mot de passe.</p>
            {confirmError && <div className="login-error" style={{ marginBottom: "14px" }}>{confirmError}</div>}
            <div className="form-group" style={{ marginBottom: "20px" }}>
              <label>Votre mot de passe</label>
              <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoFocus onKeyDown={(e) => e.key === "Enter" && submitConfirm()} />
            </div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setConfirmOpen(false)}>Annuler</button>
              <button className="btn-primary" onClick={submitConfirm} disabled={confirmBusy}>{confirmBusy ? "Verification..." : "Confirmer"}</button>
            </div>
          </div>
        </div>
      )}

      {permModal && (
        <div className="modal-overlay" onClick={() => setPermModal(null)}>
          <div className="modal-card modal-large" onClick={(e) => e.stopPropagation()} style={{ maxHeight: "80vh", overflowY: "auto" }}>
            <div className="modal-header"><h3>Permissions - {permModal.role.nom}</h3><button className="modal-close" onClick={() => setPermModal(null)}>x</button></div>
            {permModal.isAdmin && <p style={{ fontSize: "13px", color: "var(--text-dim)", marginBottom: "14px" }}>L'Administrateur a tous les droits (non modifiable).</p>}
            {permError && <div className="login-error" style={{ marginBottom: "14px" }}>{permError}</div>}
            <table className="data-table">
              <thead><tr><th>Module</th><th>Voir</th><th>Creer</th><th>Modifier</th><th>Annuler</th></tr></thead>
              <tbody>
                {permModal.permissions.map((p) => (
                  <tr key={p.module}>
                    <td>{p.label}</td>
                    {["peut_voir", "peut_creer", "peut_modifier", "peut_annuler"].map((action) => (
                      <td key={action}>
                        <input type="checkbox" checked={!!p[action]} disabled={permModal.isAdmin}
                          onChange={() => togglePerm(p.module, action)} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {!permModal.isAdmin && (
              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "16px" }}>
                <button className="btn-gray-cancel btn-sm" onClick={() => setPermModal(null)}>Annuler</button>
                <button className="btn-primary" onClick={savePermissions} disabled={permSaving}>{permSaving ? "Enregistrement..." : "Enregistrer"}</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}