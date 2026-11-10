import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { appeler } from "./sujetsApi.js";
import { Fenetre } from "../pedagogie/Fenetre.jsx";
import { telechargerFichier } from "./fichiersApi.js";

// Lecture d'un fichier Word DANS le site, sans Word : le fichier est charge par une adresse signee (60 s, comme un telechargement, mais notee
// « lecture » dans l'historique), puis affiche par le navigateur (bibliotheque docx-preview, chargee seulement a la premiere lecture).
// Le fichier n'est jamais modifie ici. Le rendu est une APPROXIMATION fidele du texte, des tableaux, des images et des couleurs ;
// la mise en page exacte (numeros de page, coupures de page, tabulations) n'est garantie que dans Word.

const OPTIONS = {
  className: "docx", inWrapper: true, ignoreWidth: false, ignoreHeight: false, ignoreFonts: false, breakPages: true, ignoreLastRenderedPageBreak: true,
  renderHeaders: true, renderFooters: true, renderFootnotes: true, renderEndnotes: true, renderComments: false, renderChanges: false, renderAltChunks: false,
  trimXmlDeclaration: true, useBase64URL: true, experimental: false
};
// habillage ecran (dans le « shadow DOM » : rien ne fuit entre le site et le document affiche)
const CSS_ECRAN = ":host { display: block; } .docx-wrapper { background: transparent !important; padding: 0 !important; } .docx-wrapper > section.docx { margin: 0 auto 16px !important; box-shadow: 0 2px 10px rgba(15, 23, 42, 0.28) !important; } .docx { color: #000; }";
// impression / PDF : les marges de la page du document deviennent les marges de la feuille, plus d'ombre ni de fond gris
const CSS_IMPRESSION = "html, body { margin: 0; padding: 0; background: #fff; } .docx-wrapper { background: none !important; padding: 0 !important; display: block !important; } "
  + ".docx-wrapper > section.docx { box-shadow: none !important; margin: 0 !important; padding: 0 !important; width: auto !important; min-height: 0 !important; break-after: page; page-break-after: always; } "
  + ".docx-wrapper > section.docx:last-of-type { break-after: auto; page-break-after: auto; } * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }";

const pt = (v) => { const m = /^(-?\d+(?:\.\d+)?)pt$/.exec(String(v || "").trim()); return m ? parseFloat(m[1]) : null; };

// Ouvre la fenetre d'impression du navigateur sur une copie propre du document (on y choisit « Enregistrer au format PDF »).
function imprimerRendu(racine, titre) {
  const section = racine.querySelector("section.docx");
  const styles = Array.from(racine.querySelectorAll("[data-styles] style")).map((s) => s.textContent).join("\n");
  const rendu = racine.querySelector("[data-rendu]");
  let page = "";
  if (section) {
    const l = pt(section.style.width), h = pt(section.style.minHeight);
    const hautPt = pt(section.style.paddingTop), droitePt = pt(section.style.paddingRight), basPt = pt(section.style.paddingBottom), gauchePt = pt(section.style.paddingLeft);
    const marges = [hautPt, droitePt, basPt, gauchePt !== null ? gauchePt : droitePt].map((x) => (x === null ? 40 : x) + "pt").join(" ");
    page = "@page { " + (l && h ? "size: " + l + "pt " + h + "pt; " : "") + "margin: " + marges + "; }";
  }
  const cadre = document.createElement("iframe");
  cadre.setAttribute("data-impression", "1");
  cadre.setAttribute("aria-hidden", "true");
  cadre.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(cadre);
  const d = cadre.contentDocument;
  d.open();
  d.write("<!doctype html><html><head><meta charset=\"utf-8\"><title></title><style>" + styles + "</style><style>" + page + CSS_IMPRESSION + "</style></head><body></body></html>");
  d.close();
  d.title = String(titre || "Document");
  d.body.innerHTML = rendu ? rendu.innerHTML : "";
  const lancer = () => { try { cadre.contentWindow.focus(); cadre.contentWindow.print(); } catch (e) { /* le navigateur refuse : l'utilisateur peut telecharger le fichier */ } };
  setTimeout(lancer, 250);
  setTimeout(() => { if (cadre.parentNode) cadre.parentNode.removeChild(cadre); }, 120000);
  return cadre;
}

export function LectureWord({ token, doc, numero, fermer }) {
  const hote = useRef(null);
  const zone = useRef(null);
  const naturelle = useRef(0);                      // largeur naturelle de la page (px), mesuree avant tout zoom
  const [etat, setEtat] = useState("charge");       // charge | pret | erreur
  const [message, setMessage] = useState("");
  const [lue, setLue] = useState(null);             // numero de la version affichee
  const [zoom, setZoom] = useState(1);
  const [ajuste, setAjuste] = useState(1);
  const [info, setInfo] = useState("");

  const vivant = useRef(true);
  const deja = useRef(null);
  useEffect(() => { vivant.current = true; return () => { vivant.current = false; }; }, []);
  useEffect(() => {
    // une seule lecture par ouverture (le mode developpement de React rejoue les effets : sans ce garde-fou, la lecture serait notee deux fois dans l'historique)
    const cle = doc.id + "|" + (numero || "");
    if (deja.current === cle) return;
    deja.current = cle;
    (async () => {
      const r = await appeler(token, "telecharger", numero ? { document_id: doc.id, numero, usage: "lecture" } : { document_id: doc.id, usage: "lecture" });
      if (!vivant.current) return;
      if (!r.ok) { setEtat("erreur"); setMessage(r.error); return; }
      let donnees;
      try {
        const rep = await fetch(r.data.url);
        if (!rep.ok) throw new Error("http " + rep.status);
        donnees = await rep.blob();
      } catch (e) {
        if (vivant.current) { setEtat("erreur"); setMessage("Le fichier n'a pas pu être chargé pour la lecture. Vérifie ta connexion, ou télécharge-le pour l'ouvrir dans Word."); }
        return;
      }
      if (!vivant.current) return;
      try {
        const lib = await import("docx-preview");
        if (!vivant.current || !hote.current) return;
        const racine = hote.current.shadowRoot || hote.current.attachShadow({ mode: "open" });
        while (racine.firstChild) racine.removeChild(racine.firstChild);
        const base = document.createElement("style"); base.textContent = CSS_ECRAN;
        const styles = document.createElement("div"); styles.setAttribute("data-styles", "1");
        const rendu = document.createElement("div"); rendu.setAttribute("data-rendu", "1");
        racine.appendChild(base); racine.appendChild(styles); racine.appendChild(rendu);
        await lib.renderAsync(donnees, rendu, styles, OPTIONS);
        if (!vivant.current) return;
        const premiere = rendu.querySelector("section.docx");
        const largeurPt = premiere ? pt(premiere.style.width) : null;   // largeur de la page lue dans son style (pt -> px)
        naturelle.current = largeurPt ? largeurPt * 96 / 72 : (premiere ? premiere.offsetWidth : 0);
        setLue(r.data.numero || numero || null);
        setEtat("pret");
      } catch (e) {
        if (vivant.current) { setEtat("erreur"); setMessage("Ce fichier ne peut pas être affiché dans le site. Télécharge-le pour l'ouvrir dans Word."); }
      }
    })();
  }, [token, doc.id, numero]);

  // ajuste la page a la largeur disponible (telephone compris), puis applique le zoom choisi
  const mesurer = useCallback(() => {
    const z = zone.current;
    if (!z || !naturelle.current) return;
    setAjuste(Math.max(0.2, Math.min(1, (z.clientWidth - 24) / naturelle.current)));
  }, []);
  useEffect(() => {
    if (etat !== "pret") return undefined;
    mesurer();
    const z = zone.current;
    let ro = null;
    if (z && typeof ResizeObserver !== "undefined") { ro = new ResizeObserver(mesurer); ro.observe(z); }
    window.addEventListener("resize", mesurer);
    return () => { if (ro) ro.disconnect(); window.removeEventListener("resize", mesurer); };
  }, [etat, mesurer]);
  useEffect(() => {
    const racine = hote.current && hote.current.shadowRoot;
    const rendu = racine && racine.querySelector("[data-rendu]");
    if (rendu) rendu.style.zoom = String(ajuste * zoom);
  }, [ajuste, zoom, etat]);

  const imprimer = () => {
    setInfo("");
    const racine = hote.current && hote.current.shadowRoot;
    if (!racine) return;
    imprimerRendu(racine, doc.titre + (lue ? " - v" + lue : ""));
    setInfo("La fenêtre d'impression s'ouvre : choisis « Enregistrer au format PDF » pour garder un PDF, ou ton imprimante pour imprimer.");
  };
  const telecharger = async () => {
    setInfo("");
    const r = await telechargerFichier(token, doc.id, numero);
    if (!r.ok) setInfo(r.error);
  };

  const pourcent = Math.round(ajuste * zoom * 100);
  return createPortal(
    <Fenetre titre={doc.titre} sousTitre={"Lecture" + (lue ? " · version " + lue : "") + " · le fichier n'est pas modifié"} fermer={fermer} largeur="1040px"
      pied={<button type="button" className="btn-primary" data-fermer-lecture onClick={fermer}>Fermer</button>}>
      {etat === "charge" && <p className="wf-petit" data-lecture-etat="charge">Chargement du document…</p>}
      {etat === "erreur" && (
        <div data-lecture-etat="erreur">
          <div className="login-error" data-erreur="lecture" style={{ marginBottom: "12px" }}>{message}</div>
          <div className="suj-rangee"><button type="button" className="btn-gray-cancel" data-lecture-telecharger onClick={telecharger}>Télécharger le fichier Word</button></div>
        </div>
      )}
      {etat === "pret" && (
        <div className="suj-lecture-barre" data-lecture-barre>
          <button type="button" className="btn-sm btn-gray-cancel" data-zoom="moins" aria-label="Réduire" disabled={zoom <= 0.6} onClick={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.1) * 10) / 10))}>{"−"}</button>
          <span className="suj-lecture-zoom" data-zoom-valeur>{pourcent + " %"}</span>
          <button type="button" className="btn-sm btn-gray-cancel" data-zoom="plus" aria-label="Agrandir" disabled={zoom >= 2.4} onClick={() => setZoom((z) => Math.min(2.5, Math.round((z + 0.1) * 10) / 10))}>+</button>
          <button type="button" className="btn-sm btn-gray-cancel" data-zoom="ajuster" onClick={() => setZoom(1)}>Ajuster à l'écran</button>
          <span className="suj-lecture-espace" />
          <button type="button" className="btn-sm btn-primary" data-lecture-imprimer onClick={imprimer}>Imprimer / PDF</button>
          <button type="button" className="btn-sm btn-gray-cancel" data-lecture-telecharger onClick={telecharger}>Télécharger le .docx</button>
        </div>
      )}
      {info && <div className="suj-ok" data-info="lecture">{info}</div>}
      <div ref={zone} className="suj-lecture-zone" data-lecture-zone hidden={etat === "erreur"} style={{ visibility: etat === "pret" ? "visible" : "hidden" }}>
        <div ref={hote} data-lecture-hote />
      </div>
      {etat === "pret" && <p className="wf-aide" data-lecture-note>{"Affichage de lecture : le texte, les tableaux, les images et les couleurs sont fidèles ; les numéros de page, les tabulations et les coupures de page peuvent différer de Word."}</p>}
    </Fenetre>,
    document.body
  );
}
