import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from "../AuthContext.jsx";
import { getAuthedClient } from "../supabaseClient.js";
import { trierClasses } from "../ordreClasses.js";
import { lireTout } from "../classeProposee.js";

const DECISIONS = [
  ["", "Non précisée"], ["admis", "Admis"], ["maintenu", "Maintenu (redouble)"], ["admis_ailleurs", "Admis ailleurs"], ["exclu", "Exclu"]
];
const LIBELLE_DECISION = Object.fromEntries(DECISIONS);
const carte = { background: "var(--card)", border: "1px solid var(--line)", borderRadius: "12px", padding: "18px 20px", marginBottom: "20px" };
const champ = { padding: "9px 12px", border: "1px solid var(--line)", borderRadius: "10px", background: "var(--card)", color: "var(--text)", fontSize: "13px" };
const barre = { display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1e3a8a", borderRadius: "10px", padding: "10px 14px", marginBottom: "12px", fontSize: "13px" };
const avis = { background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "10px", padding: "10px 14px", marginBottom: "10px", fontSize: "12px", color: "#92400e" };

const norm = (s) => String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const nomE = (e) => ((e.prenom || "") + " " + (e.nom || "")).trim();

// Classes d'une annee (dans l'ordre de Regles academiques)
async function lireClasses(supabase, yid) {
  const { data: secs, error: e1 } = await supabase.from("sections").select("id").eq("academic_year_uuid", yid).is("deleted_at", null);
  if (e1) throw e1;
  const sids = (secs || []).map((s) => s.id);
  if (!sids.length) return [];
  const { data, error } = await supabase.from("classes").select("id, nom").in("section_uuid", sids).is("deleted_at", null).order("nom");
  if (error) throw error;
  return trierClasses(supabase, data || []);
}

// Qui est deja dans une classe cette annee-la : { eleve : { classe_id, nom } } (lecture par pages de 1000)
async function lirePlacements(supabase, yid, classes) {
  const asg = await lireTout((a, b) => supabase.from("assignments").select("student_uuid, class_uuid").eq("academic_year_uuid", yid).is("deleted_at", null).order("id").range(a, b));
  const nomDe = {};
  classes.forEach((c) => { nomDe[c.id] = c.nom; });
  const m = {};
  asg.forEach((a) => { m[a.student_uuid] = { classe_id: a.class_uuid, nom: nomDe[a.class_uuid] || "?" }; });
  return m;
}

export default function AnneesPassees() {
  const auth = useAuth();
  const supabase = getAuthedClient(auth && auth.token);
  const modifiePar = (auth && auth.user && (auth.user.nom_complet || auth.user.username)) || "web";
  const [years, setYears] = useState([]);
  const [anneeId, setAnneeId] = useState("");
  const [classes, setClasses] = useState([]);
  const [classeId, setClasseId] = useState("");
  const [eleves, setEleves] = useState([]);
  const [placements, setPlacements] = useState({});
  const [enCours, setEnCours] = useState({ annee: null, classes: [], placements: {} });
  const [chargement, setChargement] = useState(true);
  const [recherche, setRecherche] = useState("");
  const [fSituation, setFSituation] = useState("");
  const [fEnCours, setFEnCours] = useState("");
  const [fSexe, setFSexe] = useState("");
  const [fStatut, setFStatut] = useState("");
  const [coches, setCoches] = useState(new Set());
  const [decision, setDecision] = useState("");
  const [busy, setBusy] = useState(false);
  const [conf, setConf] = useState(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [avert, setAvert] = useState("");

  useEffect(() => {
    let vivant = true;
    (async () => {
      try {
        const { data: ys, error } = await supabase.from("academic_years").select("id, nom, statut").is("deleted_at", null).order("nom", { ascending: false });
        if (error) throw error;
        const st = await lireTout((a, b) => supabase.from("students").select("id, matricule, nom, prenom, sexe, statut").is("deleted_at", null).order("id").range(a, b));
        st.sort((x, y) => (x.nom || "").localeCompare(y.nom || "", "fr") || (x.prenom || "").localeCompare(y.prenom || "", "fr"));
        if (!vivant) return;
        setYears(ys || []);
        setEleves(st);
        const active = (ys || []).find((y) => y.statut === "active");
        if (active) {
          try {
            const cls = await lireClasses(supabase, active.id);
            const pl = await lirePlacements(supabase, active.id, cls);
            if (vivant) setEnCours({ annee: active, classes: cls, placements: pl });
          } catch (e) { if (vivant) setAvert("La classe en cours des élèves n'a pas pu être lue : le filtre « Classe en cours » est indisponible."); }
        }
      } catch (e) { if (vivant) setErr("Chargement impossible : " + ((e && e.message) || e)); }
      finally { if (vivant) setChargement(false); }
    })();
    return () => { vivant = false; };
  }, []);

  const chargerAnnee = async (yid) => {
    setClasses([]); setClasseId(""); setPlacements({}); setCoches(new Set()); setFSituation("");
    if (!yid) return;
    try {
      const cls = await lireClasses(supabase, yid);
      setClasses(cls);
      setPlacements(await lirePlacements(supabase, yid, cls));
    } catch (e) { setErr("Lecture de l'année impossible : " + ((e && e.message) || e)); }
  };
  useEffect(() => { chargerAnnee(anneeId); }, [anneeId]);

  const annee = years.find((y) => y.id === anneeId);
  const classe = classes.find((c) => c.id === classeId);

  const visibles = useMemo(() => {
    const q = norm(recherche);
    return eleves.filter((e) => {
      if (q && !norm((e.nom || "") + " " + (e.prenom || "") + " " + (e.prenom || "") + " " + (e.nom || "") + " " + (e.matricule || "")).includes(q)) return false;
      const p = placements[e.id];
      if (fSituation === "__aucune__" && p) return false;
      if (fSituation === "__placee__" && !p) return false;
      if (fSituation && fSituation !== "__aucune__" && fSituation !== "__placee__" && (!p || p.classe_id !== fSituation)) return false;
      const c = enCours.placements[e.id];
      if (fEnCours === "__aucune__" && c) return false;
      if (fEnCours && fEnCours !== "__aucune__" && (!c || c.classe_id !== fEnCours)) return false;
      if (fSexe && e.sexe !== fSexe) return false;
      if (fStatut === "actif" && e.statut !== "actif") return false;
      if (fStatut === "inactif" && e.statut === "actif") return false;
      return true;
    });
  }, [eleves, recherche, placements, enCours, fSituation, fEnCours, fSexe, fStatut]);

  const filtresActifs = !!(recherche || fSituation || fEnCours || fSexe || fStatut);
  const effacerFiltres = () => { setRecherche(""); setFSituation(""); setFEnCours(""); setFSexe(""); setFStatut(""); };
  const elevesCoches = useMemo(() => eleves.filter((e) => coches.has(e.id)), [eleves, coches]);
  const nbCoches = elevesCoches.length;
  const nbMasques = nbCoches - visibles.filter((e) => coches.has(e.id)).length;

  const basculer = (id) => { const n = new Set(coches); if (n.has(id)) n.delete(id); else n.add(id); setCoches(n); };
  const toutVisibleCoche = visibles.length > 0 && visibles.every((e) => coches.has(e.id));
  const toutBasculer = () => {
    const n = new Set(coches);
    if (toutVisibleCoche) visibles.forEach((e) => n.delete(e.id)); else visibles.forEach((e) => n.add(e.id));
    setCoches(n);
  };
  const caseTout = (el) => { if (el) el.indeterminate = visibles.some((e) => coches.has(e.id)) && !toutVisibleCoche; };

  // etape 1 : recapitulatif (relit l'etat reel de l'annee avant de demander la confirmation)
  const ouvrirConfirmation = async () => {
    setErr(""); setMsg("");
    if (!anneeId || !classeId || nbCoches === 0) { setErr("Choisis l'année, la classe et au moins un élève."); return; }
    setBusy(true);
    try {
      const frais = await lirePlacements(supabase, anneeId, classes);
      const { data: salles, error } = await supabase.from("rooms").select("id, nom").eq("class_uuid", classeId).is("deleted_at", null).order("nom");
      if (error) throw error;
      setConf({ eleves: elevesCoches, frais, salles: salles || [] });
    } catch (e) { setErr("Vérification impossible : " + ((e && e.message) || e)); }
    setBusy(false);
  };

  // etape 2 : ecriture, un eleve apres l'autre
  const executer = async () => {
    if (busy || !conf || !annee || !classe) return;
    setBusy(true); setErr(""); setMsg("");
    const liste = conf.eleves;
    const salle = conf.salles.length ? conf.salles[0].id : null;
    let ok = 0, dejaLa = 0, deplaces = 0; const erreurs = []; const aReessayer = new Set();
    try {
      const frais = await lirePlacements(supabase, anneeId, classes);
      const maintenant = new Date().toISOString();
      for (const e of liste) {
        try {
          const actuel = frais[e.id];
          if (actuel && actuel.classe_id === classeId) { dejaLa++; }
          else {
            if (actuel) {
              const r1 = await supabase.from("assignments").update({ deleted_at: maintenant, last_modified_at: maintenant, modified_by: modifiePar }).eq("student_uuid", e.id).eq("academic_year_uuid", anneeId).is("deleted_at", null);
              if (r1.error) throw new Error(r1.error.message);
              deplaces++;
            }
            const r2 = await supabase.from("assignments").insert({ student_uuid: e.id, class_uuid: classeId, room_uuid: salle, academic_year_uuid: anneeId, modified_by: modifiePar });
            if (r2.error) throw new Error(r2.error.message);
            ok++;
          }
        } catch (er) { erreurs.push(nomE(e) + " : " + ((er && er.message) || er)); aReessayer.add(e.id); continue; }
        if (decision) {
          try {
            const { data: ex, error: eh } = await supabase.from("student_history").select("id, version").eq("student_uuid", e.id).eq("annee_nom", annee.nom).limit(1);
            if (eh) throw new Error(eh.message);
            const v = { classe_nom: classe.nom, decision, source: "manuel", modified_by: modifiePar, last_modified_at: maintenant, deleted_at: null };
            const rh = ex && ex.length
              ? await supabase.from("student_history").update({ ...v, version: (ex[0].version || 1) + 1 }).eq("id", ex[0].id)
              : await supabase.from("student_history").insert({ student_uuid: e.id, annee_nom: annee.nom, ...v });
            if (rh.error) throw new Error(rh.error.message);
          } catch (er) { erreurs.push(nomE(e) + " : classe enregistrée, mais décision non enregistrée (" + ((er && er.message) || er) + ")"); }
        }
      }
    } catch (e) { erreurs.push((e && e.message) || String(e)); }
    setBusy(false);
    setConf(null);
    const parties = [ok + " élève(s) inscrit(s) dans " + classe.nom + " (" + annee.nom + ")"];
    if (deplaces) parties.push(deplaces + " déplacé(s) depuis une autre classe");
    if (dejaLa) parties.push(dejaLa + " déjà dans cette classe (inchangé)");
    setMsg(parties.join(" · ") + ".");
    if (erreurs.length) setErr(erreurs.length + " erreur(s) : " + erreurs.slice(0, 3).join(" ; ") + (erreurs.length > 3 ? " ..." : ""));
    setCoches(aReessayer);
    chargerAnnee2(anneeId);
  };
  // rechargement apres ecriture : garde la classe choisie, la decision et les filtres
  const chargerAnnee2 = async (yid) => {
    try { setPlacements(await lirePlacements(supabase, yid, classes)); } catch (e) { setAvert("Les classes affichées n'ont pas pu être rafraîchies : recharge la page."); }
  };

  const anneesPassees = years.filter((y) => y.statut !== "active");
  const confirmationDeplaces = conf ? conf.eleves.filter((e) => conf.frais[e.id] && conf.frais[e.id].classe_id !== classeId) : [];
  const confirmationDejaLa = conf ? conf.eleves.filter((e) => conf.frais[e.id] && conf.frais[e.id].classe_id === classeId) : [];

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Années passées</h1>
          <p className="page-subtitle">{"Place les élèves dans leur classe d'une année précédente. Seules les années et les classes déjà configurées sont proposées. Les factures ne sont pas générées ici : les finances de chaque année restent séparées."}</p>
        </div>
      </div>

      {err && <div className="login-error" style={{ marginBottom: "14px" }}>{err}</div>}
      {avert && <div style={avis}>{avert}</div>}
      {msg && <div style={{ ...carte, borderColor: "rgba(80,200,120,0.5)" }}>{msg}</div>}

      <div style={carte}>
        {anneesPassees.length === 0 && !chargement && <div style={{ color: "var(--text-dim)", marginBottom: "10px" }}>{"Aucune année précédente configurée. Crée-la d'abord dans Années académiques, avec ses sections et ses classes."}</div>}
        <div className="form-row">
          <div className="form-group">
            <label>{"Année"}</label>
            <select value={anneeId} onChange={(e) => setAnneeId(e.target.value)}>
              <option value="">{"— Choisir —"}</option>
              {anneesPassees.map((y) => <option key={y.id} value={y.id}>{y.nom}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>{"Classe de cette année"}</label>
            <select value={classeId} onChange={(e) => setClasseId(e.target.value)} disabled={!anneeId}>
              <option value="">{"— Choisir —"}</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>{"Décision de fin d'année"}</label>
            <select value={decision} onChange={(e) => setDecision(e.target.value)}>
              {DECISIONS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </select>
          </div>
        </div>

        {anneeId && classes.length === 0 && <div style={{ color: "var(--text-dim)", marginBottom: "10px" }}>{"Cette année n'a pas encore de classes : configure ses sections et classes d'abord."}</div>}
        {chargement && <div style={{ color: "var(--text-dim)" }}>{"Chargement des élèves…"}</div>}

        {anneeId && !chargement && (
          <>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center", marginBottom: "12px" }}>
              <input type="search" placeholder="Rechercher (nom, prénom, matricule)…" value={recherche} onChange={(e) => setRecherche(e.target.value)} style={{ ...champ, flex: "1 1 220px", minWidth: "200px" }} />
              <select value={fSituation} onChange={(e) => setFSituation(e.target.value)} style={champ} aria-label="Situation dans l'année choisie">
                <option value="">{"Tous (situation en " + (annee ? annee.nom : "") + ")"}</option>
                <option value="__aucune__">{"Pas encore placés en " + (annee ? annee.nom : "")}</option>
                <option value="__placee__">{"Déjà placés en " + (annee ? annee.nom : "")}</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{"Déjà en " + c.nom}</option>)}
              </select>
              {enCours.annee && (
                <select value={fEnCours} onChange={(e) => setFEnCours(e.target.value)} style={champ} aria-label="Classe en cours">
                  <option value="">{"Toutes les classes en cours (" + enCours.annee.nom + ")"}</option>
                  <option value="__aucune__">{"Sans classe en " + enCours.annee.nom}</option>
                  {enCours.classes.map((c) => <option key={c.id} value={c.id}>{"En " + c.nom + " (" + enCours.annee.nom + ")"}</option>)}
                </select>
              )}
              <select value={fSexe} onChange={(e) => setFSexe(e.target.value)} style={champ} aria-label="Sexe">
                <option value="">{"Tous les sexes"}</option>
                <option value="M">{"Masculin"}</option>
                <option value="F">{"Féminin"}</option>
              </select>
              <select value={fStatut} onChange={(e) => setFStatut(e.target.value)} style={champ} aria-label="Statut">
                <option value="">{"Tous les statuts"}</option>
                <option value="actif">{"Actifs"}</option>
                <option value="inactif">{"Inactifs"}</option>
              </select>
              {filtresActifs && <button className="btn-gray-cancel btn-sm" onClick={effacerFiltres}>{"Effacer les filtres"}</button>}
              <span style={{ marginLeft: "auto", fontSize: "13px", color: "var(--text-soft)" }}>{visibles.length + " sur " + eleves.length}</span>
            </div>

            {nbCoches > 0 && (
              <div style={barre}>
                <strong>{nbCoches + " élève(s) coché(s)"}</strong>
                {nbMasques > 0 && <span>{"dont " + nbMasques + " non affiché(s) avec les filtres actuels"}</span>}
                <button className="btn-gray-cancel btn-sm" onClick={() => setCoches(new Set())}>{"Tout décocher"}</button>
              </div>
            )}

            <div className="table-card" style={{ maxHeight: "420px", overflowY: "auto" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: "34px" }}><input type="checkbox" title="Tout cocher / décocher (selon les filtres)" ref={caseTout} checked={toutVisibleCoche} onChange={toutBasculer} disabled={visibles.length === 0} /></th>
                    <th>{"Matricule"}</th>
                    <th>{"Élève"}</th>
                    <th>{"Sexe"}</th>
                    <th>{enCours.annee ? "Classe en cours (" + enCours.annee.nom + ")" : "Classe en cours"}</th>
                    <th>{"Déjà dans " + (annee ? annee.nom : "cette année")}</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((e) => (
                    <tr key={e.id}>
                      <td><input type="checkbox" checked={coches.has(e.id)} onChange={() => basculer(e.id)} /></td>
                      <td>{e.matricule || "-"}</td>
                      <td>{nomE(e)}{e.statut && e.statut !== "actif" ? <span style={{ marginLeft: "8px", fontSize: "11px", color: "var(--text-soft)" }}>{"(" + e.statut + ")"}</span> : null}</td>
                      <td>{e.sexe || "-"}</td>
                      <td>{enCours.placements[e.id] ? enCours.placements[e.id].nom : "-"}</td>
                      <td>{placements[e.id] ? placements[e.id].nom : "-"}</td>
                    </tr>
                  ))}
                  {visibles.length === 0 && <tr><td colSpan={6} className="table-empty">{eleves.length > 0 && filtresActifs ? "Aucun élève ne correspond à ces filtres." : "Aucun élève"}</td></tr>}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: "12px", display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
              <button className="btn-primary" disabled={busy || nbCoches === 0 || !classeId} onClick={ouvrirConfirmation}>{busy && !conf ? "Vérification..." : "Inscrire " + nbCoches + " élève(s)"}</button>
              <span style={{ color: "var(--text-dim)", fontSize: "13px" }}>{classeId ? "Un récapitulatif te sera montré avant l'inscription." : "Choisis d'abord la classe de cette année."}</span>
            </div>
          </>
        )}
      </div>

      {conf && annee && classe && (
        <div className="modal-overlay" onClick={busy ? undefined : () => setConf(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "560px", maxHeight: "88vh", overflowY: "auto" }}>
            <div className="modal-header"><h3>{"Inscrire " + conf.eleves.length + " élève(s)"}</h3><button className="modal-close" disabled={busy} onClick={() => setConf(null)}>x</button></div>
            <div style={{ border: "1px solid var(--line)", borderRadius: "10px", padding: "10px 14px", marginBottom: "10px", fontSize: "13px" }}>
              <div>{"Année : "}<strong>{annee.nom}</strong></div>
              <div>{"Classe : "}<strong>{classe.nom}</strong></div>
              <div>{"Salle : "}<strong>{conf.salles.length ? conf.salles[0].nom : "aucune (la classe n'a pas de salle)"}</strong>{conf.salles.length > 1 ? <span style={{ color: "var(--text-soft)" }}>{" (première des " + conf.salles.length + " salles de la classe)"}</span> : null}</div>
              <div>{"Décision de fin d'année : "}<strong>{decision ? LIBELLE_DECISION[decision] : "non modifiée"}</strong></div>
              <div style={{ fontSize: "12px", color: "var(--text-dim)", margin: "8px 0 0", maxHeight: "84px", overflowY: "auto" }}>{conf.eleves.map(nomE).join(", ")}</div>
            </div>
            {confirmationDeplaces.length > 0 && (
              <div style={avis}>
                <strong>{confirmationDeplaces.length + " élève(s) sont déjà dans une autre classe en " + annee.nom + " et seront déplacés"}</strong>
                {" : " + confirmationDeplaces.map((e) => nomE(e) + " (" + conf.frais[e.id].nom + ")").join(", ") + "."}
              </div>
            )}
            {confirmationDejaLa.length > 0 && (
              <div style={{ ...avis, background: "#f1f5f9", border: "1px solid #cbd5e1", color: "#334155" }}>
                {confirmationDejaLa.length + " élève(s) sont déjà dans " + classe.nom + " : leur classe ne change pas" + (decision ? " (seule la décision est enregistrée)" : "") + "."}
              </div>
            )}
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "14px" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setConf(null)} disabled={busy}>{"Annuler"}</button>
              <button className="btn-primary" onClick={executer} disabled={busy}>{busy ? "Inscription en cours..." : "Confirmer l'inscription"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
