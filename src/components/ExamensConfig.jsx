import React, { useState } from "react";
import { Fenetre, PiedStandard, MessageEnvoi, useEnvoi, Confirmation } from "../pedagogie/Fenetre.jsx";
import { erreursConfiguration, lireNombre, formatNombre, formatNote, messageErreur } from "../examenAdmission.js";

// Champ de saisie dans un tableau (meme aspect que les champs des formulaires)
const CHAMP_TABLEAU = { padding: "8px 10px", borderRadius: "8px", border: "1.5px solid var(--line)", background: "var(--bg-soft)", color: "var(--text)", fontSize: "14px", fontFamily: "inherit" };

// Onglet « Configuration » (pedagogie) : une ligne par classe ; l'examen d'une classe = ses matieres (note maximale chacune) + la moyenne de reussite sur 10.
export default function ExamensConfig({ supabase, donnees, droit, recharger, par, notifier, signaler }) {
  const [edition, setEdition] = useState(null);     // classe en cours de configuration
  const [copie, setCopie] = useState(null);         // classe dont on copie l'examen
  const [suppression, setSuppression] = useState(null);

  const lignes = donnees.classes.map((c) => {
    const cfg = donnees.configParClasse[c.id] || null;
    const ms = cfg ? donnees.matieresParConfig[cfg.id] || [] : [];
    const idsMat = new Set(ms.map((m) => m.id));
    return {
      classe: c, cfg, ms,
      totalMax: ms.reduce((s, m) => s + Number(m.note_max), 0),
      enAttente: donnees.enAttente.filter((i) => i.classe_souhaitee_uuid === c.id).length,
      nbNotes: donnees.notes.filter((n) => idsMat.has(n.matiere_uuid)).length
    };
  });

  const apres = async (message) => { await recharger(); if (message) notifier(message); };
  const apresErreur = async (message) => { await recharger(); signaler(message); };

  return (
    <div>
      <div className="table-card">
        <table className="data-table">
          <thead>
            <tr><th>Classe souhaitée</th><th>Examen</th><th>Moyenne de réussite</th><th>Candidats en attente</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {lignes.length === 0 && <tr><td colSpan="5" className="table-empty">{"Aucune classe pour cette année. Créez d'abord les classes (Classes & Sections)."}</td></tr>}
            {lignes.map(({ classe, cfg, ms, totalMax, enAttente }) => (
              <tr key={classe.id} data-classe={classe.nom}>
                <td><strong>{classe.nom}</strong>{classe.section_nom ? <div className="wf-petit">{classe.section_nom}</div> : null}</td>
                <td>
                  {!cfg && <span style={{ color: "#6b7280" }}>{"Pas d'examen"}</span>}
                  {cfg && ms.length === 0 && <span style={{ color: "#92400e" }}>{"Aucune matière : à configurer"}</span>}
                  {cfg && ms.length > 0 && (
                    <div>
                      <div>{ms.map((m) => m.nom + " /" + formatNote(m.note_max)).join(" · ")}</div>
                      <div className="wf-petit">{"Total : " + formatNote(totalMax) + " points"}</div>
                    </div>
                  )}
                </td>
                <td>{cfg ? formatNombre(cfg.moyenne_reussite) + " / 10" : "-"}</td>
                <td>{enAttente}</td>
                <td>
                  <div className="table-actions">
                    {!cfg && droit.creer && <button type="button" className="btn-sm btn-primary" data-action="creer" onClick={() => setEdition(classe)}>{"Créer l'examen"}</button>}
                    {cfg && droit.modifier && <button type="button" className="btn-sm btn-gray-cancel" data-action="modifier" onClick={() => setEdition(classe)}>Modifier</button>}
                    {cfg && ms.length > 0 && droit.creer && <button type="button" className="btn-sm btn-gray-cancel" data-action="copier" onClick={() => setCopie(classe)}>{"Copier vers…"}</button>}
                    {cfg && droit.annuler && <button type="button" className="btn-sm btn-red" data-action="supprimer" onClick={() => setSuppression(classe)}>Supprimer</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="wf-petit" style={{ marginTop: "10px" }}>{"Une classe sans examen n'a pas de décision automatique : ses candidats se traitent un par un dans la page Inscription."}</p>

      {edition && <FenetreExamen classe={edition} cfg={donnees.configParClasse[edition.id] || null} ms={(donnees.configParClasse[edition.id] && donnees.matieresParConfig[donnees.configParClasse[edition.id].id]) || []}
        donnees={donnees} supabase={supabase} par={par} fermer={() => setEdition(null)} apres={apres} apresErreur={apresErreur} />}
      {copie && <FenetreCopie classe={copie} cfg={donnees.configParClasse[copie.id]} ms={donnees.matieresParConfig[donnees.configParClasse[copie.id].id] || []}
        donnees={donnees} supabase={supabase} par={par} fermer={() => setCopie(null)} apres={apres} apresErreur={apresErreur} />}
      {suppression && (() => {
        const l = lignes.find((x) => x.classe.id === suppression.id);
        return (
          <Confirmation titre={"Supprimer l'examen de " + suppression.nom} danger libelle="Supprimer l'examen" fermer={() => setSuppression(null)}
            texte={"L'examen de « " + suppression.nom + " » (matières et moyenne de réussite) sera supprimé." + (l.nbNotes ? " Les " + l.nbNotes + " note(s) déjà saisie(s) seront supprimées aussi." : "") + " Les candidats de cette classe ne seront plus jugés automatiquement."}
            action={async () => {
              try {
                const ids = l.ms.map((m) => m.id);
                if (ids.length) { const r = await supabase.from("examens_admission_notes").delete().in("matiere_uuid", ids); if (r.error) throw r.error; }
                let r = await supabase.from("examens_admission_matieres").delete().eq("config_uuid", l.cfg.id); if (r.error) throw r.error;
                r = await supabase.from("examens_admission_config").delete().eq("id", l.cfg.id); if (r.error) throw r.error;
              } catch (e) { throw new Error(messageErreur(e)); }
              setSuppression(null);
              await apres("Examen de « " + suppression.nom + " » supprimé.");
            }} />
        );
      })()}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
function FenetreExamen({ classe, cfg, ms, donnees, supabase, par, fermer, apres, apresErreur }) {
  const envoi = useEnvoi();
  const [moyenne, setMoyenne] = useState(cfg ? formatNote(cfg.moyenne_reussite) : "5");
  const [lignes, setLignes] = useState(() => ms.map((m) => ({ cle: m.id, id: m.id, subject_uuid: m.subject_uuid, nom: m.nom, note_max: formatNote(m.note_max) })));
  const [choix, setChoix] = useState("");
  const [maxNouveau, setMaxNouveau] = useState(lignes.length ? lignes[lignes.length - 1].note_max : "20");
  const utilises = new Set(lignes.map((l) => l.subject_uuid));
  const disponibles = donnees.matieres.filter((s) => !utilises.has(s.id) && (s.statut || "active") !== "inactive");
  const total = lignes.reduce((s, l) => { const n = lireNombre(l.note_max); return s + (n.ok ? n.valeur : 0); }, 0);

  const ajouter = () => {
    if (!choix) { envoi.setErr("Choisis la matière à ajouter."); return; }
    const n = lireNombre(maxNouveau);
    if (!n.ok || n.valeur <= 0) { envoi.setErr("Note maximale invalide : un nombre supérieur à 0 (exemple : 20)."); return; }
    const s = donnees.matieres.find((x) => x.id === choix);
    setLignes((l) => [...l, { cle: "n-" + choix, id: null, subject_uuid: choix, nom: s ? s.nom : "?", note_max: maxNouveau }]);
    setChoix(""); envoi.setErr("");
  };
  const retirer = (cle) => setLignes((l) => l.filter((x) => x.cle !== cle));
  const changerMax = (cle, v) => setLignes((l) => l.map((x) => (x.cle === cle ? { ...x, note_max: v } : x)));

  const enregistrer = () => envoi.envoyer(async (confirmer) => {
    const erreurs = erreursConfiguration(moyenne, lignes);
    if (erreurs.length) throw new Error(erreurs.join(" "));
    const seuil = lireNombre(moyenne).valeur;
    const notesDe = (id) => donnees.notes.filter((n) => n.matiere_uuid === id);
    for (const l of lignes) {
      if (!l.id) continue;
      const max = lireNombre(l.note_max).valeur;
      const trop = notesDe(l.id).filter((n) => Number(n.note) > max).length;
      if (trop) throw new Error(l.nom + " : " + trop + " note(s) déjà saisie(s) dépassent " + formatNote(max) + ". Corrige d'abord ces notes (onglet Résultats) ou garde une note maximale plus grande.");
    }
    const gardes = new Set(lignes.filter((l) => l.id).map((l) => l.id));
    const retirees = ms.filter((m) => !gardes.has(m.id));
    const nbNotes = retirees.reduce((s, m) => s + notesDe(m.id).length, 0);
    if (nbNotes && !confirmer) { const e = new Error(nbNotes + " note(s) déjà saisie(s) pour une matière retirée seront supprimées."); e.confirmation = true; throw e; }
    try {
      let configId = cfg && cfg.id;
      if (!configId) {
        const { data, error } = await supabase.from("examens_admission_config").insert({ class_uuid: classe.id, moyenne_reussite: seuil, modified_by: par }).select("id").single();
        if (error) throw error;
        configId = data.id;
      } else {
        const { error } = await supabase.from("examens_admission_config").update({ moyenne_reussite: seuil, modified_by: par, updated_at: new Date().toISOString() }).eq("id", configId);
        if (error) throw error;
      }
      for (const m of retirees) {
        let r = await supabase.from("examens_admission_notes").delete().eq("matiere_uuid", m.id); if (r.error) throw r.error;
        r = await supabase.from("examens_admission_matieres").delete().eq("id", m.id); if (r.error) throw r.error;
      }
      for (let i = 0; i < lignes.length; i++) {
        const l = lignes[i];
        const max = lireNombre(l.note_max).valeur;
        if (l.id) {
          const avant = ms.find((m) => m.id === l.id);
          if (Number(avant.note_max) !== max || Number(avant.ordre) !== i) {
            const { error } = await supabase.from("examens_admission_matieres").update({ note_max: max, ordre: i, modified_by: par }).eq("id", l.id);
            if (error) throw error;
          }
        } else {
          const { error } = await supabase.from("examens_admission_matieres").insert({ config_uuid: configId, subject_uuid: l.subject_uuid, note_max: max, ordre: i, modified_by: par });
          if (error) throw error;
        }
      }
    } catch (e) {
      fermer();
      await apresErreur("L'enregistrement de l'examen de « " + classe.nom + " » s'est arrêté : " + messageErreur(e) + " Rouvre l'examen pour vérifier ce qui a été enregistré.");
      return;
    }
    fermer();
    await apres("Examen de « " + classe.nom + " » enregistré.");
  });

  return (
    <Fenetre titre={"Examen d'admission : " + classe.nom} sousTitre="Les matières viennent du catalogue de la pédagogie. La note maximale de chaque matière donne son poids dans la moyenne."
      largeur="700px" fermer={fermer} occupe={envoi.occupe} protege onSubmit={enregistrer}
      pied={<PiedStandard fermer={fermer} occupe={envoi.occupe} libelle="Enregistrer" envoi={envoi} />}>
      <div className="form-group">
        <label>{"Moyenne de réussite (sur 10) *"}</label>
        <input data-champ="moyenne_reussite" value={moyenne} inputMode="decimal" style={{ width: "120px" }} onChange={(e) => setMoyenne(e.target.value)} />
        <div className="wf-petit">{"Un candidat réussit si sa moyenne générale sur 10 est supérieure ou égale à ce nombre (exemple : 5 ou 6,5)."}</div>
      </div>
      <table className="data-table" style={{ marginTop: "8px" }}>
        <thead><tr><th>Matière de l'examen</th><th style={{ width: "150px" }}>Note maximale</th><th style={{ width: "90px" }} /></tr></thead>
        <tbody>
          {lignes.length === 0 && <tr><td colSpan="3" className="table-empty">{"Aucune matière. Ajoute-en au moins une ci-dessous."}</td></tr>}
          {lignes.map((l) => (
            <tr key={l.cle} data-matiere={l.nom}>
              <td>{l.nom}</td>
              <td><input data-champ={"max-" + l.nom} value={l.note_max} inputMode="decimal" style={{ ...CHAMP_TABLEAU, width: "100px" }} onChange={(e) => changerMax(l.cle, e.target.value)} /></td>
              <td><button type="button" className="btn-sm btn-red" data-action="retirer" onClick={() => retirer(l.cle)}>Retirer</button></td>
            </tr>
          ))}
          <tr>
            <td>
              <select data-champ="nouvelle-matiere" value={choix} onChange={(e) => setChoix(e.target.value)} style={{ ...CHAMP_TABLEAU, width: "100%" }}>
                <option value="">{disponibles.length ? "Ajouter une matière…" : "Toutes les matières du catalogue sont ajoutées"}</option>
                {disponibles.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
              </select>
            </td>
            <td><input data-champ="nouveau-max" value={maxNouveau} inputMode="decimal" style={{ ...CHAMP_TABLEAU, width: "100px" }} onChange={(e) => setMaxNouveau(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); ajouter(); } }} /></td>
            <td><button type="button" className="btn-sm btn-primary" data-action="ajouter-matiere" onClick={ajouter}>Ajouter</button></td>
          </tr>
        </tbody>
      </table>
      {donnees.matieres.length === 0 && <p className="wf-petit">{"Le catalogue des matières est vide : ajoutez d'abord des matières dans Pédagogie > Matières."}</p>}
      <p className="wf-petit" data-total>{"Total de l'examen : " + formatNote(total) + " points. Moyenne sur 10 = total des notes ÷ " + formatNote(total) + " × 10."}</p>
      <MessageEnvoi envoi={envoi} />
    </Fenetre>
  );
}

// ---------------------------------------------------------------------------------------------
function FenetreCopie({ classe, cfg, ms, donnees, supabase, par, fermer, apres, apresErreur }) {
  const envoi = useEnvoi();
  const [choisies, setChoisies] = useState([]);
  const autres = donnees.classes.filter((c) => c.id !== classe.id).map((c) => {
    const cf = donnees.configParClasse[c.id] || null;
    const mats = cf ? donnees.matieresParConfig[cf.id] || [] : [];
    const ids = new Set(mats.map((m) => m.id));
    return { c, cf, aNotes: donnees.notes.some((n) => ids.has(n.matiere_uuid)) };
  });
  const bascule = (id) => setChoisies((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));

  const copier = () => envoi.envoyer(async (confirmer) => {
    if (!choisies.length) throw new Error("Choisis au moins une classe.");
    const remplacees = autres.filter((a) => choisies.includes(a.c.id) && a.cf && (donnees.matieresParConfig[a.cf.id] || []).length).length;
    if (remplacees && !confirmer) { const e = new Error(remplacees + " classe(s) ont déjà un examen : ses matières et sa moyenne de réussite seront remplacées."); e.confirmation = true; throw e; }
    try {
      for (const id of choisies) {
        let cf = donnees.configParClasse[id];
        if (!cf) {
          const { data, error } = await supabase.from("examens_admission_config").insert({ class_uuid: id, moyenne_reussite: cfg.moyenne_reussite, modified_by: par }).select("id").single();
          if (error) throw error;
          cf = data;
        } else {
          const r1 = await supabase.from("examens_admission_config").update({ moyenne_reussite: cfg.moyenne_reussite, modified_by: par, updated_at: new Date().toISOString() }).eq("id", cf.id);
          if (r1.error) throw r1.error;
          const r2 = await supabase.from("examens_admission_matieres").delete().eq("config_uuid", cf.id);
          if (r2.error) throw r2.error;
        }
        const { error } = await supabase.from("examens_admission_matieres").insert(ms.map((m, i) => ({ config_uuid: cf.id, subject_uuid: m.subject_uuid, note_max: m.note_max, ordre: i, modified_by: par })));
        if (error) throw error;
      }
    } catch (e) {
      fermer();
      await apresErreur("La copie de l'examen de « " + classe.nom + " » s'est arrêtée : " + messageErreur(e) + " Vérifie les classes concernées.");
      return;
    }
    fermer();
    await apres("Examen de « " + classe.nom + " » copié vers " + choisies.length + " classe(s).");
  });

  return (
    <Fenetre titre={"Copier l'examen de " + classe.nom} sousTitre={ms.length + " matière(s), moyenne de réussite " + formatNombre(cfg.moyenne_reussite) + " / 10"} largeur="520px" fermer={fermer} occupe={envoi.occupe} onSubmit={copier}
      pied={<PiedStandard fermer={fermer} occupe={envoi.occupe} libelle="Copier" envoi={envoi} />}>
      <p className="wf-texte">{"Choisis les classes qui auront le même examen (mêmes matières, mêmes notes maximales, même moyenne de réussite)."}</p>
      {autres.length === 0 && <p className="wf-petit">{"Il n'y a pas d'autre classe cette année."}</p>}
      {autres.map(({ c, cf, aNotes }) => (
        <label key={c.id} style={{ display: "flex", gap: "8px", alignItems: "center", padding: "4px 0", opacity: aNotes ? 0.55 : 1 }}>
          <input type="checkbox" data-classe-cible={c.nom} checked={choisies.includes(c.id)} disabled={aNotes} onChange={() => bascule(c.id)} />
          <span>{c.nom}</span>
          {aNotes && <span className="wf-petit">{"(des notes sont déjà saisies : impossible de remplacer)"}</span>}
          {!aNotes && cf && <span className="wf-petit">{"(a déjà un examen : sera remplacé)"}</span>}
        </label>
      ))}
      <MessageEnvoi envoi={envoi} />
    </Fenetre>
  );
}
