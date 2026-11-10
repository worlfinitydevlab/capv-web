import React, { useCallback, useEffect, useState } from "react";
import { appeler } from "./sujetsApi.js";
import { libelleType, dateFr, LIBELLE_DECISION } from "./sujetsFormat.js";
import { FenetreFichier } from "./FichierWord.jsx";
import { dateHeureLocale, tailleLisible } from "./fichiersApi.js";
import { Bascule, EtatVide, sansAccent } from "../pedagogie/Fenetre.jsx";

// Onglet « Validation » : les documents soumis par les enseignants, a examiner puis valider, renvoyer pour corrections ou refuser.
// L'examen se fait dans la fenetre « Fichier Word » (lecture du fichier ou du PDF exact, puis boutons de decision). Le serveur controle chaque geste.
export default function ValidationSujets({ token, ouvrirDocument, ouvrirVue }) {
  const [filtre, setFiltre] = useState("a_decider");
  const [donnees, setDonnees] = useState(null);
  const [erreur, setErreur] = useState("");
  const [recherche, setRecherche] = useState("");
  const [fichier, setFichier] = useState(null);

  const charger = useCallback(async () => {
    const r = await appeler(token, "soumissions", { filtre });
    if (r.ok) { setDonnees(r.data); setErreur(""); } else { setErreur(r.error); setDonnees((x) => x || { filtre, soumissions: [] }); }
  }, [token, filtre]);
  useEffect(() => { setDonnees(null); charger(); }, [charger]);
  useEffect(() => {
    if (!ouvrirDocument || !donnees) return;
    const it = (donnees.soumissions || []).find((x) => x.document.id === ouvrirDocument);
    if (it) setFichier(it.document);
  }, [ouvrirDocument, donnees]);

  const items = donnees ? donnees.soumissions : [];
  const f = sansAccent(recherche);
  const visibles = items.filter((x) => !f || sansAccent([x.document.titre, x.document.classe_libelle, x.document.matiere_libelle, x.document.responsable, x.document.dossier && x.document.dossier.nom].join(" ")).includes(f));
  const aDecider = filtre === "a_decider";
  return (
    <div data-vue="validation">
      <div className="wf-barre">
        <div className="wf-barre-g"><h2>Validation des sujets</h2><span className="wf-compte" data-compte>{donnees ? visibles.length + (aDecider ? (visibles.length > 1 ? " à décider" : " à décider") : (visibles.length > 1 ? " décidés" : " décidé")) : ""}</span></div>
        <div className="wf-barre-d">
          <input className="wf-recherche" type="search" value={recherche} placeholder="Rechercher un document..." onChange={(e) => setRecherche(e.target.value)} />
          <Bascule valeur={filtre} options={[["a_decider", "À décider"], ["decides", "Déjà décidés"]]} onChange={setFiltre} />
          <button type="button" className="btn-gray-cancel btn-sm" data-actualiser onClick={charger}>Actualiser</button>
        </div>
      </div>
      {erreur && <div className="login-error" style={{ marginBottom: "12px" }} data-erreur="validation">{erreur}</div>}
      {donnees === null && !erreur && <p className="wf-petit">Chargement…</p>}
      {donnees !== null && items.length === 0 && !erreur && (
        <EtatVide titre={aDecider ? "Aucun sujet n'attend ta décision" : "Aucune décision pour le moment"} texte={aDecider ? "Quand un enseignant soumet un sujet, un corrigé ou un barème, tu es prévenu par la cloche et il apparaît ici." : "Les documents validés, renvoyés pour corrections ou refusés apparaîtront ici."} />
      )}
      {items.length > 0 && visibles.length === 0 && <p className="wf-petit">Aucun document ne correspond à ta recherche.</p>}
      {donnees && donnees.tronque && <p className="wf-petit">La liste est tronquée : affine ta recherche.</p>}
      {visibles.length > 0 && (
        <div className="table-card">
          <table className="data-table" data-table="validation">
            <thead><tr><th>Document</th><th>Dossier</th><th>Classe / matière</th><th>Rédacteur</th><th>{aDecider ? "Soumis" : "Décision"}</th><th></th></tr></thead>
            <tbody>
              {visibles.map((x) => {
                const d = x.document, s = x.soumission;
                const dec = s && s.decision ? LIBELLE_DECISION[s.decision] : null;
                return (
                  <tr key={d.id} data-document={d.id}>
                    <td><strong>{d.titre}</strong><span className="wf-petit">{libelleType(d.type)}{x.fichier ? " · version " + (s ? s.version : x.fichier.numero) + " (" + tailleLisible(x.fichier.taille) + ")" : ""}{x.fichier && x.fichier.pdf ? " · PDF prêt" : ""}</span></td>
                    <td>{d.dossier ? d.dossier.nom : "-"}{d.dossier && d.dossier.periode_libelle ? <span className="wf-petit">{d.dossier.periode_libelle}</span> : null}</td>
                    <td>{[d.classe_libelle, d.matiere_libelle].filter(Boolean).join(" - ") || "-"}</td>
                    <td>{d.responsable || <span className="wf-petit" style={{ display: "inline" }}>Non attribué</span>}{d.co_redacteurs && d.co_redacteurs.length > 0 && <span className="wf-petit">{"Avec : " + d.co_redacteurs.join(", ")}</span>}</td>
                    <td data-soumission>
                      {aDecider && s && <span>{dateHeureLocale(s.soumis_le)}<span className="wf-petit">{"par " + (s.soumis_nom || s.soumis_par)}</span>{s.note && <span className="wf-petit" data-note-soumission>{"« " + s.note + " »"}</span>}</span>}
                      {!aDecider && s && dec && <span><span className={"badge " + dec[1]}>{dec[0]}</span><span className="wf-petit">{"par " + (s.decide_nom || "le secrétariat") + " le " + dateFr(s.decide_le)}</span>{s.observation && <span className="wf-petit">{"« " + s.observation + " »"}</span>}</span>}
                    </td>
                    <td className="suj-actions">
                      <button type="button" className="btn-sm btn-primary" data-examiner onClick={() => setFichier(d)}>{aDecider ? "Examiner" : "Ouvrir"}</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {fichier && <FenetreFichier token={token} doc={fichier} fermer={() => setFichier(null)} surChangement={charger} />}
    </div>
  );
}
