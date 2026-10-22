# Torre de control

Panel de control del contact center.

- **Frontend:** este repositorio, publicado con GitHub Pages → https://novedadesgrupofiancar.github.io/torre-de-control/
- **Backend:** Google Apps Script publicado como web app, que funciona solo como API JSON (código en `backend/`).
- **Base de datos:** planilla de Google Sheets "Torre de control – Base" y carpeta de Drive "Torre de control – Capturas", en la cuenta de Google del panel.

La especificación funcional (`Arquitectura.md`) queda solo en la carpeta local: tiene datos del equipo y no se sube.

## Seguridad

- El sitio es público, pero **no tiene datos**: todo vive en Sheets y la API solo responde a quien manda la clave de acceso correcta.
- La clave se guarda en **Propiedades del script** (`CLAVE_ACCESO`), nunca en el código.
- La primera vez, el panel pide la clave y la guarda en el navegador (localStorage). Si la clave cambia o es inválida, vuelve a la pantalla de ingreso.
- **Cambiar la clave:** en el proyecto de Apps Script → Configuración del proyecto (engranaje) → Propiedades del script → editar `CLAVE_ACCESO` (mínimo 24 caracteres). Después se ingresa la clave nueva en el panel.
- No van al repositorio: credenciales de clasp (`.clasprc.json`, `.clasp.json`), CSV/Excel de prueba, la carpeta `ejemplos/` ni `Arquitectura.md` (ver `.gitignore`).

## Estructura

```
torre-de-control/
├── index.html                 página única: pantalla de ingreso + panel
├── css/
│   ├── base.css               estilo "Órbita azul y verde": tokens, layout, componentes
│   └── secciones/             estilos propios de cada sección
├── js/
│   ├── config.js              URL de la API (web app de Apps Script)
│   ├── nucleo.js              ingreso con clave, llamadas a la API, menú, utilidades
│   └── secciones/             una vista por sección: asistencia, issues, redes, taller,
│                              whatsapp, recordatorios, reportes, configuracion
└── backend/                   Google Apps Script (se sube con clasp)
    ├── appsscript.json        manifiesto: zona horaria, permisos, web app
    ├── Api.gs                 doPost/doGet, control de la clave, lista de acciones
    ├── Base.gs                planilla base, hojas, lectura/escritura, Excel, fechas
    ├── Configuracion.gs       agentes, horarios, campañas, listas, palabras clave, destinatarios
    ├── Asistencia.gs          Sección 3 y reporte semanal para RRHH
    ├── Issues.gs              Sección 4
    ├── Redes.gs               Sección 5
    ├── Taller.gs              Sección 6: agendas web, comentarios libres, capturas
    ├── WhatsApp.gs            Sección 7
    └── Recordatorios.gs       Sección 8: Calendar, "Preparar devoluciones", check diario
```

Cada sección tiene su par: `backend/Seccion.gs` + `js/secciones/seccion.js` (+ su CSS si lo necesita).

## Cómo se comunican

El frontend llama a la API con `fetch`, POST y `Content-Type: text/plain` (así el navegador no bloquea por CORS):

```json
{ "action": "listarIssues", "claveAcceso": "…", "datos": { } }
```

Respuesta: `{ "ok": true, "datos": … }` o `{ "ok": false, "error": "…", "codigo": "…" }`.
Las acciones disponibles están en `ACCIONES`, al principio de `backend/Api.gs`.

## Base de datos (planilla "Torre de control – Base")

| Hoja | Qué guarda |
|---|---|
| asistencia | Faltas, llegadas tarde (con hora de llegada), home office, no marcó |
| issues | Cada issue (se escribe una sola vez) |
| comentarios_issues | Cada actualización de un issue: comentario, estado y a quién se escaló. El estado actual es el del último registro |
| redes | Una fila por red en cada monitoreo (agrupadas por `monitoreo_id`) |
| agendas_web | Agendas web; `historial_llamado` guarda cada cambio de "¿Se llamó?" con fecha y hora |
| bitacora_taller | Comentarios libres de Taller |
| capturas | Link y archivo de Drive de cada captura |
| whatsapp | Controles de WhatsApp |
| check_diario | Un registro por día marcado |
| configuración | Cada vez que se guarda un bloque de Configuración se agrega una fila; vale la última de cada clave |

Todo registro guarda fecha y hora automática (`registrado_en`) y se agrega al final: no se sobrescribe nada.
No conviene editar ni reordenar columnas a mano en la planilla.

## Reglas definidas

- **Racha del check diario:** días hábiles (lunes a viernes) seguidos. El fin de semana no la corta; si hoy todavía no se marcó, la racha no se pierde hasta que termina el día.
- **"Preparar devoluciones":** desde el lunes de la semana que contiene el último día del mes hasta fin de mes.
- **Reuniones:** calendario principal de la cuenta, hoy y los 7 días siguientes.
- **Reporte RRHH:** semana de lunes a domingo que contiene la fecha elegida; entra todo registro cuyo rango desde–hasta toque esa semana.

## Cómo se publican los cambios

Desde la carpeta de trabajo, con `git`, `gh` y `clasp` ya autenticados en la cuenta del panel:

1. **Frontend** (archivos de la raíz, `css/`, `js/`):
   `git add -A` → `git commit -m "mensaje en español"` → `git push`.
   GitHub Pages se actualiza solo en uno o dos minutos.
2. **Backend** (si cambió algo en `backend/`):
   - `npx clasp push --force`
   - Actualizar **la misma** implementación para que la URL no cambie:
     `npx clasp update-deployment <ID de implementación de js/config.js> --description "mensaje"`
   - Nunca crear una implementación nueva: cambiaría la URL de la API.
3. Antes de cada push, revisar con `git status` y `git diff --cached` que no se suba ningún dato ni clave.

Si se agrega una hoja nueva a `HOJAS` en `backend/Base.gs`, subir `VERSION_BASE` para que se cree en la próxima llamada.

## Pendiente (próximas etapas)

- Sección 1 – Llamadas y conexión (reportes 3CX).
- Sección 2 – Campañas (planillas .xlsx del mes y cruce con 3CX).
- Reporte semanal de campañas y resumen para Jimena.
