/* ===== Sección 8 – Recordatorios y tarjeta "Check del día" del menú ===== */
Modulos.Recordatorios = (() => {
  let check = null;

  /* ---------- Check del día (tarjeta fija bajo el menú) ---------- */

  async function cargarCheck() {
    pintarCheck();
    try {
      check = await api('obtenerCheckDiario');
    } catch (e) {
      aviso('No se pudo leer el check diario: ' + e.message, 'error');
    }
    pintarCheck();
  }

  function textoRacha(n) { return `${n} ${n === 1 ? 'día' : 'días'} de racha`; }

  function pintarCheck() {
    const el = document.getElementById('check-dia');
    el.innerHTML = `
      <p class="eyebrow">Check del día</p>
      ${check && check.marcado_hoy
        ? `<span class="pildora pildora-verde">Completado hoy · ${esc(check.marcado_hoy.slice(11, 16))}</span>`
        : `<button type="button" class="btn btn-verde btn-bloque" id="btn-check" ${check ? '' : 'disabled'}>Todas las tareas completadas</button>`}
      <span class="pildora pildora-azul">${check ? textoRacha(check.racha) : 'Cargando…'}</span>`;
    const boton = el.querySelector('#btn-check');
    if (boton) boton.addEventListener('click', marcar);
  }

  async function marcar() {
    const boton = document.getElementById('btn-check');
    const ok = await conBoton(boton, async () => { check = await api('marcarCheckDiario'); }, 'Guardando…');
    if (!ok) return;
    aviso('Check del día guardado.');
    pintarCheck();
    if (Estado.seccion === 'recordatorios') irA('recordatorios');
  }

  /* ---------- Sección 8 ---------- */

  async function render(v, s) {
    const [datos, estadoCheck] = await Promise.all([api('obtenerRecordatorios'), api('obtenerCheckDiario')]);
    check = estadoCheck;
    pintarCheck();
    const dev = datos.devoluciones;

    v.innerHTML = (dev.activo ? banners([{
      tipo: 'ambar',
      html: `Preparar devoluciones<small>Última semana del mes: del ${fmtFecha(dev.desde)} al ${fmtFecha(dev.hasta)}</small>`
    }]) : '') + encabezado(s) + `
      <div class="fila-2">
        <section class="tarjeta">
          <div>
            <h2>Reuniones</h2>
            <p class="nota">Hoy y los próximos 7 días · Google Calendar</p>
          </div>
          ${pintarReuniones(datos)}
        </section>
        <section class="tarjeta">
          <h2>Check diario</h2>
          ${pintarResumenCheck()}
        </section>
      </div>`;

    const boton = v.querySelector('#btn-check-seccion');
    if (boton) boton.addEventListener('click', async () => {
      const ok = await conBoton(boton, async () => { check = await api('marcarCheckDiario'); });
      if (!ok) return;
      aviso('Check del día guardado.');
      pintarCheck();
      irA('recordatorios');
    });
  }

  function pintarReuniones(datos) {
    if (datos.errorCalendario) return `<p class="vacio">${esc(datos.errorCalendario)}</p>`;
    if (!datos.reuniones.length) return vacioHtml('No hay reuniones en los próximos 7 días.');
    const porDia = {};
    datos.reuniones.forEach(r => { (porDia[r.fecha] = porDia[r.fecha] || []).push(r); });
    return Object.keys(porDia).sort().map(fecha => `
      <div class="dia-reuniones">
        <h3>${esc(nombreDia(fecha))}</h3>
        ${porDia[fecha].map(r => `<div class="reunion">
          <span class="hora">${r.todo_el_dia ? 'Todo el día' : esc(r.inicio) + '–' + esc(r.fin)}</span>
          <div>
            <strong>${esc(r.titulo)}</strong>
            ${r.participantes.length ? `<p class="participantes">${r.participantes.map(esc).join(', ')}</p>` : ''}
          </div>
        </div>`).join('')}
      </div>`).join('');
  }

  function pintarResumenCheck() {
    const historial = check.historial;
    const cerrados = historial.filter(d => d.fecha !== check.hoy || d.marcado_en);
    const marcados = cerrados.filter(d => d.marcado_en).length;
    const pct = cerrados.length ? marcados / cerrados.length * 100 : 0;
    const enOrden = historial.slice().reverse();
    return `
      <div class="resumen-check">
        ${anillo(pct, Math.round(pct) + '%', 'cumplido', '#7DBF9E')}
        <div class="dato"><strong>${check.racha}</strong><span>${check.racha === 1 ? 'día hábil seguido' : 'días hábiles seguidos'}</span></div>
        <div class="dato"><strong>${marcados}/${cerrados.length}</strong><span>últimos ${historial.length} días hábiles</span></div>
      </div>
      ${check.marcado_hoy
        ? `<span class="pildora pildora-verde">Completado hoy · ${esc(check.marcado_hoy.slice(11, 16))}</span>`
        : '<button type="button" class="btn btn-verde" id="btn-check-seccion">Todas las tareas completadas</button>'}
      <div class="dias-check" aria-label="Días hábiles marcados y no marcados">
        ${enOrden.map(d => `<span class="dia-check${d.marcado_en ? ' marcado' : d.fecha === check.hoy ? ' hoy' : ''}"
          title="${esc(nombreDia(d.fecha))} ${fmtFecha(d.fecha)}: ${d.marcado_en ? 'marcado ' + d.marcado_en.slice(11, 16) : d.fecha === check.hoy ? 'pendiente' : 'sin marcar'}"></span>`).join('')}
      </div>
      <div class="tabla-envoltura"><table class="tabla">
        <thead><tr><th>Día</th><th>Estado</th><th>Hora</th></tr></thead>
        <tbody>${historial.map(d => `<tr>
          <td>${esc(DIAS[diaSemana(d.fecha)])} <span class="mono">${fmtFecha(d.fecha)}</span></td>
          <td>${d.marcado_en ? '<span class="pildora pildora-verde">Marcado</span>'
            : d.fecha === check.hoy ? '<span class="pildora pildora-azul">Pendiente</span>' : '<span class="pildora">Sin marcar</span>'}</td>
          <td class="mono">${d.marcado_en ? esc(d.marcado_en.slice(11, 16)) : '—'}</td>
        </tr>`).join('')}</tbody>
      </table></div>`;
  }

  return { render, cargarCheck };
})();
