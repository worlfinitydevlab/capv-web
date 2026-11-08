import React, { useState } from "react";

const AUTRE = "__autre__";

// Menu deroulant avec « Autre (ajouter) » : la valeur ajoutee est gardee dans la liste partagee et proposee ensuite a tout le monde.
//   options   : liste de textes ; valeur : texte choisi ; onChange(texte)
//   onAjouter : async (texte) => texte enregistre (ou rejette avec Error) ; sans lui, pas de choix « Autre »
export default function ChoixListe({ label, valeur, options, onChange, onAjouter, requis, disabled, vide, libelleAjout, aide, nomChamp }) {
  const [ajout, setAjout] = useState(false);
  const [texte, setTexte] = useState("");
  const [erreur, setErreur] = useState("");
  const [occupe, setOccupe] = useState(false);

  const annuler = () => { setAjout(false); setTexte(""); setErreur(""); };
  const valider = async () => {
    setErreur("");
    setOccupe(true);
    try {
      const v = await onAjouter(texte);
      onChange(v);
      annuler();
    } catch (e) { setErreur(e && e.message ? e.message : "Ajout impossible"); }
    setOccupe(false);
  };

  return (
    <div className="form-group">
      <label>{label}{requis ? " *" : ""}</label>
      {!ajout && (
        <select value={valeur || ""} disabled={disabled} data-champ={nomChamp || undefined}
          onChange={(e) => { if (e.target.value === AUTRE) { setAjout(true); setErreur(""); } else onChange(e.target.value); }}>
          <option value="">{vide || "Choisir..."}</option>
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
          {onAjouter && <option value={AUTRE}>{"+ " + (libelleAjout || "Autre (ajouter)...")}</option>}
        </select>
      )}
      {ajout && (
        <div style={{ display: "flex", gap: "6px" }}>
          <input autoFocus value={texte} placeholder={"Nouveau : " + String(label || "").toLowerCase()} data-champ={nomChamp ? nomChamp + "-nouveau" : undefined}
            onChange={(e) => setTexte(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); valider(); } else if (e.key === "Escape") { e.stopPropagation(); annuler(); } }} />
          <button type="button" className="btn-primary btn-sm" onClick={valider} disabled={occupe}>{occupe ? "..." : "Ajouter"}</button>
          <button type="button" className="btn-gray-cancel btn-sm" onClick={annuler}>Annuler</button>
        </div>
      )}
      {erreur && <div style={{ color: "var(--err)", fontSize: "12px", marginTop: "4px" }}>{erreur}</div>}
      {aide && !ajout && <div style={{ color: "var(--text-dim)", fontSize: "11.5px", marginTop: "4px" }}>{aide}</div>}
    </div>
  );
}
