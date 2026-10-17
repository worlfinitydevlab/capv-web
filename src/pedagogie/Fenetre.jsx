import React, { useEffect, useRef, useState } from "react";
import "./fenetre.css";

// ---------------------------------------------------------------------------
// Standard "Worlf" des pages de la pedagogie : une liste d'abord, un bouton
// "Ajouter", et une fenetre pour saisir. Ces pieces sont reutilisables telles
// quelles sur toute autre page (classes, periodes, salles...).
// ---------------------------------------------------------------------------

// Envoi d'un formulaire : empeche le double clic, garde l'erreur DANS la fenetre
// (elle reste ouverte et ce qui a ete saisi n'est pas perdu).
// envoyer(fn) : fn(confirmer) est appelee avec confirmer = false puis, si le serveur demande
// une confirmation (ex. des notes existent deja), la fenetre affiche son message et un bouton
// "Confirmer" relance fn(true).
export function useEnvoi() {
  const [err, setErr] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [occupe, setOccupe] = useState(false);
  const verrou = useRef(false);
  const vivant = useRef(true);
  const dernier = useRef(null);
  useEffect(() => { vivant.current = true; return () => { vivant.current = false; }; }, []);
  const envoyer = async (fn, confirmer) => {
    if (verrou.current) return false;
    verrou.current = true;
    setOccupe(true);
    setErr("");
    if (!confirmer) setConfirmation("");
    dernier.current = fn;
    let reussi = false;
    try { await fn(!!confirmer); reussi = true; } catch (e) {
      if (e && e.confirmation && !confirmer) {
        if (vivant.current) setConfirmation(e.message || "Confirmer cette action ?");
      } else if (!(e && e.annule) && vivant.current) {
        // Annulation volontaire du mot de passe : on reste sur la fenetre sans message
        setConfirmation("");
        setErr((e && e.message) || "Une erreur est survenue.");
      }
    }
    verrou.current = false;
    if (vivant.current) setOccupe(false);
    return reussi;
  };
  const confirmer = () => (dernier.current ? envoyer(dernier.current, true) : false);
  const refuser = () => setConfirmation("");
  return { err, setErr, confirmation, occupe, envoyer, confirmer, refuser };
}

// Erreur (rouge) ou demande de confirmation (jaune) d'un envoi
export function MessageEnvoi({ envoi }) {
  return (
    <>
      {envoi.err && <div className="login-error">{envoi.err}</div>}
      {envoi.confirmation && <div className="wf-avis" role="alert"><strong>{"Confirmation nécessaire"}</strong><div>{envoi.confirmation}</div></div>}
    </>
  );
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
export function PiedStandard({ fermer, occupe, libelle, desactive, danger, envoi }) {
  if (envoi && envoi.confirmation) {
    return (
      <>
        <button type="button" className="btn-gray-cancel" onClick={envoi.refuser} disabled={occupe}>Retour</button>
        <button type="button" className={danger ? "btn-red" : "btn-primary"} onClick={envoi.confirmer} disabled={occupe}>{occupe ? "En cours..." : (danger ? "Confirmer" : "Confirmer et enregistrer")}</button>
      </>
    );
  }
  return (
    <>
      <button type="button" className="btn-gray-cancel" onClick={fermer} disabled={occupe}>Annuler</button>
      <button type="submit" className={danger ? "btn-red" : "btn-primary"} disabled={occupe || desactive}>{occupe ? "En cours..." : libelle}</button>
    </>
  );
}

// Demande de confirmation dans le meme style (remplace window.confirm).
// action(confirmer) : si le serveur demande lui-meme une confirmation, son message s'affiche ici.
export function Confirmation({ titre, texte, libelle, danger, fermer, action }) {
  const envoi = useEnvoi();
  return (
    <Fenetre
      titre={titre}
      largeur="450px"
      fermer={fermer}
      occupe={envoi.occupe}
      onSubmit={() => envoi.envoyer(action)}
      pied={<PiedStandard fermer={fermer} occupe={envoi.occupe} libelle={libelle} danger={danger} envoi={envoi} />}
    >
      <p className="wf-texte">{texte}</p>
      <MessageEnvoi envoi={envoi} />
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
export function BarreListe({ titre, compte, recherche, onRecherche, placeholder, libelleBouton, onBouton, extra }) {
  return (
    <div className="wf-barre">
      <div className="wf-barre-g">
        <h2>{titre}</h2>
        <span className="wf-compte">{compte}</span>
      </div>
      <div className="wf-barre-d">
        {onRecherche && <input className="wf-recherche" type="search" value={recherche} placeholder={placeholder || "Rechercher..."} onChange={(e) => onRecherche(e.target.value)} />}
        {extra}
        {onBouton && <button type="button" className="btn-primary" onClick={onBouton}>{"+ " + libelleBouton}</button>}
      </div>
    </div>
  );
}

// Liste vide : on invite a creer le premier element au lieu d'afficher un formulaire vide
export function EtatVide({ titre, texte, libelleBouton, onBouton, extra }) {
  return (
    <div className="wf-vide">
      <h3>{titre}</h3>
      <p>{texte}</p>
      <div className="wf-vide-actions">
        <button type="button" className="btn-primary" onClick={onBouton}>{"+ " + libelleBouton}</button>
        {extra}
      </div>
    </div>
  );
}

// Valeurs actuelles d'un reglage, en lecture : [[libelle, valeur], ...]
export function Resume({ lignes }) {
  return (
    <dl className="wf-resume">
      {lignes.map(([libelle, valeur]) => (
        <div key={libelle}><dt>{libelle}</dt><dd>{valeur}</dd></div>
      ))}
    </dl>
  );
}

export function Pastille({ actif }) {
  return <span className={actif ? "wf-pastille" : "wf-pastille off"}>{actif ? "Active" : "Inactive"}</span>;
}

// Recherche sans tenir compte des accents ni des majuscules
export function sansAccent(s) {
  return String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
