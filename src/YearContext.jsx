import React, { createContext, useContext, useState, useEffect } from "react";
import { useAuth } from "./AuthContext.jsx";
import { getAuthedClient } from "./supabaseClient.js";

const YearContext = createContext(null);

export function YearProvider({ children }) {
  const { token } = useAuth();
  const [years, setYears] = useState([]);
  const [currentYear, setCurrentYear] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadYears = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const supabase = getAuthedClient(token);
      const { data, error } = await supabase.from("academic_years").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      setYears(data || []);
      setCurrentYear((prev) => {
        if (prev) {
          const stillThere = (data || []).find((y) => y.id === prev.id);
          if (stillThere) return stillThere;
        }
        const active = (data || []).find((y) => y.statut === "active");
        return active || (data && data[0]) || null;
      });
    } catch (e) {
      console.error("Erreur chargement annees", e);
    }
    setLoading(false);
  };

  useEffect(() => { loadYears(); }, [token]);

  return (
    <YearContext.Provider value={{ years, currentYear, setCurrentYear, reloadYears: loadYears, loading }}>
      {children}
    </YearContext.Provider>
  );
}

export function useYear() {
  return useContext(YearContext);
}