// Format du papier des documents imprimes (palmares, cahier de presence) : Lettre, Legal (8,5 x 14 po), A4, A3 ou dimensions de l'ecole.
// Les dimensions sont toujours en millimetres, feuille en portrait : largeur = le petit cote, hauteur = le grand cote.
// Reglage de l'ecole : institution_settings.format_documents (+ _largeur_mm, _hauteur_mm) ; choix a l'impression : memorise sur l'ordinateur.
export const MM_PAR_PO = 25.4;
export const PAPIERS = [
  { cle: "letter", nom: "Lettre US", largeur: 215.9, hauteur: 279.4 },
  { cle: "legal", nom: "Légal", largeur: 215.9, hauteur: 355.6 },
  { cle: "a4", nom: "A4", largeur: 210, hauteur: 297 },
  { cle: "a3", nom: "A3", largeur: 297, hauteur: 420 }
];
export const MIN_MM = 180, MAX_MM = 700; // en dessous de 180 mm les tableaux ne tiennent plus
const CLE_LOCALE = "capv_papier_documents";

export const nombre = (v) => { const x = Number(String(v === null || v === undefined ? "" : v).trim().replace(",", ".")); return Number.isFinite(x) ? x : NaN; };
const arrondi = (x, d = 2) => Math.round(x * Math.pow(10, d)) / Math.pow(10, d);
const fr = (x, d = 2) => String(arrondi(x, d)).replace(".", ",");
export const enPo = (mm) => fr(mm / MM_PAR_PO, 2);

export const papierDe = (cle) => PAPIERS.find((p) => p.cle === cle) || null;
// nom du format si les dimensions sont celles d'un format connu (a 1 mm pres)
export function nomConnu(largeur, hauteur) {
  const c = Math.min(largeur, hauteur), l = Math.max(largeur, hauteur);
  const p = PAPIERS.find((x) => Math.abs(x.largeur - c) < 1 && Math.abs(x.hauteur - l) < 1);
  return p ? p.nom : "Personnalisé";
}
export function decrire(largeur, hauteur) {
  const c = Math.min(largeur, hauteur), l = Math.max(largeur, hauteur);
  return fr(c, 1) + " × " + fr(l, 1) + " mm (" + enPo(c) + " × " + enPo(l) + " po)";
}

// { cle: "letter"|"legal"|"a4"|"a3"|"custom", largeur, hauteur (mm, texte ou nombre) } -> { ok, erreur, largeur, hauteur, nom }
export function dimensions(cle, largeurMm, hauteurMm) {
  const p = papierDe(cle);
  if (p) return { ok: true, erreur: "", largeur: p.largeur, hauteur: p.hauteur, nom: p.nom };
  if (cle !== "custom") return dimensions("letter");
  const a = nombre(largeurMm), b = nombre(hauteurMm);
  if (!(a >= MIN_MM && a <= MAX_MM && b >= MIN_MM && b <= MAX_MM)) {
    return { ok: false, erreur: "Dimensions du papier invalides : chaque côté doit faire entre " + MIN_MM + " et " + MAX_MM + " mm (" + enPo(MIN_MM) + " à " + enPo(MAX_MM) + " po).", largeur: 215.9, hauteur: 279.4, nom: "Lettre US" };
  }
  const c = Math.min(a, b), l = Math.max(a, b);
  return { ok: true, erreur: "", largeur: arrondi(c, 1), hauteur: arrondi(l, 1), nom: nomConnu(c, l) };
}

// reglage de l'ecole (Parametres), Lettre US par defaut
export function formatEcole(settings) {
  const s = settings || {};
  return dimensions(s.format_documents || "letter", s.format_documents_largeur_mm, s.format_documents_hauteur_mm);
}

// choix = { cle: "ecole"|"letter"|...|"custom", largeur, hauteur } ; "ecole" = le reglage des Parametres
export function resoudre(choix, settings) {
  const c = choix || { cle: "ecole" };
  if (!c.cle || c.cle === "ecole") { const e = formatEcole(settings); return { ...e, source: "ecole" }; }
  return { ...dimensions(c.cle, c.largeur, c.hauteur), source: "choix" };
}

export function lireLocal() {
  try {
    const t = JSON.parse(localStorage.getItem(CLE_LOCALE) || "null");
    if (t && typeof t.cle === "string") return { cle: t.cle, largeur: String(t.largeur || ""), hauteur: String(t.hauteur || "") };
  } catch (e) { /* stockage indisponible */ }
  return { cle: "ecole", largeur: "", hauteur: "" };
}
export function ecrireLocal(choix) { try { localStorage.setItem(CLE_LOCALE, JSON.stringify(choix)); } catch (e) { /* stockage indisponible */ } }

// ---- pour les PDF (jsPDF, millimetres) -------------------------------------------------------------------------
// src : { dim: { largeur, hauteur } } ou { settings: { feuille_dim: { largeur, hauteur } } } ; sans dimensions : Lettre US.
// W = largeur de la feuille posee, H = sa hauteur (en paysage, W est le grand cote).
export function tailleFeuille(src, paysage) {
  const d = (src && (src.dim || (src.settings && src.settings.feuille_dim))) || null;
  const a = d ? Number(d.largeur) : NaN, b = d ? Number(d.hauteur) : NaN;
  const c = a > 0 && b > 0 ? Math.min(a, b) : 215.9, l = a > 0 && b > 0 ? Math.max(a, b) : 279.4;
  return paysage ? { W: l, H: c } : { W: c, H: l };
}
// Lettre US : on garde le nom "letter" de jsPDF (sortie strictement identique a avant) ; les autres formats sont donnes en mm
export function formatJsPdf(src, paysage) {
  const t = tailleFeuille(src, paysage);
  const c = Math.min(t.W, t.H), l = Math.max(t.W, t.H);
  return Math.abs(c - 215.9) < 0.05 && Math.abs(l - 279.4) < 0.05 ? "letter" : [t.W, t.H];
}
