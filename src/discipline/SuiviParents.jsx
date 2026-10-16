import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "../AuthContext.jsx";
import { getAuthedClient } from "../supabaseClient.js";
import { useSettings } from "../SettingsContext.jsx";
import { usePermissions } from "../PermissionsContext.jsx";
import "./discipline.css";
import "./suivi.css";
import { aujourdhui, fmtDate, nomComplet, nettoyer, verifierMotDePasse, logoPourPdf } from "./outils.js";
import {
  TYPES, STATUTS, REGLAGES_LETTRES, typeLibelle, statutLibelle, classeStatut, enRetard, libelleRetard, calculerSeuils, suiviCouvrant,
  chargerParents, chargerReglagesLettres, creerSuivi, majResultat, annulerSuivi
} from "./suivi.js";
import { creerLettrePdf } from "./lettresPdf.js";

// Reglages des lettres + logo de l'ecole, prets pour les PDF
export function useLettres() {
  const { token } = useAuth();
  const { settings } = useSettings();
  const [reglages, setReglages] = useState(null);
  const [logo, setLogo] = useState(null);
  const recharger = () => chargerReglagesLettres(getAuthedClient(token)).then(setReglages).catch(() => setReglages({ ...REGLAGES_LETTRES }));
  useEffect(() => { recharger(); /* eslint-disable-next-line */ }, [token]);
  useEffect(() => { let vivant = true; logoPourPdf(settings).then((l) => { if (vivant) setLogo(l); }); return () => { vivant = false; }; }, [settings && settings.logo]);
  return { reglages: reglages || REGLAGES_LETTRES, logo, rechargerReglages: recharger };
}

// (Re)imprime la lettre d'un suivi. A appeler directement dans le clic (la fenetre est ouverte tout de suite).
export function imprimerLettre({ suivi, eleve, classe, referentiel, incidents, annee, settings, logo, reglages, mode }) {
  const faute = suivi.faute_uuid ? (referentiel.fautes.find((f) => f.id === suivi.faute_uuid) || null) : null;
  let liste = [];
  if (faute) {
    liste = incidents.filter((i) => i.statut === "valide" && !i.deleted_at && i.student_uuid === suivi.student_uuid && i.faute_uuid === faute.id)
      .sort((a, b) => String(a.date_incident).localeCompare(String(b.date_incident)) || String(a.created_at).localeCompare(String(b.created_at)));
    if (suivi.nb_incidents) liste = liste.slice(0, Number(suivi.nb_incidents));
  }
  return creerLettrePdf({ suivi, eleve: eleve || { nom: "", prenom: "", matricule: "" }, classe, faute, incidents: liste, annee, settings, logo, reglages, mode, nomFichier: "Lettre-" + (suivi.numero || "suivi") });
}

const valides = (incidents) => (incidents || []).filter((i) => i.statut === "valide" && !i.deleted_at);

/* ---------- fenetre : choisir un eleve (suivi sans attendre un seuil) ---------- */
export function FenetreChoixEleve({ fermer, onChoisi }) {
  const { token } = useAuth();
  const supabase = getAuthedClient(token);
  const [q, setQ] = useState("");
  const [liste, setListe] = useState([]);
  const [err, setErr] = useState("");
  useEffect(() => {
    const t = nettoyer(q);
    if (t.length < 2) { setListe([]); return undefined; }
    let vivant = true;
    const h = setTimeout(async () => {
      const { data, error } = await supabase.from("students").select("id, matricule, nom, prenom").is("deleted_at", null)
        .or("nom.ilike.%" + t + "%,prenom.ilike.%" + t + "%,matricule.ilike.%" + t + "%").order("nom").limit(12);
      if (!vivant) return;
      if (error) setErr(error.message || "Erreur de recherche"); else { setErr(""); setListe(data || []); }
    }, 250);
    return () => { vivant = false; clearTimeout(h); };
    // eslint-disable-next-line
  }, [q]);
  return (
    <div className="modal-overlay" onClick={fermer}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "520px", maxWidth: "94vw" }}>
        <div className="modal-header"><h3>Nouveau suivi : quel élève ?</h3><button className="modal-close" onClick={fermer}>x</button></div>
        <p style={{ fontSize: "13px", margin: "0 0 10px", opacity: 0.85 }}>Pour avertir, convoquer ou appeler les parents d'un élève sans attendre qu'un seuil soit atteint.</p>
        {err && <div className="login-error" style={{ marginBottom: "10px" }}>{err}</div>}
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom, prénom ou matricule..." style={{ width: "100%", boxSizing: "border-box" }} />
        <div style={{ marginTop: "8px", maxHeight: "300px", overflow: "auto" }}>
          {nettoyer(q).length >= 2 && liste.length === 0 && !err && <div className="dc-vide" style={{ padding: "14px" }}>Aucun élève trouvé.</div>}
          {liste.map((s) => (
            <div key={s.id} className="dc-res" onClick={() => onChoisi(s)}><strong>{nomComplet(s)}</strong><small>{s.matricule}</small></div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- fenetre : nouveau suivi ---------- */
function FenetreNouveau({ cible, fermer, annee, referentiel, reglages, logo, onChange }) {
  const { token, user } = useAuth();
  const { settings } = useSettings();
  const supabase = getAuthedClient(token);
  const [type, setType] = useState(cible.type || "avertissement");
  const [fauteId, setFauteId] = useState(cible.faute ? cible.faute.id : "");
  const [parents, setParents] = useState(null);
  const [choix, setChoix] = useState("");
  const [nomLibre, setNomLibre] = useState("");
  const [tel, setTel] = useState("");
  const [date, setDate] = useState(aujourdhui());
  const [dateRdv, setDateRdv] = useState("");
  const [heureRdv, setHeureRdv] = useState("08:00");
  const [lieuRdv, setLieuRdv] = useState(reglages.lettre_lieu_rdv || "");
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [occupe, setOccupe] = useState(false);
  const verrou = useRef(false);

  useEffect(() => {
    let vivant = true;
    chargerParents(supabase, cible.eleve.id).then((r) => {
      if (!vivant) return;
      setParents(r.parents);
      if (r.parents.length) { setChoix(r.parents[0].cle); setTel(r.parents[0].tel); } else setChoix("autre");
    }).catch(() => { if (vivant) { setParents([]); setChoix("autre"); } });
    return () => { vivant = false; };
    // eslint-disable-next-line
  }, [cible.eleve.id]);

  const choisirParent = (cle) => {
    setChoix(cle);
    const p = (parents || []).find((x) => x.cle === cle);
    setTel(p ? p.tel : "");
  };
  const destinataire = () => {
    if (choix === "autre") return nomLibre.trim();
    const p = (parents || []).find((x) => x.cle === choix);
    if (!p) return "";
    const civ = p.lien === "Père" ? "M. " : p.lien === "Mère" ? "Mme " : "";
    return civ + p.nom + (p.cle === "parent" ? "" : " (" + p.lien.toLowerCase() + ")");
  };

  const lettre = TYPES[type].lettre;
  const faute = referentiel.fautes.find((f) => f.id === fauteId) || null;
  const nb = faute ? valides(cible.incidents).filter((i) => i.faute_uuid === faute.id).length : 0;

  const enregistrer = async (ouvrir) => {
    if (verrou.current) return;
    setErr("");
    if (!date) { setErr("La date est requise."); return; }
    if (type === "convocation") {
      if (!dateRdv) { setErr("Indiquez la date du rendez-vous."); return; }
      if (dateRdv < date) { setErr("Le rendez-vous ne peut pas être avant la date de la lettre."); return; }
      if (!String(heureRdv).trim()) { setErr("Indiquez l'heure du rendez-vous."); return; }
    }
    if (type === "appel" && !note.trim()) { setErr("Résumez l'échange avec le parent."); return; }
    let w = null;
    if (ouvrir && lettre) {
      w = window.open("", "_blank");
      if (!w) { setErr("Le navigateur a bloqué la fenêtre de la lettre. Autorisez les fenêtres surgissantes, ou cliquez sur « Enregistrer » puis sur « Lettre » dans la liste."); return; }
    }
    verrou.current = true; setOccupe(true);
    try {
      const s = await creerSuivi(supabase, user, {
        studentId: cible.eleve.id, year: { id: cible.yearId, nom: annee }, faute, type, date, destinataire: destinataire(), destinataireTel: tel,
        dateRdv, heureRdv, lieuRdv, note, nbIncidents: faute ? nb : null
      });
      let avert = "";
      if (w) {
        try {
          const liste = faute ? valides(cible.incidents).filter((i) => i.faute_uuid === faute.id).sort((a, b) => String(a.date_incident).localeCompare(String(b.date_incident)) || String(a.created_at).localeCompare(String(b.created_at))) : [];
          await creerLettrePdf({ suivi: s, eleve: cible.eleve, classe: cible.classe, faute, incidents: liste, annee, settings, logo, reglages, mode: "print", fenetre: w });
        } catch (e) { avert = " La lettre n'a pas pu être créée (" + (e.message || "erreur") + ") : réessayez avec le bouton « Lettre »."; }
      }
      await onChange(s, avert);
    } catch (e) {
      try { if (w) w.close(); } catch (e2) { /* rien */ }
      setErr(e.message || "Erreur d'enregistrement");
    }
    verrou.current = false; setOccupe(false);
  };

  return (
    <div className="modal-overlay" onClick={() => !occupe && fermer()}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "560px", maxWidth: "94vw", maxHeight: "92vh", overflow: "auto" }}>
        <div className="modal-header"><h3>Parents de {nomComplet(cible.eleve)}</h3><button className="modal-close" onClick={fermer}>x</button></div>
        {err && <div className="login-error" style={{ marginBottom: "12px" }}>{err}</div>}
        <div className="dc-types">
          {Object.keys(TYPES).map((k) => (
            <button key={k} className={type === k ? "btn-primary" : "btn-sm btn-gray-cancel"} onClick={() => setType(k)} disabled={occupe}>{TYPES[k].libelle}</button>
          ))}
        </div>
        <div className="form-group">
          <label>Faute concernée</label>
          <select value={fauteId} onChange={(e) => setFauteId(e.target.value)}>
            <option value="">Aucune en particulier (cas général)</option>
            {referentiel.niveaux.map((n) => (
              <optgroup key={n.id} label={n.nom}>
                {referentiel.fautes.filter((f) => f.niveau_code === n.code && f.actif).map((f) => (
                  <option key={f.id} value={f.id}>{f.numero}. {f.libelle} ({valides(cible.incidents).filter((i) => i.faute_uuid === f.id).length}/{f.cases})</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label>{type === "appel" ? "Parent joint" : "Destinataire de la lettre"}</label>
          {parents === null ? <div style={{ fontSize: "13px", opacity: 0.7 }}>Chargement de la fiche de l'élève...</div> : (
            <select value={choix} onChange={(e) => choisirParent(e.target.value)}>
              {parents.map((p) => <option key={p.cle} value={p.cle}>{p.lien} : {p.nom}{p.tel ? " (" + p.tel + ")" : ""}</option>)}
              <option value="autre">Autre personne (saisir le nom)</option>
            </select>
          )}
          {parents !== null && parents.length === 0 && <div style={{ fontSize: "12px", opacity: 0.75, marginTop: "4px" }}>Aucun parent n'est renseigné sur la fiche de l'élève : saisissez le nom, ou laissez vide pour « Monsieur / Madame, parent ou tuteur ».</div>}
        </div>
        {choix === "autre" && (
          <div className="dc-grid-form">
            <div className="form-group"><label>Nom du destinataire</label><input value={nomLibre} onChange={(e) => setNomLibre(e.target.value)} placeholder="Ex. : Mme Marie Joseph (tante)" /></div>
            <div className="form-group"><label>Téléphone</label><input value={tel} onChange={(e) => setTel(e.target.value)} /></div>
          </div>
        )}
        <div className="dc-grid-form">
          <div className="form-group"><label>{type === "appel" ? "Date de l'appel *" : "Date de la lettre *"}</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          {faute && <div className="form-group"><label>Cases de cette faute</label><div style={{ paddingTop: "8px", fontWeight: 700 }}>{nb} / {faute.cases}{nb >= faute.cases ? " : seuil atteint" : ""}</div></div>}
        </div>
        {type === "convocation" && (
          <div className="dc-grid-form" style={{ gridTemplateColumns: "1fr 1fr 1.4fr" }}>
            <div className="form-group"><label>Rendez-vous le *</label><input type="date" value={dateRdv} onChange={(e) => setDateRdv(e.target.value)} /></div>
            <div className="form-group"><label>À *</label><input type="time" value={heureRdv} onChange={(e) => setHeureRdv(e.target.value)} /></div>
            <div className="form-group"><label>Lieu</label><input value={lieuRdv} onChange={(e) => setLieuRdv(e.target.value)} /></div>
          </div>
        )}
        <div className="form-group">
          <label>{type === "appel" ? "Résumé de l'échange *" : "Précision à ajouter dans la lettre (facultatif)"}</label>
          <textarea rows="3" value={note} onChange={(e) => setNote(e.target.value)} style={{ width: "100%", boxSizing: "border-box" }} />
        </div>
        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", flexWrap: "wrap", marginTop: "8px" }}>
          <button className="btn-gray-cancel btn-sm" onClick={fermer} disabled={occupe}>Annuler</button>
          {lettre && <button className="btn-sm btn-gray-cancel" onClick={() => enregistrer(false)} disabled={occupe}>Enregistrer</button>}
          <button className="btn-primary" onClick={() => enregistrer(lettre)} disabled={occupe}>{occupe ? "Enregistrement..." : lettre ? "Enregistrer et ouvrir la lettre" : "Enregistrer l'appel"}</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- fenetre : resultat ---------- */
function FenetreResultat({ suivi, fermer, onChange }) {
  const { token, user } = useAuth();
  const supabase = getAuthedClient(token);
  const [statut, setStatut] = useState(suivi.statut === "annule" ? "envoye" : suivi.statut);
  const [date, setDate] = useState(suivi.date_resultat ? String(suivi.date_resultat).slice(0, 10) : aujourdhui());
  const [texte, setTexte] = useState(suivi.resultat || "");
  const [err, setErr] = useState("");
  const [occupe, setOccupe] = useState(false);
  const verrou = useRef(false);
  const valider = async () => {
    if (verrou.current) return;
    setErr("");
    if (statut !== "envoye" && !date) { setErr("Indiquez la date."); return; }
    verrou.current = true; setOccupe(true);
    try { await majResultat(supabase, user, suivi, { statut, resultat: texte, date }); await onChange(null, "", "Résultat enregistré."); }
    catch (e) { setErr(e.message || "Erreur d'enregistrement"); }
    verrou.current = false; setOccupe(false);
  };
  return (
    <div className="modal-overlay" onClick={() => !occupe && fermer()}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "480px", maxWidth: "94vw" }}>
        <div className="modal-header"><h3>Réponse des parents</h3><button className="modal-close" onClick={fermer}>x</button></div>
        <p style={{ fontSize: "13px", margin: "0 0 12px" }}>{typeLibelle(suivi.type)} du {fmtDate(suivi.date_suivi)}{suivi.numero ? " · " + suivi.numero : ""}</p>
        {err && <div className="login-error" style={{ marginBottom: "12px" }}>{err}</div>}
        <div className="form-group">
          <label>Où en est-on ?</label>
          <select value={statut} onChange={(e) => setStatut(e.target.value)}>
            {STATUTS.map((s) => <option key={s} value={s}>{statutLibelle(suivi.type, s)}</option>)}
          </select>
        </div>
        {statut !== "envoye" && <div className="form-group"><label>Date *</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>}
        <div className="form-group"><label>Décision, engagement ou remarque</label><textarea rows="3" value={texte} onChange={(e) => setTexte(e.target.value)} style={{ width: "100%", boxSizing: "border-box" }} placeholder="Ex. : les parents ont promis de suivre l'élève ; un contrat de bonne conduite a été signé..." /></div>
        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "8px" }}>
          <button className="btn-gray-cancel btn-sm" onClick={fermer} disabled={occupe}>Annuler</button>
          <button className="btn-primary" onClick={valider} disabled={occupe}>{occupe ? "..." : "Enregistrer"}</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- fenetre : annulation ---------- */
function FenetreAnnulation({ suivi, fermer, onChange }) {
  const { token, user } = useAuth();
  const supabase = getAuthedClient(token);
  const [motif, setMotif] = useState("");
  const [mdp, setMdp] = useState("");
  const [err, setErr] = useState("");
  const [occupe, setOccupe] = useState(false);
  const verrou = useRef(false);
  const valider = async () => {
    if (verrou.current) return;
    setErr("");
    if (!motif.trim()) { setErr("Indiquez le motif de l'annulation."); return; }
    verrou.current = true; setOccupe(true);
    try {
      await verifierMotDePasse(user.username, mdp);
      await annulerSuivi(supabase, user, suivi, motif.trim());
      await onChange(null, "", "Suivi annulé. Il reste visible dans l'historique.");
    } catch (e) { setErr(e.message || "Erreur"); }
    verrou.current = false; setOccupe(false);
  };
  return (
    <div className="modal-overlay" onClick={() => !occupe && fermer()}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "460px", maxWidth: "94vw" }}>
        <div className="modal-header"><h3>Annuler ce suivi</h3><button className="modal-close" onClick={fermer}>x</button></div>
        <p style={{ fontSize: "13px", marginBottom: "12px" }}>{typeLibelle(suivi.type)} du {fmtDate(suivi.date_suivi)}{suivi.numero ? " (" + suivi.numero + ")" : ""}. Il restera visible dans l'historique, marqué « Annulé ».</p>
        {err && <div className="login-error" style={{ marginBottom: "10px" }}>{err}</div>}
        <div className="form-group"><label>Motif *</label><input value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Erreur d'élève, lettre inutile..." /></div>
        <div className="form-group"><label>Votre mot de passe *</label><input type="password" value={mdp} onChange={(e) => setMdp(e.target.value)} onKeyDown={(e) => e.key === "Enter" && valider()} /></div>
        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "8px" }}>
          <button className="btn-gray-cancel btn-sm" onClick={fermer} disabled={occupe}>Retour</button>
          <button className="btn-sm btn-red" onClick={valider} disabled={occupe}>{occupe ? "..." : "Annuler le suivi"}</button>
        </div>
      </div>
    </div>
  );
}

// modal = { kind:'nouveau', cible:{ eleve, classe, faute, type, incidents, yearId } } | { kind:'resultat', suivi } | { kind:'annuler', suivi }
// onChange(suivi, avertissement, message) : a appeler quand quelque chose a ete enregistre (la page ferme la fenetre et recharge)
export function SuiviModals({ modal, fermer, annee, referentiel, reglages, logo, onChange }) {
  if (!modal) return null;
  if (modal.kind === "nouveau") return <FenetreNouveau cible={modal.cible} fermer={fermer} annee={annee} referentiel={referentiel} reglages={reglages} logo={logo} onChange={(s, avert) => onChange(s, avert, "Suivi enregistré : " + (s ? typeLibelle(s.type) + " " + (s.numero || "") : "")) } />;
  if (modal.kind === "resultat") return <FenetreResultat suivi={modal.suivi} fermer={fermer} onChange={onChange} />;
  if (modal.kind === "annuler") return <FenetreAnnulation suivi={modal.suivi} fermer={fermer} onChange={onChange} />;
  return null;
}

/* ---------- boutons d'une ligne de suivi ---------- */
export function ActionsSuivi({ suivi, peutModifier, peutAnnuler, onLettre, setModal }) {
  const actif = suivi.statut !== "annule";
  return (
    <div className="dc-actions">
      {actif && TYPES[suivi.type] && TYPES[suivi.type].lettre && <button className="btn-sm btn-gray-cancel" onClick={() => onLettre("print")}>Lettre</button>}
      {actif && TYPES[suivi.type] && TYPES[suivi.type].lettre && <button className="btn-sm btn-gray-cancel" onClick={() => onLettre("download")}>PDF</button>}
      {actif && peutModifier && <button className="btn-sm btn-gray-cancel" onClick={() => setModal({ kind: "resultat", suivi })}>Réponse</button>}
      {actif && peutAnnuler && <button className="btn-sm btn-red" onClick={() => setModal({ kind: "annuler", suivi })}>Annuler</button>}
    </div>
  );
}

export function PastilleStatut({ suivi, reglages }) {
  return (
    <span>
      <span className={"dc-chip " + classeStatut(suivi.statut)}>{statutLibelle(suivi.type, suivi.statut)}</span>
      {enRetard(suivi, reglages) && <span className="dc-chip bad" style={{ marginLeft: "6px" }}>{libelleRetard(suivi)}</span>}
    </span>
  );
}

/* ---------- section « Suivi des parents » du carnet d'un eleve ---------- */
// data : resultat de chargerCarnet(...) ; referentiel : { niveaux, fautes } ; annee : { id, nom }
export function SuiviEleve({ data, referentiel, annee, onRefresh }) {
  const { can } = usePermissions();
  const { settings } = useSettings();
  const { reglages, logo } = useLettres();
  const [modal, setModal] = useState(null);
  const [info, setInfo] = useState(null);
  if (!data || !data.student || !can("disc_suivi", "voir")) return null;
  const peutCreer = can("disc_suivi", "creer");
  const peutModifier = can("disc_suivi", "modifier");
  const peutAnnuler = can("disc_suivi", "annuler");
  const suivis = data.suivis || [];
  const aTraiter = calculerSeuils(data.incidents, referentiel.fautes).filter((s) => !suiviCouvrant(s, suivis));
  const faute = (id) => referentiel.fautes.find((f) => f.id === id);
  const ouvrir = (f, type) => setModal({ kind: "nouveau", cible: { eleve: data.student, classe: data.classe, faute: f, type, incidents: data.incidents, yearId: annee.id } });
  const apres = async (s, avert, message) => {
    setModal(null);
    setInfo({ type: avert ? "warn" : "ok", texte: (message || "Enregistré.") + (avert || "") });
    await onRefresh();
  };
  const lettre = (s, mode) => imprimerLettre({ suivi: s, eleve: data.student, classe: data.classe, referentiel, incidents: data.incidents, annee: annee.nom, settings, logo, reglages, mode })
    .catch((e) => setInfo({ type: "bad", texte: e.message || "Impossible de créer la lettre" }));

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px", marginTop: "22px" }}>
        <h3 className="form-card-title" style={{ margin: 0 }}>Suivi des parents</h3>
        {peutCreer && <button className="btn-sm btn-gray-cancel" onClick={() => ouvrir(null, "avertissement")}>+ Avertir, convoquer ou appeler les parents</button>}
      </div>
      {info && <div className={"dc-alerte " + info.type} style={{ display: "flex", justifyContent: "space-between", gap: "12px", marginTop: "12px" }}><span>{info.texte}</span><button style={{ background: "none", border: 0, cursor: "pointer", color: "inherit", fontSize: "16px" }} onClick={() => setInfo(null)}>x</button></div>}
      {aTraiter.length > 0 && (
        <div className="dc-alerte warn" style={{ marginTop: "12px" }}>
          <div style={{ fontWeight: 800, marginBottom: "6px" }}>Les parents n'ont pas encore été informés :</div>
          {aTraiter.map((s) => (
            <div key={s.faute.id} className="dc-ligne-seuil">
              <span>Faute n°{s.faute.numero} : {s.n}/{s.faute.cases} cases{s.faute.niveau && s.faute.niveau.action ? " · mesure prévue : " + s.faute.niveau.action : ""}</span>
              {peutCreer && <span className="dc-actions"><button className="btn-sm btn-primary" onClick={() => ouvrir(s.faute, "avertissement")}>Avertissement</button><button className="btn-sm btn-gray-cancel" onClick={() => ouvrir(s.faute, "convocation")}>Convocation</button></span>}
            </div>
          ))}
        </div>
      )}
      <div className="dc-card" style={{ padding: 0, overflow: "auto", marginTop: "12px" }}>
        <table className="data-table">
          <thead><tr><th>Date</th><th>Type</th><th>Faute</th><th>Destinataire</th><th>Statut</th><th>Remarque</th><th></th></tr></thead>
          <tbody>
            {suivis.length === 0 && <tr><td colSpan="7" style={{ textAlign: "center", opacity: 0.7 }}>Aucun contact avec les parents enregistré cette année.</td></tr>}
            {suivis.map((s) => {
              const f = s.faute_uuid ? faute(s.faute_uuid) : null;
              const annule = s.statut === "annule";
              return (
                <tr key={s.id} style={{ opacity: annule ? 0.55 : 1 }}>
                  <td>{fmtDate(s.date_suivi)}<br /><small>{s.numero || ""}</small></td>
                  <td style={{ textDecoration: annule ? "line-through" : "none" }}>{typeLibelle(s.type)}{s.type === "convocation" && s.date_rdv ? <><br /><small>RDV {fmtDate(s.date_rdv)}{s.heure_rdv ? " à " + s.heure_rdv : ""}</small></> : null}</td>
                  <td>{f ? f.numero + ". " + f.libelle : "-"}</td>
                  <td>{s.destinataire || "-"}</td>
                  <td><PastilleStatut suivi={s} reglages={reglages} /></td>
                  <td>{annule ? "Annulé : " + (s.annule_motif || "") : s.resultat || s.note || ""}</td>
                  <td><ActionsSuivi suivi={s} peutModifier={peutModifier} peutAnnuler={peutAnnuler} onLettre={(mode) => lettre(s, mode)} setModal={setModal} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <SuiviModals modal={modal} fermer={() => setModal(null)} annee={annee.nom} referentiel={referentiel} reglages={reglages} logo={logo} onChange={apres} />
    </>
  );
}
