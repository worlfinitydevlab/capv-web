import { TAG_HTML, TAG_HTML_CSS } from "../pdfTag.js";
import React, { useState, useEffect, useMemo } from "react";
import { creerBulletinsPdf, chargerLogo, nomFichierBulletin, dimensionsPapier as dimPapierPdf, urlLogoEtab } from "../pedagogie/bulletinPdf.js";
import { useYear as useYear } from "../YearContext.jsx";
import { authPourAction, definirUtilisateur } from "../pedagogie/confirmAction.js";
import { useSettings as useSettings } from "../SettingsContext.jsx";
import { usePontPedagogie } from "../pedagogie/pont.js";
import { Fenetre, PiedStandard, Confirmation, BarreListe, EtatVide, Resume, MessageEnvoi, useEnvoi } from "../pedagogie/Fenetre.jsx";

const carte = { background: "var(--card-bg, rgba(255,255,255,0.04))", border: "1px solid var(--border, rgba(255,255,255,0.1))", borderRadius: "12px", padding: "18px 20px", marginBottom: "20px" };
const TYPES = [["devoir", "Devoir"], ["interro", "Interrogation"], ["examen", "Examen"], ["autre", "Autre"]];

async function api(url, methode, corps) {
  if (methode && methode !== "GET") {
    const auth = await authPourAction(methode, url, corps);
    if (!auth) { const er = new Error("Action annulée."); er.annule = true; throw er; }
    corps = { ...(corps || {}), auth_username: auth.username, auth_password: auth.password };
  }
  const r = await fetch(url, { method: methode || "GET", headers: { "Content-Type": "application/json" }, body: corps ? JSON.stringify(corps) : undefined });
  let d = {};
  try { d = await r.json(); } catch (e) {}
  if (!r.ok) { const er = new Error(d.error || "Erreur " + r.status); er.confirmation = !!d.confirmation; throw er; }
  return d;
}
const fmt = (v) => (v === null || v === undefined || v === "" ? "-" : (Math.round(Number(v) * 10) / 10).toString());
const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export default function Notes() {
  const user = usePontPedagogie();
  definirUtilisateur(user);
  const [onglet, setOnglet] = useState("releve");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const executer = async (fn, ok) => {
    setErr(""); setMsg("");
    try { const r = await fn(); if (ok) setMsg(ok); return r; } catch (e) { setErr(e.message); }
  };
  const onglets = [["releve", "Bulletin de classe"], ["periodes", "Périodes"], ["parametres", "Paramètres"]];
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">{"Notes & Évaluations"}</h1>
          <p className="page-subtitle">{"Consulte les bulletins, gère les contrôles (périodes) et règle les formules de calcul. La saisie des notes se fait dans « Saisie des notes ». Le Contrôle général est calculé automatiquement à partir des périodes."}</p>
        </div>
      </div>
      <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
        {onglets.map(([k, t]) => (
          <button key={k} className={onglet === k ? "btn-primary" : "btn-gray-cancel"} onClick={() => { setOnglet(k); setErr(""); setMsg(""); }}>{t}</button>
        ))}
      </div>
      {err && <div className="login-error" style={{ marginBottom: "14px" }}>{err}</div>}
      {msg && <div style={{ ...carte, borderColor: "rgba(80,200,120,0.5)" }}>{msg}</div>}
      {onglet === "releve" && <Releve executer={executer} />}
      {onglet === "periodes" && <Periodes executer={executer} />}
      {onglet === "parametres" && <Parametres executer={executer} />}
    </div>
  );
}

/* -------- sélection année / classe (commun) -------- */
function useAnneeClasse() {
  const { currentYear, years } = useYear();
  const [anneeId, setAnneeId] = useState("");
  const [classes, setClasses] = useState([]);
  const [classeId, setClasseId] = useState("");
  const [periodes, setPeriodes] = useState([]);
  const [periodeId, setPeriodeId] = useState("");
  useEffect(() => { if (!anneeId && currentYear) setAnneeId(String(currentYear.id)); }, [currentYear]);
  useEffect(() => {
    setClasses([]); setClasseId(""); setPeriodes([]); setPeriodeId("");
    if (!anneeId) return;
    fetch("/api/classes-par-annee?year=" + anneeId).then((r) => r.json()).then((d) => setClasses(Array.isArray(d) ? d : [])).catch(() => {});
    api("/api/periodes?year=" + anneeId).then(setPeriodes).catch(() => {});
  }, [anneeId]);
  return { years, anneeId, setAnneeId, classes, classeId, setClasseId, periodes, periodeId, setPeriodeId, rechargerPeriodes: () => api("/api/periodes?year=" + anneeId).then(setPeriodes).catch(() => {}) };
}

function Selecteurs({ s, avecPeriode, avecCG }) {
  return (
    <div className="form-row">
      <div className="form-group">
        <label>{"Année"}</label>
        <select value={s.anneeId} onChange={(e) => s.setAnneeId(e.target.value)}>
          <option value="">{"— Choisir —"}</option>
          {(s.years || []).map((y) => <option key={y.id} value={y.id}>{y.nom}</option>)}
        </select>
      </div>
      <div className="form-group">
        <label>Classe</label>
        <select value={s.classeId} onChange={(e) => s.setClasseId(e.target.value)} disabled={!s.anneeId}>
          <option value="">{"— Choisir —"}</option>
          {s.classes.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
        </select>
      </div>
      {avecPeriode && (
        <div className="form-group">
          <label>{"Période"}</label>
          <select value={s.periodeId} onChange={(e) => s.setPeriodeId(e.target.value)} disabled={!s.anneeId}>
            <option value="">{"— Choisir —"}</option>
            {s.periodes.map((p) => <option key={p.id} value={p.id}>{p.nom + (p.verrouillee ? " (verrouillée)" : "")}</option>)}
            {avecCG && s.periodes.length > 0 && <option value="cg">{"Contrôle général (calculé automatiquement)"}</option>}
          </select>
        </div>
      )}
    </div>
  );
}

/* -------- Périodes -------- */
// La liste d'abord ; "+ Ajouter une période" ouvre une fenêtre (standard Worlf, voir ../pedagogie/Fenetre.jsx)
function Periodes({ executer }) {
  const { currentYear, years } = useYear();
  const [anneeId, setAnneeId] = useState("");
  const [liste, setListe] = useState(null); // null = lecture en cours
  const [pond, setPond] = useState(false);
  const [fen, setFen] = useState(null); // { type: "creer" } | { type: "modifier", p } | { type: "supprimer", p } | { type: "copier" }
  useEffect(() => { if (!anneeId && currentYear) setAnneeId(String(currentYear.id)); }, [currentYear]);

  const charger = async () => {
    if (!anneeId) { setListe(null); return; }
    try { setListe(await api("/api/periodes?year=" + anneeId)); } catch (e) { setListe([]); }
  };
  useEffect(() => {
    setListe(null);
    charger();
    if (anneeId) api("/api/pedagogie/parametres?year=" + anneeId).then((p) => setPond(!!Number(p.ponderation_periodes))).catch(() => {});
  }, [anneeId]);

  const annee = (years || []).find((y) => String(y.id) === String(anneeId));
  const notifier = (texte) => executer(async () => {}, texte);
  const fermer = () => setFen(null);
  const apres = async (texte) => { await charger(); fermer(); notifier(texte); };
  const basculer = (p) => executer(async () => {
    // ouvrir / fermer la saisie des notes de ce contrôle (le responsable pédagogique) ; "?saisie=" sert au texte de la confirmation et au journal
    await api("/api/periodes/" + p.id + "?saisie=" + (p.verrouillee ? "ouvrir" : "fermer"), "PUT", { ...p, verrouillee: p.verrouillee ? 0 : 1 });
    await charger();
  }, "Saisie des notes " + (p.verrouillee ? "ouverte" : "fermée") + " pour « " + p.nom + " ».");
  const ouvrirCreation = () => setFen({ type: "creer" });
  const boutonCopie = <button type="button" className="btn-gray-cancel" onClick={() => setFen({ type: "copier" })}>{"Reprendre d'une autre année"}</button>;

  return (
    <>
      <div className="wf-filtres">
        <div className="form-group">
          <label>{"Année"}</label>
          <select value={anneeId} onChange={(e) => setAnneeId(e.target.value)}>
            <option value="">{"— Choisir —"}</option>
            {(years || []).map((y) => <option key={y.id} value={y.id}>{y.nom}</option>)}
          </select>
        </div>
      </div>

      {!anneeId && <p className="wf-intro">{"Choisis une année pour voir ses périodes."}</p>}
      {anneeId && liste === null && <p className="wf-intro">{"Chargement..."}</p>}
      {anneeId && liste !== null && (liste.length === 0 ? (
        <EtatVide
          titre={"Aucune période pour cette année"}
          texte={"Les périodes (étapes, trimestres...) reçoivent les évaluations et les notes. Crée la première, ou reprends celles d'une autre année."}
          libelleBouton={"Créer la première période"}
          onBouton={ouvrirCreation}
          extra={boutonCopie}
        />
      ) : (
        <>
          <BarreListe
            titre={"Périodes"}
            compte={liste.length + (liste.length > 1 ? " périodes" : " période")}
            libelleBouton={"Ajouter une période"}
            onBouton={ouvrirCreation}
            extra={boutonCopie}
          />
          <p className="wf-intro">{"Le responsable pédagogique ouvre la saisie d'un contrôle quand les enseignants peuvent commencer, puis la ferme pour que plus personne ne modifie les notes. Quand la saisie est fermée, la page « Saisie des notes » est en lecture seule pour ce contrôle."}</p>
          <div className="table-card">
            <table className="data-table">
              <thead><tr><th>{"Ordre"}</th><th>{"Période"}</th><th>{"Début"}</th><th>Fin</th><th>{"Évaluations"}</th>{pond && <th>Poids</th>}<th>{"Saisie des notes"}</th><th></th></tr></thead>
              <tbody>
                {liste.map((p) => (
                  <tr key={p.id}>
                    <td>{p.ordre}</td><td><strong>{p.nom}</strong></td><td>{p.date_debut || "-"}</td><td>{p.date_fin || "-"}</td><td>{p.nb_evaluations}</td>
                    {pond && <td>{p.poids === null || p.poids === undefined ? 1 : p.poids}</td>}
                    <td><span className={"badge " + (p.verrouillee ? "badge-err" : "badge-ok")}>{p.verrouillee ? "Saisie fermée" : "Saisie ouverte"}</span></td>
                    <td className="table-actions">
                      <button className="btn-sm btn-gray-cancel" onClick={() => setFen({ type: "modifier", p })}>Modifier</button>{" "}
                      <button className="btn-sm btn-gray-cancel" title={p.verrouillee ? "Les enseignants pourront saisir et modifier les notes de ce contrôle" : "Plus personne ne pourra saisir ni modifier de note de ce contrôle"} onClick={() => basculer(p)}>{p.verrouillee ? "Ouvrir la saisie" : "Fermer la saisie"}</button>{" "}
                      <button className="btn-sm btn-red" onClick={() => setFen({ type: "supprimer", p })}>Supprimer</button>
                    </td>
                  </tr>
                ))}
                <tr style={{ background: "rgba(255,200,0,0.07)" }}><td>{"∑"}</td><td colSpan={pond ? 7 : 6}><strong>{"Contrôle général"}</strong>{" — généré automatiquement : moyenne des périodes ci-dessus, calculée pour chaque matière et chaque élève. Ce n'est pas une période de plus et il n'a pas de notes à saisir."}</td></tr>
              </tbody>
            </table>
          </div>
        </>
      ))}

      {fen && (fen.type === "creer" || fen.type === "modifier") && (
        <FenetrePeriode annee={annee} anneeId={anneeId} periode={fen.type === "modifier" ? fen.p : null} pond={pond} fermer={fermer} apres={apres} />
      )}
      {fen && fen.type === "supprimer" && (
        <Confirmation
          titre={"Supprimer la période"}
          texte={"Supprimer la période « " + fen.p.nom + " » ?"}
          libelle={"Supprimer"}
          danger
          fermer={fermer}
          action={async () => { await api("/api/periodes/" + fen.p.id, "DELETE"); await apres("Période « " + fen.p.nom + " » supprimée."); }}
        />
      )}
      {fen && fen.type === "copier" && (
        <FenetreCopiePeriodes annee={annee} anneeId={anneeId} years={years} fermer={fermer} apres={apres} />
      )}
    </>
  );
}

function FenetrePeriode({ annee, anneeId, periode, pond, fermer, apres }) {
  const edition = !!periode;
  const depart = {
    nom: edition ? (periode.nom || "") : "",
    date_debut: edition ? (periode.date_debut || "") : "",
    date_fin: edition ? (periode.date_fin || "") : "",
    ordre: edition && periode.ordre !== null && periode.ordre !== undefined ? String(periode.ordre) : "",
    poids: edition ? String(periode.poids === null || periode.poids === undefined ? 1 : periode.poids) : "1"
  };
  const [f, setF] = useState(depart);
  const envoi = useEnvoi();
  const modifie = Object.keys(depart).some((k) => f[k] !== depart[k]);
  const valeur = (cle) => (f[cle] !== depart[cle] ? f[cle] : periode[cle]); // une valeur non touchee reste telle que le serveur l'a donnee
  const valider = () => {
    if (!f.nom.trim()) return;
    if (f.date_debut && f.date_fin && f.date_fin < f.date_debut) { envoi.setErr("La date de fin ne peut pas être avant la date de début."); return; }
    envoi.envoyer(async (confirmer) => {
      if (edition) {
        await api("/api/periodes/" + periode.id, "PUT", { ...periode, ordre: f.ordre === "" ? periode.ordre : valeur("ordre"), nom: f.nom.trim(), date_debut: valeur("date_debut"), date_fin: valeur("date_fin") });
        if (pond && f.poids !== depart.poids) {
          await api("/api/periodes/" + periode.id + "/poids", "PUT", { poids: Number(f.poids), confirmer: confirmer || undefined });
        }
        await apres("Période « " + f.nom.trim() + " » modifiée.");
      } else {
        await api("/api/periodes", "POST", { nom: f.nom.trim(), date_debut: f.date_debut, date_fin: f.date_fin, academic_year_id: anneeId });
        await apres("Période « " + f.nom.trim() + " » ajoutée à l'année " + (annee ? annee.nom : "") + ".");
      }
    });
  };
  return (
    <Fenetre
      titre={edition ? "Modifier la période" : "Créer une nouvelle période"}
      sousTitre={edition ? "Changez les informations de cette période." : "Ajoutez une nouvelle période pour l'année " + (annee ? annee.nom : "choisie") + "."}
      fermer={fermer}
      occupe={envoi.occupe}
      protege={modifie}
      onSubmit={valider}
      pied={<PiedStandard fermer={fermer} occupe={envoi.occupe} libelle={edition ? "Enregistrer" : "Créer"} desactive={!f.nom.trim()} envoi={envoi} />}
    >
      <MessageEnvoi envoi={envoi} />
      <div className="form-group">
        <label>{"Nom *"}</label>
        <input value={f.nom} placeholder={"Étape 1"} onChange={(e) => setF({ ...f, nom: e.target.value })} />
      </div>
      <div className="form-row">
        <div className="form-group"><label>{"Début"}</label><input type="date" value={f.date_debut} onChange={(e) => setF({ ...f, date_debut: e.target.value })} /></div>
        <div className="form-group"><label>Fin</label><input type="date" value={f.date_fin} onChange={(e) => setF({ ...f, date_fin: e.target.value })} /></div>
      </div>
      {edition && (
        <div className="form-group">
          <label>Ordre</label>
          <input type="number" value={f.ordre} onChange={(e) => setF({ ...f, ordre: e.target.value })} />
          <div className="wf-aide">{"Position de la période dans l'année."}</div>
        </div>
      )}
      {edition && pond && (
        <div className="form-group">
          <label>Poids</label>
          <input type="number" min="0" step="0.5" value={f.poids} onChange={(e) => setF({ ...f, poids: e.target.value })} />
          <div className="wf-aide">{"Importance de cette période dans le Contrôle général."}</div>
        </div>
      )}
    </Fenetre>
  );
}

function FenetreCopiePeriodes({ annee, anneeId, years, fermer, apres }) {
  const [source, setSource] = useState("");
  const envoi = useEnvoi();
  const autres = (years || []).filter((y) => String(y.id) !== String(anneeId));
  const valider = () => {
    if (!source) return;
    envoi.envoyer(async () => {
      await api("/api/periodes/copier-annee", "POST", { from_year: source, to_year: anneeId });
      await apres("Périodes copiées.");
    });
  };
  return (
    <Fenetre
      titre={"Reprendre d'une autre année"}
      sousTitre={"Copiez les périodes d'une année vers " + (annee ? annee.nom : "l'année choisie") + "."}
      fermer={fermer}
      occupe={envoi.occupe}
      protege={!!source}
      onSubmit={valider}
      pied={<PiedStandard fermer={fermer} occupe={envoi.occupe} libelle={"Copier"} desactive={!source} envoi={envoi} />}
    >
      <MessageEnvoi envoi={envoi} />
      <div className="form-group">
        <label>{"Année source *"}</label>
        <select value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">{"Sélectionner l'année à copier"}</option>
          {autres.map((y) => <option key={y.id} value={y.id}>{y.nom}</option>)}
        </select>
        <div className="wf-aide">{"Les périodes de l'année choisie sont ajoutées à celle-ci."}</div>
      </div>
    </Fenetre>
  );
}

/* -------- Saisie -------- */
function Saisie({ executer }) {
  const s = useAnneeClasse();
  const [matieres, setMatieres] = useState([]);
  const [csId, setCsId] = useState("");
  const [evals, setEvals] = useState([]);
  const [f, setF] = useState({ nom: "", type: "devoir", bareme: "20", date_evaluation: "" });
  const [edit, setEdit] = useState(null);
  const [courante, setCourante] = useState(null);
  const [lignes, setLignes] = useState([]);
  const [modifie, setModifie] = useState(false);
  const [rafraichir, setRafraichir] = useState(0);

  const periode = s.periodes.find((p) => String(p.id) === String(s.periodeId));
  const verrou = !!(periode && periode.verrouillee);

  useEffect(() => {
    setMatieres([]); setCsId(""); setEvals([]); setCourante(null);
    if (s.classeId) api("/api/matieres-classe?class_id=" + s.classeId).then(setMatieres).catch(() => {});
  }, [s.classeId]);

  const chargerEvals = async () => {
    setCourante(null); setLignes([]);
    if (!csId || !s.periodeId) { setEvals([]); return; }
    try { setEvals(await api("/api/evaluations?class_subject_id=" + csId + "&period_id=" + s.periodeId)); } catch (e) {}
  };
  useEffect(() => { chargerEvals(); }, [csId, s.periodeId]);

  const ouvrir = async (ev) => {
    setCourante(ev); setModifie(false);
    try { setLignes(await api("/api/evaluations/" + ev.id + "/notes")); } catch (e) { executer(async () => { throw e; }); }
  };

  const creer = () => executer(async () => {
    await api("/api/evaluations", "POST", { class_subject_id: csId, period_id: s.periodeId, ...f, bareme: Number(f.bareme) });
    setF({ nom: "", type: "devoir", bareme: "20", date_evaluation: "" });
    await chargerEvals();
  });
  const sauverEval = () => executer(async () => { await api("/api/evaluations/" + edit.id, "PUT", { ...edit, bareme: Number(edit.bareme) }); setEdit(null); await chargerEvals(); });
  const supprimerEval = (ev) => {
    if (!window.confirm("Supprimer l'évaluation " + ev.nom + " et toutes ses notes ?")) return;
    executer(async () => { await api("/api/evaluations/" + ev.id, "DELETE"); await chargerEvals(); });
  };

  const changer = (id, champ, valeur) => {
    setModifie(true);
    setLignes(lignes.map((l) => (l.id === id ? { ...l, [champ]: valeur, ...(champ === "absent" && valeur ? { note: "" } : {}) } : l)));
  };
  const depasse = (l) => l.note !== "" && l.note !== null && l.note !== undefined && Number(l.note) > Number(courante.bareme);
  const enregistrer = () => executer(async () => {
    if (lignes.some(depasse)) throw new Error("Une note dépasse le barème (" + courante.bareme + ").");
    await api("/api/evaluations/" + courante.id + "/notes", "POST", { items: lignes.map((l) => ({ student_id: l.id, note: l.note === "" || l.note === null ? null : Number(l.note), absent: l.absent ? 1 : 0 })) });
    setModifie(false);
    await ouvrir(courante);
    await chargerEvals();
    setRafraichir((n) => n + 1);
  }, "Notes enregistrées.");

  const entree = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const champs = Array.from(document.querySelectorAll("[data-note]"));
    const i = champs.indexOf(e.target);
    if (i >= 0 && champs[i + 1]) champs[i + 1].focus();
  };

  const stats = useMemo(() => {
    const vals = lignes.filter((l) => !l.absent && l.note !== "" && l.note !== null && l.note !== undefined).map((l) => Number(l.note));
    if (!vals.length || !courante) return null;
    const moy = vals.reduce((a, b) => a + b, 0) / vals.length;
    return { n: vals.length, moy, pct: (moy / courante.bareme) * 100, max: Math.max(...vals), min: Math.min(...vals) };
  }, [lignes, courante]);

  return (
    <>
      <div style={carte}>
        <Selecteurs s={s} avecPeriode />
        <div className="form-row">
          <div className="form-group">
            <label>{"Matière"}</label>
            <select value={csId} onChange={(e) => setCsId(e.target.value)} disabled={!s.classeId}>
              <option value="">{"— Choisir —"}</option>
              {matieres.map((m) => <option key={m.id} value={m.id}>{m.matiere_nom + (m.enseignant_nom ? " — " + m.enseignant_nom : "")}</option>)}
            </select>
          </div>
        </div>
        {s.classeId && matieres.length === 0 && <div style={{ color: "var(--text-dim)" }}>{"Cette classe n'a pas encore de matières (menu Matières & Enseignants → Matières par classe)."}</div>}
        {s.anneeId && s.periodes.length === 0 && <div style={{ color: "var(--text-dim)" }}>{"Aucune période pour cette année : crée-les dans l'onglet Périodes."}</div>}
      </div>

      {s.classeId && s.periodeId && <VueEnsemble s={s} rafraichir={rafraichir} csId={csId} onChoisir={(id) => setCsId(String(id))} />}

      {csId && s.periodeId && (
        <div style={carte}>
          <h3 style={{ marginTop: 0 }}>{"Évaluations"}{verrou ? " — période verrouillée" : ""}</h3>
          {!verrou && (
            <div className="form-row">
              <div className="form-group"><label>{"Nom *"}</label><input value={f.nom} placeholder="Devoir 1" onChange={(e) => setF({ ...f, nom: e.target.value })} /></div>
              <div className="form-group"><label>Type</label><select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{TYPES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></div>
              <div className="form-group"><label>{"Barème (total) *"}</label><input type="number" min="1" step="0.5" value={f.bareme} onChange={(e) => setF({ ...f, bareme: e.target.value })} /></div>
              <div className="form-group"><label>Date</label><input type="date" value={f.date_evaluation} onChange={(e) => setF({ ...f, date_evaluation: e.target.value })} /></div>
            </div>
          )}
          {!verrou && <button className="btn-primary" onClick={creer} disabled={!f.nom.trim() || !(Number(f.bareme) > 0)}>{"Créer l'évaluation"}</button>}
          <div className="table-card" style={{ marginTop: "14px" }}>
            <table className="data-table">
              <thead><tr><th>{"Évaluation"}</th><th>Type</th><th>{"Barème"}</th><th>Date</th><th>Notes</th><th></th></tr></thead>
              <tbody>
                {evals.map((ev) => edit && edit.id === ev.id ? (
                  <tr key={ev.id}>
                    <td><input value={edit.nom} onChange={(e) => setEdit({ ...edit, nom: e.target.value })} /></td>
                    <td><select value={edit.type} onChange={(e) => setEdit({ ...edit, type: e.target.value })}>{TYPES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></td>
                    <td><input type="number" style={{ width: "80px" }} value={edit.bareme} onChange={(e) => setEdit({ ...edit, bareme: e.target.value })} /></td>
                    <td><input type="date" value={edit.date_evaluation || ""} onChange={(e) => setEdit({ ...edit, date_evaluation: e.target.value })} /></td>
                    <td>{ev.nb_notes}</td>
                    <td className="table-actions"><button className="btn-sm btn-green" onClick={sauverEval}>OK</button> <button className="btn-sm btn-gray-cancel" onClick={() => setEdit(null)}>Annuler</button></td>
                  </tr>
                ) : (
                  <tr key={ev.id} style={courante && courante.id === ev.id ? { outline: "1px solid var(--accent)" } : {}}>
                    <td><strong>{ev.nom}</strong></td>
                    <td>{(TYPES.find((t) => t[0] === ev.type) || [0, ev.type])[1]}</td>
                    <td>{"/ " + ev.bareme}</td><td>{ev.date_evaluation || "-"}</td><td>{ev.nb_notes}</td>
                    <td className="table-actions">
                      <button className="btn-sm btn-green" onClick={() => ouvrir(ev)}>{verrou ? "Voir" : "Saisir"}</button>{" "}
                      {!verrou && <button className="btn-sm btn-gray-cancel" onClick={() => setEdit({ ...ev })}>Modifier</button>}{" "}
                      {!verrou && <button className="btn-sm btn-red" onClick={() => supprimerEval(ev)}>Supprimer</button>}
                    </td>
                  </tr>
                ))}
                {evals.length === 0 && <tr><td colSpan={6} className="table-empty">{"Aucune évaluation pour cette matière et cette période."}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {courante && (
        <div style={carte}>
          <h3 style={{ marginTop: 0 }}>{courante.nom + " — sur " + courante.bareme}</h3>
          <div className="table-card" style={{ maxHeight: "460px", overflowY: "auto" }}>
            <table className="data-table">
              <thead><tr><th>#</th><th>{"Élève"}</th><th>Note</th><th>Absent</th><th>%</th></tr></thead>
              <tbody>
                {lignes.map((l, i) => (
                  <tr key={l.id}>
                    <td>{i + 1}</td>
                    <td>{l.nom + " " + (l.prenom || "")}</td>
                    <td><input data-note="1" type="number" min="0" max={courante.bareme} step="0.25" disabled={verrou || !!l.absent} style={{ width: "90px", borderColor: depasse(l) ? "var(--err, #e55)" : undefined }} value={l.note === null || l.note === undefined ? "" : l.note} onChange={(e) => changer(l.id, "note", e.target.value)} onKeyDown={entree} /></td>
                    <td><input type="checkbox" disabled={verrou} checked={!!l.absent} onChange={(e) => changer(l.id, "absent", e.target.checked ? 1 : 0)} /></td>
                    <td>{l.note !== "" && l.note !== null && l.note !== undefined && !l.absent ? fmt((Number(l.note) / courante.bareme) * 100) : "-"}</td>
                  </tr>
                ))}
                {lignes.length === 0 && <tr><td colSpan={5} className="table-empty">{"Aucun élève dans cette classe pour cette année."}</td></tr>}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", gap: "16px", alignItems: "center", marginTop: "12px", flexWrap: "wrap" }}>
            {!verrou && <button className="btn-primary" onClick={enregistrer} disabled={!modifie}>{"Enregistrer les notes"}</button>}
            {stats && <span style={{ fontSize: "13px", color: "var(--text-dim)" }}>{stats.n + " notes — moyenne " + fmt(stats.moy) + " / " + courante.bareme + " (" + fmt(stats.pct) + " %) — max " + fmt(stats.max) + " — min " + fmt(stats.min)}</span>}
            {modifie && <span style={{ fontSize: "13px", color: "var(--gold, #c90)" }}>{"Modifications non enregistrées"}</span>}
          </div>
        </div>
      )}
    </>
  );
}


/* -------- Vue d'ensemble : élèves en lignes, matières en colonnes -------- */
function VueEnsemble({ s, rafraichir, csId, onChoisir }) {
  const [data, setData] = useState(null);
  const [ouvert, setOuvert] = useState(true);
  useEffect(() => {
    setData(null);
    if (!s.classeId || !s.periodeId) return;
    api("/api/notes/bulletin?class_id=" + s.classeId + "&period_id=" + s.periodeId).then(setData).catch(() => {});
  }, [s.classeId, s.periodeId, rafraichir]);
  if (!data) return null;
  const matieres = data.categories.flatMap((k) => k.matieres);
  const moyenne = (id) => {
    const v = data.eleves.map((e) => e.points[id]).filter((x) => x !== undefined && x !== null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const couleur = (v, coef) => (v === undefined || v === null ? undefined : v < coef / 2 ? "var(--err, #e55)" : undefined);
  return (
    <div style={carte}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }} onClick={() => setOuvert(!ouvert)}>
        <h3 style={{ margin: 0 }}>{"Vue d'ensemble de la classe"}</h3>
        <span style={{ fontSize: "13px", color: "var(--text-dim)" }}>{ouvert ? "Masquer" : "Afficher"}</span>
      </div>
      {ouvert && (
        <>
          <p style={{ fontSize: "12px", color: "var(--text-dim)", margin: "8px 0" }}>{"Points obtenus par matière (sur son coefficient). Clique sur une matière pour saisir ses notes ci-dessous."}</p>
          <div className="table-card" style={{ overflowX: "auto", maxHeight: "420px", overflowY: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th rowSpan={2}>#</th><th rowSpan={2}>{"Élève"}</th>
                  {data.categories.map((k) => <th key={k.key} colSpan={k.matieres.length}>{k.nom}</th>)}
                  <th rowSpan={2}>Total<div style={{ fontSize: "11px", fontWeight: "normal" }}>{"/ " + data.max_total}</div></th>
                  <th rowSpan={2}>{"Moy."}<div style={{ fontSize: "11px", fontWeight: "normal" }}>{"/ " + data.base}</div></th>
                </tr>
                <tr>
                  {matieres.map((m) => (
                    <th key={m.id} onClick={() => onChoisir(m.id)} style={{ cursor: "pointer", background: String(csId) === String(m.id) ? "rgba(255,200,0,0.18)" : undefined }}>
                      {m.nom}<div style={{ fontSize: "11px", fontWeight: "normal" }}>{"/ " + m.coefficient}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.eleves.map((e, i) => (
                  <tr key={e.id}>
                    <td>{i + 1}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{e.nom + " " + (e.prenom || "")}</td>
                    {matieres.map((m) => (
                      <td key={m.id} onClick={() => onChoisir(m.id)} style={{ cursor: "pointer", textAlign: "center", color: couleur(e.points[m.id], m.coefficient), background: String(csId) === String(m.id) ? "rgba(255,200,0,0.08)" : undefined }}>{f2(e.points[m.id])}</td>
                    ))}
                    <td style={{ textAlign: "center" }}><strong>{f2(e.total)}</strong></td>
                    <td style={{ textAlign: "center" }}><strong>{f2(e.moyenne)}</strong></td>
                  </tr>
                ))}
                {data.eleves.length === 0 && <tr><td colSpan={99} className="table-empty">{"Aucun élève dans cette classe pour cette année."}</td></tr>}
              </tbody>
              {data.eleves.length > 0 && (
                <tfoot>
                  <tr>
                    <td></td><td><strong>{"Moyenne de la classe"}</strong></td>
                    {matieres.map((m) => <td key={m.id} style={{ textAlign: "center" }}><strong>{f2(moyenne(m.id))}</strong></td>)}
                    <td style={{ textAlign: "center" }}><strong>{f2(data.eleves.filter((e) => e.total !== null).length ? data.eleves.filter((e) => e.total !== null).reduce((a, e) => a + e.total, 0) / data.eleves.filter((e) => e.total !== null).length : null)}</strong></td>
                    <td style={{ textAlign: "center" }}><strong>{f2(data.eleves.filter((e) => e.moyenne !== null).length ? data.eleves.filter((e) => e.moyenne !== null).reduce((a, e) => a + e.moyenne, 0) / data.eleves.filter((e) => e.moyenne !== null).length : null)}</strong></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </>
      )}
    </div>
  );
}

/* -------- Bulletin de classe (catégories, totaux, moyenne sur 10) -------- */
/* -------- Impression (format configurable, logo et nom de l'établissement) -------- */
const PAPIERS = { a4: [210, 297], a5: [148, 210], a6: [105, 148], letter: [216, 279], legal: [216, 356] };
const IMP_DEFAUT = { format: "a5", largeur_mm: 148, hauteur_mm: 210, orientation: "portrait", marge_mm: 8, afficher_logo: 1 };

function dimensionsPapier(cfg) {
  if (cfg.format === "custom") return { l: Number(cfg.largeur_mm) || 148, h: Number(cfg.hauteur_mm) || 210 };
  const [a, b] = PAPIERS[cfg.format] || PAPIERS.a5;
  return cfg.orientation === "paysage" ? { l: Math.max(a, b), h: Math.min(a, b) } : { l: Math.min(a, b), h: Math.max(a, b) };
}

function urlLogo(settings) {
  if (!settings || !settings.logo) return null;
  if (/^(https?:|data:)/.test(String(settings.logo))) return settings.logo;
  const o = window.location.origin;
  return (o.startsWith("http") ? o : "http://localhost:3001") + "/uploads/" + settings.logo;
}

function ouvrirImpression(titre, corps, cfg, settings, options) {
  const c = cfg || IMP_DEFAUT;
  const { l, h } = options && options.paysageA4 ? { l: 297, h: 210 } : dimensionsPapier(c);
  const marge = options && options.paysageA4 ? 8 : (Number(c.marge_mm) >= 0 ? Number(c.marge_mm) : 8);
  const px = l < 120 ? 9 : l < 170 ? 11 : l < 250 ? 12 : 11;
  const logo = c.afficher_logo ? urlLogo(settings) : null;
  const nom = (settings && settings.nom_etablissement) || "Établissement";
  const details = [settings && settings.adresse, settings && settings.telephone, settings && settings.email].filter(Boolean).map(esc).join(" — ");
  const entete = '<div class="ent">' + (logo ? '<img src="' + esc(logo) + '" alt="">' : "") +
    '<div><div class="etab">' + esc(nom) + "</div>" + (details ? '<div class="det">' + details + "</div>" : "") + "</div></div>";
  const css = TAG_HTML_CSS + "@page{size:" + l + "mm " + h + "mm;margin:" + marge + "mm}" +
    "*{box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:" + px + "px;color:#111;margin:0}" +
    ".ent{display:flex;align-items:center;gap:10px;border-bottom:2px solid #333;padding-bottom:6px;margin-bottom:8px}" +
    ".ent img{height:" + Math.round(px * 4.2) + "px;width:auto;object-fit:contain}.etab{font-size:" + Math.round(px * 1.5) + "px;font-weight:bold}.det{font-size:" + Math.round(px * 0.85) + "px;color:#444}" +
    "table{border-collapse:collapse;width:100%}th,td{border:1px solid #888;padding:" + Math.max(2, Math.round(px / 3)) + "px;text-align:center}th{background:#eee}" +
    ".cat td{background:#ddd;font-weight:bold}.tot td{background:#f5f5f5;font-weight:bold}h3{margin:6px 0}p{margin:4px 0}" +
    ".sig{display:flex;justify-content:space-between;margin-top:" + Math.round(px * 3.5) + "px}";
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write("<html><head><meta charset='utf-8'><title>" + esc(titre) + "</title><style>" + css + "</style></head><body>" + TAG_HTML + entete + corps +
    "<script>window.onload=function(){setTimeout(function(){window.print();},250);};<\/script></body></html>");
  w.document.close(); w.focus();
}

const f2 = (v) => (v === null || v === undefined ? "-" : (Math.round(Number(v) * 100) / 100).toString().replace(".", ","));

function Releve({ executer }) {
  const s = useAnneeClasse();
  const { settings } = useSettings();
  const [data, setData] = useState(null);
  const [imp, setImp] = useState(IMP_DEFAUT);
  useEffect(() => { api("/api/pedagogie/impression").then(setImp).catch(() => {}); }, []);

  useEffect(() => {
    setData(null);
    if (!s.classeId || !s.periodeId) return;
    executer(async () => { setData(await api("/api/notes/bulletin?class_id=" + s.classeId + "&period_id=" + s.periodeId)); });
  }, [s.classeId, s.periodeId]);

  const contexte = () => ({
    classe: (s.classes.find((c) => String(c.id) === String(s.classeId)) || {}).nom || "",
    periode: s.periodeId === "cg" ? "Contrôle général" : (s.periodes.find((p) => String(p.id) === String(s.periodeId)) || {}).nom || "",
    annee: ((s.years || []).find((y) => String(y.id) === String(s.anneeId)) || {}).nom || ""
  });

  const imprimerClasse = () => {
    if (!data) return;
    const c = contexte();
    const ligne1 = '<th rowspan="2">Rang</th><th rowspan="2">Élève</th>' + data.categories.map((k) => '<th colspan="' + (k.matieres.length + 2) + '">' + esc(k.nom) + "</th>").join("") + '<th colspan="2">Général</th>';
    const ligne2 = data.categories.map((k) => k.matieres.map((m) => "<th>" + esc(m.nom) + "<br><small>/" + esc(m.coefficient) + "</small></th>").join("") + "<th>Total<br><small>/" + esc(k.max_total) + "</small></th><th>Moy.<br><small>/" + data.base + "</small></th>").join("") + "<th>Total<br><small>/" + esc(data.max_total) + "</small></th><th>Moy.<br><small>/" + data.base + "</small></th>";
    const corps = data.eleves.map((e) => "<tr><td>" + esc(e.rang || "-") + "</td><td style='text-align:left'>" + esc(e.nom + " " + (e.prenom || "")) + "</td>" +
      data.categories.map((k) => k.matieres.map((m) => "<td>" + f2(e.points[m.id]) + "</td>").join("") + "<td><b>" + f2(e.cats[k.key].total) + "</b></td><td><b>" + f2(e.cats[k.key].moyenne) + "</b></td>").join("") +
      "<td><b>" + f2(e.total) + "</b></td><td><b>" + f2(e.moyenne) + "</b></td></tr>").join("");
    ouvrirImpression("Bulletin de classe", "<h3>Bulletin de classe — " + esc(c.classe) + "</h3><p>" + esc(c.annee) + " — " + esc(c.periode) + (data.controle_general ? " (valeur calculée automatiquement)" : "") + "</p><table><tr>" + ligne1 + "</tr><tr>" + ligne2 + "</tr>" + corps + "</table>", imp, settings, { paysageA4: true });
  };

    const sortiePdf = async (liste, telecharger, eleveUnique) => {
    if (!data) return;
    const w = telecharger ? null : window.open("", "_blank");
    try {
      const logo = imp.afficher_logo ? await chargerLogo(urlLogoEtab(settings)) : null;
      const doc = await creerBulletinsPdf({ eleves: liste, data, contexte: contexte(), settings, dim: dimPapierPdf(imp), logo, marge: imp.marge_mm });
      const nom = nomFichierBulletin(contexte(), eleveUnique);
      if (telecharger) doc.save(nom);
      else { const url = URL.createObjectURL(doc.output("blob")); if (w) w.location.href = url; else window.open(url, "_blank"); }
    } catch (er) { if (w) w.close(); window.alert("Impossible de creer le PDF : " + ((er && er.message) || er)); }
  };
  const imprimerEleve = (e) => sortiePdf([e], false, e);
  const telechargerEleve = (e) => sortiePdf([e], true, e);
  const telechargerTous = () => sortiePdf(data.eleves, true, null);

  const imprimerEleveAncien = (e) => {
    const c = contexte();
    const blocs = data.categories.map((k) => {
      const lignes = k.matieres.map((m) => "<tr><td style='text-align:left'>" + esc(m.nom) + "</td><td>" + esc(m.coefficient) + "</td><td>" + f2(e.points[m.id]) + "</td></tr>").join("");
      return "<tr class='cat'><td colspan='3' style='text-align:left'>" + esc(k.nom) + "</td></tr>" + lignes +
        "<tr class='tot'><td style='text-align:left'>Total " + esc(k.nom) + "</td><td>" + esc(e.cats[k.key].max) + "</td><td>" + f2(e.cats[k.key].total) + "</td></tr>" +
        "<tr class='tot'><td style='text-align:left'>Moyenne " + esc(k.nom) + " (sur " + data.base + ")</td><td></td><td>" + f2(e.cats[k.key].moyenne) + "</td></tr>";
    }).join("");
    ouvrirImpression("Bulletin de notes", "<h3 style='text-align:center'>Bulletin de notes" + (data.controle_general ? " — Contrôle général" : "") + "</h3><p><b>Élève :</b> " + esc(e.nom + " " + (e.prenom || "")) + "<br><b>Classe :</b> " + esc(c.classe) + " &nbsp; <b>Année :</b> " + esc(c.annee) + " &nbsp; <b>Période :</b> " + esc(c.periode) + "</p><table><tr><th style='text-align:left'>Matière</th><th>Maximum</th><th>Note obtenue</th></tr>" + blocs +
      "<tr class='tot'><td style='text-align:left'>TOTAL GÉNÉRAL</td><td>" + esc(e.max) + "</td><td>" + f2(e.total) + "</td></tr><tr class='tot'><td style='text-align:left'>MOYENNE GÉNÉRALE (sur " + data.base + ")</td><td></td><td>" + f2(e.moyenne) + "</td></tr><tr class='tot'><td style='text-align:left'>Rang</td><td></td><td>" + esc(e.rang ? e.rang + " / " + data.eleves.length : "-") + "</td></tr></table><p style='margin-top:8px'><b>Observations :</b> ______________________________</p><div class='sig'><span>Le titulaire : ______________</span><span>La direction : ______________</span></div>", imp, settings);
  };

  return (
    <>
      <div style={carte}><Selecteurs s={s} avecPeriode avecCG /></div>
      {data && (
        <div style={carte}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", gap: "10px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "13px", color: "var(--text-dim)" }}>{(data.controle_general ? "Contrôle général : valeur calculée (" + (data.parametres.ponderation_periodes ? "moyenne pondérée" : "moyenne simple") + " des " + data.periodes_prises + " période(s), notes manquantes " + (data.parametres.note_manquante === "zero" ? "comptées pour zéro" : "ignorées") + "). " : "") + "Chaque matière est notée sur son coefficient (note maximale). Moyenne générale : " + (data.parametres.mode_moyenne_generale === "moyenne_categories" ? "moyenne pondérée des catégories" : "total des points ÷ maximum") + ", sur " + data.base + "."}</span>
            <span style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}><button className="btn-gray-cancel btn-sm" onClick={telechargerTous}>{"Tous les bulletins (PDF)"}</button><button className="btn-gray-cancel btn-sm" onClick={imprimerClasse}>{"Imprimer le bulletin de classe"}</button></span>
          </div>
          {data.matieres_sans_categorie > 0 && <div style={{ color: "var(--gold, #c90)", fontSize: "13px", marginBottom: "8px" }}>{data.matieres_sans_categorie + " matière(s) sans catégorie sont regroupées sous « Sans catégorie » (choisis leur catégorie dans Matières & Enseignants → Affectation par classe)."}</div>}
          <div className="table-card" style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th rowSpan={2}>Rang</th><th rowSpan={2}>{"Élève"}</th>
                  {data.categories.map((k) => <th key={k.key} colSpan={k.matieres.length + 2}>{k.nom}</th>)}
                  <th colSpan={2}>{"Général"}</th><th rowSpan={2}></th>
                </tr>
                <tr>
                  {data.categories.map((k) => (
                    <React.Fragment key={k.key}>
                      {k.matieres.map((m) => <th key={m.id}>{m.nom}<div style={{ fontSize: "11px", fontWeight: "normal" }}>{"/ " + m.coefficient}</div></th>)}
                      <th>Total<div style={{ fontSize: "11px", fontWeight: "normal" }}>{"/ " + k.max_total}</div></th>
                      <th>{"Moy."}<div style={{ fontSize: "11px", fontWeight: "normal" }}>{"/ " + data.base}</div></th>
                    </React.Fragment>
                  ))}
                  <th>Total<div style={{ fontSize: "11px", fontWeight: "normal" }}>{"/ " + data.max_total}</div></th>
                  <th>{"Moy."}<div style={{ fontSize: "11px", fontWeight: "normal" }}>{"/ " + data.base}</div></th>
                </tr>
              </thead>
              <tbody>
                {data.eleves.map((e) => (
                  <tr key={e.id}>
                    <td>{e.rang || "-"}</td>
                    <td>{e.nom + " " + (e.prenom || "")}</td>
                    {data.categories.map((k) => (
                      <React.Fragment key={k.key}>
                        {k.matieres.map((m) => <td key={m.id}>{f2(e.points[m.id])}</td>)}
                        <td><strong>{f2(e.cats[k.key].total)}</strong></td>
                        <td><strong>{f2(e.cats[k.key].moyenne)}</strong></td>
                      </React.Fragment>
                    ))}
                    <td><strong>{f2(e.total)}</strong></td>
                    <td><strong>{f2(e.moyenne)}</strong></td>
                    <td style={{ whiteSpace: "nowrap" }}><button className="btn-sm btn-gray-cancel" onClick={() => imprimerEleve(e)}>Bulletin</button> <button className="btn-sm btn-gray-cancel" onClick={() => telechargerEleve(e)}>PDF</button></td>
                  </tr>
                ))}
                {data.eleves.length === 0 && <tr><td colSpan={99} className="table-empty">{"Aucun élève."}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

/* -------- Paramètres pédagogiques (par année) -------- */
// Les réglages actuels d'abord, un bouton "Modifier" ouvre la fenêtre
const LIB_MOYENNE = { total: "Total général ÷ maximum général", moyenne_categories: "Moyenne des catégories (avec le poids de chaque catégorie)" };
const LIB_MANQUANTE = { ignorer: "Ignorer la période (non comptée)", zero: "Compter zéro" };

function Parametres({ executer }) {
  const { currentYear, years } = useYear();
  const [anneeId, setAnneeId] = useState("");
  const [p, setP] = useState(null);
  const [fen, setFen] = useState(false);
  useEffect(() => { if (!anneeId && currentYear) setAnneeId(String(currentYear.id)); }, [currentYear]);
  const charger = async () => {
    if (!anneeId) { setP(null); return; }
    try { setP(await api("/api/pedagogie/parametres?year=" + anneeId)); } catch (e) { setP(null); }
  };
  useEffect(() => { setP(null); charger(); }, [anneeId]);
  const annee = (years || []).find((y) => String(y.id) === String(anneeId));

  return (
    <>
      <div className="wf-filtres">
        <div className="form-group">
          <label>{"Année"}</label>
          <select value={anneeId} onChange={(e) => setAnneeId(e.target.value)}>
            <option value="">{"— Choisir —"}</option>
            {(years || []).map((y) => <option key={y.id} value={y.id}>{y.nom}</option>)}
          </select>
        </div>
      </div>
      {!anneeId && <p className="wf-intro">{"Choisis une année pour voir ses paramètres de calcul."}</p>}
      {anneeId && !p && <p className="wf-intro">{"Chargement..."}</p>}
      {p && (
        <div style={carte}>
          <div className="wf-barre">
            <h3 style={{ margin: 0 }}>{"Paramètres de calcul" + (annee ? " — " + annee.nom : "")}</h3>
            <div className="wf-barre-d"><button type="button" className="btn-primary" onClick={() => setFen(true)}>{"Modifier les paramètres"}</button></div>
          </div>
          {p.nb_notes > 0 && <div className="wf-avis" style={{ marginBottom: "14px" }}>{p.nb_notes + " note(s) déjà saisies pour cette année : toute modification demandera une confirmation, car elle change les moyennes affichées."}</div>}
          <Resume lignes={[
            ["Base de notation des moyennes", "Sur " + p.base],
            ["Moyenne générale", LIB_MOYENNE[p.mode_moyenne_generale] || p.mode_moyenne_generale],
            ["Note manquante (Contrôle général)", LIB_MANQUANTE[p.note_manquante] || p.note_manquante],
            ["Périodes pondérées dans le Contrôle général", p.ponderation_periodes ? "Oui (poids saisis dans l'onglet Périodes)" : "Non (poids égaux)"]
          ]} />
        </div>
      )}
      {fen && p && (
        <FenetreParametres p={p} annee={annee} anneeId={anneeId} fermer={() => setFen(false)} apres={async () => { await charger(); setFen(false); executer(async () => {}, "Paramètres enregistrés."); }} />
      )}
      <ImpressionBulletin executer={executer} />
      <div style={carte}>
        <h3 style={{ marginTop: 0 }}>{"Formules appliquées"}</h3>
        <ul style={{ fontSize: "13px", lineHeight: 1.7, color: "var(--text-dim)", paddingLeft: "18px", margin: 0 }}>
          <li>{"Matière, une période : points = (somme des notes ÷ somme des barèmes) × coefficient. Les absences et notes non saisies sont exclues (jamais comptées zéro)."}</li>
          <li>{"Contrôle général d'une matière : moyenne des résultats des périodes (poids égaux, ou poids des périodes si la pondération est activée), × coefficient. Avec « Ignorer », seules les périodes ayant des notes comptent ; avec « Compter zéro », une période sans note compte pour 0."}</li>
          <li>{"Catégorie : total = somme des points ; maximum = somme des coefficients des matières notées ; moyenne = total ÷ maximum × base."}</li>
          <li>{"Moyenne générale : soit total général ÷ maximum général × base, soit moyenne des moyennes de catégories pondérée par le poids de chaque catégorie. Le choix relève de la direction pédagogique."}</li>
          <li>{"Le coefficient et la catégorie d'une matière sont propres à chaque classe (onglet Affectation par classe). Les décisions de promotion restent séparées de ces calculs."}</li>
        </ul>
      </div>
    </>
  );
}

function FenetreParametres({ p, annee, anneeId, fermer, apres }) {
  const depart = { base: String(p.base), mode_moyenne_generale: p.mode_moyenne_generale, note_manquante: p.note_manquante, ponderation_periodes: p.ponderation_periodes ? 1 : 0 };
  const [f, setF] = useState(depart);
  const envoi = useEnvoi();
  const modifie = Object.keys(depart).some((k) => f[k] !== depart[k]);
  const baseOk = Number(f.base) >= 1 && Number(f.base) <= 100;
  const valider = () => {
    if (!baseOk) { envoi.setErr("La base de notation doit être comprise entre 1 et 100."); return; }
    envoi.envoyer(async (confirmer) => {
      await api("/api/pedagogie/parametres", "PUT", {
        academic_year_id: anneeId, base: Number(f.base), mode_moyenne_generale: f.mode_moyenne_generale,
        note_manquante: f.note_manquante, ponderation_periodes: f.ponderation_periodes ? 1 : 0, confirmer: confirmer || undefined
      });
      await apres();
    });
  };
  return (
    <Fenetre
      titre={"Paramètres de calcul des notes"}
      sousTitre={"Ces réglages s'appliquent à l'année " + (annee ? annee.nom : "choisie") + "."}
      fermer={fermer}
      occupe={envoi.occupe}
      protege={modifie}
      onSubmit={valider}
      pied={<PiedStandard fermer={fermer} occupe={envoi.occupe} libelle={"Enregistrer"} envoi={envoi} />}
    >
      <MessageEnvoi envoi={envoi} />
      {p.nb_notes > 0 && !envoi.confirmation && <div className="wf-avis">{p.nb_notes + " note(s) déjà saisies pour cette année : toute modification demandera une confirmation, car elle change les moyennes affichées."}</div>}
      <div className="form-group">
        <label>{"Base de notation des moyennes"}</label>
        <input type="number" min="1" max="100" value={f.base} onChange={(e) => setF({ ...f, base: e.target.value })} />
      </div>
      <div className="form-group">
        <label>{"Moyenne générale"}</label>
        <select value={f.mode_moyenne_generale} onChange={(e) => setF({ ...f, mode_moyenne_generale: e.target.value })}>
          <option value="total">{"Total général ÷ maximum général"}</option>
          <option value="moyenne_categories">{"Moyenne des catégories (avec le poids de chaque catégorie)"}</option>
        </select>
      </div>
      <div className="form-group">
        <label>{"Note manquante (Contrôle général)"}</label>
        <select value={f.note_manquante} onChange={(e) => setF({ ...f, note_manquante: e.target.value })}>
          <option value="ignorer">{"Ignorer la période (non comptée)"}</option>
          <option value="zero">{"Compter zéro"}</option>
        </select>
      </div>
      <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        <input type="checkbox" style={{ width: "auto" }} checked={!!f.ponderation_periodes} onChange={(e) => setF({ ...f, ponderation_periodes: e.target.checked ? 1 : 0 })} />
        {"Pondérer les périodes dans le Contrôle général (poids saisis dans l'onglet Périodes)"}
      </label>
    </Fenetre>
  );
}

/* -------- Format d'impression du bulletin -------- */
const LIB_FORMAT = { a5: "A5", a4: "A4", a6: "A6", letter: "Lettre (216 × 279 mm)", legal: "Légal (216 × 356 mm)", custom: "Personnalisé" };

function ImpressionBulletin({ executer }) {
  const { settings } = useSettings();
  const [c, setC] = useState(null);
  const [fen, setFen] = useState(false);
  const charger = () => api("/api/pedagogie/impression").then(setC).catch(() => {});
  useEffect(() => { charger(); }, []);
  if (!c) return null;
  const d = dimensionsPapier(c);
  const essai = () => ouvrirImpression("Page d'essai", "<h3 style='text-align:center'>Page d'essai du bulletin</h3><p>Format : " + d.l + " × " + d.h + " mm — marges " + (Number(c.marge_mm) || 0) + " mm.</p><table><tr><th>Matière</th><th>Maximum</th><th>Note obtenue</th></tr><tr><td>Exemple</td><td>10</td><td>7,5</td></tr><tr class='tot'><td>MOYENNE GÉNÉRALE</td><td></td><td>7,5</td></tr></table><div class='sig'><span>Le titulaire</span><span>La direction</span></div>", c, settings);
  return (
    <div style={carte}>
      <div className="wf-barre">
        <h3 style={{ margin: 0 }}>{"Impression du bulletin"}</h3>
        <div className="wf-barre-d">
          <button type="button" className="btn-gray-cancel" onClick={essai}>{"Imprimer une page d'essai"}</button>
          <button type="button" className="btn-primary" onClick={() => setFen(true)}>{"Modifier le format"}</button>
        </div>
      </div>
      <p className="wf-intro">{"Format A5 par défaut. Le bulletin affiche le nom et le logo de l'établissement (définis dans les paramètres de l'établissement). Le bulletin de classe (tableau récapitulatif) s'imprime toujours en A4 paysage."}</p>
      <Resume lignes={[
        ["Format", LIB_FORMAT[c.format] || c.format],
        ["Papier", d.l + " × " + d.h + " mm" + (c.format === "custom" ? "" : (c.orientation === "paysage" ? " (paysage)" : " (portrait)"))],
        ["Marges", (Number(c.marge_mm) || 0) + " mm"],
        ["Logo de l'établissement", c.afficher_logo ? "Affiché" : "Masqué"]
      ]} />
      {fen && (
        <FenetreFormat c={c} fermer={() => setFen(false)} apres={async () => { await charger(); setFen(false); executer(async () => {}, "Format d'impression enregistré."); }} />
      )}
    </div>
  );
}

function FenetreFormat({ c, fermer, apres }) {
  const depart = { format: c.format, largeur_mm: String(c.largeur_mm), hauteur_mm: String(c.hauteur_mm), orientation: c.orientation, marge_mm: String(c.marge_mm), afficher_logo: c.afficher_logo ? 1 : 0 };
  const [f, setF] = useState(depart);
  const envoi = useEnvoi();
  const modifie = Object.keys(depart).some((k) => f[k] !== depart[k]);
  const d = dimensionsPapier(f);
  const valider = () => envoi.envoyer(async () => {
    await api("/api/pedagogie/impression", "PUT", { ...c, ...f, largeur_mm: Number(f.largeur_mm), hauteur_mm: Number(f.hauteur_mm), marge_mm: Number(f.marge_mm), afficher_logo: f.afficher_logo ? 1 : 0 });
    await apres();
  });
  return (
    <Fenetre
      titre={"Format d'impression du bulletin"}
      sousTitre={"Choisissez le papier, l'orientation et les marges."}
      fermer={fermer}
      occupe={envoi.occupe}
      protege={modifie}
      onSubmit={valider}
      pied={<PiedStandard fermer={fermer} occupe={envoi.occupe} libelle={"Enregistrer"} envoi={envoi} />}
    >
      <MessageEnvoi envoi={envoi} />
      <div className="form-group">
        <label>Format</label>
        <select value={f.format} onChange={(e) => setF({ ...f, format: e.target.value })}>
          <option value="a5">{"A5 (par défaut)"}</option><option value="a4">A4</option><option value="a6">A6</option>
          <option value="letter">Lettre (216 × 279 mm)</option><option value="legal">{"Légal (216 × 356 mm)"}</option><option value="custom">{"Personnalisé"}</option>
        </select>
      </div>
      {f.format === "custom" ? (
        <div className="form-row">
          <div className="form-group"><label>{"Largeur (mm)"}</label><input type="number" min="50" max="500" value={f.largeur_mm} onChange={(e) => setF({ ...f, largeur_mm: e.target.value })} /></div>
          <div className="form-group"><label>{"Hauteur (mm)"}</label><input type="number" min="50" max="500" value={f.hauteur_mm} onChange={(e) => setF({ ...f, hauteur_mm: e.target.value })} /></div>
        </div>
      ) : (
        <div className="form-group">
          <label>Orientation</label>
          <select value={f.orientation} onChange={(e) => setF({ ...f, orientation: e.target.value })}><option value="portrait">Portrait</option><option value="paysage">Paysage</option></select>
        </div>
      )}
      <div className="form-group">
        <label>{"Marges (mm)"}</label>
        <input type="number" min="0" max="30" value={f.marge_mm} onChange={(e) => setF({ ...f, marge_mm: e.target.value })} />
      </div>
      <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        <input type="checkbox" style={{ width: "auto" }} checked={!!f.afficher_logo} onChange={(e) => setF({ ...f, afficher_logo: e.target.checked ? 1 : 0 })} />
        {"Afficher le logo de l'établissement"}
      </label>
      <div className="wf-aide">{"Papier : " + d.l + " × " + d.h + " mm"}</div>
    </Fenetre>
  );
}
