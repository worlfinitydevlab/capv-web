import React, { useState, useEffect, useRef } from "react";
import { useYear as useYear } from "../YearContext.jsx";
import { authPourAction, definirUtilisateur } from "../pedagogie/confirmAction.js";
import { usePontPedagogie } from "../pedagogie/pont.js";

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

  const chargerMatieres = async () => { try { setMatieres(await api("/api/matieres")); } catch (e) { setErr(e.message); } };
  const chargerEnseignants = async () => { try { setEnseignants(await api("/api/enseignants")); } catch (e) { setErr(e.message); } };
  const chargerCategories = async () => { try { setCategories(await api("/api/categories-matieres")); } catch (e) { setErr(e.message); } };
  useEffect(() => { chargerMatieres(); chargerEnseignants(); chargerCategories(); }, []);

  const executer = async (fn, ok) => {
    setErr(""); setMsg("");
    try { await fn(); if (ok) setMsg(ok); } catch (e) { setErr(e.message); }
  };

  const onglets = [["catalogue", "Catalogue des matières"], ["categories", "Catégories"], ["classe", "Affectation par classe"], ["enseignants", "Enseignants"]];

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">{"Matières & Enseignants"}</h1>
          <p className="page-subtitle">{"Le catalogue général des matières (identité seulement), les catégories, puis l'affectation de chaque matière à une classe (catégorie, coefficient et enseignant propres à la classe) et la liste des enseignants."}</p>
        </div>
      </div>
      <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
        {onglets.map(([k, t]) => (
          <button key={k} className={onglet === k ? "btn-primary" : "btn-gray-cancel"} onClick={() => { setOnglet(k); setErr(""); setMsg(""); }}>{t}</button>
        ))}
      </div>
      {err && <div className="login-error" style={{ marginBottom: "14px" }}>{err}</div>}
      {msg && <div style={{ ...carte, borderColor: "rgba(80,200,120,0.5)" }}>{msg}</div>}

      {onglet === "catalogue" && <Catalogue matieres={matieres} recharger={chargerMatieres} executer={executer} />}
      {onglet === "categories" && <Categories afficherPoids={afficherPoids} categories={categories} recharger={async () => { await chargerCategories(); await chargerMatieres(); }} executer={executer} />}
      {onglet === "classe" && <ParClasse matieres={matieres} enseignants={enseignants} categories={categories} executer={executer} />}
      {onglet === "enseignants" && <Enseignants enseignants={enseignants} recharger={chargerEnseignants} executer={executer} />}
    </div>
  );
}

function Catalogue({ matieres, recharger, executer }) {
  const vide = { nom: "", code: "", description: "", statut: "active" };
  const [f, setF] = useState(vide);
  const [edit, setEdit] = useState(null);
  const ajouter = () => executer(async () => {
    const r = await api("/api/matieres", "POST", f);
    setF(vide);
    await recharger();
    return r;
  }, "Matière ajoutée au catalogue. Elle n'est utilisée dans aucune classe tant qu'elle n'est pas affectée (onglet Affectation par classe).");
  const sauver = () => executer(async () => {
    await api("/api/matieres/" + edit.id, "PUT", edit);
    setEdit(null);
    await recharger();
  });
  const supprimer = (m) => {
    if (!window.confirm("Supprimer la matière " + m.nom + " ? Elle sera retirée de toutes les classes.")) return;
    executer(async () => { await api("/api/matieres/" + m.id, "DELETE"); await recharger(); });
  };
  const STATUTS = [["active", "Active"], ["inactive", "Inactive"]];
  return (
    <>
      <div style={carte}>
        <h3 style={{ marginTop: 0 }}>{"Ajouter une matière au catalogue"}</h3>
        <p style={{ color: "var(--text-dim)", fontSize: "13px", marginTop: 0 }}>{"Ici on crée seulement l'identité de la matière. La classe, le coefficient, la catégorie et l'enseignant se définissent ensuite dans « Affectation par classe »."}</p>
        <div className="form-row">
          <div className="form-group"><label>{"Identifiant (unique)"}</label><input value={f.code} placeholder={"MAT001 (généré si vide)"} onChange={(e) => setF({ ...f, code: e.target.value })} /></div>
          <div className="form-group"><label>{"Nom *"}</label><input value={f.nom} placeholder={"Mathématiques"} onChange={(e) => setF({ ...f, nom: e.target.value })} /></div>
          <div className="form-group"><label>{"Description (facultative)"}</label><input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
          <div className="form-group"><label>Statut</label>
            <select value={f.statut} onChange={(e) => setF({ ...f, statut: e.target.value })}>{STATUTS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
          </div>
        </div>
        <button className="btn-primary" onClick={ajouter} disabled={!f.nom.trim()}>{"Ajouter"}</button>
      </div>
      <div className="table-card">
        <table className="data-table">
          <thead><tr><th>{"Identifiant"}</th><th>{"Matière"}</th><th>Description</th><th>Statut</th><th>{"Classes"}</th><th></th></tr></thead>
          <tbody>
            {matieres.map((m) => edit && edit.id === m.id ? (
              <tr key={m.id}>
                <td><input value={edit.code || ""} onChange={(e) => setEdit({ ...edit, code: e.target.value })} /></td>
                <td><input value={edit.nom} onChange={(e) => setEdit({ ...edit, nom: e.target.value })} /></td>
                <td><input value={edit.description || ""} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></td>
                <td><select value={edit.statut || "active"} onChange={(e) => setEdit({ ...edit, statut: e.target.value })}>{STATUTS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></td>
                <td>{m.nb_classes}</td>
                <td className="table-actions"><button className="btn-sm btn-green" onClick={sauver}>OK</button> <button className="btn-sm btn-gray-cancel" onClick={() => setEdit(null)}>Annuler</button></td>
              </tr>
            ) : (
              <tr key={m.id} style={m.statut === "inactive" ? { opacity: 0.55 } : undefined}>
                <td>{m.code || "-"}</td><td><strong>{m.nom}</strong></td><td>{m.description || "-"}</td>
                <td>{m.statut === "inactive" ? "Inactive" : "Active"}</td>
                <td>{m.nb_classes}</td>
                <td className="table-actions"><button className="btn-sm btn-gray-cancel" onClick={() => setEdit({ ...m })}>Modifier</button> <button className="btn-sm btn-red" onClick={() => supprimer(m)}>Supprimer</button></td>
              </tr>
            ))}
            {matieres.length === 0 && <tr><td colSpan={6} className="table-empty">{"Aucune matière. Ajoute la première ci-dessus."}</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

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

function Enseignants({ enseignants, recharger, executer }) {
  const [dispo, setDispo] = useState([]);
  const [choix, setChoix] = useState("");
  const [nouveau, setNouveau] = useState({ nom: "", telephone: "" });
  const chargerDispo = async () => { try { setDispo(await api("/api/enseignants/disponibles")); } catch (e) {} };
  useEffect(() => { chargerDispo(); }, [enseignants.length]);

  const marquer = () => executer(async () => { await api("/api/enseignants", "POST", { employee_id: choix }); setChoix(""); await recharger(); await chargerDispo(); });
  const creer = () => executer(async () => { await api("/api/enseignants", "POST", nouveau); setNouveau({ nom: "", telephone: "" }); await recharger(); await chargerDispo(); });
  const retirer = (e) => {
    if (!window.confirm(e.nom + " ne sera plus listé comme enseignant (sa fiche d'employé reste). Continuer ?")) return;
    executer(async () => { await api("/api/enseignants/" + e.id, "DELETE"); await recharger(); await chargerDispo(); });
  };

  return (
    <>
      <div style={carte}>
        <h3 style={{ marginTop: 0 }}>{"Ajouter un enseignant"}</h3>
        <div className="form-row">
          <div className="form-group">
            <label>{"Parmi les employés existants"}</label>
            <div style={{ display: "flex", gap: "8px" }}>
              <select value={choix} onChange={(e) => setChoix(e.target.value)} style={{ flex: 1 }}>
                <option value="">{"— Choisir un employé —"}</option>
                {dispo.map((d) => <option key={d.id} value={d.id}>{d.nom + (d.fonction ? " (" + d.fonction + ")" : "")}</option>)}
              </select>
              <button className="btn-primary" onClick={marquer} disabled={!choix}>{"Marquer enseignant"}</button>
            </div>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group"><label>{"Ou créer un nouvel enseignant : nom *"}</label><input value={nouveau.nom} onChange={(e) => setNouveau({ ...nouveau, nom: e.target.value })} /></div>
          <div className="form-group"><label>{"Téléphone"}</label><input value={nouveau.telephone} onChange={(e) => setNouveau({ ...nouveau, telephone: e.target.value })} /></div>
        </div>
        <button className="btn-primary" onClick={creer} disabled={!nouveau.nom.trim()}>{"Créer l'enseignant"}</button>
      </div>
      <div className="table-card">
        <table className="data-table">
          <thead><tr><th>{"Enseignant"}</th><th>{"Matricule"}</th><th>{"Téléphone"}</th><th>{"Cours (matière - classe)"}</th><th></th></tr></thead>
          <tbody>
            {enseignants.map((e) => (
              <tr key={e.id}>
                <td><strong>{e.nom}</strong>{e.fonction ? <div style={{ fontSize: "12px", color: "var(--text-dim)" }}>{e.fonction}</div> : null}</td>
                <td>{e.matricule}</td><td>{e.telephone || "-"}</td>
                <td style={{ maxWidth: "380px" }}>{e.cours || "-"}</td>
                <td className="table-actions"><button className="btn-sm btn-red" onClick={() => retirer(e)}>Retirer</button></td>
              </tr>
            ))}
            {enseignants.length === 0 && <tr><td colSpan={5} className="table-empty">{"Aucun enseignant."}</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Categories({ afficherPoids, categories, recharger, executer }) {
  const vide = { nom: "", description: "", poids: "1", statut: "active" };
  const [f, setF] = useState(vide);
  const [edit, setEdit] = useState(null);
  const ajouter = () => executer(async () => { await api("/api/categories-matieres", "POST", f); setF(vide); await recharger(); });
  const sauver = () => executer(async () => { await api("/api/categories-matieres/" + edit.id, "PUT", edit); setEdit(null); await recharger(); });
  const supprimer = (c) => {
    if (!window.confirm("Supprimer la catégorie " + c.nom + " ?")) return;
    executer(async () => { await api("/api/categories-matieres/" + c.id, "DELETE"); await recharger(); });
  };
  const STATUTS = [["active", "Active"], ["inactive", "Inactive"]];
  return (
    <>
      <div style={carte}>
        <h3 style={{ marginTop: 0 }}>{"Catégories de matières"}</h3>
        <p style={{ color: "var(--text-dim)", fontSize: "13px", marginTop: 0 }}>{"Le nombre et les noms des catégories sont libres. Une catégorie ne contient aucune matière par elle-même : c'est dans « Affectation par classe » qu'on choisit la catégorie de chaque matière pour chaque classe."}</p>
        <div className="form-row">
          <div className="form-group"><label>{"Nom de la catégorie *"}</label><input value={f.nom} placeholder={"Matières de base"} onChange={(e) => setF({ ...f, nom: e.target.value })} /></div>
          <div className="form-group"><label>Description</label><input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
          {afficherPoids && <div className="form-group"><label>Poids</label><input type="number" min="0" step="0.5" value={f.poids} onChange={(e) => setF({ ...f, poids: e.target.value })} /></div>}
          <div className="form-group"><label>Statut</label>
            <select value={f.statut} onChange={(e) => setF({ ...f, statut: e.target.value })}>{STATUTS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
          </div>
        </div>
        <button className="btn-primary" onClick={ajouter} disabled={!f.nom.trim()}>{"Ajouter la catégorie"}</button>
      </div>
      <div className="table-card">
        <table className="data-table">
          <thead><tr><th>Ordre</th><th>{"Catégorie"}</th><th>Description</th>{afficherPoids && <th>Poids</th>}<th>Statut</th><th>{"Affectations"}</th><th></th></tr></thead>
          <tbody>
            {categories.map((c) => edit && edit.id === c.id ? (
              <tr key={c.id}>
                <td><input type="number" style={{ width: "70px" }} value={edit.ordre} onChange={(e) => setEdit({ ...edit, ordre: e.target.value })} /></td>
                <td><input value={edit.nom} onChange={(e) => setEdit({ ...edit, nom: e.target.value })} /></td>
                <td><input value={edit.description || ""} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></td>
                {afficherPoids && <td><input type="number" min="0" step="0.5" style={{ width: "70px" }} value={edit.poids} onChange={(e) => setEdit({ ...edit, poids: e.target.value })} /></td>}
                <td><select value={edit.statut || "active"} onChange={(e) => setEdit({ ...edit, statut: e.target.value })}>{STATUTS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></td>
                <td>{c.nb_matieres}</td>
                <td className="table-actions"><button className="btn-sm btn-green" onClick={sauver}>OK</button> <button className="btn-sm btn-gray-cancel" onClick={() => setEdit(null)}>Annuler</button></td>
              </tr>
            ) : (
              <tr key={c.id} style={c.statut === "inactive" ? { opacity: 0.55 } : undefined}>
                <td>{c.ordre}</td><td><strong>{c.nom}</strong></td><td>{c.description || "-"}</td>{afficherPoids && <td>{c.poids}</td>}
                <td>{c.statut === "inactive" ? "Inactive" : "Active"}</td><td>{c.nb_matieres}</td>
                <td className="table-actions"><button className="btn-sm btn-gray-cancel" onClick={() => setEdit({ ...c })}>Modifier</button> <button className="btn-sm btn-red" onClick={() => supprimer(c)}>Supprimer</button></td>
              </tr>
            ))}
            {categories.length === 0 && <tr><td colSpan={7} className="table-empty">{"Aucune catégorie. Crée la première ci-dessus."}</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
