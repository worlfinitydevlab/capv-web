import React, { useState, useEffect } from "react";
import { useAuth } from "../AuthContext.jsx";
import { useYear } from "../YearContext.jsx";
import { getAuthedClient } from "../supabaseClient.js";
import { trierClasses, trierSections } from "../ordreClasses.js";

// Copie de la structure (sections, classes, salles) d'une autre annee vers l'annee de travail.
// Ne copie NI les eleves, NI les assignations, NI les frais, NI les matieres, NI les notes.
// Ce qui existe deja dans l'annee de travail (meme nom, accents / majuscules / espaces ignores) n'est jamais modifie ni double.

// Nom normalise : accents, majuscules et signes ignores (meme principe que l'alerte anti-doublon)
export const norm = (s) => String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const morceaux = (liste, n) => { const r = []; for (let i = 0; i < liste.length; i += n) r.push(liste.slice(i, i + n)); return r; };
const pluriel = (n, un, plus) => n + " " + (n > 1 ? plus : un);

async function lireStructure(supabase, anneeId) {
  const rs = await supabase.from("sections").select("id, nom, description").eq("academic_year_uuid", anneeId).is("deleted_at", null);
  if (rs.error) throw rs.error;
  const sections = await trierSections(supabase, rs.data || [], { id: anneeId });
  let classes = [];
  for (const lot of morceaux(sections.map((s) => s.id), 40)) {
    const rc = await supabase.from("classes").select("id, nom, description, section_uuid").in("section_uuid", lot).is("deleted_at", null);
    if (rc.error) throw rc.error;
    classes = classes.concat(rc.data || []);
  }
  return { sections, classes: await trierClasses(supabase, classes) };
}

async function lireSalles(supabase, classeIds) {
  let salles = [];
  for (const lot of morceaux(classeIds, 40)) {
    const rr = await supabase.from("rooms").select("id, nom, description, class_uuid").in("class_uuid", lot).is("deleted_at", null);
    if (rr.error) throw rr.error;
    salles = salles.concat(rr.data || []);
  }
  return salles.sort((a, b) => String(a.nom || "").localeCompare(String(b.nom || ""), "fr", { numeric: true }));
}

// Plan de copie : une ligne par section de l'annee source, avec ses classes et leur etat.
//   etat "creer"   : la classe sera creee
//   etat "existe"  : une classe de meme nom est deja dans l'annee de travail (rien a faire)
//   etat "doublon" : meme nom qu'une classe plus haute dans l'annee source (une seule est copiee)
//   etat "vide"    : classe sans nom (ignoree)
export function construirePlan(src, tgt, sallesSrc) {
  const sectionCible = new Map();
  for (const s of tgt.sections) { const k = norm(s.nom); if (k && !sectionCible.has(k)) sectionCible.set(k, s); }
  const nomSectionCible = new Map(tgt.sections.map((s) => [s.id, s.nom]));
  const classeCible = new Map();
  for (const c of tgt.classes) { const k = norm(c.nom); if (k && !classeCible.has(k)) classeCible.set(k, c); }
  const sallesDe = new Map();
  for (const r of sallesSrc) { if (!sallesDe.has(r.class_uuid)) sallesDe.set(r.class_uuid, []); sallesDe.get(r.class_uuid).push(r); }
  const dejaPrevu = new Set();
  return src.sections.map((s) => {
    const classes = src.classes.filter((c) => c.section_uuid === s.id).map((c) => {
      const k = norm(c.nom);
      let etat = "creer", info = "";
      if (!k) { etat = "vide"; info = "sans nom"; }
      else if (classeCible.has(k)) { etat = "existe"; info = "déjà dans " + (nomSectionCible.get(classeCible.get(k).section_uuid) || "cette année"); }
      else if (dejaPrevu.has(k)) { etat = "doublon"; info = "même nom qu'une autre classe de l'année source"; }
      else dejaPrevu.add(k);
      const vues = new Set();
      const salles = (sallesDe.get(c.id) || []).filter((r) => { const q = norm(r.nom); if (!q || vues.has(q)) return false; vues.add(q); return true; });
      return { src: c, etat, info, salles };
    });
    return { src: s, existante: sectionCible.get(norm(s.nom)) || null, classes };
  });
}

// Selection de depart : tout ce qui peut etre cree
export function selectionParDefaut(plan) {
  const sel = new Set();
  for (const L of plan) {
    if (!L.existante) sel.add(L.src.id);
    for (const c of L.classes) if (c.etat === "creer") sel.add(c.src.id);
  }
  return sel;
}

// Ce qui sera vraiment cree d'apres la selection
export function aCreer(plan, sel, avecSalles) {
  const sortie = [];
  for (const L of plan) {
    const classes = L.classes.filter((c) => c.etat === "creer" && sel.has(c.src.id)).map((c) => ({ ...c, salles: avecSalles ? c.salles : [] }));
    const creerSection = !L.existante && (sel.has(L.src.id) || classes.length > 0);
    if (!creerSection && classes.length === 0) continue;
    sortie.push({ section: L.src, existante: L.existante, creerSection, classes });
  }
  return sortie;
}

export function totaux(liste) {
  let sections = 0, classes = 0, salles = 0;
  for (const g of liste) { if (g.creerSection) sections++; for (const c of g.classes) { classes++; salles += c.salles.length; } }
  return { sections, classes, salles };
}

const encart = { background: "var(--bg-soft, #f8fafc)", border: "1px solid var(--line)", borderRadius: "10px", padding: "12px 14px" };
const pastille = { fontSize: "11px", color: "var(--text-dim)", background: "#f1f5f9", borderRadius: "10px", padding: "2px 8px", marginLeft: "8px", whiteSpace: "nowrap" };
const ligneCase = { display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", padding: "4px 0" };
const caseStyle = { width: "16px", height: "16px", flex: "none", cursor: "pointer" };

export default function CopierStructure({ onClose, onFait }) {
  const { token, user } = useAuth();
  const { currentYear: annee, years } = useYear();
  const autres = (years || []).filter((y) => annee && y.id !== annee.id);
  const [sourceId, setSourceId] = useState(() => { const act = autres.find((y) => y.statut === "active"); return act ? act.id : autres[0] ? autres[0].id : ""; });
  const [plan, setPlan] = useState([]);
  const [sel, setSel] = useState(() => new Set());
  const [avecSalles, setAvecSalles] = useState(true);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");
  const [confirmer, setConfirmer] = useState(false);
  const [etape, setEtape] = useState("choix");
  const [rapport, setRapport] = useState(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!sourceId || !annee) { setChargement(false); return undefined; }
    let vivant = true;
    (async () => {
      setChargement(true); setErreur(""); setConfirmer(false);
      try {
        const supabase = getAuthedClient(token);
        const src = await lireStructure(supabase, sourceId);
        const tgt = await lireStructure(supabase, annee.id);
        const salles = await lireSalles(supabase, src.classes.map((c) => c.id));
        if (!vivant) return;
        const p = construirePlan(src, tgt, salles);
        setPlan(p); setSel(selectionParDefaut(p));
      } catch (e) {
        if (!vivant) return;
        setPlan([]); setSel(new Set()); setErreur("Chargement impossible : " + ((e && e.message) || "erreur"));
      }
      if (vivant) setChargement(false);
    })();
    return () => { vivant = false; };
  }, [token, annee && annee.id, sourceId, version]);

  useEffect(() => {
    const cle = (e) => { if (e.key === "Escape" && etape !== "copie") onClose(); };
    document.addEventListener("keydown", cle);
    return () => document.removeEventListener("keydown", cle);
  }, [etape]);

  const liste = aCreer(plan, sel, avecSalles);
  const t = totaux(liste);
  const creables = plan.reduce((n, L) => n + L.classes.filter((c) => c.etat === "creer").length + (L.existante ? 0 : 1), 0);

  const basculerSection = (L) => {
    const n = new Set(sel);
    const ids = L.classes.filter((c) => c.etat === "creer").map((c) => c.src.id);
    if (n.has(L.src.id)) { n.delete(L.src.id); ids.forEach((i) => n.delete(i)); }
    else { n.add(L.src.id); ids.forEach((i) => n.add(i)); }
    setSel(n); setConfirmer(false);
  };
  const basculerClasse = (L, c) => {
    const n = new Set(sel);
    if (n.has(c.src.id)) n.delete(c.src.id);
    else { n.add(c.src.id); if (!L.existante) n.add(L.src.id); }
    setSel(n); setConfirmer(false);
  };

  const copier = async () => {
    if (etape === "copie") return;
    setEtape("copie");
    const rap = { sections: 0, classes: 0, salles: 0, erreurs: [] };
    const par = (user && user.username) || null;
    try {
      const supabase = getAuthedClient(token);
      for (const g of liste) {
        let sectionId = g.existante ? g.existante.id : null;
        if (g.creerSection) {
          const r = await supabase.from("sections").insert({ nom: g.section.nom, description: g.section.description || null, academic_year_uuid: annee.id, modified_by: par }).select("id").single();
          if (r.error || !r.data) { rap.erreurs.push("Section " + g.section.nom + " : " + ((r.error && r.error.message) || "pas de réponse") + " (ses classes n'ont pas été copiées)"); continue; }
          sectionId = r.data.id; rap.sections++;
        }
        for (const c of g.classes) {
          const rc = await supabase.from("classes").insert({ nom: c.src.nom, description: c.src.description || null, section_uuid: sectionId, academic_year_uuid: annee.id, modified_by: par }).select("id").single();
          if (rc.error || !rc.data) { rap.erreurs.push("Classe " + c.src.nom + " : " + ((rc.error && rc.error.message) || "pas de réponse")); continue; }
          rap.classes++;
          for (const s of c.salles) {
            const rs = await supabase.from("rooms").insert({ nom: s.nom, description: s.description || null, class_uuid: rc.data.id, modified_by: par }).select("id").single();
            if (rs.error || !rs.data) rap.erreurs.push("Salle " + s.nom + " (" + c.src.nom + ") : " + ((rs.error && rs.error.message) || "pas de réponse"));
            else rap.salles++;
          }
        }
      }
    } catch (e) { rap.erreurs.push("Arrêt : " + ((e && e.message) || "erreur")); }
    setRapport(rap); setEtape("fini");
    if (onFait) onFait();
  };

  const revoir = () => { setRapport(null); setEtape("choix"); setVersion((v) => v + 1); };
  const source = autres.find((y) => y.id === sourceId);
  const copie = etape === "copie";

  return (
    <div className="modal-overlay">
      <div className="modal-card modal-large" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Copier la structure d'une autre année</h3>
          <button className="modal-close" onClick={onClose} disabled={copie}>x</button>
        </div>

        {etape === "fini" && rapport ? (
          <div>
            <div style={{ background: rapport.erreurs.length ? "#fffbeb" : "#e6f4ea", color: rapport.erreurs.length ? "#92400e" : "#1e6b34", padding: "12px 14px", borderRadius: "10px", marginBottom: "12px" }}>
              <strong>{rapport.erreurs.length ? "Copie terminée avec des problèmes" : "Copie terminée"}</strong>
              <div style={{ marginTop: "4px" }}>
                Créé dans {annee.nom} : {pluriel(rapport.sections, "section", "sections")}, {pluriel(rapport.classes, "classe", "classes")}, {pluriel(rapport.salles, "salle", "salles")}.
              </div>
            </div>
            {rapport.erreurs.length > 0 && (
              <div className="login-error" style={{ marginBottom: "12px" }}>
                {rapport.erreurs.map((m, i) => <div key={i}>{m}</div>)}
                <div style={{ marginTop: "6px" }}>Ce qui a déjà été créé reste en place. « Revoir ce qui reste » recalcule la copie sans rien doubler.</div>
              </div>
            )}
            <p style={{ fontSize: "13px", color: "var(--text-dim)", margin: "0 0 16px" }}>
              Les élèves, les frais et les matières ne sont pas copiés. Place maintenant les élèves dans ces classes avec « Années passées ».
            </p>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              {rapport.erreurs.length > 0 && <button className="btn-gray-cancel btn-sm" onClick={revoir}>Revoir ce qui reste</button>}
              <button className="btn-primary" onClick={onClose}>Fermer</button>
            </div>
          </div>
        ) : (
          <div>
            <p style={{ fontSize: "13px", color: "var(--text-dim)", margin: "0 0 14px" }}>
              Reprend les sections, les classes et leurs salles d'une autre année dans <strong>{annee ? annee.nom : ""}</strong>. Les élèves, les frais et les matières ne sont pas copiés. Ce qui existe déjà dans {annee ? annee.nom : "cette année"} n'est pas touché.
            </p>

            {autres.length === 0 ? (
              <div style={encart}>Il n'y a pas d'autre année à copier. Crée d'abord l'autre année dans « Années académiques ».</div>
            ) : (
              <div>
                <div className="form-group" style={{ marginBottom: "12px", maxWidth: "320px" }}>
                  <label>Copier depuis l'année</label>
                  <select value={sourceId} onChange={(e) => setSourceId(e.target.value)} disabled={copie}>
                    {autres.map((y) => <option key={y.id} value={y.id}>{y.nom}{y.statut === "active" ? " (active)" : ""}</option>)}
                  </select>
                </div>

                {erreur && <div className="login-error" style={{ marginBottom: "12px" }}>{erreur}</div>}
                {chargement && <p style={{ color: "var(--text-dim)" }}>Chargement...</p>}

                {!chargement && !erreur && plan.length === 0 && (
                  <div style={encart}>{source ? source.nom : "Cette année"} n'a aucune section : il n'y a rien à copier.</div>
                )}

                {!chargement && plan.length > 0 && (
                  <div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "14px", alignItems: "center", marginBottom: "8px" }}>
                      <label style={{ ...ligneCase, padding: 0 }}>
                        <input type="checkbox" style={caseStyle} checked={avecSalles} onChange={(e) => { setAvecSalles(e.target.checked); setConfirmer(false); }} disabled={copie} />
                        <span style={{ fontSize: "13px" }}>Copier aussi les salles</span>
                      </label>
                      <button className="btn-gray-cancel btn-sm" onClick={() => { setSel(selectionParDefaut(plan)); setConfirmer(false); }} disabled={copie}>Tout cocher</button>
                      <button className="btn-gray-cancel btn-sm" onClick={() => { setSel(new Set()); setConfirmer(false); }} disabled={copie}>Tout décocher</button>
                    </div>

                    <div style={{ border: "1px solid var(--line)", borderRadius: "10px", padding: "8px 14px", maxHeight: "40vh", overflowY: "auto", marginBottom: "12px" }}>
                      {plan.map((L) => (
                        <div key={L.src.id} style={{ padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
                          {L.existante ? (
                            <div style={{ display: "flex", alignItems: "center", padding: "4px 0" }}>
                              <strong>{L.src.nom}</strong>
                              <span style={pastille}>section déjà dans {annee.nom}</span>
                            </div>
                          ) : (
                            <label style={ligneCase}>
                              <input type="checkbox" style={caseStyle} aria-label={"Section " + L.src.nom} checked={sel.has(L.src.id)} onChange={() => basculerSection(L)} disabled={copie} />
                              <strong>{L.src.nom}</strong>
                              <span style={pastille}>nouvelle section</span>
                            </label>
                          )}
                          <div style={{ marginLeft: "24px" }}>
                            {L.classes.length === 0 && <div style={{ fontSize: "12px", color: "var(--text-dim)", padding: "3px 0" }}>Aucune classe dans cette section.</div>}
                            {L.classes.map((c) => (
                              c.etat === "creer" ? (
                                <label key={c.src.id} style={ligneCase}>
                                  <input type="checkbox" style={caseStyle} aria-label={"Classe " + c.src.nom} checked={sel.has(c.src.id)} onChange={() => basculerClasse(L, c)} disabled={copie} />
                                  <span>{c.src.nom}</span>
                                  {avecSalles && c.salles.length > 0 && <span style={pastille}>{pluriel(c.salles.length, "salle", "salles")}</span>}
                                </label>
                              ) : (
                                <div key={c.src.id} style={{ display: "flex", alignItems: "center", padding: "4px 0", color: "var(--text-dim)" }}>
                                  <span style={{ width: "24px", flex: "none" }}></span>
                                  <span>{c.src.nom || "(sans nom)"}</span>
                                  <span style={pastille}>{c.info}</span>
                                </div>
                              )
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    {creables === 0 ? (
                      <div style={encart}>Rien à copier : tout ce que contient {source ? source.nom : "l'autre année"} est déjà dans {annee.nom}.</div>
                    ) : confirmer ? (
                      <div style={{ background: "#fffbeb", border: "1px solid #fde68a", color: "#92400e", borderRadius: "10px", padding: "12px 14px" }}>
                        <strong>Confirmer la copie ?</strong> Cela crée dans {annee.nom} : {pluriel(t.sections, "section", "sections")}, {pluriel(t.classes, "classe", "classes")}, {pluriel(t.salles, "salle", "salles")}. Pour supprimer une section ou une classe ensuite, il faut l'autorisation d'un administrateur.
                      </div>
                    ) : (
                      <div style={encart}>
                        {t.sections + t.classes === 0
                          ? "Coche au moins une section ou une classe à copier."
                          : "Sera créé dans " + annee.nom + " : " + pluriel(t.sections, "section", "sections") + ", " + pluriel(t.classes, "classe", "classes") + ", " + pluriel(t.salles, "salle", "salles") + "."}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "16px" }}>
              <button className="btn-gray-cancel btn-sm" onClick={confirmer ? () => setConfirmer(false) : onClose} disabled={copie}>{confirmer ? "Retour" : "Annuler"}</button>
              {autres.length > 0 && !chargement && plan.length > 0 && creables > 0 && (
                confirmer
                  ? <button className="btn-primary" onClick={copier} disabled={copie || t.sections + t.classes === 0}>{copie ? "Copie en cours..." : "Oui, copier dans " + annee.nom}</button>
                  : <button className="btn-primary" onClick={() => setConfirmer(true)} disabled={copie || t.sections + t.classes === 0}>{"Copier dans " + annee.nom}</button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
