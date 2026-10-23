/* ===== Sección 3 – Marcas / llegadas tarde / home office / faltas ===== */
Modulos.Asistencia = (() => {
  const EVENTOS = ['Falta', 'Llegada tarde', 'Se retira antes', 'Home office', 'No marcó'];
  const TIPOS_HO = ['Excepción', 'Premio', 'Otro'];
  // Columnas del contador por agente
  const CONTADOR = [['Llegada tarde', 'Tarde'], ['Se retira antes', 'Se retira'], ['Falta', 'Faltas'], ['Home office', 'HO'], ['No marcó', 'No marcó']];
  let vista, registros = [];

  async function render(v, s) {
    vista = v;
    registros = await api('listarAsistencia');
    const conf = Estado.config;
    const activos = conf.agentes.filter(a => a.activo).map(a => a.nombre);
    const todos = [...new Set(conf.agentes.map(a => a.nombre).concat(registros.map(r => r.agente)))].sort();

    v.innerHTML = encabezado(s) + `
      <div class="fila-2">
        <section class="tarjeta">
          <h2>Nuevo registro</h2>
          ${activos.length ? '' : vacioHtml('No hay agentes activos. Cargalos en Configuración.')}
          <form id="f-asistencia" class="form" autocomplete="off">
            <div class="grid-campos">
              ${campo('Agente', `<select name="agente" required>${opcionesHtml(activos, '', 'Elegí un agente')}</select>`)}
              ${campo('Evento', `<select name="evento" required>${opcionesHtml(EVENTOS, '', 'Elegí un evento')}</select>`)}
              ${campo('Motivo', `<select name="motivo">${opcionesHtml(conf.listas.motivos, '', 'Sin motivo')}</select>`)}
              ${campo('Tipo de HO', `<select name="tipo_ho">${opcionesHtml(TIPOS_HO, '', 'Elegí el tipo')}</select>`, 'solo-ho', true)}
              ${campo('Hora de llegada', '<input type="time" name="hora_llegada">', 'solo-tarde', true)}
              ${campo('Desde', `<input type="date" name="desde" required value="${hoyISO()}">`)}
              ${campo('Hasta', `<input type="date" name="hasta" value="${hoyISO()}">`)}
            </div>
            ${campo('Comentario', '<textarea name="comentario" rows="3"></textarea>')}
            <div class="acciones"><button class="btn btn-primario" type="submit">Guardar registro</button></div>
          </form>
        </section>
        <section class="tarjeta">
          <div>
            <h2>Contador por agente</h2>
            <p class="nota">Cantidad de registros según el agente y las fechas filtradas en el registro.</p>
          </div>
          <div id="contador"></div>
        </section>
      </div>
      <section class="tarjeta">
        <div class="titulo-bloque">
          <h2>Registro</h2>
          <button class="btn btn-sec" type="button" id="ir-rrhh">Reporte semanal para RRHH</button>
        </div>
        <form class="grid-campos" id="filtros-asistencia">
          ${campo('Agente', `<select name="agente">${opcionesHtml(todos, '', 'Todos')}</select>`)}
          ${campo('Evento', `<select name="evento">${opcionesHtml(EVENTOS, '', 'Todos')}</select>`)}
          ${campo('Desde', '<input type="date" name="desde">')}
          ${campo('Hasta', '<input type="date" name="hasta">')}
        </form>
        <div id="tabla-asistencia"></div>
      </section>`;

    const form = v.querySelector('#f-asistencia');
    form.evento.addEventListener('change', () => mostrarCamposSegunEvento(form));
    form.desde.addEventListener('change', () => {
      if (!form.hasta.value || form.hasta.value < form.desde.value) form.hasta.value = form.desde.value;
    });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const datos = leerForm(form);
      const ok = await conBoton(form.querySelector('[type=submit]'), async () => {
        await api('registrarAsistencia', datos);
        registros = await api('listarAsistencia');
      });
      if (!ok) return;
      aviso('Registro guardado.');
      form.reset();
      form.desde.value = form.hasta.value = hoyISO();
      mostrarCamposSegunEvento(form);
      pintar();
    });
    v.querySelector('#filtros-asistencia').addEventListener('input', pintar);
    v.querySelector('#ir-rrhh').addEventListener('click', () => irA('reportes'));
    pintar();
  }

  function mostrarCamposSegunEvento(form) {
    const evento = form.evento.value;
    form.querySelector('.solo-ho').hidden = evento !== 'Home office';
    form.querySelector('.solo-tarde').hidden = evento !== 'Llegada tarde';
    form.tipo_ho.required = evento === 'Home office';
    form.hora_llegada.required = evento === 'Llegada tarde';
  }

  /** Filtra por agente, evento y rango (un registro entra si su desde–hasta se superpone con el rango) */
  function filtrar(f, ignorarEvento) {
    return registros.filter(r => {
      const hasta = r.hasta || r.desde;
      return (!f.agente || r.agente === f.agente) &&
        (ignorarEvento || !f.evento || r.evento === f.evento) &&
        (!f.desde || hasta >= f.desde) &&
        (!f.hasta || r.desde <= f.hasta);
    });
  }

  function pintar() {
    const f = leerForm(vista.querySelector('#filtros-asistencia'));
    const filas = filtrar(f, false);
    vista.querySelector('#tabla-asistencia').innerHTML = filas.length ? `
      <div class="tabla-envoltura"><table class="tabla">
        <thead><tr><th>Fecha</th><th>Agente</th><th>Evento</th><th>Motivo</th><th>Detalle</th><th>Comentario</th><th>Registrado</th></tr></thead>
        <tbody>${filas.map(r => `<tr>
          <td class="mono">${fmtRango(r.desde, r.hasta)}</td>
          <td>${esc(r.agente)}</td>
          <td><span class="pildora">${esc(r.evento)}</span></td>
          <td>${esc(r.motivo) || '<span class="nota">—</span>'}</td>
          <td>${r.tipo_ho ? 'HO: ' + esc(r.tipo_ho) : r.hora_llegada ? 'Llegó <span class="mono">' + esc(r.hora_llegada) + '</span>' : ''}</td>
          <td class="texto-libre">${esc(r.comentario)}</td>
          <td class="mono nota">${fmtFechaHora(r.registrado_en)}</td>
        </tr>`).join('')}</tbody>
      </table></div>` : vacioHtml('No hay registros con estos filtros.');

    // El contador usa agente y fechas, pero cuenta todos los eventos
    const base = filtrar(f, true);
    const porAgente = {};
    base.forEach(r => {
      porAgente[r.agente] = porAgente[r.agente] || {};
      porAgente[r.agente][r.evento] = (porAgente[r.agente][r.evento] || 0) + 1;
    });
    const nombres = Object.keys(porAgente).sort();
    vista.querySelector('#contador').innerHTML = nombres.length ? `
      <div class="contador-fila cab"><span></span>${CONTADOR.map(c => `<span>${c[1]}</span>`).join('')}</div>
      ${nombres.map(n => `<div class="contador-fila">
        <strong>${esc(n)}</strong>
        ${CONTADOR.map(c => {
          const k = porAgente[n][c[0]] || 0;
          return `<span class="contador-num${k ? '' : ' cero'}" title="${esc(c[0])}">${k}</span>`;
        }).join('')}
      </div>`).join('')}` : vacioHtml('Sin registros en el período.');
  }

  return { render };
})();
