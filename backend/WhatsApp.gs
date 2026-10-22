/**
 * Sección 7 – Control de WhatsApp.
 */

function registrarControlWhatsApp(d) {
  const conf = obtenerConfiguracion();
  const fila = {
    id: nuevoId_(),
    registrado_en: ahora_(),
    linea: enLista_(d.linea, conf.listas.lineas_whatsapp, 'WhatsApp controlado'),
    horario: horaHHMM_(d.horario, 'horario'),
    comentario: texto_(d.comentario)
  };
  agregarFilas_('whatsapp', [fila]);
  return fila;
}

function listarControlesWhatsApp() {
  return leerFilas_('whatsapp').sort((a, b) =>
    (b.registrado_en.slice(0, 10) + b.horario + b.registrado_en).localeCompare(a.registrado_en.slice(0, 10) + a.horario + a.registrado_en));
}
