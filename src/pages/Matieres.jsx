import React, { useState, useEffect } from "react";
import { useAuth } from "../AuthContext.jsx";
import { getAuthedClient } from "../supabaseClient.js";

const carte = { background: "var(--card-bg, rgba(255,255,255,0.04))", border: "1px solid var(--border, rgba(255,255,255,0.1))", borderRadius: "12px", padding: "18px 20px", marginBottom: "20px" };

const maintenant = () => new Date().toISOString();
const ok = (r) => { if (r && r.error) throw new Error(r.error.message); return r; };

function creerApi(supabase, par) {
  const meta = () => ({ last_modified_at: maintenant(), modified_by: par });
  const api = {
    supabase,
    async classesDeAnnee(yid) {
      if (!yid) return [];
      const { data: secs } = await supabase.from("sections").select("id").eq("academic_year_uuid", yid).is("deleted_at", null);
      const sids = (secs || []).map((s) => s.id);
      if (!sids.length) return [];
      const { data } = await supabase.from("classes").select("id, nom").in("section_uuid", sids).is("deleted_at", null).order("nom");
      return data || [];
    },
    async matieres() {
      const { data: ms } = await supabase.from("subjects").select("*").is("deleted_at", null).order("nom");
      const { data: cs } = await supabase.from("class_subjects").select("subject_uuid").is("deleted_at", null);
      const n = {};
      (cs || []).forEach((c) => { n[c.subject_uuid] = (n[c.subject_uuid] || 0) + 1; });
      return (ms || []).map((m) => ({ ...m, nb_classes: n[m.id] || 0 }));
    },
    async ajouterMatiere(f) {
      const nom = String(f.nom || "").trim();
      if (!nom) throw new Error("Le nom est requis");
      const { data: ex } = await supabase.from("subjects").select("id, nom").is("deleted_at", null);
      if ((ex || []).some((x) => (x.nom || "").toLowerCase() === nom.toLowerCase())) throw new Error("Cette matiere existe deja");
      ok(await supabase.from("subjects").insert({ nom, code: (f.code || "").trim() || null, description: (f.description || "").trim() || null, modified_by: par }));
    },
    async modifierMatiere(m) {
      const nom = String(m.nom || "").trim();
      if (!nom) throw new Error("Le nom est requis");
      const { data: ex } = await supabase.from("subjects").select("id, nom").is("deleted_at", null).neq("id", m.id);
      if ((ex || []).some((x) => (x.nom || "").toLowerCase() === nom.toLowerCase())) throw new Error("Cette matiere existe deja");
      ok(await supabase.from("subjects").update({ nom, code: (m.code || "").trim() || null, description: (m.description || "").trim() || null, version: (m.version || 1) + 1, ...meta() }).eq("id", m.id));
    },
    async supprimerMatiere(m) {
      const t = maintenant();
      ok(await supabase.from("class_subjects").update({ deleted_at: t, ...meta() }).eq("subject_uuid", m.id).is("deleted_at", null));
      ok(await supabase.from("subjects").update({ deleted_at: t, version: (m.version || 1) + 1, ...meta() }).eq("id", m.id));
    },
    async lignes(classId) {
      const { data: cs } = await supabase.from("class_subjects").select("*").eq("class_uuid", classId).is("deleted_at", null);
      const { data: ms } = await supabase.from("subjects").select("id, nom").is("deleted_at", null);
      const nom = {};
      (ms || []).forEach((m) => { nom[m.id] = m.nom; });
      return (cs || []).filter((c) => nom[c.subject_uuid]).map((c) => ({ id: c.id, subject_id: c.subject_uuid, matiere_nom: nom[c.subject_uuid], coefficient: c.coefficient, heures_semaine: c.heures_semaine, employee_id: c.employee_uuid, version: c.version })).sort((a, b) => a.matiere_nom.localeCompare(b.matiere_nom));
    },
    async enregistrerLigne(classId, subjectId, coef, heures, employeeId) {
      const { data: ex } = await supabase.from("class_subjects").select("id, version").eq("class_uuid", classId).eq("subject_uuid", subjectId).limit(1);
      const v = { coefficient: Number(coef) || 1, heures_semaine: Number(heures) || 0, employee_uuid: employeeId || null, deleted_at: null, ...meta() };
      if (ex && ex.length) ok(await supabase.from("class_subjects").update({ ...v, version: (ex[0].version || 1) + 1 }).eq("id", ex[0].id));
      else ok(await supabase.from("class_subjects").insert({ class_uuid: classId, subject_uuid: subjectId, ...v }));
    },
    async retirerLigne(l) {
      ok(await supabase.from("class_subjects").update({ deleted_at: maintenant(), version: (l.version || 1) + 1, ...meta() }).eq("id", l.id));
    },
    async copierAnnee(de, vers) {
      const cibles = await api.classesDeAnnee(vers);
      const sources = await api.classesDeAnnee(de);
      let n = 0;
      for (const c of cibles) {
        const o = sources.find((s) => s.nom === c.nom);
        if (!o) continue;
        for (const l of await api.lignes(o.id)) { await api.enregistrerLigne(c.id, l.subject_id, l.coefficient, l.heures_semaine, l.employee_id); n++; }
      }
      return n;
    },
    async enseignants() {
      const { data: es } = await supabase.from("employees").select("id, matricule, nom, fonction, telephone, statut").eq("est_enseignant", 1).order("nom");
      const { data: cs } = await supabase.from("class_subjects").select("employee_uuid, subject_uuid, class_uuid").not("employee_uuid", "is", null).is("deleted_at", null);
      const { data: ms } = await supabase.from("subjects").select("id, nom");
      const { data: cl } = await supabase.from("classes").select("id, nom");
      const mn = {}, cn = {};
      (ms || []).forEach((m) => { mn[m.id] = m.nom; });
      (cl || []).forEach((c) => { cn[c.id] = c.nom; });
      return (es || []).map((e) => ({ ...e, cours: (cs || []).filter((c) => c.employee_uuid === e.id && mn[c.subject_uuid]).map((c) => mn[c.subject_uuid] + " - " + (cn[c.class_uuid] || "?")).join(", ") }));
    },
    async disponibles() {
      const { data } = await supabase.from("employees").select("id, nom, fonction").or("est_enseignant.is.null,est_enseignant.eq.0").eq("statut", "actif").order("nom");
      return data || [];
    },
    async marquer(id) { ok(await supabase.from("employees").update({ est_enseignant: 1, ...meta() }).eq("id", id)); },
    async creerEnseignant(nom, tel) {
      const alpha = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      const matricule = "ENS-" + Array.from({ length: 6 }, () => alpha[Math.floor(Math.random() * alpha.length)]).join("");
      ok(await supabase.from("employees").insert({ matricule, nom: nom.trim(), fonction: "Enseignant", departement: "Pedagogie", salaire: 0, telephone: (tel || "").trim() || null, statut: "actif", est_enseignant: 1, modified_by: par }));
    },
    async retirerEnseignant(e) {
      const { data: cs } = await supabase.from("class_subjects").select("id").eq("employee_uuid", e.id).is("deleted_at", null);
      if (cs && cs.length) throw new Error("Cet enseignant a encore " + cs.length + " cours. Reassigne-les d'abord (Matieres par classe).");
      ok(await supabase.from("employees").update({ est_enseignant: 0, ...meta() }).eq("id", e.id));
    }
  };
  return api;
}

export default function Matieres() {
  const auth = useAuth();
  const supabase = getAuthedClient(auth && auth.token);
  const par = (auth && auth.user && (auth.user.nom_complet || auth.user.username)) || "web";
  const [api] = useState(() => creerApi(supabase, par));
  const [onglet, setOnglet] = useState("catalogue");
  const [matieres, setMatieres] = useState([]);
  const [enseignants, setEnseignants] = useState([]);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const chargerMatieres = async () => { try { setMatieres(await api.matieres()); } catch (e) { setErr(e.message); } };
  const chargerEnseignants = async () => { try { setEnseignants(await api.enseignants()); } catch (e) { setErr(e.message); } };
  useEffect(() => { chargerMatieres(); chargerEnseignants(); }, []);

  const executer = async (fn, okMsg) => {
    setErr(""); setMsg("");
    try { await fn(); if (okMsg) setMsg(okMsg); } catch (e) { setErr(e.message); }
  };

  const onglets = [["catalogue", "Matières"], ["classe", "Matières par classe"], ["enseignants", "Enseignants"]];

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">{"Matières & Enseignants"}</h1>
          <p className="page-subtitle">{"Le catalogue des matières, leur affectation aux classes de chaque année (coefficient, heures, enseignant) et la liste des enseignants."}</p>
        </div>
      </div>
      <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
        {onglets.map(([k, t]) => (
          <button key={k} className={onglet === k ? "btn-primary" : "btn-gray-cancel"} onClick={() => { setOnglet(k); setErr(""); setMsg(""); }}>{t}</button>
        ))}
      </div>
      {err && <div className="login-error" style={{ marginBottom: "14px" }}>{err}</div>}
      {msg && <div style={{ ...carte, borderColor: "rgba(80,200,120,0.5)" }}>{msg}</div>}

      {onglet === "catalogue" && <Catalogue api={api} matieres={matieres} recharger={chargerMatieres} executer={executer} />}
      {onglet === "classe" && <ParClasse api={api} matieres={matieres} enseignants={enseignants} executer={executer} />}
      {onglet === "enseignants" && <Enseignants api={api} enseignants={enseignants} recharger={chargerEnseignants} executer={executer} />}
    </div>
  );
}

function Catalogue({ api, matieres, recharger, executer }) {
  const [f, setF] = useState({ nom: "", code: "", description: "" });
  const [edit, setEdit] = useState(null);
  const ajouter = () => executer(async () => {
    await api.ajouterMatiere(f);
    setF({ nom: "", code: "", description: "" });
    await recharger();
  });
  const sauver = () => executer(async () => {
    await api.modifierMatiere(edit);
    setEdit(null);
    await recharger();
  });
  const supprimer = (m) => {
    if (!window.confirm("Supprimer la matière " + m.nom + " ? Elle sera retirée de toutes les classes.")) return;
    executer(async () => { await api.supprimerMatiere(m); await recharger(); });
  };
  return (
    <>
      <div style={carte}>
        <h3 style={{ marginTop: 0 }}>{"Ajouter une matière"}</h3>
        <div className="form-row">
          <div className="form-group"><label>{"Nom *"}</label><input value={f.nom} placeholder={"Mathématiques"} onChange={(e) => setF({ ...f, nom: e.target.value })} /></div>
          <div className="form-group"><label>Code</label><input value={f.code} placeholder="MATH" onChange={(e) => setF({ ...f, code: e.target.value })} /></div>
          <div className="form-group"><label>Description</label><input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
        </div>
        <button className="btn-primary" onClick={ajouter} disabled={!f.nom.trim()}>{"Ajouter"}</button>
      </div>
      <div className="table-card">
        <table className="data-table">
          <thead><tr><th>{"Matière"}</th><th>Code</th><th>Description</th><th>Classes</th><th></th></tr></thead>
          <tbody>
            {matieres.map((m) => edit && edit.id === m.id ? (
              <tr key={m.id}>
                <td><input value={edit.nom} onChange={(e) => setEdit({ ...edit, nom: e.target.value })} /></td>
                <td><input value={edit.code || ""} onChange={(e) => setEdit({ ...edit, code: e.target.value })} /></td>
                <td><input value={edit.description || ""} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></td>
                <td>{m.nb_classes}</td>
                <td className="table-actions"><button className="btn-sm btn-green" onClick={sauver}>OK</button> <button className="btn-sm btn-gray-cancel" onClick={() => setEdit(null)}>Annuler</button></td>
              </tr>
            ) : (
              <tr key={m.id}>
                <td><strong>{m.nom}</strong></td><td>{m.code || "-"}</td><td>{m.description || "-"}</td><td>{m.nb_classes}</td>
                <td className="table-actions"><button className="btn-sm btn-gray-cancel" onClick={() => setEdit({ ...m })}>Modifier</button> <button className="btn-sm btn-red" onClick={() => supprimer(m)}>Supprimer</button></td>
              </tr>
            ))}
            {matieres.length === 0 && <tr><td colSpan={5} className="table-empty">{"Aucune matière. Ajoute la première ci-dessus."}</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ParClasse({ api, matieres, enseignants, executer }) {
  const [years, setYears] = useState([]);
  const [anneeId, setAnneeId] = useState("");
  const [classes, setClasses] = useState([]);
  const [classeId, setClasseId] = useState("");
  const [lignes, setLignes] = useState([]);
  const [ajout, setAjout] = useState("");
  const [source, setSource] = useState("");
  const [, setMsgCopie] = useState(0);

  useEffect(() => {
    api.supabase.from("academic_years").select("id, nom, statut").is("deleted_at", null).order("nom", { ascending: false }).then(({ data }) => {
      setYears(data || []);
      const act = (data || []).find((y) => y.statut === "active");
      if (act) setAnneeId(act.id);
    });
  }, []);
  useEffect(() => {
    setClasses([]); setClasseId(""); setLignes([]);
    if (!anneeId) return;
    api.classesDeAnnee(anneeId).then(setClasses).catch(() => {});
  }, [anneeId]);

  const charger = async () => {
    if (!classeId) { setLignes([]); return; }
    try { setLignes(await api.lignes(classeId)); } catch (e) {}
  };
  useEffect(() => { charger(); }, [classeId]);

  const maj = (l, champ, valeur) => {
    const nouv = { ...l, [champ]: valeur };
    setLignes(lignes.map((x) => (x.id === l.id ? nouv : x)));
    return nouv;
  };
  const enregistrer = (l) => executer(async () => {
    await api.enregistrerLigne(classeId, l.subject_id, l.coefficient, l.heures_semaine, l.employee_id || null);
  });
  const ajouter = () => executer(async () => {
    await api.enregistrerLigne(classeId, ajout, 1, 0, null);
    setAjout("");
    await charger();
  });
  const retirer = (l) => executer(async () => { await api.retirerLigne(l); await charger(); });
  const copier = () => {
    if (!source || !anneeId) return;
    if (!window.confirm("Copier les matières (coefficients, heures, enseignants) de l'année choisie vers les classes de même nom de cette année ?")) return;
    executer(async () => {
      const n = await api.copierAnnee(source, anneeId);
      await charger();
      setMsgCopie(n);
    }, "Copie terminée.");
  };

  const dejaIds = new Set(lignes.map((l) => l.subject_id));
  const total = lignes.reduce((s, l) => s + (Number(l.coefficient) || 0), 0);

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
            {(years || []).filter((y) => y.id !== anneeId).map((y) => <option key={y.id} value={y.id}>{y.nom}</option>)}
          </select>
          <button className="btn-gray-cancel btn-sm" onClick={copier} disabled={!source}>{"Copier vers cette année"}</button>
        </div>
      )}

      {classeId && (
        <>
          <div className="table-card">
            <table className="data-table">
              <thead><tr><th>{"Matière"}</th><th>Coefficient</th><th>{"Heures / semaine"}</th><th>Enseignant</th><th></th></tr></thead>
              <tbody>
                {lignes.map((l) => (
                  <tr key={l.id}>
                    <td><strong>{l.matiere_nom}</strong></td>
                    <td><input type="number" min="0" step="0.5" style={{ width: "80px" }} value={l.coefficient} onChange={(e) => maj(l, "coefficient", e.target.value)} onBlur={() => enregistrer(l)} /></td>
                    <td><input type="number" min="0" step="0.5" style={{ width: "80px" }} value={l.heures_semaine} onChange={(e) => maj(l, "heures_semaine", e.target.value)} onBlur={() => enregistrer(l)} /></td>
                    <td>
                      <select value={l.employee_id || ""} onChange={(e) => { const n = maj(l, "employee_id", e.target.value); enregistrer(n); }}>
                        <option value="">{"— Non assigné —"}</option>
                        {enseignants.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
                      </select>
                    </td>
                    <td className="table-actions"><button className="btn-sm btn-red" onClick={() => retirer(l)}>Retirer</button></td>
                  </tr>
                ))}
                {lignes.length === 0 && <tr><td colSpan={5} className="table-empty">{"Aucune matière dans cette classe."}</td></tr>}
              </tbody>
              {lignes.length > 0 && <tfoot><tr><td><strong>Total</strong></td><td><strong>{total}</strong></td><td colSpan={3}></td></tr></tfoot>}
            </table>
          </div>
          <div style={{ display: "flex", gap: "10px", marginTop: "12px", alignItems: "center" }}>
            <select value={ajout} onChange={(e) => setAjout(e.target.value)}>
              <option value="">{"— Ajouter une matière —"}</option>
              {matieres.filter((m) => !dejaIds.has(m.id)).map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
            </select>
            <button className="btn-primary" onClick={ajouter} disabled={!ajout}>{"Ajouter à la classe"}</button>
          </div>
        </>
      )}
      {anneeId && classes.length === 0 && <div style={{ color: "var(--text-dim)" }}>{"Cette année n'a pas encore de classes."}</div>}
    </div>
  );
}

function Enseignants({ api, enseignants, recharger, executer }) {
  const [dispo, setDispo] = useState([]);
  const [choix, setChoix] = useState("");
  const [nouveau, setNouveau] = useState({ nom: "", telephone: "" });
  const chargerDispo = async () => { try { setDispo(await api.disponibles()); } catch (e) {} };
  useEffect(() => { chargerDispo(); }, [enseignants.length]);

  const marquer = () => executer(async () => { await api.marquer(choix); setChoix(""); await recharger(); await chargerDispo(); });
  const creer = () => executer(async () => { await api.creerEnseignant(nouveau.nom, nouveau.telephone); setNouveau({ nom: "", telephone: "" }); await recharger(); await chargerDispo(); });
  const retirer = (e) => {
    if (!window.confirm(e.nom + " ne sera plus listé comme enseignant (sa fiche d'employé reste). Continuer ?")) return;
    executer(async () => { await api.retirerEnseignant(e); await recharger(); await chargerDispo(); });
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
