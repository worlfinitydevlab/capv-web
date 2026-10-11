import React, { createContext, useContext, useState, useEffect } from "react";
import { EDGE_FUNCTION_URL, SUPABASE_ANON_KEY } from "./supabaseClient.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedToken = localStorage.getItem("capv_web_token");
    const savedUser = localStorage.getItem("capv_web_user");
    let perime = false;
    try {
      const dernier = Number(localStorage.getItem("capv_web_last_activity") || 0);
      const brut = localStorage.getItem("capv_web_idle_min");
      const minutes = brut !== null && Number.isFinite(Number(brut)) && Number(brut) >= 0 ? Number(brut) : 15;
      if (minutes > 0 && (!dernier || Date.now() - dernier > minutes * 60000)) perime = true;
    } catch (e) { /* ignore */ }
    if (perime) {
      localStorage.removeItem("capv_web_token");
      localStorage.removeItem("capv_web_user");
    } else if (savedToken && savedUser) {
      setToken(savedToken);
      setUser(JSON.parse(savedUser));
    }
    setLoading(false);
  }, []);

  const login = async (username, password) => {
    const r = await fetch(EDGE_FUNCTION_URL, {
      method: "POST",
      headers: { "apikey": SUPABASE_ANON_KEY, "Authorization": "Bearer " + SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || "Erreur de connexion");
    setToken(d.token);
    setUser(d.user);
    localStorage.setItem("capv_web_token", d.token);
    localStorage.setItem("capv_web_user", JSON.stringify(d.user));
    try { localStorage.setItem("capv_web_last_activity", String(Date.now())); } catch (e) { /* ignore */ }
    return d.user;
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem("capv_web_token");
    localStorage.removeItem("capv_web_user");
    try { localStorage.removeItem("capv_web_last_activity"); } catch (e) { /* ignore */ }
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}