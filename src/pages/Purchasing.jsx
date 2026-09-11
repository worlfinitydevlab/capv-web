import React, { useState, useEffect } from "react";
import { useAuth } from "../AuthContext.jsx";
import { getAuthedClient, EDGE_FUNCTION_URL, SUPABASE_ANON_KEY } from "../supabaseClient.js";
import { useYear } from "../YearContext.jsx";

const STATUTS = {
  demande: { t: "Demande", c: "badge-gray" },
  validee: { t: "Validee", c: "badge-blue" },
  commandee: { t: "Commandee", c: "badge-gold" },
  recue: { t: "Recue", c: "badge-ok" }
};

export default function Purchasing() {
  const { token, user } = useAuth();
  const { currentYear: year } = useYear();
  const [canApprobation, setCanApprobation] = useState(false);
  const [canDecaissement, setCanDecaissement] = useState(false);
  const [canReceive, setCanReceive] = useState(false);
  const [pos, setPos] = useState([]);
  const [items, setItems] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [statutFilter, setStatutFilter] = useState("tous");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ fournisseur: "", motif: "", priorite: "normale" });
  const [cart, setCart] = useState([]);
  const [itemSel, setItemSel] = useState("");
  const [itemQty, setItemQty] = useState("1");
  const [itemPrix, setItemPrix] = useState("");

  const [recModal, setRecModal] = useState(null);
  const [recLines, setRecLines] = useState([]);

  const [approbationModal, setApprobationModal] = useState(null);
  const [approbationLines, setApprobationLines] = useState([]);
  const [approbationCreds, setApprobationCreds] = useState({ username: "", password: "" });
  const [approbationError, setApprobationError] = useState("");

  const [tresorieModal, setTresorieModal] = useState(null);
  const [tresorieCreds, setTresorieCreds] = useState({ username: "", password: "" });
  const [tresorieCheque, setTresorieCheque] = useState("");
  const [tresorieError, setTresorieError] = useState("");

  const verifyCredentials = async (username, password) => {
    const r = await fetch(EDGE_FUNCTION_URL, {
      method: "POST",
      headers: { "apikey": SUPABASE_ANON_KEY, "Authorization": "Bearer " + SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    const d = await r.json();
    if (!r.ok) return { ok: false, error: d.error || "Mot de passe incorrect" };
    return { ok: true };
  };
  const getUserRoleName = async (supabase, username) => {
    const { data: u } = await supabase.from("users").select("role_nom").eq("username", username).maybeSingle();
    return u ? u.role_nom : null;
  };
  const checkUserPerm = async (supabase, username, moduleKey, action) => {
    const roleNom = await getUserRoleName(supabase, username);
    if (!roleNom) return false;
    if (roleNom === "Administrateur") return true;
    const { data: role } = await supabase.from("roles").select("id").eq("nom", roleNom).maybeSingle();
    if (!role) return false;
    const { data: perm } = await supabase.from("role_permissions").select("*").eq("role_uuid", role.id).eq("module", moduleKey).maybeSingle();
    return !!(perm && perm[action]);
  };

  const loadAux = async () => {
    const supabase = getAuthedClient(token);
    const { data: its } = await supabase.from("items").select("*").order("nom");
    setItems(its || []);
    const { data: sups } = await supabase.from("suppliers").select("*").order("nom");
    setSuppliers(sups || []);

    if (user.role === "Administrateur") {
      setCanApprobation(true); setCanDecaissement(true); setCanReceive(true);
    } else {
      const { data: role } = await supabase.from("roles").select("id").eq("nom", user.role).maybeSingle();
      if (role) {
        const { data: perms } = await supabase.from("role_permissions").select("module, peut_modifier").eq("role_uuid", role.id).in("module", ["po_approbation", "po_decaissement", "inventory"]);
        const map = {};
        (perms || []).forEach((p) => { map[p.module] = p.peut_modifier; });
        setCanApprobation(!!map.po_approbation);
        setCanDecaissement(!!map.po_decaissement);
        setCanReceive(!!map.inventory);
      }
    }
  };

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const supabase = getAuthedClient(token);
      let query = supabase.from("purchase_orders").select("*").order("created_at", { ascending: false });
      if (statutFilter !== "tous") query = query.eq("statut", statutFilter);
      const { data, error: e } = await query;
      if (e) throw e;
      let filtered = data || [];
      if (search) {
        const q = search.toLowerCase();
        filtered = filtered.filter((p) => (p.numero + " " + (p.fournisseur || "")).toLowerCase().includes(q));
      }
      setPos(filtered);
    } catch (e) {
      setError(e.message || "Erreur de chargement");
    }
    setLoading(false);
  };

  useEffect(() => { loadAux(); }, [token]);
  useEffect(() => { load(); }, [token, statutFilter, search]);

  const alerts = items.filter((i) => !i.a_tailles && i.stock_disponible <= i.seuil_alerte);

  const openModal = () => { setForm({ fournisseur: "", motif: "", priorite: "normale" }); setCart([]); setError(""); setModalOpen(true); };

  const onSelectItem = (id) => {
    setItemSel(id);
    const art = items.find((i) => i.id === id);
    setItemPrix(art ? String(Math.round(art.prix_achat)) : "");
  };
  const addToCart = () => {
    if (!itemSel) return;
    const art = items.find((i) => i.id === itemSel);
    if (!art || cart.find((c) => c.item_id === art.id)) return;
    setCart([...cart, { item_id: art.id, nom: art.nom, quantite: Number(itemQty) || 1, prix_unitaire: Number(itemPrix) || 0, unite: art.unite }]);
    setItemSel(""); setItemQty("1"); setItemPrix("");
  };
  const removeFromCart = (id) => setCart(cart.filter((c) => c.item_id !== id));
  const cartTotal = cart.reduce((a, c) => a + c.prix_unitaire * c.quantite, 0);

  const genererNumero = async (supabase) => {
    const yr = new Date().getFullYear();
    const { count } = await supabase.from("purchase_orders").select("id", { count: "exact", head: true });
    return "CMD-" + yr + "-" + String((count || 0) + 1).padStart(4, "0");
  };

  const submit = async () => {
    setError("");
    if (cart.length === 0) { setError("Ajoutez au moins un article"); return; }
    try {
      const supabase = getAuthedClient(token);
      const numero = await genererNumero(supabase);
      const total = cart.reduce((a, c) => a + c.prix_unitaire * c.quantite, 0);
      const { data: po, error: e1 } = await supabase.from("purchase_orders").insert({
        numero, fournisseur: form.fournisseur || null, demandeur: user.nom_complet || user.username,
        motif: form.motif || null, priorite: form.priorite, statut: "demande", montant_total: total,
        academic_year_uuid: year ? year.id : null, modified_by: user.username
      }).select().single();
      if (e1) throw e1;
      for (const c of cart) {
        const { error: e2 } = await supabase.from("purchase_order_items").insert({
          po_uuid: po.id, item_uuid: c.item_id, item_nom: c.nom, quantite_commandee: c.quantite, prix_unitaire: c.prix_unitaire, modified_by: user.username
        });
        if (e2) throw e2;
      }
      setModalOpen(false);
      load();
    } catch (e) { setError(e.message || "Erreur"); }
  };

  const openApprobation = async (po) => {
    const supabase = getAuthedClient(token);
    const { data: lines } = await supabase.from("purchase_order_items").select("*").eq("po_uuid", po.id);
    setApprobationModal(po);
    setApprobationLines((lines || []).map((l) => ({ id: l.id, item_nom: l.item_nom, quantite_commandee: l.quantite_commandee, prix_unitaire: l.prix_unitaire })));
    setApprobationCreds({ username: "", password: "" });
    setApprobationError("");
  };
  const submitApprobation = async () => {
    setApprobationError("");
    try {
      const check = await verifyCredentials(approbationCreds.username, approbationCreds.password);
      if (!check.ok) { setApprobationError(check.error); return; }
      const supabase = getAuthedClient(token);
      const allowed = await checkUserPerm(supabase, approbationCreds.username, "po_approbation", "peut_modifier");
      if (!allowed) { setApprobationError("Ce compte n''a pas la permission requise"); return; }

      for (const l of approbationLines) {
        await supabase.from("purchase_order_items").update({ quantite_commandee: Number(l.quantite_commandee) || 0, prix_unitaire: Number(l.prix_unitaire) || 0, modified_by: approbationCreds.username }).eq("id", l.id);
      }
      const total = approbationLines.reduce((s, l) => s + (Number(l.quantite_commandee) || 0) * (Number(l.prix_unitaire) || 0), 0);
      await supabase.from("purchase_orders").update({ statut: "validee", valide_par: approbationCreds.username, valide_le: new Date().toISOString(), montant_total: total, modified_by: approbationCreds.username }).eq("id", approbationModal.id);
      setApprobationModal(null);
      load();
    } catch (e) { setApprobationError(e.message || "Erreur"); }
  };

  const openTresorie = (po) => {
    setTresorieModal(po);
    setTresorieCreds({ username: "", password: "" });
    setTresorieCheque("");
    setTresorieError("");
  };
  const submitTresorie = async () => {
    setTresorieError("");
    if (!tresorieCheque.trim()) { setTresorieError("Numero de cheque obligatoire"); return; }
    try {
      const check = await verifyCredentials(tresorieCreds.username, tresorieCreds.password);
      if (!check.ok) { setTresorieError(check.error); return; }
      const supabase = getAuthedClient(token);
      const allowed = await checkUserPerm(supabase, tresorieCreds.username, "po_decaissement", "peut_modifier");
      if (!allowed) { setTresorieError("Ce compte n''a pas la permission requise"); return; }

      const { data: dup } = await supabase.from("expenses").select("id").eq("numero_cheque", tresorieCheque.trim()).maybeSingle();
      if (dup) { setTresorieError("Ce numero de cheque est deja utilise"); return; }

      const yr = new Date().getFullYear();
      const { count } = await supabase.from("caisse_decaissements").select("id", { count: "exact", head: true });
      const numeroDec = "DC-" + yr + "-" + String((count || 0) + 1).padStart(4, "0");

      const { data: exp, error: eExp } = await supabase.from("expenses").insert({
        categorie: "Approvisionnement", montant: tresorieModal.montant_total, monnaie: "HTG",
        description: "Commande " + tresorieModal.numero + " - " + (tresorieModal.fournisseur || ""),
        statut: "finalisee", caisse_type: "grande", numero_cheque: tresorieCheque.trim(), modified_by: tresorieCreds.username
      }).select().single();
      if (eExp) throw eExp;

      const { data: dec, error: eDec } = await supabase.from("caisse_decaissements").insert({
        numero: numeroDec, caisse_type: "grande", date: new Date().toISOString().slice(0, 10),
        description: "Bon de commande " + tresorieModal.numero, montant: tresorieModal.montant_total,
        beneficiaire: tresorieModal.fournisseur || "Fournisseur", motif: "Approvisionnement", categorie: "Approvisionnement",
        caissier: tresorieCreds.username, modified_by: tresorieCreds.username
      }).select().single();
      if (eDec) throw eDec;

      await supabase.from("expenses").update({ decaissement_id: dec.id, modified_by: tresorieCreds.username }).eq("id", exp.id);
      await supabase.from("purchase_orders").update({ statut: "commandee", commande_le: new Date().toISOString(), modified_by: tresorieCreds.username }).eq("id", tresorieModal.id);

      setTresorieModal(null);
      load();
    } catch (e) { setTresorieError(e.message || "Erreur"); }
  };

  const openReceive = async (po) => {
    const supabase = getAuthedClient(token);
    const { data: lines } = await supabase.from("purchase_order_items").select("*").eq("po_uuid", po.id);
    setRecModal(po);
    setRecLines((lines || []).map((l) => ({ line_id: l.id, item_uuid: l.item_uuid, item_nom: l.item_nom, prix_unitaire: l.prix_unitaire, quantite_commandee: l.quantite_commandee, quantite_recue: l.quantite_commandee })));
  };
  const submitReceive = async () => {
    try {
      const supabase = getAuthedClient(token);
      for (const l of recLines) {
        const qte = Number(l.quantite_recue) || 0;
        if (qte <= 0) continue;
        const { data: item } = await supabase.from("items").select("*").eq("id", l.item_uuid).single();
        if (item) {
          const prixMoyenActuel = item.prix_achat || 0;
          const prixLot = l.prix_unitaire || 0;
          if (item.a_tailles) {
            const totalActuel = item.stock_initial_total || 0;
            const nouveauTotal = totalActuel + qte;
            const nouveauPrixMoyen = nouveauTotal > 0 ? Math.round(((totalActuel * prixMoyenActuel) + (qte * prixLot)) / nouveauTotal) : prixLot;
            await supabase.from("items").update({ stock_initial_total: nouveauTotal, prix_achat: nouveauPrixMoyen, modified_by: user.username }).eq("id", item.id);
          } else {
            const stockActuel = item.stock_disponible || 0;
            const nouveauStock = stockActuel + qte;
            const nouveauPrixMoyen = nouveauStock > 0 ? Math.round(((stockActuel * prixMoyenActuel) + (qte * prixLot)) / nouveauStock) : prixLot;
            await supabase.from("items").update({ stock_disponible: nouveauStock, prix_achat: nouveauPrixMoyen, modified_by: user.username }).eq("id", item.id);
          }
          await supabase.from("item_movements").insert({
            item_uuid: item.id, type_mouvement: "entree", quantite: qte, prix_achat: prixLot,
            supplier: recModal.fournisseur || null, motif: "Reception commande " + recModal.numero, modified_by: user.username
          });
        }
        await supabase.from("purchase_order_items").update({ quantite_recue: qte, modified_by: user.username }).eq("id", l.line_id);
      }
      await supabase.from("purchase_orders").update({ statut: "recue", recu_par: user.nom_complet || user.username, recu_le: new Date().toISOString(), modified_by: user.username }).eq("id", recModal.id);
      setRecModal(null);
      load(); loadAux();
    } catch (e) { setError(e.message || "Erreur"); }
  };

  const fmt = (n) => Number(n || 0).toLocaleString();

  if (loading) return <div className="page"><p style={{ color: "var(--text-dim)" }}>Chargement...</p></div>;

  return (
    <div className="page">
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 className="page-title">Approvisionnement</h1>
          <p className="page-subtitle">{pos.length} commande(s)</p>
        </div>
        <button className="btn-primary" onClick={openModal}>+ Nouvelle demande</button>
      </div>

      {error && <div className="login-error" style={{ marginBottom: "16px" }}>{error}</div>}

      {alerts.length > 0 && (
        <div className="form-card" style={{ marginBottom: "22px", borderLeft: "4px solid var(--err)" }}>
          <h3 className="form-card-title" style={{ color: "var(--err)" }}>Articles a reapprovisionner ({alerts.length})</h3>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            {alerts.map((a) => (
              <span key={a.id} className="section-chip" style={{ background: "#fee2e2", color: "#991b1b" }}>
                {a.nom} : {a.stock_disponible}/{a.seuil_alerte} {a.unite}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="form-card" style={{ marginBottom: "22px" }}>
        <div style={{ display: "flex", gap: "14px", flexWrap: "wrap" }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher (numero, fournisseur)..."
            style={{ flex: 1, minWidth: "240px", padding: "11px 14px", borderRadius: "10px", border: "1.5px solid var(--line)", background: "var(--bg-soft)", fontSize: "14px" }} />
          <select value={statutFilter} onChange={(e) => setStatutFilter(e.target.value)}
            style={{ padding: "11px 14px", borderRadius: "10px", border: "1.5px solid var(--line)", background: "var(--bg-soft)", fontSize: "14px" }}>
            <option value="tous">Tous statuts</option>
            <option value="demande">Demande</option>
            <option value="validee">Validee</option>
            <option value="commandee">Commandee</option>
            <option value="recue">Recue</option>
          </select>
        </div>
      </div>

      <div className="table-card">
        <table className="data-table">
          <thead><tr><th>Numero</th><th>Fournisseur</th><th>Montant</th><th>Statut</th><th>Actions</th></tr></thead>
          <tbody>
            {pos.length === 0 && <tr><td colSpan="5" className="table-empty">Aucune commande.</td></tr>}
            {pos.map((p) => {
              const st = STATUTS[p.statut] || STATUTS.demande;
              return (
                <tr key={p.id}>
                  <td><strong style={{ color: "var(--accent)" }}>{p.numero}</strong></td>
                  <td>{p.fournisseur || "-"}</td>
                  <td>{fmt(p.montant_total)} HTG</td>
                  <td><span className={"badge " + st.c}>{st.t}</span></td>
                  <td>
                    <div style={{ display: "flex", gap: "6px" }}>
                      {canApprobation && p.statut === "demande" && <button className="btn-sm btn-blue" onClick={() => openApprobation(p)}>Valider</button>}
                      {canDecaissement && p.statut === "validee" && <button className="btn-sm btn-gold" onClick={() => openTresorie(p)}>Valider tresorerie</button>}
                      {canReceive && p.statut === "commandee" && <button className="btn-sm btn-green" onClick={() => openReceive(p)}>Receptionner</button>}
                      {!canApprobation && !canDecaissement && !canReceive && p.statut !== "recue" && <span style={{ fontSize: "12px", color: "var(--text-dim)" }}>En attente d''autorisation</span>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal-card modal-large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h3>Nouvelle demande d''approvisionnement</h3><button className="modal-close" onClick={() => setModalOpen(false)}>x</button></div>
            {error && <div className="login-error" style={{ marginBottom: "14px" }}>{error}</div>}
            <div className="form-row">
              <div className="form-group">
                <label>Fournisseur</label>
                <select value={form.fournisseur} onChange={(e) => setForm({ ...form, fournisseur: e.target.value })}>
                  <option value="">-- Choisir --</option>
                  {suppliers.map((s) => <option key={s.id} value={s.nom}>{s.nom}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Priorite</label>
                <select value={form.priorite} onChange={(e) => setForm({ ...form, priorite: e.target.value })}>
                  <option value="normale">Normale</option><option value="urgente">Urgente</option>
                </select>
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: "16px" }}><label>Motif</label><input value={form.motif} onChange={(e) => setForm({ ...form, motif: e.target.value })} /></div>

            <div className="form-card" style={{ marginBottom: "16px", background: "var(--bg-soft)" }}>
              <h4 style={{ fontSize: "13px", marginBottom: "10px" }}>Articles</h4>
              <div style={{ display: "flex", gap: "8px", marginBottom: "12px", flexWrap: "wrap" }}>
                <select value={itemSel} onChange={(e) => onSelectItem(e.target.value)} style={{ flex: 1, minWidth: "180px" }}>
                  <option value="">-- Choisir un article --</option>
                  {items.map((i) => <option key={i.id} value={i.id}>{i.nom} ({i.code})</option>)}
                </select>
                <input type="number" placeholder="Qte" value={itemQty} onChange={(e) => setItemQty(e.target.value)} style={{ width: "70px" }} />
                <input type="number" placeholder="Prix unit." value={itemPrix} onChange={(e) => setItemPrix(e.target.value)} style={{ width: "90px" }} />
                <button className="btn-sm btn-primary" onClick={addToCart}>+ Ajouter</button>
              </div>
              <table className="data-table">
                <thead><tr><th>Article</th><th>Qte</th><th>Prix unit.</th><th>Sous-total</th><th></th></tr></thead>
                <tbody>
                  {cart.length === 0 && <tr><td colSpan="5" className="table-empty">Panier vide.</td></tr>}
                  {cart.map((c) => (
                    <tr key={c.item_id}>
                      <td>{c.nom}</td><td>{c.quantite}</td><td>{fmt(c.prix_unitaire)}</td><td>{fmt(c.prix_unitaire * c.quantite)}</td>
                      <td><button className="btn-sm btn-red" onClick={() => removeFromCart(c.item_id)}>x</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {cart.length > 0 && <p style={{ textAlign: "right", fontWeight: 700, marginTop: "8px" }}>Total : {fmt(cartTotal)} HTG</p>}
            </div>

            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setModalOpen(false)}>Annuler</button>
              <button className="btn-primary" onClick={submit}>Creer la demande</button>
            </div>
          </div>
        </div>
      )}

      {approbationModal && (
        <div className="modal-overlay" onClick={() => setApprobationModal(null)}>
          <div className="modal-card modal-large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h3>Approbation - {approbationModal.numero}</h3><button className="modal-close" onClick={() => setApprobationModal(null)}>x</button></div>
            {approbationError && <div className="login-error" style={{ marginBottom: "16px" }}>{approbationError}</div>}
            <p style={{ fontSize: "13px", color: "var(--text-dim)", marginBottom: "14px" }}>Vous pouvez ajuster les quantites et prix avant d''approuver cette demande.</p>
            <table className="data-table" style={{ marginBottom: "18px" }}>
              <thead><tr><th>Article</th><th>Quantite</th><th>Prix unitaire</th><th>Total</th></tr></thead>
              <tbody>
                {approbationLines.map((l, idx) => (
                  <tr key={l.id}>
                    <td>{l.item_nom}</td>
                    <td><input type="number" value={l.quantite_commandee} onChange={(e) => { const v = [...approbationLines]; v[idx] = { ...v[idx], quantite_commandee: e.target.value }; setApprobationLines(v); }} style={{ width: "80px" }} /></td>
                    <td><input type="number" value={l.prix_unitaire} onChange={(e) => { const v = [...approbationLines]; v[idx] = { ...v[idx], prix_unitaire: e.target.value }; setApprobationLines(v); }} style={{ width: "100px" }} /></td>
                    <td>{fmt((Number(l.quantite_commandee) || 0) * (Number(l.prix_unitaire) || 0))} HTG</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ textAlign: "right", fontWeight: 700, marginBottom: "18px" }}>Total : {fmt(approbationLines.reduce((s, l) => s + (Number(l.quantite_commandee) || 0) * (Number(l.prix_unitaire) || 0), 0))} HTG</p>
            <div style={{ background: "var(--bg-soft)", borderRadius: "10px", padding: "12px 14px", marginBottom: "18px" }}>
              <p style={{ fontSize: "12px", color: "var(--text-soft)", marginBottom: "10px", fontWeight: 600 }}>Confirmation Comptable</p>
              <div className="form-group" style={{ marginBottom: "10px" }}>
                <label>Identifiant</label>
                <input value={approbationCreds.username} onChange={(e) => setApprobationCreds({ ...approbationCreds, username: e.target.value })} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Mot de passe</label>
                <input type="password" value={approbationCreds.password} onChange={(e) => setApprobationCreds({ ...approbationCreds, password: e.target.value })} />
              </div>
            </div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setApprobationModal(null)}>Annuler</button>
              <button className="btn-primary" onClick={submitApprobation}>Approuver</button>
            </div>
          </div>
        </div>
      )}

      {tresorieModal && (
        <div className="modal-overlay" onClick={() => setTresorieModal(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "460px" }}>
            <div className="modal-header"><h3>Validation tresorerie - {tresorieModal.numero}</h3><button className="modal-close" onClick={() => setTresorieModal(null)}>x</button></div>
            {tresorieError && <div className="login-error" style={{ marginBottom: "16px" }}>{tresorieError}</div>}
            <div className="receipt-line"><span>Fournisseur</span><strong>{tresorieModal.fournisseur || "-"}</strong></div>
            <p style={{ textAlign: "right", fontWeight: 700, margin: "10px 0 18px" }}>Montant a decaisser : {fmt(tresorieModal.montant_total)} HTG</p>
            <div className="form-group" style={{ marginBottom: "18px" }}>
              <label>Numero de cheque</label>
              <input value={tresorieCheque} onChange={(e) => setTresorieCheque(e.target.value)} placeholder="Ex: 001234" />
            </div>
            <div style={{ background: "var(--bg-soft)", borderRadius: "10px", padding: "12px 14px", marginBottom: "18px" }}>
              <p style={{ fontSize: "12px", color: "var(--text-soft)", marginBottom: "10px", fontWeight: 600 }}>Confirmation Tresorier</p>
              <div className="form-group" style={{ marginBottom: "10px" }}>
                <label>Identifiant</label>
                <input value={tresorieCreds.username} onChange={(e) => setTresorieCreds({ ...tresorieCreds, username: e.target.value })} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Mot de passe</label>
                <input type="password" value={tresorieCreds.password} onChange={(e) => setTresorieCreds({ ...tresorieCreds, password: e.target.value })} />
              </div>
            </div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setTresorieModal(null)}>Annuler</button>
              <button className="btn-primary" onClick={submitTresorie}>Confirmer le decaissement</button>
            </div>
          </div>
        </div>
      )}

      {recModal && (
        <div className="modal-overlay" onClick={() => setRecModal(null)}>
          <div className="modal-card modal-large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h3>Reception - {recModal.numero}</h3><button className="modal-close" onClick={() => setRecModal(null)}>x</button></div>
            <table className="data-table" style={{ marginBottom: "16px" }}>
              <thead><tr><th>Article</th><th>Commande</th><th>Recue</th></tr></thead>
              <tbody>
                {recLines.map((l, idx) => (
                  <tr key={l.line_id}>
                    <td>{l.item_nom}</td>
                    <td>{l.quantite_commandee}</td>
                    <td><input type="number" value={l.quantite_recue} onChange={(e) => {
                      const copy = [...recLines]; copy[idx] = { ...l, quantite_recue: e.target.value }; setRecLines(copy);
                    }} style={{ width: "80px" }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setRecModal(null)}>Annuler</button>
              <button className="btn-primary" onClick={submitReceive}>Confirmer la reception</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}