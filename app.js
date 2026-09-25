const supabase = window.supabaseClient;

// 1. Función que controla qué interfaz mostrar
function evaluarEstadoSesion(session) {
  const loginSection = document.getElementById('login-section'); // Reemplaza con el ID de tu contenedor de Login
  const appSection = document.getElementById('app-section');     // Reemplaza con el ID de tu contenedor Principal

  if (session) {
    console.log('Sesión activa:', session.user);
    if (loginSection) loginSection.style.display = 'none';
    if (appSection) appSection.style.display = 'block';
  } else {
    console.log('Sin sesión activa');
    if (loginSection) loginSection.style.display = 'block';
    if (appSection) appSection.style.display = 'none';
  }
}

// 2. Comprobación síncrona/inmediata al cargar el DOM
document.addEventListener('DOMContentLoaded', async () => {
  // Consultar directamente el token guardado en localStorage
  const { data: { session } } = await supabase.auth.getSession();
  evaluarEstadoSesion(session);
});

// 3. Listener para eventos en tiempo real (Login / Logout)
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
    evaluarEstadoSesion(session);
  } else if (event === 'SIGNED_OUT') {
    evaluarEstadoSesion(null);
  }
});
