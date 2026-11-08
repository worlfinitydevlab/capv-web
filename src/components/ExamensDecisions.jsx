import React, { useState, useMemo, useRef } from "react";
import { Fenetre, sansAccent } from "../pedagogie/Fenetre.jsx";
import { debutIdentifiant } from "../identifiantEleve.js";
import { admettreInscription, refuserInscription } from "../admissionInscription.js";
import { ETATS, compter, formatNombre, formatNote, manqueSql, messageErreur } from "../examenAdmission.js";

const parNom = (a, b) => String(a.candidat.nom).localeCompare(String(b.candidat.nom), "fr") || String(a.candidat.prenom).localeCompare(String(b.candidat.prenom), "fr");
const nomDe = (d) => d.candidat.prenom + " " + d.candidat.nom;

// Onglet « Decisions » : le resultat de chaque candidat (calcule automatiquement) et, en un clic, l'admission des reussis / le refus des echoues.
export default function ExamensDecisions({ supabase, donnees, droit, recharger, par, notifier, signaler }) {
  const [classeId, setClasseId] = useState("");
  const [etat, setEtat] = useState("");
  const [recherche, setRecherche] = useState("");
  const [lot, setLot] = useState(null); // "admettre" | "refuser"

  const nomClasse = (id) => (donnees.classes.find((c) => c.id === id) || {}).nom || "";
  const dansLaClasse = useMemo(() => donnees.decisions.filter((d) => !classeId || d.candidat.classe_souhaitee_uuid === classeId).sort(parNom), [donnees, classeId]);
  const nombres = useMemo(() => compter(dansLaClasse), [dansLaClasse]);
  const lignes = useMemo(() => {
    const q = sansAccent(recherche).trim();
    return dansLaClasse.filter((d) => (!etat || d.etat === etat) && (!q || sansAccent(nomDe(d) + " " + d.candidat.nom + " " + d.candidat.prenom).includes(q)));
  }, [dansLaClasse, etat, recherche]);
  const reussis = dansLaClasse.filter((d) => d.etat === "reussi");
  const echoues = dansLaClasse.filter((d) => d.etat === "echoue");

  const ficheDe = (d) => debutIdentifiant(d.candidat);
  const detailNotes = (d) => {
    if (!d.config) return "-";
    const ms = donnees.matieresParConfig[d.config.id] || [];
    const notes = donnees.notesParCandidat[d.candidat.id] || {};
    return ms.map((m) => m.nom + " " + (notes[m.id] === undefined ? "-" : formatNote(notes[m.id])) + "/" + formatNote(m.note_max)).join(" · ");
  };

  return (
    <div>
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "12px" }} data-compteurs>
        <span className="badge badge-ok" data-n="reussi">{"Réussis : " + nombres.reussi}</span>
        <span className="badge badge-err" data-n="echoue">{"Échoués : " + nombres.echoue}</span>
        <span className="badge badge-gold" data-n="en_attente">{"Résultats en attente : " + nombres.en_attente}</span>
        <span className="badge badge-gray" data-n="sans_examen">{"Sans examen : " + (nombres.sans_examen + nombres.non_configure)}</span>
      </div>

      <div className="wf-filtres">
        <div className="form-group">
          <label>{"Classe souhaitée"}</label>
          <select data-champ="filtre-classe" value={classeId} onChange={(e) => setClasseId(e.target.value)}>
            <option value="">Toutes les classes</option>
            {donnees.classes.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>{"Décision"}</label>
          <select data-champ="filtre-etat" value={etat} onChange={(e) => setEtat(e.target.value)}>
            <option value="">Toutes les décisions</option>
            {["reussi", "echoue", "en_attente", "sans_examen", "non_configure"].map((k) => <option key={k} value={k}>{ETATS[k]}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Candidat</label>
          <input className="wf-recherche" type="search" value={recherche} placeholder="Chercher un candidat…" onChange={(e) => setRecherche(e.target.value)} />
        </div>
        <div className="wf-filtres-fin">
          {droit.modifier && <button type="button" className="btn-primary" data-action="admettre-lot" disabled={!reussis.length} onClick={() => setLot("admettre")}>{"Admettre les réussis (" + reussis.length + ")"}</button>}
          {droit.modifier && <button type="button" className="btn-sm btn-red" style={{ padding: "11px 20px", fontSize: "14px", borderRadius: "11px", fontWeight: 700 }} data-action="refuser-lot" disabled={!echoues.length} onClick={() => setLot("refuser")}>{"Refuser les échoués (" + echoues.length + ")"}</button>}
        </div>
      </div>

      <div className="table-card" style={{ overflowX: "auto" }}>
        <table className="data-table" data-decisions>
          <thead>
            <tr><th>Candidat</th><th>Classe souhaitée</th><th>Notes</th><th style={{ textAlign: "right" }}>{"Moyenne / 10"}</th><th style={{ textAlign: "right" }}>Seuil</th><th>Décision</th><th>Fiche</th></tr>
          </thead>
          <tbody>
            {lignes.length === 0 && <tr><td colSpan="7" className="table-empty">{donnees.enAttente.length ? "Aucun candidat ne correspond à ce filtre." : "Aucun candidat en attente d'examen."}</td></tr>}
            {lignes.map((d) => {
              const f = ficheDe(d);
              return (
                <tr key={d.candidat.id} data-candidat-ligne={nomDe(d)} data-etat={d.etat}>
                  <td style={{ whiteSpace: "nowrap" }}><strong>{nomDe(d)}</strong></td>
                  <td>{nomClasse(d.candidat.classe_souhaitee_uuid) || <span style={{ color: "#6b7280" }}>-</span>}</td>
                  <td><span className="wf-petit">{detailNotes(d)}</span></td>
                  <td style={{ textAlign: "right" }}>{d.moyenne === null ? "-" : formatNombre(d.moyenne)}</td>
                  <td style={{ textAlign: "right" }}>{d.seuil === null ? "-" : formatNombre(d.seuil)}</td>
                  <td data-decision style={{ whiteSpace: "nowrap" }}>
                    {d.etat === "reussi" && <span className="badge badge-ok">Réussi</span>}
                    {d.etat === "echoue" && <span className="badge badge-err">Échoué</span>}
                    {d.etat === "en_attente" && <span className="badge badge-gold">{"En attente (" + d.saisies + "/" + d.attendues + ")"}</span>}
                    {d.etat === "sans_examen" && <span className="badge badge-gray">Sans examen</span>}
                    {d.etat === "non_configure" && <span className="badge badge-gray">Examen à configurer</span>}
                  </td>
                  <td>{f.complet ? <span className="badge badge-ok">Complète</span> : <span className="wf-petit" title={f.manque.join(", ")}>{"À compléter : " + f.manque.join(", ")}</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="wf-petit" style={{ marginTop: "10px" }}>{"Les boutons agissent sur la classe choisie en haut (ou sur toutes les classes). Les candidats « Sans examen » ou « En attente » ne sont pas touchés : ils se traitent un par un dans la page Inscription."}</p>

      {lot && <FenetreLot type={lot} supabase={supabase} par={par} recharger={recharger} classeId={classeId} nomClasseChoisie={classeId ? nomClasse(classeId) : ""}
        avant={lot === "admettre" ? reussis : echoues} fermer={() => setLot(null)} notifier={notifier} signaler={signaler} />}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Admission / refus en lot : on relit les donnees juste avant d'agir, puis on traite un candidat a la fois.
function FenetreLot({ type, supabase, par, recharger, classeId, nomClasseChoisie, avant, fermer, notifier, signaler }) {
  const admettre = type === "admettre";
  const etatVoulu = admettre ? "reussi" : "echoue";
  const [phase, setPhase] = useState("confirmation"); // confirmation | en_cours | fin
  const [progres, setProgres] = useState({ fait: 0, total: 0 });
  const [rapport, setRapport] = useState(null);
  const [erreur, setErreur] = useState("");
  const verrou = useRef(false);

  const incomplets = admettre ? avant.filter((d) => !debutIdentifiant(d.candidat).complet) : [];
  const aTraiter = avant.length - incomplets.length;

  const lancer = async () => {
    if (verrou.current) return;
    verrou.current = true;
    setErreur(""); setPhase("en_cours");
    const rap = { ok: [], ignores: [], erreurs: [], provisoires: 0, arrete: "" };
    try {
      const frais = await recharger();
      if (!frais) { setErreur("Les données n'ont pas pu être rechargées. Rien n'a été modifié."); setPhase("confirmation"); verrou.current = false; return; }
      const cibles = frais.decisions.filter((d) => d.etat === etatVoulu && (!classeId || d.candidat.classe_souhaitee_uuid === classeId)).sort(parNom);
      const traitables = [];
      cibles.forEach((d) => {
        if (admettre && !debutIdentifiant(d.candidat).complet) rap.ignores.push({ nom: nomDe(d), raison: "fiche incomplète : " + debutIdentifiant(d.candidat).manque.join(", ") });
        else traitables.push(d);
      });
      setProgres({ fait: 0, total: traitables.length });
      let fait = 0;
      for (const d of traitables) {
        const examen = { moyenne: d.moyenne, decision: etatVoulu };
        try {
          if (admettre) {
            const r = await admettreInscription(supabase, d.candidat.id, par, examen);
            rap.ok.push({ nom: nomDe(d), matricule: r.student.matricule });
            if (r.provisoire) rap.provisoires++;
          } else {
            await refuserInscription(supabase, d.candidat.id, par, examen);
            rap.ok.push({ nom: nomDe(d) });
          }
        } catch (e) {
          rap.erreurs.push({ nom: nomDe(d), message: messageErreur(e) });
          if (manqueSql(e)) { rap.arrete = messageErreur(e); break; }
        }
        fait++;
        setProgres({ fait, total: traitables.length });
      }
    } catch (e) {
      rap.arrete = messageErreur(e);
    }
    await recharger();
    setRapport(rap); setPhase("fin");
    const resume = admettre ? rap.ok.length + " candidat(s) admis" : rap.ok.length + " candidat(s) refusé(s)";
    if (rap.erreurs.length || rap.arrete) signaler(resume + ", " + rap.erreurs.length + " erreur(s) : voir le rapport." + (rap.arrete ? " " + rap.arrete : ""));
    else notifier(resume + (admettre ? ". Assignez-les à une classe dans le module Assignations." : "."));
  };

  const titre = admettre ? "Admettre les candidats réussis" : "Refuser les candidats échoués";
  const portee = nomClasseChoisie ? "de la classe « " + nomClasseChoisie + " »" : "de toutes les classes";

  return (
    <Fenetre titre={titre} sousTitre={portee} largeur="620px" fermer={fermer} occupe={phase === "en_cours"} protege onSubmit={phase === "confirmation" ? lancer : phase === "fin" ? fermer : undefined}
      pied={
        phase === "confirmation" ? (
          <>
            <button type="button" className="btn-gray-cancel" onClick={fermer}>Annuler</button>
            <button type="submit" className={admettre ? "btn-primary" : "btn-sm btn-red"} style={admettre ? undefined : { padding: "11px 20px", fontSize: "14px", borderRadius: "11px", fontWeight: 700 }} data-action="confirmer-lot" disabled={!aTraiter}>{admettre ? "Admettre " + aTraiter + " candidat(s)" : "Refuser " + aTraiter + " candidat(s)"}</button>
          </>
        ) : phase === "en_cours" ? (
          <button type="button" className="btn-gray-cancel" disabled>En cours...</button>
        ) : (
          <button type="button" className="btn-primary" data-action="fermer-rapport" onClick={fermer}>Fermer</button>
        )
      }>
      {phase === "confirmation" && (
        <div>
          {admettre
            ? <p className="wf-texte">{aTraiter + " candidat(s) réussi(s) deviendront des élèves, chacun avec son identifiant. Tu pourras ensuite les assigner à une classe dans le module Assignations."}</p>
            : <p className="wf-texte">{aTraiter + " candidat(s) échoué(s) seront marqués « Refusé »."}</p>}
          <ul data-liste-lot style={{ maxHeight: "220px", overflow: "auto", paddingLeft: "18px", margin: "8px 0" }}>
            {avant.filter((d) => !incomplets.includes(d)).map((d) => <li key={d.candidat.id}>{nomDe(d) + " : " + formatNombre(d.moyenne) + " / 10"}</li>)}
          </ul>
          {incomplets.length > 0 && (
            <div className="wf-avis" role="alert" data-incomplets>
              <strong>{incomplets.length + " fiche(s) incomplète(s) : ces candidats ne seront pas admis"}</strong>
              <div>{incomplets.map((d) => nomDe(d) + " (il manque " + debutIdentifiant(d.candidat).manque.join(", ") + ")").join(" ; ")}</div>
              <div>{"Complète leur fiche avec « Modifier » dans la page Inscription, puis recommence."}</div>
            </div>
          )}
          {erreur && <div className="login-error">{erreur}</div>}
        </div>
      )}
      {phase === "en_cours" && (
        <div data-progres>
          <p className="wf-texte">{"Traitement en cours : " + progres.fait + " / " + progres.total + ". Ne ferme pas cette fenêtre."}</p>
          <div style={{ background: "#e5e7eb", borderRadius: "6px", height: "10px", overflow: "hidden" }}>
            <div style={{ width: (progres.total ? Math.round(progres.fait / progres.total * 100) : 0) + "%", height: "100%", background: "#1d4ed8" }} />
          </div>
        </div>
      )}
      {phase === "fin" && rapport && (
        <div data-rapport>
          <p className="wf-texte"><strong>{rapport.ok.length + (admettre ? " candidat(s) admis" : " candidat(s) refusé(s)")}</strong>{rapport.ignores.length ? " · " + rapport.ignores.length + " ignoré(s)" : ""}{rapport.erreurs.length ? " · " + rapport.erreurs.length + " erreur(s)" : ""}</p>
          {rapport.arrete && <div className="login-error">{rapport.arrete}</div>}
          {admettre && rapport.ok.length > 0 && (
            <ul style={{ maxHeight: "180px", overflow: "auto", paddingLeft: "18px", margin: "8px 0" }}>
              {rapport.ok.map((x) => <li key={x.nom + x.matricule}>{x.nom + " : " + x.matricule}</li>)}
            </ul>
          )}
          {rapport.provisoires > 0 && <p className="wf-petit">{rapport.provisoires + " identifiant(s) provisoire(s) : le script SQL des identifiants n'est pas installé sur cette base."}</p>}
          {rapport.ignores.length > 0 && (
            <div className="wf-avis"><strong>Ignorés</strong>{rapport.ignores.map((x) => <div key={x.nom}>{x.nom + " : " + x.raison}</div>)}</div>
          )}
          {rapport.erreurs.length > 0 && (
            <div className="login-error" data-erreurs-lot>{rapport.erreurs.map((x) => <div key={x.nom}>{x.nom + " : " + x.message}</div>)}</div>
          )}
          {admettre && rapport.ok.length > 0 && <p className="wf-petit">{"Prochaine étape : assigne ces nouveaux élèves à leur classe dans le module Assignations."}</p>}
        </div>
      )}
    </Fenetre>
  );
}
