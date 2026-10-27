/* ===== Sección 5 – Redes ===== */
Modulos.Redes = (() => {
  const M = MetricasRespuesta;
  let vista, monitoreos = [];

  async function render(v, s) {
    vista = v;
    monitoreos = await api('listarMonitoreos');
    const listas = Estado.config.listas;
    const redesHistorial = [...new Set(listas.redes.concat(...monitoreos.map(m => Object.keys(m.redes))))];

    v.innerHTML = banners([{ tipo: 'rojo', html: 'REVISAR LOS MENSAJES OCULTOS DE LAS REDES' }]) + encabezado(s) + `
      <section class="tarjeta">
        <h2>Nueva carga de monitoreo</h2>
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
      // El más viejo solo se pide si hay mensajes sin responder
      const fila = e.target.closest('tr');
      const masViejo = fila.querySelector('[name=mas_viejo]');
      masViejo.disabled = !(Number(e.target.value) > 0);
      masViejo.required = !masViejo.disabled;
      if (masViejo.disabled) masViejo.value = '';
      pintarProgreso();
    });
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
        await api('registrarMonitoreo', { turno: form.turno.value, filas });
        monitoreos = await api('listarMonitoreos');
      });
      if (!ok) return;
      aviso('Monitoreo guardado.');
      render(vista, s);
    });
    v.querySelector('#filtro-red').addEventListener('change', pintarHistorial);
    MetricasVista.montar(v.querySelector('#redes-metricas'), {
      titulo: 'Página',
      grupos: () => Estado.config.listas.redes,
      obtenerObservaciones: () => M.observacionesDeRedes(monitoreos)
    });
    pintarProgreso();
    pintarHistorial();
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
      <thead><tr><th>Fecha</th><th>Turno</th>${columnas.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>
      <tbody>${lista.map(m => `<tr>
        <td class="mono">${fmtFechaHora(m.registrado_en)}</td>
        <td>${esc(m.turno)}</td>
        ${columnas.map(c => `<td>${celda(m.redes[c])}</td>`).join('')}
      </tr>`).join('')}</tbody>
    </table></div>`;
  }

  return { render };
})();
