import React, { useState, useEffect } from "react";
import { useAuth } from "../AuthContext.jsx";
import { getAuthedClient, EDGE_FUNCTION_URL, SUPABASE_ANON_KEY } from "../supabaseClient.js";
import { useAccesPour } from "../accesSpecial/accesSpecialStore.js";
import ConfirmationAccesSpecial from "../accesSpecial/ConfirmationAccesSpecial.jsx";

const par = (liste, n) => { const r = []; for (let i = 0; i < liste.length; i += n) r.push(liste.slice(i, i + n)); return r; };

// Mise a jour commune aux deux fenetres (autorisation d'un autre administrateur / acces special) : marque les assignations comme retirees.
// `progres(n)` est appele apres chaque lot pour que l'appelant sache combien de retraits sont deja faits si une erreur survient.
async function retirerAssignations(supabase, liste, anneeId, username, progres) {
  const maintenant = new Date().toISOString();
  const valeurs = { deleted_at: maintenant, last_modified_at: maintenant, modified_by: username };
  let retires = 0;
  if (liste.every((c) => c.assignment_id)) {
    for (const lot of par(liste.map((c) => c.assignment_id), 50)) {
      const { data: faits, error: e } = await supabase.from("assignments").update(valeurs).in("id", lot).is("deleted_at", null).select("id");
      if (e) throw e;
      retires += (faits || []).length;
      if (progres) progres(retires);
    }
  } else {
    const c = liste[0];
    let q = supabase.from("assignments").update(valeurs).is("deleted_at", null).eq("student_uuid", c.student_id).eq("academic_year_uuid", anneeId);
    if (c.class_id) q = q.eq("class_uuid", c.class_id);
    q = c.room_id ? q.eq("room_uuid", c.room_id) : q.is("room_uuid", null);
    const { data: faits, error: e } = await q.select("id");
    if (e) throw e;
    retires = (faits || []).length;
    if (progres) progres(retires);
  }
  return retires;
}

// Nombre de factures de l'annee pour les eleves concernes (information affichee dans les deux fenetres)
function useNbFactures(liste, anneeId, token) {
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
  return nbFactures;
}

// Fenetre "Retirer un ou plusieurs eleves de leur classe" (meme regle que partout : un autre administrateur confirme avec ses identifiants).
// Utilisee par Assignations (un eleve, ou plusieurs coches) et par la vue d'une salle (Classes & Sections).
//   cible  : un eleve { assignment_id?, student_id, nom_complet, matricule, class_id?, classe_nom, room_id?, salle_nom }
//   cibles : plusieurs eleves (chacun avec assignment_id)
//   anneeId, anneeNom : annee en cours
//   onDone(cibleOuListe, { dejaRetire, retires, attendus })
function RetraitNormal({ cible, cibles, anneeId, anneeNom, onClose, onDone }) {
  const { token, user } = useAuth();
  const liste = cibles && cibles.length ? cibles : [cible];
  const multi = liste.length > 1;
  const [creds, setCreds] = useState({ username: "", password: "" });
  const [erreur, setErreur] = useState("");
  const [occupe, setOccupe] = useState(false);
  const nbFactures = useNbFactures(liste, anneeId, token);

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
      retires = await retirerAssignations(supabase, liste, anneeId, user.username, (n) => { retires = n; });
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

// Fenetre avec acces special : la personne confirme avec son propre mot de passe, le serveur inscrit l'action dans le rapport.
function RetraitAvecAcces({ cible, cibles, anneeId, anneeNom, onClose, onDone }) {
  const { token, user } = useAuth();
  const liste = cibles && cibles.length ? cibles : [cible];
  const multi = liste.length > 1;
  const nbFactures = useNbFactures(liste, anneeId, token);
  const c0 = liste[0];
  const resume = multi
    ? "Retirer " + liste.length + " élèves de leur classe (" + anneeNom + ")"
    : "Retirer " + c0.nom_complet + " de sa classe" + (c0.classe_nom ? " (" + c0.classe_nom + (c0.salle_nom ? ", " + c0.salle_nom : "") + ")" : "");
  const texteCible = multi
    ? liste.length + " élèves : " + liste.slice(0, 6).map((c) => c.nom_complet).join(", ") + (liste.length > 6 ? "..." : "")
    : c0.nom_complet + (c0.matricule ? " (" + c0.matricule + ")" : "") + ", " + (c0.classe_nom || "") + (c0.salle_nom ? ", " + c0.salle_nom : "") + ", " + (anneeNom || "");
  const detail = { annee: anneeNom, nb: liste.length, eleves: liste.slice(0, 40).map((c) => ({ nom: c.nom_complet, matricule: c.matricule || "", classe: c.classe_nom || "", salle: c.salle_nom || "" })) };
  const note = nbFactures > 0 ? (
    <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "10px", padding: "10px 14px", marginBottom: "14px", fontSize: "12px", color: "#92400e" }}>
      {multi ? "Ces élèves ont" : "Cet élève a"} <strong>{nbFactures}</strong> facture(s) pour {anneeNom}. Elles sont <strong>conservées</strong> : si {multi ? "vous les assignez" : "vous l'assignez"} ensuite à une autre classe, vérifiez les frais dans Comptes clients.
    </div>
  ) : null;
  return (
    <ConfirmationAccesSpecial
      tache="retrait_assignation" titre="Retirer de la classe" resume={resume} cible={texteCible} detail={detail} nb={liste.length} note={note}
      onClose={onClose}
      onAutorise={async () => {
        let faits = 0;
        try {
          const supabase = getAuthedClient(token);
          const retires = await retirerAssignations(supabase, liste, anneeId, user.username, (n) => { faits = n; });
          onDone && onDone(multi ? liste : liste[0], { dejaRetire: retires === 0, retires, attendus: liste.length });
          return retires === 0 ? "Déjà retiré (autre poste)" : retires + " retrait(s)";
        } catch (e) {
          throw new Error(((e && e.message) || "Erreur") + (faits ? " (" + faits + " retrait(s) déjà effectué(s) avant l'erreur ; rechargez la page.)" : ""));
        }
      }}
    />
  );
}

// Meme regle que partout : un autre administrateur confirme ; sauf si la personne a un acces special pour cette tache (choisi a l'ouverture de la fenetre).
export default function RetraitAssignation(props) {
  const acces = useAccesPour("retrait_assignation");
  const [avecAcces] = useState(() => !!acces);
  return avecAcces ? <RetraitAvecAcces {...props} /> : <RetraitNormal {...props} />;
}
