import { createClient } from "@supabase/supabase-js";

const PROD_URL = "https://pvubfvcrbasepeoicoml.supabase.co";
const PROD_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB2dWJmdmNyYmFzZXBlb2ljb21sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5OTM0MTgsImV4cCI6MjEwMTU2OTQxOH0.JnqatPMcjwWTubkW_4v6xzibzZjTy2ll6bJ21KOMN5s";

const DEV_URL = "https://bhkvayehilbhsidpzevd.supabase.co";
const DEV_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJoa3ZheWVoaWxiaHNpZHB6ZXZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkwOTIzNTYsImV4cCI6MjEwNDY2ODM1Nn0.boBFhVMHYyIid3TEkpRYS7WHUEpXvwBFxU5Gqo82oAM";

// En mode "npm run dev" (test local), on utilise ERP_CAPV_DEV.
// En mode "npm run build" (production/capverp.com), on utilise ERP_CAPV.
const SUPABASE_URL = import.meta.env.DEV ? DEV_URL : PROD_URL;
const SUPABASE_ANON_KEY = import.meta.env.DEV ? DEV_ANON_KEY : PROD_ANON_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const EDGE_FUNCTION_URL = SUPABASE_URL + "/functions/v1/login";
export const MANAGE_USERS_URL = SUPABASE_URL + "/functions/v1/manage-users";
export { SUPABASE_ANON_KEY };

export function getAuthedClient(token) {
  // La securite d'acces est geree par notre logique applicative (roles/permissions),
  // pas par les policies RLS de Supabase (RLS desactive sur nos tables).
  // On utilise donc simplement la cle anon, ce qui evite les soucis de verification
  // de notre jeton personnalise par la passerelle Supabase (cle JWT).
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}