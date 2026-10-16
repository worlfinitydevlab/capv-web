import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "../AuthContext.jsx";
import { getAuthedClient } from "../supabaseClient.js";
import { useYear } from "../YearContext.jsx";
import { usePermissions } from "../PermissionsContext.jsx";
import "../discipline/discipline.css";
import { aujourdhui, fmtDate, nomComplet, chargerReferentiel, chargerClasses, chargerSalles, chargerElevesClasse, creerIncident } from "../discipline/outils.js";

export default function DisciplineSaisie() {
  const { token, user } = useAuth();
  const { currentYear: year } = useYear();
  const { can } = usePermissions();
  const supabase = getAuthedClient(token);
  const peutCreer = can("disc_saisie", "creer");

  const [ref, setRef] = useState({ niveaux: [], fautes: [] });
  const [classes, setClasses] = useState([]);
  const [classeId, setClasseId] = useState("");
  const [salles, setSalles] = useState([]);
  const [salleId, setSalleId] = useState("");
  const [eleves, setEleves] = useState([]);
  const [grille, setGrille] = useState({}); // "eleveId|fauteId" -> nombre
  const [date, setDate] = useState(aujourdhui());
  const [signalePar, setSignalePar] = useState((user && (user.nom_complet || user.username)) || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState(false);
  const [resultat, setResultat] = useState(null);
  const [occupe, setOccupe] = useState(false);
  const verrou = useRef(false);

  useEffect(() => {
    if (!year) return;
    chargerReferentiel(supabase).then(setRef).catch((e) => setError(e.message || "Erreur"));
    chargerClasses(supabase, year.id).then(setClasses).catch((e) => setError(e.message || "Erreur"));
    // eslint-disable-next-line
  }, [token, year && year.id]);
  useEffect(() => {
    setSalleId("");
    if (!classeId) { setSalles([]); return; }
    chargerSalles(supabase, classeId).then(setSalles).catch(() => setSalles([]));
    // eslint-disable-next-line
  }, [classeId]);
  useEffect(() => {
    setGrille({});
    if (!classeId || !year) { setEleves([]); return; }
    setLoading(true);
    chargerElevesClasse(supabase, year.id, classeId, salleId || null).then(setEleves).catch((e) => setError(e.message || "Erreur")).finally(() => setLoading(false));
    // eslint-disable-next-line
  }, [classeId, salleId, year && year.id]);

  const fautes = ref.fautes.filter((f) => f.actif).sort((a, b) => a.numero - b.numero);
  const cle = (e, f) => e + "|" + f;
  const ajouter = (e, f, d) => setGrille((g) => {
    const v = Math.max(0, (g[cle(e, f)] || 0) + d);
    const n = { ...g };
    if (v === 0) delete n[cle(e, f)]; else n[cle(e, f)] = v;
    return n;
  });

  const lignes = [];
  eleves.forEach((e) => fautes.forEach((f) => { const n = grille[cle(e.id, f.id)]; if (n) lignes.push({ e, f, n }); }));
  const total = lignes.reduce((s, l) => s + l.n, 0);
  const nbEleves = new Set(lignes.map((l) => l.e.id)).size;

  const demander = () => {
    setError("");
    if (!date) { setError("Indiquez la date des incidents."); return; }
    if (!total) { setError("Aucun incident coché dans la grille."); return; }
    setConfirmation(true);
  };

  const enregistrer = async () => {
    if (verrou.current) return;
    verrou.current = true; setOccupe(true); setError("");
    const restant = { ...grille };
    const seuils = [];
    let faits = 0;
    try {
      for (const l of lignes) {
        for (let k = 0; k < l.n; k++) {
          const r = await creerIncident(supabase, user, { studentId: l.e.id, yearId: year.id, faute: l.f, date, signalePar, source: "feuille" });
          faits++;
          const kk = cle(l.e.id, l.f.id);
          if (restant[kk] > 1) restant[kk]--; else delete restant[kk];
          if (r.plein && !seuils.some((s) => s.e.id === l.e.id && s.f.id === l.f.id)) seuils.push({ e: l.e, f: l.f, numero: r.numero, depasse: r.depasse });
          else { const s = seuils.find((x) => x.e.id === l.e.id && x.f.id === l.f.id); if (s) { s.numero = r.numero; s.depasse = r.depasse; } }
        }
      }
      setGrille({});
      setConfirmation(false);
      setResultat({ faits, seuils });
    } catch (e) {
      setGrille(restant);
      setConfirmation(false);
      setError(faits + " incident(s) enregistré(s) avant l'erreur : " + (e.message || "Erreur") + ". Les cases restantes sont conservées dans la grille.");
      if (faits) setResultat({ faits, seuils });
    }
    verrou.current = false; setOccupe(false);
  };

  if (!year) return (<div className="page"><div className="page-header"><h1 className="page-title">Saisie depuis la feuille</h1></div><div className="dc-vide">Aucune année académique active.</div></div>);
  const classe = classes.find((c) => c.id === classeId);

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Saisie depuis la feuille</h1>
        <p className="page-subtitle">Reportez ici la feuille de surveillance remplie à la main : un clic = un incident</p>
      </div>
      {!peutCreer && <div className="dc-alerte warn">Lecture seule : vous n'avez pas le droit d'enregistrer des incidents.</div>}

      <div className="dc-card" style={{ display: "flex", gap: "14px", flexWrap: "wrap", alignItems: "flex-end", marginBottom: "16px" }}>
        <div className="form-group" style={{ margin: 0, minWidth: "200px" }}>
          <label>Classe</label>
          <select value={classeId} onChange={(e) => setClasseId(e.target.value)}>
            <option value="">-- Choisir --</option>
            {classes.map((c) => (<option key={c.id} value={c.id}>{c.nom}</option>))}
          </select>
        </div>
        <div className="form-group" style={{ margin: 0, minWidth: "140px" }}>
          <label>Salle</label>
          <select value={salleId} onChange={(e) => setSalleId(e.target.value)} disabled={!salles.length}>
            <option value="">Toutes</option>
            {salles.map((s) => (<option key={s.id} value={s.id}>{s.nom}</option>))}
          </select>
        </div>
        <div className="form-group" style={{ margin: 0 }}><label>Date des incidents</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div className="form-group" style={{ margin: 0, minWidth: "190px" }}><label>Signalé par</label><input value={signalePar} onChange={(e) => setSignalePar(e.target.value)} placeholder="Nom du surveillant" /></div>
      </div>

      {error && <div className="login-error" style={{ marginBottom: "14px" }}>{error}</div>}
      {resultat && (
        <div className={"dc-alerte " + (resultat.seuils.length ? "warn" : "ok")} style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
          <div>
            <div><strong>{resultat.faits}</strong> incident(s) enregistré(s).</div>
            {resultat.seuils.map((s, i) => (
              <div key={i}>Seuil {s.depasse ? "dépassé" : "atteint"} : {nomComplet(s.e)} · faute n°{s.f.numero} ({s.numero}/{s.f.cases}){s.f.niveau && s.f.niveau.action ? " · " + s.f.niveau.action : ""}</div>
            ))}
          </div>
          <button style={{ background: "none", border: 0, cursor: "pointer", color: "inherit", fontSize: "16px" }} onClick={() => setResultat(null)}>x</button>
        </div>
      )}

      {!classeId && <div className="dc-vide">Choisissez une classe pour afficher la grille.</div>}
      {loading && <div className="dc-vide">Chargement...</div>}

      {classeId && !loading && (
        <>
          <p style={{ fontSize: "12.5px", opacity: 0.8, margin: "0 0 8px" }}>Cliquez sur une case pour ajouter un incident ; le petit « − » retire le dernier. Passez la souris sur un numéro de colonne pour lire la faute.</p>
          <div className="dc-card" style={{ padding: 0, overflow: "auto", maxHeight: "68vh" }}>
            <table className="data-table" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
              <thead>
                <tr>
                  <th style={{ position: "sticky", top: 0, left: 0, zIndex: 3, minWidth: "190px", background: "var(--navy, #5b1220)", color: "#fff" }}>Élève</th>
                  {fautes.map((f) => (
                    <th key={f.id} title={f.numero + ". " + f.libelle} style={{ position: "sticky", top: 0, zIndex: 2, textAlign: "center", minWidth: "44px", padding: "8px 4px", background: (f.niveau && f.niveau.couleur) || "#64748b", color: "#fff" }}>{f.numero}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {eleves.length === 0 && <tr><td colSpan={fautes.length + 1} style={{ textAlign: "center", opacity: 0.7 }}>Aucun élève dans cette classe.</td></tr>}
                {eleves.map((e, i) => (
                  <tr key={e.id}>
                    <td style={{ position: "sticky", left: 0, zIndex: 1, background: "var(--card-bg, #fff)", whiteSpace: "nowrap" }}><small style={{ opacity: 0.6 }}>{i + 1}.</small> {nomComplet(e)}</td>
                    {fautes.map((f) => {
                      const n = grille[cle(e.id, f.id)] || 0;
                      const col = (f.niveau && f.niveau.couleur) || "#64748b";
                      return (
                        <td key={f.id} style={{ textAlign: "center", padding: "3px 2px" }}>
                          <button disabled={!peutCreer} onClick={() => ajouter(e.id, f.id, 1)} title={nomComplet(e) + " : faute n°" + f.numero}
                            style={{ width: "36px", height: "30px", borderRadius: "8px", cursor: peutCreer ? "pointer" : "default", border: "1px solid " + (n ? col : "rgba(100,116,139,.35)"), background: n ? col : "transparent", color: n ? "#fff" : "inherit", fontWeight: 800 }}>{n || ""}</button>
                          {n > 0 && <button onClick={() => ajouter(e.id, f.id, -1)} title="Retirer" style={{ border: 0, background: "none", cursor: "pointer", fontSize: "13px", opacity: 0.7 }}>−</button>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="dc-card" style={{ marginTop: "14px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <div><strong>{total}</strong> incident(s) pour <strong>{nbEleves}</strong> élève(s) · {fmtDate(date)}</div>
            <div style={{ display: "flex", gap: "10px" }}>
              {total > 0 && <button className="btn-sm btn-gray-cancel" onClick={() => setGrille({})}>Tout effacer</button>}
              <button className="btn-primary" disabled={!peutCreer || !total || occupe} onClick={demander}>Enregistrer la feuille</button>
            </div>
          </div>

          <h3 className="form-card-title" style={{ marginTop: "18px" }}>Légende des fautes</h3>
          <div className="dc-grid2" style={{ fontSize: "12.5px" }}>
            {ref.niveaux.map((n) => (
              <div key={n.id}>
                <div style={{ fontWeight: 800, color: n.couleur }}>{n.nom}</div>
                {fautes.filter((f) => f.niveau_code === n.code).map((f) => (<div key={f.id}><strong>{f.numero}</strong> · {f.libelle}</div>))}
              </div>
            ))}
          </div>
        </>
      )}

      {confirmation && (
        <div className="modal-overlay" onClick={() => !occupe && setConfirmation(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "560px", maxWidth: "94vw" }}>
            <div className="modal-header"><h3>Enregistrer {total} incident(s) ?</h3><button className="modal-close" onClick={() => setConfirmation(false)}>x</button></div>
            <p style={{ fontSize: "13px" }}>Classe {classe ? classe.nom : ""} · date {fmtDate(date)} · signalé par {signalePar || "-"}. Vérifiez la liste avant de confirmer :</p>
            <div style={{ maxHeight: "300px", overflow: "auto", border: "1px solid rgba(100,116,139,.3)", borderRadius: "10px", padding: "8px 12px", fontSize: "13px" }}>
              {lignes.map((l, i) => (<div key={i}>{nomComplet(l.e)} : faute n°{l.f.numero} ({l.f.libelle}){l.n > 1 ? " × " + l.n : ""}</div>))}
            </div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "14px" }}>
              <button className="btn-gray-cancel btn-sm" disabled={occupe} onClick={() => setConfirmation(false)}>Revenir à la grille</button>
              <button className="btn-primary" disabled={occupe} onClick={enregistrer}>{occupe ? "Enregistrement..." : "Confirmer"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
