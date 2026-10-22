/* ===== Sección 4 – Issues ===== */
Modulos.Issues = (() => {
  const ESTADOS = ['Detectado', 'Escalado', 'Solucionado'];
  let vista, issues = [];

  async function render(v, s) {
    vista = v;
    issues = await api('listarIssues');
    const escalado = Estado.config.listas.escalado;

    v.innerHTML = encabezado(s) + `
      <section class="tarjeta">
        <h2>Nuevo issue</h2>
        <form id="f-issue" class="form" autocomplete="off">
          <div class="grid-campos">
            ${campo('Issue', '<input name="issue" required maxlength="300">', 'ancho-2')}
            ${campo('Fecha', `<input type="date" name="fecha" required value="${hoyISO()}">`)}
            ${campo('Estado', `<select name="estado">${opcionesHtml(ESTADOS, 'Detectado')}</select>`)}
            ${campo('Escalado a', `<select name="escalado_a">${opcionesHtml(escalado, '', 'Elegí a quién')}</select>`, 'solo-escalado', true)}
          </div>
          ${campo('Detalles', '<textarea name="detalles" rows="3"></textarea>')}
          <div class="acciones"><button class="btn btn-primario" type="submit">Crear issue</button></div>
        </form>
      </section>
      <div class="tablero" id="tablero"></div>`;

    const form = v.querySelector('#f-issue');
    activarEscalado(form);
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const datos = leerForm(form);
      const ok = await conBoton(form.querySelector('[type=submit]'), async () => {
        await api('crearIssue', datos);
        issues = await api('listarIssues');
      });
      if (!ok) return;
      aviso('Issue creado.');
      form.reset();
      form.fecha.value = hoyISO();
      activarEscalado(form);
      pintarTablero();
    });
    v.querySelector('#tablero').addEventListener('click', e => {
      const item = e.target.closest('.item-issue');
      if (item) abrirIssue(item.dataset.id);
    });
    pintarTablero();
  }

  /** Muestra "Escalado a" solo cuando el estado es Escalado */
  function activarEscalado(form) {
    const actualizar = () => {
      const esEscalado = form.estado.value === 'Escalado';
      form.querySelector('.solo-escalado').hidden = !esEscalado;
      form.escalado_a.required = esEscalado;
    };
    form.estado.onchange = actualizar;
    actualizar();
  }

  function pildoraEstado(estado, escaladoA) {
    const clase = { Detectado: 'pildora-ambar', Escalado: 'pildora-azul', Solucionado: 'pildora-verde' }[estado] || '';
    return `<span class="pildora ${clase}">${esc(estado)}${estado === 'Escalado' && escaladoA ? ' · ' + esc(escaladoA) : ''}</span>`;
  }

  function pintarTablero() {
    vista.querySelector('#tablero').innerHTML = ESTADOS.map(estado => {
      const lista = issues.filter(i => i.estado === estado);
      return `<section class="tarjeta">
        <div class="titulo-bloque"><h2>${estado}</h2><span class="pildora">${lista.length}</span></div>
        <div class="lista">
          ${lista.length ? lista.map(i => {
            const comentarios = i.comentarios.filter(c => c.comentario).length;
            return `<button type="button" class="item-issue" data-id="${esc(i.id)}">
              <span class="titulo">${esc(i.issue)}</span>
              <span class="meta">
                <span class="mono">${fmtFecha(i.fecha)}</span>
                ${i.escalado_a ? `<span class="pildora pildora-azul">${esc(i.escalado_a)}</span>` : ''}
                <span>${comentarios} ${comentarios === 1 ? 'comentario' : 'comentarios'}</span>
              </span>
            </button>`;
          }).join('') : vacioHtml('Sin issues.')}
        </div>
      </section>`;
    }).join('');
  }

  function abrirIssue(id) {
    const i = issues.find(x => x.id === id);
    if (!i) return;
    const caja = abrirModal(`
      <div class="modal-cab">
        <div>
          <p class="eyebrow">Issue · ${fmtFecha(i.fecha)}</p>
          <h2>${esc(i.issue)}</h2>
        </div>
        <button type="button" class="btn-icono" data-cerrar aria-label="Cerrar">×</button>
      </div>
      <div class="pildoras">${pildoraEstado(i.estado, i.escalado_a)}<span class="nota mono">Creado ${fmtFechaHora(i.registrado_en)}</span></div>
      ${i.detalles ? `<p class="texto-libre">${esc(i.detalles)}</p>` : ''}
      <h3>Historial</h3>
      <ol class="linea-tiempo">
        ${i.comentarios.map((c, n) => {
          const anterior = i.comentarios[n - 1];
          const cambio = !anterior || anterior.estado !== c.estado || anterior.escalado_a !== c.escalado_a;
          return `<li>
            <div class="pildoras"><span class="mono nota">${fmtFechaHora(c.registrado_en)}</span>${cambio ? pildoraEstado(c.estado, c.escalado_a) : ''}</div>
            ${c.comentario ? `<p class="texto-libre">${esc(c.comentario)}</p>` : ''}
          </li>`;
        }).join('')}
      </ol>
      <form id="f-comentario" class="form" autocomplete="off">
        <h3>Nueva actualización</h3>
        ${campo('Comentario', '<textarea name="comentario" rows="3"></textarea>')}
        <div class="grid-campos">
          ${campo('Estado', `<select name="estado">${opcionesHtml(ESTADOS, i.estado)}</select>`)}
          ${campo('Escalado a', `<select name="escalado_a">${opcionesHtml(Estado.config.listas.escalado, i.escalado_a, 'Elegí a quién')}</select>`, 'solo-escalado', true)}
        </div>
        <div class="acciones"><button class="btn btn-primario" type="submit">Agregar actualización</button></div>
      </form>`);

    const form = caja.querySelector('#f-comentario');
    activarEscalado(form);
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const datos = Object.assign(leerForm(form), { issue_id: id });
      const ok = await conBoton(form.querySelector('[type=submit]'), async () => {
        await api('agregarComentarioIssue', datos);
        issues = await api('listarIssues');
      });
      if (!ok) return;
      aviso('Actualización guardada.');
      pintarTablero();
      abrirIssue(id);
    });
  }

  return { render };
})();
