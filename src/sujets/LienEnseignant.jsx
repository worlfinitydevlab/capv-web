import React, { useCallback, useEffect, useState } from "react";
import { appeler, indisponible } from "./sujetsApi.js";
import { Fenetre, PiedStandard, MessageEnvoi, useEnvoi } from "../pedagogie/Fenetre.jsx";

// « Enseignant lié » d'un compte (page Utilisateurs). Le lien est garde dans une table verrouillee du serveur : seul un administrateur
// peut le changer, et c'est lui qui decide qui recoit quels sujets d'examens. Si la fonction serveur n'est pas installee, rien n'apparait.
export function useLiensSujets(token, estAdmin) {
  const [etat, setEtat] = useState({ visible: false, liens: {}, enseignants: [] });
  const [cible, setCible] = useState(null);
  const recharger = useCallback(async () => {
    if (!estAdmin || !token) return;
    const r = await appeler(token, "liens");
    if (r.ok) {
      const liens = {};
      (r.data.liens || []).forEach((l) => { liens[l.username] = l.employee_id; });
      setEtat({ visible: true, liens, enseignants: r.data.enseignants || [] });
    } else if (indisponible(r)) {
      setEtat({ visible: false, liens: {}, enseignants: [] });
    }
  }, [token, estAdmin]);
  useEffect(() => { recharger(); }, [recharger]);
  return { ...etat, token, cible, ouvrir: setCible, fermer: () => setCible(null), recharger };
}

export function CelluleEnseignant({ liens, username }) {
  const id = liens.liens[username];
  if (!id) return <span style={{ color: "var(--text-soft)" }}>-</span>;
  const e = liens.enseignants.find((x) => x.id === id);
  return <span data-enseignant-lie={username}>{e ? (e.nom || "Enseignant") + (e.matricule ? " (" + e.matricule + ")" : "") : "Enseignant introuvable"}</span>;
}

export function FenetreLienEnseignant({ liens, demanderConfirmation }) {
  const u = liens.cible;
  const envoi = useEnvoi();
  const [choix, setChoix] = useState(liens.liens[u.username] || "");
  const prisPar = {};
  Object.keys(liens.liens).forEach((nom) => { if (nom !== u.username) prisPar[liens.liens[nom]] = nom; });
  const actifs = liens.enseignants.filter((e) => !e.statut || String(e.statut).toLowerCase() === "actif" || e.id === liens.liens[u.username]);
  actifs.sort((a, b) => String(a.nom).localeCompare(String(b.nom), "fr"));
  const enregistrer = async () => {
    if (choix === (liens.liens[u.username] || "")) { liens.fermer(); return; }
    // le mot de passe de l'administrateur est demande comme pour les autres actions de la page ; l'erreur eventuelle s'affiche dans cette demande
    const username = u.username, employeeId = choix || null;
    liens.fermer();
    demanderConfirmation(async () => {
      const r = await appeler(liens.token, "lier", { username, employee_id: employeeId });
      if (!r.ok) throw new Error(r.error);
      await liens.recharger();
    });
  };
  return (
    <Fenetre titre="Enseignant lié" sousTitre={"Compte « " + u.username + " »"} fermer={liens.fermer} occupe={envoi.occupe} protege onSubmit={() => envoi.envoyer(enregistrer)}
      pied={<PiedStandard fermer={liens.fermer} occupe={envoi.occupe} libelle="Enregistrer" envoi={envoi} />}>
      <div className="form-group">
        <label htmlFor="suj-lien-choix">Enseignant</label>
        <select id="suj-lien-choix" value={choix} onChange={(e) => setChoix(e.target.value)} data-champ="lien-enseignant">
          <option value="">- Aucun -</option>
          {actifs.map((e) => (
            <option key={e.id} value={e.id} disabled={!!prisPar[e.id]}>{(e.nom || "Enseignant") + (e.matricule ? " (" + e.matricule + ")" : "") + (prisPar[e.id] ? " - déjà lié à " + prisPar[e.id] : "")}</option>
          ))}
        </select>
      </div>
      <p className="wf-petit">{"Ce lien indique quels sujets d'examens ce compte peut préparer. Un compte = un enseignant."}</p>
      <MessageEnvoi envoi={envoi} />
    </Fenetre>
  );
}
