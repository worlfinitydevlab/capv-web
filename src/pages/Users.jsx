import React, { useState, useEffect } from "react";
import { useAuth } from "../AuthContext.jsx";
import { getAuthedClient, MANAGE_USERS_URL, EDGE_FUNCTION_URL, SUPABASE_ANON_KEY } from "../supabaseClient.js";
import { CATALOGUE, ACTIONS, CHAMP, COLONNES, MODULE_PAR_CLE, TOUTES_LES_CLES, HERITEES } from "../permissionsCatalog.js";
import { useLiensSujets, CelluleEnseignant, FenetreLienEnseignant } from "../sujets/LienEnseignant.jsx";

const STYLE_CHAMP = { padding: "8px 10px", border: "1px solid var(--line)", borderRadius: "8px", fontSize: "13px", background: "#fff", color: "var(--text)" };
const COULEUR_NOUVEAU = { background: "#dbeafe", color: "#1e40af", fontSize: "10px", fontWeight: 700, padding: "1px 6px", borderRadius: "10px", marginLeft: "6px" };

function ligneVide() { return { voir: 0, creer: 0, modifier: 0, annuler: 0 }; }

// Valeurs affichees pour un role : une ligne par droit du catalogue + les droits inconnus du catalogue (anciens)
function valeursDepuis(saved) {
  const v = {};
  const cles = [...TOUTES_LES_CLES, ...Object.keys(saved).filter((k) => !MODULE_PAR_CLE[k])];
  cles.forEach((k) => {
    const p = saved[k] || {};
    v[k] = { voir: p.peut_voir ? 1 : 0, creer: p.peut_creer ? 1 : 0, modifier: p.peut_modifier ? 1 : 0, annuler: p.peut_annuler ? 1 : 0 };
  });
  return v;
}

// Applique une case en gardant la logique : sans "voir", rien d'autre ; cocher une action coche "voir"
function appliquerCase(valeurs, cle, flag, val) {
  const m = MODULE_PAR_CLE[cle];
  const l = { ...valeurs[cle] };
  l[flag] = val ? 1 : 0;
  if (!val && flag === "voir" && m.a.voir) ACTIONS.forEach((f) => { if (m.a[f]) l[f] = 0; });
  if (val && flag !== "voir" && m.a.voir) l.voir = 1;
  return l;
}

function EcranPermissions(p) {
  const { pm, lecture, filtre, setFiltre, roles, copieDe, setCopieDe, mdp, setMdp, erreur, enCours } = p;
  const f = filtre.trim().toLowerCase();
  const visible = (m) => !f || (m.nom + " " + (m.aide || "") + " " + m.cle).toLowerCase().includes(f);
  const inconnus = Object.keys(pm.valeurs).filter((k) => !MODULE_PAR_CLE[k]);
  return (
    <div className="modal-overlay" onClick={p.onClose}>
      <div className="modal-card modal-large" onClick={(e) => e.stopPropagation()} style={{ maxHeight: "88vh", display: "flex", flexDirection: "column", overflow: "hidden", width: "min(1020px, 96vw)" }}>
        <div className="modal-header"><h3>Permissions - {pm.role.nom}</h3><button className="modal-close" onClick={p.onClose}>x</button></div>
        {pm.isRoleAdmin && <p style={{ fontSize: "13px", color: "var(--text-dim)", marginBottom: "12px" }}>L'Administrateur a tous les droits (non modifiable).</p>}
        {!pm.isRoleAdmin && lecture && <p style={{ fontSize: "13px", color: "var(--text-dim)", marginBottom: "12px" }}>Seul un Administrateur peut modifier les permissions. Tu peux les consulter.</p>}
        {erreur && <div className="login-error" style={{ marginBottom: "14px" }}>{erreur}</div>}
        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", marginBottom: "12px" }}>
          <input type="search" name="recherche-droit" autoComplete="off" aria-label="Chercher un droit" value={filtre} onChange={(e) => setFiltre(e.target.value)} placeholder="Chercher un droit (ex. frais, notes, caisse)..." style={{ ...STYLE_CHAMP, flex: "1 1 240px", maxWidth: "340px" }} />
          {filtre && <button className="btn-sm btn-gray-cancel" onClick={() => setFiltre("")}>Effacer la recherche</button>}
          {!lecture && !pm.isRoleAdmin && (
            <>
              <select value={copieDe} onChange={(e) => setCopieDe(e.target.value)} style={STYLE_CHAMP}>
                <option value="">Copier les droits d'un autre role...</option>
                {roles.filter((r) => r.id !== pm.role.id && r.nom !== "Administrateur").map((r) => <option key={r.id} value={r.id}>{r.nom}</option>)}
              </select>
              <button className="btn-sm btn-gray-cancel" disabled={!copieDe} onClick={p.onCopier}>Copier</button>
            </>
          )}
          <span style={{ fontSize: "12px", color: "var(--text-soft)" }}>Une case grisee n'a pas d'objet pour ce droit.</span>
        </div>
        <div style={{ overflowY: "auto", flex: "1 1 auto", minHeight: 0 }}>
        <table className="data-table">
          <thead><tr><th style={{ width: "34%", position: "sticky", top: 0, zIndex: 1 }}>Droit</th>{ACTIONS.map((a) => <th key={a} style={{ position: "sticky", top: 0, zIndex: 1 }}>{COLONNES[a]}</th>)}</tr></thead>
          <tbody>
            {CATALOGUE.map((s) => {
              const mods = s.modules.filter(visible);
              if (!mods.length) return null;
              return (
                <React.Fragment key={s.id}>
                  <tr>
                    <td style={{ background: "var(--bg-soft)", fontWeight: 700 }}>{s.titre}</td>
                    {ACTIONS.map((a) => (
                      <td key={a} style={{ background: "var(--bg-soft)" }}>
                        {!lecture && !pm.isRoleAdmin && s.modules.some((m) => m.a[a]) && <button className="btn-sm btn-gray-cancel" onClick={() => p.onColonne(s, a)} title={"Cocher ou decocher toute la colonne " + COLONNES[a] + " de cette section"}>tout</button>}
                      </td>
                    ))}
                  </tr>
                  {mods.map((m) => (
                    <tr key={m.cle}>
                      <td>
                        <strong>{m.nom}</strong>{m.nouveau && <span style={COULEUR_NOUVEAU}>NOUVEAU</span>}
                        {!lecture && !pm.isRoleAdmin && <button className="btn-sm btn-gray-cancel" style={{ marginLeft: "8px", padding: "0 6px" }} onClick={() => p.onLigne(m.cle)} title="Tout cocher ou decocher sur cette ligne">tout</button>}
                        {m.aide && <div style={{ fontSize: "11px", color: "var(--text-soft)", marginTop: "2px" }}>{m.aide}</div>}
                      </td>
                      {ACTIONS.map((a) => (
                        <td key={a} style={{ verticalAlign: "top" }}>
                          {m.a[a] ? (
                            <label style={{ display: "flex", gap: "6px", alignItems: "flex-start", fontSize: "12px", cursor: lecture || pm.isRoleAdmin ? "default" : "pointer" }}>
                              <input type="checkbox" checked={pm.isRoleAdmin ? true : !!pm.valeurs[m.cle][a]} disabled={lecture || pm.isRoleAdmin} onChange={() => p.onCase(m.cle, a)} />
                              <span style={{ color: "var(--text-dim)" }}>{m.a[a]}</span>
                            </label>
                          ) : <span style={{ color: "var(--text-soft)" }}>&mdash;</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}
            {f && !CATALOGUE.some((s) => s.modules.some(visible)) && (
              <tr><td colSpan={5} style={{ padding: "18px", color: "var(--text-dim)" }}>{"Aucun droit ne correspond à \"" + filtre + "\". Efface la recherche pour tout revoir."}</td></tr>
            )}
            {inconnus.length > 0 && !f && (
              <React.Fragment>
                <tr><td colSpan={5} style={{ background: "var(--bg-soft)", fontWeight: 700 }}>Autres droits presents en base (sans effet sur ce site)</td></tr>
                {inconnus.map((k) => (
                  <tr key={k}>
                    <td><strong>{k}</strong><div style={{ fontSize: "11px", color: "var(--text-soft)" }}>{HERITEES[k] || "Droit inconnu de ce site (ancien catalogue ou bureau). Conserve tel quel."}</div></td>
                    {ACTIONS.map((a) => <td key={a} style={{ color: "var(--text-soft)", fontSize: "12px" }}>{pm.valeurs[k][a] ? COLONNES[a] : "—"}</td>)}
                  </tr>
                ))}
              </React.Fragment>
            )}
          </tbody>
        </table>
        </div>
        {!lecture && !pm.isRoleAdmin && (
          <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", alignItems: "center", marginTop: "12px", paddingTop: "12px", flexWrap: "wrap", borderTop: "1px solid var(--line)" }}>
            <input type="password" name="confirmation-permissions" value={mdp} onChange={(e) => setMdp(e.target.value)} placeholder="Ton mot de passe pour confirmer" autoComplete="new-password" style={{ ...STYLE_CHAMP, width: "250px" }} onKeyDown={(e) => e.key === "Enter" && p.onSave()} />
            <button className="btn-gray-cancel btn-sm" onClick={p.onClose}>Annuler</button>
            <button className="btn-primary" onClick={p.onSave} disabled={enCours}>{enCours ? "Enregistrement..." : "Enregistrer"}</button>
          </div>
        )}
      </div>
    </div>
  );
}


const EMPTY_FORM = { username: "", prenom: "", nom: "", email: "", telephone: "", role_nom: "", statut: "actif", password: "" };

export default function Users() {
  const { token, user } = useAuth();
  const isAdmin = user && user.role === "Administrateur";
  const liensSujets = useLiensSujets(token, isAdmin);   // Sujets d'examens : enseignant lie a chaque compte (invisible si la fonction serveur n'est pas installee)

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
  const [permFiltre, setPermFiltre] = useState("");
  const [copieDe, setCopieDe] = useState("");
  const [permPwd, setPermPwd] = useState("");

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
      const { data: us, error: e1 } = await supabase.from("users").select("id, username, nom_complet, prenom, nom, email, telephone, role_nom, code_caissier, statut, version, last_modified_at, modified_by, created_at").or('role_nom.is.null,role_nom.neq."Super Admin"').order("username");
      if (e1) throw e1;
      setUsers(us || []);
      const { data: rs, error: e2 } = await supabase.from("roles").select("*").is("deleted_at", null).neq("nom", "Super Admin").order("nom");
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
      const { error: e } = await supabase.from("roles").update({ deleted_at: new Date().toISOString() }).eq("id", id);
      if (e) throw e;
      load();
    } catch (e) {
      setError(e.message || "Erreur (le role est peut-etre encore utilise)");
    }
  };

  const lireDroits = async (roleId) => {
    const supabase = getAuthedClient(token);
    const { data, error: e } = await supabase.from("role_permissions").select("*").eq("role_uuid", roleId);
    if (e) throw e;
    const map = {};
    (data || []).forEach((p) => { map[p.module] = p; });
    return map;
  };

  const openPermissions = async (role) => {
    setPermError(""); setPermFiltre(""); setCopieDe(""); setPermPwd("");
    try {
      const saved = await lireDroits(role.id);
      setPermModal({ role, isRoleAdmin: role.nom === "Administrateur", saved, valeurs: valeursDepuis(saved) });
    } catch (e) {
      setError(e.message || "Erreur de chargement des permissions");
    }
  };

  const majValeurs = (fn) => setPermModal((pm) => (pm ? { ...pm, valeurs: fn(pm.valeurs) } : pm));
  const basculeCase = (cle, flag) => majValeurs((vals) => ({ ...vals, [cle]: appliquerCase(vals, cle, flag, !vals[cle][flag]) }));
  const basculeLigne = (cle) => majValeurs((vals) => {
    const m = MODULE_PAR_CLE[cle];
    const flags = ACTIONS.filter((a) => m.a[a]);
    const tout = flags.every((a) => vals[cle][a]);
    const l = { ...vals[cle] };
    flags.forEach((a) => { l[a] = tout ? 0 : 1; });
    return { ...vals, [cle]: l };
  });
  const basculeColonne = (section, flag) => majValeurs((vals) => {
    const cles = section.modules.filter((m) => m.a[flag]).map((m) => m.cle);
    const tout = cles.every((c) => vals[c][flag]);
    const n = { ...vals };
    cles.forEach((c) => { n[c] = appliquerCase(n, c, flag, !tout); });
    return n;
  });
  const copierDroits = async () => {
    const autre = roles.find((r) => r.id === copieDe);
    if (!autre) return;
    try {
      const s2 = await lireDroits(autre.id);
      majValeurs((vals) => {
        const n = { ...vals };
        TOUTES_LES_CLES.forEach((k) => {
          const m = MODULE_PAR_CLE[k];
          const p = s2[k] || {};
          const l = { ...n[k] };
          ACTIONS.forEach((a) => { if (m.a[a]) l[a] = p[CHAMP[a]] ? 1 : 0; });
          n[k] = l;
        });
        return n;
      });
      setCopieDe("");
    } catch (e) {
      setPermError(e.message || "Erreur");
    }
  };

  const savePermissions = async () => {
    setPermError("");
    if (!isAdmin) { setPermError("Seul un Administrateur peut modifier les permissions."); return; }
    if (!permPwd) { setPermError("Entrez votre mot de passe pour confirmer."); return; }
    setPermSaving(true);
    try {
      const r = await fetch(EDGE_FUNCTION_URL, {
        method: "POST",
        headers: { "apikey": SUPABASE_ANON_KEY, "Authorization": "Bearer " + SUPABASE_ANON_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ username: user.username, password: permPwd })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Mot de passe incorrect");
      const supabase = getAuthedClient(token);
      let n = 0;
      for (const cle of TOUTES_LES_CLES) {
        const m = MODULE_PAR_CLE[cle];
        const v = permModal.valeurs[cle];
        const ancien = permModal.saved[cle];
        const nouveau = {};
        // une case sans objet garde sa valeur d'avant (jamais modifiee ici)
        ACTIONS.forEach((a) => { nouveau[CHAMP[a]] = m.a[a] ? v[a] : (ancien && ancien[CHAMP[a]] ? 1 : 0); });
        const identique = ancien
          ? ACTIONS.every((a) => (ancien[CHAMP[a]] ? 1 : 0) === nouveau[CHAMP[a]])
          : ACTIONS.every((a) => !nouveau[CHAMP[a]]);
        if (identique) continue;
        const { error: e } = await supabase.from("role_permissions").upsert({
          role_uuid: permModal.role.id, module: cle, ...nouveau,
          modified_by: user.username, last_modified_at: new Date().toISOString()
        }, { onConflict: "role_uuid,module" });
        if (e) throw e;
        n++;
      }
      setPermModal(null); setPermPwd("");
      flash("Permissions du role " + permModal.role.nom + " enregistrees (" + n + " droit(s) modifie(s))");
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
          <thead><tr><th>Identifiant</th><th>Nom complet</th><th>Role</th><th>Statut</th>{liensSujets.visible && <th>Enseignant lié</th>}<th>Actions</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td><strong>{u.username}</strong></td>
                <td>{u.nom_complet}</td>
                <td>{u.role_nom}</td>
                <td><span className={"badge " + (u.statut === "actif" ? "badge-ok" : "badge-gray")}>{u.statut === "actif" ? "Actif" : "Inactif"}</span></td>
                {liensSujets.visible && <td><CelluleEnseignant liens={liensSujets} username={u.username} /></td>}
                <td>
                  {isAdmin && (
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button className="btn-sm btn-blue" onClick={() => openEditUser(u)}>Modifier</button>
                      <button className="btn-sm btn-gray-cancel" onClick={() => toggleStatut(u)}>{u.statut === "actif" ? "Desactiver" : "Activer"}</button>
                      <button className="btn-sm btn-red" onClick={() => openResetModal(u)}>Reset mdp</button>
                      {liensSujets.visible && <button className="btn-sm btn-gray-cancel" data-lier-enseignant={u.username} onClick={() => liensSujets.ouvrir(u)}>Enseignant</button>}
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

      {liensSujets.cible && <FenetreLienEnseignant liens={liensSujets} demanderConfirmation={requestConfirm} />}

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
        <EcranPermissions
          pm={permModal} lecture={!isAdmin} roles={roles}
          filtre={permFiltre} setFiltre={setPermFiltre} copieDe={copieDe} setCopieDe={setCopieDe}
          mdp={permPwd} setMdp={setPermPwd} erreur={permError} enCours={permSaving}
          onClose={() => { setPermModal(null); setPermPwd(""); }}
          onCase={basculeCase} onLigne={basculeLigne} onColonne={basculeColonne} onCopier={copierDroits} onSave={savePermissions}
        />
      )}
    </div>
  );
}