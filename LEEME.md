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
- No van al repositorio: credenciales de clasp (`.clasprc.json`, `.clasp.json`), CSV/Excel de prueba, las carpetas `ejemplos/` y `Reportes 3CX/`, `Clave.txt` ni `Arquitectura.md` (ver `.gitignore`).
- Los links de las planillas de campaña se cargan solo en Configuración (quedan en la base, no en el código).

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
│   ├── xlsx.js                genera archivos .xlsx en el navegador (sin librerías)
│   └── secciones/             una vista por sección: llamadas (+ llamadas-logica), campanias
│                              (+ campanias-logica), asistencia, issues, redes, taller, whatsapp,
│                              recordatorios, reportes (+ jimena-logica), configuracion
└── backend/                   Google Apps Script (se sube con clasp)
    ├── appsscript.json        manifiesto: zona horaria, permisos, web app
    ├── Api.gs                 doPost/doGet, control de la clave, lista de acciones
    ├── Base.gs                planilla base, hojas, lectura/escritura, Excel, fechas
    ├── Configuracion.gs       agentes, horarios, campañas, listas, palabras clave, destinatarios
    ├── Llamadas.gs            Sección 1: guardado e historial de las cargas de 3CX
    ├── Campanias.gs           Sección 2: lectura de planillas, foto semanal, guardado del cruce 3CX
    ├── Jimena.gs              datos de la semana para el resumen para Jimena
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
| llamadas | Resultado de cada carga de 3CX: una fila por agente y una "Equipo" (% atendidas, detalle por cola, desconexiones, sesiones sin cerrar, resumen), con período y semana |
| fotos_campañas | Foto semanal de las planillas de campaña (viernes 17:30): una fila por cliente con agente, km y Oportunidad |
| cruces_3cx | Resultado de cada cruce con 3CX: una fila por gestión (Atendida / No atendida / Sin llamada), con el período |
| configuración | Cada vez que se guarda un bloque de Configuración se agrega una fila; vale la última de cada clave |

Todo registro guarda fecha y hora automática (`registrado_en`) y se agrega al final: no se sobrescribe nada.
No conviene editar ni reordenar columnas a mano en la planilla.

## Sección 1 – Llamadas y conexión

- Se cargan los 2 CSV de 3CX (% de llamadas atendidas e historial de conexión), de un día, una semana o un mes. Se procesan en el navegador y se guarda el resultado en la hoja `llamadas`.
- El agente se identifica por el interno ("1234 Nombre Apellido" → 1234) según Configuración; los internos que no están cargados se ignoran. Se ignora la fila "Totals".
- **% de atendidas:** por cola, ofrecidas = atendidas / %; el total del agente es la suma de atendidas sobre la suma de ofrecidas.
- **Desconexiones:** solo lunes a viernes y solo cortes entre sesiones del mismo día. Del corte se descuenta lo que cae dentro de los descansos configurados; cuenta si lo que queda supera la tolerancia del agente (Configuración › Horarios; vacío = 5 min).
- **Sesiones sin cerrar:** sesiones que arrancan a las 00:00, terminan a las 24:00 o están en fin de semana. "Noches" = sesiones que terminan a las 24:00.

## Resumen para Jimena

- Reportes › Resumen para Jimena: semana de lunes a viernes que incluye la fecha elegida. Botón para copiar el texto.
- Llamadas: la última carga de 3CX cuyo período toca la semana. Campañas: reporte semanal contra la última foto. Asistencia, issues (solo comentarios del período), redes y taller de la semana. No incluye WhatsApp.
- Texto armado con reglas fijas (`js/secciones/jimena-logica.js`); los comentarios van textuales.

## Sección 2 – Campañas

- **Planillas:** los links del mes se cargan en Configuración › Links de campañas. Son .xlsx en Drive: el backend los convierte a una copia temporal (servicio avanzado de Drive, v3) y la borra al terminar. Las columnas se ubican por encabezado.
  - Chevrolet: una hoja por km (se ignora "Resumen"), encabezado en la fila 1, km = nombre de la hoja.
  - Marcas: una hoja por marca, encabezado en la fila 3, km = "Próximo service" o "Service a ofrecer".
  - Comentario del agente: la columna sin título después de "Taller".
- **Agentes:** se cruzan por "Nombre en planillas" (sin acentos ni mayúsculas). Los que no están en Configuración aparecen como "Sin mapear".
- **No aplica:** se clasifica por las palabras clave de Configuración › Listas editables, en orden Canepas → vendió → ya vino/km; gana la primera. Un comentario con formato de orden de taller (dd/mm/aaaa | número | NN K) cuenta como "ya vino".
- **Semana:** son las filas cuya Oportunidad cambió desde la última foto del mes tomada antes de hoy (cualquier cambio, clasificado por el estado actual). Si todavía no hay foto en el mes, se toma desde el inicio del mes.
- **Cruce con 3CX:** el CSV de salientes se lee en el navegador. Se cruzan las gestiones de la semana con las llamadas del mismo agente (por interno) a sus teléfonos (últimos 8 dígitos), dentro del período. Atendida si algún tramo fue "Answered". El resultado se guarda en `cruces_3cx`.
- **Foto semanal:** función `tomarFotoCampanias`, con un activador de tiempo los viernes a las 17:30 (hora de Montevideo). El activador se crea ejecutando una vez `instalarActivadorFoto` desde el editor de Apps Script.
- **Reporte semanal:** en Reportes › Campañas semanal; el .xlsx se arma en el navegador.

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

## Pendiente

- Ajustar las palabras clave de No aplica con la lista de "sin clasificar" de la Sección 2.

