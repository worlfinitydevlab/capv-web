import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../AuthContext.jsx";
import { useSettings } from "../SettingsContext.jsx";
import { getAuthedClient } from "../supabaseClient.js";
import { appeler, formaterChrono } from "../accesSpecial/accesSpecialStore.js";
import { TACHES, TACHES_ACTIVES, courtTache, DUREES, DUREE_MIN, DUREE_MAX, MAX_ACTIONS, ACTIONS_DROITS, COLONNES_DROITS, NOMS_ACTIONS, sectionsDroits, nomModule, resumeDroits, aDesDroits } from "../accesSpecial/accesSpecialCatalog.js";
import { dateHeure, dureeTexte, dureePrevue, etatLibelle, lignesJournal, resume, phraseResume, telechargerRapportPdf } from "../accesSpecial/rapportAccesSpecial.js";

const VERROU_MS = 10 * 60 * 1000;   // le mot de passe n'est garde en memoire que 10 minutes sans activite
const BADGE = { actif: "badge badge-ok", expire: "badge badge-gray", epuise: "badge badge-gold", revoque: "badge badge-err" };
const COULEUR_TON = { ok: "#16a34a", err: "#dc2626", gris: "#64748b", info: "#1e40af" };

// Page reservee a l'Administrateur (le menu la cache aux autres, et la page se verifie elle-meme)
export default function AccesSpeciaux() {
  const { user } = useAuth();
  if (!user || user.role !== "Administrateur") {
    return (
      <div className="page">
        <div className="page-header"><div><h1 className="page-title">Accès spéciaux</h1></div></div>
        <div className="login-error" style={{ maxWidth: "460px" }}>Cette page est réservée à l'Administrateur.</div>
      </div>
    );
  }
  return <Gestion user={user} />;
}

function Gestion({ user }) {
  const { token } = useAuth();
  const { settings } = useSettings();
  const [mdp, setMdp] = useState("");           // vide = verrouille
  const [saisie, setSaisie] = useState("");
  const [erreurCle, setErreurCle] = useState("");
  const [occupe, setOccupe] = useState(false);
  const [liste, setListe] = useState(null);
  const [recuA, setRecuA] = useState(0);
  const [message, setMessage] = useState("");
  const [erreur, setErreur] = useState("");
  const [formulaire, setFormulaire] = useState(false);
  const [rapport, setRapport] = useState(null);
  const [revoque, setRevoque] = useState(null);
  const [, setTic] = useState(0);
  const derniere = useRef(Date.now());

  const verrouiller = useCallback((texte) => { setMdp(""); setSaisie(""); setListe(null); setFormulaire(false); setRapport(null); setRevoque(null); if (texte) setErreurCle(texte); }, []);

  // Appel d'une action d'administrateur avec le mot de passe en memoire
  const agir = useCallback(async (action, corps, motDePasse) => {
    const r = await appeler(action, { admin_username: user.username, admin_password: motDePasse !== undefined ? motDePasse : mdp, ...(corps || {}) });
    if (!r.ok && r.status === 401 && motDePasse === undefined) verrouiller("Mot de passe refusé : saisis-le de nouveau.");
    return r;
  }, [mdp, user.username, verrouiller]);

  const charger = useCallback(async (motDePasse) => {
    const r = await agir("lister", null, motDePasse);
    if (r.ok) { setListe(r.data.acces || []); setRecuA(Date.now()); setErreur(""); }
    return r;
  }, [agir]);

  const deverrouiller = async () => {
    if (occupe) return;
    setErreurCle("");
    if (!saisie) { setErreurCle("Entre ton mot de passe."); return; }
    setOccupe(true);
    const r = await charger(saisie);
    setOccupe(false);
    if (!r.ok) {
      setErreurCle(r.status === 404 ? "La fonction « acces-special » n'est pas installée sur ce Supabase." : r.status === 401 ? "Mot de passe incorrect." : r.error);
      return;
    }
    setMdp(saisie); setSaisie(""); derniere.current = Date.now();
  };

  // verrou automatique apres 10 minutes sans activite
  useEffect(() => {
    if (!mdp) return undefined;
    const marquer = () => { derniere.current = Date.now(); };
    const evts = ["mousemove", "keydown", "click", "touchstart", "scroll"];
    evts.forEach((e) => window.addEventListener(e, marquer, { passive: true }));
    const t = setInterval(() => { if (Date.now() - derniere.current > VERROU_MS) verrouiller("Page verrouillée après 10 minutes sans activité."); }, 15000);
    return () => { evts.forEach((e) => window.removeEventListener(e, marquer)); clearInterval(t); };
  }, [mdp, verrouiller]);

  // tic de chronometre + rechargement automatique de la liste (60 s, onglet visible)
  const aDesActifs = !!(liste && liste.some((a) => a.etat === "actif"));
  useEffect(() => {
    if (!mdp || !aDesActifs) return undefined;
    const t = setInterval(() => setTic((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [mdp, aDesActifs]);
  useEffect(() => {
    if (!mdp) return undefined;
    const t = setInterval(() => { if (document.visibilityState === "visible") charger(); }, 60000);
    return () => clearInterval(t);
  }, [mdp, charger]);

  const restant = (a) => Math.max(0, a.restant_s - Math.floor((Date.now() - recuA) / 1000));
  // un acces dont le temps est ecoule : on recharge une fois
  const expirees = liste ? liste.filter((a) => a.etat === "actif" && restant(a) === 0).map((a) => a.id).join(",") : "";
  useEffect(() => { if (expirees && mdp) charger(); }, [expirees]);

  const ouvrirRapport = async (a) => {
    setErreur("");
    const r = await agir("rapport", { acces_id: a.id });
    if (!r.ok) { setErreur(r.error); return; }
    setRapport(r.data);
  };
  const revoquer = async () => {
    const a = revoque;
    setOccupe(true);
    const r = await agir("revoquer", { acces_id: a.id });
    setOccupe(false);
    if (!r.ok) { setErreur(r.error); setRevoque(null); charger(); return; }
    setRevoque(null);
    setMessage("Accès " + a.numero + " révoqué : il n'est plus utilisable.");
    charger();
  };

  if (!mdp) {
    return (
      <div className="page">
        <div className="page-header"><div><h1 className="page-title">Accès spéciaux</h1><p className="page-subtitle">Donne à une personne précise une tâche ou des droits sur des pages, pour une durée limitée, avec un rapport.</p></div></div>
        <div className="form-card" style={{ maxWidth: "440px" }}>
          <p style={{ fontSize: "13px", color: "var(--text-dim)", marginTop: 0 }}>Pour gérer les accès spéciaux, confirme ton mot de passe (il n'est gardé que dans cette page, 10 minutes sans activité au plus).</p>
          {erreurCle && <div className="login-error" style={{ marginBottom: "12px" }}>{erreurCle}</div>}
          <div className="form-group" style={{ marginBottom: "16px" }}>
            <label>Ton mot de passe ({user.username})</label>
            <input type="password" autoComplete="current-password" value={saisie} onChange={(e) => setSaisie(e.target.value)} onKeyDown={(e) => e.key === "Enter" && deverrouiller()} autoFocus />
          </div>
          <button className="btn-primary" onClick={deverrouiller} disabled={occupe}>{occupe ? "Vérification..." : "Ouvrir"}</button>
        </div>
      </div>
    );
  }

  const actifs = (liste || []).filter((a) => a.etat === "actif");
  const autres = (liste || []).filter((a) => a.etat !== "actif");
  return (
    <div className="page">
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", flexWrap: "wrap" }}>
        <div>
          <h1 className="page-title">Accès spéciaux</h1>
          <p className="page-subtitle">{actifs.length} actif(s) · {autres.length} terminé(s)</p>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button className="btn-gray-cancel btn-sm" onClick={() => charger()}>Actualiser</button>
          <button className="btn-gray-cancel btn-sm" onClick={() => verrouiller("")}>Verrouiller</button>
          <button className="btn-primary" onClick={() => { setMessage(""); setFormulaire(true); }}>+ Accorder un accès</button>
        </div>
      </div>

      {message && <div style={{ background: "#e6f4ea", color: "#1e6b34", padding: "10px 14px", borderRadius: "8px", marginBottom: "14px", display: "flex", gap: "10px" }}><span style={{ flex: 1 }}>{message}</span><button onClick={() => setMessage("")} style={{ background: "transparent", border: "none", cursor: "pointer", color: "inherit" }}>x</button></div>}
      {erreur && <div className="login-error" style={{ marginBottom: "14px" }}>{erreur}</div>}
      {liste === null && <p style={{ color: "var(--text-dim)" }}>Chargement...</p>}
      {liste && liste.length === 0 && <div className="table-card"><p className="table-empty" style={{ padding: "24px" }}>Aucun accès spécial pour le moment. « Accorder un accès » permet de débloquer une personne, à distance, pour une tâche précise ou pour des pages, pendant une durée limitée.</p></div>}

      {actifs.length > 0 && <Section titre="En cours">{actifs.map((a) => <Carte key={a.id} a={a} restant={restant(a)} onRapport={() => ouvrirRapport(a)} onRevoquer={() => setRevoque(a)} />)}</Section>}
      {autres.length > 0 && <Section titre="Terminés">{autres.map((a) => <Carte key={a.id} a={a} restant={0} onRapport={() => ouvrirRapport(a)} />)}</Section>}

      {formulaire && (
        <FormulaireAcces token={token} user={user} onClose={() => setFormulaire(false)}
          onAccorder={async (corps) => {
            const r = await agir("accorder", corps);
            if (r.ok) { setFormulaire(false); setMessage("Accès " + r.data.acces.numero + " accordé à " + (r.data.acces.nom_complet || r.data.acces.username) + " pour " + dureeTexte(dureePrevue(r.data.acces)) + ". Il apparaît chez cette personne en moins de 2 minutes (tout de suite si elle actualise sa page)."); charger(); }
            return r;
          }} />
      )}
      {revoque && (
        <div className="modal-overlay" onClick={() => !occupe && setRevoque(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "min(420px, 94vw)" }}>
            <div className="modal-header"><h3 style={{ color: "var(--err)" }}>Révoquer l'accès</h3><button className="modal-close" onClick={() => setRevoque(null)} disabled={occupe}>x</button></div>
            <p style={{ fontSize: "13px" }}>{revoque.nom_complet || revoque.username} ne pourra plus rien faire avec l'accès <strong>{revoque.numero}</strong>. Les actions déjà faites restent dans le rapport.</p>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setRevoque(null)} disabled={occupe}>Annuler</button>
              <button className="btn-sm btn-red" onClick={revoquer} disabled={occupe}>{occupe ? "..." : "Révoquer maintenant"}</button>
            </div>
          </div>
        </div>
      )}
      {rapport && <VueRapport donnees={rapport} settings={settings} generePar={user.nom_complet || user.username} onClose={() => setRapport(null)} />}
    </div>
  );
}

function Section({ titre, children }) {
  return (
    <div style={{ marginBottom: "22px" }}>
      <h3 style={{ fontSize: "13px", textTransform: "uppercase", letterSpacing: "0.6px", color: "var(--text-dim)", margin: "0 0 10px" }}>{titre}</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 330px), 1fr))", gap: "14px" }}>{children}</div>
    </div>
  );
}

function Carte({ a, restant, onRapport, onRevoquer }) {
  const actif = a.etat === "actif";
  const cles = Object.keys(a.droits || {});
  const couleur = !actif ? "var(--text-dim)" : restant <= 60 ? "#dc2626" : restant <= 300 ? "#ea7a1d" : "#92400e";
  return (
    <div className="table-card" style={{ padding: "14px 16px", borderLeft: "4px solid " + (actif ? "#f59e0b" : "var(--line)") }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800 }}>{a.nom_complet || a.username}</div>
          <div style={{ fontSize: "11px", color: "var(--text-dim)" }}>{a.numero} · @{a.username}</div>
        </div>
        <span className={BADGE[a.etat] || "badge"}>{etatLibelle(a.etat).split(" (")[0]}</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "5px", margin: "10px 0" }}>
        {a.taches.map((t) => <span key={t} className="badge badge-blue">{courtTache(t)}</span>)}
        {cles.slice(0, 4).map((k) => <span key={k} className="badge badge-gold" title={nomModule(k) + " : " + a.droits[k].map((x) => NOMS_ACTIONS[x] || x).join(", ")}>{nomModule(k)} · {a.droits[k].map((x) => NOMS_ACTIONS[x] || x).join(", ")}</span>)}
        {cles.length > 4 && <span className="badge badge-gray" title={resumeDroits(a.droits)}>+ {cles.length - 4} module(s)</span>}
      </div>
      <div style={{ fontSize: "12px", color: "var(--text-dim)", lineHeight: 1.5 }}>
        Accordé par {a.accorde_par_nom || a.accorde_par} le {dateHeure(a.debut).slice(0, 16)}<br />
        Motif : {a.motif}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginTop: "10px" }}>
        {actif
          ? <span style={{ fontWeight: 800, fontSize: "18px", color: couleur, fontVariantNumeric: "tabular-nums" }}>{formaterChrono(restant)}</span>
          : <span style={{ fontSize: "12px", color: "var(--text-dim)" }}>{a.etat === "revoque" ? "Révoqué" + (a.revoque_par ? " par " + a.revoque_par : "") : "Terminé le " + dateHeure(a.fin).slice(0, 16)}</span>}
        {(a.taches.length > 0 || !cles.length) && <span style={{ fontSize: "12px" }}>{a.nb_actions || 0} action(s){a.utilisations_max != null ? " sur " + a.utilisations_max + " permises" : ""}{a.echecs ? " · " + a.echecs + " échec(s)" : ""}</span>}
        {cles.length > 0 && <span style={{ fontSize: "12px" }}>droits temporaires · rapport des pages et modifications</span>}
      </div>
      <div style={{ display: "flex", gap: "8px", marginTop: "12px", flexWrap: "wrap" }}>
        <button className="btn-sm btn-blue" onClick={onRapport}>Rapport</button>
        {actif && onRevoquer && <button className="btn-sm btn-red" onClick={onRevoquer}>Révoquer</button>}
      </div>
    </div>
  );
}

function FormulaireAcces({ token, user, onClose, onAccorder }) {
  const [users, setUsers] = useState(null);
  const [personne, setPersonne] = useState("");
  const [taches, setTaches] = useState([]);
  const [droits, setDroits] = useState({});            // { cle_module: ["voir", "creer", ...] }
  const [recherche, setRecherche] = useState("");
  const [duree, setDuree] = useState(30);
  const [dureeLibre, setDureeLibre] = useState("");
  const [limite, setLimite] = useState("illimite");   // "illimite" | "1" | "5" | "10" | "autre"
  const [limiteLibre, setLimiteLibre] = useState("");
  const [motif, setMotif] = useState("");
  const [erreur, setErreur] = useState("");
  const [occupe, setOccupe] = useState(false);

  useEffect(() => {
    let vivant = true;
    (async () => {
      try {
        const sb = getAuthedClient(token);
        const { data, error } = await sb.from("users").select("username, nom_complet, role_nom, statut").order("nom_complet");
        if (error) throw error;
        const ok = (data || []).filter((u) => u.username !== user.username && u.role_nom !== "Super Admin" && (!u.statut || String(u.statut).toLowerCase() === "actif"));
        if (vivant) setUsers(ok);
      } catch (e) { if (vivant) { setUsers([]); setErreur("Impossible de charger les utilisateurs : " + ((e && e.message) || "erreur")); } }
    })();
    return () => { vivant = false; };
  }, [token]);

  const minutes = dureeLibre !== "" ? Number(dureeLibre) : duree;
  const max = limite === "illimite" ? null : limite === "autre" ? Number(limiteLibre) : Number(limite);
  const choisie = (users || []).find((u) => u.username === personne);
  const fin = new Date(Date.now() + (Number.isFinite(minutes) ? minutes : 0) * 60000);
  const bascule = (k) => setTaches((t) => (t.includes(k) ? t.filter((x) => x !== k) : [...t, k]));
  const sections = useMemo(() => sectionsDroits(), []);
  // Cocher un niveau autre que « Voir » coche aussi « Voir » (sans lui la page ne s'ouvre pas) ; decocher « Voir » retire tout le module.
  const basculerDroit = (m, action) => setDroits((d) => {
    const actuel = d[m.cle] || [];
    let suivant;
    if (actuel.includes(action)) suivant = action === "voir" ? [] : actuel.filter((x) => x !== action);
    else suivant = [...actuel, action];
    if (suivant.length && m.actions.includes("voir") && !suivant.includes("voir")) suivant = ["voir", ...suivant];
    const copie = { ...d };
    if (suivant.length) copie[m.cle] = ACTIONS_DROITS.filter((x) => suivant.includes(x)); else delete copie[m.cle];
    return copie;
  });
  const nbModules = Object.keys(droits).length;
  const filtre = recherche.trim().toLowerCase();

  const valider = () => {
    if (!personne) return "Choisis la personne.";
    if (!taches.length && !aDesDroits(droits)) return "Choisis au moins une tâche ou un droit sur une page.";
    if (!Number.isInteger(minutes) || minutes < DUREE_MIN || minutes > DUREE_MAX) return "La durée doit être entre " + DUREE_MIN + " et " + DUREE_MAX + " minutes.";
    if (taches.length && limite === "autre" && (!Number.isInteger(max) || max < 1 || max > MAX_ACTIONS)) return "Le nombre d'actions doit être entre 1 et " + MAX_ACTIONS + ".";
    if (motif.trim().length < 3) return "Écris le motif (au moins 3 caractères).";
    return "";
  };
  const envoyer = async () => {
    const e = valider();
    if (e) { setErreur(e); return; }
    setErreur(""); setOccupe(true);
    const r = await onAccorder({ username: personne, taches, droits, duree_min: minutes, utilisations_max: taches.length ? max : null, motif: motif.trim() });
    setOccupe(false);
    if (!r.ok) setErreur(r.error);
  };

  return (
    <div className="modal-overlay" onClick={() => !occupe && onClose()}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "min(640px, 96vw)", maxHeight: "92vh", overflowY: "auto" }}>
        <div className="modal-header"><h3>Accorder un accès spécial</h3><button className="modal-close" onClick={onClose} disabled={occupe}>x</button></div>
        {erreur && <div className="login-error" style={{ marginBottom: "12px" }}>{erreur}</div>}

        <div className="form-group" style={{ marginBottom: "14px" }}>
          <label>1. La personne</label>
          <select value={personne} onChange={(e) => setPersonne(e.target.value)} disabled={users === null}>
            <option value="">{users === null ? "Chargement..." : "Choisir..."}</option>
            {(users || []).map((u) => <option key={u.username} value={u.username}>{(u.nom_complet || u.username) + " — " + (u.role_nom || "")}</option>)}
          </select>
          <div style={{ fontSize: "11px", color: "var(--text-dim)", marginTop: "4px" }}>Une <strong>tâche</strong> (partie 2) lève la double authentification, mais la personne doit déjà pouvoir ouvrir la page. Pour lui <strong>ouvrir une page qu'elle n'a pas</strong>, ou lui donner plus de droits sur une page, utilise la partie 3.</div>
        </div>

        <div style={{ marginBottom: "14px" }}>
          <label style={{ fontSize: "12px", fontWeight: 700, display: "block", marginBottom: "6px" }}>2. Tâches avec son propre mot de passe (facultatif)</label>
          {TACHES_ACTIVES.map((k) => (
            <label key={k} style={{ display: "flex", gap: "10px", alignItems: "flex-start", padding: "8px 10px", border: "1px solid " + (taches.includes(k) ? "#f59e0b" : "var(--line)"), background: taches.includes(k) ? "#fffbeb" : "#fff", borderRadius: "10px", marginBottom: "6px", cursor: "pointer" }}>
              <input type="checkbox" checked={taches.includes(k)} onChange={() => bascule(k)} style={{ marginTop: "3px" }} />
              <span><strong style={{ fontSize: "13px" }}>{TACHES[k].nom}</strong><br /><span style={{ fontSize: "11px", color: "var(--text-dim)" }}>{TACHES[k].aide}</span></span>
            </label>
          ))}
        </div>

        <div style={{ marginBottom: "14px" }}>
          <label style={{ fontSize: "12px", fontWeight: 700, display: "block", marginBottom: "6px" }}>3. Droits sur des pages (facultatif){nbModules ? " — " + nbModules + " module(s) choisi(s)" : ""}</label>
          <div style={{ fontSize: "11px", color: "var(--text-dim)", marginBottom: "6px" }}>Pendant la durée choisie, la personne reçoit ces droits en plus des siens. Cocher « Créer », « Modifier » ou « Annuler » coche aussi « Voir ». La Finance, les salaires et la gestion des utilisateurs restent réservés.</div>
          <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Chercher une page ou un module..." aria-label="Chercher un module" style={{ width: "100%", padding: "7px 10px", borderRadius: "8px", border: "1px solid var(--line)", marginBottom: "6px", boxSizing: "border-box" }} />
          <div style={{ maxHeight: "270px", overflowY: "auto", border: "1px solid var(--line)", borderRadius: "10px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) repeat(4, 60px)", gap: "4px", padding: "6px 10px", background: "#f1f5f9", fontSize: "11px", fontWeight: 700, color: "var(--text-dim)", position: "sticky", top: 0, zIndex: 1 }}>
              <span>Module</span>{ACTIONS_DROITS.map((a) => <span key={a} style={{ textAlign: "center" }}>{COLONNES_DROITS[a]}</span>)}
            </div>
            {sections.map((s) => {
              const mods = s.modules.filter((m) => !filtre || m.nom.toLowerCase().includes(filtre) || s.titre.toLowerCase().includes(filtre));
              if (!mods.length) return null;
              return (
                <div key={s.id}>
                  <div style={{ padding: "5px 10px", background: "#f8fafc", fontSize: "10.5px", fontWeight: 800, letterSpacing: "0.5px", textTransform: "uppercase", color: "var(--text-dim)", borderTop: "1px solid var(--line)" }}>{s.titre}</div>
                  {mods.map((m) => {
                    const choisi = droits[m.cle] || [];
                    return (
                      <div key={m.cle} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) repeat(4, 60px)", gap: "4px", alignItems: "center", padding: "4px 10px", borderTop: "1px solid #eef2f7", background: choisi.length ? "#fffbeb" : "#fff" }}>
                        <span style={{ fontSize: "12px" }} title={m.aide || undefined}>{m.nom}</span>
                        {ACTIONS_DROITS.map((a) => m.actions.includes(a)
                          ? <label key={a} title={m.labels[a]} style={{ textAlign: "center", cursor: "pointer" }}><input type="checkbox" checked={choisi.includes(a)} onChange={() => basculerDroit(m, a)} aria-label={m.nom + " : " + COLONNES_DROITS[a]} /></label>
                          : <span key={a} style={{ textAlign: "center", color: "#cbd5e1" }}>-</span>)}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
          {nbModules > 0 && <button type="button" className="btn-gray-cancel btn-sm" style={{ marginTop: "6px" }} onClick={() => setDroits({})}>Tout décocher</button>}
        </div>

        <div style={{ marginBottom: "14px" }}>
          <label style={{ fontSize: "12px", fontWeight: 700, display: "block", marginBottom: "6px" }}>4. Pendant combien de temps</label>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
            {DUREES.map((d) => (
              <button key={d.min} type="button" className={"btn-sm " + (dureeLibre === "" && duree === d.min ? "btn-primary" : "btn-gray-cancel")} onClick={() => { setDuree(d.min); setDureeLibre(""); }}>{d.nom}</button>
            ))}
            <input type="number" min={DUREE_MIN} max={DUREE_MAX} placeholder="min" value={dureeLibre} onChange={(e) => setDureeLibre(e.target.value)} style={{ width: "76px", padding: "6px", borderRadius: "6px", border: "1px solid var(--line)" }} aria-label="Durée en minutes" />
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-dim)", marginTop: "4px" }}>Le chronomètre démarre dès maintenant : fin à {fin.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} (de {DUREE_MIN} min à 4 h).</div>
        </div>

        {taches.length > 0 && <div style={{ marginBottom: "14px" }}>
          <label style={{ fontSize: "12px", fontWeight: 700, display: "block", marginBottom: "6px" }}>5. Nombre d'actions permises (tâches)</label>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
            {[["illimite", "Sans limite"], ["1", "1 seule"], ["5", "5"], ["10", "10"], ["autre", "Autre"]].map(([v, nom]) => (
              <button key={v} type="button" className={"btn-sm " + (limite === v ? "btn-primary" : "btn-gray-cancel")} onClick={() => setLimite(v)}>{nom}</button>
            ))}
            {limite === "autre" && <input type="number" min="1" max={MAX_ACTIONS} value={limiteLibre} onChange={(e) => setLimiteLibre(e.target.value)} style={{ width: "76px", padding: "6px", borderRadius: "6px", border: "1px solid var(--line)" }} aria-label="Nombre d'actions" />}
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-dim)", marginTop: "4px" }}>Retirer 12 élèves d'un coup compte pour 12 actions. Cette limite ne concerne que les tâches, pas les droits sur des pages.</div>
        </div>}

        <div className="form-group" style={{ marginBottom: "14px" }}>
          <label>{taches.length > 0 ? "6" : "5"}. Motif (inscrit dans le rapport)</label>
          <input value={motif} onChange={(e) => setMotif(e.target.value)} maxLength={300} placeholder="Ex. Retrait urgent d'un élève, administrateur absent" />
        </div>

        <div style={{ background: "#f8fafc", border: "1px solid var(--line)", borderRadius: "10px", padding: "10px 12px", fontSize: "12px", marginBottom: "14px" }}>
          {choisie && (taches.length || aDesDroits(droits)) ? (
            <>Tu donnes à <strong>{choisie.nom_complet || choisie.username}</strong>, pendant <strong>{dureeTexte(Number.isFinite(minutes) ? minutes : 0)}</strong> :
              {taches.length > 0 && <><br />• les tâches <strong>{taches.map(courtTache).join(", ")}</strong>, {max === null ? "sans limite d'actions" : max + " action(s) au plus"}. Elle confirme avec <strong>son propre mot de passe</strong> (plus besoin d'un autre administrateur).</>}
              {aDesDroits(droits) && <><br />• les droits <strong>{resumeDroits(droits, 8)}</strong>. Les actions sensibles qui demandent l'autorisation d'un autre administrateur la demanderont encore, sauf si tu ajoutes la tâche correspondante.</>}
              <br />Tout est inscrit dans un rapport (pages ouvertes et modifications comprises).</>
          ) : "Choisis la personne, puis des tâches et/ou des droits sur des pages."}
        </div>

        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button className="btn-gray-cancel btn-sm" onClick={onClose} disabled={occupe}>Annuler</button>
          <button className="btn-primary" onClick={envoyer} disabled={occupe}>{occupe ? "Enregistrement..." : "Accorder l'accès"}</button>
        </div>
      </div>
    </div>
  );
}

function VueRapport({ donnees, settings, generePar, onClose }) {
  const { acces, evenements, taches_noms, modules_noms } = donnees;
  const [filtre, setFiltre] = useState("tout");
  const journal = useMemo(() => lignesJournal(evenements, taches_noms, modules_noms), [donnees]);
  const affiches = useMemo(() => (filtre === "tout" ? journal : journal.filter((l) => (filtre === "acces" ? l.categorie === "acces" || l.categorie === "action" || l.categorie === "refus" : l.categorie === filtre))), [journal, filtre]);
  const r = resume(evenements);
  const aJournal = aDesDroits(acces.droits) || r.pages > 0 || r.ecritures > 0;
  const [pdfOccupe, setPdfOccupe] = useState(false);
  const [pdfErreur, setPdfErreur] = useState("");
  const pdf = async () => {
    setPdfOccupe(true); setPdfErreur("");
    try { await telechargerRapportPdf({ acces, evenements, taches_noms, modules_noms, settings, genereePar: generePar }); }
    catch (e) { setPdfErreur("Le PDF n'a pas pu être créé : " + ((e && e.message) || "erreur")); }
    setPdfOccupe(false);
  };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card modal-large" onClick={(e) => e.stopPropagation()} style={{ width: "min(860px, 96vw)", maxHeight: "92vh", overflowY: "auto" }}>
        <div className="modal-header"><h3>Rapport {acces.numero}</h3><button className="modal-close" onClick={onClose}>x</button></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: "6px 18px", fontSize: "13px", marginBottom: "12px" }}>
          <div><span style={{ color: "var(--text-dim)" }}>Bénéficiaire : </span><strong>{acces.nom_complet || acces.username}</strong> (@{acces.username})</div>
          <div><span style={{ color: "var(--text-dim)" }}>Accordé par : </span><strong>{acces.accorde_par_nom || acces.accorde_par}</strong></div>
          <div><span style={{ color: "var(--text-dim)" }}>Début : </span>{dateHeure(acces.debut)}</div>
          <div><span style={{ color: "var(--text-dim)" }}>Durée prévue : </span>{dureeTexte(dureePrevue(acces))} (fin {dateHeure(acces.fin).slice(11, 16)})</div>
          {acces.taches.length > 0 && <div><span style={{ color: "var(--text-dim)" }}>Limite d'actions : </span>{acces.utilisations_max != null ? acces.utilisations_max : "sans limite"}</div>}
          <div><span style={{ color: "var(--text-dim)" }}>État : </span><span className={BADGE[acces.etat] || "badge"}>{etatLibelle(acces.etat)}</span></div>
          {acces.taches.length > 0 && <div style={{ gridColumn: "1 / -1" }}><span style={{ color: "var(--text-dim)" }}>Tâches : </span>{acces.taches.map((k) => (taches_noms && taches_noms[k]) || k).join(" ; ")}</div>}
          {aDesDroits(acces.droits) && <div style={{ gridColumn: "1 / -1" }}><span style={{ color: "var(--text-dim)" }}>Droits temporaires : </span>{resumeDroits(acces.droits)}</div>}
          <div style={{ gridColumn: "1 / -1" }}><span style={{ color: "var(--text-dim)" }}>Motif : </span>{acces.motif}</div>
          {acces.revoque_par && <div style={{ gridColumn: "1 / -1" }}><span style={{ color: "var(--text-dim)" }}>Révoqué par </span>{acces.revoque_par} le {dateHeure(acces.revoque_le)}</div>}
        </div>
        <div style={{ background: "#f8fafc", border: "1px solid var(--line)", borderRadius: "10px", padding: "10px 12px", fontSize: "13px", marginBottom: "12px" }}>
          {phraseResume(acces, evenements)}
        </div>
        {aJournal && (
          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", marginBottom: "10px", fontSize: "12px" }}>
            <label htmlFor="filtre-rapport" style={{ fontWeight: 700 }}>Afficher</label>
            <select id="filtre-rapport" value={filtre} onChange={(e) => setFiltre(e.target.value)} style={{ padding: "5px 8px", borderRadius: "6px", border: "1px solid var(--line)" }}>
              <option value="tout">Tout ({journal.length})</option>
              <option value="ecriture">Modifications ({r.ecritures})</option>
              <option value="page">Pages ouvertes ({r.pages})</option>
              <option value="acces">Accès, actions spéciales et refus</option>
            </select>
            <span style={{ color: "var(--text-dim)" }}>Les pages ouvertes et les modifications sont enregistrées par le site, depuis le navigateur de la personne.</span>
          </div>
        )}
        <div className="table-card" style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead><tr><th>Heure</th><th>Événement</th><th>Tâche / module</th><th>Détail</th><th>Résultat</th></tr></thead>
            <tbody>
              {affiches.length === 0 && <tr><td colSpan="5" className="table-empty">Aucun événement.</td></tr>}
              {affiches.map((l, i) => (
                <tr key={i}>
                  <td style={{ whiteSpace: "nowrap" }}>{dateHeure(l.heure).slice(11)}</td>
                  <td>{l.evenement}</td><td>{l.tache}</td><td>{l.cible}</td>
                  <td style={{ fontWeight: 700, color: COULEUR_TON[l.ton] }}>{l.resultat}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pdfErreur && <div className="login-error" style={{ marginTop: "10px" }}>{pdfErreur}</div>}
        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "14px", flexWrap: "wrap" }}>
          <button className="btn-gray-cancel btn-sm" onClick={onClose}>Fermer</button>
          <button className="btn-primary" onClick={pdf} disabled={pdfOccupe}>{pdfOccupe ? "Création..." : "Télécharger le PDF"}</button>
        </div>
      </div>
    </div>
  );
}
