import React, { useState, useEffect } from "react";
import { useAuth } from "../AuthContext.jsx";
import { getAuthedClient, EDGE_FUNCTION_URL, SUPABASE_ANON_KEY } from "../supabaseClient.js";
import { useYear } from "../YearContext.jsx";
import { genererEcritureAutomatique, getCompteComptableByNumero } from "../accountingHelpers.js";

const STATUT_BADGE = {
  impayee: { t: "Impayee", c: "badge-gray" },
  partiellement_payee: { t: "Partiellement payee", c: "badge-gold" },
  payee: { t: "Payee", c: "badge-ok" },
  annulee: { t: "Annulee", c: "badge-err" }
};

export default function ComptesClients() {
  const { token, user } = useAuth();
  const { currentYear: year } = useYear();
  const [eleves, setEleves] = useState([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [factures, setFactures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sections, setSections] = useState([]);
  const [classes, setClasses] = useState([]);
  const [selSection, setSelSection] = useState("");
  const [selClass, setSelClass] = useState("");

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

  const loadSections = async () => {
    if (!year) return;
    const supabase = getAuthedClient(token);
    const { data } = await supabase.from("sections").select("*").eq("academic_year_uuid", year.id);
    setSections(data || []);
  };
  const onSectionChange = async (sectionId) => {
    setSelSection(sectionId); setSelClass(""); setClasses([]);
    if (sectionId) {
      const supabase = getAuthedClient(token);
      const { data } = await supabase.from("classes").select("*").eq("section_uuid", sectionId).order("nom");
      setClasses(data || []);
    }
  };

  const loadEleves = async () => {
    if (!year) return;
    setLoading(true);
    const supabase = getAuthedClient(token);
    let asgQuery = supabase.from("assignments").select("student_uuid, class_uuid").eq("academic_year_uuid", year.id);
    if (selClass) asgQuery = asgQuery.eq("class_uuid", selClass);
    const { data: asgs } = await asgQuery;
    let studentIds = (asgs || []).map((a) => a.student_uuid);
    const asgByStudent = Object.fromEntries((asgs || []).map((a) => [a.student_uuid, a.class_uuid]));

    if (!selClass && selSection) {
      const { data: classesInSection } = await supabase.from("classes").select("id").eq("section_uuid", selSection);
      const idsInSection = new Set((classesInSection || []).map((c) => c.id));
      studentIds = studentIds.filter((sid) => idsInSection.has(asgByStudent[sid]));
    }

    if (studentIds.length === 0) { setEleves([]); setLoading(false); return; }
    const { data: students } = await supabase.from("students").select("*").in("id", studentIds);
    const { data: allClasses } = await supabase.from("classes").select("id, nom");
    const classMap = Object.fromEntries((allClasses || []).map((c) => [c.id, c.nom]));

    const { data: factures } = await supabase.from("client_factures").select("*").in("student_uuid", studentIds).eq("academic_year_uuid", year.id).neq("statut", "annulee");
    const facturesList = factures || [];
    const factureIds = facturesList.map((f) => f.id);
    const { data: pays } = factureIds.length ? await supabase.from("payments").select("facture_uuid, montant").in("facture_uuid", factureIds).eq("statut", "valide") : { data: [] };

    const list = (students || []).map((s) => {
      const mine = facturesList.filter((f) => f.student_uuid === s.id);
      const totalDu = mine.reduce((sum, f) => sum + Number(f.montant_net), 0);
      const totalPaye = (pays || []).filter((p) => mine.some((f) => f.id === p.facture_uuid)).reduce((sum, p) => sum + Number(p.montant), 0);
      return { ...s, classe_nom: classMap[asgByStudent[s.id]] || "-", solde: totalDu - totalPaye };
    });
    setEleves(list);
    setLoading(false);
  };

  const loadFactures = async (studentId) => {
    const supabase = getAuthedClient(token);
    const { data: facturesData } = await supabase.from("client_factures").select("*").eq("student_uuid", studentId).eq("academic_year_uuid", year.id).order("date_echeance");
    const list = facturesData || [];
    const ids = list.map((f) => f.id);
    const { data: pays } = ids.length ? await supabase.from("payments").select("facture_uuid, montant").in("facture_uuid", ids).eq("statut", "valide") : { data: [] };
    setFactures(list.map((f) => {
      const paye = (pays || []).filter((p) => p.facture_uuid === f.id).reduce((s, p) => s + Number(p.montant), 0);
      return { ...f, montant_paye: paye, solde: f.montant_net - paye };
    }));
  };

  useEffect(() => { loadSections(); }, [year]);
  useEffect(() => { loadEleves(); }, [year, selSection, selClass]);

  const fmt = (n) => Number(n || 0).toLocaleString();
  const openEleve = (e) => { setSelected(e); loadFactures(e.id); };
  const filtered = eleves.filter((e) => (e.nom + " " + e.prenom).toLowerCase().includes(search.toLowerCase()));

  const [reconnModalOpen, setReconnModalOpen] = useState(false);
  const [reconnDateLimite, setReconnDateLimite] = useState("");
  const [reconnCreds, setReconnCreds] = useState({ username: "", password: "" });
  const [reconnError, setReconnError] = useState("");
  const [reconnResult, setReconnResult] = useState(null);
  const [reconnBusy, setReconnBusy] = useState(false);

  const openReconnModal = () => { setReconnDateLimite(new Date().toISOString().slice(0, 10)); setReconnCreds({ username: "", password: "" }); setReconnError(""); setReconnResult(null); setReconnModalOpen(true); };
  const submitReconnaissance = async () => {
    setReconnError(""); setReconnBusy(true);
    try {
      const check = await verifyCredentials(reconnCreds.username, reconnCreds.password);
      if (!check.ok) { setReconnError(check.error); setReconnBusy(false); return; }
      const supabase = getAuthedClient(token);
      const allowed = await checkUserPerm(supabase, reconnCreds.username, "po_decaissement", "peut_modifier");
      if (!allowed) { setReconnError("Ce compte n'a pas la permission requise"); setReconnBusy(false); return; }

      const { data: aReconnaitre } = await supabase.from("client_factures").select("*").eq("revenu_reconnu", false).neq("statut", "annulee").not("date_echeance", "is", null).lte("date_echeance", reconnDateLimite);
      const compte2200Uuid = await getCompteComptableByNumero(supabase, "2200");
      const compte4100Uuid = await getCompteComptableByNumero(supabase, "4100");
      let count = 0;
      for (const f of aReconnaitre || []) {
        await genererEcritureAutomatique(supabase, {
          date_ecriture: f.date_echeance,
          description: "Reconnaissance revenu - " + f.numero,
          origine_type: "client_facture_reconnaissance", origine_id: f.id,
          compte_debit_uuid: compte2200Uuid, compte_credit_uuid: compte4100Uuid,
          montant: f.montant_brut, user_uuid: user.id, nom_utilisateur: reconnCreds.username, modified_by: reconnCreds.username
        });
        await supabase.from("client_factures").update({ revenu_reconnu: true, date_reconnaissance: reconnDateLimite, modified_by: reconnCreds.username }).eq("id", f.id);
        count++;
      }
      setReconnResult(count);
      loadEleves();
      if (selected) loadFactures(selected.id);
    } catch (e) { setReconnError(e.message || "Erreur"); }
    setReconnBusy(false);
  };

  if (!year) {
    return <div className="page"><div className="page-header"><h1 className="page-title">Comptes Clients</h1></div><div className="dash-placeholder"><p>Aucune annee active.</p></div></div>;
  }

  return (
    <div className="page">
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 className="page-title">Comptes Clients</h1>
          <p className="page-subtitle">{eleves.length} eleve(s)</p>
        </div>
        <button className="btn-sm btn-gold" onClick={openReconnModal}>Reconnaitre les revenus echus</button>
      </div>

      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
        <div className="kpi-card"><div className="kpi-label">Total des creances</div><div className="kpi-value" style={{ color: "var(--err)" }}>{fmt(eleves.reduce((a, e) => a + e.solde, 0))} HTG</div></div>
        <div className="kpi-card"><div className="kpi-label">Eleves debiteurs</div><div className="kpi-value" style={{ color: "var(--gold)" }}>{eleves.filter((e) => e.solde > 0).length}</div></div>
      </div>

      <div className="form-card" style={{ marginBottom: "22px" }}>
        <div style={{ display: "flex", gap: "14px", flexWrap: "wrap", marginBottom: "14px" }}>
          <div className="form-group" style={{ flex: 1, minWidth: "200px", margin: 0 }}>
            <label>Section</label>
            <select value={selSection} onChange={(e) => onSectionChange(e.target.value)}>
              <option value="">Toutes les sections</option>
              {sections.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ flex: 1, minWidth: "200px", margin: 0 }}>
            <label>Classe</label>
            <select value={selClass} onChange={(e) => setSelClass(e.target.value)} disabled={!selSection}>
              <option value="">Toutes les classes</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
          </div>
        </div>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un eleve..."
          style={{ width: "100%", padding: "11px 14px", borderRadius: "10px", border: "1.5px solid var(--line)", background: "var(--bg-soft)", fontSize: "14px" }} />
      </div>

      <div style={{ display: "flex", gap: "20px" }}>
        <div className="form-card" style={{ flex: 1 }}>
          <h3 className="form-card-title">Eleves</h3>
          {loading && <p style={{ color: "var(--text-dim)" }}>Chargement...</p>}
          {!loading && filtered.map((e) => (
            <div key={e.id} onClick={() => openEleve(e)}
              style={{ padding: "12px", borderRadius: "10px", cursor: "pointer", marginBottom: "8px", background: selected && selected.id === e.id ? "var(--bg-soft)" : "transparent", border: "1px solid var(--line)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong>{e.nom} {e.prenom}</strong>
                <span style={{ color: e.solde > 0 ? "var(--err)" : "var(--text-dim)", fontWeight: 600 }}>{fmt(e.solde)} HTG</span>
              </div>
              <div style={{ fontSize: "12px", color: "var(--text-dim)" }}>{e.classe_nom || "-"}</div>
            </div>
          ))}
          {!loading && filtered.length === 0 && <p style={{ color: "var(--text-dim)" }}>Aucun eleve.</p>}
        </div>

        <div className="form-card" style={{ flex: 2 }}>
          {!selected ? (
            <p style={{ color: "var(--text-dim)" }}>Selectionnez un eleve pour voir ses factures.</p>
          ) : (
            <>
              <h3 className="form-card-title">{selected.nom} {selected.prenom}</h3>
              <p style={{ color: "var(--text-dim)", fontSize: "13px" }}>{selected.classe_nom || "-"} - {selected.matricule}</p>
              <div className="receipt-total" style={{ marginBottom: "18px", marginTop: "10px" }}><span>Solde du</span><strong>{fmt(selected.solde)} HTG</strong></div>

              {factures.map((f) => (
                <div key={f.id} style={{ padding: "12px", borderRadius: "10px", border: "1px solid var(--line)", marginBottom: "10px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <strong>{f.numero}</strong> - {f.nom}
                      <span className={STATUT_BADGE[f.statut] ? STATUT_BADGE[f.statut].c : "badge-gray"} style={{ marginLeft: "8px" }}>{STATUT_BADGE[f.statut] ? STATUT_BADGE[f.statut].t : f.statut}</span>
                      {f.revenu_reconnu ? <span className="badge badge-blue" style={{ marginLeft: "6px" }}>Revenu reconnu</span> : null}
                    </div>
                  </div>
                  <div style={{ fontSize: "13px", color: "var(--text-dim)", marginTop: "6px" }}>Echeance: {f.date_echeance || "-"}</div>
                  <div style={{ display: "flex", gap: "16px", marginTop: "8px", fontSize: "13px", flexWrap: "wrap" }}>
                    <span>Brut: <strong>{fmt(f.montant_brut)} HTG</strong></span>
                    {f.reduction > 0 && <span>Reduction: <strong style={{ color: "var(--ok)" }}>-{fmt(f.reduction)} HTG</strong></span>}
                    <span>Net: <strong>{fmt(f.montant_net)} HTG</strong></span>
                    <span>Paye: <strong>{fmt(f.montant_paye)} HTG</strong></span>
                    <span>Solde: <strong>{fmt(f.solde)} HTG</strong></span>
                  </div>
                </div>
              ))}
              {factures.length === 0 && <p style={{ color: "var(--text-dim)" }}>Aucune facture pour cet eleve.</p>}
              <p style={{ fontSize: "12px", color: "var(--text-dim)", marginTop: "10px" }}>Les paiements se font depuis Caisse - Frais scolaires.</p>
            </>
          )}
        </div>
      </div>

      {reconnModalOpen && (
        <div className="modal-overlay" onClick={() => setReconnModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "440px" }}>
            <div className="modal-header"><h3>Reconnaitre les revenus echus</h3><button className="modal-close" onClick={() => setReconnModalOpen(false)}>x</button></div>
            {reconnError && <div className="login-error" style={{ marginBottom: "14px" }}>{reconnError}</div>}
            {reconnResult !== null && <div className="form-card" style={{ marginBottom: "14px", background: "#dcfce7" }}><strong>{reconnResult} facture(s) reconnue(s).</strong></div>}
            <p style={{ fontSize: "13px", color: "var(--text-dim)", marginBottom: "16px" }}>Transfere en revenu (compte 4100) toutes les factures dont la date d'echeance est atteinte et qui n'ont pas encore ete reconnues.</p>
            <div className="form-group" style={{ marginBottom: "18px" }}>
              <label>Reconnaitre jusqu'au</label>
              <input type="date" value={reconnDateLimite} onChange={(e) => setReconnDateLimite(e.target.value)} />
            </div>
            <div style={{ background: "var(--bg-soft)", borderRadius: "10px", padding: "12px 14px", marginBottom: "18px" }}>
              <p style={{ fontSize: "12px", color: "var(--text-soft)", marginBottom: "10px", fontWeight: 600 }}>Confirmation Tresorier</p>
              <div className="form-group" style={{ marginBottom: "10px" }}>
                <label>Identifiant</label>
                <input value={reconnCreds.username} onChange={(e) => setReconnCreds({ ...reconnCreds, username: e.target.value })} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Mot de passe</label>
                <input type="password" value={reconnCreds.password} onChange={(e) => setReconnCreds({ ...reconnCreds, password: e.target.value })} />
              </div>
            </div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setReconnModalOpen(false)}>Fermer</button>
              <button className="btn-primary" onClick={submitReconnaissance} disabled={reconnBusy}>{reconnBusy ? "Traitement..." : "Reconnaitre"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}