import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL=https://qxwdaayvlfwkxzujkjyk.supabase.co;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4d2RhYXl2bGZ3a3h6dWpranlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5ODE2MjEsImV4cCI6MjA4NjU1NzYyMX0.ACkvwgtmwYYCVhG7Ao6yzQ-wovn7nshbGubFKr-ffEc;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true, // <-- THIS is the big one for magic links
  },
});
