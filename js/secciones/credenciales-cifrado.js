/* ===== Credenciales: cifrado en el navegador (Web Crypto, sin librerías) =====
   La clave de la sección se convierte en una llave AES-GCM de 256 bits con PBKDF2 (SHA-256).
   Al backend solo llega texto cifrado; la clave nunca sale del navegador ni se guarda. */
const CifradoCredenciales = (() => {
  const ITERACIONES = 250000;
  const TEXTO_CONTROL = 'torre-de-control';
  const cripto = globalThis.crypto;
  const codificar = new TextEncoder();
  const decodificar = new TextDecoder();

  function aBase64(bytes) {
    const b = new Uint8Array(bytes);
    let s = '';
    for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, b.subarray(i, i + 8192));
    return btoa(s);
  }
  const deBase64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

  async function derivarLlave(clave, salBase64) {
    const base = await cripto.subtle.importKey('raw', codificar.encode(clave), 'PBKDF2', false, ['deriveKey']);
    return cripto.subtle.deriveKey(
      { name: 'PBKDF2', salt: deBase64(salBase64), iterations: ITERACIONES, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  async function cifrar(llave, texto) {
    const iv = cripto.getRandomValues(new Uint8Array(12));
    const datos = await cripto.subtle.encrypt({ name: 'AES-GCM', iv }, llave, codificar.encode(texto));
    return { iv: aBase64(iv), datos: aBase64(datos) };
  }

  async function descifrar(llave, ivBase64, datosBase64) {
    const plano = await cripto.subtle.decrypt({ name: 'AES-GCM', iv: deBase64(ivBase64) }, llave, deBase64(datosBase64));
    return decodificar.decode(plano);
  }

  /** Crea los datos de verificación de una clave nueva (sal + texto de control cifrado) */
  async function crearBoveda(clave) {
    const sal = aBase64(cripto.getRandomValues(new Uint8Array(16)));
    const llave = await derivarLlave(clave, sal);
    const control = await cifrar(llave, TEXTO_CONTROL);
    return { boveda: { sal, iv: control.iv, verificador: control.datos }, llave };
  }

  /** Devuelve la llave si la clave es correcta; si no, null */
  async function abrir(clave, boveda) {
    const llave = await derivarLlave(clave, boveda.sal);
    try {
      if (await descifrar(llave, boveda.iv, boveda.verificador) === TEXTO_CONTROL) return llave;
    } catch (e) { /* clave incorrecta */ }
    return null;
  }

  return { crearBoveda, abrir, cifrar, descifrar };
})();

if (typeof module !== 'undefined') module.exports = CifradoCredenciales;
