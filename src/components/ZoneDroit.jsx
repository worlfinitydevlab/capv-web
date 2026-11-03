import React from "react";
import { useDroit } from "../PermissionsContext.jsx";

// Zone de page liee a un droit : cachee sans "voir", en lecture seule (champs et boutons grises) sans "modifier".
export default function ZoneDroit({ cle, children }) {
  const d = useDroit(cle);
  if (!d.voir) return null;
  return (
    <fieldset disabled={!d.modifier} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      {!d.modifier && (
        <p style={{ fontSize: "12px", color: "var(--text-soft)", fontStyle: "italic", margin: "0 0 8px" }}>Lecture seule : ton rôle ne peut pas modifier cette partie.</p>
      )}
      {children}
    </fieldset>
  );
}
