import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "../AuthContext.jsx";
import { demarrer, arreter, rafraichir, useAccesSpeciaux, useChrono, formaterChrono, restantS } from "./accesSpecialStore.js";
import { courtTache, resumeDroits, aDesDroits } from "./accesSpecialCatalog.js";

// Bandeau permanent (sous l'en-tete) tant qu'un acces special est actif, avec le chronometre (taches et/ou droits temporaires).
// Il demarre aussi l'interrogation du serveur (toutes les 2 minutes, onglet visible) pour la personne connectee.
export default function BandeauAccesSpecial() {
  const { user } = useAuth();
  const { grants } = useAccesSpeciaux();
  const [toast, setToast] = useState("");
  const precedents = useRef([]);

  useEffect(() => {
    if (user && user.role !== "Super Admin") demarrer(user.username);
    return () => arreter();
  }, [user && user.username, user && user.role]);

  // un acces qui disparait de la liste : on previent la personne
  useEffect(() => {
    const ids = new Set(grants.map((g) => g.id));
    const perdus = precedents.current.filter((g) => !ids.has(g.id));
    if (perdus.length) {
      const duree = perdus.some((g) => restantS(g) <= 2);
      const droits = perdus.some((g) => aDesDroits(g.droits));
      setToast(duree ? "Ton accès spécial est terminé (durée écoulée)." + (droits ? " Les droits temporaires ne sont plus actifs : enregistre ce que tu faisais." : "") : "Ton accès spécial a pris fin (limite d'actions atteinte ou accès retiré par un administrateur).");
    }
    precedents.current = grants;
  }, [grants]);
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(""), 10000);
    return () => clearTimeout(t);
  }, [toast]);

  const premier = grants.slice().sort((a, b) => restantS(a) - restantS(b))[0];
  return (
    <>
      {premier && <Barre g={premier} autres={grants.length - 1} />}
      {toast && (
        <div role="status" style={{ position: "fixed", left: "50%", bottom: "20px", transform: "translateX(-50%)", zIndex: 3000, maxWidth: "min(480px, 92vw)", background: "#1e293b", color: "#fff", padding: "12px 16px", borderRadius: "12px", boxShadow: "0 10px 30px rgba(0,0,0,0.3)", fontSize: "13px", display: "flex", gap: "12px", alignItems: "center" }}>
          <span style={{ flex: 1 }}>{toast}</span>
          <button onClick={() => setToast("")} style={{ background: "transparent", border: "none", color: "#fff", cursor: "pointer", fontSize: "16px" }} aria-label="Fermer">x</button>
        </div>
      )}
    </>
  );
}

function Barre({ g, autres }) {
  const restant = useChrono(g);
  const rouge = restant <= 60, orange = restant <= 300;
  const couleurs = rouge ? { fond: "#fef2f2", bord: "#dc2626", texte: "#991b1b" } : orange ? { fond: "#fff1e6", bord: "#ea7a1d", texte: "#9a3412" } : { fond: "#fffbeb", bord: "#f59e0b", texte: "#92400e" };
  return (
    <div role="status" aria-live="off" style={{ background: couleurs.fond, borderBottom: "2px solid " + couleurs.bord, color: couleurs.texte, padding: "8px 18px", display: "flex", flexWrap: "wrap", gap: "6px 16px", alignItems: "center", fontSize: "13px" }}>
      <strong style={{ letterSpacing: "0.3px" }}>ACCÈS SPÉCIAL</strong>
      <span style={{ flex: "1 1 220px", minWidth: 0 }}>
        {g.taches.length ? g.taches.map(courtTache).join(", ") : ""}
        {g.taches.length && aDesDroits(g.droits) ? " · " : ""}
        {aDesDroits(g.droits) ? "Droits : " + resumeDroits(g.droits, 4) : ""} · accordé par {g.accorde_par_nom || g.accorde_par}
        {g.taches.length && g.utilisations_max != null ? " · actions : " + g.utilisations + "/" + g.utilisations_max : ""}
        {aDesDroits(g.droits) ? " · tes pages ouvertes et tes modifications sont inscrites dans un rapport" : ""}
        {autres > 0 ? " · +" + autres + " autre(s) accès" : ""}
      </span>
      <span title="Temps restant" style={{ fontWeight: 800, fontSize: "16px", fontVariantNumeric: "tabular-nums", background: "#fff", border: "1px solid " + couleurs.bord, borderRadius: "999px", padding: "2px 12px" }}>{formaterChrono(restant)}</span>
      <button onClick={() => rafraichir(true)} style={{ background: "transparent", border: "none", color: couleurs.texte, textDecoration: "underline", cursor: "pointer", fontSize: "12px" }}>Actualiser</button>
    </div>
  );
}
