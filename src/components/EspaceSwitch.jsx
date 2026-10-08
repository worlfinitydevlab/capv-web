import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { useEspace, allerA, fermerApercu, ESPACES } from "../espaceStore.js";
import "../espace.css";

function IconeFinance() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 6.5v11M9.2 9.3c0-1.1 1.2-1.8 2.8-1.8s2.8.7 2.8 1.9-1.2 1.6-2.8 2-2.8.8-2.8 2 1.2 1.9 2.8 1.9 2.8-.8 2.8-1.9" />
    </svg>
  );
}

function IconePedagogie() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 9l10-5 10 5-10 5z" />
      <path d="M6 11.2v4.6c0 1.4 2.7 3 6 3s6-1.6 6-3v-4.6" />
      <path d="M22 9v6" />
    </svg>
  );
}

function Cadenas() {
  return (
    <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 018 0v3" />
    </svg>
  );
}

const ICONES = { finance: <IconeFinance />, pedagogie: <IconePedagogie /> };

export default function EspaceSwitch() {
  const { espace, actifs, transition, apercu } = useEspace();

  useEffect(() => {
    const h = (e) => {
      if (e.ctrlKey && e.code === "Space") {
        e.preventDefault();
        allerA(espace === "finance" ? "pedagogie" : "finance");
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [espace]);

  const clic = (cible, e) => {
    const r = e.currentTarget.getBoundingClientRect();
    allerA(cible, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
  };

  const noeud = (id) => {
    const actif = actifs.includes(id);
    return (
      <button
        key={id}
        type="button"
        className={"esp-node" + (espace === id ? " on" : "") + (actif ? "" : " locked")}
        onClick={(e) => clic(id, e)}
        title={actif ? "Espace " + ESPACES[id].nom : "Espace " + ESPACES[id].nom + " - non activé (aperçu)"}
      >
        <span className="esp-ico">{ICONES[id]}</span>
        <span className="esp-lbl">{ESPACES[id].nom}</span>
        {!actif && <span className="esp-lock"><Cadenas /></span>}
      </button>
    );
  };

  return (
    <div className="esp-wrap">
      <div className="esp-switch" data-on={espace}>
        <div className="esp-orb" />
        {noeud("finance")}
        {noeud("pedagogie")}
      </div>
      <div className="esp-hint">{"Ctrl + Espace pour basculer"}</div>

      {transition && createPortal(
        <div className={"esp-wipe to-" + transition.vers} style={{ "--x": transition.x + "px", "--y": transition.y + "px" }}>
          <span className="esp-wipe-txt">{ESPACES[transition.vers].nom}</span>
        </div>,
        document.body
      )}

      {apercu && createPortal(
        <div className="esp-apercu" onClick={fermerApercu}>
          <div className={"esp-apercu-card to-" + apercu} onClick={(e) => e.stopPropagation()}>
            <div className="esp-apercu-badge"><Cadenas /> {"Aperçu - non activé"}</div>
            <h3>{"Espace " + ESPACES[apercu].nom}</h3>
            <p className="esp-apercu-resume">{ESPACES[apercu].resume}</p>
            <ul>
              {ESPACES[apercu].fonctions.map((f) => (
                <li key={f}><span className="esp-apercu-dot" />{f}</li>
              ))}
            </ul>
            <p className="esp-apercu-note">{"Cet espace n'est pas inclus dans votre licence actuelle. Pour l'activer, contactez Worlfinity DevLab."}</p>
            <button type="button" className="esp-apercu-btn" onClick={fermerApercu}>Fermer</button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
