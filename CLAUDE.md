# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

"Torre de control": panel del contact center. Todo (código, UI, commits, mensajes al usuario) va en español rioplatense.
`LEEME.md` tiene la estructura y las reglas de negocio; `Arquitectura.md` (solo local, en `.gitignore`) es la especificación funcional: leerla antes de agregar algo.

## Reglas del usuario (obligatorias)

- **El repo es público (GitHub Pages).** No va ningún dato: ni nombres de agentes, internos, teléfonos, clientes, IDs de planillas, mails ni claves. Todo vive en la base y se carga desde Configuración. Antes de cada push, revisar `git diff --cached` buscando datos (también en comentarios de código y en `LEEME.md`).
- **No agregar funcionalidades, campos ni pasos** que no estén en `Arquitectura.md` o pedidos explícitamente. Ante dudas, preguntar.
- **Todo cambio termina publicado:** commit en español + push, y si cambió `backend/`, `clasp push` + actualizar la **misma** implementación. Nunca crear una implementación nueva (cambia la URL de la API).
- **Ningún dato cargado se puede perder.** No renombrar hojas ni columnas; las columnas nuevas van al final. Antes de una migración, sacar una foto de los datos por la API y compararla después.
- Mantener el diseño visual ("Órbita azul y verde", tokens en `css/base.css`).
- El usuario no ejecuta comandos: git, gh y clasp los corre Claude (ya autenticados en la cuenta del panel).
- Al dar instrucciones al usuario, nombrar exactamente la sección, el bloque, el botón, el archivo o la función.

## Comandos

No hay build, ni linter, ni suite de tests. Verificación:

```bash
# Sintaxis del frontend en el orden de carga (detecta también constantes globales duplicadas)
grep -o 'src="js/[^"]*"' index.html | sed 's/src="//;s/"//' | xargs cat > /tmp/front.js && node --check /tmp/front.js
# Sintaxis del backend (Apps Script comparte un único scope global entre los .gs)
cat backend/*.gs > /tmp/back.js && node --check /tmp/back.js
# Los módulos de lógica pura se prueban con Node (exportan con `if (typeof module !== 'undefined') module.exports = ...`)
node -e "const T=require('./js/tiempo-habil.js'); console.log(T.formatear(T.minutos('2026-11-04 20:16','2026-11-05 11:20',{dias:[1,2,3,4,5],desde:'10:00',hasta:'19:00'},[])))"
```

Publicación:

```bash
git add <archivos> && git commit && git push          # Pages se reconstruye solo (gh api repos/novedadesgrupofiancar/torre-de-control/pages/builds/latest)
clasp push --force                                     # rootDir = backend/ (.clasp.json está en .gitignore)
clasp update-deployment <ID de la URL en js/config.js> -d "descripción"
```

Para leer o escribir datos de la API desde la terminal, usar Node `fetch` con el cuerpo `{ action, claveAcceso, datos }`. **Nunca curl con JSON en Git Bash**: rompe tildes y ñ. La clave de acceso no se escribe en el repo.

## Arquitectura

- **Frontend** (`index.html`, `css/`, `js/`): HTML/CSS/JS puro, sin librerías ni bundler; los scripts se cargan en orden en `index.html` y comparten globales. `js/nucleo.js` tiene el ingreso con clave (localStorage), `api(accion, datos)`, el menú (`SECCIONES`), `Estado.config` y los helpers de UI (`campo`, `opcionesHtml`, `conBoton`, `aviso`, `botonesRegistro`, `eliminarRegistro`...). Cada sección es `Modulos.X = (() => { ... return { render }; })()` en `js/secciones/`; la lógica pura va aparte (`*-logica.js`, `metricas-respuesta.js`, `tiempo-habil.js`) para poder probarla con Node.
- **Backend** (`backend/*.gs`): web app de Apps Script que solo responde JSON. `Api.gs` valida la clave (Propiedades del script `CLAVE_ACCESO`) y despacha según el mapa `ACCIONES`: cada acción nueva se registra ahí. POST con `Content-Type: text/plain` para evitar el preflight de CORS.
- **Base** (`Base.gs`): planilla de Google Sheets, una hoja por entidad, definidas en `HOJAS`. Todas las celdas en formato texto; fechas como `aaaa-mm-dd hh:mm[:ss]`, zona America/Montevideo. Al agregar hojas o columnas, subir `VERSION_BASE`: `inicializarBase_` crea las hojas que faltan y `asegurarColumnas_` agrega al final las columnas que faltan.
- **Nada se sobrescribe:** los registros se agregan con `agregarFilas_`. Editar y eliminar (Asistencia, Redes, Taller, WhatsApp) usa `reemplazarRegistros_`: marca la fila vieja en `estado_registro` (Reemplazado/Eliminado) + `modificado_en`, y agrega la versión nueva con `reemplaza_a` y la `registrado_en` original. `leerFilas_` oculta las filas marcadas salvo que se pase `conHistorial`. La configuración también es append-only: por cada clave vale la fila más reciente.
- **Procesamiento en el navegador:** los CSV de 3CX, el cruce con 3CX, los .xlsx (`js/xlsx.js`, zip sin compresión) y el cifrado de Credenciales (AES-GCM + PBKDF2; la clave de esa sección no se guarda en ningún lado) se hacen del lado del cliente; al backend solo llega el resultado.
- **Servicios avanzados** (`appsscript.json`): Drive v3 (las planillas de campaña son .xlsx: se leen convirtiéndolas a una copia temporal) y Gmail v1 de solo lectura (reportes diarios de 3CX que llegan por mail; los adjuntos vienen en base64 web-safe sin relleno: usar `decodificarAdjunto_`). La foto semanal de campañas corre con un activador de tiempo (`instalarActivadorFoto`).
- **Tiempo hábil:** hay una sola función, `TiempoHabil.minutos` en `js/tiempo-habil.js`, que usa el horario de atención y los feriados de Configuración. Reutilizarla y no duplicarla.
