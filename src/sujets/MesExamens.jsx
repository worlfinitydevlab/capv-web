import React, { useCallback, useEffect, useState } from "react";
import { appeler } from "./sujetsApi.js";
import { libelleType, dateFr, statutDoc, echeance } from "./sujetsFormat.js";
import { FenetreDetail } from "./FenetresSujets.jsx";
import { FenetreFichier, CelluleFichier } from "./FichierWord.jsx";
import { NoteDecision } from "./DecisionsSujets.jsx";
import { EtatVide } from "../pedagogie/Fenetre.jsx";

// Onglet « Mes examens » : les documents d'examens attribues a l'enseignant lie au compte connecte (responsable ou co-redacteur).
// Le serveur ne renvoie que ses propres documents. Un compte non lie recoit une explication claire, jamais une erreur.
export default function MesExamens({ token, ouvrirDocument, ouvrirVue }) {
  const [etat, setEtat] = useState(null);      // { lie, documents, aujourdhui }
  const [erreur, setErreur] = useState("");
  const [detail, setDetail] = useState(null);
  const [fichier, setFichier] = useState(null);    // document dont on ouvre la fenetre « Fichier Word »
  const [annules, setAnnules] = useState(false);

  const charger = useCallback(async () => {
    const r = await appeler(token, "mes_examens");
    if (r.ok) { setEtat(r.data); setErreur(""); } else { setErreur(r.error); setEtat((x) => x || { lie: true, documents: [] }); }
  }, [token]);
  useEffect(() => { setEtat(null); charger(); }, [charger]);
  useEffect(() => {
    if (!ouvrirDocument || !etat) return;
    const d = (etat.documents || []).find((x) => x.id === ouvrirDocument);
    if (d) { if (ouvrirVue === "fichier" || ouvrirVue === "conflit") setFichier(d); else setDetail(d); }
  }, [ouvrirDocument, etat]);

  if (!etat) return <p className="wf-petit">Chargement…</p>;
  const docs = etat.documents || [];
  const visibles = docs.filter((x) => annules || x.statut !== "annule");
  const nbAnnules = docs.length - docs.filter((x) => x.statut !== "annule").length;
  return (
    <div data-vue="mes-examens">
      <div className="wf-barre">
        <div className="wf-barre-g"><h2>Mes examens</h2><span className="wf-compte" data-compte>{etat.lie ? visibles.length + (visibles.length > 1 ? " documents" : " document") : ""}</span></div>
        <div className="wf-barre-d">
          {nbAnnules > 0 && <label className="suj-case"><input type="checkbox" data-annules checked={annules} onChange={(e) => setAnnules(e.target.checked)} /> {"Afficher les documents annulés (" + nbAnnules + ")"}</label>}
          <button type="button" className="btn-gray-cancel btn-sm" data-actualiser onClick={charger}>Actualiser</button>
        </div>
      </div>
      {erreur && <div className="login-error" style={{ marginBottom: "12px" }} data-erreur="mes-examens">{erreur}</div>}
      {!etat.lie && (
        <EtatVide titre="Ton compte n'est pas lié à un enseignant" texte={"Pour recevoir des sujets d'examens à préparer, ton compte doit être lié à ta fiche d'enseignant. Demande à un administrateur de faire le lien (Utilisateurs > Enseignant)."} />
      )}
      {etat.lie && docs.length === 0 && !erreur && <EtatVide titre="Aucun sujet ne t'est attribué pour le moment" texte={"Quand le secrétariat t'attribuera un sujet, un corrigé ou un barème, tu seras prévenu par la cloche et tu le retrouveras ici avec sa date limite et ses consignes."} />}
      {etat.lie && docs.length > 0 && visibles.length === 0 && <p className="wf-petit">Tous tes documents sont annulés.</p>}
      {visibles.length > 0 && (
        <div className="table-card">
          <table className="data-table" data-table="mes-examens">
            <thead><tr><th>Document</th><th>Dossier</th><th>Classe / matière</th><th>Mon rôle</th><th>Date limite</th><th>Statut</th><th>Fichier Word</th><th></th></tr></thead>
            <tbody>
              {visibles.map((x) => {
                const st = statutDoc(x.statut);
                const ech = echeance(x.date_limite_effective, x.statut, etat.aujourdhui);
                return (
                  <tr key={x.id} data-document={x.id} className={x.statut === "annule" ? "suj-annule" : undefined}>
                    <td><strong>{x.titre}</strong><span className="wf-petit">{libelleType(x.type)}{x.pages_souhaitees ? " · " + x.pages_souhaitees + " page" + (x.pages_souhaitees > 1 ? "s" : "") : ""}</span></td>
                    <td>{x.dossier ? x.dossier.nom : "-"}{x.dossier && x.dossier.periode_libelle ? <span className="wf-petit">{x.dossier.periode_libelle}</span> : null}</td>
                    <td>{[x.classe_libelle, x.matiere_libelle].filter(Boolean).join(" - ") || "-"}</td>
                    <td>{x.mon_role === "responsable" ? "Responsable" : "Co-rédacteur"}</td>
                    <td>{x.date_limite_effective ? dateFr(x.date_limite_effective) : "-"}{ech && <span className={"badge " + ech.classe} data-echeance style={{ marginLeft: "6px" }}>{ech.texte}</span>}</td>
                    <td><span className={"badge " + st[1]}>{st[0]}</span><NoteDecision doc={x} /></td>
                    <td><CelluleFichier x={x} token={token} /></td>
                    <td className="suj-actions">
                      {x.statut !== "annule" && <button type="button" className="btn-sm btn-primary" data-fichier onClick={() => setFichier(x)}>Fichier Word</button>}
                      <button type="button" className="btn-sm btn-gray-cancel" data-details onClick={() => setDetail(x)}>Détails</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {detail && <FenetreDetail doc={detail} fermer={() => setDetail(null)} />}
      {fichier && <FenetreFichier token={token} doc={fichier} fermer={() => setFichier(null)} surChangement={charger} />}
    </div>
  );
}
