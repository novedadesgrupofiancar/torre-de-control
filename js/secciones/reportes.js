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
      <div class="fila-2">
        <section class="tarjeta proximamente">
          <h2>Campañas semanal</h2>
          <span class="pildora pildora-azul">Próximamente</span>
        </section>
        <section class="tarjeta proximamente">
          <h2>Resumen para Jimena</h2>
          <span class="pildora pildora-azul">Próximamente</span>
        </section>
      </div>`;

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
