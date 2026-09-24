import React, { useState, useEffect } from "react";
import { useAuth } from "../AuthContext.jsx";
import { getAuthedClient } from "../supabaseClient.js";
import { useYear } from "../YearContext.jsx";
import { useSettings } from "../SettingsContext.jsx";
import { useDevice } from "../DeviceContext.jsx";
import { printUnifiedReceipt, buildUnifiedReceiptHTML, downloadUnifiedReceiptPDF, waitForImages } from "../receiptTemplate.js";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import MiscFees from "./MiscFees.jsx";
import StoreSale from "./StoreSale.jsx";
import CaisseDecaissement from "./CaisseDecaissement.jsx";
import ProgramPay from "./ProgramPay.jsx";
import { genererEcritureEncaissement } from "../accountingHelpers.js";

export default function Cashier() {
  const { token, user } = useAuth();
  const { currentYear } = useYear();
  const { settings } = useSettings();
  const { hasCapability, loaded: deviceLoaded, label: deviceLabel } = useDevice();
  const [tab, setTab] = useState("frais");

  const [stats, setStats] = useState({});
  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);
  const [situation, setSituation] = useState(null);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState("");
  const [recent, setRecent] = useState([]);
  const [activeSession, setActiveSession] = useState(undefined);

  const [payModal, setPayModal] = useState(null);
  const [confirmPay, setConfirmPay] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payMontantRecu, setPayMontantRecu] = useState("");
  const [lastReceipt, setLastReceipt] = useState(null);
  const [receiptPreview, setReceiptPreview] = useState(null);
  const [paying, setPaying] = useState(false);
  const [rapport, setRapport] = useState(null);
  const [rapPeriode, setRapPeriode] = useState("jour");
  const [rapScope, setRapScope] = useState("mine");
  const [rapView, setRapView] = useState("apercu");
  const [crData, setCrData] = useState(null);

  const fmt = (n) => Number(n || 0).toLocaleString();
  const prenom = user ? (user.nom_complet || user.username).split(" ")[0] : "collegue";

  const genererRecu = async (supabase, prefix, academicYear) => {
    const yearLabel = academicYear ? academicYear.nom.split("-")[0] : String(new Date().getFullYear());
    const counterKey = "recu_" + prefix + "_WEB_" + yearLabel;
    const { data, error: e } = await supabase.rpc("next_counter_value", { counter_key: counterKey });
    if (e) throw e;
    const suffix = "WEB-" + String(data).padStart(4, "0");
    return "CAPV-" + prefix + "-" + yearLabel + "-" + suffix;
  };

  const calculerReductions = (reductions, feesList) => {
    const parFrais = {};
    for (const r of reductions) {
      if (r.portee === "ciblee" && r.fee_uuid) {
        const frais = feesList.find((f) => f.id === r.fee_uuid);
        if (!frais) continue;
        let montantRed = 0;
        if (r.type === "exoneration" || r.type === "bourse_complete") montantRed = frais.montant;
        else if (r.type === "demi_bourse") montantRed = frais.montant * 0.5;
        else if (r.mode === "pourcentage") montantRed = frais.montant * (r.valeur / 100);
        else montantRed = Math.min(r.valeur, frais.montant);
        montantRed = Math.round(montantRed);
        parFrais[frais.id] = Math.min(frais.montant, (parFrais[frais.id] || 0) + montantRed);
      } else {
        for (const frais of feesList) {
          let montantRed = 0;
          if (r.type === "bourse_complete") montantRed = frais.montant;
          else if (r.type === "demi_bourse") montantRed = frais.montant * 0.5;
          else if (r.mode === "pourcentage") montantRed = frais.montant * (r.valeur / 100);
          else if (r.mode === "montant") continue;
          montantRed = Math.round(montantRed);
          parFrais[frais.id] = Math.min(frais.montant, (parFrais[frais.id] || 0) + montantRed);
        }
      }
    }
    for (const r of reductions) {
      if (r.portee !== "ciblee" && r.mode === "montant" && r.type !== "bourse_complete" && r.type !== "demi_bourse") {
        let reste = r.valeur;
        for (const frais of feesList) {
          if (reste <= 0) break;
          const dejaReduit = parFrais[frais.id] || 0;
          const dispo = frais.montant - dejaReduit;
          if (dispo <= 0) continue;
          const applique = Math.min(dispo, reste);
          parFrais[frais.id] = dejaReduit + applique;
          reste -= applique;
        }
      }
    }
    return parFrais;
  };

  const loadStats = async () => {
    if (!currentYear || !token) return;
    const supabase = getAuthedClient(token);
    const today = new Date().toISOString().slice(0, 10);
    const monthPrefix = new Date().toISOString().slice(0, 7);
    const { data: pays } = await supabase.from("payments").select("montant, created_at").eq("academic_year_uuid", currentYear.id).eq("statut", "valide");
    const jour = (pays || []).filter((p) => (p.created_at || "").startsWith(today)).reduce((s, p) => s + Number(p.montant), 0);
    const mois = (pays || []).filter((p) => (p.created_at || "").startsWith(monthPrefix)).reduce((s, p) => s + Number(p.montant), 0);
    const nbJour = (pays || []).filter((p) => (p.created_at || "").startsWith(today)).length;
    let ventesJour = 0;
    try {
      const { data: sales } = await supabase.from("sales").select("montant_total, date_emission, statut").eq("academic_year_uuid", currentYear.id).neq("statut", "annule");
      ventesJour = (sales || []).filter((v) => (v.date_emission || "").startsWith(today)).reduce((s, v) => s + Number(v.montant_total), 0);
    } catch (e) {}
    setStats({ encaisse_jour: jour, encaisse_mois: mois, nb_transactions_jour: nbJour, ventes_jour: ventesJour });
  };

  const loadRecent = async () => {
    if (!currentYear || !token) return;
    const supabase = getAuthedClient(token);
    const { data: pays } = await supabase.from("payments").select("*").eq("academic_year_uuid", currentYear.id).order("created_at", { ascending: false }).limit(8);
    if (!pays || pays.length === 0) { setRecent([]); return; }
    const studentIds = [...new Set(pays.map((p) => p.student_uuid))];
    const { data: studs } = await supabase.from("students").select("id, nom, prenom, matricule").in("id", studentIds);
    const withNames = pays.map((p) => {
      const s = (studs || []).find((x) => x.id === p.student_uuid);
      return { ...p, nom: s ? s.nom : "?", prenom: s ? s.prenom : "?" };
    });
    setRecent(withNames);
  };

  const loadActiveSession = async () => {
    if (!token || !user) return;
    const supabase = getAuthedClient(token);
    const { data } = await supabase.from("sessions_sous_caisse").select("*").eq("caissier_uuid", user.id).eq("statut", "ouverte").maybeSingle();
    setActiveSession(data || null);
  };
  useEffect(() => { loadStats(); loadRecent(); loadActiveSession(); }, [currentYear, token]);

  useEffect(() => {
    if (!search) { setResults([]); return; }
    const t = setTimeout(async () => {
      const supabase = getAuthedClient(token);
      const like = "%" + search + "%";
      const { data } = await supabase.from("students").select("id, matricule, nom, prenom, photo, sexe").or("matricule.ilike." + like + ",nom.ilike." + like + ",prenom.ilike." + like).order("nom").limit(15);
      const list = data || [];
      if (list.length > 0 && currentYear) {
        const ids = list.map((s) => s.id);
        const { data: asgs } = await supabase.from("assignments").select("student_uuid, class_uuid").in("student_uuid", ids).eq("academic_year_uuid", currentYear.id);
        const classIds = [...new Set((asgs || []).map((a) => a.class_uuid))];
        const { data: classesData } = classIds.length ? await supabase.from("classes").select("id, nom").in("id", classIds) : { data: [] };
        list.forEach((s) => {
          const asg = (asgs || []).find((a) => a.student_uuid === s.id);
          const cls = asg ? (classesData || []).find((c) => c.id === asg.class_uuid) : null;
          s.classe_nom = cls ? cls.nom : null;
        });
      }
      setResults(list);
    }, 250);
    return () => clearTimeout(t);
  }, [search, currentYear]);

  const selectStudent = async (s) => {
    setSearch(""); setResults([]); setError("");
    await loadSituation(s.id);
    await loadHistory(s.id);
  };

  const loadSituation = async (studentId) => {
    const supabase = getAuthedClient(token);
    const { data: student } = await supabase.from("students").select("*").eq("id", studentId).maybeSingle();
    if (!student) { setError("Eleve introuvable"); return; }

    const { data: asg } = await supabase.from("assignments").select("class_uuid, room_uuid").eq("student_uuid", studentId).eq("academic_year_uuid", currentYear.id).maybeSingle();
    if (!asg) { setSituation({ student, assigned: false, fees: [] }); return; }

    const { data: cls } = await supabase.from("classes").select("nom, section_uuid").eq("id", asg.class_uuid).maybeSingle();
    const { data: sec } = cls ? await supabase.from("sections").select("nom").eq("id", cls.section_uuid).maybeSingle() : { data: null };
    const { data: room } = asg.room_uuid ? await supabase.from("rooms").select("nom").eq("id", asg.room_uuid).maybeSingle() : { data: null };

    const { data: fees } = await supabase.from("class_fees").select("*").eq("class_uuid", asg.class_uuid);
    const feesList = fees || [];

    const { data: reds } = await supabase.from("reductions").select("*").eq("student_uuid", studentId).eq("statut", "active");
    const filteredReds = (reds || []).filter((r) => !r.academic_year_uuid || r.academic_year_uuid === currentYear.id);
    const redParFrais = calculerReductions(filteredReds, feesList);

    const { data: allPays } = await supabase.from("payments").select("fee_uuid, montant").eq("student_uuid", studentId).eq("academic_year_uuid", currentYear.id).eq("statut", "valide");

    const feesWithBalance = feesList.map((f) => {
      const paid = (allPays || []).filter((p) => p.fee_uuid === f.id).reduce((s, p) => s + Number(p.montant), 0);
      const redFrais = redParFrais[f.id] || 0;
      const montantNet = Math.max(0, f.montant - redFrais);
      return {
        fee_id: f.id, nom: f.nom, montant: f.montant, monnaie: f.monnaie, date_echeance: f.date_echeance || null,
        reduction: redFrais, montant_net: montantNet, paye: paid, restant: Math.max(0, montantNet - paid)
      };
    });

    setSituation({
      student, assigned: true,
      section: sec ? sec.nom : "", classe: cls ? cls.nom : "", salle: room ? room.nom : "",
      fees: feesWithBalance
    });
  };

  const loadHistory = async (studentId) => {
    const supabase = getAuthedClient(token);
    const { data } = await supabase.from("payments").select("*").eq("student_uuid", studentId).eq("academic_year_uuid", currentYear.id).order("created_at", { ascending: false });
    setHistory(data || []);
  };

  const openPay = (fee) => { setPayModal(fee); setPayAmount(String(fee.restant)); setError(""); };

  const requestPay = () => {
    setError("");
    const montant = Number(payAmount);
    if (!montant || montant <= 0) { setError(prenom + ", veuillez saisir un montant valide."); return; }
    if (montant > payModal.restant) { setError(prenom + ", le montant ne peut pas depasser le solde restant de " + fmt(payModal.restant) + " " + payModal.monnaie + "."); return; }
    if (!activeSession) { setError(prenom + ", ouvrez d'abord votre session sur une sous-caisse."); return; }
    setConfirmPay(true);
  };

  const submitPay = async () => {
    setConfirmPay(false);
    setError("");
    if (!hasCapability("caisse")) { setError("Cet appareil n'est pas autorise a utiliser la Caisse. Contactez un administrateur."); return; }
    setPaying(true);
    try {
      const supabase = getAuthedClient(token);
      const montant = Number(payAmount);
      const montantRecu = payMontantRecu ? Number(payMontantRecu) : null;
      const receiptNumber = await genererRecu(supabase, "R", currentYear);

      const soldeRestant = payModal.restant - montant;
      const autresFrais = situation.fees.filter((f) => f.fee_id !== payModal.fee_id);
      const echeances = autresFrais.map((f) => ({ label: f.nom, montant: f.restant, date_echeance: f.date_echeance })).filter((f) => f.montant > 0)
        .sort((a, b) => (a.date_echeance || "9999") < (b.date_echeance || "9999") ? -1 : 1);
      const totalRestantAnnee = soldeRestant + echeances.reduce((s, e) => s + e.montant, 0);

      const { data: newPay, error: e1 } = await supabase.from("payments").insert({
        receipt_number: receiptNumber, student_uuid: situation.student.id, academic_year_uuid: currentYear.id,
        fee_uuid: payModal.fee_id, fee_nom: payModal.nom, montant, monnaie: payModal.monnaie,
        user_uuid: user.id, nom_caissier: user.nom_complet, montant_recu: montantRecu, session_sous_caisse_uuid: activeSession.id,
        solde_restant: soldeRestant, echeances_json: JSON.stringify(echeances), total_restant_annee: totalRestantAnnee,
        statut: "valide", modified_by: user.username
      }).select().single();
      if (e1) throw e1;

      await genererEcritureEncaissement(supabase, {
        sousCaisseUuid: activeSession.sous_caisse_uuid, compteProduitNumero: "4100",
        montant, origine_type: "payment", origine_id: newPay.id,
        description: "Paiement frais scolaires - Recu " + newPay.receipt_number,
        user_uuid: user.id, nom_utilisateur: user.nom_complet, modified_by: user.username,
        date_ecriture: newPay.created_at ? newPay.created_at.slice(0, 10) : new Date().toISOString().slice(0, 10)
      });

      setLastReceipt({
        ...newPay, prenom: situation.student.prenom, nom: situation.student.nom, matricule: situation.student.matricule,
        montant_recu: montantRecu, solde_restant: soldeRestant, echeances, total_restant_annee: totalRestantAnnee,
        code_caissier: user.code_caissier || user.username
      });
      setPayModal(null);
      setPayMontantRecu("");
      await loadSituation(situation.student.id);
      await loadHistory(situation.student.id);
      await loadStats(); await loadRecent();
    } catch (e) { setError(e.message || "Erreur lors de l'encaissement"); }
    setPaying(false);
  };

  const getDateRange = (periode) => {
    const today = new Date();
    if (periode === "jour") {
      const d = today.toISOString().slice(0, 10);
      return { debut: d, fin: d };
    }
    const debut = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-01";
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const fin = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(lastDay).padStart(2, "0");
    return { debut, fin };
  };

  const loadRapport = async (p, sc) => {
    const per = p || rapPeriode;
    const scope = sc || rapScope;
    const supabase = getAuthedClient(token);
    const { debut, fin } = getDateRange(per);
    const inRange = (d) => d && d.slice(0, 10) >= debut && d.slice(0, 10) <= fin;

    const { data: allPays } = await supabase.from("payments").select("*").eq("statut", "valide");
    let fraisL = (allPays || []).filter((x) => inRange(x.created_at));
    if (scope === "mine") fraisL = fraisL.filter((x) => x.nom_caissier === user.nom_complet);
    const studentIdsF = [...new Set(fraisL.map((f) => f.student_uuid))];
    const { data: studsF } = studentIdsF.length ? await supabase.from("students").select("id, nom, prenom").in("id", studentIdsF) : { data: [] };
    fraisL = fraisL.map((f) => {
      const st = (studsF || []).find((x) => x.id === f.student_uuid);
      return { ...f, prenom: st ? st.prenom : "", nom: st ? st.nom : "" };
    });

    const { data: allSales } = await supabase.from("sales").select("*").neq("statut", "annule");
    let ventesL = (allSales || []).filter((x) => inRange(x.date_emission));
    if (scope === "mine") ventesL = ventesL.filter((x) => x.nom_caissier === user.nom_complet);

    const { data: allProgs } = await supabase.from("program_payments").select("*").eq("statut", "valide");
    let programmesL = (allProgs || []).filter((x) => inRange(x.created_at));
    if (scope === "mine") programmesL = programmesL.filter((x) => x.nom_caissier === user.nom_complet);
    const progIds = [...new Set(programmesL.map((x) => x.program_uuid))];
    const studentIdsP = [...new Set(programmesL.map((x) => x.student_uuid))];
    const { data: progNames } = progIds.length ? await supabase.from("programs").select("id, nom").in("id", progIds) : { data: [] };
    const { data: studsP } = studentIdsP.length ? await supabase.from("students").select("id, nom, prenom").in("id", studentIdsP) : { data: [] };
    programmesL = programmesL.map((x) => ({
      ...x,
      programme_nom: (progNames || []).find((y) => y.id === x.program_uuid)?.nom || "?",
      prenom: (studsP || []).find((y) => y.id === x.student_uuid)?.prenom || "",
      nom: (studsP || []).find((y) => y.id === x.student_uuid)?.nom || ""
    }));

    const { data: allMisc } = await supabase.from("misc_fee_payments").select("*").eq("statut", "valide");
    let fraisDiversL = (allMisc || []).filter((x) => inRange(x.created_at));
    if (scope === "mine") fraisDiversL = fraisDiversL.filter((x) => x.nom_caissier === user.nom_complet);
    const studentIdsD = [...new Set(fraisDiversL.filter((x) => x.student_uuid).map((x) => x.student_uuid))];
    const customerIdsD = [...new Set(fraisDiversL.filter((x) => x.customer_uuid).map((x) => x.customer_uuid))];
    const { data: studsD } = studentIdsD.length ? await supabase.from("students").select("id, nom, prenom").in("id", studentIdsD) : { data: [] };
    const { data: custsD } = customerIdsD.length ? await supabase.from("customers").select("id, nom").in("id", customerIdsD) : { data: [] };
    fraisDiversL = fraisDiversL.map((x) => ({
      ...x,
      prenom: x.student_uuid ? ((studsD || []).find((y) => y.id === x.student_uuid)?.prenom || "") : "",
      nom: x.student_uuid ? ((studsD || []).find((y) => y.id === x.student_uuid)?.nom || "") : "",
      customer_nom: x.customer_uuid ? ((custsD || []).find((y) => y.id === x.customer_uuid)?.nom || "") : ""
    }));

    const { data: allDecs } = await supabase.from("caisse_decaissements").select("*").neq("statut", "annule");
    let decaissementsL = (allDecs || []).filter((x) => x.date >= debut && x.date <= fin);
    if (scope === "mine") decaissementsL = decaissementsL.filter((x) => x.caissier === user.nom_complet);

    const studentIdsAsg = [...new Set(fraisL.map((f) => f.student_uuid))];
    const { data: asgs } = studentIdsAsg.length ? await supabase.from("assignments").select("student_uuid, class_uuid, academic_year_uuid").in("student_uuid", studentIdsAsg) : { data: [] };
    const classIds = [...new Set((asgs || []).map((a) => a.class_uuid))];
    const { data: classesData } = classIds.length ? await supabase.from("classes").select("id, nom, section_uuid").in("id", classIds) : { data: [] };
    const sectionIds = [...new Set((classesData || []).map((c) => c.section_uuid))];
    const { data: sectionsData } = sectionIds.length ? await supabase.from("sections").select("id, nom").in("id", sectionIds) : { data: [] };

    const parClasseMap = {};
    const parSectionMap = {};
    for (const f of fraisL) {
      const asg = (asgs || []).find((a) => a.student_uuid === f.student_uuid && a.academic_year_uuid === f.academic_year_uuid);
      if (!asg) continue;
      const cls = (classesData || []).find((c) => c.id === asg.class_uuid);
      if (!cls) continue;
      if (!parClasseMap[cls.id]) parClasseMap[cls.id] = { classe_id: cls.id, classe: cls.nom, total: 0, nb: 0 };
      parClasseMap[cls.id].total += Number(f.montant); parClasseMap[cls.id].nb++;
      const sec = (sectionsData || []).find((s) => s.id === cls.section_uuid);
      if (sec) {
        if (!parSectionMap[sec.id]) parSectionMap[sec.id] = { section_id: sec.id, section: sec.nom, total: 0, nb: 0 };
        parSectionMap[sec.id].total += Number(f.montant); parSectionMap[sec.id].nb++;
      }
    }
    const parClasse = Object.values(parClasseMap).sort((a, b) => b.total - a.total);
    const parSection = Object.values(parSectionMap).sort((a, b) => b.total - a.total);

    const totalFrais = fraisL.reduce((a, x) => a + Number(x.montant), 0);
    const totalVentes = ventesL.reduce((a, x) => a + Number(x.montant_total), 0);
    const totalProgrammes = programmesL.reduce((a, x) => a + Number(x.montant), 0);
    const totalFraisDivers = fraisDiversL.reduce((a, x) => a + Number(x.montant), 0);
    const totalDecaissements = decaissementsL.reduce((a, x) => a + Number(x.montant), 0);

    setRapport({
      periode: { debut, fin },
      frais: { liste: fraisL, total: totalFrais, nb: fraisL.length },
      ventes: { liste: ventesL, total: totalVentes, nb: ventesL.length },
      programmes: { liste: programmesL, total: totalProgrammes, nb: programmesL.length },
      frais_divers: { liste: fraisDiversL, total: totalFraisDivers, nb: fraisDiversL.length },
      decaissements: { liste: decaissementsL, total: totalDecaissements, nb: decaissementsL.length },
      total_general: totalFrais + totalVentes + totalProgrammes + totalFraisDivers,
      solde: (totalFrais + totalVentes + totalProgrammes + totalFraisDivers) - totalDecaissements,
      par_classe: parClasse, par_section: parSection
    });
  };

  const openEntityReport = async (type, id) => {
    const supabase = getAuthedClient(token);
    const { debut, fin } = getDateRange(rapPeriode);
    const { data: allPays } = await supabase.from("payments").select("*").eq("statut", "valide");
    const inRange = (d) => d && d.slice(0, 10) >= debut && d.slice(0, 10) <= fin;
    let entityNom = "";
    let studentIds = [];
    if (type === "classe") {
      const { data: cls } = await supabase.from("classes").select("nom").eq("id", id).maybeSingle();
      entityNom = cls ? cls.nom : "";
      const { data: asgs } = await supabase.from("assignments").select("student_uuid").eq("class_uuid", id);
      studentIds = (asgs || []).map((a) => a.student_uuid);
    } else {
      const { data: sec } = await supabase.from("sections").select("nom").eq("id", id).maybeSingle();
      entityNom = sec ? sec.nom : "";
      const { data: clsList } = await supabase.from("classes").select("id").eq("section_uuid", id);
      const clsIds = (clsList || []).map((c) => c.id);
      const { data: asgs } = clsIds.length ? await supabase.from("assignments").select("student_uuid").in("class_uuid", clsIds) : { data: [] };
      studentIds = (asgs || []).map((a) => a.student_uuid);
    }
    const transactions = (allPays || []).filter((p) => studentIds.includes(p.student_uuid) && inRange(p.created_at));
    const stIds = [...new Set(transactions.map((t) => t.student_uuid))];
    const { data: studs } = stIds.length ? await supabase.from("students").select("id, matricule, nom, prenom").in("id", stIds) : { data: [] };
    const withNames = transactions.map((t) => {
      const st = (studs || []).find((s) => s.id === t.student_uuid);
      return { ...t, matricule: st ? st.matricule : "", nom: st ? st.nom : "", prenom: st ? st.prenom : "" };
    });
    const total = withNames.reduce((s, t) => s + Number(t.montant), 0);
    setCrData({ entity_nom: entityNom, periode: { debut, fin }, transactions: withNames, total });
  };

  const printEntityReport = () => {
    if (!crData) return;
    const nomEtab = (settings && settings.nom_etablissement) || "Collège Adventiste de Pétion-Ville";
    const fmt2 = (n) => Number(n || 0).toLocaleString();
    const rows = crData.transactions.map((t) =>
      "<tr><td>" + t.receipt_number + "</td><td>" + (t.created_at || "").slice(0, 10) + "</td><td>" + t.prenom + " " + t.nom + "</td><td>" + t.fee_nom + "</td><td style=" + String.fromCharCode(34) + "text-align:right;" + String.fromCharCode(34) + ">" + fmt2(t.montant) + " " + t.monnaie + "</td><td>" + (t.nom_caissier || "-") + "</td></tr>"
    ).join("");
    const html = "<html><head><title>Rapport - " + crData.entity_nom + "</title>"
      + "<style>body{font-family:Arial,sans-serif;color:#1e293b;padding:24px;}"
      + "h1{color:#1e2a78;font-family:Georgia,serif;font-size:20px;margin-bottom:4px;}"
      + "p{color:#64748b;font-size:13px;margin-top:0;}"
      + "table{width:100%;border-collapse:collapse;margin-top:16px;}"
      + "th,td{border:1px solid #e2e8f0;padding:6px 10px;font-size:12px;text-align:left;}"
      + "th{background:#1e2a78;color:#fff;}"
      + "tfoot td{font-weight:700;background:#f8fafc;}</style></head><body>"
      + "<h1>" + nomEtab + "</h1><p>Rapport de transactions - " + crData.entity_nom + " (" + crData.periode.debut + " au " + crData.periode.fin + ")</p>"
      + "<table><thead><tr><th>Reçu</th><th>Date</th><th>Élève</th><th>Frais</th><th>Montant</th><th>Caissier</th></tr></thead><tbody>"
      + rows + "</tbody><tfoot><tr><td colspan=" + String.fromCharCode(34) + "4" + String.fromCharCode(34) + ">Total</td><td>" + fmt2(crData.total) + "</td><td></td></tr></tfoot></table>"
      + "<script>window.onload=function(){window.print();};</script></body></html>";
    const w = window.open("", "_blank", "width=800,height=900");
    if (w) { w.document.write(html); w.document.close(); }
  };

  const buildRapportHTML = () => {
    if (!rapport) return "";
    const nomEtab = (settings && settings.nom_etablissement) || "Collège Adventiste de Pétion-Ville";
    const logoUrl = settings && settings.logo ? settings.logo : null;
    const scopeLabel = rapScope === "global" ? "Rapport global" : "Rapport du caissier - " + (user ? user.nom_complet : "");
    const kpi = (label, value) => '<div class="kpi"><strong>' + value + '</strong><span>' + label + '</span></div>';
    const kpiWrap = (inner) => '<div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;">' + inner + '</div>';

    let html = '<div style="text-align:center;border-bottom:2px dashed #cbd5e1;padding-bottom:18px;margin-bottom:20px;">'
      + (logoUrl ? '<img src="' + logoUrl + '" style="width:60px;height:60px;border-radius:14px;object-fit:cover;margin:0 auto 8px;display:block;" />' : '<div style="width:60px;height:60px;border-radius:14px;background:linear-gradient(135deg,#1e2a78,#2563eb);color:#fff;display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:800;margin:0 auto 8px;">CAPV</div>')
      + '<div style="font-size:18px;font-weight:800;color:#1e2a78;font-family:Georgia,serif;">' + nomEtab + '</div>'
      + '<div style="font-size:12px;color:#64748b;margin-top:4px;letter-spacing:1px;text-transform:uppercase;">' + scopeLabel + '</div>'
      + '<p style="color:#64748b;font-size:13px;margin-top:8px;">Période : ' + rapport.periode.debut + ' au ' + rapport.periode.fin + '</p>'
      + '</div>';

    html += kpiWrap(
      kpi("Frais scolaires (" + rapport.frais.nb + ")", fmt(rapport.frais.total) + " HTG")
      + kpi("Ventes (" + rapport.ventes.nb + ")", fmt(rapport.ventes.total) + " HTG")
      + kpi("Programmes (" + rapport.programmes.nb + ")", fmt(rapport.programmes.total) + " HTG")
      + kpi("Frais divers (" + rapport.frais_divers.nb + ")", fmt(rapport.frais_divers.total) + " HTG")
      + kpi("Décaissements (" + rapport.decaissements.nb + ")", fmt(rapport.decaissements.total) + " HTG")
      + kpi("Total général", fmt(rapport.total_general) + " HTG")
      + kpi("Solde", fmt(rapport.solde) + " HTG")
    );

    if (rapport.par_section.length > 0) {
      html += "<h3>Par section</h3><table><tr><th>Section</th><th>Nb</th><th>Total</th></tr>" + rapport.par_section.map(function(s) { return "<tr><td>" + s.section + "</td><td>" + s.nb + "</td><td>" + fmt(s.total) + " HTG</td></tr>"; }).join("") + "</table>";
    }
    if (rapport.par_classe.length > 0) {
      html += "<h3>Par classe</h3><table><tr><th>Classe</th><th>Nb</th><th>Total</th></tr>" + rapport.par_classe.map(function(c) { return "<tr><td>" + c.classe + "</td><td>" + c.nb + "</td><td>" + fmt(c.total) + " HTG</td></tr>"; }).join("") + "</table>";
    }
    html += "<h3>Frais scolaires</h3><table><tr><th>Reçu</th><th>Date</th><th>Élève</th><th>Frais</th><th>Montant</th></tr>" + rapport.frais.liste.map(function(p) { return "<tr><td>" + p.receipt_number + "</td><td>" + (p.created_at||"").slice(0,10) + "</td><td>" + (p.prenom||"") + " " + (p.nom||"") + "</td><td>" + p.fee_nom + "</td><td>" + fmt(p.montant) + " " + p.monnaie + "</td></tr>"; }).join("") + "</table>";
    html += "<h3>Ventes magasin</h3><table><tr><th>Reçu</th><th>Date</th><th>Total</th><th>Statut</th></tr>" + rapport.ventes.liste.map(function(v) { return "<tr><td>" + v.receipt_number + "</td><td>" + (v.date_emission||"").slice(0,10) + "</td><td>" + fmt(v.montant_total) + " HTG</td><td>" + v.statut + "</td></tr>"; }).join("") + "</table>";
    html += "<h3>Programmes</h3><table><tr><th>Reçu</th><th>Date</th><th>Élève</th><th>Programme</th><th>Montant</th></tr>" + rapport.programmes.liste.map(function(p) { return "<tr><td>" + p.receipt_number + "</td><td>" + (p.created_at||"").slice(0,10) + "</td><td>" + (p.prenom||"") + " " + (p.nom||"") + "</td><td>" + p.programme_nom + "</td><td>" + fmt(p.montant) + " " + (p.monnaie||"HTG") + "</td></tr>"; }).join("") + "</table>";
    html += "<h3>Frais divers</h3><table><tr><th>Reçu</th><th>Date</th><th>Payeur</th><th>Type</th><th>Montant</th></tr>" + rapport.frais_divers.liste.map(function(p) { return "<tr><td>" + p.receipt_number + "</td><td>" + (p.created_at||"").slice(0,10) + "</td><td>" + (p.student_uuid ? (p.prenom||"")+" "+(p.nom||"") : (p.customer_nom||"")) + "</td><td>" + p.fee_type_nom + "</td><td>" + fmt(p.montant) + " " + (p.monnaie||"HTG") + "</td></tr>"; }).join("") + "</table>";
    html += "<h3>Décaissements</h3><table><tr><th>Reçu</th><th>Date</th><th>Bénéficiaire</th><th>Motif</th><th>Montant</th></tr>" + rapport.decaissements.liste.map(function(d) { return "<tr><td>" + d.numero + "</td><td>" + (d.date||"") + "</td><td>" + d.beneficiaire + "</td><td>" + (d.motif||"-") + "</td><td>" + fmt(d.montant) + " " + (d.monnaie||"HTG") + "</td></tr>"; }).join("") + "</table>";

    html += '<div style="text-align:center;margin-top:24px;padding-top:16px;border-top:2px dashed #cbd5e1;">'
      + '<div style="font-size:11px;color:#94a3b8;">' + nomEtab + '</div>'
      + '<div style="font-size:9px;color:#cbd5e1;margin-top:4px;">Propulsé par Worlfinity DevLab</div>'
      + '</div>';

    return html;
  };

  const printRapport = () => {
    if (!rapport) return;
    const html = buildRapportHTML();
    const w = window.open("", "_blank", "width=900,height=700");
    w.document.write("<html><head><meta charset='utf-8'><title>Rapport de caisse</title><style>body{font-family:'Segoe UI',Arial;padding:30px;color:#1e293b;}table{width:100%;border-collapse:collapse;margin:12px 0}th,td{padding:8px 12px;text-align:left;border-bottom:1px solid #e2e8f0;font-size:12px;}th{background:#1e2a78;color:#fff;}h3{color:#1e2a78;margin:18px 0 8px;font-size:14px;}.kpi{width:150px;box-sizing:border-box;padding:10px 8px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;text-align:center;}.kpi strong{display:block;font-size:15px;color:#1e2a78;word-break:break-word;}.kpi span{font-size:10px;color:#64748b;}</style></head><body>" + html + "<script>window.onload=function(){setTimeout(function(){window.print();},300);};<\/script></body></html>");
    w.document.close();
  };

  const downloadRapportPDF = async () => {
    if (!rapport) return;
    const html = buildRapportHTML();
    const container = document.createElement("div");
    container.style.position = "fixed"; container.style.left = "0px"; container.style.top = "0px"; container.style.zIndex = "-1";
    container.style.width = "760px"; container.style.background = "#ffffff"; container.style.padding = "20px"; container.style.fontFamily = "'Segoe UI',Arial,sans-serif"; container.style.color = "#1e293b";
    container.innerHTML = '<style>table{width:100%;border-collapse:collapse;margin:12px 0}th,td{padding:8px 12px;text-align:left;border-bottom:1px solid #e2e8f0;font-size:12px;}th{background:#1e2a78;color:#fff;}h3{color:#1e2a78;margin:18px 0 8px;font-size:14px;}.kpi{width:150px;box-sizing:border-box;padding:10px 8px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;text-align:center;}.kpi strong{display:block;font-size:15px;color:#1e2a78;word-break:break-word;}.kpi span{font-size:10px;color:#64748b;}</style>' + html;
    document.body.appendChild(container);
    try {
      await waitForImages(container);
      const canvas = await html2canvas(container, { scale: 3, useCORS: true, backgroundColor: "#ffffff" });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgW = pageW - 20;
      const imgH = (canvas.height * imgW) / canvas.width;
      let heightLeft = imgH;
      let position = 10;
      pdf.addImage(imgData, "PNG", 10, position, imgW, imgH);
      heightLeft -= (pageH - 20);
      while (heightLeft > 0) {
        position = heightLeft - imgH + 10;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 10, position, imgW, imgH);
        heightLeft -= (pageH - 20);
      }
      pdf.save("rapport-caisse-" + rapport.periode.debut + ".pdf");
    } catch (e) { alert("Erreur lors de la génération du PDF"); }
    finally { document.body.removeChild(container); }
  };

  const printSection = (titre, headers, rows) => {
    const w = window.open("", "_blank", "width=900,height=700");
    w.document.write("<html><head><meta charset='utf-8'><title>" + titre + "</title><style>body{font-family:Segoe UI,Arial;padding:30px}table{width:100%;border-collapse:collapse;margin:12px 0}th,td{padding:8px 12px;text-align:left;border-bottom:1px solid #e2e8f0}th{background:#1e2a78;color:#fff;font-size:12px}h2{color:#1e2a78;font-family:Georgia,serif}.footer{text-align:center;margin-top:20px;font-size:10px;color:#94a3b8}</style></head><body>");
    w.document.write("<h2>" + titre + "</h2><p style='color:#64748b'>" + (user ? user.nom_complet : "") + " - " + (rapport ? rapport.periode.debut + " au " + rapport.periode.fin : "") + "</p>");
    w.document.write("<table><tr>" + headers.map(function(h) { return "<th>" + h + "</th>"; }).join("") + "</tr>");
    rows.forEach(function(r) { w.document.write("<tr>" + r.map(function(c) { return "<td>" + c + "</td>"; }).join("") + "</tr>"); });
    w.document.write("</table><div class='footer'>Propulsé par Worlfinity DevLab</div><script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script></body></html>");
    w.document.close();
  };
  const toReceiptRec = (p) => ({
    receipt_number: p.receipt_number,
    type_label: "Frais scolaires",
    lines: [
      { label: "Eleve", value: (p.prenom || "") + " " + (p.nom || "") },
      { label: "Matricule", value: p.matricule || "" },
      { label: "Frais", value: p.fee_nom }
    ],
    montant: p.montant, monnaie: p.monnaie,
    montant_label: "Montant paye",
    code_caissier: p.code_caissier || user.username,
    created_at: p.created_at,
    statut_annule: p.statut === "annule",
    montant_recu: p.montant_recu,
    solde_restant: p.solde_restant,
    echeances: Array.isArray(p.echeances) ? p.echeances : (p.echeances_json ? JSON.parse(p.echeances_json) : []),
    total_restant_annee: p.total_restant_annee
  });

  if (!currentYear) {
    return (
      <div className="page">
        <div className="page-header"><h1 className="page-title">Caisse</h1></div>
        <div className="dash-placeholder"><p>Aucune annee academique active.</p></div>
      </div>
    );
  }

  if (deviceLoaded && !hasCapability("caisse")) {
    return (
      <div className="page">
        <div className="page-header"><h1 className="page-title">Caisse</h1></div>
        <div className="dash-placeholder">
          <p><strong>Cet appareil n'est pas autorise a utiliser la Caisse.</strong></p>
          <p style={{ marginTop: "10px", fontSize: "13px" }}>Demandez a un administrateur d'activer cette capacite pour cet appareil dans la page "Appareils".</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Caisse</h1>
        <p className="page-subtitle">Annee {currentYear.nom}</p>
      </div>

      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)", marginBottom: "24px" }}>
        <div className="kpi-card"><div className="kpi-label">Encaisse aujourd'hui</div><div className="kpi-value" style={{ color: "var(--ok)", fontSize: "24px" }}>{fmt(stats.encaisse_jour || 0)} HTG</div></div>
        <div className="kpi-card"><div className="kpi-label">Encaisse ce mois</div><div className="kpi-value" style={{ color: "var(--accent-light)", fontSize: "24px" }}>{fmt(stats.encaisse_mois || 0)} HTG</div></div>
        <div className="kpi-card"><div className="kpi-label">Transactions du jour</div><div className="kpi-value">{stats.nb_transactions_jour || 0}</div></div>
        <div className="kpi-card"><div className="kpi-label">Ventes magasin (jour)</div><div className="kpi-value" style={{ color: "var(--gold)", fontSize: "24px" }}>{fmt(stats.ventes_jour || 0)} HTG</div></div>
      </div>

      <div className="store-tabs">
        <button className={"store-tab" + (tab === "frais" ? " active" : "")} onClick={() => setTab("frais")}>Frais scolaires</button>
        <button className={"store-tab" + (tab === "vente" ? " active" : "")} onClick={() => setTab("vente")}>Vente magasin</button>
        <button className={"store-tab" + (tab === "frais_divers" ? " active" : "")} onClick={() => setTab("frais_divers")}>Frais Divers</button>
        <button className={"store-tab" + (tab === "decaissement" ? " active" : "")} onClick={() => setTab("decaissement")}>Decaissement</button>
        <button className={"store-tab" + (tab === "programme" ? " active" : "")} onClick={() => setTab("programme")}>Programmes</button>
        <button className={"store-tab" + (tab === "rapport" ? " active" : "")} onClick={() => { setTab("rapport"); loadRapport(); }}>Mon rapport</button>
      </div>

      {["frais", "vente", "frais_divers", "programme"].includes(tab) && activeSession === null && (
        <div className="login-error" style={{ marginBottom: "16px" }}>Vous devez d'abord ouvrir votre session sur une sous-caisse (menu Sous-Caisses) avant de pouvoir encaisser.</div>
      )}

      {tab === "frais" && (
        <>
          <div className="cashier-search">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un eleve par matricule ou nom..." />
            {results.length > 0 && (
              <div className="search-dropdown">
                {results.map((s) => (
                  <div key={s.id} className="search-item" onClick={() => selectStudent(s)}>
                    {s.photo ? <img src={s.photo} className="student-photo" alt="" /> : <div className="student-photo-empty">{(s.prenom[0]||"")+(s.nom[0]||"")}</div>}
                    <div><div style={{ fontWeight: 600 }}>{s.prenom} {s.nom}</div><div style={{ fontSize: "12px", color: "var(--text-dim)" }}>{s.matricule}{s.classe_nom ? " - " + s.classe_nom : ""}</div></div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {lastReceipt && (
            <div className="receipt-banner">
              <span>Paiement enregistre — Recu <strong>{lastReceipt.receipt_number}</strong> ({fmt(lastReceipt.montant)} {lastReceipt.monnaie})</span>
              <span style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                <button onClick={() => printUnifiedReceipt(toReceiptRec(lastReceipt), settings)} className="btn-sm btn-blue">Imprimer le recu</button>
                <button onClick={() => downloadUnifiedReceiptPDF(toReceiptRec(lastReceipt), settings)} className="btn-sm btn-gold">Telecharger PDF</button>
                <button onClick={() => setLastReceipt(null)} className="receipt-banner-x">x</button>
              </span>
            </div>
          )}

          {error && !payModal && <div className="login-error" style={{ maxWidth: "500px", marginBottom: "16px" }}>{error}</div>}

          {situation && (
            <>
              <div className="student-banner">
                {situation.student.photo ? <img src={situation.student.photo} className="student-banner-photo" alt="" /> : <div className="student-banner-photo-empty">{(situation.student.prenom[0]||"")+(situation.student.nom[0]||"")}</div>}
                <div>
                  <div className="student-banner-name">{situation.student.prenom} {situation.student.nom}</div>
                  <div className="student-banner-mat">{situation.student.matricule}</div>
                  {situation.assigned ? <div className="student-banner-class">{situation.section} › {situation.classe} › {situation.salle}</div> : <div className="badge badge-err" style={{ marginTop: "6px" }}>Non assigne cette annee</div>}
                </div>
              </div>

              {situation.assigned && (
                <div className="table-card" style={{ marginBottom: "24px" }}>
                  <table className="data-table">
                    <thead><tr><th>Frais</th><th>Montant</th><th>Paye</th><th>Restant</th><th>Echeance</th><th>Action</th></tr></thead>
                    <tbody>
                      {situation.fees.length === 0 && <tr><td colSpan="6" className="table-empty">Aucun frais defini pour cette classe.</td></tr>}
                      {situation.fees.map((f) => (
                        <tr key={f.fee_id}>
                          <td><strong>{f.nom}</strong></td>
                          <td>{fmt(f.montant)} {f.monnaie}</td>
                          <td style={{ color: "var(--ok)" }}>{fmt(f.paye)} {f.monnaie}</td>
                          <td style={{ color: f.restant > 0 ? "var(--err)" : "var(--ok)", fontWeight: 700 }}>{fmt(f.restant)} {f.monnaie}</td>
                          <td>{(() => { if (!f.date_echeance) return <span className="badge badge-gray">-</span>; const today = new Date().toISOString().slice(0, 10); if (f.restant <= 0) return <span className="badge badge-ok">Paye</span>; if (f.date_echeance < today) return <span className="badge badge-err">{f.date_echeance}</span>; return <span className="badge badge-blue">{f.date_echeance}</span>; })()}</td>
                          <td>{f.restant > 0 ? <button className="btn-sm btn-green" onClick={() => openPay(f)}>Encaisser</button> : <span className="badge badge-ok">Solde</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <h3 className="form-card-title">Historique des paiements</h3>
              <div className="table-card">
                <table className="data-table">
                  <thead><tr><th>Recu</th><th>Date</th><th>Frais</th><th>Montant</th><th>Caissier</th></tr></thead>
                  <tbody>
                    {history.length === 0 && <tr><td colSpan="5" className="table-empty">Aucun paiement.</td></tr>}
                    {history.map((p) => (
                      <tr key={p.id} onClick={() => setReceiptPreview({ ...p, prenom: situation.student.prenom, nom: situation.student.nom, matricule: situation.student.matricule })} style={{ cursor: "pointer" }}><td><strong style={{ color: "var(--accent)" }}>{p.receipt_number}</strong></td><td>{p.created_at ? p.created_at.slice(0, 10) : ""}</td><td>{p.fee_nom}</td><td>{fmt(p.montant)} {p.monnaie}</td><td>{p.nom_caissier || "-"}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {!situation && (
            <>
              <div className="dash-placeholder" style={{ marginBottom: "24px" }}><p>Recherchez un eleve pour voir sa situation et encaisser.</p></div>
              <h3 className="form-card-title">Derniers paiements</h3>
              <div className="table-card">
                <table className="data-table">
                  <thead><tr><th>Recu</th><th>Date</th><th>Eleve</th><th>Frais</th><th>Montant</th><th>Caissier</th></tr></thead>
                  <tbody>
                    {recent.length === 0 && <tr><td colSpan="6" className="table-empty">Aucun paiement.</td></tr>}
                    {recent.map((p) => (
                      <tr key={p.id} onClick={() => setReceiptPreview(p)} style={{ cursor: "pointer", opacity: p.statut === "annule" ? 0.55 : 1 }}><td><strong style={{ color: "var(--accent)" }}>{p.receipt_number}</strong></td><td>{p.created_at ? p.created_at.slice(0, 10) : ""}</td><td>{p.prenom} {p.nom}</td><td>{p.fee_nom}</td><td><strong>{fmt(p.montant)} {p.monnaie}</strong></td><td>{p.nom_caissier || "-"}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {tab === "vente" && <StoreSale activeSession={activeSession} />}

      {tab === "frais_divers" && <MiscFees activeSession={activeSession} />}

      {tab === "decaissement" && <CaisseDecaissement />}

      {tab === "programme" && <ProgramPay activeSession={activeSession} />}

      {tab === "rapport" && (
        <div>
          <div style={{ display: "flex", gap: "10px", marginBottom: "18px", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", gap: "10px" }}>
              {["jour", "mois"].map((p) => (
                <button key={p} className={"store-tab" + (rapPeriode === p ? " active" : "")} onClick={() => { setRapPeriode(p); setRapView("apercu"); loadRapport(p); }}>
                  {p === "jour" ? "Aujourd'hui" : "Ce mois"}
                </button>
              ))}
              {user && user.role === "Administrateur" && (
                <select value={rapScope} onChange={(e) => { setRapScope(e.target.value); setRapView("apercu"); loadRapport(rapPeriode, e.target.value); }} style={{ marginLeft: "10px", padding: "0 10px", borderRadius: "8px", border: "1.5px solid var(--line)", fontSize: "13px" }}>
                  <option value="mine">Mon rapport</option>
                  <option value="global">Rapport global</option>
                </select>
              )}
            </div>
            {rapport && rapView === "apercu" && <button className="btn-sm btn-blue" onClick={printRapport}>Imprimer le rapport complet</button>}
            {rapport && rapView === "apercu" && <button className="btn-sm btn-gold" onClick={downloadRapportPDF}>Télécharger PDF</button>}
            {rapView !== "apercu" && <button className="btn-sm btn-gray-cancel" onClick={() => setRapView("apercu")}>← Retour à l'aperçu</button>}
          </div>

          {rapport && rapView === "apercu" && (
            <>
              <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)", marginBottom: "20px" }}>
                <div className="kpi-card" onClick={() => setRapView("frais")} style={{ cursor: "pointer", borderLeft: "4px solid var(--ok)" }}><div className="kpi-label">Frais scolaires</div><div className="kpi-value" style={{ fontSize: "16px", color: "var(--ok)" }}>{fmt(rapport.frais.total)} HTG</div><div className="kpi-hint">{rapport.frais.nb} paiement(s) — cliquez pour détails</div></div>
                <div className="kpi-card" onClick={() => setRapView("ventes")} style={{ cursor: "pointer", borderLeft: "4px solid var(--accent)" }}><div className="kpi-label">Ventes magasin</div><div className="kpi-value" style={{ fontSize: "16px", color: "var(--accent)" }}>{fmt(rapport.ventes.total)} HTG</div><div className="kpi-hint">{rapport.ventes.nb} vente(s) — cliquez pour détails</div></div>
                <div className="kpi-card" onClick={() => setRapView("programmes")} style={{ cursor: "pointer", borderLeft: "4px solid var(--gold)" }}><div className="kpi-label">Programmes</div><div className="kpi-value" style={{ fontSize: "16px", color: "var(--gold)" }}>{fmt(rapport.programmes.total)} HTG</div><div className="kpi-hint">{rapport.programmes.nb} paiement(s) — cliquez pour détails</div></div>
                <div className="kpi-card" onClick={() => setRapView("frais_divers")} style={{ cursor: "pointer", borderLeft: "4px solid var(--accent-light)" }}><div className="kpi-label">Frais divers</div><div className="kpi-value" style={{ fontSize: "16px", color: "var(--accent-light)" }}>{fmt(rapport.frais_divers.total)} HTG</div><div className="kpi-hint">{rapport.frais_divers.nb} paiement(s) - cliquez pour détails</div></div>
                <div className="kpi-card" onClick={() => setRapView("decaissements")} style={{ cursor: "pointer", borderLeft: "4px solid var(--err)" }}><div className="kpi-label">Décaissements</div><div className="kpi-value" style={{ fontSize: "16px", color: "var(--err)" }}>{fmt(rapport.decaissements.total)} HTG</div><div className="kpi-hint">{rapport.decaissements.nb} décaissement(s) - cliquez pour détails</div></div>
                <div className="kpi-card" style={{ borderLeft: "4px solid var(--navy)" }}><div className="kpi-label">Total général</div><div className="kpi-value" style={{ fontSize: "18px", color: "var(--navy)" }}>{fmt(rapport.total_general)} HTG</div></div>
                <div className="kpi-card" style={{ borderLeft: "4px solid #059669" }}><div className="kpi-label">Solde du {rapPeriode === "jour" ? "jour" : "mois"}</div><div className="kpi-value" style={{ fontSize: "18px", color: rapport.solde < 0 ? "var(--err)" : "#059669" }}>{fmt(rapport.solde)} HTG</div></div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "18px" }}>
                <div className="form-card">
                  <h3 className="form-card-title">Par section</h3>
                  {rapport.par_section.length === 0 ? <p style={{ color: "var(--text-soft)", fontSize: "13px" }}>Aucune donnée.</p> : (
                    <table className="data-table"><thead><tr><th>Section</th><th>Nb</th><th>Total</th></tr></thead><tbody>
                      {rapport.par_section.map((s, i) => <tr key={i} onClick={() => openEntityReport("section", s.section_id)} style={{ cursor: "pointer" }}><td><strong>{s.section}</strong></td><td>{s.nb}</td><td><strong>{fmt(s.total)} HTG</strong></td></tr>)}
                    </tbody></table>
                  )}
                </div>
                <div className="form-card">
                  <h3 className="form-card-title">Par classe</h3>
                  {rapport.par_classe.length === 0 ? <p style={{ color: "var(--text-soft)", fontSize: "13px" }}>Aucune donnée.</p> : (
                    <table className="data-table"><thead><tr><th>Classe</th><th>Nb</th><th>Total</th></tr></thead><tbody>
                      {rapport.par_classe.map((c, i) => <tr key={i} onClick={() => openEntityReport("classe", c.classe_id)} style={{ cursor: "pointer" }}><td><strong>{c.classe}</strong></td><td>{c.nb}</td><td><strong>{fmt(c.total)} HTG</strong></td></tr>)}
                    </tbody></table>
                  )}
                </div>
              </div>
            </>
          )}

          {rapport && rapView === "frais" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
                <h3 className="form-card-title">Détail des paiements de frais ({rapport.frais.nb}) — {fmt(rapport.frais.total)} HTG</h3>
                <button className="btn-sm btn-blue" onClick={() => printSection("Paiements de frais scolaires", ["Reçu","Date","Élève","Frais","Montant"], rapport.frais.liste.map(function(p) { return [p.receipt_number, (p.created_at||"").slice(0,10), (p.prenom||"")+" "+(p.nom||""), p.fee_nom, fmt(p.montant)+" "+p.monnaie]; }))}>Imprimer</button>
              </div>
              <div className="table-card"><table className="data-table"><thead><tr><th>Reçu</th><th>Date</th><th>Élève</th><th>Frais</th><th>Montant</th></tr></thead><tbody>
                {rapport.frais.liste.length === 0 && <tr><td colSpan="5" className="table-empty">Aucun paiement.</td></tr>}
                {rapport.frais.liste.map((p) => <tr key={p.id}><td><strong style={{ color: "var(--accent)" }}>{p.receipt_number}</strong></td><td>{(p.created_at||"").slice(0,10)}</td><td>{p.prenom} {p.nom}</td><td>{p.fee_nom}</td><td><strong>{fmt(p.montant)} {p.monnaie}</strong></td></tr>)}
              </tbody></table></div>
            </div>
          )}

          {rapport && rapView === "ventes" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
                <h3 className="form-card-title">Détail des ventes magasin ({rapport.ventes.nb}) — {fmt(rapport.ventes.total)} HTG</h3>
                <button className="btn-sm btn-blue" onClick={() => printSection("Ventes magasin", ["Reçu","Date","Total","Statut"], rapport.ventes.liste.map(function(v) { return [v.receipt_number, (v.date_emission||"").slice(0,10), fmt(v.montant_total)+" HTG", v.statut]; }))}>Imprimer</button>
              </div>
              <div className="table-card"><table className="data-table"><thead><tr><th>Reçu</th><th>Date</th><th>Total</th><th>Statut</th></tr></thead><tbody>
                {rapport.ventes.liste.length === 0 && <tr><td colSpan="4" className="table-empty">Aucune vente.</td></tr>}
                {rapport.ventes.liste.map((v) => <tr key={v.id}><td><strong style={{ color: "var(--accent)" }}>{v.receipt_number}</strong></td><td>{(v.date_emission||"").slice(0,10)}</td><td><strong>{fmt(v.montant_total)} HTG</strong></td><td>{v.statut === "reserve" ? <span className="badge badge-gold">Réservé</span> : v.statut === "livre" ? <span className="badge badge-ok">Livré</span> : <span className="badge badge-err">Annulé</span>}</td></tr>)}
              </tbody></table></div>
            </div>
          )}

          {rapport && rapView === "programmes" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
                <h3 className="form-card-title">Détail des paiements de programmes ({rapport.programmes.nb}) — {fmt(rapport.programmes.total)} HTG</h3>
                <button className="btn-sm btn-blue" onClick={() => printSection("Paiements de programmes", ["Reçu","Date","Élève","Programme","Montant"], rapport.programmes.liste.map(function(p) { return [p.receipt_number, (p.created_at||"").slice(0,10), (p.prenom||"")+" "+(p.nom||""), p.programme_nom, fmt(p.montant)+" "+(p.monnaie||"HTG")]; }))}>Imprimer</button>
              </div>
              <div className="table-card"><table className="data-table"><thead><tr><th>Reçu</th><th>Date</th><th>Élève</th><th>Programme</th><th>Montant</th></tr></thead><tbody>
                {rapport.programmes.liste.length === 0 && <tr><td colSpan="5" className="table-empty">Aucun paiement.</td></tr>}
                {rapport.programmes.liste.map((p) => <tr key={p.id}><td><strong style={{ color: "var(--accent)" }}>{p.receipt_number}</strong></td><td>{(p.created_at||"").slice(0,10)}</td><td>{p.prenom} {p.nom}</td><td>{p.programme_nom}</td><td><strong>{fmt(p.montant)} {p.monnaie}</strong></td></tr>)}
              </tbody></table></div>
            </div>
          )}
          {rapport && rapView === "frais_divers" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
                <h3 className="form-card-title">Détail des frais divers ({rapport.frais_divers.nb}) - {fmt(rapport.frais_divers.total)} HTG</h3>
                <button className="btn-sm btn-blue" onClick={() => printSection("Frais divers", ["Reçu","Date","Payeur","Type","Montant"], rapport.frais_divers.liste.map(function(p) { return [p.receipt_number, (p.created_at||"").slice(0,10), p.student_uuid ? (p.prenom||"")+" "+(p.nom||"") : (p.customer_nom||""), p.fee_type_nom, fmt(p.montant)+" "+(p.monnaie||"HTG")]; }))}>Imprimer</button>
              </div>
              <div className="table-card"><table className="data-table"><thead><tr><th>Reçu</th><th>Date</th><th>Payeur</th><th>Type</th><th>Montant</th></tr></thead><tbody>
                {rapport.frais_divers.liste.length === 0 && <tr><td colSpan="5" className="table-empty">Aucun paiement.</td></tr>}
                {rapport.frais_divers.liste.map((p) => <tr key={p.id}><td><strong style={{ color: "var(--accent)" }}>{p.receipt_number}</strong></td><td>{(p.created_at||"").slice(0,10)}</td><td>{p.student_uuid ? p.prenom + " " + p.nom : p.customer_nom}</td><td>{p.fee_type_nom}</td><td><strong>{fmt(p.montant)} {p.monnaie}</strong></td></tr>)}
              </tbody></table></div>
            </div>
          )}
          {rapport && rapView === "decaissements" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
                <h3 className="form-card-title">Détail des décaissements ({rapport.decaissements.nb}) - {fmt(rapport.decaissements.total)} HTG</h3>
                <button className="btn-sm btn-blue" onClick={() => printSection("Décaissements de caisse", ["Reçu","Date","Bénéficiaire","Motif","Montant"], rapport.decaissements.liste.map(function(d) { return [d.numero, d.date, d.beneficiaire, d.motif || "-", fmt(d.montant)+" "+(d.monnaie||"HTG")]; }))}>Imprimer</button>
              </div>
              <div className="table-card"><table className="data-table"><thead><tr><th>Reçu</th><th>Date</th><th>Bénéficiaire</th><th>Motif</th><th>Montant</th></tr></thead><tbody>
                {rapport.decaissements.liste.length === 0 && <tr><td colSpan="5" className="table-empty">Aucun décaissement.</td></tr>}
                {rapport.decaissements.liste.map((d) => <tr key={d.id}><td><strong style={{ color: "var(--accent)" }}>{d.numero}</strong></td><td>{d.date}</td><td>{d.beneficiaire}</td><td>{d.motif || "-"}</td><td><strong style={{ color: "var(--err)" }}>-{fmt(d.montant)} {d.monnaie}</strong></td></tr>)}
              </tbody></table></div>
            </div>
          )}
        </div>
      )}

      {crData && (
        <div className="modal-overlay" onClick={() => setCrData(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "700px", maxHeight: "85vh", overflowY: "auto" }}>
            <div className="modal-header">
              <h3>{crData.entity_nom} - {crData.transactions.length} transaction(s)</h3>
              <button className="modal-close" onClick={() => setCrData(null)}>x</button>
            </div>
            <p style={{ fontSize: "12px", color: "var(--text-dim)", marginBottom: "14px" }}>Période : {crData.periode.debut} au {crData.periode.fin}</p>
            <table className="data-table">
              <thead><tr><th>Reçu</th><th>Date</th><th>Élève</th><th>Frais</th><th>Montant</th><th>Caissier</th></tr></thead>
              <tbody>
                {crData.transactions.length === 0 && <tr><td colSpan="6" className="table-empty">Aucune transaction pour cette période.</td></tr>}
                {crData.transactions.map((t, idx) => (
                  <tr key={idx}>
                    <td>{t.receipt_number}</td>
                    <td>{(t.created_at||"").slice(0,10)}</td>
                    <td>{t.prenom} {t.nom}</td>
                    <td>{t.fee_nom}</td>
                    <td>{Number(t.montant).toLocaleString()} {t.monnaie}</td>
                    <td>{t.nom_caissier || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "14px" }}>
              <strong style={{ color: "var(--navy)" }}>Total : {Number(crData.total).toLocaleString()}</strong>
              <button className="btn-primary btn-sm" onClick={printEntityReport}>Imprimer</button>
            </div>
          </div>
        </div>
      )}

      {payModal && (
        <div className="modal-overlay" onClick={() => setPayModal(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "440px" }}>
            <div className="modal-header"><h3>Encaisser - {payModal.nom}</h3><button className="modal-close" onClick={() => setPayModal(null)}>x</button></div>
            {error && <div className="login-error" style={{ marginBottom: "14px" }}>{error}</div>}
            <div style={{ marginBottom: "16px", fontSize: "14px", color: "var(--text-dim)" }}>Solde restant : <strong style={{ color: "var(--err)" }}>{fmt(payModal.restant)} {payModal.monnaie}</strong></div>
            <div className="form-group" style={{ marginBottom: "20px" }}>
              <label>Montant a encaisser ({payModal.monnaie})</label>
              <input type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} autoFocus onKeyDown={(e) => e.key === "Enter" && requestPay()} />
            </div>
            <div className="form-group" style={{ marginBottom: "20px" }}>
              <label>Montant recu <span style={{ fontWeight: 400, color: "var(--text-dim)" }}>(optionnel)</span></label>
              <input type="number" value={payMontantRecu} onChange={(e) => setPayMontantRecu(e.target.value)} placeholder="ex: 1000" />
            </div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setPayModal(null)}>Annuler</button>
              <button className="btn-primary" onClick={requestPay}>Valider</button>
            </div>
          </div>
        </div>
      )}

      {confirmPay && payModal && (
        <div className="modal-overlay" style={{ zIndex: 10000 }} onClick={() => setConfirmPay(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "420px", textAlign: "center" }}>
            <div style={{ fontSize: "40px", marginBottom: "10px" }}>💰</div>
            <h3 style={{ color: "var(--navy)", marginBottom: "12px" }}>{prenom}, confirmez-vous ?</h3>
            <p style={{ fontSize: "14px", color: "var(--text-dim)", marginBottom: "8px" }}>Vous allez encaisser <strong style={{ color: "var(--accent)", fontSize: "18px" }}>{fmt(Number(payAmount))} {payModal.monnaie}</strong></p>
            <p style={{ fontSize: "13px", color: "var(--text-soft)", marginBottom: "20px" }}>pour le frais <strong>{payModal.nom}</strong> de <strong>{situation ? situation.student.prenom + " " + situation.student.nom : ""}</strong></p>
            <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setConfirmPay(false)}>Revenir</button>
              <button className="btn-primary" onClick={submitPay} disabled={paying}>{paying ? "Enregistrement..." : "Oui, encaisser"}</button>
            </div>
          </div>
        </div>
      )}

      {receiptPreview && (
        <div className="modal-overlay" onClick={() => setReceiptPreview(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ maxHeight: "90vh", overflowY: "auto" }}>
            <div dangerouslySetInnerHTML={{ __html: buildUnifiedReceiptHTML(toReceiptRec(receiptPreview), settings) }} />
            <div style={{ display: "flex", gap: "10px", justifyContent: "center", marginTop: "14px" }}>
              <button className="btn-sm btn-gold" onClick={() => downloadUnifiedReceiptPDF(toReceiptRec(receiptPreview), settings)}>Telecharger PDF</button>
              <button className="btn-sm btn-blue" onClick={() => printUnifiedReceipt(toReceiptRec(receiptPreview), settings)}>Imprimer</button>
              <button className="btn-gray-cancel btn-sm" onClick={() => setReceiptPreview(null)}>Fermer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
