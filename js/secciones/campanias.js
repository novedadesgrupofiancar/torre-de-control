/* ===== Sección 2 – Campañas ===== */
Modulos.Campanias = (() => {
  const L = CampaniasLogica;
  const VISTAS = [['gestiones', 'Gestiones'], ['resultados', 'Resultados'], ['cruce', 'Cruce con 3CX']];
  let vista, datos = null, filasMapeadas = [], sinMapear = [];
  const estado = { mes: '', origen: 'Ambas', marca: '', vista: 'gestiones' };

  /** Lee las planillas del mes desde el backend (se reutiliza entre pestañas) */
  async function cargarCampania(mes) {
    const d = await api('leerCampania', { mes });
    const m = L.mapearAgentes(d.filas, Estado.config.agentes);
    return { datos: d, filas: m.filas, sinMapear: m.sinMapear };
  }

  /** Mes por defecto: el actual si tiene links cargados; si no, el más reciente */
  function mesPorDefecto() {
    const meses = Estado.config.campanias.map(c => c.mes);
    const actual = hoyISO().slice(0, 7);
    return meses.includes(actual) ? actual : meses[0] || '';
  }

  /** Desde cuándo se cuenta "la semana": la foto de referencia o el inicio del mes */
  function inicioSemana(d) {
    return d.referencia.registrado_en || d.mes + '-01 00:00:00';
  }
  function textoReferencia(d) {
    return d.referencia.registrado_en
      ? `cambios desde la foto del ${fmtFechaHora(d.referencia.registrado_en)}`
      : 'todavía no hay foto anterior este mes: se toma desde el inicio del mes';
  }

  async function render(v, s) {
    vista = v;
    const meses = Estado.config.campanias.map(c => c.mes);
    if (!meses.length) {
      v.innerHTML = encabezado(s) + `<section class="tarjeta">${vacioHtml('No hay links de campañas cargados. Agregalos en Configuración › Links de campañas.')}</section>`;
      return;
    }
    if (!meses.includes(estado.mes)) estado.mes = mesPorDefecto();

    v.innerHTML = encabezado(s) + `
      <section class="tarjeta">
        <div class="filtros-campania">
          <div style="min-width:170px">${campo('Mes', `<select id="c-mes">${opcionesHtml(meses, estado.mes)}</select>`)}</div>
          <div class="campo" id="c-filtro-origen"><span class="etiqueta">Planillas</span>
            <div class="segmento" id="c-origen">${['Chevrolet', 'Marcas', 'Ambas'].map(o =>
              `<button type="button" data-origen="${o}" class="${o === estado.origen ? 'activo' : ''}">${o}</button>`).join('')}</div>
          </div>
          <div style="min-width:180px" id="c-filtro-marca" hidden>${campo('Marca', '<select id="c-marca"></select>')}</div>
          <div class="crece"></div>
          <button type="button" class="btn btn-sec" id="c-actualizar">Actualizar</button>
          <button type="button" class="btn btn-sec" id="c-reporte">Reporte semanal</button>
        </div>
        <p class="nota mono" id="c-info"></p>
        <div id="c-avisos"></div>
      </section>
      <div class="segmento pestanias" id="c-vistas">${VISTAS.map(([id, nombre]) =>
        `<button type="button" data-vista="${id}" class="${id === estado.vista ? 'activo' : ''}">${nombre}</button>`).join('')}</div>
      <div id="c-contenido" class="vista"></div>`;

    v.querySelector('#c-mes').addEventListener('change', e => { estado.mes = e.target.value; estado.marca = ''; cargar(); });
    v.querySelector('#c-origen').addEventListener('click', e => {
      const b = e.target.closest('[data-origen]');
      if (!b) return;
      estado.origen = b.dataset.origen;
      estado.marca = '';
      v.querySelectorAll('#c-origen button').forEach(x => x.classList.toggle('activo', x === b));
      pintar();
    });
    v.querySelector('#c-marca').addEventListener('change', e => { estado.marca = e.target.value; pintar(); });
    v.querySelector('#c-vistas').addEventListener('click', e => {
      const b = e.target.closest('[data-vista]');
      if (!b) return;
      estado.vista = b.dataset.vista;
      v.querySelectorAll('#c-vistas button').forEach(x => x.classList.toggle('activo', x === b));
      pintar();
    });
    v.querySelector('#c-actualizar').addEventListener('click', cargar);
    v.querySelector('#c-reporte').addEventListener('click', () => irA('reportes'));
    await cargar();
  }

  async function cargar() {
    const cont = vista.querySelector('#c-contenido');
    const boton = vista.querySelector('#c-actualizar');
    cont.innerHTML = '<div class="cargando">Leyendo las planillas del mes…</div>';
    boton.disabled = true;
    try {
      const r = await cargarCampania(estado.mes);
      datos = r.datos; filasMapeadas = r.filas; sinMapear = r.sinMapear;
    } catch (e) {
      datos = null;
      cont.innerHTML = `<section class="tarjeta"><p>No se pudieron leer las planillas.</p><p class="nota">${esc(e.message)}</p></section>`;
      return;
    } finally {
      boton.disabled = false;
    }
    vista.querySelector('#c-info').textContent = `Leído ${fmtFechaHora(datos.leido_en)} · ${filasMapeadas.length} clientes en las planillas`;
    vista.querySelector('#c-avisos').innerHTML = sinMapear.length
      ? `<p class="pildoras"><span class="pildora pildora-ambar">Sin mapear</span><span class="nota">Agentes de las planillas que no están en Configuración: ${sinMapear.map(esc).join(', ')}</span></p>` : '';
    pintar();
  }

  /** Filas según el filtro de planillas y de marca */
  function filtradas() {
    return filasMapeadas.filter(f =>
      (estado.origen === 'Ambas' || f.origen === estado.origen) &&
      (!estado.marca || (f.origen === 'Marcas' && f.hoja === estado.marca)));
  }

  function pintar() {
    if (!datos) return;
    // Filtro de marca: solo con "Marcas"; el cruce no usa filtros
    const filtroMarca = vista.querySelector('#c-filtro-marca');
    filtroMarca.hidden = estado.origen !== 'Marcas' || estado.vista === 'cruce';
    vista.querySelector('#c-filtro-origen').hidden = estado.vista === 'cruce';
    const marcas = [...new Set(filasMapeadas.filter(f => f.origen === 'Marcas').map(f => f.hoja))];
    vista.querySelector('#c-marca').innerHTML = opcionesHtml(marcas, estado.marca, 'Todas');
    const cont = vista.querySelector('#c-contenido');
    if (estado.vista === 'gestiones') pintarGestiones(cont);
    else if (estado.vista === 'resultados') pintarResultados(cont);
    else pintarCruce(cont);
  }

  /* ---------- Vista 1: gestiones por agente y kilometraje ---------- */

  function pintarGestiones(cont) {
    const g = L.gestionesPorAgenteKm(filtradas());
    if (!g.agentes.length) { cont.innerHTML = `<section class="tarjeta">${vacioHtml('No hay clientes con este filtro.')}</section>`; return; }
    cont.innerHTML = `
      <section class="tarjeta">
        <div><h2>Gestiones por agente y kilometraje</h2>
          <p class="nota">Gestionadas (Oportunidad con estado) sobre clientes asignados.</p></div>
        <div class="tabla-envoltura"><table class="tabla tabla-campania">
          <thead><tr><th>Agente</th>${g.kms.map(k => `<th class="num">${esc(k)}</th>`).join('')}<th class="num">Total</th></tr></thead>
          <tbody>${g.agentes.map(a => `<tr>
            <td><strong>${esc(a)}</strong></td>
            ${g.kms.concat('total').map(k => celdaGestion(g.celdas[a][k], k === 'total')).join('')}
          </tr>`).join('')}</tbody>
        </table></div>
      </section>
      <section class="tarjeta">
        <h2>Por kilometraje</h2>
        <div class="lista">${g.textos.map(t => `<p class="linea-km">${esc(t)}</p>`).join('')}</div>
      </section>`;
  }

  function celdaGestion(c, total) {
    if (!c.asignadas) return '<td class="num nota">—</td>';
    const pct = c.gestionadas / c.asignadas * 100;
    return `<td class="num${total ? ' total' : ''}">
      <span class="${c.gestionadas ? '' : 'cero'}">${c.gestionadas}</span><span class="de"> / ${c.asignadas}</span>
      ${barra(pct, pct === 100 ? 'verde' : '')}
    </td>`;
  }

  /* ---------- Vista 2: resultados ---------- */

  function filasResultados(r) {
    return [
      ['Ganadas (Agendado)', r.ganadas, 'verde'],
      ...L.MOTIVOS.map(m => [m.nombre, r.motivos[m.nombre], '']),
      [L.SIN_CLASIFICAR, r.motivos[L.SIN_CLASIFICAR], r.motivos[L.SIN_CLASIFICAR] ? 'ambar' : ''],
      ...Object.keys(r.estados).map(e => [e, r.estados[e], '']),
      ...Object.keys(r.otros).map(e => [e + ' (estado no reconocido)', r.otros[e], 'ambar'])
    ];
  }

  function pintarResultados(cont) {
    const r = L.resultados(filtradas(), Estado.config.palabras_clave);
    const filas = filasResultados(r);
    cont.innerHTML = `
      <section class="tarjeta">
        <div class="titulo-bloque">
          <h2>Resultados</h2>
          <div class="pildoras">
            <span class="pildora pildora-azul">Gestionadas ${r.gestionadas} / ${r.total}</span>
            <span class="pildora pildora-verde">Ganadas ${r.ganadas}</span>
            <span class="pildora">No aplica ${r.noAplica}</span>
          </div>
        </div>
        <div class="tabla-envoltura"><table class="tabla">
          <thead><tr><th>Resultado</th><th class="num">Cantidad</th><th style="width:40%"></th></tr></thead>
          <tbody>${filas.map(([nombre, n, tono]) => `<tr>
            <td>${tono === 'ambar' && n ? `<span class="pildora pildora-ambar">${esc(nombre)}</span>` : esc(nombre)}</td>
            <td class="num">${n}</td>
            <td>${barra(r.gestionadas ? n / r.gestionadas * 100 : 0, tono === 'verde' ? 'verde' : '')}</td>
          </tr>`).join('')}</tbody>
        </table></div>
      </section>
      <section class="tarjeta">
        <div><h2>No aplica sin clasificar</h2>
          <p class="nota">No tienen ninguna palabra clave reconocida. Las palabras se ajustan en Configuración › Listas editables.</p></div>
        ${r.sinClasificar.length ? `<div class="tabla-envoltura"><table class="tabla">
          <thead><tr><th>Agente</th><th>Planilla</th><th>Km</th><th>Comentario</th></tr></thead>
          <tbody>${r.sinClasificar.map(f => `<tr>
            <td>${esc(f.agente_panel)}</td>
            <td>${esc(f.origen)} · ${esc(f.hoja)}</td>
            <td class="mono">${esc(f.km)}</td>
            <td class="texto-libre">${f.comentario ? esc(f.comentario) : '<span class="nota">(sin comentario)</span>'}</td>
          </tr>`).join('')}</tbody>
        </table></div>` : vacioHtml('Todos los No aplica quedaron clasificados.')}
      </section>`;
  }

  /* ---------- Vista 3: cruce con 3CX ---------- */

  /** El cruce es mensual: todas las gestiones de la planilla contra todas las salientes del mes */
  function gestionesDelMes() {
    return filasMapeadas.filter(f => f.oportunidad);
  }
  function periodoDelMes(mes) {
    const ultimo = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0).getDate();
    return { desde: mes + '-01 00:00:00', hasta: mes + '-' + String(ultimo).padStart(2, '0') + ' 23:59:59' };
  }

  function pintarCruce(cont) {
    const gestiones = gestionesDelMes();
    cont.innerHTML = `
      <section class="tarjeta">
        <div><h2>Cruce con 3CX</h2>
          <p class="nota">Gestiones del mes: <span class="mono">${gestiones.length}</span>.
          Se cruzan con todas las llamadas salientes del mes que hay guardadas (las que llegan por mail y las que subiste a mano), del mismo agente.</p></div>
        <p class="nota" id="c-cruce-origen"><span class="cargando">Leyendo las salientes guardadas del mes…</span></p>
        <div id="c-cruce-resultado"></div>
        <details class="sin-respaldo">
          <summary>Subir CSV de salientes</summary>
          <label class="zona-pegar zona-archivo" style="margin-top:10px">
            <input type="file" id="c-csv" accept=".csv,text/csv" multiple hidden>
            Elegí el reporte de salientes de 3CX (.csv). Puede ser uno con todos los agentes o varios archivos.
            Queda guardado y se suma al cruce del mes; si subís el mismo archivo dos veces, no se repite.
          </label>
        </details>
      </section>`;
    cont.querySelector('#c-csv').addEventListener('change', e => subirSalientes([...e.target.files], gestiones));
    cruzarDelMes(gestiones);
  }

  /** Guarda los CSV en la base y vuelve a cruzar con todo lo del mes */
  async function subirSalientes(archivos, gestiones) {
    if (!archivos.length) return;
    const origenTxt = vista.querySelector('#c-cruce-origen');
    const partes = [];
    for (const a of archivos) {
      if (origenTxt) origenTxt.innerHTML = `<span class="cargando">Guardando ${esc(a.name)}…</span>`;
      try {
        const texto = await a.text();
        L.llamadasDe3CX([texto]); // valida las columnas antes de subirlo
        const r = await api('subirReporte3CX', { nombre: a.name, texto });
        partes.push(r.repetido ? `${a.name}: ya estaba guardado` : `${a.name}: guardado`);
      } catch (e) {
        aviso(a.name + ': ' + e.message, 'error');
      }
    }
    if (partes.length) aviso(partes.join(' · '));
    cruzarDelMes(gestiones);
  }

  /** Lee todas las salientes guardadas del mes (mail + subidas a mano) y cruza */
  async function cruzarDelMes(gestiones) {
    const origenTxt = vista.querySelector('#c-cruce-origen');
    const p = periodoDelMes(datos.mes);
    const claveFirma = 'cruce|' + datos.mes;
    let r;
    try {
      r = await api('reportes3CXDelPeriodo', { desde: p.desde.slice(0, 10), hasta: p.hasta.slice(0, 10), tipos: ['salientes'], claveFirma });
    } catch (e) {
      if (origenTxt) origenTxt.textContent = 'No se pudieron leer las salientes: ' + e.message;
      return;
    }
    if (!origenTxt || !origenTxt.isConnected) return;
    if (r.error) aviso(r.error, 'error');
    if (!r.archivos.length) {
      origenTxt.textContent = 'Todavía no hay salientes guardadas de este mes. Subí el CSV de 3CX abajo.';
      vista.querySelector('#c-cruce-resultado').innerHTML = '';
      return;
    }
    const porMail = r.archivos.filter(a => !a.manual), aMano = r.archivos.filter(a => a.manual);
    const textos = [];
    if (porMail.length) textos.push(`por mail ${porMail.length} ${porMail.length === 1 ? 'día' : 'días'} (${porMail.map(a => fmtFecha(a.fecha_datos).slice(0, 5)).join(', ')})`);
    if (aMano.length) textos.push(`subidos a mano: ${aMano.map(a => a.nombre).join(', ')}`);
    origenTxt.textContent = 'Salientes del mes: ' + textos.join(' · ') + '.';
    const firma = r.archivos.map(a => a.id).sort().join(',') + '|' + gestiones.length;
    cruzarYGuardar(r.archivos.map(a => a.texto), gestiones, claveFirma, firma === r.firma_guardada ? null : firma);
  }

  /** Cruza y guarda el resultado. Si ya estaba guardado igual (firma null), no lo repite. */
  async function cruzarYGuardar(textos, gestiones, claveFirma, firma) {
    const salida = vista.querySelector('#c-cruce-resultado');
    let llamadas;
    try {
      llamadas = L.llamadasDe3CX(textos);
    } catch (e) {
      aviso(e.message, 'error');
      return;
    }
    const { desde, hasta } = periodoDelMes(datos.mes);
    const cruce = L.cruzar(gestiones, llamadas, desde, hasta);
    pintarResultadoCruce(salida, cruce);

    if (!cruce.detalle.length || (claveFirma && !firma)) return;
    try {
      await api('guardarCruce3CX', {
        mes: datos.mes, desde, hasta, claveFirma, firma,
        filas: cruce.detalle.map(d => ({
          agente: d.agente_panel, origen: d.origen, hoja: d.hoja, km: d.km, cliente: d.cliente,
          telefono: [d.telefono, d.telefono_alternativo].filter(Boolean).join(' / '), oportunidad: d.oportunidad, resultado: d.resultado
        }))
      });
      aviso('Cruce guardado en la base.');
    } catch (e) {
      aviso('No se pudo guardar el cruce: ' + e.message, 'error');
    }
  }

  function pintarResultadoCruce(salida, cruce) {
    if (!cruce.agentes.length) { salida.innerHTML = vacioHtml('No hay gestiones en el mes para cruzar.'); return; }
    salida.innerHTML = `
      <div class="tabla-envoltura"><table class="tabla">
        <thead><tr><th>Agente</th><th class="num">Gestiones marcadas</th><th class="num">Con llamada</th>
          <th class="num">Atendidas</th><th class="num">No atendidas</th><th class="num">Sin respaldo</th></tr></thead>
        <tbody>${cruce.agentes.map(a => `<tr>
          <td><strong>${esc(a.agente)}</strong></td>
          <td class="num">${a.marcadas}</td>
          <td class="num">${a.conLlamada}</td>
          <td class="num">${a.atendidas}</td>
          <td class="num">${a.noAtendidas}</td>
          <td class="num">${a.sinLlamada ? `<span class="pildora pildora-ambar">${a.sinLlamada}</span>` : '<span class="pildora pildora-verde">0</span>'}</td>
        </tr>`).join('')}</tbody>
      </table></div>
      <h3>Resumen</h3>
      <pre class="vista-previa">${esc(cruce.texto)}</pre>
      <h3>Gestiones sin respaldo</h3>
      ${cruce.agentes.some(a => a.sinRespaldo.length) ? cruce.agentes.filter(a => a.sinRespaldo.length).map(a => `
        <details class="sin-respaldo">
          <summary><strong>${esc(a.agente)}</strong> <span class="pildora pildora-ambar">${a.sinRespaldo.length}</span></summary>
          <div class="tabla-envoltura"><table class="tabla">
            <thead><tr><th>Cliente</th><th>Teléfono</th><th>Planilla</th><th>Km</th><th>Oportunidad</th></tr></thead>
            <tbody>${a.sinRespaldo.map(d => `<tr>
              <td>${esc(d.cliente)}</td>
              <td class="mono">${esc([d.telefono, d.telefono_alternativo].filter(Boolean).join(' / '))}</td>
              <td>${esc(d.origen)} · ${esc(d.hoja)}</td>
              <td class="mono">${esc(d.km)}</td>
              <td>${esc(d.oportunidad)}</td>
            </tr>`).join('')}</tbody>
          </table></div>
        </details>`).join('') : vacioHtml('Todas las gestiones tienen una llamada registrada.')}`;
  }

  /* ---------- Reporte semanal (se usa desde Reportes) ---------- */

  async function reporteSemanal(mes) {
    const r = await cargarCampania(mes);
    const cambiadas = r.filas.filter(f => f.cambio && f.oportunidad);
    const res = L.resultados(cambiadas, Estado.config.palabras_clave);
    return {
      mes,
      desde: inicioSemana(r.datos),
      hasta: r.datos.leido_en,
      referencia: textoReferencia(r.datos),
      resultados: res,
      filas: [['Gestionadas', res.gestionadas]].concat(filasResultados(res).map(([n, c]) => [n, c]))
    };
  }

  return { render, reporteSemanal, mesPorDefecto };
})();
