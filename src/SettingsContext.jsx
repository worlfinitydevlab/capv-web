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
          logo: data.logo || ""
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