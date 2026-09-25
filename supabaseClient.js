const SUPABASE_URL = 'https://tu-id-proyecto.supabase.co';
const SUPABASE_ANON_KEY = 'tu-clave-anon-key-aqui';

window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: window.localStorage
  }
});
