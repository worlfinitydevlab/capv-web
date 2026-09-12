import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

export function waitForImages(container) {
  const imgs = container.querySelectorAll("img");
  return Promise.all(Array.from(imgs).map(function(img) {
    if (img.complete && img.naturalWidth > 0) return Promise.resolve();
    return new Promise(function(resolve) { img.onload = resolve; img.onerror = resolve; });
  }));
}

function getFormatDimensions(settings) {
  const format = settings.format_recu || "a5";
  if (format === "thermal80") return { widthPx: 280, pdfFormat: [80, 200] };
  if (format === "a4") return { widthPx: 550, pdfFormat: "a4" };
  if (format === "custom") {
    const w = Number(settings.format_recu_largeur_mm) || 80;
    const h = Number(settings.format_recu_hauteur_mm) || 150;
    return { widthPx: Math.round(w * 3.78), pdfFormat: [w, h] };
  }
  return { widthPx: 360, pdfFormat: "a5" };
}

// Modele de recu unifie (base sur le modele "Programme").
// rec: {
//   receipt_number, type_label (ex: "Frais scolaires"),
//   lines: [{ label, value }],           // lignes flexibles selon le type de recu
//   montant, monnaie, montant_label,      // ex: "Montant paye" ou "Montant decaisse"
//   code_caissier,                        // identifiant du caissier (jamais le nom)
//   created_at, statut_annule (optionnel)
// }
export function buildUnifiedReceiptHTML(rec, settings) {
  const { widthPx } = getFormatDimensions(settings);
  const nomEtab = settings.nom_etablissement || "Coll\u00e8ge Adventiste de P\u00e9tion-Ville";
  const qrUrl = (settings.qr_code && settings.qr_code.startsWith("http")) ? settings.qr_code : null;
  const logoUrl = settings.logo ? (settings.logo.startsWith("http") ? settings.logo : "http://localhost:3001/uploads/" + settings.logo) : null;
  const fmt = (n) => Number(n || 0).toLocaleString();
  const lignesHtml = (rec.lines || []).map((l) =>
    '<div class="rl" style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #e2e8f0;font-size:13px;"><span style="color:#64748b;">' + l.label + '</span><strong>' + (l.value || "-") + '</strong></div>'
  ).join("");

  const montantLettres = montantEnLettres(rec.montant, rec.monnaie || "HTG");

  const hasChange = rec.montant_recu != null && Number(rec.montant_recu) !== Number(rec.montant);
  const changeHtml = hasChange ? (
    '<div class="rl" style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #e2e8f0;font-size:13px;"><span style="color:#64748b;">Montant re\u00e7u</span><strong>' + fmt(rec.montant_recu) + ' ' + (rec.monnaie || "HTG") + '</strong></div>'
    + '<div class="rl" style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #e2e8f0;font-size:13px;"><span style="color:#64748b;">Monnaie rendue</span><strong>' + fmt(Number(rec.montant_recu) - Number(rec.montant)) + ' ' + (rec.monnaie || "HTG") + '</strong></div>'
  ) : "";

  const soldeHtml = (rec.solde_restant != null && Number(rec.solde_restant) > 0) ?
    '<div class="rl" style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #e2e8f0;font-size:13px;"><span style="color:#b45309;">Solde restant sur ce frais</span><strong style="color:#b45309;">' + fmt(rec.solde_restant) + ' ' + (rec.monnaie || "HTG") + '</strong></div>' : "";

  const echeancesHtml = (rec.echeances && rec.echeances.length > 0) ? (
    '<div style="margin-top:12px;padding-top:10px;border-top:1px dashed #cbd5e1;">' + 
    '<div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">Prochaines \u00e9ch\u00e9ances</div>' +
    rec.echeances.map(function(e) { return '<div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0;"><span>' + e.label + (e.date_echeance ? ' (' + e.date_echeance + ')' : "") + '</span><strong>' + fmt(e.montant) + ' ' + (rec.monnaie || "HTG") + '</strong></div>'; }).join("") +
    (rec.total_restant_annee != null ? '<div style="display:flex;justify-content:space-between;font-size:12px;padding:6px 0 0;margin-top:4px;border-top:1px solid #e2e8f0;font-weight:700;"><span>Total restant - Année</span><strong>' + fmt(rec.total_restant_annee) + ' ' + (rec.monnaie || "HTG") + '</strong></div>' : "") +
    '</div>'
  ) : "";

  return `
    <div class="receipt" style="width:${widthPx}px;font-family:'Segoe UI',Arial,sans-serif;color:#1e293b;border:2px solid #1e2a78;border-radius:12px;padding:26px 24px;background:#fff;">
      <div style="text-align:center;border-bottom:2px dashed #cbd5e1;padding-bottom:16px;margin-bottom:16px;">
        ${logoUrl
          ? '<img src="' + logoUrl + '" crossorigin="anonymous" style="width:60px;height:60px;border-radius:14px;object-fit:cover;margin:0 auto 8px;display:block;" />'
          : '<div style="width:60px;height:60px;border-radius:14px;background:linear-gradient(135deg,#1e2a78,#2563eb);color:#fff;display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:800;margin:0 auto 8px;">CAPV</div>'}
        <div style="font-size:16px;font-weight:800;color:#1e2a78;font-family:Georgia,serif;">${nomEtab}</div>
        <div style="font-size:11px;color:#64748b;margin-top:3px;letter-spacing:1px;text-transform:uppercase;">${rec.type_label || "Re\u00e7u"}</div>
      </div>
      <div style="text-align:center;font-size:14px;font-weight:800;color:#c79a3a;letter-spacing:1px;background:#fdf6e3;padding:8px;border-radius:8px;margin-bottom:14px;">${rec.receipt_number}</div>
      ${lignesHtml}
      <div class="rl" style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #e2e8f0;font-size:13px;"><span style="color:#64748b;">Date</span><strong>${rec.created_at || ""}</strong></div>
      <div class="rl" style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #e2e8f0;font-size:13px;"><span style="color:#64748b;">Caissier</span><strong>${rec.code_caissier || "-"}</strong></div>
      ${changeHtml}
      ${soldeHtml}
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px;background:${rec.statut_annule ? "#94a3b8" : "#1e2a78"};color:#fff;padding:13px 15px;border-radius:10px;"><span style="font-size:13px;opacity:.85;">${rec.montant_label || "Montant"}</span><strong style="font-size:19px;font-family:Georgia,serif;">${fmt(rec.montant)} ${rec.monnaie || "HTG"}</strong></div>
      <div style="text-align:center;margin-top:8px;font-size:11px;font-style:italic;color:#475569;">${montantLettres}</div>
      ${rec.statut_annule ? '<div style="text-align:center;margin-top:10px;font-size:12px;font-weight:800;color:#dc2626;letter-spacing:1px;">ANNUL\u00c9</div>' : ''}
      ${echeancesHtml}
      ${rec.note ? '<div style="text-align:center;margin-top:10px;font-size:11px;color:#b45309;font-weight:600;">' + rec.note + '</div>' : ''}
      ${qrUrl ? '<div style="text-align:center;margin-top:12px;"><img src="' + qrUrl + '" style="width:70px;height:70px;object-fit:contain;" /></div>' : ''}<div style="text-align:center;margin-top:8px;font-size:11px;color:#94a3b8;">${nomEtab}</div><div style="text-align:center;margin-top:8px;font-size:9px;color:#cbd5e1;">Propuls\u00e9 par Worlfinity DevLab</div>
    </div>`;
}

export function printUnifiedReceipt(rec, settings) {
  const html = buildUnifiedReceiptHTML(rec, settings);
  const w = window.open("", "_blank", "width=460,height=680");
  if (w) { w.document.write("<html><head><meta charset='utf-8'><title>" + rec.receipt_number + "</title></head><body style='display:flex;justify-content:center;padding:20px;'>" + html + "<script>window.onload=function(){setTimeout(function(){window.print();},250);};<\/script></body></html>"); w.document.close(); }
}

export async function downloadUnifiedReceiptPDF(rec, settings) {
  const html = buildUnifiedReceiptHTML(rec, settings);
  const container = document.createElement("div");
  container.style.position = "fixed"; container.style.left = "-9999px"; container.style.top = "0";
  container.innerHTML = html;
  document.body.appendChild(container);
  const el = container.querySelector(".receipt");
  try {
    await waitForImages(el);
    const canvas = await html2canvas(el, { scale: 3, useCORS: true, backgroundColor: "#ffffff" });
    const imgData = canvas.toDataURL("image/png");
    const { pdfFormat } = getFormatDimensions(settings);
    const pdf = new jsPDF({ unit: "mm", format: pdfFormat });
    const pageW = pdf.internal.pageSize.getWidth();
    const imgW = pageW - 20;
    const imgH = (canvas.height * imgW) / canvas.width;
    pdf.addImage(imgData, "PNG", 10, 10, imgW, imgH);
    pdf.save(rec.receipt_number + ".pdf");
  } catch (e) { alert("Erreur lors de la g\u00e9n\u00e9ration du PDF"); }
  finally { document.body.removeChild(container); }
}
// Conversion d'un nombre en toutes lettres (francais), pour les recus
const UNITES = ["", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize", "dix-sept", "dix-huit", "dix-neuf"];
const DIZAINES = ["", "", "vingt", "trente", "quarante", "cinquante", "soixante", "soixante", "quatre-vingt", "quatre-vingt"];

function convertirMoins100(n) {
  if (n < 20) return UNITES[n];
  const d = Math.floor(n / 10);
  const u = n % 10;
  if (d === 7 || d === 9) {
    // soixante-dix (70-79) et quatre-vingt-dix (90-99)
    return DIZAINES[d] + "-" + UNITES[10 + u];
  }
  if (u === 0) {
    return DIZAINES[d] + (d === 8 ? "s" : "");
  }
  if (u === 1 && d !== 8) {
    return DIZAINES[d] + " et un";
  }
  return DIZAINES[d] + "-" + UNITES[u];
}

function convertirMoins1000(n) {
  if (n < 100) return convertirMoins100(n);
  const c = Math.floor(n / 100);
  const reste = n % 100;
  let mot = (c === 1 ? "cent" : UNITES[c] + " cent");
  if (reste === 0 && c > 1) mot += "s";
  if (reste > 0) mot += " " + convertirMoins100(reste);
  return mot;
}

export function nombreEnLettres(n) {
  n = Math.round(Number(n) || 0);
  if (n === 0) return "z\u00e9ro";
  if (n < 0) return "moins " + nombreEnLettres(-n);

  const millions = Math.floor(n / 1000000);
  const milliers = Math.floor((n % 1000000) / 1000);
  const reste = n % 1000;

  let parties = [];
  if (millions > 0) {
    parties.push((millions === 1 ? "un million" : convertirMoins1000(millions) + " millions"));
  }
  if (milliers > 0) {
    parties.push((milliers === 1 ? "mille" : convertirMoins1000(milliers) + " mille"));
  }
  if (reste > 0) {
    parties.push(convertirMoins1000(reste));
  }
  return parties.join(" ");
}

export function montantEnLettres(n, monnaie) {
  const unite = monnaie === "USD" ? "dollar" : "gourde";
  const nb = Math.round(Number(n) || 0);
  const pluriel = nb > 1 ? "s" : "";
  return nombreEnLettres(nb).charAt(0).toUpperCase() + nombreEnLettres(nb).slice(1) + " " + unite + pluriel;
}
