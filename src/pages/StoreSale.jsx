import React, { useState, useEffect } from "react";
import { useAuth } from "../AuthContext.jsx";
import { getAuthedClient } from "../supabaseClient.js";
import { useYear } from "../YearContext.jsx";
import { useSettings } from "../SettingsContext.jsx";
import { printUnifiedReceipt, buildUnifiedReceiptHTML, downloadUnifiedReceiptPDF } from "../receiptTemplate.js";

const inputStyle = {
  width: "100%", padding: "11px 14px", borderRadius: "10px",
  border: "1.5px solid var(--line)", background: "var(--bg-soft)", fontSize: "14px", outline: "none"
};

export default function StoreSale() {
  const { token, user } = useAuth();
  const { currentYear } = useYear();
  const { settings } = useSettings();

  const [clientType, setClientType] = useState("eleve");
  const [studentSearch, setStudentSearch] = useState("");
  const [studentResults, setStudentResults] = useState([]);
  const [selStudent, setSelStudent] = useState(null);
  const [custSearch, setCustSearch] = useState("");
  const [custResults, setCustResults] = useState([]);
  const [selCust, setSelCust] = useState(null);
  const [newCust, setNewCust] = useState({ nom: "", telephone: "" });
  const [showNewCust, setShowNewCust] = useState(false);
  const [sizePickerItem, setSizePickerItem] = useState(null);

  const [itemSearch, setItemSearch] = useState("");
  const [itemResults, setItemResults] = useState([]);
  const [showAllItems, setShowAllItems] = useState(false);
  const [allItems, setAllItems] = useState([]);
  const [itemFilter, setItemFilter] = useState("");
  const [cart, setCart] = useState([]);
  const [error, setError] = useState("");
  const [lastSale, setLastSale] = useState(null);
  const [payMontantRecu, setPayMontantRecu] = useState("");
  const [confirmSale, setConfirmSale] = useState(false);
  const [recentSales, setRecentSales] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  const fmt = (n) => Number(n).toLocaleString();
  const prenom = user ? (user.nom_complet || user.username).split(" ")[0] : "collegue";

  const loadSellable = async (q) => {
    const supabase = getAuthedClient(token);
    let query = supabase.from("items").select("*").eq("type", "vente");
    const { data: items } = await query;
    let filtered = (items || []).filter((it) => it.a_tailles || it.stock_disponible > 0);
    if (q) {
      const ql = q.toLowerCase();
      filtered = filtered.filter((it) => (it.nom || "").toLowerCase().includes(ql) || (it.code || "").toLowerCase().includes(ql));
    }
    filtered.sort((a, b) => (a.nom || "").localeCompare(b.nom || ""));
    const withVariants = await Promise.all(filtered.map(async (r) => {
      if (r.a_tailles) {
        const { data: variants } = await supabase.from("item_variants").select("*").eq("item_id", r.id).order("taille");
        const totalDispo = (variants || []).reduce((s, v) => s + v.stock_disponible, 0);
        return { ...r, stock_disponible: totalDispo, variants: variants || [] };
      }
      return r;
    }));
    return withVariants;
  };

  useEffect(() => {
    if (!studentSearch) { setStudentResults([]); return; }
    const t = setTimeout(async () => {
      const supabase = getAuthedClient(token);
      const like = "%" + studentSearch + "%";
      const { data } = await supabase.from("students").select("id, matricule, nom, prenom").or("matricule.ilike." + like + ",nom.ilike." + like + ",prenom.ilike." + like).limit(15);
      setStudentResults(data || []);
    }, 250);
    return () => clearTimeout(t);
  }, [studentSearch]);

  useEffect(() => {
    if (!custSearch) { setCustResults([]); return; }
    const t = setTimeout(async () => {
      const supabase = getAuthedClient(token);
      const like = "%" + custSearch + "%";
      const { data } = await supabase.from("customers").select("*").ilike("nom", like).limit(15);
      setCustResults(data || []);
    }, 250);
    return () => clearTimeout(t);
  }, [custSearch]);

  useEffect(() => {
    const t = setTimeout(async () => {
      const data = await loadSellable(itemSearch);
      setItemResults(data);
    }, 250);
    return () => clearTimeout(t);
  }, [itemSearch, token]);

  const openAllItems = async () => {
    const data = await loadSellable(null);
    setAllItems(data);
    setItemFilter("");
    setShowAllItems(true);
  };
  const filteredItems = allItems.filter((it) => !itemFilter || it.nom.toLowerCase().includes(itemFilter.toLowerCase()) || it.code.toLowerCase().includes(itemFilter.toLowerCase()));

  const loadRecentSales = async () => {
    if (!currentYear || !token) return;
    const supabase = getAuthedClient(token);
    const { data: sales } = await supabase.from("sales").select("*").eq("academic_year_uuid", currentYear.id).order("date_emission", { ascending: false }).limit(6);
    const withDetails = await Promise.all((sales || []).map(async (s) => {
      const { data: lines } = await supabase.from("sale_items").select("*").eq("sale_id", s.id);
      let clientNom = "-";
      if (s.student_uuid) {
        const { data: st } = await supabase.from("students").select("nom, prenom").eq("id", s.student_uuid).maybeSingle();
        if (st) clientNom = st.prenom + " " + st.nom;
      } else if (s.customer_uuid) {
        const { data: c } = await supabase.from("customers").select("nom").eq("id", s.customer_uuid).maybeSingle();
        if (c) clientNom = c.nom;
      }
      return { ...s, lines: lines || [], clientNom };
    }));
    setRecentSales(withDetails);
  };
  useEffect(() => { loadRecentSales(); }, [currentYear, token]);

  const getStep = (item) => {
    const unites = ["aune", "metre", "m", "kg", "litre", "l"];
    return unites.includes((item.unite || "").toLowerCase()) ? 0.25 : 1;
  };

  const addToCart = (item, taille) => {
    if (item.a_tailles && !taille) { setSizePickerItem(item); return; }
    const variant = item.a_tailles ? (item.variants || []).find((v) => v.taille === taille) : null;
    const maxStock = item.a_tailles ? (variant ? variant.stock_disponible : 0) : item.stock_disponible;
    const step = getStep(item);
    const existing = cart.find((c) => c.item.id === item.id && c.taille === (taille || null));
    if (existing) {
      if (existing.quantite + step <= maxStock) {
        setCart(cart.map((c) => (c.item.id === item.id && c.taille === (taille || null)) ? { ...c, quantite: Math.round((c.quantite + step) * 100) / 100 } : c));
      }
    } else {
      if (step <= maxStock) setCart([...cart, { item, quantite: step, taille: taille || null }]);
    }
    setItemSearch("");
    setSizePickerItem(null);
  };
  const changeQty = (itemId, taille, qty) => {
    const line = cart.find((c) => c.item.id === itemId && c.taille === taille);
    if (!line) return;
    const item = line.item;
    const variant = item.a_tailles ? (item.variants || []).find((v) => v.taille === taille) : null;
    const maxStock = item.a_tailles ? (variant ? variant.stock_disponible : 0) : item.stock_disponible;
    const step = getStep(item);
    const q = Math.max(step, Math.min(Number(qty) || step, maxStock));
    setCart(cart.map((c) => (c.item.id === itemId && c.taille === taille) ? { ...c, quantite: Math.round(q * 100) / 100 } : c));
  };
  const removeFromCart = (itemId, taille) => setCart(cart.filter((c) => !(c.item.id === itemId && c.taille === taille)));

  const total = cart.reduce((s, c) => s + c.item.prix_vente * c.quantite, 0);

  const createCustomer = async () => {
    if (!newCust.nom) return;
    const supabase = getAuthedClient(token);
    const { data, error: e } = await supabase.from("customers").insert({ ...newCust, modified_by: user.username }).select().single();
    if (!e) { setSelCust(data); setShowNewCust(false); setNewCust({ nom: "", telephone: "" }); }
  };

  const requestSale = () => {
    setError("");
    if (cart.length === 0) { setError(prenom + ", le panier est vide."); return; }
    if (clientType === "eleve" && !selStudent) { setError(prenom + ", choisissez un eleve."); return; }
    if (clientType === "externe" && !selCust) { setError(prenom + ", choisissez ou creez un client."); return; }
    setConfirmSale(true);
  };

  const toReceiptRec = (sale) => ({
    receipt_number: sale.receipt_number,
    type_label: "Vente magasin",
    lines: [{ label: "Client", value: sale.clientNom || "-" }].concat(
      (sale.lines || []).map((l) => ({
        label: l.item_nom + " x" + l.quantite + (l.taille ? " (" + l.taille + ")" : ""),
        value: Number(l.prix_unitaire * l.quantite).toLocaleString() + " HTG"
      }))
    ),
    montant: sale.montant_total, monnaie: sale.monnaie || "HTG",
    montant_label: "Total paye",
    code_caissier: sale.code_caissier || user.username,
    created_at: sale.date_emission,
    statut_annule: sale.statut === "annule",
    montant_recu: sale.montant_recu,
    note: "IMPORTANT : Ce recu est valable jusqu'au " + (sale.date_expiration || "") + ". Passe ce delai, les articles non recuperes seront remis en stock."
  });

  const genererRecuVente = async (supabase, academicYear) => {
    const yearLabel = academicYear ? academicYear.nom.split("-")[0] : String(new Date().getFullYear());
    const counterKey = "recu_V_WEB_" + yearLabel;
    const { data, error: e } = await supabase.rpc("next_counter_value", { counter_key: counterKey });
    if (e) throw e;
    return "CAPV-V-" + yearLabel + "-WEB-" + String(data).padStart(4, "0");
  };

  const submitSale = async () => {
    setConfirmSale(false);
    setError("");
    setSubmitting(true);
    try {
      const supabase = getAuthedClient(token);
      const delai = (settings && settings.delai_recu_heures) ? Number(settings.delai_recu_heures) : 72;
      const receipt = await genererRecuVente(supabase, currentYear);
      const now = new Date();
      const expiration = new Date(now.getTime() + delai * 3600 * 1000);

      const { data: newSale, error: e1 } = await supabase.from("sales").insert({
        receipt_number: receipt,
        student_uuid: clientType === "eleve" ? selStudent.id : null,
        customer_uuid: clientType === "externe" ? selCust.id : null,
        academic_year_uuid: currentYear ? currentYear.id : null,
        montant_total: 0, monnaie: "HTG", statut: "reserve",
        date_emission: now.toISOString(), date_expiration: expiration.toISOString(),
        user_uuid: user.id, nom_caissier: user.nom_complet,
        montant_recu: payMontantRecu ? Number(payMontantRecu) : null,
        modified_by: user.username
      }).select().single();
      if (e1) throw e1;

      let total = 0;
      const lines = [];
      for (const c of cart) {
        const sousTotal = c.item.prix_vente * c.quantite;
        total += sousTotal;
        const { data: li } = await supabase.from("sale_items").insert({
          sale_id: newSale.id, item_id: c.item.id, item_nom: c.item.nom, quantite: c.quantite,
          prix_unitaire: c.item.prix_vente, cout_unitaire: c.item.prix_achat, taille: c.item.a_tailles ? c.taille : null,
          modified_by: user.username
        }).select().single();
        lines.push(li);
        if (c.item.a_tailles) {
          const variant = (c.item.variants || []).find((v) => v.taille === c.taille);
          await supabase.from("item_variants").update({
            stock_disponible: variant.stock_disponible - c.quantite,
            stock_reserve: (variant.stock_reserve || 0) + c.quantite
          }).eq("item_id", c.item.id).eq("taille", c.taille);
        } else {
          await supabase.from("items").update({
            stock_disponible: c.item.stock_disponible - c.quantite,
            stock_reserve: (c.item.stock_reserve || 0) + c.quantite
          }).eq("id", c.item.id);
        }
      }
      await supabase.from("sales").update({ montant_total: total }).eq("id", newSale.id);

      const clientNom = clientType === "eleve" ? (selStudent.prenom + " " + selStudent.nom) : selCust.nom;
      setLastSale({ ...newSale, montant_total: total, lines, clientNom, date_expiration: expiration.toLocaleString("fr-FR") });
      setCart([]); setSelStudent(null); setSelCust(null); setStudentSearch(""); setCustSearch("");
      setPayMontantRecu("");
      loadRecentSales();
    } catch (e) { setError(e.message || "Erreur lors de l'enregistrement de la vente"); }
    setSubmitting(false);
  };

  return (
    <div>
      {lastSale && (
        <div className="receipt-banner" style={{ marginBottom: "18px" }}>
          <span>Vente enregistree — Recu <strong>{lastSale.receipt_number}</strong> ({fmt(lastSale.montant_total)} HTG). A retirer avant {lastSale.date_expiration}.</span>
          <span style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <button onClick={() => printUnifiedReceipt(toReceiptRec(lastSale), settings)} className="btn-sm btn-blue">Imprimer le recu</button>
            <button onClick={() => downloadUnifiedReceiptPDF(toReceiptRec(lastSale), settings)} className="btn-sm btn-gold">PDF</button>
            <button onClick={() => setLastSale(null)} className="receipt-banner-x">x</button>
          </span>
        </div>
      )}

      {error && <div className="login-error" style={{ maxWidth: "500px", marginBottom: "16px" }}>{error}</div>}

      <div style={{ display: "flex", gap: "20px", alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: "340px" }}>
          <div className="form-card" style={{ marginBottom: "18px" }}>
            <h3 className="form-card-title">Client</h3>
            <div className="store-tabs" style={{ marginBottom: "16px" }}>
              <button className={"store-tab" + (clientType === "eleve" ? " active" : "")} onClick={() => { setClientType("eleve"); setSelCust(null); }}>Eleve</button>
              <button className={"store-tab" + (clientType === "externe" ? " active" : "")} onClick={() => { setClientType("externe"); setSelStudent(null); }}>Client externe</button>
            </div>

            {clientType === "eleve" && (
              <div style={{ position: "relative" }}>
                {selStudent
                  ? <div className="selected-client">{selStudent.prenom} {selStudent.nom} ({selStudent.matricule}) <button onClick={() => setSelStudent(null)} className="chip-x">x</button></div>
                  : <input value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} placeholder="Rechercher un eleve..." style={inputStyle} />}
                {studentResults.length > 0 && !selStudent && (
                  <div className="search-dropdown">
                    {studentResults.map((s) => (
                      <div key={s.id} className="search-item" onClick={() => { setSelStudent(s); setStudentSearch(""); setStudentResults([]); }}>
                        <div><strong>{s.prenom} {s.nom}</strong><div style={{ fontSize: "12px", color: "var(--text-dim)" }}>{s.matricule}</div></div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {clientType === "externe" && (
              <div style={{ position: "relative" }}>
                {selCust
                  ? <div className="selected-client">{selCust.nom} {selCust.telephone ? "(" + selCust.telephone + ")" : ""} <button onClick={() => setSelCust(null)} className="chip-x">x</button></div>
                  : <>
                      <input value={custSearch} onChange={(e) => setCustSearch(e.target.value)} placeholder="Rechercher un client..." style={inputStyle} />
                      {custResults.length > 0 && (
                        <div className="search-dropdown">
                          {custResults.map((c) => (
                            <div key={c.id} className="search-item" onClick={() => { setSelCust(c); setCustSearch(""); setCustResults([]); }}>
                              <div><strong>{c.nom}</strong><div style={{ fontSize: "12px", color: "var(--text-dim)" }}>{c.telephone || ""}</div></div>
                            </div>
                          ))}
                        </div>
                      )}
                      <button className="btn-sm btn-blue" style={{ marginTop: "10px" }} onClick={() => setShowNewCust(!showNewCust)}>+ Nouveau client</button>
                      {showNewCust && (
                        <div style={{ marginTop: "12px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                          <input value={newCust.nom} onChange={(e) => setNewCust({ ...newCust, nom: e.target.value })} placeholder="Nom" style={{ ...inputStyle, flex: 1 }} />
                          <input value={newCust.telephone} onChange={(e) => setNewCust({ ...newCust, telephone: e.target.value })} placeholder="Telephone" style={{ ...inputStyle, flex: 1 }} />
                          <button className="btn-primary" onClick={createCustomer}>Creer</button>
                        </div>
                      )}
                    </>}
              </div>
            )}
          </div>

          <div className="form-card">
            <h3 className="form-card-title">Ajouter des articles</h3>
            <div style={{ position: "relative" }}>
              <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                <input value={itemSearch} onChange={(e) => setItemSearch(e.target.value)} placeholder="Rechercher un article..." style={{ ...inputStyle, flex: 1 }} />
                <button className="btn-primary" onClick={openAllItems} style={{ whiteSpace: "nowrap" }}>Voir tous les articles</button>
              </div>
              {itemSearch.length > 1 && itemResults.length > 0 && (
                <div className="search-dropdown">
                  {itemResults.map((it) => (
                    <div key={it.id} className="search-item" onClick={() => addToCart(it)}>
                      <div style={{ flex: 1 }}><strong>{it.nom}</strong><div style={{ fontSize: "12px", color: "var(--text-dim)" }}>{it.code} — Stock: {it.stock_disponible}</div></div>
                      <div style={{ fontWeight: 700, color: "var(--navy)" }}>{fmt(it.prix_vente)} {it.monnaie}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ flex: 1, minWidth: "340px" }}>
          <div className="form-card">
            <h3 className="form-card-title">Panier</h3>
            {cart.length === 0
              ? <p style={{ color: "var(--text-soft)", fontStyle: "italic" }}>Aucun article. Recherchez et ajoutez des articles.</p>
              : <table className="data-table">
                  <thead><tr><th>Article</th><th>Qte</th><th>Prix</th><th>Total</th><th></th></tr></thead>
                  <tbody>
                    {cart.map((c) => (
                      <tr key={c.item.id + "-" + (c.taille || "")}>
                        <td><strong>{c.item.nom}</strong>{c.taille && <span style={{ color: "var(--text-dim)", fontSize: "12px" }}> ({c.taille})</span>}</td>
                        <td><input type="number" value={c.quantite} onChange={(e) => changeQty(c.item.id, c.taille, e.target.value)} style={{ width: "56px", padding: "5px", borderRadius: "6px", border: "1px solid var(--line)" }} /></td>
                        <td>{fmt(c.item.prix_vente)}</td>
                        <td><strong>{fmt(c.item.prix_vente * c.quantite)}</strong></td>
                        <td><button className="chip-x" onClick={() => removeFromCart(c.item.id, c.taille)}>x</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>}

            {cart.length > 0 && (
              <>
                <div className="cart-total"><span>Total</span><strong>{fmt(total)} HTG</strong></div>
                <button className="btn-primary" style={{ width: "100%", marginTop: "16px" }} onClick={requestSale}>Encaisser et reserver</button>
              </>
            )}
          </div>
        </div>
      </div>

      <div style={{ marginTop: "28px" }}>
        <h3 className="form-card-title">Ventes recentes</h3>
        <div className="table-card">
          <table className="data-table">
            <thead><tr><th>Recu</th><th>Date</th><th>Client</th><th>Articles</th><th>Total</th><th>Statut</th></tr></thead>
            <tbody>
              {recentSales.length === 0 && <tr><td colSpan="6" className="table-empty">Aucune vente recente.</td></tr>}
              {recentSales.map((s) => (
                <tr key={s.id} style={{ opacity: s.statut === "annule" ? 0.55 : 1 }}>
                  <td><strong style={{ color: "var(--accent)" }}>{s.receipt_number}</strong></td>
                  <td>{s.date_emission ? s.date_emission.slice(0, 10) : ""}</td>
                  <td>{s.clientNom}</td>
                  <td>{s.lines.length} article(s)</td>
                  <td><strong>{fmt(s.montant_total)} HTG</strong></td>
                  <td>{s.statut === "reserve" ? <span className="badge badge-gold">Reserve</span> : s.statut === "livre" ? <span className="badge badge-ok">Livre</span> : s.statut === "annule" ? <span className="badge badge-err">Annule</span> : <span className="badge badge-gray">{s.statut}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showAllItems && (
        <div className="modal-overlay" onClick={() => setShowAllItems(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "750px", maxHeight: "90vh", overflowY: "auto" }}>
            <div className="modal-header">
              <h3>Articles disponibles ({filteredItems.length})</h3>
              <button className="modal-close" onClick={() => setShowAllItems(false)}>x</button>
            </div>
            <input value={itemFilter} onChange={(e) => setItemFilter(e.target.value)} placeholder="Filtrer par nom ou code..." style={{ width: "100%", padding: "11px 14px", borderRadius: "10px", border: "1.5px solid var(--line)", background: "var(--bg-soft)", fontSize: "14px", marginBottom: "16px" }} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: "12px" }}>
              {filteredItems.length === 0 && <p style={{ color: "var(--text-soft)", gridColumn: "1/-1", textAlign: "center" }}>Aucun article trouve.</p>}
              {filteredItems.map((it) => {
                const inCart = cart.find((c) => c.item.id === it.id);
                return (
                  <div key={it.id} onClick={() => { addToCart(it); }} style={{
                    background: inCart ? "#f0fdf4" : "var(--card)", border: "1.5px solid " + (inCart ? "#bbf7d0" : "var(--line)"),
                    borderRadius: "12px", padding: "14px", cursor: "pointer", transition: "all 0.15s",
                    position: "relative"
                  }}>
                    {inCart && <span style={{ position: "absolute", top: "8px", right: "10px", background: "var(--ok)", color: "#fff", borderRadius: "50%", width: "22px", height: "22px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 800 }}>{inCart.quantite}</span>}
                    <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--navy)", marginBottom: "4px" }}>{it.nom}</div>
                    <div style={{ fontSize: "11px", color: "var(--text-dim)", marginBottom: "8px" }}>{it.code}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: "16px", fontWeight: 800, color: "var(--accent)", fontFamily: "Georgia, serif" }}>{fmt(it.prix_vente)} {it.monnaie}</span>
                      <span style={{ fontSize: "12px", color: it.stock_disponible > 5 ? "var(--ok)" : "var(--err)", fontWeight: 600 }}>Stock: {it.stock_disponible}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "16px", gap: "10px" }}>
              <span style={{ fontSize: "14px", color: "var(--navy)", fontWeight: 700, marginRight: "auto" }}>{cart.length} article(s) dans le panier — {fmt(total)} HTG</span>
              <button className="btn-gray-cancel btn-sm" onClick={() => setShowAllItems(false)}>Fermer</button>
            </div>
          </div>
        </div>
      )}

      {confirmSale && (
        <div className="modal-overlay" style={{ zIndex: 10000 }} onClick={() => setConfirmSale(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "420px", textAlign: "center" }}>
            <div style={{ fontSize: "40px", marginBottom: "10px" }}>🛒</div>
            <h3 style={{ color: "var(--navy)", marginBottom: "12px" }}>{prenom}, confirmez-vous ?</h3>
            <p style={{ fontSize: "14px", color: "var(--text-dim)", marginBottom: "8px" }}>Vous allez enregistrer une vente de <strong style={{ color: "var(--accent)", fontSize: "18px" }}>{fmt(total)} HTG</strong></p>
            <p style={{ fontSize: "13px", color: "var(--text-soft)", marginBottom: "6px" }}>{cart.length} article(s) pour {selStudent ? selStudent.prenom + " " + selStudent.nom : selCust ? selCust.nom : "client"}</p>
            <p style={{ fontSize: "12px", color: "var(--text-soft)", marginBottom: "16px" }}>Les articles seront reserves pendant 72h.</p>
            <div className="form-group" style={{ marginBottom: "20px", textAlign: "left" }}>
              <label>Montant recu <span style={{ fontWeight: 400, color: "var(--text-dim)" }}>(optionnel)</span></label>
              <input type="number" value={payMontantRecu} onChange={(e) => setPayMontantRecu(e.target.value)} placeholder="ex: 1000" />
            </div>
            <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setConfirmSale(false)}>Revenir</button>
              <button className="btn-primary" onClick={submitSale} disabled={submitting}>{submitting ? "Enregistrement..." : "Oui, encaisser"}</button>
            </div>
          </div>
        </div>
      )}

      {sizePickerItem && (
        <div className="modal-overlay" onClick={() => setSizePickerItem(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "380px" }}>
            <div className="modal-header">
              <h3>Choisir la taille - {sizePickerItem.nom}</h3>
              <button className="modal-close" onClick={() => setSizePickerItem(null)}>x</button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
              {(sizePickerItem.variants || []).length === 0 && <p style={{ color: "var(--text-soft)" }}>Aucune taille configuree pour cet article.</p>}
              {(sizePickerItem.variants || []).map((v) => (
                <button
                  key={v.id}
                  disabled={v.stock_disponible <= 0}
                  onClick={() => addToCart(sizePickerItem, v.taille)}
                  style={{
                    padding: "12px 18px", borderRadius: "10px", border: "1.5px solid " + (v.stock_disponible > 0 ? "var(--line)" : "#f1f5f9"),
                    background: v.stock_disponible > 0 ? "var(--card)" : "#f8fafc",
                    cursor: v.stock_disponible > 0 ? "pointer" : "not-allowed",
                    opacity: v.stock_disponible > 0 ? 1 : 0.5,
                    textAlign: "center", minWidth: "80px"
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: "15px", color: "var(--navy)" }}>{v.taille}</div>
                  <div style={{ fontSize: "11px", color: v.stock_disponible > 0 ? "var(--ok)" : "var(--err)" }}>
                    {v.stock_disponible > 0 ? v.stock_disponible + " dispo" : "Rupture"}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}