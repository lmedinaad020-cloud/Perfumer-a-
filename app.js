// Usar la instancia inicializada en supabaseClient.js
const supabase = window.supabaseClient;

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Obtener la sesión activa guardada en el navegador
  const { data: { session }, error } = await supabase.auth.getSession();

  if (session) {
    // Si la sesión existe en localStorage, mantiene al usuario adentro
    console.log('Sesión activa encontrada:', session.user);
    mostrarPanelUsuario(session.user);
  } else {
    // Si no hay sesión, muestra el formulario de acceso
    console.log('No hay sesión activa.');
    mostrarFormularioLogin();
  }
});

// Listener para reaccionar a cambios de autenticación
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN') {
    mostrarPanelUsuario(session.user);
  } else if (event === 'SIGNED_OUT') {
    mostrarFormularioLogin();
  }
});
