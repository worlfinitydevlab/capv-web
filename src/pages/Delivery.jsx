import React, { useState, useEffect } from "react";
import { useAuth } from "../AuthContext.jsx";
import { getAuthedClient } from "../supabaseClient.js";
import { useDevice } from "../DeviceContext.jsx";
import EmployeeVerifyModal from "../components/EmployeeVerifyModal.jsx";

export default function Delivery() {
  const { token, user } = useAuth();
  const { hasCapability, loaded: deviceLoaded } = useDevice();
  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);
  const [pending, setPending] = useState([]);
  const [selSale, setSelSale] = useState(null);
  const [checked, setChecked] = useState({});
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [tab, setTab] = useState("attente");
  const [history, setHistory] = useState(null);
  const [histPeriode, setHistPeriode] = useState("jour");
  const [histView, setHistView] = useState("apercu");

  const prenom = user ? (user.prenom || (user.nom_complet || user.username).split(" ")[0]) : "collegue";
  const fmt = (n) => Number(n || 0).toLocaleString();

  const enrichSales = async (supabase, sales) => {
    const studentIds = [...new Set(sales.filter((s) => s.student_uuid).map((s) => s.student_uuid))];
    const customerIds = [...new Set(sales.filter((s) => s.customer_uuid).map((s) => s.customer_uuid))];
    const { data: studs } = studentIds.length ? await supabase.from("students").select("id, matricule, nom, prenom, photo").in("id", studentIds) : { data: [] };
    const { data: custs } = customerIds.length ? await supabase.from("customers").select("id, nom, telephone").in("id", customerIds) : { data: [] };
    const saleIds = sales.map((s) => s.id);
    const { data: allLines } = saleIds.length ? await supabase.from("sale_items").select("*").in("sale_uuid", saleIds) : { data: [] };
    return sales.map((s) => {
      const st = (studs || []).find((x) => x.id === s.student_uuid);
      const cu = (custs || []).find((x) => x.id === s.customer_uuid);
      return {
        ...s,
        clientNom: st ? (st.prenom + " " + st.nom) : (cu ? cu.nom : "-"),
        lines: (allLines || []).filter((l) => l.sale_uuid === s.id)
      };
    });
  };

  const loadPending = async () => {
    if (!token) return;
    const supabase = getAuthedClient(token);
    const { data } = await supabase.from("sales").select("*").in("statut", ["reserve", "partiel"]).order("created_at", { ascending: false });
    const enriched = await enrichSales(supabase, data || []);
    setPending(enriched);
  };
  useEffect(() => { loadPending(); }, [token]);

  useEffect(() => {
    if (!search.trim()) { setResults([]); return; }
    const t = setTimeout(async () => {
      const filtered = pending.filter((s) =>
        (s.receipt_number || "").toLowerCase().includes(search.toLowerCase()) ||
        (s.clientNom || "").toLowerCase().includes(search.toLowerCase())
      );
      setResults(filtered);
    }, 250);
    return () => clearTimeout(t);
  }, [search, pending]);

  const openSale = (s) => {
    setSelSale(s);
    const init = {};
    s.lines.forEach((l) => { if (l.etat_livraison !== "livre") init[l.id] = true; });
    setChecked(init);
    setResults([]); setSearch("");
  };

  const toggle = (lineId) => setChecked({ ...checked, [lineId]: !checked[lineId] });

  const allChecked = selSale && selSale.lines.filter((l) => l.etat_livraison !== "livre").every((l) => checked[l.id]);
  const toggleAll = () => {
    const next = {};
    const val = !allChecked;
    selSale.lines.forEach((l) => { if (l.etat_livraison !== "livre") next[l.id] = val; });
    setChecked(next);
  };

  const nbChecked = Object.keys(checked).filter((k) => checked[k]).length;

  const requestDeliver = () => {
    setError("");
    if (!hasCapability("livraison")) { setError("Cet appareil n'est pas autorise a effectuer des livraisons."); return; }
    const line_ids = Object.keys(checked).filter((k) => checked[k]);
    if (line_ids.length === 0) { setError(prenom + ", cochez au moins un article a livrer."); return; }
    setConfirmOpen(true);
  };

  const confirmDeliver = async (employe) => {
    setConfirmOpen(false);
    try {
      const supabase = getAuthedClient(token);
      const line_ids = Object.keys(checked).filter((k) => checked[k]);
      for (const lineId of line_ids) {
        const line = selSale.lines.find((l) => l.id === lineId);
        if (!line || line.etat_livraison === "livre") continue;
        await supabase.from("sale_items").update({ etat_livraison: "livre", modified_by: user.username }).eq("id", lineId);
      }
      const { data: updatedLines } = await supabase.from("sale_items").select("*").eq("sale_uuid", selSale.id);
      const restant = (updatedLines || []).filter((l) => l.etat_livraison !== "livre").length;
      const nouveauStatut = restant === 0 ? "livre" : "partiel";
      const dateLiv = restant === 0 ? new Date().toISOString() : selSale.date_livraison;
      await supabase.from("sales").update({
        statut: nouveauStatut, date_livraison: dateLiv, livre_par: employe.nom, modified_by: user.username
      }).eq("id", selSale.id);

      if (nouveauStatut === "livre") {
        setMsg(prenom + ", bravo ! La commande " + selSale.receipt_number + " a ete entierement livree par " + employe.nom + ". " + nbChecked + " article(s) remis au client.");
        setSelSale(null);
      } else {
        setMsg(prenom + ", " + nbChecked + " article(s) livre(s) avec succes par " + employe.nom + ". Il reste des articles a remettre pour cette commande.");
        setSelSale({ ...selSale, lines: updatedLines, statut: nouveauStatut });
        const init = {};
        (updatedLines || []).forEach((l) => { if (l.etat_livraison !== "livre") init[l.id] = true; });
        setChecked(init);
      }
      loadPending();
    } catch (e) { setError(e.message || "Erreur lors de la livraison"); }
  };

  const loadHistory = async (p) => {
    if (!token) return;
    const per = p || histPeriode;
    const today = new Date();
    let dDebut, dFin;
    if (per === "jour") { dDebut = today.toISOString().slice(0, 10); dFin = dDebut; }
    else { dDebut = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-01"; dFin = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()).padStart(2, "0"); }

    const supabase = getAuthedClient(token);
    const { data } = await supabase.from("sales").select("*").eq("statut", "livre");
    const filtered = (data || []).filter((s) => s.date_livraison && s.date_livraison.slice(0, 10) >= dDebut && s.date_livraison.slice(0, 10) <= dFin);
    const enriched = await enrichSales(supabase, filtered);

    const parArticle = {};
    const parClient = {};
    for (const s of enriched) {
      for (const l of s.lines) {
        if (!parArticle[l.item_nom]) parArticle[l.item_nom] = { nom: l.item_nom, qte: 0, total: 0 };
        parArticle[l.item_nom].qte += Number(l.quantite);
        parArticle[l.item_nom].total += Number(l.quantite) * Number(l.prix_unitaire);
      }
      if (!parClient[s.clientNom]) parClient[s.clientNom] = { nom: s.clientNom, nb: 0, total: 0 };
      parClient[s.clientNom].nb++;
      parClient[s.clientNom].total += Number(s.montant_total);
    }
    const total = enriched.reduce((a, s) => a + Number(s.montant_total), 0);
    setHistory({
      periode: { debut: dDebut, fin: dFin },
      livraisons: enriched, nb: enriched.length, total,
      par_article: Object.values(parArticle).sort((a, b) => b.qte - a.qte),
      par_client: Object.values(parClient).sort((a, b) => b.total - a.total)
    });
  };

  const printDeliveryReport = () => {
    if (!history) return;
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) return;
    w.document.write("<html><head><meta charset='utf-8'><title>Rapport de livraison</title><style>body{font-family:Segoe UI,Arial;padding:30px}table{width:100%;border-collapse:collapse;margin:12px 0}th,td{padding:8px 12px;text-align:left;border-bottom:1px solid #e2e8f0}th{background:#1e2a78;color:#fff;font-size:12px}h2{color:#1e2a78;font-family:Georgia,serif}h3{color:#1e2a78;margin:16px 0 8px;font-size:14px}.kpi{display:inline-block;padding:12px 20px;margin:4px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;text-align:center}.kpi strong{display:block;font-size:18px;color:#1e2a78}.kpi span{font-size:11px;color:#64748b}.footer{text-align:center;margin-top:20px;font-size:10px;color:#94a3b8}</style></head><body>");
    w.document.write("<h2>Rapport de livraison</h2><p style='color:#64748b'>Periode : " + history.periode.debut + " au " + history.periode.fin + "</p>");
    w.document.write("<div class='kpi'><strong>" + history.nb + "</strong><span>Livraisons</span></div>");
    w.document.write("<div class='kpi'><strong>" + fmt(history.total) + " HTG</strong><span>Valeur totale</span></div>");
    if (history.par_article.length > 0) { w.document.write("<h3>Par article</h3><table><tr><th>Article</th><th>Quantite</th><th>Valeur</th></tr>"); history.par_article.forEach(function(a) { w.document.write("<tr><td>" + a.nom + "</td><td>" + a.qte + "</td><td>" + fmt(a.total) + " HTG</td></tr>"); }); w.document.write("</table>"); }
    if (history.par_client.length > 0) { w.document.write("<h3>Par client</h3><table><tr><th>Client</th><th>Commandes</th><th>Valeur</th></tr>"); history.par_client.forEach(function(c) { w.document.write("<tr><td>" + c.nom + "</td><td>" + c.nb + "</td><td>" + fmt(c.total) + " HTG</td></tr>"); }); w.document.write("</table>"); }
    w.document.write("<h3>Detail des livraisons</h3><table><tr><th>Recu</th><th>Date</th><th>Client</th><th>Articles</th><th>Total</th><th>Livre par</th></tr>");
    history.livraisons.forEach(function(s) { w.document.write("<tr><td>" + s.receipt_number + "</td><td>" + (s.date_livraison || s.date_emission).slice(0,10) + "</td><td>" + s.clientNom + "</td><td>" + s.lines.length + "</td><td>" + fmt(s.montant_total) + " HTG</td><td>" + (s.livre_par || "-") + "</td></tr>"); });
    w.document.write("</table><div class='footer'>Propulse par Worlfinity DevLab</div><script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script></body></html>");
    w.document.close();
  };

  if (deviceLoaded && !hasCapability("livraison")) {
    return (
      <div className="page">
        <div className="page-header"><h1 className="page-title">Livraison</h1></div>
        <div className="dash-placeholder">
          <p><strong>Cet appareil n'est pas autorise a effectuer des livraisons.</strong></p>
          <p style={{ marginTop: "10px", fontSize: "13px" }}>Demandez a un administrateur d'activer cette capacite pour cet appareil dans la page "Appareils".</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Livraison</h1>
        <p className="page-subtitle">{prenom}, vous avez {pending.length} commande(s) en attente de livraison</p>
      </div>

      <div className="store-tabs" style={{ marginBottom: "18px" }}>
        <button className={"store-tab" + (tab === "attente" ? " active" : "")} onClick={() => setTab("attente")}>En attente ({pending.length})</button>
        <button className={"store-tab" + (tab === "historique" ? " active" : "")} onClick={() => { setTab("historique"); loadHistory(); }}>Historique & Rapport</button>
      </div>

      {msg && (
        <div style={{ background: "linear-gradient(135deg, #065f46, #059669)", color: "#fff", padding: "16px 22px", borderRadius: "12px", marginBottom: "18px", display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 4px 16px rgba(5,150,105,0.2)" }}>
          <span style={{ fontSize: "14px" }}>{msg}</span>
          <button onClick={() => setMsg("")} style={{ background: "none", border: "none", color: "#fff", fontSize: "18px", cursor: "pointer" }}>x</button>
        </div>
      )}
      {error && <div className="login-error" style={{ maxWidth: "600px", marginBottom: "16px" }}>{error}</div>}

      {tab === "attente" && !selSale && (
        <>
          <div className="cashier-search" style={{ marginBottom: "22px" }}>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un recu (CAPV-V-...) ou nom du client..." autoFocus />
            {results.length > 0 && (
              <div className="search-dropdown">
                {results.map((s) => (
                  <div key={s.id} className="search-item" onClick={() => openSale(s)}>
                    <div style={{ flex: 1 }}>
                      <strong style={{ color: "var(--accent)" }}>{s.receipt_number}</strong>
                      <div style={{ fontSize: "12px", color: "var(--text-dim)" }}>{s.clientNom} — {s.lines.length} article(s) — {fmt(s.montant_total)} HTG</div>
                    </div>
                    {s.statut === "partiel" ? <span className="badge badge-blue">Partiel</span> : <span className="badge badge-gold">Reserve</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="table-card">
            <h3 className="form-card-title" style={{ padding: "16px 20px 0" }}>Commandes en attente de livraison</h3>
            <table className="data-table">
              <thead><tr><th>Recu</th><th>Date</th><th>Client</th><th>Articles</th><th>Total</th><th>Statut</th><th>Expire le</th><th>Action</th></tr></thead>
              <tbody>
                {pending.length === 0 && <tr><td colSpan="8" className="table-empty">{prenom}, aucune commande en attente. Bon travail !</td></tr>}
                {pending.map((s) => {
                  const expired = s.date_expiration && new Date(s.date_expiration) < new Date();
                  return (
                    <tr key={s.id} style={{ background: expired ? "#fef2f2" : "transparent" }}>
                      <td><strong style={{ color: "var(--accent)" }}>{s.receipt_number}</strong></td>
                      <td>{s.date_emission ? s.date_emission.slice(0, 10) : ""}</td>
                      <td><strong>{s.clientNom}</strong></td>
                      <td>{s.lines.length} article(s)</td>
                      <td><strong>{fmt(s.montant_total)} HTG</strong></td>
                      <td>{s.statut === "partiel" ? <span className="badge badge-blue">Partiel</span> : <span className="badge badge-gold">Reserve</span>}</td>
                      <td style={{ color: expired ? "var(--err)" : "var(--text-dim)", fontWeight: expired ? 700 : 400 }}>{s.date_expiration ? s.date_expiration.slice(0, 10) : "-"}{expired ? " (expire !)" : ""}</td>
                      <td><button className="btn-sm btn-green" onClick={() => openSale(s)}>Livrer</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "attente" && selSale && (
        <>
          <div className="student-banner" style={{ background: "linear-gradient(135deg, var(--gold) 0%, #f5deb3 100%)", color: "var(--navy)" }}>
            <div className="student-banner-photo-empty" style={{ background: "rgba(255,255,255,0.35)", color: "var(--navy)" }}>{(selSale.clientNom[0] || "?")}</div>
            <div>
              <div className="student-banner-name" style={{ color: "var(--navy)" }}>{selSale.clientNom}</div>
              <div className="student-banner-mat" style={{ color: "var(--navy)", opacity: 0.8 }}>Recu {selSale.receipt_number}</div>
              <div style={{ fontSize: "13px", marginTop: "4px", fontWeight: 600 }}>Emis le {selSale.date_emission ? selSale.date_emission.slice(0,10) : ""} — Expire le {selSale.date_expiration ? selSale.date_expiration.slice(0,10) : ""}</div>
            </div>
            <button className="btn-gray-cancel btn-sm" style={{ marginLeft: "auto" }} onClick={() => setSelSale(null)}>Retour</button>
          </div>

          <div className="table-card" style={{ marginBottom: "20px" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: "50px" }}><input type="checkbox" checked={allChecked} onChange={toggleAll} /></th>
                  <th>Article</th><th>Quantite</th><th>Prix</th><th>Etat</th>
                </tr>
              </thead>
              <tbody>
                {selSale.lines.map((l) => (
                  <tr key={l.id} style={{ opacity: l.etat_livraison === "livre" ? 0.5 : 1 }}>
                    <td>
                      {l.etat_livraison === "livre"
                        ? <span className="badge badge-ok">OK</span>
                        : <input type="checkbox" checked={!!checked[l.id]} onChange={() => toggle(l.id)} />}
                    </td>
                    <td><strong>{l.item_nom}</strong></td>
                    <td>{l.quantite}</td>
                    <td>{fmt(l.prix_unitaire * l.quantite)} HTG</td>
                    <td>{l.etat_livraison === "livre" ? <span className="badge badge-ok">Livre</span> : <span className="badge badge-gold">A remettre</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button className="btn-primary" onClick={requestDeliver}>
            Confirmer la livraison ({nbChecked} article(s) coche(s))
          </button>
        </>
      )}

      {tab === "historique" && (
        <div>
          <div style={{ display: "flex", gap: "10px", marginBottom: "18px", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", gap: "10px" }}>
              {["jour", "mois"].map((p) => (
                <button key={p} className={"store-tab" + (histPeriode === p ? " active" : "")} onClick={() => { setHistPeriode(p); setHistView("apercu"); loadHistory(p); }}>
                  {p === "jour" ? "Aujourd'hui" : "Ce mois"}
                </button>
              ))}
            </div>
            {history && histView === "apercu" && <button className="btn-sm btn-blue" onClick={printDeliveryReport}>Imprimer le rapport</button>}
            {histView !== "apercu" && <button className="btn-sm btn-gray-cancel" onClick={() => setHistView("apercu")}>Retour</button>}
          </div>

          {history && histView === "apercu" && (
            <>
              <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)", marginBottom: "20px" }}>
                <div className="kpi-card"><div className="kpi-label">Livraisons</div><div className="kpi-value">{history.nb}</div></div>
                <div className="kpi-card"><div className="kpi-label">Valeur totale</div><div className="kpi-value" style={{ color: "var(--ok)" }}>{fmt(history.total)} HTG</div></div>
                <div className="kpi-card" onClick={() => setHistView("articles")} style={{ cursor: "pointer", borderLeft: "4px solid var(--accent)" }}><div className="kpi-label">Articles livres</div><div className="kpi-value" style={{ color: "var(--accent)" }}>{history.par_article.length}</div><div className="kpi-hint">Cliquez pour details</div></div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "18px", marginBottom: "20px" }}>
                <div className="form-card">
                  <h3 className="form-card-title">Par article</h3>
                  {history.par_article.length === 0 ? <p style={{ color: "var(--text-soft)", fontSize: "13px" }}>Aucune donnee.</p> : (
                    <table className="data-table"><thead><tr><th>Article</th><th>Qte</th><th>Valeur</th></tr></thead><tbody>
                      {history.par_article.map((a, i) => <tr key={i}><td><strong>{a.nom}</strong></td><td>{a.qte}</td><td><strong>{fmt(a.total)} HTG</strong></td></tr>)}
                    </tbody></table>
                  )}
                </div>
                <div className="form-card">
                  <h3 className="form-card-title">Par client</h3>
                  {history.par_client.length === 0 ? <p style={{ color: "var(--text-soft)", fontSize: "13px" }}>Aucune donnee.</p> : (
                    <table className="data-table"><thead><tr><th>Client</th><th>Commandes</th><th>Valeur</th></tr></thead><tbody>
                      {history.par_client.map((c, i) => <tr key={i}><td><strong>{c.nom}</strong></td><td>{c.nb}</td><td><strong>{fmt(c.total)} HTG</strong></td></tr>)}
                    </tbody></table>
                  )}
                </div>
              </div>

              <div className="form-card">
                <h3 className="form-card-title">Detail des livraisons ({history.nb})</h3>
                {history.livraisons.length === 0 ? <p style={{ color: "var(--text-soft)", fontSize: "13px" }}>{prenom}, aucune livraison sur cette periode.</p> : (
                  <table className="data-table"><thead><tr><th>Recu</th><th>Date</th><th>Client</th><th>Articles</th><th>Total</th><th>Livre par</th></tr></thead><tbody>
                    {history.livraisons.map((s) => <tr key={s.id}><td><strong style={{ color: "var(--accent)" }}>{s.receipt_number}</strong></td><td>{(s.date_livraison || s.date_emission).slice(0,10)}</td><td>{s.clientNom}</td><td>{s.lines.length}</td><td><strong>{fmt(s.montant_total)} HTG</strong></td><td>{s.livre_par || "-"}</td></tr>)}
                  </tbody></table>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {confirmOpen && (
        <EmployeeVerifyModal
          title="Confirmer la livraison"
          requiredFonction="Magasinier"
          summary={
            <>
              <p style={{ fontSize: "14px", color: "var(--navy)", margin: "0 0 6px", fontWeight: 700 }}>Commande {selSale.receipt_number}</p>
              <p style={{ fontSize: "13px", color: "var(--text-dim)", margin: "0 0 4px" }}>Client : <strong>{selSale.clientNom}</strong></p>
              <p style={{ fontSize: "13px", color: "var(--text-dim)", margin: "0 0 4px" }}>Articles a livrer : <strong>{nbChecked}</strong></p>
              <p style={{ fontSize: "13px", color: "var(--text-dim)", margin: 0 }}>Montant total : <strong>{fmt(selSale.montant_total)} HTG</strong></p>
            </>
          }
          onVerified={confirmDeliver}
          onClose={() => setConfirmOpen(false)}
        />
      )}
    </div>
  );
}