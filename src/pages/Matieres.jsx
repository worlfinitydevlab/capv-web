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
  const [fen, setFen] = useState(null); // { type: "affecter" } | { type: "modifier", l } | { type: "retirer", l } | { type: "copier" }

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
              texte={"Affecte les matières du catalogue à cette classe : tu choisis son coefficient, sa catégorie et son enseignant. Tu peux aussi reprendre les affectations d'une autre année."}
              libelleBouton={"Affecter la première matière"}
              onBouton={ouvrirAffecter}
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
                        <td><strong>{l.matiere_nom}</strong>{l.matiere_code ? <span className="wf-petit">{l.matiere_code}</span> : null}</td>
                        <td>{catNom(l.category_id) || <span className="wf-etiquette">{"Sans catégorie"}</span>}</td>
                        <td>{l.coefficient}</td>
                        <td>{l.heures_semaine}</td>
                        <td>{ensNom(l.employee_id) || <span style={{ color: "var(--text-dim)" }}>{"Non assigné"}</span>}</td>
                        <td><Pastille actif={l.statut !== "inactive"} /></td>
                        <td className="table-actions"><button className="btn-sm btn-gray-cancel" onClick={() => setFen({ type: "modifier", l })}>Modifier</button> <button className="btn-sm btn-red" onClick={() => setFen({ type: "retirer", l })}>Retirer</button></td>
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
      {fen && fen.type === "copier" && (
        <FenetreCopieAffectations annee={annee} anneeId={anneeId} years={years} fermer={fermer} apres={apres} />
      )}
    </>
  );
}

// Affecter une matiere a la classe (ligne absente) ou modifier une affectation (ligne donnee)
function FenetreAffectation({ ligne, classe, classeId, disponibles, categories, enseignants, fermer, apres }) {
  const edition = !!ligne;
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
        <input type="number" min="0" step="0.5" value={f.coefficient} onChange={(e) => setF({ ...f, coefficient: e.target.value })} />
        <div className="wf-aide">{"Le coefficient est la note maximale de la matière dans cette classe."}</div>
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
