import React, { createContext, useContext, useState, useEffect } from "react";
import { useAuth } from "./AuthContext.jsx";
import { getAuthedClient } from "./supabaseClient.js";
import { CHAMP } from "./permissionsCatalog.js";

const PermissionsContext = createContext(null);

// Comptes qui n'ont pas de ligne dans role_permissions : le Super Admin (compte Worlfinity) ne voit que les tableaux de bord.
const SUPER_ADMIN = {
  dashboard_finance: { peut_voir: 1 },
  dashboard_pedagogie: { peut_voir: 1 },
  dashboard_discipline: { peut_voir: 1 }
};

export function PermissionsProvider({ children }) {
  const { user, token } = useAuth();
  const [perms, setPerms] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!user || !token) { setPerms(null); return; }
    let annule = false;
    const load = async () => {
      if (user.role === "Super Admin") { setIsAdmin(false); setPerms(SUPER_ADMIN); return; }
      const admin = user.role === "Administrateur";
      setIsAdmin(admin);
      if (admin) { setPerms({}); return; }
      try {
        const supabase = getAuthedClient(token);
        const { data: role } = await supabase.from("roles").select("id").eq("nom", user.role).maybeSingle();
        if (!role) { if (!annule) setPerms({}); return; }
        const { data: rolePerms } = await supabase.from("role_permissions").select("*").eq("role_uuid", role.id);
        const map = {};
        (rolePerms || []).forEach((p) => { map[p.module] = p; });
        if (!annule) setPerms(map);
      } catch (e) {
        if (!annule) setPerms({});
      }
    };
    load();
    return () => { annule = true; };
  }, [user, token]);

  const can = (moduleKey, action = "voir") => {
    if (isAdmin) return true;
    if (!perms || !perms[moduleKey]) return false;
    return !!perms[moduleKey][CHAMP[action] || action];
  };

  // Les quatre droits d'un module d'un coup : const d = droit("class_fees"); d.creer ...
  const droit = (moduleKey) => ({
    voir: can(moduleKey, "voir"),
    creer: can(moduleKey, "creer"),
    modifier: can(moduleKey, "modifier"),
    annuler: can(moduleKey, "annuler")
  });

  return (
    <PermissionsContext.Provider value={{ perms, isAdmin, can, droit, loaded: perms !== null }}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions() {
  return useContext(PermissionsContext);
}

// Raccourci : const d = useDroit("classes"); d.voir, d.creer, d.modifier, d.annuler
export function useDroit(moduleKey) {
  const p = useContext(PermissionsContext);
  if (!p) return { voir: false, creer: false, modifier: false, annuler: false };
  return p.droit(moduleKey);
}
