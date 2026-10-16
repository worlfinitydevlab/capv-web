// Lettres aux parents (jsPDF, vectoriel, A4, une page) : avertissement ecrit et convocation, avec talon d'accusé de reception.
import { ajouterTagWorlfinity } from "../pdfTag.js";
import { nomComplet, fmtDate } from "./outils.js";
import { dateLongue } from "./suivi.js";

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

function fermer(w) { try { if (w) w.close(); } catch (e) { /* rien */ } }

const sansPoint = (t) => String(t || "").trim().replace(/[.\s]+$/, "");
const minusculeInitiale = (t) => { const s = String(t || ""); return s ? s.charAt(0).toLowerCase() + s.slice(1) : s; };

/* =====================================================================
   p = {
     suivi : { type:'avertissement'|'convocation', numero, date_suivi, destinataire, destinataire_tel, date_rdv, heure_rdv, lieu_rdv, note, nb_incidents },
     eleve : { nom, prenom, matricule }, classe : "3e AF",
     faute : { numero, libelle, cases, niveau:{ nom, action, couleur } } | null,
     incidents : [{ date_incident, lieu, signale_par }]  (incidents valides de cette faute pour cet eleve),
     annee : "2026-2027", settings : institution_settings, logo : { data, fmt, ratio } | null,
     reglages : { lettre_ville, lettre_signataire_titre, lettre_signataire_nom, lettre_delai_jours, lettre_lieu_rdv },
     mode : 'print' | 'download' | 'doc', nomFichier, fenetre (fenetre deja ouverte pour 'print'), JsPDF (tests)
   }
   ===================================================================== */
export async function creerLettrePdf(p) {
  const mode = p.mode || "download";
  const w = mode === "print" ? (p.fenetre || window.open("", "_blank")) : null;
  if (mode === "print" && !w) return false;
  let Ctor;
  try { Ctor = p.JsPDF || (await import("jspdf")).jsPDF; } catch (e) { fermer(w); throw e; }
  try {
    const doc = new Ctor({ orientation: "portrait", unit: "mm", format: "a4" });
    dessiner(doc, p);
    ajouterTagWorlfinity(doc, { bas: 5 });
    if (mode === "doc") return doc;
    if (mode === "print") { w.location.href = URL.createObjectURL(doc.output("blob")); } else { doc.save((p.nomFichier || "Lettre") + ".pdf"); }
    return true;
  } catch (e) { fermer(w); throw e; }
}

function dessiner(doc, p) {
  const { suivi, eleve, classe, faute, annee, settings, logo } = p;
  const rg = p.reglages || {};
  const incidents = (p.incidents || []).slice();
  const conv = suivi.type === "convocation";
  const W = 210, L = 20, R = 190, CW = R - L, cx = W / 2;
  const st = settings || {};
  const nomEcole = st.nom_etablissement || "Établissement";
  const details = [st.adresse, st.telephone ? "Tél : " + st.telephone : "", st.email].filter(Boolean).join("   •   ");
  const nomEl = nomComplet(eleve);
  const niv = faute && faute.niveau ? faute.niveau : null;
  const delai = Number(rg.lettre_delai_jours) || 3;
  const ville = rg.lettre_ville || "Pétion-Ville";

  /* ---------- en-tete ---------- */
  let y = 12;
  let zoneX = cx, zoneW = CW;
  if (logo) {
    const hh = 20;
    let ww = Math.min(34, hh * logo.ratio);
    const h2 = ww / logo.ratio;
    try { doc.addImage(logo.data, logo.fmt, L, y, ww, h2); } catch (e) { /* logo illisible : on continue sans */ }
    zoneX = L + 38 + (CW - 38) / 2; zoneW = CW - 38;
  }
  doc.setTextColor(...TEXTE); doc.setFont("times", "bolditalic");
  doc.text(ajuster(doc, nomEcole, zoneW - 2, 17, 9), zoneX, y + 9, { align: "center" });
  if (details) {
    doc.setFont("helvetica", "normal"); doc.setTextColor(...SOURDINE);
    doc.text(ajuster(doc, details, zoneW - 2, 8, 5), zoneX, y + 15.5, { align: "center" });
  }
  doc.setDrawColor(...CRIMSON); doc.setLineWidth(0.9); doc.line(L, 34, R, 34);
  doc.setLineWidth(0.25); doc.line(L, 35.3, R, 35.3);

  /* ---------- reference, date, objet ---------- */
  y = 44;
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...SOURDINE);
  doc.text("Réf. : " + (suivi.numero || ""), L, y);
  doc.setFontSize(10.5); doc.setTextColor(...TEXTE);
  doc.text(ville + ", le " + dateLongue(suivi.date_suivi), R, y, { align: "right" });
  y = 53;
  doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); doc.text("Objet :", L, y);
  doc.setTextColor(...CRIMSON);
  doc.text(conv ? "Convocation des parents" : "Avertissement écrit - discipline", L + 15, y);
  doc.setTextColor(...TEXTE);

  /* ---------- destinataire ---------- */
  y = 59;
  doc.setFillColor(...ZEBRE); doc.setDrawColor(...LIGNE); doc.setLineWidth(0.2);
  doc.rect(L, y, CW, 20, "FD");
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold"); doc.text("À l'attention de :", L + 3, y + 6);
  const wAtt = doc.getTextWidth("À l'attention de : ");
  doc.setFont("helvetica", "normal");
  const dest = suivi.destinataire ? suivi.destinataire : "Monsieur / Madame, parent ou tuteur de l'élève";
  doc.text(ajuster(doc, dest, CW - 6 - wAtt, 10, 7), L + 3 + wAtt, y + 6);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold"); doc.text("Élève :", L + 3, y + 12.5);
  const wEl = doc.getTextWidth("Élève : ");
  doc.setFont("helvetica", "normal");
  doc.text(ajuster(doc, nomEl, CW - 6 - wEl, 10, 7), L + 3 + wEl, y + 12.5);
  doc.setFontSize(9.5); doc.setTextColor(...SOURDINE);
  doc.text(ajuster(doc, [classe ? "Classe : " + classe : "", eleve.matricule ? "Matricule : " + eleve.matricule : "", "Année scolaire " + annee].filter(Boolean).join("     "), CW - 6, 9.5, 6), L + 3, y + 17.5);
  doc.setTextColor(...TEXTE);

  /* ---------- corps ---------- */
  y = 89;
  const LH = 4.9;
  const para = (texte, o) => {
    const opt = o || {};
    doc.setFont("helvetica", opt.gras ? "bold" : "normal"); doc.setFontSize(opt.taille || 10.5);
    const lignes = doc.splitTextToSize(texte, opt.largeur || CW);
    doc.text(lignes, opt.x || L, y, { baseline: "alphabetic" });
    y += lignes.length * LH + (opt.apres == null ? 2.6 : opt.apres);
  };
  const mesure = (texte, taille) => { doc.setFont("helvetica", "normal"); doc.setFontSize(taille || 10.5); return doc.splitTextToSize(texte, CW).length * LH + 2.6; };

  const classeTxt = classe ? ", inscrit(e) en classe de " + classe + "," : ",";
  const action = niv && niv.action ? sansPoint(niv.action) : "";
  const precision = suivi.note ? "Précision : " + suivi.note : "";
  const salut = "Veuillez agréer, Madame, Monsieur, l'expression de nos salutations distinguées.";
  let intro, motif = "", mesureTxt = "", demande;
  if (conv) {
    const quand = dateLongue(suivi.date_rdv, true) + (suivi.heure_rdv ? " à " + suivi.heure_rdv : "");
    const lieu = suivi.lieu_rdv || rg.lettre_lieu_rdv || "Bureau de la Direction";
    intro = "Nous vous prions de bien vouloir vous présenter à l'école le " + quand + " (" + lieu + "), afin de vous entretenir de la conduite de votre enfant " + nomEl + (classe ? ", élève de " + classe : "") + ".";
    if (faute) motif = "Motif de la convocation : la faute ci-dessous a été commise à " + (suivi.nb_incidents || incidents.length || faute.cases) + " reprises durant l'année scolaire " + annee + ".";
    if (action) mesureTxt = "Conformément au règlement de l'école, la mesure prévue à ce stade est : " + minusculeInitiale(action) + ".";
    demande = "Merci de vous munir du carnet de discipline de l'élève. En cas d'empêchement, veuillez nous prévenir" + (st.telephone ? " au " + st.telephone : "") + " avant la date prévue, et nous retourner le talon ci-dessous, signé.";
  } else {
    if (faute) intro = "Nous vous informons que l'élève " + nomEl + classeTxt + " a commis à " + (suivi.nb_incidents || incidents.length || faute.cases) + " reprises, durant l'année scolaire " + annee + ", la faute suivante inscrite à son carnet de discipline :";
    else intro = "Nous vous informons que le comportement de l'élève " + nomEl + classeTxt + " a fait l'objet de plusieurs remarques de la part de l'équipe éducative durant l'année scolaire " + annee + ".";
    if (action) mesureTxt = "Conformément au règlement de l'école, la mesure prévue à ce stade est : " + minusculeInitiale(action) + ".";
    demande = "Nous vous prions d'en parler avec votre enfant et de nous retourner le talon ci-dessous, signé, dans un délai de " + delai + " jours. Nous comptons sur votre collaboration pour que cette situation ne se reproduise plus ; en cas de récidive, des mesures plus sévères pourront être prises conformément au règlement.";
  }

  para("Madame, Monsieur,", { apres: 3 });
  para(intro);
  if (motif) para(motif);

  /* encadre de la faute + dates des faits */
  const queue = (mesureTxt ? mesure(mesureTxt) : 0) + (precision ? mesure(precision) : 0) + mesure(demande) + mesure(salut) + 3;
  if (faute) {
    const couleur = hex(niv && niv.couleur, CRIMSON);
    doc.setFillColor(...ZEBRE); doc.setDrawColor(...LIGNE); doc.setLineWidth(0.2);
    doc.rect(L, y - 3.3, CW, 12.5, "FD");
    doc.setFillColor(...couleur); doc.rect(L, y - 3.3, 2.2, 12.5, "F");
    doc.setTextColor(...TEXTE); doc.setFont("helvetica", "bold");
    doc.text(ajuster(doc, "Faute n°" + faute.numero + " : " + faute.libelle, CW - 9, 10.5, 7), L + 5, y + 1.6);
    doc.setFont("helvetica", "normal"); doc.setTextColor(...SOURDINE);
    doc.text(ajuster(doc, [niv ? "Niveau : " + niv.nom : "", "Cases du carnet : " + (suivi.nb_incidents || incidents.length) + " / " + faute.cases].filter(Boolean).join("     -     "), CW - 9, 9, 6), L + 5, y + 6.6);
    doc.setTextColor(...TEXTE);
    y += 14.5;
    if (incidents.length) {
      const RH = 5, tete = 5.4;
      const libre = 203 - queue - y - tete;
      const maxLignes = Math.max(2, Math.min(8, Math.floor(libre / RH)));
      const aff = incidents.length > maxLignes ? incidents.slice(0, maxLignes - 1) : incidents;
      const cache = incidents.length - aff.length;
      const cols = [L + 2, L + 14, L + 46, L + 100];
      doc.setFillColor(...CRIMSON); doc.rect(L, y - 3.6, CW, tete, "F");
      doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(8.5);
      ["N°", "Date", "Lieu", "Signalé par"].forEach((t, k) => doc.text(t, cols[k], y));
      y += tete - 0.2;
      doc.setTextColor(...TEXTE); doc.setFont("helvetica", "normal");
      aff.forEach((i, k) => {
        if (k % 2 === 1) { doc.setFillColor(...ZEBRE); doc.rect(L, y - 3.6, CW, RH, "F"); }
        doc.setFontSize(8.5);
        doc.text(String(k + 1), cols[0], y);
        doc.text(fmtDate(i.date_incident), cols[1], y);
        doc.text(ajuster(doc, i.lieu || "-", 50, 8.5, 6), cols[2], y);
        doc.text(ajuster(doc, i.signale_par || "-", 66, 8.5, 6), cols[3], y);
        y += RH;
      });
      if (cache > 0) { doc.setFontSize(8.5); doc.setTextColor(...SOURDINE); doc.text("... et " + cache + " autre(s) date(s) au dossier de l'élève", cols[0], y); doc.setTextColor(...TEXTE); y += RH; }
      y += 2.5;
    }
  }
  if (mesureTxt) para(mesureTxt);
  if (precision) para(precision);
  para(demande);
  para(salut, { apres: 0 });

  /* ---------- signature ---------- */
  const ys = Math.max(y + 4, 206);
  doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); doc.setTextColor(...TEXTE);
  doc.text(rg.lettre_signataire_titre || "La Direction", R, ys, { align: "right" });
  if (rg.lettre_signataire_nom) {
    doc.setFont("helvetica", "normal"); doc.text(rg.lettre_signataire_nom, R, ys + 14, { align: "right" });
  }

  /* ---------- talon ---------- */
  const yt = 236;
  doc.setDrawColor(...SOURDINE); doc.setLineWidth(0.3);
  doc.setLineDashPattern([2, 1.6], 0); doc.line(L, yt, R, yt); doc.setLineDashPattern([], 0);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...CRIMSON);
  doc.text("TALON-RÉPONSE", L, yt + 5.5);
  doc.setFont("helvetica", "normal"); doc.setTextColor(...SOURDINE);
  doc.text("à détacher et à retourner à l'école   -   Réf. " + (suivi.numero || ""), L + 29, yt + 5.5);
  doc.setTextColor(...TEXTE); doc.setFontSize(9.5);
  const aff = conv
    ? "Je soussigné(e) ______________________________________, parent / tuteur de l'élève " + nomEl + ", reconnais avoir reçu la convocation pour le " + dateLongue(suivi.date_rdv) + (suivi.heure_rdv ? " à " + suivi.heure_rdv : "") + " et m'engage à m'y présenter."
    : "Je soussigné(e) ______________________________________, parent / tuteur de l'élève " + nomEl + ", reconnais avoir reçu l'avertissement écrit du " + dateLongue(suivi.date_suivi) + " concernant la conduite de mon enfant.";
  const lignes = doc.splitTextToSize(aff, CW);
  doc.text(lignes, L, yt + 12);
  const yb = yt + 12 + lignes.length * 4.6 + 6;
  doc.text("Date : ____ / ____ / ________", L, yb);
  doc.text("Signature : ____________________________", R, yb, { align: "right" });
}
