/* ===== Bloque "Métricas" de Redes y WhatsApp (misma vista para las dos secciones) ===== */
const MetricasVista = (() => {
  const M = MetricasRespuesta;

  /** Rango de fechas según el filtro: día, semana (lunes a domingo) o rango libre */
  function rango(f) {
    const base = f.fecha || hoyISO();
    if (f.tipo === 'dia') return { desde: base, hasta: base };
    if (f.tipo === 'semana') { const l = lunesDe(base); return { desde: l, hasta: sumarDias(l, 6) }; }
    return { desde: f.desde || base, hasta: f.hasta || base };
  }

  /**
   * Dibuja el bloque en "cont".
   * opciones: { titulo (Página / Línea), grupos (lista de nombres), obtenerObservaciones: () => [...] }
   */
  function montar(cont, opciones) {
    const filtro = { tipo: 'semana', fecha: hoyISO(), desde: '', hasta: '' };
    cont.innerHTML = `
      <div class="titulo-bloque">
        <h2>Métricas</h2>
        <div class="segmento" data-tipo-periodo>
          <button type="button" data-tipo="dia">Día</button>
          <button type="button" data-tipo="semana" class="activo">Semana</button>
          <button type="button" data-tipo="rango">Rango</button>
        </div>
      </div>
      <div class="grid-campos" data-fechas></div>
      <p class="nota">Tiempos en horario de atención (${esc(textoAtencion())}), sin feriados.</p>
      <div data-tabla></div>
      <pre class="vista-previa" data-resumen></pre>`;

    const pintarFechas = () => {
      cont.querySelector('[data-fechas]').innerHTML = filtro.tipo === 'rango'
        ? campo('Desde', `<input type="date" name="desde" value="${esc(filtro.desde || sumarDias(hoyISO(), -6))}">`) +
          campo('Hasta', `<input type="date" name="hasta" value="${esc(filtro.hasta || hoyISO())}">`)
        : campo(filtro.tipo === 'dia' ? 'Día' : 'Semana que incluye el día', `<input type="date" name="fecha" value="${esc(filtro.fecha)}">`);
      cont.querySelectorAll('[data-fechas] input').forEach(i => { filtro[i.name] = i.value; });
    };

    const pintar = () => {
      const r = rango(filtro);
      const obs = opciones.obtenerObservaciones().filter(o => o.momento.slice(0, 10) >= r.desde && o.momento.slice(0, 10) <= r.hasta);
      const conf = Estado.config;
      const filas = M.calcular(obs, opciones.grupos(), conf.atencion, conf.feriados);
      cont.querySelector('[data-tabla]').innerHTML = `
        <p class="nota mono">Del ${fmtFecha(r.desde)} al ${fmtFecha(r.hasta)} · ${obs.length ? `${new Set(obs.map(o => o.momento)).size} monitoreos` : 'sin monitoreos'}</p>
        <div class="tabla-envoltura"><table class="tabla">
          <thead><tr><th>${esc(opciones.titulo)}</th><th>Respuesta promedio</th><th class="num">Muestras</th>
            <th class="num">Pendientes prom.</th><th class="num">Pendientes máx.</th><th>Antigüedad máx.</th></tr></thead>
          <tbody>${filas.map(m => `<tr>
            <td><strong>${esc(m.grupo)}</strong></td>
            <td class="mono">${m.respuestaPromedio === null ? '<span class="nota">Sin muestras</span>' : esc(M.textoTiempo(m.respuestaPromedio))}</td>
            <td class="num">${m.muestras}</td>
            <td class="num">${M.textoNumero(m.pendientesPromedio, 1)}</td>
            <td class="num">${m.pendientesMax === null ? '—' : m.pendientesMax > 0 ? `<span class="pildora pildora-ambar">${m.pendientesMax}</span>` : '0'}</td>
            <td class="mono">${m.antiguedadMax === null ? '<span class="nota">—</span>' : esc(M.textoTiempo(m.antiguedadMax))}</td>
          </tr>`).join('')}</tbody>
        </table></div>`;
      cont.querySelector('[data-resumen]').textContent = filas.map(m => m.resumen).join('\n');
    };

    cont.querySelector('[data-tipo-periodo]').addEventListener('click', e => {
      const b = e.target.closest('[data-tipo]');
      if (!b) return;
      filtro.tipo = b.dataset.tipo;
      cont.querySelectorAll('[data-tipo-periodo] button').forEach(x => x.classList.toggle('activo', x === b));
      pintarFechas();
      pintar();
    });
    cont.querySelector('[data-fechas]').addEventListener('change', e => {
      if (e.target.name) filtro[e.target.name] = e.target.value;
      pintar();
    });
    pintarFechas();
    pintar();
    return { refrescar: pintar };
  }

  function textoAtencion() {
    const a = Estado.config.atencion;
    const nombres = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
    return `${a.dias.map(d => nombres[d]).join(', ')} de ${a.desde} a ${a.hasta}`;
  }

  return { montar };
})();
