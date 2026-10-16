// Tag discret "Propulsé par Worlfinity DevLab" pour les documents imprimables.
// Plus petit que sur les recus (9 px) : environ 5,5 pt en PDF et 7 px en HTML.
//  - PDF (jsPDF)  : ajouterTagWorlfinity(doc, { bas, taille }) -> ecrit le tag, centre, au bas de CHAQUE page
//  - HTML (impression) : TAG_HTML_CSS (a mettre dans le <style>) + TAG_HTML (a mettre au debut du <body>, sert de repli) ;
//                        le tag se repete en bas de chaque page imprimee (dans la marge)
//  - HTML simple : TAG_HTML_INLINE (bloc a la suite du contenu)

export const TAG_COULEUR = [138, 148, 166];

export function ajouterTagWorlfinity(doc, options) {
  if (!doc || doc.__tagWorlfinity) return doc;
  const o = options || {};
  const taille = o.taille > 0 ? o.taille : 5.5;
  const bas = o.bas > 0 ? o.bas : 4.4; // distance (mm) entre la ligne de base du texte et le bas de la page
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const cx = o.x != null ? o.x : W / 2;
    doc.setCharSpace(0);
    doc.setTextColor(...TAG_COULEUR);
    doc.setFontSize(taille);
    doc.setFont("helvetica", "normal");
    const a = "Propulsé par ";
    const wa = doc.getTextWidth(a);
    doc.setFont("helvetica", "bold");
    const b = "Worlfinity DevLab";
    const wb = doc.getTextWidth(b);
    const x0 = cx - (wa + wb) / 2;
    doc.setFont("helvetica", "normal");
    doc.text(a, x0, H - bas);
    doc.setFont("helvetica", "bold");
    doc.text(b, x0 + wa, H - bas);
  }
  doc.setPage(total);
  doc.__tagWorlfinity = true;
  return doc;
}

// Impression HTML : le navigateur repete le tag en bas de CHAQUE page grace aux "marges de page" CSS (@bottom-center),
// disponibles dans Chrome / Edge / Electron 131 et plus. Sur un moteur plus ancien (ou Firefox / Safari) on garde
// un repli : le meme tag, une seule fois, tout en haut du document (TAG_HTML, a mettre au debut du <body>).
const moteurAvecMargesDePage = (() => {
  try {
    const m = /Chrome\/(\d+)/.exec((typeof navigator !== "undefined" && navigator.userAgent) || "");
    return !!m && Number(m[1]) >= 131;
  } catch (e) { return false; }
})();

export const TAG_HTML_CSS = moteurAvecMargesDePage
  ? "@page{@bottom-center{content:'Propuls\\e9  par Worlfinity DevLab';font:7px Arial,sans-serif;color:#8a94a6;vertical-align:top;padding-top:.6mm}}"
  : ".tagdev{text-align:center;font:7px Arial,sans-serif;color:#8a94a6;margin:0 0 4px}";
export const TAG_HTML = moteurAvecMargesDePage ? "" : '<div class="tagdev">Propuls&eacute; par <b>Worlfinity DevLab</b></div>';
// Bloc simple a la suite du contenu (rapports imprimes ou convertis en image)
export const TAG_HTML_INLINE =
  '<div style="text-align:center;margin-top:10px;font:7px Arial,sans-serif;color:#8a94a6;">Propuls&eacute; par <b>Worlfinity DevLab</b></div>';
