import React, { useState, useEffect } from "react";
import { useAuth } from "../AuthContext.jsx";
import { getAuthedClient } from "../supabaseClient.js";
import { useYear } from "../YearContext.jsx";

const STATUTS = {
  creee: { t: "Creee", c: "badge-gray" },
  validee: { t: "Validee", c: "badge-blue" },
  preparee: { t: "En preparation", c: "badge-gold" },
  prete: { t: "Prete a retirer", c: "badge-blue" },
  livree: { t: "Livree", c: "badge-ok" }
};

export default function InternalRequests() {
  const { token, user } = useAuth();
  const { currentYear: year } = useYear();
  const [reqs, setReqs] = useState([]);
  const [reqItems, setReqItems] = useState([]);
  const [services, setServices] = useState([]);
  const [items, setItems] = useState([]);
  const [statutFilter, setStatutFilter] = useState("tous");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [canApprove, setCanApprove] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ service: "", motif: "", priorite: "normale" });
  const [cart, setCart] = useState([]);
  const [itemSel, setItemSel] = useState("");
  const [itemQty, setItemQty] = useState("1");
  const [detail, setDetail] = useState(null);

  const loadAux = async () => {
    const supabase = getAuthedClient(token);
    const { data: svc } = await supabase.from("services").select("*").order("nom");
    setServices(svc || []);
    const { data: its } = await supabase.from("items").select("*").order("nom");
    setItems(its || []);

    if (user.role === "Administrateur") {
      setCanApprove(true);
    } else {
      const { data: role } = await supabase.from("roles").select("id").eq("nom", user.role).maybeSingle();
      if (role) {
        const { data: perm } = await supabase.from("role_permissions").select("peut_modifier").eq("role_uuid", role.id).eq("module", "inventory").maybeSingle();
        setCanApprove(!!(perm && perm.peut_modifier));
      }
    }
  };

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const supabase = getAuthedClient(token);
      let query = supabase.from("internal_requests").select("*").order("created_at", { ascending: false });
      if (statutFilter !== "tous") query = query.eq("statut", statutFilter);
      const { data, error: e } = await query;
      if (e) throw e;
      let filtered = data || [];
      if (search) {
        const q = search.toLowerCase();
        filtered = filtered.filter((r) => (r.numero + " " + (r.service || "") + " " + (r.demandeur || "")).toLowerCase().includes(q));
      }
      setReqs(filtered);
      const { data: allItems } = await supabase.from("internal_request_items").select("*");
      setReqItems(allItems || []);
    } catch (e) {
      setError(e.message || "Erreur de chargement");
    }
    setLoading(false);
  };

  useEffect(() => { loadAux(); }, [token]);
  useEffect(() => { load(); }, [token, statutFilter, search]);

  const linesFor = (reqId) => reqItems.filter((l) => l.request_uuid === reqId);

  const openModal = () => { setForm({ service: "", motif: "", priorite: "normale" }); setCart([]); setError(""); setModalOpen(true); };
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
    const { count } = await supabase.from("internal_requests").select("id", { count: "exact", head: true });
    return "DI-" + yr + "-" + String((count || 0) + 1).padStart(4, "0");
  };

  const submit = async () => {
    setError("");
    if (!form.service) { setError("Choisissez un service"); return; }
    if (cart.length === 0) { setError("Ajoutez au moins un article"); return; }
    try {
      const supabase = getAuthedClient(token);
      const numero = await genererNumero(supabase);
      const { data: req, error: e1 } = await supabase.from("internal_requests").insert({
        numero, service: form.service, demandeur: user.nom_complet || user.username, motif: form.motif || null,
        priorite: form.priorite, statut: "creee", academic_year_uuid: year ? year.id : null, modified_by: user.username
      }).select().single();
      if (e1) throw e1;
      for (const c of cart) {
        const { error: e2 } = await supabase.from("internal_request_items").insert({
          request_uuid: req.id, item_uuid: c.item_id, item_nom: c.nom, quantite_demandee: c.quantite, modified_by: user.username
        });
        if (e2) throw e2;
      }
      setModalOpen(false);
      load();
    } catch (e) { setError(e.message || "Erreur"); }
  };

  const advance = async (req, action) => {
    try {
      const supabase = getAuthedClient(token);
      const payload = { modified_by: user.username };
      const nom = user.nom_complet || user.username;
      if (action === "valider") { payload.statut = "validee"; payload.valide_par = nom; payload.valide_le = new Date().toISOString(); }
      if (action === "preparer") { payload.statut = "preparee"; payload.prepare_par = nom; payload.prepare_le = new Date().toISOString(); }
      if (action === "prete") { payload.statut = "prete"; payload.prete_le = new Date().toISOString(); }
      const { error: e } = await supabase.from("internal_requests").update(payload).eq("id", req.id);
      if (e) throw e;
      load(); if (detail) setDetail(null);
    } catch (e) { setError(e.message || "Erreur"); }
  };

  const deliver = async (req) => {
    if (!confirm("Livrer la demande " + req.numero + " ? Le stock sera deduit.")) return;
    try {
      const supabase = getAuthedClient(token);
      const lines = linesFor(req.id);
      for (const l of lines) {
        const { data: art } = await supabase.from("items").select("*").eq("id", l.item_uuid).single();
        if (art) {
          if (l.quantite_demandee > art.stock_disponible) { setError("Stock insuffisant pour " + l.item_nom); return; }
        }
      }
      for (const l of lines) {
        const { data: art } = await supabase.from("items").select("*").eq("id", l.item_uuid).single();
        await supabase.from("items").update({ stock_disponible: art.stock_disponible - l.quantite_demandee, modified_by: user.username }).eq("id", l.item_uuid);
        await supabase.from("internal_request_items").update({ quantite_livree: l.quantite_demandee, modified_by: user.username }).eq("id", l.id);
        await supabase.from("item_movements").insert({
          item_uuid: l.item_uuid, type_mouvement: "sortie", quantite: l.quantite_demandee,
          motif: "Demande interne " + req.numero + " - " + req.service, modified_by: user.username
        });
      }
      await supabase.from("internal_requests").update({ statut: "livree", livre_par: user.nom_complet || user.username, livre_le: new Date().toISOString(), modified_by: user.username }).eq("id", req.id);
      load(); loadAux(); if (detail) setDetail(null);
    } catch (e) { setError(e.message || "Erreur"); }
  };

  const actionBtn = (req) => {
    if (!canApprove) return null;
    if (req.statut === "creee") return <button className="btn-sm btn-green" onClick={() => advance(req, "valider")}>Valider</button>;
    if (req.statut === "validee") return <button className="btn-sm btn-green" onClick={() => advance(req, "preparer")}>Preparer</button>;
    if (req.statut === "preparee") return <button className="btn-sm btn-blue" onClick={() => advance(req, "prete")}>Marquer prete</button>;
    if (req.statut === "prete") return <button className="btn-sm btn-gold" onClick={() => deliver(req)}>Livrer</button>;
    return null;
  };

  if (loading) return <div className="page"><p style={{ color: "var(--text-dim)" }}>Chargement...</p></div>;

  return (
    <div className="page">
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 className="page-title">Demandes internes</h1>
          <p className="page-subtitle">{reqs.length} demande(s)</p>
        </div>
        <button className="btn-primary" onClick={openModal}>+ Nouvelle demande</button>
      </div>

      {error && <div className="login-error" style={{ marginBottom: "16px" }}>{error}</div>}

      <div className="form-card" style={{ marginBottom: "22px" }}>
        <div style={{ display: "flex", gap: "14px", flexWrap: "wrap" }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher (numero, service, demandeur)..."
            style={{ flex: 1, minWidth: "240px", padding: "11px 14px", borderRadius: "10px", border: "1.5px solid var(--line)", background: "var(--bg-soft)", fontSize: "14px" }} />
          <select value={statutFilter} onChange={(e) => setStatutFilter(e.target.value)}
            style={{ padding: "11px 14px", borderRadius: "10px", border: "1.5px solid var(--line)", background: "var(--bg-soft)", fontSize: "14px" }}>
            <option value="tous">Tous statuts</option>
            <option value="creee">Creee</option>
            <option value="validee">Validee</option>
            <option value="preparee">En preparation</option>
            <option value="prete">Prete a retirer</option>
            <option value="livree">Livree</option>
          </select>
        </div>
      </div>

      <div className="table-card">
        <table className="data-table">
          <thead><tr><th>Numero</th><th>Service</th><th>Demandeur</th><th>Articles</th><th>Statut</th><th>Actions</th></tr></thead>
          <tbody>
            {reqs.length === 0 && <tr><td colSpan="6" className="table-empty">Aucune demande.</td></tr>}
            {reqs.map((r) => {
              const st = STATUTS[r.statut] || STATUTS.creee;
              const lines = linesFor(r.id);
              return (
                <tr key={r.id}>
                  <td><strong style={{ color: "var(--accent)" }}>{r.numero}</strong></td>
                  <td>{r.service}</td>
                  <td>{r.demandeur || "-"}</td>
                  <td>{lines.length} article(s)</td>
                  <td><span className={"badge " + st.c}>{st.t}</span></td>
                  <td>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button className="btn-sm btn-blue" onClick={() => setDetail(r)}>Detail</button>
                      {actionBtn(r)}
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
            <div className="modal-header"><h3>Nouvelle demande interne</h3><button className="modal-close" onClick={() => setModalOpen(false)}>x</button></div>
            {error && <div className="login-error" style={{ marginBottom: "16px" }}>{error}</div>}
            <div className="form-row">
              <div className="form-group"><label>Service *</label><select value={form.service} onChange={(e) => setForm({ ...form, service: e.target.value })}><option value="">-- Choisir --</option>{services.map((s) => <option key={s.id} value={s.nom}>{s.nom}</option>)}</select></div>
              <div className="form-group"><label>Priorite</label><select value={form.priorite} onChange={(e) => setForm({ ...form, priorite: e.target.value })}><option value="normale">Normale</option><option value="urgente">Urgente</option></select></div>
            </div>
            <div className="form-group" style={{ marginBottom: "16px" }}><label>Motif</label><input value={form.motif} onChange={(e) => setForm({ ...form, motif: e.target.value })} placeholder="ex: Materiel pour la salle informatique" /></div>

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
              <button className="btn-primary" onClick={submit}>Creer la demande</button>
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
            <div className="receipt-line"><span>Statut</span><strong>{(STATUTS[detail.statut] || STATUTS.creee).t}</strong></div>
            {detail.valide_par && <div className="receipt-line"><span>Valide par</span><strong>{detail.valide_par}</strong></div>}
            {detail.prepare_par && <div className="receipt-line"><span>Prepare par</span><strong>{detail.prepare_par}</strong></div>}
            {detail.livre_par && <div className="receipt-line"><span>Livre par</span><strong>{detail.livre_par}</strong></div>}
            <div style={{ margin: "12px 0 6px", fontSize: "12px", color: "var(--text-soft)", fontWeight: 700, textTransform: "uppercase" }}>Articles</div>
            {linesFor(detail.id).map((l) => (
              <div key={l.id} className="receipt-line"><span>{l.item_nom}</span><strong>{l.quantite_livree > 0 ? l.quantite_livree + " livre(s)" : l.quantite_demandee + " demande(s)"}</strong></div>
            ))}
            {canApprove && <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "18px" }}>{actionBtn(detail)}</div>}
          </div>
        </div>
      )}
    </div>
  );
}