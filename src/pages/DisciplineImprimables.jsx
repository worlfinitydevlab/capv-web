import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "../AuthContext.jsx";
import { getAuthedClient } from "../supabaseClient.js";
import { useYear } from "../YearContext.jsx";
import { useSettings } from "../SettingsContext.jsx";
import { usePermissions } from "../PermissionsContext.jsx";
import "../discipline/discipline.css";
import {
  nomComplet, chargerReferentiel, chargerClasses, chargerSalles, chargerElevesClasse, chargerReglages, logoPourPdf, chargerFichesClasse, emettreCarnet
} from "../discipline/outils.js";
import { creerCarnetsPdf, creerFeuilleClassePdf } from "../discipline/disciplinePdf.js";

const slug = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "");

export default function DisciplineImprimables() {
  const { token, user } = useAuth();
  const { currentYear: year } = useYear();
  const { settings } = useSettings();
  const { can } = usePermissions();
  const supabase = getAuthedClient(token);
  const peutEmettre = can("disc_carnets", "creer");

  const [ref, setRef] = useState({ niveaux: [], fautes: [] });
  const [reglages, setReglages] = useState(null);
  const [logo, setLogo] = useState(null);
  const [classes, setClasses] = useState([]);
  const [classeId, setClasseId] = useState("");
  const [salles, setSalles] = useState([]);
  const [salleId, setSalleId] = useState("");
  const [eleves, setEleves] = useState([]);
  const [fiches, setFiches] = useState([]);
  const [carnetsParEleve, setCarnetsParEleve] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [occupe, setOccupe] = useState(false);
  const [confirmation, setConfirmation] = useState(false);
  const verrou = useRef(false);

  useEffect(() => {
    if (!year) return;
    chargerReferentiel(supabase).then(setRef).catch((e) => setError(e.message || "Erreur"));
    chargerReglages(supabase).then(setReglages).catch(() => {});
    chargerClasses(supabase, year.id).then(setClasses).catch((e) => setError(e.message || "Erreur"));
    // eslint-disable-next-line
  }, [token, year && year.id]);
  useEffect(() => { let vivant = true; logoPourPdf(settings).then((l) => { if (vivant) setLogo(l); }); return () => { vivant = false; }; }, [settings && settings.logo]);

  useEffect(() => {
    setSalleId("");
    if (!classeId) { setSalles([]); return; }
    chargerSalles(supabase, classeId).then(setSalles).catch(() => setSalles([]));
    // eslint-disable-next-line
  }, [classeId]);

  const classe = classes.find((c) => c.id === classeId);
  const salle = salles.find((s) => s.id === salleId);

  const charger = async () => {
    if (!classeId || !year) { setEleves([]); setFiches([]); setCarnetsParEleve({}); return; }
    setLoading(true); setError("");
    try {
      const l = await chargerElevesClasse(supabase, year.id, classeId, salleId || null);
      const r = await chargerFichesClasse(supabase, year.id, classe ? classe.nom : "", salle ? salle.nom : "", l);
      setEleves(l); setFiches(r.fiches); setCarnetsParEleve(r.carnetsParEleve);
    } catch (e) { setError(e.message || "Erreur de chargement"); }
    setLoading(false);
  };
  useEffect(() => { charger(); /* eslint-disable-next-line */ }, [classeId, salleId, year && year.id]);

  const sansCarnet = eleves.filter((e) => !(carnetsParEleve[e.id] || []).some((c) => c.statut === "actif"));
  const nomClasse = (classe ? classe.nom : "classe") + (salle ? "-" + salle.nom : "");

  const feuille = async (mode) => {
    setError("");
    try {
      await creerFeuilleClassePdf({ eleves, niveaux: ref.niveaux, fautes: ref.fautes, classe: classe ? classe.nom : "", salle: salle ? salle.nom : "", annee: year.nom, settings, logo, nomFichier: "Feuille-discipline-" + slug(nomClasse), mode });
    } catch (e) { setError(e.message || "Impossible de créer le PDF"); }
  };
  const carnets = async (mode) => {
    setError("");
    if (!fiches.length) { setError("Aucun carnet émis dans cette classe."); return; }
    try {
      await creerCarnetsPdf({ fiches, niveaux: ref.niveaux, fautes: ref.fautes, annee: year.nom, settings, logo, reglages, nomFichier: "Carnets-discipline-" + slug(nomClasse), mode });
    } catch (e) { setError(e.message || "Impossible de créer le PDF"); }
  };

  const emettreManquants = async () => {
    if (verrou.current) return;
    verrou.current = true; setOccupe(true); setError(""); setInfo("");
    let faits = 0;
    try {
      for (const e of sansCarnet) { await emettreCarnet(supabase, user, { studentId: e.id, year }); faits++; }
      setInfo(faits + " carnet(s) émis.");
      setConfirmation(false);
    } catch (e) { setError((faits ? faits + " carnet(s) émis avant l'erreur. " : "") + (e.message || "Erreur")); setConfirmation(false); }
    verrou.current = false; setOccupe(false);
    await charger();
  };

  if (!year) return (<div className="page"><div className="page-header"><h1 className="page-title">Imprimables</h1></div><div className="dc-vide">Aucune année académique active.</div></div>);

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Imprimables de discipline</h1>
        <p className="page-subtitle">Année {year.nom} · feuilles de surveillance et carnets par classe</p>
      </div>

      <div className="dc-card" style={{ display: "flex", gap: "14px", flexWrap: "wrap", alignItems: "flex-end", marginBottom: "16px" }}>
        <div className="form-group" style={{ margin: 0, minWidth: "220px" }}>
          <label>Classe</label>
          <select value={classeId} onChange={(e) => { setClasseId(e.target.value); setInfo(""); }}>
            <option value="">-- Choisir --</option>
            {classes.map((c) => (<option key={c.id} value={c.id}>{c.nom}</option>))}
          </select>
        </div>
        <div className="form-group" style={{ margin: 0, minWidth: "160px" }}>
          <label>Salle</label>
          <select value={salleId} onChange={(e) => setSalleId(e.target.value)} disabled={!salles.length}>
            <option value="">Toutes</option>
            {salles.map((s) => (<option key={s.id} value={s.id}>{s.nom}</option>))}
          </select>
        </div>
        {classeId && <span className="dc-chip">{eleves.length} élève(s)</span>}
      </div>

      {error && <div className="login-error" style={{ marginBottom: "14px" }}>{error}</div>}
      {info && <div className="dc-alerte ok">{info}</div>}
      {loading && <div className="dc-vide">Chargement...</div>}

      {classeId && !loading && (
        <div className="dc-grid2" style={{ marginBottom: "18px" }}>
          <div className="dc-card">
            <h3 className="form-card-title" style={{ marginTop: 0 }}>Feuille de surveillance</h3>
            <p style={{ fontSize: "13px" }}>Une feuille vierge pour la classe : les élèves en lignes, les {ref.fautes.filter((f) => f.actif).length} fautes en colonnes. Le surveillant la remplit à la main ; on la saisit ensuite dans <strong>Saisie depuis la feuille</strong>.</p>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button className="btn-primary" disabled={!eleves.length} onClick={() => feuille("download")}>Télécharger le PDF</button>
              <button className="btn-sm btn-gray-cancel" disabled={!eleves.length} onClick={() => feuille("print")}>Imprimer</button>
            </div>
          </div>
          <div className="dc-card">
            <h3 className="form-card-title" style={{ marginTop: 0 }}>Carnets de la classe</h3>
            <p style={{ fontSize: "13px" }}>
              <strong>{fiches.length}</strong> carnet(s) émis · <strong>{sansCarnet.length}</strong> élève(s) sans carnet.
              Format : {reglages ? (reglages.format_carnet || "a5").toUpperCase() + " (" + reglages.carnet_largeur_mm + " x " + reglages.carnet_hauteur_mm + " mm)" : "..."}
            </p>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              {peutEmettre && sansCarnet.length > 0 && <button className="btn-primary" disabled={occupe} onClick={() => setConfirmation(true)}>Émettre les carnets manquants ({sansCarnet.length})</button>}
              <button className="btn-sm btn-gray-cancel" disabled={!fiches.length} onClick={() => carnets("download")}>Télécharger les carnets</button>
              <button className="btn-sm btn-gray-cancel" disabled={!fiches.length} onClick={() => carnets("print")}>Imprimer</button>
            </div>
          </div>
        </div>
      )}

      {classeId && !loading && eleves.length > 0 && (
        <div className="dc-card" style={{ padding: 0, overflow: "auto" }}>
          <table className="data-table">
            <thead><tr><th style={{ width: "44px" }}>N°</th><th>Élève</th><th>Matricule</th><th>Carnet</th></tr></thead>
            <tbody>
              {eleves.map((e, i) => {
                const cs = carnetsParEleve[e.id] || [];
                const actif = cs.find((c) => c.statut === "actif");
                return (
                  <tr key={e.id}>
                    <td>{i + 1}</td><td>{nomComplet(e)}</td><td>{e.matricule}</td>
                    <td>{actif ? <span className="dc-chip ok">{actif.numero}</span> : cs.length ? <span className="dc-chip bad">Perdu : à remplacer</span> : <span className="dc-chip warn">Non émis</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {confirmation && (
        <div className="modal-overlay" onClick={() => !occupe && setConfirmation(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "520px", maxWidth: "94vw" }}>
            <div className="modal-header"><h3>Émettre {sansCarnet.length} carnet(s) ?</h3><button className="modal-close" onClick={() => setConfirmation(false)}>x</button></div>
            <p style={{ fontSize: "13px" }}>Un carnet sera créé pour chacun de ces élèves ({classe ? classe.nom : ""}{salle ? " - " + salle.nom : ""}) :</p>
            <div style={{ maxHeight: "260px", overflow: "auto", border: "1px solid rgba(100,116,139,.3)", borderRadius: "10px", padding: "8px 12px", fontSize: "13px" }}>
              {sansCarnet.map((e, i) => (<div key={e.id}>{i + 1}. {nomComplet(e)} <small style={{ opacity: 0.7 }}>({e.matricule})</small></div>))}
            </div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "14px" }}>
              <button className="btn-gray-cancel btn-sm" disabled={occupe} onClick={() => setConfirmation(false)}>Annuler</button>
              <button className="btn-primary" disabled={occupe} onClick={emettreManquants}>{occupe ? "Émission en cours..." : "Confirmer l'émission"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
