/* ===== Generador mínimo de archivos .xlsx en el navegador (sin librerías) =====
   Arma el paquete Office Open XML en un ZIP sin compresión.
   Uso: descargarXlsx('reporte.xlsx', [{ nombre: 'Resumen', filas: [['Encabezado', 'Valor'], ['Gestionadas', 12]] }]) */
const Xlsx = (() => {
  const TABLA_CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = TABLA_CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  /** ZIP con método "store" (sin compresión): suficiente para Excel */
  function zip(archivos) {
    const enc = new TextEncoder();
    const partes = [], central = [];
    let desplazamiento = 0;
    archivos.forEach(a => {
      const nombre = enc.encode(a.nombre);
      const datos = enc.encode(a.contenido);
      const crc = crc32(datos);
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034B50, true);
      local.setUint16(4, 20, true);
      local.setUint16(8, 0, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, datos.length, true);
      local.setUint32(22, datos.length, true);
      local.setUint16(26, nombre.length, true);
      partes.push(new Uint8Array(local.buffer), nombre, datos);

      const cd = new DataView(new ArrayBuffer(46));
      cd.setUint32(0, 0x02014B50, true);
      cd.setUint16(4, 20, true);
      cd.setUint16(6, 20, true);
      cd.setUint32(16, crc, true);
      cd.setUint32(20, datos.length, true);
      cd.setUint32(24, datos.length, true);
      cd.setUint16(28, nombre.length, true);
      cd.setUint32(42, desplazamiento, true);
      central.push(new Uint8Array(cd.buffer), nombre);
      desplazamiento += 30 + nombre.length + datos.length;
    });
    const tamCentral = central.reduce((s, p) => s + p.length, 0);
    const fin = new DataView(new ArrayBuffer(22));
    fin.setUint32(0, 0x06054B50, true);
    fin.setUint16(8, archivos.length, true);
    fin.setUint16(10, archivos.length, true);
    fin.setUint32(12, tamCentral, true);
    fin.setUint32(16, desplazamiento, true);
    return new Blob([...partes, ...central, new Uint8Array(fin.buffer)],
      { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  const escXml = v => String(v).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]))
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

  function letraColumna(n) {
    let s = '';
    for (n++; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    return s;
  }

  /** La primera fila de cada hoja va en negrita */
  function hojaXml(filas) {
    const xmlFilas = filas.map((fila, i) => `<row r="${i + 1}">${fila.map((v, j) => {
      const ref = letraColumna(j) + (i + 1);
      const estilo = i === 0 ? ' s="1"' : '';
      if (typeof v === 'number' && isFinite(v)) return `<c r="${ref}"${estilo}><v>${v}</v></c>`;
      return `<c r="${ref}" t="inlineStr"${estilo}><is><t xml:space="preserve">${escXml(v === null || v === undefined ? '' : v)}</t></is></c>`;
    }).join('')}</row>`).join('');
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      `<sheetData>${xmlFilas}</sheetData></worksheet>`;
  }

  function crear(hojas) {
    const archivos = [
      { nombre: '[Content_Types].xml', contenido: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        hojas.map((h, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
        '</Types>' },
      { nombre: '_rels/.rels', contenido: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>' },
      { nombre: 'xl/workbook.xml', contenido: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
        hojas.map((h, i) => `<sheet name="${escXml(h.nombre.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
        '</sheets></workbook>' },
      { nombre: 'xl/_rels/workbook.xml.rels', contenido: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        hojas.map((h, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
        `<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        '</Relationships>' },
      { nombre: 'xl/styles.xml', contenido: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
        '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
        '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
        '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
        '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
        '</styleSheet>' }
    ];
    hojas.forEach((h, i) => archivos.push({ nombre: `xl/worksheets/sheet${i + 1}.xml`, contenido: hojaXml(h.filas) }));
    return zip(archivos);
  }

  function descargar(nombre, hojas) {
    const url = URL.createObjectURL(crear(hojas));
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  return { crear, descargar };
})();

if (typeof module !== 'undefined') module.exports = Xlsx;
