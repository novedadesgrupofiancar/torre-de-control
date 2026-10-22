/* ===== Sección 5 – Redes ===== */
Modulos.Redes = (() => {
  let vista, monitoreos = [], respuestas = {};

  async function render(v, s) {
    vista = v;
    monitoreos = await api('listarMonitoreos');
    respuestas = {};
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
            <thead><tr><th>Red</th><th>Mensajes sin responder</th><th>¿De qué fecha?</th></tr></thead>
            <tbody>${listas.redes.map((red, n) => `<tr data-red="${esc(red)}">
              <td>${esc(red)}</td>
              <td><div class="segmento" role="radiogroup" aria-label="Mensajes sin responder en ${esc(red)}">
                <button type="button" role="radio" aria-checked="false" data-valor="Sí">Sí</button>
                <button type="button" role="radio" aria-checked="false" data-valor="No">No</button>
              </div></td>
              <td><input type="date" name="fecha_${n}" disabled aria-label="Fecha de los mensajes de ${esc(red)}"></td>
            </tr>`).join('')}</tbody>
          </table></div>
          <div class="acciones">
            <div class="crece">
              <p class="nota mono" id="redes-progreso"></p>
              <div id="redes-barra"></div>
            </div>
            <button class="btn btn-primario" type="submit">Guardar monitoreo</button>
          </div>
        </form>
      </section>
      <section class="tarjeta">
        <div class="titulo-bloque">
          <h2>Historial</h2>
          <div style="min-width:200px">${campo('Red', `<select id="filtro-red">${opcionesHtml(redesHistorial, '', 'Todas')}</select>`)}</div>
        </div>
        <div id="historial-redes"></div>
      </section>`;

    const form = v.querySelector('#f-redes');
    form.addEventListener('click', e => {
      const boton = e.target.closest('.segmento button');
      if (!boton) return;
      const fila = boton.closest('tr');
      respuestas[fila.dataset.red] = boton.dataset.valor;
      fila.querySelectorAll('.segmento button').forEach(b => {
        b.classList.toggle('activo', b === boton);
        b.setAttribute('aria-checked', b === boton);
      });
      const fecha = fila.querySelector('input[type=date]');
      fecha.disabled = boton.dataset.valor !== 'Sí';
      fecha.required = !fecha.disabled;
      if (fecha.disabled) fecha.value = '';
      pintarProgreso();
    });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const filas = [...form.querySelectorAll('tbody tr')].map(tr => ({
        red: tr.dataset.red,
        sin_responder: respuestas[tr.dataset.red] || '',
        fecha_mensajes: tr.querySelector('input[type=date]').value
      }));
      const ok = await conBoton(form.querySelector('[type=submit]'), async () => {
        await api('registrarMonitoreo', { turno: form.turno.value, filas });
        monitoreos = await api('listarMonitoreos');
      });
      if (!ok) return;
      aviso('Monitoreo guardado.');
      render(vista, s);
    });
    v.querySelector('#filtro-red').addEventListener('change', pintarHistorial);
    pintarProgreso();
    pintarHistorial();
  }

  function pintarProgreso() {
    const total = Estado.config.listas.redes.length;
    const hechas = Object.keys(respuestas).length;
    vista.querySelector('#redes-progreso').textContent = `${hechas} de ${total} redes revisadas`;
    vista.querySelector('#redes-barra').innerHTML = barra(total ? hechas / total * 100 : 0, hechas === total ? 'verde' : '');
  }

  function celda(r) {
    if (!r) return '<span class="nota">—</span>';
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
