// 1. Declarar la función de control de vista PRIMERO para evitar 'ReferenceError'
function gestionarVistaSesion(session) {
  const loginSection = document.getElementById('login-section');
  const appSection = document.getElementById('app-section');

  if (session) {
    if (loginSection) loginSection.style.display = 'none';
    if (appSection) appSection.style.display = 'block';
  } else {
    if (loginSection) loginSection.style.display = 'block';
    if (appSection) appSection.style.display = 'none';
  }
}

// 2. Ejecutar la lógica de autenticación cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', async () => {
  const client = window.supabaseClient;

  if (!client) {
    console.error("El cliente de Supabase no está cargado.");
    return;
  }

  // Comprobar la sesión actual
  const { data: { session } } = await client.auth.getSession();
  gestionarVistaSesion(session);

  // Escuchar cambios de estado (Login / Logout)
  client.auth.onAuthStateChange((_event, session) => {
    gestionarVistaSesion(session);
  });

  // Manejador del Formulario de Login
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;

      const { data, error } = await client.auth.signInWithPassword({
        email: email,
        password: password,
      });

      if (error) {
        alert('Error al iniciar sesión: ' + error.message);
      } else {
        gestionarVistaSesion(data.session);
      }
    });
  }

  // Manejador del botón Cerrar Sesión
  const btnLogout = document.getElementById('btn-logout');
  if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
      const { error } = await client.auth.signOut();
      if (error) {
        alert('Error al cerrar sesión: ' + error.message);
      } else {
        gestionarVistaSesion(null);
      }
    });
  }
});
