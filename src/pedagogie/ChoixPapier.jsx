import React, { useState } from "react";
import { PAPIERS, MM_PAR_PO, nombre, decrire, dimensions, enPo, nomConnu } from "./papier.js";

// Choix du format du papier. valeur = { cle, largeur, hauteur } (mm, texte). ecole = { largeur, hauteur, nom } : ajoute l'option « Format de l'école ».
// classe : classe des blocs (« form-group » dans Paramètres, vide dans Documents imprimables).
export default function ChoixPapier({ valeur, onChange, ecole, classe, etiquette }) {
  const [unite, setUnite] = useState("po");
  const [tape, setTape] = useState({ largeur: null, hauteur: null }); // texte en cours de frappe (non converti)
  const cls = classe || "";
  const v = valeur || { cle: ecole ? "ecole" : "letter", largeur: "", hauteur: "" };
  const courant = v.cle === "ecole" && ecole ? { ok: true, largeur: ecole.largeur, hauteur: ecole.hauteur } : dimensions(v.cle, v.largeur, v.hauteur);
  const vers = (mm) => (unite === "po" ? String(Math.round((nombre(mm) / MM_PAR_PO) * 100) / 100) : String(Math.round(nombre(mm) * 10) / 10));
  const affiche = (mm) => (Number.isFinite(nombre(mm)) ? vers(mm) : "");
  const enMm = (txt) => { const x = nombre(txt); return Number.isFinite(x) ? String(Math.round((unite === "po" ? x * MM_PAR_PO : x) * 10) / 10) : String(txt); };
  const saisir = (champ, txt) => { setTape({ ...tape, [champ]: txt }); onChange({ ...v, [champ]: enMm(txt) }); };
  const montrer = (champ) => (tape[champ] !== null ? tape[champ] : affiche(v[champ]));
  const choisir = (cle) => {
    setTape({ largeur: null, hauteur: null });
    if (cle === "custom") {
      // on part des dimensions actuellement choisies
      const base = courant && courant.ok !== false ? courant : { largeur: 215.9, hauteur: 355.6 };
      onChange({ cle, largeur: String(base.largeur), hauteur: String(base.hauteur) });
    } else onChange({ cle, largeur: v.largeur, hauteur: v.hauteur });
  };
  return (
    <>
      <div className={cls}>
        <label>{etiquette || "Format du papier"}</label>
        <select value={v.cle} onChange={(e) => choisir(e.target.value)} aria-label="Format du papier">
          {ecole && <option value="ecole">{"Format de l'école"}</option>}
          {PAPIERS.map((p) => <option key={p.cle} value={p.cle}>{p.nom + " (" + enPo(p.largeur) + " × " + enPo(p.hauteur) + " po)"}</option>)}
          <option value="custom">{"Personnalisé…"}</option>
        </select>
      </div>
      {v.cle === "custom" && (
        <>
          <div className={cls}>
            <label>{"Unité"}</label>
            <select value={unite} onChange={(e) => { setUnite(e.target.value); setTape({ largeur: null, hauteur: null }); }} aria-label="Unité des dimensions">
              <option value="po">{"pouces (po)"}</option>
              <option value="mm">{"millimètres (mm)"}</option>
            </select>
          </div>
          <div className={cls}>
            <label>{"Largeur (" + unite + ")"}</label>
            <input type="text" inputMode="decimal" value={montrer("largeur")} onChange={(e) => saisir("largeur", e.target.value)} aria-label="Largeur de la feuille" />
          </div>
          <div className={cls}>
            <label>{"Hauteur (" + unite + ")"}</label>
            <input type="text" inputMode="decimal" value={montrer("hauteur")} onChange={(e) => saisir("hauteur", e.target.value)} aria-label="Hauteur de la feuille" />
          </div>
        </>
      )}
      <div className={cls} style={{ alignSelf: "end" }}>
        <small style={{ display: "block", fontSize: "12px", color: courant.ok === false ? "var(--err, #c33)" : "var(--text-dim, #8b93a3)", lineHeight: 1.4 }} role="status">
          {courant.ok === false ? courant.erreur : "Feuille : " + nomConnu(courant.largeur, courant.hauteur) + ", " + decrire(courant.largeur, courant.hauteur) + (v.cle === "custom" ? ". Largeur × hauteur de la feuille en portrait." : "")}
        </small>
      </div>
    </>
  );
}
