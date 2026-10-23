/**
 * Credenciales.
 * Los datos llegan cifrados desde el navegador (AES-GCM con una clave derivada de la clave de la sección):
 * el backend solo guarda texto cifrado y nunca ve ni guarda la clave.
 * Cada cambio agrega una fila nueva; vale la última de cada credencial. Borrar agrega una fila "borrado".
 */

const PATRON_BASE64 = /^[A-Za-z0-9+/=]+$/;

function base64Valido_(v, campo, max) {
  v = texto_(v, max || 20000);
  if (!v || !PATRON_BASE64.test(v)) throw new Error('Dato cifrado inválido: ' + campo + '.');
  return v;
}

function listarCredenciales() {
  return leerFilas_('credenciales').sort((a, b) => a.registrado_en.localeCompare(b.registrado_en));
}

function guardarCredencial(d) {
  const fila = {
    id: nuevoId_(),
    registrado_en: ahora_(),
    credencial_id: texto_(d.credencial_id, 60) || nuevoId_(),
    iv: base64Valido_(d.iv, 'iv', 40),
    datos: base64Valido_(d.datos, 'datos'),
    borrado: ''
  };
  agregarFilas_('credenciales', [fila]);
  return fila;
}

function borrarCredencial(d) {
  const credencialId = requerido_(texto_(d.credencial_id, 60), 'credencial');
  agregarFilas_('credenciales', [{ id: nuevoId_(), registrado_en: ahora_(), credencial_id: credencialId, iv: '', datos: '', borrado: 'Sí' }]);
  return true;
}
