import React from "react";
import { debutIdentifiant, etatIdentifiant, typeIdentifiant } from "../identifiantEleve.js";

const boite = (fond, bord, couleur) => ({ background: fond, border: "1px solid " + bord, color: couleur, borderRadius: "10px", padding: "10px 14px", margin: "0 0 14px", fontSize: "13px", lineHeight: 1.5 });
const code = { fontFamily: "Consolas, monospace", fontWeight: 700, letterSpacing: "0.5px" };

// Bloc « Identifiant » en haut de la fiche eleve (creation et modification)
//   e : informations de la fiche (nom, prenom, date_naissance, sexe, departement_naissance + matricule si l'eleve existe deja)
//   creation : true = eleve pas encore enregistre ; historique : anciens identifiants [{ ancien, nouveau, created_at }]
export default function IdentifiantEleve({ e, creation, historique }) {
  const d = debutIdentifiant(e);
  if (creation) {
    return d.complet ? (
      <div style={boite("#ecfdf5", "#a7f3d0", "#065f46")} data-id-bloc="creation-complet">
        <strong>Identifiant :</strong> <span style={code}>{d.debut}</span><span style={{ ...code, opacity: 0.55 }}>•••••</span>
        <div style={{ fontSize: "12px" }}>Le numéro d'ordre (5 chiffres) est attribué à l'enregistrement.</div>
      </div>
    ) : (
      <div style={boite("#f8fafc", "#e2e8f0", "#475569")} data-id-bloc="creation-incomplet">
        <strong>Identifiant provisoire</strong> à l'enregistrement (ancien format).
        <div style={{ fontSize: "12px" }}>Pour l'identifiant normal, complète : {d.manque.join(", ")}. Tu pourras le faire plus tard : l'identifiant passera au format normal quand la fiche sera complète.</div>
      </div>
    );
  }
  const etat = etatIdentifiant(e);
  const couleurs = etat.etat === "normal" ? boite("#ecfdf5", "#a7f3d0", "#065f46") : etat.etat === "decale" ? boite("#fffbeb", "#fde68a", "#92400e") : etat.etat === "pret" ? boite("#eff6ff", "#bfdbfe", "#1e40af") : boite("#f8fafc", "#e2e8f0", "#475569");
  return (
    <div style={couleurs} data-id-bloc={etat.etat}>
      <strong>Identifiant :</strong> <span style={code}>{e.matricule}</span>
      {typeIdentifiant(e.matricule) !== "normal" && <span style={{ marginLeft: "8px", fontSize: "11.5px", opacity: 0.8 }}>(ancien format)</span>}
      <div style={{ fontSize: "12px" }}>
        {etat.etat === "normal" && "Identifiant au format normal."}
        {etat.etat === "decale" && "Les informations de la fiche (nom, date de naissance, sexe ou département) ne correspondent plus à l'identifiant. À l'enregistrement, tu pourras le remplacer par le bon."}
        {etat.etat === "pret" && "La fiche est complète : à l'enregistrement, on te proposera de générer le nouvel identifiant."}
        {etat.etat === "a_completer" && (etat.texte + ". L'identifiant passera au format normal quand la fiche sera complète.")}
      </div>
      {historique && historique.length > 0 && (
        <div style={{ fontSize: "12px", marginTop: "4px" }}>
          Anciens identifiants : {historique.map((h) => h.ancien).filter(Boolean).join(", ") || "-"}
        </div>
      )}
    </div>
  );
}
