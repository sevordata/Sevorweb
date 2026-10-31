# Receptor de entrevistas "Mirá" (Google Apps Script)

Guarda el video de cada entrevista en tu Google Drive (carpeta privada **SEVOR Data - Entrevistas Mirá**)
y te manda un email a contacto.sevor@gmail.com con el resumen, el link al video y el link de aprobación.
Es gratis y no usa claves. Se hace una sola vez, desde el celular (en Chrome, activá "Sitio de escritorio").

1. Entrá a https://script.google.com con tu cuenta de Google y tocá **Nuevo proyecto**.
2. Borrá lo que aparece y pegá todo el contenido de `tools/apps-script/Code.gs`. Ponele de nombre "SEVOR Mirá". Guardá (ícono de disquete).
3. Arriba elegí la función **setup** y tocá **▶ Ejecutar**. Google pide permisos: **Revisar permisos › tu cuenta › Configuración avanzada › Ir a SEVOR Mirá (no seguro) › Permitir**. (Es tu propio script; el aviso es normal.)
4. Tocá **Implementar › Nueva implementación**. En el engranaje elegí **Aplicación web**.
   - Descripción: Mirá
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier persona**
   Tocá **Implementar** y copiá la **URL de la aplicación web** (termina en `/exec`).
5. Pasale esa URL a Hark (o pegala en `assets/js/entrevista.js`, en `var UPLOAD_URL = "";`) y se publica.

Si después cambiás el código: **Implementar › Administrar implementaciones › ✏️ › Versión: Nueva versión › Implementar** (la URL no cambia).

Límites gratuitos de Google: 100 emails por día (cuentas Gmail) y 6 minutos por ejecución; cada parte del video es de 5 MB.
