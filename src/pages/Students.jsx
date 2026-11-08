import React, { useState, useEffect } from "react";
import { useAuth } from "../AuthContext.jsx";
import { useDroit } from "../PermissionsContext.jsx";
import { getAuthedClient, EDGE_FUNCTION_URL, SUPABASE_ANON_KEY } from "../supabaseClient.js";
import StudentProfile from "../components/StudentProfile.jsx";
import { verifierEleve, demanderDoublon } from "../doublons.js";
import { useAccesPour } from "../accesSpecial/accesSpecialStore.js";
import ConfirmationAccesSpecial from "../accesSpecial/ConfirmationAccesSpecial.jsx";
import { useListesReference } from "../listesReference.js";
import { matriculePourNouvelEleve, appliquerIdentifiant, historiqueIdentifiants, elevesParAncienIdentifiant, etatIdentifiant, debutIdentifiant, typeIdentifiant, installationIncomplete } from "../identifiantEleve.js";
import LieuNaissance from "../components/LieuNaissance.jsx";
import IdentifiantEleve from "../components/IdentifiantEleve.jsx";
import ChoixListe from "../components/ChoixListe.jsx";
import ClassePrecedente from "../components/ClassePrecedente.jsx";
import { chargerNomsClasses } from "../classesOrdre.js";
import { fusionnerListe } from "../geographie.js";
import ChampTelephone from "../components/ChampTelephone.jsx";
import { afficherTelephone, analyserTelephone } from "../telephone.js";

function genererMatricule(nom, prenom, seq) {
  const normalize = (str) => (str || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z]/g, "").toUpperCase();
  let baseNom = normalize(nom).substring(0, 3);
  while (baseNom.length < 3) baseNom += "X";
  let baseP = normalize(prenom).substring(0, 1) || "X";
  return baseNom + baseP + "-" + String(seq).padStart(4, "0");
}

const CHAMPS_EXTRA = [
  ["Identit\u00e9 compl\u00e9mentaire", [["nationalite","Nationalit\u00e9"],["numero_ordre","Num\u00e9ro d'ordre"],["numero_identifiant","Num\u00e9ro identifiant"],["nisu","NISU"],["congregation_religieuse","Religion","religion"],["rang_famille","Rang dans la famille"]]],
  ["P\u00e8re", [["pere_nom","Nom"],["pere_prenom","Pr\u00e9nom"],["pere_statut","Statut","parent_m"],["pere_occupation","Occupation"],["pere_nif","NIF/NINU"],["pere_telephone","T\u00e9l\u00e9phone","tel"]]],
  ["M\u00e8re", [["mere_nom","Nom"],["mere_prenom","Pr\u00e9nom"],["mere_statut","Statut","parent_f"],["mere_occupation","Occupation"],["mere_nif","NIF/NINU"],["mere_telephone","T\u00e9l\u00e9phone","tel"]]],
  ["Responsable l\u00e9gal", [["responsable_lien","Lien de parent\u00e9"],["responsable_nom","Nom"],["responsable_prenom","Pr\u00e9nom"],["responsable_occupation","Occupation"],["responsable_nif","NIF"],["responsable_ninu","NINU"],["responsable_email","Email"],["responsable_telephone","T\u00e9l\u00e9phone","tel"],["responsable_telephone2","T\u00e9l\u00e9phone additionnel","tel"]]],
  ["Urgence", [["urgence_telephone","T\u00e9l\u00e9phone d'urgence","tel"],["urgence_lien","Lien de parent\u00e9"]]],
  ["Scolarit\u00e9 ant\u00e9rieure", [["ecole_precedente","\u00c9cole pr\u00e9c\u00e9dente","ecole"],["classe_precedente","Classe pr\u00e9c\u00e9dente","classe"]]],
  
  ["Notes", [["remarques","Notes","textarea"]]]
];
const EXTRA_KEYS = CHAMPS_EXTRA.flatMap(([, champs]) => champs.map((c) => c[0]));
const EXTRA_VIDE = Object.fromEntries(EXTRA_KEYS.map((k) => [k, ""]));
const NAISSANCE_VIDE = { departement_naissance: "", commune_naissance: "", section_communale: "", pays_naissance: "", lieu_naissance: "", a_handicap: "", handicap_besoins: "" };
const EMPTY_FORM = { nom: "", prenom: "", sexe: "", date_naissance: "", adresse: "", telephone: "", email: "", nom_parent: "", telephone_parent: "", ...EXTRA_VIDE, ...NAISSANCE_VIDE };

// Telephones : indicatif du pays + numero. Un numero n'est controle et reecrit (+50937123456) que s'il a ete modifie dans la fenetre :
// les anciens numeros de la fiche restent tels quels tant qu'on n'y touche pas.
const CLES_TEL = ["telephone", "telephone_parent", "pere_telephone", "mere_telephone", "responsable_telephone", "responsable_telephone2", "urgence_telephone"];
const LIB_TEL = { telephone: "Téléphone", telephone_parent: "Téléphone du parent", pere_telephone: "Téléphone du père", mere_telephone: "Téléphone de la mère", responsable_telephone: "Téléphone du responsable légal", responsable_telephone2: "Téléphone additionnel", urgence_telephone: "Téléphone d'urgence" };
const telModifie = (f, initiale, k) => String(f[k] || "") !== String((initiale && initiale[k]) || "");
const telsInvalides = (f, initiale) => CLES_TEL.filter((k) => telModifie(f, initiale, k) && String(f[k] || "").trim() && !analyserTelephone(f[k]).ok).map((k) => LIB_TEL[k]);

// Ce qui part dans la base : departement en nombre, handicap Oui/Non en vrai/faux (le type de handicap n'est gardé que si Oui)
const versBase = (f, initiale) => {
  const { a_handicap, ...reste } = f;
  const tels = {};
  for (const k of CLES_TEL) if (telModifie(f, initiale, k)) { const a = analyserTelephone(f[k]); if (a.ok) tels[k] = a.compact; else if (!String(f[k] || "").trim()) tels[k] = ""; }
  return {
    ...reste,
    ...tels,
    date_naissance: f.date_naissance || null,
    departement_naissance: f.departement_naissance ? Number(f.departement_naissance) : null,
    a_handicap: a_handicap === "oui" ? true : a_handicap === "non" ? false : null,
    handicap_besoins: a_handicap === "non" ? "" : (f.handicap_besoins || "")
  };
};
const handicapDeFiche = (s) => s.a_handicap === true ? "oui" : s.a_handicap === false ? "non" : (s.handicap_besoins ? "oui" : "");
// Les informations qui composent l'identifiant ont-elles change entre deux versions de la fiche ?
const CLES_ID = ["nom", "prenom", "date_naissance", "sexe", "departement_naissance"];
const idChange = (a, b) => CLES_ID.some((k) => String(a[k] == null ? "" : a[k]).trim() !== String(b[k] == null ? "" : b[k]).trim());
const STATUT_PARENT = { parent_m: [["vivant", "Vivant"], ["decede", "D\u00e9c\u00e9d\u00e9"]], parent_f: [["vivant", "Vivante"], ["decede", "D\u00e9c\u00e9d\u00e9e"]] };

export default function Students() {
  const { token, user } = useAuth();
  const dEleves = useDroit("students");
  const accesEleve = useAccesPour("suppression_eleve");
  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const listes = useListesReference();
  const [nomsClasses, setNomsClasses] = useState([]);
  const [filtreId, setFiltreId] = useState("");
  const [historique, setHistorique] = useState([]);
  const [eleveEdite, setEleveEdite] = useState(null);
  const [propositionId, setPropositionId] = useState(null);   // { eleve, infos, mode: "conversion" | "correction" | "manuel", motPasse }
  const [propositionErreur, setPropositionErreur] = useState("");
  const [propositionBusy, setPropositionBusy] = useState(false);
  const [info, setInfo] = useState("");

  const [profileId, setProfileId] = useState(null);
  const [editConfirmOpen, setEditConfirmOpen] = useState(false);
  const [editPassword, setEditPassword] = useState("");
  const [editError, setEditError] = useState("");

  const load = async (q) => {
    setLoading(true);
    setError("");
    try {
      const supabase = getAuthedClient(token);
      let query = supabase.from("students").select("*").is("deleted_at", null).order("nom");
      if (q) {
        const t = q.replace(/[,()]/g, " ").trim();
        const anciens = await elevesParAncienIdentifiant(supabase, t);   // un ancien matricule retrouve toujours l'eleve
        query = query.or("nom.ilike.%" + t + "%,prenom.ilike.%" + t + "%,matricule.ilike.%" + t + "%" + (anciens.length ? ",id.in.(" + anciens.join(",") + ")" : ""));
      }
      const { data, error: e } = await query;
      if (e) throw e;
      setStudents(data);
    } catch (e) {
      setError(e.message || "Erreur de chargement");
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [token]);
  useEffect(() => {
    const t = setTimeout(() => load(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let vivant = true;
    chargerNomsClasses(getAuthedClient(token)).then((n) => { if (vivant) setNomsClasses(n); });
    return () => { vivant = false; };
  }, [token]);

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setFields = (o) => setForm((f) => ({ ...f, ...o }));

  const openNew = () => {
    setEditingId(null);
    setEleveEdite(null);
    setHistorique([]);
    setForm(EMPTY_FORM);
    setSaveError("");
    setModalOpen(true);
  };

  const openEdit = (s) => {
    setEditingId(s.id);
    setEleveEdite(s);
    setHistorique([]);
    historiqueIdentifiants(getAuthedClient(token), s.id).then(setHistorique);
    setForm({
      nom: s.nom || "", prenom: s.prenom || "", sexe: s.sexe || "", date_naissance: s.date_naissance || "",
      adresse: s.adresse || "", telephone: s.telephone || "", email: s.email || "",
      nom_parent: s.nom_parent || "", telephone_parent: s.telephone_parent || "", ...Object.fromEntries(EXTRA_KEYS.map((k) => [k, s[k] || ""])),
      departement_naissance: s.departement_naissance ? String(s.departement_naissance) : "", commune_naissance: s.commune_naissance || "",
      section_communale: s.section_communale || "", pays_naissance: s.pays_naissance || "", lieu_naissance: s.lieu_naissance || "",
      a_handicap: handicapDeFiche(s), handicap_besoins: s.handicap_besoins || ""
    });
    setSaveError("");
    setModalOpen(true);
  };

  const requestSubmit = () => {
    setSaveError("");
    if (!form.nom.trim() || !form.prenom.trim()) { setSaveError("Nom et prénom requis"); return; }
    if (!editingId && !form.sexe) { setSaveError("Le sexe est requis (Masculin ou Féminin)"); return; }
    const mauvais = telsInvalides(form, editingId ? eleveEdite : null);
    if (mauvais.length) { setSaveError("Numéro de téléphone invalide : " + mauvais.join(", ") + ". Haïti : 8 chiffres (indicatif +509). Autre pays : choisir l'indicatif du pays puis le numéro complet."); return; }
    if (editingId) {
      setEditPassword(""); setEditError(""); setEditConfirmOpen(true);
    } else {
      submitCreate();
    }
  };

  const submitCreate = async () => {
    if (!dEleves.creer) { setSaveError("Tu n'as pas le droit d'ajouter un eleve."); return; }
    setSaving(true);
    try {
      const supabase = getAuthedClient(token);
      const dblMsg = await verifierEleve(supabase, form.nom, form.prenom, null);
      if (dblMsg && !(await demanderDoublon(dblMsg))) { setSaving(false); return; }
      const ancienMatricule = async () => {
        const { data: seqData, error: seqError } = await supabase.rpc("next_eleve_seq");
        if (seqError) throw seqError;
        return genererMatricule(form.nom, form.prenom, seqData);
      };
      // fiche complete (date, sexe, departement) -> identifiant normal ; sinon matricule provisoire (ancien format)
      const { matricule, provisoire } = await matriculePourNouvelEleve(supabase, form, ancienMatricule);

      const { error: insertError } = await supabase.from("students").insert({
        matricule, ...versBase(form, null),
        statut: "actif", modified_by: user ? user.username : null
      });
      if (insertError) throw insertError;

      setModalOpen(false);
      setInfo(provisoire ? "Élève enregistré avec un identifiant provisoire (" + matricule + "). Il passera au format normal quand la fiche sera complète." : "Élève enregistré. Identifiant : " + matricule);
      load(search);
    } catch (e) {
      setSaveError(e.message || "Erreur d'enregistrement");
    }
    setSaving(false);
  };

  const [dualTarget, setDualTarget] = useState(null);
  const [dualCreds, setDualCreds] = useState({ username: "", password: "" });
  const [dualError, setDualError] = useState("");
  const [dualBusy, setDualBusy] = useState(false);

  const verifyCredentials = async (username, password) => {
    const r = await fetch(EDGE_FUNCTION_URL, {
      method: "POST",
      headers: { "apikey": SUPABASE_ANON_KEY, "Authorization": "Bearer " + SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    const d = await r.json();
    if (!r.ok) return { ok: false, error: d.error || "Mot de passe incorrect" };
    return { ok: true };
  };

  const requestDelete = (id) => { setDualTarget(id); setDualCreds({ username: "", password: "" }); setDualError(""); };

  const confirmDelete = async () => {
    setDualError("");
    if (!dEleves.annuler) { setDualError("Tu n'as pas le droit de supprimer un eleve."); return; }
    if (!dualCreds.username || !dualCreds.password) { setDualError("Identifiant et mot de passe requis"); return; }
    if (dualCreds.username === user.username) { setDualError("Le vérificateur doit être une personne différente"); return; }
    setDualBusy(true);
    const check = await verifyCredentials(dualCreds.username, dualCreds.password);
    if (!check.ok) { setDualError(check.error); setDualBusy(false); return; }
    try {
      const supabase = getAuthedClient(token);
      const { data: verifier } = await supabase.from("users").select("role_nom").eq("username", dualCreds.username).maybeSingle();
      if (!verifier || verifier.role_nom !== "Administrateur") { setDualError("Seul un administrateur peut autoriser cette action"); setDualBusy(false); return; }
      const { error: delError } = await supabase.from("students").update({ deleted_at: new Date().toISOString() }).eq("id", dualTarget);
      if (delError) throw delError;
      setDualTarget(null);
      load(search);
    } catch (e) {
      setDualError(e.message || "Erreur de suppression");
    }
    setDualBusy(false);
  };

  // Acces special (suppression d'un eleve) : la personne confirme avec son propre mot de passe, l'action est inscrite dans le rapport.
  const eleveCible = dualTarget ? students.find((x) => x.id === dualTarget) : null;
  const nomEleveCible = eleveCible ? (((eleveCible.prenom || "") + " " + (eleveCible.nom || "")).trim() + (eleveCible.matricule ? " (" + eleveCible.matricule + ")" : "")) : "";
  const supprimerAvecAcces = async () => {
    const supabase = getAuthedClient(token);
    const { error: delError } = await supabase.from("students").update({ deleted_at: new Date().toISOString() }).eq("id", dualTarget);
    if (delError) throw delError;
    setDualTarget(null);
    load(search);
    return "Élève supprimé";
  };

  const motDePasseValide = async (motDePasse) => {
    const r = await fetch(EDGE_FUNCTION_URL, {
      method: "POST",
      headers: { "apikey": SUPABASE_ANON_KEY, "Authorization": "Bearer " + SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ username: user.username, password: motDePasse })
    });
    const d = await r.json();
    return r.ok ? "" : (d.error || "Mot de passe incorrect");
  };

  // Bouton « Generer l'ID » d'une ligne (eleve existant) : meme confirmation par mot de passe qu'une modification de fiche
  const proposerIdentifiant = (s) => {
    const infos = { ...s, departement_naissance: s.departement_naissance || "" };
    const etat = etatIdentifiant(infos).etat;
    if (etat !== "pret" && etat !== "decale") return;
    setPropositionErreur("");
    setPropositionId({ eleve: s, infos, mode: "manuel", motPasse: "" });
  };

  const appliquerNouvelId = async () => {
    if (!propositionId) return;
    setPropositionErreur("");
    if (!dEleves.modifier) { setPropositionErreur("Tu n'as pas le droit de modifier une fiche."); return; }
    setPropositionBusy(true);
    try {
      if (propositionId.mode === "manuel") {
        if (!propositionId.motPasse) { setPropositionErreur("Entrez votre mot de passe."); setPropositionBusy(false); return; }
        const refus = await motDePasseValide(propositionId.motPasse);
        if (refus) { setPropositionErreur(refus); setPropositionBusy(false); return; }
      }
      const supabase = getAuthedClient(token);
      const motif = propositionId.mode === "conversion" ? "Fiche complétée" : propositionId.mode === "correction" ? "Correction de la fiche" : "Génération manuelle";
      const nouveau = await appliquerIdentifiant(supabase, propositionId.eleve.id, propositionId.infos, motif, user.username);
      setPropositionId(null);
      setInfo("Nouvel identifiant : " + nouveau + ". L'ancien (" + (propositionId.eleve.matricule || "-") + ") reste dans l'historique et dans la recherche.");
      load(search);
    } catch (e) {
      setPropositionErreur(installationIncomplete(e) ? "Le script SQL « identifiant-eleve.sql » n'est pas installé sur cette base." : (e.message || "Impossible de générer l'identifiant"));
    }
    setPropositionBusy(false);
  };

  const confirmEdit = async () => {
    setEditError("");
    if (!dEleves.modifier) { setEditError("Tu n'as pas le droit de modifier une fiche."); return; }
    if (!editPassword) { setEditError("Entrez votre mot de passe."); return; }
    setSaving(true);
    try {
      const refus = await motDePasseValide(editPassword);
      if (refus) { setEditError(refus); setSaving(false); return; }

      const supabase = getAuthedClient(token);
      const { error: updateError } = await supabase.from("students")
        .update({ ...versBase(form, eleveEdite), modified_by: user.username })
        .eq("id", editingId);
      if (updateError) throw updateError;

      setEditConfirmOpen(false);
      setModalOpen(false);
      setInfo("Fiche enregistrée.");
      // La fiche vient d'etre completee (ou ses informations d'identifiant ont change) : on propose le nouvel identifiant, sans jamais l'imposer
      if (eleveEdite) {
        const avant = etatIdentifiant(eleveEdite).etat;
        const infos = { ...form, matricule: eleveEdite.matricule };
        const apres = etatIdentifiant(infos).etat;
        const change = idChange(eleveEdite, form);
        if ((apres === "pret" && (avant !== "pret" || change)) || (apres === "decale" && change)) {
          setPropositionErreur("");
          setPropositionId({ eleve: { id: editingId, matricule: eleveEdite.matricule, nom: form.nom, prenom: form.prenom }, infos, mode: apres === "pret" ? "conversion" : "correction", motPasse: null });
        }
      }
      load(search);
    } catch (e) {
      setEditError(e.message || "Erreur d'enregistrement");
    }
    setSaving(false);
  };

  const nbAncien = students.filter((s) => typeIdentifiant(s.matricule) !== "normal").length;
  const visibles = students.filter((s) => {
    if (!filtreId) return true;
    const t = typeIdentifiant(s.matricule);
    if (filtreId === "normal") return t === "normal";
    if (filtreId === "ancien") return t !== "normal";
    const e = etatIdentifiant(s).etat;
    return e === "pret" || e === "decale";
  });

  return (
    <div className="page">
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 className="page-title">&Eacute;l&egrave;ves</h1>
          <p className="page-subtitle">{students.length} &eacute;l&egrave;ve(s){nbAncien > 0 ? " \u00b7 " + nbAncien + " avec un ancien identifiant" : ""}{filtreId ? " \u00b7 " + visibles.length + " affich\u00e9(s)" : ""}</p>
        </div>
        {dEleves.creer && <button className="btn-primary" onClick={openNew}>+ Nouvel &eacute;l&egrave;ve</button>}
      </div>

      {info && (
        <div data-info="1" style={{ background: "#ecfdf5", border: "1px solid #a7f3d0", color: "#065f46", borderRadius: "10px", padding: "10px 14px", marginBottom: "14px", fontSize: "13px", display: "flex", justifyContent: "space-between", gap: "10px" }}>
          <span>{info}</span><button className="modal-close" onClick={() => setInfo("")}>x</button>
        </div>
      )}
      <div className="add-bar" style={{ maxWidth: "760px" }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher par identifiant, nom ou pr&eacute;nom..." />
        <select value={filtreId} onChange={(e) => setFiltreId(e.target.value)} data-filtre-id="1" style={{ padding: "10px 12px", border: "1.5px solid var(--line)", borderRadius: "10px", background: "#fff", fontSize: "14px", maxWidth: "260px" }}>
          <option value="">Tous les identifiants</option>
          <option value="normal">Nouveau format</option>
          <option value="ancien">Ancien format</option>
          <option value="pret">&Agrave; mettre &agrave; jour (fiche compl&egrave;te)</option>
        </select>
      </div>

      {loading && <p style={{ color: "var(--text-dim)" }}>Chargement...</p>}
      {error && <div className="login-error">{error}</div>}

      {!loading && (
        <div className="table-card">
          <table className="data-table">
            <thead><tr><th>Identifiant</th><th>Nom complet</th><th>Sexe</th><th>Parent</th><th>T&eacute;l&eacute;phone</th><th>Actions</th></tr></thead>
            <tbody>
              {visibles.length === 0 && <tr><td colSpan="6" className="table-empty">Aucun &eacute;l&egrave;ve.</td></tr>}
              {visibles.map((s) => (
                <tr key={s.id} onClick={() => setProfileId(s.id)} style={{ cursor: "pointer" }}>
                  <td>
                    <strong>{s.matricule}</strong>
                    {typeIdentifiant(s.matricule) !== "normal" && <div style={{ fontSize: "11px", color: "var(--text-dim)" }}>ancien format{etatIdentifiant(s).etat === "pret" ? " \u00b7 fiche compl\u00e8te" : ""}</div>}
                    {etatIdentifiant(s).etat === "decale" && <div style={{ fontSize: "11px", color: "#b45309" }}>à régénérer</div>}
                  </td>
                  <td>{s.prenom} {s.nom}</td>
                  <td>{s.sexe || "-"}</td>
                  <td>{s.nom_parent || "-"}</td>
                  <td>{afficherTelephone(s.telephone_parent || s.telephone) || "-"}</td>
                  <td style={{ display: "flex", gap: "6px" }}>{dEleves.modifier && <button className="btn-sm btn-blue" onClick={(e) => { e.stopPropagation(); openEdit(s); }}>Modifier</button>}{dEleves.modifier && (etatIdentifiant(s).etat === "pret" || etatIdentifiant(s).etat === "decale") && <button className="btn-sm btn-blue" data-gen-id={s.id} title="Générer le nouvel identifiant" onClick={(e) => { e.stopPropagation(); proposerIdentifiant(s); }}>{etatIdentifiant(s).etat === "decale" ? "Régénérer l'ID" : "Générer l'ID"}</button>}{(dEleves.annuler || accesEleve) && <button className="btn-sm btn-red" onClick={(e) => { e.stopPropagation(); requestDelete(s.id); }}>Supprimer</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "720px", maxWidth: "96vw", maxHeight: "88vh", overflowY: "auto" }}>
            <div className="modal-header">
              <h3>{editingId ? "Modifier l'élève" : "Nouvel élève"}</h3>
              <button className="modal-close" onClick={() => setModalOpen(false)}>x</button>
            </div>
            {saveError && <div className="login-error" style={{ marginBottom: "14px" }}>{saveError}</div>}
            <IdentifiantEleve e={{ ...form, matricule: eleveEdite ? eleveEdite.matricule : "" }} creation={!editingId} historique={historique} />
            <div className="form-row">
              <div className="form-group"><label>Nom</label><input value={form.nom} data-champ="nom" onChange={(e) => setField("nom", e.target.value)} /></div>
              <div className="form-group"><label>Pr&eacute;nom</label><input value={form.prenom} data-champ="prenom" onChange={(e) => setField("prenom", e.target.value)} /></div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>{editingId ? "Sexe" : "Sexe *"}</label>
                <select value={form.sexe} data-champ="sexe" onChange={(e) => setField("sexe", e.target.value)}>
                  <option value="">{editingId ? "--" : "Sélectionner le sexe"}</option><option value="M">Masculin</option><option value="F">F&eacute;minin</option>
                </select>
              </div>
              <div className="form-group"><label>Date de naissance</label><input type="date" value={form.date_naissance} data-champ="date_naissance" onChange={(e) => setField("date_naissance", e.target.value)} /></div>
            </div>
            <h4 style={{ margin: "6px 0 10px", fontSize: "13px", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Naissance</h4>
            <LieuNaissance form={form} setFields={setFields} listes={listes} />
            <div className="form-row">
              <div className="form-group">
                <label>Y a-t-il un handicap ?</label>
                <select value={form.a_handicap} data-champ="a_handicap" onChange={(e) => setFields({ a_handicap: e.target.value, ...(e.target.value === "non" ? { handicap_besoins: "" } : {}) })}>
                  <option value="">--</option><option value="non">Non</option><option value="oui">Oui</option>
                </select>
              </div>
              {form.a_handicap === "oui" && (
                <div className="form-group"><label>Quel type de handicap ?</label><input value={form.handicap_besoins} data-champ="handicap_besoins" onChange={(e) => setField("handicap_besoins", e.target.value)} /></div>
              )}
            </div>
            <div className="form-group" style={{ marginBottom: "16px" }}><label>Adresse</label><input value={form.adresse} data-champ="adresse" onChange={(e) => setField("adresse", e.target.value)} /></div>
            <div className="form-row">
              <ChampTelephone label="Téléphone" nom="telephone" value={form.telephone} onChange={(v) => setField("telephone", v)} />
              <div className="form-group"><label>Email</label><input value={form.email} onChange={(e) => setField("email", e.target.value)} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Nom du parent</label><input value={form.nom_parent} onChange={(e) => setField("nom_parent", e.target.value)} /></div>
              <ChampTelephone label="Téléphone du parent" nom="telephone_parent" value={form.telephone_parent} onChange={(v) => setField("telephone_parent", v)} />
            </div>
                        {CHAMPS_EXTRA.map(([titre, champs]) => (
              <div key={titre}>
                <h4 style={{ margin: "18px 0 10px", fontSize: "13px", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.5px" }}>{titre}</h4>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  {champs.map(([k, label, kind]) => kind === "textarea" ? (
                    <div className="form-group" key={k} style={{ gridColumn: "1 / -1" }}>
                      <label>{label}</label>
                      <textarea className="modal-textarea" rows="2" value={form[k] || ""} onChange={(e) => setField(k, e.target.value)} />
                    </div>
                  ) : kind === "ecole" ? (
                    <ChoixListe key={k} label={label} nomChamp="ecole_precedente" valeur={form[k]} vide="Choisir l'école..."
                      options={fusionnerListe([], listes.valeurs("ecole", ""), form[k])}
                      onChange={(v) => setField(k, v)} onAjouter={(t) => listes.ajouter("ecole", "", t, [])} libelleAjout="Autre école (ajouter)..."
                      aide={listes.chargee && listes.valeurs("ecole", "").length === 0 ? "Aucune école enregistrée : ajoute la première avec « Autre »." : ""} />
                  ) : kind === "tel" ? (
                    <ChampTelephone key={k} label={label} nom={k} value={form[k] || ""} onChange={(v) => setField(k, v)} />
                  ) : kind === "religion" ? (
                    <ChoixListe key={k} label={label} nomChamp="congregation_religieuse" valeur={form[k]} vide="Choisir la religion..."
                      options={fusionnerListe([], listes.valeurs("religion", ""), form[k])}
                      onChange={(v) => setField(k, v)} onAjouter={(t) => listes.ajouter("religion", "", t, [])} libelleAjout="Autre religion (ajouter)..."
                      aide={listes.chargee && listes.valeurs("religion", "").length === 0 ? "Aucune religion enregistrée : ajoute la première avec « Autre »." : ""} />
                  ) : kind === "classe" ? (
                    <ClassePrecedente key={k} valeur={form[k]} onChange={(v) => setField(k, v)} noms={nomsClasses} label={label} />
                  ) : STATUT_PARENT[kind] ? (
                    <div className="form-group" key={k}>
                      <label>{label}</label>
                      <select value={form[k] || ""} data-champ={k} onChange={(e) => setField(k, e.target.value)}>
                        <option value="">--</option>
                        {STATUT_PARENT[kind].map(([code, nom]) => <option key={code} value={code}>{nom}</option>)}
                        {form[k] && !STATUT_PARENT[kind].some(([code]) => code === form[k]) && <option value={form[k]}>{form[k]}</option>}
                      </select>
                    </div>
                  ) : (
                    <div className="form-group" key={k}>
                      <label>{label}</label>
                      <input value={form[k] || ""} onChange={(e) => setField(k, e.target.value)} />
                    </div>
                  ))}
                </div>
              </div>
            ))}            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setModalOpen(false)}>Annuler</button>
              <button className="btn-primary" onClick={requestSubmit} disabled={saving}>{saving ? "Enregistrement..." : (editingId ? "Enregistrer" : "Créer")}</button>
            </div>
          </div>
        </div>
      )}

      {editConfirmOpen && (
        <div className="modal-overlay" onClick={() => setEditConfirmOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "420px" }}>
            <div className="modal-header">
              <h3>Confirmer la modification</h3>
              <button className="modal-close" onClick={() => setEditConfirmOpen(false)}>x</button>
            </div>
            {editError && <div className="login-error" style={{ marginBottom: "14px" }}>{editError}</div>}
            <div className="form-group" style={{ marginBottom: "20px" }}>
              <label>Votre mot de passe</label>
              <input type="password" value={editPassword} onChange={(e) => setEditPassword(e.target.value)} autoFocus onKeyDown={(e) => e.key === "Enter" && confirmEdit()} />
            </div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setEditConfirmOpen(false)}>Annuler</button>
              <button className="btn-primary" onClick={confirmEdit} disabled={saving}>{saving ? "Vérification..." : "Confirmer"}</button>
            </div>
          </div>
        </div>
      )}
      {dualTarget && accesEleve && (
        <ConfirmationAccesSpecial tache="suppression_eleve" titre="Supprimer un élève" resume={"Supprimer la fiche de " + nomEleveCible}
          cible={nomEleveCible} detail={{ student_id: dualTarget }} onClose={() => setDualTarget(null)} onAutorise={supprimerAvecAcces} />
      )}
      {dualTarget && !accesEleve && (
        <div className="modal-overlay" onClick={() => setDualTarget(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "420px" }}>
            <div className="modal-header">
              <h3 style={{ color: "var(--err)" }}>Autorisation requise</h3>
              <button className="modal-close" onClick={() => setDualTarget(null)}>x</button>
            </div>
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "10px", padding: "14px", marginBottom: "18px" }}>
              <p style={{ fontSize: "13px", color: "#991b1b", margin: 0 }}><strong>Action sensible :</strong> Suppression d&apos;un &eacute;l&egrave;ve</p>
              <p style={{ fontSize: "12px", color: "#b91c1c", margin: "6px 0 0" }}>Un administrateur doit confirmer cette action avec ses identifiants.</p>
            </div>
            {dualError && <div className="login-error" style={{ marginBottom: "14px" }}>{dualError}</div>}
            <div className="form-group" style={{ marginBottom: "14px" }}>
              <label>Identifiant de l&apos;administrateur</label>
              <input value={dualCreds.username} onChange={(e) => setDualCreds({ ...dualCreds, username: e.target.value })} autoFocus />
            </div>
            <div className="form-group" style={{ marginBottom: "20px" }}>
              <label>Mot de passe</label>
              <input type="password" value={dualCreds.password} onChange={(e) => setDualCreds({ ...dualCreds, password: e.target.value })} onKeyDown={(e) => e.key === "Enter" && confirmDelete()} />
            </div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setDualTarget(null)}>Annuler</button>
              <button className="btn-primary" onClick={confirmDelete} disabled={dualBusy}>{dualBusy ? "Vérification..." : "Autoriser"}</button>
            </div>
          </div>
        </div>
      )}
      {propositionId && (() => {
        const p = propositionId;
        const nomEleve = ((p.infos.prenom || "") + " " + (p.infos.nom || "")).trim();
        const debutId = debutIdentifiant(p.infos).debut;
        return (
          <div className="modal-overlay" onClick={() => !propositionBusy && setPropositionId(null)}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "480px", maxWidth: "94vw" }} data-proposition-id={p.mode}>
              <div className="modal-header">
                <h3>Nouvel identifiant</h3>
                <button className="modal-close" onClick={() => setPropositionId(null)}>x</button>
              </div>
              {propositionErreur && <div className="login-error" style={{ marginBottom: "14px" }}>{propositionErreur}</div>}
              <p style={{ fontSize: "13.5px", margin: "0 0 12px" }}>
                {p.mode === "conversion" && <span>La fiche de <strong>{nomEleve}</strong> est maintenant complète. Générer son identifiant au format normal ?</span>}
                {p.mode === "correction" && <span>Les informations de <strong>{nomEleve}</strong> ne correspondent plus à son identifiant. Le remplacer par le bon ?</span>}
                {p.mode === "manuel" && <span>Générer l'identifiant au format normal de <strong>{nomEleve}</strong> ?</span>}
              </p>
              <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "12px 14px", marginBottom: "12px", fontSize: "13px", lineHeight: 1.7 }}>
                <div>Actuel : <strong style={{ fontFamily: "Consolas, monospace" }}>{p.eleve.matricule || "-"}</strong></div>
                <div>Nouveau : <strong style={{ fontFamily: "Consolas, monospace" }}>{debutId}</strong><span style={{ opacity: 0.55, fontFamily: "Consolas, monospace", fontWeight: 700 }}>•••••</span></div>
              </div>
              <p style={{ fontSize: "12px", color: "var(--text-dim)", margin: "0 0 14px" }}>Le numéro d'ordre est attribué à la validation. L'ancien identifiant reste dans l'historique de l'élève et continue de le retrouver dans la recherche.</p>
              {p.mode === "manuel" && (
                <div className="form-group" style={{ marginBottom: "16px" }}>
                  <label>Votre mot de passe</label>
                  <input type="password" value={p.motPasse || ""} autoFocus data-champ="mot-de-passe-id" onChange={(e) => setPropositionId({ ...p, motPasse: e.target.value })} onKeyDown={(e) => e.key === "Enter" && appliquerNouvelId()} />
                </div>
              )}
              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                <button className="btn-gray-cancel btn-sm" onClick={() => setPropositionId(null)} disabled={propositionBusy}>{p.mode === "manuel" ? "Annuler" : "Garder l'identifiant actuel"}</button>
                <button className="btn-primary" data-valider-id="1" onClick={appliquerNouvelId} disabled={propositionBusy}>{propositionBusy ? "Génération..." : "Générer le nouvel ID"}</button>
              </div>
            </div>
          </div>
        );
      })()}
      {profileId && <StudentProfile studentId={profileId} onClose={() => setProfileId(null)} />}
    </div>
  );
}