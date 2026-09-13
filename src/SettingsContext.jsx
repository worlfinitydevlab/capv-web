import React, { createContext, useContext, useState, useEffect } from "react";
import { useAuth } from "./AuthContext.jsx";
import { getAuthedClient } from "./supabaseClient.js";

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const { token } = useAuth();
  const [settings, setSettings] = useState({});

  const loadSettings = async () => {
    if (!token) return;
    try {
      const supabase = getAuthedClient(token);
      const { data } = await supabase.from("institution_settings").select("*").eq("id", 1).maybeSingle();
      if (data) {
        setSettings({
          nom_etablissement: data.nom_etablissement || "",
          taux_usd_htg: data.taux_usd_htg || 0,
          logo: data.logo || "",
          qr_code: data.qr_code || "",
          adresse: data.adresse || "",
          telephone: data.telephone || "",
          email: data.email || "",
          format_recu: data.format_recu || "a5",
          format_recu_largeur_mm: data.format_recu_largeur_mm || 80,
          format_recu_hauteur_mm: data.format_recu_hauteur_mm || 150,
          delai_recu_heures: data.delai_recu_heures || 72,
          petite_caisse_plafond: data.petite_caisse_plafond || 0,
          decaissement_seuil_cheque: data.decaissement_seuil_cheque || 0,
          message_engine_config: data.message_engine_config || {}
        });
      }
    } catch (e) {}
  };

  useEffect(() => { loadSettings(); }, [token]);

  return (
    <SettingsContext.Provider value={{ settings, reloadSettings: loadSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}