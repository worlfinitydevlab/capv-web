import React, { useState, useEffect } from "react";
import { useAuth } from "../AuthContext.jsx";
import { getAuthedClient } from "../supabaseClient.js";
import { useSettings } from "../SettingsContext.jsx";
import { usePermissions, useDroit } from "../PermissionsContext.jsx";
import { trierClasses } from "../ordreClasses.js";
import { cmpAnnee, referenceClasse, evaluerChoix, lireOrdre } from "../passageAnnee.js";
import { nomDepartement } from "../identifiantEleve.js";
import { afficherTelephone } from "../telephone.js";

const statutParent = (v, fem) => v === "vivant" ? (fem ? "Vivante" : "Vivant") : v === "decede" ? (fem ? "Décédée" : "Décédé") : "";
const nomComplet = (p, n) => [p, n].filter(Boolean).join(" ");

function sectionsFiche(s) {
  return [
    ["Identité", [
      ["Identifiant", s.matricule],
      ["Date de naissance", s.date_naissance], ["Département de naissance", nomDepartement(s.departement_naissance)],
      ["Commune de naissance", s.commune_naissance], ["Section communale", s.section_communale], ["Pays de naissance", s.pays_naissance],
      ["Lieu de naissance", s.lieu_naissance],
      ["Genre", s.sexe === "M" ? "Masculin" : s.sexe === "F" ? "Féminin" : ""], ["Nationalité", s.nationalite],
      ["Adresse", s.adresse], ["Téléphone", afficherTelephone(s.telephone)], ["Email", s.email],
      ["Numéro d'ordre", s.numero_ordre], ["Numéro identifiant", s.numero_identifiant], ["NISU", s.nisu],
      ["Religion", s.congregation_religieuse], ["Rang dans la famille", s.rang_famille]
    ]],
    ["Père", [
      ["Nom complet", nomComplet(s.pere_prenom, s.pere_nom)], ["Statut", statutParent(s.pere_statut, false)],
      ["Occupation", s.pere_occupation], ["NIF/NINU", s.pere_nif], ["Téléphone", afficherTelephone(s.pere_telephone)]
    ]],
    ["Mère", [
      ["Nom complet", nomComplet(s.mere_prenom, s.mere_nom)], ["Statut", statutParent(s.mere_statut, true)],
      ["Occupation", s.mere_occupation], ["NIF/NINU", s.mere_nif], ["Téléphone", afficherTelephone(s.mere_telephone)]
    ]],
    ["Responsable légal", [
      ["Nom complet", nomComplet(s.responsable_prenom, s.responsable_nom)], ["Lien de parenté", s.responsable_lien], ["Occupation", s.responsable_occupation],
      ["NIF", s.responsable_nif], ["NINU", s.responsable_ninu], ["Email", s.responsable_email],
      ["Téléphone", afficherTelephone(s.responsable_telephone)], ["Téléphone additionnel", afficherTelephone(s.responsable_telephone2)]
    ]],
    ["Urgence", [["Téléphone d'urgence", afficherTelephone(s.urgence_telephone)], ["Lien de parenté", s.urgence_lien]]],
    ["Scolarité antérieure", [["École précédente", s.ecole_precedente], ["Classe précédente", s.classe_precedente]]],
    ["Santé et notes", [
      ["Conditions médicales", s.conditions_medicales], ["Handicap", s.a_handicap === true ? "Oui" : s.a_handicap === false ? "Non" : ""],
      ["Handicap / besoins spéciaux", s.handicap_besoins], ["Notes", s.remarques]
    ]]
  ].filter(([, lignes]) => lignes.some(([, v]) => v));
}

const esc = (v) => String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function imprimerFiche(s, etab, parcours) {
  const blocs = sectionsFiche(s).map(([titre, lignes]) =>
    "<h3>" + esc(titre) + "</h3><table>" +
    lignes.filter(([, v]) => v).map(([l, v]) => "<tr><td class='l'>" + esc(l) + "</td><td>" + esc(v) + "</td></tr>").join("") +
    "</table>").join("");
  const hist = parcours.length
    ? "<h3>Parcours scolaire</h3><table><tr><th>Année</th><th>Classe</th><th>Décision</th><th>Établissement</th></tr>" +
      parcours.map((p) => "<tr><td>" + esc(p.annee_nom) + "</td><td>" + esc(p.classe_nom) + "</td><td>" + esc(LIBELLES[p.decision] || "") + "</td><td>" + esc(p.etablissement || "") + "</td></tr>").join("") + "</table>"
    : "";
  const html = "<html><head><meta charset='utf-8'><title>Fiche d'inscription</title><style>" +
    "body{font-family:Arial,sans-serif;margin:28px;color:#111}h1{font-size:20px;margin:0}h2{font-size:15px;margin:2px 0 14px;color:#444;font-weight:normal}" +
    "h3{font-size:13px;text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid #1e2a78;padding-bottom:3px;margin:18px 0 6px;color:#1e2a78}" +
    "table{width:100%;border-collapse:collapse;font-size:12.5px}td,th{padding:4px 6px;border-bottom:1px solid #ddd;text-align:left}td.l{width:34%;color:#555}" +
    ".id{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #1e2a78;padding-bottom:8px;margin-bottom:10px}" +
    ".sig{margin-top:40px;display:flex;justify-content:space-between;font-size:12px}.sig div{width:40%;border-top:1px solid #333;padding-top:4px;text-align:center}" +
    "</style></head><body><div class='id'><div><h1>" + esc(etab) + "</h1><h2>Fiche d'inscription</h2></div>" +
    "<div style='text-align:right;font-size:13px'><b>" + esc(s.prenom) + " " + esc(s.nom) + "</b><br>Identifiant : " + esc(s.matricule) + "</div></div>" +
    blocs + hist +
    "<div class='sig'><div>Signature du parent / tuteur</div><div>Cachet et signature de l'établissement</div></div>" +
    "<script>window.onload=function(){window.print();}</script></body></html>";
  const w = window.open("", "_blank", "width=900,height=800");
  if (!w) return;
  w.document.open(); w.document.write(html); w.document.close();
}

const LIBELLES = {
  admis: "Admis", maintenu: "Maintenu (redouble)", admis_ailleurs: "Admis ailleurs", exclu: "Exclu", en_cours: "En cours", "": "Non précisé"
};
const BADGES = { admis: "badge-ok", maintenu: "badge-gold", admis_ailleurs: "badge-blue", exclu: "badge-err", en_cours: "badge-blue" };

export function FicheComplete({ s, parcours }) {
  const { settings } = useSettings();
  const etab = (settings && settings.nom_etablissement) || "Établissement";
  const sections = sectionsFiche(s);
  return (
    <div style={{ padding: "0 20px", marginBottom: "18px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
        <h3 style={{ margin: 0, fontSize: "13px", color: "var(--text-soft)", textTransform: "uppercase", letterSpacing: "0.5px" }}>{"Fiche d'inscription"}</h3>
        <button className="btn-gray-cancel btn-sm" onClick={() => imprimerFiche(s, etab, parcours || [])}>{"Imprimer la fiche"}</button>
      </div>
      {sections.length === 0 && <div style={{ color: "var(--text-dim)", fontSize: "13px" }}>{"Aucune information complémentaire enregistrée."}</div>}
      {sections.map(([titre, lignes], i) => (
        <details key={titre} open={i === 0} style={{ marginBottom: "6px", border: "1px solid var(--line)", borderRadius: "10px", padding: "6px 12px" }}>
          <summary style={{ cursor: "pointer", fontWeight: 700, color: "var(--navy)", fontSize: "13px" }}>{titre}</summary>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 20px", margin: "8px 0 4px" }}>
            {lignes.filter(([, v]) => v).map(([l, v]) => (
              <div className="receipt-line" key={l}><span>{l}</span><strong>{v}</strong></div>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}

const VIDE = { annee_id: "", annee_nom: "", classe_id: "", salle_id: "", decision: "", etablissement: "", remarques: "" };
const LIBRE = "__libre__";
const normAnnee = (s) => String(s == null ? "" : s).trim().replace(/\s+/g, "").toLowerCase();
const messageErreur = (e) => (e && e.message) || String(e || "erreur");

export function ParcoursScolaire({ studentId, classeActuelle, onChargé }) {
  const auth = useAuth();
  const supabase = getAuthedClient(auth && auth.token);
  const { can } = usePermissions();
  const dPassees = useDroit("annees_passees");
  const modifiePar = (auth && auth.user && (auth.user.nom_complet || auth.user.username)) || "web";
  const [rows, setRows] = useState([]);
  const [noms, setNoms] = useState([]);
  const [affs, setAffs] = useState([]);
  const [anneesListe, setAnneesListe] = useState([]);
  const [ordre, setOrdre] = useState([]);
  const [ordreOk, setOrdreOk] = useState(true);
  const [classesAn, setClassesAn] = useState([]);
  const [salles, setSalles] = useState([]);
  const [ouvert, setOuvert] = useState(false);
  const [form, setForm] = useState(VIDE);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  const peutPlacer = !!dPassees.creer;
  const peutLibre = !!can("students", "modifier");

  const charger = async () => {
    try {
      // 1) vraies annees : affectations de l'eleve (toutes annees)
      const { data: asg } = await supabase.from("assignments").select("class_uuid, room_uuid, academic_year_uuid").eq("student_uuid", studentId).is("deleted_at", null);
      const annees = {};
      const { data: ys } = await supabase.from("academic_years").select("id, nom, statut");
      (ys || []).forEach((y) => { annees[y.id] = y; });
      setAnneesListe(ys || []);
      const ids = [...new Set((asg || []).map((a) => a.class_uuid).filter(Boolean))];
      const nomsClasses = {};
      if (ids.length) {
        const { data: cl } = await supabase.from("classes").select("id, nom").in("id", ids);
        (cl || []).forEach((c) => { nomsClasses[c.id] = c.nom; });
      }
      const idsSalles = [...new Set((asg || []).map((a) => a.room_uuid).filter(Boolean))];
      const nomsSalles = {};
      if (idsSalles.length) {
        const { data: sl } = await supabase.from("rooms").select("id, nom").in("id", idsSalles);
        (sl || []).forEach((r) => { nomsSalles[r.id] = r.nom; });
      }
      setAffs((asg || []).filter((a) => annees[a.academic_year_uuid]).map((a) => ({ annee_id: a.academic_year_uuid, annee_nom: annees[a.academic_year_uuid].nom, classe_id: a.class_uuid, classe_nom: nomsClasses[a.class_uuid] || "", room_id: a.room_uuid || "", salle_nom: nomsSalles[a.room_uuid] || "" })));
      // 2) historique saisi (autres etablissements, annees non configurees) + decisions
      const { data: h } = await supabase.from("student_history").select("*").eq("student_uuid", studentId).is("deleted_at", null);
      const histo = h || [];
      const liste = [];
      const vus = new Set();
      (asg || []).forEach((a) => {
        const y = annees[a.academic_year_uuid];
        if (!y) return;
        const ligneH = histo.find((x) => x.annee_nom === y.nom);
        vus.add(y.nom);
        liste.push({ id: "an-" + y.id, annee_nom: y.nom, classe_nom: nomsClasses[a.class_uuid] || (ligneH && ligneH.classe_nom) || "-", salle_nom: nomsSalles[a.room_uuid] || "", decision: y.statut === "active" ? "en_cours" : (ligneH ? ligneH.decision : ""), source: ligneH ? ligneH.source : "annee", actuelle: y.statut === "active", reel: true, etablissement: ligneH && ligneH.etablissement, remarques: ligneH && ligneH.remarques });
      });
      histo.filter((x) => !vus.has(x.annee_nom)).forEach((x) => liste.push(x));
      liste.sort((a, b) => String(b.annee_nom).localeCompare(String(a.annee_nom)));
      setRows(liste);
      if (onChargé) onChargé(liste);
    } catch (e) {}
  };
  useEffect(() => { charger(); }, [studentId]);
  useEffect(() => {
    supabase.from("classes").select("nom").then(({ data }) => setNoms([...new Set((data || []).map((c) => c.nom))].sort())).catch(() => {});
    lireOrdre(supabase).then((o) => { setOrdre(o); setOrdreOk(true); }).catch(() => setOrdreOk(false));
  }, []);

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const anneeChoisie = anneesListe.find((y) => y.id === form.annee_id) || null;
  const placement = !!anneeChoisie;

  // annees proposees : celles qui ont une classe plus recente (sinon aucun controle n'est possible)
  const eligibles = anneesListe.filter((y) => !!referenceClasse(affs, y.nom)).sort((a, b) => cmpAnnee(b.nom, a.nom));
  const reference = anneeChoisie ? referenceClasse(affs, anneeChoisie.nom) : null;
  const dejaLa = anneeChoisie ? affs.find((a) => a.annee_id === anneeChoisie.id) || null : null;

  // classes de l'annee choisie
  useEffect(() => {
    let vivant = true;
    setClassesAn([]);
    if (!form.annee_id || form.annee_id === LIBRE) return undefined;
    (async () => {
      try {
        const { data: secs, error: e1 } = await supabase.from("sections").select("id").eq("academic_year_uuid", form.annee_id).is("deleted_at", null);
        if (e1) throw e1;
        const sids = (secs || []).map((s) => s.id);
        if (!sids.length) return;
        const { data, error } = await supabase.from("classes").select("id, nom").in("section_uuid", sids).is("deleted_at", null);
        if (error) throw error;
        const tri = await trierClasses(supabase, data || []);
        if (vivant) setClassesAn(tri);
      } catch (e) { if (vivant) setErr("Classes de cette année illisibles : " + messageErreur(e)); }
    })();
    return () => { vivant = false; };
  }, [form.annee_id]);

  // salles de la classe choisie
  useEffect(() => {
    let vivant = true;
    setSalles([]);
    if (!form.classe_id) return undefined;
    (async () => {
      try {
        const { data, error } = await supabase.from("rooms").select("id, nom").eq("class_uuid", form.classe_id).is("deleted_at", null).order("nom");
        if (error) throw error;
        if (!vivant) return;
        const l = data || [];
        setSalles(l);
        setForm((f) => (f.classe_id !== form.classe_id ? f : { ...f, salle_id: l.some((r) => r.id === f.salle_id) ? f.salle_id : (l.length === 1 ? l[0].id : "") }));
      } catch (e) { if (vivant) setErr("Salles de cette classe illisibles : " + messageErreur(e)); }
    })();
    return () => { vivant = false; };
  }, [form.classe_id]);

  const permises = placement ? classesAn.filter((c) => evaluerChoix(ordre, reference, c.nom).ok) : [];
  const classeChoisie = classesAn.find((c) => c.id === form.classe_id) || null;
  const verdict = placement && classeChoisie ? evaluerChoix(ordre, reference, classeChoisie.nom) : null;

  const choisirAnnee = (id) => {
    setErr(""); setInfo("");
    const y = anneesListe.find((x) => x.id === id);
    const ex = y ? affs.find((a) => a.annee_id === y.id) : null;
    setForm({ ...VIDE, annee_id: id, classe_id: ex ? ex.classe_id : "", salle_id: ex ? ex.room_id : "" });
  };

  // placement reel : affectation dans la classe et la salle de l'annee passee + decision de fin d'annee automatique
  const placer = async () => {
    setErr(""); setInfo("");
    if (!peutPlacer) { setErr("Ton rôle ne permet pas de placer un élève dans une année passée."); return; }
    if (!anneeChoisie || !classeChoisie) { setErr("Choisis l'année et la classe."); return; }
    if (!ordreOk) { setErr("L'ordre des classes (Règles académiques) n'a pas pu être lu : recharge la page."); return; }
    if (!verdict || !verdict.ok) { setErr("Placement refusé : " + (verdict ? verdict.raison : "classe non valide") + "."); return; }
    if (salles.length > 0 && !form.salle_id) { setErr("Choisis la salle exacte."); return; }
    setBusy(true);
    let retire = [];
    try {
      const { data: ex, error: e0 } = await supabase.from("assignments").select("id, class_uuid, room_uuid").eq("student_uuid", studentId).eq("academic_year_uuid", anneeChoisie.id).is("deleted_at", null);
      if (e0) throw e0;
      const salleId = form.salle_id || null;
      const identique = (ex || []).some((a) => a.class_uuid === classeChoisie.id && (a.room_uuid || null) === salleId);
      const maintenant = new Date().toISOString();
      if (!identique) {
        if (ex && ex.length) {
          retire = ex.map((a) => a.id);
          const r1 = await supabase.from("assignments").update({ deleted_at: maintenant, last_modified_at: maintenant, modified_by: modifiePar }).eq("student_uuid", studentId).eq("academic_year_uuid", anneeChoisie.id).is("deleted_at", null);
          if (r1.error) throw r1.error;
        }
        const r2 = await supabase.from("assignments").insert({ student_uuid: studentId, class_uuid: classeChoisie.id, room_uuid: salleId, academic_year_uuid: anneeChoisie.id, modified_by: modifiePar });
        if (r2.error) {
          if (retire.length) await supabase.from("assignments").update({ deleted_at: null, last_modified_at: maintenant, modified_by: modifiePar }).in("id", retire);
          throw r2.error;
        }
      }
      // decision de fin d'annee automatique (meme classe : maintenu ; classe inferieure : admis)
      let decisionErr = "";
      try {
        const { data: eh, error: e2 } = await supabase.from("student_history").select("id, version").eq("student_uuid", studentId).eq("annee_nom", anneeChoisie.nom).limit(1);
        if (e2) throw e2;
        const v = { classe_nom: classeChoisie.nom, decision: verdict.decision, remarques: form.remarques.trim() || null, source: "manuel", modified_by: modifiePar, last_modified_at: maintenant, deleted_at: null };
        const rh = eh && eh.length
          ? await supabase.from("student_history").update({ ...v, version: (eh[0].version || 1) + 1 }).eq("id", eh[0].id)
          : await supabase.from("student_history").insert({ student_uuid: studentId, annee_nom: anneeChoisie.nom, ...v });
        if (rh.error) throw rh.error;
      } catch (e2) { decisionErr = messageErreur(e2); }
      const salleNom = (salles.find((r) => r.id === salleId) || {}).nom;
      const resume = "Placé en " + classeChoisie.nom + (salleNom ? " - " + salleNom : "") + " (" + anneeChoisie.nom + ")" + (identique ? " : déjà placé, inchangé" : "") + ", décision : " + LIBELLES[verdict.decision] + ".";
      if (decisionErr) setErr("Élève placé, mais la décision de fin d'année n'a pas été enregistrée : " + decisionErr);
      else setInfo(resume);
      setForm(VIDE); setOuvert(false);
      await charger();
    } catch (e) { setErr("Placement impossible : " + messageErreur(e)); }
    setBusy(false);
  };

  // annee d'un autre etablissement ou non configuree : simple ligne d'historique, sans placement
  const enregistrerLibre = async () => {
    setErr(""); setInfo("");
    const annee = form.annee_nom.trim();
    if (!annee) { setErr("L'année est requise (ex. 2019-2020)"); return; }
    if (anneesListe.some((y) => normAnnee(y.nom) === normAnnee(annee))) { setErr("Cette année est configurée dans le système : choisis-la dans la liste pour placer l'élève dans sa classe et sa salle."); return; }
    setBusy(true);
    try {
      const valeurs = { classe_nom: null, decision: form.decision || null, etablissement: form.etablissement.trim() || null, remarques: form.remarques.trim() || null, source: "manuel", modified_by: modifiePar, last_modified_at: new Date().toISOString(), deleted_at: null };
      valeurs.classe_nom = (form.classe_nom || "").trim() || null;
      const { data: ex } = await supabase.from("student_history").select("id, version").eq("student_uuid", studentId).eq("annee_nom", annee).limit(1);
      let r;
      if (ex && ex.length) r = await supabase.from("student_history").update({ ...valeurs, version: (ex[0].version || 1) + 1 }).eq("id", ex[0].id);
      else r = await supabase.from("student_history").insert({ student_uuid: studentId, annee_nom: annee, ...valeurs });
      if (r.error) { setErr(r.error.message); setBusy(false); return; }
      setForm(VIDE); setOuvert(false);
      await charger();
    } catch (e) { setErr("Erreur de connexion"); }
    setBusy(false);
  };

  const supprimer = async (p) => {
    if (!window.confirm("Supprimer l'année " + p.annee_nom + " du parcours ?")) return;
    await supabase.from("student_history").update({ deleted_at: new Date().toISOString(), last_modified_at: new Date().toISOString(), modified_by: modifiePar }).eq("id", p.id);
    charger();
  };

  const lignes = rows;
  const peutAjouter = peutPlacer || peutLibre;
  const libre = form.annee_id === LIBRE;

  return (
    <div style={{ padding: "0 20px", marginBottom: "18px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
        <h3 style={{ margin: 0, fontSize: "13px", color: "var(--text-soft)", textTransform: "uppercase", letterSpacing: "0.5px" }}>{"Parcours scolaire"}</h3>
        {peutAjouter && <button className="btn-gray-cancel btn-sm" onClick={() => { setOuvert(!ouvert); setErr(""); setInfo(""); setForm(VIDE); }}>{ouvert ? "Annuler" : "+ Ajouter une année passée"}</button>}
      </div>

      {info && !ouvert && <div style={{ background: "#e6f4ea", color: "#1e6b34", borderRadius: "10px", padding: "8px 12px", marginBottom: "10px", fontSize: "13px" }}>{info}</div>}
      {err && !ouvert && <div className="login-error" style={{ marginBottom: "10px" }}>{err}</div>}

      {ouvert && (
        <div style={{ border: "1px dashed var(--line)", borderRadius: "10px", padding: "12px", marginBottom: "10px" }}>
          <div className="form-group">
            <label>{"Année *"}</label>
            <select value={form.annee_id} onChange={(e) => choisirAnnee(e.target.value)}>
              <option value="">{"— Choisir —"}</option>
              {peutPlacer && eligibles.map((y) => {
                const ex = affs.find((a) => a.annee_id === y.id);
                return <option key={y.id} value={y.id}>{y.nom + (ex ? " (déjà en " + ex.classe_nom + ")" : "")}</option>;
              })}
              {peutLibre && <option value={LIBRE}>{"Autre année ou autre établissement (sans placement)"}</option>}
            </select>
            {peutPlacer && eligibles.length === 0 && <div style={{ fontSize: "12px", color: "var(--text-dim)", marginTop: "6px" }}>{"Aucune année passée ne peut recevoir cet élève : il faut qu'il ait une classe dans une année plus récente (la classe de l'année suivante sert de référence)."}</div>}
          </div>

          {placement && reference && (
            <div>
              <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1e3a8a", borderRadius: "10px", padding: "8px 12px", margin: "10px 0", fontSize: "13px" }}>
                {"Classe plus récente : "}<strong>{reference.classe_nom}</strong>{" (" + reference.annee_nom + "). Tu peux choisir cette classe ou une classe inférieure, jamais une classe supérieure."}
              </div>
              {dejaLa && <div style={{ background: "#fffbeb", border: "1px solid #fde68a", color: "#92400e", borderRadius: "10px", padding: "8px 12px", marginBottom: "10px", fontSize: "13px" }}>{"Déjà placé en " + dejaLa.classe_nom + (dejaLa.salle_nom ? " - " + dejaLa.salle_nom : "") + " en " + anneeChoisie.nom + " : ce choix remplacera cette place."}</div>}
              {!ordreOk && <div className="login-error" style={{ marginBottom: "10px" }}>{"L'ordre des classes (Règles académiques) n'a pas pu être lu : le placement est bloqué. Recharge la page."}</div>}
              <div className="form-row">
                <div className="form-group">
                  <label>{"Classe *"}</label>
                  <select value={form.classe_id} onChange={(e) => setForm((f) => ({ ...f, classe_id: e.target.value, salle_id: "" }))} disabled={classesAn.length === 0}>
                    <option value="">{"— Choisir —"}</option>
                    {permises.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
                  </select>
                  {classesAn.length === 0 && <div style={{ fontSize: "12px", color: "var(--text-dim)", marginTop: "6px" }}>{"Cette année n'a pas de classe configurée (Classes & Sections)."}</div>}
                  {classesAn.length > 0 && permises.length < classesAn.length && <div style={{ fontSize: "12px", color: "var(--text-dim)", marginTop: "6px" }}>{(classesAn.length - permises.length) + " classe(s) non proposée(s) : supérieures à " + reference.classe_nom + " ou absentes de l'ordre des classes."}</div>}
                </div>
                <div className="form-group">
                  <label>{"Salle" + (salles.length ? " *" : "")}</label>
                  <select value={form.salle_id} onChange={(e) => setF("salle_id", e.target.value)} disabled={!form.classe_id || salles.length === 0}>
                    {salles.length !== 1 && <option value="">{salles.length ? "— Choisir —" : "(aucune salle dans cette classe)"}</option>}
                    {salles.map((r) => <option key={r.id} value={r.id}>{r.nom}</option>)}
                  </select>
                </div>
              </div>
              {verdict && verdict.ok && (
                <div style={{ marginBottom: "10px", fontSize: "13px" }}>
                  {"Décision de fin d'année en " + anneeChoisie.nom + " (automatique) : "}
                  <span className={"badge " + BADGES[verdict.decision]}>{LIBELLES[verdict.decision]}</span>
                  <span style={{ color: "var(--text-dim)" }}>{verdict.decision === "maintenu" ? " (même classe que " + reference.annee_nom + ")" : " (classe inférieure à celle de " + reference.annee_nom + ")"}</span>
                </div>
              )}
              <div className="form-group"><label>Remarques</label><input value={form.remarques} onChange={(e) => setF("remarques", e.target.value)} /></div>
              {err && <div className="login-error" style={{ marginBottom: "8px" }}>{err}</div>}
              <div style={{ textAlign: "right" }}><button className="btn-primary" onClick={placer} disabled={busy || !verdict || !verdict.ok || !ordreOk || (salles.length > 0 && !form.salle_id)}>{busy ? "Enregistrement..." : "Placer l'élève"}</button></div>
            </div>
          )}

          {libre && (
            <div>
              <div className="form-row">
                <div className="form-group"><label>{"Année *"}</label><input value={form.annee_nom} placeholder="2019-2020" onChange={(e) => setF("annee_nom", e.target.value)} /></div>
                <div className="form-group">
                  <label>Classe</label>
                  <input list="parcours-classes" value={form.classe_nom || ""} placeholder={"ex. 8e AF"} onChange={(e) => setF("classe_nom", e.target.value)} />
                  <datalist id="parcours-classes">{noms.map((n) => <option key={n} value={n} />)}</datalist>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>{"Décision de fin d'année"}</label>
                  <select value={form.decision} onChange={(e) => setF("decision", e.target.value)}>
                    <option value="">{"Non précisé"}</option>
                    <option value="admis">{"Admis (classe supérieure)"}</option>
                    <option value="maintenu">{"Maintenu (redoublement)"}</option>
                    <option value="admis_ailleurs">{"Admis ailleurs"}</option>
                    <option value="exclu">{"Exclu"}</option>
                  </select>
                </div>
                <div className="form-group"><label>{"Établissement (si autre)"}</label><input value={form.etablissement} placeholder={"Laisser vide si notre établissement"} onChange={(e) => setF("etablissement", e.target.value)} /></div>
              </div>
              <div className="form-group"><label>Remarques</label><input value={form.remarques} onChange={(e) => setF("remarques", e.target.value)} /></div>
              {err && <div className="login-error" style={{ marginBottom: "8px" }}>{err}</div>}
              <div style={{ textAlign: "right" }}><button className="btn-primary" onClick={enregistrerLibre} disabled={busy}>{busy ? "Enregistrement..." : "Enregistrer"}</button></div>
            </div>
          )}

          {!placement && !libre && err && <div className="login-error" style={{ marginTop: "8px" }}>{err}</div>}
        </div>
      )}

      {lignes.length === 0 && <div style={{ color: "var(--text-dim)", fontSize: "13px" }}>{"Aucun historique enregistré."}</div>}
      <div style={{ borderLeft: "3px solid var(--accent)", marginLeft: "6px", paddingLeft: "14px" }}>
        {lignes.map((p) => (
          <div key={p.id} style={{ position: "relative", padding: "6px 0 10px" }}>
            <span style={{ position: "absolute", left: "-22px", top: "10px", width: "11px", height: "11px", borderRadius: "50%", background: p.actuelle ? "var(--accent)" : "var(--navy)" }} />
            <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
              <strong style={{ color: "var(--navy)" }}>{p.annee_nom}</strong>
              <span>{p.classe_nom || "-"}{p.salle_nom ? " - " + p.salle_nom : ""}</span>
              <span className={"badge " + (BADGES[p.decision] || "badge-gray")}>{LIBELLES[p.decision] || LIBELLES[""]}</span>
              {p.source === "migration" && <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>{"(migration)"}</span>}
              {!p.reel && can("students", "modifier") && <button className="modal-close" style={{ fontSize: "12px" }} onClick={() => supprimer(p)} title="Supprimer">x</button>}
            </div>
            {(p.etablissement || p.remarques) && <div style={{ fontSize: "12px", color: "var(--text-dim)" }}>{[p.etablissement, p.remarques].filter(Boolean).join(" - ")}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

export function BlocsProfil({ s, classeActuelle }) {
  const [parcours, setParcours] = useState([]);
  return (
    <>
      <FicheComplete s={s} parcours={parcours} />
      <ParcoursScolaire studentId={s.id} classeActuelle={classeActuelle} onChargé={setParcours} />
    </>
  );
}
