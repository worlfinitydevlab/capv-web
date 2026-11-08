import React from "react";
import { debutIdentifiant } from "../identifiantEleve.js";

const boite = (fond, bord, couleur) => ({ background: fond, border: "1px solid " + bord, color: couleur, borderRadius: "10px", padding: "10px 14px", margin: "0 0 14px", fontSize: "13px", lineHeight: 1.5 });
const code = { fontFamily: "Consolas, monospace", fontWeight: 700, letterSpacing: "0.5px" };

// Apercu de l'identifiant d'un candidat : il est attribue a l'ADMISSION (numero d'ordre reserve a ce moment-la)
export default function IdentifiantCandidat({ e }) {
  const d = debutIdentifiant(e);
  return d.complet ? (
    <div style={boite("#ecfdf5", "#a7f3d0", "#065f46")} data-id-bloc="candidat-complet">
      <strong>Identifiant prévu :</strong> <span style={code}>{d.debut}</span><span style={{ ...code, opacity: 0.55 }}>•••••</span>
      <div style={{ fontSize: "12px" }}>Il est attribué à l'admission du candidat (le numéro d'ordre à 5 chiffres est alors réservé).</div>
    </div>
  ) : (
    <div style={boite("#f8fafc", "#e2e8f0", "#475569")} data-id-bloc="candidat-incomplet">
      <strong>Identifiant :</strong> pas encore possible.
      <div style={{ fontSize: "12px" }}>Il faut : {d.manque.join(", ")}.</div>
    </div>
  );
}
