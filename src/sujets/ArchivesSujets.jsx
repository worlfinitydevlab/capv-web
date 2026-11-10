import React, { useCallback, useEffect, useMemo, useState } from "react";
import { appeler } from "./sujetsApi.js";
import { libelleType, dateFr, statutDoc, octetsFr } from "./sujetsFormat.js";
import { FenetreFichier } from "./FichierWord.jsx";
import { tailleLisible } from "./fichiersApi.js";
import { Fenetre, Confirmation, EtatVide, sansAccent } from "../pedagogie/Fenetre.jsx";

// Onglet « Archives » : les documents VALIDES (a archiver) et ARCHIVES, avec leur version officielle.
// Archiver ne supprime rien. La seule suppression du module est la PURGE (administrateur) : elle retire les anciens fichiers d'un examen archive
// et garde la version officielle ; chaque purge est notee dans l'historique.
export default function ArchivesSujets({ token, droits, estAdmin }) {
  const d = droits || {};
  const [statut, setStatut] = useState("tous");
  const [dossierId, setDossierId] = useState("");
  const [recherche, setRecherche] = useState("");
  const [donnees, setDonnees] = useState(null);
  const [erreur, setErreur] = useState("");
  const [message, setMessage] = useState("");
  const [choisis, setChoisis] = useState([]);
  const [fichier, setFichier] = useState(null);
  const [fenetre, setFenetre] = useState(null);      // { type: "archiver" } | { type: "purge", item }

  const charger = useCallback(async () => {
    const r = await appeler(token, "archives", { statut: statut === "tous" ? undefined : statut });
    if (r.ok) { setDonnees(r.data); setErreur(""); } else { setErreur(r.error); setDonnees((x) => x || { documents: [] }); }
  }, [token, statut]);
  useEffect(() => { setDonnees(null); setChoisis([]); charger(); }, [charger]);
  useEffect(() => { if (!message) return undefined; const t = setTimeout(() => setMessage(""), 8000); return () => clearTimeout(t); }, [message]);

  const tous = donnees ? donnees.documents : [];
  const dossiers = useMemo(() => {
    const m = new Map();
    tous.forEach((x) => { if (x.document.dossier) m.set(x.document.dossier.id, x.document.dossier.nom); });
    return Array.from(m.entries()).sort((a, b) => String(a[1]).localeCompare(String(b[1]), "fr"));
  }, [tous]);
  const f = sansAccent(recherche);
  const visibles = tous.filter((x) => (!dossierId || (x.document.dossier && x.document.dossier.id === dossierId)) && (!f || sansAccent([x.document.titre, x.document.classe_libelle, x.document.matiere_libelle, x.document.responsable, x.document.dossier && x.document.dossier.nom].join(" ")).includes(f)));
  const archivables = visibles.filter((x) => x.document.statut === "valide");
  const idsVisibles = new Set(archivables.map((x) => x.document.id));
  const choisisVisibles = choisis.filter((i) => idsVisibles.has(i));
  const basculer = (id) => setChoisis((l) => (l.includes(id) ? l.filter((x) => x !== id) : l.concat([id])));
  const toutChoisi = archivables.length > 0 && choisisVisibles.length === archivables.length;

  return (
    <div data-vue="archives">
      <div className="wf-barre">
        <div className="wf-barre-g"><h2>Documents validés et archives</h2><span className="wf-compte" data-compte>{donnees ? visibles.length + (visibles.length > 1 ? " documents" : " document") : ""}</span></div>
        <div className="wf-barre-d">
          <input className="wf-recherche" type="search" value={recherche} placeholder="Rechercher un document..." onChange={(e) => setRecherche(e.target.value)} />
          <select data-filtre="dossier" value={dossierId} onChange={(e) => setDossierId(e.target.value)} aria-label="Dossier">
            <option value="">Tous les dossiers</option>
            {dossiers.map(([id, nom]) => <option key={id} value={id}>{nom}</option>)}
          </select>
          <select data-filtre="statut" value={statut} onChange={(e) => setStatut(e.target.value)} aria-label="Statut">
            <option value="tous">Validés et archivés</option><option value="valide">À archiver (validés)</option><option value="archive">Archivés</option>
          </select>
          <button type="button" className="btn-gray-cancel btn-sm" data-actualiser onClick={charger}>Actualiser</button>
          {d.modifier && <button type="button" className="btn-primary" data-archiver-selection disabled={choisisVisibles.length === 0} onClick={() => setFenetre({ type: "archiver" })}>{"Archiver la sélection" + (choisisVisibles.length ? " (" + choisisVisibles.length + ")" : "")}</button>}
        </div>
      </div>
      {message && <div data-message className="suj-ok">{message}</div>}
      {erreur && <div className="login-error" style={{ marginBottom: "12px" }} data-erreur="archives">{erreur}</div>}
      {donnees === null && !erreur && <p className="wf-petit">Chargement…</p>}
      {donnees !== null && tous.length === 0 && !erreur && <EtatVide titre="Aucun document validé pour le moment" texte={"Quand un sujet est validé, il apparaît ici avec sa version officielle. Tu peux ensuite l'archiver : rien n'est supprimé."} />}
      {tous.length > 0 && visibles.length === 0 && <p className="wf-petit">Aucun document ne correspond à ta recherche ou à ces filtres.</p>}
      {visibles.length > 0 && (
        <div className="table-card">
          <table className="data-table" data-table="archives">
            <thead><tr>
              <th style={{ width: "34px" }}>{d.modifier && archivables.length > 0 && <input type="checkbox" data-tout-choisir aria-label="Tout choisir" checked={toutChoisi} onChange={() => setChoisis(toutChoisi ? choisis.filter((i) => !idsVisibles.has(i)) : Array.from(new Set(choisis.concat(archivables.map((x) => x.document.id)))))} />}</th>
              <th>Document</th><th>Dossier</th><th>Classe / matière</th><th>Version officielle</th><th>Statut</th><th>Versions</th><th></th>
            </tr></thead>
            <tbody>
              {visibles.map((x) => {
                const doc = x.document, st = statutDoc(doc.statut);
                return (
                  <tr key={doc.id} data-document={doc.id}>
                    <td>{d.modifier && doc.statut === "valide" && <input type="checkbox" data-choisir aria-label={"Choisir " + doc.titre} checked={choisis.includes(doc.id)} onChange={() => basculer(doc.id)} />}</td>
                    <td><strong>{doc.titre}</strong><span className="wf-petit">{libelleType(doc.type)}{doc.responsable ? " · " + doc.responsable : ""}</span></td>
                    <td>{doc.dossier ? doc.dossier.nom : "-"}{doc.dossier && doc.dossier.periode_libelle ? <span className="wf-petit">{doc.dossier.periode_libelle}</span> : null}</td>
                    <td>{[doc.classe_libelle, doc.matiere_libelle].filter(Boolean).join(" - ") || "-"}</td>
                    <td data-officielle>{x.officielle ? <span>{"v" + x.officielle.numero}<span className="wf-petit">{tailleLisible(x.officielle.taille)}{x.officielle.pdf ? " · PDF prêt" : ""}</span></span> : "-"}</td>
                    <td><span className={"badge " + st[1]}>{st[0]}</span>{doc.statut === "archive" && doc.archive_le && <span className="wf-petit">{"le " + dateFr(doc.archive_le) + (doc.archive_par ? " par " + doc.archive_par : "")}</span>}</td>
                    <td data-versions>{x.nb_versions}{x.nb_purgees > 0 && <span className="wf-petit">{x.nb_purgees + " purgée" + (x.nb_purgees > 1 ? "s" : "")}</span>}</td>
                    <td className="suj-actions">
                      <button type="button" className="btn-sm btn-primary" data-ouvrir-fichier onClick={() => setFichier(doc)}>Ouvrir</button>
                      {estAdmin && doc.statut === "archive" && x.a_purger.nombre > 0 && <button type="button" className="btn-sm btn-red" data-purger onClick={() => setFenetre({ type: "purge", item: x })}>{"Purger (" + x.a_purger.nombre + ")"}</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {fichier && <FenetreFichier token={token} doc={fichier} fermer={() => setFichier(null)} surChangement={charger} />}
      {fenetre && fenetre.type === "archiver" && (
        <Confirmation titre="Archiver ces documents ?" libelle={"Archiver " + choisisVisibles.length + " document" + (choisisVisibles.length > 1 ? "s" : "")} fermer={() => setFenetre(null)}
          texte={"Les versions officielles sont gardées. Les documents archivés ne peuvent plus être modifiés ni soumis. Un administrateur peut les sortir des archives si besoin."}
          action={async () => {
            const r = await appeler(token, "archiver", { document_ids: choisisVisibles });
            if (!r.ok) throw new Error(r.error);
            setFenetre(null); setChoisis([]);
            const ign = (r.data.ignores || []).length;
            setMessage(r.data.archives + " document" + (r.data.archives > 1 ? "s" : "") + " archivé" + (r.data.archives > 1 ? "s" : "") + "." + (ign ? " " + ign + " ignoré" + (ign > 1 ? "s" : "") + " (déjà archivé ou plus validé)." : ""));
            await charger();
          }} />
      )}
      {fenetre && fenetre.type === "purge" && (
        <FenetrePurge token={token} item={fenetre.item} fermer={() => setFenetre(null)}
          apres={async (res) => {
            setFenetre(null);
            setMessage(res.purgees + " ancienne" + (res.purgees > 1 ? "s" : "") + " version" + (res.purgees > 1 ? "s" : "") + " purgée" + (res.purgees > 1 ? "s" : "") + " (" + octetsFr(res.octets_liberes) + " libérés). La version officielle est gardée." + (res.echecs && res.echecs.length ? " Attention : " + res.echecs.length + " version(s) n'ont pas pu être supprimées, relance la purge." : ""));
            await charger();
          }} />
      )}
    </div>
  );
}

// Purge des anciennes versions d'un examen ARCHIVE (administrateur) : definitive, donc confirmation explicite.
function FenetrePurge({ token, item, fermer, apres }) {
  const doc = item.document;
  const [compris, setCompris] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState("");
  const a = item.a_purger;
  const purger = async () => {
    setOccupe(true); setErreur("");
    const r = await appeler(token, "purger", { document_id: doc.id, confirmer: true, attendu: a.nombre });
    setOccupe(false);
    if (!r.ok) { setErreur(r.error); return; }
    apres(r.data);
  };
  return (
    <Fenetre titre="Purger les anciennes versions" sousTitre={doc.titre} fermer={fermer} occupe={occupe} largeur="520px"
      pied={<>
        <button type="button" className="btn-gray-cancel" data-annuler-purge disabled={occupe} onClick={fermer}>Annuler</button>
        <button type="button" className="btn-red" data-confirmer-purge disabled={occupe || !compris} onClick={purger}>{occupe ? "Purge en cours..." : "Purger définitivement"}</button>
      </>}>
      <p className="wf-texte" data-resume-purge>{"On va supprimer les fichiers de " + a.nombre + " ancienne" + (a.nombre > 1 ? "s" : "") + " version" + (a.nombre > 1 ? "s" : "") + " (v" + a.numeros.join(", v") + "), soit " + octetsFr(a.octets) + " libérés."}</p>
      <ul style={{ margin: "8px 0 10px 18px", fontSize: "13px", lineHeight: 1.6 }}>
        <li>{"La version officielle (v" + (item.officielle ? item.officielle.numero : "?") + ") est gardée, avec son PDF."}</li>
        <li>{"Les fiches des versions purgées restent (date, auteur, empreinte) : l'historique est complet."}</li>
        <li>{"Les copies déjà rangées sur le poste principal ne sont pas touchées."}</li>
        <li><strong>{"C'est définitif : les fichiers supprimés ne peuvent pas être récupérés."}</strong></li>
      </ul>
      <label className="suj-case"><input type="checkbox" data-champ="purge-confirmer" checked={compris} disabled={occupe} onChange={(e) => setCompris(e.target.checked)} /> {"Je comprends que c'est définitif"}</label>
      {erreur && <div className="login-error" style={{ marginTop: "10px" }} data-erreur="purge">{erreur}</div>}
    </Fenetre>
  );
}
