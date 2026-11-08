import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from "../AuthContext.jsx";
import { getAuthedClient } from "../supabaseClient.js";
import { lireTout } from "../classeProposee.js";
import { statistiquesEcoles } from "../inscriptionEleve.js";
import { cleListe } from "../geographie.js";

// Fenetre « Ecoles precedentes » : la liste memorisee (ecoles deja saisies a l'inscription) et combien de candidats / d'eleves viennent de chacune.
//   inscriptions : inscriptions de l'annee en cours (deja chargees par la page) ; listes : useListesReference()
export default function EcolesPrecedentes({ onClose, inscriptions, anneeNom, listes }) {
  const { token } = useAuth();
  const [eleves, setEleves] = useState(null);
  const [erreur, setErreur] = useState("");
  const [recherche, setRecherche] = useState("");

  useEffect(() => {
    let actif = true;
    (async () => {
      try {
        const supabase = getAuthedClient(token);
        const lignes = await lireTout((a, b) => supabase.from("students").select("ecole_precedente").is("deleted_at", null).order("id").range(a, b));
        if (actif) setEleves(lignes);
      } catch (e) { if (actif) { setEleves([]); setErreur("Impossible de compter les élèves."); } }
    })();
    return () => { actif = false; };
  }, [token]);

  const stats = useMemo(() => statistiquesEcoles({ ecolesListe: listes.valeurs("ecole", ""), inscriptions, eleves: eleves || [] }), [listes, inscriptions, eleves]);
  const q = cleListe(recherche);
  const visibles = q ? stats.filter((s) => cleListe(s.nom).includes(q)) : stats;
  const somme = (f) => visibles.reduce((t, s) => t + f(s), 0);
  const sansEcoleCandidats = (inscriptions || []).filter((i) => !cleListe(i.ecole_precedente)).length;
  const sansEcoleEleves = (eleves || []).filter((s) => !cleListe(s.ecole_precedente)).length;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card modal-large" onClick={(e) => e.stopPropagation()} style={{ maxHeight: "85vh", overflowY: "auto" }} data-fenetre="ecoles-precedentes">
        <div className="modal-header">
          <h3>{"Écoles précédentes"}</h3>
          <button className="modal-close" onClick={onClose}>x</button>
        </div>
        <p style={{ color: "var(--text-dim)", fontSize: "13px", marginTop: 0 }}>
          {"Une école saisie une fois à l'inscription (menu « École précédente » > « Autre ») est proposée ensuite à tout le monde. Candidats : inscriptions de " + (anneeNom || "l'année") + ". Élèves : tous les élèves de l'école, toutes années (les candidats admis y sont aussi comptés)."}
        </p>
        {erreur && <div className="login-error" style={{ marginBottom: "12px" }}>{erreur}</div>}
        {listes.absente && <div className="login-error" style={{ marginBottom: "12px" }}>{"La liste mémorisée n'est pas encore installée sur cette base (script SQL « identifiant-eleve.sql »)."}</div>}
        <input placeholder="Chercher une école..." value={recherche} onChange={(e) => setRecherche(e.target.value)} style={{ marginBottom: "12px", maxWidth: "340px" }} data-champ="recherche-ecole" />
        {eleves === null ? <p>Chargement...</p> : (
          <table className="data-table" data-tableau="ecoles-precedentes">
            <thead>
              <tr><th>{"École précédente"}</th><th>Candidats</th><th>{"En attente"}</th><th>Admis</th><th>{"Refusés"}</th><th>{"Élèves"}</th></tr>
            </thead>
            <tbody>
              {visibles.length === 0 && <tr><td colSpan="6" className="table-empty">{stats.length === 0 ? "Aucune école enregistrée pour le moment." : "Aucune école ne correspond."}</td></tr>}
              {visibles.map((s) => (
                <tr key={s.nom}>
                  <td><strong>{s.nom}</strong></td>
                  <td>{s.candidats.total}</td><td>{s.candidats.en_attente}</td><td>{s.candidats.admis}</td><td>{s.candidats.refuse}</td>
                  <td>{s.eleves}</td>
                </tr>
              ))}
            </tbody>
            {visibles.length > 0 && (
              <tfoot>
                <tr style={{ fontWeight: 700 }}>
                  <td>{"Total" + (q ? " (affichage)" : "")}</td>
                  <td>{somme((s) => s.candidats.total)}</td><td>{somme((s) => s.candidats.en_attente)}</td><td>{somme((s) => s.candidats.admis)}</td><td>{somme((s) => s.candidats.refuse)}</td>
                  <td>{somme((s) => s.eleves)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        )}
        {eleves !== null && <p style={{ color: "var(--text-dim)", fontSize: "12.5px", marginBottom: 0 }}>{"Sans école précédente renseignée : " + sansEcoleCandidats + " candidat(s), " + sansEcoleEleves + " élève(s)."}</p>}
      </div>
    </div>
  );
}
