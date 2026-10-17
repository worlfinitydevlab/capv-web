import React, { useState, useEffect, useRef } from "react";
import { useYear as useYear } from "../YearContext.jsx";
import { authPourAction, definirUtilisateur } from "../pedagogie/confirmAction.js";
import { usePontPedagogie } from "../pedagogie/pont.js";
import { Fenetre, PiedStandard, Confirmation, Bascule, BarreListe, EtatVide, Pastille, useEnvoi, sansAccent } from "../pedagogie/Fenetre.jsx";

// Catégorie par défaut portée par la matière elle-même (champ "Catégorie" de la fenêtre + colonne dans la liste).
// Mettre true seulement quand le serveur (bureau) et le pont (web) enregistrent subjects.category_id.
const AVEC_CATEGORIE_MATIERE = false;

const carte = { background: "var(--card-bg, rgba(255,255,255,0.04))", border: "1px solid var(--border, rgba(255,255,255,0.1))", borderRadius: "12px", padding: "18px 20px", marginBottom: "20px" };

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

export default function Matieres() {
  const user = usePontPedagogie();
  definirUtilisateur(user);
  const { currentYear: anneeCourante } = useYear();
  const [afficherPoids, setAfficherPoids] = useState(false);
  useEffect(() => {
    if (anneeCourante) api("/api/pedagogie/parametres?year=" + anneeCourante.id).then((p) => setAfficherPoids(p.mode_moyenne_generale === "moyenne_categories")).catch(() => {});
  }, [anneeCourante]);
  const [onglet, setOnglet] = useState("catalogue");
  const [matieres, setMatieres] = useState([]);
  const [enseignants, setEnseignants] = useState([]);
  const [categories, setCategories] = useState([]);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  // pret[x] devient vrai quand la liste a ete lue (evite d'afficher "aucune ..." pendant le chargement)
  const [pret, setPret] = useState({ matieres: false, enseignants: false, categories: false });
  const marquerPret = (k) => setPret((p) => (p[k] ? p : { ...p, [k]: true }));
  const chargerMatieres = async () => { try { setMatieres(await api("/api/matieres")); } catch (e) { setErr(e.message); } marquerPret("matieres"); };
  const chargerEnseignants = async () => { try { setEnseignants(await api("/api/enseignants")); } catch (e) { setErr(e.message); } marquerPret("enseignants"); };
  const chargerCategories = async () => { try { setCategories(await api("/api/categories-matieres")); } catch (e) { setErr(e.message); } marquerPret("categories"); };
  useEffect(() => { chargerMatieres(); chargerEnseignants(); chargerCategories(); }, []);

  // Le message de reussite s'efface tout seul
  useEffect(() => {
    if (!msg) return undefined;
    const t = setTimeout(() => setMsg(""), 8000);
    return () => clearTimeout(t);
  }, [msg]);

  const executer = async (fn, ok) => {
    setErr(""); setMsg("");
    try { await fn(); if (ok) setMsg(ok); } catch (e) { setErr(e.message); }
  };
  const notifier = (texte) => { setErr(""); setMsg(texte); };

  const onglets = [["catalogue", "Catalogue des matières"], ["categories", "Catégories"], ["classe", "Affectation par classe"], ["enseignants", "Enseignants"]];

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">{"Matières & Enseignants"}</h1>
          <p className="page-subtitle">{"Le catalogue des matières, les catégories, puis l'affectation de chaque matière à une classe (coefficient, catégorie et enseignant propres à la classe) et la liste des enseignants."}</p>
        </div>
      </div>
      <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
        {onglets.map(([k, t]) => (
          <button key={k} className={onglet === k ? "btn-primary" : "btn-gray-cancel"} onClick={() => { setOnglet(k); setErr(""); setMsg(""); }}>{t}</button>
        ))}
      </div>
      {err && <div className="login-error" style={{ marginBottom: "14px" }}>{err}</div>}
      {msg && <div style={{ ...carte, borderColor: "rgba(80,200,120,0.5)" }}>{msg}</div>}

      {onglet === "catalogue" && <Catalogue pret={pret.matieres && pret.categories} matieres={matieres} categories={categories} recharger={chargerMatieres} notifier={notifier} />}
      {onglet === "categories" && <Categories pret={pret.categories} afficherPoids={afficherPoids} categories={categories} recharger={async () => { await chargerCategories(); await chargerMatieres(); }} notifier={notifier} />}
      {onglet === "classe" && <ParClasse matieres={matieres} enseignants={enseignants} categories={categories} executer={executer} />}
      {onglet === "enseignants" && <Enseignants pret={pret.enseignants} enseignants={enseignants} recharger={chargerEnseignants} notifier={notifier} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MATIERES : la liste d'abord, un bouton pour ajouter, une fenetre pour saisir
// ---------------------------------------------------------------------------
function Catalogue({ pret, matieres, categories, recharger, notifier }) {
  const [fen, setFen] = useState(null); // { type: "creer" } | { type: "modifier", m } | { type: "supprimer", m }
  const [q, setQ] = useState("");
  const catNom = (id) => { const c = categories.find((x) => String(x.id) === String(id)); return c ? c.nom : ""; };
  const filtre = sansAccent(q.trim());
  const visibles = matieres.filter((m) => !filtre || sansAccent((m.nom || "") + " " + (m.code || "") + " " + (m.description || "") + " " + catNom(m.category_id)).includes(filtre));
  const ouvrirCreation = () => setFen({ type: "creer" });
  const fermer = () => setFen(null);

  if (!pret) return <p className="wf-intro">{"Chargement..."}</p>;
  return (
    <>
      {matieres.length === 0 ? (
        <EtatVide
          titre={"Aucune matière pour le moment"}
          texte={"Le catalogue est la liste de toutes les matières de l'école. Crée la première, puis affecte-la aux classes (coefficient, enseignant) dans « Affectation par classe »."}
          libelleBouton={"Créer la première matière"}
          onBouton={ouvrirCreation}
        />
      ) : (
        <>
          <BarreListe
            titre={"Matières"}
            compte={matieres.length + (matieres.length > 1 ? " matières" : " matière")}
            recherche={q}
            onRecherche={setQ}
            placeholder={"Rechercher une matière..."}
            libelleBouton={"Ajouter une matière"}
            onBouton={ouvrirCreation}
          />
          <div className="table-card">
            <table className="data-table">
              <thead><tr><th>{"Matière"}</th><th>Code</th>{AVEC_CATEGORIE_MATIERE && <th>{"Catégorie"}</th>}<th>Description</th><th>Statut</th><th>{"Classes"}</th><th></th></tr></thead>
              <tbody>
                {visibles.map((m) => (
                  <tr key={m.id} style={m.statut === "inactive" ? { opacity: 0.55 } : undefined}>
                    <td><strong>{m.nom}</strong></td>
                    <td>{m.code || "-"}</td>
                    {AVEC_CATEGORIE_MATIERE && <td>{catNom(m.category_id) || "-"}</td>}
                    <td>{m.description || "-"}</td>
                    <td><Pastille actif={m.statut !== "inactive"} /></td>
                    <td>{m.nb_classes}</td>
                    <td className="table-actions"><button className="btn-sm btn-gray-cancel" onClick={() => setFen({ type: "modifier", m })}>Modifier</button> <button className="btn-sm btn-red" onClick={() => setFen({ type: "supprimer", m })}>Supprimer</button></td>
                  </tr>
                ))}
                {visibles.length === 0 && <tr><td colSpan={AVEC_CATEGORIE_MATIERE ? 7 : 6} className="table-empty">{"Aucune matière ne correspond à « " + q.trim() + " »."}</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {fen && (fen.type === "creer" || fen.type === "modifier") && (
        <FenetreMatiere
          matiere={fen.type === "modifier" ? fen.m : null}
          categories={categories}
          fermer={fermer}
          apres={async (texte) => { await recharger(); fermer(); notifier(texte); }}
        />
      )}
      {fen && fen.type === "supprimer" && (
        <Confirmation
          titre={"Supprimer la matière"}
          texte={"Supprimer la matière « " + fen.m.nom + " » ? Elle sera retirée de toutes les classes."}
          libelle={"Supprimer"}
          danger
          fermer={fermer}
          action={async () => { await api("/api/matieres/" + fen.m.id, "DELETE"); await recharger(); fermer(); notifier("Matière « " + fen.m.nom + " » supprimée."); }}
        />
      )}
    </>
  );
}

function FenetreMatiere({ matiere, categories, fermer, apres }) {
  const edition = !!matiere;
  const depart = {
    nom: edition ? (matiere.nom || "") : "",
    code: edition ? (matiere.code || "") : "",
    description: edition ? (matiere.description || "") : "",
    category_id: edition && matiere.category_id ? String(matiere.category_id) : "",
    statut: edition ? (matiere.statut || "active") : "active"
  };
  const [f, setF] = useState(depart);
  const { err, occupe, envoyer } = useEnvoi();
  const modifie = Object.keys(depart).some((k) => f[k] !== depart[k]);
  const catsChoisies = categories.filter((c) => c.statut !== "inactive" || String(c.id) === String(depart.category_id));
  const valider = () => {
    if (!f.nom.trim()) return;
    envoyer(async () => {
      const corps = { ...(matiere || {}), nom: f.nom.trim(), code: f.code.trim(), description: f.description.trim(), statut: f.statut };
      if (AVEC_CATEGORIE_MATIERE) {
        if (f.category_id) corps.category_id = f.category_id;
        else if (edition && matiere.category_id) corps.category_id = null;
      }
      if (edition) {
        await api("/api/matieres/" + matiere.id, "PUT", corps);
        await apres("Matière « " + corps.nom + " » modifiée.");
      } else {
        await api("/api/matieres", "POST", corps);
        await apres("Matière « " + corps.nom + " » ajoutée au catalogue. Elle n'est utilisée dans aucune classe tant qu'elle n'est pas affectée (onglet Affectation par classe).");
      }
    });
  };
  return (
    <Fenetre
      titre={edition ? "Modifier la matière" : "Créer une nouvelle matière"}
      sousTitre={edition ? "Changez les informations de cette matière." : "Ajoutez une nouvelle matière pour l'école sélectionnée."}
      fermer={fermer}
      occupe={occupe}
      protege={modifie}
      onSubmit={valider}
      pied={<PiedStandard fermer={fermer} occupe={occupe} libelle={edition ? "Enregistrer" : "Créer"} desactive={!f.nom.trim()} />}
    >
      {err && <div className="login-error">{err}</div>}
      <div className="form-group">
        <label>{"Nom *"}</label>
        <input value={f.nom} placeholder={"Mathématiques"} onChange={(e) => setF({ ...f, nom: e.target.value })} />
      </div>
      <div className="form-group">
        <label>Code</label>
        <input value={f.code} placeholder={"MATH (généré automatiquement si vide)"} onChange={(e) => setF({ ...f, code: e.target.value })} />
      </div>
      {AVEC_CATEGORIE_MATIERE && <div className="form-group">
        <label>{"Catégorie"}</label>
        <select value={f.category_id} onChange={(e) => setF({ ...f, category_id: e.target.value })}>
          <option value="">{"Sélectionner une catégorie (optionnel)"}</option>
          {catsChoisies.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
        </select>
        <div className="wf-aide">{"Proposée par défaut quand la matière est affectée à une classe ; elle peut être changée classe par classe."}</div>
      </div>}
      <div className="form-group">
        <label>Description</label>
        <textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      </div>
      {edition && (
        <div className="form-group">
          <label>Statut</label>
          <select value={f.statut} onChange={(e) => setF({ ...f, statut: e.target.value })}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      )}
    </Fenetre>
  );
}

// ---------------------------------------------------------------------------
// AFFECTATION PAR CLASSE (inchangee)
// ---------------------------------------------------------------------------
function ParClasse({ matieres, enseignants, categories, executer }) {
  const { currentYear, years } = useYear();
  const [anneeId, setAnneeId] = useState("");
  const [classes, setClasses] = useState([]);
  const [classeId, setClasseId] = useState("");
  const [lignes, setLignes] = useState([]);
  const [ajout, setAjout] = useState("");
  const [ajoutCat, setAjoutCat] = useState("");
  const [ajoutCoef, setAjoutCoef] = useState("10");
  const [source, setSource] = useState("");
  const [erreur, setErreur] = useState("");
  const base = useRef({});

  useEffect(() => { if (!anneeId && currentYear) setAnneeId(String(currentYear.id)); }, [currentYear]);
  useEffect(() => {
    setClasses([]); setClasseId(""); setLignes([]);
    if (!anneeId) return;
    fetch("/api/classes-par-annee?year=" + anneeId).then((r) => r.json()).then((d) => setClasses(Array.isArray(d) ? d : [])).catch(() => {});
  }, [anneeId]);

  const charger = async () => {
    if (!classeId) { setLignes([]); return; }
    try {
      const d = await api("/api/matieres-classe?class_id=" + classeId);
      base.current = Object.fromEntries(d.map((x) => [x.id, { coefficient: String(x.coefficient), heures: String(x.heures_semaine) }]));
      setLignes(d);
    } catch (e) {}
  };
  useEffect(() => { charger(); }, [classeId]);

  const maj = (l, champ, valeur) => {
    const nouv = { ...l, [champ]: valeur };
    setLignes(lignes.map((x) => (x.id === l.id ? nouv : x)));
    return nouv;
  };
  const corps = (l, confirmer) => ({
    class_id: classeId, subject_id: l.subject_id, coefficient: Number(l.coefficient) || 1, heures_semaine: Number(l.heures_semaine) || 0,
    employee_id: l.employee_id || null, category_id: l.category_id || null, statut: l.statut || "active", confirmer: confirmer || undefined
  });
  const enregistrer = async (l, confirmer) => {
    try { await api("/api/matieres-classe", "POST", corps(l, confirmer)); base.current[l.id] = { coefficient: String(l.coefficient), heures: String(l.heures_semaine) }; setErreur(""); }
    catch (e) {
      if (e.confirmation) { if (window.confirm(e.message)) return enregistrer(l, true); await charger(); }
      else { setErreur(e.message); await charger(); }
    }
  };
  const ajouter = () => executer(async () => {
    await api("/api/matieres-classe", "POST", { class_id: classeId, subject_id: ajout, coefficient: Number(ajoutCoef) || 1, heures_semaine: 0, employee_id: null, category_id: ajoutCat || null });
    setAjout("");
    await charger();
  });
  const retirer = async (l, confirmer) => {
    try { await api("/api/matieres-classe/" + l.id + (confirmer ? "?confirmer=1" : ""), "DELETE"); await charger(); }
    catch (e) { if (e.confirmation && window.confirm(e.message)) return retirer(l, true); if (!e.confirmation) setErreur(e.message); }
  };
  const copier = () => {
    if (!source || !anneeId) return;
    if (!window.confirm("Copier les affectations (catégories, coefficients, heures, enseignants) de l'année choisie vers les classes de même nom de cette année ?")) return;
    executer(async () => {
      const r = await api("/api/matieres-classe/copier-annee", "POST", { from_year: source, to_year: anneeId });
      await charger();
      return r;
    }, "Copie terminée.");
  };

  const dejaIds = new Set(lignes.map((l) => l.subject_id));
  const actives = lignes.filter((l) => l.statut !== "inactive");
  const total = actives.reduce((s, l) => s + (Number(l.coefficient) || 0), 0);
  const catsActives = categories.filter((c) => c.statut !== "inactive");
  const optionsCat = (courante) => categories.filter((c) => c.statut !== "inactive" || String(c.id) === String(courante));
  const sansCat = actives.filter((l) => !l.category_id).length;

  return (
    <div style={carte}>
      <div className="form-row">
        <div className="form-group">
          <label>{"Année"}</label>
          <select value={anneeId} onChange={(e) => setAnneeId(e.target.value)}>
            <option value="">{"— Choisir —"}</option>
            {(years || []).map((y) => <option key={y.id} value={y.id}>{y.nom}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Classe</label>
          <select value={classeId} onChange={(e) => setClasseId(e.target.value)} disabled={!anneeId}>
            <option value="">{"— Choisir —"}</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
        </div>
      </div>

      {anneeId && (
        <div style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: "14px", flexWrap: "wrap" }}>
          <span style={{ fontSize: "13px", color: "var(--text-dim)" }}>{"Reprendre d'une autre année :"}</span>
          <select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">{"— Année source —"}</option>
            {(years || []).filter((y) => String(y.id) !== String(anneeId)).map((y) => <option key={y.id} value={y.id}>{y.nom}</option>)}
          </select>
          <button className="btn-gray-cancel btn-sm" onClick={copier} disabled={!source}>{"Copier vers cette année"}</button>
        </div>
      )}

      {erreur && <div className="login-error" style={{ marginBottom: "10px" }}>{erreur}</div>}

      {classeId && (
        <>
          <p style={{ fontSize: "12px", color: "var(--text-dim)", margin: "0 0 10px" }}>{"Chaque affectation a ses propres paramètres : une même matière peut avoir un coefficient et une catégorie différents d'une classe à l'autre. Le coefficient est la note maximale de la matière dans cette classe."}</p>
          {sansCat > 0 && <div style={{ color: "var(--gold, #c90)", fontSize: "13px", marginBottom: "8px" }}>{sansCat + " matière(s) sans catégorie : elles seront regroupées sous « Sans catégorie » au bulletin."}</div>}
          <div className="table-card">
            <table className="data-table">
              <thead><tr><th>{"Matière"}</th><th>{"Catégorie"}</th><th>{"Coefficient (note max.)"}</th><th>{"Heures / sem."}</th><th>Enseignant</th><th>Statut</th><th></th></tr></thead>
              <tbody>
                {lignes.map((l) => (
                  <tr key={l.id} style={l.statut === "inactive" ? { opacity: 0.55 } : undefined}>
                    <td><strong>{l.matiere_nom}</strong>{l.matiere_code ? <div style={{ fontSize: "11px", color: "var(--text-dim)" }}>{l.matiere_code}</div> : null}</td>
                    <td>
                      <select value={l.category_id || ""} onChange={(e) => { const n = maj(l, "category_id", e.target.value); enregistrer(n); }}>
                        <option value="">{"— Aucune —"}</option>
                        {optionsCat(l.category_id).map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
                      </select>
                    </td>
                    <td><input type="number" min="0" step="0.5" style={{ width: "80px" }} value={l.coefficient} onChange={(e) => maj(l, "coefficient", e.target.value)} onBlur={() => { if (!base.current[l.id] || String(l.coefficient) !== base.current[l.id].coefficient) enregistrer(l); }} /></td>
                    <td><input type="number" min="0" step="0.5" style={{ width: "80px" }} value={l.heures_semaine} onChange={(e) => maj(l, "heures_semaine", e.target.value)} onBlur={() => { if (!base.current[l.id] || String(l.heures_semaine) !== base.current[l.id].heures) enregistrer(l); }} /></td>
                    <td>
                      <select value={l.employee_id || ""} onChange={(e) => { const n = maj(l, "employee_id", e.target.value); enregistrer(n); }}>
                        <option value="">{"— Non assigné —"}</option>
                        {enseignants.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
                      </select>
                    </td>
                    <td>
                      <select value={l.statut || "active"} onChange={(e) => { const n = maj(l, "statut", e.target.value); enregistrer(n); }}>
                        <option value="active">Active</option><option value="inactive">Inactive</option>
                      </select>
                    </td>
                    <td className="table-actions"><button className="btn-sm btn-red" onClick={() => retirer(l)}>Retirer</button></td>
                  </tr>
                ))}
                {lignes.length === 0 && <tr><td colSpan={7} className="table-empty">{"Aucune matière dans cette classe."}</td></tr>}
              </tbody>
              {lignes.length > 0 && <tfoot><tr><td colSpan={2}><strong>{"Total des coefficients (affectations actives)"}</strong></td><td><strong>{total}</strong></td><td colSpan={4}></td></tr></tfoot>}
            </table>
          </div>
          <div style={{ display: "flex", gap: "10px", marginTop: "12px", alignItems: "center", flexWrap: "wrap" }}>
            <select value={ajout} onChange={(e) => setAjout(e.target.value)}>
              <option value="">{"— Matière du catalogue —"}</option>
              {matieres.filter((m) => !dejaIds.has(m.id) && m.statut !== "inactive").map((m) => <option key={m.id} value={m.id}>{(m.code ? m.code + " — " : "") + m.nom}</option>)}
            </select>
            <select value={ajoutCat} onChange={(e) => setAjoutCat(e.target.value)}>
              <option value="">{"— Catégorie —"}</option>
              {catsActives.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
            <input type="number" min="0" step="0.5" style={{ width: "80px" }} value={ajoutCoef} title={"Coefficient (note maximale)"} onChange={(e) => setAjoutCoef(e.target.value)} />
            <button className="btn-primary" onClick={ajouter} disabled={!ajout}>{"Affecter à la classe"}</button>
          </div>
        </>
      )}
      {anneeId && classes.length === 0 && <div style={{ color: "var(--text-dim)" }}>{"Cette année n'a pas encore de classes."}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ENSEIGNANTS (professeurs)
// ---------------------------------------------------------------------------
function Enseignants({ pret, enseignants, recharger, notifier }) {
  const [fen, setFen] = useState(null); // { type: "creer" } | { type: "retirer", e }
  const [q, setQ] = useState("");
  const filtre = sansAccent(q.trim());
  const visibles = enseignants.filter((e) => !filtre || sansAccent((e.nom || "") + " " + (e.matricule || "") + " " + (e.telephone || "") + " " + (e.cours || "")).includes(filtre));
  const ouvrirCreation = () => setFen({ type: "creer" });
  const fermer = () => setFen(null);

  if (!pret) return <p className="wf-intro">{"Chargement..."}</p>;
  return (
    <>
      {enseignants.length === 0 ? (
        <EtatVide
          titre={"Aucun professeur pour le moment"}
          texte={"Ajoute les professeurs de l'école : crée une nouvelle fiche, ou choisis un employé déjà enregistré. Tu pourras ensuite leur confier des cours dans « Affectation par classe »."}
          libelleBouton={"Ajouter le premier professeur"}
          onBouton={ouvrirCreation}
        />
      ) : (
        <>
          <BarreListe
            titre={"Enseignants"}
            compte={enseignants.length + (enseignants.length > 1 ? " professeurs" : " professeur")}
            recherche={q}
            onRecherche={setQ}
            placeholder={"Rechercher un professeur..."}
            libelleBouton={"Ajouter un professeur"}
            onBouton={ouvrirCreation}
          />
          <div className="table-card">
            <table className="data-table">
              <thead><tr><th>{"Enseignant"}</th><th>{"Matricule"}</th><th>{"Téléphone"}</th><th>{"Cours (matière - classe)"}</th><th></th></tr></thead>
              <tbody>
                {visibles.map((e) => (
                  <tr key={e.id}>
                    <td><strong>{e.nom}</strong>{e.fonction ? <div style={{ fontSize: "12px", color: "var(--text-dim)" }}>{e.fonction}</div> : null}</td>
                    <td>{e.matricule}</td><td>{e.telephone || "-"}</td>
                    <td style={{ maxWidth: "380px" }}>{e.cours || "-"}</td>
                    <td className="table-actions"><button className="btn-sm btn-red" onClick={() => setFen({ type: "retirer", e })}>Retirer</button></td>
                  </tr>
                ))}
                {visibles.length === 0 && <tr><td colSpan={5} className="table-empty">{"Aucun professeur ne correspond à « " + q.trim() + " »."}</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {fen && fen.type === "creer" && (
        <FenetreEnseignant fermer={fermer} apres={async (texte) => { await recharger(); fermer(); notifier(texte); }} />
      )}
      {fen && fen.type === "retirer" && (
        <Confirmation
          titre={"Retirer de la liste des enseignants"}
          texte={fen.e.nom + " ne sera plus listé comme enseignant (sa fiche d'employé reste). Continuer ?"}
          libelle={"Retirer"}
          danger
          fermer={fermer}
          action={async () => { await api("/api/enseignants/" + fen.e.id, "DELETE"); await recharger(); fermer(); notifier(fen.e.nom + " n'est plus listé comme enseignant."); }}
        />
      )}
    </>
  );
}

function FenetreEnseignant({ fermer, apres }) {
  const [mode, setMode] = useState("nouveau"); // "nouveau" | "existant"
  const [nom, setNom] = useState("");
  const [telephone, setTelephone] = useState("");
  const [choix, setChoix] = useState("");
  const [dispo, setDispo] = useState([]);
  const { err, occupe, envoyer } = useEnvoi();
  useEffect(() => { api("/api/enseignants/disponibles").then((d) => setDispo(d || [])).catch(() => {}); }, []);
  const modifie = !!(nom.trim() || telephone.trim() || choix);
  const pret = mode === "nouveau" ? !!nom.trim() : !!choix;
  const valider = () => {
    if (!pret) return;
    envoyer(async () => {
      if (mode === "nouveau") {
        await api("/api/enseignants", "POST", { nom: nom.trim(), telephone: telephone.trim() });
        await apres("Professeur « " + nom.trim() + " » ajouté.");
      } else {
        const e = dispo.find((d) => String(d.id) === String(choix));
        await api("/api/enseignants", "POST", { employee_id: choix });
        await apres((e ? e.nom : "L'employé") + " est maintenant listé comme enseignant.");
      }
    });
  };
  return (
    <Fenetre
      titre={mode === "nouveau" ? "Créer un nouveau professeur" : "Ajouter un professeur"}
      sousTitre={mode === "nouveau" ? "Ajoutez un nouveau professeur pour l'école sélectionnée." : "Choisissez un employé déjà enregistré : il sera listé comme enseignant."}
      fermer={fermer}
      occupe={occupe}
      protege={modifie}
      onSubmit={valider}
      pied={<PiedStandard fermer={fermer} occupe={occupe} libelle={mode === "nouveau" ? "Créer" : "Ajouter"} desactive={!pret} />}
    >
      <Bascule valeur={mode} onChange={setMode} desactive={occupe} options={[["nouveau", "Nouveau professeur"], ["existant", "Parmi les employés"]]} />
      {err && <div className="login-error">{err}</div>}
      {mode === "nouveau" ? (
        <>
          <div className="form-group">
            <label>{"Nom complet *"}</label>
            <input value={nom} placeholder={"Prénom et nom"} onChange={(e) => setNom(e.target.value)} />
          </div>
          <div className="form-group">
            <label>{"Téléphone"}</label>
            <input value={telephone} onChange={(e) => setTelephone(e.target.value)} />
          </div>
        </>
      ) : (
        <div className="form-group">
          <label>{"Employé *"}</label>
          <select value={choix} onChange={(e) => setChoix(e.target.value)}>
            <option value="">{"Choisir un employé"}</option>
            {dispo.map((d) => <option key={d.id} value={d.id}>{d.nom + (d.fonction ? " (" + d.fonction + ")" : "")}</option>)}
          </select>
          {dispo.length === 0 && <div className="wf-aide">{"Aucun autre employé actif n'est disponible. Utilise « Nouveau professeur »."}</div>}
        </div>
      )}
    </Fenetre>
  );
}

// ---------------------------------------------------------------------------
// CATEGORIES de matieres
// ---------------------------------------------------------------------------
function Categories({ pret, afficherPoids, categories, recharger, notifier }) {
  const [fen, setFen] = useState(null); // { type: "creer" } | { type: "modifier", c } | { type: "supprimer", c }
  const [q, setQ] = useState("");
  const filtre = sansAccent(q.trim());
  const visibles = categories.filter((c) => !filtre || sansAccent((c.nom || "") + " " + (c.description || "")).includes(filtre));
  const ouvrirCreation = () => setFen({ type: "creer" });
  const fermer = () => setFen(null);
  const colonnes = afficherPoids ? 7 : 6;

  if (!pret) return <p className="wf-intro">{"Chargement..."}</p>;
  return (
    <>
      <p className="wf-intro">{"Le nombre et les noms des catégories sont libres. Une catégorie ne contient aucune matière par elle-même : c'est dans « Affectation par classe » qu'on choisit la catégorie de chaque matière pour chaque classe."}</p>
      {categories.length === 0 ? (
        <EtatVide
          titre={"Aucune catégorie pour le moment"}
          texte={"Les catégories regroupent les matières au bulletin (par exemple « Matières de base », « Langues »). Crée la première."}
          libelleBouton={"Créer la première catégorie"}
          onBouton={ouvrirCreation}
        />
      ) : (
        <>
          <BarreListe
            titre={"Catégories de matières"}
            compte={categories.length + (categories.length > 1 ? " catégories" : " catégorie")}
            recherche={q}
            onRecherche={setQ}
            placeholder={"Rechercher une catégorie..."}
            libelleBouton={"Ajouter une catégorie"}
            onBouton={ouvrirCreation}
          />
          <div className="table-card">
            <table className="data-table">
              <thead><tr><th>Ordre</th><th>{"Catégorie"}</th><th>Description</th>{afficherPoids && <th>Poids</th>}<th>Statut</th><th>{"Affectations"}</th><th></th></tr></thead>
              <tbody>
                {visibles.map((c) => (
                  <tr key={c.id} style={c.statut === "inactive" ? { opacity: 0.55 } : undefined}>
                    <td>{c.ordre}</td><td><strong>{c.nom}</strong></td><td>{c.description || "-"}</td>{afficherPoids && <td>{c.poids}</td>}
                    <td><Pastille actif={c.statut !== "inactive"} /></td><td>{c.nb_matieres}</td>
                    <td className="table-actions"><button className="btn-sm btn-gray-cancel" onClick={() => setFen({ type: "modifier", c })}>Modifier</button> <button className="btn-sm btn-red" onClick={() => setFen({ type: "supprimer", c })}>Supprimer</button></td>
                  </tr>
                ))}
                {visibles.length === 0 && <tr><td colSpan={colonnes} className="table-empty">{"Aucune catégorie ne correspond à « " + q.trim() + " »."}</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {fen && (fen.type === "creer" || fen.type === "modifier") && (
        <FenetreCategorie
          categorie={fen.type === "modifier" ? fen.c : null}
          afficherPoids={afficherPoids}
          fermer={fermer}
          apres={async (texte) => { await recharger(); fermer(); notifier(texte); }}
        />
      )}
      {fen && fen.type === "supprimer" && (
        <Confirmation
          titre={"Supprimer la catégorie"}
          texte={"Supprimer la catégorie « " + fen.c.nom + " » ?"}
          libelle={"Supprimer"}
          danger
          fermer={fermer}
          action={async () => { await api("/api/categories-matieres/" + fen.c.id, "DELETE"); await recharger(); fermer(); notifier("Catégorie « " + fen.c.nom + " » supprimée."); }}
        />
      )}
    </>
  );
}

function FenetreCategorie({ categorie, afficherPoids, fermer, apres }) {
  const edition = !!categorie;
  const depart = {
    nom: edition ? (categorie.nom || "") : "",
    description: edition ? (categorie.description || "") : "",
    poids: edition && categorie.poids !== undefined && categorie.poids !== null ? String(categorie.poids) : "1",
    ordre: edition && categorie.ordre !== undefined && categorie.ordre !== null ? String(categorie.ordre) : "",
    statut: edition ? (categorie.statut || "active") : "active"
  };
  const [f, setF] = useState(depart);
  const { err, occupe, envoyer } = useEnvoi();
  const modifie = Object.keys(depart).some((k) => f[k] !== depart[k]);
  const valider = () => {
    if (!f.nom.trim()) return;
    envoyer(async () => {
      if (edition) {
        const corps = { ...categorie, nom: f.nom.trim(), description: f.description.trim(), statut: f.statut };
        if (afficherPoids) corps.poids = f.poids;
        if (f.ordre !== "") corps.ordre = f.ordre;
        await api("/api/categories-matieres/" + categorie.id, "PUT", corps);
        await apres("Catégorie « " + corps.nom + " » modifiée.");
      } else {
        const corps = { nom: f.nom.trim(), description: f.description.trim(), poids: f.poids, statut: "active" };
        await api("/api/categories-matieres", "POST", corps);
        await apres("Catégorie « " + corps.nom + " » créée. Choisis-la ensuite pour chaque matière dans « Affectation par classe ».");
      }
    });
  };
  return (
    <Fenetre
      titre={edition ? "Modifier la catégorie" : "Créer une nouvelle catégorie"}
      sousTitre={edition ? "Changez les informations de cette catégorie." : "Ajoutez une nouvelle catégorie de matières pour l'école sélectionnée."}
      fermer={fermer}
      occupe={occupe}
      protege={modifie}
      onSubmit={valider}
      pied={<PiedStandard fermer={fermer} occupe={occupe} libelle={edition ? "Enregistrer" : "Créer"} desactive={!f.nom.trim()} />}
    >
      {err && <div className="login-error">{err}</div>}
      <div className="form-group">
        <label>{"Nom *"}</label>
        <input value={f.nom} placeholder={"Matières de base"} onChange={(e) => setF({ ...f, nom: e.target.value })} />
      </div>
      <div className="form-group">
        <label>Description</label>
        <textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      </div>
      {afficherPoids && (
        <div className="form-group">
          <label>Poids</label>
          <input type="number" min="0" step="0.5" value={f.poids} onChange={(e) => setF({ ...f, poids: e.target.value })} />
          <div className="wf-aide">{"Importance de cette catégorie dans la moyenne générale."}</div>
        </div>
      )}
      {edition && (
        <>
          <div className="form-group">
            <label>Ordre</label>
            <input type="number" value={f.ordre} onChange={(e) => setF({ ...f, ordre: e.target.value })} />
            <div className="wf-aide">{"Position de la catégorie sur le bulletin."}</div>
          </div>
          <div className="form-group">
            <label>Statut</label>
            <select value={f.statut} onChange={(e) => setF({ ...f, statut: e.target.value })}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </>
      )}
    </Fenetre>
  );
}
