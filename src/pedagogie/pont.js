// Relie le moteur de la pedagogie aux contextes de l'application (session, permissions).
import { useMemo } from "react";
import { useAuth } from "../AuthContext.jsx";
import { usePermissions as usePermissionsHook } from "../PermissionsContext.jsx";
import { getAuthedClient } from "../supabaseClient.js";
import { brancher } from "./shim.js";

export function usePontPedagogie() {
  const auth = useAuth();
  const p = usePermissionsHook();
  const can = typeof p === "function" ? p : p && p.can;
  const jeton = auth && auth.token;
  const supabase = useMemo(() => getAuthedClient(jeton), [jeton]);
  brancher({
    supabase,
    utilisateur: () => (auth && auth.user) || null,
    peut: (module, action) => (can ? !!can(module, action) : false)
  });
  return (auth && auth.user) || null;
}
