import React, { useState, useEffect } from "react";
import { useAuth } from "../AuthContext.jsx";
import { getAuthedClient } from "../supabaseClient.js";
import { useYear } from "../YearContext.jsx";
import "../discipline/discipline.css";
import { fmtDate, nomComplet, chargerReferentiel } from "../discipline/outils.js";

async function parLots(ids, fn) {
  const sortie = [];
  for (let i = 0; i < ids.length; i += 120) {
    const part = await fn(ids.slice(i, i + 120));
    (part || []).forEach((x) => sortie.push(x));
  }
  return sortie;
}

export default function DisciplineDashboard({ onNavigate }) {
  const { token } = useAuth();
  const { currentYear: year } = useYear();
  const supabase = getAuthedClient(token);
  const [d, setD] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!year) { setLoading(false); return undefined; }
    let vivant = true;
    (async () => {
      setLoading(true); setError("");
      try {
        const ref = await chargerReferentiel(supabase);
        const { data: inc, error: e1 } = await supabase.from("discipline_incidents").select("*").eq("academic_year_uuid", year.id).eq("statut", "valide").is("deleted_at", null).order("date_incident", { ascending: false }).limit(5000);
        if (e1) throw e1;
        const { data: car } = await supabase.from("discipline_carnets").select("id, statut, student_uuid").eq("academic_year_uuid", year.id).is("deleted_at", null);
        const incidents = inc || [];
        const ids = Array.from(new Set(incidents.map((i) => i.student_uuid)));
        const eleves = await parLots(ids, async (lot) => (await supabase.from("students").select("id, matricule, nom, prenom").in("id", lot)).data);
        const asg = await parLots(ids, async (lot) => (await supabase.from("assignments").select("student_uuid, class_uuid").eq("academic_year_uuid", year.id).is("deleted_at", null).in("student_uuid", lot)).data);
        const { data: cls } = await supabase.from("classes").select("id, nom").eq("academic_year_uuid", year.id).is("deleted_at", null);
        if (!vivant) return;
        setD({ ref, incidents, carnets: car || [], eleves: Object.fromEntries(eleves.map((s) => [s.id, s])), asg: Object.fromEntries(asg.map((a) => [a.student_uuid, a.class_uuid])), cls: Object.fromEntries((cls || []).map((c) => [c.id, c.nom])) });
      } catch (e) { if (vivant) setError(e.message || "Erreur de chargement"); }
      if (vivant) setLoading(false);
    })();
    return () => { vivant = false; };
    // eslint-disable-next-line
  }, [token, year && year.id]);

  if (!year) return (<div className="page"><div className="page-header"><h1 className="page-title">Discipline</h1></div><div className="dc-vide">Aucune année académique active.</div></div>);
  if (error) return (<div className="page"><div className="page-header"><h1 className="page-title">Discipline</h1></div><div className="login-error">{error}</div></div>);
  // pas encore de donnees (l'annee arrive parfois apres le premier affichage) : on attend
  if (loading || !d) return (<div className="page"><div className="page-header"><h1 className="page-title">Discipline</h1></div><div className="dc-vide">Chargement...</div></div>);

  const { ref, incidents, carnets, eleves, asg, cls } = d;
  const fMap = Object.fromEntries(ref.fautes.map((f) => [f.id, f]));
  const mois = new Date().toISOString().slice(0, 7);
  const duMois = incidents.filter((i) => String(i.date_incident).slice(0, 7) === mois).length;

  // incidents par eleve et par faute -> seuils atteints
  const parEleve = {};
  incidents.forEach((i) => {
    const e = (parEleve[i.student_uuid] = parEleve[i.student_uuid] || {});
    e[i.faute_uuid] = (e[i.faute_uuid] || 0) + 1;
  });
  const seuils = [];
  Object.keys(parEleve).forEach((sid) => {
    Object.keys(parEleve[sid]).forEach((fid) => {
      const f = fMap[fid];
      if (f && parEleve[sid][fid] >= f.cases) seuils.push({ sid, f, n: parEleve[sid][fid] });
    });
  });
  seuils.sort((a, b) => (b.n - b.f.cases) - (a.n - a.f.cases) || (a.f.niveau && b.f.niveau ? (b.f.niveau.ordre || 0) - (a.f.niveau.ordre || 0) : 0));

  const parFaute = {};
  incidents.forEach((i) => { parFaute[i.faute_uuid] = (parFaute[i.faute_uuid] || 0) + 1; });
  const top = Object.keys(parFaute).map((id) => ({ f: fMap[id], n: parFaute[id] })).filter((x) => x.f).sort((a, b) => b.n - a.n).slice(0, 8);
  const maxTop = top.length ? top[0].n : 1;

  const parClasse = {};
  incidents.forEach((i) => { const c = cls[asg[i.student_uuid]] || "Sans classe"; parClasse[c] = (parClasse[c] || 0) + 1; });
  const topClasses = Object.keys(parClasse).map((c) => ({ c, n: parClasse[c] })).sort((a, b) => b.n - a.n).slice(0, 8);
  const maxCl = topClasses.length ? topClasses[0].n : 1;

  const perdus = carnets.filter((c) => c.statut === "perdu").length;
  const actifs = carnets.filter((c) => c.statut === "actif").length;

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Discipline</h1>
        <p className="page-subtitle">Année {year.nom} · vue d'ensemble du registre de discipline</p>
      </div>
      <div className="dc-kpis">
        <div className="dc-kpi"><div className="dc-kpi-l">Incidents (année)</div><div className="dc-kpi-v">{incidents.length}</div></div>
        <div className="dc-kpi"><div className="dc-kpi-l">Incidents ce mois</div><div className="dc-kpi-v">{duMois}</div></div>
        <div className="dc-kpi"><div className="dc-kpi-l">Élèves concernés</div><div className="dc-kpi-v">{Object.keys(parEleve).length}</div></div>
        <div className="dc-kpi"><div className="dc-kpi-l">Seuils atteints</div><div className="dc-kpi-v" style={{ color: seuils.length ? "#dc2626" : "inherit" }}>{seuils.length}</div></div>
        <div className="dc-kpi"><div className="dc-kpi-l">Carnets émis</div><div className="dc-kpi-v">{actifs}</div></div>
        <div className="dc-kpi"><div className="dc-kpi-l">Carnets perdus</div><div className="dc-kpi-v">{perdus}</div></div>
      </div>

      <div className="dc-grid2" style={{ marginBottom: "18px" }}>
        <div className="dc-card">
          <h3 className="form-card-title" style={{ marginTop: 0 }}>Fautes les plus fréquentes</h3>
          {top.length === 0 && <div className="dc-vide">Aucun incident enregistré.</div>}
          {top.map((x) => (
            <div className="dc-barre" key={x.f.id}>
              <span className="dc-barre-l" title={x.f.libelle}>{x.f.numero}. {x.f.libelle}</span>
              <span className="dc-barre-b"><i style={{ width: Math.max(4, (x.n / maxTop) * 100) + "%", background: (x.f.niveau && x.f.niveau.couleur) || "#64748b" }} /></span>
              <span className="dc-barre-n">{x.n}</span>
            </div>
          ))}
        </div>
        <div className="dc-card">
          <h3 className="form-card-title" style={{ marginTop: 0 }}>Incidents par classe</h3>
          {topClasses.length === 0 && <div className="dc-vide">Aucun incident enregistré.</div>}
          {topClasses.map((x) => (
            <div className="dc-barre" key={x.c}>
              <span className="dc-barre-l">{x.c}</span>
              <span className="dc-barre-b"><i style={{ width: Math.max(4, (x.n / maxCl) * 100) + "%", background: "#dc2626" }} /></span>
              <span className="dc-barre-n">{x.n}</span>
            </div>
          ))}
        </div>
      </div>

      <h3 className="form-card-title">Élèves ayant atteint un seuil</h3>
      <div className="dc-card" style={{ padding: 0, overflow: "auto", marginBottom: "18px" }}>
        <table className="data-table">
          <thead><tr><th>Élève</th><th>Classe</th><th>Faute</th><th>Cases</th><th>Mesure prévue</th></tr></thead>
          <tbody>
            {seuils.length === 0 && <tr><td colSpan="5" style={{ textAlign: "center", opacity: 0.7 }}>Aucun élève n'a atteint un seuil.</td></tr>}
            {seuils.slice(0, 40).map((s, k) => (
              <tr key={k}>
                <td><strong>{nomComplet(eleves[s.sid])}</strong><br /><small>{eleves[s.sid] ? eleves[s.sid].matricule : ""}</small></td>
                <td>{cls[asg[s.sid]] || "-"}</td>
                <td>{s.f.numero}. {s.f.libelle}</td>
                <td><span className={"dc-chip " + (s.n > s.f.cases ? "bad" : "warn")}>{s.n}/{s.f.cases}</span></td>
                <td>{(s.f.niveau && s.f.niveau.action) || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="form-card-title">Derniers incidents</h3>
      <div className="dc-card" style={{ padding: 0, overflow: "auto" }}>
        <table className="data-table">
          <thead><tr><th>Date</th><th>Élève</th><th>Classe</th><th>Faute</th><th>Signalé par</th></tr></thead>
          <tbody>
            {incidents.length === 0 && <tr><td colSpan="5" style={{ textAlign: "center", opacity: 0.7 }}>Aucun incident enregistré.</td></tr>}
            {incidents.slice(0, 12).map((i) => (
              <tr key={i.id}>
                <td>{fmtDate(i.date_incident)}</td>
                <td>{nomComplet(eleves[i.student_uuid])}</td>
                <td>{cls[asg[i.student_uuid]] || "-"}</td>
                <td>{fMap[i.faute_uuid] ? fMap[i.faute_uuid].numero + ". " + fMap[i.faute_uuid].libelle : ""}</td>
                <td>{i.signale_par || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {onNavigate && <div style={{ marginTop: "16px" }}><button className="btn-primary" onClick={() => onNavigate("disc_carnets")}>Ouvrir les carnets</button></div>}
    </div>
  );
}
