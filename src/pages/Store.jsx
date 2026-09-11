import React, { useState, useEffect } from "react";
import { useAuth } from "../AuthContext.jsx";
import { getAuthedClient, EDGE_FUNCTION_URL, SUPABASE_ANON_KEY } from "../supabaseClient.js";

const EMPTY_ITEM = { category_id: "", nom: "", description: "", type: "vente", unite: "unite", prix_vente: "", monnaie: "HTG", seuil_alerte: "5", emplacement: "", a_tailles: false };

export default function Store() {
  const { token, user } = useAuth();
  const [tab, setTab] = useState("categories");
  const [view, setView] = useState("categories");
  const [categories, setCategories] = useState([]);
  const [selCat, setSelCat] = useState(null);
  const [allItems, setAllItems] = useState([]);
  const [items, setItems] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const [catModal, setCatModal] = useState(false);
  const [newCat, setNewCat] = useState("");

  const [itemModal, setItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [form, setForm] = useState(EMPTY_ITEM);
  const [variants, setVariants] = useState([]);
  const [variantError, setVariantError] = useState("");
  const [newVariant, setNewVariant] = useState({ taille: "", stock_disponible: "", seuil_alerte: "5" });
  const [addAmounts, setAddAmounts] = useState({});

  const [supModal, setSupModal] = useState(false);
  const [editingSup, setEditingSup] = useState(null);
  const [newSup, setNewSup] = useState({ nom: "", telephone: "", adresse: "" });

  const [restockItem, setRestockItem] = useState(null);
  const [restockForm, setRestockForm] = useState({ quantite: "", prix_achat: "", supplier: "" });

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmError, setConfirmError] = useState("");
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);

  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(""), 5000); };

  const loadAll = async () => {
    setLoading(true);
    setError("");
    try {
      const supabase = getAuthedClient(token);
      const { data: cats, error: e1 } = await supabase.from("item_categories").select("*").order("nom");
      if (e1) throw e1;
      const { data: its, error: e2 } = await supabase.from("items").select("*").order("nom");
      if (e2) throw e2;
      setAllItems(its || []);
      const withCount = (cats || []).map((c) => ({ ...c, count: (its || []).filter((i) => i.category_uuid === c.id).length }));
      const sansCount = (its || []).filter((i) => !i.category_uuid).length;
      setCategories([...withCount, { id: null, nom: "Sans categorie", count: sansCount, special: true }]);
      const { data: sups } = await supabase.from("suppliers").select("*").order("nom");
      setSuppliers(sups || []);
      const { data: movs } = await supabase.from("item_movements").select("*").order("created_at", { ascending: false }).limit(15);
      setMovements(movs || []);
      return its || [];
    } catch (e) {
      setError(e.message || "Erreur de chargement");
      return [];
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, [token]);

  const openCat = (c) => {
    setSelCat(c);
    setView("items");
    setItems(allItems.filter((i) => c.id === null ? !i.category_uuid : i.category_uuid === c.id));
  };
  const backToCats = async () => { setView("categories"); setSelCat(null); await loadAll(); };

  const requestConfirm = (actionFn) => {
    setConfirmPassword(""); setConfirmError("");
    setPendingAction(() => actionFn);
    setConfirmOpen(true);
  };
  const submitConfirm = async () => {
    setConfirmError("");
    if (!confirmPassword) { setConfirmError("Entrez votre mot de passe."); return; }
    setConfirmBusy(true);
    try {
      const r = await fetch(EDGE_FUNCTION_URL, {
        method: "POST",
        headers: { "apikey": SUPABASE_ANON_KEY, "Authorization": "Bearer " + SUPABASE_ANON_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ username: user.username, password: confirmPassword })
      });
      const d = await r.json();
      if (!r.ok) { setConfirmError(d.error || "Mot de passe incorrect"); setConfirmBusy(false); return; }
      await pendingAction();
      setConfirmOpen(false);
    } catch (e) {
      setConfirmError(e.message || "Erreur");
    }
    setConfirmBusy(false);
  };

  const addCategory = async () => {
    if (!newCat) return;
    try {
      const supabase = getAuthedClient(token);
      const { error: e } = await supabase.from("item_categories").insert({ nom: newCat, modified_by: user.username });
      if (e) throw e;
      setNewCat(""); setCatModal(false); loadAll();
    } catch (e) { setError(e.message || "Erreur"); }
  };
  const delCategory = async (id, e) => {
    e.stopPropagation();
    if (!confirm("Supprimer cette categorie ?")) return;
    try {
      const supabase = getAuthedClient(token);
      const { error: err } = await supabase.from("item_categories").delete().eq("id", id);
      if (err) throw err;
      loadAll();
    } catch (err) { setError(err.message || "Erreur"); }
  };

  const openNewItem = () => {
    setEditingItem(null);
    setForm({ ...EMPTY_ITEM, category_id: selCat && selCat.id ? selCat.id : "" });
    setVariants([]);
    setError(""); setItemModal(true);
  };
  const openEditItem = async (it) => {
    setEditingItem(it);
    setForm({ category_id: it.category_uuid || "", nom: it.nom, description: it.description || "", type: it.type, unite: it.unite, prix_vente: it.prix_vente, monnaie: it.monnaie, seuil_alerte: it.seuil_alerte, emplacement: it.emplacement || "", a_tailles: !!it.a_tailles });
    setError(""); setVariantError(""); setItemModal(true);
    if (it.a_tailles) {
      const supabase = getAuthedClient(token);
      const { data } = await supabase.from("item_variants").select("*").eq("item_uuid", it.id).order("taille");
      setVariants(data || []);
    } else {
      setVariants([]);
    }
  };
  const setField = (k, v) => setForm({ ...form, [k]: v });

  const genererCode = (its) => {
    const nums = its.map((i) => { const m = (i.code || "").match(/ART-(\d+)/); return m ? Number(m[1]) : 0; });
    const next = (nums.length ? Math.max(...nums) : 0) + 1;
    return "ART-" + String(next).padStart(4, "0");
  };

  const submitItem = () => {
    setError("");
    if (!form.nom.trim()) { setError("Le nom est requis"); return; }
    requestConfirm(async () => {
      try {
        const supabase = getAuthedClient(token);
        const payload = {
          nom: form.nom, description: form.description || null, type: form.type, unite: form.unite,
          prix_vente: Number(form.prix_vente) || 0, monnaie: form.monnaie,
          seuil_alerte: Number(form.seuil_alerte) || 5, emplacement: form.emplacement || null,
          a_tailles: form.a_tailles ? 1 : 0, category_uuid: form.category_id || null, modified_by: user.username
        };
        if (editingItem) {
          const { error: e } = await supabase.from("items").update(payload).eq("id", editingItem.id);
          if (e) throw e;
          setItemModal(false);
          loadAll();
          flash("Article modifie avec succes.");
        } else {
          const code = genererCode(allItems);
          const { error: e } = await supabase.from("items").insert({ ...payload, code, statut: "disponible" });
          if (e) throw e;
          setItemModal(false);
          loadAll();
          flash("Nouvel article cree avec succes.");
        }
      } catch (e) { setError(e.message || "Erreur"); }
    });
  };

  const deleteItem = async (id) => {
    if (!confirm("Supprimer cet article ?")) return;
    try {
      const supabase = getAuthedClient(token);
      const { error: e } = await supabase.from("items").delete().eq("id", id);
      if (e) throw e;
      loadAll();
    } catch (e) { setError(e.message || "Erreur"); }
  };

  const addVariant = async () => {
    setVariantError("");
    if (!newVariant.taille.trim()) return;
    const qte = Number(newVariant.stock_disponible) || 0;
    const reste = editingItem.stock_initial_total || 0;
    if (qte > reste) { setVariantError("Depasse la reserve non repartie (reste " + reste + " a repartir)"); return; }
    try {
      const supabase = getAuthedClient(token);
      const { error: e } = await supabase.from("item_variants").insert({
        item_uuid: editingItem.id, taille: newVariant.taille.trim(),
        stock_disponible: qte, seuil_alerte: Number(newVariant.seuil_alerte) || 5,
        modified_by: user.username
      });
      if (e) throw e;
      const { error: e2 } = await supabase.from("items").update({ stock_initial_total: reste - qte, modified_by: user.username }).eq("id", editingItem.id);
      if (e2) throw e2;
      setNewVariant({ taille: "", stock_disponible: "", seuil_alerte: "5" });
      const { data } = await supabase.from("item_variants").select("*").eq("item_uuid", editingItem.id).order("taille");
      setVariants(data || []);
      const { data: freshItem } = await supabase.from("items").select("*").eq("id", editingItem.id).single();
      setEditingItem(freshItem);
    } catch (e) { setVariantError(e.message || "Erreur"); }
  };
  const updateVariantSeuil = async (v, seuil) => {
    const supabase = getAuthedClient(token);
    await supabase.from("item_variants").update({ seuil_alerte: seuil, modified_by: user.username }).eq("id", v.id);
    const { data } = await supabase.from("item_variants").select("*").eq("item_uuid", editingItem.id).order("taille");
    setVariants(data || []);
  };
  const removeVariant = async (v) => {
    const supabase = getAuthedClient(token);
    await supabase.from("item_variants").delete().eq("id", v.id);
    const { data } = await supabase.from("item_variants").select("*").eq("item_uuid", editingItem.id).order("taille");
    setVariants(data || []);
  };
  const addStockToVariant = async (v) => {
    setVariantError("");
    const qte = Number(addAmounts[v.id]);
    if (!qte || qte <= 0) return;
    try {
      const supabase = getAuthedClient(token);
      const { error: e } = await supabase.from("item_variants").update({ stock_disponible: v.stock_disponible + qte, modified_by: user.username }).eq("id", v.id);
      if (e) throw e;
      setAddAmounts({ ...addAmounts, [v.id]: "" });
      const { data } = await supabase.from("item_variants").select("*").eq("item_uuid", editingItem.id).order("taille");
      setVariants(data || []);
    } catch (e) { setVariantError(e.message || "Erreur"); }
  };

  const openRestock = (item) => { setRestockItem(item); setRestockForm({ quantite: "", prix_achat: "", supplier: "" }); };
  const submitRestock = () => {
    const q = Number(restockForm.quantite);
    if (!q || q <= 0) return;
    requestConfirm(async () => {
      try {
        const supabase = getAuthedClient(token);
        const prixLot = Number(restockForm.prix_achat) || 0;
        const prixMoyenActuel = restockItem.prix_achat || 0;

        if (restockItem.a_tailles) {
          const totalActuel = restockItem.stock_initial_total || 0;
          const nouveauTotal = totalActuel + q;
          const nouveauPrixMoyen = nouveauTotal > 0 ? Math.round(((totalActuel * prixMoyenActuel) + (q * prixLot)) / nouveauTotal) : prixLot;
          const { error: e1 } = await supabase.from("items").update({ stock_initial_total: nouveauTotal, prix_achat: nouveauPrixMoyen, modified_by: user.username }).eq("id", restockItem.id);
          if (e1) throw e1;
        } else {
          const stockActuel = restockItem.stock_disponible || 0;
          const nouveauStock = stockActuel + q;
          const nouveauPrixMoyen = nouveauStock > 0 ? Math.round(((stockActuel * prixMoyenActuel) + (q * prixLot)) / nouveauStock) : prixLot;
          const { error: e1 } = await supabase.from("items").update({ stock_disponible: nouveauStock, prix_achat: nouveauPrixMoyen, modified_by: user.username }).eq("id", restockItem.id);
          if (e1) throw e1;
        }
        const { error: e2 } = await supabase.from("item_movements").insert({
          item_uuid: restockItem.id, type_mouvement: "entree", quantite: q, prix_achat: prixLot,
          supplier: restockForm.supplier || null, motif: "Reapprovisionnement", modified_by: user.username
        });
        if (e2) throw e2;
        flash(q + " " + restockItem.unite + "(s) de " + restockItem.nom + " ajoute(s) au stock.");
        setRestockItem(null);
        loadAll();
      } catch (e) { setError(e.message || "Erreur"); }
    });
  };

  const openNewSup = () => { setEditingSup(null); setNewSup({ nom: "", telephone: "", adresse: "" }); setSupModal(true); };
  const openEditSup = (s) => { setEditingSup(s); setNewSup({ nom: s.nom, telephone: s.telephone || "", adresse: s.adresse || "" }); setSupModal(true); };
  const submitSupplier = async () => {
    if (!newSup.nom) return;
    try {
      const supabase = getAuthedClient(token);
      if (editingSup) {
        const { error: e } = await supabase.from("suppliers").update({ ...newSup, modified_by: user.username }).eq("id", editingSup.id);
        if (e) throw e;
      } else {
        const { error: e } = await supabase.from("suppliers").insert({ ...newSup, modified_by: user.username });
        if (e) throw e;
      }
      setSupModal(false); loadAll();
    } catch (e) { setError(e.message || "Erreur"); }
  };

  const fmt = (n) => Number(n || 0).toLocaleString();

  if (loading) return <div className="page"><p style={{ color: "var(--text-dim)" }}>Chargement...</p></div>;

  return (
    <div className="page">
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 className="page-title">Magasin</h1>
          <p className="page-subtitle">Catalogue, stock et fournisseurs</p>
        </div>
      </div>

      {msg && <div style={{ background: "#dcfce7", color: "#065f46", padding: "10px 14px", borderRadius: "8px", fontSize: "13px", marginBottom: "14px" }}>{msg}</div>}
      {error && !itemModal && <div className="login-error" style={{ marginBottom: "16px" }}>{error}</div>}

      <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
        <button className={"btn-sm " + (tab === "categories" ? "btn-primary" : "btn-gray-cancel")} onClick={() => setTab("categories")}>Catalogue</button>
        <button className={"btn-sm " + (tab === "suppliers" ? "btn-primary" : "btn-gray-cancel")} onClick={() => setTab("suppliers")}>Fournisseurs</button>
        <button className={"btn-sm " + (tab === "movements" ? "btn-primary" : "btn-gray-cancel")} onClick={() => setTab("movements")}>Mouvements recents</button>
      </div>

      {tab === "categories" && (
        <>
          <div className="breadcrumb">
            <span className={"crumb" + (view === "categories" ? " active" : "")} onClick={backToCats}>Categories</span>
            {selCat && <><span className="crumb-sep">&gt;</span><span className="crumb active">{selCat.nom}</span></>}
          </div>

          {view === "categories" && (
            <>
              <div style={{ marginBottom: "14px" }}><button className="btn-primary btn-sm" onClick={() => setCatModal(true)}>+ Nouvelle categorie</button></div>
              <div className="card-grid">
                {categories.map((c) => (
                  <div key={c.id === null ? "sans" : c.id} className="folder-card" onClick={() => openCat(c)}>
                    {!c.special && <button className="folder-del" onClick={(e) => delCategory(c.id, e)}>x</button>}
                    <div className="folder-icon folder-class">CAT</div>
                    <div className="folder-name">{c.nom}</div>
                    <div className="folder-meta">{c.count} article(s)</div>
                  </div>
                ))}
              </div>
            </>
          )}

          {view === "items" && (
            <>
              <div style={{ marginBottom: "14px" }}><button className="btn-primary btn-sm" onClick={openNewItem}>+ Nouvel article</button></div>
              <div className="table-card">
                <table className="data-table">
                  <thead><tr><th>Code</th><th>Article</th><th>Type</th><th>Stock</th><th>Reserve</th><th>Prix achat moy.</th><th>Prix vente</th><th>Actions</th></tr></thead>
                  <tbody>
                    {items.length === 0 && <tr><td colSpan="8" className="table-empty">Aucun article dans cette categorie.</td></tr>}
                    {items.map((it) => (
                      <tr key={it.id}>
                        <td><strong>{it.code}</strong></td>
                        <td>{it.nom}</td>
                        <td>{it.type === "vente" ? <span className="badge badge-blue">Vente</span> : <span className="badge badge-gray">Admin</span>}</td>
                        <td><span style={{ fontWeight: 700, color: it.stock_disponible <= it.seuil_alerte ? "var(--err)" : "var(--ok)" }}>{it.a_tailles ? "(par taille)" : it.stock_disponible} {!it.a_tailles && it.unite}</span></td>
                        <td>{it.stock_reserve}</td>
                        <td>{fmt(Math.round(it.prix_achat))} {it.monnaie}</td>
                        <td>{it.type === "vente" ? fmt(it.prix_vente) + " " + it.monnaie : "-"}</td>
                        <td>
                          <div style={{ display: "flex", gap: "6px" }}>
                            <button className="btn-sm btn-green" onClick={() => openRestock(it)}>+ Stock</button>
                            <button className="btn-sm btn-blue" onClick={() => openEditItem(it)}>Modifier</button>
                            <button className="btn-sm btn-red" onClick={() => deleteItem(it.id)}>Suppr.</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {tab === "suppliers" && (
        <>
          <div style={{ marginBottom: "14px" }}><button className="btn-primary btn-sm" onClick={openNewSup}>+ Nouveau fournisseur</button></div>
          <div className="table-card">
            <table className="data-table">
              <thead><tr><th>Nom</th><th>Telephone</th><th>Adresse</th><th>Actions</th></tr></thead>
              <tbody>
                {suppliers.length === 0 && <tr><td colSpan="4" className="table-empty">Aucun fournisseur.</td></tr>}
                {suppliers.map((s) => (
                  <tr key={s.id}>
                    <td><strong>{s.nom}</strong></td>
                    <td>{s.telephone || "-"}</td>
                    <td>{s.adresse || "-"}</td>
                    <td><button className="btn-sm btn-blue" onClick={() => openEditSup(s)}>Modifier</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "movements" && (
        <div className="table-card">
          <table className="data-table">
            <thead><tr><th>Date</th><th>Article</th><th>Type</th><th>Quantite</th><th>Prix achat</th><th>Motif</th></tr></thead>
            <tbody>
              {movements.length === 0 && <tr><td colSpan="6" className="table-empty">Aucun mouvement.</td></tr>}
              {movements.map((m) => {
                const it = allItems.find((i) => i.id === m.item_uuid);
                return (
                  <tr key={m.id}>
                    <td>{new Date(m.created_at).toLocaleString()}</td>
                    <td>{it ? it.nom : "-"}</td>
                    <td>{m.type_mouvement === "entree" ? <span className="badge badge-ok">Entree</span> : <span className="badge badge-gray">{m.type_mouvement}</span>}</td>
                    <td><strong>+{m.quantite}</strong></td>
                    <td>{m.prix_achat ? fmt(m.prix_achat) + " HTG" : "-"}</td>
                    <td>{m.motif || "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {catModal && (
        <div className="modal-overlay" onClick={() => setCatModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "420px" }}>
            <div className="modal-header"><h3>Nouvelle categorie</h3><button className="modal-close" onClick={() => setCatModal(false)}>x</button></div>
            <div className="form-group" style={{ marginBottom: "20px" }}><label>Nom</label><input value={newCat} onChange={(e) => setNewCat(e.target.value)} autoFocus /></div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setCatModal(false)}>Annuler</button>
              <button className="btn-primary" onClick={addCategory}>Creer</button>
            </div>
          </div>
        </div>
      )}

      {itemModal && (
        <div className="modal-overlay" onClick={() => setItemModal(false)}>
          <div className="modal-card modal-large" onClick={(e) => e.stopPropagation()} style={{ maxHeight: "85vh", overflowY: "auto" }}>
            <div className="modal-header"><h3>{editingItem ? "Modifier l'article" : "Nouvel article"}</h3><button className="modal-close" onClick={() => setItemModal(false)}>x</button></div>
            {error && <div className="login-error" style={{ marginBottom: "16px" }}>{error}</div>}

            <div className="form-row">
              {editingItem
                ? <div className="form-group"><label>Code</label><input value={editingItem.code} disabled /></div>
                : <div className="form-group"><label>Code</label><input value="Genere automatiquement" disabled style={{ fontStyle: "italic", color: "var(--text-soft)" }} /></div>}
              <div className="form-group"><label>Nom *</label><input value={form.nom} onChange={(e) => setField("nom", e.target.value)} /></div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Categorie</label>
                <select value={form.category_id} onChange={(e) => setField("category_id", e.target.value)}>
                  <option value="">-- Aucune --</option>
                  {categories.filter((c) => !c.special).map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Type *</label>
                <select value={form.type} onChange={(e) => setField("type", e.target.value)}>
                  <option value="vente">Destine a la vente</option><option value="administratif">Administratif</option>
                </select>
              </div>
              <div className="form-group"><label>Unite</label><input value={form.unite} onChange={(e) => setField("unite", e.target.value)} /></div>
            </div>
            <div className="form-row">
              {form.type === "vente" && <div className="form-group"><label>Prix de vente</label><input type="number" value={form.prix_vente} onChange={(e) => setField("prix_vente", e.target.value)} /></div>}
              <div className="form-group">
                <label>Monnaie</label>
                <select value={form.monnaie} onChange={(e) => setField("monnaie", e.target.value)}><option value="HTG">HTG</option><option value="USD">USD</option></select>
              </div>
              <div className="form-group"><label>Seuil d'alerte</label><input type="number" value={form.seuil_alerte} onChange={(e) => setField("seuil_alerte", e.target.value)} /></div>
              <div className="form-group"><label>Emplacement</label><input value={form.emplacement} onChange={(e) => setField("emplacement", e.target.value)} /></div>
            </div>
            <div className="form-group" style={{ marginBottom: "16px" }}><label>Description</label><textarea className="modal-textarea" rows="2" value={form.description} onChange={(e) => setField("description", e.target.value)} /></div>
            <div className="form-group" style={{ marginBottom: "16px" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                <input type="checkbox" checked={!!form.a_tailles} onChange={(e) => setField("a_tailles", e.target.checked)} />
                Cet article a des tailles (S, M, L...)
              </label>
            </div>

            {!editingItem && form.a_tailles && (
              <p style={{ fontSize: "12px", color: "var(--text-dim)", marginBottom: "16px" }}>
                Apres la creation, utilisez "+ Stock" pour recevoir du stock, puis repartissez-le entre les tailles.
              </p>
            )}

            {editingItem && form.a_tailles && (() => {
              const reste = editingItem.stock_initial_total || 0;
              return (
                <div className="form-card" style={{ marginBottom: "16px", background: "var(--bg-soft)" }}>
                  <h4 style={{ fontSize: "13px", color: "var(--navy)", marginBottom: "6px" }}>Tailles et stock</h4>
                  <p style={{ fontSize: "12px", color: reste < 0 ? "var(--err)" : "var(--text-dim)", marginBottom: "10px" }}>
                    Reserve non repartie (a assigner a une taille) : <strong>{reste}</strong>
                  </p>
                  {variantError && <div className="login-error" style={{ marginBottom: "10px" }}>{variantError}</div>}
                  <table className="data-table" style={{ marginBottom: "12px" }}>
                    <thead><tr><th>Taille</th><th>Stock disponible</th><th>Ajouter</th><th>Reserve</th><th>Seuil alerte</th><th></th></tr></thead>
                    <tbody>
                      {variants.length === 0 && <tr><td colSpan="5" className="table-empty">Aucune taille ajoutee.</td></tr>}
                      {variants.map((v) => (
                        <tr key={v.id}>
                          <td><strong>{v.taille}</strong></td>
                          <td>{v.stock_disponible}</td>
                          <td style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                            <input type="number" min="1" placeholder="+" value={addAmounts[v.id] || ""} onChange={(e) => setAddAmounts({ ...addAmounts, [v.id]: e.target.value })} style={{ width: "60px" }} />
                            <button className="btn-sm btn-primary" onClick={() => addStockToVariant(v)}>+ Ajouter</button>
                          </td>
                          <td>{v.stock_reserve}</td>
                          <td><input type="number" defaultValue={v.seuil_alerte} style={{ width: "70px" }} onBlur={(e) => updateVariantSeuil(v, Number(e.target.value))} /></td>
                          <td><button className="btn-sm btn-red" onClick={() => removeVariant(v)}>Suppr.</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <input placeholder="Taille (ex: S, M, L)" value={newVariant.taille} onChange={(e) => setNewVariant({ ...newVariant, taille: e.target.value })} style={{ maxWidth: "130px" }} />
                    <input type="number" placeholder="Stock" value={newVariant.stock_disponible} onChange={(e) => setNewVariant({ ...newVariant, stock_disponible: e.target.value })} style={{ maxWidth: "90px" }} />
                    <input type="number" placeholder="Seuil" value={newVariant.seuil_alerte} onChange={(e) => setNewVariant({ ...newVariant, seuil_alerte: e.target.value })} style={{ maxWidth: "80px" }} />
                    <button className="btn-sm btn-primary" onClick={addVariant}>+ Ajouter la taille</button>
                  </div>
                </div>
              );
            })()}

            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setItemModal(false)}>Annuler</button>
              <button className="btn-primary" onClick={submitItem}>{editingItem ? "Enregistrer" : "Creer"}</button>
            </div>
          </div>
        </div>
      )}

      {supModal && (
        <div className="modal-overlay" onClick={() => setSupModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "440px" }}>
            <div className="modal-header"><h3>{editingSup ? "Modifier le fournisseur" : "Nouveau fournisseur"}</h3><button className="modal-close" onClick={() => setSupModal(false)}>x</button></div>
            <div className="form-group" style={{ marginBottom: "14px" }}><label>Nom</label><input value={newSup.nom} onChange={(e) => setNewSup({ ...newSup, nom: e.target.value })} /></div>
            <div className="form-group" style={{ marginBottom: "14px" }}><label>Telephone</label><input value={newSup.telephone} onChange={(e) => setNewSup({ ...newSup, telephone: e.target.value })} /></div>
            <div className="form-group" style={{ marginBottom: "20px" }}><label>Adresse</label><input value={newSup.adresse} onChange={(e) => setNewSup({ ...newSup, adresse: e.target.value })} /></div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setSupModal(false)}>Annuler</button>
              <button className="btn-primary" onClick={submitSupplier}>{editingSup ? "Enregistrer" : "Creer"}</button>
            </div>
          </div>
        </div>
      )}

      {restockItem && (
        <div className="modal-overlay" onClick={() => setRestockItem(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "480px" }}>
            <div className="modal-header"><h3>Reapprovisionner - {restockItem.nom}</h3><button className="modal-close" onClick={() => setRestockItem(null)}>x</button></div>
            <div style={{ marginBottom: "16px", fontSize: "13.5px", color: "var(--text-dim)" }}>
              Stock : <strong>{restockItem.a_tailles ? (restockItem.stock_initial_total || 0) + " (reserve)" : restockItem.stock_disponible + " " + restockItem.unite}</strong> - Prix moyen : <strong>{fmt(Math.round(restockItem.prix_achat))} {restockItem.monnaie}</strong>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Quantite ajoutee *</label><input type="number" value={restockForm.quantite} onChange={(e) => setRestockForm({ ...restockForm, quantite: e.target.value })} autoFocus /></div>
              <div className="form-group"><label>Prix d'achat unitaire</label><input type="number" value={restockForm.prix_achat} onChange={(e) => setRestockForm({ ...restockForm, prix_achat: e.target.value })} /></div>
            </div>
            <div className="form-group" style={{ marginBottom: "20px" }}>
              <label>Fournisseur</label>
              <select value={restockForm.supplier} onChange={(e) => setRestockForm({ ...restockForm, supplier: e.target.value })}>
                <option value="">-- Choisir --</option>
                {suppliers.map((s) => <option key={s.id} value={s.nom}>{s.nom}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setRestockItem(null)}>Annuler</button>
              <button className="btn-primary" onClick={submitRestock}>Continuer</button>
            </div>
          </div>
        </div>
      )}

      {confirmOpen && (
        <div className="modal-overlay" onClick={() => setConfirmOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "420px" }}>
            <div className="modal-header"><h3>Confirmation requise</h3><button className="modal-close" onClick={() => setConfirmOpen(false)}>x</button></div>
            <p style={{ fontSize: "13px", color: "var(--text-soft)", marginBottom: "14px" }}>Action sur le stock. Confirmez avec votre mot de passe.</p>
            {confirmError && <div className="login-error" style={{ marginBottom: "14px" }}>{confirmError}</div>}
            <div className="form-group" style={{ marginBottom: "20px" }}>
              <label>Votre mot de passe</label>
              <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoFocus onKeyDown={(e) => e.key === "Enter" && submitConfirm()} />
            </div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setConfirmOpen(false)}>Annuler</button>
              <button className="btn-primary" onClick={submitConfirm} disabled={confirmBusy}>{confirmBusy ? "Verification..." : "Confirmer"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}