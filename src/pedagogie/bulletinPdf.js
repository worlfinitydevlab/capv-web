// Bulletin eleve en PDF vectoriel (jsPDF) : en-tete (logo + infos de l'etablissement), categories en blocs,
// totaux, moyenne, retard / absence, remarques, signatures. Format A5 par defaut (dimensions fournies par l'appelant).
// Un seul rendu sert a l'impression ET au telechargement.

const MARINE = [22, 52, 92];
const MARINE_CLAIR = [232, 238, 246];
const GRIS_LIGNE = [170, 178, 190];
const ZEBRE = [247, 249, 252];
const TEXTE = [25, 28, 34];
const SOURDINE = [95, 104, 118];

const f2 = (v) => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? "-" : (Math.round(Number(v) * 100) / 100).toString());
const moy = (v) => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? "-" : (Math.round(Number(v) * 100) / 100).toFixed(2));

/* Charge le logo (URL ou data:) -> { data, fmt, ratio } ou null. Navigateur uniquement. */
export async function chargerLogo(url) {
  try {
    if (!url) return null;
    let du = url;
    if (!/^data:/.test(url)) {
      const r = await fetch(url);
      if (!r.ok) return null;
      const blob = await r.blob();
      du = await new Promise((ok, ko) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = ko; fr.readAsDataURL(blob); });
    }
    const fmt = /^data:image\/png/.test(du) ? "PNG" : /^data:image\/jpe?g/.test(du) ? "JPEG" : null;
    if (!fmt) return null;
    const dim = await new Promise((ok) => { const i = new Image(); i.onload = () => ok({ w: i.width, h: i.height }); i.onerror = () => ok(null); i.src = du; });
    return dim && dim.w && dim.h ? { data: du, fmt, ratio: dim.w / dim.h } : null;
  } catch (e) { return null; }
}

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

function dessinerPage(doc, W, H, M, s, ctx) {
  const { eleve: e, data, contexte, etab, logo, nbEleves } = ctx;
  const L = M, R = W - M, CW = R - L;
  doc.setTextColor(...TEXTE);

  /* ---------- 1. En-tete ---------- */
  let y = M;
  const logoH = 21 * s;
  let xTexte = L, largeurTexte = CW;
  if (logo) {
    const ww = Math.min(30 * s, logoH * logo.ratio);
    try { doc.addImage(logo.data, logo.fmt, L, y, ww, ww / logo.ratio > logoH ? logoH : ww / logo.ratio); } catch (er) { /* logo ignore */ }
    xTexte = L + ww + 3 * s; largeurTexte = CW - ww - 3 * s;
  }
  const cx = xTexte + largeurTexte / 2;
  doc.setFont("times", "bolditalic");
  let nom = ajuster(doc, etab.nom, largeurTexte, 17 * s, 10 * s);
  doc.text(nom, cx, y + 6.2 * s, { align: "center" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(9.5 * s); doc.setTextColor(...MARINE);
  const titre = "BULLETIN SCOLAIRE" + (contexte.periode ? "  •  " + contexte.periode : "");
  doc.setFont("helvetica", "bold");
  doc.text(ajuster(doc, titre.toUpperCase(), largeurTexte, 9.5 * s, 6 * s), cx, y + 11.8 * s, { align: "center" });
  doc.setTextColor(...TEXTE); doc.setFont("helvetica", "bold"); doc.setFontSize(10.5 * s);
  doc.text(ajuster(doc, "Classe : " + contexte.classe, largeurTexte, 10.5 * s, 7 * s), cx, y + 16.8 * s, { align: "center" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(9 * s); doc.setTextColor(...SOURDINE);
  doc.text("Année scolaire : " + contexte.annee, cx, y + 21.2 * s, { align: "center" });
  y += Math.max(logoH, 22.5 * s) + 1.2 * s;
  // double filet
  doc.setDrawColor(...MARINE); doc.setLineWidth(0.7 * s); doc.line(L, y, R, y);
  doc.setLineWidth(0.2 * s); doc.line(L, y + 1.1 * s, R, y + 1.1 * s);
  y += 2.2 * s;
  if (etab.details) {
    doc.setFont("helvetica", "normal"); doc.setTextColor(...SOURDINE);
    doc.text(ajuster(doc, etab.details, CW, 7 * s, 5 * s), W / 2, y + 2.6 * s, { align: "center" });
    y += 4.6 * s;
  }
  y += 1.5 * s;

  /* ---------- 2. Bande eleve ---------- */
  const bandeH = 8.5 * s;
  doc.setFillColor(...MARINE_CLAIR); doc.setDrawColor(...MARINE_CLAIR);
  doc.roundedRect(L, y, CW, bandeH, 1.4 * s, 1.4 * s, "F");
  doc.setTextColor(...TEXTE);
  const gauche = L + 3 * s;
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5 * s); doc.setTextColor(...SOURDINE);
  doc.text("NOM", gauche, y + 3.3 * s);
  doc.text("PRÉNOM", L + CW * 0.46, y + 3.3 * s);
  doc.setFont("helvetica", "bold"); doc.setTextColor(...TEXTE);
  doc.text(ajuster(doc, String(e.nom || "").toUpperCase(), CW * 0.43 - 3 * s, 11 * s, 7 * s), gauche, y + 7.3 * s);
  doc.setFont("helvetica", "bold");
  doc.text(ajuster(doc, String(e.prenom || ""), CW * 0.36, 11 * s, 7 * s), L + CW * 0.46, y + 7.3 * s);
  if (e.rang) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5 * s); doc.setTextColor(...SOURDINE);
    doc.text("RANG", R - 3 * s, y + 3.3 * s, { align: "right" });
    doc.setFont("helvetica", "bold"); doc.setFontSize(11 * s); doc.setTextColor(...MARINE);
    doc.text(e.rang + " / " + nbEleves, R - 3 * s, y + 7.3 * s, { align: "right" });
  }
  y += bandeH + 2.6 * s;

  /* ---------- 3. Mise a l'echelle verticale du corps ---------- */
  const nbCat = data.categories.length;
  const nbMat = data.categories.reduce((a, k) => a + k.matieres.length, 0);
  const basBloc = 54 * s;                  // retard/absence + remarques + signatures + pied
  const totalBoxH = 2 * 7.4 * s + 2 * s;
  const lignesEq = nbMat + nbCat * 2.35;   // en-tete de categorie ~1.1 + bandeau de total ~1.25
  const dispo = H - M - basBloc - y - totalBoxH - nbCat * 2.2 * s;
  let rh = Math.max(3.4 * s, Math.min(6.4 * s, dispo / Math.max(1, lignesEq)));
  const fz = Math.min(9.5 * s, Math.max(6.2 * s, rh * 1.5));
  const colMax = 17 * s, colNote = 19 * s;
  const xMax = R - colMax, xNote = xMax - colNote;

  /* ---------- 4. Categories ---------- */
  for (const k of data.categories) {
    const hh = rh * 1.1;
    doc.setFillColor(...MARINE); doc.setDrawColor(...MARINE);
    doc.rect(L, y, CW, hh, "F");
    doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bolditalic");
    doc.text(ajuster(doc, String(k.nom).toUpperCase(), xNote - L - 4 * s, fz, 5.5 * s), L + 2 * s, y + hh / 2, { baseline: "middle" });
    doc.setFont("helvetica", "bold"); doc.setFontSize(fz * 0.82);
    doc.text("NOTE", xNote + colNote - 2 * s, y + hh / 2, { align: "right", baseline: "middle" });
    doc.text("MAX", R - 2 * s, y + hh / 2, { align: "right", baseline: "middle" });
    y += hh;
    doc.setTextColor(...TEXTE);
    k.matieres.forEach((m, i) => {
      if (i % 2 === 1) { doc.setFillColor(...ZEBRE); doc.rect(L, y, CW, rh, "F"); }
      doc.setDrawColor(...GRIS_LIGNE); doc.setLineWidth(0.15 * s);
      doc.line(L, y + rh, R, y + rh);
      doc.setFont("helvetica", "normal"); doc.setTextColor(...TEXTE);
      doc.text(ajuster(doc, m.nom, xNote - L - 4 * s, fz, 5.5 * s), L + 2 * s, y + rh / 2, { baseline: "middle" });
      doc.setFontSize(fz);
      doc.setFont("helvetica", "bold");
      doc.text(f2(e.points[m.id]), xNote + colNote - 2 * s, y + rh / 2, { align: "right", baseline: "middle" });
      doc.setFont("helvetica", "normal"); doc.setTextColor(...SOURDINE);
      doc.text(f2(m.coefficient), R - 2 * s, y + rh / 2, { align: "right", baseline: "middle" });
      y += rh;
    });
    // cadre des colonnes + contour
    const hBloc = hh + k.matieres.length * rh;
    doc.setDrawColor(...MARINE); doc.setLineWidth(0.3 * s);
    doc.rect(L, y - hBloc, CW, hBloc, "S");
    doc.setDrawColor(...GRIS_LIGNE); doc.setLineWidth(0.15 * s);
    doc.line(xNote, y - hBloc + hh, xNote, y); doc.line(xMax, y - hBloc + hh, xMax, y);
    // bandeau total / moyenne de la categorie
    const sh = rh * 1.2;
    doc.setFillColor(...MARINE_CLAIR); doc.rect(L, y, CW, sh, "F");
    const c = e.cats[k.key] || {};
    doc.setTextColor(...MARINE); doc.setFont("helvetica", "bold"); doc.setFontSize(fz);
    doc.text("Total " + k.nom + " : " + f2(c.total) + " / " + f2(c.max !== undefined ? c.max : k.max_total), L + 2 * s, y + sh / 2, { baseline: "middle" });
    doc.text("Moy. " + k.nom + " : " + moy(c.moyenne) + " / " + data.base, R - 2 * s, y + sh / 2, { align: "right", baseline: "middle" });
    y += sh + 2.2 * s;
  }

  /* ---------- 5. Total general / moyenne ---------- */
  const bh = 7.4 * s;
  doc.setDrawColor(...MARINE); doc.setLineWidth(0.5 * s);
  doc.setFillColor(255, 255, 255); doc.rect(L, y, CW, bh * 2, "S");
  doc.setLineWidth(0.2 * s); doc.line(L, y + bh, R, y + bh);
  doc.setFillColor(...MARINE); doc.rect(L, y + bh, CW, bh, "F");
  doc.setTextColor(...MARINE); doc.setFont("times", "bold"); doc.setFontSize(12.5 * s);
  doc.text("TOTAL", L + 3 * s, y + bh / 2, { baseline: "middle" });
  doc.text(f2(e.total), xNote + colNote - 2 * s, y + bh / 2, { align: "right", baseline: "middle" });
  doc.text(f2(e.max), R - 2 * s, y + bh / 2, { align: "right", baseline: "middle" });
  doc.setTextColor(255, 255, 255);
  doc.text("MOYENNE", L + 3 * s, y + bh * 1.5, { baseline: "middle" });
  doc.text(moy(e.moyenne), xNote + colNote - 2 * s, y + bh * 1.5, { align: "right", baseline: "middle" });
  doc.text(String(data.base), R - 2 * s, y + bh * 1.5, { align: "right", baseline: "middle" });
  y += bh * 2 + 2.6 * s;

  /* ---------- 6. Retard / Absence + legende ---------- */
  doc.setTextColor(...TEXTE); doc.setDrawColor(...GRIS_LIGNE); doc.setLineWidth(0.25 * s);
  const bw = 17 * s, lw = 16 * s, rb = 5.6 * s;
  ["Retard", "Absence"].forEach((lab, i) => {
    const yy = y + i * rb;
    doc.rect(L, yy, lw, rb, "S"); doc.rect(L + lw, yy, bw, rb, "S");
    doc.setFont("helvetica", "normal"); doc.setFontSize(8 * s);
    doc.text(lab, L + 2 * s, yy + rb / 2, { baseline: "middle" });
  });
  doc.setFont("helvetica", "bold"); doc.setFontSize(7.6 * s); doc.setTextColor(...SOURDINE);
  doc.text("A = Excellent    B = Moyen", R, y + 2.4 * s, { align: "right" });
  doc.text("C = Passable    D = Médiocre", R, y + 2.4 * s + 4.2 * s, { align: "right" });
  y += rb * 2 + 6.5 * s;

  /* ---------- 7. Remarques ---------- */
  doc.setTextColor(...TEXTE); doc.setFont("helvetica", "bold"); doc.setFontSize(9 * s);
  doc.text("Remarques :", L, y);
  doc.setDrawColor(...GRIS_LIGNE); doc.setLineWidth(0.2 * s);
  const bas = H - M - 12 * s;   // reserve pour signatures + pied
  const libre = Math.max(0, bas - 10 * s - y);
  const nbLignes = Math.max(1, Math.min(3, Math.floor(libre / (5.2 * s))));
  for (let i = 0; i < nbLignes; i++) doc.line(L, y + 6 * s + i * 5.2 * s, R, y + 6 * s + i * 5.2 * s);

  /* ---------- 8. Signatures ---------- */
  const ys = H - M - 11.5 * s;
  doc.setDrawColor(...TEXTE); doc.setLineWidth(0.25 * s);
  const sw = CW * 0.4;
  doc.line(L, ys, L + sw, ys); doc.line(R - sw, ys, R, ys);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8 * s); doc.setTextColor(...SOURDINE);
  doc.text("Direction", L + sw / 2, ys + 3.4 * s, { align: "center" });
  doc.text("Parent / Personne responsable", R - sw / 2, ys + 3.4 * s, { align: "center" });

  /* ---------- 9. Pied ---------- */
  if (etab.pied) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(7.6 * s); doc.setTextColor(...MARINE);
    doc.text(ajuster(doc, etab.pied, CW, 7.6 * s, 5 * s), W / 2, H - M + 0.2 * s, { align: "center" });
  }
}

/**
 * eleves : liste d'eleves du bulletin de classe ; data : reponse de /api/notes/bulletin
 * contexte : { classe, periode, annee } ; settings : parametres de l'etablissement ; dim : { l, h } en mm
 * options : { logo (resultat de chargerLogo), marge }
 * Retourne le document jsPDF.
 */
export async function creerBulletinsPdf({ eleves, data, contexte, settings, dim, logo, marge, JsPDF }) {
  const Ctor = JsPDF || (await import("jspdf")).jsPDF;
  const W = (dim && dim.l) || 148, H = (dim && dim.h) || 210;
  const doc = new Ctor({ orientation: W > H ? "landscape" : "portrait", unit: "mm", format: [Math.min(W, H), Math.max(W, H)] });
  const M = marge !== undefined && marge !== null && Number(marge) >= 0 ? Math.max(6, Number(marge)) : 8;
  const s = Math.max(0.6, Math.min(W / 148, H / 210));
  const st = settings || {};
  const tel = st.telephone ? "Tél : " + st.telephone : "";
  const etab = {
    nom: st.nom_etablissement || "Établissement",
    details: [st.adresse, st.email].filter(Boolean).join("  •  "),
    pied: tel
  };
  eleves.forEach((e, i) => {
    if (i > 0) doc.addPage([Math.min(W, H), Math.max(W, H)], W > H ? "landscape" : "portrait");
    dessinerPage(doc, W, H, M, s, { eleve: e, data, contexte, etab, logo, nbEleves: data.eleves.length });
  });
  return doc;
}

const slug = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
export function nomFichierBulletin(contexte, eleve) {
  return "Bulletin_" + (eleve ? slug(eleve.nom) + "_" + slug(eleve.prenom) : "Classe_" + slug(contexte.classe)) + "_" + slug(contexte.periode) + ".pdf";
}

/* ---------- aides communes (format du papier, URL du logo) ---------- */
const PAPIERS = { a4: [210, 297], a5: [148, 210], a6: [105, 148], letter: [216, 279], legal: [216, 356] };
export function dimensionsPapier(cfg) {
  const c = cfg || {};
  if (c.format === "custom") return { l: Number(c.largeur_mm) || 148, h: Number(c.hauteur_mm) || 210 };
  const [a, b] = PAPIERS[c.format] || PAPIERS.a5;
  return c.orientation === "paysage" ? { l: Math.max(a, b), h: Math.min(a, b) } : { l: Math.min(a, b), h: Math.max(a, b) };
}
export function urlLogoEtab(settings) {
  if (!settings || !settings.logo) return null;
  if (/^(https?:|data:)/.test(String(settings.logo))) return settings.logo;
  const o = window.location.origin;
  return (o.startsWith("http") ? o : "http://localhost:3001") + "/uploads/" + settings.logo;
}
