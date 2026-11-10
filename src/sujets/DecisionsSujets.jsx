import React, { useState } from "react";
import { appeler } from "./sujetsApi.js";
import { dateFr, LIBELLE_DECISION } from "./sujetsFormat.js";
import { dateHeureLocale } from "./fichiersApi.js";

// Soumission et decisions des Sujets d'examens (etape S4). Tout est decide et controle par le serveur : ici on affiche ce qu'il autorise (champ « peut »)
// et on envoie les gestes. Rien n'est supprime : chaque soumission et chaque decision reste dans l'historique du document.

// Une ligne courte sous le statut d'un document, dans les listes
export function NoteDecision({ doc }) {
  const s = doc && doc.soumission;
  if (!s) return null;
  const nom = s.decide_nom || "le secrétariat";
  if (doc.statut === "soumis") return <span className="wf-petit" data-note-decision="soumis">{"Version " + s.version + " soumise le " + dateFr(s.soumis_le) + (s.soumis_nom ? " par " + s.soumis_nom : "")}</span>;
  if ((doc.statut === "a_corriger" || doc.statut === "refuse") && s.decision === doc.statut) {
    return <span className="wf-petit" data-note-decision={doc.statut} title={s.observation || ""}>{(doc.statut === "refuse" ? "Refusé par " : "Corrections demandées par ") + nom + (s.observation ? " : « " + s.observation + " »" : "")}</span>;
  }
  return null;
}

const ANNEE_ETAT = { soumis: "suj-etat-autre", a_corriger: "suj-etat-alerte", refuse: "suj-etat-alerte", valide: "suj-etat-libre", archive: "suj-etat-libre" };

// Dans la fenetre « Fichier Word » : l'etat de validation, les boutons autorises et l'historique des soumissions.
// agir(fn) : lance un geste (une action a la fois, l'ecran se recharge ensuite) ; dire(texte) : message de reussite.
export function ActionsValidation({ token, doc, etat, occupe, agir, dire, exiger }) {
  const [mode, setMode] = useState(null);          // "soumettre" | "decider" | "rouvrir"
  const [decision, setDecision] = useState("valide");
  const [texte, setTexte] = useState("");
  const [localErr, setLocalErr] = useState("");
  const peut = etat.peut || {};
  const d = etat.document || {};
  const soumissions = etat.soumissions || [];
  const derniere = soumissions[0] || null;
  const courante = d.version_courante;
  const annuler = () => { setMode(null); setTexte(""); setLocalErr(""); };

  let bandeau = null;
  if (d.statut === "soumis" && derniere) bandeau = "Ce document est soumis pour validation (version " + derniere.version + ", par " + (derniere.soumis_nom || derniere.soumis_par) + " le " + dateHeureLocale(derniere.soumis_le) + "). Le secrétariat doit se prononcer ; en attendant, il ne peut plus être modifié." + (derniere.note ? " Note : « " + derniere.note + " »." : "");
  else if (d.statut === "a_corriger" && derniere && derniere.decision === "a_corriger") bandeau = "Des corrections sont demandées par " + (derniere.decide_nom || "le secrétariat") + " (" + dateHeureLocale(derniere.decide_le) + ") : « " + (derniere.observation || "") + " ». Reprends la main, corrige, dépose une nouvelle version, puis soumets-la de nouveau.";
  else if (d.statut === "refuse" && derniere && derniere.decision === "refuse") bandeau = "Ce document a été refusé par " + (derniere.decide_nom || "le secrétariat") + " (" + dateHeureLocale(derniere.decide_le) + ") : « " + (derniere.observation || "") + " ». Un administrateur peut le rouvrir.";
  else if (d.statut === "valide" && d.version_validee) bandeau = "Document validé : la version " + d.version_validee + " est la version officielle. Elle ne change plus.";
  else if (d.statut === "archive" && d.version_validee) bandeau = "Document archivé : la version " + d.version_validee + " est la version officielle.";

  const soumettre = () => agir(async () => {
    exiger(await appeler(token, "soumettre", { document_id: doc.id, note: texte.trim() || undefined }));
    annuler();
    dire("Version " + courante + " soumise : le secrétariat est prévenu. Tu seras prévenu de sa décision.");
  });
  const decider = () => {
    const obligatoire = decision !== "valide";
    if (obligatoire && texte.trim().length < 3) { setLocalErr(decision === "refuse" ? "Explique pourquoi le sujet est refusé (3 caractères au moins)." : "Dis ce qu'il faut corriger (3 caractères au moins)."); return; }
    setLocalErr("");
    agir(async () => {
      const r = exiger(await appeler(token, "decider", { document_id: doc.id, decision, observation: texte.trim() || undefined }));
      annuler();
      dire(decision === "valide" ? "Sujet validé : la version " + r.data.version + " est maintenant la version officielle. Les rédacteurs sont prévenus." : decision === "a_corriger" ? "Corrections demandées : les rédacteurs sont prévenus avec ton observation." : "Sujet refusé : les rédacteurs sont prévenus avec ta justification.");
    });
  };
  const rouvrir = () => {
    if (texte.trim().length < 3) { setLocalErr("Explique brièvement pourquoi (3 caractères au moins)."); return; }
    setLocalErr("");
    agir(async () => {
      const r = exiger(await appeler(token, "rouvrir", { document_id: doc.id, motif: texte.trim() }));
      annuler();
      dire("Document rouvert : il est maintenant « " + ({ a_preparer: "à préparer", en_cours: "en cours", valide: "validé" }[r.data.statut] || r.data.statut) + " ». L'action est notée dans l'historique.");
    });
  };

  const consequence = d.statut === "valide" ? "Le document repasse « en cours » : la version officielle est retirée et les rédacteurs sont prévenus. Il faudra une nouvelle version avant de le soumettre." : d.statut === "refuse" ? "Le document repasse « à préparer » et les rédacteurs sont prévenus." : "Le document revient à « validé » (il quitte les archives).";
  const aBoutons = peut.soumettre || peut.decider || peut.rouvrir;
  if (!bandeau && !aBoutons && soumissions.length === 0) return null;
  return (
    <div data-bloc="validation">
      {bandeau && <div className={"suj-etat " + (ANNEE_ETAT[d.statut] || "")} data-statut-info={d.statut} role="status">{bandeau}</div>}
      {aBoutons && mode === null && (
        <div className="suj-rangee" data-actions-validation>
          {peut.soumettre && <button type="button" className="btn-primary" data-soumettre disabled={occupe} onClick={() => { setMode("soumettre"); setTexte(""); }}>Soumettre pour validation</button>}
          {peut.decider && <button type="button" className="btn-primary" data-decision="valide" disabled={occupe} onClick={() => { setMode("decider"); setDecision("valide"); setTexte(""); }}>Valider</button>}
          {peut.decider && <button type="button" className="btn-gray-cancel" data-decision="a_corriger" disabled={occupe} onClick={() => { setMode("decider"); setDecision("a_corriger"); setTexte(""); }}>Demander des corrections</button>}
          {peut.decider && <button type="button" className="btn-sm btn-red" data-decision="refuse" disabled={occupe} onClick={() => { setMode("decider"); setDecision("refuse"); setTexte(""); }}>Refuser</button>}
          {peut.rouvrir && <button type="button" className="btn-sm btn-gray-cancel" data-rouvrir-document disabled={occupe} onClick={() => { setMode("rouvrir"); setTexte(""); }}>Rouvrir ce document</button>}
        </div>
      )}
      {mode === "soumettre" && peut.soumettre && (
        <div className="suj-bloc" data-bloc="soumettre" style={{ marginTop: "10px" }}>
          <strong>{"Soumettre la version " + courante + " pour validation ?"}</strong>
          <p className="wf-aide">{"Après la soumission, tu ne peux plus modifier ce document (sauf si le secrétariat demande des corrections). Si tu as la main sur le document, elle est rendue."}</p>
          <div className="form-group"><label htmlFor="sf-soumission">{"Un mot pour le secrétariat (facultatif)"}</label><input id="sf-soumission" data-champ="soumission-note" value={texte} maxLength={1000} onChange={(e) => setTexte(e.target.value)} placeholder="Ex. : prêt, l'exercice 3 est nouveau" /></div>
          <div className="suj-rangee"><button type="button" className="btn-primary" data-confirmer-soumission disabled={occupe} onClick={soumettre}>{occupe ? "En cours..." : "Soumettre la version " + courante}</button><button type="button" className="btn-gray-cancel" data-annuler-validation disabled={occupe} onClick={annuler}>Annuler</button></div>
        </div>
      )}
      {mode === "decider" && peut.decider && (
        <div className="suj-bloc" data-bloc="decider" style={{ marginTop: "10px" }}>
          <strong>{decision === "valide" ? "Valider la version " + (derniere ? derniere.version : courante) + " ?" : decision === "a_corriger" ? "Demander des corrections" : "Refuser ce document"}</strong>
          <p className="wf-aide">{decision === "valide" ? "Cette version devient la version officielle du document : elle ne change plus. Les rédacteurs sont prévenus." : decision === "a_corriger" ? "Le document retourne aux rédacteurs avec ton observation ; ils déposent une nouvelle version et la soumettent de nouveau." : "Le document est refusé avec ta justification. Un administrateur pourra le rouvrir si besoin."}</p>
          <div className="form-group"><label htmlFor="sf-decision">{decision === "valide" ? "Observation (facultatif)" : decision === "a_corriger" ? "Ce qu'il faut corriger (obligatoire)" : "Justification (obligatoire)"}</label><input id="sf-decision" data-champ="decision-observation" value={texte} maxLength={1000} onChange={(e) => setTexte(e.target.value)} placeholder={decision === "valide" ? "Ex. : très bien, merci" : decision === "a_corriger" ? "Ex. : l'énoncé de l'exercice 3 est ambigu" : "Ex. : hors programme"} /></div>
          {localErr && <div className="login-error" data-erreur="validation" style={{ marginBottom: "8px" }}>{localErr}</div>}
          <div className="suj-rangee"><button type="button" className={decision === "refuse" ? "btn-red" : "btn-primary"} data-confirmer-decision disabled={occupe} onClick={decider}>{occupe ? "En cours..." : decision === "valide" ? "Valider cette version" : decision === "a_corriger" ? "Envoyer la demande de corrections" : "Refuser le document"}</button><button type="button" className="btn-gray-cancel" data-annuler-validation disabled={occupe} onClick={annuler}>Annuler</button></div>
        </div>
      )}
      {mode === "rouvrir" && peut.rouvrir && (
        <div className="suj-bloc" data-bloc="rouvrir" style={{ marginTop: "10px" }}>
          <strong>Rouvrir ce document ?</strong>
          <p className="wf-aide">{consequence}</p>
          <div className="form-group"><label htmlFor="sf-rouvrir">Motif (obligatoire)</label><input id="sf-rouvrir" data-champ="rouverture-motif" value={texte} maxLength={1000} onChange={(e) => setTexte(e.target.value)} placeholder="Ex. : erreur de frappe dans la question 2" /></div>
          {localErr && <div className="login-error" data-erreur="validation" style={{ marginBottom: "8px" }}>{localErr}</div>}
          <div className="suj-rangee"><button type="button" className="btn-red" data-confirmer-rouverture disabled={occupe} onClick={rouvrir}>Rouvrir le document</button><button type="button" className="btn-gray-cancel" data-annuler-validation disabled={occupe} onClick={annuler}>Annuler</button></div>
        </div>
      )}
      {soumissions.length > 0 && (
        <details className="suj-historique-soumissions" data-historique-soumissions style={{ marginTop: "10px" }}>
          <summary>{"Historique des soumissions (" + soumissions.length + ")"}</summary>
          <ul style={{ margin: "6px 0 0 18px", padding: 0, fontSize: "13px", lineHeight: 1.6 }}>
            {soumissions.map((s, i) => {
              const dec = s.decision ? LIBELLE_DECISION[s.decision] : null;
              return (
                <li key={i} data-soumission={s.version}>
                  {"Version " + s.version + " soumise par " + (s.soumis_nom || s.soumis_par) + " le " + dateHeureLocale(s.soumis_le)}
                  {s.note ? " (« " + s.note + " »)" : ""}
                  {" → "}
                  {dec ? <span><span className={"badge " + dec[1]}>{dec[0]}</span>{" par " + (s.decide_nom || "le secrétariat") + " le " + dateHeureLocale(s.decide_le) + (s.observation ? " : « " + s.observation + " »" : "")}</span> : <span className="badge badge-blue">En attente de décision</span>}
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </div>
  );
}
