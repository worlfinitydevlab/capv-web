// Noms des classes de l'ecole dans l'ordre defini dans Regles academiques (du plus bas au plus haut).
// Les classes qui existent dans la base mais ne sont pas dans cet ordre sont ajoutees a la fin, par ordre alphabetique.
import { lireTout, bas } from "./classeProposee.js";

export function fusionnerOrdreClasses(ordre, existants) {
  const vus = new Set();
  const sortie = [];
  for (const n of Array.isArray(ordre) ? ordre : []) {
    const nom = String(n == null ? "" : n).replace(/\s+/g, " ").trim();
    if (nom && !vus.has(bas(nom))) { vus.add(bas(nom)); sortie.push(nom); }
  }
  const autres = [];
  for (const n of existants || []) {
    const nom = String(n == null ? "" : n).replace(/\s+/g, " ").trim();
    if (nom && !vus.has(bas(nom))) { vus.add(bas(nom)); autres.push(nom); }
  }
  autres.sort((a, b) => a.localeCompare(b, "fr", { numeric: true, sensitivity: "base" }));
  return sortie.concat(autres);
}

// Lecture seule ; une source illisible donne simplement une liste plus courte (le formulaire reste utilisable)
export async function chargerNomsClasses(supabase) {
  let ordre = [];
  try {
    const { data } = await supabase.from("pedagogie_reglages").select("valeur").eq("cle", "ordre_classes").is("deleted_at", null).limit(1);
    ordre = JSON.parse((data && data[0] && data[0].valeur) || "[]");
  } catch (e) { ordre = []; }
  let existants = [];
  try {
    const lignes = await lireTout((a, b) => supabase.from("classes").select("nom").is("deleted_at", null).order("id").range(a, b));
    existants = lignes.map((x) => x.nom);
  } catch (e) { existants = []; }
  return fusionnerOrdreClasses(ordre, existants);
}

// Rang d'une classe dans l'ordre de l'ecole (1 = la plus basse) ; 0 si elle n'y est pas
export function rangClasse(noms, nom) {
  const i = (noms || []).findIndex((n) => bas(n) === bas(nom));
  return i + 1;
}
