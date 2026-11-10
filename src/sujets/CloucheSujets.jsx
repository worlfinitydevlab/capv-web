import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../AuthContext.jsx";
import { demarrer, arreter, definirJeton, marquerLues, useNotificationsSujets, demanderOnglet, ongletDeNotification, vueDeNotification } from "./sujetsStore.js";
import { depuis } from "./sujetsApi.js";
import "./sujets.css";

// Cloche des notifications des Sujets d'examens (en-tete). Affichee seulement pour les personnes qui ont acces au module,
// et seulement si la fonction serveur est installee (sinon rien n'apparait).
export default function CloucheSujets({ onOuvrir }) {
  const { user, token } = useAuth();
  const e = useNotificationsSujets();
  const [ouvert, setOuvert] = useState(false);
  const racine = useRef(null);
  const bouton = useRef(null);
  const panneau = useRef(null);
  const [place, setPlace] = useState(null);
  const username = user ? user.username : null;

  useEffect(() => {
    if (!username || !token) return undefined;
    demarrer(username, token);
    return () => arreter();
  }, [username]);
  useEffect(() => { definirJeton(token); }, [token]);

  // Le panneau est dessine a la racine de la page (portail) et positionne a partir de la cloche : le cadre principal de l'application
  // coupe tout ce qui depasse (overflow: hidden), donc un panneau accroche a la cloche etait tronque a gauche quand l'ecran est etroit.
  useLayoutEffect(() => {
    if (!ouvert) { setPlace(null); return undefined; }
    const placer = () => {
      const b = bouton.current;
      if (!b) return;
      const r = b.getBoundingClientRect();
      const vw = document.documentElement.clientWidth || window.innerWidth;
      const largeur = Math.min(380, vw - 16);
      const menu = document.querySelector(".sidebar");
      const m = menu ? menu.getBoundingClientRect() : null;
      const minGauche = m && m.width > 0 && m.left <= 1 && m.right < vw * 0.5 ? m.right + 8 : 8;
      let gauche = Math.max(minGauche, r.right - largeur);
      if (gauche + largeur > vw - 8) gauche = vw - 8 - largeur;
      if (gauche < 8) gauche = 8;
      setPlace({ left: Math.round(gauche), top: Math.round(r.bottom + 8), width: Math.round(largeur) });
    };
    placer();
    window.addEventListener("resize", placer);
    window.addEventListener("scroll", placer, true);
    return () => { window.removeEventListener("resize", placer); window.removeEventListener("scroll", placer, true); };
  }, [ouvert]);

  useEffect(() => {
    if (!ouvert) return undefined;
    const dehors = (ev) => {
      const dans = (el) => el && el.contains(ev.target);
      if (!dans(racine.current) && !dans(panneau.current)) setOuvert(false);
    };
    const touche = (ev) => { if (ev.key === "Escape") setOuvert(false); };
    document.addEventListener("mousedown", dehors);
    document.addEventListener("keydown", touche);
    return () => { document.removeEventListener("mousedown", dehors); document.removeEventListener("keydown", touche); };
  }, [ouvert]);

  if (!username || e.indisponible) return null;
  const liste = e.notifications.slice(0, 10);
  const ouvrir = (n) => {
    if (!n.lu_le) marquerLues([n.id]);
    setOuvert(false);
    demanderOnglet(ongletDeNotification(n), n && n.cible_type === "document" ? n.cible_id : null, vueDeNotification(n));
    if (onOuvrir) onOuvrir(n);
  };

  return (
    <div className="suj-cloche" ref={racine} data-cloche>
      <button type="button" ref={bouton} className="suj-cloche-btn" aria-label={"Notifications" + (e.non_lues ? " (" + e.non_lues + " non lue" + (e.non_lues > 1 ? "s" : "") + ")" : "")} aria-expanded={ouvert} onClick={() => setOuvert(!ouvert)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
        {e.non_lues > 0 && <span className="suj-compteur" data-compteur>{e.non_lues > 99 ? "99+" : e.non_lues}</span>}
      </button>
      {ouvert && place && createPortal(
        <div className="suj-panneau" role="dialog" aria-label="Notifications" ref={panneau} style={{ left: place.left, top: place.top, width: place.width }}>
          <div className="suj-panneau-tete">
            <span>Notifications</span>
            {e.non_lues > 0 && <button type="button" className="suj-lien" data-tout-lu onClick={() => marquerLues(null)}>Tout marquer comme lu</button>}
          </div>
          <div className="suj-liste">
            {liste.length === 0 && <div className="suj-vide">Aucune notification.</div>}
            {liste.map((n) => (
              <button key={n.id} type="button" className={"suj-item" + (n.lu_le ? "" : " non-lue")} data-notif={n.id} onClick={() => ouvrir(n)}>
                <div className="suj-item-titre">{n.titre}</div>
                {n.message && <div className="suj-item-msg">{n.message}</div>}
                <div className="suj-item-date">{depuis(n.created_at)}</div>
              </button>
            ))}
          </div>
          <div className="suj-pied"><button type="button" className="suj-lien" data-voir-tout onClick={() => { setOuvert(false); demanderOnglet(null, null); if (onOuvrir) onOuvrir(null); }}>Ouvrir les Sujets d&apos;examens</button></div>
        </div>,
        document.body
      )}
    </div>
  );
}
