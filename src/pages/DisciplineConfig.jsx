import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "../AuthContext.jsx";
import { getAuthedClient } from "../supabaseClient.js";
import { usePermissions } from "../PermissionsContext.jsx";
import "../discipline/discipline.css";
import { nowIso, chargerReferentiel } from "../discipline/outils.js";

const FORMATS = {
  a5: { nom: "A5 (148 x 210 mm), par défaut", l: 148, h: 210 },
  a6: { nom: "A6 (105 x 148 mm)", l: 105, h: 148 },
  a4: { nom: "A4 (210 x 297 mm)", l: 210, h: 297 },
  perso: { nom: "Personnalisé", l: 148, h: 210 }
};

export default function DisciplineConfig() {
  const { token, user } = useAuth();
  const { can } = usePermissions();
  const supabase = getAuthedClient(token);
  const peutModifier = can("disc_config", "modifier");
  const [onglet, setOnglet] = useState("niveaux");
  const [niveaux, setNiveaux] = useState([]);
  const [fautes, setFautes] = useState([]);
  const [reg, setReg] = useState({ format_carnet: "a5", carnet_largeur_mm: "148", carnet_hauteur_mm: "210", titre_carnet: "CARNET DE DISCIPLINE" });
  const [info, setInfo] = useState("");
  const [error, setError] = useState("");
  const [occupe, setOccupe] = useState(false);
  const [nouvelle, setNouvelle] = useState({ libelle: "", niveau_code: "", nb_cases: "" });
  const [nouveauNiveau, setNouveauNiveau] = useState({ nom: "", nb_cases: "", action: "", couleur: "#7c3aed" });
  const [aSupprimer, setASupprimer] = useState(null);
  const verrou = useRef(false);

  const charger = async () => {
    setError("");
    try {
      const r = await chargerReferentiel(supabase);
      setNiveaux(r.niveaux.map((n) => ({ ...n })));
      setFautes(r.fautes.map((f) => ({ id: f.id, numero: f.numero, libelle: f.libelle, niveau_code: f.niveau_code, nb_cases: f.nb_cases == null ? "" : String(f.nb_cases), actif: !!f.actif })));
      const { data } = await supabase.from("discipline_reglages").select("cle, valeur").is("deleted_at", null);
      const m = {};
      (data || []).forEach((x) => { m[x.cle] = x.valeur; });
      setReg((p) => ({ ...p, ...m }));
    } catch (e) { setError(e.message || "Erreur de chargement"); }
  };
  useEffect(() => { charger(); /* eslint-disable-next-line */ }, [token]);

  const garde = async (fn, ok) => {
    if (verrou.current) return;
    verrou.current = true; setOccupe(true); setError(""); setInfo("");
    try { await fn(); setInfo(ok); await charger(); } catch (e) { setError(e.message || "Erreur d'enregistrement"); }
    verrou.current = false; setOccupe(false);
  };
  const modifPar = user ? user.username : null;

  const majNiveau = (code, champ, val) => setNiveaux((l) => l.map((n) => (n.code === code ? { ...n, [champ]: val } : n)));
  const majFaute = (id, champ, val) => setFautes((l) => l.map((f) => (f.id === id ? { ...f, [champ]: val } : f)));

  const cleNom = (x) => String(x || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  const codeDepuisNom = (nom) => {
    const base = cleNom(nom).replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "niveau";
    let code = base, k = 2;
    while (niveaux.some((n) => n.code === code)) code = base + "_" + k++;
    return code;
  };
  // enregistre les modifications en cours dans le tableau (nom, limite, mesure, couleur)
  const sauverNiveauxEdites = async () => {
    for (const n of niveaux) {
      const nom = (n.nom || "").trim();
      if (!nom) throw new Error("Un niveau n'a pas de nom.");
      if (niveaux.some((x) => x.id !== n.id && cleNom(x.nom) === cleNom(nom))) throw new Error("Deux niveaux portent le nom \"" + nom + "\".");
      const nb = parseInt(n.nb_cases, 10);
      if (!(nb >= 1 && nb <= 20)) throw new Error("La limite de \"" + nom + "\" doit être entre 1 et 20 cases.");
      const { error: e } = await supabase.from("discipline_niveaux").update({
        nom, nb_cases: nb, action: (n.action || "").trim() || null, couleur: n.couleur || "#64748b", modified_by: modifPar, last_modified_at: nowIso()
      }).eq("id", n.id);
      if (e) throw e;
    }
  };
  const enregistrerNiveaux = () => garde(sauverNiveauxEdites, "Niveaux enregistrés.");

  const ajouterNiveau = () => garde(async () => {
    const nom = nouveauNiveau.nom.trim();
    if (!nom) throw new Error("Saisissez le nom du niveau (ex. Fautes mineures).");
    const nb = parseInt(nouveauNiveau.nb_cases, 10);
    if (!(nb >= 1 && nb <= 20)) throw new Error("Indiquez la limite : entre 1 et 20 cases par faute.");
    if (niveaux.some((n) => cleNom(n.nom) === cleNom(nom))) throw new Error("Ce niveau existe déjà.");
    await sauverNiveauxEdites();
    const ordre = niveaux.reduce((m, n) => Math.max(m, Number(n.ordre) || 0), 0) + 1;
    const { error: e } = await supabase.from("discipline_niveaux").insert({
      code: codeDepuisNom(nom), nom, nb_cases: nb, action: nouveauNiveau.action.trim() || null, couleur: nouveauNiveau.couleur || "#7c3aed", ordre, modified_by: modifPar
    });
    if (e) throw e;
    setNouveauNiveau({ nom: "", nb_cases: "", action: "", couleur: "#7c3aed" });
  }, "Niveau ajouté. Vous pouvez maintenant y ranger des fautes (onglet Fautes).");

  const deplacerNiveau = (n, sens) => garde(async () => {
    await sauverNiveauxEdites();
    const i = niveaux.findIndex((x) => x.id === n.id), j = i + sens;
    if (j < 0 || j >= niveaux.length) return;
    const a = niveaux[i], b = niveaux[j];
    // ordres distincts garantis : on reecrit toute la liste dans le nouvel ordre
    const liste = niveaux.slice();
    liste[i] = b; liste[j] = a;
    for (let k = 0; k < liste.length; k++) {
      const { error: e } = await supabase.from("discipline_niveaux").update({ ordre: k + 1, modified_by: modifPar, last_modified_at: nowIso() }).eq("id", liste[k].id);
      if (e) throw e;
    }
  }, "Ordre des niveaux enregistré.");

  const demanderSuppression = (n) => {
    setError(""); setInfo("");
    const liees = fautes.filter((f) => f.niveau_code === n.code);
    if (liees.length > 0) {
      setError("Le niveau \"" + n.nom + "\" contient " + liees.length + " faute(s). Déplacez-les d'abord vers un autre niveau (onglet Fautes) : un niveau utilisé ne peut pas être supprimé.");
      return;
    }
    setASupprimer(n);
  };
  const confirmerSuppression = () => {
    const n = aSupprimer;
    setASupprimer(null);
    garde(async () => {
      const { error: e } = await supabase.from("discipline_niveaux").update({ deleted_at: nowIso(), modified_by: modifPar, last_modified_at: nowIso() }).eq("id", n.id);
      if (e) throw e;
    }, "Niveau supprimé.");
  };

  const enregistrerFautes = () => garde(async () => {
    for (const f of fautes) {
      if (!f.libelle.trim()) throw new Error("La faute n°" + f.numero + " n'a pas de libellé.");
      let nb = null;
      if (String(f.nb_cases).trim() !== "") {
        nb = parseInt(f.nb_cases, 10);
        if (!(nb >= 1 && nb <= 20)) throw new Error("Cases de la faute n°" + f.numero + " : entre 1 et 20 (ou vide pour suivre le niveau).");
      }
      const { error: e } = await supabase.from("discipline_fautes").update({
        libelle: f.libelle.trim(), niveau_code: f.niveau_code, nb_cases: nb, actif: f.actif, modified_by: modifPar, last_modified_at: nowIso()
      }).eq("id", f.id);
      if (e) throw e;
    }
  }, "Fautes enregistrées.");

  const ajouterFaute = () => garde(async () => {
    const lib = nouvelle.libelle.trim();
    if (!lib) throw new Error("Saisissez le libellé de la faute.");
    if (!nouvelle.niveau_code) throw new Error("Choisissez le niveau de gravité.");
    if (fautes.some((f) => f.libelle.trim().toLowerCase() === lib.toLowerCase())) throw new Error("Cette faute existe déjà.");
    let nb = null;
    if (String(nouvelle.nb_cases).trim() !== "") { nb = parseInt(nouvelle.nb_cases, 10); if (!(nb >= 1 && nb <= 20)) throw new Error("Cases : entre 1 et 20."); }
    const numero = fautes.reduce((m, f) => Math.max(m, Number(f.numero) || 0), 0) + 1;
    const { error: e } = await supabase.from("discipline_fautes").insert({ numero, libelle: lib, niveau_code: nouvelle.niveau_code, nb_cases: nb, actif: true, modified_by: modifPar });
    if (e) throw e;
    setNouvelle({ libelle: "", niveau_code: "", nb_cases: "" });
  }, "Faute ajoutée.");

  const enregistrerCarnet = () => garde(async () => {
    const f = reg.format_carnet;
    const l = parseInt(reg.carnet_largeur_mm, 10), h = parseInt(reg.carnet_hauteur_mm, 10);
    if (!(l >= 60 && l <= 400 && h >= 80 && h <= 500)) throw new Error("Dimensions : largeur 60-400 mm, hauteur 80-500 mm.");
    const titre = (reg.titre_carnet || "").trim() || "CARNET DE DISCIPLINE";
    const lignes = { format_carnet: f, carnet_largeur_mm: String(l), carnet_hauteur_mm: String(h), titre_carnet: titre };
    for (const cle of Object.keys(lignes)) {
      const { data: ex, error: e0 } = await supabase.from("discipline_reglages").select("id").eq("cle", cle).is("deleted_at", null).limit(1);
      if (e0) throw e0;
      if (ex && ex[0]) {
        const { error: e } = await supabase.from("discipline_reglages").update({ valeur: lignes[cle], modified_by: modifPar, last_modified_at: nowIso() }).eq("id", ex[0].id);
        if (e) throw e;
      } else {
        const { error: e } = await supabase.from("discipline_reglages").insert({ cle, valeur: lignes[cle], modified_by: modifPar });
        if (e) throw e;
      }
    }
  }, "Format du carnet enregistré.");

  const choisirFormat = (code) => {
    const f = FORMATS[code];
    setReg((p) => (code === "perso" ? { ...p, format_carnet: code } : { ...p, format_carnet: code, carnet_largeur_mm: String(f.l), carnet_hauteur_mm: String(f.h) }));
  };

  const ONGLETS = [["niveaux", "Niveaux de gravité"], ["fautes", "Fautes"], ["carnet", "Format du carnet"]];
  const nomNiveau = (c) => { const n = niveaux.find((x) => x.code === c); return n ? n.nom : c; };

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Configuration de la discipline</h1>
        <p className="page-subtitle">Seuils, mesures et format du carnet : c'est l'école qui décide</p>
      </div>
      <div className="dc-onglets">
        {ONGLETS.map(([k, l]) => (<button key={k} className={onglet === k ? "btn-primary" : "btn-sm btn-gray-cancel"} onClick={() => { setOnglet(k); setInfo(""); setError(""); }}>{l}</button>))}
      </div>
      {error && <div className="login-error" style={{ marginBottom: "14px" }}>{error}</div>}
      {info && <div className="dc-alerte ok">{info}</div>}
      {!peutModifier && <div className="dc-alerte warn">Lecture seule : vous n'avez pas le droit de modifier la configuration.</div>}

      {onglet === "niveaux" && (
        <div className="dc-card" style={{ overflow: "auto" }}>
          <p style={{ fontSize: "13px", marginTop: 0 }}>Chaque niveau fixe la <strong>limite</strong> (nombre de cases par faute dans le carnet) et la <strong>mesure</strong> à prendre quand toutes les cases sont cochées. Vous pouvez créer autant de niveaux que nécessaire.</p>
          <table className="data-table dc-table">
            <thead><tr><th style={{ width: "230px" }}>Niveau</th><th style={{ width: "100px" }}>Limite (cases)</th><th>Mesure à la dernière case</th><th style={{ width: "80px" }}>Couleur</th>{peutModifier && <th style={{ width: "150px" }}></th>}</tr></thead>
            <tbody>
              {niveaux.map((n, i) => (
                <tr key={n.id}>
                  <td><input type="text" disabled={!peutModifier} value={n.nom || ""} onChange={(e) => majNiveau(n.code, "nom", e.target.value)} style={{ fontWeight: 700 }} /></td>
                  <td><input type="number" min="1" max="20" disabled={!peutModifier} value={n.nb_cases} onChange={(e) => majNiveau(n.code, "nb_cases", e.target.value)} /></td>
                  <td><input type="text" disabled={!peutModifier} value={n.action || ""} onChange={(e) => majNiveau(n.code, "action", e.target.value)} placeholder="Ex. Avertissement écrit, convocation des parents, conseil de discipline..." /></td>
                  <td><input type="color" disabled={!peutModifier} value={n.couleur || "#64748b"} onChange={(e) => majNiveau(n.code, "couleur", e.target.value)} style={{ width: "56px", height: "34px", padding: 0, border: "1px solid #cbd5e1", borderRadius: "8px" }} /></td>
                  {peutModifier && (
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button className="btn-sm btn-gray-cancel" disabled={occupe || i === 0} title="Monter" onClick={() => deplacerNiveau(n, -1)}>&uarr;</button>{" "}
                      <button className="btn-sm btn-gray-cancel" disabled={occupe || i === niveaux.length - 1} title="Descendre" onClick={() => deplacerNiveau(n, 1)}>&darr;</button>{" "}
                      <button className="btn-sm btn-red" disabled={occupe} onClick={() => demanderSuppression(n)}>Supprimer</button>
                    </td>
                  )}
                </tr>
              ))}
              {niveaux.length === 0 && <tr><td colSpan="5" style={{ textAlign: "center", opacity: 0.7 }}>Aucun niveau. Ajoutez-en un ci-dessous.</td></tr>}
            </tbody>
          </table>
          {peutModifier && <div style={{ marginTop: "14px", textAlign: "right" }}><button className="btn-primary" disabled={occupe} onClick={enregistrerNiveaux}>{occupe ? "..." : "Enregistrer les niveaux"}</button></div>}
          <p style={{ fontSize: "12px", opacity: 0.75 }}>Changer la limite d'un niveau modifie l'affichage des carnets numériques et les prochains PDF ; les carnets papier déjà imprimés ne changent pas.</p>

          {peutModifier && (
            <>
              <h3 className="form-card-title" style={{ marginTop: "22px" }}>Ajouter un niveau de gravité</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1.3fr 110px 2fr 70px auto", gap: "10px", alignItems: "end" }}>
                <div className="form-group" style={{ margin: 0 }}><label>Nom du niveau</label><input value={nouveauNiveau.nom} onChange={(e) => setNouveauNiveau({ ...nouveauNiveau, nom: e.target.value })} placeholder="Ex. Fautes mineures" /></div>
                <div className="form-group" style={{ margin: 0 }}><label>Limite (cases)</label><input type="number" min="1" max="20" value={nouveauNiveau.nb_cases} onChange={(e) => setNouveauNiveau({ ...nouveauNiveau, nb_cases: e.target.value })} placeholder="Ex. 15" /></div>
                <div className="form-group" style={{ margin: 0 }}><label>Mesure à la dernière case</label><input value={nouveauNiveau.action} onChange={(e) => setNouveauNiveau({ ...nouveauNiveau, action: e.target.value })} placeholder="Ex. Convocation des parents" /></div>
                <div className="form-group" style={{ margin: 0 }}><label>Couleur</label><input type="color" value={nouveauNiveau.couleur} onChange={(e) => setNouveauNiveau({ ...nouveauNiveau, couleur: e.target.value })} style={{ width: "56px", height: "34px", padding: 0, border: "1px solid #cbd5e1", borderRadius: "8px" }} /></div>
                <button className="btn-primary" disabled={occupe} onClick={ajouterNiveau}>+ Ajouter le niveau</button>
              </div>
            </>
          )}
        </div>
      )}

      {onglet === "fautes" && (
        <div className="dc-card" style={{ overflow: "auto" }}>
          <p style={{ fontSize: "13px", marginTop: 0 }}>Laissez « Cases » vide pour suivre le niveau. Une faute <strong>désactivée</strong> n'est plus proposée à la saisie mais reste dans l'historique des élèves.</p>
          <table className="data-table dc-table">
            <thead><tr><th style={{ width: "50px" }}>N&deg;</th><th>Faute</th><th style={{ width: "190px" }}>Niveau</th><th style={{ width: "90px" }}>Cases</th><th style={{ width: "80px" }}>Active</th></tr></thead>
            <tbody>
              {fautes.map((f) => (
                <tr key={f.id} style={{ opacity: f.actif ? 1 : 0.55 }}>
                  <td><strong>{f.numero}</strong></td>
                  <td><input type="text" disabled={!peutModifier} value={f.libelle} onChange={(e) => majFaute(f.id, "libelle", e.target.value)} /></td>
                  <td><select disabled={!peutModifier} value={f.niveau_code} onChange={(e) => majFaute(f.id, "niveau_code", e.target.value)}>{niveaux.map((n) => (<option key={n.id} value={n.code}>{n.nom}</option>))}</select></td>
                  <td><input type="number" min="1" max="20" disabled={!peutModifier} value={f.nb_cases} onChange={(e) => majFaute(f.id, "nb_cases", e.target.value)} placeholder="auto" /></td>
                  <td style={{ textAlign: "center" }}><input type="checkbox" disabled={!peutModifier} checked={f.actif} onChange={(e) => majFaute(f.id, "actif", e.target.checked)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {peutModifier && (
            <>
              <div style={{ marginTop: "14px", textAlign: "right" }}><button className="btn-primary" disabled={occupe} onClick={enregistrerFautes}>{occupe ? "..." : "Enregistrer les fautes"}</button></div>
              <h3 className="form-card-title" style={{ marginTop: "22px" }}>Ajouter une faute</h3>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 110px auto", gap: "10px", alignItems: "end" }}>
                <div className="form-group" style={{ margin: 0 }}><label>Libellé</label><input value={nouvelle.libelle} onChange={(e) => setNouvelle({ ...nouvelle, libelle: e.target.value })} /></div>
                <div className="form-group" style={{ margin: 0 }}><label>Niveau</label><select value={nouvelle.niveau_code} onChange={(e) => setNouvelle({ ...nouvelle, niveau_code: e.target.value })}><option value="">--</option>{niveaux.map((n) => (<option key={n.id} value={n.code}>{n.nom}</option>))}</select></div>
                <div className="form-group" style={{ margin: 0 }}><label>Cases</label><input type="number" min="1" max="20" value={nouvelle.nb_cases} onChange={(e) => setNouvelle({ ...nouvelle, nb_cases: e.target.value })} placeholder="auto" /></div>
                <button className="btn-primary" disabled={occupe} onClick={ajouterFaute}>Ajouter</button>
              </div>
              {nouvelle.niveau_code && <p style={{ fontSize: "12px", opacity: 0.75 }}>Niveau choisi : {nomNiveau(nouvelle.niveau_code)}.</p>}
            </>
          )}
        </div>
      )}

      {onglet === "carnet" && (
        <div className="dc-card" style={{ maxWidth: "620px" }}>
          <div className="form-group">
            <label>Format du carnet imprimé</label>
            <select disabled={!peutModifier} value={reg.format_carnet} onChange={(e) => choisirFormat(e.target.value)}>
              {Object.keys(FORMATS).map((k) => (<option key={k} value={k}>{FORMATS[k].nom}</option>))}
            </select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div className="form-group"><label>Largeur (mm)</label><input type="number" disabled={!peutModifier || reg.format_carnet !== "perso"} value={reg.carnet_largeur_mm} onChange={(e) => setReg({ ...reg, carnet_largeur_mm: e.target.value })} /></div>
            <div className="form-group"><label>Hauteur (mm)</label><input type="number" disabled={!peutModifier || reg.format_carnet !== "perso"} value={reg.carnet_hauteur_mm} onChange={(e) => setReg({ ...reg, carnet_hauteur_mm: e.target.value })} /></div>
          </div>
          <div className="form-group"><label>Titre imprimé en haut du carnet</label><input disabled={!peutModifier} value={reg.titre_carnet} onChange={(e) => setReg({ ...reg, titre_carnet: e.target.value })} /></div>
          <p style={{ fontSize: "12.5px", opacity: 0.8 }}>Le logo, le nom et l'adresse de l'école viennent des Paramètres de l'établissement.</p>
          {peutModifier && <div style={{ textAlign: "right" }}><button className="btn-primary" disabled={occupe} onClick={enregistrerCarnet}>{occupe ? "..." : "Enregistrer le format"}</button></div>}
        </div>
      )}

      {aSupprimer && (
        <div className="modal-overlay" onClick={() => setASupprimer(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "440px", maxWidth: "94vw" }}>
            <div className="modal-header"><h3>Supprimer ce niveau ?</h3><button className="modal-close" onClick={() => setASupprimer(null)}>x</button></div>
            <p style={{ fontSize: "13px" }}>Le niveau <strong>{aSupprimer.nom}</strong> ne contient aucune faute. Il disparaîtra de la configuration, des carnets et des feuilles de surveillance.</p>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "14px" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setASupprimer(null)}>Annuler</button>
              <button className="btn-sm btn-red" onClick={confirmerSuppression}>Supprimer le niveau</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
