// Rapport d'un acces special temporaire : texte (ecran) et PDF.
import { ajouterTagWorlfinity } from "../pdfTag.js";
import { formatEcole } from "../pedagogie/papier.js";
import { nomTache, nomTable, resumeDroits, aDesDroits } from "./accesSpecialCatalog.js";
import { filtreLisible } from "./journalEcritures.js";

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

const OPERATIONS = { insert: "Ajout", update: "Modification", upsert: "Ajout ou modification", delete: "Suppression", rpc: "Fonction" };
export const operationLibelle = (op) => OPERATIONS[op] || op || "Écriture";

function valeurLisible(v) { return v === null ? "vide" : typeof v === "string" ? "« " + v + " »" : String(v); }
// Detail d'une modification : "id = 12 — nom = « Dupont », classe = « 6e A »"
function detailEcriture(e) {
  const d = e.detail || {};
  const filtres = (d.filtres || []).map(filtreLisible).join(" ; ");
  const vals = d.valeurs && typeof d.valeurs === "object" ? Object.keys(d.valeurs) : [];
  const champs = vals.length
    ? vals.slice(0, 6).map((k) => k + " = " + valeurLisible(d.valeurs[k])).join(", ") + (vals.length > 6 || (d.champs || []).length > vals.length ? ", …" : "")
    : (d.champs || []).slice(0, 8).join(", ");
  const lignes = (d.op === "insert" || d.op === "upsert") && e.nb > 1 ? e.nb + " lignes" : "";
  return [lignes, filtres, champs].filter(Boolean).join(" — ");
}

// Lignes du journal : { heure, categorie, evenement, tache, cible, resultat, ton: "ok"|"err"|"gris"|"info" }
// categorie : acces | action (tache speciale) | page | ecriture | refus
export function lignesJournal(evenements, nomsTaches, nomsModules) {
  const nom = (k) => (nomsTaches && nomsTaches[k]) || nomTache(k);
  return (evenements || []).map((e) => {
    const qui = e.nom_complet || e.username || "";
    if (e.type === "accorde") {
      const d = e.detail || {};
      const parties = [];
      if ((d.taches || []).length) parties.push("tâches : " + d.taches.map(nom).join(", "));
      if (aDesDroits(d.droits)) parties.push("droits : " + resumeDroits(d.droits));
      return { heure: e.created_at, categorie: "acces", evenement: "Accès accordé par " + qui, tache: "", cible: (parties.length ? parties.join(" ; ") + ". " : "") + "Durée " + dureeTexte(d.duree_min) + ((d.taches || []).length ? (d.utilisations_max != null ? ", " + d.utilisations_max + " action(s) au plus" : ", sans limite d'actions") : "") + (d.motif ? ". Motif : " + d.motif : ""), resultat: "", ton: "info" };
    }
    if (e.type === "revoque") return { heure: e.created_at, categorie: "acces", evenement: "Accès révoqué par " + qui, tache: "", cible: "", resultat: "", ton: "gris" };
    if (e.type === "refus") return { heure: e.created_at, categorie: "refus", evenement: "Tentative refusée", tache: e.tache ? nom(e.tache) : "", cible: e.message || "", resultat: "Refusée", ton: "err" };
    if (e.type === "page") return { heure: e.created_at, categorie: "page", evenement: "Page ouverte", tache: e.cible || (nomsModules && nomsModules[e.tache]) || e.tache || "", cible: "", resultat: "", ton: "gris" };
    if (e.type === "ecriture") {
      const d = e.detail || {};
      const ok = e.resultat === "reussi";
      return {
        heure: e.created_at, categorie: "ecriture", evenement: operationLibelle(d.op), tache: nomTable(d.table || e.tache),
        cible: detailEcriture(e) + (!ok && e.message ? " — " + e.message : ""),
        resultat: ok ? "Réussi" : e.resultat === "echec" ? "Échec" : "Non confirmé", ton: ok ? "ok" : e.resultat === "echec" ? "err" : "gris"
      };
    }
    const eleves = e.detail && Array.isArray(e.detail.eleves) && e.detail.eleves.length > 1 ? " : " + e.detail.eleves.map((x) => x.nom).join(", ") : "";
    const res = e.resultat === "reussi" ? "Réussi" : e.resultat === "echec" ? "Échec" : "Non confirmé";
    return {
      heure: e.created_at, categorie: "action", evenement: "Action de " + qui + (e.nb > 1 ? " (" + e.nb + " unités)" : ""), tache: nom(e.tache),
      cible: (e.cible || "") + (eleves && !(e.cible || "").includes(eleves) ? eleves : "") + (e.message ? " — " + e.message : ""),
      resultat: res, ton: e.resultat === "reussi" ? "ok" : e.resultat === "echec" ? "err" : "gris"
    };
  });
}

export function resume(evenements) {
  const tous = evenements || [];
  const u = tous.filter((e) => e.type === "utilise");
  const pages = tous.filter((e) => e.type === "page");
  const ecr = tous.filter((e) => e.type === "ecriture");
  return {
    actions: u.length,
    reussies: u.filter((e) => e.resultat === "reussi").length,
    echecs: u.filter((e) => e.resultat === "echec").length,
    enAttente: u.filter((e) => !e.resultat).length,
    refus: tous.filter((e) => e.type === "refus").length,
    pages: pages.length,
    pagesDistinctes: new Set(pages.map((e) => e.cible || e.tache)).size,
    ecritures: ecr.length,
    ecrituresReussies: ecr.filter((e) => e.resultat === "reussi").length,
    ecrituresEchecs: ecr.filter((e) => e.resultat === "echec").length
  };
}

// Phrase de resume (ecran et PDF)
export function phraseResume(acces, evenements) {
  const r = resume(evenements);
  const morceaux = [];
  const avecJournal = aDesDroits(acces.droits) || r.pages || r.ecritures;
  if ((acces.taches || []).length || r.actions) morceaux.push(r.actions + (avecJournal ? " action(s) spéciale(s) : " : " action(s) : ") + r.reussies + " réussie(s), " + r.echecs + " échec(s)" + (r.enAttente ? ", " + r.enAttente + " non confirmée(s)" : ""));
  if (avecJournal) morceaux.push(r.pages + " ouverture(s) de page (" + r.pagesDistinctes + " page(s) différente(s)), " + r.ecritures + " modification(s) : " + r.ecrituresReussies + " réussie(s), " + r.ecrituresEchecs + " échec(s)");
  morceaux.push(r.refus + " tentative(s) refusée(s)");
  return morceaux.join(" · ") + ".";
}

export function nomFichier(acces) { return "Acces-special-" + (acces.numero || "rapport") + ".pdf"; }

// Construit le PDF (retourne le document jsPDF). Format de la feuille = reglage de l'ecole (Parametres).
export async function construireRapportPdf({ acces, evenements, taches_noms, modules_noms, settings, genereePar }) {
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
    ["Durée prévue", dureeTexte(dureePrevue(acces)) + " (fin prévue : " + dateHeure(acces.fin) + ")"]
  ];
  if ((acces.taches || []).length) {
    lignes.push(["Tâches autorisées", acces.taches.map((k) => (taches_noms && taches_noms[k]) || nomTache(k)).join(" ; ")]);
    lignes.push(["Limite d'actions", acces.utilisations_max != null ? acces.utilisations_max : "Sans limite"]);
  }
  if (aDesDroits(acces.droits)) lignes.push(["Droits temporaires", resumeDroits(acces.droits)]);
  lignes.push(["Motif", acces.motif || ""]);
  lignes.push(["État", etatLibelle(acces.etat) + (acces.revoque_par ? " — révoqué par " + acces.revoque_par + " le " + dateHeure(acces.revoque_le) : "")]);
  autoTable(doc, {
    startY: 30, body: lignes, theme: "plain", margin: { left: M, right: M },
    styles: { fontSize: 9.5, cellPadding: { top: 1.4, bottom: 1.4, left: 1, right: 2 }, textColor: [30, 41, 59] },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 38, textColor: GRIS }, 1: { cellWidth: "auto" } }
  });

  let y = doc.lastAutoTable.finalY + 6;
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...NAVY);
  doc.text("Résumé de la séquence", M, y);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(30, 41, 59);
  y += 5.5;
  const phrase = doc.splitTextToSize(phraseResume(acces, evenements), W - 2 * M);
  doc.text(phrase, M, y);
  y += phrase.length * 4.4;

  const journal = lignesJournal(evenements, taches_noms, modules_noms);
  autoTable(doc, {
    startY: y + 1, margin: { left: M, right: M, bottom: 14 },
    head: [["Heure", "Événement", "Tâche / module", "Détail", "Résultat"]],
    body: journal.length ? journal.map((l) => [heure(l.heure), l.evenement, l.tache, l.cible, l.resultat]) : [["", "Aucun événement.", "", "", ""]],
    headStyles: { fillColor: NAVY, textColor: 255, fontSize: 8.5 },
    styles: { fontSize: 8, cellPadding: 1.5, valign: "top", textColor: [30, 41, 59] },
    columnStyles: { 0: { cellWidth: 16 }, 1: { cellWidth: 34 }, 2: { cellWidth: 30 }, 4: { cellWidth: 17, fontStyle: "bold" } },
    alternateRowStyles: { fillColor: [246, 248, 251] },
    didParseCell: (d) => {
      if (d.section === "body" && d.column.index === 4) {
        const t = journal[d.row.index] && journal[d.row.index].ton;
        d.cell.styles.textColor = t === "ok" ? [22, 163, 74] : t === "err" ? [220, 38, 38] : [100, 116, 139];
      }
    }
  });

  y = doc.lastAutoTable.finalY + 6;
  if (y > H - 30) { doc.addPage([W, H]); y = 18; }
  doc.setFont("helvetica", "italic"); doc.setFontSize(8); doc.setTextColor(...GRIS);
  const note = doc.splitTextToSize(
    "Les actions spéciales sont enregistrées par le serveur au moment où la personne confirme avec son mot de passe. Les pages ouvertes et les modifications sont enregistrées par le site, depuis le navigateur de la personne, pendant la durée de l'accès : elles décrivent ce que le site a envoyé à la base de données. Généré le " + dateHeure(new Date().toISOString()) + (genereePar ? " par " + genereePar : "") + ".",
    W - 2 * M);
  doc.text(note, M, y);
  ajouterTagWorlfinity(doc, { bas: 5 });
  return doc;
}

export async function telechargerRapportPdf(donnees) {
  const doc = await construireRapportPdf(donnees);
  doc.save(nomFichier(donnees.acces));
  return doc;
}
