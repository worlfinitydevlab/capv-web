import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "../AuthContext.jsx";
import { getAuthedClient } from "../supabaseClient.js";
import { useYear } from "../YearContext.jsx";
import { usePermissions } from "../PermissionsContext.jsx";
import { useSettings } from "../SettingsContext.jsx";
import "../discipline/discipline.css";
import {
  aujourdhui, fmtDate, nomComplet, nettoyer, verifierMotDePasse, chargerReferentiel, calculerRangs,
  chargerCarnet, creerIncident, annulerIncident, emettreCarnet, lireCodeCarnet, chargerReglages, logoPourPdf, ficheDepuisCarnet
} from "../discipline/outils.js";
import { creerCarnetsPdf } from "../discipline/disciplinePdf.js";

const FORM_VIDE = { fauteId: "", date: "", heure: "", signalePar: "", lieu: "", commentaire: "" };

export default function DisciplineCarnets() {
  const { token, user } = useAuth();
  const { can } = usePermissions();
  const { currentYear: year } = useYear();
  const { settings } = useSettings();
  const supabase = getAuthedClient(token);
  const peutCreer = can("disc_carnets", "creer");
  const peutAnnuler = can("disc_carnets", "annuler");

  const [ref, setRef] = useState({ niveaux: [], fautes: [] });
  const [q, setQ] = useState("");
  const [resultats, setResultats] = useState([]);
  const [studentId, setStudentId] = useState(null);
  const [anneeVue, setAnneeVue] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [alerte, setAlerte] = useState(null); // { type, texte }
  const [saisie, setSaisie] = useState(null); // formulaire d'incident
  const [detail, setDetail] = useState(null);
  const [motif, setMotif] = useState("");
  const [mdp, setMdp] = useState("");
  const [modErr, setModErr] = useState("");
  const [perte, setPerte] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const [reglages, setReglages] = useState(null);
  const [logo, setLogo] = useState(null);
  const verrou = useRef(false);

  useEffect(() => {
    chargerReferentiel(supabase).then(setRef).catch((e) => setError(e.message || "Erreur de chargement du catalogue"));
    chargerReglages(supabase).then(setReglages).catch(() => {});
    // eslint-disable-next-line
  }, [token]);
  useEffect(() => { let vivant = true; logoPourPdf(settings).then((l) => { if (vivant) setLogo(l); }); return () => { vivant = false; }; }, [settings && settings.logo]);

  // Recherche d'un eleve (nom, prenom, matricule) ou lecture du code d'un carnet
  useEffect(() => {
    const code = lireCodeCarnet(q);
    const t = nettoyer(q);
    if (code || t.length < 2) { setResultats([]); return undefined; }
    const h = setTimeout(async () => {
      const { data: l } = await supabase.from("students").select("id, matricule, nom, prenom, nisu").is("deleted_at", null)
        .or("nom.ilike.%" + t + "%,prenom.ilike.%" + t + "%,matricule.ilike.%" + t + "%").order("nom").limit(15);
      setResultats(l || []);
    }, 250);
    return () => clearTimeout(h);
    // eslint-disable-next-line
  }, [q]);

  const ouvrir = async (id, annee) => {
    const a = annee || year;
    if (!a) return;
    setLoading(true); setError(""); setStudentId(id); setAnneeVue(a); setResultats([]);
    try { setData(await chargerCarnet(supabase, id, a.id)); } catch (e) { setError(e.message || "Erreur"); }
    setLoading(false);
  };
  const recharger = async () => { if (studentId && anneeVue) { try { setData(await chargerCarnet(supabase, studentId, anneeVue.id)); } catch (e) { setError(e.message || "Erreur"); } } };

  const verifierCode = async () => {
    const c = lireCodeCarnet(q);
    if (!c) return;
    setError(""); setAlerte(null);
    const { data: l } = await supabase.from("discipline_carnets").select("*").eq("numero", c.numero).is("deleted_at", null).limit(1);
    const car = l && l[0];
    if (!car) { setAlerte({ type: "bad", texte: "Carnet " + c.numero + " : introuvable dans le système. Ce carnet n'a pas été émis par l'école." }); return; }
    const { data: an } = await supabase.from("academic_years").select("id, nom").eq("id", car.academic_year_uuid).maybeSingle();
    const annee = an || year;
    await ouvrir(car.student_uuid, annee);
    if (c.code && c.code !== String(car.code_verif).toUpperCase()) setAlerte({ type: "bad", texte: "ATTENTION : le code de vérification ne correspond pas. Ce carnet est peut-être falsifié." });
    else if (car.statut === "perdu") setAlerte({ type: "bad", texte: "Ce carnet " + car.numero + " a été déclaré PERDU et remplacé. Il ne doit plus être accepté." });
    else setAlerte({ type: "ok", texte: "Carnet " + car.numero + " authentique (" + (annee ? annee.nom : "") + ")." });
    setQ("");
  };

  const ouvrirSaisie = (faute) => {
    setModErr("");
    setSaisie({ ...FORM_VIDE, fauteId: faute ? faute.id : "", date: aujourdhui(), signalePar: (user && (user.nom_complet || user.username)) || "" });
  };

  const enregistrerIncident = async () => {
    if (verrou.current) return;
    setModErr("");
    const faute = ref.fautes.find((f) => f.id === saisie.fauteId);
    if (!faute) { setModErr("Choisissez la faute."); return; }
    if (!saisie.date) { setModErr("La date est requise."); return; }
    verrou.current = true; setOccupe(true);
    try {
      const r = await creerIncident(supabase, user, { studentId, yearId: anneeVue.id, faute, date: saisie.date, heure: saisie.heure, lieu: saisie.lieu, commentaire: saisie.commentaire, signalePar: saisie.signalePar });
      setSaisie(null);
      const action = faute.niveau && faute.niveau.action;
      if (r.depasse) setAlerte({ type: "bad", texte: "Faute n°" + faute.numero + " : " + r.numero + " fois (" + faute.cases + " cases prévues). Seuil dépassé" + (action ? " : " + action + "." : ".") });
      else if (r.plein) setAlerte({ type: "warn", texte: "Seuil atteint pour la faute n°" + faute.numero + " (" + r.numero + "/" + faute.cases + ")" + (action ? " : " + action + "." : ".") });
      else setAlerte({ type: "ok", texte: "Incident enregistré : faute n°" + faute.numero + ", case " + r.numero + "/" + faute.cases + "." });
      await recharger();
    } catch (e) { setModErr(e.message || "Erreur d'enregistrement"); }
    verrou.current = false; setOccupe(false);
  };

  const confirmerAnnulation = async () => {
    if (verrou.current) return;
    setModErr("");
    if (!motif.trim()) { setModErr("Indiquez le motif de l'annulation."); return; }
    verrou.current = true; setOccupe(true);
    try {
      await verifierMotDePasse(user.username, mdp);
      await annulerIncident(supabase, user, detail, motif.trim());
      setDetail(null); setMotif(""); setMdp("");
      setAlerte({ type: "ok", texte: "Incident annulé. Il reste visible dans l'historique." });
      await recharger();
    } catch (e) { setModErr(e.message || "Erreur"); }
    verrou.current = false; setOccupe(false);
  };

  const imprimerCarnet = async (mode) => {
    setError("");
    const fiche = ficheDepuisCarnet(data);
    if (!fiche) return;
    try {
      await creerCarnetsPdf({ fiches: [fiche], niveaux: ref.niveaux, fautes: ref.fautes, annee: anneeVue.nom, settings, logo, reglages, nomFichier: "Carnet-" + data.carnet.numero, mode });
    } catch (e) { setError(e.message || "Impossible de créer le PDF"); }
  };

  const emettre = async () => {
    if (verrou.current) return;
    verrou.current = true; setOccupe(true); setError("");
    try {
      const c = await emettreCarnet(supabase, user, { studentId, year: anneeVue });
      setAlerte({ type: "ok", texte: "Carnet " + c.numero + " émis." });
      await recharger();
    } catch (e) { setError(e.message || "Erreur"); }
    verrou.current = false; setOccupe(false);
  };

  const confirmerPerte = async () => {
    if (verrou.current) return;
    setModErr("");
    if (!motif.trim()) { setModErr("Indiquez les circonstances (perdu, volé, détruit...)."); return; }
    verrou.current = true; setOccupe(true);
    try {
      await verifierMotDePasse(user.username, mdp);
      const c = await emettreCarnet(supabase, user, { studentId, year: anneeVue, remplace: data.carnet, motif: motif.trim() });
      setPerte(false); setMotif(""); setMdp("");
      setAlerte({ type: "ok", texte: "Duplicata " + c.numero + " émis. L'ancien carnet est marqué perdu." });
      await recharger();
    } catch (e) { setModErr(e.message || "Erreur"); }
    verrou.current = false; setOccupe(false);
  };

  if (!year) {
    return (<div className="page"><div className="page-header"><h1 className="page-title">Carnets de discipline</h1></div><div className="dash-placeholder"><p>Aucune année académique active.</p></div></div>);
  }

  const { groupes, rang } = data ? calculerRangs(data.incidents) : { groupes: {}, rang: {} };
  const faute = (id) => ref.fautes.find((f) => f.id === id);
  const atteints = data ? ref.fautes.filter((f) => f.actif && (groupes[f.id] || []).length >= f.cases) : [];
  const codeSaisi = lireCodeCarnet(q);

  return (
    <div className="page">
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "10px" }}>
        <div>
          <h1 className="page-title">Carnets de discipline</h1>
          <p className="page-subtitle">Année {year.nom} · registre de l'école, conservé même si l'élève perd son carnet</p>
        </div>
        {data && peutCreer && <button className="btn-primary" onClick={() => ouvrirSaisie(null)}>+ Nouvel incident</button>}
      </div>

      <div className="dc-search">
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && codeSaisi && verifierCode()}
          placeholder="Rechercher un élève (nom, prénom, matricule) ou scanner / saisir le code d'un carnet..." />
        {codeSaisi && <div className="dc-resultats"><div className="dc-res" onClick={verifierCode}><span>Vérifier le carnet <strong>{codeSaisi.numero}</strong></span><small>Entrée</small></div></div>}
        {resultats.length > 0 && (
          <div className="dc-resultats">
            {resultats.map((s) => (
              <div key={s.id} className="dc-res" onClick={() => { setQ(""); setAlerte(null); ouvrir(s.id); }}>
                <strong>{nomComplet(s)}</strong><small>{s.matricule}{s.nisu ? " · NISU " + s.nisu : ""}</small>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && <div className="login-error" style={{ marginBottom: "14px" }}>{error}</div>}
      {alerte && <div className={"dc-alerte " + alerte.type} style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}><span>{alerte.texte}</span><button style={{ background: "none", border: 0, cursor: "pointer", color: "inherit", fontSize: "16px" }} onClick={() => setAlerte(null)}>x</button></div>}

      {!data && !loading && <div className="dc-vide">Cherchez un élève pour ouvrir son carnet de discipline.</div>}
      {loading && <div className="dc-vide">Chargement...</div>}

      {data && data.student && (
        <>
          <div className="dc-card dc-fiche">
            {data.student.photo && /^(https?:|data:)/.test(String(data.student.photo))
              ? <img className="dc-photo" src={data.student.photo} alt="" />
              : <div className="dc-photo">{((data.student.prenom || " ")[0] + (data.student.nom || " ")[0]).toUpperCase()}</div>}
            <div style={{ flex: 1, minWidth: "240px" }}>
              <h2 className="dc-nom">{nomComplet(data.student)}</h2>
              <div className="dc-meta">
                <span className="dc-chip">Matricule {data.student.matricule}</span>
                {data.student.nisu && <span className="dc-chip">NISU {data.student.nisu}</span>}
                <span className="dc-chip">{data.classe ? "Classe " + data.classe + (data.salle ? " · " + data.salle : "") : "Sans classe cette année"}</span>
                {data.carnet
                  ? <span className="dc-chip ok">Carnet {data.carnet.numero}</span>
                  : <span className="dc-chip warn">Aucun carnet émis</span>}
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {!data.carnet && peutCreer && <button className="btn-primary" disabled={occupe} onClick={emettre}>Émettre le carnet</button>}
              {data.carnet && <button className="btn-sm btn-gray-cancel" onClick={() => imprimerCarnet("download")}>Carnet (PDF)</button>}
              {data.carnet && <button className="btn-sm btn-gray-cancel" onClick={() => imprimerCarnet("print")}>Imprimer</button>}
              {data.carnet && peutAnnuler && <button className="btn-sm btn-red" onClick={() => { setPerte(true); setMotif(""); setMdp(""); setModErr(""); }}>Carnet perdu : émettre un duplicata</button>}
            </div>
          </div>

          {atteints.length > 0 && (
            <div className="dc-alerte warn">
              {atteints.map((f) => (
                <div key={f.id}>Faute n°{f.numero} : {(groupes[f.id] || []).length}/{f.cases} cases{f.niveau && f.niveau.action ? " · " + f.niveau.action : ""}</div>
              ))}
            </div>
          )}

          {ref.niveaux.map((niv) => {
            const fs = ref.fautes.filter((f) => f.niveau_code === niv.code && f.actif);
            if (!fs.length) return null;
            return (
              <div className="dc-niveau" key={niv.id}>
                <div className="dc-niveau-tete" style={{ background: niv.couleur || "#64748b" }}>
                  <span>{niv.nom}</span><small>{niv.action || ""}</small>
                </div>
                {fs.map((f) => {
                  const l = groupes[f.id] || [];
                  const total = Math.max(f.cases, l.length);
                  const cases = [];
                  for (let k = 1; k <= total; k++) {
                    const inc = l[k - 1];
                    if (inc) {
                      cases.push(<button key={k} className="dc-case plein" title={fmtDate(inc.date_incident) + (inc.signale_par ? " · " + inc.signale_par : "")}
                        style={{ background: niv.couleur || "#64748b", outline: k > f.cases ? "2px solid #7f1d1d" : "none" }} onClick={() => { setDetail(inc); setMotif(""); setMdp(""); setModErr(""); }}>✓</button>);
                    } else if (k === l.length + 1 && peutCreer) {
                      cases.push(<button key={k} className="dc-case suivante" title="Ajouter un incident" onClick={() => ouvrirSaisie(f)}>{k}</button>);
                    } else {
                      cases.push(<button key={k} className="dc-case" disabled>{k}</button>);
                    }
                  }
                  return (
                    <div className="dc-faute" key={f.id}>
                      <span className="dc-faute-num">{f.numero}</span>
                      <span className="dc-faute-lib">{f.libelle}</span>
                      <span className="dc-cases">{cases}
                        {l.length >= f.cases && peutCreer && <button className="btn-sm btn-gray-cancel dc-ajout" onClick={() => ouvrirSaisie(f)}>+ en plus</button>}
                        {l.length > f.cases && <span className="dc-chip bad dc-depasse">dépassé de {l.length - f.cases}</span>}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })}

          <h3 className="form-card-title" style={{ marginTop: "22px" }}>Historique des incidents</h3>
          <div className="dc-card" style={{ padding: 0, overflow: "auto" }}>
            <table className="data-table">
              <thead><tr><th>Date</th><th>Faute</th><th>Case</th><th>Signalé par</th><th>Lieu</th><th>Statut</th></tr></thead>
              <tbody>
                {data.incidents.length === 0 && <tr><td colSpan="6" style={{ textAlign: "center", opacity: 0.7 }}>Aucun incident enregistré cette année.</td></tr>}
                {[...data.incidents].reverse().map((i) => {
                  const f = faute(i.faute_uuid);
                  const annule = i.statut === "annule";
                  return (
                    <tr key={i.id} style={{ opacity: annule ? 0.55 : 1, cursor: "pointer" }} onClick={() => { setDetail(i); setMotif(""); setMdp(""); setModErr(""); }}>
                      <td>{fmtDate(i.date_incident)}{i.heure ? " " + i.heure : ""}</td>
                      <td style={{ textDecoration: annule ? "line-through" : "none" }}>{f ? f.numero + ". " + f.libelle : "?"}</td>
                      <td>{annule ? "-" : (rang[i.id] || "") + (f ? "/" + f.cases : "")}</td>
                      <td>{i.signale_par || ""}</td>
                      <td>{i.lieu || ""}</td>
                      <td>{annule ? <span className="dc-chip bad">Annulé</span> : <span className="dc-chip ok">Valide</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {data.carnets.length > 0 && (
            <>
              <h3 className="form-card-title" style={{ marginTop: "22px" }}>Carnets émis</h3>
              <div className="dc-card" style={{ padding: 0, overflow: "auto" }}>
                <table className="data-table">
                  <thead><tr><th>Numéro</th><th>Code de vérification</th><th>Date</th><th>Émis par</th><th>Statut</th><th>Motif</th></tr></thead>
                  <tbody>
                    {data.carnets.map((c) => (
                      <tr key={c.id}>
                        <td><strong>{c.numero}</strong></td><td>{c.code_verif}</td><td>{fmtDate(c.date_emission)}</td><td>{c.emis_par || ""}</td>
                        <td>{c.statut === "actif" ? <span className="dc-chip ok">Actif</span> : <span className="dc-chip bad">{c.statut === "perdu" ? "Perdu" : c.statut}</span>}</td>
                        <td>{c.motif || ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {saisie && (
        <div className="modal-overlay" onClick={() => !occupe && setSaisie(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "520px", maxWidth: "94vw" }}>
            <div className="modal-header"><h3>Nouvel incident{data && data.student ? " : " + nomComplet(data.student) : ""}</h3><button className="modal-close" onClick={() => setSaisie(null)}>x</button></div>
            {modErr && <div className="login-error" style={{ marginBottom: "12px" }}>{modErr}</div>}
            <div className="form-group">
              <label>Faute *</label>
              <select value={saisie.fauteId} onChange={(e) => setSaisie({ ...saisie, fauteId: e.target.value })}>
                <option value="">-- Choisir --</option>
                {ref.niveaux.map((n) => (
                  <optgroup key={n.id} label={n.nom}>
                    {ref.fautes.filter((f) => f.niveau_code === n.code && f.actif).map((f) => (
                      <option key={f.id} value={f.id}>{f.numero}. {f.libelle} ({(groupes[f.id] || []).length}/{f.cases})</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div className="form-group"><label>Date *</label><input type="date" value={saisie.date} onChange={(e) => setSaisie({ ...saisie, date: e.target.value })} /></div>
              <div className="form-group"><label>Heure</label><input type="time" value={saisie.heure} onChange={(e) => setSaisie({ ...saisie, heure: e.target.value })} /></div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div className="form-group"><label>Signalé par</label><input value={saisie.signalePar} onChange={(e) => setSaisie({ ...saisie, signalePar: e.target.value })} /></div>
              <div className="form-group"><label>Lieu</label><input value={saisie.lieu} onChange={(e) => setSaisie({ ...saisie, lieu: e.target.value })} placeholder="Cour, classe, portail..." /></div>
            </div>
            <div className="form-group"><label>Commentaire</label><textarea rows="3" value={saisie.commentaire} onChange={(e) => setSaisie({ ...saisie, commentaire: e.target.value })} style={{ width: "100%", boxSizing: "border-box" }} /></div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "8px" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setSaisie(null)} disabled={occupe}>Annuler</button>
              <button className="btn-primary" onClick={enregistrerIncident} disabled={occupe}>{occupe ? "Enregistrement..." : "Enregistrer l'incident"}</button>
            </div>
          </div>
        </div>
      )}

      {detail && (
        <div className="modal-overlay" onClick={() => !occupe && setDetail(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "480px", maxWidth: "94vw" }}>
            <div className="modal-header"><h3>Incident du {fmtDate(detail.date_incident)}</h3><button className="modal-close" onClick={() => setDetail(null)}>x</button></div>
            <div className="receipt-line"><span>Faute</span><strong>{faute(detail.faute_uuid) ? faute(detail.faute_uuid).numero + ". " + faute(detail.faute_uuid).libelle : ""}</strong></div>
            <div className="receipt-line"><span>Case</span><strong>{detail.statut === "valide" ? (rang[detail.id] || "") : "annulé"}</strong></div>
            <div className="receipt-line"><span>Signalé par</span><strong>{detail.signale_par || "-"}</strong></div>
            <div className="receipt-line"><span>Heure / lieu</span><strong>{[detail.heure, detail.lieu].filter(Boolean).join(" · ") || "-"}</strong></div>
            <div className="receipt-line"><span>Enregistré par</span><strong>{detail.modified_by || "-"} ({detail.source === "feuille" ? "feuille papier" : "saisie directe"})</strong></div>
            {detail.commentaire && <p style={{ margin: "10px 0", fontSize: "13px" }}>{detail.commentaire}</p>}
            {detail.statut === "annule" && <div className="dc-alerte bad">Annulé par {detail.annule_par} : {detail.annule_motif}</div>}
            {detail.statut === "valide" && peutAnnuler && (
              <div style={{ marginTop: "14px", borderTop: "1px solid rgba(100,116,139,.25)", paddingTop: "12px" }}>
                <div style={{ fontWeight: 700, marginBottom: "6px" }}>Annuler cet incident</div>
                {modErr && <div className="login-error" style={{ marginBottom: "10px" }}>{modErr}</div>}
                <div className="form-group"><label>Motif *</label><input value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Erreur de saisie, élève confondu..." /></div>
                <div className="form-group"><label>Votre mot de passe *</label><input type="password" value={mdp} onChange={(e) => setMdp(e.target.value)} onKeyDown={(e) => e.key === "Enter" && confirmerAnnulation()} /></div>
                <button className="btn-sm btn-red" onClick={confirmerAnnulation} disabled={occupe}>{occupe ? "..." : "Annuler l'incident"}</button>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "14px" }}><button className="btn-gray-cancel btn-sm" onClick={() => setDetail(null)}>Fermer</button></div>
          </div>
        </div>
      )}

      {perte && (
        <div className="modal-overlay" onClick={() => !occupe && setPerte(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "480px", maxWidth: "94vw" }}>
            <div className="modal-header"><h3>Carnet perdu : duplicata</h3><button className="modal-close" onClick={() => setPerte(false)}>x</button></div>
            <p style={{ fontSize: "13px", marginBottom: "12px" }}>Le carnet {data && data.carnet ? data.carnet.numero : ""} sera marqué <strong>perdu</strong> et ne sera plus accepté. Un duplicata portant toutes les cases déjà cochées sera émis.</p>
            {modErr && <div className="login-error" style={{ marginBottom: "10px" }}>{modErr}</div>}
            <div className="form-group"><label>Circonstances *</label><input value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Perdu, volé, détruit..." /></div>
            <div className="form-group"><label>Votre mot de passe *</label><input type="password" value={mdp} onChange={(e) => setMdp(e.target.value)} onKeyDown={(e) => e.key === "Enter" && confirmerPerte()} /></div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "10px" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setPerte(false)} disabled={occupe}>Annuler</button>
              <button className="btn-primary" onClick={confirmerPerte} disabled={occupe}>{occupe ? "..." : "Émettre le duplicata"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
