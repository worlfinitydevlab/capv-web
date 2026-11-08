// Listes apprises au fil des inscriptions (table listes_reference) : communes ajoutees, sections communales, ecoles precedentes.
// Une valeur ajoutee une fois est proposee a tout le monde ensuite. Comparaison sans accents ni majuscules ni tirets :
// "Pétion Ville" et "petion-ville" ne creent jamais deux entrees.
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "./AuthContext.jsx";
import { getAuthedClient } from "./supabaseClient.js";
import { cleListe, nettoyerValeur } from "./geographie.js";
import { installationIncomplete } from "./identifiantEleve.js";

const PAGE = 1000;

export const MESSAGE_SQL_ABSENT = "La liste partagée n'est pas encore installée sur cette base (script SQL « identifiant-eleve.sql »).";

export function useListesReference() {
  const { token, user } = useAuth();
  const [lignes, setLignes] = useState([]);
  const [absente, setAbsente] = useState(false);
  const [chargee, setChargee] = useState(false);

  const recharger = useCallback(async () => {
    try {
      const supabase = getAuthedClient(token);
      let tout = [];
      for (let debut = 0; ; debut += PAGE) {
        const { data, error } = await supabase.from("listes_reference").select("id, liste, parent, valeur").is("deleted_at", null).order("id").range(debut, debut + PAGE - 1);
        if (error) { if (installationIncomplete(error)) setAbsente(true); setChargee(true); return; }
        tout = tout.concat(data || []);
        if (!data || data.length < PAGE) break;
      }
      setLignes(tout);
      setAbsente(false);
    } catch (e) { /* liste vide : le formulaire reste utilisable avec les valeurs de depart */ }
    setChargee(true);
  }, [token]);

  useEffect(() => { recharger(); }, [recharger]);

  const valeurs = useCallback((liste, parent) => lignes.filter((x) => x.liste === liste && x.parent === (parent || "")).map((x) => x.valeur), [lignes]);

  // Ajoute une valeur (ou renvoie celle qui existe deja) ; `connues` = valeurs de depart de la liste (communes d'un departement)
  const ajouter = useCallback(async (liste, parent, valeur, connues) => {
    const v = nettoyerValeur(valeur);
    if (!v) throw new Error("Écris le nom à ajouter.");
    if (v.length > 120) throw new Error("Le nom est trop long.");
    const k = cleListe(v);
    if (!k) throw new Error("Le nom doit contenir des lettres ou des chiffres.");
    const connue = (connues || []).find((c) => cleListe(c) === k);
    if (connue) return connue;
    const p = parent || "";
    const existante = lignes.find((x) => x.liste === liste && x.parent === p && cleListe(x.valeur) === k);
    if (existante) return existante.valeur;
    const supabase = getAuthedClient(token);
    const { data, error } = await supabase.from("listes_reference").insert({ liste, parent: p, valeur: v, modified_by: user ? user.username : null }).select("id, liste, parent, valeur").single();
    if (error) {
      if (installationIncomplete(error)) { setAbsente(true); throw new Error(MESSAGE_SQL_ABSENT); }
      if (error.code === "23505") {   // quelqu'un vient de l'ajouter (orthographe identique)
        await recharger();
        return v;
      }
      throw error;
    }
    setLignes((l) => l.concat([data]));
    return v;
  }, [lignes, token, user, recharger]);

  return { chargee, absente, lignes, valeurs, ajouter, recharger };
}
