# Tequeñería Delicias

Juego de puntos con autenticación, referidos, ranking, premios, códigos de canje, administración, PWA y APK Android.

## Supabase

1. Ejecuta `supabase/schema.sql` en SQL Editor.
2. En Authentication > Email desactiva la confirmación si quieres que el registro entre directamente.
3. Crea una cuenta normal y luego marca su perfil como administrador:
   ```sql
   update public.profiles set role='administracion' where email='admin@correo.com';
   ```
4. Crea el bucket `avatars`; el SQL ya lo crea como público.

La clave publicada del proyecto (`publishable key`) es válida para el frontend y reemplaza la clave `anon`. No agregues la `service_role` al repositorio.

## APK Android con GPS en segundo plano

El proyecto incluye Capacitor y `@capacitor-community/background-geolocation`. La APK carga la PWA publicada en GitHub Pages y activa un servicio Android de ubicación mientras el motorizado está en ON. Al cambiar a OFF o cerrar sesión, el watcher nativo se elimina.

Android muestra una notificación persistente mientras comparte la ubicación. Es necesario conceder ubicación precisa, ubicación mientras la app está en segundo plano y desactivar optimización de batería para esta aplicación si el fabricante lo solicita. La compilación automática está en `.github/workflows/android-apk.yml`; ejecuta **Build Android APK** desde GitHub Actions y descarga el artefacto `te-llevo-debug-apk` cuando termine.

Comandos locales opcionales:

```powershell
npm install
npx cap sync android
npx cap open android
```

PWA de gestión de pedidos para motorizados, aliados, soporte y administración. La aplicación es estática y se publica en GitHub Pages; Supabase proporciona autenticación, base de datos, RLS y actualizaciones en tiempo real.

## Configuración de Supabase

1. En el proyecto `ibclzcikkxhdnorcbfoe`, abre **SQL Editor** y ejecuta `supabase/schema.sql`. Vuelve a ejecutarlo para aplicar el rol aliado, la cola privada de pedidos, alarmas/tiempos y la ubicación de comercios; las ampliaciones están preparadas para ejecutarse de nuevo.
2. En **Authentication → Providers → Email**, desactiva **Confirm email** antes de registrar usuarios. La interfaz pide usuario y contraseña, no correo: internamente utiliza un alias técnico `usuario@users.te-llevo.local` para el proveedor de contraseña de Supabase.
3. Registra la cuenta que será la primera administradora. En SQL Editor, asígnale el rol:

   ```sql
   update public.profiles
   set role = 'administracion', approved = true
   where username = 'tu_usuario';
   ```

4. Inicia sesión como administración. Crea los aliados comerciales y su URL GPS en **Aliados**. En **Usuarios**, selecciona el rol y, para cuentas **Aliado**, el comercio asociado; pulsa **Guardar** para aplicar juntos el rol, la aprobación y el comercio. Las cuentas nuevas empiezan sin rol y sin acceso.
5. Revisa **Authentication → URL Configuration** y agrega la URL publicada en GitHub Pages a las URLs permitidas.

La URL del proyecto y la clave `anon`/publishable son públicas por diseño y están en `app.js`. La seguridad de los datos está en las políticas RLS y las funciones SQL. **No añadas nunca la `service_role` key al frontend ni al repositorio.**

## Publicar en GitHub Pages

El workflow `.github/workflows/deploy.yml` publica la raíz del repositorio al hacer push a `main`. En GitHub, abre **Settings → Pages** y selecciona **GitHub Actions** como origen. Usa este workflow para que cada despliegue marque el service worker con una versión única. Si publicas manualmente, cambia `BUILD_VERSION` en `sw.js` en cada publicación.

Para probar localmente, sirve esta carpeta con un servidor HTTP local; abrir `index.html` directamente como `file://` no permite instalar el service worker ni cargar correctamente los módulos.

## Funcionalidades incluidas

- Registro sin correo, inicio de sesión por usuario, aprobación y roles.
- Pedidos, asignaciones atómicas y estados con hora de llegada al comercio, salida y entrega.
- Disponibilidad de motorizados con heartbeat y conteo de actividad reciente.
- Monitoreo en mapa para soporte y administración, con ubicaciones GPS recientes de motorizados activos.
- Alertas para motorizados con el archivo de sonido de pedido incluido, y alarma de retraso con el archivo de alarma incluido; vibración opcional según soporte del dispositivo.
- Gestión de usuarios, suspensión/eliminación de acceso, aliados, métricas e historial.
- Reportes de entregas filtrables por fechas, motorizado y aliado, con exportación Excel XML `.xls` que conserva los filtros aplicados; métricas operativas diarias de entregas y tiempos de aceptación/entrega.
- Diseño adaptable, manifest y service worker instalable.

Los cambios de pedidos, disponibilidad y ubicaciones se reflejan mediante Supabase Realtime, con actualización periódica de respaldo mientras la sesión está abierta. En **Monitoreo**, soporte y administración ven un mapa de Leaflet/OpenStreetMap y las posiciones GPS recientes de motorizados activos; Leaflet y las teselas del mapa se cargan desde internet al abrir esa sección. Los motorizados deben activar **ON** y permitir acceso a la ubicación del navegador. La app envía una posición como máximo cada 15 segundos mientras esté en línea; al pasar a **OFF** o cerrar sesión, detiene el GPS y elimina la posición guardada. La base de datos solo permite leer posiciones recientes a soporte y administración; se ocultan posiciones de más de 90 segundos. La PWA intenta mantener el seguimiento activo mientras está abierta, solicita ubicaciones periódicamente e intenta mantener la pantalla encendida con Wake Lock cuando el navegador lo permite. Android puede suspenderla en segundo plano; el seguimiento continuo con la pantalla apagada o la app cerrada requiere una aplicación Android nativa con servicio de ubicación. Ejecuta nuevamente `supabase/schema.sql` para crear la tabla protegida de ubicaciones y habilitar Realtime antes de publicar esta función.

En **Motorizados activos**, soporte y administración ven si cada motorizado está disponible u ocupado y los pedidos que tiene asignados en curso. Un aliado solo ve sus pedidos; se crean en una cola privada hasta que soporte los libera o asigna. Soporte puede liberar o reasignar un pedido que aún no ha llegado al comercio; el plazo de 10 minutos continúa desde la asignación inicial y la comanda deja de estar asociada al motorizado anterior. Tras la llegada al comercio no se puede reasignar. Al iniciar sesión, a los motorizados se les muestra el botón destacado **Activar alertas** y a soporte/administración **Activar alarma**; deben pulsarlo para habilitar el audio en ese dispositivo. El primero reproduce `email-notification-message-ring.wav` para pedidos entrantes o asignados y vibra si el dispositivo lo permite. El segundo habilita `classic-danger-alarm.mp3` cuando un pedido supera los 10 minutos. No se usan notificaciones del sistema, evitando sus sonidos predeterminados. Los navegadores móviles exigen interacción del usuario para permitir audio; el botón no se puede activar automáticamente sin una acción, y el sitio no puede forzar sonido si el sistema está silenciado o la página quedó suspendida en segundo plano. Los dos archivos se incluyen y precargan con la PWA. El motorizado ve el 70% de ganancia con hasta dos decimales, puede copiar el teléfono, contactar por WhatsApp y abrir el GPS del comercio. El creador queda guardado como dato histórico en las comandas e informes.

## Actualizaciones automáticas instaladas

En cada despliegue de GitHub Actions se marca el service worker con el commit publicado y se precargan los archivos de esa versión evitando respuestas antiguas de la caché HTTP. Las PWA abiertas comprueban actualizaciones al cargarse, al volver a primer plano y cada 30 minutos. Cuando la nueva versión toma control, la página se recarga automáticamente; si soporte está escribiendo un pedido, espera a que lo envíe o salga del formulario antes de recargar. La actualización requiere conexión a internet y que GitHub Pages haya terminado el despliegue. El navegador puede tardar un poco en detectar un despliegue mientras la app está cerrada; al abrir o traer la PWA a primer plano vuelve a comprobarlo.

La PWA no bloquea las herramientas de desarrollo del navegador: eso no protege el código ni los datos, que deben protegerse en Supabase con Auth, RLS y validación de permisos. Las actualizaciones en segundo plano no reemplazan el formulario de creación mientras está abierto, para evitar perder lo que se está escribiendo.

Los motorizados deben pulsar **Activar alertas** al entrar a la PWA y soporte/administración **Activar alarma** para habilitar sus audios durante esa sesión. La vibración depende de que el navegador/dispositivo soporte la API y de los ajustes del teléfono. Estas alertas son de audio dentro de la PWA abierta y conectada; no se envían notificaciones del sistema ni avisos push con la app cerrada.
