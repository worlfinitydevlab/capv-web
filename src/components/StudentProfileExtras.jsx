import React, { useState, useEffect } from "react";
import { useAuth } from "../AuthContext.jsx";
import { getAuthedClient } from "../supabaseClient.js";
import { useSettings } from "../SettingsContext.jsx";
import { usePermissions } from "../PermissionsContext.jsx";

const statutParent = (v, fem) => v === "vivant" ? (fem ? "Vivante" : "Vivant") : v === "decede" ? (fem ? "Décédée" : "Décédé") : "";
const nomComplet = (p, n) => [p, n].filter(Boolean).join(" ");

function sectionsFiche(s) {
  return [
    ["Identité", [
      ["Date de naissance", s.date_naissance], ["Lieu de naissance", s.lieu_naissance],
      ["Genre", s.sexe === "M" ? "Masculin" : s.sexe === "F" ? "Féminin" : ""], ["Nationalité", s.nationalite],
      ["Adresse", s.adresse], ["Téléphone", s.telephone], ["Email", s.email],
      ["Numéro d'ordre", s.numero_ordre], ["Numéro identifiant", s.numero_identifiant], ["NISU", s.nisu],
      ["Congrégation religieuse", s.congregation_religieuse], ["Rang dans la famille", s.rang_famille]
    ]],
    ["Père", [
      ["Nom complet", nomComplet(s.pere_prenom, s.pere_nom)], ["Statut", statutParent(s.pere_statut, false)],
      ["Occupation", s.pere_occupation], ["NIF/NINU", s.pere_nif], ["Téléphone", s.pere_telephone]
    ]],
    ["Mère", [
      ["Nom complet", nomComplet(s.mere_prenom, s.mere_nom)], ["Statut", statutParent(s.mere_statut, true)],
      ["Occupation", s.mere_occupation], ["NIF/NINU", s.mere_nif], ["Téléphone", s.mere_telephone]
    ]],
    ["Responsable légal", [
      ["Nom complet", nomComplet(s.responsable_prenom, s.responsable_nom)], ["Occupation", s.responsable_occupation],
      ["NIF/NINU", s.responsable_nif], ["Téléphone", s.responsable_telephone]
    ]],
    ["Urgence", [["Téléphone d'urgence", s.urgence_telephone], ["Lien de parenté", s.urgence_lien]]],
    ["Scolarité antérieure", [["École précédente", s.ecole_precedente], ["Classe précédente", s.classe_precedente]]],
    ["Santé et notes", [
      ["Conditions médicales", s.conditions_medicales], ["Handicap / besoins spéciaux", s.handicap_besoins], ["Notes", s.remarques]
    ]]
  ].filter(([, lignes]) => lignes.some(([, v]) => v));
}

const esc = (v) => String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function imprimerFiche(s, etab, parcours) {
  const blocs = sectionsFiche(s).map(([titre, lignes]) =>
    "<h3>" + esc(titre) + "</h3><table>" +
    lignes.filter(([, v]) => v).map(([l, v]) => "<tr><td class='l'>" + esc(l) + "</td><td>" + esc(v) + "</td></tr>").join("") +
    "</table>").join("");
  const hist = parcours.length
    ? "<h3>Parcours scolaire</h3><table><tr><th>Année</th><th>Classe</th><th>Décision</th><th>Établissement</th></tr>" +
      parcours.map((p) => "<tr><td>" + esc(p.annee_nom) + "</td><td>" + esc(p.classe_nom) + "</td><td>" + esc(LIBELLES[p.decision] || "") + "</td><td>" + esc(p.etablissement || "") + "</td></tr>").join("") + "</table>"
    : "";
  const html = "<html><head><meta charset='utf-8'><title>Fiche d'inscription</title><style>" +
    "body{font-family:Arial,sans-serif;margin:28px;color:#111}h1{font-size:20px;margin:0}h2{font-size:15px;margin:2px 0 14px;color:#444;font-weight:normal}" +
    "h3{font-size:13px;text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid #1e2a78;padding-bottom:3px;margin:18px 0 6px;color:#1e2a78}" +
    "table{width:100%;border-collapse:collapse;font-size:12.5px}td,th{padding:4px 6px;border-bottom:1px solid #ddd;text-align:left}td.l{width:34%;color:#555}" +
    ".id{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #1e2a78;padding-bottom:8px;margin-bottom:10px}" +
    ".sig{margin-top:40px;display:flex;justify-content:space-between;font-size:12px}.sig div{width:40%;border-top:1px solid #333;padding-top:4px;text-align:center}" +
    "</style></head><body><div class='id'><div><h1>" + esc(etab) + "</h1><h2>Fiche d'inscription</h2></div>" +
    "<div style='text-align:right;font-size:13px'><b>" + esc(s.prenom) + " " + esc(s.nom) + "</b><br>Matricule : " + esc(s.matricule) + "</div></div>" +
    blocs + hist +
    "<div class='sig'><div>Signature du parent / tuteur</div><div>Cachet et signature de l'établissement</div></div>" +
    "<script>window.onload=function(){window.print();}</script></body></html>";
  const w = window.open("", "_blank", "width=900,height=800");
  if (!w) return;
  w.document.open(); w.document.write(html); w.document.close();
}

const LIBELLES = {
  admis: "Admis", maintenu: "Maintenu (redouble)", admis_ailleurs: "Admis ailleurs", exclu: "Exclu", en_cours: "En cours", "": "Non précisé"
};
const BADGES = { admis: "badge-ok", maintenu: "badge-gold", admis_ailleurs: "badge-blue", exclu: "badge-err", en_cours: "badge-blue" };

export function FicheComplete({ s, parcours }) {
  const { settings } = useSettings();
  const etab = (settings && settings.nom_etablissement) || "Établissement";
  const sections = sectionsFiche(s);
  return (
    <div style={{ padding: "0 20px", marginBottom: "18px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
        <h3 style={{ margin: 0, fontSize: "13px", color: "var(--text-soft)", textTransform: "uppercase", letterSpacing: "0.5px" }}>{"Fiche d'inscription"}</h3>
        <button className="btn-gray-cancel btn-sm" onClick={() => imprimerFiche(s, etab, parcours || [])}>{"Imprimer la fiche"}</button>
      </div>
      {sections.length === 0 && <div style={{ color: "var(--text-dim)", fontSize: "13px" }}>{"Aucune information complémentaire enregistrée."}</div>}
      {sections.map(([titre, lignes], i) => (
        <details key={titre} open={i === 0} style={{ marginBottom: "6px", border: "1px solid var(--line)", borderRadius: "10px", padding: "6px 12px" }}>
          <summary style={{ cursor: "pointer", fontWeight: 700, color: "var(--navy)", fontSize: "13px" }}>{titre}</summary>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 20px", margin: "8px 0 4px" }}>
            {lignes.filter(([, v]) => v).map(([l, v]) => (
              <div className="receipt-line" key={l}><span>{l}</span><strong>{v}</strong></div>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}

const VIDE = { annee_nom: "", classe_nom: "", decision: "", etablissement: "", remarques: "" };

export function ParcoursScolaire({ studentId, classeActuelle, onChargé }) {
  const auth = useAuth();
  const supabase = getAuthedClient(auth && auth.token);
  const { can } = usePermissions();
  const modifiePar = (auth && auth.user && (auth.user.nom_complet || auth.user.username)) || "web";
  const [rows, setRows] = useState([]);
  const [noms, setNoms] = useState([]);
  const [ouvert, setOuvert] = useState(false);
  const [form, setForm] = useState(VIDE);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const charger = async () => {
    try {
      // 1) vraies annees : affectations de l'eleve (toutes annees)
      const { data: asg } = await supabase.from("assignments").select("class_uuid, academic_year_uuid").eq("student_uuid", studentId).is("deleted_at", null);
      const annees = {};
      const { data: ys } = await supabase.from("academic_years").select("id, nom, statut");
      (ys || []).forEach((y) => { annees[y.id] = y; });
      const ids = [...new Set((asg || []).map((a) => a.class_uuid).filter(Boolean))];
      const nomsClasses = {};
      if (ids.length) {
        const { data: cl } = await supabase.from("classes").select("id, nom").in("id", ids);
        (cl || []).forEach((c) => { nomsClasses[c.id] = c.nom; });
      }
      // 2) historique saisi (autres etablissements, annees non configurees) + decisions
      const { data: h } = await supabase.from("student_history").select("*").eq("student_uuid", studentId).is("deleted_at", null);
      const histo = h || [];
      const liste = [];
      const vus = new Set();
      (asg || []).forEach((a) => {
        const y = annees[a.academic_year_uuid];
        if (!y) return;
        const ligneH = histo.find((x) => x.annee_nom === y.nom);
        vus.add(y.nom);
        liste.push({ id: "an-" + y.id, annee_nom: y.nom, classe_nom: nomsClasses[a.class_uuid] || (ligneH && ligneH.classe_nom) || "-", decision: y.statut === "active" ? "en_cours" : (ligneH ? ligneH.decision : ""), source: ligneH ? ligneH.source : "annee", actuelle: y.statut === "active", reel: true, etablissement: ligneH && ligneH.etablissement, remarques: ligneH && ligneH.remarques });
      });
      histo.filter((x) => !vus.has(x.annee_nom)).forEach((x) => liste.push(x));
      liste.sort((a, b) => String(b.annee_nom).localeCompare(String(a.annee_nom)));
      setRows(liste);
      if (onChargé) onChargé(liste);
    } catch (e) {}
  };
  useEffect(() => { charger(); }, [studentId]);
  useEffect(() => {
    supabase.from("classes").select("nom").then(({ data }) => setNoms([...new Set((data || []).map((c) => c.nom))].sort())).catch(() => {});
  }, []);

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const enregistrer = async () => {
    setErr("");
    if (!form.annee_nom.trim()) { setErr("L'année est requise (ex. 2025-2026)"); return; }
    setBusy(true);
    try {
      const annee = form.annee_nom.trim();
      const valeurs = { classe_nom: form.classe_nom.trim() || null, decision: form.decision || null, etablissement: form.etablissement.trim() || null, remarques: form.remarques.trim() || null, source: "manuel", modified_by: modifiePar, last_modified_at: new Date().toISOString(), deleted_at: null };
      const { data: ex } = await supabase.from("student_history").select("id, version").eq("student_uuid", studentId).eq("annee_nom", annee).limit(1);
      let r;
      if (ex && ex.length) r = await supabase.from("student_history").update({ ...valeurs, version: (ex[0].version || 1) + 1 }).eq("id", ex[0].id);
      else r = await supabase.from("student_history").insert({ student_uuid: studentId, annee_nom: annee, ...valeurs });
      if (r.error) { setErr(r.error.message); setBusy(false); return; }
      setForm(VIDE); setOuvert(false);
      await charger();
    } catch (e) { setErr("Erreur de connexion"); }
    setBusy(false);
  };

  const supprimer = async (p) => {
    if (!window.confirm("Supprimer l'année " + p.annee_nom + " du parcours ?")) return;
    await supabase.from("student_history").update({ deleted_at: new Date().toISOString(), last_modified_at: new Date().toISOString(), modified_by: modifiePar }).eq("id", p.id);
    charger();
  };

  const lignes = rows;

  return (
    <div style={{ padding: "0 20px", marginBottom: "18px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
        <h3 style={{ margin: 0, fontSize: "13px", color: "var(--text-soft)", textTransform: "uppercase", letterSpacing: "0.5px" }}>{"Parcours scolaire"}</h3>
        {can("students", "modifier") && <button className="btn-gray-cancel btn-sm" onClick={() => { setOuvert(!ouvert); setErr(""); }}>{ouvert ? "Annuler" : "+ Ajouter une année passée"}</button>}
      </div>

      {ouvert && (
        <div style={{ border: "1px dashed var(--line)", borderRadius: "10px", padding: "12px", marginBottom: "10px" }}>
          <div className="form-row">
            <div className="form-group"><label>{"Année *"}</label><input value={form.annee_nom} placeholder="2025-2026" onChange={(e) => setF("annee_nom", e.target.value)} /></div>
            <div className="form-group">
              <label>Classe</label>
              <input list="parcours-classes" value={form.classe_nom} placeholder={"ex. 8e AF"} onChange={(e) => setF("classe_nom", e.target.value)} />
              <datalist id="parcours-classes">{noms.map((n) => <option key={n} value={n} />)}</datalist>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>{"Décision de fin d'année"}</label>
              <select value={form.decision} onChange={(e) => setF("decision", e.target.value)}>
                <option value="">{"Non précisé"}</option>
                <option value="admis">{"Admis (classe supérieure)"}</option>
                <option value="maintenu">{"Maintenu (redoublement)"}</option>
                <option value="admis_ailleurs">{"Admis ailleurs"}</option>
                <option value="exclu">{"Exclu"}</option>
              </select>
            </div>
            <div className="form-group"><label>{"Établissement (si autre)"}</label><input value={form.etablissement} placeholder={"Laisser vide si notre établissement"} onChange={(e) => setF("etablissement", e.target.value)} /></div>
          </div>
          <div className="form-group"><label>Remarques</label><input value={form.remarques} onChange={(e) => setF("remarques", e.target.value)} /></div>
          {err && <div className="login-error" style={{ marginBottom: "8px" }}>{err}</div>}
          <div style={{ textAlign: "right" }}><button className="btn-primary" onClick={enregistrer} disabled={busy}>{busy ? "Enregistrement..." : "Enregistrer"}</button></div>
        </div>
      )}

      {lignes.length === 0 && <div style={{ color: "var(--text-dim)", fontSize: "13px" }}>{"Aucun historique enregistré."}</div>}
      <div style={{ borderLeft: "3px solid var(--accent)", marginLeft: "6px", paddingLeft: "14px" }}>
        {lignes.map((p) => (
          <div key={p.id} style={{ position: "relative", padding: "6px 0 10px" }}>
            <span style={{ position: "absolute", left: "-22px", top: "10px", width: "11px", height: "11px", borderRadius: "50%", background: p.actuelle ? "var(--accent)" : "var(--navy)" }} />
            <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
              <strong style={{ color: "var(--navy)" }}>{p.annee_nom}</strong>
              <span>{p.classe_nom || "-"}</span>
              <span className={"badge " + (BADGES[p.decision] || "badge-gray")}>{LIBELLES[p.decision] || LIBELLES[""]}</span>
              {p.source === "migration" && <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>{"(migration)"}</span>}
              {!p.reel && can("students", "modifier") && <button className="modal-close" style={{ fontSize: "12px" }} onClick={() => supprimer(p)} title="Supprimer">x</button>}
            </div>
            {(p.etablissement || p.remarques) && <div style={{ fontSize: "12px", color: "var(--text-dim)" }}>{[p.etablissement, p.remarques].filter(Boolean).join(" - ")}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

export function BlocsProfil({ s, classeActuelle }) {
  const [parcours, setParcours] = useState([]);
  return (
    <>
      <FicheComplete s={s} parcours={parcours} />
      <ParcoursScolaire studentId={s.id} classeActuelle={classeActuelle} onChargé={setParcours} />
    </>
  );
}
