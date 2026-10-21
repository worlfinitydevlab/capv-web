import { ajouterTagWorlfinity } from "../pdfTag.js";
import { tailleFeuille, formatJsPdf } from "./papier.js";
// Palmares en PDF vectoriel (jsPDF), lettre US :
//  - type "palmares"  : feuille vierge d'un professeur (portrait), colonnes D / E / T par controle
//  - type "ensemble"  : vue d'ensemble de la classe (paysage), matieres + total / moyenne / rang
// En-tete centre (logo + nom de l'etablissement), meme style que le bulletin et le cahier de presence.

const MARINE = [22, 52, 92];
const MARINE2 = [48, 84, 130];
const CLAIR = [232, 238, 246];
const CLAIR2 = [214, 224, 238];
const LIGNE = [165, 174, 188];
const ZEBRE = [247, 249, 252];
const TEXTE = [25, 28, 34];
const SOURDINE = [95, 104, 118];

function ajuster(doc, texte, largeurMax, taille, minTaille) {
  let fs = taille;
  doc.setFontSize(fs);
  while (fs > minTaille && doc.getTextWidth(texte) > largeurMax) { fs -= 0.25; doc.setFontSize(fs); }
  let t = String(texte);
  if (doc.getTextWidth(t) > largeurMax) {
    while (t.length > 1 && doc.getTextWidth(t + "...") > largeurMax) t = t.slice(0, -1);
    t = t + "...";
  }
  return t;
}

function ligneVide(doc, x, y, etiquette, largeur) {
  doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(...TEXTE);
  const lab = etiquette + " : ";
  const lw = doc.getTextWidth(lab);
  doc.text(lab, x, y);
  doc.setDrawColor(...SOURDINE); doc.setLineWidth(0.25);
  doc.line(x + lw, y + 0.7, x + lw + largeur, y + 0.7);
  return lw + largeur;
}

// retourne la position y ou commence le tableau
function entete(doc, W, M, ctx, titre, numeroPage, champsVides) {
  const { etab, logo, classe, salle, annee, sousTitre } = ctx;
  const L = M, R = W - M, CW = R - L;
  let y = M;
  const logoH = 19;
  if (logo) {
    const ww = Math.min(30, logoH * logo.ratio);
    const hh = ww / logo.ratio > logoH ? logoH : ww / logo.ratio;
    try { doc.addImage(logo.data, logo.fmt, L, y, ww, hh); } catch (er) { /* logo ignore */ }
  }
  const cx = W / 2;
  const largeurTexte = CW - 2 * 36;
  doc.setTextColor(...TEXTE);
  doc.setFont("times", "bolditalic");
  doc.text(ajuster(doc, etab.nom, largeurTexte, 21, 12), cx, y + 7.2, { align: "center" });
  doc.setFont("helvetica", "bold"); doc.setTextColor(...MARINE);
  doc.setCharSpace(1.2); doc.setFontSize(11.5);
  doc.text(ajuster(doc, titre, largeurTexte, 11.5, 8), cx, y + 13.6, { align: "center" });
  doc.setCharSpace(0);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...SOURDINE);
  if (etab.details) doc.text(ajuster(doc, etab.details, largeurTexte, 8.5, 6), cx, y + 18.2, { align: "center" });
  y += logoH + 2;
  doc.setDrawColor(...MARINE); doc.setLineWidth(0.8); doc.line(L, y, R, y);
  doc.setLineWidth(0.25); doc.line(L, y + 1.2, R, y + 1.2);
  y += 6.6;

  doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...TEXTE);
  doc.text("Classe : " + classe + (salle ? "  -  " + salle : ""), L, y);
  if (sousTitre) doc.text(sousTitre, cx, y, { align: "center" });
  doc.text("Année scolaire : " + annee, R, y, { align: "right" });
  y += 6.4;
  if (champsVides && champsVides.length) {
    let x = L;
    const rest = CW - 2 * 8;
    const total = champsVides.reduce((a, c) => a + c.poids, 0);
    doc.setFont("helvetica", "bold"); doc.setFontSize(9.5);
    champsVides.forEach((c) => {
      const lw = (rest * c.poids) / total;
      x += ligneVide(doc, x, y, c.l, lw - doc.getTextWidth(c.l + " : ") ) + 8;
    });
    y += 4.4;
  } else y += 0;
  if (numeroPage > 1) { /* pages suivantes : meme en-tete */ }
  return y;
}

function pied(doc, W, H, M, st, texteGauche) {
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...SOURDINE);
  if (texteGauche) doc.text(texteGauche, M, H - M + 1);
  if (st.nom_etablissement) { doc.setFont("times", "italic"); doc.text(st.nom_etablissement, W - M, H - M + 1, { align: "right" }); }
}

/* ======================= PALMARES (feuille vierge du professeur) ======================= */
function dessinerPalmares(doc, p) {
  const { eleves, nbControles: n, ctx, st } = p;
  const { W, H } = tailleFeuille(p, false), M = 8, L = M, R = W - M, CW = R - L;
  const wN = 9, wNom = 42, wPre = 36;
  const wCol = (CW - wN - wNom - wPre) / (3 * n);
  const hEnt1 = 6.4, hEnt2 = 5.2;
  let i = 0, premiere = true, numero = 0;
  do {
    if (!premiere) doc.addPage(); premiere = false; numero++;
    const yT = entete(doc, W, M, ctx, "PALMARÈS", numero, [{ l: "Professeur", poids: 3.2 }, { l: "Matière", poids: 2.6 }, { l: "Coefficient", poids: 1.5 }]) + 2.2;
    const bas = H - M - 9;
    const dispo = bas - yT - hEnt1 - hEnt2;
    const parPage = Math.max(1, Math.floor(dispo / 4.4));
    const bloc = eleves.slice(i, i + parPage);
    const rh = Math.min(7.6, Math.max(4.4, dispo / Math.max(1, bloc.length)));
    const hTab = hEnt1 + hEnt2 + bloc.length * rh;
    const xNom = L + wN, xPre = xNom + wNom, x0 = xPre + wPre, yC = yT + hEnt1 + hEnt2;

    doc.setFillColor(...MARINE); doc.rect(L, yT, wN + wNom + wPre, hEnt1 + hEnt2, "F");
    doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(8.6);
    doc.text("N°", L + wN / 2, yT + (hEnt1 + hEnt2) / 2, { align: "center", baseline: "middle" });
    doc.text("NOM", xNom + 2, yT + (hEnt1 + hEnt2) / 2, { baseline: "middle" });
    doc.text("PRÉNOM", xPre + 2, yT + (hEnt1 + hEnt2) / 2, { baseline: "middle" });
    const lettres = ["D", "E", "T"];
    for (let c = 0; c < n; c++) {
      const xs = x0 + c * 3 * wCol;
      doc.setFillColor(...(c % 2 === 0 ? MARINE : MARINE2)); doc.rect(xs, yT, 3 * wCol, hEnt1, "F");
      doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(n > 6 ? 6.4 : 8.2);
      doc.text(n > 6 ? "C" + (c + 1) : "CONTRÔLE " + (c + 1), xs + 1.5 * wCol, yT + hEnt1 / 2, { align: "center", baseline: "middle" });
      doc.setFillColor(...(c % 2 === 0 ? CLAIR : CLAIR2)); doc.rect(xs, yT + hEnt1, 3 * wCol, hEnt2, "F");
      doc.setTextColor(...MARINE); doc.setFontSize(8.2);
      for (let k = 0; k < 3; k++) doc.text(lettres[k], xs + (k + 0.5) * wCol, yT + hEnt1 + hEnt2 / 2, { align: "center", baseline: "middle" });
    }
    bloc.forEach((e, k) => {
      const y = yC + k * rh;
      if (k % 2 === 1) { doc.setFillColor(...ZEBRE); doc.rect(L, y, CW, rh, "F"); }
      doc.setTextColor(...SOURDINE); doc.setFont("helvetica", "normal"); doc.setFontSize(8);
      doc.text(String(i + k + 1), L + wN / 2, y + rh / 2, { align: "center", baseline: "middle" });
      doc.setTextColor(...TEXTE); doc.setFont("helvetica", "bold");
      doc.text(ajuster(doc, String(e.nom || ""), wNom - 3, 8.6, 5.5), xNom + 2, y + rh / 2, { baseline: "middle" });
      doc.setFont("helvetica", "normal");
      doc.text(ajuster(doc, String(e.prenom || ""), wPre - 3, 8.6, 5.5), xPre + 2, y + rh / 2, { baseline: "middle" });
    });
    const yFin = yC + bloc.length * rh;
    doc.setDrawColor(...LIGNE); doc.setLineWidth(0.15);
    for (let k = 0; k <= bloc.length; k++) doc.line(L, yC + k * rh, R, yC + k * rh);
    doc.line(xNom, yC, xNom, yFin);
    for (let c = 0; c <= 3 * n; c++) { const xc = x0 + c * wCol; doc.line(xc, yT + hEnt1, xc, yFin); }
    doc.setDrawColor(...MARINE); doc.setLineWidth(0.9);
    for (let c = 0; c <= n; c++) { const xs = x0 + c * 3 * wCol; doc.line(xs, yT, xs, yT + hTab); }
    doc.setLineWidth(0.6); doc.rect(L, yT, CW, hTab, "S"); doc.line(xPre, yT, xPre, yT + hTab);
    doc.setLineWidth(0.9); doc.line(L, yC, R, yC);
    pied(doc, W, H, M, st, "D = devoir     E = examen     T = total");
    i += bloc.length;
  } while (i < eleves.length);
}

/* ======================= VUE D'ENSEMBLE ======================= */
function abreviation(m, utilises) {
  let a = String(m.code || "").trim().toUpperCase();
  if (!a || a.length > 6) a = String(m.nom).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 4);
  let cand = a, k = 2;
  while (utilises.has(cand)) { cand = a + k; k++; }
  utilises.add(cand);
  return cand;
}
const virg = (v) => String(Math.round(Number(v) * 100) / 100).replace(".", ",");

function dessinerEnsemble(doc, p) {
  const { grille, base, remplir, titrePeriode, ctx, st } = p;
  const mats = grille.matieres, eleves = grille.eleves;
  const { W, H } = tailleFeuille(p, true), M = 8, L = M, R = W - M, CW = R - L;
  const utilises = new Set();
  const abr = mats.map((m) => abreviation(m, utilises));
  const totalCoef = mats.reduce((a, m) => a + Number(m.coefficient || 0), 0);
  const wN = 9, wNom = 40, wPre = 34, wTot = 15, wMoy = 14, wRang = 12;
  const wMat = Math.min(16, (CW - wN - wNom - wPre - wTot - wMoy - wRang) / Math.max(1, mats.length));
  const largeurTab = wN + wNom + wPre + mats.length * wMat + wTot + wMoy + wRang;
  const decal = (CW - largeurTab) / 2;
  const X0 = L + Math.max(0, decal);
  const hEnt1 = 6.4, hEnt2 = 5.2;

  const calc = eleves.map((e) => {
    let total = 0, nb = 0;
    const cel = mats.map((m) => {
      const x = grille.notes[m.id + ":" + e.id];
      if (!remplir || !x) return "";
      if (x.absent) return "abs";
      if (x.note === null || x.note === undefined) return "";
      total += Number(x.note); nb++;
      return virg(x.note);
    });
    const moy = remplir && nb && totalCoef ? Math.round((total / totalCoef) * base * 100) / 100 : null;
    return { e, cel, total: remplir && nb ? Math.round(total * 100) / 100 : null, moy };
  });
  const tries = calc.filter((l) => l.moy !== null).map((l) => l.moy).sort((a, b) => b - a);

  let i = 0, premiere = true, numero = 0;
  do {
    if (!premiere) doc.addPage(); premiere = false; numero++;
    const yT = entete(doc, W, M, { ...ctx, sousTitre: titrePeriode ? titrePeriode : "" }, "PALMARÈS - VUE D'ENSEMBLE", numero, null) + 1.2;
    const lignesLegende = 2;
    const bas = H - M - 9 - lignesLegende * 3.6;
    const dispo = bas - yT - hEnt1 - hEnt2;
    const parPage = Math.max(1, Math.floor(dispo / 4.4));
    const bloc = calc.slice(i, i + parPage);
    const rh = Math.min(7.6, Math.max(4.4, dispo / Math.max(1, bloc.length)));
    const hTab = hEnt1 + hEnt2 + bloc.length * rh;
    const xNom = X0 + wN, xPre = xNom + wNom, xM0 = xPre + wPre, xTot = xM0 + mats.length * wMat, xMoy = xTot + wTot, xRang = xMoy + wMoy, xFin = xRang + wRang;
    const yC = yT + hEnt1 + hEnt2;

    // en-tetes
    doc.setFillColor(...MARINE); doc.rect(X0, yT, wN + wNom + wPre, hEnt1 + hEnt2, "F");
    doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(8.6);
    doc.text("N°", X0 + wN / 2, yT + (hEnt1 + hEnt2) / 2, { align: "center", baseline: "middle" });
    doc.text("NOM", xNom + 2, yT + (hEnt1 + hEnt2) / 2, { baseline: "middle" });
    doc.text("PRÉNOM", xPre + 2, yT + (hEnt1 + hEnt2) / 2, { baseline: "middle" });
    mats.forEach((m, c) => {
      const xs = xM0 + c * wMat;
      doc.setFillColor(...(c % 2 === 0 ? MARINE : MARINE2)); doc.rect(xs, yT, wMat, hEnt1, "F");
      doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold");
      doc.text(ajuster(doc, abr[c], wMat - 1.2, 7.6, 4.8), xs + wMat / 2, yT + hEnt1 / 2, { align: "center", baseline: "middle" });
      doc.setFillColor(...(c % 2 === 0 ? CLAIR : CLAIR2)); doc.rect(xs, yT + hEnt1, wMat, hEnt2, "F");
      doc.setTextColor(...MARINE); doc.setFontSize(8);
      doc.text(String(m.coefficient), xs + wMat / 2, yT + hEnt1 + hEnt2 / 2, { align: "center", baseline: "middle" });
    });
    [["TOTAL", String(totalCoef), xTot, wTot], ["MOY.", "/" + base, xMoy, wMoy], ["RANG", "", xRang, wRang]].forEach(([a, b, xs, ww]) => {
      doc.setFillColor(...MARINE); doc.rect(xs, yT, ww, hEnt1, "F");
      doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(7.8);
      doc.text(a, xs + ww / 2, yT + hEnt1 / 2, { align: "center", baseline: "middle" });
      doc.setFillColor(...CLAIR); doc.rect(xs, yT + hEnt1, ww, hEnt2, "F");
      doc.setTextColor(...MARINE); doc.setFontSize(8);
      if (b) doc.text(b, xs + ww / 2, yT + hEnt1 + hEnt2 / 2, { align: "center", baseline: "middle" });
    });
    // lignes
    bloc.forEach((l, k) => {
      const y = yC + k * rh;
      if (k % 2 === 1) { doc.setFillColor(...ZEBRE); doc.rect(X0, y, largeurTab, rh, "F"); }
      doc.setTextColor(...SOURDINE); doc.setFont("helvetica", "normal"); doc.setFontSize(8);
      doc.text(String(i + k + 1), X0 + wN / 2, y + rh / 2, { align: "center", baseline: "middle" });
      doc.setTextColor(...TEXTE); doc.setFont("helvetica", "bold");
      doc.text(ajuster(doc, String(l.e.nom || ""), wNom - 3, 8.6, 5.5), xNom + 2, y + rh / 2, { baseline: "middle" });
      doc.setFont("helvetica", "normal");
      doc.text(ajuster(doc, String(l.e.prenom || ""), wPre - 3, 8.6, 5.5), xPre + 2, y + rh / 2, { baseline: "middle" });
      doc.setFontSize(8.4);
      l.cel.forEach((c, j) => { if (c) doc.text(c, xM0 + (j + 0.5) * wMat, y + rh / 2, { align: "center", baseline: "middle" }); });
      doc.setFont("helvetica", "bold");
      if (l.total !== null) doc.text(virg(l.total), xTot + wTot / 2, y + rh / 2, { align: "center", baseline: "middle" });
      if (l.moy !== null) { doc.setTextColor(...MARINE); doc.text(virg(l.moy), xMoy + wMoy / 2, y + rh / 2, { align: "center", baseline: "middle" }); doc.text(String(tries.indexOf(l.moy) + 1), xRang + wRang / 2, y + rh / 2, { align: "center", baseline: "middle" }); }
    });
    const yFin = yC + bloc.length * rh;
    doc.setDrawColor(...LIGNE); doc.setLineWidth(0.15);
    for (let k = 0; k <= bloc.length; k++) doc.line(X0, yC + k * rh, xFin, yC + k * rh);
    doc.line(xNom, yC, xNom, yFin);
    for (let c = 0; c <= mats.length; c++) { const xc = xM0 + c * wMat; doc.line(xc, yT + hEnt1, xc, yFin); }
    doc.line(xMoy, yT + hEnt1, xMoy, yFin); doc.line(xRang, yT + hEnt1, xRang, yFin);
    // traits epais : avant les matieres, avant le total, contour
    doc.setDrawColor(...MARINE); doc.setLineWidth(0.9);
    doc.line(xM0, yT, xM0, yT + hTab); doc.line(xTot, yT, xTot, yT + hTab);
    doc.setLineWidth(0.6); doc.rect(X0, yT, largeurTab, hTab, "S"); doc.line(xPre, yT, xPre, yT + hTab);
    doc.setLineWidth(0.9); doc.line(X0, yC, xFin, yC);

    // legende des abreviations
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.6); doc.setTextColor(...SOURDINE);
    const leg = doc.splitTextToSize(mats.map((m, c) => abr[c] + " = " + m.nom).join("     "), CW);
    doc.text(leg.slice(0, 3), L, yFin + 4.2);
    pied(doc, W, H, M, st, "");
    i += bloc.length;
  } while (i < calc.length);
}

/* ======================= VUE D'ENSEMBLE PAR BLOCS =======================
 * Utilisee quand la classe a des sous-matieres (matiere divisee en parties) ou au moins deux categories de matieres :
 *   categorie (bandeau) > matiere (sous-colonnes, une par sous-matiere, avec leur maximum + total de la matiere) > total et moyenne de la categorie,
 *   puis TOTAL / MOY. / RANG generaux. Le bulletin de l'eleve n'est pas concerne : il ne montre que le total de chaque matiere. */
function utiliseBlocs(grille) {
  const ms = (grille && grille.matieres) || [];
  if (ms.some((m) => m.part_id)) return true;
  return new Set(ms.map((m) => m.categorie || "")).size >= 2;
}

function dessinerEnsembleBlocs(doc, p) {
  const { grille, base, remplir, titrePeriode, ctx, st } = p;
  const mats = grille.matieres, eleves = grille.eleves;
  const { W, H } = tailleFeuille(p, true), M = 8, L = M, R = W - M, CW = R - L;

  // ---- structure : categories > matieres > colonnes
  const cats = [], parCat = {};
  for (const m of mats) {
    const k = m.categorie || "";
    if (!parCat[k]) { parCat[k] = { nom: k, blocs: [], max: 0 }; cats.push(parCat[k]); }
    const cat = parCat[k];
    const cle = m.cs_id || m.id;
    let bloc = cat.blocs.find((b) => b.cle === cle);
    if (!bloc) { bloc = { cle, nom: m.groupe || m.nom, code: m.code, max: Number(m.part_id ? m.matiere_coefficient : m.coefficient) || 0, cols: [], divise: !!m.part_id }; cat.blocs.push(bloc); cat.max += bloc.max; }
    bloc.cols.push(m);
  }
  const multi = cats.length >= 2;
  const cols = [];
  let nbBloc = 0;
  cats.forEach((cat, ci) => {
    cat.blocs.forEach((b) => {
      b.n = nbBloc++;
      b.cols.forEach((m, k) => cols.push({ t: "n", m, b, ci, cat, max: Number(m.coefficient) || 0, finBloc: !b.divise && k === b.cols.length - 1 }));
      if (b.divise) cols.push({ t: "tm", b, ci, cat, max: b.max, finBloc: true });
    });
    if (multi) { cols.push({ t: "tc", cat, ci, max: cat.max, finBloc: true }); cols.push({ t: "mc", cat, ci, finBloc: true }); }
  });
  const totalMax = cats.reduce((a, c) => a + c.max, 0);
  const nc = cols.length;

  // ---- valeurs par eleve
  const calc = eleves.map((e) => {
    const val = {};
    let total = 0, nb = 0;
    const tcat = cats.map(() => ({ t: 0, nb: 0 }));
    const tmat = new Map();
    cols.forEach((c, j) => {
      if (c.t !== "n") return;
      const x = grille.notes[c.m.id + ":" + e.id];
      let txt = "";
      if (remplir && x) {
        if (x.absent) txt = "abs";
        else if (x.note !== null && x.note !== undefined) {
          const v = Number(x.note); txt = virg(v); total += v; nb++;
          tcat[c.ci].t += v; tcat[c.ci].nb++;
          const s = tmat.get(c.b) || { t: 0, nb: 0 }; s.t += v; s.nb++; tmat.set(c.b, s);
        }
      }
      val[j] = txt;
    });
    cols.forEach((c, j) => {
      if (c.t === "tm") { const s = tmat.get(c.b); val[j] = s && s.nb ? virg(s.t) : ""; }
      else if (c.t === "tc") { const s = tcat[c.ci]; val[j] = s.nb ? virg(s.t) : ""; }
      else if (c.t === "mc") { const s = tcat[c.ci]; val[j] = s.nb && c.cat.max ? virg((s.t / c.cat.max) * base) : ""; }
    });
    const moy = remplir && nb && totalMax ? Math.round((total / totalMax) * base * 100) / 100 : null;
    return { e, val, total: remplir && nb ? Math.round(total * 100) / 100 : null, moy };
  });
  const tries = calc.filter((l) => l.moy !== null).map((l) => l.moy).sort((a, b) => b - a);

  // ---- dimensions : les totaux sont un peu plus larges que les notes ; les noms prennent le reste
  const wN = 8, wTot = 11, wMoy = 10, wRang = 8;
  const POIDS = { n: 1, tm: 1.2, tc: 1.4, mc: 1.15 };
  const somme = cols.reduce((a, c) => a + POIDS[c.t], 0);
  const dispoCols = CW - wN - wTot - wMoy - wRang;
  let u = Math.min(Math.min(11, 9 * Math.max(1, W / 279.4)), (dispoCols - 56) / somme);
  if (u < 4.6) u = Math.max(3.6, Math.min(4.6, (dispoCols - 44) / somme));
  const noms = dispoCols - u * somme;
  const wNom = Math.min(42, noms * 0.55), wPre = Math.min(36, noms * 0.45);
  let xr = 0;
  cols.forEach((c) => { c.w = u * POIDS[c.t]; c.x = xr; xr += c.w; });
  const largeurCols = xr;
  const largeurTab = wN + wNom + wPre + largeurCols + wTot + wMoy + wRang;
  const X0 = L + Math.max(0, (CW - largeurTab) / 2);
  const hA = multi ? 5.2 : 0, hB = 6, hC = 5, hD = 5, hEnt = hA + hB + hC + hD;
  const LEGER = [238, 243, 250];

  // ---- abreviations : plus courtes quand la place manque (3 lettres a 5,7 mm, jusqu'a 5 lettres a 9 mm)
  const lettres = Math.max(3, Math.min(5, Math.floor(u / 1.45)));
  const abrCourte = (nom, us) => {
    const base = String(nom || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, lettres) || "?";
    let cand = base, k = 2;
    while (us.has(cand)) { cand = base.slice(0, Math.max(1, lettres - 1)) + k; k++; }
    us.add(cand); return cand;
  };
  const utilises = new Set();
  cats.forEach((cat) => cat.blocs.forEach((b) => {
    if (b.divise) { const us = new Set(); b.cols.forEach((m) => { m.abrPart = abrCourte(m.nom_court || m.nom, us); }); }
    else b.abr = abreviation(b.cols[0], utilises);
  }));

  // ---- legende
  const parties = [];
  cats.forEach((cat) => cat.blocs.forEach((b) => {
    if (b.divise) parties.push(b.nom + " /" + b.max + " : " + b.cols.map((m) => m.abrPart + " = " + (m.nom_court || m.nom)).join(", "));
    else parties.push(b.abr + " = " + b.nom);
  }));
  doc.setFont("helvetica", "normal"); doc.setFontSize(7.2);
  const leg = doc.splitTextToSize(parties.join("     "), CW).slice(0, 5);

  const xN = X0, xNom = xN + wN, xPre = xNom + wNom, xC0 = xPre + wPre, xTot = xC0 + largeurCols, xMoy = xTot + wTot, xRang = xMoy + wMoy, xFin = xRang + wRang;
  // un nombre ou une abreviation n'est jamais coupe : la police rapetisse (jusqu'a 3,6 pt) ; seuls les noms longs peuvent finir par « ... »
  const reduire = (t, w, taille, mini) => { let fs = taille; doc.setFontSize(fs); while (fs > mini && doc.getTextWidth(t) > w) { fs -= 0.2; doc.setFontSize(fs); } return t; };
  const cel = (x, y, w, h, fond, txt, couleur, taille, mini, tronque) => {
    doc.setFillColor(...fond); doc.rect(x, y, w, h, "F");
    if (txt === "" || txt === null || txt === undefined) return;
    doc.setTextColor(...couleur); doc.setFont("helvetica", "bold");
    const t = String(txt);
    doc.text(tronque ? ajuster(doc, t, w - 1, taille, mini) : reduire(t, w - 0.6, taille, 3.6), x + w / 2, y + h / 2, { align: "center", baseline: "middle" });
  };

  let i = 0, premiere = true, numero = 0;
  do {
    if (!premiere) doc.addPage(); premiere = false; numero++;
    const yT = entete(doc, W, M, { ...ctx, sousTitre: titrePeriode ? titrePeriode : "" }, "PALMARÈS - VUE D'ENSEMBLE", numero, null) + 1.2;
    const bas = H - M - 9 - leg.length * 3.3;
    const dispo = bas - yT - hEnt;
    const parPage = Math.max(1, Math.floor(dispo / 4.4));
    const bloc = calc.slice(i, i + parPage);
    const rh = Math.min(7.6, Math.max(4.4, dispo / Math.max(1, bloc.length)));
    const yC = yT + hEnt, yFin = yC + bloc.length * rh, hTab = hEnt + bloc.length * rh;
    const yB = yT + hA, yCc = yB + hB, yD = yCc + hC;

    // -- en-tetes : colonnes d'identite
    cel(xN, yT, wN, hEnt, MARINE, "N°", [255, 255, 255], 8.6, 6, true);
    cel(xNom, yT, wNom, hEnt, MARINE, "NOM", [255, 255, 255], 8.6, 6, true);
    cel(xPre, yT, wPre, hEnt, MARINE, "PRÉNOM", [255, 255, 255], 8.6, 6, true);
    // -- categories
    if (multi) {
      cats.forEach((cat) => {
        const mine = cols.filter((c) => c.cat === cat);
        cel(xC0 + mine[0].x, yT, mine.reduce((a, c) => a + c.w, 0), hA, MARINE, (cat.nom || "AUTRES MATIÈRES").toUpperCase(), [255, 255, 255], 8, 5, true);
      });
    }
    // -- matieres et colonnes
    cols.forEach((c, j) => {
      const x = xC0 + c.x, wc = c.w;
      if (c.t === "n" || c.t === "tm") {
        const alt = c.b.n % 2 === 0;
        const fondH = alt ? MARINE : MARINE2, fondL = alt ? CLAIR : CLAIR2;
        if (c.t === "n" && !c.b.divise) {
          cel(x, yB, wc, hB + hC, fondH, c.b.abr, [255, 255, 255], 7.6, 4.8);
          cel(x, yD, wc, hD, fondL, virg(c.max), MARINE, 8, 5);
        } else if (c.t === "n") {
          cel(x, yCc, wc, hC, fondL, c.m.abrPart, MARINE, 7, 4.6);
          cel(x, yD, wc, hD, fondL, virg(c.max), MARINE, 8, 5);
        } else {
          cel(x, yCc, wc, hC, fondL, "TOT.", MARINE, 7, 4.6);
          cel(x, yD, wc, hD, fondL, virg(c.max), MARINE, 8, 5);
        }
      } else if (c.t === "tc") {
        cel(x, yB, wc, hB + hC, MARINE, "TOTAL", [255, 255, 255], 7, 4.4);
        cel(x, yD, wc, hD, CLAIR, virg(c.max), MARINE, 8, 5);
      } else if (c.t === "mc") {
        cel(x, yB, wc, hB + hC, MARINE, "MOY.", [255, 255, 255], 7, 4.4);
        cel(x, yD, wc, hD, CLAIR, "/" + base, MARINE, 8, 5);
      }
    });
    // noms de matieres divisees (une cellule qui couvre sous-colonnes + total)
    cols.forEach((c, j) => {
      if (c.t === "n" && c.b.divise && c.m === c.b.cols[0]) {
        const mine = cols.filter((d) => d.b === c.b);
        cel(xC0 + c.x, yB, mine.reduce((a, d) => a + d.w, 0), hB, c.b.n % 2 === 0 ? MARINE : MARINE2, c.b.nom, [255, 255, 255], 7.8, 5, true);
      }
    });
    // -- general
    [["TOTAL", virg(totalMax), xTot, wTot], ["MOY.", "/" + base, xMoy, wMoy], ["RANG", "", xRang, wRang]].forEach(([a, b, xs, ww]) => {
      cel(xs, yT, ww, hA + hB + hC, MARINE, a, [255, 255, 255], 7.8, 5);
      cel(xs, yD, ww, hD, CLAIR, b, MARINE, 8, 5);
    });

    // -- lignes
    bloc.forEach((l, k) => {
      const y = yC + k * rh;
      if (k % 2 === 1) { doc.setFillColor(...ZEBRE); doc.rect(X0, y, largeurTab, rh, "F"); }
      cols.forEach((c) => { if (c.t !== "n") { doc.setFillColor(...LEGER); doc.rect(xC0 + c.x, y, c.w, rh, "F"); } });
      doc.setFillColor(...LEGER); doc.rect(xTot, y, wTot + wMoy + wRang, rh, "F");
      doc.setTextColor(...SOURDINE); doc.setFont("helvetica", "normal"); doc.setFontSize(8);
      doc.text(String(i + k + 1), xN + wN / 2, y + rh / 2, { align: "center", baseline: "middle" });
      doc.setTextColor(...TEXTE); doc.setFont("helvetica", "bold");
      doc.text(ajuster(doc, String(l.e.nom || ""), wNom - 3, 8.4, 5.5), xNom + 2, y + rh / 2, { baseline: "middle" });
      doc.setFont("helvetica", "normal");
      doc.text(ajuster(doc, String(l.e.prenom || ""), wPre - 3, 8.4, 5.5), xPre + 2, y + rh / 2, { baseline: "middle" });
      cols.forEach((c, j) => {
        const t = l.val[j];
        if (!t) return;
        doc.setFont("helvetica", c.t === "n" ? "normal" : "bold");
        doc.setTextColor(...(c.t === "n" ? TEXTE : MARINE));
        doc.text(reduire(t, c.w - 0.5, 8.2, 3.6), xC0 + c.x + c.w / 2, y + rh / 2, { align: "center", baseline: "middle" });
      });
      doc.setFont("helvetica", "bold"); doc.setFontSize(8.4);
      if (l.total !== null) { doc.setTextColor(...TEXTE); doc.text(virg(l.total), xTot + wTot / 2, y + rh / 2, { align: "center", baseline: "middle" }); }
      if (l.moy !== null) { doc.setTextColor(...MARINE); doc.text(virg(l.moy), xMoy + wMoy / 2, y + rh / 2, { align: "center", baseline: "middle" }); doc.text(String(tries.indexOf(l.moy) + 1), xRang + wRang / 2, y + rh / 2, { align: "center", baseline: "middle" }); }
    });

    // -- traits
    doc.setDrawColor(...LIGNE); doc.setLineWidth(0.15);
    for (let k = 0; k <= bloc.length; k++) doc.line(X0, yC + k * rh, xFin, yC + k * rh);
    doc.line(xNom, yC, xNom, yFin); doc.line(xPre, yC, xPre, yFin);
    cols.forEach((c) => { doc.line(xC0 + c.x, yD, xC0 + c.x, yFin); });
    doc.line(xTot, yD, xTot, yFin);
    doc.line(xMoy, yD, xMoy, yFin); doc.line(xRang, yD, xRang, yFin);
    // separations de matieres (moyen) et de categories (epais)
    doc.setDrawColor(...MARINE);
    cols.forEach((c, j) => {
      if (!c.finBloc || j === nc - 1) return;
      const xc = xC0 + c.x + c.w;
      const finCat = multi && c.t === "mc";
      doc.setLineWidth(finCat ? 0.9 : 0.4);
      doc.line(xc, finCat ? yT : yB, xc, yT + hTab);
    });
    doc.setLineWidth(0.9); doc.line(xC0, yT, xC0, yT + hTab); doc.line(xTot, yT, xTot, yT + hTab);
    doc.setLineWidth(0.6); doc.rect(X0, yT, largeurTab, hTab, "S");
    doc.setLineWidth(0.9); doc.line(X0, yC, xFin, yC);

    // -- legende
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.2); doc.setTextColor(...SOURDINE);
    doc.text(leg, L, yFin + 4);
    pied(doc, W, H, M, st, "");
    i += bloc.length;
  } while (i < calc.length);
}

/**
 * p.type : "palmares" | "ensemble" ; mode : "download" | "print". Retourne true si OK.
 * palmares : { eleves, nbControles, classe, salle, annee }
 * ensemble : { grille, base, classe, salle, annee, titrePeriode, remplir }
 */
export async function creerPalmaresPdf(p) {
  const Ctor = p.JsPDF || (await import("jspdf")).jsPDF;
  const w = p.mode === "print" ? window.open("", "_blank") : null;
  if (p.mode === "print" && !w) return false;
  const st = p.settings || {};
  const etab = {
    nom: st.nom_etablissement || "Établissement",
    details: [st.adresse, st.telephone ? "Tél : " + st.telephone : "", st.email].filter(Boolean).join("   •   ")
  };
  const ctx = { etab, logo: p.logo, classe: p.classe, salle: p.salle, annee: p.annee };
  const paysage = p.type === "ensemble";
  const doc = new Ctor({ orientation: paysage ? "landscape" : "portrait", unit: "mm", format: formatJsPdf(p, paysage) });
  if (paysage) (utiliseBlocs(p.grille) ? dessinerEnsembleBlocs : dessinerEnsemble)(doc, { ...p, ctx, st }); else dessinerPalmares(doc, { ...p, ctx, st });
  ajouterTagWorlfinity(doc);
  if (p.mode === "print") w.location.href = URL.createObjectURL(doc.output("blob"));
  else doc.save(p.nomFichier + ".pdf");
  return true;
}
