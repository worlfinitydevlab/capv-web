import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from "../AuthContext.jsx";
import { getAuthedClient } from "../supabaseClient.js";

const DECISIONS = [
  ["", "Non précisée"], ["admis", "Admis"], ["maintenu", "Maintenu (redouble)"], ["admis_ailleurs", "Admis ailleurs"], ["exclu", "Exclu"]
];
const carte = { background: "var(--card-bg, rgba(255,255,255,0.04))", border: "1px solid var(--border, rgba(255,255,255,0.1))", borderRadius: "12px", padding: "18px 20px", marginBottom: "20px" };

export default function AnneesPassees() {
  const auth = useAuth();
  const supabase = getAuthedClient(auth && auth.token);
  const modifiePar = (auth && auth.user && (auth.user.nom_complet || auth.user.username)) || "web";
  const [years, setYears] = useState([]);
  const [anneeId, setAnneeId] = useState("");
  const [classes, setClasses] = useState([]);
  const [classeId, setClasseId] = useState("");
  const [eleves, setEleves] = useState([]);
  const [dejaDans, setDejaDans] = useState({});
  const [recherche, setRecherche] = useState("");
  const [coches, setCoches] = useState({});
  const [decision, setDecision] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    supabase.from("academic_years").select("id, nom, statut").is("deleted_at", null).order("nom", { ascending: false }).then(({ data }) => setYears(data || []));
    supabase.from("students").select("id, nom, prenom, sexe").is("deleted_at", null).order("nom").then(({ data }) => setEleves(data || []));
  }, []);

  const chargerAnnee = async (yid) => {
    setClasses([]); setClasseId(""); setDejaDans({}); setCoches({});
    if (!yid) return;
    const { data: secs } = await supabase.from("sections").select("id").eq("academic_year_uuid", yid).is("deleted_at", null);
    const sids = (secs || []).map((s) => s.id);
    let cls = [];
    if (sids.length) {
      const { data } = await supabase.from("classes").select("id, nom").in("section_uuid", sids).is("deleted_at", null).order("nom");
      cls = data || [];
    }
    setClasses(cls);
    const { data: asg } = await supabase.from("assignments").select("student_uuid, class_uuid").eq("academic_year_uuid", yid).is("deleted_at", null);
    const nomDe = {};
    cls.forEach((c) => { nomDe[c.id] = c.nom; });
    const m = {};
    (asg || []).forEach((a) => { m[a.student_uuid] = nomDe[a.class_uuid] || "?"; });
    setDejaDans(m);
  };
  useEffect(() => { chargerAnnee(anneeId); }, [anneeId]);

  const visibles = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return eleves.filter((e) => !q || ((e.nom || "") + " " + (e.prenom || "")).toLowerCase().includes(q));
  }, [eleves, recherche]);
  const nbCoches = Object.keys(coches).filter((k) => coches[k]).length;

  const inscrire = async () => {
    setErr(""); setMsg("");
    if (!anneeId || !classeId || nbCoches === 0) { setErr("Choisis l'année, la classe et au moins un élève."); return; }
    const classe = classes.find((c) => c.id === classeId);
    const annee = years.find((y) => y.id === anneeId);
    if (!classe || !annee) { setErr("Classe ou année invalide."); return; }
    setBusy(true);
    const maintenant = new Date().toISOString();
    const { data: salles } = await supabase.from("rooms").select("id").eq("class_uuid", classeId).is("deleted_at", null).order("nom").limit(1);
    const salle = salles && salles.length ? salles[0].id : null;
    let ok = 0; const erreurs = [];
    for (const sid of Object.keys(coches).filter((k) => coches[k])) {
      try {
        const r1 = await supabase.from("assignments").update({ deleted_at: maintenant, last_modified_at: maintenant, modified_by: modifiePar }).eq("student_uuid", sid).eq("academic_year_uuid", anneeId).is("deleted_at", null);
        if (r1.error) throw new Error(r1.error.message);
        const r2 = await supabase.from("assignments").insert({ student_uuid: sid, class_uuid: classeId, room_uuid: salle, academic_year_uuid: anneeId, modified_by: modifiePar });
        if (r2.error) throw new Error(r2.error.message);
        if (decision) {
          const { data: ex } = await supabase.from("student_history").select("id, version").eq("student_uuid", sid).eq("annee_nom", annee.nom).limit(1);
          const v = { classe_nom: classe.nom, decision, source: "manuel", modified_by: modifiePar, last_modified_at: maintenant, deleted_at: null };
          if (ex && ex.length) await supabase.from("student_history").update({ ...v, version: (ex[0].version || 1) + 1 }).eq("id", ex[0].id);
          else await supabase.from("student_history").insert({ student_uuid: sid, annee_nom: annee.nom, ...v });
        }
        ok++;
      } catch (e) { erreurs.push(e.message); }
    }
    setBusy(false);
    setMsg(ok + " élève(s) inscrit(s) dans " + annee.nom + (erreurs.length ? " — " + erreurs.length + " erreur(s) : " + erreurs[0] : "") + ".");
    setCoches({});
    chargerAnnee(anneeId);
  };

  const anneesPassees = years.filter((y) => y.statut !== "active");

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Années passées</h1>
          <p className="page-subtitle">{"Place les élèves dans leur classe d'une année précédente. Seules les années et les classes déjà configurées sont proposées. Les factures ne sont pas générées ici : les finances de chaque année restent séparées."}</p>
        </div>
      </div>

      {err && <div className="login-error" style={{ marginBottom: "14px" }}>{err}</div>}
      {msg && <div style={{ ...carte, borderColor: "rgba(80,200,120,0.5)" }}>{msg}</div>}

      <div style={carte}>
        {anneesPassees.length === 0 && <div style={{ color: "var(--text-dim)", marginBottom: "10px" }}>{"Aucune année précédente configurée. Crée-la d'abord dans Années académiques, avec ses sections et ses classes."}</div>}
        <div className="form-row">
          <div className="form-group">
            <label>{"Année"}</label>
            <select value={anneeId} onChange={(e) => setAnneeId(e.target.value)}>
              <option value="">{"— Choisir —"}</option>
              {anneesPassees.map((y) => <option key={y.id} value={y.id}>{y.nom}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>{"Classe de cette année"}</label>
            <select value={classeId} onChange={(e) => setClasseId(e.target.value)} disabled={!anneeId}>
              <option value="">{"— Choisir —"}</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>{"Décision de fin d'année"}</label>
            <select value={decision} onChange={(e) => setDecision(e.target.value)}>
              {DECISIONS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </select>
          </div>
        </div>

        {anneeId && classes.length === 0 && <div style={{ color: "var(--text-dim)", marginBottom: "10px" }}>{"Cette année n'a pas encore de classes : configure ses sections et classes d'abord."}</div>}

        {anneeId && (
          <>
            <input placeholder="Rechercher un élève…" value={recherche} onChange={(e) => setRecherche(e.target.value)} style={{ width: "100%", marginBottom: "10px" }} />
            <div className="table-card" style={{ maxHeight: "360px", overflowY: "auto" }}>
              <table className="data-table">
                <thead><tr><th></th><th>{"Élève"}</th><th>{"Déjà dans cette année"}</th></tr></thead>
                <tbody>
                  {visibles.map((e) => (
                    <tr key={e.id}>
                      <td><input type="checkbox" checked={!!coches[e.id]} onChange={(ev) => setCoches({ ...coches, [e.id]: ev.target.checked })} /></td>
                      <td>{(e.prenom || "") + " " + (e.nom || "")}</td>
                      <td>{dejaDans[e.id] || "-"}</td>
                    </tr>
                  ))}
                  {visibles.length === 0 && <tr><td colSpan={3} className="table-empty">{"Aucun élève"}</td></tr>}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: "12px", display: "flex", gap: "12px", alignItems: "center" }}>
              <button className="btn-primary" disabled={busy || nbCoches === 0 || !classeId} onClick={inscrire}>{"Inscrire " + nbCoches + " élève(s)"}</button>
              <span style={{ color: "var(--text-dim)", fontSize: "13px" }}>{"La salle de la classe est choisie automatiquement (première salle)."}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
