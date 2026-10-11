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
  const W = 215.9, H = 279.4, M = 8, L = M, R = W - M, CW = R - L;
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
  const W = 279.4, H = 215.9, M = 8, L = M, R = W - M, CW = R - L;
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
  const doc = new Ctor({ orientation: paysage ? "landscape" : "portrait", unit: "mm", format: "letter" });
  if (paysage) dessinerEnsemble(doc, { ...p, ctx, st }); else dessinerPalmares(doc, { ...p, ctx, st });
  if (p.mode === "print") w.location.href = URL.createObjectURL(doc.output("blob"));
  else doc.save(p.nomFichier + ".pdf");
  return true;
}
