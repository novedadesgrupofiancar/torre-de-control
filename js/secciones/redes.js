/* ===== Sección 5 – Redes ===== */
Modulos.Redes = (() => {
  const M = MetricasRespuesta;
  let vista, seccion, monitoreos = [];
  let editando = null; // monitoreo que se está corrigiendo (null = carga nueva)

  async function render(v, s) {
    vista = v;
    seccion = s;
    editando = null;
    monitoreos = await api('listarMonitoreos');
    const listas = Estado.config.listas;
    const redesHistorial = [...new Set(listas.redes.concat(...monitoreos.map(m => Object.keys(m.redes))))];

    v.innerHTML = banners([{ tipo: 'rojo', html: 'REVISAR LOS MENSAJES OCULTOS DE LAS REDES' }]) + encabezado(s) + `
      <section class="tarjeta">
        <h2 id="redes-titulo-form">Nueva carga de monitoreo</h2>
        <form id="f-redes" class="form" autocomplete="off">
          <div class="grid-campos">
            ${campo('Turno de monitoreo', `<select name="turno" required>${opcionesHtml(listas.turnos, listas.turnos[0])}</select>`)}
          </div>
          <div class="tabla-envoltura"><table class="tabla tabla-redes">
            <thead><tr><th>Red</th><th>Sin responder</th><th>Más viejo sin responder</th>
              <th>Muestra: mensaje del cliente</th><th>Muestra: primera respuesta</th></tr></thead>
            <tbody>${listas.redes.map(red => `<tr data-red="${esc(red)}">
              <td>${esc(red)}</td>
              <td><input type="number" name="cantidad" min="0" step="1" required placeholder="0" aria-label="Mensajes sin responder en ${esc(red)}" style="max-width:96px"></td>
              <td><input type="datetime-local" name="mas_viejo" disabled aria-label="Mensaje sin responder más viejo en ${esc(red)}"></td>
              <td><input type="datetime-local" name="muestra_mensaje" aria-label="Mensaje del cliente (muestra) en ${esc(red)}"></td>
              <td><input type="datetime-local" name="muestra_respuesta" aria-label="Primera respuesta (muestra) en ${esc(red)}"></td>
            </tr>`).join('')}</tbody>
          </table></div>
          <p class="nota">Sin responder: 0 si no hay. Muestra (opcional): la última conversación respondida de cada red.</p>
          <div class="acciones">
            <div class="crece">
              <p class="nota mono" id="redes-progreso"></p>
              <div id="redes-barra"></div>
            </div>
            <button class="btn btn-sec" type="button" id="redes-cancelar" hidden>Cancelar</button>
            <button class="btn btn-primario" type="submit">Guardar monitoreo</button>
          </div>
        </form>
      </section>
      <section class="tarjeta" id="redes-metricas"></section>
      <section class="tarjeta">
        <div class="titulo-bloque">
          <h2>Historial</h2>
          <div style="min-width:200px">${campo('Red', `<select id="filtro-red">${opcionesHtml(redesHistorial, '', 'Todas')}</select>`)}</div>
        </div>
        <div id="historial-redes"></div>
      </section>`;

    const form = v.querySelector('#f-redes');
    form.addEventListener('input', e => {
      if (e.target.name !== 'cantidad') return;
      habilitarMasViejo(e.target.closest('tr'));
      pintarProgreso();
    });
    v.querySelector('#redes-cancelar').addEventListener('click', () => render(vista, seccion));
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const filas = [...form.querySelectorAll('tbody tr')].map(tr => {
        const val = n => tr.querySelector(`[name=${n}]`).value;
        return { red: tr.dataset.red, cantidad_sin_responder: val('cantidad'), fecha_mensajes: val('mas_viejo'),
          muestra_mensaje: val('muestra_mensaje'), muestra_respuesta: val('muestra_respuesta') };
      });
      const malas = filas.filter(f => f.muestra_mensaje && f.muestra_respuesta && f.muestra_respuesta < f.muestra_mensaje);
      if (malas.length) { aviso(`En ${malas[0].red} la respuesta no puede ser anterior al mensaje del cliente.`, 'error'); return; }
      const ok = await conBoton(form.querySelector('[type=submit]'), async () => {
        if (editando) await api('editarMonitoreo', { monitoreo_id: editando.id, turno: form.turno.value, filas });
        else await api('registrarMonitoreo', { turno: form.turno.value, filas });
      });
      if (!ok) return;
      aviso(editando ? 'Monitoreo corregido.' : 'Monitoreo guardado.');
      render(vista, s);
    });
    v.querySelector('#filtro-red').addEventListener('change', pintarHistorial);
    v.querySelector('#historial-redes').addEventListener('click', async e => {
      const b = e.target.closest('[data-editar], [data-eliminar]');
      if (!b) return;
      const m = monitoreos.find(x => x.id === (b.dataset.editar || b.dataset.eliminar));
      if (b.dataset.editar) { editar(m); return; }
      if (await eliminarRegistro('redes', m.id, b, `el monitoreo ${m.turno} del ${fmtFechaHora(m.registrado_en)} (todas las redes)`)) {
        aviso('Monitoreo eliminado.');
        render(vista, s);
      }
    });
    MetricasVista.montar(v.querySelector('#redes-metricas'), {
      titulo: 'Página',
      grupos: () => Estado.config.listas.redes,
      obtenerObservaciones: () => M.observacionesDeRedes(monitoreos)
    });
    pintarProgreso();
    pintarHistorial();
  }

  /** El más viejo solo se pide si hay mensajes sin responder */
  function habilitarMasViejo(tr) {
    const masViejo = tr.querySelector('[name=mas_viejo]');
    masViejo.disabled = !(Number(tr.querySelector('[name=cantidad]').value) > 0);
    masViejo.required = !masViejo.disabled;
    if (masViejo.disabled) masViejo.value = '';
  }

  /** Carga un monitoreo del historial en el formulario para corregirlo */
  function editar(m) {
    editando = m;
    const form = vista.querySelector('#f-redes');
    form.turno.value = m.turno;
    form.querySelectorAll('tbody tr').forEach(tr => {
      const r = m.redes[tr.dataset.red] || {};
      const poner = (n, valor) => { tr.querySelector(`[name=${n}]`).value = valor || ''; };
      poner('cantidad', r.cantidad_sin_responder);
      habilitarMasViejo(tr);
      poner('mas_viejo', aFechaHoraLocal(r.fecha_mensajes));
      poner('muestra_mensaje', aFechaHoraLocal(r.muestra_mensaje));
      poner('muestra_respuesta', aFechaHoraLocal(r.muestra_respuesta));
    });
    vista.querySelector('#redes-titulo-form').textContent = `Editar monitoreo ${m.turno} del ${fmtFechaHora(m.registrado_en)}`;
    form.querySelector('[type=submit]').textContent = 'Guardar cambios';
    vista.querySelector('#redes-cancelar').hidden = false;
    pintarProgreso();
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function pintarProgreso() {
    const total = Estado.config.listas.redes.length;
    const hechas = [...vista.querySelectorAll('#f-redes [name=cantidad]')].filter(i => i.value !== '').length;
    vista.querySelector('#redes-progreso').textContent = `${hechas} de ${total} redes revisadas`;
    vista.querySelector('#redes-barra').innerHTML = barra(total ? hechas / total * 100 : 0, hechas === total ? 'verde' : '');
  }

  /** Registros nuevos: cantidad y fecha y hora del más viejo. Registros viejos: Sí/No y fecha (se muestran tal cual). */
  function celda(r) {
    if (!r) return '<span class="nota">—</span>';
    if (r.cantidad_sin_responder !== '' && r.cantidad_sin_responder !== undefined) {
      const n = Number(r.cantidad_sin_responder);
      return n > 0
        ? `<span class="pildora pildora-ambar">${n} · desde ${fmtFechaHora(r.fecha_mensajes)}</span>`
        : '<span class="pildora pildora-verde">0</span>';
    }
    return r.sin_responder === 'Sí'
      ? `<span class="pildora pildora-ambar">Sí · ${fmtFecha(r.fecha_mensajes)}</span>`
      : '<span class="pildora pildora-verde">No</span>';
  }

  function pintarHistorial() {
    const red = vista.querySelector('#filtro-red').value;
    const lista = red ? monitoreos.filter(m => m.redes[red]) : monitoreos;
    const cont = vista.querySelector('#historial-redes');
    if (!lista.length) { cont.innerHTML = vacioHtml('Todavía no hay monitoreos cargados.'); return; }
    const columnas = red ? [red] : [...new Set(Estado.config.listas.redes.concat(...lista.map(m => Object.keys(m.redes))))];
    cont.innerHTML = `<div class="tabla-envoltura"><table class="tabla">
      <thead><tr><th>Fecha</th><th>Turno</th>${columnas.map(c => `<th>${esc(c)}</th>`).join('')}<th></th></tr></thead>
      <tbody>${lista.map(m => `<tr>
        <td class="mono">${fmtFechaHora(m.registrado_en)}</td>
        <td>${esc(m.turno)}</td>
        ${columnas.map(c => `<td>${celda(m.redes[c])}</td>`).join('')}
        <td>${botonesRegistro(m.id)}</td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  }

  return { render };
})();
