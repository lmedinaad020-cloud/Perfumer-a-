// Usar la instancia global
const supabase = window.supabaseClient;

// Función para cambiar de vista según el estado de la sesión
function gestionarVistaSesion(session) {
  const loginView = document.getElementById('login-section'); // Cambiar por el ID de tu vista login
  const mainView = document.getElementById('app-section');     // Cambiar por el ID de tu vista principal

  if (session) {
    console.log("Sesión activa recuperada de localStorage:", session.user.email);
    if (loginView) loginView.style.display = 'none';
    if (mainView) mainView.style.display = 'block';
  } else {
    console.log("No hay sesión guardada.");
    if (loginView) loginView.style.display = 'block';
    if (mainView) mainView.style.display = 'none';
  }
}

// Comprobar la sesión al recargar la página (F5)
document.addEventListener('DOMContentLoaded', async () => {
  if (!supabase) {
    console.error("El cliente de Supabase no se cargó correctamente.");
    return;
  }
  const { data: { session } } = await supabase.auth.getSession();
  gestionarVistaSesion(session);
});

// Listener para cambios de estado en tiempo real (Login / Logout)
supabase.auth.onAuthStateChange((event, session) => {
  gestionarVistaSesion(session);
});
