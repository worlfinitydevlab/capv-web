import React, { useCallback, useEffect, useRef, useState } from "react";
import { appeler } from "./sujetsApi.js";
import { Fenetre } from "../pedagogie/Fenetre.jsx";
import { statutDoc } from "./sujetsFormat.js";
import { deposerFichier, telechargerFichier, tailleLisible, heureLocale, dateHeureLocale, dureeFr } from "./fichiersApi.js";
import { LectureWord } from "./LectureWord.jsx";
import { LecturePdf } from "./LecturePdf.jsx";
import { ActionsValidation } from "./DecisionsSujets.jsx";

// Fichier Word d'un document d'examen : creer le modele pre-rempli, prendre la main (verrou), telecharger, deposer sa version, voir les versions.
// Tout est decide et controle par le serveur : ici on ne fait qu'afficher ce qu'il autorise (reponse « versions », champ « peut »).

// Resume pour les listes (Mes examens, Dossiers) ; avec le jeton, un lien « Lire » ouvre la version courante dans le site (sans Word)
export function CelluleFichier({ x, token }) {
  const [lire, setLire] = useState(false);
  const v = x.verrou;
  const actif = !!v && new Date(v.expire_le).getTime() > Date.now();
  return (
    <span data-fichier-resume>
      {x.nb_versions > 0
        ? <span>{x.version_courante ? "Version " + x.version_courante : "Version à choisir"}{x.nb_versions > 1 ? <span className="wf-petit" style={{ display: "inline" }}>{" (" + x.nb_versions + " au total)"}</span> : null}</span>
        : <span className="wf-petit" style={{ display: "inline" }}>Pas de fichier</span>}
      {token && x.nb_versions > 0 && x.version_courante && <button type="button" className="suj-lien" data-lire-resume style={{ marginLeft: "6px" }} onClick={() => setLire(true)}>Lire</button>}
      {lire && <LectureWord token={token} doc={x} fermer={() => setLire(false)} />}
      {x.version_validee ? <span className="badge badge-ok" data-officielle-resume style={{ marginLeft: "6px" }} title="Version officielle : elle ne change plus">{"Officielle : v" + x.version_validee}</span> : null}
      {x.conflits > 0 && <span className="badge badge-err" data-conflits style={{ marginLeft: "6px" }}>{x.conflits + " à vérifier"}</span>}
      {actif && <span className="wf-petit" data-verrou-resume>{v.moi ? "Tu as la main" : "En modification : " + (v.nom || "un rédacteur")}</span>}
    </span>
  );
}

const exiger = (r) => { if (!r.ok) throw new Error(r.error); return r; };

export function FenetreFichier({ token, doc, fermer, surChangement }) {
  const [etat, setEtat] = useState(null);          // reponse de « versions »
  const [erreur, setErreur] = useState("");              // erreur de la derniere action
  const [erreurCharge, setErreurCharge] = useState("");  // erreur au chargement des versions (ex. tables absentes)
  const [info, setInfo] = useState("");
  const [occupe, setOccupe] = useState(false);
  const [depot, setDepot] = useState(false);
  const [fichier, setFichier] = useState(null);
  const [note, setNote] = useState("");
  const [forcer, setForcer] = useState(false);
  const [motifForce, setMotifForce] = useState("");
  const [retenir, setRetenir] = useState(null);    // numero de la version a retenir (administrateur)
  const [noteRetenue, setNoteRetenue] = useState("");
  const [maintenant, setMaintenant] = useState(Date.now());
  const [lecture, setLecture] = useState(null);    // { numero } : la fenetre de lecture est ouverte (numero vide = version courante)
  const [lecturePdf, setLecturePdf] = useState(null);  // { numero } : le PDF exact (fabrique par Word sur le poste principal) est ouvert
  const vivant = useRef(true);
  const saisie = useRef(null);
  useEffect(() => { vivant.current = true; return () => { vivant.current = false; }; }, []);
  useEffect(() => { const t = setInterval(() => setMaintenant(Date.now()), 30000); return () => clearInterval(t); }, []);

  const charger = useCallback(async () => {
    const r = await appeler(token, "versions", { document_id: doc.id });
    if (!vivant.current) return;
    if (r.ok) { setEtat(r.data); setErreurCharge(""); } else { setErreurCharge(r.error); setEtat((x) => x || { document: { id: doc.id, titre: doc.titre, statut: doc.statut, version_courante: null }, versions: [], verrou: null, peut: {} }); }
  }, [token, doc.id]);
  useEffect(() => { charger(); }, [charger]);

  // une action a la fois ; l'ecran se met a jour ensuite (et la liste derriere la fenetre aussi)
  const agir = async (fn) => {
    if (occupe) return;
    setOccupe(true); setErreur(""); setInfo("");
    try { await fn(); } catch (e) { if (vivant.current) setErreur((e && e.message) || "Une erreur est survenue."); }
    await charger();
    if (surChangement) { try { surChangement(); } catch (e) { /* la liste se rafraichira a la prochaine action */ } }
    if (vivant.current) setOccupe(false);
  };

  const peut = (etat && etat.peut) || {};
  const versions = (etat && etat.versions) || [];
  const courante = versions.find((v) => v.courante) || null;
  const v = etat && etat.verrou;
  const expire = !!v && new Date(v.expire_le).getTime() <= maintenant;
  const mien = !!v && v.moi;
  const autreActif = !!v && !v.moi && !expire;
  const st = statutDoc(etat ? etat.document.statut : doc.statut);

  const creerModele = () => agir(async () => {
    exiger(await appeler(token, "fichier_modele", { document_id: doc.id }));
    setInfo("Le fichier Word est créé avec les informations du sujet (école, titre, classe, matière, consignes). Clique sur « Modifier » pour le télécharger et le remplir dans Word.");
  });
  const modifier = () => agir(async () => {
    const r = exiger(await appeler(token, "verrou_prendre", { document_id: doc.id }));
    const reste = dureeFr(new Date(r.data.verrou.expire_le).getTime() - Date.now());
    if (courante) {
      exiger(await telechargerFichier(token, doc.id));
      setInfo("Tu as la main sur ce document pendant " + reste + ". Le fichier se télécharge : ouvre-le dans Word, modifie-le, enregistre-le, puis reviens ici cliquer sur « Déposer ma version ».");
    } else setInfo("Tu as la main sur ce document pendant " + reste + ". Prépare ton fichier dans Word, puis reviens ici le déposer.");
  });
  const dejaFichier = () => agir(async () => {
    exiger(await appeler(token, "verrou_prendre", { document_id: doc.id }));
    setDepot(true);
  });
  const telecharger = (numero) => agir(async () => { exiger(await telechargerFichier(token, doc.id, numero)); });
  const prolonger = () => agir(async () => {
    const r = exiger(await appeler(token, "verrou_prolonger", { document_id: doc.id }));
    setInfo("Ton temps est prolongé : encore " + dureeFr(new Date(r.data.verrou.expire_le).getTime() - Date.now()) + ".");
  });
  const liberer = () => agir(async () => { exiger(await appeler(token, "verrou_liberer", { document_id: doc.id })); setDepot(false); setInfo("Document libéré : les autres rédacteurs peuvent le modifier."); });
  const deposer = () => agir(async () => {
    const r = await deposerFichier(token, doc.id, fichier, note);
    if (!r.ok) throw new Error(r.error);
    setDepot(false); setFichier(null); setNote("");
    if (saisie.current) saisie.current.value = "";
    setInfo(r.data.conflit
      ? "Ta version " + r.data.version.numero + " est bien gardée, mais le document avait changé pendant que tu travaillais : un administrateur va choisir quelle version retenir. Rien n'est perdu."
      : "Version " + r.data.version.numero + " déposée : c'est maintenant la version courante. Le document est libéré.");
  });
  const forcerLiberation = () => agir(async () => {
    if (motifForce.trim().length < 3) throw new Error("Explique brièvement pourquoi (3 caractères au moins).");
    exiger(await appeler(token, "verrou_forcer", { document_id: doc.id, motif: motifForce }));
    setForcer(false); setMotifForce(""); setInfo("Verrou libéré. La personne concernée est prévenue avec ton motif.");
  });
  const retenirVersion = () => agir(async () => {
    exiger(await appeler(token, "version_resoudre", { document_id: doc.id, numero: retenir, motif: noteRetenue || undefined }));
    setInfo("La version " + retenir + " est maintenant la version courante. Les personnes concernées sont prévenues.");
    setRetenir(null); setNoteRetenue("");
  });

  const travailPossible = !!peut.travailler;
  const aEtat = !!etat;
  let banniere = null;
  if (aEtat && v) {
    const jusqua = heureLocale(v.expire_le), reste = dureeFr(new Date(v.expire_le).getTime() - maintenant);
    if (mien && !expire) banniere = ["suj-etat-moi", "Tu as la main sur ce document jusqu'à " + jusqua + " (encore " + reste + "). Pendant ce temps, personne d'autre ne peut y déposer de version."];
    else if (mien) banniere = ["suj-etat-alerte", "Ton temps est écoulé depuis " + jusqua + ", mais personne d'autre n'a pris la main : tu peux encore déposer ta version, ou prolonger."];
    else if (!expire) banniere = ["suj-etat-autre", (v.nom || "Un rédacteur") + " est en train de modifier ce document (jusqu'à " + jusqua + ", encore " + reste + ")."];
    else banniere = ["suj-etat-alerte", "Le temps de " + (v.nom || "ce rédacteur") + " est écoulé depuis " + jusqua + (travailPossible ? ". Tu peux reprendre la main : si cette personne dépose son travail plus tard, il sera gardé et vérifié." : ".")];
  } else if (aEtat && versions.length > 0 && ["a_preparer", "en_cours", "a_corriger"].includes(etat.document.statut)) banniere = ["suj-etat-libre", "Personne n'est en train de modifier ce document."];

  return (
    <>
    <Fenetre titre={doc.titre} sousTitre="Fichier Word du document" fermer={fermer} occupe={occupe || !!lecture || !!lecturePdf} largeur="780px"
      pied={<button type="button" className="btn-primary" data-fermer-fichier onClick={fermer} disabled={occupe}>Fermer</button>}>
      {!aEtat && !erreur && !erreurCharge && <p className="wf-petit">Chargement…</p>}
      {(erreur || erreurCharge) && <div className="login-error" style={{ marginBottom: "12px" }} data-erreur="fichier">{erreur || erreurCharge}</div>}
      {info && <div className="suj-ok" data-info="fichier">{info}</div>}
      {aEtat && (
        <>
          <p className="wf-petit" style={{ marginBottom: "10px" }}>{"Statut du document : "}<span className={"badge " + st[1]}>{st[0]}</span></p>
          <ActionsValidation token={token} doc={doc} etat={etat} occupe={occupe} agir={agir} dire={setInfo} exiger={exiger} />

          {versions.length === 0 && (
            <div className="suj-bloc" data-bloc="aucun-fichier">
              <strong>{"Aucun fichier Word pour ce document"}</strong>
              {(peut.creer_modele || travailPossible)
                ? <p className="wf-texte" style={{ margin: "6px 0 10px" }}>{"Le site peut créer pour toi un fichier Word déjà rempli : nom de l'école, titre, classe, matière, période et consignes (au format de papier de l'école). Tu le télécharges, tu le complètes dans Word sur ton ordinateur, puis tu le déposes ici."}</p>
                : <p className="wf-texte" style={{ margin: "6px 0 0" }}>{"Aucun fichier n'a encore été préparé pour ce document."}</p>}
              <div className="suj-rangee">
                {peut.creer_modele && !autreActif && <button type="button" className="btn-primary" data-creer-modele disabled={occupe} onClick={creerModele}>Créer le fichier Word</button>}
                {travailPossible && !mien && !autreActif && <button type="button" className="btn-gray-cancel" data-deja-fichier disabled={occupe} onClick={dejaFichier}>{"J'ai déjà mon fichier : le déposer"}</button>}
              </div>
            </div>
          )}

          {banniere && <div className={"suj-etat " + banniere[0]} data-verrou role="status">{banniere[1]}</div>}

          {versions.length > 0 && (
            <div className="suj-rangee" data-actions-fichier>
              {travailPossible && (!v || (!mien && expire)) && <button type="button" className="btn-primary" data-modifier-fichier disabled={occupe} onClick={modifier}>{expire && !mien ? "Reprendre la main et modifier" : "Modifier"}</button>}
              {travailPossible && mien && <button type="button" className="btn-primary" data-ouvrir-depot disabled={occupe} onClick={() => setDepot(true)}>Déposer ma version</button>}
              {travailPossible && mien && <button type="button" className="btn-gray-cancel" data-prolonger disabled={occupe} onClick={prolonger}>Prolonger</button>}
              {travailPossible && mien && <button type="button" className="btn-gray-cancel" data-liberer disabled={occupe} onClick={liberer}>Libérer sans déposer</button>}
              {courante && courante.pdf && <button type="button" className="btn-primary" data-lire-pdf-courante disabled={occupe} onClick={() => setLecturePdf({ numero: null })}>{"Lire le PDF exact (version " + courante.numero + ")"}</button>}
              {courante && <button type="button" className={courante.pdf ? "btn-gray-cancel" : "btn-primary"} data-lire-courante disabled={occupe} onClick={() => setLecture({ numero: null })}>{"Lire la version " + courante.numero + (courante.pdf ? " (aperçu)" : "")}</button>}
              {courante && <button type="button" className="btn-gray-cancel" data-telecharger-courante disabled={occupe} onClick={() => telecharger(null)}>{"Télécharger la version " + courante.numero}</button>}
              {peut.administrer && v && <button type="button" className="btn-sm btn-red" data-forcer disabled={occupe} onClick={() => setForcer(true)}>Libérer de force</button>}
            </div>
          )}
          {travailPossible && versions.length > 0 && !v && <p className="wf-aide" data-aide-modifier>{"« Modifier » te réserve le document (2 h) et télécharge le fichier. Modifie-le dans Word sur ton ordinateur, enregistre-le (.docx), puis reviens ici le déposer : une nouvelle version est créée, l'ancienne reste toujours disponible."}</p>}

          {forcer && peut.administrer && v && (
            <div className="suj-bloc" data-bloc="forcer" style={{ marginTop: "10px" }}>
              <strong>{"Libérer le verrou de " + (v.nom || "ce rédacteur")}</strong>
              <p className="wf-aide">{"Son travail déjà déposé n'est pas touché. S'il dépose ensuite, sa version sera gardée « à vérifier » pour que rien ne se perde. Il est prévenu avec ton motif."}</p>
              <div className="form-group"><label htmlFor="sf-force">Motif (obligatoire)</label><input id="sf-force" data-champ="force-motif" value={motifForce} maxLength={500} onChange={(e) => setMotifForce(e.target.value)} placeholder="Ex. : enseignant absent, il faut avancer" /></div>
              <div className="suj-rangee"><button type="button" className="btn-red" data-confirmer-force disabled={occupe} onClick={forcerLiberation}>Libérer le verrou</button><button type="button" className="btn-gray-cancel" disabled={occupe} onClick={() => { setForcer(false); setMotifForce(""); }}>Annuler</button></div>
            </div>
          )}

          {depot && mien && (
            <div className="suj-bloc" data-bloc="depot" style={{ marginTop: "10px" }}>
              <div className="form-group">
                <label htmlFor="sf-fichier">Ton fichier Word (.docx)</label>
                <input id="sf-fichier" ref={saisie} type="file" data-champ="fichier" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(e) => setFichier((e.target.files && e.target.files[0]) || null)} />
                {fichier && <p className="wf-aide" data-fichier-choisi>{fichier.name + " (" + tailleLisible(fichier.size) + ")"}</p>}
              </div>
              <div className="form-group">
                <label htmlFor="sf-note">{"Ce que tu as changé (facultatif)"}</label>
                <input id="sf-note" data-champ="fichier-note" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Ex. : ajout de l'exercice 3 et du barème" />
              </div>
              <div className="suj-rangee">
                <button type="button" className="btn-primary" data-deposer disabled={occupe || !fichier} onClick={deposer}>{occupe ? "Dépôt en cours..." : "Déposer cette version"}</button>
                <button type="button" className="btn-gray-cancel" data-annuler-depot disabled={occupe} onClick={() => { setDepot(false); setFichier(null); if (saisie.current) saisie.current.value = ""; }}>Annuler</button>
              </div>
            </div>
          )}

          {retenir !== null && peut.administrer && (
            <div className="suj-bloc" data-bloc="retenir" style={{ marginTop: "10px" }}>
              <strong>{"Retenir la version " + retenir + " comme version courante ?"}</strong>
              <p className="wf-aide">{"Les autres versions restent gardées et téléchargeables. Les rédacteurs sont prévenus."}</p>
              <div className="form-group"><label htmlFor="sf-retenir">Note (facultatif)</label><input id="sf-retenir" data-champ="retenir-note" value={noteRetenue} maxLength={500} onChange={(e) => setNoteRetenue(e.target.value)} placeholder="Ex. : c'est la version la plus complète" /></div>
              <div className="suj-rangee"><button type="button" className="btn-primary" data-confirmer-retenir disabled={occupe} onClick={retenirVersion}>Retenir cette version</button><button type="button" className="btn-gray-cancel" disabled={occupe} onClick={() => { setRetenir(null); setNoteRetenue(""); }}>Annuler</button></div>
            </div>
          )}

          {versions.length > 0 && (
            <div className="suj-versions" data-table="versions">
              {versions.map((x) => (
                <div key={x.numero} data-version={x.numero} className={"suj-version" + (x.courante ? " courante" : "") + (x.etat === "ecartee" ? " suj-annule" : "")}>
                  <div className="suj-version-tete">
                    <strong>{"v" + x.numero}</strong>
                    {x.officielle && <span className="badge badge-ok" data-badge="officielle" title="Version validée : c'est la version officielle du document.">Officielle</span>}
                    {x.purgee && <span className="badge badge-gray" data-badge="purgee" title={"Fichier supprimé le " + dateHeureLocale(x.purgee.le) + (x.purgee.par ? " par " + x.purgee.par : "") + " (purge d'un examen archivé)"}>Purgée</span>}
                    {x.courante && !x.officielle && <span className="badge badge-ok" data-badge="courante">Courante</span>}
                    {x.etat === "conflit" && <span className="badge badge-err" data-badge="conflit" title="Déposée pendant que le document avait changé : un administrateur doit choisir.">À vérifier</span>}
                    {x.etat === "ecartee" && <span className="badge badge-gray" data-badge="ecartee">Écartée</span>}
                    {x.origine === "modele" && <span className="wf-petit" style={{ display: "inline" }}>Modèle créé par le site</span>}
                    {!x.purgee && x.recu_poste && !x.recu_poste.ecart && <span className="badge badge-ok" data-badge="recu-poste" title={"Copie gardée sur le poste principal du secrétariat (" + dateHeureLocale(x.recu_poste.le) + ")"}>Reçu au poste</span>}
                    {!x.purgee && x.recu_poste && x.recu_poste.ecart && peut.administrer && <span className="badge badge-err" data-badge="ecart-poste" title="Le fichier rangé sur le poste principal n'a pas la même empreinte que la copie en ligne : les deux sont gardés, à vérifier.">Écart au poste</span>}
                    {!x.purgee && !x.recu_poste && etat.poste_actif && <span className="badge badge-gray" data-badge="attente-poste" title="Le poste principal du secrétariat n'a pas encore copié ce fichier.">En attente du poste</span>}
                    {x.pdf && <span className="badge badge-ok" data-badge="pdf" title="PDF fabriqué par Word : mise en page exacte">PDF prêt</span>}
                    {!x.purgee && !x.pdf && x.pdf_erreur && peut.administrer && <span className="badge badge-gold" data-badge="pdf-erreur" title={x.pdf_erreur}>PDF non fabriqué</span>}
                    {!x.purgee && !x.pdf && x.recu_poste && !x.pdf_erreur && etat.poste_actif && <span className="badge badge-gray" data-badge="pdf-attente" title="Word fabrique le PDF sur le poste principal.">PDF en préparation</span>}
                  </div>
                  <div className="suj-version-meta">{dateHeureLocale(x.created_at) + " · " + (x.auteur_nom || "-") + (x.moi ? " (toi)" : "") + " · " + tailleLisible(x.taille)}</div>
                  {x.motif && <div className="suj-version-note">{x.motif}</div>}
                  {x.purgee && <div className="suj-version-note" data-purgee-info>{"Fichier supprimé lors de la purge de l'examen archivé (" + dateHeureLocale(x.purgee.le) + (x.purgee.par ? ", par " + x.purgee.par : "") + "). La fiche et l'empreinte sont gardées."}</div>}
                  {!x.purgee && <div className="suj-version-actions">
                    {x.pdf && <button type="button" className="btn-sm btn-primary" data-lire-pdf-version={x.numero} disabled={occupe} onClick={() => setLecturePdf({ numero: x.numero })}>Lire le PDF</button>}
                    <button type="button" className="btn-sm btn-gray-cancel" data-lire-version={x.numero} disabled={occupe} onClick={() => setLecture({ numero: x.numero })}>{x.pdf ? "Aperçu" : "Lire"}</button>
                    <button type="button" className="btn-sm btn-gray-cancel" data-telecharger-version={x.numero} disabled={occupe} onClick={() => telecharger(x.numero)}>Télécharger</button>
                    {peut.administrer && !x.courante && <button type="button" className="btn-sm btn-gray-cancel" data-retenir={x.numero} disabled={occupe} onClick={() => setRetenir(x.numero)}>Retenir</button>}
                  </div>}
                </div>
              ))}
            </div>
          )}
          {versions.length > 0 && <p className="wf-aide">{"Une version n'est jamais écrasée ni supprimée : chaque dépôt crée une nouvelle version."}</p>}
        </>
      )}
    </Fenetre>
    {lecture && <LectureWord token={token} doc={doc} numero={lecture.numero} fermer={() => setLecture(null)} />}
    {lecturePdf && <LecturePdf token={token} doc={doc} numero={lecturePdf.numero} fermer={() => setLecturePdf(null)} />}
    </>
  );
}
