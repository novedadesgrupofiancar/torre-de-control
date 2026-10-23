/* ===== Credenciales: sección protegida con su propia clave ===== */
Modulos.Credenciales = (() => {
  const C = CifradoCredenciales;
  let vista, seccion, llave = null, credenciales = [];

  async function render(v, s) {
    vista = v;
    seccion = s;
    // Al salir de la sección se bloquea: la próxima vez vuelve a pedir la clave
    Estado.alSalir = () => { llave = null; credenciales = []; };
    if (llave) return pintarAbierta();
    const boveda = Estado.config.boveda || {};
    if (!boveda.sal) return pintarCrear();
    pintarBloqueada();
  }

  function pintarBloqueada(error) {
    vista.innerHTML = encabezado(seccion) + `
      <section class="tarjeta ingreso-caja">
        <h2>Sección protegida</h2>
        <form id="cr-abrir" class="form" autocomplete="off">
          ${campo('Clave de Credenciales', '<input type="password" name="clave" required autocomplete="off">')}
          <p class="ingreso-error">${esc(error || '')}</p>
          <button class="btn btn-primario btn-bloque" type="submit">Abrir</button>
        </form>
      </section>`;
    const form = vista.querySelector('#cr-abrir');
    form.clave.focus();
    form.addEventListener('submit', async e => {
      e.preventDefault();
      let abierta = null;
      const ok = await conBoton(form.querySelector('[type=submit]'), async () => {
        abierta = await C.abrir(form.clave.value, Estado.config.boveda);
      }, 'Verificando…');
      if (!ok) return;
      if (!abierta) { pintarBloqueada('Clave incorrecta.'); return; }
      llave = abierta;
      pintarAbierta();
    });
  }

  /** Solo la primera vez: crea la clave de la sección */
  function pintarCrear() {
    vista.innerHTML = encabezado(seccion) + `
      <section class="tarjeta ingreso-caja">
        <h2>Crear la clave de Credenciales</h2>
        <p class="nota">Se usa para cifrar todo lo que guardes acá. Si se pierde, las credenciales no se pueden recuperar.</p>
        <form id="cr-crear" class="form" autocomplete="off">
          ${campo('Clave', '<input type="password" name="clave" required minlength="8" autocomplete="new-password">')}
          ${campo('Repetir clave', '<input type="password" name="repetir" required autocomplete="new-password">')}
          <button class="btn btn-primario btn-bloque" type="submit">Crear clave</button>
        </form>
      </section>`;
    const form = vista.querySelector('#cr-crear');
    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (form.clave.value !== form.repetir.value) { aviso('Las dos claves no coinciden.', 'error'); return; }
      const ok = await conBoton(form.querySelector('[type=submit]'), async () => {
        const nueva = await C.crearBoveda(form.clave.value);
        Estado.config = await api('guardarConfiguracion', { bloque: 'boveda', valor: nueva.boveda });
        llave = nueva.llave;
      });
      if (ok) pintarAbierta();
    });
  }

  /** Descifra todo: por cada credencial, la última versión y su historial */
  async function cargar() {
    const filas = await api('listarCredenciales');
    const porId = {};
    for (const f of filas) {
      const c = porId[f.credencial_id] = porId[f.credencial_id] || { id: f.credencial_id, versiones: [], borrada: false };
      if (f.borrado) { c.borrada = true; continue; }
      c.borrada = false;
      try {
        const datos = JSON.parse(await C.descifrar(llave, f.iv, f.datos));
        c.versiones.push(Object.assign({ registrado_en: f.registrado_en }, datos));
      } catch (e) { /* versión que no se pudo descifrar */ }
    }
    credenciales = Object.values(porId)
      .filter(c => !c.borrada && c.versiones.length)
      .map(c => Object.assign(c, { actual: c.versiones[c.versiones.length - 1] }))
      .sort((a, b) => a.actual.titulo.localeCompare(b.actual.titulo));
  }

  async function pintarAbierta() {
    vista.innerHTML = encabezado(seccion) + '<div class="cargando">Descifrando…</div>';
    try {
      await cargar();
    } catch (e) {
      vista.innerHTML = encabezado(seccion) + `<section class="tarjeta"><p class="nota">${esc(e.message)}</p></section>`;
      return;
    }
    vista.innerHTML = encabezado(seccion) + `
      <section class="tarjeta">
        <div class="titulo-bloque">
          <h2 id="cr-titulo-form">Nueva credencial</h2>
          <button type="button" class="btn btn-sec" id="cr-bloquear">Bloquear</button>
        </div>
        <form id="cr-form" class="form" autocomplete="off">
          <input type="hidden" name="credencial_id">
          ${campo('Título', '<input name="titulo" required maxlength="120">')}
          ${campo('Texto libre', '<textarea name="texto" rows="5"></textarea>')}
          <div class="acciones">
            <button type="button" class="btn btn-sec" id="cr-cancelar" hidden>Cancelar edición</button>
            <button type="submit" class="btn btn-primario">Guardar</button>
          </div>
        </form>
      </section>
      <section class="tarjeta">
        <div class="titulo-bloque"><h2>Credenciales</h2><span class="pildora">${credenciales.length}</span></div>
        <div class="lista" id="cr-lista"></div>
      </section>`;

    const form = vista.querySelector('#cr-form');
    vista.querySelector('#cr-bloquear').addEventListener('click', () => { llave = null; credenciales = []; pintarBloqueada(); });
    vista.querySelector('#cr-cancelar').addEventListener('click', () => editar(null));
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const d = leerForm(form);
      const ok = await conBoton(form.querySelector('[type=submit]'), async () => {
        const cifrado = await C.cifrar(llave, JSON.stringify({ titulo: d.titulo, texto: form.texto.value }));
        await api('guardarCredencial', { credencial_id: d.credencial_id, iv: cifrado.iv, datos: cifrado.datos });
      });
      if (!ok) return;
      aviso(d.credencial_id ? 'Credencial actualizada.' : 'Credencial guardada.');
      pintarAbierta();
    });
    pintarLista();
  }

  function pintarLista() {
    const lista = vista.querySelector('#cr-lista');
    lista.innerHTML = credenciales.length ? credenciales.map(c => `
      <details class="sin-respaldo credencial" data-id="${esc(c.id)}">
        <summary><strong>${esc(c.actual.titulo)}</strong><span class="nota mono">actualizada ${fmtFechaHora(c.actual.registrado_en)}</span></summary>
        <pre class="vista-previa credencial-texto">${esc(c.actual.texto)}</pre>
        <div class="acciones">
          <button type="button" class="btn btn-sec btn-chico" data-accion="copiar">Copiar texto</button>
          <button type="button" class="btn btn-sec btn-chico" data-accion="editar">Editar</button>
          <button type="button" class="btn btn-sec btn-chico" data-accion="borrar">Borrar</button>
        </div>
        ${c.versiones.length > 1 ? `<details class="historial-credencial">
          <summary class="nota">Historial (${c.versiones.length - 1} ${c.versiones.length === 2 ? 'versión anterior' : 'versiones anteriores'})</summary>
          ${c.versiones.slice(0, -1).reverse().map(x => `<div class="entrada-bitacora">
            <span class="mono nota">${fmtFechaHora(x.registrado_en)} · ${esc(x.titulo)}</span>
            <p class="texto-libre">${esc(x.texto)}</p></div>`).join('')}
        </details>` : ''}
      </details>`).join('') : vacioHtml('Todavía no hay credenciales guardadas.');

    lista.onclick = async e => {
      const b = e.target.closest('[data-accion]');
      if (!b) return;
      const c = credenciales.find(x => x.id === b.closest('.credencial').dataset.id);
      if (b.dataset.accion === 'copiar') {
        try { await copiarTexto(c.actual.texto); aviso('Texto copiado.'); } catch (err) { aviso(err.message, 'error'); }
      } else if (b.dataset.accion === 'editar') {
        editar(c);
      } else if (b.dataset.accion === 'borrar') {
        if (!confirm(`¿Borrar "${c.actual.titulo}"?`)) return;
        const ok = await conBoton(b, () => api('borrarCredencial', { credencial_id: c.id }), 'Borrando…');
        if (ok) { aviso('Credencial borrada.'); pintarAbierta(); }
      }
    };
  }

  /** Pasa el formulario a modo edición (o lo limpia con null) */
  function editar(c) {
    const form = vista.querySelector('#cr-form');
    form.credencial_id.value = c ? c.id : '';
    form.titulo.value = c ? c.actual.titulo : '';
    form.texto.value = c ? c.actual.texto : '';
    vista.querySelector('#cr-titulo-form').textContent = c ? 'Editar credencial' : 'Nueva credencial';
    vista.querySelector('#cr-cancelar').hidden = !c;
    if (c) { form.scrollIntoView({ behavior: 'smooth', block: 'start' }); form.titulo.focus(); }
  }

  return { render };
})();
