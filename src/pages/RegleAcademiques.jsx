import React, { useState, useEffect, useRef, useMemo } from "react";
import { useYear as useYear } from "../YearContext.jsx";
import { authPourAction, definirUtilisateur } from "../pedagogie/confirmAction.js";
import { usePontPedagogie } from "../pedagogie/pont.js";

/* ============================================================
   Regles academiques : ordre des classes, regles de decision, resultats de fin d'annee.
   Moyenne annuelle = somme des moyennes des controles / nombre de controles crees par l'etablissement.
   ============================================================ */

const CSS = `
.ra-sombre{--ra-bg:#0f172a;--ra-fg:#e2e8f0;--ra-soft:rgba(255,255,255,.05);--ra-line:rgba(255,255,255,.14);--ra-dim:#94a3b8}
.ra-clair{--ra-bg:#ffffff;--ra-fg:#0f172a;--ra-soft:rgba(15,23,42,.045);--ra-line:rgba(15,23,42,.16);--ra-dim:#64748b}
.ra-root{color:var(--ra-fg);padding-bottom:80px}
.ra-hero{padding:22px 26px;border-radius:18px;margin-bottom:18px;position:relative;overflow:hidden;border:1px solid var(--ra-line);
  background:linear-gradient(120deg,rgba(245,158,11,.2),rgba(236,72,153,.16) 55%,rgba(91,140,255,.18))}
.ra-hero h1{margin:0;font-size:26px;letter-spacing:-.3px}
.ra-hero p{margin:6px 0 0;color:var(--ra-dim);font-size:13px;max-width:680px}
.ra-formule{display:inline-flex;gap:8px;align-items:center;margin-top:12px;padding:8px 14px;border-radius:12px;background:var(--ra-soft);border:1px dashed var(--ra-line);font-size:13px;font-weight:600}
.ra-onglets{display:flex;gap:8px;margin-bottom:18px;flex-wrap:wrap}
.ra-onglet{border:1px solid var(--ra-line);background:var(--ra-soft);color:inherit;padding:10px 18px;border-radius:999px;cursor:pointer;font-weight:700;font-size:14px;transition:all .2s}
.ra-onglet.on{background:linear-gradient(135deg,#f59e0b,#ec4899);border-color:transparent;color:#fff;box-shadow:0 6px 18px rgba(236,72,153,.35)}
.ra-card{border:1px solid var(--ra-line);background:var(--ra-soft);border-radius:16px;padding:18px 20px;margin-bottom:16px;animation:raIn .35s both}
@keyframes raIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.ra-card h3{margin:0 0 4px;font-size:17px}
.ra-dim{color:var(--ra-dim);font-size:13px}
.ra-btn{border:0;cursor:pointer;border-radius:12px;padding:10px 18px;font-weight:700;font-size:14px;color:#fff;background:linear-gradient(135deg,#5b8cff,#8b5cf6);box-shadow:0 6px 18px rgba(91,140,255,.3);transition:transform .15s}
.ra-btn:hover{transform:translateY(-2px)}
.ra-btn:disabled{opacity:.5;cursor:default;transform:none}
.ra-btn.ghost{background:var(--ra-soft);color:inherit;box-shadow:none;border:1px solid var(--ra-line)}
.ra-btn.danger{background:linear-gradient(135deg,#ef4444,#b91c1c);box-shadow:none}
.ra-btn.sm{padding:6px 12px;font-size:12px;border-radius:9px}
.ra-ordre{display:flex;flex-direction:column;gap:8px;margin:14px 0}
.ra-ligne{display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:12px;border:1px solid var(--ra-line);background:var(--ra-bg);cursor:grab;transition:transform .15s,border-color .15s}
.ra-ligne.survol{border-color:#ec4899;transform:scale(1.01)}
.ra-rang{flex:0 0 34px;height:34px;border-radius:50%;display:grid;place-items:center;font-weight:800;color:#fff;background:linear-gradient(135deg,#f59e0b,#ec4899)}
.ra-ligne.non .ra-rang{background:var(--ra-line);color:var(--ra-dim)}
.ra-ligne b{flex:1}
.ra-sec{font-size:12px;color:var(--ra-dim);padding:3px 10px;border-radius:99px;background:var(--ra-soft)}
.ra-fleches button{border:1px solid var(--ra-line);background:var(--ra-soft);color:inherit;border-radius:8px;width:30px;height:30px;cursor:pointer;margin-left:4px}
.ra-regles{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px}
.ra-regle{border:1px solid var(--ra-line);border-radius:16px;padding:16px 18px;background:var(--ra-bg);animation:raIn .35s both}
.ra-regle.inactive{opacity:.55}
.ra-portee{display:inline-block;font-size:11px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;padding:3px 10px;border-radius:99px;background:rgba(91,140,255,.18);color:#7aa2ff;margin-bottom:8px}
.ra-paliers{display:flex;flex-direction:column;gap:6px;margin:10px 0 12px}
.ra-palier{display:flex;align-items:center;gap:10px;font-size:13px}
.ra-chip{display:inline-block;padding:3px 11px;border-radius:99px;font-size:12px;font-weight:800;border:1px solid transparent}
.ra-chip.admis{background:rgba(34,197,94,.16);color:#22c55e;border-color:rgba(34,197,94,.45)}
.ra-chip.ailleurs{background:rgba(245,158,11,.16);color:#f59e0b;border-color:rgba(245,158,11,.45)}
.ra-chip.maintenu{background:rgba(239,68,68,.15);color:#ef4444;border-color:rgba(239,68,68,.45)}
.ra-chip.exclu{background:rgba(148,163,184,.2);color:#94a3b8;border-color:rgba(148,163,184,.45)}
.ra-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin:12px 0}
.ra-form label{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.7px;color:var(--ra-dim);margin-bottom:5px}
.ra-form input,.ra-form select,.ra-trow input,.ra-trow select,.ra-sel{box-sizing:border-box;width:100%;padding:9px 11px;border-radius:10px;border:1.5px solid var(--ra-line);background:var(--ra-bg);color:inherit;font-size:14px}
.ra-trow{display:grid;grid-template-columns:90px 160px 1fr 36px;gap:10px;margin-bottom:8px;align-items:center}
.ra-trow select option,.ra-form select option,.ra-sel option{color:#111;background:#fff}
.ra-apercu{margin-top:10px;padding:12px 14px;border-radius:12px;background:rgba(91,140,255,.08);border:1px solid rgba(91,140,255,.3);font-size:13px;line-height:1.7}
.ra-err{background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.45);color:#f87171;border-radius:10px;padding:9px 12px;font-size:13px;margin:10px 0}
.ra-ok{background:rgba(34,197,94,.12);border:1px solid rgba(34,197,94,.45);color:#22c55e;border-radius:10px;padding:9px 12px;font-size:13px;margin:10px 0}
.ra-couv{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.ra-couv span{padding:5px 12px;border-radius:99px;font-size:12px;font-weight:600;border:1px solid var(--ra-line);background:var(--ra-bg)}
.ra-couv span.manque{border-color:rgba(239,68,68,.6);color:#f87171}
.ra-res{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin:14px 0}
.ra-stat{border-radius:14px;padding:12px 14px;border:1px solid var(--ra-line);background:var(--ra-bg)}
.ra-stat b{display:block;font-size:26px}
.ra-table-wrap{border:1px solid var(--ra-line);border-radius:14px;overflow:auto;max-height:60vh}
.ra-table{border-collapse:separate;border-spacing:0;width:100%}
.ra-table th{position:sticky;top:0;background:var(--ra-bg);padding:10px 12px;font-size:12px;text-transform:uppercase;letter-spacing:.5px;color:var(--ra-dim);text-align:center;border-bottom:1px solid var(--ra-line)}
.ra-table td{padding:8px 12px;border-bottom:1px solid var(--ra-soft);text-align:center}
.ra-table td.nom,.ra-table th.nom{text-align:left}
.ra-vide{text-align:center;padding:40px 16px;color:var(--ra-dim)}
`;

async function api(url, methode, corps) {
  if (methode && methode !== "GET") {
    const auth = await authPourAction(methode, url, corps);
    if (!auth) { const er = new Error("Action annulee."); er.annule = true; throw er; }
    corps = { ...(corps || {}), auth_username: auth.username, auth_password: auth.password };
  }
  const r = await fetch(url, { method: methode || "GET", headers: { "Content-Type": "application/json" }, body: corps ? JSON.stringify(corps) : undefined });
  let d = {};
  try { d = await r.json(); } catch (e) {}
  if (!r.ok) { const er = new Error(d.error || "Erreur " + r.status); er.confirmation = !!d.confirmation; throw er; }
  return d;
}

const fmt = (v) => (v === null || v === undefined ? "—" : (Math.round(Number(v) * 100) / 100).toString().replace(".", ","));
const DECISIONS = [["admis", "Admis"], ["ailleurs", "Admis ailleurs"], ["maintenu", "Echec / maintenu"], ["exclu", "Exclu"]];
const VIDE = { nom: "", portee: "toutes", section_id: "", classe_debut: "", classe_fin: "", manquant: "compter", statut: "active",
  tiers: [{ min: 0, decision: "maintenu", libelle: "Echec" }, { min: 4.99, decision: "ailleurs", libelle: "Admis ailleurs" }, { min: 5.5, decision: "admis", libelle: "Admis" }] };

function themeClair(depart) {
  let el = depart;
  while (el) {
    const m = getComputedStyle(el).backgroundColor.match(/[\d.]+/g);
    if (m) { const c = m.map(Number); if (c.length < 4 || c[3] > 0.5) return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2] > 160; }
    el = el.parentElement;
  }
  return false;
}

function resumeTiers(tiers, base) {
  const t = tiers.slice().sort((a, b) => Number(a.min) - Number(b.min));
  return t.map((p, i) => {
    const suivant = t[i + 1];
    const de = fmt(p.min);
    return suivant ? "De " + de + " a moins de " + fmt(suivant.min) + " → " + p.libelle : "A partir de " + de + " → " + p.libelle;
  });
}

function Chip({ decision, children }) { return <span className={"ra-chip " + decision}>{children}</span>; }

function Ordre({ onMessage }) {
  const [liste, setListe] = useState([]);
  const [modif, setModif] = useState(false);
  const [survol, setSurvol] = useState(null);
  const source = useRef(null);
  const charger = () => api("/api/ordre-classes").then((d) => { setListe(d); setModif(false); }).catch((e) => onMessage(e.message, true));
  useEffect(() => { charger(); }, []);
  const deplacer = (de, vers) => {
    if (vers < 0 || vers >= liste.length || de === vers) return;
    const n = liste.slice(); const [x] = n.splice(de, 1); n.splice(vers, 0, x); setListe(n); setModif(true);
  };
  const enregistrer = async () => {
    try { await api("/api/ordre-classes", "PUT", { noms: liste.map((c) => c.nom) }); onMessage("Ordre des classes enregistre.", false); charger(); }
    catch (e) { if (!e.annule) onMessage(e.message, true); }
  };
  const sansOrdre = liste.filter((c) => !c.ordonnee).length;
  return (
    <div className="ra-card">
      <h3>Ordre des classes</h3>
      <div className="ra-dim">Glisse les classes ou utilise les fleches : de la plus basse a la plus haute. Une classe admise passe automatiquement a la suivante dans cette liste. Cet ordre est independant de l'ordre alphabetique ou de creation.</div>
      {sansOrdre > 0 && !modif && <div className="ra-err">{sansOrdre} classe(s) n'ont pas encore de place dans l'ordre. Place-les puis enregistre.</div>}
      {!liste.length && <div className="ra-vide">Aucune classe.</div>}
      <div className="ra-ordre">
        {liste.map((c, i) => (
          <div key={c.nom} className={"ra-ligne" + (c.ordonnee || modif ? "" : " non") + (survol === i ? " survol" : "")} draggable
            onDragStart={() => { source.current = i; }} onDragOver={(e) => { e.preventDefault(); setSurvol(i); }} onDragLeave={() => setSurvol(null)}
            onDrop={() => { setSurvol(null); if (source.current !== null) deplacer(source.current, i); source.current = null; }}>
            <div className="ra-rang">{i + 1}</div>
            <b>{c.nom}</b>
            {c.section && <span className="ra-sec">{c.section}</span>}
            <span className="ra-fleches">
              <button onClick={() => deplacer(i, i - 1)} disabled={i === 0} title="Monter">▲</button>
              <button onClick={() => deplacer(i, i + 1)} disabled={i === liste.length - 1} title="Descendre">▼</button>
            </span>
          </div>
        ))}
      </div>
      <button className="ra-btn" disabled={!liste.length || (!modif && sansOrdre === 0)} onClick={enregistrer}>Enregistrer l'ordre</button>
    </div>
  );
}

function EditeurRegle({ depart, sections, classesOrdonnees, onAnnuler, onSauve, onMessage }) {
  const [f, setF] = useState(depart);
  const [erreur, setErreur] = useState("");
  const maj = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const majTier = (i, k, v) => setF((x) => ({ ...x, tiers: x.tiers.map((t, j) => (j === i ? { ...t, [k]: v } : t)) }));
  const sauver = async () => {
    setErreur("");
    const corps = { ...f, section_id: f.section_id || null,
      tiers: f.tiers.map((t) => ({ min: Number(String(t.min).replace(",", ".")), decision: t.decision, libelle: t.libelle })) };
    try {
      if (f.id) await api("/api/regles/" + f.id, "PUT", corps); else await api("/api/regles", "POST", corps);
      onMessage("Regle enregistree.", false); onSauve();
    } catch (e) { if (!e.annule) setErreur(e.message); }
  };
  const tiersNum = f.tiers.map((t) => ({ ...t, min: Number(String(t.min).replace(",", ".")) || 0 }));
  return (
    <div className="ra-card">
      <h3>{f.id ? "Modifier la regle" : "Nouvelle regle"}</h3>
      <div className="ra-form">
        <div><label>Nom de la regle</label><input value={f.nom} onChange={(e) => maj("nom", e.target.value)} placeholder="Ex. Regle du secondaire" /></div>
        <div><label>S'applique a</label>
          <select value={f.portee} onChange={(e) => maj("portee", e.target.value)}>
            <option value="toutes">Toutes les classes</option><option value="section">Une section</option><option value="intervalle">Un intervalle de classes</option>
          </select></div>
        {f.portee === "section" && <div><label>Section</label>
          <select value={f.section_id || ""} onChange={(e) => maj("section_id", e.target.value)}><option value="">— choisir —</option>{sections.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}</select></div>}
        {f.portee === "intervalle" && <>
          <div><label>De la classe</label><select value={f.classe_debut || ""} onChange={(e) => maj("classe_debut", e.target.value)}><option value="">— choisir —</option>{classesOrdonnees.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
          <div><label>A la classe</label><select value={f.classe_fin || ""} onChange={(e) => maj("classe_fin", e.target.value)}><option value="">— choisir —</option>{classesOrdonnees.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
        </>}
        <div><label>Controle sans note</label>
          <select value={f.manquant} onChange={(e) => maj("manquant", e.target.value)}>
            <option value="compter">Compte comme 0 (diviseur = tous les controles)</option>
            <option value="ignorer">Ignore (diviseur = controles evalues)</option>
          </select></div>
        <div><label>Etat</label><select value={f.statut} onChange={(e) => maj("statut", e.target.value)}><option value="active">Active</option><option value="inactive">Desactivee</option></select></div>
      </div>
      <label className="ra-dim" style={{ display: "block", margin: "14px 0 8px" }}>Paliers de moyenne (le premier commence a 0)</label>
      {f.tiers.map((t, i) => (
        <div className="ra-trow" key={i}>
          <input value={t.min} onChange={(e) => majTier(i, "min", e.target.value)} title="A partir de" />
          <select value={t.decision} onChange={(e) => majTier(i, "decision", e.target.value)}>{DECISIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <input value={t.libelle} onChange={(e) => majTier(i, "libelle", e.target.value)} placeholder="Texte affiche" />
          <button className="ra-btn danger sm" disabled={f.tiers.length <= 2} onClick={() => setF((x) => ({ ...x, tiers: x.tiers.filter((_, j) => j !== i) }))}>✕</button>
        </div>
      ))}
      <button className="ra-btn ghost sm" onClick={() => setF((x) => ({ ...x, tiers: [...x.tiers, { min: "", decision: "admis", libelle: "" }] }))}>+ Ajouter un palier</button>
      <div className="ra-apercu"><b>Apercu</b><br />{resumeTiers(tiersNum).map((l, i) => <div key={i}>{l}</div>)}</div>
      {erreur && <div className="ra-err">{erreur}</div>}
      <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
        <button className="ra-btn" onClick={sauver}>Enregistrer la regle</button>
        <button className="ra-btn ghost" onClick={onAnnuler}>Annuler</button>
      </div>
    </div>
  );
}

function Regles({ year, onMessage }) {
  const [data, setData] = useState({ regles: [], couverture: [] });
  const [ordre, setOrdre] = useState([]);
  const [edition, setEdition] = useState(null);
  const charger = () => {
    api("/api/regles?year=" + year).then(setData).catch((e) => onMessage(e.message, true));
    api("/api/ordre-classes").then(setOrdre).catch(() => {});
  };
  useEffect(() => { charger(); }, [year]);
  const sections = useMemo(() => { const m = {}; ordre.forEach((c) => { if (c.section_id) m[c.section_id] = c.section; }); return Object.keys(m).map((id) => ({ id, nom: m[id] })); }, [ordre]);
  const classesOrdonnees = ordre.filter((c) => c.ordonnee).map((c) => c.nom);
  const nomSection = (id) => (sections.find((s) => s.id === id) || {}).nom || "section";
  const supprimer = async (r) => { try { await api("/api/regles/" + r.id, "DELETE", {}); onMessage("Regle supprimee.", false); charger(); } catch (e) { if (!e.annule) onMessage(e.message, true); } };
  const modele = async () => { try { await api("/api/regles/modele", "POST", {}); onMessage("Regle modele creee : tu peux la modifier.", false); charger(); } catch (e) { if (!e.annule) onMessage(e.message, true); } };
  const modifier = (r) => setEdition({ ...r, section_id: r.section_id || "", classe_debut: r.classe_debut || "", classe_fin: r.classe_fin || "", tiers: r.tiers.map((t) => ({ min: t.min_moyenne, decision: t.decision, libelle: t.libelle })) });
  const sansRegle = data.couverture.filter((c) => !c.regle);
  const libellePortee = (r) => r.portee === "toutes" ? "Toutes les classes" : r.portee === "section" ? "Section : " + nomSection(r.section_id) : "De " + r.classe_debut + " a " + r.classe_fin;
  return (
    <>
      {edition ? (
        <EditeurRegle depart={edition} sections={sections} classesOrdonnees={classesOrdonnees} onMessage={onMessage}
          onAnnuler={() => setEdition(null)} onSauve={() => { setEdition(null); charger(); }} />
      ) : (
        <div className="ra-card">
          <h3>Regles de decision</h3>
          <div className="ra-dim">En cas de plusieurs regles possibles pour une classe : l'intervalle le plus precis gagne, puis la section, puis « toutes les classes ».</div>
          <div style={{ display: "flex", gap: 10, margin: "14px 0" }}>
            <button className="ra-btn" onClick={() => setEdition({ ...VIDE })}>+ Nouvelle regle</button>
            {!data.regles.length && <button className="ra-btn ghost" onClick={modele}>Creer la regle modele (≥ 5,50 admis · 4,99 admis ailleurs · sinon echec)</button>}
          </div>
          {!data.regles.length && <div className="ra-vide">Aucune regle definie.</div>}
          <div className="ra-regles">
            {data.regles.map((r) => (
              <div className={"ra-regle" + (r.statut === "inactive" ? " inactive" : "")} key={r.id}>
                <span className="ra-portee">{libellePortee(r)}</span>
                <h3 style={{ margin: 0 }}>{r.nom}</h3>
                <div className="ra-paliers">
                  {r.tiers.map((t, i) => {
                    const suivant = r.tiers[i + 1];
                    return <div className="ra-palier" key={i}><Chip decision={t.decision}>{t.libelle}</Chip><span className="ra-dim">{suivant ? "de " + fmt(t.min_moyenne) + " a moins de " + fmt(suivant.min_moyenne) : "≥ " + fmt(t.min_moyenne)}</span></div>;
                  })}
                </div>
                <div className="ra-dim">Controle sans note : {r.manquant === "compter" ? "compte comme 0" : "ignore"}{r.statut === "inactive" ? " · desactivee" : ""}</div>
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button className="ra-btn ghost sm" onClick={() => modifier(r)}>Modifier</button>
                  <button className="ra-btn danger sm" onClick={() => supprimer(r)}>Supprimer</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {!edition && data.couverture.length > 0 && (
        <div className="ra-card">
          <h3>Couverture des classes de cette annee</h3>
          <div className="ra-dim">{sansRegle.length ? sansRegle.length + " classe(s) n'ont aucune regle : leurs eleves n'auront pas de decision automatique." : "Toutes les classes ont une regle."}</div>
          <div className="ra-couv">{data.couverture.map((c) => <span key={c.classe} className={c.regle ? "" : "manque"}>{c.classe} · {c.regle || "aucune regle"}{c.ordonnee ? "" : " · hors ordre"}</span>)}</div>
        </div>
      )}
    </>
  );
}

function Resultats({ year, onMessage }) {
  const [classes, setClasses] = useState([]);
  const [classeId, setClasseId] = useState("");
  const [res, setRes] = useState(null);
  useEffect(() => { api("/api/classes-par-annee?year=" + year).then((d) => setClasses(Array.isArray(d) ? d : [])).catch(() => {}); setClasseId(""); setRes(null); }, [year]);
  useEffect(() => {
    if (!classeId) { setRes(null); return; }
    api("/api/promotion/calcul?class_id=" + classeId).then(setRes).catch((e) => onMessage(e.message, true));
  }, [classeId]);
  const [envoi, setEnvoi] = useState(false);
  const appliquer = async () => {
    if (!res || !classeId) return;
    setEnvoi(true);
    try {
      let r;
      try { r = await api("/api/promotion/appliquer", "POST", { class_id: classeId }); }
      catch (e) {
        if (!e.confirmation) throw e;
        if (!window.confirm(e.message + " Continuer ?")) { setEnvoi(false); return; }
        r = await api("/api/promotion/appliquer", "POST", { class_id: classeId, confirmer: true });
      }
      let t = r.ecrites + " decision(s) enregistree(s) pour " + res.classe.nom + ".";
      if (r.sans_decision) t += " " + r.sans_decision + " eleve(s) sans decision (notes manquantes).";
      if (r.sans_classe_suivante.length) t += " Sans classe suivante : " + r.sans_classe_suivante.join(", ") + ".";
      onMessage(t + " Le passage a l'annee suivante se fait dans la migration d'annee.", false);
    } catch (e) { if (!e.annule) onMessage(e.message, true); }
    setEnvoi(false);
  };
  const stats = res ? [["admis", "Admis"], ["ailleurs", "Admis ailleurs"], ["maintenu", "Echecs"], ["exclu", "Exclus"], ["sans_decision", "Sans decision"]] : [];
  return (
    <div className="ra-card">
      <h3>Resultats de fin d'annee</h3>
      <div className="ra-dim">Calcul automatique a partir de tous les controles de l'annee, d'apres la regle de la classe.</div>
      <div style={{ maxWidth: 320, margin: "14px 0" }}>
        <select className="ra-sel" value={classeId} onChange={(e) => setClasseId(e.target.value)}>
          <option value="">— choisir une classe —</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
        </select>
      </div>
      {res && (<>
        {!res.regle && <div className="ra-err">Aucune regle ne s'applique a cette classe. Va dans l'onglet « Regles de decision ».</div>}
        {!res.classe.ordonnee && <div className="ra-err">Cette classe n'est pas dans l'ordre des classes : la classe suivante ne peut pas etre determinee.</div>}
        {res.regle && <div className="ra-dim">Regle appliquee : <b>{res.regle.nom}</b> · {res.periodes.length} controle(s) · controle sans note : {res.manquant === "compter" ? "compte comme 0" : "ignore"}</div>}
        {res.regle && res.eleves.length > 0 && <div style={{ margin: "12px 0" }}>
          <button className="ra-btn" disabled={envoi} onClick={appliquer}>{envoi ? "Enregistrement..." : "Appliquer ces decisions"}</button>
          <span className="ra-dim" style={{ marginLeft: 12 }}>Enregistre les decisions pour la migration d'annee. Les eleves ne changent pas encore de classe.</span>
        </div>}
        <div className="ra-res">{stats.map(([k, l]) => <div className="ra-stat" key={k}><b>{res.resume[k]}</b><span className="ra-dim">{l}</span></div>)}</div>
        <div className="ra-table-wrap">
          <table className="ra-table">
            <thead><tr><th>Rang</th><th className="nom">Eleve</th>{res.periodes.map((p) => <th key={p.id}>{p.nom}</th>)}<th>Moyenne annuelle</th><th>Decision</th><th>Classe suivante</th></tr></thead>
            <tbody>
              {res.eleves.map((e) => (
                <tr key={e.id}>
                  <td>{e.rang || "—"}</td><td className="nom"><b>{e.nom}</b> {e.prenom}</td>
                  {e.moyennes.map((m, i) => <td key={i}>{fmt(m)}</td>)}
                  <td><b>{fmt(e.annuelle)}</b> <span className="ra-dim">/ {res.base}</span></td>
                  <td>{e.decision ? <Chip decision={e.decision}>{e.libelle}</Chip> : <span className="ra-dim">—</span>}</td>
                  <td>{e.suivante || "—"}</td>
                </tr>
              ))}
              {!res.eleves.length && <tr><td colSpan={res.periodes.length + 5} className="ra-vide">Aucun eleve dans cette classe.</td></tr>}
            </tbody>
          </table>
        </div>
      </>)}
      {!res && <div className="ra-vide">Choisis une classe pour voir les decisions.</div>}
    </div>
  );
}

export default function RegleAcademiques() {
  const user = usePontPedagogie();
  definirUtilisateur(user);
  const { currentYear } = useYear();
  const racine = useRef(null);
  const [clair, setClair] = useState(false);
  useEffect(() => { if (racine.current) setClair(themeClair(racine.current.parentElement)); }, []);
  const [onglet, setOnglet] = useState("regles");
  const [message, setMessage] = useState(null);
  const notifier = (texte, erreur) => { setMessage({ texte, erreur }); if (!erreur) setTimeout(() => setMessage(null), 3500); };
  const year = currentYear ? currentYear.id : "";
  return (
    <div className={"page ra-root " + (clair ? "ra-clair" : "ra-sombre")} ref={racine}>
      <style>{CSS}</style>
      <div className="ra-hero">
        <h1>Regles academiques</h1>
        <p>L'etablissement definit ses propres regles de passage. La decision de chaque eleve est calculee automatiquement a partir des controles de l'annee.</p>
        <div className="ra-formule">Moyenne annuelle = (somme des moyennes des controles) ÷ (nombre de controles crees)</div>
      </div>
      <div className="ra-onglets">
        {[["regles", "Regles de decision"], ["ordre", "Ordre des classes"], ["resultats", "Resultats de fin d'annee"]].map(([k, l]) =>
          <button key={k} className={"ra-onglet" + (onglet === k ? " on" : "")} onClick={() => setOnglet(k)}>{l}</button>)}
      </div>
      {message && <div className={message.erreur ? "ra-err" : "ra-ok"}>{message.texte}</div>}
      {onglet === "regles" && <Regles year={year} onMessage={notifier} />}
      {onglet === "ordre" && <Ordre onMessage={notifier} />}
      {onglet === "resultats" && <Resultats year={year} onMessage={notifier} />}
    </div>
  );
}
