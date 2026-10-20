import React, { useState, useEffect } from "react";
import { useAuth } from "../AuthContext.jsx";
import { getAuthedClient, EDGE_FUNCTION_URL, SUPABASE_ANON_KEY } from "../supabaseClient.js";

const par = (liste, n) => { const r = []; for (let i = 0; i < liste.length; i += n) r.push(liste.slice(i, i + n)); return r; };

// Fenetre "Retirer un ou plusieurs eleves de leur classe" (meme regle que partout : un autre administrateur confirme avec ses identifiants).
// Utilisee par Assignations (un eleve, ou plusieurs coches) et par la vue d'une salle (Classes & Sections).
//   cible  : un eleve { assignment_id?, student_id, nom_complet, matricule, class_id?, classe_nom, room_id?, salle_nom }
//   cibles : plusieurs eleves (chacun avec assignment_id)
//   anneeId, anneeNom : annee en cours
//   onDone(cibleOuListe, { dejaRetire, retires, attendus })
export default function RetraitAssignation({ cible, cibles, anneeId, anneeNom, onClose, onDone }) {
  const { token, user } = useAuth();
  const liste = cibles && cibles.length ? cibles : [cible];
  const multi = liste.length > 1;
  const [creds, setCreds] = useState({ username: "", password: "" });
  const [erreur, setErreur] = useState("");
  const [occupe, setOccupe] = useState(false);
  const [nbFactures, setNbFactures] = useState(null);

  useEffect(() => {
    let vivant = true;
    (async () => {
      try {
        const supabase = getAuthedClient(token);
        let total = 0;
        for (const lot of par(liste.map((c) => c.student_id), 50)) {
          const { count } = await supabase.from("client_factures").select("id", { count: "exact", head: true }).in("student_uuid", lot).eq("academic_year_uuid", anneeId);
          total += count || 0;
        }
        if (vivant) setNbFactures(total);
      } catch (e) { /* information seulement */ }
    })();
    return () => { vivant = false; };
  }, [liste.map((c) => c.student_id).join(","), anneeId]);

  const verifier = async (username, password) => {
    try {
      const r = await fetch(EDGE_FUNCTION_URL, {
        method: "POST",
        headers: { "apikey": SUPABASE_ANON_KEY, "Authorization": "Bearer " + SUPABASE_ANON_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      const d = await r.json();
      if (!r.ok) return { ok: false, error: d.error || "Mot de passe incorrect" };
      return { ok: true };
    } catch (e) { return { ok: false, error: "Connexion impossible. Réessayez." }; }
  };

  const confirmer = async () => {
    if (occupe) return;
    setErreur("");
    if (!creds.username || !creds.password) { setErreur("Identifiant et mot de passe requis"); return; }
    if (creds.username === user.username) { setErreur("Le vérificateur doit être une personne différente"); return; }
    setOccupe(true);
    let retires = 0;
    try {
      const check = await verifier(creds.username, creds.password);
      if (!check.ok) { setErreur(check.error); setOccupe(false); return; }
      const supabase = getAuthedClient(token);
      const { data: verifier2 } = await supabase.from("users").select("role_nom").eq("username", creds.username).maybeSingle();
      if (!verifier2 || verifier2.role_nom !== "Administrateur") { setErreur("Seul un administrateur peut autoriser cette action"); setOccupe(false); return; }
      const maintenant = new Date().toISOString();
      const valeurs = { deleted_at: maintenant, last_modified_at: maintenant, modified_by: user.username };
      if (liste.every((c) => c.assignment_id)) {
        for (const lot of par(liste.map((c) => c.assignment_id), 50)) {
          const { data: faits, error: e } = await supabase.from("assignments").update(valeurs).in("id", lot).is("deleted_at", null).select("id");
          if (e) throw e;
          retires += (faits || []).length;
        }
      } else {
        const c = liste[0];
        let q = supabase.from("assignments").update(valeurs).is("deleted_at", null).eq("student_uuid", c.student_id).eq("academic_year_uuid", anneeId);
        if (c.class_id) q = q.eq("class_uuid", c.class_id);
        q = c.room_id ? q.eq("room_uuid", c.room_id) : q.is("room_uuid", null);
        const { data: faits, error: e } = await q.select("id");
        if (e) throw e;
        retires = (faits || []).length;
      }
      // 0 ligne : l'assignation avait deja ete retiree (autre poste) ; la liste est simplement rechargee
      onDone && onDone(multi ? liste : liste[0], { dejaRetire: retires === 0, retires, attendus: liste.length });
    } catch (e) {
      setErreur(((e && e.message) || "Erreur") + (retires ? " (" + retires + " retrait(s) déjà effectué(s) avant l'erreur ; rechargez la page.)" : ""));
      setOccupe(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={occupe ? undefined : onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "440px" }}>
        <div className="modal-header">
          <h3 style={{ color: "var(--err)" }}>Autorisation requise</h3>
          <button className="modal-close" onClick={onClose} disabled={occupe}>x</button>
        </div>
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "10px", padding: "14px", marginBottom: "14px" }}>
          {multi ? (
            <>
              <p style={{ fontSize: "13px", color: "#991b1b", margin: 0 }}><strong>Action sensible :</strong> retirer <strong>{liste.length} élèves</strong> de leur classe ({anneeNom})</p>
              <p style={{ fontSize: "12px", color: "#b91c1c", margin: "6px 0 0", maxHeight: "110px", overflowY: "auto" }}>
                {liste.map((c) => c.nom_complet + " (" + (c.classe_nom || "") + ")").join(", ")}
              </p>
            </>
          ) : (
            <>
              <p style={{ fontSize: "13px", color: "#991b1b", margin: 0 }}><strong>Action sensible :</strong> retirer <strong>{liste[0].nom_complet}</strong> de sa classe</p>
              <p style={{ fontSize: "12px", color: "#b91c1c", margin: "6px 0 0" }}>
                {(liste[0].matricule ? liste[0].matricule + " · " : "") + (liste[0].classe_nom || "") + (liste[0].salle_nom ? " · " + liste[0].salle_nom : "") + " · " + (anneeNom || "")}
              </p>
            </>
          )}
          <p style={{ fontSize: "12px", color: "#b91c1c", margin: "6px 0 0" }}>Un administrateur différent doit confirmer cette action avec ses identifiants.</p>
        </div>
        {nbFactures > 0 && (
          <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "10px", padding: "10px 14px", marginBottom: "14px", fontSize: "12px", color: "#92400e" }}>
            {multi ? "Ces élèves ont" : "Cet élève a"} <strong>{nbFactures}</strong> facture(s) pour {anneeNom}. Elles sont <strong>conservées</strong> : si {multi ? "vous les assignez" : "vous l'assignez"} ensuite à une autre classe, vérifiez les frais dans Comptes clients.
          </div>
        )}
        {erreur && <div className="login-error" style={{ marginBottom: "14px" }}>{erreur}</div>}
        <div className="form-group" style={{ marginBottom: "14px" }}>
          <label>Identifiant de l'administrateur</label>
          <input value={creds.username} onChange={(e) => setCreds({ ...creds, username: e.target.value })} autoFocus />
        </div>
        <div className="form-group" style={{ marginBottom: "20px" }}>
          <label>Mot de passe</label>
          <input type="password" value={creds.password} onChange={(e) => setCreds({ ...creds, password: e.target.value })} onKeyDown={(e) => e.key === "Enter" && confirmer()} />
        </div>
        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
          <button className="btn-gray-cancel btn-sm" onClick={onClose} disabled={occupe}>Annuler</button>
          <button className="btn-primary" onClick={confirmer} disabled={occupe}>{occupe ? "Vérification..." : multi ? "Autoriser le retrait (" + liste.length + ")" : "Autoriser le retrait"}</button>
        </div>
      </div>
    </div>
  );
}
