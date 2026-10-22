/* ===== Sección 7 – Control de WhatsApp ===== */
Modulos.WhatsApp = (() => {
  let vista, controles = [];

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
          </div>
          ${campo('Comentarios', '<textarea name="comentario" rows="3"></textarea>')}
          <div class="acciones"><button class="btn btn-primario" type="submit">Guardar control</button></div>
        </form>
      </section>
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
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const datos = leerForm(form);
      const ok = await conBoton(form.querySelector('[type=submit]'), async () => {
        await api('registrarControlWhatsApp', datos);
        controles = await api('listarControlesWhatsApp');
      });
      if (!ok) return;
      aviso('Control guardado.');
      form.reset();
      form.horario.value = horaActual();
      pintar();
    });
    v.querySelector('#filtros-whatsapp').addEventListener('input', pintar);
    pintar();
  }

  function pintar() {
    const f = leerForm(vista.querySelector('#filtros-whatsapp'));
    const lista = controles.filter(c => {
      const dia = c.registrado_en.slice(0, 10);
      return (!f.linea || c.linea === f.linea) && (!f.desde || dia >= f.desde) && (!f.hasta || dia <= f.hasta);
    });
    vista.querySelector('#tabla-whatsapp').innerHTML = lista.length ? `
      <div class="tabla-envoltura"><table class="tabla">
        <thead><tr><th>Fecha</th><th>Horario</th><th>Línea</th><th>Comentarios</th><th>Registrado</th></tr></thead>
        <tbody>${lista.map(c => `<tr>
          <td class="mono">${fmtFecha(c.registrado_en)}</td>
          <td class="mono">${esc(c.horario)}</td>
          <td><span class="pildora">${esc(c.linea)}</span></td>
          <td class="texto-libre">${esc(c.comentario)}</td>
          <td class="mono nota">${fmtFechaHora(c.registrado_en)}</td>
        </tr>`).join('')}</tbody>
      </table></div>` : vacioHtml('No hay controles con estos filtros.');
  }

  return { render };
})();
