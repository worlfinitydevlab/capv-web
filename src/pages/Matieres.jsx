import React, { useState, useEffect, useRef } from "react";
import { useYear as useYear } from "../YearContext.jsx";
import { authPourAction, definirUtilisateur } from "../pedagogie/confirmAction.js";
import { usePontPedagogie } from "../pedagogie/pont.js";
import { Fenetre, PiedStandard, Confirmation, Bascule, BarreListe, EtatVide, Pastille, MessageEnvoi, useEnvoi, sansAccent } from "../pedagogie/Fenetre.jsx";

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
      {onglet === "classe" && <ParClasse matieres={matieres} enseignants={enseignants} categories={categories} notifier={notifier} />}
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
// AFFECTATION PAR CLASSE : on choisit l'annee et la classe, on voit ses matieres,
// un bouton "+ Affecter une matiere" ouvre la fenetre
// ---------------------------------------------------------------------------
function ParClasse({ matieres, enseignants, categories, notifier }) {
  const { currentYear, years } = useYear();
  const [anneeId, setAnneeId] = useState("");
  const [classes, setClasses] = useState([]);
  const [classeId, setClasseId] = useState("");
  const [lignes, setLignes] = useState([]);
  const [charge, setCharge] = useState(false);
  const [erreur, setErreur] = useState("");
  const [fen, setFen] = useState(null); // { type: "affecter" } | { type: "modifier", l } | { type: "retirer", l } | { type: "copier" } | { type: "copieClasses" } | { type: "affecterPlusieurs" } | { type: "sousMatieres", l }

  useEffect(() => { if (!anneeId && currentYear) setAnneeId(String(currentYear.id)); }, [currentYear]);
  useEffect(() => {
    setClasses([]); setClasseId(""); setLignes([]); setCharge(false);
    if (!anneeId) return;
    fetch("/api/classes-par-annee?year=" + anneeId).then((r) => r.json()).then((d) => setClasses(Array.isArray(d) ? d : [])).catch(() => {});
  }, [anneeId]);

  const charger = async () => {
    if (!classeId) { setLignes([]); setCharge(false); return; }
    try { setLignes(await api("/api/matieres-classe?class_id=" + classeId)); setErreur(""); } catch (e) { setErreur(e.message); }
    setCharge(true);
  };
  useEffect(() => { setCharge(false); charger(); }, [classeId]);

  const classe = classes.find((c) => String(c.id) === String(classeId));
  const annee = (years || []).find((y) => String(y.id) === String(anneeId));
  const fermer = () => setFen(null);
  const apres = async (texte) => { await charger(); fermer(); notifier(texte); };

  const dejaIds = new Set(lignes.map((l) => String(l.subject_id)));
  const disponibles = matieres.filter((m) => !dejaIds.has(String(m.id)) && m.statut !== "inactive");
  const actives = lignes.filter((l) => l.statut !== "inactive");
  const total = actives.reduce((s, l) => s + (Number(l.coefficient) || 0), 0);
  const sansCat = actives.filter((l) => !l.category_id).length;
  const catNom = (id) => { const c = categories.find((x) => String(x.id) === String(id)); return c ? c.nom : ""; };
  const ensNom = (id) => { const e = enseignants.find((x) => String(x.id) === String(id)); return e ? e.nom : ""; };
  const ouvrirAffecter = () => setFen({ type: "affecter" });

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
        <div className="form-group">
          <label>Classe</label>
          <select value={classeId} onChange={(e) => setClasseId(e.target.value)} disabled={!anneeId}>
            <option value="">{"— Choisir —"}</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
        </div>
        {anneeId && (
          <div className="wf-filtres-fin">
            {classes.length > 1 && <button type="button" className="btn-gray-cancel" onClick={() => setFen({ type: "copieClasses" })}>{"Copier vers d'autres classes"}</button>}
            {classes.length > 0 && <button type="button" className="btn-gray-cancel" onClick={() => setFen({ type: "affecterPlusieurs" })}>{"Affecter à plusieurs classes"}</button>}
            <button type="button" className="btn-gray-cancel" onClick={() => setFen({ type: "copier" })}>{"Reprendre d'une autre année"}</button>
          </div>
        )}
      </div>

      {erreur && <div className="login-error" style={{ marginBottom: "10px" }}>{erreur}</div>}
      {anneeId && classes.length === 0 && <div style={{ color: "var(--text-dim)" }}>{"Cette année n'a pas encore de classes."}</div>}
      {anneeId && classes.length > 0 && !classeId && <p className="wf-intro">{"Choisis une classe pour voir ses matières, leurs coefficients et leurs enseignants."}</p>}

      {classeId && !charge && <p className="wf-intro">{"Chargement..."}</p>}
      {classeId && charge && (
        <>
          <p className="wf-intro">{"Chaque affectation a ses propres paramètres : une même matière peut avoir un coefficient et une catégorie différents d'une classe à l'autre. Le coefficient est la note maximale de la matière dans cette classe."}</p>
          {lignes.length === 0 ? (
            <EtatVide
              titre={"Aucune matière dans " + (classe ? classe.nom : "cette classe")}
              texte={"Affecte les matières du catalogue à cette classe : tu choisis son coefficient, sa catégorie et son enseignant. Tu peux aussi reprendre les matières d'une autre classe ou les affectations d'une autre année."}
              libelleBouton={"Affecter la première matière"}
              onBouton={ouvrirAffecter}
              extra={classes.length > 1 ? <button type="button" className="btn-gray-cancel" onClick={() => setFen({ type: "copieClasses" })}>{"Reprendre d'une autre classe"}</button> : null}
            />
          ) : (
            <>
              <BarreListe
                titre={"Matières de " + (classe ? classe.nom : "la classe")}
                compte={lignes.length + (lignes.length > 1 ? " matières" : " matière")}
                libelleBouton={"Affecter une matière"}
                onBouton={ouvrirAffecter}
              />
              {sansCat > 0 && <div style={{ color: "var(--gold, #c90)", fontSize: "13px", marginBottom: "8px" }}>{sansCat + " matière(s) sans catégorie : elles seront regroupées sous « Sans catégorie » au bulletin."}</div>}
              <div className="table-card">
                <table className="data-table">
                  <thead><tr><th>{"Matière"}</th><th>{"Catégorie"}</th><th>{"Coefficient (note max.)"}</th><th>{"Heures / sem."}</th><th>Enseignant</th><th>Statut</th><th></th></tr></thead>
                  <tbody>
                    {lignes.map((l) => (
                      <tr key={l.id} style={l.statut === "inactive" ? { opacity: 0.55 } : undefined}>
                        <td>
                          <strong>{l.matiere_nom}</strong>{l.matiere_code ? <span className="wf-petit">{l.matiere_code}</span> : null}
                          {l.sous_matieres && l.sous_matieres.length > 0 && <span className="wf-etiquette" title={l.sous_matieres.map((p) => p.nom + " " + p.maximum).join(" · ")}>{l.sous_matieres.length + " sous-matières"}</span>}
                        </td>
                        <td>{catNom(l.category_id) || <span className="wf-etiquette">{"Sans catégorie"}</span>}</td>
                        <td>{l.coefficient}</td>
                        <td>{l.heures_semaine}</td>
                        <td>{ensNom(l.employee_id) || <span style={{ color: "var(--text-dim)" }}>{"Non assigné"}</span>}</td>
                        <td><Pastille actif={l.statut !== "inactive"} /></td>
                        <td className="table-actions"><button className="btn-sm btn-gray-cancel" onClick={() => setFen({ type: "modifier", l })}>Modifier</button> <button className="btn-sm btn-gray-cancel" onClick={() => setFen({ type: "sousMatieres", l })}>{"Sous-matières"}</button> <button className="btn-sm btn-red" onClick={() => setFen({ type: "retirer", l })}>Retirer</button></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr><td colSpan={2}><strong>{"Total des coefficients (affectations actives)"}</strong></td><td><strong>{total}</strong></td><td colSpan={4}></td></tr></tfoot>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {fen && fen.type === "affecter" && (
        <FenetreAffectation classe={classe} classeId={classeId} disponibles={disponibles} categories={categories} enseignants={enseignants} fermer={fermer} apres={apres} />
      )}
      {fen && fen.type === "modifier" && (
        <FenetreAffectation ligne={fen.l} classe={classe} classeId={classeId} disponibles={[]} categories={categories} enseignants={enseignants} fermer={fermer} apres={apres} />
      )}
      {fen && fen.type === "retirer" && (
        <Confirmation
          titre={"Retirer la matière de la classe"}
          texte={"Retirer « " + fen.l.matiere_nom + " » de " + (classe ? classe.nom : "cette classe") + " ? La matière reste dans le catalogue."}
          libelle={"Retirer"}
          danger
          fermer={fermer}
          action={async (confirmer) => {
            await api("/api/matieres-classe/" + fen.l.id + (confirmer ? "?confirmer=1" : ""), "DELETE");
            await apres("« " + fen.l.matiere_nom + " » retirée de la classe.");
          }}
        />
      )}
      {fen && fen.type === "sousMatieres" && (
        <FenetreSousMatieres ligne={fen.l} classe={classe} fermer={fermer} apres={apres} />
      )}
      {fen && fen.type === "copier" && (
        <FenetreCopieAffectations annee={annee} anneeId={anneeId} years={years} fermer={fermer} apres={apres} />
      )}
      {fen && fen.type === "copieClasses" && (
        <FenetreCopieClasses classeId={classeId} classes={classes} lignes={lignes} fermer={fermer} apres={apres} />
      )}
      {fen && fen.type === "affecterPlusieurs" && (
        <FenetreAffecterPlusieurs annee={annee} classes={classes} matieres={matieres} categories={categories} enseignants={enseignants} fermer={fermer} apres={apres} />
      )}
    </>
  );
}

// Affecter une matiere a la classe (ligne absente) ou modifier une affectation (ligne donnee)
function FenetreAffectation({ ligne, classe, classeId, disponibles, categories, enseignants, fermer, apres }) {
  const edition = !!ligne;
  const divisee = edition && !!(ligne.sous_matieres && ligne.sous_matieres.length);
  const depart = {
    subject_id: edition ? String(ligne.subject_id) : "",
    category_id: edition && ligne.category_id ? String(ligne.category_id) : "",
    coefficient: edition ? String(ligne.coefficient) : "10",
    heures: edition ? String(ligne.heures_semaine) : "",
    employee_id: edition && ligne.employee_id ? String(ligne.employee_id) : "",
    statut: edition ? (ligne.statut || "active") : "active"
  };
  const [f, setF] = useState(depart);
  const envoi = useEnvoi();
  const modifie = Object.keys(depart).some((k) => f[k] !== depart[k]);
  const catsChoisies = categories.filter((c) => c.statut !== "inactive" || String(c.id) === String(depart.category_id));
  const nomClasse = classe ? classe.nom : "la classe";
  const pret = edition || !!f.subject_id;
  const valider = () => {
    if (!pret) return;
    envoi.envoyer(async (confirmer) => {
      const corps = {
        class_id: classeId, subject_id: f.subject_id,
        coefficient: Number(f.coefficient) || 1, heures_semaine: Number(f.heures) || 0,
        employee_id: f.employee_id || null, category_id: f.category_id || null
      };
      if (edition) { corps.statut = f.statut || "active"; corps.confirmer = confirmer || undefined; }
      await api("/api/matieres-classe", "POST", corps);
      if (edition) await apres("Affectation de « " + ligne.matiere_nom + " » enregistrée.");
      else {
        const m = disponibles.find((x) => String(x.id) === String(f.subject_id));
        await apres("« " + (m ? m.nom : "La matière") + " » affectée à " + nomClasse + ".");
      }
    });
  };
  return (
    <Fenetre
      titre={edition ? "Modifier l'affectation" : "Affecter une matière"}
      sousTitre={edition ? ligne.matiere_nom + " · " + nomClasse : "Choisissez une matière du catalogue pour " + nomClasse + "."}
      fermer={fermer}
      occupe={envoi.occupe}
      protege={modifie}
      onSubmit={valider}
      pied={<PiedStandard fermer={fermer} occupe={envoi.occupe} libelle={edition ? "Enregistrer" : "Affecter"} desactive={!pret} envoi={envoi} />}
    >
      <MessageEnvoi envoi={envoi} />
      {!edition && (
        <div className="form-group">
          <label>{"Matière *"}</label>
          <select value={f.subject_id} onChange={(e) => setF({ ...f, subject_id: e.target.value })}>
            <option value="">{"Sélectionner une matière du catalogue"}</option>
            {disponibles.map((m) => <option key={m.id} value={m.id}>{(m.code ? m.code + " — " : "") + m.nom}</option>)}
          </select>
          {disponibles.length === 0 && <div className="wf-aide">{"Toutes les matières du catalogue sont déjà dans cette classe. Crée une nouvelle matière dans « Catalogue des matières »."}</div>}
        </div>
      )}
      <div className="form-group">
        <label>{"Catégorie"}</label>
        <select value={f.category_id} onChange={(e) => setF({ ...f, category_id: e.target.value })}>
          <option value="">{"Sélectionner une catégorie (optionnel)"}</option>
          {catsChoisies.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
        </select>
      </div>
      <div className="form-group">
        <label>{"Coefficient (note maximale)"}</label>
        <input type="number" min="0" step="0.5" value={f.coefficient} onChange={(e) => setF({ ...f, coefficient: e.target.value })} disabled={divisee} />
        <div className="wf-aide">{divisee ? "Cette matière est divisée en sous-matières : son coefficient est leur total. Modifie-les avec le bouton « Sous-matières »." : "Le coefficient est la note maximale de la matière dans cette classe."}</div>
      </div>
      <div className="form-group">
        <label>{"Heures par semaine"}</label>
        <input type="number" min="0" step="0.5" value={f.heures} placeholder="0" onChange={(e) => setF({ ...f, heures: e.target.value })} />
      </div>
      <div className="form-group">
        <label>Enseignant</label>
        <select value={f.employee_id} onChange={(e) => setF({ ...f, employee_id: e.target.value })}>
          <option value="">{"Non assigné"}</option>
          {enseignants.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
        </select>
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

// Sous-matieres d'une matiere dans une classe : leur total doit faire la note maximale de la matiere
function FenetreSousMatieres({ ligne, classe, fermer, apres }) {
  const envoi = useEnvoi();
  const [charge, setCharge] = useState(false);
  const [info, setInfo] = useState(null);
  const [rows, setRows] = useState([]);
  const [depart, setDepart] = useState("[]");
  const suivant = useRef(1);
  const cleDe = (l) => JSON.stringify(l.map((r) => [r.id || "", r.nom, String(r.maximum)]));

  useEffect(() => {
    let annule = false;
    api("/api/matieres-classe/" + ligne.id + "/sous-matieres").then((d) => {
      if (annule) return;
      const l = d.sous_matieres.map((p) => ({ cle: suivant.current++, id: p.id, nom: p.nom, maximum: String(p.maximum), nb_notes: p.nb_notes || 0 }));
      setInfo(d); setRows(l); setDepart(cleDe(l)); setCharge(true);
    }).catch((e) => { if (!annule) { envoi.setErr(e.message); setCharge(true); } });
    return () => { annule = true; };
  }, []);

  const coef = info ? Number(info.coefficient) : Number(ligne.coefficient);
  const nombre = (v) => { const x = Number(String(v).replace(",", ".")); return Number.isFinite(x) ? x : 0; };
  const cents = (v) => Math.round(nombre(v) * 100);
  const total = rows.reduce((s, r) => s + cents(r.maximum), 0) / 100;
  const reste = Math.round((coef - total) * 100) / 100;
  const noms = rows.map((r) => r.nom.trim().toLowerCase());
  const nomsOk = rows.every((r) => r.nom.trim() !== "") && new Set(noms).size === noms.length;
  const maxOk = rows.every((r) => cents(r.maximum) > 0);
  const modifie = cleDe(rows) !== depart;
  const bloqueParNotes = !!info && info.nb_notes_matiere > 0 && depart === "[]";
  const valide = modifie && !bloqueParNotes && (rows.length === 0 || (rows.length >= 2 && nomsOk && maxOk && reste === 0));
  const maj = (cle, patch) => setRows((l) => l.map((r) => (r.cle === cle ? { ...r, ...patch } : r)));
  const ajouter = () => setRows((l) => [...l, { cle: suivant.current++, id: null, nom: "", maximum: "", nb_notes: 0 }]);
  const retirer = (cle) => setRows((l) => l.filter((r) => r.cle !== cle));
  const deplacer = (i, d) => setRows((l) => { const n = l.slice(); const j = i + d; if (j < 0 || j >= n.length) return l; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const completer = (cle) => {
    const autres = rows.filter((r) => r.cle !== cle).reduce((s, r) => s + cents(r.maximum), 0) / 100;
    const v = Math.round((coef - autres) * 100) / 100;
    if (v > 0) maj(cle, { maximum: String(v) });
  };
  const valider = () => {
    if (!valide) return;
    envoi.envoyer(async () => {
      await api("/api/matieres-classe/" + ligne.id + "/sous-matieres", "PUT", { sous_matieres: rows.map((r) => ({ id: r.id || undefined, nom: r.nom.trim(), maximum: r.maximum })) });
      await apres(rows.length ? "Sous-matières de « " + ligne.matiere_nom + " » enregistrées (" + rows.length + ")." : "« " + ligne.matiere_nom + " » n'a plus de sous-matières.");
    });
  };
  const couleur = rows.length === 0 ? "var(--text-dim)" : reste === 0 ? "var(--ok, #2e9d5b)" : "var(--err, #c33)";
  const entree = { width: "100%", padding: "7px 9px", border: "1px solid var(--line, rgba(255,255,255,0.2))", borderRadius: "8px", font: "inherit", background: "transparent", color: "inherit" };
  return (
    <Fenetre
      titre={"Sous-matières"}
      sousTitre={ligne.matiere_nom + " · " + (classe ? classe.nom : "classe") + " · note maximale " + coef}
      largeur="640px"
      fermer={fermer}
      occupe={envoi.occupe}
      protege={modifie}
      onSubmit={valider}
      pied={<PiedStandard fermer={fermer} occupe={envoi.occupe} libelle={"Enregistrer"} desactive={!valide} envoi={envoi} />}
    >
      <MessageEnvoi envoi={envoi} />
      {!charge && <div className="wf-aide">{"Chargement..."}</div>}
      {charge && (
        <>
          <p className="wf-texte" style={{ marginTop: 0 }}>{"Divise la matière en parties qui se notent séparément. Leur total doit faire " + coef + ". Sur le bulletin de l'élève, seul le total de la matière apparaît ; les sous-matières se voient à la saisie et dans le palmarès."}</p>
          {bloqueParNotes && <div className="wf-avis" role="status"><strong>{"Cette matière ne peut plus être divisée"}</strong>{"Des notes existent déjà pour elle dans cette classe (" + info.nb_notes_matiere + "). La diviser changerait les bulletins."}</div>}
          {!bloqueParNotes && (
            <>
              {rows.length === 0 && <div className="wf-aide" style={{ marginBottom: "8px" }}>{"Aucune sous-matière : la matière se note d'un seul bloc sur " + coef + ". Ajoutes-en au moins deux pour la diviser."}</div>}
              {rows.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "8px" }}>
                  <div style={{ display: "flex", gap: "8px", fontSize: "12px", fontWeight: 700, color: "var(--text-dim)" }}>
                    <span style={{ width: "22px" }}></span><span style={{ flex: 1 }}>{"Nom"}</span><span style={{ width: "96px" }}>{"Maximum"}</span><span style={{ width: "150px" }}></span>
                  </div>
                  {rows.map((r, i) => {
                    const note = r.nb_notes > 0;
                    return (
                      <div key={r.cle} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        <span style={{ width: "22px", color: "var(--text-dim)", fontSize: "12px" }}>{i + 1}</span>
                        <input style={{ ...entree, flex: 1, width: "auto" }} value={r.nom} maxLength={60} placeholder={"ex. Grammaire"} aria-label={"Nom de la sous-matière " + (i + 1)} onChange={(e) => maj(r.cle, { nom: e.target.value })} disabled={envoi.occupe} />
                        <input style={{ ...entree, width: "96px" }} type="number" min="0" step="0.5" value={r.maximum} placeholder={"0"} aria-label={"Maximum de la sous-matière " + (i + 1)} onChange={(e) => maj(r.cle, { maximum: e.target.value })} disabled={envoi.occupe || note} title={note ? "Des notes existent : le maximum ne peut plus changer." : undefined} />
                        <span style={{ width: "150px", display: "flex", gap: "4px", justifyContent: "flex-end" }}>
                          <button type="button" className="btn-gray-cancel btn-sm" onClick={() => completer(r.cle)} disabled={envoi.occupe || note || reste === 0 || (reste < 0 && cents(r.maximum) + Math.round(reste * 100) <= 0)} title={"Mettre ici ce qu'il reste à répartir"} aria-label={"Compléter la sous-matière " + (i + 1)}>{"Reste"}</button>
                          <button type="button" className="btn-gray-cancel btn-sm" onClick={() => deplacer(i, -1)} disabled={envoi.occupe || i === 0} aria-label={"Monter la sous-matière " + (i + 1)}>{"▲"}</button>
                          <button type="button" className="btn-gray-cancel btn-sm" onClick={() => deplacer(i, 1)} disabled={envoi.occupe || i === rows.length - 1} aria-label={"Descendre la sous-matière " + (i + 1)}>{"▼"}</button>
                          <button type="button" className="btn-red btn-sm" onClick={() => retirer(r.cle)} disabled={envoi.occupe || note} title={note ? "Des notes existent : elle ne peut pas être retirée." : "Retirer cette sous-matière"} aria-label={"Retirer la sous-matière " + (i + 1)}>{"✕"}</button>
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                <button type="button" className="btn-gray-cancel btn-sm" onClick={ajouter} disabled={envoi.occupe || rows.length >= 30}>{"+ Ajouter une sous-matière"}</button>
                <span role="status" style={{ fontWeight: 700, color: couleur }}>
                  {rows.length === 0 ? "" : "Total des sous-matières : " + total + " / " + coef + (reste > 0 ? " · il reste " + reste + " à répartir" : reste < 0 ? " · dépassement de " + (-reste) : " ✓")}
                </span>
              </div>
              {rows.length === 1 && <div className="wf-aide">{"Une seule sous-matière n'a pas de sens : ajoute-en une deuxième, ou retire-la."}</div>}
              {rows.length >= 2 && !nomsOk && <div className="wf-aide" style={{ color: "var(--err, #c33)" }}>{"Chaque sous-matière a besoin d'un nom, et deux ne peuvent pas porter le même."}</div>}
              {rows.length >= 2 && nomsOk && !maxOk && <div className="wf-aide" style={{ color: "var(--err, #c33)" }}>{"Le maximum de chaque sous-matière doit être supérieur à 0."}</div>}
              {rows.some((r) => r.nb_notes > 0) && <div className="wf-aide">{"Les sous-matières qui ont déjà des notes gardent leur maximum et ne peuvent pas être retirées ; tu peux les renommer et les réordonner."}</div>}
              <div className="wf-aide" style={{ marginTop: "10px" }}>{"Pour appliquer les mêmes sous-matières à d'autres classes : « Copier vers d'autres classes » avec l'option « La remplacer »."}</div>
            </>
          )}
        </>
      )}
    </Fenetre>
  );
}

// Reprendre les affectations d'une autre annee
function FenetreCopieAffectations({ annee, anneeId, years, fermer, apres }) {
  const [source, setSource] = useState("");
  const envoi = useEnvoi();
  const autres = (years || []).filter((y) => String(y.id) !== String(anneeId));
  const valider = () => {
    if (!source) return;
    envoi.envoyer(async () => {
      await api("/api/matieres-classe/copier-annee", "POST", { from_year: source, to_year: anneeId });
      await apres("Copie terminée.");
    });
  };
  return (
    <Fenetre
      titre={"Reprendre d'une autre année"}
      sousTitre={"Copiez les affectations d'une année vers " + (annee ? annee.nom : "l'année choisie") + "."}
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
        <div className="wf-aide">{"Les catégories, coefficients, heures et enseignants de chaque classe sont copiés vers les classes de même nom de cette année."}</div>
      </div>
    </Fenetre>
  );
}

// ---------------------------------------------------------------------------
// AFFECTATION EN LOT : copier les matieres d'une classe vers d'autres classes, affecter une matiere a plusieurs classes
// ---------------------------------------------------------------------------
const caseAuto = { width: "auto", margin: 0, flex: "none" };
const boite = { border: "1px solid var(--line, rgba(255,255,255,0.12))", borderRadius: "10px", padding: "10px 12px" };
const ligneCase = { display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", cursor: "pointer" };
const naturel = (a, b) => String(a || "").localeCompare(String(b || ""), "fr", { numeric: true, sensitivity: "base" });

// Classes groupees par section, avec une case par classe et une case "toute la section"
function SelecteurClasses({ classes, choisies, onChange, exclure, desactive }) {
  const liste = classes.filter((c) => String(c.id) !== String(exclure));
  const sections = [];
  const parId = {};
  for (const c of liste) {
    const k = c.section_id || 0;
    if (!parId[k]) { parId[k] = { id: k, nom: c.section_nom || "Sans section", classes: [] }; sections.push(parId[k]); }
    parId[k].classes.push(c);
  }
  sections.sort((a, b) => naturel(a.nom, b.nom));
  sections.forEach((s) => s.classes.sort((a, b) => naturel(a.nom, b.nom)));
  const bascule = (id) => { const n = new Set(choisies); if (n.has(id)) n.delete(id); else n.add(id); onChange(n); };
  const basculeSection = (s) => {
    const ids = s.classes.map((c) => String(c.id));
    const tout = ids.every((i) => choisies.has(i));
    const n = new Set(choisies);
    ids.forEach((i) => { if (tout) n.delete(i); else n.add(i); });
    onChange(n);
  };
  const toutes = liste.map((c) => String(c.id));
  const toutCoche = toutes.length > 0 && toutes.every((i) => choisies.has(i));
  const nb = toutes.filter((i) => choisies.has(i)).length;
  const etatSection = (el, s) => { if (el) { const n = s.classes.filter((c) => choisies.has(String(c.id))).length; el.indeterminate = n > 0 && n < s.classes.length; } };
  if (!liste.length) return <div style={{ color: "var(--text-dim)", fontSize: "13px" }}>{"Aucune autre classe dans cette année."}</div>;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px", flexWrap: "wrap" }}>
        <span style={{ fontSize: "13px", fontWeight: 600 }}>{nb + " classe(s) cochée(s) sur " + toutes.length}</span>
        <button type="button" className="btn-gray-cancel btn-sm" disabled={desactive} onClick={() => onChange(toutCoche ? new Set() : new Set(toutes))}>{toutCoche ? "Tout décocher" : "Tout cocher"}</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "260px", overflowY: "auto" }}>
        {sections.map((s) => (
          <div key={s.id} style={boite}>
            <label style={{ ...ligneCase, fontWeight: 700, marginBottom: "6px" }}>
              <input type="checkbox" style={caseAuto} disabled={desactive} ref={(el) => etatSection(el, s)} checked={s.classes.every((c) => choisies.has(String(c.id)))} onChange={() => basculeSection(s)} aria-label={"Toute la section " + s.nom} />
              <span>{s.nom}</span>
              <span style={{ fontWeight: 400, color: "var(--text-dim)" }}>{"(" + s.classes.length + (s.classes.length > 1 ? " classes" : " classe") + " : cocher toute la section)"}</span>
            </label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 18px", paddingLeft: "24px" }}>
              {s.classes.map((c) => (
                <label key={c.id} style={ligneCase}>
                  <input type="checkbox" style={caseAuto} disabled={desactive} checked={choisies.has(String(c.id))} onChange={() => bascule(String(c.id))} />
                  <span>{c.nom}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Recapitulatif d'un apercu : ce qui sera ajoute, remplace, laisse, ignore, classe par classe
function RecapLot({ apercu }) {
  const r = apercu.resume;
  const parClasse = [];
  const idx = {};
  for (const l of apercu.lignes) {
    if (!idx[l.class_id]) { idx[l.class_id] = { classe: l.classe, ajouter: 0, remplacer: 0, laisser: 0, identique: 0, ignorer_notes: 0, introuvable: 0 }; parClasse.push(idx[l.class_id]); }
    idx[l.class_id][l.action] += 1;
  }
  parClasse.sort((a, b) => naturel(a.classe, b.classe));
  const aEcrire = r.ajoutees + r.remplacees;
  const ignorees = apercu.lignes.filter((l) => l.action === "ignorer_notes" || l.action === "introuvable");
  const cell = (n) => (n ? <strong>{n}</strong> : <span style={{ color: "var(--text-dim)" }}>{"0"}</span>);
  return (
    <>
      <div className="wf-avis" role="status">
        <strong>{aEcrire > 0 ? aEcrire + " affectation(s) seront écrites" : "Rien à écrire : tout est déjà en place"}</strong>
        <div>{r.ajoutees + " ajoutée(s) · " + r.remplacees + " remplacée(s) · " + r.laissees + " laissée(s) telles quelles · " + r.identiques + " identique(s)" + (r.ignorees ? " · " + r.ignorees + " non modifiable(s) (notes ou sous-matières)" : "")}</div>
        {r.avec_sous_matieres > 0 && <div>{"Dont " + r.avec_sous_matieres + " avec leurs sous-matières."}</div>}
        {r.sans_sous_matieres > 0 && <div style={{ color: "var(--err, #c33)" }}>{r.sans_sous_matieres + " matière(s) seront ajoutées sans leurs sous-matières (des notes existent déjà pour elles)."}</div>}
      </div>
      <div className="table-card" style={{ maxHeight: "240px", overflowY: "auto" }}>
        <table className="data-table">
          <thead><tr><th>{"Classe"}</th><th>{"Ajoutées"}</th><th>{"Remplacées"}</th><th>{"Laissées"}</th><th>{"Identiques"}</th><th>{"Non modifiables"}</th></tr></thead>
          <tbody>
            {parClasse.map((c) => (
              <tr key={c.classe}><td><strong>{c.classe}</strong></td><td>{cell(c.ajouter)}</td><td>{cell(c.remplacer)}</td><td>{cell(c.laisser)}</td><td>{cell(c.identique)}</td><td>{cell(c.ignorer_notes + c.introuvable)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      {ignorees.length > 0 && (
        <div className="wf-aide" style={{ color: "var(--err, #c33)" }}>
          {"Non modifiables : " + ignorees.slice(0, 6).map((l) => l.matiere + " (" + l.classe + ")").join(", ") + (ignorees.length > 6 ? ", ..." : "") + ". " + (ignorees[0].raison || "")}
        </div>
      )}
    </>
  );
}

function ChoixExistant({ valeur, onChange, desactive, nomSource }) {
  return (
    <div className="form-group">
      <label>{"Si la matière est déjà dans une classe cochée"}</label>
      <label style={ligneCase}>
        <input type="radio" name="si_existe" style={caseAuto} disabled={desactive} checked={valeur === "laisser"} onChange={() => onChange("laisser")} />
        <span>{"La laisser telle quelle (recommandé)"}</span>
      </label>
      <label style={{ ...ligneCase, marginTop: "6px" }}>
        <input type="radio" name="si_existe" style={caseAuto} disabled={desactive} checked={valeur === "remplacer"} onChange={() => onChange("remplacer")} />
        <span>{"La remplacer par " + (nomSource || "les valeurs données") + " (coefficient, catégorie, heures, sous-matières)"}</span>
      </label>
      <div className="wf-aide">{"Une matière qui a déjà des notes dans la classe cible n'est jamais modifiée ici, car son coefficient ou ses sous-matières changeraient les bulletins. Les sous-matières suivent la matière."}</div>
    </div>
  );
}

function PiedEtapes({ etape, fermer, occupe, retour, libelleChoix, libelleRecap, desactive, envoi }) {
  if (etape === "recap") {
    return (
      <>
        <button type="button" className="btn-gray-cancel" onClick={retour} disabled={occupe}>{"Retour"}</button>
        <button type="submit" className="btn-primary" disabled={occupe || desactive}>{occupe ? "En cours..." : libelleRecap}</button>
      </>
    );
  }
  return <PiedStandard fermer={fermer} occupe={occupe} libelle={libelleChoix} desactive={desactive} envoi={envoi} />;
}

// Copier les matieres d'une classe (modele) vers une ou plusieurs autres classes
function FenetreCopieClasses({ classeId, classes, lignes, fermer, apres }) {
  const envoi = useEnvoi();
  const depart = lignes.length > 0;
  const [source, setSource] = useState(depart ? String(classeId) : "");
  const [lignesSrc, setLignesSrc] = useState(depart ? lignes : []);
  const [chargeSrc, setChargeSrc] = useState(depart);
  const [matieres, setMatieres] = useState(new Set(lignes.filter((l) => l.statut !== "inactive").map((l) => String(l.subject_id))));
  const [cibles, setCibles] = useState(new Set(depart ? [] : [String(classeId)]));
  const [avecEns, setAvecEns] = useState(false);
  const [si, setSi] = useState("laisser");
  const [etape, setEtape] = useState("choix");
  const [apercu, setApercu] = useState(null);
  const nomSource = (classes.find((c) => String(c.id) === String(source)) || {}).nom || "";

  const changerSource = async (id) => {
    setSource(id); setEtape("choix"); setApercu(null);
    setCibles((c) => { const n = new Set(c); n.delete(id); return n; });
    if (!id) { setLignesSrc([]); setMatieres(new Set()); return; }
    setChargeSrc(false);
    try {
      const l = await api("/api/matieres-classe?class_id=" + id);
      setLignesSrc(l);
      setMatieres(new Set(l.filter((x) => x.statut !== "inactive").map((x) => String(x.subject_id))));
    } catch (e) { envoi.setErr(e.message); setLignesSrc([]); setMatieres(new Set()); }
    setChargeSrc(true);
  };
  useEffect(() => { if (!depart) setChargeSrc(true); }, []);

  const basculeMat = (id) => { const n = new Set(matieres); if (n.has(id)) n.delete(id); else n.add(id); setMatieres(n); setEtape("choix"); setApercu(null); };
  const toutesMat = lignesSrc.length > 0 && lignesSrc.every((l) => matieres.has(String(l.subject_id)));
  const spec = () => ({
    source_class_id: source, subject_ids: [...matieres].join(","), class_ids: [...cibles].join(","),
    copier_enseignants: avecEns ? "1" : undefined, si_existe: si
  });
  const pret = !!source && matieres.size > 0 && cibles.size > 0;
  const modifie = cibles.size > 0 || avecEns || si !== "laisser" || (depart ? false : !!source);
  const valider = () => {
    if (!pret) return;
    if (etape === "choix") {
      envoi.envoyer(async () => {
        const q = new URLSearchParams(Object.fromEntries(Object.entries(spec()).filter(([, v]) => v !== undefined && v !== ""))).toString();
        setApercu(await api("/api/apercu-matieres-classe?" + q));
        setEtape("recap");
      });
    } else {
      envoi.envoyer(async () => {
        const r = await api("/api/matieres-classe/lot", "POST", { ...spec(), copier_enseignants: avecEns ? 1 : 0 });
        const n = r.ajoutees + r.remplacees;
        await apres("Copie terminée depuis " + nomSource + " : " + r.ajoutees + " matière(s) ajoutée(s), " + r.remplacees + " remplacée(s)" + (r.laissees ? ", " + r.laissees + " laissée(s) telles quelles" : "") + (r.ignorees ? ", " + r.ignorees + " non modifiable(s) (notes ou sous-matières)" : "") + (n === 0 ? " — rien n'a changé." : "."));
      });
    }
  };
  const aEcrire = apercu ? apercu.resume.ajoutees + apercu.resume.remplacees : 0;
  const bloque = envoi.occupe;
  return (
    <Fenetre
      titre={"Copier les matières vers d'autres classes"}
      sousTitre={etape === "choix" ? "Choisissez la classe modèle, ses matières, puis les classes qui doivent les recevoir." : "Vérifiez le récapitulatif avant d'écrire."}
      largeur="660px"
      fermer={fermer}
      occupe={envoi.occupe}
      protege={modifie}
      onSubmit={valider}
      pied={<PiedEtapes etape={etape} fermer={fermer} occupe={envoi.occupe} retour={() => { setEtape("choix"); setApercu(null); }} libelleChoix={"Voir le récapitulatif"} libelleRecap={"Copier maintenant"} desactive={etape === "choix" ? !pret : aEcrire === 0} envoi={envoi} />}
    >
      <MessageEnvoi envoi={envoi} />
      {etape === "choix" && (
        <>
          <div className="form-group">
            <label>{"Classe modèle (celle dont on copie les matières) *"}</label>
            <select value={source} onChange={(e) => changerSource(e.target.value)} disabled={bloque}>
              <option value="">{"— Choisir —"}</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
          </div>
          {source && !chargeSrc && <div className="wf-aide">{"Chargement..."}</div>}
          {source && chargeSrc && lignesSrc.length === 0 && <div className="wf-aide">{"Cette classe n'a aucune matière à copier."}</div>}
          {source && chargeSrc && lignesSrc.length > 0 && (
            <div className="form-group">
              <label>{"Matières à copier"}</label>
              <div style={boite}>
                <label style={{ ...ligneCase, fontWeight: 700, marginBottom: "6px" }}>
                  <input type="checkbox" style={caseAuto} checked={toutesMat} onChange={() => { setMatieres(toutesMat ? new Set() : new Set(lignesSrc.map((l) => String(l.subject_id)))); setEtape("choix"); setApercu(null); }} aria-label="Toutes les matières" />
                  <span>{"Toutes les matières (" + matieres.size + " cochée(s) sur " + lignesSrc.length + ")"}</span>
                </label>
                <div style={{ display: "flex", flexDirection: "column", gap: "5px", maxHeight: "170px", overflowY: "auto", paddingLeft: "24px" }}>
                  {lignesSrc.map((l) => (
                    <label key={l.id} style={ligneCase}>
                      <input type="checkbox" style={caseAuto} checked={matieres.has(String(l.subject_id))} onChange={() => basculeMat(String(l.subject_id))} />
                      <span>{l.matiere_nom}</span>
                      <span style={{ color: "var(--text-dim)" }}>{"(coefficient " + l.coefficient + (l.sous_matieres && l.sous_matieres.length ? ", " + l.sous_matieres.length + " sous-matières" : "") + (l.statut === "inactive" ? ", inactive" : "") + ")"}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}
          <div className="form-group">
            <label>{"Classes qui reçoivent les matières *"}</label>
            <SelecteurClasses classes={classes} choisies={cibles} onChange={(n) => { setCibles(n); setEtape("choix"); setApercu(null); }} exclure={source} desactive={bloque} />
          </div>
          <ChoixExistant valeur={si} onChange={(v) => { setSi(v); setApercu(null); }} desactive={bloque} nomSource={nomSource || "celle de la classe modèle"} />
          <div className="form-group">
            <label style={ligneCase}>
              <input type="checkbox" style={caseAuto} checked={avecEns} onChange={(e) => { setAvecEns(e.target.checked); setApercu(null); }} disabled={bloque} />
              <span>{"Copier aussi les enseignants"}</span>
            </label>
            <div className="wf-aide">{"Par défaut les matières arrivent sans enseignant : chaque classe a souvent le sien."}</div>
          </div>
        </>
      )}
      {etape === "recap" && apercu && (
        <>
          <p className="wf-texte">{"Copie des matières de "}<strong>{nomSource}</strong>{" vers " + cibles.size + " classe(s)."}</p>
          <RecapLot apercu={apercu} />
        </>
      )}
    </Fenetre>
  );
}

// Affecter une meme matiere (meme coefficient, categorie, heures, enseignant) a plusieurs classes ou a toute une section
function FenetreAffecterPlusieurs({ annee, classes, matieres, categories, enseignants, fermer, apres }) {
  const envoi = useEnvoi();
  const [f, setF] = useState({ subject_id: "", category_id: "", coefficient: "", heures: "", employee_id: "" });
  const [cibles, setCibles] = useState(new Set());
  const [si, setSi] = useState("laisser");
  const [etape, setEtape] = useState("choix");
  const [apercu, setApercu] = useState(null);
  const actives = matieres.filter((m) => m.statut !== "inactive");
  const catsChoisies = categories.filter((c) => c.statut !== "inactive");
  const matiere = matieres.find((m) => String(m.id) === String(f.subject_id));
  const maj = (k, v) => { setF({ ...f, [k]: v }); setEtape("choix"); setApercu(null); };
  const pret = !!f.subject_id && Number(f.coefficient) > 0 && cibles.size > 0;
  const spec = () => ({
    subject_id: f.subject_id, class_ids: [...cibles].join(","), coefficient: f.coefficient,
    heures_semaine: f.heures === "" ? undefined : f.heures, category_id: f.category_id || undefined, employee_id: f.employee_id || undefined, si_existe: si
  });
  const modifie = !!f.subject_id || !!f.coefficient || cibles.size > 0;
  const valider = () => {
    if (!pret) return;
    if (etape === "choix") {
      envoi.envoyer(async () => {
        const q = new URLSearchParams(Object.fromEntries(Object.entries(spec()).filter(([, v]) => v !== undefined && v !== ""))).toString();
        setApercu(await api("/api/apercu-matieres-classe?" + q));
        setEtape("recap");
      });
    } else {
      envoi.envoyer(async () => {
        const r = await api("/api/matieres-classe/lot", "POST", spec());
        await apres("« " + (matiere ? matiere.nom : "La matière") + " » : " + r.ajoutees + " classe(s) ajoutée(s), " + r.remplacees + " remplacée(s)" + (r.laissees ? ", " + r.laissees + " laissée(s) telles quelles" : "") + (r.ignorees ? ", " + r.ignorees + " non modifiable(s) (notes ou sous-matières)" : "") + ".");
      });
    }
  };
  const aEcrire = apercu ? apercu.resume.ajoutees + apercu.resume.remplacees : 0;
  const bloque = envoi.occupe;
  return (
    <Fenetre
      titre={"Affecter une matière à plusieurs classes"}
      sousTitre={etape === "choix" ? "La même matière, avec les mêmes réglages, pour les classes cochées" + (annee ? " (" + annee.nom + ")." : ".") : "Vérifiez le récapitulatif avant d'écrire."}
      largeur="660px"
      fermer={fermer}
      occupe={envoi.occupe}
      protege={modifie}
      onSubmit={valider}
      pied={<PiedEtapes etape={etape} fermer={fermer} occupe={envoi.occupe} retour={() => { setEtape("choix"); setApercu(null); }} libelleChoix={"Voir le récapitulatif"} libelleRecap={"Affecter maintenant"} desactive={etape === "choix" ? !pret : aEcrire === 0} envoi={envoi} />}
    >
      <MessageEnvoi envoi={envoi} />
      {etape === "choix" && (
        <>
          <div className="form-group">
            <label>{"Matière *"}</label>
            <select value={f.subject_id} onChange={(e) => maj("subject_id", e.target.value)} disabled={bloque}>
              <option value="">{"Sélectionner une matière du catalogue"}</option>
              {actives.map((m) => <option key={m.id} value={m.id}>{(m.code ? m.code + " — " : "") + m.nom}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>{"Coefficient (note maximale) *"}</label>
            <input type="number" min="0" step="0.5" value={f.coefficient} placeholder="ex. 20" onChange={(e) => maj("coefficient", e.target.value)} disabled={bloque} />
          </div>
          <div className="form-group">
            <label>{"Catégorie"}</label>
            <select value={f.category_id} onChange={(e) => maj("category_id", e.target.value)} disabled={bloque}>
              <option value="">{"Aucune (inchangée si la matière existe déjà)"}</option>
              {catsChoisies.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>{"Heures par semaine"}</label>
            <input type="number" min="0" step="0.5" value={f.heures} placeholder="0" onChange={(e) => maj("heures", e.target.value)} disabled={bloque} />
          </div>
          <div className="form-group">
            <label>{"Enseignant"}</label>
            <select value={f.employee_id} onChange={(e) => maj("employee_id", e.target.value)} disabled={bloque}>
              <option value="">{"Non assigné (inchangé si la matière existe déjà)"}</option>
              {enseignants.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
            </select>
            <div className="wf-aide">{"Laisse vide pour affecter sans enseignant : tu pourras l'indiquer classe par classe."}</div>
          </div>
          <div className="form-group">
            <label>{"Classes concernées *"}</label>
            <SelecteurClasses classes={classes} choisies={cibles} onChange={(n) => { setCibles(n); setEtape("choix"); setApercu(null); }} desactive={bloque} />
          </div>
          <ChoixExistant valeur={si} onChange={(v) => { setSi(v); setApercu(null); }} desactive={bloque} nomSource={"les valeurs ci-dessus"} />
        </>
      )}
      {etape === "recap" && apercu && (
        <>
          <p className="wf-texte">{"Matière "}<strong>{matiere ? matiere.nom : ""}</strong>{", coefficient " + f.coefficient + ", pour " + cibles.size + " classe(s)."}</p>
          <RecapLot apercu={apercu} />
        </>
      )}
    </Fenetre>
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
