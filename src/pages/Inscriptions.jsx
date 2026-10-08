import React, { useState, useEffect } from "react";
import { useAuth } from "../AuthContext.jsx";
import { getAuthedClient } from "../supabaseClient.js";
import { useYear } from "../YearContext.jsx";

function genererMatricule(nom, prenom, seq) {
  const normalize = (str) => (str || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z]/g, "").toUpperCase();
  let baseNom = normalize(nom).substring(0, 3);
  while (baseNom.length < 3) baseNom += "X";
  const baseP = normalize(prenom).substring(0, 1) || "X";
  return baseNom + baseP + "-" + String(seq).padStart(4, "0");
}

const CLES_ELEVE = ["nom", "prenom", "sexe", "adresse", "telephone", "email", "lieu_naissance", "nationalite", "numero_ordre", "numero_identifiant", "nisu", "congregation_religieuse", "rang_famille", "pere_nom", "pere_prenom", "pere_statut", "pere_occupation", "pere_nif", "pere_telephone", "mere_nom", "mere_prenom", "mere_statut", "mere_occupation", "mere_nif", "mere_telephone", "responsable_nom", "responsable_prenom", "responsable_occupation", "responsable_nif", "responsable_telephone", "urgence_telephone", "urgence_lien", "ecole_precedente", "classe_precedente", "remarques"];

const VIDE_FORM = {
  nom: "", prenom: "", date_naissance: "", lieu_naissance: "", sexe: "", nationalite: "",
  adresse: "", numero_ordre: "", numero_identifiant: "", nisu: "", telephone: "", email: "",
  congregation_religieuse: "", rang_famille: "",
  pere_nom: "", pere_prenom: "", pere_statut: "", pere_occupation: "", pere_nif: "", pere_telephone: "",
  mere_nom: "", mere_prenom: "", mere_statut: "", mere_occupation: "", mere_nif: "", mere_telephone: "",
  responsable_nom: "", responsable_prenom: "", responsable_occupation: "", responsable_nif: "", responsable_telephone: "",
  urgence_telephone: "", urgence_lien: "",
  ecole_precedente: "", classe_precedente: "", classe_souhaitee_uuid: "", remarques: ""
};

const BADGES = {
  en_attente_examen: { txt: "En attente d'examen", cls: "badge-gold" },
  admis: { txt: "Admis", cls: "badge-ok" },
  refuse: { txt: "Refusé", cls: "badge-err" }
};

const statutParent = (v, fem) => v === "vivant" ? (fem ? "Vivante" : "Vivant") : v === "decede" ? (fem ? "Décédée" : "Décédé") : "-";
const nomComplet = (p, n) => [p, n].filter(Boolean).join(" ") || "-";

function blocsDetail(d) {
  const blocs = [
    ["Informations générales", [
      ["Adresse", d.adresse], ["Téléphone", d.telephone], ["Email", d.email],
      ["Numéro d'ordre", d.numero_ordre], ["Numéro identifiant", d.numero_identifiant], ["NISU", d.nisu],
      ["Congrégation religieuse", d.congregation_religieuse], ["Rang dans la famille", d.rang_famille]
    ]],
    ["Père", [
      ["Nom complet", nomComplet(d.pere_prenom, d.pere_nom)], ["Statut", statutParent(d.pere_statut, false)],
      ["Occupation", d.pere_occupation], ["NIF/NINU", d.pere_nif], ["Téléphone", d.pere_telephone]
    ]],
    ["Mère", [
      ["Nom complet", nomComplet(d.mere_prenom, d.mere_nom)], ["Statut", statutParent(d.mere_statut, true)],
      ["Occupation", d.mere_occupation], ["NIF/NINU", d.mere_nif], ["Téléphone", d.mere_telephone]
    ]]
  ];
  if (d.responsable_nom || d.responsable_prenom) {
    blocs.push(["Responsable", [
      ["Nom complet", nomComplet(d.responsable_prenom, d.responsable_nom)], ["Occupation", d.responsable_occupation],
      ["NIF/NINU", d.responsable_nif], ["Téléphone", d.responsable_telephone]
    ]]);
  }
  blocs.push(["Urgence et scolarité", [
    ["Téléphone d'urgence", d.urgence_telephone], ["Lien de parenté", d.urgence_lien],
    ["École précédente", d.ecole_precedente], ["Classe précédente", d.classe_precedente],
    ["Classe souhaitée", d.classe_souhaitee_nom]
  ]]);
  blocs.push(["Divers", [["Notes", d.remarques]]]);
  return blocs;
}

function ChoixClassePrecedente({ value, onChange, classes }) {
  const noms = [...new Set(classes.map((c) => c.nom))];
  const [forceAutre, setForceAutre] = useState(false);
  const modeAutre = forceAutre || (value !== "" && !noms.includes(value));
  return (
    <div className="form-group">
      <label>{"Classe précédente"}</label>
      <select value={modeAutre ? "__autre__" : value} onChange={(e) => {
        if (e.target.value === "__autre__") { setForceAutre(true); onChange(""); }
        else { setForceAutre(false); onChange(e.target.value); }
      }}>
        <option value="">{"Sélectionner une classe"}</option>
        {noms.map((n) => <option key={n} value={n}>{n}</option>)}
        <option value="__autre__">{"Autre (saisir)..."}</option>
      </select>
      {modeAutre && <input style={{ marginTop: "6px" }} placeholder={"Écrire la classe précédente"} value={value} onChange={(e) => onChange(e.target.value)} />}
    </div>
  );
}
function Champ({ label, value, onChange, type }) {
  return (
    <div className="form-group">
      <label>{label}</label>
      <input type={type || "text"} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export default function Inscriptions() {
  const { token, user } = useAuth();
  const { currentYear } = useYear();
  const can = () => true;
  const [inscriptions, setInscriptions] = useState([]);
  const [classesSouhaitees, setClassesSouhaitees] = useState([]);
  const [filtre, setFiltre] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(VIDE_FORM);
  const [detailOuvert, setDetailOuvert] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const [busy, setBusy] = useState(false);

  const chargerClasses = async (supabase) => {
    const { data: cls } = await supabase.from("classes").select("id, nom, section_uuid").eq("academic_year_uuid", currentYear.id).is("deleted_at", null).order("nom");
    const { data: secs } = await supabase.from("sections").select("id, nom");
    const secMap = Object.fromEntries((secs || []).map((x) => [x.id, x.nom]));
    return (cls || []).map((c) => ({ id: c.id, nom: c.nom, section_nom: secMap[c.section_uuid] || "" }));
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

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const openModal = () => { setForm(VIDE_FORM); setError(""); setModalOpen(true); };

  const submit = async () => {
    setError("");
    if (!form.nom.trim() || !form.prenom.trim()) { setError("Le nom et le prénom sont requis"); return; }
    setSaving(true);
    try {
      const supabase = getAuthedClient(token);
      const { classe_souhaitee_uuid, date_naissance, ...reste } = form;
      const { error: e } = await supabase.from("inscriptions").insert({
        ...reste,
        date_naissance: date_naissance || null,
        classe_souhaitee_uuid: classe_souhaitee_uuid || null,
        academic_year_uuid: currentYear.id,
        statut_inscription: "en_attente_examen",
        modified_by: user ? user.username : null
      });
      if (e) { setError(e.message || "Erreur"); setSaving(false); return; }
      setModalOpen(false);
      await loadInscriptions();
    } catch (e) {
      setError(e.message || "Impossible d'enregistrer");
    }
    setSaving(false);
  };

  const executerAction = async () => {
    if (!confirmAction) return;
    const { inscription, action } = confirmAction;
    setBusy(true); setError(""); setInfo("");
    try {
      const supabase = getAuthedClient(token);
      const modifiePar = user ? user.username : null;
      if (action === "refuser") {
        const { error: e } = await supabase.from("inscriptions").update({ statut_inscription: "refuse", modified_by: modifiePar }).eq("id", inscription.id).eq("statut_inscription", "en_attente_examen");
        if (e) throw e;
      } else {
        const { data: ins, error: e0 } = await supabase.from("inscriptions").select("*").eq("id", inscription.id).single();
        if (e0) throw e0;
        if (ins.statut_inscription !== "en_attente_examen") throw new Error("Cette inscription a déjà été traitée");
        const { data: seq, error: eSeq } = await supabase.rpc("next_eleve_seq");
        if (eSeq) throw eSeq;
        const matricule = genererMatricule(ins.nom, ins.prenom, seq);
        const nomParent = [ins.responsable_prenom, ins.responsable_nom].filter(Boolean).join(" ") || [ins.pere_prenom, ins.pere_nom].filter(Boolean).join(" ") || [ins.mere_prenom, ins.mere_nom].filter(Boolean).join(" ") || null;
        const telParent = ins.responsable_telephone || ins.pere_telephone || ins.mere_telephone || ins.urgence_telephone || null;
        const ligne = { matricule, statut: "actif", modified_by: modifiePar, date_naissance: ins.date_naissance || null, nom_parent: nomParent, telephone_parent: telParent };
        for (const k of CLES_ELEVE) ligne[k] = ins[k] || null;
        ligne.nom = ins.nom; ligne.prenom = ins.prenom;
        const { data: st, error: e1 } = await supabase.from("students").insert(ligne).select("id, matricule").single();
        if (e1) throw e1;
        const { error: e2 } = await supabase.from("inscriptions").update({ statut_inscription: "admis", student_uuid: st.id, modified_by: modifiePar }).eq("id", inscription.id);
        if (e2) throw e2;
        setInfo(inscription.prenom + " " + inscription.nom + " est maintenant élève (matricule " + st.matricule + "). Assignez-le à une classe dans le module Assignations.");
      }
    } catch (e) {
      setError(e.message || "Erreur");
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
          {can("inscriptions", "creer") && <button className="btn-primary" onClick={openModal}>{"+ Nouveau candidat"}</button>}
        </div>
      </div>

      {error && !modalOpen && <div className="login-error" style={{ marginBottom: "14px" }}>{error}</div>}
      {info && <div style={{ background: "#e6f4ea", color: "#1e6b34", padding: "10px 14px", borderRadius: "8px", marginBottom: "14px" }}>{info}</div>}

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
            {visibles.map((i) => (
              <tr key={i.id}>
                <td><strong>{i.prenom} {i.nom}</strong></td>
                <td>{i.sexe === "M" ? "Masculin" : i.sexe === "F" ? "Féminin" : "-"}</td>
                <td>{[i.pere_nom, i.mere_nom].filter(Boolean).join(" / ") || "-"}</td>
                <td>{i.responsable_telephone || i.pere_telephone || i.mere_telephone || i.telephone || "-"}</td>
                <td>{i.classe_souhaitee_nom || "-"}</td>
                <td>{badge(i.statut_inscription)}</td>
                <td>
                  <div className="table-actions">
                    <button className="btn-sm btn-gray-cancel" onClick={() => ouvrirDetail(i.id)}>{"Détails"}</button>
                    {i.statut_inscription === "en_attente_examen" && can("inscriptions", "modifier") && (
                      <>
                        <button className="btn-sm btn-green" onClick={() => setConfirmAction({ inscription: i, action: "admettre" })}>Admettre</button>
                        <button className="btn-sm btn-red" onClick={() => setConfirmAction({ inscription: i, action: "refuser" })}>Refuser</button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal-card modal-large" onClick={(e) => e.stopPropagation()} style={{ maxHeight: "85vh", overflowY: "auto" }}>
            <div className="modal-header">
              <h3>{"Nouveau candidat"}</h3>
              <button className="modal-close" onClick={() => setModalOpen(false)}>x</button>
            </div>
            {error && <div className="login-error" style={{ marginBottom: "16px" }}>{error}</div>}

            <h4 style={{ marginBottom: "10px" }}>{"Informations générales"}</h4>
            <div className="form-row">
              <Champ label={"Prénom *"} value={form.prenom} onChange={(v) => setField("prenom", v)} />
              <Champ label="Nom *" value={form.nom} onChange={(v) => setField("nom", v)} />
            </div>
            <div className="form-row">
              <Champ label="Date de naissance" type="date" value={form.date_naissance} onChange={(v) => setField("date_naissance", v)} />
              <Champ label="Lieu de naissance" value={form.lieu_naissance} onChange={(v) => setField("lieu_naissance", v)} />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Genre</label>
                <select value={form.sexe} onChange={(e) => setField("sexe", e.target.value)}>
                  <option value="">{"Sélectionner le genre"}</option>
                  <option value="M">Masculin</option>
                  <option value="F">{"Féminin"}</option>
                </select>
              </div>
              <Champ label={"Nationalité"} value={form.nationalite} onChange={(v) => setField("nationalite", v)} />
            </div>
            <Champ label="Adresse" value={form.adresse} onChange={(v) => setField("adresse", v)} />
            <div className="form-row">
              <Champ label={"Numéro d'ordre"} value={form.numero_ordre} onChange={(v) => setField("numero_ordre", v)} />
              <Champ label={"Numéro identifiant"} value={form.numero_identifiant} onChange={(v) => setField("numero_identifiant", v)} />
              <Champ label="NISU" value={form.nisu} onChange={(v) => setField("nisu", v)} />
            </div>
            <div className="form-row">
              <Champ label={"Téléphone"} value={form.telephone} onChange={(v) => setField("telephone", v)} />
              <Champ label="Email" type="email" value={form.email} onChange={(v) => setField("email", v)} />
            </div>
            <div className="form-row">
              <Champ label={"Congrégation religieuse"} value={form.congregation_religieuse} onChange={(v) => setField("congregation_religieuse", v)} />
              <Champ label="Rang dans la famille" value={form.rang_famille} onChange={(v) => setField("rang_famille", v)} />
            </div>

            <h4 style={{ margin: "20px 0 10px" }}>{"Père"}</h4>
            <div className="form-row">
              <Champ label="Nom" value={form.pere_nom} onChange={(v) => setField("pere_nom", v)} />
              <Champ label={"Prénom"} value={form.pere_prenom} onChange={(v) => setField("pere_prenom", v)} />
              <div className="form-group">
                <label>Statut</label>
                <select value={form.pere_statut} onChange={(e) => setField("pere_statut", e.target.value)}>
                  <option value="">--</option>
                  <option value="vivant">Vivant</option>
                  <option value="decede">{"Décédé"}</option>
                </select>
              </div>
            </div>
            <div className="form-row">
              <Champ label="Occupation" value={form.pere_occupation} onChange={(v) => setField("pere_occupation", v)} />
              <Champ label="NIF/NINU" value={form.pere_nif} onChange={(v) => setField("pere_nif", v)} />
              <Champ label={"Téléphone"} value={form.pere_telephone} onChange={(v) => setField("pere_telephone", v)} />
            </div>

            <h4 style={{ margin: "20px 0 10px" }}>{"Mère"}</h4>
            <div className="form-row">
              <Champ label="Nom" value={form.mere_nom} onChange={(v) => setField("mere_nom", v)} />
              <Champ label={"Prénom"} value={form.mere_prenom} onChange={(v) => setField("mere_prenom", v)} />
              <div className="form-group">
                <label>Statut</label>
                <select value={form.mere_statut} onChange={(e) => setField("mere_statut", e.target.value)}>
                  <option value="">--</option>
                  <option value="vivant">Vivante</option>
                  <option value="decede">{"Décédée"}</option>
                </select>
              </div>
            </div>
            <div className="form-row">
              <Champ label="Occupation" value={form.mere_occupation} onChange={(v) => setField("mere_occupation", v)} />
              <Champ label="NIF/NINU" value={form.mere_nif} onChange={(v) => setField("mere_nif", v)} />
              <Champ label={"Téléphone"} value={form.mere_telephone} onChange={(v) => setField("mere_telephone", v)} />
            </div>

            <h4 style={{ margin: "20px 0 10px" }}>{"Si le responsable est une autre personne"}</h4>
            <div className="form-row">
              <Champ label="Nom" value={form.responsable_nom} onChange={(v) => setField("responsable_nom", v)} />
              <Champ label={"Prénom"} value={form.responsable_prenom} onChange={(v) => setField("responsable_prenom", v)} />
            </div>
            <div className="form-row">
              <Champ label="Occupation" value={form.responsable_occupation} onChange={(v) => setField("responsable_occupation", v)} />
              <Champ label="NIF/NINU" value={form.responsable_nif} onChange={(v) => setField("responsable_nif", v)} />
              <Champ label={"Téléphone"} value={form.responsable_telephone} onChange={(v) => setField("responsable_telephone", v)} />
            </div>

            <h4 style={{ margin: "20px 0 10px" }}>{"Contact d'urgence"}</h4>
            <div className="form-row">
              <Champ label={"Téléphone d'urgence"} value={form.urgence_telephone} onChange={(v) => setField("urgence_telephone", v)} />
              <Champ label={"Lien de parenté"} value={form.urgence_lien} onChange={(v) => setField("urgence_lien", v)} />
            </div>

            <h4 style={{ margin: "20px 0 10px" }}>{"Scolarité"}</h4>
            <div className="form-row">
              <Champ label={"École précédente"} value={form.ecole_precedente} onChange={(v) => setField("ecole_precedente", v)} />
              <ChoixClassePrecedente value={form.classe_precedente} onChange={(v) => setField("classe_precedente", v)} classes={classesSouhaitees} />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>{"Classe souhaitée"}</label>
                <select value={form.classe_souhaitee_uuid} onChange={(e) => setField("classe_souhaitee_uuid", e.target.value)}>
                  <option value="">{"Sélectionner une classe"}</option>
                  {classesSouhaitees.map((c) => <option key={c.id} value={c.id}>{c.nom + (c.section_nom ? " (" + c.section_nom + ")" : "")}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>{"Année académique"}</label>
                <input value={currentYear.nom} disabled />
              </div>
            </div>

            <h4 style={{ margin: "20px 0 10px" }}>{"Divers"}</h4>
            <div className="form-group" style={{ marginBottom: "20px" }}>
              <label>Notes</label>
              <textarea value={form.remarques} onChange={(e) => setField("remarques", e.target.value)} rows="2" className="modal-textarea" />
            </div>

            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setModalOpen(false)}>Annuler</button>
              <button className="btn-primary" onClick={submit} disabled={saving}>
                {saving ? "Création..." : "Créer l'inscription"}
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

      {confirmAction && (
        <div className="modal-overlay" style={{ zIndex: 10000 }} onClick={() => !busy && setConfirmAction(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "440px", textAlign: "center" }}>
            <h3 style={{ color: "var(--navy)", marginBottom: "12px" }}>
              {confirmAction.action === "admettre" ? "Admettre ce candidat ?" : "Refuser ce candidat ?"}
            </h3>
            <p style={{ marginBottom: "20px" }}>
              {confirmAction.action === "admettre"
                ? confirmAction.inscription.prenom + " " + confirmAction.inscription.nom + " sera créé comme élève et pourra être assigné à une classe."
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
