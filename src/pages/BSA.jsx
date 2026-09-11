import React, { useState, useEffect } from "react";
import { useAuth } from "../AuthContext.jsx";
import { getAuthedClient } from "../supabaseClient.js";
import { useYear } from "../YearContext.jsx";

const STATUTS = {
  cree: { t: "Cree", c: "badge-gray" },
  valide_service: { t: "Valide service", c: "badge-blue" },
  valide_magasin: { t: "Valide magasin", c: "badge-gold" },
  livre: { t: "Livre", c: "badge-ok" }
};

export default function BSA() {
  const { token, user } = useAuth();
  const { currentYear: year } = useYear();
  const [bons, setBons] = useState([]);
  const [bonItems, setBonItems] = useState([]);
  const [services, setServices] = useState([]);
  const [items, setItems] = useState([]);
  const [statutFilter, setStatutFilter] = useState("tous");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [canModifier, setCanModifier] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ service: "", demandeur: "", fonction: "", motif: "", priorite: "normale" });
  const [cart, setCart] = useState([]);
  const [itemSel, setItemSel] = useState("");
  const [itemQty, setItemQty] = useState("1");
  const [detail, setDetail] = useState(null);
  const [svcModal, setSvcModal] = useState(false);
  const [newSvc, setNewSvc] = useState("");

  const loadAux = async () => {
    const supabase = getAuthedClient(token);
    const { data: svc } = await supabase.from("services").select("*").order("nom");
    setServices(svc || []);
    const { data: its } = await supabase.from("items").select("*").order("nom");
    setItems(its || []);

    if (user.role === "Administrateur") {
      setCanModifier(true);
    } else {
      const { data: role } = await supabase.from("roles").select("id").eq("nom", user.role).maybeSingle();
      if (role) {
        const { data: perm } = await supabase.from("role_permissions").select("peut_modifier").eq("role_uuid", role.id).eq("module", "inventory").maybeSingle();
        setCanModifier(!!(perm && perm.peut_modifier));
      }
    }
  };

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const supabase = getAuthedClient(token);
      let query = supabase.from("bsa").select("*").order("created_at", { ascending: false });
      if (statutFilter !== "tous") query = query.eq("statut", statutFilter);
      const { data, error: e } = await query;
      if (e) throw e;
      let filtered = data || [];
      if (search) {
        const q = search.toLowerCase();
        filtered = filtered.filter((b) => (b.numero + " " + (b.service || "") + " " + (b.demandeur || "")).toLowerCase().includes(q));
      }
      setBons(filtered);
      const { data: allItems } = await supabase.from("bsa_items").select("*");
      setBonItems(allItems || []);
    } catch (e) {
      setError(e.message || "Erreur de chargement");
    }
    setLoading(false);
  };

  useEffect(() => { loadAux(); }, [token]);
  useEffect(() => { load(); }, [token, statutFilter, search]);

  const linesFor = (bonId) => bonItems.filter((l) => l.bsa_uuid === bonId);

  const openModal = () => { setForm({ service: "", demandeur: user.nom_complet || "", fonction: "", motif: "", priorite: "normale" }); setCart([]); setError(""); setModalOpen(true); };
  const addToCart = () => {
    if (!itemSel) return;
    const art = items.find((i) => i.id === itemSel);
    if (!art || cart.find((c) => c.item_id === art.id)) return;
    setCart([...cart, { item_id: art.id, nom: art.nom, quantite: Number(itemQty) || 1, unite: art.unite }]);
    setItemSel(""); setItemQty("1");
  };
  const removeFromCart = (id) => setCart(cart.filter((c) => c.item_id !== id));

  const genererNumero = async (supabase) => {
    const yr = new Date().getFullYear();
    const { count } = await supabase.from("bsa").select("id", { count: "exact", head: true });
    return "BSA-" + yr + "-" + String((count || 0) + 1).padStart(4, "0");
  };

  const submit = async () => {
    setError("");
    if (!form.service) { setError("Choisissez un service"); return; }
    if (cart.length === 0) { setError("Ajoutez au moins un article"); return; }
    try {
      const supabase = getAuthedClient(token);
      const numero = await genererNumero(supabase);
      const { data: bon, error: e1 } = await supabase.from("bsa").insert({
        numero, service: form.service, demandeur: form.demandeur || null, fonction: form.fonction || null, motif: form.motif || null,
        priorite: form.priorite, statut: "cree", academic_year_uuid: year ? year.id : null, modified_by: user.username
      }).select().single();
      if (e1) throw e1;
      for (const c of cart) {
        const { error: e2 } = await supabase.from("bsa_items").insert({
          bsa_uuid: bon.id, item_uuid: c.item_id, item_nom: c.nom, quantite_demandee: c.quantite, quantite_accordee: c.quantite, modified_by: user.username
        });
        if (e2) throw e2;
      }
      setModalOpen(false);
      load();
    } catch (e) { setError(e.message || "Erreur"); }
  };

  const validate = async (bon, etape) => {
    try {
      const supabase = getAuthedClient(token);
      const payload = { modified_by: user.username };
      const nom = user.nom_complet || user.username;
      if (etape === "service") { payload.statut = "valide_service"; payload.valide_service_par = nom; payload.valide_service_le = new Date().toISOString(); }
      if (etape === "magasin") { payload.statut = "valide_magasin"; payload.valide_magasin_par = nom; payload.valide_magasin_le = new Date().toISOString(); }
      const { error: e } = await supabase.from("bsa").update(payload).eq("id", bon.id);
      if (e) throw e;
      load(); if (detail) setDetail(null);
    } catch (e) { setError(e.message || "Erreur"); }
  };

  const deliver = async (bon) => {
    if (!confirm("Livrer les articles du bon " + bon.numero + " ? Le stock sera deduit.")) return;
    try {
      const supabase = getAuthedClient(token);
      const lines = linesFor(bon.id);
      for (const l of lines) {
        const { data: art } = await supabase.from("items").select("*").eq("id", l.item_uuid).single();
        if (art && l.quantite_accordee > art.stock_disponible) { setError("Stock insuffisant pour " + l.item_nom); return; }
      }
      for (const l of lines) {
        const { data: art } = await supabase.from("items").select("*").eq("id", l.item_uuid).single();
        await supabase.from("items").update({ stock_disponible: art.stock_disponible - l.quantite_accordee, modified_by: user.username }).eq("id", l.item_uuid);
        await supabase.from("bsa_items").update({ quantite_livree: l.quantite_accordee, modified_by: user.username }).eq("id", l.id);
        await supabase.from("item_movements").insert({
          item_uuid: l.item_uuid, type_mouvement: "sortie", quantite: l.quantite_accordee,
          motif: "BSA " + bon.numero + " - " + bon.service, modified_by: user.username
        });
      }
      await supabase.from("bsa").update({ statut: "livre", livre_par: user.nom_complet || user.username, livre_le: new Date().toISOString(), modified_by: user.username }).eq("id", bon.id);
      load(); loadAux(); if (detail) setDetail(null);
    } catch (e) { setError(e.message || "Erreur"); }
  };

  const addService = async () => {
    if (!newSvc.trim()) return;
    const supabase = getAuthedClient(token);
    await supabase.from("services").insert({ nom: newSvc, modified_by: user.username });
    setNewSvc("");
    loadAux();
  };
  const delService = async (id) => {
    const supabase = getAuthedClient(token);
    await supabase.from("services").delete().eq("id", id);
    loadAux();
  };

  const prioBadge = (p) => {
    const map = { normale: "badge-gray", urgente: "badge-gold", tres_urgente: "badge-err" };
    return <span className={"badge " + (map[p] || "badge-gray")}>{(p || "normale").replace("_", " ")}</span>;
  };

  const actionBtn = (bon) => {
    if (!canModifier) return null;
    if (bon.statut === "cree") return <button className="btn-sm btn-green" onClick={() => validate(bon, "service")}>Valider service</button>;
    if (bon.statut === "valide_service") return <button className="btn-sm btn-green" onClick={() => validate(bon, "magasin")}>Valider magasin</button>;
    if (bon.statut === "valide_magasin") return <button className="btn-sm btn-gold" onClick={() => deliver(bon)}>Livrer</button>;
    return null;
  };

  if (loading) return <div className="page"><p style={{ color: "var(--text-dim)" }}>Chargement...</p></div>;

  return (
    <div className="page">
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 className="page-title">Bons de sortie administratifs</h1>
          <p className="page-subtitle">{bons.length} bon(s)</p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button className="btn-gray-cancel btn-sm" onClick={() => setSvcModal(true)}>Services</button>
          <button className="btn-primary" onClick={openModal}>+ Nouveau bon</button>
        </div>
      </div>

      {error && <div className="login-error" style={{ marginBottom: "16px" }}>{error}</div>}

      <div className="form-card" style={{ marginBottom: "22px" }}>
        <div style={{ display: "flex", gap: "14px", flexWrap: "wrap" }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher (numero, service, demandeur)..."
            style={{ flex: 1, minWidth: "240px", padding: "11px 14px", borderRadius: "10px", border: "1.5px solid var(--line)", background: "var(--bg-soft)", fontSize: "14px" }} />
          <select value={statutFilter} onChange={(e) => setStatutFilter(e.target.value)}
            style={{ padding: "11px 14px", borderRadius: "10px", border: "1.5px solid var(--line)", background: "var(--bg-soft)", fontSize: "14px" }}>
            <option value="tous">Tous statuts</option>
            <option value="cree">Cree</option>
            <option value="valide_service">Valide service</option>
            <option value="valide_magasin">Valide magasin</option>
            <option value="livre">Livre</option>
          </select>
        </div>
      </div>

      <div className="table-card">
        <table className="data-table">
          <thead><tr><th>Numero</th><th>Service</th><th>Demandeur</th><th>Articles</th><th>Priorite</th><th>Statut</th><th>Actions</th></tr></thead>
          <tbody>
            {bons.length === 0 && <tr><td colSpan="7" className="table-empty">Aucun bon de sortie.</td></tr>}
            {bons.map((b) => {
              const st = STATUTS[b.statut] || STATUTS.cree;
              const lines = linesFor(b.id);
              return (
                <tr key={b.id}>
                  <td><strong style={{ color: "var(--accent)" }}>{b.numero}</strong></td>
                  <td>{b.service}</td>
                  <td>{b.demandeur || "-"}</td>
                  <td>{lines.length} article(s)</td>
                  <td>{prioBadge(b.priorite)}</td>
                  <td><span className={"badge " + st.c}>{st.t}</span></td>
                  <td>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button className="btn-sm btn-blue" onClick={() => setDetail(b)}>Detail</button>
                      {actionBtn(b)}
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
            <div className="modal-header"><h3>Nouveau bon de sortie</h3><button className="modal-close" onClick={() => setModalOpen(false)}>x</button></div>
            {error && <div className="login-error" style={{ marginBottom: "16px" }}>{error}</div>}
            <div className="form-row">
              <div className="form-group"><label>Service *</label><select value={form.service} onChange={(e) => setForm({ ...form, service: e.target.value })}><option value="">-- Choisir --</option>{services.map((s) => <option key={s.id} value={s.nom}>{s.nom}</option>)}</select></div>
              <div className="form-group"><label>Demandeur</label><input value={form.demandeur} onChange={(e) => setForm({ ...form, demandeur: e.target.value })} /></div>
              <div className="form-group"><label>Priorite</label><select value={form.priorite} onChange={(e) => setForm({ ...form, priorite: e.target.value })}><option value="normale">Normale</option><option value="urgente">Urgente</option><option value="tres_urgente">Tres urgente</option></select></div>
            </div>
            <div className="form-group" style={{ marginBottom: "16px" }}><label>Motif</label><input value={form.motif} onChange={(e) => setForm({ ...form, motif: e.target.value })} placeholder="ex: Fournitures de rentree" /></div>

            <div style={{ borderTop: "1px solid var(--line)", paddingTop: "14px", marginBottom: "12px" }}>
              <label style={{ fontWeight: 600, fontSize: "13px" }}>Ajouter des articles</label>
              <div style={{ display: "flex", gap: "10px", marginTop: "8px" }}>
                <select value={itemSel} onChange={(e) => setItemSel(e.target.value)} style={{ flex: 1 }}>
                  <option value="">-- Choisir un article --</option>
                  {items.map((i) => <option key={i.id} value={i.id}>{i.nom} (stock: {i.stock_disponible})</option>)}
                </select>
                <input type="number" value={itemQty} onChange={(e) => setItemQty(e.target.value)} style={{ width: "80px" }} />
                <button className="btn-sm btn-blue" onClick={addToCart}>Ajouter</button>
              </div>
            </div>

            {cart.length > 0 && (
              <table className="data-table" style={{ marginBottom: "14px" }}>
                <thead><tr><th>Article</th><th>Quantite</th><th></th></tr></thead>
                <tbody>
                  {cart.map((c) => (
                    <tr key={c.item_id}><td>{c.nom}</td><td>{c.quantite} {c.unite}</td><td><button className="chip-x" onClick={() => removeFromCart(c.item_id)}>x</button></td></tr>
                  ))}
                </tbody>
              </table>
            )}

            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setModalOpen(false)}>Annuler</button>
              <button className="btn-primary" onClick={submit}>Creer le bon</button>
            </div>
          </div>
        </div>
      )}

      {detail && (
        <div className="modal-overlay" onClick={() => setDetail(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "560px" }}>
            <div className="modal-header"><h3>{detail.numero}</h3><button className="modal-close" onClick={() => setDetail(null)}>x</button></div>
            <div className="receipt-line"><span>Service</span><strong>{detail.service}</strong></div>
            <div className="receipt-line"><span>Demandeur</span><strong>{detail.demandeur || "-"}</strong></div>
            <div className="receipt-line"><span>Motif</span><strong>{detail.motif || "-"}</strong></div>
            <div className="receipt-line"><span>Statut</span><strong>{(STATUTS[detail.statut] || STATUTS.cree).t}</strong></div>
            {detail.valide_service_par && <div className="receipt-line"><span>Valide service</span><strong>{detail.valide_service_par}</strong></div>}
            {detail.valide_magasin_par && <div className="receipt-line"><span>Valide magasin</span><strong>{detail.valide_magasin_par}</strong></div>}
            {detail.livre_par && <div className="receipt-line"><span>Livre par</span><strong>{detail.livre_par}</strong></div>}
            <div style={{ margin: "12px 0 6px", fontSize: "12px", color: "var(--text-soft)", fontWeight: 700, textTransform: "uppercase" }}>Articles</div>
            {linesFor(detail.id).map((l) => (
              <div key={l.id} className="receipt-line"><span>{l.item_nom}</span><strong>{l.quantite_livree > 0 ? l.quantite_livree + " livre(s)" : l.quantite_accordee + " demande(s)"}</strong></div>
            ))}
            {canModifier && <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "18px" }}>{actionBtn(detail)}</div>}
          </div>
        </div>
      )}

      {svcModal && (
        <div className="modal-overlay" onClick={() => setSvcModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h3>Services beneficiaires</h3><button className="modal-close" onClick={() => setSvcModal(false)}>x</button></div>
            <div style={{ display: "flex", gap: "10px", marginBottom: "16px" }}>
              <input value={newSvc} onChange={(e) => setNewSvc(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addService()} placeholder="ex: Pastorale, Surveillance..."
                style={{ flex: 1, padding: "11px 14px", borderRadius: "10px", border: "1.5px solid var(--line)", background: "var(--bg-soft)", fontSize: "14px" }} />
              <button className="btn-primary" onClick={addService}>Ajouter</button>
            </div>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              {services.map((s) => (
                <span key={s.id} className="section-chip">{s.nom}<button onClick={() => delService(s.id)} className="chip-x">x</button></span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}