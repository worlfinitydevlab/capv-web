import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { appeler } from "./sujetsApi.js";
import { Fenetre } from "../pedagogie/Fenetre.jsx";
import { tailleLisible } from "./fichiersApi.js";

// Lecture du PDF « exact » d'une version : il est fabrique par Word sur le poste principal du secretariat (meme mise en page que le fichier Word :
// numeros de page, coupures de page, tabulations). Le site le charge par une adresse signee de 60 s (notee « lecture_pdf » dans l'historique),
// puis l'affiche tel quel. Rien n'est modifie ici. Sur telephone, certains navigateurs n'affichent pas un PDF dans la page : les boutons
// « Ouvrir dans un onglet » et « Télécharger » prennent le relais.
export function LecturePdf({ token, doc, numero, fermer }) {
  const [etat, setEtat] = useState("charge");      // charge | pret | erreur
  const [message, setMessage] = useState("");
  const [adresse, setAdresse] = useState(null);    // adresse locale (blob:) du PDF, valable seulement dans cet onglet
  const [lue, setLue] = useState(null);
  const [nom, setNom] = useState("document.pdf");
  const [taille, setTaille] = useState(0);
  const vivant = useRef(true);
  const deja = useRef(null);
  const blobUrl = useRef(null);
  useEffect(() => {
    vivant.current = true;
    return () => { vivant.current = false; if (blobUrl.current) { URL.revokeObjectURL(blobUrl.current); blobUrl.current = null; } };
  }, []);
  useEffect(() => {
    // une seule lecture par ouverture (le mode developpement de React rejoue les effets : sinon la lecture serait notee deux fois)
    const cle = doc.id + "|" + (numero || "");
    if (deja.current === cle) return;
    deja.current = cle;
    (async () => {
      const r = await appeler(token, "telecharger", numero ? { document_id: doc.id, numero, usage: "pdf" } : { document_id: doc.id, usage: "pdf" });
      if (!vivant.current) return;
      if (!r.ok) { setEtat("erreur"); setMessage(r.error); return; }
      let blob;
      try {
        const rep = await fetch(r.data.url);
        if (!rep.ok) throw new Error("http " + rep.status);
        blob = await rep.blob();
      } catch (e) {
        if (vivant.current) { setEtat("erreur"); setMessage("Le PDF n'a pas pu être chargé. Vérifie ta connexion et réessaie."); }
        return;
      }
      if (!vivant.current) return;
      const pdf = new Blob([blob], { type: "application/pdf" });   // le type est force : l'adresse locale doit etre reconnue comme un PDF
      const url = URL.createObjectURL(pdf);
      blobUrl.current = url;
      setAdresse(url); setNom(r.data.nom_fichier || "document.pdf"); setLue(r.data.numero || numero || null); setTaille(pdf.size); setEtat("pret");
    })();
  }, [token, doc.id, numero]);

  return createPortal(
    <Fenetre titre={doc.titre} sousTitre={"PDF exact" + (lue ? " · version " + lue : "") + " · fabriqué par Word, le fichier n'est pas modifié"} fermer={fermer} largeur="1040px"
      pied={<button type="button" className="btn-primary" data-fermer-pdf onClick={fermer}>Fermer</button>}>
      {etat === "charge" && <p className="wf-petit" data-pdf-etat="charge">Chargement du PDF…</p>}
      {etat === "erreur" && <div className="login-error" data-erreur="pdf">{message}</div>}
      {etat === "pret" && (
        <>
          <div className="suj-lecture-barre" data-pdf-barre>
            <a className="btn-sm btn-primary suj-btn-lien" data-pdf-ouvrir href={adresse} target="_blank" rel="noopener">Ouvrir dans un onglet</a>
            <a className="btn-sm btn-gray-cancel suj-btn-lien" data-pdf-telecharger href={adresse} download={nom}>{"Télécharger le PDF" + (taille ? " (" + tailleLisible(taille) + ")" : "")}</a>
          </div>
          <iframe className="suj-pdf-cadre" data-pdf-cadre title={"PDF de " + doc.titre} src={adresse} />
          <p className="wf-aide" data-pdf-note>{"Ce PDF a la mise en page exacte du fichier Word. Sur téléphone, si rien ne s'affiche ici, touche « Ouvrir dans un onglet » ou « Télécharger le PDF »."}</p>
        </>
      )}
    </Fenetre>,
    document.body
  );
}
