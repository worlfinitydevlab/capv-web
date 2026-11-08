import React, { useState, useEffect, useMemo, useRef } from "react";
import { sansAccent, useEnvoi, MessageEnvoi } from "../pedagogie/Fenetre.jsx";
import { calculerExamen, erreurNote, lireNombre, formatNombre, formatNote, messageErreur } from "../examenAdmission.js";

const TAILLE_LOT = 100;
// Champ de saisie dans un tableau (meme aspect que les champs des formulaires)
const CHAMP_TABLEAU = { padding: "8px 10px", borderRadius: "8px", border: "1.5px solid var(--line)", background: "var(--bg-soft)", color: "var(--text)", fontSize: "14px", fontFamily: "inherit" };
const cle = (insc, mat) => insc + "|" + mat;

// Onglet « Resultats » (le responsable) : une grille candidats x matieres. Entree passe a la cellule du dessous ; la decision se calcule en direct.
export default function ExamensResultats({ supabase, donnees, droit, recharger, par, notifier, signaler, marquerSale }) {
  const classesExamen = useMemo(() => donnees.classes.filter((c) => {
    const cfg = donnees.configParClasse[c.id];
    return cfg && (donnees.matieresParConfig[cfg.id] || []).length > 0;
  }), [donnees]);
  const [choix, setClasseId] = useState("");
  const [recherche, setRecherche] = useState("");
  const [brouillon, setBrouillon] = useState({});
  const envoi = useEnvoi();
  const grille = useRef(null);

  // la classe choisie, ou la premiere classe qui a un examen (jamais une classe sans examen)
  const classeId = classesExamen.some((c) => c.id === choix) ? choix : (classesExamen.length ? classesExamen[0].id : "");

  const cfg = classeId ? donnees.configParClasse[classeId] : null;
  const ms = cfg ? donnees.matieresParConfig[cfg.id] || [] : [];
  const tous = useMemo(() => donnees.enAttente.filter((i) => i.classe_souhaitee_uuid === classeId)
    .sort((a, b) => String(a.nom).localeCompare(String(b.nom), "fr") || String(a.prenom).localeCompare(String(b.prenom), "fr")), [donnees, classeId]);
  const lignes = useMemo(() => {
    const q = sansAccent(recherche).trim();
    return q ? tous.filter((i) => sansAccent(i.prenom + " " + i.nom + " " + i.nom + " " + i.prenom).includes(q)) : tous;
  }, [tous, recherche]);

  const enregistre = (insc, mat) => {
    const v = (donnees.notesParCandidat[insc] || {})[mat];
    return v === undefined ? "" : formatNote(v);
  };
  const valeur = (insc, mat) => (Object.prototype.hasOwnProperty.call(brouillon, cle(insc, mat)) ? brouillon[cle(insc, mat)] : enregistre(insc, mat));

  // changements reels (par rapport a ce qui est deja enregistre) et cellules en erreur
  const { aEnregistrer, aEffacer, invalides } = useMemo(() => {
    const aEnregistrer = [], aEffacer = []; let invalides = 0;
    Object.keys(brouillon).forEach((k) => {
      const [insc, mat] = k.split("|");
      const m = ms.find((x) => x.id === mat);
      if (!m) return;
      const saisie = brouillon[k];
      const sauve = (donnees.notesParCandidat[insc] || {})[mat];
      const n = lireNombre(saisie);
      if (n.vide) { if (sauve !== undefined) aEffacer.push({ insc, mat }); return; }
      if (!n.ok || erreurNote(saisie, m.note_max)) { invalides++; return; }
      if (sauve === undefined || Number(sauve) !== n.valeur) aEnregistrer.push({ insc, mat, note: n.valeur });
    });
    return { aEnregistrer, aEffacer, invalides };
  }, [brouillon, ms, donnees]);
  const nbChangements = aEnregistrer.length + aEffacer.length;
  const sale = nbChangements > 0 || invalides > 0;
  useEffect(() => { if (marquerSale) marquerSale(sale); return () => { if (marquerSale) marquerSale(false); }; }, [sale]);

  const saisir = (insc, mat, v) => setBrouillon((b) => ({ ...b, [cle(insc, mat)]: v }));
  const annuler = () => { setBrouillon({}); envoi.setErr(""); };

  const suivante = (e, r, c) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const cherche = (rr, cc) => grille.current && grille.current.querySelector('[data-cell="' + rr + "-" + cc + '"]');
    const cible = cherche(r + 1, c) || cherche(0, c + 1);
    if (cible) { cible.focus(); if (cible.select) cible.select(); }
  };

  const enregistrer = () => envoi.envoyer(async () => {
    if (invalides) throw new Error(invalides + " note(s) sont invalides (en rouge). Corrige-les avant d'enregistrer.");
    if (!nbChangements) throw new Error("Rien à enregistrer.");
    try {
      const maintenant = new Date().toISOString();
      for (let i = 0; i < aEnregistrer.length; i += TAILLE_LOT) {
        const lot = aEnregistrer.slice(i, i + TAILLE_LOT).map((x) => ({ inscription_uuid: x.insc, matiere_uuid: x.mat, note: x.note, saisi_par: par, updated_at: maintenant }));
        const { error } = await supabase.from("examens_admission_notes").upsert(lot, { onConflict: "inscription_uuid,matiere_uuid" });
        if (error) throw error;
      }
      const parMatiere = {};
      aEffacer.forEach((x) => { (parMatiere[x.mat] = parMatiere[x.mat] || []).push(x.insc); });
      for (const mat of Object.keys(parMatiere)) {
        // par groupes : une adresse trop longue serait refusee si une classe a beaucoup de candidats
        for (let i = 0; i < parMatiere[mat].length; i += 50) {
          const { error } = await supabase.from("examens_admission_notes").delete().eq("matiere_uuid", mat).in("inscription_uuid", parMatiere[mat].slice(i, i + 50));
          if (error) throw error;
        }
      }
    } catch (e) {
      await recharger();
      throw new Error(messageErreur(e) + " Les notes ont été rechargées : vérifie ce qui est enregistré.");
    }
    const n = nbChangements;
    setBrouillon({});
    await recharger();
    notifier(n + " modification(s) de notes enregistrée(s).");
  });

  if (classesExamen.length === 0) {
    return (
      <div className="wf-vide">
        <h3>{"Aucun examen configuré"}</h3>
        <p>{"La pédagogie doit d'abord choisir les matières de l'examen d'au moins une classe (onglet Configuration)."}</p>
      </div>
    );
  }

  const lecture = !droit.modifier;
  const cellule = (i, mat, r, c) => {
    const v = valeur(i.id, mat.id);
    if (lecture) return <span>{v === "" ? "-" : v}</span>;
    const err = erreurNote(v, mat.note_max);
    return (
      <input data-cell={r + "-" + c} data-candidat={i.prenom + " " + i.nom} data-matiere={mat.nom} value={v} inputMode="decimal" autoComplete="off"
        aria-label={i.prenom + " " + i.nom + " : " + mat.nom} title={err || ""} disabled={envoi.occupe}
        style={{ ...CHAMP_TABLEAU, width: "84px", textAlign: "right", borderColor: err ? "#dc2626" : undefined, background: err ? "#fef2f2" : undefined }}
        onChange={(e) => saisir(i.id, mat.id, e.target.value)} onKeyDown={(e) => suivante(e, r, c)} onFocus={(e) => e.target.select()} />
    );
  };

  return (
    <div>
      <div className="wf-filtres">
        <div className="form-group">
          <label>{"Classe souhaitée"}</label>
          <select data-champ="classe-resultats" value={classeId} disabled={sale || envoi.occupe} onChange={(e) => { setClasseId(e.target.value); setRecherche(""); }}>
            {classesExamen.map((c) => <option key={c.id} value={c.id}>{c.nom + (c.section_nom ? " (" + c.section_nom + ")" : "")}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Candidat</label>
          <input className="wf-recherche" type="search" value={recherche} placeholder="Chercher un candidat…" onChange={(e) => setRecherche(e.target.value)} />
        </div>
        <span className="wf-compte" data-compte>{tous.length + " candidat(s) en attente · réussite à partir de " + formatNombre(cfg.moyenne_reussite) + " / 10"}</span>
      </div>
      {sale && !lecture && <p className="wf-petit" data-sale style={{ margin: "0 0 10px" }}>{"Des notes ne sont pas encore enregistrées : enregistre-les ou annule pour changer de classe."}</p>}
      {lecture && <p className="wf-petit" style={{ margin: "0 0 10px" }}>{"Lecture seule : tu n'as pas le droit de saisir les résultats."}</p>}

      <div className="table-card" style={{ overflowX: "auto" }} ref={grille}>
        <table className="data-table" data-grille>
          <thead>
            <tr>
              <th>Candidat</th>
              {ms.map((m) => <th key={m.id} style={{ textAlign: "right" }}>{m.nom}<div className="wf-petit">{"/ " + formatNote(m.note_max)}</div></th>)}
              <th style={{ textAlign: "right" }}>Total</th>
              <th style={{ textAlign: "right" }}>{"Moyenne / 10"}</th>
              <th>Décision</th>
            </tr>
          </thead>
          <tbody>
            {lignes.length === 0 && <tr><td colSpan={ms.length + 4} className="table-empty">{tous.length ? "Aucun candidat ne correspond à la recherche." : "Aucun candidat en attente pour cette classe."}</td></tr>}
            {lignes.map((i, r) => {
              const notes = {};
              ms.forEach((m) => { notes[m.id] = valeur(i.id, m.id); });
              const calc = calculerExamen(cfg, ms, notes);
              return (
                <tr key={i.id} data-candidat-ligne={i.prenom + " " + i.nom}>
                  <td style={{ whiteSpace: "nowrap" }}><strong>{i.prenom} {i.nom}</strong></td>
                  {ms.map((m, c) => <td key={m.id} style={{ textAlign: "right" }}>{cellule(i, m, r, c)}</td>)}
                  <td style={{ textAlign: "right" }} data-total>{calc.saisies ? formatNote(calc.total) + " / " + formatNote(calc.totalMax) : "-"}</td>
                  <td style={{ textAlign: "right" }} data-moyenne>{calc.moyenne === null ? "-" : formatNombre(calc.moyenne)}</td>
                  <td data-decision style={{ whiteSpace: "nowrap" }}>
                    {calc.etat === "reussi" && <span className="badge badge-ok">Réussi</span>}
                    {calc.etat === "echoue" && <span className="badge badge-err">Échoué</span>}
                    {calc.etat === "en_attente" && <span className="badge badge-gray">{calc.saisies + " / " + calc.attendues + " notes"}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <MessageEnvoi envoi={envoi} />
      {!lecture && (
        <div style={{ display: "flex", gap: "10px", marginTop: "14px", justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button type="button" className="btn-gray-cancel" data-action="annuler-notes" disabled={!sale || envoi.occupe} onClick={annuler}>Annuler les changements</button>
          <button type="button" className="btn-primary" data-action="enregistrer-notes" disabled={!sale || envoi.occupe} onClick={enregistrer}>{envoi.occupe ? "En cours..." : "Enregistrer les notes" + (nbChangements ? " (" + nbChangements + ")" : "")}</button>
        </div>
      )}
      <p className="wf-petit" style={{ marginTop: "10px" }}>{"Laisse une case vide tant que la note n'est pas connue : le candidat reste « en attente ». Entrée passe au candidat suivant. Les décisions se prennent dans l'onglet Décisions."}</p>
    </div>
  );
}
