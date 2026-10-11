import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthContext.jsx";

// Verrouillage automatique par inactivite : sans activite pendant le delai regle dans Parametres > Securite,
// la session est fermee (retour a l'ecran de connexion). Un avertissement est affiche juste avant.
const CLE_ACTIVITE = "capv_web_last_activity";
const CLE_DELAI = "capv_web_idle_min";

function delaiEnMinutes(delaiMin) {
  const n = Number(delaiMin);
  if (delaiMin !== undefined && delaiMin !== null && delaiMin !== "" && Number.isFinite(n) && n >= 0) return n;
  try {
    const c = localStorage.getItem(CLE_DELAI);
    if (c !== null && Number.isFinite(Number(c)) && Number(c) >= 0) return Number(c);
  } catch (e) { /* ignore */ }
  return 15;
}

function lireActivite() {
  try { return Number(localStorage.getItem(CLE_ACTIVITE) || 0); } catch (e) { return 0; }
}
function marquerActivite() {
  try { localStorage.setItem(CLE_ACTIVITE, String(Date.now())); } catch (e) { /* ignore */ }
}

export default function GardeInactivite({ delaiMin }) {
  const { token, logout } = useAuth();
  const delaiMs = delaiEnMinutes(delaiMin) * 60000;
  const [reste, setReste] = useState(null); // secondes avant deconnexion, ou null
  const dernierEcrit = useRef(0);

  useEffect(() => {
    if (!token || !(delaiMs > 0)) { setReste(null); return undefined; }
    if (!lireActivite()) marquerActivite();
    const alerteMs = Math.min(60000, delaiMs / 2);

    const verifier = () => {
      const inactif = Date.now() - lireActivite();
      if (inactif >= delaiMs) { setReste(null); logout(); return; }
      const avant = delaiMs - inactif;
      setReste(avant <= alerteMs ? Math.ceil(avant / 1000) : null);
    };
    const activite = () => {
      const t = Date.now();
      if (t - dernierEcrit.current < 4000) return;
      // pendant l'avertissement, seul le bouton "Rester connecte" prolonge la session
      if (delaiMs - (t - lireActivite()) <= alerteMs) return;
      dernierEcrit.current = t;
      marquerActivite();
    };
    const evts = ["mousedown", "mousemove", "keydown", "touchstart", "scroll", "wheel"];
    evts.forEach((e) => window.addEventListener(e, activite, { passive: true }));
    const horloge = setInterval(verifier, 1000);
    const visible = () => { if (!document.hidden) verifier(); };
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("focus", verifier);
    verifier();
    return () => {
      evts.forEach((e) => window.removeEventListener(e, activite));
      clearInterval(horloge);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("focus", verifier);
    };
  }, [token, delaiMs]);

  if (reste === null || !token) return null;
  return (
    <div className="modal-overlay" style={{ zIndex: 99999 }}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "420px", maxWidth: "92vw", textAlign: "center" }}>
        <div className="modal-header"><h3>Session inactive</h3></div>
        <p style={{ fontSize: "14px", margin: "10px 0 6px" }}>Pour votre sécurité, vous allez être déconnecté dans</p>
        <div style={{ fontSize: "34px", fontWeight: 700, margin: "6px 0 14px" }}>{reste} s</div>
        <div style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" }}>
          <button className="btn-primary" onClick={() => { marquerActivite(); dernierEcrit.current = Date.now(); setReste(null); }}>Rester connecté</button>
          <button className="btn-gray-cancel" onClick={() => logout()}>Se déconnecter</button>
        </div>
      </div>
    </div>
  );
}
