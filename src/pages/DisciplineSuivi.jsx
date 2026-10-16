import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "../AuthContext.jsx";
import { getAuthedClient } from "../supabaseClient.js";
import { useYear } from "../YearContext.jsx";
import { usePermissions } from "../PermissionsContext.jsx";
import { useSettings } from "../SettingsContext.jsx";
import "../discipline/discipline.css";
import "../discipline/suivi.css";
import { fmtDate, nomComplet, chargerReferentiel } from "../discipline/outils.js";
import { typeLibelle, enRetard, calculerSeuils, suiviCouvrant, chargerSuiviAnnee, enregistrerReglagesLettres } from "../discipline/suivi.js";
import { useLettres, imprimerLettre, SuiviModals, ActionsSuivi, PastilleStatut, FenetreChoixEleve } from "../discipline/SuiviParents.jsx";

const VUES = [
  ["traiter", "À traiter"],
  ["attente", "En attente"],
  ["retard", "En retard"],
  ["fait", "Terminés"],
  ["tous", "Tous les suivis"]
];

export default function DisciplineSuivi() {
  const { token, user } = useAuth();
  const { can } = usePermissions();
  const { currentYear: year } = useYear();
  const { settings } = useSettings();
  const supabase = getAuthedClient(token);
  const { reglages, logo, rechargerReglages } = useLettres();
  const peutCreer = can("disc_suivi", "creer");
  const peutModifier = can("disc_suivi", "modifier");
  const peutAnnuler = can("disc_suivi", "annuler");

  const [ref, setRef] = useState({ niveaux: [], fautes: [] });
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState(null);
  const [vue, setVue] = useState("traiter");
  const [q, setQ] = useState("");
  const [classeFiltre, setClasseFiltre] = useState("");
  const [modal, setModal] = useState(null);
  const [choixEleve, setChoixEleve] = useState(false);
  const [formReg, setFormReg] = useState(null);
  const [occupeReg, setOccupeReg] = useState(false);
  const [infoReg, setInfoReg] = useState(null);
  const verrou = useRef(false);

  const charger = async (silencieux) => {
    if (!year) { setLoading(false); return; }
    if (!silencieux) setLoading(true);
    setError("");
    try {
      const r = await chargerReferentiel(supabase);
      const donnees = await chargerSuiviAnnee(supabase, year.id);
      setRef(r); setD(donnees);
    } catch (e) { setError(e.message || "Erreur de chargement"); }
    setLoading(false);
  };
  useEffect(() => { charger(false); /* eslint-disable-next-line */ }, [token, year && year.id]);
  useEffect(() => { setFormReg({ ...reglages }); /* eslint-disable-next-line */ }, [reglages]);

  if (!year) return (<div className="page"><div className="page-header"><h1 className="page-title">Suivi des parents</h1></div><div className="dc-vide">Aucune année académique active.</div></div>);
  if (error && !d) return (<div className="page"><div className="page-header"><h1 className="page-title">Suivi des parents</h1></div><div className="login-error">{error}</div></div>);
  if (loading || !d) return (<div className="page"><div className="page-header"><h1 className="page-title">Suivi des parents</h1></div><div className="dc-vide">Chargement...</div></div>);

  const eleveDe = (sid) => d.eleves[sid] || null;
  const classeNom = (sid) => (d.classeDe[sid] ? d.classeDe[sid].nom : "");
  const faute = (id) => ref.fautes.find((f) => f.id === id);

  const seuils = calculerSeuils(d.incidents, ref.fautes).map((s) => ({ ...s, couvert: suiviCouvrant(s, d.suivis) }));
  const aTraiter = seuils.filter((s) => !s.couvert);
  const actifs = d.suivis.filter((s) => s.statut !== "annule");
  const enAttente = actifs.filter((s) => s.statut === "envoye");
  const retard = enAttente.filter((s) => enRetard(s, reglages));
  const termines = actifs.filter((s) => s.statut === "honore" || s.statut === "sans_reponse");
  const sansReponse = actifs.filter((s) => s.statut === "sans_reponse");
  const nombres = { traiter: aTraiter.length, attente: enAttente.length, retard: retard.length, fait: termines.length, tous: d.suivis.length };

  // filtres : texte (nom, matricule) et classe
  const texte = String(q || "").trim().toLowerCase();
  const garde = (sid) => {
    if (classeFiltre && classeNom(sid) !== classeFiltre) return false;
    if (!texte) return true;
    const e = eleveDe(sid);
    return !!e && (nomComplet(e).toLowerCase().includes(texte) || String(e.matricule || "").toLowerCase().includes(texte));
  };
  const classes = Array.from(new Set(Object.values(d.classeDe).map((c) => c.nom).filter(Boolean))).sort((a, b) => a.localeCompare(b, "fr", { numeric: true }));

  const listeSuivis = (vue === "tous" ? d.suivis : vue === "attente" ? enAttente : vue === "retard" ? retard : termines)
    .filter((s) => garde(s.student_uuid))
    .slice().sort((a, b) => String(b.date_suivi).localeCompare(String(a.date_suivi)) || String(b.created_at).localeCompare(String(a.created_at)));
  const listeSeuils = aTraiter.filter((s) => garde(s.studentId));

  const ouvrir = (s, type) => setModal({ kind: "nouveau", cible: { eleve: eleveDe(s.studentId), classe: classeNom(s.studentId), faute: s.faute, type, incidents: d.incidents.filter((i) => i.student_uuid === s.studentId), yearId: year.id } });
  // suivi d'un eleve choisi dans la liste, sans seuil atteint (la classe est cherchee si l'eleve n'a pas d'incident)
  const choisirEleve = async (e) => {
    setChoixEleve(false);
    let classe = classeNom(e.id);
    if (!classe) {
      try {
        const { data: a } = await supabase.from("assignments").select("class_uuid").eq("student_uuid", e.id).eq("academic_year_uuid", year.id).is("deleted_at", null).limit(1);
        if (a && a[0]) { const { data: c } = await supabase.from("classes").select("nom").eq("id", a[0].class_uuid).maybeSingle(); classe = (c && c.nom) || ""; }
      } catch (er) { /* la classe n'est qu'un detail de la lettre */ }
    }
    setModal({ kind: "nouveau", cible: { eleve: e, classe, faute: null, type: "avertissement", incidents: d.incidents.filter((i) => i.student_uuid === e.id), yearId: year.id } });
  };
  const apres = async (s, avert, message) => {
    setModal(null);
    setInfo({ type: avert ? "warn" : "ok", texte: (message || "Enregistré.") + (avert || "") });
    await charger(true);
  };
  const lettre = (s, mode) => imprimerLettre({ suivi: s, eleve: eleveDe(s.student_uuid), classe: classeNom(s.student_uuid), referentiel: ref, incidents: d.incidents, annee: year.nom, settings, logo, reglages, mode })
    .catch((e) => setInfo({ type: "bad", texte: e.message || "Impossible de créer la lettre" }));

  const enregistrerReglages = async () => {
    if (verrou.current) return;
    verrou.current = true; setOccupeReg(true); setInfoReg(null);
    try { await enregistrerReglagesLettres(supabase, user, formReg); await rechargerReglages(); setInfoReg({ type: "ok", texte: "Réglages des lettres enregistrés." }); }
    catch (e) { setInfoReg({ type: "bad", texte: e.message || "Erreur d'enregistrement" }); }
    verrou.current = false; setOccupeReg(false);
  };
  const champ = (cle, libelle, extra) => (
    <div className="form-group">
      <label>{libelle}</label>
      <input disabled={!peutModifier} value={formReg ? formReg[cle] : ""} onChange={(e) => setFormReg({ ...formReg, [cle]: e.target.value })} {...(extra || {})} />
    </div>
  );

  const kpi = (cle, libelle, couleur) => (
    <button key={cle} className={"dc-kpi cliquable" + (vue === cle ? " actif" : "")} onClick={() => setVue(cle)}>
      <div className="dc-kpi-l">{libelle}</div>
      <div className="dc-kpi-v" style={{ color: nombres[cle] && couleur ? couleur : "inherit" }}>{nombres[cle]}</div>
    </button>
  );

  return (
    <div className="page">
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "10px" }}>
        <div>
          <h1 className="page-title">Suivi des parents</h1>
          <p className="page-subtitle">Année {year.nom} · avertissements, convocations et appels : qui a été prévenu, qui n'a pas répondu</p>
        </div>
        {peutCreer && <button className="btn-primary" onClick={() => setChoixEleve(true)}>+ Nouveau suivi</button>}
      </div>

      <div className="dc-kpis">
        {kpi("traiter", "À traiter (seuil atteint)", "#dc2626")}
        {kpi("attente", "En attente de réponse", "#b45309")}
        {kpi("retard", "En retard", "#dc2626")}
        {kpi("fait", "Terminés", null)}
        <div className="dc-kpi"><div className="dc-kpi-l">Sans réponse</div><div className="dc-kpi-v">{sansReponse.length}</div></div>
      </div>

      {error && <div className="login-error" style={{ marginBottom: "14px" }}>{error}</div>}
      {info && <div className={"dc-alerte " + info.type} style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}><span>{info.texte}</span><button style={{ background: "none", border: 0, cursor: "pointer", color: "inherit", fontSize: "16px" }} onClick={() => setInfo(null)}>x</button></div>}

      <div className="dc-filtres">
        <div className="dc-onglets" style={{ margin: 0 }}>
          {VUES.map(([k, l]) => (<button key={k} className={vue === k ? "btn-primary" : "btn-sm btn-gray-cancel"} onClick={() => setVue(k)}>{l} ({nombres[k]})</button>))}
        </div>
      </div>
      <div className="dc-filtres">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher un élève (nom, matricule)..." />
        <select value={classeFiltre} onChange={(e) => setClasseFiltre(e.target.value)}>
          <option value="">Toutes les classes</option>
          {classes.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {vue === "traiter" ? (
        <div className="dc-card" style={{ padding: 0, overflow: "auto", marginBottom: "18px" }}>
          <table className="data-table">
            <thead><tr><th>Élève</th><th>Classe</th><th>Faute</th><th>Cases</th><th>Mesure prévue</th><th></th></tr></thead>
            <tbody>
              {listeSeuils.length === 0 && <tr><td colSpan="6" style={{ textAlign: "center", opacity: 0.7 }}>{aTraiter.length === 0 ? "Aucun seuil en attente : aucun élève n'a rempli toutes les cases d'une faute sans que ses parents soient informés. Pour prévenir les parents d'un élève avant le seuil, utilisez « + Nouveau suivi »." : "Aucun résultat pour ce filtre."}</td></tr>}
              {listeSeuils.map((s) => {
                const e = eleveDe(s.studentId);
                return (
                  <tr key={s.studentId + s.faute.id}>
                    <td><strong>{nomComplet(e)}</strong><br /><small>{e ? e.matricule : ""}</small></td>
                    <td>{classeNom(s.studentId) || "-"}</td>
                    <td>{s.faute.numero}. {s.faute.libelle}</td>
                    <td><span className={"dc-chip " + (s.n > s.faute.cases ? "bad" : "warn")}>{s.n}/{s.faute.cases}</span></td>
                    <td>{(s.faute.niveau && s.faute.niveau.action) || "-"}</td>
                    <td>{peutCreer && e && (
                      <div className="dc-actions">
                        <button className="btn-sm btn-primary" onClick={() => ouvrir(s, "avertissement")}>Avertissement</button>
                        <button className="btn-sm btn-gray-cancel" onClick={() => ouvrir(s, "convocation")}>Convocation</button>
                        <button className="btn-sm btn-gray-cancel" onClick={() => ouvrir(s, "appel")}>Appel</button>
                      </div>
                    )}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="dc-card" style={{ padding: 0, overflow: "auto", marginBottom: "18px" }}>
          <table className="data-table">
            <thead><tr><th>Date</th><th>Élève</th><th>Classe</th><th>Type</th><th>Faute</th><th>Destinataire</th><th>Statut</th><th>Remarque</th><th></th></tr></thead>
            <tbody>
              {listeSuivis.length === 0 && <tr><td colSpan="9" style={{ textAlign: "center", opacity: 0.7 }}>Aucun suivi dans cette liste.</td></tr>}
              {listeSuivis.map((s) => {
                const e = eleveDe(s.student_uuid);
                const f = s.faute_uuid ? faute(s.faute_uuid) : null;
                const annule = s.statut === "annule";
                return (
                  <tr key={s.id} style={{ opacity: annule ? 0.55 : 1 }}>
                    <td>{fmtDate(s.date_suivi)}<br /><small>{s.numero || ""}</small></td>
                    <td><strong>{nomComplet(e)}</strong><br /><small>{e ? e.matricule : ""}</small></td>
                    <td>{classeNom(s.student_uuid) || "-"}</td>
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
      )}

      <details className="dc-card" style={{ marginBottom: "18px" }}>
        <summary style={{ cursor: "pointer", fontWeight: 800 }}>Réglages des lettres aux parents</summary>
        <p style={{ fontSize: "13px", opacity: 0.8, margin: "10px 0 12px" }}>Le nom, l'adresse, le téléphone, l'e-mail et le logo de l'école viennent de Paramètres. Les éléments ci-dessous complètent la lettre.</p>
        {!peutModifier && <div className="dc-alerte warn">Lecture seule : vous n'avez pas le droit de modifier ces réglages.</div>}
        {infoReg && <div className={"dc-alerte " + infoReg.type}>{infoReg.texte}</div>}
        {formReg && (
          <>
            <div className="dc-reglages-grille">
              {champ("lettre_ville", "Ville (en haut de la lettre)")}
              {champ("lettre_signataire_titre", "Titre du signataire", { placeholder: "La Direction" })}
              {champ("lettre_signataire_nom", "Nom du signataire (facultatif)")}
              {champ("lettre_delai_jours", "Délai pour retourner le talon (jours)", { type: "number", min: 1, max: 60 })}
              {champ("lettre_lieu_rdv", "Lieu des convocations")}
            </div>
            {peutModifier && <div style={{ marginTop: "8px" }}><button className="btn-primary" onClick={enregistrerReglages} disabled={occupeReg}>{occupeReg ? "Enregistrement..." : "Enregistrer les réglages"}</button></div>}
          </>
        )}
      </details>

      {choixEleve && <FenetreChoixEleve fermer={() => setChoixEleve(false)} onChoisi={choisirEleve} />}
      <SuiviModals modal={modal} fermer={() => setModal(null)} annee={year.nom} referentiel={ref} reglages={reglages} logo={logo} onChange={apres} />
    </div>
  );
}
