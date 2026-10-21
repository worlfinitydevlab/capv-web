import React, { createContext, useContext, useState, useEffect } from "react";
import { useAuth } from "./AuthContext.jsx";
import { getAuthedClient } from "./supabaseClient.js";
import GardeInactivite from "./InactiviteGuard.jsx";

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
        try { localStorage.setItem("capv_web_idle_min", String(data.delai_inactivite_min === null || data.delai_inactivite_min === undefined ? 15 : data.delai_inactivite_min)); } catch (e) { /* ignore */ }
        setSettings({
          nom_etablissement: data.nom_etablissement || "",
          taux_usd_htg: data.taux_usd_htg || 0,
          logo: data.logo || "",
          modules_actifs: data.modules_actifs || "finance,pedagogie",
          qr_code: data.qr_code || "",
          adresse: data.adresse || "",
          telephone: data.telephone || "",
          email: data.email || "",
          format_recu: data.format_recu || "a5",
          format_recu_largeur_mm: data.format_recu_largeur_mm || 80,
          format_recu_hauteur_mm: data.format_recu_hauteur_mm || 150,
          format_documents: data.format_documents || "letter",
          format_documents_largeur_mm: data.format_documents_largeur_mm || "",
          format_documents_hauteur_mm: data.format_documents_hauteur_mm || "",
          delai_recu_heures: data.delai_recu_heures || 72,
          petite_caisse_plafond: data.petite_caisse_plafond || 0,
          decaissement_seuil_cheque: data.decaissement_seuil_cheque || 0,
          message_engine_config: data.message_engine_config || {},
          delai_inactivite_min: data.delai_inactivite_min === null || data.delai_inactivite_min === undefined ? 15 : data.delai_inactivite_min
        });
      }
    } catch (e) {}
  };

  useEffect(() => { loadSettings(); }, [token]);

  return (
    <SettingsContext.Provider value={{ settings, reloadSettings: loadSettings }}>
      {children}
      <GardeInactivite delaiMin={settings.delai_inactivite_min} />
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}