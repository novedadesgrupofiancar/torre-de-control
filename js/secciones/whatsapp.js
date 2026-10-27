/* ===== Sección 7 – Control de WhatsApp ===== */
Modulos.WhatsApp = (() => {
  const M = MetricasRespuesta;
  let vista, controles = [], metricas = null;

  async function render(v, s) {
    vista = v;
    controles = await api('listarControlesWhatsApp');
    const lineas = Estado.config.listas.lineas_whatsapp;
    const lineasHistorial = [...new Set(lineas.concat(controles.map(c => c.linea)))];

    v.innerHTML = encabezado(s) + `
      <section class="tarjeta">
        <h2>Nuevo control</h2>
        <form id="f-whatsapp" class="form" autocomplete="off">
          <div class="grid-campos">
            ${campo('WhatsApp controlado', `<select name="linea" required>${opcionesHtml(lineas, '', 'Elegí la línea')}</select>`)}
            ${campo('Horario', `<input type="time" name="horario" required value="${horaActual()}">`)}
            ${campo('Mensajes sin responder', '<input type="number" name="cantidad_sin_responder" min="0" step="1" required placeholder="0">')}
            ${campo('Más viejo sin responder', '<input type="datetime-local" name="fecha_mensajes" disabled>')}
          </div>
          <div class="grid-campos">
            ${campo('Muestra: mensaje del cliente', '<input type="datetime-local" name="muestra_mensaje">')}
            ${campo('Muestra: primera respuesta del agente', '<input type="datetime-local" name="muestra_respuesta">')}
          </div>
          <p class="nota" id="wa-nota-muestra">Muestra (opcional): la última conversación respondida de la línea.</p>
          ${campo('Comentarios', '<textarea name="comentario" rows="3"></textarea>')}
          <div class="acciones"><button class="btn btn-primario" type="submit">Guardar control</button></div>
        </form>
      </section>
      <section class="tarjeta" id="wa-metricas"></section>
      <section class="tarjeta">
        <h2>Historial</h2>
        <form class="grid-campos" id="filtros-whatsapp">
          ${campo('Línea', `<select name="linea">${opcionesHtml(lineasHistorial, '', 'Todas')}</select>`)}
          ${campo('Desde', '<input type="date" name="desde">')}
          ${campo('Hasta', '<input type="date" name="hasta">')}
        </form>
        <div id="tabla-whatsapp"></div>
      </section>`;

    const form = v.querySelector('#f-whatsapp');
    const actualizarCampos = () => {
      // El más viejo solo se pide si hay mensajes sin responder
      const hay = Number(form.cantidad_sin_responder.value) > 0;
      form.fecha_mensajes.disabled = !hay;
      form.fecha_mensajes.required = hay;
      if (!hay) form.fecha_mensajes.value = '';
      // En la línea Bot cuenta la respuesta del agente humano, no la automática
      vista.querySelector('#wa-nota-muestra').textContent = form.linea.value === 'Bot'
        ? 'Muestra (opcional): la última conversación respondida. En Bot, la primera respuesta es la del agente humano, no la automática del bot.'
        : 'Muestra (opcional): la última conversación respondida de la línea.';
    };
    form.addEventListener('input', actualizarCampos);
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const datos = leerForm(form);
      if (datos.muestra_mensaje && datos.muestra_respuesta && datos.muestra_respuesta < datos.muestra_mensaje) {
        aviso('La respuesta no puede ser anterior al mensaje del cliente.', 'error');
        return;
      }
      const ok = await conBoton(form.querySelector('[type=submit]'), async () => {
        await api('registrarControlWhatsApp', datos);
        controles = await api('listarControlesWhatsApp');
      });
      if (!ok) return;
      aviso('Control guardado.');
      form.reset();
      form.horario.value = horaActual();
      actualizarCampos();
      pintar();
      metricas.refrescar();
    });
    v.querySelector('#filtros-whatsapp').addEventListener('input', pintar);
    metricas = MetricasVista.montar(v.querySelector('#wa-metricas'), {
      titulo: 'Línea',
      grupos: () => Estado.config.listas.lineas_whatsapp,
      obtenerObservaciones: () => M.observacionesDeWhatsApp(controles)
    });
    pintar();
  }

  function pendientes(c) {
    if (c.cantidad_sin_responder === '' || c.cantidad_sin_responder === undefined) return '<span class="nota">—</span>';
    const n = Number(c.cantidad_sin_responder);
    return n > 0 ? `<span class="pildora pildora-ambar">${n} · desde ${fmtFechaHora(c.fecha_mensajes)}</span>` : '<span class="pildora pildora-verde">0</span>';
  }

  function pintar() {
    const f = leerForm(vista.querySelector('#filtros-whatsapp'));
    const lista = controles.filter(c => {
      const dia = c.registrado_en.slice(0, 10);
      return (!f.linea || c.linea === f.linea) && (!f.desde || dia >= f.desde) && (!f.hasta || dia <= f.hasta);
    });
    vista.querySelector('#tabla-whatsapp').innerHTML = lista.length ? `
      <div class="tabla-envoltura"><table class="tabla">
        <thead><tr><th>Fecha</th><th>Horario</th><th>Línea</th><th>Sin responder</th><th>Muestra</th><th>Comentarios</th><th>Registrado</th></tr></thead>
        <tbody>${lista.map(c => `<tr>
          <td class="mono">${fmtFecha(c.registrado_en)}</td>
          <td class="mono">${esc(c.horario)}</td>
          <td><span class="pildora">${esc(c.linea)}</span></td>
          <td>${pendientes(c)}</td>
          <td class="mono nota">${c.muestra_mensaje ? `${fmtFechaHora(c.muestra_mensaje)} → ${fmtFechaHora(c.muestra_respuesta)}` : '—'}</td>
          <td class="texto-libre">${esc(c.comentario)}</td>
          <td class="mono nota">${fmtFechaHora(c.registrado_en)}</td>
        </tr>`).join('')}</tbody>
      </table></div>` : vacioHtml('No hay controles con estos filtros.');
  }

  return { render };
})();
