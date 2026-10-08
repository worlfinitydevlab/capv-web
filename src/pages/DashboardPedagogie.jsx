import React, { useState, useEffect } from "react";
import { useAuth } from "../AuthContext.jsx";
import { getAuthedClient } from "../supabaseClient.js";
import { useYear } from "../YearContext.jsx";
import { useSettings } from "../SettingsContext.jsx";
import { getSalutation, getMotivation, getPeriodEmoji } from "../smartMessages.js";

export default function DashboardPedagogie() {
  const { token, user } = useAuth();
  const { currentYear } = useYear();
  const { settings } = useSettings();
  const etab = (settings && settings.nom_etablissement) || "Établissement";
  const [d, setD] = useState(null);

  useEffect(() => {
    if (!currentYear || !token) return;
    let annule = false;
    (async () => {
      const sb = getAuthedClient(token);
      const compte = (q) => q.then((r) => r.count || 0);
      const actifs = () => sb.from("students").select("id", { count: "exact", head: true }).is("deleted_at", null).eq("statut", "actif");
      const [eleves, garcons, filles, assignes, attente, admis, refuses, cls] = await Promise.all([
        compte(actifs()),
        compte(actifs().eq("sexe", "M")),
        compte(actifs().eq("sexe", "F")),
        compte(sb.from("assignments").select("id", { count: "exact", head: true }).eq("academic_year_uuid", currentYear.id).is("deleted_at", null)),
        compte(sb.from("inscriptions").select("id", { count: "exact", head: true }).eq("academic_year_uuid", currentYear.id).is("deleted_at", null).eq("statut_inscription", "en_attente_examen")),
        compte(sb.from("inscriptions").select("id", { count: "exact", head: true }).eq("academic_year_uuid", currentYear.id).is("deleted_at", null).eq("statut_inscription", "admis")),
        compte(sb.from("inscriptions").select("id", { count: "exact", head: true }).eq("academic_year_uuid", currentYear.id).is("deleted_at", null).eq("statut_inscription", "refuse")),
        sb.from("classes").select("id, nom, capacite").eq("academic_year_uuid", currentYear.id).is("deleted_at", null).order("nom").then((r) => r.data || [])
      ]);
      const classes = await Promise.all(cls.map(async (c) => ({
        ...c,
        effectif: await compte(sb.from("assignments").select("id", { count: "exact", head: true }).eq("class_uuid", c.id).eq("academic_year_uuid", currentYear.id).is("deleted_at", null))
      })));
      if (!annule) setD({ eleves_actifs: eleves, garcons, filles, assignes, a_assigner: Math.max(0, eleves - assignes), en_attente: attente, admis, refuses, classes });
    })().catch(() => { if (!annule) setD(null); });
    return () => { annule = true; };
  }, [currentYear, token]);

  const n = (v) => Number(v || 0).toLocaleString();
  const classes = (d && d.classes) || [];

  return (
    <div className="page">
      <div className="dash-welcome">
        <h2>{getPeriodEmoji()} {user ? getSalutation(user.nom_complet) : "Bienvenue !"}</h2>
        <p>{getMotivation()}</p>
      </div>
      <div className="page-header">
        <h1 className="page-title">{"Tableau de bord pédagogique"}</h1>
        <p className="page-subtitle">{etab}{currentYear ? " - Année " + currentYear.nom : ""}</p>
      </div>

      {!currentYear && <div className="pd-section"><p className="pd-empty">{"Aucune année académique active."}</p></div>}

      {currentYear && d && (
        <>
          <div className="pd-grid">
            <div className="pd-card"><div className="pd-lbl">{"Élèves actifs"}</div><div className="pd-val">{n(d.eleves_actifs)}</div><div className="pd-hint">{n(d.garcons) + " garçons / " + n(d.filles) + " filles"}</div></div>
            <div className="pd-card"><div className="pd-lbl">{"Assignés à une classe"}</div><div className="pd-val">{n(d.assignes)}</div><div className="pd-hint">{"cette année"}</div></div>
            <div className="pd-card"><div className="pd-lbl">{"À assigner"}</div><div className="pd-val">{n(d.a_assigner)}</div><div className="pd-hint">{"élèves sans classe"}</div></div>
            <div className="pd-card"><div className="pd-lbl">{"Classes"}</div><div className="pd-val">{n(classes.length)}</div><div className="pd-hint">{"cette année"}</div></div>
          </div>

          <div className="pd-section">
            <h3>{"Inscriptions et admissions"}</h3>
            <div className="pd-pipe">
              <div className="pd-pill att"><b>{n(d.en_attente)}</b><span>{"En attente d'examen"}</span></div>
              <div className="pd-pill adm"><b>{n(d.admis)}</b><span>{"Admis"}</span></div>
              <div className="pd-pill ref"><b>{n(d.refuses)}</b><span>{"Refusés"}</span></div>
            </div>
          </div>

          <div className="pd-section">
            <h3>{"Effectif par classe"}</h3>
            {classes.length === 0 && <p className="pd-empty">{"Aucune classe pour cette année."}</p>}
            {classes.map((c) => {
              const cap = Number(c.capacite) || 0;
              const pct = cap > 0 ? Math.min(100, Math.round((c.effectif / cap) * 100)) : Math.min(100, c.effectif * 3);
              return (
                <div className="pd-bar-row" key={c.id}>
                  <div><strong>{c.nom}</strong></div>
                  <div className="pd-bar"><i className={cap > 0 && c.effectif >= cap ? "plein" : ""} style={{ width: pct + "%" }} /></div>
                  <div style={{ textAlign: "right" }}>{c.effectif + (cap > 0 ? " / " + cap : "")}</div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
