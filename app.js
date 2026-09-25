// Cambiar el nombre de la variable local para no colisionar con la librería global
const db = window.supabaseClient;

// A partir de aquí, usa 'db' para hacer tus llamadas a Supabase:
document.addEventListener('DOMContentLoaded', async () => {
  if (!db) {
    console.error("El cliente de Supabase no se ha cargado correctamente.");
    return;
  }

  const { data: { session } } = await db.auth.getSession();
  gestionarVistaSesion(session);
});

db.auth.onAuthStateChange((event, session) => {
  gestionarVistaSesion(session);
});
