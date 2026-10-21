import { ajouterTagWorlfinity } from "../pdfTag.js";
import { tailleFeuille, formatJsPdf } from "./papier.js";
// Cahier de presence (journal d'appel) en PDF vectoriel (jsPDF) : lettre US paysage, VIERGE (aucune date).
// En-tete centre (logo + nom de l'etablissement), titulaire + intervalle a remplir, 5 semaines par page (un mois) + totaux Absences / Retards,
// traits epais entre les semaines.

const MARINE = [22, 52, 92];
const MARINE2 = [48, 84, 130];
const CLAIR = [232, 238, 246];
const CLAIR2 = [214, 224, 238];
const LIGNE = [165, 174, 188];
const ZEBRE = [247, 249, 252];
const TEXTE = [25, 28, 34];
const SOURDINE = [95, 104, 118];
const JOURS = ["L", "M", "M", "J", "V"];

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

function champVide(doc, x, y, etiquette, largeur) {
  doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(...TEXTE);
  const lab = etiquette + " : ";
  const lw = doc.getTextWidth(lab);
  doc.text(lab, x, y);
  doc.setDrawColor(...SOURDINE); doc.setLineWidth(0.25);
  doc.line(x + lw, y + 0.7, x + lw + largeur, y + 0.7);
  return lw + largeur;
}

function entete(doc, W, M, ctx, numeroPage) {
  const { etab, logo, classe, salle, annee } = ctx;
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
  doc.text("CAHIER DE PRÉSENCE", cx, y + 13.6, { align: "center" });
  doc.setCharSpace(0);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...SOURDINE);
  if (etab.details) doc.text(ajuster(doc, etab.details, largeurTexte, 8.5, 6), cx, y + 18.2, { align: "center" });
  y += logoH + 2;
  doc.setDrawColor(...MARINE); doc.setLineWidth(0.8); doc.line(L, y, R, y);
  doc.setLineWidth(0.25); doc.line(L, y + 1.2, R, y + 1.2);
  y += 5.4;

  // ligne d'informations : classe / annee / page
  doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...TEXTE);
  const txtClasse = "Classe : " + classe + (salle ? "  -  " + salle : "");
  doc.text(txtClasse, L, y);
  doc.text("Année scolaire : " + annee, cx, y, { align: "center" });
  doc.setTextColor(...MARINE);
  doc.text("Page " + numeroPage, R, y, { align: "right" });
  y += 5.6;
  // titulaire + intervalle (a remplir)
  let x = L;
  x += champVide(doc, x, y, "Titulaire", 78) + 10;
  const x2 = x;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(...TEXTE);
  doc.text("Intervalle : du", x2, y);
  let xx = x2 + doc.getTextWidth("Intervalle : du ");
  doc.setDrawColor(...SOURDINE); doc.setLineWidth(0.25);
  doc.line(xx, y + 0.7, xx + 34, y + 0.7);
  xx += 34 + 2;
  doc.text("au", xx, y);
  xx += doc.getTextWidth("au ");
  doc.line(xx, y + 0.7, Math.min(R, xx + 34), y + 0.7);
  return y + 3.2;
}

/**
 * eleves : [{ nom, prenom }] ; np : nombre de pages de 5 semaines ; logo : { data, fmt, ratio } ou null
 * mode : "download" (enregistre le fichier) ou "print" (ouvre le PDF dans un onglet). Retourne true si OK.
 */
export async function creerCahierPdf({ eleves, np, classe, salle, annee, settings, logo, nomFichier, mode, JsPDF }) {
  const Ctor = JsPDF || (await import("jspdf")).jsPDF;
  const w = mode === "print" ? window.open("", "_blank") : null;
  if (mode === "print" && !w) return false;
  const { W, H } = tailleFeuille({ settings }, true), M = 8;
  const doc = new Ctor({ orientation: "landscape", unit: "mm", format: formatJsPdf({ settings }, true) });
  const st = settings || {};
  const etab = {
    nom: st.nom_etablissement || "Établissement",
    details: [st.adresse, st.telephone ? "Tél : " + st.telephone : "", st.email].filter(Boolean).join("   •   ")
  };
  const ctx = { etab, logo, classe, salle, annee };
  const L = M, R = W - M, CW = R - L;
  const wN = 9, wNom = 42.24, wPre = 38, wTot = 10; // colonne Nom reduite de 4 % (44 -> 42,24)
  const NS = 5; // semaines par page
  const wJour = (CW - wN - wNom - wPre - 2 * wTot) / (NS * 5);
  const hEnt1 = 6.4, hEnt2 = 5.2;
  let premiere = true, numero = 0;

  for (let p = 0; p < np; p++) {
    let i = 0;
    do {
      if (!premiere) doc.addPage(); premiere = false;
      numero++;
      const yT = entete(doc, W, M, ctx, numero) + 1.2;
      const bas = H - M - 8.5;
      const dispo = bas - yT - hEnt1 - hEnt2;
      const parPage = Math.max(1, Math.floor(dispo / 4.6));
      const bloc = eleves.slice(i, i + parPage);
      const rh = Math.min(8.4, Math.max(4.6, dispo / Math.max(1, bloc.length)));
      const hTab = hEnt1 + hEnt2 + bloc.length * rh;
      const xN = L, xNom = xN + wN, xPre = xNom + wNom, x0 = xPre + wPre, xT = x0 + NS * 5 * wJour;

      // en-tetes
      doc.setFillColor(...MARINE); doc.rect(L, yT, wN + wNom + wPre, hEnt1 + hEnt2, "F");
      doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(8.6);
      doc.text("N°", xN + wN / 2, yT + (hEnt1 + hEnt2) / 2, { align: "center", baseline: "middle" });
      doc.text("NOM", xNom + 2, yT + (hEnt1 + hEnt2) / 2, { baseline: "middle" });
      doc.text("PRÉNOM", xPre + 2, yT + (hEnt1 + hEnt2) / 2, { baseline: "middle" });
      for (let s = 0; s < NS; s++) {
        const xs = x0 + s * 5 * wJour;
        doc.setFillColor(...(s % 2 === 0 ? MARINE : MARINE2)); doc.rect(xs, yT, 5 * wJour, hEnt1, "F");
        doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(8.4);
        doc.text("SEMAINE " + (p * NS + s + 1), xs + 2.5 * wJour, yT + hEnt1 / 2, { align: "center", baseline: "middle" });
        doc.setFillColor(...(s % 2 === 0 ? CLAIR : CLAIR2)); doc.rect(xs, yT + hEnt1, 5 * wJour, hEnt2, "F");
        doc.setTextColor(...MARINE); doc.setFontSize(8.4);
        for (let j = 0; j < 5; j++) doc.text(JOURS[j], xs + (j + 0.5) * wJour, yT + hEnt1 + hEnt2 / 2, { align: "center", baseline: "middle" });
      }

      // colonnes de totaux du mois : Absences et Retards (a remplir a la main)
      doc.setFillColor(...MARINE); doc.rect(xT, yT, 2 * wTot, hEnt1, "F");
      doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(8.4);
      doc.text("TOTAL", xT + wTot, yT + hEnt1 / 2, { align: "center", baseline: "middle" });
      doc.setFillColor(...CLAIR2); doc.rect(xT, yT + hEnt1, 2 * wTot, hEnt2, "F");
      doc.setTextColor(...MARINE); doc.setFontSize(7.6);
      doc.text("ABS.", xT + wTot / 2, yT + hEnt1 + hEnt2 / 2, { align: "center", baseline: "middle" });
      doc.text("RET.", xT + 1.5 * wTot, yT + hEnt1 + hEnt2 / 2, { align: "center", baseline: "middle" });

      // lignes
      const yC = yT + hEnt1 + hEnt2;
      bloc.forEach((e, k) => {
        const y = yC + k * rh;
        if (k % 2 === 1) { doc.setFillColor(...ZEBRE); doc.rect(L, y, CW, rh, "F"); }
        doc.setTextColor(...SOURDINE); doc.setFont("helvetica", "normal"); doc.setFontSize(8);
        doc.text(String(i + k + 1), xN + wN / 2, y + rh / 2, { align: "center", baseline: "middle" });
        doc.setTextColor(...TEXTE); doc.setFont("helvetica", "bold");
        doc.text(ajuster(doc, String(e.nom || ""), wNom - 3, 8.6, 5.5), xNom + 2, y + rh / 2, { baseline: "middle" });
        doc.setFont("helvetica", "normal");
        doc.text(ajuster(doc, String(e.prenom || ""), wPre - 3, 8.6, 5.5), xPre + 2, y + rh / 2, { baseline: "middle" });
      });

      // quadrillage fin
      doc.setDrawColor(...LIGNE); doc.setLineWidth(0.15);
      for (let k = 0; k <= bloc.length; k++) doc.line(L, yC + k * rh, R, yC + k * rh);
      doc.line(xNom, yT + hEnt1 + hEnt2, xNom, yC + bloc.length * rh);
      doc.line(xPre, yT + hEnt1 + hEnt2, xPre, yC + bloc.length * rh);
      for (let c = 0; c <= NS * 5; c++) { const xc = x0 + c * wJour; doc.line(xc, yT + hEnt1, xc, yC + bloc.length * rh); }
      doc.line(xT + wTot, yT + hEnt1, xT + wTot, yC + bloc.length * rh); // separation Absences / Retards
      // traits epais entre les semaines + contour
      doc.setDrawColor(...MARINE); doc.setLineWidth(0.9);
      for (let s = 0; s <= NS; s++) { const xs = x0 + s * 5 * wJour; doc.line(xs, yT, xs, yT + hTab); }
      doc.setLineWidth(0.6);
      doc.rect(L, yT, CW, hTab, "S");
      doc.line(xPre, yT, xPre, yT + hTab);
      doc.line(L, yC, R, yC);
      doc.setLineWidth(0.9); doc.line(L, yT + hEnt1 + hEnt2, R, yT + hEnt1 + hEnt2);

      // legende + pied
      doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...SOURDINE);
      doc.text("P = présent     R = retard     A = absent     J = absence justifiée     |     TOTAL : à remplir en fin de mois", L, H - M + 1);
      if (st.nom_etablissement) { doc.setFont("times", "italic"); doc.text(st.nom_etablissement, R, H - M + 1, { align: "right" }); }
      i += bloc.length;
    } while (i < eleves.length);
  }

  ajouterTagWorlfinity(doc);
  if (mode === "print") {
    const url = URL.createObjectURL(doc.output("blob"));
    w.location.href = url;
  } else {
    doc.save(nomFichier + ".pdf");
  }
  return true;
}
