/* ===== Reportes ===== */
Modulos.Reportes = (() => {
  let vista, reporte = null;

  async function render(v, s) {
    vista = v;
    v.innerHTML = encabezado(s) + `
      <section class="tarjeta">
        <div class="titulo-bloque">
          <div>
            <h2>RRHH semanal</h2>
            <p class="nota">No marcó, faltas, llegadas tarde y home office, con los comentarios tal cual se escribieron.</p>
          </div>
        </div>
        <div class="acciones" style="justify-content:flex-start">
          <div style="min-width:200px">${campo('Semana que incluye el día', `<input type="date" id="rrhh-fecha" value="${hoyISO()}">`)}</div>
          <div class="crece"></div>
          <button type="button" class="btn btn-sec" id="rrhh-copiar" disabled>Copiar para mail</button>
          <button type="button" class="btn btn-primario" id="rrhh-excel" disabled>Exportar a Excel</button>
        </div>
        <p class="nota" id="rrhh-destino"></p>
        <div class="pildoras" id="rrhh-totales"></div>
        <pre class="vista-previa" id="rrhh-texto">Cargando…</pre>
      </section>
      <section class="tarjeta">
        <div>
          <h2>Campañas semanal</h2>
          <p class="nota">Gestionadas, ganadas, No aplica por motivo y el resto de los estados, contra la foto del viernes anterior.</p>
        </div>
        <div class="acciones" style="justify-content:flex-start">
          <div style="min-width:170px">${campo('Mes', `<select id="camp-mes">${opcionesHtml(Estado.config.campanias.map(c => c.mes), Modulos.Campanias.mesPorDefecto(), Estado.config.campanias.length ? undefined : 'Sin links cargados')}</select>`)}</div>
          <div class="crece"></div>
          <button type="button" class="btn btn-sec" id="camp-generar" ${Estado.config.campanias.length ? '' : 'disabled'}>Generar</button>
          <button type="button" class="btn btn-primario" id="camp-excel" disabled>Exportar a Excel</button>
        </div>
        <div id="camp-resultado"></div>
      </section>
      <section class="tarjeta">
        <div>
          <h2>Resumen para Jimena</h2>
          <p class="nota">Semana de lunes a viernes: llamadas y conexión, campañas, asistencia, issues, redes y taller. Sin WhatsApp.</p>
        </div>
        <div class="acciones" style="justify-content:flex-start">
          <div style="min-width:200px">${campo('Semana que incluye el día', `<input type="date" id="jim-fecha" value="${hoyISO()}">`)}</div>
          <div class="crece"></div>
          <button type="button" class="btn btn-sec" id="jim-generar">Generar</button>
          <button type="button" class="btn btn-primario" id="jim-copiar" disabled>Copiar para mail</button>
        </div>
        <p class="nota" id="jim-destino"></p>
        <pre class="vista-previa" id="jim-texto" hidden></pre>
      </section>`;

    let textoJimena = '';
    v.querySelector('#jim-generar').addEventListener('click', async e => {
      const salida = vista.querySelector('#jim-texto');
      const copiar = vista.querySelector('#jim-copiar');
      copiar.disabled = true;
      salida.hidden = false;
      salida.textContent = 'Armando el resumen… (las campañas tardan unos segundos)';
      const fecha = vista.querySelector('#jim-fecha').value || hoyISO();
      const ok = await conBoton(e.currentTarget, async () => {
        // Campañas: reporte semanal contra la última foto (si falla, el resto del resumen sale igual)
        // Primero se guarda la semana con los reportes de 3CX recibidos por mail (si hay nuevos)
        try { await Modulos.Llamadas.asegurarCargaSemana(fecha); } catch (err) { /* se usa la última carga guardada */ }
        const mes = Modulos.Campanias.mesPorDefecto();
        const [datos, campanias] = await Promise.all([
          api('datosResumenJimena', { fecha }),
          mes ? Modulos.Campanias.reporteSemanal(mes).catch(err => ({ error: 'No se pudieron leer las planillas: ' + err.message }))
            : Promise.resolve({ error: 'No hay links de campañas cargados.' })
        ]);
        textoJimena = JimenaLogica.armar(datos, campanias,
          { atencion: Estado.config.atencion, feriados: Estado.config.feriados, redes: Estado.config.listas.redes });
      }, 'Generando…');
      if (!ok) { salida.hidden = true; return; }
      salida.textContent = textoJimena;
      const mail = Estado.config.destinatarios.jimena;
      vista.querySelector('#jim-destino').innerHTML = mail
        ? `Para: <span class="mono">${esc(mail)}</span>`
        : 'Sin mail de Jimena cargado en Configuración › Destinatarios.';
      copiar.disabled = false;
    });
    v.querySelector('#jim-copiar').addEventListener('click', async () => {
      try {
        await copiarTexto(textoJimena);
        aviso('Resumen copiado. Pegalo en el mail.');
      } catch (err) { aviso(err.message, 'error'); }
    });

    let reporteCampanias = null;
    v.querySelector('#camp-generar').addEventListener('click', async e => {
      const salida = vista.querySelector('#camp-resultado');
      const excel = vista.querySelector('#camp-excel');
      excel.disabled = true;
      salida.innerHTML = '<div class="cargando">Leyendo las planillas del mes…</div>';
      const ok = await conBoton(e.currentTarget, async () => {
        reporteCampanias = await Modulos.Campanias.reporteSemanal(vista.querySelector('#camp-mes').value);
      }, 'Generando…');
      if (!ok) { salida.innerHTML = ''; return; }
      const r = reporteCampanias;
      salida.innerHTML = `
        <p class="nota mono">Del ${fmtFechaHora(r.desde)} al ${fmtFechaHora(r.hasta)} · ${esc(r.referencia)}</p>
        <div class="tabla-envoltura"><table class="tabla">
          <thead><tr><th>Concepto</th><th class="num">Cantidad</th></tr></thead>
          <tbody>${r.filas.map(([n, c]) => `<tr><td>${esc(n)}</td><td class="num">${c}</td></tr>`).join('')}</tbody>
        </table></div>`;
      excel.disabled = false;
    });
    v.querySelector('#camp-excel').addEventListener('click', () => {
      const r = reporteCampanias;
      Xlsx.descargar(`Campañas semanal ${r.mes} al ${r.hasta.slice(0, 10)}.xlsx`, [{
        nombre: 'Campañas semanal',
        filas: [
          ['Reporte semanal de campañas', r.mes],
          ['Desde', fmtFechaHora(r.desde)],
          ['Hasta', fmtFechaHora(r.hasta)],
          ['Referencia', r.referencia],
          [],
          ['Concepto', 'Cantidad'],
          ...r.filas
        ]
      }]);
    });

    v.querySelector('#rrhh-fecha').addEventListener('change', cargar);
    v.querySelector('#rrhh-copiar').addEventListener('click', async () => {
      try {
        await copiarTexto(reporte.texto);
        aviso('Reporte copiado. Pegalo en el mail.');
      } catch (e) { aviso(e.message, 'error'); }
    });
    v.querySelector('#rrhh-excel').addEventListener('click', async e => {
      const fecha = vista.querySelector('#rrhh-fecha').value;
      let archivo;
      const ok = await conBoton(e.currentTarget, async () => { archivo = await api('exportarRRHHExcel', { fecha }); }, 'Generando…');
      if (ok) descargarBase64(archivo.nombre, archivo.base64, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    });
    await cargar();
  }

  async function cargar() {
    const fecha = vista.querySelector('#rrhh-fecha').value || hoyISO();
    const botones = vista.querySelectorAll('#rrhh-copiar, #rrhh-excel');
    botones.forEach(b => { b.disabled = true; });
    vista.querySelector('#rrhh-texto').textContent = 'Cargando…';
    try {
      reporte = await api('reporteRRHH', { fecha });
    } catch (e) {
      vista.querySelector('#rrhh-texto').textContent = 'No se pudo generar el reporte: ' + e.message;
      return;
    }
    vista.querySelector('#rrhh-destino').innerHTML = reporte.destinatario
      ? `Para: <span class="mono">${esc(reporte.destinatario)}</span>`
      : 'Sin mail de RRHH cargado en Configuración › Destinatarios.';
    vista.querySelector('#rrhh-totales').innerHTML = reporte.grupos
      .map(g => `<span class="pildora${g.items.length ? ' pildora-azul' : ''}">${esc(g.titulo)}: ${g.items.length}</span>`).join('');
    vista.querySelector('#rrhh-texto').textContent = reporte.texto;
    botones.forEach(b => { b.disabled = false; });
  }

  return { render };
})();
