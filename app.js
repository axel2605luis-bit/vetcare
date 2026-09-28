/* VetCare · app.js — lógica compartida y por página (localStorage, sin backend) */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const store = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } },
  set(k, v) { localStorage.setItem(k, JSON.stringify(v)); },
  del(k) { localStorage.removeItem(k); }
};
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
const page = document.body.dataset.page;
const pages = {};

let _t;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(_t);
  _t = setTimeout(() => t.classList.remove('show'), 2200);
}

document.addEventListener('DOMContentLoaded', () => {
  mountHeader();
  $$('.nav-link').forEach(a => a.classList.toggle('active', a.dataset.page === page));
  // Buscador del header: en otras páginas envía la búsqueda a expedientes
  $('#searchInput').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !['expedientes', 'inicio'].includes(page)) {
      location.href = 'expedientes.html?q=' + encodeURIComponent(e.target.value.trim());
    }
  });
  if (pages[page]) pages[page]();
});


/* ---------------- COMPROBANTE PDF ---------------- */
function descargarComprobante(c) {
  if (!window.jspdf) return toast('No se pudo cargar el generador de PDF');
  const { jsPDF } = window.jspdf, doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, M = 20, folio = 'VC-' + String(c.id).slice(-8).padStart(8, '0');
  const navy = [6, 29, 67], blue = [0, 79, 152], cyan = [0, 144, 198], gray = [93, 113, 145];

  // Encabezado
  doc.setFillColor(...navy).rect(0, 0, W, 42, 'F');
  doc.setFillColor(...cyan).roundedRect(M, 11, 20, 20, 5, 5, 'F');
  doc.setTextColor(255).setFont('helvetica', 'bold').setFontSize(18).text('V', M + 10, 24.5, { align: 'center' });
  doc.setFontSize(24).text('VetCare', M + 26, 22);
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(144, 194, 231).text('SISTEMA MÉDICO VETERINARIO', M + 26, 29);

  // Título y folio
  doc.setTextColor(...navy).setFont('helvetica', 'bold').setFontSize(18).text('Comprobante de cita', M, 62);
  doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(...gray)
    .text('Folio: ' + folio, W - M, 56, { align: 'right' })
    .text('Emitido: ' + new Date().toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }), W - M, 62, { align: 'right' });
  doc.setDrawColor(...cyan).setLineWidth(0.8).line(M, 67, W - M, 67);

  // Datos de la cita
  const [y0, m0, d0] = c.fecha.split('-');
  const fechaLarga = new Date(+y0, m0 - 1, +d0).toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const filas = [
    ['Mascota', c.mascota], ['Dueño', c.dueno], ['Especie / Raza', c.especie],
    ['Fecha', fechaLarga.charAt(0).toUpperCase() + fechaLarga.slice(1)], ['Hora', c.hora + ' h'],
    ['Motivo de consulta', c.motivo], ['Estado', c.estado]
  ];
  let y = 80;
  filas.forEach(([k, v], i) => {
    const lineas = doc.setFont('helvetica', 'normal').setFontSize(11).splitTextToSize(String(v), W - 2 * M - 62);
    const h = Math.max(11, lineas.length * 5.5 + 5);
    if (i % 2 === 0) doc.setFillColor(240, 246, 252).rect(M, y - 6.5, W - 2 * M, h, 'F');
    doc.setFont('helvetica', 'bold').setTextColor(...blue).text(k, M + 4, y);
    doc.setFont('helvetica', 'normal').setTextColor(...navy).text(lineas, M + 58, y);
    y += h;
  });

  // Indicaciones
  y += 10;
  doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...navy).text('Indicaciones', M, y);
  doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(...gray);
  const notas = ['Presenta este comprobante (impreso o en tu celular) al llegar a la clínica.',
    'Llega 10 minutos antes de tu hora. Horario de atención: 08:00 a 19:00 h.',
    'Si no puedes asistir, cancela o reprograma con anticipación.'];
  notas.forEach((n, i) => doc.text('•  ' + n, M, y + 8 + i * 6));

  // Pie
  doc.setDrawColor(200, 215, 230).setLineWidth(0.3).line(M, 277, W - M, 277);
  doc.setFontSize(8).text('Clínica Veterinaria VetCare · Proyecto Académico — Grupo 501', W / 2, 283, { align: 'center' });

  doc.save(`Comprobante-cita-${folio}.pdf`);
}

/* ---------------- CITAS ---------------- */
pages.citas = () => {
  const KEY = 'vetcare_citas';
  const BADGE = { Pendiente: 'badge-cyan', Confirmada: 'badge-blue', Cancelada: 'badge-navy' };
  seedCitas();
  const form = $('#citaForm'), body = $('#citasBody'), filtro = $('#filtroEstado');
  form.fecha.min = today;
  const load = () => store.get(KEY, []);

  const render = () => {
    const list = load()
      .filter(c => !filtro.value || c.estado === filtro.value)
      .sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
    $('#citasCount').textContent = list.length + (list.length === 1 ? ' cita' : ' citas');
    body.innerHTML = list.length ? list.map(c => `
      <tr>
        <td><strong>${esc(c.mascota)}</strong><br><small>${esc(c.dueno)} · ${esc(c.especie)}</small></td>
        <td>${esc(c.fecha)}<br><small>${esc(c.hora)}</small></td>
        <td>${esc(c.motivo)}</td>
        <td><span class="badge ${BADGE[c.estado]}">${c.estado}</span></td>
        <td class="acts">
          <button class="card-btn card-btn-primary sm" data-id="${c.id}" data-act="Confirmada" ${c.estado === 'Confirmada' ? 'disabled' : ''}>Confirmar</button>
          <button class="card-btn card-btn-secondary sm" data-id="${c.id}" data-act="Cancelada" ${c.estado === 'Cancelada' ? 'disabled' : ''}>Cancelar</button>
          <button class="card-btn card-btn-secondary sm" data-id="${c.id}" data-act="pdf" title="Descargar comprobante en PDF">PDF</button>
          <button class="card-btn card-btn-secondary sm" data-id="${c.id}" data-act="del">Eliminar</button>
        </td>
      </tr>`).join('')
      : '<tr><td colspan="5" class="empty">No hay citas con este estado. Agenda una desde el formulario.</td></tr>';
  };

  // Aviso de éxito con botón para descargar el comprobante de la cita recién agendada
  const ok = $('#citaOk');
  const showOk = c => {
    ok.hidden = false;
    ok.innerHTML = `<strong>¡Cita agendada!</strong><span>${esc(c.mascota)} · ${esc(diaLabel(c.fecha))} a las ${esc(c.hora)}</span>
      <button type="button" class="hero-btn" id="okPdf">Descargar comprobante (PDF)</button>`;
    $('#okPdf').onclick = () => descargarComprobante(c);
    ok.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  form.addEventListener('submit', e => {
    e.preventDefault();
    ok.hidden = true;
    const d = Object.fromEntries(new FormData(form));
    const list = load();
    if (d.fecha === today && d.hora < new Date().toTimeString().slice(0, 5)) return toast('Elige una hora que no haya pasado');
    if (d.hora < '08:00' || d.hora > '19:00') return toast('Horario de atención: 08:00 a 19:00');
    if (list.some(c => c.fecha === d.fecha && c.hora === d.hora && c.estado !== 'Cancelada')) return toast('Ese horario ya está ocupado. Elige otro');
    const nueva = { id: Date.now(), ...d, estado: 'Pendiente' };
    list.push(nueva);
    store.set(KEY, list);
    showOk(nueva);
    form.reset();
    filtro.value = '';
    render();
    toast(d.fecha === today ? 'Cita agendada para hoy a las ' + d.hora : 'Cita agendada para el ' + diaLabel(d.fecha) + ' a las ' + d.hora);
  });

  body.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    const id = +b.dataset.id;
    let list = load();
    if (b.dataset.act === 'pdf') return descargarComprobante(list.find(c => c.id === id));
    if (b.dataset.act === 'del') list = list.filter(c => c.id !== id);
    else list.find(c => c.id === id).estado = b.dataset.act;
    store.set(KEY, list);
    render();
    toast(b.dataset.act === 'del' ? 'Cita eliminada' : 'Cita ' + b.dataset.act.toLowerCase());
  });

  filtro.addEventListener('change', render);
  window.addEventListener('storage', render); // sincroniza entre pestañas
  render();
};

/* ---------------- EXPEDIENTES ---------------- */
pages.expedientes = () => {
  const DATA = [
    { id: 'EXP-001', nombre: 'Luna', especie: 'Canino', raza: 'Golden Retriever', edad: '4 años', peso: '28 kg', sexo: 'Hembra', dueno: 'Ana Ruiz', foto: 'assets/luna.jpeg', pos: 'transform-origin:54% 35%;transform:translate(-4.0%,15.0%) scale(2.0)',
      alergias: ['Pollo', 'Picadura de pulga'],
      vacunas: [['Rabia', '2026-03-12'], ['Parvovirus', '2026-03-12'], ['Polivalente', '2025-09-20']],
      consultas: [
        { f: '2026-08-14', d: 'Dermatitis alérgica', r: 'Antihistamínico oral cada 12 h por 7 días; baño medicado 2 veces por semana.' },
        { f: '2026-03-12', d: 'Vacunación anual', r: 'Sin receta. Próximo refuerzo en 12 meses.' }
      ] },
    { id: 'EXP-002', nombre: 'Max', especie: 'Felino', raza: 'Siamés', edad: '2 años', peso: '4.2 kg', sexo: 'Macho', dueno: 'Carlos Méndez', foto: 'assets/max.jpeg', pos: 'transform-origin:58% 42%;transform:translate(-8.0%,8.0%) scale(1.7)',
      alergias: ['Ninguna conocida'],
      vacunas: [['Triple felina', '2026-02-10'], ['Rabia', '2026-02-10']],
      consultas: [
        { f: '2026-09-01', d: 'Desparasitación', r: 'Antiparasitario oral en dosis única; repetir en 15 días.' },
        { f: '2026-02-10', d: 'Vacunación', r: 'Sin receta.' }
      ] },
    { id: 'EXP-003', nombre: 'Kiwi', especie: 'Ave', raza: 'Periquito australiano', edad: '1 año', peso: '38 g', sexo: 'Macho', dueno: 'Sofía Vega', foto: 'assets/kiwi.jpeg', pos: 'transform-origin:56% 17%;transform:translate(-6.0%,23.8%) scale(2.4)',
      alergias: ['Sensibilidad a humo y aerosoles'],
      vacunas: [['Polioma aviar', '2026-04-05']],
      consultas: [
        { f: '2026-09-20', d: 'Revisión post-operatoria', r: 'Analgésico aviar en gotas cada 12 h por 5 días; reposo en jaula tranquila.' }
      ] }
  ];
  const EKEY = 'vetcare_exp';
  (store.get(EKEY, [])).forEach(sv => { const p = DATA.find(x => x.id === sv.id); if (p) p.consultas = sv.consultas; });
  const consForm = () => store.get('vetcare_session') ? `
    <h3>Registrar consulta</h3>
    <form class="form" id="consForm">
      <div class="row"><label>Diagnóstico<input name="d" required></label><label>Fecha<input type="date" name="f" value="${today}" required></label></div>
      <label>Receta<textarea name="r" rows="2" required></textarea></label>
      <button type="submit" class="hero-btn">Guardar consulta</button>
    </form>` : '<p class="empty">Inicia sesión en Acceso Staff para registrar consultas.</p>';
  const list = $('#expList'), det = $('#expDetail'), q = $('#expSearch'), hs = $('#searchInput');
  let sel = DATA[0].id;

  const avatar = p => `<span class="avatar">${p.nombre[0]}${p.foto ? `<img src="${p.foto}" alt="${p.nombre}" style="${p.pos || ''}" onerror="this.remove()">` : ''}</span>`;

  const renderList = () => {
    const t = q.value.trim().toLowerCase();
    const res = DATA.filter(p => !t || [p.nombre, p.id, p.dueno, p.especie].join(' ').toLowerCase().includes(t));
    list.innerHTML = res.length ? res.map(p => `
      <button class="exp-item ${p.id === sel ? 'active' : ''}" data-id="${p.id}">
        ${avatar(p)}<span><strong>${p.nombre} · ${p.especie}</strong><small>${p.id} · ${esc(p.dueno)}</small></span>
      </button>`).join('') : '<p class="empty">Sin resultados. Prueba con otro nombre o ID.</p>';
    if (res.length && !res.some(p => p.id === sel)) show(res[0].id);
  };

  const show = id => {
    sel = id;
    const p = DATA.find(x => x.id === id);
    $$('.exp-item', list).forEach(b => b.classList.toggle('active', b.dataset.id === id));
    det.innerHTML = `
      <div class="detail-head">${avatar(p)}<div><h2>${p.nombre}</h2><small>${p.id}</small></div></div>
      <div class="info-grid">
        <div><small>Especie</small>${p.especie}</div><div><small>Raza</small>${p.raza}</div>
        <div><small>Edad</small>${p.edad}</div><div><small>Peso</small>${p.peso}</div>
        <div><small>Sexo</small>${p.sexo}</div><div><small>Dueño</small>${esc(p.dueno)}</div>
      </div>
      <h3>Alergias</h3>
      <div class="tags">${p.alergias.map(a => `<span class="badge badge-cyan">${a}</span>`).join('')}</div>
      <h3>Historial de vacunación</h3>
      <div class="table-wrap"><table><thead><tr><th>Vacuna</th><th>Fecha</th></tr></thead>
        <tbody>${p.vacunas.map(v => `<tr><td>${v[0]}</td><td>${v[1]}</td></tr>`).join('')}</tbody></table></div>
      <h3>Consultas médicas y recetas</h3>
      ${p.consultas.map(c => `<div class="consulta"><strong>${esc(c.f)}</strong> · ${esc(c.d)}<br><em>Receta:</em> ${esc(c.r)}</div>`).join('')}
      ${consForm()}`;
  };

  list.addEventListener('click', e => { const b = e.target.closest('.exp-item'); if (b) show(b.dataset.id); });
  det.addEventListener('submit', e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target)), p = DATA.find(x => x.id === sel);
    p.consultas.unshift({ f: d.f, d: d.d.trim(), r: d.r.trim() });
    p.consultas.sort((a, b) => b.f.localeCompare(a.f));
    store.set(EKEY, DATA.map(({ id, consultas }) => ({ id, consultas })));
    show(sel);
    toast('Consulta registrada en ' + p.nombre);
  });
  q.addEventListener('input', () => { hs.value = q.value; renderList(); });
  hs.addEventListener('input', () => { q.value = hs.value; renderList(); });

  const inicial = new URLSearchParams(location.search).get('q');
  if (inicial) q.value = hs.value = inicial;
  renderList();
  show(sel);
};

/* ---------------- DASHBOARD ---------------- */
pages.dashboard = () => {
  if (!store.get('vetcare_session')) { location.replace('staff.html'); return; }
  const KEY = 'vetcare_inv';
  if (!store.get(KEY)) {
    store.set(KEY, [
      { id: 1, n: 'Amoxicilina 250 mg', s: 48, m: 20 }, { id: 2, n: 'Meloxicam 1.5 mg/ml', s: 12, m: 15 },
      { id: 3, n: 'Vacuna antirrábica', s: 30, m: 10 }, { id: 4, n: 'Vacuna polivalente', s: 9, m: 10 },
      { id: 5, n: 'Desparasitante oral', s: 0, m: 12 }, { id: 6, n: 'Suero fisiológico 500 ml', s: 60, m: 25 },
      { id: 7, n: 'Antipulgas en pipeta', s: 22, m: 15 }, { id: 8, n: 'Gasas estériles (paquete)', s: 14, m: 20 }
    ]);
  }
  const estado = i => i.s === 0 ? ['Agotado', 'badge-navy'] : i.s <= i.m ? ['Por reabastecer', 'badge-cyan'] : ['Óptimo', 'badge-blue'];
  const body = $('#invBody'), busq = $('#invSearch'), filtro = $('#invEstado');
  const load = () => store.get(KEY, []);

  // Datos de ejemplo del día (pacientes e ingresos); "por agotar" se calcula del inventario
  const semana = [['Lun', 9], ['Mar', 12], ['Mié', 8], ['Jue', 15], ['Vie', 11], ['Sáb', 14], ['Hoy', 14]];
  const ses = store.get('vetcare_session');
  $('.page-head p').textContent = 'Sesión de ' + ses.nombre + ' · resumen del día e inventario.';
  const prox = proximas(), hoy = prox.filter(c => c.fecha === today);
  semana[6][1] = hoy.length;
  $('#recent').innerHTML = prox.length ? prox.slice(0, 6).map(agendaItem).join('') : '<li>Sin citas próximas.</li>';
  $('#mPacientes').textContent = semana[6][1];
  $('#mIngresos').textContent = '$' + (semana[6][1] * 640).toLocaleString('es-MX') + ' MXN';
  $('#chart').innerHTML = semana.map(([d, n]) => `<div class="bar"><b>${n}</b><i style="height:${n * 9}px"></i>${d}</div>`).join('');

  const render = () => {
    const inv = load(), t = busq.value.trim().toLowerCase();
    $('#mAgotar').textContent = inv.filter(i => i.s <= i.m).length;
    const res = inv.filter(i => (!t || i.n.toLowerCase().includes(t)) && (!filtro.value || estado(i)[0] === filtro.value));
    body.innerHTML = res.length ? res.map(i => `
      <tr><td>${esc(i.n)}</td><td><strong>${i.s}</strong> <small>/ mín. ${i.m}</small></td>
      <td><span class="badge ${estado(i)[1]}">${estado(i)[0]}</span></td>
      <td><button class="card-btn card-btn-secondary sm" data-id="${i.id}">Reabastecer +10</button></td></tr>`).join('')
      : '<tr><td colspan="4" class="empty">No se encontraron productos.</td></tr>';
  };

  body.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    const inv = load();
    inv.find(i => i.id === +b.dataset.id).s += 10;
    store.set(KEY, inv);
    render();
    toast('Inventario actualizado');
  });
  busq.addEventListener('input', render);
  filtro.addEventListener('change', render);
  $('#logout').addEventListener('click', () => { store.del('vetcare_session'); location.href = 'staff.html'; });
  render();
};


/* ---------------- STAFF (login) ----------------
   Las contraseñas ya NO están aquí: viven como hashes PBKDF2 en staff-auth.js,
   generado por staff_auth.py. Aquí solo se verifica con Web Crypto. */
const STAFF_ITERATIONS = 200000; // debe coincidir con ITERATIONS en staff_auth.py
const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

async function hashPass(pass, salt, iter) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256));
}
const sameBytes = (a, b) => a.length === b.length && a.reduce((d, x, i) => d | (x ^ b[i]), 0) === 0;

pages.staff = () => {
  if (store.get('vetcare_session')) { location.replace('dashboard.html'); return; }
  const err = $('#loginError'), btn = $('#loginForm button');
  $('#loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    if (!window.crypto?.subtle) { err.textContent = 'Tu navegador requiere HTTPS para iniciar sesión.'; return; }
    const user = $('#user').value.trim().toLowerCase(), pass = $('#pass').value;
    const rec = (window.STAFF_AUTH || []).find(u => u.user.toLowerCase() === user);
    btn.disabled = true; err.textContent = '';
    try {
      // Si el usuario no existe se calcula igual un hash, para no delatar qué usuarios hay.
      const salt = rec ? b64(rec.salt) : new Uint8Array(16);
      const got = await hashPass(pass, salt, rec ? rec.iter : STAFF_ITERATIONS);
      if (!rec || !sameBytes(got, b64(rec.hash))) { err.textContent = 'Usuario o contraseña incorrectos.'; return; }
      store.set('vetcare_session', { user: rec.user, nombre: rec.nombre, ts: Date.now() });
      toast('Sesión iniciada. Redirigiendo…');
      setTimeout(() => { location.href = 'dashboard.html'; }, 900);
    } finally { btn.disabled = false; }
  });
};

/* ---------------- COMPARTIDO ---------------- */
const LOGO = `<svg xmlns="http://www.w3.org/2000/svg" class="logo-svg" viewBox="0 0 430 120" role="img" aria-label="VetCare, sistema médico veterinario">
  <defs>
    <linearGradient id="badge-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0090C6" />
      <stop offset="100%" stop-color="#004F98" />
    </linearGradient>
    <linearGradient id="light-grad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#90C2E7" />
      <stop offset="100%" stop-color="#FFFFFF" />
    </linearGradient>
    <filter id="soft-lift" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="#061D43" flood-opacity="0.18" />
    </filter>
  </defs>
  <g transform="translate(10, 10)">
    <g filter="url(#soft-lift)">
      <rect x="0" y="0" width="100" height="100" rx="30" fill="url(#badge-grad)" />
      <path d="M 28 36 L 38 22 L 44 32 Z" fill="#FFFFFF" />
      <path d="M 72 36 L 62 22 L 56 32 Z" fill="url(#light-grad)" />
      <path d="M 30 38 C 30 28, 70 28, 70 38 C 70 54, 58 64, 50 64 C 42 64, 30 54, 30 38 Z" fill="#FFFFFF" />
      <ellipse cx="50" cy="46" rx="4" ry="3" fill="#061D43" />
      <path d="M 50 49 V 53 M 47 55 C 49 57, 51 57, 53 55" stroke="#061D43" stroke-width="2" stroke-linecap="round" fill="none" />
      <path d="M 12 76 H 32 L 38 66 L 46 86 L 54 62 L 62 80 L 68 76 H 88" 
            stroke="#90C2E7" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" fill="none" />
    </g>
    <g transform="translate(120, 64)">
      <text x="0" y="0" font-family="'Plus Jakarta Sans', 'Inter', sans-serif" font-weight="800" font-size="46" fill="#061D43" letter-spacing="-1">Vet<tspan fill="#0090C6">Care</tspan></text>
      <text x="2" y="20" font-family="'Plus Jakarta Sans', 'Inter', sans-serif" font-weight="700" font-size="12" fill="#004F98" letter-spacing="3">SISTEMA MÉDICO VETERINARIO</text>
    </g>
  </g>
</svg>
`;

function mountHeader() {
  const ses = store.get('vetcare_session');
  const links = [['inicio', 'index.html', 'Inicio'], ['citas', 'citas.html', 'Citas'], ['expedientes', 'expedientes.html', 'Expedientes'], ['dashboard', 'dashboard.html', 'Dashboard']];
  $('#site-header').outerHTML = `
  <header class="header" id="header">
    <a class="logo-container" href="index.html">${LOGO}</a>
    <div class="search-container">
      <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"/><path d="M20 20L16.65 16.65" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      <input type="text" id="searchInput" placeholder="Buscar expediente, mascota o dueño…" class="search-input" autocomplete="off" aria-label="Buscar">
    </div>
    <nav class="nav-links" id="navLinks">${links.map(l => `<a href="${l[1]}" class="nav-link" data-page="${l[0]}">${l[2]}</a>`).join('')}</nav>
    <a href="${ses ? 'dashboard.html' : 'staff.html'}" class="cta-button" id="staffBtn">${ses ? esc(ses.nombre) : 'Acceso Staff'}</a>
  </header>`;
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const diaLabel = f => f === today ? 'Hoy' : (([y, m, d]) => `${+d} ${MESES[m - 1]}`)(f.split('-'));
const proximas = () => seedCitas().filter(c => c.estado !== 'Cancelada' && c.fecha >= today)
  .sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
const agendaItem = c => `<li><span class="preview-time">${esc(c.hora)}</span><span class="preview-pet">${esc(c.mascota)} · ${esc(c.motivo)} <small class="dia ${c.fecha === today ? 'hoy' : ''}">${diaLabel(c.fecha)}</small></span><span class="dot ${c.estado === 'Confirmada' ? 'dot-blue' : 'dot-cyan'}"></span></li>`;

function seedCitas() {
  if (!store.get('vetcare_citas')) store.set('vetcare_citas', [
      { id: 1, mascota: 'Luna', dueno: 'Ana Ruiz', especie: 'Canino · Golden Retriever', fecha: today, hora: '09:30', motivo: 'Consulta general', estado: 'Confirmada' },
      { id: 2, mascota: 'Max', dueno: 'Carlos Méndez', especie: 'Felino · Siamés', fecha: today, hora: '11:00', motivo: 'Vacunación', estado: 'Pendiente' },
      { id: 3, mascota: 'Kiwi', dueno: 'Sofía Vega', especie: 'Ave · Periquito', fecha: today, hora: '13:15', motivo: 'Revisión post-operatoria', estado: 'Pendiente' }
    ]);
  return store.get('vetcare_citas', []);
}

pages.inicio = () => {
  const cards = $$('.card'), none = $('#noResults'), q = $('#searchInput');
  q.addEventListener('input', () => {
    const t = q.value.trim().toLowerCase();
    let n = 0;
    cards.forEach(c => {
      const ok = !t || (c.textContent + ' ' + (c.dataset.keywords || '')).toLowerCase().includes(t);
      c.style.display = ok ? '' : 'none';
      if (ok) n++;
    });
    none.hidden = n !== 0;
    none.innerHTML = `Ningún módulo coincide con «${esc(t)}». <a href="expedientes.html?q=${encodeURIComponent(t)}">Buscar en expedientes</a>`;
  });
  $$('[data-href]').forEach(b => b.addEventListener('click', () => { location.href = b.dataset.href; }));
  $$('[data-info]').forEach(b => b.addEventListener('click', () => toast(b.dataset.info)));
  const renderAgenda = () => {
    const prox = proximas(), nHoy = prox.filter(c => c.fecha === today).length;
    $('#agendaCount').textContent = nHoy ? nHoy + (nHoy === 1 ? ' cita hoy' : ' citas hoy') : prox.length + (prox.length === 1 ? ' próxima' : ' próximas');
    $('#agendaHoy').innerHTML = prox.length ? prox.slice(0, 5).map(agendaItem).join('') : '<li><span class="preview-pet">No hay citas próximas. Agenda una en Citas.</span></li>';
  };
  renderAgenda();
  window.addEventListener('storage', renderAgenda);
};
