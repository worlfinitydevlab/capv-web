import React, { useCallback, useEffect, useRef, useState } from "react";
import { appeler } from "./sujetsApi.js";
import { ACTIONS_JOURNAL, libelleAction, LIBELLES_CIBLE, resumeDetail, debutDeJour, finDeJour } from "./sujetsFormat.js";
import { dateHeureLocale } from "./fichiersApi.js";
import { EtatVide } from "../pedagogie/Fenetre.jsx";

// Onglet « Historique » : le journal des operations du module (qui a fait quoi, quand), en lecture seule.
// Les acces sensibles (telechargements, verrous forces, refus) y sont signales. Rien ne peut etre modifie ou supprime ici.
export default function HistoriqueSujets({ token }) {
  const [filtre, setFiltre] = useState({ type_action: "", username: "", du: "", au: "", sensible: false });
  const [lignes, setLignes] = useState(null);
  const [suite, setSuite] = useState(null);         // « prochain » : date de la derniere ligne si d'autres suivent
  const [erreur, setErreur] = useState("");
  const [occupe, setOccupe] = useState(false);
  const numero = useRef(0);

  const corps = useCallback((f, avant) => ({
    limite: 50,
    type_action: f.type_action || undefined,
    username: f.username.trim() || undefined,
    depuis: f.du ? debutDeJour(f.du) : undefined,
    jusqua: f.au ? finDeJour(f.au) : undefined,
    sensible: f.sensible ? true : undefined,
    avant: avant || undefined
  }), []);

  const charger = useCallback(async (f) => {
    const mon = ++numero.current;
    setOccupe(true);
    const r = await appeler(token, "historique", corps(f));
    if (mon !== numero.current) return;
    if (r.ok) { setLignes(r.data.lignes || []); setSuite(r.data.suite ? r.data.prochain : null); setErreur(""); }
    else { setErreur(r.error); setLignes((l) => l || []); setSuite(null); }
    setOccupe(false);
  }, [token, corps]);
  useEffect(() => { charger(filtre); }, [token]);           // premier affichage ; ensuite le bouton « Filtrer » relance

  const chargerPlus = async () => {
    if (!suite || occupe) return;
    const mon = ++numero.current;
    setOccupe(true);
    const r = await appeler(token, "historique", corps(filtre, suite));
    if (mon !== numero.current) return;
    if (r.ok) { setLignes((l) => (l || []).concat(r.data.lignes || [])); setSuite(r.data.suite ? r.data.prochain : null); setErreur(""); }
    else setErreur(r.error);
    setOccupe(false);
  };
  const changer = (k, v) => setFiltre((f) => ({ ...f, [k]: v }));
  const filtrer = (e) => { if (e) e.preventDefault(); charger(filtre); };
  const effacer = () => { const vide = { type_action: "", username: "", du: "", au: "", sensible: false }; setFiltre(vide); charger(vide); };

  return (
    <div data-vue="historique">
      <div className="wf-barre">
        <div className="wf-barre-g"><h2>Historique</h2><span className="wf-compte" data-compte>{lignes ? lignes.length + (lignes.length > 1 ? " lignes" : " ligne") + (suite ? " (il y en a d'autres)" : "") : ""}</span></div>
      </div>
      <p className="wf-intro">{"Le journal garde la trace de ce qui se fait dans les sujets d'examens : dossiers, documents, attributions, fichiers Word, accès sensibles. Il ne peut être ni modifié ni effacé."}</p>
      <form className="suj-filtres" onSubmit={filtrer} data-filtres noValidate>
        <div className="form-group"><label htmlFor="sh-action">Action</label>
          <select id="sh-action" data-filtre="type_action" value={filtre.type_action} onChange={(e) => changer("type_action", e.target.value)}>
            <option value="">Toutes</option>
            {Object.keys(ACTIONS_JOURNAL).map((k) => <option key={k} value={k}>{ACTIONS_JOURNAL[k]}</option>)}
          </select>
        </div>
        <div className="form-group"><label htmlFor="sh-user">Utilisateur</label><input id="sh-user" data-filtre="username" value={filtre.username} maxLength={80} placeholder="Identifiant du compte" onChange={(e) => changer("username", e.target.value)} /></div>
        <div className="form-group"><label htmlFor="sh-du">Du</label><input id="sh-du" type="date" data-filtre="du" value={filtre.du} onChange={(e) => changer("du", e.target.value)} /></div>
        <div className="form-group"><label htmlFor="sh-au">Au</label><input id="sh-au" type="date" data-filtre="au" value={filtre.au} onChange={(e) => changer("au", e.target.value)} /></div>
        <label className="suj-case" style={{ paddingBottom: "10px" }}><input type="checkbox" data-filtre="sensible" checked={filtre.sensible} onChange={(e) => changer("sensible", e.target.checked)} />{"Accès sensibles seulement"}</label>
        <div className="suj-rangee" style={{ paddingBottom: "6px" }}>
          <button type="submit" className="btn-primary btn-sm" data-filtrer disabled={occupe}>Filtrer</button>
          <button type="button" className="btn-gray-cancel btn-sm" data-effacer-filtres disabled={occupe} onClick={effacer}>Effacer</button>
        </div>
      </form>
      {erreur && <div className="login-error" style={{ marginBottom: "12px" }} data-erreur="historique">{erreur}</div>}
      {lignes === null && !erreur && <p className="wf-petit">Chargement…</p>}
      {lignes !== null && lignes.length === 0 && !erreur && <EtatVide titre="Rien à afficher" texte="Aucune ligne du journal ne correspond à ces filtres." />}
      {lignes !== null && lignes.length > 0 && (
        <div className="table-card">
          <table className="data-table" data-table="historique">
            <thead><tr><th>Quand</th><th>Qui</th><th>Action</th><th>Détail</th></tr></thead>
            <tbody>
              {lignes.map((h) => (
                <tr key={h.id} data-ligne-historique={h.id} data-action-journal={h.action}>
                  <td style={{ whiteSpace: "nowrap" }}>{dateHeureLocale(h.created_at)}</td>
                  <td>{h.username || <span className="wf-petit" style={{ display: "inline" }}>système</span>}</td>
                  <td>
                    <strong>{libelleAction(h.action)}</strong>
                    {h.sensible && <span className="badge badge-gold" data-sensible style={{ marginLeft: "6px" }}>sensible</span>}
                    {h.cible_type && <span className="wf-petit">{(LIBELLES_CIBLE[h.cible_type] || h.cible_type)}</span>}
                  </td>
                  <td>{resumeDetail(h.action, h.detail) || <span className="wf-petit" style={{ display: "inline" }}>-</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {suite && <div style={{ textAlign: "center", marginTop: "12px" }}><button type="button" className="btn-gray-cancel" data-charger-plus disabled={occupe} onClick={chargerPlus}>{occupe ? "Chargement..." : "Charger plus"}</button></div>}
    </div>
  );
}
