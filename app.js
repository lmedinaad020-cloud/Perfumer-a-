// app.js
const supabase = window.supabaseClient;

document.addEventListener('DOMContentLoaded', async () => {
  // Verificar sesión existente en el navegador
  const { data: { session }, error } = await supabase.auth.getSession();

  if (session) {
    console.log('Sesión activa:', session.user);
    // Mostrar contenido protegido
  } else {
    console.log('No hay sesión activa');
    // Mostrar formulario de acceso
  }

  // Escuchar cambios de estado
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
      console.log('Usuario autenticado:', session?.user);
    } else if (event === 'SIGNED_OUT') {
      console.log('Sesión cerrada');
    }
  });
});