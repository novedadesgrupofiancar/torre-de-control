/* ===== Configuración ===== */
Modulos.Configuracion = (() => {
  // Listas editables: clave de configuración → título
  const LISTAS = [
    ['motivos', 'Motivos de falta'],
    ['talleres', 'Talleres'],
    ['redes', 'Redes'],
    ['turnos', 'Turnos de monitoreo de redes'],
    ['lineas_whatsapp', 'Líneas de WhatsApp'],
    ['escalado', 'Destinos de escalado de issues']
  ];
  const PALABRAS = [
    ['canepas', 'Lo hace en Canepas'],
    ['venta', 'No tiene el auto / lo vendió'],
    ['ya_vino', 'Ya vino / el km no es el de la hoja']
  ];
  let vista, borrador; // borrador: copia local de listas y palabras clave mientras se editan

  async function render(v, s) {
    vista = v;
    Estado.config = await api('obtenerConfiguracion');
    v.innerHTML = encabezado(s) + `
      <section class="tarjeta" id="b-agentes"></section>
      <section class="tarjeta" id="b-horarios"></section>
      <section class="tarjeta" id="b-campanias"></section>
      <section class="tarjeta" id="b-listas"></section>
      <section class="tarjeta" id="b-palabras"></section>
      <section class="tarjeta" id="b-destinatarios"></section>`;
    pintarTodo();
  }

  function pintarTodo() {
    const c = Estado.config;
    borrador = { listas: JSON.parse(JSON.stringify(c.listas)), palabras_clave: JSON.parse(JSON.stringify(c.palabras_clave)) };
    pintarAgentes();
    pintarHorarios();
    pintarCampanias();
    pintarListas('b-listas', 'listas', 'Listas editables', 'Lo que se quita de una lista no se borra de los registros ya guardados.', LISTAS);
    pintarListas('b-palabras', 'palabras_clave', 'Palabras clave de No aplica', 'Se usan en Campañas para clasificar los "No aplica" por el comentario del agente (sin distinguir mayúsculas ni acentos).', PALABRAS);
    pintarDestinatarios();
  }

  /** Guarda un bloque y vuelve a dibujar todo con la configuración que devuelve el servidor */
  async function guardar(boton, clave, valor) {
    const ok = await conBoton(boton, async () => { Estado.config = await api('guardarConfiguracion', { bloque: clave, valor }); });
    if (!ok) return;
    aviso('Configuración guardada.');
    pintarTodo();
  }

  /* ---------- Agentes ---------- */

  function filaAgente(a, nuevo) {
    return `<tr data-id="${esc(a.id)}" ${nuevo ? 'data-nuevo="1"' : ''}>
      <td><input name="nombre" value="${esc(a.nombre)}" placeholder="Nombre como figura en las planillas" aria-label="Nombre"></td>
      <td><input name="interno" value="${esc(a.interno)}" inputmode="numeric" placeholder="Ej: 1234" aria-label="Interno 3CX" style="max-width:120px"></td>
      <td><label style="display:flex;gap:8px;align-items:center;min-height:44px"><input type="checkbox" name="activo" ${a.activo ? 'checked' : ''}> Activo</label></td>
      <td>${nuevo ? '<button type="button" class="btn btn-sec btn-chico" data-quitar>Quitar</button>' : ''}</td>
    </tr>`;
  }

  function pintarAgentes() {
    const b = vista.querySelector('#b-agentes');
    b.innerHTML = `
      <div>
        <h2>Agentes</h2>
        <p class="nota">Nombre como figura en las planillas e interno de 3CX. Para una baja, desmarcá "Activo": el historial se conserva.</p>
      </div>
      <div class="tabla-envoltura"><table class="tabla">
        <thead><tr><th>Nombre</th><th>Interno 3CX</th><th>Estado</th><th></th></tr></thead>
        <tbody>${Estado.config.agentes.map(a => filaAgente(a, false)).join('')}</tbody>
      </table></div>
      <div class="acciones">
        <button type="button" class="btn btn-sec" data-agregar>Agregar agente</button>
        <button type="button" class="btn btn-primario" data-guardar>Guardar agentes</button>
      </div>`;
    const tbody = b.querySelector('tbody');
    b.querySelector('[data-agregar]').addEventListener('click', () => {
      tbody.insertAdjacentHTML('beforeend', filaAgente({ id: nuevoIdLocal(), nombre: '', interno: '', activo: true }, true));
      tbody.lastElementChild.querySelector('input').focus();
    });
    tbody.addEventListener('click', e => { if (e.target.closest('[data-quitar]')) e.target.closest('tr').remove(); });
    b.querySelector('[data-guardar]').addEventListener('click', e => {
      const agentes = [...tbody.querySelectorAll('tr')]
        .map(tr => ({
          id: tr.dataset.id,
          nombre: tr.querySelector('[name=nombre]').value.trim(),
          interno: tr.querySelector('[name=interno]').value.trim(),
          activo: tr.querySelector('[name=activo]').checked
        }))
        // Las filas nuevas que quedaron vacías se ignoran
        .filter((a, i) => a.nombre || a.interno || !tbody.children[i].dataset.nuevo);
      guardar(e.currentTarget, 'agentes', agentes);
    });
  }

  /* ---------- Horarios y descansos ---------- */

  function filaDescanso(d) {
    return `<div class="acciones descanso" style="justify-content:flex-start">
      <input type="time" name="d-desde" value="${esc(d.desde)}" aria-label="Inicio del descanso" style="max-width:140px">
      <span class="nota">a</span>
      <input type="time" name="d-hasta" value="${esc(d.hasta)}" aria-label="Fin del descanso" style="max-width:140px">
      <button type="button" class="btn btn-sec btn-chico" data-quitar-descanso>Quitar</button>
    </div>`;
  }

  function pintarHorarios() {
    const b = vista.querySelector('#b-horarios');
    const activos = Estado.config.agentes.filter(a => a.activo);
    b.innerHTML = `
      <div>
        <h2>Horarios y descansos</h2>
        <p class="nota">Entrada, salida y descansos de cada agente activo.</p>
      </div>
      ${activos.length ? `<div class="tabla-envoltura"><table class="tabla">
        <thead><tr><th>Agente</th><th>Entrada</th><th>Salida</th><th>Descansos</th></tr></thead>
        <tbody>${activos.map(a => {
          const h = Estado.config.horarios[a.id] || { entrada: '', salida: '', descansos: [] };
          return `<tr data-id="${esc(a.id)}">
            <td><strong>${esc(a.nombre)}</strong></td>
            <td><input type="time" name="entrada" value="${esc(h.entrada)}" aria-label="Entrada de ${esc(a.nombre)}" style="max-width:140px"></td>
            <td><input type="time" name="salida" value="${esc(h.salida)}" aria-label="Salida de ${esc(a.nombre)}" style="max-width:140px"></td>
            <td><div class="lista descansos">${h.descansos.map(filaDescanso).join('')}</div>
              <button type="button" class="btn btn-sec btn-chico" data-agregar-descanso style="margin-top:8px">Agregar descanso</button></td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>
      <div class="acciones"><button type="button" class="btn btn-primario" data-guardar>Guardar horarios</button></div>`
      : vacioHtml('Primero cargá agentes activos.')}`;
    if (!activos.length) return;
    // onclick (y no addEventListener) para no duplicar el manejador al redibujar el bloque
    b.onclick = e => {
      if (e.target.closest('[data-agregar-descanso]')) {
        e.target.closest('td').querySelector('.descansos').insertAdjacentHTML('beforeend', filaDescanso({ desde: '', hasta: '' }));
      }
      if (e.target.closest('[data-quitar-descanso]')) e.target.closest('.descanso').remove();
    };
    b.querySelector('[data-guardar]').addEventListener('click', e => {
      // Se conservan los horarios de agentes inactivos
      const horarios = Object.assign({}, Estado.config.horarios);
      b.querySelectorAll('tbody > tr').forEach(tr => {
        horarios[tr.dataset.id] = {
          entrada: tr.querySelector('[name=entrada]').value,
          salida: tr.querySelector('[name=salida]').value,
          descansos: [...tr.querySelectorAll('.descanso')].map(d => ({
            desde: d.querySelector('[name=d-desde]').value,
            hasta: d.querySelector('[name=d-hasta]').value
          }))
        };
      });
      guardar(e.currentTarget, 'horarios', horarios);
    });
  }

  /* ---------- Links de campañas ---------- */

  function filaCampania(c) {
    return `<tr>
      <td><input type="month" name="mes" value="${esc(c.mes)}" aria-label="Mes" style="max-width:170px"></td>
      <td><input type="url" name="link_chevrolet" value="${esc(c.link_chevrolet)}" placeholder="https://…" aria-label="Link Chevrolet"></td>
      <td><input type="url" name="link_marcas" value="${esc(c.link_marcas)}" placeholder="https://…" aria-label="Link Marcas"></td>
      <td><button type="button" class="btn btn-sec btn-chico" data-quitar>Quitar</button></td>
    </tr>`;
  }

  function pintarCampanias() {
    const b = vista.querySelector('#b-campanias');
    b.innerHTML = `
      <div>
        <h2>Links de campañas</h2>
        <p class="nota">Una vez por mes: link de la planilla Chevrolet y de la planilla Marcas en Drive.</p>
      </div>
      <div class="tabla-envoltura"><table class="tabla">
        <thead><tr><th>Mes</th><th>Link Chevrolet</th><th>Link Marcas</th><th></th></tr></thead>
        <tbody>${Estado.config.campanias.map(filaCampania).join('')}</tbody>
      </table></div>
      <div class="acciones">
        <button type="button" class="btn btn-sec" data-agregar>Agregar mes</button>
        <button type="button" class="btn btn-primario" data-guardar>Guardar links</button>
      </div>`;
    const tbody = b.querySelector('tbody');
    b.querySelector('[data-agregar]').addEventListener('click', () => {
      tbody.insertAdjacentHTML('afterbegin', filaCampania({ mes: hoyISO().slice(0, 7), link_chevrolet: '', link_marcas: '' }));
    });
    tbody.addEventListener('click', e => { if (e.target.closest('[data-quitar]')) e.target.closest('tr').remove(); });
    b.querySelector('[data-guardar]').addEventListener('click', e => {
      const campanias = [...tbody.querySelectorAll('tr')].map(tr => ({
        mes: tr.querySelector('[name=mes]').value,
        link_chevrolet: tr.querySelector('[name=link_chevrolet]').value.trim(),
        link_marcas: tr.querySelector('[name=link_marcas]').value.trim()
      }));
      guardar(e.currentTarget, 'campanias', campanias);
    });
  }

  /* ---------- Listas editables y palabras clave ---------- */

  function pintarListas(idBloque, clave, titulo, nota, definicion) {
    const b = vista.querySelector('#' + idBloque);
    const datos = borrador[clave];
    b.innerHTML = `
      <div><h2>${esc(titulo)}</h2><p class="nota">${esc(nota)}</p></div>
      <div class="fila-2">
        ${definicion.map(([k, nombre]) => `
          <div class="lista" data-lista="${k}">
            <h3>${esc(nombre)}</h3>
            <div class="pildoras">
              ${datos[k].length ? datos[k].map((item, i) => `<span class="chip">${esc(item)}<button type="button" data-quitar="${i}" aria-label="Quitar ${esc(item)}">×</button></span>`).join('')
                : '<span class="nota">Lista vacía.</span>'}
            </div>
            <form class="acciones" style="justify-content:flex-start;flex-wrap:nowrap" data-agregar-item>
              <input name="item" placeholder="Agregar…" aria-label="Agregar a ${esc(nombre)}">
              <button type="submit" class="btn btn-sec">Agregar</button>
            </form>
          </div>`).join('')}
      </div>
      <div class="acciones"><button type="button" class="btn btn-primario" data-guardar>Guardar ${esc(titulo.toLowerCase())}</button></div>`;

    b.querySelectorAll('[data-lista]').forEach(cont => {
      const k = cont.dataset.lista;
      cont.addEventListener('click', e => {
        const quitar = e.target.closest('[data-quitar]');
        if (!quitar) return;
        datos[k].splice(Number(quitar.dataset.quitar), 1);
        pintarListas(idBloque, clave, titulo, nota, definicion);
      });
      cont.querySelector('[data-agregar-item]').addEventListener('submit', e => {
        e.preventDefault();
        const valor = e.target.item.value.trim();
        if (!valor) return;
        if (datos[k].some(x => x.toLowerCase() === valor.toLowerCase())) { aviso('Ya está en la lista.', 'error'); return; }
        datos[k].push(valor);
        pintarListas(idBloque, clave, titulo, nota, definicion);
        vista.querySelector(`#${idBloque} [data-lista="${k}"] input`).focus();
      });
    });
    b.querySelector('[data-guardar]').addEventListener('click', e => guardar(e.currentTarget, clave, datos));
  }

  /* ---------- Destinatarios ---------- */

  function pintarDestinatarios() {
    const b = vista.querySelector('#b-destinatarios');
    const d = Estado.config.destinatarios;
    b.innerHTML = `
      <div><h2>Destinatarios</h2><p class="nota">Si hay más de un mail, separalos con coma.</p></div>
      <form class="form" autocomplete="off">
        <div class="grid-campos">
          ${campo('Mail de Jimena (resumen)', `<input type="text" name="jimena" value="${esc(d.jimena)}">`)}
          ${campo('Mail de RRHH', `<input type="text" name="rrhh" value="${esc(d.rrhh)}">`)}
        </div>
        <div class="acciones"><button type="submit" class="btn btn-primario">Guardar destinatarios</button></div>
      </form>`;
    const form = b.querySelector('form');
    form.addEventListener('submit', e => {
      e.preventDefault();
      guardar(form.querySelector('[type=submit]'), 'destinatarios', leerForm(form));
    });
  }

  return { render };
})();
