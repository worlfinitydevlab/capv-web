import React, { useState, useEffect, useRef } from "react";
import { useYear as useYear } from "../YearContext.jsx";
import { useSettings as useSettings } from "../SettingsContext.jsx";
import { definirUtilisateur } from "../pedagogie/confirmAction.js";
import { usePontPedagogie } from "../pedagogie/pont.js";

/* ============================================================
   Documents imprimables : Palmares (feuille vierge d'un professeur), Palmares vue d'ensemble, Cahier de presence (journal d'appel).
   Format lettre US (8,5 x 11 po). Entete : logo + nom de l'etablissement.
   ============================================================ */

const CSS = `
.di-sombre{--di-bg:#0f172a;--di-fg:#e2e8f0;--di-soft:rgba(255,255,255,.05);--di-line:rgba(255,255,255,.14);--di-dim:#94a3b8}
.di-clair{--di-bg:#ffffff;--di-fg:#0f172a;--di-soft:rgba(15,23,42,.045);--di-line:rgba(15,23,42,.16);--di-dim:#64748b}
.di-root{color:var(--di-fg);padding-bottom:80px}
.di-hero{padding:22px 26px;border-radius:18px;margin-bottom:18px;border:1px solid var(--di-line);background:linear-gradient(120deg,rgba(20,184,166,.2),rgba(91,140,255,.18) 55%,rgba(168,85,247,.16))}
.di-hero h1{margin:0;font-size:26px;letter-spacing:-.3px}
.di-hero p{margin:6px 0 0;color:var(--di-dim);font-size:13px}
.di-docs{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:14px;margin-bottom:18px}
.di-doc{--h:170;text-align:left;cursor:pointer;color:inherit;border:1px solid var(--di-line);border-radius:18px;padding:16px 18px;background:var(--di-soft);transition:transform .2s,border-color .2s,box-shadow .2s}
.di-doc:hover{transform:translateY(-3px)}
.di-doc.on{border-color:hsl(var(--h) 70% 55%);box-shadow:0 0 0 3px hsl(var(--h) 70% 55% / .18);background:linear-gradient(150deg,hsl(var(--h) 70% 55% / .16),var(--di-soft))}
.di-feuille{display:inline-block;width:34px;height:44px;border-radius:5px;border:2px solid hsl(var(--h) 65% 55%);background:repeating-linear-gradient(0deg,transparent 0 6px,hsl(var(--h) 65% 55% / .35) 6px 7px);margin-bottom:10px}
.di-feuille.large{width:48px;height:34px}
.di-doc b{display:block;font-size:16px}
.di-doc span{font-size:12px;color:var(--di-dim)}
.di-card{border:1px solid var(--di-line);background:var(--di-soft);border-radius:16px;padding:18px 20px;animation:diIn .3s both}
@keyframes diIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.di-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:14px;margin:6px 0 14px}
.di-form label{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.7px;color:var(--di-dim);margin-bottom:5px}
.di-form select,.di-form input{box-sizing:border-box;width:100%;padding:9px 11px;border-radius:10px;border:1.5px solid var(--di-line);background:var(--di-bg);color:inherit;font-size:14px}
.di-form option{color:#111;background:#fff}
.di-btn{border:0;cursor:pointer;border-radius:12px;padding:11px 22px;font-weight:700;font-size:14px;color:#fff;background:linear-gradient(135deg,#14b8a6,#5b8cff);box-shadow:0 6px 18px rgba(20,184,166,.3);transition:transform .15s}
.di-btn:hover{transform:translateY(-2px)}.di-btn:disabled{opacity:.5;cursor:default;transform:none}
.di-btn.alt{background:var(--di-soft);color:inherit;box-shadow:none;border:1px solid var(--di-line)}
.di-ok{background:rgba(34,197,94,.12);border:1px solid rgba(34,197,94,.45);color:#22c55e;border-radius:10px;padding:9px 12px;font-size:13px;margin:10px 0}
.di-dim{color:var(--di-dim);font-size:13px}
.di-err{background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.45);color:#f87171;border-radius:10px;padding:9px 12px;font-size:13px;margin:10px 0}
`;

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function urlLogo(settings) {
  if (!settings || !settings.logo) return null;
  if (/^(https?:|data:)/.test(String(settings.logo))) return settings.logo;
  const o = window.location.origin;
  return (o.startsWith("http") ? o : "http://localhost:3001") + "/uploads/" + settings.logo;
}

async function api(url) {
  const r = await fetch(url);
  let d = {};
  try { d = await r.json(); } catch (e) {}
  if (!r.ok) throw new Error(d.error || "Erreur " + r.status);
  return d;
}

function themeClair(depart) {
  let el = depart;
  while (el) {
    const m = getComputedStyle(el).backgroundColor.match(/[\d.]+/g);
    if (m) { const c = m.map(Number); if (c.length < 4 || c[3] > 0.5) return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2] > 160; }
    el = el.parentElement;
  }
  return false;
}

/* ---------- impression / telechargement : lettre US, portrait ou paysage ---------- */
async function logoIntegre(url) {
  if (!url) return null;
  try {
    const r = await fetch(url);
    if (!r.ok) return url;
    const blob = await r.blob();
    return await new Promise((ok) => { const f = new FileReader(); f.onload = () => ok(f.result); f.onerror = () => ok(url); f.readAsDataURL(blob); });
  } catch (e) { return url; }
}

function construireHtml(titre, corps, paysage, settings, logo, telechargement) {
  const nom = (settings && settings.nom_etablissement) || "Etablissement";
  const css = "@page{size:letter " + (paysage ? "landscape" : "portrait") + ";margin:8mm}" +
    "*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#000;margin:0;font-size:11px}" +
    ".ent{display:flex;align-items:center;gap:10px;border-bottom:2px solid #000;padding-bottom:4px;margin-bottom:5px}" +
    ".ent img{height:46px;width:auto;object-fit:contain}.etab{font-size:17px;font-weight:bold}" +
    ".titre{font-size:15px;font-weight:bold;letter-spacing:2px;margin:0 0 4px}" +
    ".champs{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:5px;font-size:11px}.champs span.vide{display:inline-block;min-width:150px;border-bottom:1px solid #000;height:12px}" +
    "table{border-collapse:collapse;table-layout:fixed;width:100%}th,td{border:1px solid #000;padding:0;text-align:center;overflow:hidden;white-space:nowrap}" +
    "td{font-size:10.5px}td.nm{text-align:left;padding-left:3px;font-size:10.5px}th{background:#e8e8e8;font-size:9px}.page{page-break-after:always}.page:last-child{page-break-after:auto}" +
    ".barre{position:sticky;top:0;background:#1e293b;color:#fff;padding:10px 16px;display:flex;gap:14px;align-items:center;font-size:13px;z-index:9}" +
    ".barre button{border:0;border-radius:8px;padding:8px 16px;font-weight:bold;cursor:pointer;background:#14b8a6;color:#fff}" +
    "@media print{.barre{display:none}}";
  const entete = '<div class="ent">' + (logo ? '<img src="' + esc(logo) + '" alt="">' : "") + '<div class="etab">' + esc(nom) + "</div></div>";
  const barre = telechargement ? '<div class="barre"><button onclick="window.print()">Imprimer</button><span>Format : lettre US, ' + (paysage ? "paysage" : "portrait") + ". Dans la fenetre d'impression, desactive les en-tetes et pieds de page.</span></div>" : "";
  const script = telechargement ? "" : "<script>window.onload=function(){setTimeout(function(){window.print();},300);};<\/script>";
  return "<!doctype html><html><head><meta charset='utf-8'><title>" + esc(titre) + "</title><style>" + css + "</style></head><body>" + barre + corps.replace(/@@ENT@@/g, entete) + script + "</body></html>";
}

async function sortie(mode, titre, corps, paysage, settings, nomFichier) {
  const logo = urlLogo(settings);
  if (mode === "telecharger") {
    const html = construireHtml(titre, corps, paysage, settings, await logoIntegre(logo), true);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = nomFichier + ".html";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return true;
  }
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write(construireHtml(titre, corps, paysage, settings, logo, false));
  w.document.close(); w.focus();
  return true;
}

function champs(nomDoc, classe, salle, annee, extra) {
  return '<div class="titre">' + esc(nomDoc) + "</div><div class=\"champs\">" + (extra || "") +
    "<div><b>Classe :</b> " + esc(classe) + (salle ? " - " + esc(salle) : "") + "</div><div><b>Annee academique :</b> " + esc(annee) + "</div></div>";
}

/* ---------- 1. Palmares : feuille vierge d'un professeur ---------- */
function htmlPalmares(eleves, nbControles, classe, salle, annee) {
  const n = eleves.length;
  const dispo = 205; // mm utilisables pour le tableau (lettre portrait)
  const rh = Math.min(7.5, Math.max(4.3, dispo / (n + 2)));
  const largeurRestante = 196 - 8 - 38 - 34;
  const cell = Math.min(9, largeurRestante / (3 * nbControles));
  let cols = '<col style="width:8mm"><col style="width:38mm"><col style="width:34mm">';
  for (let i = 0; i < nbControles * 3; i++) cols += '<col style="width:' + cell.toFixed(2) + 'mm">';
  let h1 = '<tr style="height:5.5mm"><th rowspan="2">N&deg;</th><th rowspan="2">Nom</th><th rowspan="2">Prenom</th>';
  for (let i = 1; i <= nbControles; i++) h1 += '<th colspan="3">Contr. ' + i + "</th>";
  h1 += '</tr><tr style="height:5mm">';
  for (let i = 0; i < nbControles; i++) h1 += "<th>D</th><th>E</th><th>T</th>";
  h1 += "</tr>";
  let lignes = "";
  eleves.forEach((e, i) => {
    lignes += '<tr style="height:' + rh.toFixed(2) + 'mm"><td>' + (i + 1) + '</td><td class="nm">' + esc(e.nom) + '</td><td class="nm">' + esc(e.prenom) + "</td>";
    for (let k = 0; k < nbControles * 3; k++) lignes += "<td></td>";
    lignes += "</tr>";
  });
  const extra = '<div><b>Professeur :</b> <span class="vide"></span></div><div><b>Matiere :</b> <span class="vide"></span></div><div><b>Coefficient :</b> <span class="vide" style="min-width:45px"></span></div>';
  return '<div class="page">@@ENT@@' + champs("PALMARES", classe, salle, annee, extra) + "<table><colgroup>" + cols + "</colgroup>" + h1 + lignes + "</table></div>";
}

/* ---------- 2. Palmares vue d'ensemble : toutes les matieres de la classe, paysage ---------- */
function abreviation(m, utilises) {
  let a = String(m.code || "").trim().toUpperCase();
  if (!a || a.length > 6) a = String(m.nom).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 4);
  let cand = a, i = 2;
  while (utilises.has(cand)) { cand = a + i; i++; }
  utilises.add(cand);
  return cand;
}

function htmlEnsemble(grille, base, classe, salle, annee, titrePeriode, remplir) {
  const mats = grille.matieres, eleves = grille.eleves, n = eleves.length;
  const utilises = new Set();
  const abr = mats.map((m) => abreviation(m, utilises));
  const dispo = 150;
  const rh = Math.min(7.5, Math.max(4.3, dispo / (n + 3)));
  const largeurMat = Math.min(15, (259 - 8 - 36 - 32 - 40) / Math.max(1, mats.length));
  let cols = '<col style="width:8mm"><col style="width:36mm"><col style="width:32mm">';
  mats.forEach(() => { cols += '<col style="width:' + largeurMat.toFixed(2) + 'mm">'; });
  cols += '<col style="width:14mm"><col style="width:14mm"><col style="width:12mm">';
  const totalCoef = mats.reduce((a, m) => a + Number(m.coefficient || 0), 0);
  let h = '<tr style="height:6mm"><th>N&deg;</th><th>Nom</th><th>Prenom</th>' + abr.map((a) => "<th>" + esc(a) + "</th>").join("") + "<th>Total</th><th>Moy.</th><th>Rang</th></tr>";
  h += '<tr style="height:5mm"><th colspan="3" style="text-align:right;padding-right:4px">Coefficient</th>' + mats.map((m) => "<th>" + esc(m.coefficient) + "</th>").join("") + "<th>" + esc(totalCoef) + "</th><th>/" + esc(base) + "</th><th></th></tr>";
  const lignesCalc = eleves.map((e) => {
    let total = 0, nb = 0;
    const cellules = mats.map((m) => {
      const x = grille.notes[m.id + ":" + e.id];
      if (!remplir || !x) return "";
      if (x.absent) return "abs";
      if (x.note === null || x.note === undefined) return "";
      total += Number(x.note); nb++;
      return String(Math.round(Number(x.note) * 100) / 100).replace(".", ",");
    });
    const moy = remplir && nb && totalCoef ? Math.round((total / totalCoef) * base * 100) / 100 : null;
    return { e, cellules, total: remplir && nb ? Math.round(total * 100) / 100 : null, moy };
  });
  const tries = lignesCalc.filter((l) => l.moy !== null).map((l) => l.moy).sort((a, b) => b - a);
  let lignes = "";
  lignesCalc.forEach((l, i) => {
    const rang = l.moy !== null ? tries.indexOf(l.moy) + 1 : "";
    lignes += '<tr style="height:' + rh.toFixed(2) + 'mm"><td>' + (i + 1) + '</td><td class="nm">' + esc(l.e.nom) + '</td><td class="nm">' + esc(l.e.prenom) + "</td>" +
      l.cellules.map((c) => "<td>" + c + "</td>").join("") +
      "<td>" + (l.total === null ? "" : String(l.total).replace(".", ",")) + "</td><td>" + (l.moy === null ? "" : String(l.moy).replace(".", ",")) + "</td><td>" + rang + "</td></tr>";
  });
  const legende = '<div style="margin-top:5px;font-size:9px">' + mats.map((m, i) => "<b>" + esc(abr[i]) + "</b> = " + esc(m.nom)).join(" &nbsp; ") + "</div>";
  const extra = titrePeriode ? "<div><b>Controle :</b> " + esc(titrePeriode) + "</div>" : "";
  return '<div class="page">@@ENT@@' + champs("PALMARES - VUE D'ENSEMBLE", classe, salle, annee, extra) + "<table><colgroup>" + cols + "</colgroup>" + h + lignes + "</table>" + legende + "</div>";
}

/* ---------- 3. Cahier de presence (journal d'appel) : 4 semaines de 5 jours par page ---------- */
const JOURS = ["L", "M", "M", "J", "V"];
function lundiDe(iso) {
  const [a, m, j] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1, j));
  const js = d.getUTCDay(); // 0 = dimanche
  d.setUTCDate(d.getUTCDate() + (js === 0 ? -6 : 1 - js));
  return d;
}
const fmtJ = (d) => String(d.getUTCDate()).padStart(2, "0") + "/" + String(d.getUTCMonth() + 1).padStart(2, "0");

function htmlCahier(eleves, dateDebut, nbPages, classe, salle, annee) {
  const n = eleves.length;
  const dispo = 150;
  const rh = Math.min(7.5, Math.max(4.3, dispo / (n + 4)));
  let lundi = lundiDe(dateDebut);
  let out = "";
  const celle = (259 - 8 - 40 - 34) / 20;
  for (let p = 0; p < nbPages; p++) {
    let cols = '<col style="width:8mm"><col style="width:40mm"><col style="width:34mm">';
    for (let i = 0; i < 20; i++) cols += '<col style="width:' + celle.toFixed(2) + 'mm">';
    let h1 = '<tr style="height:5.5mm"><th rowspan="2">N&deg;</th><th rowspan="2">Nom</th><th rowspan="2">Prenom</th>';
    let h2 = '<tr style="height:5mm">';
    const debutPage = new Date(lundi.getTime());
    for (let s = 0; s < 4; s++) {
      const fin = new Date(lundi.getTime()); fin.setUTCDate(fin.getUTCDate() + 4);
      h1 += '<th colspan="5">' + fmtJ(lundi) + " au " + fmtJ(fin) + "</th>";
      for (let j = 0; j < 5; j++) { const dj = new Date(lundi.getTime()); dj.setUTCDate(dj.getUTCDate() + j); h2 += "<th>" + JOURS[j] + " " + String(dj.getUTCDate()).padStart(2, "0") + "</th>"; }
      lundi.setUTCDate(lundi.getUTCDate() + 7);
    }
    h1 += "</tr>"; h2 += "</tr>";
    let lignes = "";
    eleves.forEach((e, i) => {
      lignes += '<tr style="height:' + rh.toFixed(2) + 'mm"><td>' + (i + 1) + '</td><td class="nm">' + esc(e.nom) + '</td><td class="nm">' + esc(e.prenom) + "</td>";
      for (let k = 0; k < 20; k++) lignes += "<td></td>";
      lignes += "</tr>";
    });
    const extra = "<div><b>Page :</b> " + (p + 1) + " / " + nbPages + "</div><div><b>Titulaire :</b> <span class=\"vide\"></span></div>";
    out += '<div class="page">@@ENT@@' + champs("CAHIER DE PRESENCE (JOURNAL D'APPEL)", classe, salle, annee, extra) + "<table><colgroup>" + cols + "</colgroup>" + h1 + h2 + lignes + "</table>" +
      '<div style="margin-top:5px;font-size:9px">P = present &nbsp; R = retard &nbsp; A = absent &nbsp; J = absence justifiee</div></div>';
    void debutPage;
  }
  return out;
}

/* ---------- PDF reel (jsPDF) : memes tableaux, page lettre US ---------- */
const GRIS = 232;

function specPalmares(eleves, n, classe, salle, annee) {
  const nbCol = n * 3;
  const cell = Math.min(9, (196 - 8 - 38 - 34) / nbCol);
  const cols = [8, 38, 34]; for (let i = 0; i < nbCol; i++) cols.push(cell);
  const h1 = [{ t: "N°", rs: 2, b: 1, fill: 1 }, { t: "Nom", rs: 2, b: 1, fill: 1 }, { t: "Prénom", rs: 2, b: 1, fill: 1 }];
  const h2 = [];
  for (let i = 1; i <= n; i++) { h1.push({ t: "Contr. " + i, cs: 3, b: 1, fill: 1 }); h2.push({ t: "D", b: 1, fill: 1 }, { t: "E", b: 1, fill: 1 }, { t: "T", b: 1, fill: 1 }); }
  const rows = eleves.map((e, i) => { const c = [{ t: String(i + 1) }, { t: e.nom, al: "l" }, { t: e.prenom, al: "l" }]; for (let k = 0; k < nbCol; k++) c.push({ t: "" }); return c; });
  return [{
    titre: "PALMARÈS",
    champs: [{ l: "Professeur", blank: 62 }, { l: "Matière", blank: 55 }, { l: "Coefficient", blank: 16 }, { l: "Classe", v: classe + (salle ? " - " + salle : "") }, { l: "Année académique", v: annee }],
    cols, head: [{ h: 5.5, cells: h1 }, { h: 5, cells: h2 }], rows, rhMax: 7.5, note: ""
  }];
}

function specEnsemble(grille, base, classe, salle, annee, titrePeriode, remplir) {
  const mats = grille.matieres, eleves = grille.eleves;
  const utilises = new Set();
  const abr = mats.map((m) => abreviation(m, utilises));
  const largeurMat = Math.min(15, (259 - 8 - 36 - 32 - 40) / Math.max(1, mats.length));
  const cols = [8, 36, 32]; mats.forEach(() => cols.push(largeurMat)); cols.push(14, 14, 12);
  const totalCoef = mats.reduce((a, m) => a + Number(m.coefficient || 0), 0);
  const h1 = [{ t: "N°", b: 1, fill: 1 }, { t: "Nom", b: 1, fill: 1 }, { t: "Prénom", b: 1, fill: 1 }, ...abr.map((a) => ({ t: a, b: 1, fill: 1 })), { t: "Total", b: 1, fill: 1 }, { t: "Moy.", b: 1, fill: 1 }, { t: "Rang", b: 1, fill: 1 }];
  const h2 = [{ t: "Coefficient", cs: 3, al: "r", b: 1, fill: 1 }, ...mats.map((m) => ({ t: String(m.coefficient), b: 1, fill: 1 })), { t: String(totalCoef), b: 1, fill: 1 }, { t: "/" + base, b: 1, fill: 1 }, { t: "", fill: 1 }];
  const calc = eleves.map((e) => {
    let total = 0, nb = 0;
    const cel = mats.map((m) => {
      const x = grille.notes[m.id + ":" + e.id];
      if (!remplir || !x) return "";
      if (x.absent) return "abs";
      if (x.note === null || x.note === undefined) return "";
      total += Number(x.note); nb++;
      return String(Math.round(Number(x.note) * 100) / 100).replace(".", ",");
    });
    const moy = remplir && nb && totalCoef ? Math.round((total / totalCoef) * base * 100) / 100 : null;
    return { e, cel, total: remplir && nb ? Math.round(total * 100) / 100 : null, moy };
  });
  const tries = calc.filter((l) => l.moy !== null).map((l) => l.moy).sort((a, b) => b - a);
  const rows = calc.map((l, i) => [{ t: String(i + 1) }, { t: l.e.nom, al: "l" }, { t: l.e.prenom, al: "l" }, ...l.cel.map((c) => ({ t: c })),
    { t: l.total === null ? "" : String(l.total).replace(".", ",") }, { t: l.moy === null ? "" : String(l.moy).replace(".", ",") }, { t: l.moy !== null ? String(tries.indexOf(l.moy) + 1) : "" }]);
  const champsE = []; if (titrePeriode) champsE.push({ l: "Contrôle", v: titrePeriode });
  champsE.push({ l: "Classe", v: classe + (salle ? " - " + salle : "") }, { l: "Année académique", v: annee });
  return [{
    titre: "PALMARÈS - VUE D'ENSEMBLE", champs: champsE, cols, head: [{ h: 6, cells: h1 }, { h: 5, cells: h2 }], rows, rhMax: 7.5,
    note: mats.map((m, i) => abr[i] + " = " + m.nom).join("   ")
  }];
}

function specCahier(eleves, dateDebut, nbPages, classe, salle, annee) {
  let lundi = lundiDe(dateDebut);
  const celle = (259 - 8 - 40 - 34) / 20;
  const specs = [];
  for (let p = 0; p < nbPages; p++) {
    const cols = [8, 40, 34]; for (let i = 0; i < 20; i++) cols.push(celle);
    const h1 = [{ t: "N°", rs: 2, b: 1, fill: 1 }, { t: "Nom", rs: 2, b: 1, fill: 1 }, { t: "Prénom", rs: 2, b: 1, fill: 1 }], h2 = [];
    for (let s = 0; s < 4; s++) {
      const fin = new Date(lundi.getTime()); fin.setUTCDate(fin.getUTCDate() + 4);
      h1.push({ t: fmtJ(lundi) + " au " + fmtJ(fin), cs: 5, b: 1, fill: 1 });
      for (let j = 0; j < 5; j++) { const dj = new Date(lundi.getTime()); dj.setUTCDate(dj.getUTCDate() + j); h2.push({ t: JOURS[j] + " " + String(dj.getUTCDate()).padStart(2, "0"), b: 1, fill: 1 }); }
      lundi.setUTCDate(lundi.getUTCDate() + 7);
    }
    const rows = eleves.map((e, i) => { const c = [{ t: String(i + 1) }, { t: e.nom, al: "l" }, { t: e.prenom, al: "l" }]; for (let k = 0; k < 20; k++) c.push({ t: "" }); return c; });
    specs.push({
      titre: "CAHIER DE PRÉSENCE (JOURNAL D'APPEL)",
      champs: [{ l: "Page", v: (p + 1) + " / " + nbPages }, { l: "Titulaire", blank: 62 }, { l: "Classe", v: classe + (salle ? " - " + salle : "") }, { l: "Année académique", v: annee }],
      cols, head: [{ h: 5.5, cells: h1 }, { h: 5, cells: h2 }], rows, rhMax: 7.5, note: "P = présent   R = retard   A = absent   J = absence justifiée"
    });
  }
  return specs;
}

async function logoPourPdf(url) {
  const du = await logoIntegre(url);
  if (!du || !String(du).startsWith("data:image/")) return null;
  const fmt = /^data:image\/png/.test(du) ? "PNG" : /^data:image\/jpe?g/.test(du) ? "JPEG" : null;
  if (!fmt) return null;
  const dim = await new Promise((ok) => { const i = new Image(); i.onload = () => ok({ w: i.width, h: i.height }); i.onerror = () => ok(null); i.src = du; });
  return dim && dim.w && dim.h ? { data: du, fmt, ratio: dim.w / dim.h } : null;
}

function dessinerTable(doc, x0, y0, cols, lignes) {
  // lignes : [{ h, cells }] ; gere colspan / rowspan
  const occ = [];
  const xs = [0]; cols.forEach((w) => xs.push(xs[xs.length - 1] + w));
  const ys = [0]; lignes.forEach((l) => ys.push(ys[ys.length - 1] + l.h));
  doc.setLineWidth(0.2); doc.setDrawColor(0);
  lignes.forEach((l, r) => {
    occ[r] = occ[r] || [];
    let c = 0;
    l.cells.forEach((cell) => {
      while (occ[r][c]) c++;
      const cs = cell.cs || 1, rs = cell.rs || 1;
      for (let a = 0; a < rs; a++) { occ[r + a] = occ[r + a] || []; for (let b = 0; b < cs; b++) occ[r + a][c + b] = true; }
      const x = x0 + xs[c], y = y0 + ys[r], w = xs[c + cs] - xs[c], h = ys[Math.min(r + rs, ys.length - 1)] - ys[r];
      if (cell.fill) { doc.setFillColor(GRIS); doc.rect(x, y, w, h, "FD"); } else doc.rect(x, y, w, h, "S");
      const t = String(cell.t == null ? "" : cell.t);
      if (t) {
        let fs = cell.b ? 7 : (cell.al === "l" ? 8 : 9);
        doc.setFont("helvetica", cell.b ? "bold" : "normal"); doc.setFontSize(fs);
        while (fs > 4.5 && doc.getTextWidth(t) > w - 1.2) { fs -= 0.5; doc.setFontSize(fs); }
        const tw = doc.getTextWidth(t);
        const tx = cell.al === "l" ? x + 1 : cell.al === "r" ? x + w - tw - 1 : x + (w - tw) / 2;
        doc.text(t, tx, y + h / 2, { baseline: "middle" });
      }
      c += cs;
    });
  });
}

async function creerPdf(specs, paysage, settings, nomFichier) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: paysage ? "landscape" : "portrait", unit: "mm", format: "letter" });
  const W = paysage ? 279.4 : 215.9, H = paysage ? 215.9 : 279.4, M = 8;
  const logo = await logoPourPdf(urlLogo(settings));
  const nomEtab = (settings && settings.nom_etablissement) || "Etablissement";
  let premiere = true;
  const nouvellePage = (sp) => {
    if (!premiere) doc.addPage(); premiere = false;
    let x = M;
    if (logo) { const hh = 13, ww = Math.min(40, hh * logo.ratio); try { doc.addImage(logo.data, logo.fmt, M, M, ww, hh); x = M + ww + 4; } catch (e) { /* logo ignore */ } }
    doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.text(nomEtab, x, M + 8.5);
    doc.setLineWidth(0.6); doc.line(M, M + 15, W - M, M + 15);
    doc.setFontSize(12); doc.setCharSpace(1); doc.text(sp.titre, M, M + 22); doc.setCharSpace(0);
    let y = M + 28, cx = M;
    for (const f of sp.champs) {
      doc.setFont("helvetica", "bold"); doc.setFontSize(9.5);
      const lab = f.l + " : ", lw = doc.getTextWidth(lab);
      let fw;
      if (f.blank) fw = lw + f.blank; else { doc.setFont("helvetica", "normal"); fw = lw + doc.getTextWidth(String(f.v)); }
      if (cx + fw > W - M && cx > M) { cx = M; y += 5.5; }
      doc.setFont("helvetica", "bold"); doc.text(lab, cx, y);
      if (f.blank) { doc.setLineWidth(0.2); doc.line(cx + lw, y + 0.6, cx + lw + f.blank, y + 0.6); }
      else { doc.setFont("helvetica", "normal"); doc.text(String(f.v), cx + lw, y); }
      cx += fw + 8;
    }
    return y + 3;
  };
  for (const sp of specs) {
    const noteLignes = sp.note ? (doc.setFont("helvetica", "normal"), doc.setFontSize(7.5), doc.splitTextToSize(sp.note, W - 2 * M)) : [];
    const headH = sp.head.reduce((a, l) => a + l.h, 0);
    let i = 0, premierePage = true;
    while (i < sp.rows.length || premierePage) {
      const yT = nouvellePage(sp);
      const dispo = H - M - yT - headH - (noteLignes.length ? noteLignes.length * 3.2 + 3 : 0);
      const parPage = Math.max(1, Math.floor(dispo / 4.2));
      const bloc = sp.rows.slice(i, i + parPage);
      const rh = Math.min(sp.rhMax, Math.max(4.2, dispo / Math.max(1, bloc.length)));
      const lignes = [...sp.head, ...bloc.map((cells) => ({ h: rh, cells }))];
      dessinerTable(doc, M, yT, sp.cols, lignes);
      if (noteLignes.length) {
        doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
        doc.text(noteLignes, M, yT + headH + bloc.length * rh + 4);
      }
      i += bloc.length; premierePage = false;
    }
  }
  doc.save(nomFichier + ".pdf");
}

export default function Documents() {
  const user = usePontPedagogie();
  definirUtilisateur(user);
  const { currentYear } = useYear();
  const { settings } = useSettings();
  const racine = useRef(null);
  const [clair, setClair] = useState(false);
  useEffect(() => { if (racine.current) setClair(themeClair(racine.current.parentElement)); }, []);
  const [doc, setDoc] = useState("palmares");
  const [struct, setStruct] = useState({ sections: [], periodes: [] });
  const [sectionId, setSectionId] = useState("");
  const [classeId, setClasseId] = useState("");
  const [salleId, setSalleId] = useState("");
  const [nbControles, setNbControles] = useState("4");
  const [periodeId, setPeriodeId] = useState("");
  const [dateDebut, setDateDebut] = useState(() => new Date().toISOString().slice(0, 10));
  const [nbPages, setNbPages] = useState("3");
  const [erreur, setErreur] = useState("");
  const [occupe, setOccupe] = useState(false);
  const [info, setInfo] = useState("");

  useEffect(() => {
    if (!currentYear) return;
    api("/api/saisie/structure?year=" + currentYear.id).then(setStruct).catch((e) => setErreur(e.message));
    setSectionId(""); setClasseId(""); setSalleId("");
  }, [currentYear]);

  const section = struct.sections.find((s) => String(s.id) === String(sectionId));
  const classe = section && section.classes.find((c) => String(c.id) === String(classeId));
  const salle = classe && classe.rooms.find((r) => String(r.id) === String(salleId));
  const anneeNom = currentYear ? currentYear.nom || currentYear.name || currentYear.libelle || "" : "";

  const generer = async (mode) => {
    setErreur(""); setInfo("");
    if (!classe) { setErreur("Choisis une section et une classe."); return; }
    const periode = periodeId || (struct.periodes[0] && struct.periodes[0].id);
    setOccupe(true);
    try {
      let corps, paysage = false, titre, specs;
      if (doc === "ensemble") {
        if (!periode) throw new Error("Aucun controle n'est defini pour cette annee : cree d'abord les controles.");
        const [g, p] = await Promise.all([
          api("/api/saisie/grille?class_id=" + classe.id + "&period_id=" + periode + (salleId ? "&room_id=" + salleId : "")),
          api("/api/pedagogie/parametres?year=" + currentYear.id).catch(() => ({ base: 10 }))
        ]);
        if (!g.matieres.length) throw new Error("Aucune matiere n'est affectee a cette classe.");
        corps = htmlEnsemble(g, Number(p.base) || 10, classe.nom, salle && salle.nom, anneeNom, periodeId ? (struct.periodes.find((x) => String(x.id) === String(periodeId)) || {}).nom : "", !!periodeId);
        specs = specEnsemble(g, Number(p.base) || 10, classe.nom, salle && salle.nom, anneeNom, periodeId ? (struct.periodes.find((x) => String(x.id) === String(periodeId)) || {}).nom : "", !!periodeId);
        paysage = true; titre = "Palmares - vue d'ensemble";
      } else {
        const eleves = await api("/api/documents/eleves?class_id=" + classe.id + (salleId ? "&room_id=" + salleId : ""));
        if (!eleves.length) throw new Error("Aucun eleve dans cette classe / salle.");
        if (doc === "palmares") {
          const n = Number(nbControles);
          if (!n || n < 1 || n > 10) throw new Error("Le nombre de controles doit etre entre 1 et 10.");
          corps = htmlPalmares(eleves, n, classe.nom, salle && salle.nom, anneeNom); titre = "Palmares"; specs = specPalmares(eleves, n, classe.nom, salle && salle.nom, anneeNom);
        } else {
          const np = Number(nbPages);
          if (!np || np < 1 || np > 6) throw new Error("Le nombre de pages doit etre entre 1 et 6.");
          if (!/^\d{4}-\d{2}-\d{2}$/.test(dateDebut)) throw new Error("Date de debut invalide.");
          corps = htmlCahier(eleves, dateDebut, np, classe.nom, salle && salle.nom, anneeNom); titre = "Cahier de presence"; paysage = true; specs = specCahier(eleves, dateDebut, np, classe.nom, salle && salle.nom, anneeNom);
        }
      }
      const nomFichier = titre.replace(/[^A-Za-z0-9]+/g, "_") + "_" + classe.nom.replace(/[^A-Za-z0-9]+/g, "") + (salle ? "_" + String(salle.nom).replace(/[^A-Za-z0-9]+/g, "") : "");
      if (mode === "pdf") {
        await creerPdf(specs, paysage, settings, nomFichier);
        setInfo("PDF telecharge : " + nomFichier + ".pdf (format lettre US). Tu peux l'imprimer depuis n'importe quel ordinateur.");
      } else {
        const ok = await sortie(mode, titre, corps, paysage, settings, nomFichier);
        if (!ok) setErreur("La fenetre d'impression a ete bloquee : autorise les fenetres pop-up.");
        else if (mode === "telecharger") setInfo("Fichier telecharge : " + nomFichier + ".html. Ouvre-le dans n'importe quel navigateur puis clique sur Imprimer.");
      }
    } catch (e) { setErreur(e.message); }
    setOccupe(false);
  };

  const DOCS = [
    ["palmares", "Palmarès", "Feuille vierge pour un professeur, portrait. À remplir à la main.", 170, false],
    ["ensemble", "Palmarès – vue d'ensemble", "Toutes les matières de la classe sur une feuille, paysage, avec coefficients, total et moyenne.", 215, true],
    ["cahier", "Cahier de présence", "Journal d'appel : 4 semaines (L à V) par page, paysage.", 280, true]
  ];
  return (
    <div className={"page di-root " + (clair ? "di-clair" : "di-sombre")} ref={racine}>
      <style>{CSS}</style>
      <div className="di-hero">
        <h1>Documents imprimables</h1>
        <p>Format lettre US (8,5 × 11 po), avec le logo et le nom de l'établissement. Une page par impression : tu choisis la classe (et la salle), puis tu imprimes.</p>
      </div>
      <div className="di-docs">
        {DOCS.map(([k, t, d, h, large]) => (
          <button key={k} className={"di-doc" + (doc === k ? " on" : "")} style={{ "--h": h }} onClick={() => { setDoc(k); setErreur(""); }}>
            <span className={"di-feuille" + (large ? " large" : "")}></span>
            <b>{t}</b><span>{d}</span>
          </button>
        ))}
      </div>
      <div className="di-card">
        <div className="di-form">
          <div><label>Section</label>
            <select value={sectionId} onChange={(e) => { setSectionId(e.target.value); setClasseId(""); setSalleId(""); }}>
              <option value="">— choisir —</option>{struct.sections.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
            </select></div>
          <div><label>Classe</label>
            <select value={classeId} disabled={!section} onChange={(e) => { setClasseId(e.target.value); setSalleId(""); }}>
              <option value="">— choisir —</option>{section && section.classes.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select></div>
          <div><label>Salle (facultatif)</label>
            <select value={salleId} disabled={!classe || !classe.rooms.length} onChange={(e) => setSalleId(e.target.value)}>
              <option value="">Toute la classe</option>{classe && classe.rooms.map((r) => <option key={r.id} value={r.id}>{r.nom}</option>)}
            </select></div>
          {doc === "palmares" && <div><label>Nombre de contrôles (colonnes D · E · T)</label><input type="number" min="1" max="10" value={nbControles} onChange={(e) => setNbControles(e.target.value)} /></div>}
          {doc === "ensemble" && <div><label>Remplir avec les notes du contrôle</label>
            <select value={periodeId} onChange={(e) => setPeriodeId(e.target.value)}>
              <option value="">Non : feuille vierge</option>{struct.periodes.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
            </select></div>}
          {doc === "cahier" && <>
            <div><label>Date de début (la semaine 1 commence le lundi)</label><input type="date" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} /></div>
            <div><label>Nombre de pages (4 semaines chacune)</label><input type="number" min="1" max="6" value={nbPages} onChange={(e) => setNbPages(e.target.value)} /></div>
          </>}
        </div>
        {erreur && <div className="di-err">{erreur}</div>}
        {info && <div className="di-ok">{info}</div>}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="di-btn" disabled={occupe} onClick={() => generer("imprimer")}>{occupe ? "Préparation..." : "Générer et imprimer"}</button>
          <button className="di-btn" style={{ background: "linear-gradient(135deg,#a855f7,#5b8cff)" }} disabled={occupe} onClick={() => generer("pdf")}>⬇ Télécharger en PDF</button>
          <button className="di-btn alt" disabled={occupe} onClick={() => generer("telecharger")}>Télécharger en HTML</button>
        </div>
        <div className="di-dim" style={{ marginTop: 10 }}>Pour imprimer ailleurs, télécharge le PDF (lettre US) : il s'imprime depuis n'importe quel ordinateur. Dans la fenêtre d'impression, choisis le format « Lettre » et désactive les en-têtes et pieds de page du navigateur.</div>
      </div>
    </div>
  );
}
