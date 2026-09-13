import React, { useState, useEffect } from "react";
import { useAuth } from "../AuthContext.jsx";
import { getAuthedClient } from "../supabaseClient.js";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { waitForImages } from "../receiptTemplate.js";

function fmtDate(d) {
  return d.toISOString().slice(0, 10);
}
function computeRange(periode) {
  const today = new Date();
  const fin = fmtDate(today);
  if (periode === "jour") return { debut: fin, fin };
  if (periode === "semaine") {
    const d = new Date(today);
    const day = d.getDay() || 7;
    d.setDate(d.getDate() - day + 1);
    return { debut: fmtDate(d), fin };
  }
  if (periode === "mois") {
    const d = new Date(today.getFullYear(), today.getMonth(), 1);
    return { debut: fmtDate(d), fin };
  }
  if (periode === "annee") {
    const d = new Date(today.getFullYear(), 0, 1);
    return { debut: fmtDate(d), fin };
  }
  return { debut: fin, fin };
}

export default function DepensesRapports({ onClose }) {
  const { token } = useAuth();
  const [tab, setTab] = useState("resume");
  const [periode, setPeriode] = useState("mois");
  const [range, setRange] = useState(computeRange("mois"));
  const [caisse, setCaisse] = useState("toutes");
  const [resume, setResume] = useState(null);
  const [mouvement, setMouvement] = useState(null);
  const [error, setError] = useState("");

  const fmt = (n) => Number(n || 0).toLocaleString();

  const choosePeriode = (p) => {
    setPeriode(p);
    if (p !== "personnalise") setRange(computeRange(p));
  };

  const inRange = (d) => d && d.slice(0, 10) >= range.debut && d.slice(0, 10) <= range.fin;

  const loadResume = async () => {
    setError("");
    try {
      const supabase = getAuthedClient(token);
      let query = supabase.from("expenses").select("categorie, caisse_type, montant, created_at").in("statut", ["finalisee", "approuve"]);
      if (caisse !== "toutes") query = query.eq("caisse_type", caisse);
      const { data } = await query;
      const filtered = (data || []).filter((e) => inRange(e.created_at));
      const parCategorie = {};
      for (const r of filtered) {
        const cat = r.categorie || "Sans categorie";
        if (!parCategorie[cat]) parCategorie[cat] = { categorie: cat, grande: 0, petite: 0, total: 0, nb: 0 };
        if (r.caisse_type === "grande") parCategorie[cat].grande += Number(r.montant);
        else if (r.caisse_type === "petite") parCategorie[cat].petite += Number(r.montant);
        parCategorie[cat].total += Number(r.montant);
        parCategorie[cat].nb += 1;
      }
      const liste = Object.values(parCategorie).sort((a, b) => b.total - a.total);
      const totalGeneral = liste.reduce((a, c) => a + c.total, 0);
      setResume({ liste, totalGeneral });
    } catch (e) { setError(e.message || "Erreur"); }
  };

  const loadMouvement = async () => {
    setError("");
    if (caisse === "toutes") { setError("Choisissez Grande ou Petite Caisse pour le mouvement chronologique."); setMouvement(null); return; }
    try {
      const supabase = getAuthedClient(token);
      const mouvements = [];

      if (caisse === "grande") {
        const { data: pays } = await supabase.from("payments").select("receipt_number, created_at, montant").eq("statut", "valide");
        (pays || []).filter((r) => inRange(r.created_at)).forEach((r) => mouvements.push({ ref: r.receipt_number, heure: r.created_at, type: "Frais scolaires", entree: Number(r.montant), sortie: 0 }));
        const { data: sales } = await supabase.from("sales").select("receipt_number, date_emission, montant_total").neq("statut", "annule");
        (sales || []).filter((r) => inRange(r.date_emission)).forEach((r) => mouvements.push({ ref: r.receipt_number, heure: r.date_emission, type: "Vente magasin", entree: Number(r.montant_total), sortie: 0 }));
        const { data: miscs } = await supabase.from("misc_fee_payments").select("receipt_number, created_at, montant").eq("statut", "valide");
        (miscs || []).filter((r) => inRange(r.created_at)).forEach((r) => mouvements.push({ ref: r.receipt_number, heure: r.created_at, type: "Frais divers", entree: Number(r.montant), sortie: 0 }));
        const { data: progs } = await supabase.from("program_payments").select("receipt_number, created_at, montant").eq("statut", "valide");
        (progs || []).filter((r) => inRange(r.created_at)).forEach((r) => mouvements.push({ ref: r.receipt_number, heure: r.created_at, type: "Programme", entree: Number(r.montant), sortie: 0 }));
        const { data: decs } = await supabase.from("caisse_decaissements").select("numero, created_at, montant, motif, date").eq("caisse_type", "grande").neq("statut", "annule");
        (decs || []).filter((r) => r.date >= range.debut && r.date <= range.fin).forEach((r) => mouvements.push({ ref: r.numero, heure: r.created_at, type: r.motif === "Transfert vers Petite Caisse" ? "Transfert vers Petite Caisse" : "Decaissement", entree: 0, sortie: Number(r.montant) }));
      } else {
        const { data: decs } = await supabase.from("caisse_decaissements").select("numero, created_at, montant, motif, date").eq("caisse_type", "grande").eq("motif", "Transfert vers Petite Caisse").neq("statut", "annule");
        (decs || []).filter((r) => r.date >= range.debut && r.date <= range.fin).forEach((r) => mouvements.push({ ref: r.numero, heure: r.created_at, type: "Alimentation recue", entree: Number(r.montant), sortie: 0 }));
        const { data: exps } = await supabase.from("expenses").select("id, created_at, montant").eq("caisse_type", "petite").eq("statut", "approuve");
        (exps || []).filter((r) => inRange(r.created_at)).forEach((r) => mouvements.push({ ref: "DEP-" + r.id, heure: r.created_at, type: "Depense", entree: 0, sortie: Number(r.montant) }));
      }

      mouvements.sort((a, b) => new Date(a.heure) - new Date(b.heure));
      let running = 0;
      for (const m of mouvements) { running += m.entree - m.sortie; m.solde = running; }
      const totalEntree = mouvements.reduce((a, m) => a + m.entree, 0);
      const totalSortie = mouvements.reduce((a, m) => a + m.sortie, 0);
      setMouvement({ mouvements, totalEntree, totalSortie, soldeFinal: running });
    } catch (e) { setError(e.message || "Erreur"); }
  };

  useEffect(() => {
    if (!token) return;
    if (tab === "resume") loadResume();
    else loadMouvement();
  }, [tab, range, caisse, token]);

  const periodeLabel = periode === "jour" ? "Aujourd'hui" : periode === "semaine" ? "Cette semaine" : periode === "mois" ? "Ce mois" : periode === "annee" ? "Cette annee" : (range.debut + " au " + range.fin);
  const caisseLabel = caisse === "grande" ? "Grande Caisse" : caisse === "petite" ? "Petite Caisse" : "Toutes les caisses";

  const buildResumeHtml = () => {
    let html = "<div style='font-family:Arial,sans-serif;padding:10px;'>";
    html += "<h1 style='color:#1e2a78;font-size:18px;'>Rapport des depenses - " + caisseLabel + "</h1>";
    html += "<p>Periode : " + periodeLabel + "</p>";
    html += "<p><strong>Total : " + fmt(resume.totalGeneral) + " HTG</strong></p>";
    html += "<table style='width:100%;border-collapse:collapse;margin-top:14px;'><tr><th style='border:1px solid #ddd;padding:8px;background:#f1f5f9;text-align:left;'>Categorie</th><th style='border:1px solid #ddd;padding:8px;background:#f1f5f9;text-align:left;'>Grande Caisse</th><th style='border:1px solid #ddd;padding:8px;background:#f1f5f9;text-align:left;'>Petite Caisse</th><th style='border:1px solid #ddd;padding:8px;background:#f1f5f9;text-align:left;'>Total</th><th style='border:1px solid #ddd;padding:8px;background:#f1f5f9;text-align:left;'>Operations</th></tr>";
    resume.liste.forEach(function(c) {
      html += "<tr><td style='border:1px solid #ddd;padding:8px;'>" + c.categorie + "</td><td style='border:1px solid #ddd;padding:8px;'>" + fmt(c.grande) + " HTG</td><td style='border:1px solid #ddd;padding:8px;'>" + fmt(c.petite) + " HTG</td><td style='border:1px solid #ddd;padding:8px;'>" + fmt(c.total) + " HTG</td><td style='border:1px solid #ddd;padding:8px;'>" + c.nb + "</td></tr>";
    });
    html += "</table></div>";
    return html;
  };

  const printResume = () => {
    if (!resume) return;
    const html = buildResumeHtml();
    const w = window.open("", "_blank", "width=800,height=900");
    if (!w) return;
    w.document.write("<html><head><meta charset='utf-8'><title>Rapport depenses</title></head><body>" + html + "<script>window.onload=function(){setTimeout(function(){window.print();},250);};<\/script></body></html>");
    w.document.close();
  };

  const downloadResume = async () => {
    if (!resume) return;
    const container = document.createElement("div");
    container.style.position = "fixed"; container.style.left = "0"; container.style.top = "0"; container.style.zIndex = "-1";
    container.style.width = "760px"; container.style.background = "#fff";
    container.innerHTML = buildResumeHtml();
    document.body.appendChild(container);
    try {
      await waitForImages(container);
      const canvas = await html2canvas(container, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
      const pdf = new jsPDF({ unit: "mm", format: "a4" });
      const imgW = pdf.internal.pageSize.getWidth() - 20;
      const imgH = (canvas.height * imgW) / canvas.width;
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 10, 10, imgW, imgH);
      pdf.save("rapport-depenses-" + range.debut + "-" + range.fin + ".pdf");
    } catch (e) { setError("Erreur lors de la generation du PDF"); }
    finally { document.body.removeChild(container); }
  };

  const buildMouvementHtml = () => {
    let html = "<div style='font-family:Arial,sans-serif;padding:10px;'>";
    html += "<h1 style='color:#1e2a78;font-size:18px;'>Mouvement de caisse - " + caisseLabel + "</h1>";
    html += "<p>Periode : " + periodeLabel + "</p>";
    html += "<p><strong>Entrees : " + fmt(mouvement.totalEntree) + " HTG &nbsp;|&nbsp; Sorties : " + fmt(mouvement.totalSortie) + " HTG &nbsp;|&nbsp; Solde final : " + fmt(mouvement.soldeFinal) + " HTG</strong></p>";
    html += "<table style='width:100%;border-collapse:collapse;margin-top:14px;'><tr><th style='border:1px solid #ddd;padding:6px 8px;background:#f1f5f9;text-align:left;'>Date</th><th style='border:1px solid #ddd;padding:6px 8px;background:#f1f5f9;text-align:left;'>Reference</th><th style='border:1px solid #ddd;padding:6px 8px;background:#f1f5f9;text-align:left;'>Type</th><th style='border:1px solid #ddd;padding:6px 8px;background:#f1f5f9;text-align:left;'>Entree</th><th style='border:1px solid #ddd;padding:6px 8px;background:#f1f5f9;text-align:left;'>Sortie</th><th style='border:1px solid #ddd;padding:6px 8px;background:#f1f5f9;text-align:left;'>Solde</th></tr>";
    mouvement.mouvements.forEach(function(m) {
      html += "<tr><td style='border:1px solid #ddd;padding:6px 8px;'>" + (m.heure ? m.heure.slice(0,10) : "") + "</td><td style='border:1px solid #ddd;padding:6px 8px;'>" + m.ref + "</td><td style='border:1px solid #ddd;padding:6px 8px;'>" + m.type + "</td><td style='border:1px solid #ddd;padding:6px 8px;'>" + (m.entree > 0 ? fmt(m.entree) : "-") + "</td><td style='border:1px solid #ddd;padding:6px 8px;'>" + (m.sortie > 0 ? fmt(m.sortie) : "-") + "</td><td style='border:1px solid #ddd;padding:6px 8px;'>" + fmt(m.solde) + "</td></tr>";
    });
    html += "</table></div>";
    return html;
  };

  const printMouvement = () => {
    if (!mouvement) return;
    const html = buildMouvementHtml();
    const w = window.open("", "_blank", "width=900,height=900");
    if (!w) return;
    w.document.write("<html><head><meta charset='utf-8'><title>Mouvement de caisse</title></head><body>" + html + "<script>window.onload=function(){setTimeout(function(){window.print();},250);};<\/script></body></html>");
    w.document.close();
  };

  const downloadMouvement = async () => {
    if (!mouvement) return;
    const container = document.createElement("div");
    container.style.position = "fixed"; container.style.left = "0"; container.style.top = "0"; container.style.zIndex = "-1";
    container.style.width = "900px"; container.style.background = "#fff";
    container.innerHTML = buildMouvementHtml();
    document.body.appendChild(container);
    try {
      await waitForImages(container);
      const canvas = await html2canvas(container, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
      const pdf = new jsPDF({ unit: "mm", format: "a4" });
      const imgW = pdf.internal.pageSize.getWidth() - 20;
      const imgH = (canvas.height * imgW) / canvas.width;
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 10, 10, imgW, imgH);
      pdf.save("mouvement-caisse-" + range.debut + "-" + range.fin + ".pdf");
    } catch (e) { setError("Erreur lors de la generation du PDF"); }
    finally { document.body.removeChild(container); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "800px", maxHeight: "88vh", overflowY: "auto" }}>
        <div className="modal-header"><h3>Rapports - Depenses</h3><button className="modal-close" onClick={onClose}>x</button></div>

        <div className="store-tabs" style={{ marginBottom: "16px" }}>
          <button className={"store-tab" + (tab === "resume" ? " active" : "")} onClick={() => setTab("resume")}>Resume par categorie</button>
          <button className={"store-tab" + (tab === "mouvement" ? " active" : "")} onClick={() => setTab("mouvement")}>Mouvement chronologique</button>
        </div>

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "16px", alignItems: "center" }}>
          {["jour","semaine","mois","annee","personnalise"].map((p) => (
            <button key={p} className={"btn-sm " + (periode === p ? "btn-primary" : "btn-gray-cancel")} onClick={() => choosePeriode(p)}>
              {p === "jour" ? "Aujourd'hui" : p === "semaine" ? "Cette semaine" : p === "mois" ? "Ce mois" : p === "annee" ? "Cette annee" : "Personnalise"}
            </button>
          ))}
          <select value={caisse} onChange={(e) => setCaisse(e.target.value)} style={{ padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--line)", fontSize: "13px" }}>
            <option value="toutes">Toutes les caisses</option>
            <option value="grande">Grande Caisse</option>
            <option value="petite">Petite Caisse</option>
          </select>
        </div>

        {periode === "personnalise" && (
          <div style={{ display: "flex", gap: "10px", marginBottom: "16px" }}>
            <div className="form-group" style={{ margin: 0 }}><label>Du</label><input type="date" value={range.debut} onChange={(e) => setRange({ ...range, debut: e.target.value })} /></div>
            <div className="form-group" style={{ margin: 0 }}><label>Au</label><input type="date" value={range.fin} onChange={(e) => setRange({ ...range, fin: e.target.value })} /></div>
          </div>
        )}

        {error && <div className="login-error" style={{ marginBottom: "16px" }}>{error}</div>}

        {tab === "resume" && resume && (
          <>
            <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(2, 1fr)", marginBottom: "18px" }}>
              <div className="kpi-card"><div className="kpi-label">Total periode</div><div className="kpi-value" style={{ color: "var(--err)" }}>{fmt(resume.totalGeneral)} HTG</div></div>
              <div className="kpi-card"><div className="kpi-label">Categories</div><div className="kpi-value">{resume.liste.length}</div></div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginBottom: "10px" }}>
              <button className="btn-sm btn-blue" onClick={printResume}>Imprimer</button>
              <button className="btn-sm btn-primary" onClick={downloadResume}>Telecharger PDF</button>
            </div>
            <table className="data-table">
              <thead><tr><th>Categorie</th><th>Grande Caisse</th><th>Petite Caisse</th><th>Total</th><th>Operations</th></tr></thead>
              <tbody>
                {resume.liste.length === 0 && <tr><td colSpan="5" className="table-empty">Aucune depense sur cette periode.</td></tr>}
                {resume.liste.map((c, i) => (
                  <tr key={i}>
                    <td><strong>{c.categorie}</strong></td>
                    <td>{fmt(c.grande)} HTG</td>
                    <td>{fmt(c.petite)} HTG</td>
                    <td><strong>{fmt(c.total)} HTG</strong></td>
                    <td>{c.nb}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {tab === "mouvement" && mouvement && (
          <>
            <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)", marginBottom: "18px" }}>
              <div className="kpi-card"><div className="kpi-label">Total entrees</div><div className="kpi-value" style={{ color: "var(--ok)" }}>{fmt(mouvement.totalEntree)} HTG</div></div>
              <div className="kpi-card"><div className="kpi-label">Total sorties</div><div className="kpi-value" style={{ color: "var(--err)" }}>{fmt(mouvement.totalSortie)} HTG</div></div>
              <div className="kpi-card"><div className="kpi-label">Solde final</div><div className="kpi-value" style={{ color: mouvement.soldeFinal < 0 ? "var(--err)" : "var(--navy)" }}>{fmt(mouvement.soldeFinal)} HTG</div></div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginBottom: "10px" }}>
              <button className="btn-sm btn-blue" onClick={printMouvement}>Imprimer</button>
              <button className="btn-sm btn-primary" onClick={downloadMouvement}>Telecharger PDF</button>
            </div>
            <table className="data-table">
              <thead><tr><th>Date</th><th>Reference</th><th>Type</th><th>Entree</th><th>Sortie</th><th>Solde</th></tr></thead>
              <tbody>
                {mouvement.mouvements.length === 0 && <tr><td colSpan="6" className="table-empty">Aucun mouvement sur cette periode.</td></tr>}
                {mouvement.mouvements.map((m, i) => (
                  <tr key={i}>
                    <td>{m.heure ? m.heure.slice(0, 10) : ""}</td>
                    <td><strong style={{ color: "var(--accent)" }}>{m.ref}</strong></td>
                    <td>{m.type}</td>
                    <td style={{ color: "var(--ok)" }}>{m.entree > 0 ? fmt(m.entree) : "-"}</td>
                    <td style={{ color: "var(--err)" }}>{m.sortie > 0 ? fmt(m.sortie) : "-"}</td>
                    <td><strong>{fmt(m.solde)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}