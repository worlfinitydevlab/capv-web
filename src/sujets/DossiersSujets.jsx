import React, { useCallback, useEffect, useState } from "react";
import { useYear } from "../YearContext.jsx";
import { appeler } from "./sujetsApi.js";
import { libelleType, dateFr, statutDoc, STATUTS_DOSSIER, echeance, nomPersonne } from "./sujetsFormat.js";
import { FenetreDossier, FenetreDocument, FenetreAttribution, FenetreAnnulation } from "./FenetresSujets.jsx";
import { FenetreFichier, CelluleFichier } from "./FichierWord.jsx";
import { NoteDecision } from "./DecisionsSujets.jsx";
import { Confirmation, EtatVide, sansAccent } from "../pedagogie/Fenetre.jsx";

// Onglet « Dossiers » : le secretariat cree les dossiers d'examens, y ajoute les documents (sujet, corrige, bareme) et les attribue aux enseignants.
// Rien n'est jamais supprime : un dossier se clot, un document s'annule (et se retablit).
export default function DossiersSujets({ token, droits }) {
  const { years, currentYear } = useYear() || { years: [], currentYear: null };
  const d = droits || {};
  const [statut, setStatut] = useState("ouvert");
  const [anneeId, setAnneeId] = useState(currentYear ? String(currentYear.id) : "");
  const [recherche, setRecherche] = useState("");
  const [liste, setListe] = useState(null);
  const [erreur, setErreur] = useState("");
  const [ouvert, setOuvert] = useState(null);          // dossier dont on voit les documents
  const [enseignants, setEnseignants] = useState([]);
  const [fenetre, setFenetre] = useState(null);        // { type, ... }
  const [message, setMessage] = useState("");
  const [messageOuverture, setMessageOuverture] = useState("");   // message a montrer a l'arrivee dans un dossier qu'on vient de creer

  const charger = useCallback(async () => {
    const r = await appeler(token, "dossiers", { statut, annee_id: anneeId || undefined });
    if (r.ok) { setListe(r.data.dossiers || []); setErreur(""); }
    else { setListe((l) => l || []); setErreur(r.error); }
  }, [token, statut, anneeId]);
  useEffect(() => { setListe(null); charger(); }, [charger]);
  useEffect(() => {
    if (!d.creer && !d.modifier) return;
    (async () => { const r = await appeler(token, "enseignants"); if (r.ok) setEnseignants(r.data.enseignants || []); })();
  }, [token, d.creer, d.modifier]);
  useEffect(() => { if (!message) return undefined; const t = setTimeout(() => setMessage(""), 6000); return () => clearTimeout(t); }, [message]);

  const filtre = sansAccent(recherche);
  const affichees = (liste || []).filter((x) => !filtre || sansAccent(x.nom + " " + (x.annee_libelle || "") + " " + (x.periode_libelle || "")).includes(filtre));
  const fermer = () => setFenetre(null);

  if (ouvert) {
    return <DocumentsDuDossier token={token} droits={d} dossier={ouvert} enseignants={enseignants} messageInitial={messageOuverture}
      retour={() => { setOuvert(null); setMessageOuverture(""); charger(); }} surDossier={(x) => setOuvert(x)} />;
  }
  return (
    <div data-vue="dossiers">
      <div className="wf-barre">
        <div className="wf-barre-g"><h2>Dossiers d&apos;examens</h2><span className="wf-compte" data-compte>{liste ? affichees.length + (affichees.length > 1 ? " dossiers" : " dossier") : ""}</span></div>
        <div className="wf-barre-d">
          <input className="wf-recherche" type="search" value={recherche} placeholder="Rechercher un dossier..." onChange={(e) => setRecherche(e.target.value)} />
          <select data-filtre="annee" value={anneeId} onChange={(e) => setAnneeId(e.target.value)} aria-label="Année scolaire">
            <option value="">Toutes les années</option>
            {(years || []).map((a) => <option key={a.id} value={String(a.id)}>{a.nom || a.name || a.libelle}</option>)}
          </select>
          <select data-filtre="statut" value={statut} onChange={(e) => setStatut(e.target.value)} aria-label="Statut">
            <option value="ouvert">Ouverts</option><option value="clos">Clos</option><option value="tous">Tous</option>
          </select>
          {d.creer && <button type="button" className="btn-primary" data-nouveau-dossier onClick={() => setFenetre({ type: "dossier" })}>+ Nouveau dossier</button>}
        </div>
      </div>
      {message && <div data-message className="suj-ok">{message}</div>}
      {erreur && <div className="login-error" style={{ marginBottom: "12px" }} data-erreur="dossiers">{erreur}</div>}
      {liste === null && !erreur && <p className="wf-petit">Chargement…</p>}
      {liste !== null && affichees.length === 0 && !erreur && (
        <EtatVide titre={(liste || []).length === 0 ? "Aucun dossier d'examens" : "Aucun résultat"}
          texte={(liste || []).length === 0 ? "Un dossier regroupe les documents d'un même examen : sujets, corrigés et barèmes. Crée le premier, puis ajoute-y les documents et attribue-les aux enseignants." : "Aucun dossier ne correspond à ta recherche ou à ces filtres."}
          libelleBouton={d.creer && (liste || []).length === 0 ? "Nouveau dossier" : undefined} onBouton={d.creer && (liste || []).length === 0 ? () => setFenetre({ type: "dossier" }) : undefined} />
      )}
      {affichees.length > 0 && (
        <div className="table-card">
          <table className="data-table" data-table="dossiers">
            <thead><tr><th>Dossier</th><th>Année / période</th><th>Date limite</th><th>Documents</th><th>Statut</th><th>Actions</th></tr></thead>
            <tbody>
              {affichees.map((x) => {
                const st = STATUTS_DOSSIER[x.statut] || [x.statut, "badge-gray"];
                const rep = Object.entries(x.par_statut || {}).map(([k, n]) => n + " " + statutDoc(k)[0].toLowerCase()).join(" · ");
                return (
                  <tr key={x.id} data-dossier={x.id}>
                    <td><button type="button" className="suj-lien" style={{ fontWeight: 700, fontSize: "14px", textAlign: "left" }} data-ouvrir onClick={() => setOuvert(x)}>{x.nom}</button></td>
                    <td>{[x.annee_libelle, x.periode_libelle].filter(Boolean).join(" - ") || "-"}</td>
                    <td>{x.date_limite ? dateFr(x.date_limite) : "-"}</td>
                    <td>{x.nb_documents}{rep && <span className="wf-petit">{rep}</span>}</td>
                    <td><span className={"badge " + st[1]}>{st[0]}</span></td>
                    <td className="suj-actions">
                      <button type="button" className="btn-sm btn-primary" data-ouvrir onClick={() => setOuvert(x)}>Ouvrir</button>
                      {d.modifier && x.statut === "ouvert" && <button type="button" className="btn-sm btn-gray-cancel" data-modifier-dossier onClick={() => setFenetre({ type: "dossier", dossier: x })}>Modifier</button>}
                      {d.annuler && x.statut === "ouvert" && <button type="button" className="btn-sm btn-red" data-clore onClick={() => setFenetre({ type: "statut", dossier: x, cible: "clos" })}>Clore</button>}
                      {d.annuler && x.statut === "clos" && <button type="button" className="btn-sm btn-gray-cancel" data-rouvrir onClick={() => setFenetre({ type: "statut", dossier: x, cible: "ouvert" })}>Rouvrir</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {fenetre && fenetre.type === "dossier" && (
        <FenetreDossier token={token} dossier={fenetre.dossier} annees={years} anneeDefaut={currentYear} fermer={fermer}
          apres={async (nouveau) => {
            const creation = !fenetre.dossier;
            fermer(); await charger();
            if (creation) { setMessageOuverture("Dossier créé : ajoute-y maintenant les documents."); setOuvert({ ...nouveau, nb_documents: 0, par_statut: {} }); }
            else setMessage("Dossier modifié.");
          }} />
      )}
      {fenetre && fenetre.type === "statut" && (
        <Confirmation titre={fenetre.cible === "clos" ? "Clore ce dossier ?" : "Rouvrir ce dossier ?"} fermer={fermer} libelle={fenetre.cible === "clos" ? "Clore le dossier" : "Rouvrir le dossier"} danger={fenetre.cible === "clos"}
          texte={fenetre.cible === "clos" ? "« " + fenetre.dossier.nom + " » ne recevra plus de nouveau document ni de changement d'attribution. Rien n'est supprimé et tu pourras le rouvrir." : "« " + fenetre.dossier.nom + " » accepte de nouveau des documents et des changements."}
          action={async () => {
            const r = await appeler(token, "dossier_statut", { id: fenetre.dossier.id, statut: fenetre.cible });
            if (!r.ok) throw new Error(r.error);
            fermer(); setMessage(fenetre.cible === "clos" ? "Dossier clos." : "Dossier rouvert."); await charger();
          }} />
      )}
    </div>
  );
}

// ------------------------------------------------------------------ documents d'un dossier
function DocumentsDuDossier({ token, droits, dossier, enseignants, messageInitial, retour, surDossier }) {
  const d = droits;
  const [donnees, setDonnees] = useState(null);       // { dossier, documents }
  const [erreur, setErreur] = useState("");
  const [fenetre, setFenetre] = useState(null);
  const [message, setMessage] = useState(messageInitial || "");
  const [recherche, setRecherche] = useState("");
  const [fenetreDossier, setFenetreDossier] = useState(false);
  const { years } = useYear() || { years: [] };

  const charger = useCallback(async () => {
    const r = await appeler(token, "documents", { dossier_id: dossier.id });
    if (r.ok) { setDonnees(r.data); setErreur(""); } else { setErreur(r.error); setDonnees((x) => x || { dossier, documents: [] }); }
  }, [token, dossier.id]);
  useEffect(() => { setDonnees(null); charger(); }, [charger]);
  useEffect(() => { if (!message) return undefined; const t = setTimeout(() => setMessage(""), 6000); return () => clearTimeout(t); }, [message]);
  const fermer = () => setFenetre(null);
  const dos = donnees ? donnees.dossier : dossier;
  const ouvertDossier = dos.statut === "ouvert";
  const docs = donnees ? donnees.documents : [];
  const filtre = sansAccent(recherche);
  const visibles = docs.filter((x) => !filtre || sansAccent([x.titre, x.classe_libelle, x.matiere_libelle, nomPersonne(x.responsable)].join(" ")).includes(filtre));
  const apresChangement = (texte) => async () => { fermer(); setMessage(texte); await charger(); };

  return (
    <div data-vue="documents">
      <button type="button" className="suj-lien" data-retour onClick={retour}>{"← Tous les dossiers"}</button>
      <div className="wf-barre" style={{ marginTop: "8px" }}>
        <div className="wf-barre-g">
          <h2 data-titre-dossier>{dos.nom}</h2>
          <span className={"badge " + (STATUTS_DOSSIER[dos.statut] || ["", "badge-gray"])[1]}>{(STATUTS_DOSSIER[dos.statut] || [dos.statut])[0]}</span>
        </div>
        <div className="wf-barre-d">
          <input className="wf-recherche" type="search" value={recherche} placeholder="Rechercher un document..." onChange={(e) => setRecherche(e.target.value)} />
          {d.modifier && ouvertDossier && <button type="button" className="btn-gray-cancel" data-modifier-dossier onClick={() => setFenetreDossier(true)}>Modifier le dossier</button>}
          {d.creer && ouvertDossier && <button type="button" className="btn-primary" data-nouveau-document onClick={() => setFenetre({ type: "document" })}>+ Nouveau document</button>}
        </div>
      </div>
      <p className="wf-intro" data-infos-dossier>
        {[dos.annee_libelle, dos.periode_libelle].filter(Boolean).join(" - ")}{dos.date_limite ? (dos.annee_libelle || dos.periode_libelle ? " · " : "") + "Date limite : " + dateFr(dos.date_limite) : ""}
        {dos.instructions ? <span style={{ display: "block", marginTop: "4px", whiteSpace: "pre-wrap" }}>{dos.instructions}</span> : null}
      </p>
      {!ouvertDossier && <div className="wf-avis" role="alert"><strong>Dossier {dos.statut === "clos" ? "clos" : "archivé"}</strong><div>{"On ne peut plus y ajouter de document ni changer les attributions."}</div></div>}
      {message && <div data-message className="suj-ok">{message}</div>}
      {erreur && <div className="login-error" style={{ marginBottom: "12px" }} data-erreur="documents">{erreur}</div>}
      {donnees === null && !erreur && <p className="wf-petit">Chargement…</p>}
      {donnees !== null && docs.length === 0 && !erreur && (
        <EtatVide titre="Aucun document dans ce dossier" texte={"Ajoute les documents de l'examen (par exemple le sujet et le corrigé de chaque matière), puis attribue chacun à un enseignant."}
          libelleBouton={d.creer && ouvertDossier ? "Nouveau document" : undefined} onBouton={d.creer && ouvertDossier ? () => setFenetre({ type: "document" }) : undefined} />
      )}
      {docs.length > 0 && visibles.length === 0 && <p className="wf-petit">Aucun document ne correspond à ta recherche.</p>}
      {visibles.length > 0 && (
        <div className="table-card">
          <table className="data-table" data-table="documents">
            <thead><tr><th>Document</th><th>Classe / matière</th><th>Préparé par</th><th>Date limite</th><th>Statut</th><th>Fichier Word</th><th>Actions</th></tr></thead>
            <tbody>
              {visibles.map((x) => {
                const st = statutDoc(x.statut);
                const date = x.date_limite || dos.date_limite || null;
                const ech = echeance(date, x.statut);
                const editable = ouvertDossier && x.statut !== "annule" && x.statut !== "archive";
                return (
                  <tr key={x.id} data-document={x.id} className={x.statut === "annule" ? "suj-annule" : undefined}>
                    <td><strong>{x.titre}</strong><span className="wf-petit">{libelleType(x.type)}{x.pages_souhaitees ? " · " + x.pages_souhaitees + " page" + (x.pages_souhaitees > 1 ? "s" : "") : ""}</span></td>
                    <td>{[x.classe_libelle, x.matiere_libelle].filter(Boolean).join(" - ") || "-"}</td>
                    <td data-attribution>
                      {x.responsable ? <span>{x.responsable.nom}{!x.responsable.compte_lie && <span className="badge badge-gold" style={{ marginLeft: "6px" }} title="Aucun compte n'est lié à cet enseignant : il ne sera pas prévenu.">compte non lié</span>}</span> : <span className="wf-petit" style={{ display: "inline" }}>Pas encore attribué</span>}
                      {x.co_redacteurs.length > 0 && <span className="wf-petit">{"Avec : " + x.co_redacteurs.map((c) => c.nom).join(", ")}</span>}
                    </td>
                    <td>{date ? dateFr(date) : "-"}{!x.date_limite && dos.date_limite ? <span className="wf-petit">date du dossier</span> : null}{ech && <span className={"badge " + ech.classe} data-echeance style={{ marginLeft: "6px" }}>{ech.texte}</span>}</td>
                    <td><span className={"badge " + st[1]}>{st[0]}</span>{x.statut === "annule" && x.motif_annulation && <span className="wf-petit">{x.motif_annulation}</span>}<NoteDecision doc={x} /></td>
                    <td><CelluleFichier x={x} token={token} /></td>
                    <td className="suj-actions">
                      {x.statut !== "annule" && <button type="button" className="btn-sm btn-primary" data-fichier onClick={() => setFenetre({ type: "fichier", doc: x })}>Fichier Word</button>}
                      {d.modifier && editable && x.statut !== "valide" && <button type="button" className="btn-sm btn-gray-cancel" data-attribuer onClick={() => setFenetre({ type: "attribution", doc: x })}>Attribuer</button>}
                      {d.modifier && editable && <button type="button" className="btn-sm btn-gray-cancel" data-modifier-document onClick={() => setFenetre({ type: "document", doc: x })}>Modifier</button>}
                      {d.annuler && ouvertDossier && x.statut === "a_preparer" && <button type="button" className="btn-sm btn-red" data-annuler onClick={() => setFenetre({ type: "annulation", doc: x })}>Annuler</button>}
                      {d.annuler && ouvertDossier && x.statut === "annule" && <button type="button" className="btn-sm btn-gray-cancel" data-retablir onClick={() => setFenetre({ type: "retablir", doc: x })}>Rétablir</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {fenetre && fenetre.type === "fichier" && <FenetreFichier token={token} doc={fenetre.doc} fermer={fermer} surChangement={charger} />}
      {fenetre && fenetre.type === "document" && <FenetreDocument token={token} dossier={dos} doc={fenetre.doc} enseignants={enseignants} fermer={fermer} apres={apresChangement(fenetre.doc ? "Document modifié." : "Document créé.")} />}
      {fenetre && fenetre.type === "attribution" && <FenetreAttribution token={token} doc={fenetre.doc} enseignants={enseignants} fermer={fermer} apres={async (doc, modifie) => { fermer(); setMessage(modifie ? "Attribution enregistrée : les personnes concernées sont prévenues." : "Rien n'a changé."); await charger(); }} />}
      {fenetre && fenetre.type === "annulation" && <FenetreAnnulation token={token} doc={fenetre.doc} fermer={fermer} apres={apresChangement("Document annulé. Les enseignants concernés sont prévenus.")} />}
      {fenetre && fenetre.type === "retablir" && (
        <Confirmation titre="Rétablir ce document ?" fermer={fermer} libelle="Rétablir" texte={"« " + fenetre.doc.titre + " » redevient « À préparer » et les enseignants attribués sont prévenus."}
          action={async () => { const r = await appeler(token, "document_annuler", { id: fenetre.doc.id, restaurer: true }); if (!r.ok) throw new Error(r.error); fermer(); setMessage("Document rétabli."); await charger(); }} />
      )}
      {fenetreDossier && (
        <FenetreDossier token={token} dossier={dos} annees={years} fermer={() => setFenetreDossier(false)}
          apres={async (nouveau) => { setFenetreDossier(false); setMessage("Dossier modifié."); await charger(); if (surDossier) surDossier({ ...dossier, ...nouveau }); }} />
      )}
    </div>
  );
}
