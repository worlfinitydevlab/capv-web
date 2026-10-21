// Sous-matieres : une matiere d'une classe peut etre divisee en sous-matieres (ex. Comm. francais /300 = Grammaire + Lecture + ...).
// Elles servent a la saisie et au palmares ; le bulletin de l'eleve ne montre que le total de la matiere.
// Regles : la somme des maximums des sous-matieres = le coefficient (note maximale) de la matiere ; au moins 2 sous-matieres ;
// une note de sous-matiere est une evaluation "controle" rattachee a sa sous-matiere (evaluations.part_uuid).
const V = { isNull: ["deleted_at"] };

export const MESSAGE_SQL = "Les sous-matieres ne sont pas encore installees sur cette base de donnees (le script sous-matieres-schema.sql n'a pas ete lance).";
export const tableAbsente = (e) => /class_subject_parts|schema cache|PGRST205|42P01|part_uuid/i.test(String((e && e.message) || e));

const cents = (v) => Math.round(Number(v) * 100);
export const sommeParts = (parts) => (parts || []).reduce((s, p) => s + cents(p.maximum), 0) / 100;

// sous-matieres actives, par affectation : { <class_subject_id>: [ { id, nom, maximum, ordre } ] }, triees
// (une base sans la table des sous-matieres donne un resultat vide : tout fonctionne comme avant)
export async function lirePartsActives(store, csIds) {
  const ids = [...new Set((csIds || []).filter(Boolean))];
  if (!ids.length) return {};
  let rows;
  try { rows = await store.lire("class_subject_parts", { in: { class_subject_uuid: ids }, ...V }); }
  catch (e) { if (tableAbsente(e)) return {}; throw e; }
  const par = {};
  rows.sort((a, b) => (Number(a.ordre) || 0) - (Number(b.ordre) || 0) || String(a.nom || "").localeCompare(String(b.nom || ""), "fr", { sensitivity: "base" }));
  for (const r of rows) (par[r.class_subject_uuid] = par[r.class_subject_uuid] || []).push({ id: r.id, nom: r.nom, maximum: Number(r.maximum), ordre: Number(r.ordre) || 0 });
  return par;
}

// meme liste de sous-matieres (noms et maximums, dans l'ordre) ?
export function memesParts(a, b) {
  a = a || []; b = b || [];
  if (a.length !== b.length) return false;
  return a.every((p, i) => String(p.nom).trim().toLowerCase() === String(b[i].nom).trim().toLowerCase() && cents(p.maximum) === cents(b[i].maximum));
}
