import React, { useState, useEffect } from "react";
import { useAuth } from "../AuthContext.jsx";
import { getAuthedClient } from "../supabaseClient.js";
import { useYear } from "../YearContext.jsx";
import { useSettings } from "../SettingsContext.jsx";
import { getSalutation, getMotivation, getPeriodEmoji } from "../smartMessages.js";

function KpiCard({ label, value, hint, color }) {
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={{ color: color || "var(--navy)" }}>{value}</div>
      {hint && <div className="kpi-hint">{hint}</div>}
    </div>
  );
}

export default function Dashboard() {
  const { token, user } = useAuth();
  const { currentYear } = useYear();
  const { settings } = useSettings();
  const [stats, setStats] = useState({});

  const load = async () => {
    if (!currentYear) return;
    const supabase = getAuthedClient(token);
    const yearId = currentYear.id;
    const today = new Date().toISOString().slice(0, 10);
    const monthPrefix = new Date().toISOString().slice(0, 7);

    const { data: paysJour } = await supabase.from("payments").select("montant").eq("academic_year_uuid", yearId).eq("statut", "valide").gte("created_at", today);
    const revJourFrais = (paysJour || []).reduce((s, p) => s + Number(p.montant), 0);

    const { data: ventesJourData } = await supabase.from("sales").select("montant_total, date_emission").eq("academic_year_uuid", yearId).neq("statut", "annule");
    const revJourVentes = (ventesJourData || []).filter((s) => (s.date_emission || "").startsWith(today)).reduce((s, v) => s + Number(v.montant_total), 0);

    const { data: miscJourData } = await supabase.from("misc_fee_payments").select("montant, created_at").eq("statut", "valide");
    const revJourDivers = (miscJourData || []).filter((p) => (p.created_at || "").startsWith(today)).reduce((s, p) => s + Number(p.montant), 0);

    const { data: progJourData } = await supabase.from("program_payments").select("montant, created_at").eq("statut", "valide");
    const revJourProg = (progJourData || []).filter((p) => (p.created_at || "").startsWith(today)).reduce((s, p) => s + Number(p.montant), 0);

    const revJour = revJourFrais + revJourVentes + revJourDivers + revJourProg;

    const { data: paysMois } = await supabase.from("payments").select("montant, created_at").eq("academic_year_uuid", yearId).eq("statut", "valide");
    const revMoisFrais = (paysMois || []).filter((p) => (p.created_at || "").slice(0, 7) === monthPrefix).reduce((s, p) => s + Number(p.montant), 0);

    const { data: ventesData } = await supabase.from("sales").select("montant_total, date_emission, statut").eq("academic_year_uuid", yearId).neq("statut", "annule");
    const ventesMois = (ventesData || []).filter((s) => (s.date_emission || "").slice(0, 7) === monthPrefix).reduce((s, v) => s + Number(v.montant_total), 0);

    const { data: miscMoisData } = await supabase.from("misc_fee_payments").select("montant, created_at").eq("statut", "valide");
    const revMoisDivers = (miscMoisData || []).filter((p) => (p.created_at || "").slice(0, 7) === monthPrefix).reduce((s, p) => s + Number(p.montant), 0);

    const { data: progMoisData } = await supabase.from("program_payments").select("montant, created_at").eq("statut", "valide");
    const revMoisProg = (progMoisData || []).filter((p) => (p.created_at || "").slice(0, 7) === monthPrefix).reduce((s, p) => s + Number(p.montant), 0);

    const { data: depData } = await supabase.from("expenses").select("montant, created_at, statut, caisse_type").or("academic_year_uuid.eq." + yearId + ",academic_year_uuid.is.null").in("statut", ["finalisee", "approuve"]).eq("caisse_type", "grande");
    const depMois = (depData || []).filter((d) => (d.created_at || "").slice(0, 7) === monthPrefix).reduce((s, d) => s + Number(d.montant), 0);

    const { data: assigns } = await supabase.from("assignments").select("student_uuid, class_uuid").eq("academic_year_uuid", yearId);
    const inscrits = new Set((assigns || []).map((a) => a.student_uuid)).size;

    let debiteurs = 0, totalCreances = 0;
    if (assigns && assigns.length > 0) {
      const classIds = [...new Set(assigns.map((a) => a.class_uuid))];
      const { data: fees } = await supabase.from("class_fees").select("*").in("class_uuid", classIds);
      const { data: pays } = await supabase.from("payments").select("student_uuid, fee_uuid, montant").eq("academic_year_uuid", yearId).eq("statut", "valide");
      const dette = new Set();
      for (const a of assigns) {
        const feesClasse = (fees || []).filter((f) => f.class_uuid === a.class_uuid);
        for (const f of feesClasse) {
          const paye = (pays || []).filter((p) => p.student_uuid === a.student_uuid && p.fee_uuid === f.id).reduce((s, p) => s + Number(p.montant), 0);
          const solde = Number(f.montant) - paye;
          if (solde > 0) { dette.add(a.student_uuid); totalCreances += solde; }
        }
      }
      debiteurs = dette.size;
    }

    const computeSolde = async (type) => {
      let encaissements = 0;
      if (type === "grande") {
        const { data: p1 } = await supabase.from("payments").select("montant").eq("statut", "valide");
        const { data: p2 } = await supabase.from("sales").select("montant_total").neq("statut", "annule");
        const { data: p3 } = await supabase.from("misc_fee_payments").select("montant").eq("statut", "valide");
        const { data: p4 } = await supabase.from("program_payments").select("montant").eq("statut", "valide");
        encaissements = (p1 || []).reduce((s, r) => s + Number(r.montant), 0) + (p2 || []).reduce((s, r) => s + Number(r.montant_total), 0) + (p3 || []).reduce((s, r) => s + Number(r.montant), 0) + (p4 || []).reduce((s, r) => s + Number(r.montant), 0);
      }
      const { data: decs } = await supabase.from("caisse_decaissements").select("montant").eq("caisse_type", type).neq("statut", "annule");
      const decaissements = (decs || []).reduce((s, r) => s + Number(r.montant), 0);
      const { data: exps } = await supabase.from("expenses").select("montant").eq("caisse_type", type).is("decaissement_id", null).in("statut", ["finalisee", "approuve"]);
      const depensesDirectes = (exps || []).reduce((s, r) => s + Number(r.montant), 0);
      let transfertsRecus = 0;
      if (type === "petite") {
        const { data: tr } = await supabase.from("caisse_decaissements").select("montant").eq("caisse_type", "grande").eq("motif", "Transfert vers Petite Caisse").neq("statut", "annule");
        transfertsRecus = (tr || []).reduce((s, r) => s + Number(r.montant), 0);
      }
      return encaissements - decaissements - depensesDirectes + transfertsRecus;
    };
    const soldeGrande = await computeSolde("grande");
    const soldePetite = await computeSolde("petite");

    const { data: items } = await supabase.from("items").select("*");
    const valeurStock = (items || []).reduce((s, i) => {
      const stock = i.a_tailles ? (i.stock_initial_total || 0) : (i.stock_disponible || 0);
      return s + stock * (i.prix_achat || 0);
    }, 0);

    setStats({
      revenus_jour: revJour,
      revenus_mois: revMoisFrais + ventesMois + revMoisDivers + revMoisProg,
      depenses_mois: depMois,
      balance_mois: (revMoisFrais + ventesMois + revMoisDivers + revMoisProg) - depMois,
      eleves_inscrits: inscrits,
      eleves_debiteurs: debiteurs,
      total_creances: totalCreances,
      solde_grande: soldeGrande,
      solde_petite: soldePetite,
      valeur_stock: valeurStock
    });
  };
  useEffect(() => { load(); }, [token, currentYear]);

  const fmt = (n) => Number(n || 0).toLocaleString();
  const etab = (settings && settings.nom_etablissement) || "Collège Adventiste de Pétion-Ville";

  return (
    <div className="page">
      <div className="dash-welcome">
        <h2>{getPeriodEmoji()} {user ? getSalutation(user.nom_complet || user.username) : "Bienvenue !"}</h2>
        <p>{getMotivation()}</p>
      </div>
      <div className="page-header">
        <h1 className="page-title">Tableau de bord</h1>
        <p className="page-subtitle">Vue d'ensemble - {etab}{currentYear ? " - Année " + currentYear.nom : ""}</p>
      </div>

      <div className="kpi-grid">
        <KpiCard label="Revenus du jour" value={fmt(stats.revenus_jour) + " HTG"} hint="Aujourd'hui" color="var(--ok)" />
        <KpiCard label="Revenus du mois" value={fmt(stats.revenus_mois) + " HTG"} hint="Frais + ventes magasin" color="var(--accent-light)" />
        <KpiCard label="Dépenses du mois" value={fmt(stats.depenses_mois) + " HTG"} hint="Approuvées" color="var(--err)" />
        <KpiCard label="Balance du mois" value={fmt(stats.balance_mois) + " HTG"} hint="Revenus - dépenses" color={stats.balance_mois >= 0 ? "var(--ok)" : "var(--err)"} />
        <KpiCard label="Élèves inscrits" value={fmt(stats.eleves_inscrits)} hint="Année active" color="var(--navy)" />
        <KpiCard label="Élèves débiteurs" value={fmt(stats.eleves_debiteurs)} hint="Avec solde impayé" color="var(--gold)" />
      </div>

      <h3 style={{ fontSize: "14px", color: "var(--text-soft)", textTransform: "uppercase", fontWeight: 700, margin: "28px 0 14px" }}>Trésorerie et comptabilité</h3>
      <div className="kpi-grid">
        <KpiCard label="Solde Grande Caisse" value={fmt(stats.solde_grande) + " HTG"} hint="Disponible" color={stats.solde_grande >= 0 ? "var(--ok)" : "var(--err)"} />
        <KpiCard label="Solde Petite Caisse" value={fmt(stats.solde_petite) + " HTG"} hint="Disponible" color={stats.solde_petite >= 0 ? "var(--ok)" : "var(--err)"} />
        <KpiCard label="Créances à recevoir" value={fmt(stats.total_creances) + " HTG"} hint={fmt(stats.eleves_debiteurs) + " élève(s) débiteur(s)"} color="var(--gold)" />
        <KpiCard label="Valeur du stock magasin" value={fmt(stats.valeur_stock) + " HTG"} hint="Au coût d'achat" color="var(--navy)" />
      </div>

      <div className="dash-placeholder">
        <p>Bienvenue, <strong>{user ? user.nom_complet : ""}</strong>. Les indicateurs ci-dessus reflètent l'activité de l'année <strong>{currentYear ? currentYear.nom : ""}</strong>. Changez d'annee de travail en haut a droite pour consulter une autre période.</p>
      </div>
    </div>
  );
}
