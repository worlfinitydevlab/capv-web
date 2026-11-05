// Rapport d'un acces special temporaire : texte (ecran) et PDF.
import { ajouterTagWorlfinity } from "../pdfTag.js";
import { formatEcole } from "../pedagogie/papier.js";
import { nomTache } from "./accesSpecialCatalog.js";

const ETATS = { actif: "Actif", expire: "Expiré (durée écoulée)", epuise: "Épuisé (limite d'actions atteinte)", revoque: "Révoqué" };
export const etatLibelle = (e) => ETATS[e] || e;

export function dateHeure(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return p(d.getDate()) + "/" + p(d.getMonth() + 1) + "/" + d.getFullYear() + " " + p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
}
export function heure(iso) { const t = dateHeure(iso); return t ? t.slice(11) : ""; }
export function dureeTexte(min) {
  if (min == null) return "";
  if (min < 60) return min + " min";
  const h = Math.floor(min / 60), m = min % 60;
  return h + " h" + (m ? " " + String(m).padStart(2, "0") : "");
}
export function dureePrevue(a) { return Math.round((new Date(a.fin).getTime() - new Date(a.debut).getTime()) / 60000); }

// Lignes du journal : { heure, evenement, tache, cible, resultat, ton: "ok"|"err"|"gris"|"info" }
export function lignesJournal(evenements, nomsTaches) {
  const nom = (k) => (nomsTaches && nomsTaches[k]) || nomTache(k);
  return (evenements || []).map((e) => {
    const qui = e.nom_complet || e.username || "";
    if (e.type === "accorde") {
      const d = e.detail || {};
      return { heure: e.created_at, evenement: "Accès accordé par " + qui, tache: (d.taches || []).map(nom).join(", "), cible: "Durée " + dureeTexte(d.duree_min) + (d.utilisations_max != null ? ", " + d.utilisations_max + " action(s) au plus" : ", sans limite d'actions") + (d.motif ? ". Motif : " + d.motif : ""), resultat: "", ton: "info" };
    }
    if (e.type === "revoque") return { heure: e.created_at, evenement: "Accès révoqué par " + qui, tache: "", cible: "", resultat: "", ton: "gris" };
    if (e.type === "refus") return { heure: e.created_at, evenement: "Tentative refusée", tache: e.tache ? nom(e.tache) : "", cible: e.message || "", resultat: "Refusée", ton: "err" };
    const eleves = e.detail && Array.isArray(e.detail.eleves) && e.detail.eleves.length > 1 ? " : " + e.detail.eleves.map((x) => x.nom).join(", ") : "";
    const res = e.resultat === "reussi" ? "Réussi" : e.resultat === "echec" ? "Échec" : "Non confirmé";
    return {
      heure: e.created_at, evenement: "Action de " + qui + (e.nb > 1 ? " (" + e.nb + " unités)" : ""), tache: nom(e.tache),
      cible: (e.cible || "") + (eleves && !(e.cible || "").includes(eleves) ? eleves : "") + (e.message ? " — " + e.message : ""),
      resultat: res, ton: e.resultat === "reussi" ? "ok" : e.resultat === "echec" ? "err" : "gris"
    };
  });
}

export function resume(evenements) {
  const u = (evenements || []).filter((e) => e.type === "utilise");
  return {
    actions: u.length,
    reussies: u.filter((e) => e.resultat === "reussi").length,
    echecs: u.filter((e) => e.resultat === "echec").length,
    enAttente: u.filter((e) => !e.resultat).length,
    refus: (evenements || []).filter((e) => e.type === "refus").length
  };
}

export function nomFichier(acces) { return "Acces-special-" + (acces.numero || "rapport") + ".pdf"; }

// Construit le PDF (retourne le document jsPDF). Format de la feuille = reglage de l'ecole (Parametres).
export async function construireRapportPdf({ acces, evenements, taches_noms, settings, genereePar }) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const f = formatEcole(settings);
  const W = f.largeur, H = f.hauteur, M = 14;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: [W, H] });
  const etab = (settings && settings.nom_etablissement) || "Établissement";
  const NAVY = [30, 42, 120], GRIS = [100, 116, 139];

  doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...GRIS);
  doc.text(etab.toUpperCase(), M, 14);
  doc.setFontSize(17); doc.setTextColor(...NAVY);
  doc.text("Rapport d'accès spécial temporaire", M, 23);
  doc.setFontSize(11); doc.setTextColor(30, 41, 59);
  doc.text(acces.numero || "", W - M, 23, { align: "right" });
  doc.setDrawColor(199, 154, 58); doc.setLineWidth(0.6); doc.line(M, 26, W - M, 26);

  const lignes = [
    ["Bénéficiaire", (acces.nom_complet ? acces.nom_complet + " (" + acces.username + ")" : acces.username)],
    ["Accordé par", (acces.accorde_par_nom ? acces.accorde_par_nom + " (" + acces.accorde_par + ")" : acces.accorde_par)],
    ["Début", dateHeure(acces.debut)],
    ["Durée prévue", dureeTexte(dureePrevue(acces)) + " (fin prévue : " + dateHeure(acces.fin) + ")"],
    ["Tâches autorisées", (acces.taches || []).map((k) => (taches_noms && taches_noms[k]) || nomTache(k)).join(" ; ")],
    ["Limite d'actions", acces.utilisations_max != null ? acces.utilisations_max : "Sans limite"],
    ["Motif", acces.motif || ""],
    ["État", etatLibelle(acces.etat) + (acces.revoque_par ? " — révoqué par " + acces.revoque_par + " le " + dateHeure(acces.revoque_le) : "")]
  ];
  autoTable(doc, {
    startY: 30, body: lignes, theme: "plain", margin: { left: M, right: M },
    styles: { fontSize: 9.5, cellPadding: { top: 1.4, bottom: 1.4, left: 1, right: 2 }, textColor: [30, 41, 59] },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 38, textColor: GRIS }, 1: { cellWidth: "auto" } }
  });

  const r = resume(evenements);
  let y = doc.lastAutoTable.finalY + 6;
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...NAVY);
  doc.text("Résumé de la séquence", M, y);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(30, 41, 59);
  y += 5.5;
  doc.text(r.actions + " action(s) : " + r.reussies + " réussie(s), " + r.echecs + " échec(s)" + (r.enAttente ? ", " + r.enAttente + " non confirmée(s)" : "") + " · " + r.refus + " tentative(s) refusée(s).", M, y);

  const journal = lignesJournal(evenements, taches_noms);
  autoTable(doc, {
    startY: y + 4, margin: { left: M, right: M, bottom: 14 },
    head: [["Heure", "Événement", "Tâche", "Détail", "Résultat"]],
    body: journal.length ? journal.map((l) => [heure(l.heure), l.evenement, l.tache, l.cible, l.resultat]) : [["", "Aucun événement.", "", "", ""]],
    headStyles: { fillColor: NAVY, textColor: 255, fontSize: 8.5 },
    styles: { fontSize: 8.5, cellPadding: 1.6, valign: "top", textColor: [30, 41, 59] },
    columnStyles: { 0: { cellWidth: 17 }, 1: { cellWidth: 40 }, 2: { cellWidth: 34 }, 4: { cellWidth: 20, fontStyle: "bold" } },
    alternateRowStyles: { fillColor: [246, 248, 251] },
    didParseCell: (d) => {
      if (d.section === "body" && d.column.index === 4) {
        const t = journal[d.row.index] && journal[d.row.index].ton;
        d.cell.styles.textColor = t === "ok" ? [22, 163, 74] : t === "err" ? [220, 38, 38] : [100, 116, 139];
      }
    }
  });

  y = doc.lastAutoTable.finalY + 6;
  if (y > H - 26) { doc.addPage([W, H]); y = 18; }
  doc.setFont("helvetica", "italic"); doc.setFontSize(8); doc.setTextColor(...GRIS);
  const note = doc.splitTextToSize("Ce rapport décrit les actions faites avec l'accès spécial, enregistrées par le serveur au moment où la personne a confirmé avec son mot de passe. Généré le " + dateHeure(new Date().toISOString()) + (genereePar ? " par " + genereePar : "") + ".", W - 2 * M);
  doc.text(note, M, y);
  ajouterTagWorlfinity(doc, { bas: 5 });
  return doc;
}

export async function telechargerRapportPdf(donnees) {
  const doc = await construireRapportPdf(donnees);
  doc.save(nomFichier(donnees.acces));
  return doc;
}
