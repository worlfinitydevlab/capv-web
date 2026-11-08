import React, { useState, useEffect, useRef } from "react";
import { PAYS_TEL, AUTRE_PAYS, decouperTelephone, composerTelephone, analyserTelephone, localAffiche } from "../telephone.js";

// Une fois choisi, l'indicatif s'affiche seul (+509) pour tenir dans les colonnes etroites ; le nom du pays est dans la liste et en info-bulle
const nomPays = (code) => { const p = PAYS_TEL.find((x) => x[0] === code); return p ? "+" + p[0] + " " + p[1] : "Autre pays : numéro complet avec +"; };
const STYLE_ERREUR = { border: "1px solid var(--err, #b42318)", background: "#fff5f5" };

// Champ telephone en deux zones : indicatif du pays (+509 Haiti par defaut, a ne pas retaper) + numero normal.
// La valeur enregistree reste un seul texte compact (« +50937123456 ») ; un numero colle avec son indicatif (« +33 6 12 34 56 78 ») est reconnu.
//   value / onChange(texte) : comme un champ ordinaire
export default function ChampTelephone({ label, nom, value, onChange, requis, erreur, disabled }) {
  const lire = (v) => { const d = decouperTelephone(v); return { code: d.code, local: localAffiche(d.code, d.local) }; };   // deux zones, numero local deja groupe (3712 3456)
  const [etat, setEtat] = useState(() => lire(value));
  const dernier = useRef(value || "");

  // Valeur changee de l'exterieur (formulaire vide, fiche ouverte) : on relit les deux zones
  useEffect(() => {
    if ((value || "") !== dernier.current) { dernier.current = value || ""; setEtat(lire(value)); }
  }, [value]);

  const emettre = (code, local) => {
    const v = composerTelephone(code, local);
    dernier.current = v;
    setEtat({ code, local });
    onChange(v);
  };
  const surTexte = (saisie) => {
    const t = String(saisie).replace(/[^\d+\s().-]/g, "");   // seuls les chiffres et la ponctuation d'un numero sont acceptes
    const chiffres = t.replace(/\D/g, "");
    if (etat.code === "509" && chiffres.length === 11 && chiffres.startsWith("509") && !t.includes("+")) { emettre("509", chiffres.slice(3)); return; }   // « 509 3712 3456 » collé en entier
    if (/^\s*(\+|00)/.test(t)) {      // numero colle ou tape avec son indicatif : le pays se choisit tout seul
      const d = decouperTelephone(t);
      emettre(d.code, d.code === AUTRE_PAYS ? t : d.local);
      return;
    }
    emettre(etat.code, t);
  };
  const surSortie = () => {
    const v = composerTelephone(etat.code, etat.local);
    if (v && analyserTelephone(v).ok) { const l = localAffiche(etat.code, etat.local); if (l !== etat.local) setEtat({ code: etat.code, local: l }); }
  };

  const autre = etat.code === AUTRE_PAYS;
  return (
    <div className="form-group">
      <label>{label}{requis ? " *" : ""}</label>
      <div style={{ display: "flex", gap: "6px" }}>
        <select value={etat.code} disabled={disabled} data-champ={nom ? nom + "-indicatif" : undefined} title={nomPays(etat.code)} style={{ flex: "0 0 88px", minWidth: 0, ...(erreur ? STYLE_ERREUR : {}) }}
          onChange={(e) => emettre(e.target.value, e.target.value === AUTRE_PAYS ? "+" + String(etat.local || "").replace(/\D/g, "") : String(etat.local || "").replace(/^\+/, ""))}>
          {PAYS_TEL.map(([code, pays]) => <option key={code} value={code}>{code === etat.code ? "+" + code : "+" + code + " " + pays}</option>)}
          <option value={AUTRE_PAYS}>{autre ? "Autre" : "Autre pays (avec +)"}</option>
        </select>
        <input value={etat.local} disabled={disabled} data-champ={nom} style={{ flex: 1, minWidth: 0, ...(erreur ? STYLE_ERREUR : {}) }}
          inputMode="tel" placeholder={autre ? "+225 01 02 03 04 05" : etat.code === "509" ? "3712 3456" : "Numéro"}
          onChange={(e) => surTexte(e.target.value)} onBlur={surSortie} />
      </div>
    </div>
  );
}
