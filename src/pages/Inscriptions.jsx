import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "../AuthContext.jsx";
import { getAuthedClient } from "../supabaseClient.js";
import { useYear } from "../YearContext.jsx";
import { verifierEleve, demanderDoublon } from "../doublons.js";
import { trierClasses } from "../ordreClasses.js";
import ChoixListe from "../components/ChoixListe.jsx";
import LieuNaissance from "../components/LieuNaissance.jsx";
import ClassePrecedente from "../components/ClassePrecedente.jsx";
import IdentifiantCandidat from "../components/IdentifiantCandidat.jsx";
import EcolesPrecedentes from "../components/EcolesPrecedentes.jsx";
import { useListesReference } from "../listesReference.js";
import { chargerNomsClasses } from "../classesOrdre.js";
import { chargerOrdreClasses, classesPermises, classeProposee, plusBasseQue, aideClasseSouhaitee } from "../classeSouhaitee.js";
import { debutIdentifiant, matriculePourNouvelEleve, nomDepartement, installationIncomplete } from "../identifiantEleve.js";
import { fusionnerListe } from "../geographie.js";
import { FORM_VIDE, LIENS_PARENTE, erreursInscription, versBaseInscription, depuisBaseInscription, afficherTelephone } from "../inscriptionEleve.js";
import ChampTelephone from "../components/ChampTelephone.jsx";

import { admettreInscription, refuserInscription } from "../admissionInscription.js";

const BADGES = {
  en_attente_examen: { txt: "En attente d'examen", cls: "badge-gold" },
  admis: { txt: "Admis", cls: "badge-ok" },
  refuse: { txt: "Refusé", cls: "badge-err" }
};

const STYLE_ERREUR = { border: "1px solid var(--err, #b42318)", background: "#fff5f5" };
const statutParent = (v, fem) => v === "vivant" ? (fem ? "Vivante" : "Vivant") : v === "decede" ? (fem ? "Décédée" : "Décédé") : "-";
const nomComplet = (p, n) => [p, n].filter(Boolean).join(" ") || "-";
const oui = (v) => v === true ? "Oui" : v === false ? "Non" : "";

// Message clair quand les colonnes de l'etape B ne sont pas encore creees dans la base (script SQL pas lance)
const colonneAbsente = (e) => !!e && /schema cache|column .* does not exist|could not find the '.*' column/i.test(String(e.message || "")) && /inscriptions|students/i.test(String(e.message || ""));
const MESSAGE_SQL = "Le script SQL « identifiant-eleve.sql » n'est pas encore installé sur cette base (colonnes de l'inscription). Lance-le dans Supabase, puis recharge la page.";

function blocsDetail(d) {
  const dep = nomDepartement(d.departement_naissance);
  const blocs = [
    ["Naissance", [
      ["Département", dep], ["Commune", d.commune_naissance], ["Section communale", d.section_communale], ["Pays", d.pays_naissance], ["Lieu de naissance", d.lieu_naissance]
    ]],
    ["Informations générales", [
      ["Adresse", d.adresse], ["Téléphone", afficherTelephone(d.telephone)], ["Email", d.email],
      ["Handicap", oui(d.a_handicap) || (d.handicap_besoins ? "Oui" : "")], ["Type de handicap", d.handicap_besoins],
      ["Numéro d'ordre", d.numero_ordre], ["Numéro identifiant", d.numero_identifiant], ["NISU", d.nisu],
      ["Religion", d.congregation_religieuse], ["Rang dans la famille", d.rang_famille]
    ]],
    ["Père", d.pere_connu === false ? [["Père", "Non connu"]] : [
      ["Nom complet", nomComplet(d.pere_prenom, d.pere_nom)], ["Statut", statutParent(d.pere_statut, false)],
      ["Occupation", d.pere_occupation], ["NIF/NINU", d.pere_nif], ["Téléphone", afficherTelephone(d.pere_telephone)]
    ]],
    ["Mère", d.mere_connue === false ? [["Mère", "Non connue"]] : [
      ["Nom complet", nomComplet(d.mere_prenom, d.mere_nom)], ["Statut", statutParent(d.mere_statut, true)],
      ["Occupation", d.mere_occupation], ["NIF/NINU", d.mere_nif], ["Téléphone", afficherTelephone(d.mere_telephone)]
    ]]
  ];
  if (d.responsable_nom || d.responsable_prenom || d.responsable_lien) {
    blocs.push(["Personne responsable", [
      ["Lien de parenté", d.responsable_lien], ["Nom complet", nomComplet(d.responsable_prenom, d.responsable_nom)], ["Occupation", d.responsable_occupation],
      ["NIF", d.responsable_nif], ["NINU", d.responsable_ninu], ["Email", d.responsable_email],
      ["Téléphone", afficherTelephone(d.responsable_telephone)], ["Téléphone additionnel", afficherTelephone(d.responsable_telephone2)]
    ]]);
  }
  blocs.push(["Urgence et scolarité", [
    ["Téléphone d'urgence", afficherTelephone(d.urgence_telephone)], ["Lien de parenté (urgence)", d.urgence_lien],
    ["École précédente", d.ecole_precedente], ["Classe précédente", d.classe_precedente],
    ["Classe souhaitée", d.classe_souhaitee_nom]
  ]]);
  blocs.push(["Divers", [["Notes", d.remarques]]]);
  return blocs;
}

function Champ({ label, value, onChange, type, nom, requis, erreur, placeholder, onBlur }) {
  return (
    <div className="form-group">
      <label>{label}{requis ? " *" : ""}</label>
      <input type={type || "text"} value={value} data-champ={nom} placeholder={placeholder} style={erreur ? STYLE_ERREUR : undefined}
        onChange={(e) => onChange(e.target.value)} onBlur={onBlur} />
    </div>
  );
}

// Indicatif du pays (+509 Haiti par defaut, a ne pas retaper) + numero normal
function Telephone({ label, nom, value, onChange, requis, erreur }) {
  return <ChampTelephone label={label} nom={nom} value={value} onChange={onChange} requis={requis} erreur={erreur} />;
}

// Mere ou pere : case « connu(e) » ; si coche, nom, prenom, statut et occupation sont obligatoires
function BlocParent({ p, fem, form, setField, err }) {
  const connu = form[fem ? "mere_connue" : "pere_connu"];
  return (
    <div data-bloc={p}>
      <h4 style={{ margin: "20px 0 10px" }}>{fem ? "Mère" : "Père"}</h4>
      <label style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px", cursor: "pointer" }}>
        <input type="checkbox" data-champ={fem ? "mere_connue" : "pere_connu"} checked={!!connu} onChange={(e) => setField(fem ? "mere_connue" : "pere_connu", e.target.checked)} />
        {fem ? "Mère connue" : "Père connu"}
      </label>
      {connu && (
        <>
          <div className="form-row">
            <Champ label="Nom" nom={p + "_nom"} requis erreur={err(p + "_nom")} value={form[p + "_nom"]} onChange={(v) => setField(p + "_nom", v)} />
            <Champ label={"Prénom"} nom={p + "_prenom"} requis erreur={err(p + "_prenom")} value={form[p + "_prenom"]} onChange={(v) => setField(p + "_prenom", v)} />
            <div className="form-group">
              <label>{"Statut *"}</label>
              <select value={form[p + "_statut"]} data-champ={p + "_statut"} style={err(p + "_statut") ? STYLE_ERREUR : undefined} onChange={(e) => setField(p + "_statut", e.target.value)}>
                <option value="">--</option>
                <option value="vivant">{fem ? "Vivante" : "Vivant"}</option>
                <option value="decede">{fem ? "Décédée" : "Décédé"}</option>
              </select>
            </div>
          </div>
          <div className="form-row">
            <Champ label="Occupation" nom={p + "_occupation"} requis erreur={err(p + "_occupation")} value={form[p + "_occupation"]} onChange={(v) => setField(p + "_occupation", v)} />
            <Champ label="NIF/NINU" nom={p + "_nif"} value={form[p + "_nif"]} onChange={(v) => setField(p + "_nif", v)} />
            <Telephone label={"Téléphone"} nom={p + "_telephone"} erreur={err(p + "_telephone")} value={form[p + "_telephone"]} onChange={(v) => setField(p + "_telephone", v)} />
          </div>
        </>
      )}
    </div>
  );
}

export default function Inscriptions() {
  const { token, user } = useAuth();
  const { currentYear } = useYear();
  const listes = useListesReference();
  const can = () => true;
  const [inscriptions, setInscriptions] = useState([]);
  const [classesSouhaitees, setClassesSouhaitees] = useState([]);
  const [ordre, setOrdre] = useState([]);
  const [nomsClasses, setNomsClasses] = useState([]);
  const [filtre, setFiltre] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");
  const [erreurs, setErreurs] = useState([]);
  const [info, setInfo] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(FORM_VIDE);
  const [lienSaisie, setLienSaisie] = useState(false);
  const [detailOuvert, setDetailOuvert] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const [ecolesOuvert, setEcolesOuvert] = useState(false);
  const [busy, setBusy] = useState(false);
  const modalRef = useRef(null);

  const chargerClasses = async (supabase) => {
    const { data: cls } = await supabase.from("classes").select("id, nom, section_uuid").eq("academic_year_uuid", currentYear.id).is("deleted_at", null).order("nom");
    const { data: secs } = await supabase.from("sections").select("id, nom");
    const secMap = Object.fromEntries((secs || []).map((x) => [x.id, x.nom]));
    return (await trierClasses(supabase, cls || [])).map((c) => ({ id: c.id, nom: c.nom, section_nom: secMap[c.section_uuid] || "" }));
  };

  const loadInscriptions = async () => {
    if (!currentYear) { setInscriptions([]); return; }
    try {
      const supabase = getAuthedClient(token);
      const { data, error: e } = await supabase.from("inscriptions").select("*").eq("academic_year_uuid", currentYear.id).is("deleted_at", null).order("created_at", { ascending: false });
      if (e) throw e;
      const cls = await chargerClasses(supabase);
      const nomCl = Object.fromEntries(cls.map((c) => [c.id, c.nom]));
      setClassesSouhaitees(cls);
      setInscriptions((data || []).map((i) => ({ ...i, classe_souhaitee_nom: nomCl[i.classe_souhaitee_uuid] || "" })));
    } catch (e) {
      setError("Impossible de charger les inscriptions");
    }
  };

  useEffect(() => { loadInscriptions(); }, [currentYear]);
  useEffect(() => {
    let actif = true;
    const supabase = getAuthedClient(token);
    chargerOrdreClasses(supabase).then((o) => { if (actif) setOrdre(o); });
    chargerNomsClasses(supabase).then((n) => { if (actif) setNomsClasses(n); });
    return () => { actif = false; };
  }, [token]);

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setFields = (o) => setForm((f) => ({ ...f, ...o }));
  const err = (champ) => erreurs.some((x) => x.champ === champ);

  const openModal = () => { setForm(FORM_VIDE); setEditingId(null); setErreurs([]); setLienSaisie(false); setError(""); setModalOpen(true); };

  const ouvrirModification = async (id) => {
    setError(""); setInfo("");
    try {
      const supabase = getAuthedClient(token);
      const { data: d, error: e } = await supabase.from("inscriptions").select("*").eq("id", id).single();
      if (e) throw e;
      if (d.statut_inscription !== "en_attente_examen") { setError("Seul un candidat en attente d'examen peut être modifié."); return; }
      setForm(depuisBaseInscription(d));
      setEditingId(id); setErreurs([]); setLienSaisie(false); setModalOpen(true);
    } catch (e) {
      setError("Impossible d'ouvrir ce candidat");
    }
  };

  // Classe precedente choisie : la classe souhaitee se remplit avec la suivante (modifiable, jamais plus basse)
  const choisirPrecedente = (v) => setForm((f) => {
    const g = { ...f, classe_precedente: v };
    const p = classeProposee(classesSouhaitees, ordre, v);
    if (p) g.classe_souhaitee_uuid = p.id;
    else {
      const c = classesSouhaitees.find((x) => x.id === f.classe_souhaitee_uuid);
      if (c && plusBasseQue(ordre, c.nom, v)) g.classe_souhaitee_uuid = "";
    }
    return g;
  });

  // Lien de parente = Mere ou Pere : les champs encore vides de la personne responsable se remplissent avec ses informations
  const choisirLien = (lien) => setForm((f) => {
    const g = { ...f, responsable_lien: lien };
    const p = lien === "Mère" ? "mere" : lien === "Père" ? "pere" : "";
    if (p && f[p === "mere" ? "mere_connue" : "pere_connu"]) {
      const reprise = { responsable_nom: f[p + "_nom"], responsable_prenom: f[p + "_prenom"], responsable_occupation: f[p + "_occupation"], responsable_nif: f[p + "_nif"], responsable_telephone: f[p + "_telephone"] };
      for (const k of Object.keys(reprise)) if (!String(f[k] || "").trim() && reprise[k]) g[k] = reprise[k];
    }
    return g;
  });

  const submit = async () => {
    setError(""); setInfo("");
    const liste = erreursInscription(form, { ordre, classes: classesSouhaitees });
    if (liste.length) {
      setErreurs(liste);
      if (modalRef.current) modalRef.current.scrollTop = 0;
      return;
    }
    setErreurs([]);
    setSaving(true);
    try {
      const supabase = getAuthedClient(token);
      const donnees = versBaseInscription(form);
      if (editingId) {
        const { error: e } = await supabase.from("inscriptions").update({ ...donnees, modified_by: user ? user.username : null }).eq("id", editingId).eq("statut_inscription", "en_attente_examen");
        if (e) { setError(colonneAbsente(e) ? MESSAGE_SQL : (e.message || "Erreur")); setSaving(false); if (modalRef.current) modalRef.current.scrollTop = 0; return; }
        setInfo("Le candidat " + form.prenom + " " + form.nom + " a été mis à jour.");
      } else {
        const dblMsg = await verifierEleve(supabase, form.nom, form.prenom, currentYear ? currentYear.id : null);
        if (dblMsg && !(await demanderDoublon(dblMsg))) { setSaving(false); return; }
        const { error: e } = await supabase.from("inscriptions").insert({
          ...donnees,
          academic_year_uuid: currentYear.id,
          statut_inscription: "en_attente_examen",
          modified_by: user ? user.username : null
        });
        if (e) { setError(colonneAbsente(e) ? MESSAGE_SQL : (e.message || "Erreur")); setSaving(false); if (modalRef.current) modalRef.current.scrollTop = 0; return; }
      }
      setModalOpen(false);
      await loadInscriptions();
    } catch (e) {
      setError(e.message || "Impossible d'enregistrer");
      if (modalRef.current) modalRef.current.scrollTop = 0;
    }
    setSaving(false);
  };

  // Admettre : la fiche doit permettre l'identifiant normal (date, sexe, departement) ; sinon on la complete d'abord (Modifier)
  const demanderAction = (i, action) => {
    setError(""); setInfo("");
    if (action === "admettre") {
      const d = debutIdentifiant(i);
      if (!d.complet) { setError("Fiche incomplète : il manque " + d.manque.join(", ") + ". Clique sur « Modifier » pour la compléter avant d'admettre " + i.prenom + " " + i.nom + "."); return; }
    }
    setConfirmAction({ inscription: i, action });
  };

  const executerAction = async () => {
    if (!confirmAction) return;
    const { inscription, action } = confirmAction;
    setBusy(true); setError(""); setInfo("");
    try {
      const supabase = getAuthedClient(token);
      const modifiePar = user ? user.username : null;
      if (action === "refuser") {
        await refuserInscription(supabase, inscription.id, modifiePar);
      } else {
        const { student, provisoire } = await admettreInscription(supabase, inscription.id, modifiePar);
        setInfo(inscription.prenom + " " + inscription.nom + " est maintenant élève (identifiant " + student.matricule + (provisoire ? ", provisoire : le script SQL n'est pas installé" : "") + "). Assignez-le à une classe dans le module Assignations.");
      }
    } catch (e) {
      setError(colonneAbsente(e) || installationIncomplete(e) ? MESSAGE_SQL : (e.message || "Erreur"));
    }
    setBusy(false);
    setConfirmAction(null);
    await loadInscriptions();
  };

  const ouvrirDetail = async (id) => {
    setDetailOuvert({ chargement: true });
    try {
      const supabase = getAuthedClient(token);
      const { data: d, error: e } = await supabase.from("inscriptions").select("*").eq("id", id).single();
      if (e) { setError(e.message || "Erreur"); setDetailOuvert(null); return; }
      const cl = classesSouhaitees.find((c) => c.id === d.classe_souhaitee_uuid);
      setDetailOuvert({ ...d, classe_souhaitee_nom: cl ? cl.nom : "" });
    } catch (e) {
      setError("Impossible de charger le détail");
      setDetailOuvert(null);
    }
  };

  const badge = (statut) => {
    const b = BADGES[statut] || { txt: statut, cls: "badge-gray" };
    return <span className={"badge " + b.cls}>{b.txt}</span>;
  };

  if (!currentYear) {
    return (
      <div className="page">
        <div className="dash-placeholder">
          <p>{"Aucune année académique active. Créez-en une et activez-la avant de commencer les inscriptions."}</p>
        </div>
      </div>
    );
  }

  const visibles = filtre ? inscriptions.filter((i) => i.statut_inscription === filtre) : inscriptions;
  const permises = classesPermises(classesSouhaitees, ordre, form.classe_precedente);
  const optionsSouhaitees = form.classe_souhaitee_uuid && !permises.some((c) => c.id === form.classe_souhaitee_uuid)
    ? permises.concat(classesSouhaitees.filter((c) => c.id === form.classe_souhaitee_uuid)) : permises;
  const aideClasse = aideClasseSouhaitee(classesSouhaitees, ordre, form.classe_precedente);
  const lienConnu = LIENS_PARENTE.includes(form.responsable_lien);
  const lienAutre = lienSaisie || (form.responsable_lien !== "" && !lienConnu);
  const manquants = erreurs.filter((x) => x.type === "manque");
  const invalides = erreurs.filter((x) => x.type === "invalide");

  return (
    <div className="page">
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 className="page-title">Inscription</h1>
          <p className="page-subtitle">{inscriptions.length + " candidat(s) pour " + currentYear.nom}</p>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <select value={filtre} onChange={(e) => setFiltre(e.target.value)}>
            <option value="">Tous les statuts</option>
            <option value="en_attente_examen">{"En attente d'examen"}</option>
            <option value="admis">Admis</option>
            <option value="refuse">{"Refusés"}</option>
          </select>
          <button className="btn-gray-cancel" onClick={() => setEcolesOuvert(true)} data-action="ecoles-precedentes">{"Écoles précédentes"}</button>
          {can("inscriptions", "creer") && <button className="btn-primary" onClick={openModal}>{"+ Nouveau candidat"}</button>}
        </div>
      </div>

      {error && !modalOpen && <div className="login-error" style={{ marginBottom: "14px" }} data-erreur="page">{error}</div>}
      {info && <div data-info style={{ background: "#e6f4ea", color: "#1e6b34", padding: "10px 14px", borderRadius: "8px", marginBottom: "14px" }}>{info}</div>}

      <div className="table-card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Nom complet</th>
              <th>Genre</th>
              <th>{"Père / Mère"}</th>
              <th>{"Téléphone"}</th>
              <th>Classe souhait&eacute;e</th>
              <th>Statut</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibles.length === 0 && (
              <tr><td colSpan="7" className="table-empty">{"Aucune inscription."}</td></tr>
            )}
            {visibles.map((i) => {
              const d = debutIdentifiant(i);
              return (
                <tr key={i.id}>
                  <td>
                    <strong>{i.prenom} {i.nom}</strong>
                    {i.statut_inscription === "en_attente_examen" && !d.complet && <div data-a-completer style={{ fontSize: "11.5px", color: "#92400e" }}>{"À compléter : " + d.manque.join(", ")}</div>}
                  </td>
                  <td>{i.sexe === "M" ? "Masculin" : i.sexe === "F" ? "Féminin" : "-"}</td>
                  <td>{[i.pere_nom, i.mere_nom].filter(Boolean).join(" / ") || "-"}</td>
                  <td>{afficherTelephone(i.responsable_telephone || i.pere_telephone || i.mere_telephone || i.telephone) || "-"}</td>
                  <td>{i.classe_souhaitee_nom || "-"}</td>
                  <td>{badge(i.statut_inscription)}</td>
                  <td>
                    <div className="table-actions">
                      <button className="btn-sm btn-gray-cancel" onClick={() => ouvrirDetail(i.id)}>{"Détails"}</button>
                      {i.statut_inscription === "en_attente_examen" && can("inscriptions", "modifier") && (
                        <>
                          <button className="btn-sm btn-gray-cancel" onClick={() => ouvrirModification(i.id)}>Modifier</button>
                          <button className="btn-sm btn-green" onClick={() => demanderAction(i, "admettre")}>Admettre</button>
                          <button className="btn-sm btn-red" onClick={() => demanderAction(i, "refuser")}>Refuser</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal-card modal-large" ref={modalRef} onClick={(e) => e.stopPropagation()} style={{ maxHeight: "85vh", overflowY: "auto" }} data-fenetre="candidat">
            <div className="modal-header">
              <h3>{editingId ? "Modifier le candidat" : "Nouveau candidat"}</h3>
              <button className="modal-close" onClick={() => setModalOpen(false)}>x</button>
            </div>
            {error && <div className="login-error" style={{ marginBottom: "16px" }} data-erreur="formulaire">{error}</div>}
            {manquants.length > 0 && (
              <div className="login-error" style={{ marginBottom: "16px" }} data-erreur="manquants">
                {"Champs obligatoires manquants : " + manquants.map((x) => x.message).join(" ; ") + "."}
              </div>
            )}
            {invalides.length > 0 && (
              <div className="login-error" style={{ marginBottom: "16px" }} data-erreur="invalides">{invalides.map((x) => x.message).join(" ; ") + "."}</div>
            )}

            <IdentifiantCandidat e={form} />

            <h4 style={{ marginBottom: "10px" }}>{"Informations personnelles"}</h4>
            <div className="form-row">
              <Champ label={"Prénom"} nom="prenom" requis erreur={err("prenom")} value={form.prenom} onChange={(v) => setField("prenom", v)} />
              <Champ label="Nom" nom="nom" requis erreur={err("nom")} value={form.nom} onChange={(v) => setField("nom", v)} />
            </div>
            <div className="form-row">
              <Champ label="Date de naissance" type="date" nom="date_naissance" requis erreur={err("date_naissance")} value={form.date_naissance} onChange={(v) => setField("date_naissance", v)} />
              <div className="form-group">
                <label>Genre *</label>
                <select value={form.sexe} data-champ="sexe" style={err("sexe") ? STYLE_ERREUR : undefined} onChange={(e) => setField("sexe", e.target.value)}>
                  <option value="">{"Sélectionner le genre"}</option>
                  <option value="M">Masculin</option>
                  <option value="F">{"Féminin"}</option>
                </select>
              </div>
              <Champ label={"Nationalité"} nom="nationalite" value={form.nationalite} onChange={(v) => setField("nationalite", v)} />
            </div>
            <LieuNaissance form={form} setFields={setFields} listes={listes} requis />
            <Champ label="Adresse" nom="adresse" value={form.adresse} onChange={(v) => setField("adresse", v)} />
            <div className="form-row">
              <div className="form-group">
                <label>{"Y a-t-il un handicap ? *"}</label>
                <select value={form.a_handicap} data-champ="a_handicap" style={err("a_handicap") ? STYLE_ERREUR : undefined}
                  onChange={(e) => setFields({ a_handicap: e.target.value, ...(e.target.value !== "oui" ? { handicap_besoins: "" } : {}) })}>
                  <option value="">Choisir...</option>
                  <option value="non">Non</option>
                  <option value="oui">Oui</option>
                </select>
              </div>
              {form.a_handicap === "oui" && <Champ label="Quel type de handicap ?" nom="handicap_besoins" requis erreur={err("handicap_besoins")} value={form.handicap_besoins} onChange={(v) => setField("handicap_besoins", v)} />}
            </div>
            <div className="form-row">
              <Champ label={"Numéro d'ordre"} nom="numero_ordre" value={form.numero_ordre} onChange={(v) => setField("numero_ordre", v)} />
              <Champ label={"Numéro identifiant"} nom="numero_identifiant" value={form.numero_identifiant} onChange={(v) => setField("numero_identifiant", v)} />
              <Champ label="NISU" nom="nisu" value={form.nisu} onChange={(v) => setField("nisu", v)} />
            </div>
            <div className="form-row">
              <Telephone label={"Téléphone de l'élève"} nom="telephone" erreur={err("telephone")} value={form.telephone} onChange={(v) => setField("telephone", v)} />
              <Champ label="Email" type="email" nom="email" erreur={err("email")} value={form.email} onChange={(v) => setField("email", v)} />
            </div>
            <div className="form-row">
              <ChoixListe label={"Religion"} nomChamp="congregation_religieuse" valeur={form.congregation_religieuse}
                options={fusionnerListe([], listes.valeurs("religion", ""), form.congregation_religieuse)}
                vide="Choisir la religion..." libelleAjout="Autre religion (ajouter)..."
                onChange={(v) => setField("congregation_religieuse", v)} onAjouter={(t) => listes.ajouter("religion", "", t, [])}
                aide={listes.chargee && listes.valeurs("religion", "").length === 0 ? "Aucune religion enregistrée : ajoute la première avec « Autre »." : ""} />
              <Champ label="Rang dans la famille" nom="rang_famille" value={form.rang_famille} onChange={(v) => setField("rang_famille", v)} />
            </div>

            <BlocParent p="mere" fem form={form} setField={setField} err={err} />
            <BlocParent p="pere" form={form} setField={setField} err={err} />

            <h4 style={{ margin: "20px 0 10px" }}>{"Personne responsable"}</h4>
            <div className="form-row">
              <div className="form-group">
                <label>{"Lien de parenté *"}</label>
                {!lienAutre ? (
                  <select value={form.responsable_lien} data-champ="responsable_lien" style={err("responsable_lien") ? STYLE_ERREUR : undefined}
                    onChange={(e) => { if (e.target.value === "__autre__") { setLienSaisie(true); setField("responsable_lien", ""); } else choisirLien(e.target.value); }}>
                    <option value="">Choisir...</option>
                    {LIENS_PARENTE.map((l) => <option key={l} value={l}>{l}</option>)}
                    <option value="__autre__">{"+ Autre (préciser)..."}</option>
                  </select>
                ) : (
                  <div style={{ display: "flex", gap: "6px" }}>
                    <input autoFocus value={form.responsable_lien} data-champ="responsable_lien-saisie" style={err("responsable_lien") ? STYLE_ERREUR : undefined} placeholder="Ex. Voisine, Marraine..." onChange={(e) => setField("responsable_lien", e.target.value)} />
                    <button type="button" className="btn-gray-cancel btn-sm" onClick={() => { setLienSaisie(false); if (!lienConnu) setField("responsable_lien", ""); }}>Liste</button>
                  </div>
                )}
              </div>
            </div>
            <div className="form-row">
              <Champ label="Nom" nom="responsable_nom" requis erreur={err("responsable_nom")} value={form.responsable_nom} onChange={(v) => setField("responsable_nom", v)} />
              <Champ label={"Prénom"} nom="responsable_prenom" requis erreur={err("responsable_prenom")} value={form.responsable_prenom} onChange={(v) => setField("responsable_prenom", v)} />
              <Champ label="Occupation" nom="responsable_occupation" value={form.responsable_occupation} onChange={(v) => setField("responsable_occupation", v)} />
            </div>
            <div className="form-row">
              <Champ label="NIF" nom="responsable_nif" erreur={err("responsable_nif")} value={form.responsable_nif} onChange={(v) => setField("responsable_nif", v)} />
              <Champ label="NINU" nom="responsable_ninu" erreur={err("responsable_nif")} value={form.responsable_ninu} onChange={(v) => setField("responsable_ninu", v)} />
            </div>
            <div style={{ color: "var(--text-dim)", fontSize: "11.5px", margin: "-6px 0 10px" }}>{"NIF ou NINU : un des deux suffit (* obligatoire)."}</div>
            <div className="form-row">
              <Champ label="Email" type="email" nom="responsable_email" erreur={err("responsable_email")} value={form.responsable_email} onChange={(v) => setField("responsable_email", v)} />
              <Telephone label={"Téléphone"} nom="responsable_telephone" requis erreur={err("responsable_telephone")} value={form.responsable_telephone} onChange={(v) => setField("responsable_telephone", v)} />
              <Telephone label={"Téléphone additionnel"} nom="responsable_telephone2" erreur={err("responsable_telephone2")} value={form.responsable_telephone2} onChange={(v) => setField("responsable_telephone2", v)} />
            </div>

            <h4 style={{ margin: "20px 0 10px" }}>{"Contact d'urgence"}</h4>
            <div className="form-row">
              <Telephone label={"Téléphone d'urgence"} nom="urgence_telephone" erreur={err("urgence_telephone")} value={form.urgence_telephone} onChange={(v) => setField("urgence_telephone", v)} />
              <Champ label={"Lien de parenté"} nom="urgence_lien" value={form.urgence_lien} onChange={(v) => setField("urgence_lien", v)} />
            </div>

            <h4 style={{ margin: "20px 0 10px" }}>{"Scolarité"}</h4>
            <div className="form-row">
              <ChoixListe label={"École précédente"} nomChamp="ecole_precedente" valeur={form.ecole_precedente}
                options={fusionnerListe([], listes.valeurs("ecole", ""), form.ecole_precedente)}
                vide="Choisir l'école..." libelleAjout="Autre école (ajouter)..."
                onChange={(v) => setField("ecole_precedente", v)} onAjouter={(t) => listes.ajouter("ecole", "", t, [])} />
              <ClassePrecedente valeur={form.classe_precedente} noms={nomsClasses} onChange={choisirPrecedente} />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>{"Classe souhaitée *"}</label>
                <select value={form.classe_souhaitee_uuid} data-champ="classe_souhaitee_uuid" style={err("classe_souhaitee_uuid") ? STYLE_ERREUR : undefined} onChange={(e) => setField("classe_souhaitee_uuid", e.target.value)}>
                  <option value="">{"Sélectionner une classe"}</option>
                  {optionsSouhaitees.map((c) => <option key={c.id} value={c.id}>{c.nom + (c.section_nom ? " (" + c.section_nom + ")" : "")}</option>)}
                </select>
                {aideClasse && <div data-aide-classe style={{ color: "var(--text-dim)", fontSize: "11.5px", marginTop: "4px" }}>{aideClasse}</div>}
              </div>
              <div className="form-group">
                <label>{"Année académique"}</label>
                <input value={currentYear.nom} disabled />
              </div>
            </div>

            <h4 style={{ margin: "20px 0 10px" }}>{"Divers"}</h4>
            <div className="form-group" style={{ marginBottom: "20px" }}>
              <label>Notes</label>
              <textarea value={form.remarques} data-champ="remarques" onChange={(e) => setField("remarques", e.target.value)} rows="2" className="modal-textarea" />
            </div>

            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setModalOpen(false)}>Annuler</button>
              <button className="btn-primary" onClick={submit} disabled={saving}>
                {saving ? "Enregistrement..." : editingId ? "Enregistrer" : "Créer l'inscription"}
              </button>
            </div>
          </div>
        </div>
      )}

      {detailOuvert && (
        <div className="modal-overlay" onClick={() => setDetailOuvert(null)}>
          <div className="modal-card modal-large" onClick={(e) => e.stopPropagation()} style={{ maxHeight: "85vh", overflowY: "auto" }}>
            <div className="modal-header">
              <h3>{"Détails du candidat"}</h3>
              <button className="modal-close" onClick={() => setDetailOuvert(null)}>x</button>
            </div>
            {detailOuvert.chargement && <p>Chargement...</p>}
            {!detailOuvert.chargement && (
              <>
                <h4>{detailOuvert.prenom + " " + detailOuvert.nom}</h4>
                <p style={{ color: "var(--text-dim)" }}>
                  {[
                    detailOuvert.date_naissance && ("Né(e) le " + detailOuvert.date_naissance),
                    detailOuvert.lieu_naissance && ("à " + detailOuvert.lieu_naissance),
                    detailOuvert.sexe === "M" ? "Masculin" : detailOuvert.sexe === "F" ? "Féminin" : null,
                    detailOuvert.nationalite
                  ].filter(Boolean).join(" - ") || "-"}
                </p>
                <IdentifiantCandidat e={detailOuvert} />
                {blocsDetail(detailOuvert).map(([titre, lignes]) => (
                  <div key={titre}>
                    <h4>{titre}</h4>
                    <table className="data-table" style={{ marginBottom: "16px" }}>
                      <tbody>
                        {lignes.map(([label, val]) => (
                          <tr key={label}><td><strong>{label}</strong></td><td>{val || "-"}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}

      {ecolesOuvert && <EcolesPrecedentes onClose={() => setEcolesOuvert(false)} inscriptions={inscriptions} anneeNom={currentYear.nom} listes={listes} />}

      {confirmAction && (
        <div className="modal-overlay" style={{ zIndex: 10000 }} onClick={() => !busy && setConfirmAction(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "440px", textAlign: "center" }}>
            <h3 style={{ color: "var(--navy)", marginBottom: "12px" }}>
              {confirmAction.action === "admettre" ? "Admettre ce candidat ?" : "Refuser ce candidat ?"}
            </h3>
            <p style={{ marginBottom: "20px" }}>
              {confirmAction.action === "admettre"
                ? confirmAction.inscription.prenom + " " + confirmAction.inscription.nom + " sera créé comme élève avec son identifiant (" + debutIdentifiant(confirmAction.inscription).debut + "•••••) et pourra être assigné à une classe."
                : confirmAction.inscription.prenom + " " + confirmAction.inscription.nom + " sera marqué comme refusé."}
            </p>
            <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setConfirmAction(null)} disabled={busy}>Annuler</button>
              <button className="btn-primary" onClick={executerAction} disabled={busy}>{busy ? "Traitement..." : "Confirmer"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
