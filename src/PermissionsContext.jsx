import React, { createContext, useContext, useState, useEffect } from "react";
import { useAuth } from "./AuthContext.jsx";
import { getAuthedClient } from "./supabaseClient.js";

const PermissionsContext = createContext(null);

export function PermissionsProvider({ children }) {
  const { user, token } = useAuth();
  const [perms, setPerms] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!user || !token) { setPerms(null); return; }
    const load = async () => {
      const admin = user.role === "Administrateur";
      setIsAdmin(admin);
      if (admin) { setPerms({}); return; }
      const supabase = getAuthedClient(token);
      const { data: role } = await supabase.from("roles").select("id").eq("nom", user.role).maybeSingle();
      if (!role) { setPerms({}); return; }
      const { data: rolePerms } = await supabase.from("role_permissions").select("*").eq("role_uuid", role.id);
      const map = {};
      (rolePerms || []).forEach((p) => { map[p.module] = p; });
      setPerms(map);
    };
    load();
  }, [user, token]);

  const can = (moduleKey, action = "voir") => {
    if (isAdmin) return true;
    if (!perms || !perms[moduleKey]) return false;
    const fieldMap = { voir: "peut_voir", creer: "peut_creer", modifier: "peut_modifier", annuler: "peut_annuler" };
    return !!perms[moduleKey][fieldMap[action] || action];
  };

  return (
    <PermissionsContext.Provider value={{ perms, isAdmin, can, loaded: perms !== null }}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions() {
  return useContext(PermissionsContext);
}