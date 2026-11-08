import React, { useState, useEffect, useMemo, useRef } from "react";
import { useAuth } from "../AuthContext.jsx";
import { getAuthedClient } from "../supabaseClient.js";
import { useYear } from "../YearContext.jsx";
import { useDroit } from "../PermissionsContext.jsx";
import { trierClasses } from "../ordreClasses.js";
import { lireTout } from "../classeProposee.js";
import { decisionsCandidats, messageErreur } from "../examenAdmission.js";
import { Confirmation } from "../pedagogie/Fenetre.jsx";
import ExamensConfig from "../components/ExamensConfig.jsx";
import ExamensResultats from "../components/ExamensResultats.jsx";
import ExamensDecisions from "../components/ExamensDecisions.jsx";

// Page « Examens d'admission » : 3 onglets. Configuration (pedagogie), Resultats (saisis par le responsable), Decisions (admission / refus).
// Les donnees sont lues ici une seule fois puis passees aux onglets ; chaque ecriture recharge tout (les listes sont petites).
export default function ExamensAdmission() {
  const { token, user } = useAuth();
  const { currentYear } = useYear();
  const dConfig = useDroit("examens_config");
  const dRes = useDroit("examens_resultats");
  const dDec = useDroit("examens_decisions");
  const [onglet, setOnglet] = useState("config");
  const [donnees, setDonnees] = useState(null);
  const [erreur, setErreur] = useState("");
  const [info, setInfo] = useState("");
  const [versOnglet, setVersOnglet] = useState(null); // onglet demande alors que des notes ne sont pas enregistrees
  const sale = useRef(false);
  const vivant = useRef(true);
  useEffect(() => { vivant.current = true; return () => { vivant.current = false; }; }, []);

  const onglets = [["config", "Configuration", dConfig.voir], ["resultats", "Résultats", dRes.voir], ["decisions", "Décisions", dDec.voir]].filter((x) => x[2]);
  useEffect(() => { if (onglets.length && !onglets.some((x) => x[0] === onglet)) setOnglet(onglets[0][0]); });

  const charger = async () => {
    if (!currentYear) { setDonnees(null); return null; }
    try {
      const supabase = getAuthedClient(token);
      const { data: cls, error: eC } = await supabase.from("classes").select("id, nom, section_uuid").eq("academic_year_uuid", currentYear.id).is("deleted_at", null).order("nom");
      if (eC) throw eC;
      const { data: secs } = await supabase.from("sections").select("id, nom");
      const secNom = Object.fromEntries((secs || []).map((s) => [s.id, s.nom]));
      const classes = (await trierClasses(supabase, cls || [])).map((c) => ({ id: c.id, nom: c.nom, section_nom: secNom[c.section_uuid] || "" }));
      const { data: subs, error: eS } = await supabase.from("subjects").select("id, nom, code, statut").is("deleted_at", null).order("nom");
      if (eS) throw eS;
      const idsClasses = new Set(classes.map((c) => c.id));
      const configsBrutes = await lireTout((a, b) => supabase.from("examens_admission_config").select("*").order("id").range(a, b));
      const configs = configsBrutes.filter((c) => idsClasses.has(c.class_uuid));
      const idsConfigs = new Set(configs.map((c) => c.id));
      const matieresBrutes = await lireTout((a, b) => supabase.from("examens_admission_matieres").select("*").order("id").range(a, b));
      const matieresExamen = matieresBrutes.filter((m) => idsConfigs.has(m.config_uuid));
      const idsMatieres = new Set(matieresExamen.map((m) => m.id));
      const notesBrutes = await lireTout((a, b) => supabase.from("examens_admission_notes").select("*").order("id").range(a, b));
      const notes = notesBrutes.filter((n) => idsMatieres.has(n.matiere_uuid));
      const inscriptions = await lireTout((a, b) => supabase.from("inscriptions").select("*").eq("academic_year_uuid", currentYear.id).is("deleted_at", null).order("id").range(a, b));
      const nomSujet = Object.fromEntries((subs || []).map((s) => [s.id, s.nom]));
      const configParClasse = Object.fromEntries(configs.map((c) => [c.class_uuid, c]));
      const matieresParConfig = {};
      matieresExamen.forEach((m) => { (matieresParConfig[m.config_uuid] = matieresParConfig[m.config_uuid] || []).push({ ...m, note_max: Number(m.note_max), nom: nomSujet[m.subject_uuid] || "(matière supprimée)" }); });
      Object.values(matieresParConfig).forEach((l) => l.sort((x, y) => (x.ordre - y.ordre) || String(x.nom).localeCompare(String(y.nom), "fr")));
      const notesParCandidat = {};
      notes.forEach((n) => { (notesParCandidat[n.inscription_uuid] = notesParCandidat[n.inscription_uuid] || {})[n.matiere_uuid] = Number(n.note); });
      const nomClasse = Object.fromEntries(classes.map((c) => [c.id, c.nom]));
      const enAttente = inscriptions.filter((i) => i.statut_inscription === "en_attente_examen").map((i) => ({ ...i, classe_souhaitee_nom: nomClasse[i.classe_souhaitee_uuid] || "" }));
      const decisions = decisionsCandidats(enAttente, configParClasse, matieresParConfig, notesParCandidat);
      const d = { classes, matieres: subs || [], configs, configParClasse, matieresParConfig, notes, notesParCandidat, inscriptions, enAttente, decisions };
      if (vivant.current) { setDonnees(d); setErreur(""); }
      return d;
    } catch (e) {
      if (vivant.current) setErreur(messageErreur(e));
      return null;
    }
  };
  useEffect(() => { setDonnees(null); setInfo(""); charger(); }, [currentYear, token]);

  if (!currentYear) {
    return (
      <div className="page">
        <div className="dash-placeholder"><p>{"Aucune année académique active. Créez-en une et activez-la avant de configurer les examens."}</p></div>
      </div>
    );
  }

  const supabase = getAuthedClient(token);
  const commun = { supabase, donnees, recharger: charger, par: user ? user.username : null, marquerSale: (v) => { sale.current = !!v; }, notifier: (m) => { setInfo(m); setErreur(""); }, signaler: (m) => { setErreur(m); setInfo(""); } };

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">{"Examens d'admission"}</h1>
        <p className="page-subtitle">{"Candidats de " + currentYear.nom + " : matières de l'examen, résultats et décisions"}</p>
      </div>
      <div style={{ display: "flex", gap: "8px", marginBottom: "14px", flexWrap: "wrap" }}>
        {onglets.map(([k, t]) => (
          <button key={k} type="button" data-onglet={k} className={onglet === k ? "btn-primary" : "btn-gray-cancel"} onClick={() => { if (k === onglet) return; if (sale.current) { setVersOnglet(k); return; } setOnglet(k); setInfo(""); setErreur(""); }}>{t}</button>
        ))}
      </div>
      {erreur && <div className="login-error" style={{ marginBottom: "14px" }} data-erreur="page">{erreur}</div>}
      {info && <div data-info style={{ background: "#e6f4ea", color: "#1e6b34", padding: "10px 14px", borderRadius: "8px", marginBottom: "14px" }}>{info}</div>}
      {!donnees && !erreur && <p className="wf-petit">Chargement…</p>}
      {donnees && onglet === "config" && dConfig.voir && <ExamensConfig {...commun} droit={dConfig} />}
      {donnees && onglet === "resultats" && dRes.voir && <ExamensResultats {...commun} droit={dRes} />}
      {donnees && onglet === "decisions" && dDec.voir && <ExamensDecisions {...commun} droit={dDec} />}
      {versOnglet && (
        <Confirmation titre="Notes non enregistrées" danger libelle="Quitter sans enregistrer" fermer={() => setVersOnglet(null)}
          texte="Des notes saisies ne sont pas encore enregistrées. Si tu changes d'onglet, elles seront perdues."
          action={async () => { sale.current = false; setOnglet(versOnglet); setVersOnglet(null); setInfo(""); setErreur(""); }} />
      )}
    </div>
  );
}
