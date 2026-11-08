import React, { useState } from "react";
import { bas } from "../classeProposee.js";

const AUTRE = "__autre__";

// Classe precedente : menu qui suit l'ordre des classes de l'ecole (Regles academiques).
//   noms : classes dans l'ordre ; valeur : texte ; onChange(texte)
//   « Autre (saisir) » : pour une classe d'une autre ecole qui n'existe pas ici ; une ancienne valeur ecrite a la main reste visible.
export default function ClassePrecedente({ valeur, onChange, noms, requis, label }) {
  const [saisie, setSaisie] = useState(false);
  const v = String(valeur || "");
  const connue = (noms || []).some((n) => bas(n) === bas(v));
  const options = v && !connue ? [...(noms || []), v] : (noms || []);
  return (
    <div className="form-group">
      <label>{(label || "Classe précédente") + (requis ? " *" : "")}</label>
      {!saisie ? (
        <select value={v} data-champ="classe_precedente" onChange={(e) => { if (e.target.value === AUTRE) { setSaisie(true); } else onChange(e.target.value); }}>
          <option value="">Choisir la classe...</option>
          {options.map((n) => <option key={n} value={n}>{n}</option>)}
          <option value={AUTRE}>+ Autre (saisir)...</option>
        </select>
      ) : (
        <div style={{ display: "flex", gap: "6px" }}>
          <input autoFocus value={v} placeholder="Écrire la classe précédente" data-champ="classe_precedente-saisie" onChange={(e) => onChange(e.target.value)} />
          <button type="button" className="btn-gray-cancel btn-sm" onClick={() => setSaisie(false)}>Liste</button>
        </div>
      )}
      {(noms || []).length === 0 && !saisie && <div style={{ color: "var(--text-dim)", fontSize: "11.5px", marginTop: "4px" }}>Aucune classe dans l'ordre des classes : règle-le dans Règles académiques, ou utilise « Autre ».</div>}
    </div>
  );
}
