import React, { useState, useEffect } from "react";
import { useAuth } from "../AuthContext.jsx";
import { getAuthedClient, EDGE_FUNCTION_URL, SUPABASE_ANON_KEY } from "../supabaseClient.js";
import StudentProfile from "../components/StudentProfile.jsx";

function genererMatricule(nom, prenom, seq) {
  const normalize = (str) => (str || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z]/g, "").toUpperCase();
  let baseNom = normalize(nom).substring(0, 3);
  while (baseNom.length < 3) baseNom += "X";
  let baseP = normalize(prenom).substring(0, 1) || "X";
  return baseNom + baseP + "-" + String(seq).padStart(4, "0");
}

const CHAMPS_EXTRA = [
  ["Identit\u00e9 compl\u00e9mentaire", [["lieu_naissance","Lieu de naissance"],["nationalite","Nationalit\u00e9"],["numero_ordre","Num\u00e9ro d'ordre"],["numero_identifiant","Num\u00e9ro identifiant"],["nisu","NISU"],["congregation_religieuse","Congr\u00e9gation religieuse"],["rang_famille","Rang dans la famille"]]],
  ["P\u00e8re", [["pere_nom","Nom"],["pere_prenom","Pr\u00e9nom"],["pere_statut","Statut"],["pere_occupation","Occupation"],["pere_nif","NIF/NINU"],["pere_telephone","T\u00e9l\u00e9phone"]]],
  ["M\u00e8re", [["mere_nom","Nom"],["mere_prenom","Pr\u00e9nom"],["mere_statut","Statut"],["mere_occupation","Occupation"],["mere_nif","NIF/NINU"],["mere_telephone","T\u00e9l\u00e9phone"]]],
  ["Responsable l\u00e9gal", [["responsable_nom","Nom"],["responsable_prenom","Pr\u00e9nom"],["responsable_occupation","Occupation"],["responsable_nif","NIF/NINU"],["responsable_telephone","T\u00e9l\u00e9phone"]]],
  ["Urgence", [["urgence_telephone","T\u00e9l\u00e9phone d'urgence"],["urgence_lien","Lien de parent\u00e9"]]],
  ["Scolarit\u00e9 ant\u00e9rieure", [["ecole_precedente","\u00c9cole pr\u00e9c\u00e9dente"],["classe_precedente","Classe pr\u00e9c\u00e9dente"]]],
  
  ["Notes", [["remarques","Notes","textarea"]]]
];
const EXTRA_KEYS = CHAMPS_EXTRA.flatMap(([, champs]) => champs.map((c) => c[0]));
const EXTRA_VIDE = Object.fromEntries(EXTRA_KEYS.map((k) => [k, ""]));
const EMPTY_FORM = { nom: "", prenom: "", sexe: "", date_naissance: "", adresse: "", telephone: "", email: "", nom_parent: "", telephone_parent: "", ...EXTRA_VIDE };

export default function Students() {
  const { token, user } = useAuth();
  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const [profileId, setProfileId] = useState(null);
  const [editConfirmOpen, setEditConfirmOpen] = useState(false);
  const [editPassword, setEditPassword] = useState("");
  const [editError, setEditError] = useState("");

  const load = async (q) => {
    setLoading(true);
    setError("");
    try {
      const supabase = getAuthedClient(token);
      let query = supabase.from("students").select("*").is("deleted_at", null).order("nom");
      if (q) {
        query = query.or("nom.ilike.%" + q + "%,prenom.ilike.%" + q + "%,matricule.ilike.%" + q + "%");
      }
      const { data, error: e } = await query;
      if (e) throw e;
      setStudents(data);
    } catch (e) {
      setError(e.message || "Erreur de chargement");
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [token]);
  useEffect(() => {
    const t = setTimeout(() => load(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const setField = (k, v) => setForm({ ...form, [k]: v });

  const openNew = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setSaveError("");
    setModalOpen(true);
  };

  const openEdit = (s) => {
    setEditingId(s.id);
    setForm({
      nom: s.nom || "", prenom: s.prenom || "", sexe: s.sexe || "", date_naissance: s.date_naissance || "",
      adresse: s.adresse || "", telephone: s.telephone || "", email: s.email || "",
      nom_parent: s.nom_parent || "", telephone_parent: s.telephone_parent || "", ...Object.fromEntries(EXTRA_KEYS.map((k) => [k, s[k] || ""]))
    });
    setSaveError("");
    setModalOpen(true);
  };

  const requestSubmit = () => {
    setSaveError("");
    if (!form.nom.trim() || !form.prenom.trim()) { setSaveError("Nom et prénom requis"); return; }
    if (editingId) {
      setEditPassword(""); setEditError(""); setEditConfirmOpen(true);
    } else {
      submitCreate();
    }
  };

  const submitCreate = async () => {
    setSaving(true);
    try {
      const supabase = getAuthedClient(token);
      const { data: seqData, error: seqError } = await supabase.rpc("next_eleve_seq");
      if (seqError) throw seqError;
      const matricule = genererMatricule(form.nom, form.prenom, seqData);

      const { error: insertError } = await supabase.from("students").insert({
        matricule, ...form,
        date_naissance: form.date_naissance || null,
        statut: "actif", modified_by: user ? user.username : null
      });
      if (insertError) throw insertError;

      setModalOpen(false);
      load(search);
    } catch (e) {
      setSaveError(e.message || "Erreur d'enregistrement");
    }
    setSaving(false);
  };

  const [dualTarget, setDualTarget] = useState(null);
  const [dualCreds, setDualCreds] = useState({ username: "", password: "" });
  const [dualError, setDualError] = useState("");
  const [dualBusy, setDualBusy] = useState(false);

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

  const requestDelete = (id) => { setDualTarget(id); setDualCreds({ username: "", password: "" }); setDualError(""); };

  const confirmDelete = async () => {
    setDualError("");
    if (!dualCreds.username || !dualCreds.password) { setDualError("Identifiant et mot de passe requis"); return; }
    if (dualCreds.username === user.username) { setDualError("Le vérificateur doit être une personne différente"); return; }
    setDualBusy(true);
    const check = await verifyCredentials(dualCreds.username, dualCreds.password);
    if (!check.ok) { setDualError(check.error); setDualBusy(false); return; }
    try {
      const supabase = getAuthedClient(token);
      const { data: verifier } = await supabase.from("users").select("role_nom").eq("username", dualCreds.username).maybeSingle();
      if (!verifier || verifier.role_nom !== "Administrateur") { setDualError("Seul un administrateur peut autoriser cette action"); setDualBusy(false); return; }
      const { error: delError } = await supabase.from("students").update({ deleted_at: new Date().toISOString() }).eq("id", dualTarget);
      if (delError) throw delError;
      setDualTarget(null);
      load(search);
    } catch (e) {
      setDualError(e.message || "Erreur de suppression");
    }
    setDualBusy(false);
  };

  const confirmEdit = async () => {
    setEditError("");
    if (!editPassword) { setEditError("Entrez votre mot de passe."); return; }
    setSaving(true);
    try {
      const r = await fetch(EDGE_FUNCTION_URL, {
        method: "POST",
        headers: { "apikey": SUPABASE_ANON_KEY, "Authorization": "Bearer " + SUPABASE_ANON_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ username: user.username, password: editPassword })
      });
      const d = await r.json();
      if (!r.ok) { setEditError(d.error || "Mot de passe incorrect"); setSaving(false); return; }

      const supabase = getAuthedClient(token);
      const { error: updateError } = await supabase.from("students")
        .update({ ...form, date_naissance: form.date_naissance || null, modified_by: user.username })
        .eq("id", editingId);
      if (updateError) throw updateError;

      setEditConfirmOpen(false);
      setModalOpen(false);
      load(search);
    } catch (e) {
      setEditError(e.message || "Erreur d'enregistrement");
    }
    setSaving(false);
  };

  return (
    <div className="page">
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 className="page-title">&Eacute;l&egrave;ves</h1>
          <p className="page-subtitle">{students.length} &eacute;l&egrave;ve(s)</p>
        </div>
        <button className="btn-primary" onClick={openNew}>+ Nouvel &eacute;l&egrave;ve</button>
      </div>

      <div className="add-bar" style={{ maxWidth: "400px" }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher par matricule, nom ou pr&eacute;nom..." />
      </div>

      {loading && <p style={{ color: "var(--text-dim)" }}>Chargement...</p>}
      {error && <div className="login-error">{error}</div>}

      {!loading && (
        <div className="table-card">
          <table className="data-table">
            <thead><tr><th>Matricule</th><th>Nom complet</th><th>Sexe</th><th>Parent</th><th>T&eacute;l&eacute;phone</th><th>Actions</th></tr></thead>
            <tbody>
              {students.length === 0 && <tr><td colSpan="6" className="table-empty">Aucun &eacute;l&egrave;ve.</td></tr>}
              {students.map((s) => (
                <tr key={s.id} onClick={() => setProfileId(s.id)} style={{ cursor: "pointer" }}>
                  <td><strong>{s.matricule}</strong></td>
                  <td>{s.prenom} {s.nom}</td>
                  <td>{s.sexe || "-"}</td>
                  <td>{s.nom_parent || "-"}</td>
                  <td>{s.telephone_parent || s.telephone || "-"}</td>
                  <td style={{ display: "flex", gap: "6px" }}><button className="btn-sm btn-blue" onClick={(e) => { e.stopPropagation(); openEdit(s); }}>Modifier</button><button className="btn-sm btn-red" onClick={(e) => { e.stopPropagation(); requestDelete(s.id); }}>Supprimer</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "640px", maxHeight: "85vh", overflowY: "auto" }}>
            <div className="modal-header">
              <h3>{editingId ? "Modifier l'élève" : "Nouvel élève"}</h3>
              <button className="modal-close" onClick={() => setModalOpen(false)}>x</button>
            </div>
            {saveError && <div className="login-error" style={{ marginBottom: "14px" }}>{saveError}</div>}
            <div className="form-row">
              <div className="form-group"><label>Nom</label><input value={form.nom} onChange={(e) => setField("nom", e.target.value)} /></div>
              <div className="form-group"><label>Pr&eacute;nom</label><input value={form.prenom} onChange={(e) => setField("prenom", e.target.value)} /></div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Sexe</label>
                <select value={form.sexe} onChange={(e) => setField("sexe", e.target.value)}>
                  <option value="">--</option><option value="M">Masculin</option><option value="F">F&eacute;minin</option>
                </select>
              </div>
              <div className="form-group"><label>Date de naissance</label><input type="date" value={form.date_naissance} onChange={(e) => setField("date_naissance", e.target.value)} /></div>
            </div>
            <div className="form-group" style={{ marginBottom: "16px" }}><label>Adresse</label><input value={form.adresse} onChange={(e) => setField("adresse", e.target.value)} /></div>
            <div className="form-row">
              <div className="form-group"><label>T&eacute;l&eacute;phone</label><input value={form.telephone} onChange={(e) => setField("telephone", e.target.value)} /></div>
              <div className="form-group"><label>Email</label><input value={form.email} onChange={(e) => setField("email", e.target.value)} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Nom du parent</label><input value={form.nom_parent} onChange={(e) => setField("nom_parent", e.target.value)} /></div>
              <div className="form-group"><label>T&eacute;l&eacute;phone du parent</label><input value={form.telephone_parent} onChange={(e) => setField("telephone_parent", e.target.value)} /></div>
            </div>
                        {CHAMPS_EXTRA.map(([titre, champs]) => (
              <div key={titre}>
                <h4 style={{ margin: "18px 0 10px", fontSize: "13px", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.5px" }}>{titre}</h4>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  {champs.map(([k, label, kind]) => kind === "textarea" ? (
                    <div className="form-group" key={k} style={{ gridColumn: "1 / -1" }}>
                      <label>{label}</label>
                      <textarea className="modal-textarea" rows="2" value={form[k] || ""} onChange={(e) => setField(k, e.target.value)} />
                    </div>
                  ) : (
                    <div className="form-group" key={k}>
                      <label>{label}</label>
                      <input value={form[k] || ""} onChange={(e) => setField(k, e.target.value)} />
                    </div>
                  ))}
                </div>
              </div>
            ))}            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setModalOpen(false)}>Annuler</button>
              <button className="btn-primary" onClick={requestSubmit} disabled={saving}>{saving ? "Enregistrement..." : (editingId ? "Enregistrer" : "Créer")}</button>
            </div>
          </div>
        </div>
      )}

      {editConfirmOpen && (
        <div className="modal-overlay" onClick={() => setEditConfirmOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "420px" }}>
            <div className="modal-header">
              <h3>Confirmer la modification</h3>
              <button className="modal-close" onClick={() => setEditConfirmOpen(false)}>x</button>
            </div>
            {editError && <div className="login-error" style={{ marginBottom: "14px" }}>{editError}</div>}
            <div className="form-group" style={{ marginBottom: "20px" }}>
              <label>Votre mot de passe</label>
              <input type="password" value={editPassword} onChange={(e) => setEditPassword(e.target.value)} autoFocus onKeyDown={(e) => e.key === "Enter" && confirmEdit()} />
            </div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setEditConfirmOpen(false)}>Annuler</button>
              <button className="btn-primary" onClick={confirmEdit} disabled={saving}>{saving ? "Vérification..." : "Confirmer"}</button>
            </div>
          </div>
        </div>
      )}
      {dualTarget && (
        <div className="modal-overlay" onClick={() => setDualTarget(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "420px" }}>
            <div className="modal-header">
              <h3 style={{ color: "var(--err)" }}>Autorisation requise</h3>
              <button className="modal-close" onClick={() => setDualTarget(null)}>x</button>
            </div>
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "10px", padding: "14px", marginBottom: "18px" }}>
              <p style={{ fontSize: "13px", color: "#991b1b", margin: 0 }}><strong>Action sensible :</strong> Suppression d&apos;un &eacute;l&egrave;ve</p>
              <p style={{ fontSize: "12px", color: "#b91c1c", margin: "6px 0 0" }}>Un administrateur doit confirmer cette action avec ses identifiants.</p>
            </div>
            {dualError && <div className="login-error" style={{ marginBottom: "14px" }}>{dualError}</div>}
            <div className="form-group" style={{ marginBottom: "14px" }}>
              <label>Identifiant de l&apos;administrateur</label>
              <input value={dualCreds.username} onChange={(e) => setDualCreds({ ...dualCreds, username: e.target.value })} autoFocus />
            </div>
            <div className="form-group" style={{ marginBottom: "20px" }}>
              <label>Mot de passe</label>
              <input type="password" value={dualCreds.password} onChange={(e) => setDualCreds({ ...dualCreds, password: e.target.value })} onKeyDown={(e) => e.key === "Enter" && confirmDelete()} />
            </div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setDualTarget(null)}>Annuler</button>
              <button className="btn-primary" onClick={confirmDelete} disabled={dualBusy}>{dualBusy ? "Vérification..." : "Autoriser"}</button>
            </div>
          </div>
        </div>
      )}
      {profileId && <StudentProfile studentId={profileId} onClose={() => setProfileId(null)} />}
    </div>
  );
}