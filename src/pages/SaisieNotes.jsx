import React, { useState, useEffect, useRef, useMemo } from "react";
import { useYear as useYear } from "../YearContext.jsx";
import { usePontPedagogie } from "../pedagogie/pont.js";

/* ============================================================
   Saisie des notes : section → classe → salle → contrôle → matière
   Enregistrement automatique, maximum = coefficient, session confirmée par mot de passe.
   ============================================================ */

const CSS = `
.sn-sombre{--sn-bg:#0f172a;--sn-fg:#e2e8f0;--sn-soft:rgba(255,255,255,.05);--sn-line:rgba(255,255,255,.14);--sn-dim:#94a3b8}
.sn-clair{--sn-bg:#ffffff;--sn-fg:#0f172a;--sn-soft:rgba(15,23,42,.045);--sn-line:rgba(15,23,42,.16);--sn-dim:#64748b}
.sn-root{position:relative;padding-bottom:110px;color:var(--sn-fg)}
.sn-hero{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;padding:22px 26px;border-radius:18px;margin-bottom:18px;
  background:linear-gradient(120deg,rgba(91,140,255,.22),rgba(168,85,247,.18) 55%,rgba(20,200,170,.16));border:1px solid var(--sn-line);overflow:hidden;position:relative}
.sn-hero:before{content:"";position:absolute;right:-60px;top:-60px;width:220px;height:220px;border-radius:50%;background:radial-gradient(circle,var(--sn-line),transparent 70%)}
.sn-hero h1{margin:0;font-size:26px;letter-spacing:-.3px}
.sn-hero p{margin:4px 0 0;color:var(--sn-dim);font-size:13px;max-width:560px}
.sn-session{display:flex;align-items:center;gap:12px;flex-wrap:wrap;position:relative;z-index:1}
.sn-chip{display:inline-flex;align-items:center;gap:8px;padding:8px 14px;border-radius:999px;font-size:13px;font-weight:600;background:var(--sn-soft);border:1px solid var(--sn-line)}
.sn-chip.on{background:rgba(34,197,94,.14);border-color:rgba(34,197,94,.5);color:#4ade80}
.sn-dot{width:9px;height:9px;border-radius:50%;background:#94a3b8}
.sn-chip.on .sn-dot{background:#22c55e;animation:snPulse 1.6s infinite}
@keyframes snPulse{0%{box-shadow:0 0 0 0 rgba(34,197,94,.6)}70%{box-shadow:0 0 0 9px rgba(34,197,94,0)}100%{box-shadow:0 0 0 0 rgba(34,197,94,0)}}
.sn-btn{border:0;cursor:pointer;border-radius:12px;padding:10px 18px;font-weight:700;font-size:14px;color:#fff;background:linear-gradient(135deg,#5b8cff,#8b5cf6);box-shadow:0 6px 18px rgba(91,140,255,.35);transition:transform .15s,box-shadow .15s}
.sn-btn:hover{transform:translateY(-2px);box-shadow:0 10px 24px rgba(91,140,255,.45)}
.sn-btn.fin{background:linear-gradient(135deg,#16a34a,#14b8a6);box-shadow:0 6px 18px rgba(20,184,166,.35)}
.sn-btn.ghost{background:var(--sn-soft);box-shadow:none;color:inherit}
.sn-btn:disabled{opacity:.5;cursor:default;transform:none}

.sn-etapes{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:14px;margin-bottom:22px;position:relative}
.sn-etape{display:flex;gap:12px;align-items:center;padding:14px 16px;border-radius:16px;background:var(--sn-soft);border:1px solid var(--sn-line);transition:border-color .25s,box-shadow .25s,transform .25s}
.sn-etape.on{border-color:rgba(91,140,255,.65);box-shadow:0 0 0 3px rgba(91,140,255,.12)}
.sn-num{flex:0 0 34px;height:34px;border-radius:50%;display:grid;place-items:center;font-weight:800;background:var(--sn-soft)}
.sn-etape.on .sn-num{background:linear-gradient(135deg,#5b8cff,#8b5cf6);color:#fff}
.sn-etape label{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.8px;color:var(--sn-dim);margin-bottom:4px}
.sn-etape select{width:100%;border:0;background:transparent;font-size:15px;font-weight:600;color:inherit;outline:none;cursor:pointer}
.sn-etape select option{color:#111;background:#fff}

.sn-vide{text-align:center;padding:60px 20px;color:var(--sn-dim)}
.sn-vide b{display:block;font-size:18px;color:inherit;margin-bottom:6px}

.sn-tuiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:16px}
.sn-tuile{--h:220;position:relative;text-align:left;cursor:pointer;border:1px solid hsl(var(--h) 60% 55% / .35);border-radius:18px;padding:18px;color:inherit;
  background:linear-gradient(150deg,hsl(var(--h) 70% 55% / .18),hsl(var(--h) 70% 55% / .05));transition:transform .2s,box-shadow .2s;animation:snRise .5s both}
.sn-tuile:hover{transform:translateY(-5px) scale(1.01);box-shadow:0 14px 30px hsl(var(--h) 70% 45% / .3)}
.sn-tuile h4{margin:12px 0 2px;font-size:17px}
.sn-tuile small{color:var(--sn-dim)}
.sn-ring{--p:0;width:54px;height:54px;border-radius:50%;display:grid;place-items:center;font-size:12px;font-weight:800;position:relative;
  background:conic-gradient(hsl(var(--h) 75% 58%) calc(var(--p) * 1%),var(--sn-line) 0)}
.sn-ring:before{content:"";position:absolute;inset:5px;border-radius:50%;background:var(--sn-bg)}
.sn-ring span{position:relative}
.sn-tuile.tout{--h:280}
@keyframes snRise{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}

.sn-zone{animation:snFade .45s both}
@keyframes snFade{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.sn-entete{--h:220;display:flex;align-items:center;gap:18px;flex-wrap:wrap;padding:16px 20px;border-radius:16px;margin-bottom:14px;
  background:linear-gradient(120deg,hsl(var(--h) 70% 55% / .25),hsl(var(--h) 70% 55% / .06));border:1px solid hsl(var(--h) 60% 55% / .4)}
.sn-entete h2{margin:0;font-size:22px}
.sn-meta{color:var(--sn-dim);font-size:13px}
.sn-barre{flex:1 1 180px;height:9px;border-radius:99px;background:var(--sn-line);overflow:hidden;min-width:140px}
.sn-barre i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,hsl(var(--h) 75% 55%),#22c55e);transition:width .5s}

.sn-table-wrap{border:1px solid var(--sn-line);border-radius:16px;overflow:auto;max-height:calc(100vh - 430px);min-height:280px;background:var(--sn-soft)}
.sn-table{border-collapse:separate;border-spacing:0;width:100%}
.sn-table th{position:sticky;top:0;z-index:2;background:var(--sn-bg);padding:10px 12px;font-size:12px;text-transform:uppercase;letter-spacing:.5px;color:var(--sn-dim);text-align:center;border-bottom:1px solid var(--sn-line)}
.sn-table td{padding:7px 12px;border-bottom:1px solid var(--sn-soft);text-align:center}
.sn-table tr:hover td{background:rgba(255,255,255,.035)}
.sn-table td.nom,.sn-table th.nom{text-align:left;position:sticky;left:0;z-index:1;background:var(--sn-bg)}
.sn-table th.nom{z-index:3}
.sn-eleve{display:flex;align-items:center;gap:10px;white-space:nowrap}
.sn-av{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font-size:12px;font-weight:800;color:#fff;object-fit:cover;flex:0 0 34px}
.sn-in{width:84px;text-align:center;font-size:16px;font-weight:700;padding:8px 6px;border-radius:10px;border:1.5px solid var(--sn-line);background:var(--sn-soft);color:inherit;outline:none;transition:border-color .2s,box-shadow .2s,background .2s}
.sn-in:focus{border-color:#5b8cff;box-shadow:0 0 0 3px rgba(91,140,255,.25);background:rgba(91,140,255,.08)}
.sn-in.ok{border-color:rgba(34,197,94,.7)}
.sn-in.err{border-color:#ef4444;background:rgba(239,68,68,.1);animation:snShake .35s}
.sn-in.abs{color:#f59e0b;border-color:rgba(245,158,11,.6)}
.sn-in:read-only{cursor:pointer;opacity:.85}
.sn-in.petit{width:68px;font-size:14px;padding:6px 4px}
@keyframes snShake{25%{transform:translateX(-5px)}50%{transform:translateX(5px)}75%{transform:translateX(-3px)}}
.sn-etat{display:inline-block;width:22px;font-size:15px}
.sn-etat.ok{color:#22c55e;animation:snPop .35s}
.sn-etat.envoi{color:#94a3b8}
.sn-etat.err{color:#ef4444}
@keyframes snPop{from{transform:scale(.3)}to{transform:scale(1)}}
.sn-msg{display:block;font-size:11px;color:#ef4444;margin-top:2px}
.sn-max{color:var(--sn-dim);font-size:12px;margin-left:4px}

.sn-dock{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:50;max-width:min(1100px,94vw);display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:center;
  padding:10px 16px;border-radius:20px;background:rgba(15,23,42,.82);backdrop-filter:blur(14px);border:1px solid var(--sn-line);box-shadow:0 14px 40px rgba(0,0,0,.45);animation:snDock .5s both}
@keyframes snDock{from{opacity:0;transform:translate(-50%,40px)}to{opacity:1;transform:translate(-50%,0)}}
.sn-dock-l{font-size:11px;text-transform:uppercase;letter-spacing:.8px;color:#94a3b8}
.sn-pill{--h:220;border:1px solid hsl(var(--h) 60% 55% / .5);background:hsl(var(--h) 70% 55% / .16);color:#e2e8f0;border-radius:999px;padding:7px 14px;cursor:pointer;font-size:13px;font-weight:600;display:inline-flex;align-items:center;gap:7px;animation:snPill .5s both;transition:transform .15s,background .15s}
.sn-pill:hover{transform:translateY(-3px);background:hsl(var(--h) 70% 55% / .32)}
.sn-pill.done:after{content:"✓";color:#22c55e;font-weight:800}
.sn-pill.tout{--h:280}
@keyframes snPill{from{opacity:0;transform:translateY(-26px) scale(.9)}to{opacity:1;transform:none}}

.sn-rideau{position:fixed;inset:0;z-index:9000;pointer-events:none;overflow:hidden}
.sn-rideau .p1,.sn-rideau .p2{position:absolute;inset:0;transform:translateX(-102%)}
.sn-rideau .p1{background:linear-gradient(120deg,#1e3a8a,#5b21b6 55%,#0f766e);animation:snSweep .95s cubic-bezier(.7,0,.25,1) both}
.sn-rideau .p2{background:var(--sn-line);animation:snSweep .95s .07s cubic-bezier(.7,0,.25,1) both}
@keyframes snSweep{0%{transform:translateX(-102%)}38%{transform:translateX(0)}62%{transform:translateX(0)}100%{transform:translateX(102%)}}
.sn-rideau .txt{position:absolute;inset:0;display:grid;place-content:center;text-align:center;color:#fff;animation:snTxt .95s both}
.sn-rideau .txt small{display:block;text-transform:uppercase;letter-spacing:6px;font-size:13px;opacity:.75;margin-bottom:10px}
.sn-rideau .txt b{font-size:clamp(34px,6vw,64px);letter-spacing:-1px}
@keyframes snTxt{0%,28%{opacity:0;transform:scale(.9)}42%,60%{opacity:1;transform:scale(1)}74%,100%{opacity:0;transform:scale(1.06)}}

.sn-modal-bg{position:fixed;inset:0;z-index:9500;background:rgba(2,6,23,.66);backdrop-filter:blur(6px);display:grid;place-items:center;animation:snFade .25s both}
.sn-modal{color:var(--sn-fg);width:min(480px,92vw);border-radius:22px;padding:26px;background:var(--sn-bg);border:1px solid var(--sn-line);box-shadow:0 30px 80px rgba(0,0,0,.6);animation:snRise .4s both}
.sn-modal h3{margin:0 0 6px;font-size:21px}
.sn-regles{margin:12px 0 16px;padding:0;list-style:none;display:grid;gap:9px;font-size:13.5px}
.sn-regles li{display:flex;gap:10px;align-items:flex-start;line-height:1.4}
.sn-regles li:before{content:"";flex:0 0 8px;height:8px;margin-top:6px;border-radius:50%;background:linear-gradient(135deg,#5b8cff,#14b8a6)}
.sn-modal input{box-sizing:border-box;width:100%;margin:4px 0 12px;padding:11px 12px;border-radius:10px;border:1.5px solid var(--sn-line);background:var(--sn-soft);color:inherit;font-size:15px}
.sn-modal label{font-size:12px;color:#94a3b8}
.sn-err{background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.45);color:#fca5a5;border-radius:10px;padding:9px 12px;font-size:13px;margin-bottom:12px}
.sn-fin-ring{width:84px;height:84px;border-radius:50%;margin:0 auto 12px;display:grid;place-items:center;font-size:40px;color:#fff;background:linear-gradient(135deg,#16a34a,#14b8a6);animation:snPop .5s both}
`;

async function api(url, methode, corps) {
  const r = await fetch(url, { method: methode || "GET", headers: { "Content-Type": "application/json" }, body: corps ? JSON.stringify(corps) : undefined });
  let d = {};
  try { d = await r.json(); } catch (e) {}
  if (!r.ok) { const er = new Error(d.error || "Erreur " + r.status); er.session = !!d.session; throw er; }
  return d;
}

const hue = (i) => (210 + i * 47) % 360;
const initiales = (e) => ((e.prenom || "")[0] || "") + ((e.nom || "")[0] || "");
const fmtN = (v) => (Math.round(Number(v) * 100) / 100).toString().replace(".", ",");

function analyser(texte, max) {
  const t = String(texte == null ? "" : texte).trim().replace(",", ".");
  if (t === "") return { vide: true };
  if (/^a(bs)?$/i.test(t)) return { absent: true };
  if (!/^\d+(\.\d{0,2})?$/.test(t)) return { erreur: "Nombre invalide" };
  const v = Number(t);
  if (v > Number(max)) return { erreur: "Maximum : " + fmtN(max) };
  return { note: v };
}

function themeClair(depart) {
  let el = depart;
  while (el) {
    const m = getComputedStyle(el).backgroundColor.match(/[\d.]+/g);
    if (m) {
      const c = m.map(Number);
      if (c.length < 4 || c[3] > 0.5) return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2] > 160;
    }
    el = el.parentElement;
  }
  return false;
}

export default function SaisieNotes() {
  const user = usePontPedagogie();
  const { currentYear } = useYear();
  const racine = useRef(null);
  const [clair, setClair] = useState(false);
  useEffect(() => { if (racine.current) setClair(themeClair(racine.current.parentElement)); }, []);
  const [struct, setStruct] = useState({ sections: [], periodes: [] });
  const [sectionId, setSectionId] = useState("");
  const [classeId, setClasseId] = useState("");
  const [salleId, setSalleId] = useState("");
  const [periodeId, setPeriodeId] = useState("");
  const [grille, setGrille] = useState(null);
  const [chargement, setChargement] = useState(false);
  const [vue, setVue] = useState(null); // null | { type: "tout" } | { type: "matiere", nom }
  const [cellules, setCellules] = useState({});
  const [session, setSession] = useState(null);
  const [modalDebut, setModalDebut] = useState(false);
  const [resume, setResume] = useState(null);
  const [trans, setTrans] = useState(null);
  const [nbSaisies, setNbSaisies] = useState(0);
  const [base, setBase] = useState(10);
  const [erreurGlobale, setErreurGlobale] = useState("");

  const sessionRef = useRef(null);
  const pending = useRef({});
  const grilleRef = useRef(null);
  sessionRef.current = session;
  grilleRef.current = grille;

  /* ---------- chargements ---------- */
  useEffect(() => {
    setStruct({ sections: [], periodes: [] }); setSectionId(""); setClasseId(""); setSalleId(""); setPeriodeId(""); setGrille(null); setVue(null);
    if (!currentYear) return;
    api("/api/saisie/structure?year=" + currentYear.id).then((s) => {
      setStruct(s); setErreurGlobale("");
      if (s.sections.length === 1) setSectionId(String(s.sections[0].id));
      if (s.periodes.length === 1) setPeriodeId(String(s.periodes[0].id));
    }).catch((e) => setErreurGlobale(e.message));
    api("/api/pedagogie/parametres?year=" + currentYear.id).then((p) => setBase(Number(p.base) || 10)).catch(() => {});
  }, [currentYear]);

  const section = struct.sections.find((s) => String(s.id) === String(sectionId));
  const classe = section && section.classes.find((c) => String(c.id) === String(classeId));
  const periode = struct.periodes.find((p) => String(p.id) === String(periodeId));
  const verrou = !!(periode && periode.verrouillee);

  useEffect(() => {
    setGrille(null); setCellules({});
    if (!classeId || !periodeId) return;
    let annule = false;
    setChargement(true);
    api("/api/saisie/grille?class_id=" + classeId + "&period_id=" + periodeId + (salleId ? "&room_id=" + salleId : ""))
      .then((g) => { if (!annule) setGrille(g); })
      .catch((e) => { if (!annule) setErreurGlobale(e.message); })
      .finally(() => { if (!annule) setChargement(false); });
    return () => { annule = true; };
  }, [classeId, periodeId, salleId]);

  useEffect(() => () => {
    flushTout();
    const s = sessionRef.current;
    if (s) fetch("/api/saisie/terminer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: s.token }), keepalive: true }).catch(() => {});
  }, []);

  /* ---------- enregistrement automatique ---------- */
  const cle = (cs, st) => cs + ":" + st;

  const sauver = async (m, e, p) => {
    const k = cle(m.id, e.id);
    const s = sessionRef.current;
    if (!s) return;
    setCellules((c) => ({ ...c, [k]: { ...(c[k] || {}), etat: "envoi" } }));
    try {
      const r = await api("/api/saisie/note", "PUT", { token: s.token, class_subject_id: m.id, period_id: periodeId, student_id: e.id, note: p.note === undefined ? null : p.note, absent: p.absent ? 1 : 0 });
      const avant = grilleRef.current && grilleRef.current.notes[k];
      const change = !avant || avant.note !== r.note || (avant.absent ? 1 : 0) !== (r.absent ? 1 : 0);
      setGrille((g) => (g ? { ...g, notes: { ...g.notes, [k]: { note: r.note, absent: r.absent } } } : g));
      if (change) setNbSaisies((n) => n + 1);
      setCellules((c) => ({ ...c, [k]: { ...(c[k] || {}), etat: "ok", msg: "" } }));
    } catch (er) {
      if (er.session) { setSession(null); setModalDebut(true); }
      setCellules((c) => ({ ...c, [k]: { ...(c[k] || {}), etat: "err", msg: er.message } }));
    }
  };

  const planifier = (k, run) => {
    if (pending.current[k]) clearTimeout(pending.current[k].timer);
    pending.current[k] = { run, timer: setTimeout(() => { delete pending.current[k]; run(); }, 500) };
  };
  const flushTout = () => {
    const liste = Object.values(pending.current);
    pending.current = {};
    liste.forEach((x) => { clearTimeout(x.timer); x.run(); });
  };

  const saisir = (m, e, texte) => {
    if (!sessionRef.current) { setModalDebut(true); return; }
    const k = cle(m.id, e.id);
    const p = analyser(texte, m.coefficient);
    setCellules((c) => ({ ...c, [k]: { texte, etat: p.erreur ? "err" : "attente", msg: p.erreur || "" } }));
    if (p.erreur) { if (pending.current[k]) { clearTimeout(pending.current[k].timer); delete pending.current[k]; } return; }
    planifier(k, () => sauver(m, e, p));
  };

  const quitter = (m, e) => {
    const k = cle(m.id, e.id);
    if (pending.current[k]) { const x = pending.current[k]; clearTimeout(x.timer); delete pending.current[k]; x.run(); }
    setCellules((c) => {
      const cur = c[k];
      if (!cur || cur.etat === "err" || cur.texte === undefined) return c;
      const p = analyser(cur.texte, m.coefficient);
      return { ...c, [k]: { ...cur, texte: p.absent ? "ABS" : p.vide ? "" : p.note !== undefined ? String(p.note).replace(".", ",") : cur.texte } };
    });
  };

  const valeur = (m, e) => {
    const c = cellules[cle(m.id, e.id)];
    if (c && c.texte !== undefined) return c.texte;
    const n = grille && grille.notes[cle(m.id, e.id)];
    if (!n) return "";
    if (n.absent) return "ABS";
    return n.note === null || n.note === undefined ? "" : String(n.note).replace(".", ",");
  };
  const rempli = (m, e) => {
    const n = grille && grille.notes[cle(m.id, e.id)];
    return !!(n && (n.absent || (n.note !== null && n.note !== undefined)));
  };

  /* ---------- transitions ---------- */
  const avecTransition = (caption, label, appliquer) => {
    flushTout();
    setTrans({ caption, label, id: Date.now() });
    setTimeout(appliquer, 340);
    setTimeout(() => setTrans(null), 980);
  };
  const choisirSection = (v) => {
    const s = struct.sections.find((x) => String(x.id) === v);
    avecTransition("Section", s ? s.nom : "—", () => { setSectionId(v); setClasseId(""); setSalleId(""); setVue(null); });
  };
  const choisirClasse = (v) => {
    const c = section && section.classes.find((x) => String(x.id) === v);
    avecTransition("Classe", c ? c.nom : "—", () => { setClasseId(v); setSalleId(""); });
  };
  const choisirSalle = (v) => {
    const r = classe && classe.rooms.find((x) => String(x.id) === v);
    avecTransition("Salle", r ? r.nom : "Toutes les salles", () => setSalleId(v));
  };
  const choisirPeriode = (v) => {
    const p = struct.periodes.find((x) => String(x.id) === v);
    avecTransition("Contrôle", p ? p.nom : "—", () => setPeriodeId(v));
  };

  const choisirVue = (v) => {
    if (!sessionRef.current && !verrou) setModalDebut(true);
    setVue(v);
  };

  /* ---------- session ---------- */
  const terminer = async () => {
    flushTout();
    await new Promise((r) => setTimeout(r, 400));
    const s = sessionRef.current;
    if (!s) return;
    try {
      const r = await api("/api/saisie/terminer", "POST", { token: s.token });
      setResume({ nb: r.nb, matieres: r.matieres });
    } catch (e) { setResume({ nb: nbSaisies, matieres: [] }); }
    setSession(null); setNbSaisies(0);
  };

  /* ---------- données dérivées ---------- */
  const matieres = (grille && grille.matieres) || [];
  const eleves = (grille && grille.eleves) || [];
  const compte = (m) => eleves.filter((e) => rempli(m, e)).length;
  const matiereCourante = vue && vue.type === "matiere" ? matieres.find((m) => m.nom === vue.nom) : null;
  const autres = vue ? matieres.filter((m) => !(matiereCourante && m.id === matiereCourante.id)) : [];
  const editable = !!session && !verrou;

  const champ = (m, e, petit, colKey) => {
    const k = cle(m.id, e.id);
    const c = cellules[k] || {};
    const v = valeur(m, e);
    const cls = "sn-in" + (petit ? " petit" : "") + (c.etat === "err" ? " err" : "") + (v === "ABS" ? " abs" : "") + (c.etat === "ok" ? " ok" : "");
    return (
      <input
        className={cls} data-col={colKey} inputMode="decimal" autoComplete="off" value={v} readOnly={!editable} placeholder="—"
        title={c.msg || "Maximum " + fmtN(m.coefficient) + " · tapez A pour absent"}
        onFocus={() => { if (!session && !verrou) setModalDebut(true); }}
        onChange={(ev) => saisir(m, e, ev.target.value)}
        onBlur={() => quitter(m, e)}
        onKeyDown={(ev) => {
          if (ev.key === "Enter" || ev.key === "ArrowDown" || ev.key === "ArrowUp") {
            ev.preventDefault();
            const liste = Array.from(document.querySelectorAll('input[data-col="' + colKey + '"]'));
            const i = liste.indexOf(ev.target);
            const suivant = liste[i + (ev.key === "ArrowUp" ? -1 : 1)];
            if (suivant) { suivant.focus(); suivant.select(); }
          }
        }}
      />
    );
  };

  const etatIcone = (m, e) => {
    const c = cellules[cle(m.id, e.id)] || {};
    if (c.etat === "envoi" || c.etat === "attente") return <span className="sn-etat envoi">…</span>;
    if (c.etat === "ok") return <span className="sn-etat ok">✓</span>;
    if (c.etat === "err") return <span className="sn-etat err">!</span>;
    return <span className="sn-etat" />;
  };

  const avatar = (e) => e.photo
    ? <img className="sn-av" src={/^(https?:|data:)/.test(String(e.photo)) ? e.photo : "/uploads/" + e.photo} alt="" />
    : <span className="sn-av" style={{ background: "linear-gradient(135deg,hsl(" + ((e.id * 53) % 360) + " 65% 50%),hsl(" + ((e.id * 53 + 50) % 360) + " 65% 40%))" }}>{initiales(e).toUpperCase()}</span>;

  /* ---------- rendu ---------- */
  return (
    <div className={"page sn-root " + (clair ? "sn-clair" : "sn-sombre")} ref={racine}>
      <style>{CSS}</style>

      {trans && (
        <div className="sn-rideau" key={trans.id}>
          <div className="p1" /><div className="p2" />
          <div className="txt"><small>{trans.caption}</small><b>{trans.label}</b></div>
        </div>
      )}

      <div className="sn-hero">
        <div>
          <h1>{"Saisie des notes"}</h1>
          <p>{"Choisissez la section, la classe, la salle et le contrôle, puis la matière. Chaque note est enregistrée automatiquement, et ne peut pas dépasser le coefficient de la matière."}</p>
        </div>
        <div className="sn-session">
          {session ? (
            <>
              <span className="sn-chip on"><span className="sn-dot" />{"Saisie en cours · " + nbSaisies + " note" + (nbSaisies > 1 ? "s" : "") + " enregistrée" + (nbSaisies > 1 ? "s" : "")}</span>
              <button className="sn-btn fin" onClick={terminer}>{"J'ai terminé la saisie"}</button>
            </>
          ) : (
            <>
              <span className="sn-chip"><span className="sn-dot" />{"Saisie non démarrée"}</span>
              <button className="sn-btn" onClick={() => setModalDebut(true)}>{"Démarrer la saisie"}</button>
            </>
          )}
        </div>
      </div>

      {erreurGlobale && <div className="sn-err">{erreurGlobale}</div>}

      <div className="sn-etapes">
        <div className={"sn-etape" + (!sectionId ? " on" : "")}>
          <div className="sn-num">1</div>
          <div style={{ flex: 1 }}><label>Section</label>
            <select value={sectionId} onChange={(e) => choisirSection(e.target.value)}>
              <option value="">{"— Choisir —"}</option>
              {struct.sections.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
            </select>
          </div>
        </div>
        <div className={"sn-etape" + (sectionId && !classeId ? " on" : "")}>
          <div className="sn-num">2</div>
          <div style={{ flex: 1 }}><label>Classe</label>
            <select value={classeId} onChange={(e) => choisirClasse(e.target.value)} disabled={!section}>
              <option value="">{"— Choisir —"}</option>
              {(section ? section.classes : []).map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
          </div>
        </div>
        <div className="sn-etape">
          <div className="sn-num">3</div>
          <div style={{ flex: 1 }}><label>{"Salle (facultatif)"}</label>
            <select value={salleId} onChange={(e) => choisirSalle(e.target.value)} disabled={!classe || classe.rooms.length === 0}>
              <option value="">{"Toutes les salles"}</option>
              {(classe ? classe.rooms : []).map((r) => <option key={r.id} value={r.id}>{r.nom}</option>)}
            </select>
          </div>
        </div>
        <div className={"sn-etape" + (classeId && !periodeId ? " on" : "")}>
          <div className="sn-num">4</div>
          <div style={{ flex: 1 }}><label>{"Contrôle"}</label>
            <select value={periodeId} onChange={(e) => choisirPeriode(e.target.value)}>
              <option value="">{"— Choisir —"}</option>
              {struct.periodes.map((p) => <option key={p.id} value={p.id}>{p.nom + (p.verrouillee ? " (verrouillé)" : "")}</option>)}
            </select>
          </div>
        </div>
      </div>

      {!currentYear && <div className="sn-vide"><b>{"Aucune année active"}</b>{"Choisissez une année académique en haut de l'écran."}</div>}
      {currentYear && struct.periodes.length === 0 && <div className="sn-vide"><b>{"Aucun contrôle configuré"}</b>{"Créez d'abord les contrôles de l'année dans Notes & Évaluations → Périodes."}</div>}
      {currentYear && struct.periodes.length > 0 && (!classeId || !periodeId) && (
        <div className="sn-vide"><b>{"Prêt à commencer ?"}</b>{"Sélectionnez la section, la classe et le contrôle pour voir les matières."}</div>
      )}
      {chargement && <div className="sn-vide">{"Chargement…"}</div>}

      {grille && (
        <div key={classeId + "-" + salleId + "-" + periodeId}>
          {verrou && <div className="sn-err">{"Ce contrôle est verrouillé : les notes sont en lecture seule."}</div>}
          {grille.anciennes > 0 && <div className="sn-meta" style={{ marginBottom: 10 }}>{grille.anciennes + " note(s) saisie(s) avec l'ancienne méthode existent pour ce contrôle ; elles comptent dans les bulletins mais ne s'affichent pas ici."}</div>}
          {matieres.length === 0 && <div className="sn-vide"><b>{"Aucune matière affectée à cette classe"}</b>{"Affectez-les dans Matières & Enseignants → Affectation par classe."}</div>}
          {eleves.length === 0 && matieres.length > 0 && <div className="sn-vide"><b>{"Aucun élève dans cette salle"}</b>{"Essayez « Toutes les salles »."}</div>}

          {matieres.length > 0 && eleves.length > 0 && !vue && (
            <div className="sn-zone">
              <div className="sn-tuiles">
                <button className="sn-tuile tout" style={{ animationDelay: "0ms" }} onClick={() => choisirVue({ type: "tout" })}>
                  <div className="sn-ring" style={{ "--p": 100, "--h": 280 }}><span>{"▦"}</span></div>
                  <h4>{"Toutes les matières"}</h4>
                  <small>{"Vue d'ensemble : élèves en lignes, matières en colonnes"}</small>
                </button>
                {matieres.map((m, i) => {
                  const n = compte(m);
                  const pc = eleves.length ? Math.round((n / eleves.length) * 100) : 0;
                  return (
                    <button key={m.id} className="sn-tuile" style={{ "--h": hue(i), animationDelay: (i + 1) * 45 + "ms" }} onClick={() => choisirVue({ type: "matiere", nom: m.nom })}>
                      <div className="sn-ring" style={{ "--p": pc }}><span>{pc}%</span></div>
                      <h4>{m.nom}</h4>
                      <small>{"Max " + fmtN(m.coefficient) + (m.categorie ? " · " + m.categorie : "") + " · " + n + "/" + eleves.length}</small>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {matieres.length > 0 && eleves.length > 0 && vue && vue.type === "matiere" && !matiereCourante && (
            <div className="sn-vide"><b>{"« " + vue.nom + " » n'est pas enseignée dans cette classe"}</b>{"Choisissez une autre matière dans la barre du bas."}</div>
          )}

          {matiereCourante && (() => {
            const m = matiereCourante;
            const idx = matieres.indexOf(m);
            const n = compte(m);
            const pc = eleves.length ? Math.round((n / eleves.length) * 100) : 0;
            return (
              <div className="sn-zone" key={"m" + m.id}>
                <div className="sn-entete" style={{ "--h": hue(idx) }}>
                  <div>
                    <h2>{m.nom}</h2>
                    <div className="sn-meta">{"Note maximale : " + fmtN(m.coefficient) + (m.categorie ? " · " + m.categorie : "")}</div>
                  </div>
                  <div className="sn-barre"><i style={{ width: pc + "%" }} /></div>
                  <div className="sn-meta"><b>{n + " / " + eleves.length}</b>{pc === 100 ? " · complet ✓" : " notes saisies"}</div>
                </div>
                <div className="sn-table-wrap">
                  <table className="sn-table">
                    <thead><tr><th style={{ width: 46 }}>#</th><th className="nom">{"Élève"}</th><th>{"Note / " + fmtN(m.coefficient)}</th><th style={{ width: 40 }} /></tr></thead>
                    <tbody>
                      {eleves.map((e, i) => {
                        const c = cellules[cle(m.id, e.id)] || {};
                        return (
                          <tr key={e.id}>
                            <td>{i + 1}</td>
                            <td className="nom"><div className="sn-eleve">{avatar(e)}<span>{e.nom + " " + (e.prenom || "")}</span></div></td>
                            <td>{champ(m, e, false, "m" + m.id)}<span className="sn-max">{"/ " + fmtN(m.coefficient)}</span>{c.msg && c.etat === "err" && <span className="sn-msg">{c.msg}</span>}</td>
                            <td>{etatIcone(m, e)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}

          {vue && vue.type === "tout" && matieres.length > 0 && eleves.length > 0 && (
            <div className="sn-zone" key="tout">
              <div className="sn-entete" style={{ "--h": 280 }}>
                <div><h2>{"Vue d'ensemble"}</h2><div className="sn-meta">{eleves.length + " élèves · " + matieres.length + " matières · chaque colonne est limitée à son coefficient"}</div></div>
              </div>
              <div className="sn-table-wrap">
                <table className="sn-table">
                  <thead>
                    <tr>
                      <th style={{ width: 40 }}>#</th><th className="nom">{"Élève"}</th>
                      {matieres.map((m, i) => (
                        <th key={m.id} style={{ borderTop: "3px solid hsl(" + hue(i) + " 70% 55%)", cursor: "pointer" }} onClick={() => choisirVue({ type: "matiere", nom: m.nom })} title={"Ouvrir " + m.nom}>
                          {m.nom}<div style={{ fontSize: 11, textTransform: "none", letterSpacing: 0 }}>{"/ " + fmtN(m.coefficient)}</div>
                        </th>
                      ))}
                      <th>Total</th><th>{"Moy. /" + base}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {eleves.map((e, i) => {
                      let tot = 0, max = 0;
                      matieres.forEach((m) => {
                        const n = grille.notes[cle(m.id, e.id)];
                        if (n && !n.absent && n.note !== null && n.note !== undefined) { tot += Number(n.note); max += Number(m.coefficient); }
                      });
                      return (
                        <tr key={e.id}>
                          <td>{i + 1}</td>
                          <td className="nom"><div className="sn-eleve">{avatar(e)}<span>{e.nom + " " + (e.prenom || "")}</span></div></td>
                          {matieres.map((m) => {
                            const c = cellules[cle(m.id, e.id)] || {};
                            return <td key={m.id}>{champ(m, e, true, "m" + m.id)}{c.msg && c.etat === "err" && <span className="sn-msg">{c.msg}</span>}</td>;
                          })}
                          <td><b>{max > 0 ? fmtN(tot) : "—"}</b></td>
                          <td><b>{max > 0 ? fmtN((tot / max) * base) : "—"}</b></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {vue && matieres.length > 0 && (
            <div className="sn-dock" key={"dock-" + (vue.nom || "tout")}>
              <span className="sn-dock-l">{vue.type === "tout" ? "Ouvrir une matière" : "Autres matières"}</span>
              {vue.type === "matiere" && <button className="sn-pill tout" onClick={() => choisirVue({ type: "tout" })}>{"▦ Vue d'ensemble"}</button>}
              {(vue.type === "tout" ? matieres : autres).map((m) => {
                const i = matieres.indexOf(m);
                return (
                  <button key={m.id} className={"sn-pill" + (eleves.length && compte(m) === eleves.length ? " done" : "")} style={{ "--h": hue(i), animationDelay: i * 40 + "ms" }} onClick={() => choisirVue({ type: "matiere", nom: m.nom })}>{m.nom}</button>
                );
              })}
              <button className="sn-pill" style={{ "--h": 0 }} onClick={() => { flushTout(); setVue(null); }}>{"✕ Fermer"}</button>
            </div>
          )}
        </div>
      )}

      {modalDebut && !session && (
        <DebutSaisie
          username={user && user.username}
          onAnnule={() => setModalDebut(false)}
          onOk={(token, nom) => { setSession({ token, nom }); setNbSaisies(0); setModalDebut(false); }}
        />
      )}

      {resume && (
        <div className="sn-modal-bg" onClick={() => setResume(null)}>
          <div className="sn-modal" style={{ textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
            <div className="sn-fin-ring">{"✓"}</div>
            <h3>{"Saisie terminée"}</h3>
            <p className="sn-meta" style={{ fontSize: 14 }}>
              {resume.nb > 0 ? resume.nb + " note" + (resume.nb > 1 ? "s" : "") + " enregistrée" + (resume.nb > 1 ? "s" : "") + " pendant cette session" : "Aucune note modifiée pendant cette session"}
              {resume.matieres && resume.matieres.length > 0 ? " (" + resume.matieres.join(", ") + ")" : ""}.
            </p>
            <button className="sn-btn" onClick={() => setResume(null)}>Fermer</button>
          </div>
        </div>
      )}
    </div>
  );
}

function DebutSaisie({ username, onAnnule, onOk }) {
  const [id, setId] = useState(username || "");
  const [mdp, setMdp] = useState("");
  const [err, setErr] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const valider = async () => {
    setErr("");
    if (!id.trim() || !mdp) { setErr("Identifiant et mot de passe requis"); return; }
    setEnvoi(true);
    try {
      const d = await api("/api/saisie/demarrer", "POST", { username: id.trim(), password: mdp });
      onOk(d.token, d.nom);
    } catch (e) { setErr(e.message); setMdp(""); setEnvoi(false); }
  };
  return (
    <div className="sn-modal-bg" onClick={onAnnule}>
      <div className="sn-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{"Avant de commencer la saisie"}</h3>
        <ul className="sn-regles">
          <li>{"Chaque note est enregistrée automatiquement dès que vous la tapez : il n'y a pas de bouton « Enregistrer »."}</li>
          <li>{"Une note ne peut pas dépasser le coefficient de la matière. Tapez A pour marquer un élève absent."}</li>
          <li>{"Quand vous avez fini, cliquez sur « J'ai terminé la saisie »."}</li>
          <li>{"Chaque note saisie ou modifiée est inscrite dans le journal, à votre nom."}</li>
        </ul>
        {err && <div className="sn-err">{err}</div>}
        <label>Identifiant</label>
        <input value={id} readOnly={!!username} onChange={(e) => setId(e.target.value)} />
        <label>{"Mot de passe"}</label>
        <input type="password" value={mdp} autoFocus onChange={(e) => setMdp(e.target.value)} onKeyDown={(e) => e.key === "Enter" && valider()} />
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button className="sn-btn ghost" onClick={onAnnule}>Annuler</button>
          <button className="sn-btn" onClick={valider} disabled={envoi}>{envoi ? "Vérification…" : "Commencer la saisie"}</button>
        </div>
      </div>
    </div>
  );
}
