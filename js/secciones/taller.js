/* ===== Sección 6 – Taller ===== */
Modulos.Taller = (() => {
  const BITACORA_POR_PAGINA = 30;
  let vista, agendas = [], bitacora = [], capturas = [], bitacoraVisible = BITACORA_POR_PAGINA;
  const imagenes = {}; // caché de capturas ya descargadas (archivo_id → data URL)
  // Agenda y comentario que se están corrigiendo (null = carga nueva)
  let agendaEditando = null, comentarioEditando = null;

  async function render(v, s) {
    vista = v;
    agendaEditando = comentarioEditando = null;
    [agendas, bitacora, capturas] = await Promise.all([
      api('listarAgendasWeb'), api('listarBitacora'), api('listarCapturas', { seccion: 'Taller' })
    ]);
    bitacoraVisible = BITACORA_POR_PAGINA;
    const talleres = Estado.config.listas.talleres;
    const manana = sumarDias(hoyISO(), 1);

    v.innerHTML = banners([
      { tipo: 'rojo', html: 'ENVIAR CONFIRMACIONES ANTES DE IRTE' },
      { tipo: 'naranja', html: 'Revisar las agendas del día siguiente y las agendas web' }
    ]) + encabezado(s) + `
      <section class="tarjeta">
        <h2>Agendas web del día siguiente</h2>
        ${talleres.length ? '' : vacioHtml('No hay talleres cargados. Agregalos en Configuración › Listas editables.')}
        <form id="f-agenda" class="form" autocomplete="off">
          <div class="grid-campos">
            ${campo('Fecha', `<input type="date" name="fecha" required value="${manana}">`)}
            ${campo('Hora', '<input type="time" name="hora" required>')}
            ${campo('Taller', `<select name="taller" required>${opcionesHtml(talleres, '', 'Elegí el taller')}</select>`)}
            ${campo('Comentario', '<input name="comentario">', 'ancho-2')}
          </div>
          <div class="acciones">
            <p class="nota crece" id="agenda-editando" hidden></p>
            <button class="btn btn-sec" type="button" id="agenda-cancelar" hidden>Cancelar</button>
            <button class="btn btn-primario" type="submit">Agregar agenda</button>
          </div>
        </form>
        <div class="titulo-bloque">
          <div style="min-width:200px">${campo('Ver agendas del', `<input type="date" id="filtro-agendas" value="${manana}">`)}</div>
          <div id="anillo-agendas"></div>
        </div>
        <div id="lista-agendas" class="lista"></div>
      </section>
      <div class="fila-2">
        <section class="tarjeta">
          <h2>Comentarios libres</h2>
          <form id="f-bitacora" class="form">
            ${campo('Comentario', '<textarea name="comentario" rows="3" required></textarea>')}
            <div class="acciones">
              <p class="nota crece" id="bitacora-editando" hidden></p>
              <button class="btn btn-sec" type="button" id="bitacora-cancelar" hidden>Cancelar</button>
              <button class="btn btn-primario" type="submit">Guardar comentario</button>
            </div>
          </form>
          <div id="lista-bitacora"></div>
        </section>
        <section class="tarjeta">
          <h2>Capturas de pantalla</h2>
          <div class="zona-pegar" id="zona-pegar" tabindex="0">
            Copiá una captura y pegala con <span class="mono">Ctrl+V</span> en cualquier parte de esta sección.
          </div>
          <div style="max-width:220px">${campo('Fecha', `<input type="date" id="filtro-capturas" value="${hoyISO()}">`)}</div>
          <div id="galeria" class="galeria"></div>
        </section>
      </div>`;

    // Agendas web
    const fAgenda = v.querySelector('#f-agenda');
    fAgenda.addEventListener('submit', async e => {
      e.preventDefault();
      const datos = leerForm(fAgenda);
      const ok = await conBoton(fAgenda.querySelector('[type=submit]'), async () => {
        if (agendaEditando) await api('editarAgendaWeb', Object.assign(datos, { id: agendaEditando.id }));
        else await api('registrarAgendaWeb', datos);
        agendas = await api('listarAgendasWeb');
      });
      if (!ok) return;
      aviso(agendaEditando ? 'Agenda corregida.' : 'Agenda agregada.');
      v.querySelector('#filtro-agendas').value = datos.fecha;
      editarAgenda(null);
    });
    v.querySelector('#agenda-cancelar').addEventListener('click', () => editarAgenda(null));
    v.querySelector('#lista-agendas').addEventListener('click', async e => {
      const b = e.target.closest('[data-editar], [data-eliminar]');
      if (!b) return;
      const a = agendas.find(x => x.id === (b.dataset.editar || b.dataset.eliminar));
      if (b.dataset.editar) { editarAgenda(a); return; }
      const ok = await eliminarRegistro('agenda_web', a.id, b, `la agenda de ${a.taller} del ${fmtFecha(a.fecha)} a las ${a.hora}`);
      if (!ok) return;
      agendas = agendas.filter(x => x.id !== a.id);
      aviso('Agenda eliminada.');
      if (agendaEditando && agendaEditando.id === a.id) editarAgenda(null);
      else pintarAgendas();
    });

    /** Carga una agenda en el formulario para corregirla (null = vuelve a "Agregar agenda") */
    function editarAgenda(a) {
      agendaEditando = a;
      if (a) ['fecha', 'hora', 'taller', 'comentario'].forEach(n => { fAgenda[n].value = a[n] || ''; });
      else { fAgenda.hora.value = ''; fAgenda.comentario.value = ''; }
      const nota = v.querySelector('#agenda-editando');
      nota.hidden = !a;
      nota.textContent = a ? `Editando la agenda de ${a.taller} del ${fmtFecha(a.fecha)} a las ${a.hora}.` : '';
      fAgenda.querySelector('[type=submit]').textContent = a ? 'Guardar cambios' : 'Agregar agenda';
      v.querySelector('#agenda-cancelar').hidden = !a;
      if (a) fAgenda.scrollIntoView({ behavior: 'smooth', block: 'start' });
      pintarAgendas();
    }
    v.querySelector('#filtro-agendas').addEventListener('change', pintarAgendas);
    v.querySelector('#lista-agendas').addEventListener('change', async e => {
      const check = e.target.closest('input[data-id]');
      if (!check) return;
      check.disabled = true;
      try {
        const fila = await api('marcarLlamadoAgenda', { id: check.dataset.id, llamado: check.checked });
        const i = agendas.findIndex(a => a.id === fila.id);
        if (i >= 0) agendas[i] = fila;
      } catch (err) {
        check.checked = !check.checked;
        aviso(err.message, 'error');
      }
      pintarAgendas();
    });

    // Bitácora
    const fBitacora = v.querySelector('#f-bitacora');
    fBitacora.addEventListener('submit', async e => {
      e.preventDefault();
      const datos = leerForm(fBitacora);
      const ok = await conBoton(fBitacora.querySelector('[type=submit]'), async () => {
        if (comentarioEditando) await api('editarBitacora', Object.assign(datos, { id: comentarioEditando.id }));
        else await api('registrarBitacora', datos);
        bitacora = await api('listarBitacora');
      });
      if (!ok) return;
      aviso(comentarioEditando ? 'Comentario corregido.' : 'Comentario guardado.');
      editarComentario(null);
    });
    v.querySelector('#bitacora-cancelar').addEventListener('click', () => editarComentario(null));
    v.querySelector('#lista-bitacora').addEventListener('click', async e => {
      if (e.target.closest('#ver-mas-bitacora')) {
        bitacoraVisible += BITACORA_POR_PAGINA;
        pintarBitacora();
        return;
      }
      const b = e.target.closest('[data-editar], [data-eliminar]');
      if (!b) return;
      const c = bitacora.find(x => x.id === (b.dataset.editar || b.dataset.eliminar));
      if (b.dataset.editar) { editarComentario(c); return; }
      const ok = await eliminarRegistro('bitacora_taller', c.id, b, `el comentario del ${fmtFechaHora(c.registrado_en)}`);
      if (!ok) return;
      bitacora = bitacora.filter(x => x.id !== c.id);
      aviso('Comentario eliminado.');
      if (comentarioEditando && comentarioEditando.id === c.id) editarComentario(null);
      else pintarBitacora();
    });

    /** Carga un comentario en el formulario para corregirlo (null = vuelve a "Guardar comentario") */
    function editarComentario(c) {
      comentarioEditando = c;
      fBitacora.comentario.value = c ? c.comentario : '';
      const nota = v.querySelector('#bitacora-editando');
      nota.hidden = !c;
      nota.textContent = c ? `Editando el comentario del ${fmtFechaHora(c.registrado_en)}.` : '';
      fBitacora.querySelector('[type=submit]').textContent = c ? 'Guardar cambios' : 'Guardar comentario';
      v.querySelector('#bitacora-cancelar').hidden = !c;
      if (c) { fBitacora.scrollIntoView({ behavior: 'smooth', block: 'start' }); fBitacora.comentario.focus(); }
      pintarBitacora();
    }

    // Capturas: se escucha el pegado mientras la sección está abierta
    document.addEventListener('paste', alPegar);
    Estado.alSalir = () => document.removeEventListener('paste', alPegar);
    v.querySelector('#filtro-capturas').addEventListener('change', pintarCapturas);
    v.querySelector('#galeria').addEventListener('click', e => {
      const img = e.target.closest('img[data-id]');
      if (img) abrirModal(`<div class="modal-cab"><p class="eyebrow">Captura</p><button type="button" class="btn-icono" data-cerrar aria-label="Cerrar">×</button></div><img class="modal-imagen" src="${img.src}" alt="Captura">`);
    });

    pintarAgendas();
    pintarBitacora();
    pintarCapturas();
  }

  function pintarAgendas() {
    const fecha = vista.querySelector('#filtro-agendas').value;
    const lista = agendas.filter(a => a.fecha === fecha);
    const llamadas = lista.filter(a => a.se_llamo === 'Sí').length;
    vista.querySelector('#anillo-agendas').innerHTML = lista.length
      ? anillo(llamadas / lista.length * 100, `${llamadas}/${lista.length}`, 'llamados', llamadas === lista.length ? '#7DBF9E' : '#6AA7E8') : '';
    vista.querySelector('#lista-agendas').innerHTML = lista.length ? lista.map(a => {
      const ultimoCambio = (a.historial_llamado || '').split('\n').pop();
      return `<div class="agenda">
        <span class="hora">${esc(a.hora)}</span>
        <div>
          <strong>${esc(a.taller)}</strong>
          ${a.comentario ? `<p class="texto-libre">${esc(a.comentario)}</p>` : ''}
          ${a.se_llamo === 'Sí' && ultimoCambio ? `<p class="nota mono">Llamado ${fmtFechaHora(ultimoCambio.slice(0, 19))}</p>` : ''}
          ${botonesRegistro(a.id)}
        </div>
        <label><input type="checkbox" data-id="${esc(a.id)}" ${a.se_llamo === 'Sí' ? 'checked' : ''}> ¿Se llamó?</label>
      </div>`;
    }).join('') : vacioHtml('No hay agendas web cargadas para ' + fmtFecha(fecha) + '.');
  }

  function pintarBitacora() {
    const visibles = bitacora.slice(0, bitacoraVisible);
    vista.querySelector('#lista-bitacora').innerHTML = bitacora.length ? `
      <div>${visibles.map(b => `<div class="entrada-bitacora">
        <span class="mono nota">${fmtFechaHora(b.registrado_en)}</span>
        <p class="texto-libre">${esc(b.comentario)}</p>
        ${botonesRegistro(b.id)}
      </div>`).join('')}</div>
      ${bitacora.length > visibles.length ? '<button type="button" class="btn btn-sec" id="ver-mas-bitacora">Ver más</button>' : ''}`
      : vacioHtml('Todavía no hay comentarios.');
  }

  async function alPegar(e) {
    const item = [...(e.clipboardData ? e.clipboardData.items : [])].find(i => i.type.startsWith('image/'));
    if (!item) return; // pegado de texto normal: no se toca
    e.preventDefault();
    const archivo = item.getAsFile();
    const zona = vista.querySelector('#zona-pegar');
    zona.classList.add('activa');
    zona.textContent = 'Subiendo captura…';
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const lector = new FileReader();
        lector.onload = () => resolve(lector.result);
        lector.onerror = () => reject(new Error('No se pudo leer la imagen.'));
        lector.readAsDataURL(archivo);
      });
      const fila = await api('subirCaptura', { base64: dataUrl.split(',')[1], mime: archivo.type, seccion: 'Taller' });
      imagenes[fila.archivo_id] = dataUrl;
      capturas.unshift(fila);
      vista.querySelector('#filtro-capturas').value = fila.registrado_en.slice(0, 10);
      aviso('Captura guardada.');
      pintarCapturas();
    } catch (err) {
      aviso(err.message, 'error');
    } finally {
      zona.classList.remove('activa');
      zona.innerHTML = 'Copiá una captura y pegala con <span class="mono">Ctrl+V</span> en cualquier parte de esta sección.';
    }
  }

  function pintarCapturas() {
    const fecha = vista.querySelector('#filtro-capturas').value;
    const lista = capturas.filter(c => c.registrado_en.slice(0, 10) === fecha);
    const galeria = vista.querySelector('#galeria');
    galeria.innerHTML = lista.length ? lista.map(c => `
      <figure class="captura" style="margin:0">
        <div class="marco" data-archivo="${esc(c.archivo_id)}">Cargando…</div>
        <figcaption class="pie">
          <span class="mono">${fmtFechaHora(c.registrado_en)}</span>
          <a href="${esc(c.link)}" target="_blank" rel="noopener">Abrir en Drive</a>
        </figcaption>
      </figure>`).join('') : vacioHtml('No hay capturas del ' + fmtFecha(fecha) + '.');
    lista.forEach(c => cargarImagen(c.archivo_id, galeria));
  }

  async function cargarImagen(id, galeria) {
    try {
      if (!imagenes[id]) imagenes[id] = await api('obtenerImagenCaptura', { archivo_id: id });
      const marco = galeria.querySelector(`[data-archivo="${CSS.escape(id)}"]`);
      if (marco) marco.innerHTML = `<img src="${imagenes[id]}" alt="Captura" data-id="${esc(id)}">`;
    } catch (e) {
      const marco = galeria.querySelector(`[data-archivo="${CSS.escape(id)}"]`);
      if (marco) marco.textContent = 'No se pudo cargar la vista previa.';
    }
  }

  return { render };
})();
