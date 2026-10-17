import React, { useEffect, useRef, useState } from "react";
import "./fenetre.css";

// ---------------------------------------------------------------------------
// Standard "Worlf" des pages de la pedagogie : une liste d'abord, un bouton
// "Ajouter", et une fenetre pour saisir. Ces pieces sont reutilisables telles
// quelles sur toute autre page (classes, periodes, salles...).
// ---------------------------------------------------------------------------

// Envoi d'un formulaire : empeche le double clic, garde l'erreur DANS la fenetre
// (elle reste ouverte et ce qui a ete saisi n'est pas perdu).
export function useEnvoi() {
  const [err, setErr] = useState("");
  const [occupe, setOccupe] = useState(false);
  const verrou = useRef(false);
  const vivant = useRef(true);
  useEffect(() => { vivant.current = true; return () => { vivant.current = false; }; }, []);
  const envoyer = async (fn) => {
    if (verrou.current) return false;
    verrou.current = true;
    setOccupe(true);
    setErr("");
    let reussi = false;
    try { await fn(); reussi = true; } catch (e) {
      // Annulation volontaire du mot de passe : on reste sur la fenetre sans message
      if (!(e && e.annule) && vivant.current) setErr((e && e.message) || "Une erreur est survenue.");
    }
    verrou.current = false;
    if (vivant.current) setOccupe(false);
    return reussi;
  };
  return { err, setErr, occupe, envoyer };
}

// Fenetre : titre + sous-titre, corps, pied. Echap ferme. Un clic a cote ferme
// seulement si rien n'a ete saisi (protege = false) et si rien n'est en cours.
export function Fenetre({ titre, sousTitre, fermer, occupe, protege, largeur, onSubmit, children, pied }) {
  const carte = useRef(null);
  const appuiSurFond = useRef(false);
  const idTitre = useRef("wf-t-" + Math.random().toString(36).slice(2, 8)).current;
  useEffect(() => {
    const touche = (e) => { if (e.key === "Escape" && !occupe) fermer(); };
    document.addEventListener("keydown", touche);
    return () => document.removeEventListener("keydown", touche);
  }, [occupe, fermer]);
  useEffect(() => {
    const premier = carte.current && carte.current.querySelector("input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled])");
    if (premier) premier.focus();
  }, []);
  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => { appuiSurFond.current = e.target === e.currentTarget; }}
      onClick={(e) => { if (appuiSurFond.current && e.target === e.currentTarget && !occupe && !protege) fermer(); appuiSurFond.current = false; }}
    >
      <div className="modal-card wf-fenetre" ref={carte} role="dialog" aria-modal="true" aria-labelledby={idTitre} style={{ width: largeur || "520px", maxWidth: "94vw", maxHeight: "92vh", overflow: "auto" }}>
        <div className="modal-header wf-entete">
          <div>
            <h3 id={idTitre}>{titre}</h3>
            {sousTitre && <p className="wf-sous-titre">{sousTitre}</p>}
          </div>
          <button type="button" className="modal-close" onClick={fermer} disabled={occupe} aria-label="Fermer">{"×"}</button>
        </div>
        <form noValidate onSubmit={(e) => { e.preventDefault(); if (onSubmit) onSubmit(); }}>
          <div className="wf-corps">{children}</div>
          <div className="wf-pied">{pied}</div>
        </form>
      </div>
    </div>
  );
}

// Boutons du bas : Annuler / action principale (Entree dans un champ = action principale)
export function PiedStandard({ fermer, occupe, libelle, desactive, danger }) {
  return (
    <>
      <button type="button" className="btn-gray-cancel" onClick={fermer} disabled={occupe}>Annuler</button>
      <button type="submit" className={danger ? "btn-red" : "btn-primary"} disabled={occupe || desactive}>{occupe ? "En cours..." : libelle}</button>
    </>
  );
}

// Demande de confirmation dans le meme style (remplace window.confirm)
export function Confirmation({ titre, texte, libelle, danger, fermer, action }) {
  const { err, occupe, envoyer } = useEnvoi();
  return (
    <Fenetre
      titre={titre}
      largeur="450px"
      fermer={fermer}
      occupe={occupe}
      onSubmit={() => envoyer(action)}
      pied={<PiedStandard fermer={fermer} occupe={occupe} libelle={libelle} danger={danger} />}
    >
      <p className="wf-texte">{texte}</p>
      {err && <div className="login-error">{err}</div>}
    </Fenetre>
  );
}

// Choix entre deux ou trois modes a l'interieur d'une fenetre
export function Bascule({ valeur, options, onChange, desactive }) {
  return (
    <div className="wf-bascule" role="tablist">
      {options.map(([cle, texte]) => (
        <button key={cle} type="button" role="tab" aria-selected={valeur === cle} disabled={desactive} className={valeur === cle ? "btn-primary btn-sm" : "btn-gray-cancel btn-sm"} onClick={() => onChange(cle)}>{texte}</button>
      ))}
    </div>
  );
}

// Haut d'une liste : titre + nombre, recherche, bouton Ajouter
export function BarreListe({ titre, compte, recherche, onRecherche, placeholder, libelleBouton, onBouton }) {
  return (
    <div className="wf-barre">
      <div className="wf-barre-g">
        <h2>{titre}</h2>
        <span className="wf-compte">{compte}</span>
      </div>
      <div className="wf-barre-d">
        {onRecherche && <input className="wf-recherche" type="search" value={recherche} placeholder={placeholder || "Rechercher..."} onChange={(e) => onRecherche(e.target.value)} />}
        <button type="button" className="btn-primary" onClick={onBouton}>{"+ " + libelleBouton}</button>
      </div>
    </div>
  );
}

// Liste vide : on invite a creer le premier element au lieu d'afficher un formulaire vide
export function EtatVide({ titre, texte, libelleBouton, onBouton }) {
  return (
    <div className="wf-vide">
      <h3>{titre}</h3>
      <p>{texte}</p>
      <button type="button" className="btn-primary" onClick={onBouton}>{"+ " + libelleBouton}</button>
    </div>
  );
}

export function Pastille({ actif }) {
  return <span className={actif ? "wf-pastille" : "wf-pastille off"}>{actif ? "Active" : "Inactive"}</span>;
}

// Recherche sans tenir compte des accents ni des majuscules
export function sansAccent(s) {
  return String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
