import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "../AuthContext.jsx";
import { useAccesPour, useChrono, formaterChrono, utiliserAcces, terminerAcces, actionsRestantes } from "./accesSpecialStore.js";
import { courtTache } from "./accesSpecialCatalog.js";

// Remplace la fenetre "Autorisation requise" (un autre administrateur confirme) quand la personne a un acces special pour cette tache :
// elle confirme avec SON PROPRE mot de passe, l'action est faite, et tout est inscrit dans le rapport de l'acces.
//   tache      cle de la tache (accesSpecialCatalog)
//   titre      titre de la fenetre (ex. "Supprimer un élève")
//   resume     phrase qui decrit l'action (ex. "Retirer Jean Pierre de sa classe")
//   cible      texte inscrit dans le rapport (qui / quoi)
//   detail     petit objet inscrit dans le rapport (identifiants, noms...)
//   nb         nombre d'actions consommees (un retrait de 12 eleves = 12)
//   note       element React optionnel (information supplementaire)
//   onAutorise async () => string|void : fait l'action ; LANCE UNE ERREUR si elle echoue ; la chaine retournee est inscrite dans le rapport
//   onClose    ferme la fenetre
export default function ConfirmationAccesSpecial({ tache, titre, resume, cible, detail, nb = 1, note, onAutorise, onClose }) {
  const { user } = useAuth();
  const acces = useAccesPour(tache);
  const restant = useChrono(acces);
  const [mdp, setMdp] = useState("");
  const [erreur, setErreur] = useState("");
  const [occupe, setOccupe] = useState(false);
  const vivant = useRef(true);
  useEffect(() => { vivant.current = true; return () => { vivant.current = false; }; }, []);

  const reste = actionsRestantes(acces);
  const tropGros = reste !== null && nb > reste;

  const confirmer = async () => {
    if (occupe) return;
    setErreur("");
    if (!acces) { setErreur("Ton accès spécial est terminé."); return; }
    if (!mdp) { setErreur("Entre ton mot de passe."); return; }
    if (tropGros) { setErreur("Cet accès permet encore " + reste + " action(s) ; cette opération en demande " + nb + "."); return; }
    setOccupe(true);
    const r = await utiliserAcces({ username: user.username, password: mdp, tache, nb, cible, detail });
    if (!r.ok) { if (vivant.current) { setErreur(r.error); setOccupe(false); } return; }
    const evenementId = r.data.evenement_id;
    let reussi = true, message = null;
    try {
      const sortie = await onAutorise();
      message = typeof sortie === "string" ? sortie : (sortie && sortie.message) || null;
    } catch (e) {
      reussi = false;
      message = (e && e.message) || "Erreur";
    }
    await terminerAcces({ evenementId, username: user.username, ok: reussi, message });
    if (!vivant.current) return;
    if (!reussi) { setErreur(message + " L'action n'a pas été faite ; ton compteur d'actions est intact."); setOccupe(false); return; }
    setOccupe(false);
    if (onClose) onClose();
  };

  const ennuiTemps = acces && restant <= 60 ? "#fecaca" : acces && restant <= 300 ? "#fed7aa" : "#fde68a";

  return (
    <div className="modal-overlay" onClick={occupe ? undefined : onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "min(460px, 94vw)", maxHeight: "92vh", overflowY: "auto" }}>
        <div className="modal-header">
          <h3 style={{ color: "#92400e" }}>Accès spécial{titre ? " : " + titre : ""}</h3>
          <button className="modal-close" onClick={onClose} disabled={occupe}>x</button>
        </div>
        <div style={{ background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: "10px", padding: "14px", marginBottom: "14px" }}>
          <p style={{ fontSize: "13px", color: "#78350f", margin: 0 }}><strong>Action :</strong> {resume}</p>
          {acces ? (
            <>
              <p style={{ fontSize: "12px", color: "#92400e", margin: "8px 0 0" }}>
                Accès {acces.numero} · {courtTache(tache)} · accordé par <strong>{acces.accorde_par_nom || acces.accorde_par}</strong>.
                Ton mot de passe remplace l'autorisation d'un autre administrateur.
              </p>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "10px", alignItems: "center" }}>
                <span style={{ background: ennuiTemps, color: "#7c2d12", borderRadius: "999px", padding: "4px 12px", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
                  Il reste {formaterChrono(restant)}
                </span>
                {acces.utilisations_max != null && (
                  <span style={{ fontSize: "12px", color: "#92400e" }}>Actions : {acces.utilisations} sur {acces.utilisations_max}{nb > 1 ? " (cette opération en compte " + nb + ")" : ""}</span>
                )}
              </div>
            </>
          ) : (
            <p style={{ fontSize: "12px", color: "#b91c1c", margin: "8px 0 0" }}><strong>Ton accès spécial est terminé.</strong> Ferme cette fenêtre : l'autorisation d'un administrateur sera demandée.</p>
          )}
        </div>
        {note}
        {erreur && <div className="login-error" style={{ marginBottom: "14px" }}>{erreur}</div>}
        {tropGros && !erreur && <div className="login-error" style={{ marginBottom: "14px" }}>Cet accès permet encore {reste} action(s) ; cette opération en demande {nb}.</div>}
        <div className="form-group" style={{ marginBottom: "18px" }}>
          <label>Ton mot de passe ({user ? user.username : ""})</label>
          <input type="password" autoComplete="current-password" value={mdp} onChange={(e) => setMdp(e.target.value)} autoFocus disabled={occupe || !acces}
            onKeyDown={(e) => e.key === "Enter" && confirmer()} />
        </div>
        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button className="btn-gray-cancel btn-sm" onClick={onClose} disabled={occupe}>Annuler</button>
          <button className="btn-primary" onClick={confirmer} disabled={occupe || !acces || tropGros}>{occupe ? "En cours..." : "Confirmer et exécuter"}</button>
        </div>
      </div>
    </div>
  );
}
