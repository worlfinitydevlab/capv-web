import React, { useCallback, useEffect, useRef, useState } from "react";
import { appeler, depuis } from "./sujetsApi.js";
import { EtatVide } from "../pedagogie/Fenetre.jsx";

// Onglet « Poste principal » : l'ordinateur du secretariat (ou le .exe de l'ERP est installe) garde sur son disque une copie de chaque version,
// classee par annee, periode, classe et matiere, accuse reception de chaque fichier (empreinte SHA-256) et fabrique un vrai PDF avec Word.
// Ici, l'administration cree la cle du poste (montree UNE seule fois, jamais relisible), la revoque, et surveille ce qui est recu ou en attente.
export default function PostePrincipal({ token }) {
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState("");
  const [nom, setNom] = useState("");
  const [occupe, setOccupe] = useState(false);
  const [cle, setCle] = useState(null);             // { cle, nom } : affichee une seule fois apres la creation
  const [copie, setCopie] = useState("");
  const [aRevoquer, setARevoquer] = useState(null);
  const [info, setInfo] = useState("");
  const vivant = useRef(true);
  const champCle = useRef(null);

  const charger = useCallback(async () => {
    const r = await appeler(token, "postes");
    if (!vivant.current) return;
    if (r.ok) { setD(r.data); setErreur(""); } else setErreur(r.error);
  }, [token]);
  useEffect(() => {
    vivant.current = true;
    charger();
    const t = setInterval(charger, 30000);
    return () => { vivant.current = false; clearInterval(t); };
  }, [charger]);

  const creer = async (ev) => {
    if (ev) ev.preventDefault();
    if (occupe) return;
    const n = nom.trim();
    if (!n) { setErreur("Donne un nom au poste (ex. : Secrétariat, PC principal)."); return; }
    setOccupe(true); setErreur(""); setInfo(""); setCopie("");
    const r = await appeler(token, "poste_creer", { nom: n });
    if (!vivant.current) return;
    if (r.ok) { setCle({ cle: r.data.cle, nom: r.data.poste.nom }); setNom(""); await charger(); } else setErreur(r.error);
    setOccupe(false);
  };
  const copier = async () => {
    setCopie("");
    try { await navigator.clipboard.writeText(cle.cle); setCopie("Clé copiée."); }
    catch (e) { if (champCle.current) { champCle.current.focus(); champCle.current.select(); } setCopie("Copie automatique impossible : la clé est sélectionnée, fais Ctrl + C."); }
  };
  const revoquer = async () => {
    if (occupe || !aRevoquer) return;
    setOccupe(true); setErreur(""); setInfo("");
    const r = await appeler(token, "poste_revoquer", { poste_id: aRevoquer.id });
    if (!vivant.current) return;
    if (r.ok) { setInfo("Le poste « " + aRevoquer.nom + " » est révoqué : sa clé ne fonctionne plus."); setARevoquer(null); await charger(); } else setErreur(r.error);
    setOccupe(false);
  };

  const peutGerer = !!(d && d.peut_gerer);
  const c = (d && d.compteurs) || {};
  const postes = (d && d.postes) || [];
  const tuile = (cleTuile, valeur, libelle, classe) => (
    <div key={cleTuile} className={"suj-tuile" + (classe ? " " + classe : "")} data-tuile={cleTuile}><strong>{valeur}</strong><span>{libelle}</span></div>
  );
  const etatPoste = (p) => {
    if (!p.actif) return <span className="badge badge-gray" data-etat-poste="revoque">Révoqué</span>;
    if (p.en_ligne) return <span className="badge badge-ok" data-etat-poste="en-ligne">En ligne</span>;
    if (!p.derniere_vue) return <span className="badge badge-gold" data-etat-poste="jamais">Jamais connecté</span>;
    return <span className="badge badge-gold" data-etat-poste="hors-ligne">Hors ligne</span>;
  };
  const Liste = ({ cleListe, titre, aide, lignes, total, avecMessage, classe }) => (!lignes || lignes.length === 0) ? null : (
    <div className="suj-carte" data-liste-poste={cleListe} style={{ marginBottom: "14px" }}>
      <h3>{titre}{" (" + total + ")"}</h3>
      <p className="wf-petit">{aide}</p>
      <div className="table-card" style={{ marginTop: "8px" }}>
        <table className="data-table">
          <thead><tr><th>Document</th><th>Dossier</th><th>{avecMessage ? "Problème" : "Déposée"}</th></tr></thead>
          <tbody>
            {lignes.map((x) => (
              <tr key={x.version_id} data-ligne-poste={x.version_id}>
                <td><strong>{x.titre || "Document"}</strong><div className="wf-petit">{"Version " + x.numero}</div></td>
                <td>{x.dossier || "-"}</td>
                <td>{avecMessage ? <span className={"badge " + (classe || "badge-gold")} title={x.pdf_erreur || ""}>{x.pdf_erreur || "Erreur"}</span> : depuis(x.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {total > lignes.length && <p className="wf-petit">{"Les " + lignes.length + " premières sont affichées ; il y en a " + (total - lignes.length) + " autre" + (total - lignes.length > 1 ? "s" : "") + "."}</p>}
    </div>
  );

  return (
    <div data-vue="poste">
      <div className="wf-barre">
        <div className="wf-barre-g"><h2>Poste principal</h2><span className="wf-compte" data-compte>{d ? postes.filter((p) => p.actif).length + " poste" + (postes.filter((p) => p.actif).length > 1 ? "s" : "") + " actif" + (postes.filter((p) => p.actif).length > 1 ? "s" : "") : ""}</span></div>
      </div>
      <p className="wf-intro">{"Le poste principal est l'ordinateur du secrétariat où l'ERP (le .exe) est installé. Il garde sur son disque une copie de chaque version déposée, rangée par année, période, classe et matière, confirme qu'il l'a bien reçue, puis fabrique avec Word un vrai PDF que les enseignants peuvent lire en ligne. Rien n'est jamais écrasé ni supprimé."}</p>
      {erreur && <div className="login-error" style={{ marginBottom: "14px" }} data-erreur="poste">{erreur}</div>}
      {info && <div className="suj-ok" data-info="poste">{info}</div>}
      {!d && !erreur && <p className="wf-petit">Chargement…</p>}

      {d && (
        <div className="suj-tuiles" data-tuiles>
          {tuile("versions", c.versions || 0, "Versions déposées")}
          {tuile("recues", c.recues || 0, "Reçues au poste", "ok")}
          {tuile("en_attente", c.en_attente || 0, "En attente du poste", c.en_attente ? "gold" : "")}
          {tuile("ecarts", c.ecarts || 0, "Écarts d'empreinte", c.ecarts ? "err" : "")}
          {tuile("avec_pdf", c.avec_pdf || 0, "PDF prêts", "ok")}
          {tuile("pdf_en_erreur", c.pdf_en_erreur || 0, "PDF non fabriqués", c.pdf_en_erreur ? "gold" : "")}
        </div>
      )}

      {cle && (
        <div className="suj-cle" data-cle-bloc role="alert">
          <strong>{"Clé du poste « " + cle.nom + " »"}</strong>
          <p>{"Copie cette clé maintenant et colle-la dans l'ERP du secrétariat. Elle n'est montrée qu'une seule fois : le site n'en garde que l'empreinte et ne pourra plus jamais la réafficher. Si tu la perds, révoque ce poste et crée-en un nouveau."}</p>
          <input ref={champCle} className="suj-cle-valeur" data-cle-valeur readOnly value={cle.cle} onFocus={(e) => e.target.select()} aria-label="Clé du poste" />
          <div className="suj-rangee">
            <button type="button" className="btn-primary" data-cle-copier onClick={copier}>Copier la clé</button>
            <button type="button" className="btn-gray-cancel" data-cle-fermer onClick={() => { setCle(null); setCopie(""); }}>{"J'ai copié la clé"}</button>
            {copie && <span className="wf-petit" data-cle-copie style={{ display: "inline" }}>{copie}</span>}
          </div>
        </div>
      )}

      {d && (
        <div className="suj-carte" data-carte="postes" style={{ marginBottom: "14px" }}>
          <h3>Postes autorisés</h3>
          {postes.length === 0 && <EtatVide titre="Aucun poste pour l'instant" texte={peutGerer ? "Crée une clé de poste ci-dessous, puis colle-la dans l'ERP du secrétariat. En attendant, les versions déposées restent simplement « en attente du poste »." : "Aucun poste n'a encore été autorisé."} />}
          {postes.length > 0 && (
            <div className="table-card">
              <table className="data-table" data-table="postes">
                <thead><tr><th>Poste</th><th>Clé</th><th>État</th><th>Dernier contact</th><th>Logiciel</th><th></th></tr></thead>
                <tbody>
                  {postes.map((p) => (
                    <tr key={p.id} data-poste={p.id} className={p.actif ? "" : "suj-annule"}>
                      <td><strong>{p.nom}</strong><div className="wf-petit">{"Créé " + depuis(p.created_at) + (p.cree_par ? " par " + p.cree_par : "")}</div></td>
                      <td><code>{p.cle_debut + "…"}</code></td>
                      <td>{etatPoste(p)}{!p.actif && p.revoque_le && <div className="wf-petit">{"Révoqué " + depuis(p.revoque_le) + (p.revoque_par ? " par " + p.revoque_par : "")}</div>}</td>
                      <td>{p.derniere_vue ? depuis(p.derniere_vue) : "-"}</td>
                      <td>{p.logiciel || "-"}{p.machine && <div className="wf-petit">{p.machine}</div>}</td>
                      <td className="suj-actions">{peutGerer && p.actif && <button type="button" className="btn-sm btn-red" data-revoquer={p.id} disabled={occupe} onClick={() => setARevoquer(p)}>Révoquer</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {aRevoquer && peutGerer && (
            <div className="suj-bloc" data-bloc="revoquer" style={{ marginTop: "12px" }}>
              <strong>{"Révoquer le poste « " + aRevoquer.nom + " » ?"}</strong>
              <p className="wf-aide">{"Sa clé cesse de fonctionner tout de suite : il ne peut plus rien recevoir ni envoyer. Les fichiers déjà rangés sur son disque et les PDF déjà envoyés ne sont pas touchés. Tu pourras créer un nouveau poste à tout moment."}</p>
              <div className="suj-rangee">
                <button type="button" className="btn-red" data-confirmer-revoquer disabled={occupe} onClick={revoquer}>Révoquer ce poste</button>
                <button type="button" className="btn-gray-cancel" data-annuler-revoquer disabled={occupe} onClick={() => setARevoquer(null)}>Annuler</button>
              </div>
            </div>
          )}
          {peutGerer && (
            <form onSubmit={creer} className="suj-filtres" style={{ marginTop: "14px", marginBottom: 0 }} data-form-poste noValidate>
              <div className="form-group" style={{ flex: "1 1 260px" }}>
                <label htmlFor="sp-nom">Nom du nouveau poste</label>
                <input id="sp-nom" data-champ="poste-nom" value={nom} maxLength={80} placeholder="Ex. : Secrétariat, PC principal" onChange={(e) => setNom(e.target.value)} />
              </div>
              <div className="suj-rangee" style={{ margin: 0, paddingBottom: "1px" }}>
                <button type="submit" className="btn-primary" data-creer-poste disabled={occupe}>{occupe ? "En cours..." : "Créer une clé de poste"}</button>
              </div>
            </form>
          )}
        </div>
      )}

      {d && <Liste cleListe="ecarts" titre="Écarts d'empreinte à vérifier" total={c.ecarts || 0} lignes={d.ecarts} classe="badge-err"
        aide="Le fichier rangé sur le poste n'est pas identique à la copie en ligne. Les deux sont gardés : rien n'est écrasé. Regarde le fichier sur le poste, puis dépose à nouveau si besoin." />}
      {d && <Liste cleListe="en_attente" titre="En attente de réception au poste" total={c.en_attente || 0} lignes={d.en_attente}
        aide="Ces versions n'ont pas encore été copiées sur le poste principal (il est peut-être éteint ou hors connexion). Elles seront reçues dès qu'il se reconnecte." />}
      {d && <Liste cleListe="pdf_en_erreur" titre="PDF non fabriqués" total={c.pdf_en_erreur || 0} lignes={d.pdf_en_erreur} avecMessage
        aide="Word n'a pas pu fabriquer le PDF de ces versions. Le poste réessaie tout seul toutes les 30 minutes ; le fichier Word, lui, est bien gardé." />}
    </div>
  );
}
