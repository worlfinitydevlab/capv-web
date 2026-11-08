import React from "react";
import ChoixListe from "./ChoixListe.jsx";
import { DEPARTEMENTS } from "../identifiantEleve.js";
import { COMMUNES, PAYS_FREQUENTS, fusionnerListe, cleParentSection } from "../geographie.js";

// Lieu de naissance : departement -> commune -> section communale (menus), lieu libre ; Diaspora : pays + ville.
//   form : champs departement_naissance, commune_naissance, section_communale, pays_naissance, lieu_naissance
//   setFields(objet) : met a jour plusieurs champs d'un coup ; listes : useListesReference() ; requis : etoiles (Inscription)
export default function LieuNaissance({ form, setFields, listes, requis }) {
  const dep = Number(form.departement_naissance) || 0;
  const diaspora = dep === 11;
  const communes = dep && !diaspora ? fusionnerListe(COMMUNES[dep] || [], listes.valeurs("commune", String(dep)), form.commune_naissance) : [];
  const parentSection = cleParentSection(dep, form.commune_naissance);
  const sections = dep && !diaspora && form.commune_naissance ? fusionnerListe([], listes.valeurs("section", parentSection), form.section_communale) : [];

  return (
    <div>
      <div className="form-row">
        <div className="form-group">
          <label>{"Département de naissance" + (requis ? " *" : "")}</label>
          <select value={form.departement_naissance || ""} data-champ="departement_naissance"
            onChange={(e) => setFields({ departement_naissance: e.target.value, commune_naissance: "", section_communale: "", pays_naissance: "" })}>
            <option value="">Choisir le département...</option>
            {DEPARTEMENTS.map((d) => <option key={d.code} value={String(d.code)}>{d.code + ". " + d.nom}</option>)}
          </select>
        </div>
        {diaspora ? (
          <div className="form-group">
            <label>{"Pays de naissance" + (requis ? " *" : "")}</label>
            <input list="pays-frequents" value={form.pays_naissance || ""} data-champ="pays_naissance" onChange={(e) => setFields({ pays_naissance: e.target.value })} placeholder="Ex. États-Unis" />
            <datalist id="pays-frequents">{PAYS_FREQUENTS.map((p) => <option key={p} value={p} />)}</datalist>
          </div>
        ) : (
          <ChoixListe label={"Commune de naissance"} requis={requis} nomChamp="commune_naissance" valeur={form.commune_naissance} options={communes}
            disabled={!dep} vide={dep ? "Choisir la commune..." : "Choisis d'abord le département"}
            onChange={(v) => setFields({ commune_naissance: v, section_communale: "" })}
            onAjouter={(t) => listes.ajouter("commune", String(dep), t, COMMUNES[dep] || [])} libelleAjout="Autre commune (ajouter)..." />
        )}
      </div>
      <div className="form-row">
        {!diaspora && (
          <ChoixListe label="Section communale" nomChamp="section_communale" valeur={form.section_communale} options={sections}
            disabled={!dep || !form.commune_naissance} vide={form.commune_naissance ? "Choisir la section..." : "Choisis d'abord la commune"}
            onChange={(v) => setFields({ section_communale: v })}
            onAjouter={(t) => listes.ajouter("section", parentSection, t, [])} libelleAjout="Autre section (ajouter)..."
            aide={form.commune_naissance && sections.length === 0 ? "Aucune section enregistrée pour cette commune : ajoute-la avec « Autre »." : ""} />
        )}
        <div className="form-group">
          <label>{diaspora ? "Ville de naissance" : "Lieu de naissance"}</label>
          <input value={form.lieu_naissance || ""} data-champ="lieu_naissance" onChange={(e) => setFields({ lieu_naissance: e.target.value })} placeholder={diaspora ? "Ex. Miami" : "Ex. quartier, hôpital..."} />
        </div>
      </div>
    </div>
  );
}
