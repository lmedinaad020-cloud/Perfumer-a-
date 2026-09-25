// Reutilizar la instancia global definida en supabaseClient.js
const supabase = window.supabaseClient;

// Comprobar estado al cargar la página
document.addEventListener('DOMContentLoaded', async () => {
  // getSession recupera los tokens guardados en localStorage
  const { data: { session }, error } = await supabase.auth.getSession();

  if (session) {
    console.log('Sesión activa detectada:', session.user);
    // Ejecuta la función que muestra la vista de tu aplicación principal
    mostrarVistaPrincipal(session.user);
  } else {
    console.log('No hay sesión guardada.');
    // Muestra la pantalla de login/registro
    mostrarVistaLogin();
  }
});

// Asigna la función de cerrar sesión ÚNICAMENTE al botón de logout
const btnLogout = document.getElementById('btn-logout'); // Ajusta con el ID de tu botón
if (btnLogout) {
  btnLogout.addEventListener('click', async () => {
    await supabase.auth.signOut();
    window.location.reload();
  });
}
