import React, { useEffect, useMemo, useState } from "react";
import { appeler } from "./sujetsApi.js";
import { TYPES, libelleType, dateFr, nomPersonne } from "./sujetsFormat.js";
import { clientPedagogie, periodesDeAnnee, classesDeAnnee, matieresActives, affectationsClasse } from "./donneesPedagogie.js";
import { Fenetre, PiedStandard, MessageEnvoi, useEnvoi } from "../pedagogie/Fenetre.jsx";

// Fenetres des Sujets d'examens (secretariat) : dossier, document, attribution, annulation. Meme standard que le reste de la pedagogie :
// l'erreur reste dans la fenetre, rien n'est perdu, Echap ferme, un clic a cote ferme seulement si rien n'a ete saisi.

const libelleEns = (e) => (e.nom || "Enseignant") + (e.matricule ? " (" + e.matricule + ")" : "") + (e.compte_lie ? "" : " - compte non lié");

// ------------------------------------------------------------------ dossier
export function FenetreDossier({ token, dossier, annees, anneeDefaut, fermer, apres }) {
  const envoi = useEnvoi();
  const edition = !!dossier;
  const [nom, setNom] = useState(dossier ? dossier.nom : "");
  const [anneeId, setAnneeId] = useState(dossier ? dossier.annee_id || "" : (anneeDefaut && anneeDefaut.id) || "");
  const [periodeId, setPeriodeId] = useState(dossier ? dossier.periode_id || "" : "");
  const [periodes, setPeriodes] = useState([]);
  const [chargement, setChargement] = useState("");
  const [dateLimite, setDateLimite] = useState(dossier ? dossier.date_limite || "" : "");
  const [instructions, setInstructions] = useState(dossier ? dossier.instructions || "" : "");
  const sb = useMemo(() => clientPedagogie(token), [token]);

  useEffect(() => {
    let annule = false;
    setChargement("");
    (async () => {
      try {
        const p = await periodesDeAnnee(sb, anneeId);
        if (annule) return;
        setPeriodes(p);
        setPeriodeId((cur) => (cur && !p.some((x) => x.id === cur) && !(dossier && dossier.periode_id === cur && dossier.annee_id === anneeId) ? "" : cur));
      } catch (e) { if (!annule) setChargement("Les périodes n'ont pas pu être lues : " + e.message); }
    })();
    return () => { annule = true; };
  }, [anneeId, sb]);

  const annee = (annees || []).find((a) => String(a.id) === String(anneeId));
  const periode = periodes.find((p) => p.id === periodeId);
  const enregistrer = async (confirmer) => {
    if (!nom.trim()) throw new Error("Le nom du dossier est obligatoire.");
    const corps = {
      nom, annee_id: anneeId || null, annee_libelle: annee ? annee.nom || annee.name || annee.libelle || null : (dossier && dossier.annee_id === anneeId ? dossier.annee_libelle : null),
      periode_id: periodeId || null, periode_libelle: periode ? periode.nom : (dossier && dossier.periode_id === periodeId ? dossier.periode_libelle : null),
      date_limite: dateLimite || null, instructions: instructions || null
    };
    if (edition) corps.id = dossier.id; else if (confirmer) corps.confirmer_doublon = true;
    const r = await appeler(token, edition ? "dossier_modifier" : "dossier_creer", corps);
    if (!r.ok) {
      if (r.code === "doublon") { const e = new Error("Un dossier ouvert porte déjà ce nom. Créer quand même un second dossier « " + nom.trim() + " » ?"); e.confirmation = true; throw e; }
      throw new Error(r.error);
    }
    await apres(r.data.dossier);
  };
  return (
    <Fenetre titre={edition ? "Modifier le dossier" : "Nouveau dossier d'examens"} sousTitre="Un dossier regroupe les documents d'un même examen (sujets, corrigés, barèmes)." fermer={fermer} occupe={envoi.occupe} protege
      onSubmit={() => envoi.envoyer(enregistrer)} largeur="560px"
      pied={<PiedStandard fermer={fermer} occupe={envoi.occupe} libelle={edition ? "Enregistrer" : "Créer le dossier"} envoi={envoi} />}>
      <div className="form-group">
        <label htmlFor="sd-nom">Nom du dossier</label>
        <input id="sd-nom" data-champ="dossier-nom" value={nom} maxLength={150} onChange={(e) => setNom(e.target.value)} placeholder="Ex. : Examens du 1er trimestre" />
      </div>
      <div className="form-row" style={{ marginBottom: 0 }}>
        <div className="form-group">
          <label htmlFor="sd-annee">Année scolaire</label>
          <select id="sd-annee" data-champ="dossier-annee" value={anneeId} onChange={(e) => { setAnneeId(e.target.value); setPeriodeId(""); }}>
            <option value="">- Aucune -</option>
            {(annees || []).map((a) => <option key={a.id} value={a.id}>{a.nom || a.name || a.libelle}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="sd-periode">Période</label>
          <select id="sd-periode" data-champ="dossier-periode" value={periodeId} onChange={(e) => setPeriodeId(e.target.value)} disabled={!anneeId}>
            <option value="">- Aucune -</option>
            {periodes.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
            {dossier && dossier.periode_id && dossier.annee_id === anneeId && !periodes.some((p) => p.id === dossier.periode_id) && <option value={dossier.periode_id}>{dossier.periode_libelle || "Période"}</option>}
          </select>
        </div>
      </div>
      {chargement && <p className="wf-petit" data-info="periodes">{chargement}</p>}
      <div className="form-group">
        <label htmlFor="sd-date">Date limite de remise (facultatif)</label>
        <input id="sd-date" data-champ="dossier-date" type="date" value={dateLimite} onChange={(e) => setDateLimite(e.target.value)} />
        <p className="wf-aide">{"Chaque document peut avoir sa propre date. Sans date sur le document, c'est celle du dossier qui s'applique."}</p>
      </div>
      <div className="form-group">
        <label htmlFor="sd-instr">Instructions pour les enseignants (facultatif)</label>
        <textarea id="sd-instr" data-champ="dossier-instructions" value={instructions} maxLength={4000} onChange={(e) => setInstructions(e.target.value)} placeholder="Format attendu, consignes générales…" />
      </div>
      <MessageEnvoi envoi={envoi} />
    </Fenetre>
  );
}

// ------------------------------------------------------------------ document
export function FenetreDocument({ token, dossier, doc, enseignants, fermer, apres }) {
  const envoi = useEnvoi();
  const edition = !!doc;
  const sb = useMemo(() => clientPedagogie(token), [token]);
  const [titre, setTitre] = useState(doc ? doc.titre : "");
  const [type, setType] = useState(doc ? doc.type : "sujet");
  const [classeId, setClasseId] = useState(doc ? doc.classe_id || "" : "");
  const [matiereId, setMatiereId] = useState(doc ? doc.matiere_id || "" : "");
  const [pages, setPages] = useState(doc && doc.pages_souhaitees ? String(doc.pages_souhaitees) : "");
  const [dateLimite, setDateLimite] = useState(doc ? doc.date_limite || "" : "");
  const [consignes, setConsignes] = useState(doc ? doc.consignes || "" : "");
  const [responsable, setResponsable] = useState("");
  const [co, setCo] = useState([]);
  const [classes, setClasses] = useState([]);
  const [matieres, setMatieres] = useState([]);
  const [affectations, setAffectations] = useState([]);
  const [toutesMatieres, setToutesMatieres] = useState(false);
  const [suggestion, setSuggestion] = useState(null);
  const [touche, setTouche] = useState(false);          // la personne a choisi elle-meme le responsable : on ne le change plus
  const [avertissement, setAvertissement] = useState("");

  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        const [c, m] = await Promise.all([classesDeAnnee(sb, dossier.annee_id), matieresActives(sb)]);
        if (!annule) { setClasses(c); setMatieres(m); }
      } catch (e) { if (!annule) setAvertissement("Les classes et les matières n'ont pas pu être lues : " + e.message + " Tu peux quand même créer le document."); }
    })();
    return () => { annule = true; };
  }, [sb, dossier.annee_id]);
  useEffect(() => {
    let annule = false;
    if (!classeId) { setAffectations([]); return undefined; }
    (async () => {
      try { const a = await affectationsClasse(sb, classeId); if (!annule) setAffectations(a); } catch (e) { if (!annule) setAffectations([]); }
    })();
    return () => { annule = true; };
  }, [sb, classeId]);

  const idsClasse = new Set(affectations.map((a) => a.matiere_id));
  const matieresProposees = classeId && !toutesMatieres && affectations.length ? matieres.filter((m) => idsClasse.has(m.id) || m.id === matiereId) : matieres;
  // enseignant prevu pour cette classe et cette matiere (Matieres & Enseignants)
  useEffect(() => {
    const aff = classeId && matiereId ? affectations.find((a) => a.matiere_id === matiereId) : null;
    const ens = aff && aff.employee_id ? (enseignants || []).find((e) => e.id === aff.employee_id) : null;
    setSuggestion(ens || null);
    if (!edition && ens && !touche) setResponsable(ens.id);
  }, [classeId, matiereId, affectations, enseignants]);

  const classe = classes.find((c) => c.id === classeId);
  const matiere = matieres.find((m) => m.id === matiereId);
  const basculerCo = (id) => setCo((l) => (l.includes(id) ? l.filter((x) => x !== id) : l.concat(id)));
  const enregistrer = async () => {
    if (!titre.trim()) throw new Error("Le titre du document est obligatoire.");
    if (pages && !(Number.isInteger(Number(pages)) && Number(pages) >= 1 && Number(pages) <= 500)) throw new Error("Les pages souhaitées doivent être un nombre entier entre 1 et 500.");
    const corps = {
      titre, type, classe_id: classeId || null, classe_libelle: classe ? classe.nom : (doc && doc.classe_id === classeId ? doc.classe_libelle : null),
      matiere_id: matiereId || null, matiere_libelle: matiere ? matiere.nom : (doc && doc.matiere_id === matiereId ? doc.matiere_libelle : null),
      pages_souhaitees: pages ? Number(pages) : null, date_limite: dateLimite || null, consignes: consignes || null
    };
    if (edition) corps.id = doc.id;
    else { corps.dossier_id = dossier.id; corps.responsable_employee_id = responsable || null; corps.co_redacteurs = co.filter((x) => x !== responsable); }
    const r = await appeler(token, edition ? "document_modifier" : "document_creer", corps);
    if (!r.ok) throw new Error(r.error);
    await apres(r.data.document);
  };
  return (
    <Fenetre titre={edition ? "Modifier le document" : "Nouveau document"} sousTitre={"Dossier « " + dossier.nom + " »"} fermer={fermer} occupe={envoi.occupe} protege
      onSubmit={() => envoi.envoyer(enregistrer)} largeur="620px"
      pied={<PiedStandard fermer={fermer} occupe={envoi.occupe} libelle={edition ? "Enregistrer" : "Créer le document"} envoi={envoi} />}>
      <div className="form-row" style={{ marginBottom: 0 }}>
        <div className="form-group" style={{ flex: 3 }}>
          <label htmlFor="sd-titre">Titre</label>
          <input id="sd-titre" data-champ="doc-titre" value={titre} maxLength={200} onChange={(e) => setTitre(e.target.value)} placeholder="Ex. : Mathématiques 6e - examen du 1er trimestre" />
        </div>
        <div className="form-group" style={{ flex: 1 }}>
          <label htmlFor="sd-type">Type</label>
          <select id="sd-type" data-champ="doc-type" value={type} onChange={(e) => setType(e.target.value)}>{TYPES.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
        </div>
      </div>
      <div className="form-row" style={{ marginBottom: 0 }}>
        <div className="form-group">
          <label htmlFor="sd-classe">Classe</label>
          <select id="sd-classe" data-champ="doc-classe" value={classeId} onChange={(e) => { setClasseId(e.target.value); setMatiereId(""); setToutesMatieres(false); }}>
            <option value="">- Aucune -</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
            {doc && doc.classe_id && !classes.some((c) => c.id === doc.classe_id) && <option value={doc.classe_id}>{doc.classe_libelle || "Classe"}</option>}
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="sd-matiere">Matière</label>
          <select id="sd-matiere" data-champ="doc-matiere" value={matiereId} onChange={(e) => setMatiereId(e.target.value)}>
            <option value="">- Aucune -</option>
            {matieresProposees.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
            {doc && doc.matiere_id && !matieres.some((m) => m.id === doc.matiere_id) && <option value={doc.matiere_id}>{doc.matiere_libelle || "Matière"}</option>}
          </select>
          {classeId && affectations.length > 0 && !toutesMatieres && <button type="button" className="suj-lien" data-toutes-matieres onClick={() => setToutesMatieres(true)}>{"Afficher toutes les matières"}</button>}
          {classeId && affectations.length > 0 && toutesMatieres && <p className="wf-aide">{"Toutes les matières sont affichées."}</p>}
        </div>
      </div>
      {avertissement && <p className="wf-petit" data-info="reference">{avertissement}</p>}
      <div className="form-row" style={{ marginBottom: 0 }}>
        <div className="form-group">
          <label htmlFor="sd-date-doc">Date limite (facultatif)</label>
          <input id="sd-date-doc" data-champ="doc-date" type="date" value={dateLimite} onChange={(e) => setDateLimite(e.target.value)} />
          {!dateLimite && dossier.date_limite && <p className="wf-aide">{"Sans date ici, celle du dossier s'applique : " + dateFr(dossier.date_limite) + "."}</p>}
        </div>
        <div className="form-group">
          <label htmlFor="sd-pages">Pages souhaitées (facultatif)</label>
          <input id="sd-pages" data-champ="doc-pages" type="number" min="1" max="500" step="1" value={pages} onChange={(e) => setPages(e.target.value)} />
        </div>
      </div>
      <div className="form-group">
        <label htmlFor="sd-consignes">Consignes pour l'enseignant (facultatif)</label>
        <textarea id="sd-consignes" data-champ="doc-consignes" value={consignes} maxLength={4000} onChange={(e) => setConsignes(e.target.value)} placeholder="Chapitres couverts, durée, barème, calculatrice autorisée…" />
      </div>
      {!edition && (
        <div className="suj-bloc" data-bloc="attribution">
          <strong>Qui prépare ce document ?</strong>
          <div className="form-group" style={{ marginTop: "8px" }}>
            <label htmlFor="sd-resp">Responsable</label>
            <select id="sd-resp" data-champ="doc-responsable" value={responsable} onChange={(e) => { setResponsable(e.target.value); setTouche(true); }}>
              <option value="">- Pas encore attribué -</option>
              {(enseignants || []).map((e) => <option key={e.id} value={e.id}>{libelleEns(e)}</option>)}
            </select>
            {suggestion && responsable === suggestion.id && <p className="wf-aide" data-suggestion>{"Proposé d'après « Matières & Enseignants » : " + (suggestion.nom || "") + " enseigne cette matière dans cette classe."}</p>}
          </div>
          {(enseignants || []).length > 1 && (
            <div className="form-group">
              <label>Co-rédacteurs (facultatif)</label>
              <div className="suj-cases">
                {(enseignants || []).filter((e) => e.id !== responsable).map((e) => (
                  <label key={e.id} className="suj-case"><input type="checkbox" data-co={e.id} checked={co.includes(e.id)} onChange={() => basculerCo(e.id)} /> {libelleEns(e)}</label>
                ))}
              </div>
            </div>
          )}
          {(enseignants || []).some((e) => !e.compte_lie) && <p className="wf-aide">{"« compte non lié » : cet enseignant ne recevra pas de notification et ne verra rien dans « Mes examens » tant qu'un administrateur n'a pas lié son compte (Utilisateurs > Enseignant)."}</p>}
        </div>
      )}
      <MessageEnvoi envoi={envoi} />
    </Fenetre>
  );
}

// ------------------------------------------------------------------ attribution d'un document existant
export function FenetreAttribution({ token, doc, enseignants, fermer, apres }) {
  const envoi = useEnvoi();
  const [responsable, setResponsable] = useState(doc.responsable ? doc.responsable.employee_id : "");
  const [co, setCo] = useState((doc.co_redacteurs || []).map((x) => x.employee_id));
  const liste = enseignants || [];
  // une personne deja attribuee mais qui n'est plus dans la liste (enseignant desactive depuis) reste visible pour pouvoir la retirer
  const connus = new Set(liste.map((e) => e.id));
  const anciens = [doc.responsable].concat(doc.co_redacteurs || []).filter((a) => a && !connus.has(a.employee_id)).map((a) => ({ id: a.employee_id, nom: (a.nom || a.employee_id) + " (n'est plus actif)", compte_lie: true, matricule: null }));
  const tous = liste.concat(anciens);
  const basculer = (id) => setCo((l) => (l.includes(id) ? l.filter((x) => x !== id) : l.concat(id)));
  const enregistrer = async () => {
    const r = await appeler(token, "document_attribuer", { document_id: doc.id, responsable_employee_id: responsable || null, co_redacteurs: co.filter((x) => x !== responsable) });
    if (!r.ok) throw new Error(r.error);
    await apres(r.data.document, r.data.modifie);
  };
  return (
    <Fenetre titre="Attribuer le document" sousTitre={"« " + doc.titre + " »"} fermer={fermer} occupe={envoi.occupe} protege onSubmit={() => envoi.envoyer(enregistrer)} largeur="560px"
      pied={<PiedStandard fermer={fermer} occupe={envoi.occupe} libelle="Enregistrer" envoi={envoi} />}>
      <div className="form-group">
        <label htmlFor="sa-resp">Responsable</label>
        <select id="sa-resp" data-champ="attr-responsable" value={responsable} onChange={(e) => setResponsable(e.target.value)}>
          <option value="">- Aucun responsable -</option>
          {tous.map((e) => <option key={e.id} value={e.id}>{libelleEns(e)}</option>)}
        </select>
      </div>
      <div className="form-group">
        <label>Co-rédacteurs</label>
        <div className="suj-cases">
          {tous.filter((e) => e.id !== responsable).map((e) => (
            <label key={e.id} className="suj-case"><input type="checkbox" data-co={e.id} checked={co.includes(e.id)} onChange={() => basculer(e.id)} /> {libelleEns(e)}</label>
          ))}
          {tous.filter((e) => e.id !== responsable).length === 0 && <span className="wf-petit">Aucun autre enseignant.</span>}
        </div>
      </div>
      <p className="wf-aide">{"Les personnes ajoutées ou retirées sont prévenues dans l'ERP. Les anciennes attributions restent dans l'historique."}</p>
      <MessageEnvoi envoi={envoi} />
    </Fenetre>
  );
}

// ------------------------------------------------------------------ annulation (motif obligatoire)
export function FenetreAnnulation({ token, doc, fermer, apres }) {
  const envoi = useEnvoi();
  const [motif, setMotif] = useState("");
  const enregistrer = async () => {
    if (motif.trim().length < 3) throw new Error("Explique brièvement pourquoi (3 caractères au moins).");
    const r = await appeler(token, "document_annuler", { id: doc.id, motif });
    if (!r.ok) throw new Error(r.error);
    await apres(r.data.document);
  };
  return (
    <Fenetre titre="Annuler ce document" sousTitre={"« " + doc.titre + " »"} fermer={fermer} occupe={envoi.occupe} protege onSubmit={() => envoi.envoyer(enregistrer)}
      pied={<PiedStandard fermer={fermer} occupe={envoi.occupe} libelle="Annuler le document" danger envoi={envoi} />}>
      <p className="wf-texte">{"Le document n'est pas supprimé : il reste dans le dossier, marqué « Annulé », et tu pourras le rétablir. Les enseignants concernés sont prévenus avec le motif."}</p>
      <div className="form-group">
        <label htmlFor="san-motif">Motif (obligatoire)</label>
        <textarea id="san-motif" data-champ="annul-motif" value={motif} maxLength={500} onChange={(e) => setMotif(e.target.value)} placeholder="Ex. : examen retiré du calendrier" />
      </div>
      <MessageEnvoi envoi={envoi} />
    </Fenetre>
  );
}

// ------------------------------------------------------------------ details d'un document (lecture seule, pour l'enseignant)
export function FenetreDetail({ doc, fermer, extra }) {
  const lignes = [
    ["Type", libelleType(doc.type)], ["Dossier", doc.dossier ? doc.dossier.nom : ""],
    ["Période", doc.dossier ? [doc.dossier.annee_libelle, doc.dossier.periode_libelle].filter(Boolean).join(" - ") : ""],
    ["Classe", doc.classe_libelle || ""], ["Matière", doc.matiere_libelle || ""],
    ["Pages souhaitées", doc.pages_souhaitees ? String(doc.pages_souhaitees) : ""],
    ["Date limite", doc.date_limite_effective ? dateFr(doc.date_limite_effective) + (doc.date_limite ? "" : " (date du dossier)") : ""],
    ["Responsable", nomPersonne(doc.responsable)], ["Co-rédacteurs", (doc.co_redacteurs || []).map(nomPersonne).join(", ")]
  ].filter((l) => l[1]);
  return (
    <Fenetre titre={doc.titre} sousTitre={doc.statut === "annule" ? "Document annulé" : undefined} fermer={fermer} largeur="560px" pied={<button type="button" className="btn-primary" onClick={fermer}>Fermer</button>}>
      {doc.statut === "annule" && <div className="wf-avis" role="alert"><strong>{"Annulé"}</strong><div>{doc.motif_annulation || ""}</div></div>}
      <dl className="wf-resume" data-detail>
        {lignes.map(([l, v]) => <div key={l}><dt>{l}</dt><dd>{v}</dd></div>)}
      </dl>
      {doc.consignes && <div className="suj-bloc" data-consignes><strong>Consignes</strong><p className="wf-texte" style={{ whiteSpace: "pre-wrap", marginTop: "6px" }}>{doc.consignes}</p></div>}
      {doc.dossier && doc.dossier.instructions && <div className="suj-bloc" data-instructions><strong>Instructions du dossier</strong><p className="wf-texte" style={{ whiteSpace: "pre-wrap", marginTop: "6px" }}>{doc.dossier.instructions}</p></div>}
      {extra}
    </Fenetre>
  );
}
