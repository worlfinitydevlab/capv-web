import { ajouterTagWorlfinity } from "../pdfTag.js";
// PDF de l'espace Discipline (jsPDF, vectoriel) :
//  - creerCarnetsPdf : carnet de discipline (A5 par defaut, format configurable) avec QR de verification, un ou plusieurs eleves
//  - creerFeuilleClassePdf : feuille de surveillance par classe (eleves x fautes), a remplir a la main puis a saisir dans le systeme
import qrcode from "./qr.js";
import { contenuQr } from "./outils.js";

const CRIMSON = [91, 18, 32];
const TEXTE = [25, 28, 34];
const SOURDINE = [100, 108, 120];
const LIGNE = [160, 168, 180];
const ZEBRE = [247, 244, 245];

const hex = (h, def) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(h || ""));
  if (!m) return def || [100, 116, 139];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const clair = (c, t) => c.map((v) => Math.round(v + (255 - v) * t));
const jj = (iso) => { const s = String(iso || "").slice(0, 10).split("-"); return s.length === 3 ? s[2] + "/" + s[1] : ""; };
const jjmmaaaa = (iso) => { const s = String(iso || "").slice(0, 10).split("-"); return s.length === 3 ? s[2] + "/" + s[1] + "/" + s[0] : ""; };

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

function dessinerQr(doc, texte, x, y, taille) {
  const q = qrcode(0, "M");
  q.addData(texte);
  q.make();
  const n = q.getModuleCount();
  const quiet = 2; // zone de silence en modules
  const m = taille / (n + 2 * quiet);
  doc.setFillColor(255, 255, 255);
  doc.rect(x, y, taille, taille, "F");
  doc.setFillColor(0, 0, 0);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (q.isDark(r, c)) doc.rect(x + (c + quiet) * m, y + (r + quiet) * m, m + 0.02, m + 0.02, "F");
    }
  }
}

function coche(doc, x, y, w, h, couleur) {
  doc.setDrawColor(...couleur); doc.setLineWidth(0.5);
  doc.line(x + w * 0.22, y + h * 0.5, x + w * 0.42, y + h * 0.7);
  doc.line(x + w * 0.42, y + h * 0.7, x + w * 0.8, y + h * 0.28);
}

function sortie(doc, mode, nomFichier, w) {
  ajouterTagWorlfinity(doc, { bas: doc.__tagBas, taille: doc.__tagTaille });
  if (mode === "print") {
    const url = URL.createObjectURL(doc.output("blob"));
    w.location.href = url;
  } else {
    doc.save(nomFichier + ".pdf");
  }
  return true;
}

function infosEtab(settings) {
  const st = settings || {};
  return {
    nom: st.nom_etablissement || "Établissement",
    details: [st.adresse, st.telephone ? "Tél : " + st.telephone : "", st.email].filter(Boolean).join("   •   ")
  };
}

/* =====================================================================
   CARNET DE DISCIPLINE
   fiches : [{ eleve:{nom,prenom,matricule,nisu}, classe, salle, carnet:{numero,code_verif,motif,remplace_numero}, incidents:[{faute_uuid,date_incident,statut}] }]
   niveaux : discipline_niveaux ; fautes : [{id,numero,libelle,niveau_code,cases,actif}]
   ===================================================================== */
export async function creerCarnetsPdf({ fiches, niveaux, fautes, annee, settings, logo, reglages, nomFichier, mode, JsPDF }) {
  const Ctor = JsPDF || (await import("jspdf")).jsPDF;
  const w = mode === "print" ? window.open("", "_blank") : null;
  if (mode === "print" && !w) return false;
  const rg = reglages || {};
  const W = Math.min(Math.max(Number(rg.carnet_largeur_mm) || 148, 60), 400);
  const H = Math.min(Math.max(Number(rg.carnet_hauteur_mm) || 210, 80), 500);
  const titre = (rg.titre_carnet || "CARNET DE DISCIPLINE").toUpperCase();
  const k = Math.min(W / 148, H / 210);
  const doc = new Ctor({ orientation: W > H ? "landscape" : "portrait", unit: "mm", format: [Math.min(W, H), Math.max(W, H)] });
  const etab = infosEtab(settings);
  const M = 9 * k, L = M, R = W - M, CW = R - L, cx = W / 2;
  doc.__tagBas = M - 1.5 * k; doc.__tagTaille = Math.max(4.2, 5 * k);
  const fs = (n) => Math.max(5, n * k);
  const fautesActives = fautes.filter((f) => f.actif);
  const niv = niveaux.slice().sort((a, b) => (a.ordre || 0) - (b.ordre || 0));
  const pagesMeta = []; // { debut, fin, fiche } pour les pieds de page
  let premiere = true;

  const nouvellePage = () => { if (premiere) premiere = false; else doc.addPage(); return doc.getNumberOfPages(); };

  fiches.forEach((fiche) => {
    const { eleve, carnet } = fiche;
    const nomEleve = [eleve.nom, eleve.prenom].filter(Boolean).join(" ");
    const duplicata = /-D\d+$/.test(String(carnet.numero));
    const debut = nouvellePage();

    /* ---------- couverture ---------- */
    doc.setDrawColor(...CRIMSON); doc.setLineWidth(0.9 * k); doc.rect(M * 0.6, M * 0.6, W - 1.2 * M, H - 1.2 * M);
    doc.setLineWidth(0.25); doc.rect(M * 0.6 + 1.4, M * 0.6 + 1.4, W - 1.2 * M - 2.8, H - 1.2 * M - 2.8);
    let y = M + 4 * k;
    if (logo) {
      const hh = 22 * k, ww = Math.min(34 * k, hh * logo.ratio), h2 = ww / logo.ratio > hh ? hh : ww / logo.ratio;
      try { doc.addImage(logo.data, logo.fmt, cx - ww / 2, y, ww, h2); y += h2 + 4 * k; } catch (er) { y += 2; }
    }
    doc.setTextColor(...TEXTE); doc.setFont("times", "bolditalic");
    doc.text(ajuster(doc, etab.nom, CW - 6, fs(17), 9), cx, y + 5 * k, { align: "center" });
    y += 9 * k;
    if (etab.details) {
      doc.setFont("helvetica", "normal"); doc.setTextColor(...SOURDINE);
      doc.text(ajuster(doc, etab.details, CW - 6, fs(7.5), 5), cx, y, { align: "center" });
      y += 6 * k;
    }
    y += 5 * k;
    doc.setFillColor(...CRIMSON); doc.rect(L, y, CW, 15 * k, "F");
    doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setCharSpace(1.1);
    doc.text(ajuster(doc, titre, CW - 8, fs(17), 8), cx, y + 9.8 * k, { align: "center" });
    doc.setCharSpace(0);
    y += 15 * k + 7 * k;
    doc.setTextColor(...CRIMSON); doc.setFont("helvetica", "bold"); doc.setFontSize(fs(11));
    doc.text("Année scolaire " + annee, cx, y, { align: "center" });
    y += 9 * k;

    const champ = (lab, val, grand) => {
      doc.setFont("helvetica", "bold"); doc.setFontSize(fs(7.5)); doc.setTextColor(...SOURDINE);
      doc.text(lab, L + 2, y);
      doc.setFont("helvetica", "bold"); doc.setTextColor(...TEXTE);
      doc.text(ajuster(doc, String(val || "-"), CW - 4, grand ? fs(15) : fs(11.5), 7), L + 2, y + (grand ? 6.4 : 5.2) * k);
      doc.setDrawColor(...LIGNE); doc.setLineWidth(0.2); doc.line(L, y + (grand ? 8.4 : 7.2) * k, R, y + (grand ? 8.4 : 7.2) * k);
      y += (grand ? 14.6 : 13) * k;
    };
    champ("NOM ET PRÉNOM(S) DE L'ÉLÈVE", nomEleve, true);
    champ("MATRICULE", eleve.matricule);
    champ("NISU", eleve.nisu);
    champ("CLASSE", (fiche.classe || "-") + (fiche.salle ? "  -  " + fiche.salle : ""));
    champ("NUMÉRO DU CARNET", carnet.numero);

    if (duplicata) {
      y += 1 * k;
      doc.setFillColor(254, 226, 226); doc.setDrawColor(185, 28, 28); doc.setLineWidth(0.4);
      doc.roundedRect(L, y, CW, 13 * k, 1.5, 1.5, "FD");
      doc.setTextColor(153, 27, 27); doc.setFont("helvetica", "bold"); doc.setFontSize(fs(10));
      doc.text("DUPLICATA", cx, y + 5.2 * k, { align: "center" });
      doc.setFont("helvetica", "normal"); doc.setFontSize(fs(7));
      const rem = carnet.remplace_numero ? "Remplace le carnet " + carnet.remplace_numero + " déclaré perdu." : "Remplace un carnet déclaré perdu.";
      doc.text(ajuster(doc, rem, CW - 6, fs(7), 5), cx, y + 9.6 * k, { align: "center" });
      y += 15 * k;
    }

    // QR de verification en bas de page
    const tq = 30 * k;
    const yq = Math.max(y + 3 * k, H - M - tq - 13 * k);
    dessinerQr(doc, contenuQr(carnet), cx - tq / 2, yq, tq);
    doc.setDrawColor(...LIGNE); doc.setLineWidth(0.2); doc.rect(cx - tq / 2, yq, tq, tq);
    doc.setTextColor(...SOURDINE); doc.setFont("helvetica", "normal"); doc.setFontSize(fs(6.8));
    doc.text("Code de vérification : " + carnet.code_verif, cx, yq + tq + 4 * k, { align: "center" });
    doc.setFontSize(fs(6.2));
    doc.text("Ce carnet est enregistré dans le système de l'école et peut être vérifié à tout moment.", cx, yq + tq + 7.6 * k, { align: "center" });

    /* ---------- page 2 : mode d'emploi ---------- */
    nouvellePage();
    let y2 = M + 2 * k;
    doc.setFillColor(...CRIMSON); doc.rect(L, y2, CW, 9 * k, "F");
    doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(fs(11)); doc.setCharSpace(0.6);
    doc.text("À LIRE ATTENTIVEMENT", cx, y2 + 6.1 * k, { align: "center" }); doc.setCharSpace(0);
    y2 += 14 * k;
    const regles = [
      "L'élève garde ce carnet sur lui en permanence et le présente à tout membre du personnel qui le demande.",
      "Chaque fois qu'une faute est constatée, la Direction ou le responsable de la discipline coche la case suivante de la faute concernée et inscrit la date.",
      "Le parent ou tuteur prend connaissance du carnet et le signe régulièrement.",
      "Lorsque toutes les cases d'une faute sont cochées, la mesure prévue par l'école est appliquée (tableau ci-dessous).",
      "En cas de perte, prévenir immédiatement l'administration : l'école conserve le registre de l'élève et établit un duplicata qui reprend toutes les cases déjà cochées."
    ];
    doc.setTextColor(...TEXTE);
    regles.forEach((t, i) => {
      doc.setFont("helvetica", "bold"); doc.setFontSize(fs(9)); doc.setTextColor(...CRIMSON);
      doc.text(String(i + 1) + ".", L + 1, y2);
      doc.setFont("helvetica", "normal"); doc.setFontSize(fs(8.6)); doc.setTextColor(...TEXTE);
      const lignes = doc.splitTextToSize(t, CW - 9);
      doc.text(lignes, L + 7, y2);
      y2 += lignes.length * 4.1 * k + 2.4 * k;
    });
    y2 += 2 * k;
    // tableau des niveaux
    const wA = 38 * k, wB = 22 * k, wC = CW - wA - wB;
    doc.setFillColor(...clair(CRIMSON, 0.85)); doc.rect(L, y2, CW, 7 * k, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(fs(7.5)); doc.setTextColor(...CRIMSON);
    doc.text("Niveau de gravité", L + 2, y2 + 4.7 * k); doc.text("Cases", L + wA + wB / 2, y2 + 4.7 * k, { align: "center" }); doc.text("Mesure quand toutes les cases sont cochées", L + wA + wB + 2, y2 + 4.7 * k);
    y2 += 7 * k;
    niv.forEach((n) => {
      const col = hex(n.couleur);
      const txt = doc.splitTextToSize(n.action || "Selon décision de la Direction", wC - 4);
      const hh = Math.max(8 * k, txt.length * 3.8 * k + 3 * k);
      doc.setFillColor(...col); doc.rect(L, y2, 2.6 * k, hh, "F");
      doc.setDrawColor(...LIGNE); doc.setLineWidth(0.2); doc.rect(L, y2, CW, hh);
      doc.setFont("helvetica", "bold"); doc.setFontSize(fs(8)); doc.setTextColor(...TEXTE);
      doc.text(ajuster(doc, n.nom, wA - 6, fs(8), 5.5), L + 5, y2 + hh / 2, { baseline: "middle" });
      doc.text(String(n.nb_cases), L + wA + wB / 2, y2 + hh / 2, { align: "center", baseline: "middle" });
      doc.setFont("helvetica", "normal"); doc.setFontSize(fs(7.8));
      doc.text(txt, L + wA + wB + 2, y2 + 4.4 * k);
      y2 += hh;
    });
    // signatures
    y2 = Math.max(y2 + 10 * k, H - M - 50 * k);
    const lig = (lab, x, largeur) => {
      doc.setFont("helvetica", "bold"); doc.setFontSize(fs(8)); doc.setTextColor(...TEXTE);
      doc.text(lab, x, y2);
      doc.setDrawColor(...SOURDINE); doc.setLineWidth(0.25); doc.line(x, y2 + 9 * k, x + largeur, y2 + 9 * k);
    };
    const demi = (CW - 8 * k) / 2;
    lig("Nom du parent / tuteur", L, demi); lig("Signature du parent / tuteur", L + demi + 8 * k, demi);
    y2 += 20 * k;
    lig("Date de prise de connaissance", L, demi); lig("Visa de la Direction", L + demi + 8 * k, demi);

    /* ---------- pages des fautes ---------- */
    const hHaut = 14 * k, hBas = 9 * k;
    const caseZone = 66 * k, wNum = 7 * k, wLib = CW - wNum - caseZone - 1;
    const rowBase = 14.5 * k;
    const groupes = {};
    (fiche.incidents || []).filter((i) => i.statut === "valide").forEach((i) => { (groupes[i.faute_uuid] = groupes[i.faute_uuid] || []).push(i); });
    Object.values(groupes).forEach((l) => l.sort((a, b) => String(a.date_incident).localeCompare(String(b.date_incident)) || String(a.created_at || "").localeCompare(String(b.created_at || ""))));

    const enteteGrille = () => {
      nouvellePage();
      doc.setFillColor(...CRIMSON); doc.rect(0, 0, W, 2.4 * k, "F");
      doc.setTextColor(...CRIMSON); doc.setFont("helvetica", "bold"); doc.setFontSize(fs(9.5));
      doc.text(ajuster(doc, nomEleve, CW - 24 * k, fs(9.5), 6), L, M + 1 * k);
      doc.setFont("helvetica", "normal"); doc.setFontSize(fs(7)); doc.setTextColor(...SOURDINE);
      doc.text("Carnet " + carnet.numero + (duplicata ? "  -  DUPLICATA" : "") + "   |   " + (fiche.classe || "") + "   |   " + annee, L, M + 5 * k);
      dessinerQr(doc, contenuQr(carnet), R - 13 * k, M - 4 * k, 13 * k);
      return M + hHaut;
    };
    let yg = enteteGrille();
    const bas = H - M - hBas;

    niv.forEach((n) => {
      const fs_n = fautesActives.filter((f) => f.niveau_code === n.code).sort((a, b) => a.numero - b.numero);
      if (!fs_n.length) return;
      const col = hex(n.couleur);
      // hauteur necessaire au niveau complet
      const lignesDe = (f) => doc.splitTextToSize(f.libelle, wLib - 2);
      const hauteurFaute = (f) => {
        const total = Math.max(f.cases, (groupes[f.id] || []).length);
        const parLigne = Math.max(1, Math.floor(caseZone / (6.4 * k)));
        const nl = Math.ceil(total / parLigne);
        doc.setFont("helvetica", "normal"); doc.setFontSize(fs(8));
        return Math.max(rowBase * nl, lignesDe(f).length * 3.5 * k + 4 * k);
      };
      const besoin = 8.5 * k + fs_n.reduce((s, f) => s + hauteurFaute(f), 0);
      if (yg + besoin > bas && yg > M + hHaut + 1) yg = enteteGrille();

      const bandeau = (suite) => {
        doc.setFillColor(...col); doc.rect(L, yg, CW, 7 * k, "F");
        doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(fs(8.5));
        doc.text(n.nom.toUpperCase() + (suite ? " (suite)" : "") + "  -  " + n.nb_cases + " cases", L + 2, yg + 4.8 * k);
        yg += 7.5 * k;
      };
      bandeau(false);
      fs_n.forEach((f) => {
        const hh = hauteurFaute(f);
        if (yg + hh > bas) { yg = enteteGrille(); bandeau(true); }
        const lib = lignesDe(f);
        doc.setDrawColor(...LIGNE); doc.setLineWidth(0.2); doc.rect(L, yg, CW, hh);
        doc.setFillColor(...clair(col, 0.82)); doc.rect(L, yg, wNum, hh, "F"); doc.rect(L, yg, wNum, hh, "S");
        doc.setFont("helvetica", "bold"); doc.setFontSize(fs(9)); doc.setTextColor(...TEXTE);
        doc.text(String(f.numero), L + wNum / 2, yg + hh / 2, { align: "center", baseline: "middle" });
        doc.setFont("helvetica", "normal"); doc.setFontSize(fs(8));
        doc.text(lib, L + wNum + 1.6, yg + hh / 2 - ((lib.length - 1) * 3.5 * k) / 2 + 1.1, { baseline: "middle" });
        // cases
        const lst = groupes[f.id] || [];
        const total = Math.max(f.cases, lst.length);
        const parLigne = Math.max(1, Math.floor(caseZone / (6.4 * k)));
        const nl = Math.ceil(total / parLigne);
        const perRow = Math.ceil(total / nl);
        const cw = Math.min(13 * k, caseZone / perRow);
        const ch = (hh - 2.4 * k) / nl;
        const x0 = L + wNum + wLib + 1;
        for (let c = 0; c < total; c++) {
          const rr = Math.floor(c / perRow), cc = c % perRow;
          const bx = x0 + cc * cw, by = yg + 1.2 * k + rr * ch;
          const inc = lst[c];
          if (inc) {
            doc.setFillColor(...clair(col, 0.78)); doc.setDrawColor(...col); doc.setLineWidth(0.3); doc.rect(bx, by, cw, ch, "FD");
            coche(doc, bx, by - 0.8, cw, ch, col);
            doc.setFont("helvetica", "bold"); doc.setFontSize(fs(5.8)); doc.setTextColor(...TEXTE);
            doc.text(jj(inc.date_incident), bx + cw / 2, by + ch - 1.1, { align: "center" });
          } else {
            const hors = c >= f.cases;
            doc.setFillColor(255, 255, 255); doc.setDrawColor(...LIGNE); doc.setLineWidth(0.25); doc.rect(bx, by, cw, ch, "FD");
            doc.setFont("helvetica", "normal"); doc.setFontSize(fs(5.5)); doc.setTextColor(...(hors ? col : SOURDINE));
            doc.text(String(c + 1), bx + 0.9, by + 2.2);
          }
        }
        yg += hh;
      });
      yg += 4 * k;
    });

    /* ---------- derniere page : suivi par la Direction ---------- */
    nouvellePage();
    let ys = M + 2 * k;
    doc.setFillColor(...CRIMSON); doc.rect(L, ys, CW, 9 * k, "F");
    doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(fs(10.5)); doc.setCharSpace(0.5);
    doc.text("SUIVI PAR LA DIRECTION", cx, ys + 6 * k, { align: "center" }); doc.setCharSpace(0);
    ys += 12 * k;
    const cols = [22 * k, 14 * k, CW - 22 * k - 14 * k - 26 * k, 26 * k];
    const heads = ["Date", "Faute n°", "Mesure prise / observation", "Visa parent"];
    doc.setFillColor(...clair(CRIMSON, 0.85)); doc.rect(L, ys, CW, 7 * k, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(fs(7.5)); doc.setTextColor(...CRIMSON);
    let xx = L;
    heads.forEach((t, i) => { doc.text(t, xx + cols[i] / 2, ys + 4.7 * k, { align: "center" }); xx += cols[i]; });
    ys += 7 * k;
    const hl = 10.5 * k;
    while (ys + hl <= H - M - hBas) {
      doc.setDrawColor(...LIGNE); doc.setLineWidth(0.2);
      xx = L;
      cols.forEach((cw2) => { doc.rect(xx, ys, cw2, hl); xx += cw2; });
      ys += hl;
    }
    const fin = doc.getNumberOfPages();
    pagesMeta.push({ debut, fin, nomEleve, numero: carnet.numero, duplicata });
  });

  // pieds de page : numero du carnet et pagination par carnet
  pagesMeta.forEach((m) => {
    for (let p = m.debut; p <= m.fin; p++) {
      doc.setPage(p);
      if (p === m.debut) continue; // pas de pied de page sur la couverture
      doc.setFont("helvetica", "normal"); doc.setFontSize(fs(6.5)); doc.setTextColor(...SOURDINE);
      doc.text(m.numero + (m.duplicata ? "  (duplicata)" : ""), L, H - M + 1.5 * k);
      doc.text("Page " + (p - m.debut + 1) + " / " + (m.fin - m.debut + 1), R, H - M + 1.5 * k, { align: "right" });
    }
  });
  return sortie(doc, mode, nomFichier, w);
}

/* =====================================================================
   FEUILLE DE SURVEILLANCE PAR CLASSE (lettre US paysage, vierge)
   eleves : [{nom, prenom}] ; niveaux ; fautes (actives) ; classe, salle, annee
   ===================================================================== */
export async function creerFeuilleClassePdf({ eleves, niveaux, fautes, classe, salle, annee, settings, logo, nomFichier, mode, JsPDF }) {
  const Ctor = JsPDF || (await import("jspdf")).jsPDF;
  const w = mode === "print" ? window.open("", "_blank") : null;
  if (mode === "print" && !w) return false;
  const W = 279.4, H = 215.9, M = 8;
  const doc = new Ctor({ orientation: "landscape", unit: "mm", format: "letter" });
  const etab = infosEtab(settings);
  const L = M, R = W - M, CW = R - L, cx = W / 2;
  const niv = niveaux.slice().sort((a, b) => (a.ordre || 0) - (b.ordre || 0));
  const colonnes = [];
  niv.forEach((n) => fautes.filter((f) => f.actif && f.niveau_code === n.code).sort((a, b) => a.numero - b.numero).forEach((f) => colonnes.push({ f, n })));
  const nf = Math.max(1, colonnes.length);
  const wN = 7, wNom = 40, wPre = 36, wObs = 24;
  const wF = (CW - wN - wNom - wPre - wObs) / nf;
  const hL1 = 6, hL2 = 6.5, hRow = 6.6;

  // legende : fautes sur 3 colonnes
  const nLeg = Math.ceil(colonnes.length / 3);
  const hLeg = nLeg * 3.3 + 3;

  const entete = (page) => {
    let y = M;
    const logoH = 15;
    if (logo) {
      const ww = Math.min(26, logoH * logo.ratio), hh = ww / logo.ratio > logoH ? logoH : ww / logo.ratio;
      try { doc.addImage(logo.data, logo.fmt, L, y, ww, hh); } catch (er) { /* logo ignore */ }
    }
    doc.setTextColor(...TEXTE); doc.setFont("times", "bolditalic");
    doc.text(ajuster(doc, etab.nom, CW - 2 * 32, 18, 11), cx, y + 6, { align: "center" });
    doc.setFont("helvetica", "bold"); doc.setTextColor(...CRIMSON); doc.setCharSpace(1.1); doc.setFontSize(11);
    doc.text("FEUILLE DE SURVEILLANCE - DISCIPLINE", cx, y + 12, { align: "center" }); doc.setCharSpace(0);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...SOURDINE);
    if (etab.details) doc.text(ajuster(doc, etab.details, CW - 64, 8, 6), cx, y + 16.2, { align: "center" });
    y += logoH + 2;
    doc.setDrawColor(...CRIMSON); doc.setLineWidth(0.7); doc.line(L, y, R, y);
    y += 5;
    doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(...TEXTE);
    doc.text("Classe : " + classe + (salle ? "  -  " + salle : ""), L, y);
    doc.text("Année scolaire : " + annee, cx, y, { align: "center" });
    doc.setTextColor(...CRIMSON); doc.text("Page " + page, R, y, { align: "right" });
    y += 5.6;
    const champ = (x, lab, larg) => {
      doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...TEXTE);
      const t = lab + " : "; doc.text(t, x, y);
      const lw = doc.getTextWidth(t);
      doc.setDrawColor(...SOURDINE); doc.setLineWidth(0.25); doc.line(x + lw, y + 0.7, x + lw + larg, y + 0.7);
      return lw + larg;
    };
    let x = L;
    x += champ(x, "Surveillant(e)", 70) + 10;
    x += champ(x, "Du", 26) + 4;
    x += champ(x, "au", 26) + 10;
    champ(x, "Date de remise", 32);
    return y + 4;
  };

  const legende = (yTop) => {
    doc.setFont("helvetica", "bold"); doc.setFontSize(6.8); doc.setTextColor(...CRIMSON);
    doc.text("Légende :", L, yTop + 2.2);
    doc.setFont("helvetica", "normal"); doc.setTextColor(...TEXTE); doc.setFontSize(6.4);
    const lw = (CW - 14) / 3;
    colonnes.forEach((c, i) => {
      const col = Math.floor(i / nLeg), row = i % nLeg;
      const x = L + 14 + col * lw, y = yTop + 2.2 + row * 3.3;
      doc.setFont("helvetica", "bold"); doc.setTextColor(...hex(c.n.couleur)); doc.text(String(c.f.numero), x, y);
      doc.setFont("helvetica", "normal"); doc.setTextColor(...TEXTE);
      doc.text(ajuster(doc, c.f.libelle, lw - 7, 6.4, 4.8), x + 4.6, y);
    });
    doc.setFont("helvetica", "normal"); doc.setFontSize(6.4); doc.setTextColor(...SOURDINE);
    doc.text("Mettre la date (jj/mm) ou une croix dans la case de la faute constatée. À saisir ensuite dans le système (Discipline > Saisie depuis la feuille).", L, yTop + hLeg + 1.6);
  };

  const lignes = eleves.slice();
  for (let i = 0; i < 2; i++) lignes.push(null); // lignes libres (eleves arrives en cours d'annee)
  let idx = 0, page = 0;
  do {
    if (page > 0) doc.addPage();
    page++;
    let y = entete(page);
    // en-tete du tableau
    doc.setLineWidth(0.25); doc.setDrawColor(...LIGNE);
    const x0 = L, xf = L + wN + wNom + wPre;
    doc.setFillColor(...clair(CRIMSON, 0.88));
    doc.rect(x0, y, wN + wNom + wPre, hL1 + hL2, "FD");
    doc.setFont("helvetica", "bold"); doc.setFontSize(7.6); doc.setTextColor(...CRIMSON);
    doc.text("N°", x0 + wN / 2, y + (hL1 + hL2) / 2, { align: "center", baseline: "middle" });
    doc.text("NOM", x0 + wN + wNom / 2, y + (hL1 + hL2) / 2, { align: "center", baseline: "middle" });
    doc.text("PRÉNOM", x0 + wN + wNom + wPre / 2, y + (hL1 + hL2) / 2, { align: "center", baseline: "middle" });
    // bandeaux de niveaux
    let cx2 = xf;
    niv.forEach((n) => {
      const cnt = colonnes.filter((c) => c.n.code === n.code).length;
      if (!cnt) return;
      const col = hex(n.couleur);
      doc.setFillColor(...col); doc.rect(cx2, y, cnt * wF, hL1, "FD");
      doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(6.6);
      const nomN = n.nom.toUpperCase();
      if (doc.getTextWidth(nomN) <= cnt * wF - 1.5) {
        doc.text(nomN, cx2 + (cnt * wF) / 2, y + hL1 / 2, { align: "center", baseline: "middle" });
      } else {
        doc.setFontSize(4.3);
        let lg = doc.splitTextToSize(nomN, cnt * wF - 0.8);
        if (lg.length > 2) { lg = lg.slice(0, 2); lg[1] = ajuster(doc, lg[1], cnt * wF - 0.8, 4.3, 3.2); doc.setFontSize(4.3); }
        const h0 = y + hL1 / 2 - ((lg.length - 1) * 2.1) / 2;
        lg.forEach((t, q) => doc.text(t, cx2 + (cnt * wF) / 2, h0 + q * 2.1, { align: "center", baseline: "middle" }));
      }
      cx2 += cnt * wF;
    });
    colonnes.forEach((c, i) => {
      const xx = xf + i * wF;
      doc.setFillColor(...clair(hex(c.n.couleur), 0.8)); doc.rect(xx, y + hL1, wF, hL2, "FD");
      doc.setTextColor(...TEXTE); doc.setFont("helvetica", "bold"); doc.setFontSize(8);
      doc.text(String(c.f.numero), xx + wF / 2, y + hL1 + hL2 / 2, { align: "center", baseline: "middle" });
    });
    doc.setFillColor(...clair(CRIMSON, 0.88)); doc.rect(xf + nf * wF, y, wObs, hL1 + hL2, "FD");
    doc.setTextColor(...CRIMSON); doc.setFontSize(7.6);
    doc.text("OBSERVATIONS", xf + nf * wF + wObs / 2, y + (hL1 + hL2) / 2, { align: "center", baseline: "middle" });
    y += hL1 + hL2;
    const yMax = H - M - hLeg - 7;
    while (idx < lignes.length && y + hRow <= yMax) {
      const e = lignes[idx];
      if (idx % 2 === 1) { doc.setFillColor(...ZEBRE); doc.rect(x0, y, CW, hRow, "F"); }
      doc.setDrawColor(...LIGNE); doc.setLineWidth(0.2);
      let xx = x0;
      [wN, wNom, wPre].forEach((cw) => { doc.rect(xx, y, cw, hRow); xx += cw; });
      for (let c = 0; c < nf; c++) { doc.rect(xx, y, wF, hRow); xx += wF; }
      doc.rect(xx, y, wObs, hRow);
      doc.setTextColor(...TEXTE); doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.text(String(idx + 1), x0 + wN / 2, y + hRow / 2, { align: "center", baseline: "middle" });
      if (e) {
        doc.setFontSize(8.6);
        doc.text(ajuster(doc, (e.nom || "").toUpperCase(), wNom - 2, 8.6, 5.5), x0 + wN + 1.2, y + hRow / 2, { baseline: "middle" });
        doc.text(ajuster(doc, e.prenom || "", wPre - 2, 8.6, 5.5), x0 + wN + wNom + 1.2, y + hRow / 2, { baseline: "middle" });
      }
      y += hRow; idx++;
    }
    legende(H - M - hLeg - 2);
  } while (idx < lignes.length);

  return sortie(doc, mode, nomFichier, w);
}

export { jjmmaaaa };
