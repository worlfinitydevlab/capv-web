import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://pvubfvcrbasepeoicoml.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB2dWJmdmNyYmFzZXBlb2ljb21sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5OTM0MTgsImV4cCI6MjEwMTU2OTQxOH0.JnqatPMcjwWTubkW_4v6xzibzZjTy2ll6bJ21KOMN5s";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const EDGE_FUNCTION_URL = SUPABASE_URL + "/functions/v1/login";
export const MANAGE_USERS_URL = SUPABASE_URL + "/functions/v1/manage-users";
export { SUPABASE_ANON_KEY };

export function getAuthedClient(token) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: "Bearer " + token } }
  });
}