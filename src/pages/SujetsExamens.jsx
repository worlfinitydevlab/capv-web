import React, { useEffect, useState } from "react";
import { useAuth } from "../AuthContext.jsx";
import { appeler, depuis } from "../sujets/sujetsApi.js";
import { rafraichir, marquerLues, useNotificationsSujets, useOngletDemande, oublierDemande } from "../sujets/sujetsStore.js";
import MesExamens from "../sujets/MesExamens.jsx";
import DossiersSujets from "../sujets/DossiersSujets.jsx";
import HistoriqueSujets from "../sujets/HistoriqueSujets.jsx";
import ValidationSujets from "../sujets/ValidationSujets.jsx";
import ArchivesSujets from "../sujets/ArchivesSujets.jsx";
import PostePrincipal from "../sujets/PostePrincipal.jsx";
import "../sujets/sujets.css";

const LIBELLES_DROITS = [
  ["sujets_dossiers", "Dossiers"], ["sujets_mes", "Mes examens"], ["sujets_commentaires", "Commentaires"],
  ["sujets_validation", "Validation"], ["sujets_archives", "Documents validés et archives"], ["sujets_historique", "Historique"],
  ["sujets_admin", "Administration des fichiers"]
];

// Page « Sujets d'examens » : preparation, relecture et validation des sujets d'examens (documents Word) par les enseignants et le secretariat.
// Etape 1 : mon espace (enseignant lie), notifications, verification de l'installation (administrateur).
// Etape 2 : « Dossiers » (secretariat : dossiers, documents, attribution) et « Mes examens » (enseignant : ses documents).
// Etape 3 : le fichier Word de chaque document (creer le modele, prendre la main, telecharger, deposer des versions) et l'onglet « Historique ».
// Etape S5a : l'onglet « Poste principal » (l'ordinateur du secretariat garde une copie de chaque version et fabrique le PDF exact avec Word).
// Etape S4 : la soumission par l'enseignant, les onglets « Validation » (decider) et « Archives » (archiver, purger les anciennes versions d'un examen archive).
// Les commentaires arrivent a une etape suivante.
export default function SujetsExamens() {
  const { token, user } = useAuth();
  const estAdmin = !!user && user.role === "Administrateur";
  const e = useNotificationsSujets();
  const [onglet, setOnglet] = useState(null);       // null : choisi automatiquement selon les droits, une fois ceux-ci connus
  const [moi, setMoi] = useState(null);
  const [erreur, setErreur] = useState("");
  const [documentDemande, setDocumentDemande] = useState(null);
  const [vueDemandee, setVueDemandee] = useState(null);
  const demande = useOngletDemande();
  const droits = (moi && moi.droits) || {};
  const voitDossiers = !!(droits.sujets_dossiers && droits.sujets_dossiers.voir);
  const voitMes = !!(droits.sujets_mes && droits.sujets_mes.voir);
  const voitValidation = !!(droits.sujets_validation && droits.sujets_validation.voir);
  const voitArchives = !!(droits.sujets_archives && droits.sujets_archives.voir);
  const voitHistorique = !!(droits.sujets_historique && droits.sujets_historique.voir);
  const voitPoste = !!(droits.sujets_admin && droits.sujets_admin.voir);
  const onglets = [["espace", "Mon espace"]]
    .concat(voitMes ? [["mes", "Mes examens"]] : [])
    .concat(voitDossiers ? [["dossiers", "Dossiers"]] : [])
    .concat(voitValidation ? [["validation", "Validation"]] : [])
    .concat(voitArchives ? [["archives", "Archives"]] : [])
    .concat(voitHistorique ? [["historique", "Historique"]] : [])
    .concat(voitPoste ? [["poste", "Poste principal"]] : [])
    .concat([["notifications", "Notifications"]])
    .concat(estAdmin ? [["verification", "Vérification"]] : []);
  const disponible = (k) => onglets.some((o) => o[0] === k);
  // onglet de depart : Dossiers pour le secretariat, Mes examens pour un enseignant, sinon Mon espace
  const courant = onglet && disponible(onglet) ? onglet : (voitDossiers ? "dossiers" : voitMes ? "mes" : "espace");
  // un clic sur une notification d'attribution ouvre « Mes examens » (et le document concerne)
  useEffect(() => {
    if (!demande.n || !moi) return;
    // une notification de fichier (main prise, version deposee...) ouvre « Mes examens » ; sans ce droit, le secretariat va sur « Dossiers »
    // (une version « à vérifier » concerne surtout le secretariat : elle ouvre « Dossiers » quand on y a acces)
    const versDossiers = demande.onglet === "mes" && disponible("dossiers") && (!disponible("mes") || demande.vue === "conflit");
    const cible = versDossiers ? "dossiers" : demande.onglet;
    if (cible && disponible(cible)) { setOnglet(cible); setDocumentDemande(cible === "mes" || cible === "validation" ? demande.document : null); setVueDemandee(cible === "mes" || cible === "validation" ? demande.vue : null); }
    oublierDemande();
  }, [demande.n, moi]);

  useEffect(() => {
    let annule = false;
    (async () => {
      const r = await appeler(token, "moi");
      if (annule) return;
      if (r.ok) { setMoi(r.data); setErreur(""); } else setErreur(r.error);
    })();
    return () => { annule = true; };
  }, [token]);

  return (
    <div className="page suj-page">
      <div className="page-header">
        <h1 className="page-title">{"Sujets d'examens"}</h1>
        <p className="page-subtitle">{"Préparation, fichiers Word, relecture et validation des sujets d'examens"}</p>
      </div>
      <div style={{ display: "flex", gap: "8px", marginBottom: "14px", flexWrap: "wrap" }}>
        {onglets.map(([k, t]) => (
          <button key={k} type="button" data-onglet={k} className={courant === k ? "btn-primary" : "btn-gray-cancel"} onClick={() => { setOnglet(k); setDocumentDemande(null); setVueDemandee(null); }}>
            {t}{k === "notifications" && e.non_lues > 0 ? " (" + e.non_lues + ")" : ""}
          </button>
        ))}
      </div>
      {erreur && <div className="login-error" style={{ marginBottom: "14px" }} data-erreur="page">{erreur}</div>}
      {!moi && !erreur && <p className="wf-petit">Chargement…</p>}
      {moi && courant === "espace" && <MonEspace moi={moi} />}
      {moi && courant === "mes" && <MesExamens token={token} ouvrirDocument={documentDemande} ouvrirVue={vueDemandee} />}
      {moi && courant === "dossiers" && <DossiersSujets token={token} droits={droits.sujets_dossiers} />}
      {moi && courant === "validation" && voitValidation && <ValidationSujets token={token} ouvrirDocument={documentDemande} ouvrirVue={vueDemandee} />}
      {moi && courant === "archives" && voitArchives && <ArchivesSujets token={token} droits={droits.sujets_archives} estAdmin={estAdmin} />}
      {moi && courant === "historique" && voitHistorique && <HistoriqueSujets token={token} />}
      {moi && courant === "poste" && voitPoste && <PostePrincipal token={token} />}
      {courant === "notifications" && <Notifications e={e} />}
      {courant === "verification" && estAdmin && <Verification token={token} moi={moi} />}
    </div>
  );
}

function MonEspace({ moi }) {
  if (!moi) return <p className="wf-petit">Chargement…</p>;
  const ens = moi.enseignant;
  return (
    <div className="suj-cartes">
      <div className="suj-carte" data-carte="compte">
        <h3>Mon compte</h3>
        <p><strong>{moi.identite.nom_complet || moi.identite.username}</strong></p>
        <p>{moi.identite.role || ""}</p>
      </div>
      <div className="suj-carte" data-carte="enseignant">
        <h3>Enseignant lié à mon compte</h3>
        {ens && !ens.introuvable && <p data-enseignant><strong>{ens.nom}</strong>{ens.matricule ? " (" + ens.matricule + ")" : ""}</p>}
        {ens && ens.introuvable && <p data-enseignant>{"Le lien existe mais la fiche de l'enseignant est introuvable. Demande à un administrateur de le refaire."}</p>}
        {!ens && <p data-enseignant>{"Ton compte n'est pas lié à un enseignant. Si tu dois préparer des sujets d'examens, demande à un administrateur de faire le lien (Utilisateurs > Enseignant)."}</p>}
      </div>
    </div>
  );
}

function Notifications({ e }) {
  useEffect(() => { rafraichir(true); }, []);
  return (
    <div className="table-card" data-liste="notifications">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid var(--line)" }}>
        <strong>{e.non_lues > 0 ? e.non_lues + " non lue" + (e.non_lues > 1 ? "s" : "") : "Tout est lu"}</strong>
        {e.non_lues > 0 && <button type="button" className="btn-sm btn-gray-cancel" data-tout-lu-page onClick={() => marquerLues(null)}>Tout marquer comme lu</button>}
      </div>
      {e.notifications.length === 0 && <div className="suj-vide">Aucune notification.</div>}
      {e.notifications.length > 0 && (
        <table className="data-table">
          <thead><tr><th>Notification</th><th>Reçue</th><th></th></tr></thead>
          <tbody>
            {e.notifications.map((n) => (
              <tr key={n.id} data-ligne-notif={n.id}>
                <td><strong>{n.titre}</strong>{n.message && <div className="wf-petit">{n.message}</div>}</td>
                <td>{depuis(n.created_at)}</td>
                <td>{!n.lu_le ? <span className="badge badge-gold">Non lue</span> : <span className="badge badge-gray">Lue</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Verification({ token, moi }) {
  const [diag, setDiag] = useState(null);
  const [occupe, setOccupe] = useState(false);
  const [info, setInfo] = useState("");
  const [erreur, setErreur] = useState("");
  const lancer = async () => {
    setOccupe(true); setErreur(""); setInfo("");
    const r = await appeler(token, "diagnostic");
    if (r.ok) setDiag(r.data); else setErreur(r.error);
    setOccupe(false);
  };
  const tester = async () => {
    setOccupe(true); setErreur(""); setInfo("");
    const r = await appeler(token, "notification_test");
    if (r.ok) { setInfo("Notification de test envoyée : regarde la cloche en haut à droite."); await rafraichir(true); } else setErreur(r.error);
    setOccupe(false);
  };
  const Ligne = ({ ok, texte, cle }) => (
    <li data-verif={cle}><span className={"badge " + (ok ? "badge-ok" : "badge-err")}>{ok ? "OK" : "À corriger"}</span><span>{texte}</span></li>
  );
  return (
    <>
      <div className="suj-cartes">
        <div className="suj-carte" data-carte="verification">
          <h3>Vérification de l&apos;installation</h3>
          <p>{"Contrôle la fonction serveur, les tables et le stockage privé des fichiers."}</p>
          <div style={{ display: "flex", gap: "8px", marginTop: "10px", flexWrap: "wrap" }}>
            <button type="button" className="btn-primary" data-lancer disabled={occupe} onClick={lancer}>{occupe ? "En cours..." : "Lancer la vérification"}</button>
            <button type="button" className="btn-gray-cancel" data-tester disabled={occupe} onClick={tester}>Envoyer une notification de test</button>
          </div>
          {info && <div data-info style={{ background: "#e6f4ea", color: "#1e6b34", padding: "8px 12px", borderRadius: "8px", marginTop: "10px", fontSize: "13px" }}>{info}</div>}
          {erreur && <div className="login-error" style={{ marginTop: "10px" }} data-erreur="verification">{erreur}</div>}
          {diag && (
            <ul className="suj-verif" style={{ marginTop: "12px" }}>
              <Ligne cle="signature" ok={!!diag.signature_verifiee} texte="Le serveur vérifie la signature de ta connexion" />
              {Object.keys(diag.tables).map((t) => <Ligne key={t} cle={t} ok={!!diag.tables[t]} texte={"Table " + t} />)}
              <Ligne cle="stockage" ok={!!(diag.stockage && diag.stockage.existe && diag.stockage.prive)} texte={diag.stockage && diag.stockage.existe ? (diag.stockage.prive ? "Stockage des fichiers : privé" + (diag.stockage.taille_max_mo ? " (" + diag.stockage.taille_max_mo + " Mo par fichier)" : "") : "Stockage des fichiers : PUBLIC, à corriger") : "Stockage des fichiers : introuvable"} />
              {diag.stockage && diag.stockage.existe && <Ligne cle="stockage_pdf" ok={diag.stockage.accepte_pdf !== false} texte={diag.stockage.accepte_pdf === false ? "Stockage : les PDF du poste principal ne sont pas acceptés (lance sujets-s5a.sql)" : "Stockage : les PDF du poste principal sont acceptés"} />}
            </ul>
          )}
        </div>
        <div className="suj-carte" data-carte="droits">
          <h3>Mes droits, tels que le serveur les lit</h3>
          {!moi && <p className="wf-petit">Chargement…</p>}
          {moi && (
            <table className="data-table" style={{ marginTop: "6px" }}>
              <thead><tr><th>Droit</th><th>Voir</th><th>Créer</th><th>Modifier</th><th>Annuler</th></tr></thead>
              <tbody>
                {LIBELLES_DROITS.map(([cle, nom]) => (
                  <tr key={cle} data-droit={cle}>
                    <td>{nom}</td>
                    {["voir", "creer", "modifier", "annuler"].map((n) => <td key={n}>{moi.droits && moi.droits[cle] && moi.droits[cle][n] ? "Oui" : "-"}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
