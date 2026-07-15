// js/admin.js
// Controller for the manager admin panel. Ported from cellar-club-admin-prototype.html.
//
// Security: the manager signs in with a passphrase that IS the admin token. It is held
// in sessionStorage (never in source) and sent as `x-admin-token` on every privileged
// call. The Edge Functions (admin-api, send-push, generate-post) compare it against the
// ADMIN_TOKEN secret and use the service-role key internally. The anon client is never
// used for member data here.

const CFG = window.CONFIG || {};
const FN = `${CFG.SUPABASE_URL}/functions/v1`;
const TOKEN_KEY = 'cellar.admin';

let TOKEN = sessionStorage.getItem(TOKEN_KEY) || '';

/* ---------------- function calls ---------------- */
async function fn(name, body) {
  const res = await fetch(`${FN}/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': CFG.SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${CFG.SUPABASE_ANON_KEY}`,
      'x-admin-token': TOKEN,
    },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { signOut(); throw new Error('Session expired — please sign in again.'); }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}
const adminApi = (action, payload = {}) => fn('admin-api', { action, ...payload });

/* ---------------- helpers ---------------- */
function $(id) { return document.getElementById(id); }
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function rands(n) { if (n == null || n === '') return ''; return 'R' + Number(n).toLocaleString('en-ZA', { minimumFractionDigits: Number(n) % 1 ? 2 : 0, maximumFractionDigits: 2 }); }
let toastTimer;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), 2800); }

const NO_NAV = ['login', 'result', 'settings-view'];
function go(id, nav) {
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('on'));
  const view = $(id); if (view) view.classList.add('on');
  $('vp').scrollTop = 0;
  $('nav').classList.toggle('hidden', id === 'login');
  if (nav) setNav(nav);
  loadFor(id);
}
function setNav(n) { document.querySelectorAll('.ni2').forEach((x) => x.classList.toggle('on', x.getAttribute('data-nav') === n)); }

/* ---------------- auth ---------------- */
function signOut() { TOKEN = ''; sessionStorage.removeItem(TOKEN_KEY); go('login'); }

function wireLogin() {
  $('loginform').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pass = $('passphrase').value.trim();
    if (!pass) return;
    TOKEN = pass;
    $('login-err').textContent = 'Signing in…';
    try {
      await adminApi('ping');
      sessionStorage.setItem(TOKEN_KEY, TOKEN);
      $('passphrase').value = '';
      $('login-err').textContent = '';
      const hr = new Date().getHours();
      $('dash-greeting').textContent = (hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening') + ', Ashley';
      go('dash', 'dash');
    } catch (err) {
      TOKEN = '';
      $('login-err').textContent = err.message.includes('expired') ? 'Incorrect passphrase.' : (err.message || 'Sign-in failed.');
    }
  });
}

/* ---------------- per-view loaders ---------------- */
function loadFor(id) {
  if (id === 'dash') loadDash();
  if (id === 'broadcast') loadBroadcastMeta();
  if (id === 'draw') loadDraw();
  if (id === 'staff') loadStaff();
  if (id === 'suppliers') loadSuppliers();
  if (id === 'insights') loadInsights();
  if (id === 'members') loadMembers();
  if (id === 'settings-view') loadMode();
  if (id === 'm-wines') loadManage('wine');
  if (id === 'm-events') loadManage('event');
  if (id === 'm-boxes') loadManage('box');
  if (id === 'm-mags') loadManage('mag');
  if (id === 'm-specials') loadManage('special');
  if (id === 'm-prizes') loadManage('prize');
  if (id === 'luckydraw') loadDrawPrizes();
  if (id === 'prizereports') loadPrizeReports();
  if (id === 'orders') loadOrders();
  if (id === 'maint') loadSyncs();
  if (id === 'adminguide') loadAdminGuide();
  if (id === 'installqr') renderInstallQr();
}

/* ---------------- GUIDE + INSTALL QR ---------------- */
function mdToHtml(md) {
  const e = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const inline = (t) => e(t).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`(.+?)`/g, '<code>$1</code>');
  let html = '', list = null;
  const closeList = () => { if (list) { html += `</${list}>`; list = null; } };
  for (const raw of md.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (/^\s*[-*]\s+/.test(line)) { if (list !== 'ul') { closeList(); html += '<ul>'; list = 'ul'; } html += `<li>${inline(line.replace(/^\s*[-*]\s+/, ''))}</li>`; continue; }
    if (/^\s*\d+\.\s+/.test(line)) { if (list !== 'ol') { closeList(); html += '<ol>'; list = 'ol'; } html += `<li>${inline(line.replace(/^\s*\d+\.\s+/, ''))}</li>`; continue; }
    closeList();
    if (/^###\s+/.test(line)) html += `<h3>${inline(line.replace(/^###\s+/, ''))}</h3>`;
    else if (/^##\s+/.test(line)) html += `<h2>${inline(line.replace(/^##\s+/, ''))}</h2>`;
    else if (/^#\s+/.test(line)) html += `<h1>${inline(line.replace(/^#\s+/, ''))}</h1>`;
    else if (/^---\s*$/.test(line)) html += '<hr>';
    else if (line.trim() === '') { /* paragraph break */ }
    else html += `<p>${inline(line)}</p>`;
  }
  closeList();
  return html;
}
let adminGuideLoaded = false;
async function loadAdminGuide() {
  if (adminGuideLoaded) return;
  const host = $('adminguide-body');
  try {
    const res = await fetch('/ADMIN-GUIDE.md', { cache: 'no-cache' });
    host.innerHTML = mdToHtml(await res.text());
    adminGuideLoaded = true;
  } catch { host.innerHTML = '<div class="empty">Guide unavailable. Reconnect and try again.</div>'; }
}

const INSTALL_URL = 'https://topscellarclub.co.za';
let qrCanvas = null;
async function renderInstallQr() {
  if (qrCanvas) return;
  try {
    const { default: QRCode } = await import('https://esm.sh/qrcode@1.5.4');
    const canvas = document.createElement('canvas');
    await QRCode.toCanvas(canvas, INSTALL_URL, { width: 460, margin: 1, color: { dark: '#100f12', light: '#ffffff' } });
    canvas.style.cssText = 'width:100%;height:auto;display:block;border-radius:10px';
    const host = $('qr-canvas'); host.innerHTML = ''; host.appendChild(canvas);
    qrCanvas = canvas;
  } catch { $('qr-canvas').innerHTML = '<div class="empty">Could not load QR generator (needs internet).</div>'; }
}
function wireInstallQr() {
  $('qr-print').addEventListener('click', () => window.print());
  $('qr-download').addEventListener('click', () => {
    if (!qrCanvas) { toast('QR not ready yet.'); return; }
    const a = document.createElement('a'); a.href = qrCanvas.toDataURL('image/png'); a.download = 'tops-cellar-selection-install-qr.png'; a.click();
  });
}

/* ---------------- MAINTENANCE: wine database import / export ---------------- */
let importRows = null;
async function loadSheetJs() { return await import('https://esm.sh/xlsx@0.18.5'); }
function pickCol(headers, names) { for (const n of names) { const i = headers.indexOf(n); if (i !== -1) return i; } return -1; }

async function onWineFile(e) {
  const file = e.target.files[0]; if (!file) return;
  const prev = $('import-preview'); prev.innerHTML = '<div class="empty">Reading spreadsheet…</div>';
  $('import-commit').hidden = true; importRows = null;
  try {
    const XLSX = await loadSheetJs();
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });
    if (!aoa.length) throw new Error('The spreadsheet is empty.');
    const headers = aoa[0].map((h) => String(h || '').trim().toLowerCase());
    const ci = {
      code: pickCol(headers, ['product code', 'product_code', 'code']),
      desc: pickCol(headers, ['product description', 'description', 'name']),
      size: pickCol(headers, ['size']),
      soh: pickCol(headers, ['soh', 'stock on hand', 'stock']),
      sp: pickCol(headers, ['sp', 'selling price', 'price']),
    };
    if (ci.code === -1) throw new Error('No "Product Code" column found in the file.');
    const rows = [], seen = new Set(); let errors = 0, dupes = 0;
    for (let r = 1; r < aoa.length; r++) {
      const row = aoa[r]; if (!row) continue;
      const code = String(row[ci.code] ?? '').trim();
      if (!code) { errors++; continue; }
      if (seen.has(code)) dupes++; else seen.add(code);
      rows.push({
        product_code: code,
        name: ci.desc !== -1 ? String(row[ci.desc] ?? '').trim() : '',
        size: ci.size !== -1 ? String(row[ci.size] ?? '').trim() : '',
        soh: ci.soh !== -1 ? row[ci.soh] : '',
        selling_price: ci.sp !== -1 ? row[ci.sp] : '',
      });
    }
    const codesRes = await contentApi('list-wine-codes');
    const existing = new Set((codesRes.codes || []).map(String));
    let added = 0, updated = 0;
    for (const c of seen) { if (existing.has(c)) updated++; else added++; }
    importRows = rows;
    prev.innerHTML = `<div class="imp">
      <div class="ir"><span>Rows in file</span><b>${rows.length + errors}</b></div>
      <div class="ir add"><span>New products to add</span><b>${added}</b></div>
      <div class="ir upd"><span>Existing to update</span><b>${updated}</b></div>
      <div class="ir"><span>Duplicate codes in file</span><b>${dupes}</b></div>
      <div class="ir err"><span>Rows ignored (no code)</span><b>${errors}</b></div>
    </div><p class="muted" style="font-size:11px;margin-top:8px">Nothing is saved until you tap Commit. Images, tasting notes and regions are preserved.</p>`;
    $('import-commit').hidden = rows.length === 0;
  } catch (err) {
    prev.innerHTML = `<div class="empty">${esc(err.message || 'Could not read the file.')}</div>`;
  } finally { e.target.value = ''; }
}

async function onImportCommit() {
  if (!importRows || !importRows.length) return;
  const btn = $('import-commit'); btn.disabled = true; btn.textContent = 'Importing…';
  try {
    const r = await contentApi('import-wines', { rows: importRows });
    toast(`Imported ${r.processed} products.`);
    $('import-preview').innerHTML = `<div class="imp"><div class="ir add"><span>Added</span><b>${r.added ?? 0}</b></div><div class="ir upd"><span>Updated (price/stock)</span><b>${r.updated ?? 0}</b></div>${r.skipped ? `<div class="ir err"><span>Skipped (no code)</span><b>${r.skipped}</b></div>` : ''}</div>`;
    $('import-commit').hidden = true; importRows = null;
    loadSyncs();
  } catch (err) { toast(err.message || 'Import failed.'); }
  finally { btn.disabled = false; btn.textContent = 'Commit import'; }
}

async function loadSyncs() {
  const host = $('sync-list'); if (!host) return;
  try {
    const r = await contentApi('list-syncs'); const syncs = r.syncs || [];
    host.innerHTML = syncs.length ? syncs.map((s) => `
      <div class="crow"><div class="ci"><h4>${s.created_at ? new Date(s.created_at).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}${s.rolled_back ? ' · rolled back' : ''}</h4>
      <p>${s.added || 0} added · ${s.updated || 0} updated</p></div>
      ${s.rolled_back ? '' : `<button class="btn ghost" data-rollback="${s.id}" style="padding:8px 12px;font-size:12px">Undo</button>`}</div>`).join('')
      : '<div class="empty">No imports yet.</div>';
  } catch (err) { host.innerHTML = `<div class="empty">${esc(err.message)}</div>`; }
}
async function rollbackSync(id) {
  if (!confirm('Undo this import? Prices/stock are restored to before it, and products it added are removed.')) return;
  try { const r = await contentApi('rollback-sync', { id }); toast(`Rolled back — ${r.restored} restored, ${r.removed} removed.`); loadSyncs(); }
  catch (err) { toast(err.message || 'Rollback failed.'); }
}

async function onWineExport() {
  const btn = $('wine-export'); btn.disabled = true; const label = btn.textContent; btn.textContent = 'Preparing…';
  try {
    const XLSX = await loadSheetJs();
    const { items } = await contentApi('list-wines');
    const data = (items || []).map((w) => ({ 'Product Code': w.product_code || '', 'Product Description': w.name || '', 'Size': w.size || '', 'SOH': w.soh != null ? w.soh : '', 'SP': w.selling_price != null ? w.selling_price : '' }));
    const ws = XLSX.utils.json_to_sheet(data, { header: ['Product Code', 'Product Description', 'Size', 'SOH', 'SP'] });
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Wines');
    XLSX.writeFile(wb, 'tops-cellar-selection-wines.xlsx');
    toast(`Exported ${data.length} products.`);
  } catch (err) { toast(err.message || 'Export failed.'); }
  finally { btn.disabled = false; btn.textContent = label; }
}

function wireMaintenance() {
  $('wine-file').addEventListener('change', onWineFile);
  $('import-commit').addEventListener('click', onImportCommit);
  $('wine-export').addEventListener('click', onWineExport);
  $('sync-list').addEventListener('click', (e) => { const b = e.target.closest('[data-rollback]'); if (b) rollbackSync(b.dataset.rollback); });
}

/* ---------------- PRIZES: Lucky Draw wheel + reports ---------------- */
let DRAW_PRIZES = [];
async function loadDrawPrizes() {
  const sel = $('draw-prize');
  try {
    const r = await contentApi('list-prizes');
    DRAW_PRIZES = (r.items || []).filter((p) => p.active !== false && ((p.qty_available || 0) - (p.qty_awarded || 0)) > 0);
    sel.innerHTML = DRAW_PRIZES.length
      ? DRAW_PRIZES.map((p) => `<option value="${p.id}">${esc(p.name)} — ${(p.qty_available || 0) - (p.qty_awarded || 0)} left</option>`).join('')
      : '<option value="">No available prizes — add one first</option>';
  } catch (err) { sel.innerHTML = `<option value="">${esc(err.message)}</option>`; }
  $('draw-result').hidden = true;
  drawWheel(['Spin', 'to', 'win', 'a', 'prize', '★'], 0);
}

let wheelRot = 0;
function drawWheel(names, rot) {
  const c = $('wheel'); if (!c) return; const x = c.getContext('2d');
  const W = c.width, cx = W / 2, cy = W / 2, R = W / 2 - 6;
  const N = Math.max(names.length, 1), seg = (Math.PI * 2) / N;
  x.clearRect(0, 0, W, W);
  x.save(); x.translate(cx, cy); x.rotate(rot);
  for (let i = 0; i < N; i++) {
    const a0 = -Math.PI / 2 + i * seg;
    x.beginPath(); x.moveTo(0, 0); x.arc(0, 0, R, a0, a0 + seg); x.closePath();
    x.fillStyle = i % 2 ? '#6f1d3a' : '#bda15f'; x.fill();
    x.strokeStyle = 'rgba(0,0,0,.5)'; x.lineWidth = 2; x.stroke();
    x.save(); x.rotate(a0 + seg / 2); x.textAlign = 'right'; x.fillStyle = i % 2 ? '#f4f1ea' : '#1a1206';
    x.font = '600 20px Jost, sans-serif';
    x.fillText(String(names[i] || '').slice(0, 16), R - 14, 7); x.restore();
  }
  x.restore();
  x.beginPath(); x.arc(cx, cy, 26, 0, Math.PI * 2); x.fillStyle = '#000000'; x.fill();
  x.strokeStyle = '#e4cf9a'; x.lineWidth = 3; x.stroke();
}
function spinTo(names, winnerIndex) {
  return new Promise((resolve) => {
    const N = names.length, seg = (Math.PI * 2) / N;
    const target = Math.PI * 2 * 8 - (winnerIndex + 0.5) * seg;
    const dur = 5200, t0 = Date.now();
    (function frame() {
      const t = Math.min(1, (Date.now() - t0) / dur), e = 1 - Math.pow(1 - t, 3);
      wheelRot = target * e; drawWheel(names, wheelRot);
      if (t < 1) requestAnimationFrame(frame); else resolve();
    })();
  });
}
async function runDraw() {
  const prize_id = $('draw-prize').value;
  if (!prize_id) { toast('Add or select a prize first.'); return; }
  const btn = $('draw-run'); btn.disabled = true; btn.textContent = 'Spinning…'; $('draw-result').hidden = true;
  try {
    const r = await contentApi('draw-winner', { prize_id, start: $('draw-start').value || null, end: $('draw-end').value || null, drawn_by: 'admin' });
    await spinTo(r.wheelNames, r.winnerIndex);
    $('draw-winner-name').textContent = r.winner.name;
    $('draw-winner-meta').textContent = `${r.winner.number ? 'Member ' + r.winner.number + ' · ' : ''}${r.participants} entrants · ${r.remaining} left`;
    $('draw-result').hidden = false; fireConfetti(); toast('Winner drawn 🎉'); loadDrawPrizes();
  } catch (err) { toast(err.message || 'Draw failed.'); }
  finally { btn.disabled = false; btn.innerHTML = '&#127920; Run Lucky Draw'; }
}
function fireConfetti() {
  const c = $('confetti'); if (!c) return; c.hidden = false;
  const W = c.width = c.offsetWidth || window.innerWidth, H = c.height = c.offsetHeight || window.innerHeight, x = c.getContext('2d');
  const cols = ['#bda15f', '#e4cf9a', '#f4f1ea', '#6f1d3a'];
  const P = Array.from({ length: 130 }, () => ({ x: Math.random() * W, y: -20 - Math.random() * H * 0.4, r: 4 + Math.random() * 5, vy: 2 + Math.random() * 4, vx: -2 + Math.random() * 4, c: cols[Math.floor(Math.random() * cols.length)], a: Math.random() * Math.PI }));
  const t0 = Date.now();
  (function frame() {
    const el = Date.now() - t0; x.clearRect(0, 0, W, H);
    P.forEach((p) => { p.y += p.vy; p.x += p.vx; p.a += 0.1; x.save(); x.translate(p.x, p.y); x.rotate(p.a); x.fillStyle = p.c; x.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 1.6); x.restore(); });
    if (el < 2800) requestAnimationFrame(frame); else { x.clearRect(0, 0, W, H); c.hidden = true; }
  })();
}

let WINS = [];
async function loadPrizeReports() {
  const host = $('wins-list');
  try {
    const [r, pr] = await Promise.all([contentApi('list-wins'), contentApi('list-prizes')]);
    WINS = r.wins || []; const prizes = pr.items || [];
    $('wins-summary').innerHTML = prizes.length
      ? `<div class="imp">${prizes.map((p) => `<div class="ir"><span>${esc(p.name)}</span><b>${(p.qty_available || 0) - (p.qty_awarded || 0)}/${p.qty_available || 0} left</b></div>`).join('')}</div>`
      : '';
    host.innerHTML = WINS.length
      ? WINS.map((w) => `<div class="crow"><div class="ci"><h4>${esc(w.member_name || '—')}</h4><p>${esc(w.prize_name || '')}${w.prize_value ? ' · ' + rands(w.prize_value) : ''} · ${w.created_at ? new Date(w.created_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}</p></div></div>`).join('')
      : '<div class="empty">No winners drawn yet.</div>';
  } catch (err) { host.innerHTML = `<div class="empty">${esc(err.message)}</div>`; }
}
async function exportWins() {
  try {
    const XLSX = await loadSheetJs();
    const data = WINS.map((w) => ({ Winner: w.member_name || '', 'Member No': w.member_number || '', Prize: w.prize_name || '', Value: w.prize_value != null ? w.prize_value : '', 'Drawn by': w.drawn_by || '', Date: w.created_at ? new Date(w.created_at).toLocaleString('en-ZA') : '', 'Range start': w.range_start || '', 'Range end': w.range_end || '' }));
    const ws = XLSX.utils.json_to_sheet(data, { header: ['Winner', 'Member No', 'Prize', 'Value', 'Drawn by', 'Date', 'Range start', 'Range end'] });
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Prize wins');
    XLSX.writeFile(wb, 'tops-cellar-selection-prize-wins.xlsx');
    toast(`Exported ${data.length} winners.`);
  } catch (err) { toast(err.message || 'Export failed.'); }
}
function wirePrizes() {
  $('draw-run').addEventListener('click', runDraw);
  $('wins-export').addEventListener('click', exportWins);
}

/* ---------------- ORDERS ---------------- */
let ORDERS = [], OITEMS = [], EDIT_ORDER = null;
const OSTATUS = { pending: 'p', paid: 'g', packed: 'a', ready: 'a', collected: 'g', delivered: 'g', cancelled: 'r' };

async function loadOrders() {
  const host = $('orders-list'); host.innerHTML = '<div class="empty">Loading…</div>';
  try { const r = await contentApi('list-orders'); ORDERS = r.items || []; renderOrders(); }
  catch (err) { host.innerHTML = `<div class="empty">${esc(err.message)}</div>`; }
}
function renderOrders() {
  const q = ($('order-search').value || '').trim().toLowerCase();
  const st = $('order-status-filter').value;
  let list = ORDERS;
  if (st) list = list.filter((o) => o.status === st);
  if (q) list = list.filter((o) => {
    const items = (o.items || []).map((i) => `${i.description} ${i.code}`).join(' ');
    return `${o.order_number} ${o.customer_name} ${o.member_number || ''} ${items}`.toLowerCase().includes(q);
  });
  $('orders-list').innerHTML = list.length ? list.map((o) => `
    <div class="crow" data-order="${esc(o.id)}">
      <div class="ci"><h4>${esc(o.customer_name || '—')} <span class="obadge ${OSTATUS[o.status] || 'p'}">${esc(o.status)}</span></h4>
      <p>${esc(o.order_number || '')} · ${rands(o.total || 0)} · ${(o.items || []).length} item(s) · ${o.created_at ? new Date(o.created_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' }) : ''}</p></div>
      <div class="ch">›</div>
    </div>`).join('') : '<div class="empty">No orders yet. Tap “New order”.</div>';
}
function orderFormShow(show) { $('orders').classList.toggle('on', !show); $('order-form').classList.toggle('on', show); $('vp').scrollTop = 0; }
function openOrderForm(o) {
  EDIT_ORDER = o ? o.id : null;
  $('of-title').textContent = o ? `Order ${o.order_number || ''}` : 'New order';
  $('of-customer_name').value = o ? (o.customer_name || '') : '';
  $('of-member_number').value = o ? (o.member_number || '') : '';
  $('of-contact').value = o ? (o.contact || '') : '';
  $('of-order_type').value = o ? (o.order_type || 'wine') : 'wine';
  $('of-fulfilment').value = o ? (o.fulfilment || 'collection') : 'collection';
  $('of-payment_status').value = o ? (o.payment_status || 'unpaid') : 'unpaid';
  $('of-status').value = o ? (o.status || 'pending') : 'pending';
  $('of-discount').value = o && o.discount ? o.discount : '';
  $('of-notes').value = o ? (o.notes || '') : '';
  OITEMS = o && Array.isArray(o.items) ? o.items.map((i) => ({ ...i })) : [{ code: '', description: '', qty: 1, price: '' }];
  renderOItems(); recomputeOTotal();
  $('of-delete').hidden = !o;
  go('order-form');
}
function renderOItems() {
  $('of-items').innerHTML = OITEMS.map((it, i) => `
    <div class="oitem" data-idx="${i}">
      <input class="tinput oi" data-f="description" placeholder="Wine / item" value="${esc(it.description || '')}">
      <div class="frow" style="margin-top:6px">
        <input class="tinput oi" data-f="code" placeholder="Code" value="${esc(it.code || '')}">
        <input class="tinput oi" data-f="qty" inputmode="numeric" placeholder="Qty" value="${it.qty != null ? it.qty : ''}">
        <input class="tinput oi" data-f="price" inputmode="decimal" placeholder="Price" value="${it.price != null ? it.price : ''}">
      </div>
      <div class="oi-rm" data-rm="${i}">Remove item</div>
    </div>`).join('');
}
function recomputeOTotal() {
  const sub = OITEMS.reduce((s, it) => s + (parseInt(it.qty, 10) || 0) * (parseFloat(it.price) || 0), 0);
  const disc = parseFloat($('of-discount').value) || 0;
  $('of-total').value = rands(Math.max(0, sub - disc));
}
async function saveOrder() {
  const customer = $('of-customer_name').value.trim();
  if (!customer) { toast('Customer name is required.'); return; }
  const btn = $('of-save'); btn.disabled = true; btn.textContent = 'Saving…';
  try {
    await contentApi('save-order', {
      id: EDIT_ORDER || undefined, customer_name: customer,
      member_number: $('of-member_number').value.trim(), contact: $('of-contact').value.trim(),
      order_type: $('of-order_type').value, fulfilment: $('of-fulfilment').value,
      payment_status: $('of-payment_status').value, status: $('of-status').value,
      discount: $('of-discount').value.trim(), notes: $('of-notes').value.trim(),
      items: OITEMS.filter((it) => (it.description || '').trim() || (it.code || '').trim()),
    });
    toast('Order saved.'); await loadOrders(); go('orders');
  } catch (err) { toast(err.message || 'Save failed.'); }
  finally { btn.disabled = false; btn.textContent = 'Save order'; }
}
async function deleteOrder() {
  if (!EDIT_ORDER) { go('orders'); return; }
  if (!confirm('Delete this order permanently?')) return;
  try { await contentApi('delete-order', { id: EDIT_ORDER }); toast('Order deleted.'); await loadOrders(); go('orders'); }
  catch (err) { toast(err.message || 'Delete failed.'); }
}
async function exportOrders() {
  try {
    const XLSX = await loadSheetJs();
    const data = ORDERS.map((o) => ({
      'Order': o.order_number || '', 'Customer': o.customer_name || '', 'Member No': o.member_number || '',
      'Contact': o.contact || '', 'Type': o.order_type || '', 'Fulfilment': o.fulfilment || '',
      'Items': (o.items || []).map((i) => `${i.qty}x ${i.description}`).join('; '),
      'Discount': o.discount || 0, 'Total': o.total || 0, 'Payment': o.payment_status || '', 'Status': o.status || '',
      'Date': o.created_at ? new Date(o.created_at).toLocaleString('en-ZA') : '',
    }));
    const ws = XLSX.utils.json_to_sheet(data); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Orders');
    XLSX.writeFile(wb, 'tops-cellar-selection-orders.xlsx');
    toast(`Exported ${data.length} orders.`);
  } catch (err) { toast(err.message || 'Export failed.'); }
}
function wireOrders() {
  $('order-new').addEventListener('click', () => openOrderForm(null));
  $('order-search').addEventListener('input', renderOrders);
  $('order-status-filter').addEventListener('change', renderOrders);
  $('orders-export').addEventListener('click', exportOrders);
  $('orders-list').addEventListener('click', (e) => { const row = e.target.closest('.crow[data-order]'); if (row) openOrderForm(ORDERS.find((o) => o.id === row.dataset.order)); });
  $('of-additem').addEventListener('click', () => { OITEMS.push({ code: '', description: '', qty: 1, price: '' }); renderOItems(); });
  $('of-discount').addEventListener('input', recomputeOTotal);
  $('of-save').addEventListener('click', saveOrder);
  $('of-cancel').addEventListener('click', () => go('orders'));
  $('of-delete').addEventListener('click', deleteOrder);
  $('of-items').addEventListener('input', (e) => {
    const inp = e.target.closest('.oi'); if (!inp) return;
    const idx = parseInt(inp.closest('.oitem').dataset.idx, 10);
    OITEMS[idx][inp.dataset.f] = inp.value; recomputeOTotal();
  });
  $('of-items').addEventListener('click', (e) => {
    const rm = e.target.closest('[data-rm]'); if (!rm) return;
    OITEMS.splice(parseInt(rm.dataset.rm, 10), 1); if (!OITEMS.length) OITEMS.push({ code: '', description: '', qty: 1, price: '' }); renderOItems(); recomputeOTotal();
  });
}

let STATS = null;
async function loadDash() {
  try {
    STATS = await adminApi('stats');
    $('st-members').innerHTML = `${STATS.members}<small> / 500</small>`;
    $('st-members-d').textContent = `+${STATS.members_this_week || 0} this week`;
    $('st-waitlist').textContent = STATS.waitlist ?? 0;
    $('st-open').textContent = STATS.push_open_rate != null ? STATS.push_open_rate + '%' : '—';
    $('st-entrants').textContent = STATS.prize_entrants ?? STATS.members;
    $('dbmode-sub').textContent = STATS.discovery_box_mode === 'live' ? 'Live ordering' : 'Waiting list · flip in September';
  } catch (err) { toast(err.message); }
}

async function loadBroadcastMeta() {
  try { const s = STATS || await adminApi('stats'); $('aud-all-count').textContent = `${s.members} people`; } catch {}
}

async function loadDraw() {
  try {
    const d = await adminApi('draw-status');
    $('draw-month').textContent = `${d.month_label} Draw`;
    $('draw-entrants').textContent = `${d.entrants} members entered · every signup auto-entered`;
    if (d.winner) {
      $('draw-winner').hidden = false;
      $('draw-winner-name').textContent = d.winner.name;
      $('draw-winner-meta').textContent = d.winner.meta;
      $('btn-draw').textContent = 'Re-draw';
    } else { $('draw-winner').hidden = true; $('btn-draw').textContent = 'Draw a winner'; }
    $('past-winners').innerHTML = (d.past || []).length
      ? d.past.map((p) => `<div class="pw"><span class="mo">${esc(p.month_label)}</span><span class="nm">${esc(p.name)} · ${esc(p.prize || '')}</span></div>`).join('')
      : '<div class="empty">No past winners yet.</div>';
  } catch (err) { toast(err.message); }
}

async function loadStaff() {
  try {
    const r = await adminApi('staff-leaderboard');
    $('staff-month').textContent = `${r.month_label} · signups by staff`;
    $('staff-list').innerHTML = (r.staff || []).length
      ? r.staff.map((s, i) => `<div class="lrow2${i === 0 ? ' top' : ''}"><div class="rk">${i === 0 ? '⭐' : i + 1}</div><div class="nm">${esc(s.name)}</div><div class="ct">${s.count}<small> joins</small></div></div>`).join('')
      : '<div class="empty">Add staff members and codes to start tracking.</div>';
  } catch (err) { toast(err.message); }
}

async function loadSuppliers() {
  try {
    const r = await adminApi('suppliers');
    const tierClass = { featured: 'f', discovery_box: 'd', premier: 'p' };
    const tierLabel = { featured: 'Featured', discovery_box: 'Box', premier: 'Premier' };
    $('suppliers-list').innerHTML = (r.suppliers || []).length
      ? r.suppliers.map((s) => `<div class="sup"><div class="si"><h4>${esc(s.name)}</h4><p>${esc(s.featured_month ? 'Featured ' + s.featured_month : (s.brand_story || '').slice(0, 40))}</p></div><span class="tier ${tierClass[s.tier] || 'f'}" data-supplier="${esc(s.id)}" data-act="cycle-tier">${tierLabel[s.tier] || 'Featured'}</span></div>`).join('')
      : '<div class="empty">No suppliers yet.</div>';
  } catch (err) { toast(err.message); }
}

async function loadInsights() {
  try {
    const s = STATS || await adminApi('stats');
    $('ins-members').innerHTML = `${s.members}<small> / 500</small>`;
    $('ins-bar').style.width = Math.min(100, Math.round((s.members / 500) * 100)) + '%';
    $('ins-push').textContent = s.push_open_rate != null ? s.push_open_rate + '%' : '—';
    $('ins-email').textContent = s.email_open_rate != null ? s.email_open_rate + '%' : '—';
    $('ins-enabled').textContent = s.fully_enabled != null ? s.fully_enabled + '%' : '—';
    $('ins-waitlist').textContent = s.waitlist ?? 0;
    const zones = s.zones || {};
    const max = Math.max(1, ...Object.values(zones));
    const order = ['checkout', 'wine', 'entrance', 'whisky'];
    const labels = { checkout: 'Checkout', wine: 'Wine', entrance: 'Entrance', whisky: 'Whisky' };
    const keys = order.filter((k) => k in zones).concat(Object.keys(zones).filter((k) => !order.includes(k)));
    $('ins-zones').innerHTML = keys.length
      ? keys.map((k) => `<div class="zone"><span class="zl">${esc(labels[k] || k)}</span><div class="zb"><i style="width:${Math.round((zones[k] / max) * 100)}%"></i></div><span class="zv">${zones[k]}</span></div>`).join('')
      : '<div class="empty">No signups yet.</div>';
  } catch (err) { toast(err.message); }
}

let MEMBERS = [];
async function loadMembers() {
  try {
    const r = await contentApi('list-members');
    MEMBERS = r.members || [];
    renderMembers(MEMBERS);
  } catch (err) { toast(err.message); }
}
function renderMembers(list) {
  $('members-list').innerHTML = list.length
    ? list.map((m) => `<div class="mrow"><div class="av">${esc((m.first_name || '?')[0])}</div>
        <div class="mi"><h4>${esc(m.first_name)} ${esc(m.surname)}</h4><p>No. ${esc(m.membership_number || '—')} · joined ${m.created_at ? new Date(m.created_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' }) : ''}</p></div>
        <select class="mtype" data-member="${esc(m.id)}">
          <option value=""${!m.membership_type ? ' selected' : ''}>General</option>
          <option value="box"${m.membership_type === 'box' ? ' selected' : ''}>Box</option>
          <option value="wine"${m.membership_type === 'wine' ? ' selected' : ''}>Wine</option>
          <option value="premium"${m.membership_type === 'premium' ? ' selected' : ''}>Premium</option>
        </select></div>`).join('')
    : '<div class="empty">No members yet.</div>';
}
async function onSetMemberType(sel) {
  try { await contentApi('set-member-type', { member_id: sel.dataset.member, membership_type: sel.value }); toast('Member updated.'); const m = MEMBERS.find((x) => x.id === sel.dataset.member); if (m) m.membership_type = sel.value; }
  catch (err) { toast(err.message || 'Update failed.'); }
}

async function loadMode() {
  try {
    const s = STATS || await adminApi('stats');
    document.querySelectorAll('#dbmode .aud').forEach((a) => a.classList.toggle('on', a.dataset.mode === (s.discovery_box_mode || 'waitlist')));
  } catch {}
}

/* ---------------- CREATE: AI post ---------------- */
const post = { type: 'Member Special', photoBase64: null, photoMediaType: null, photoDataUrl: null, photoUrl: null, price: null, price_found: false, showImage: true, channels: ['push', 'in_app'] };

function wireCreate() {
  $('post-types').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip'); if (!chip) return;
    document.querySelectorAll('#post-types .chip').forEach((c) => c.classList.remove('on'));
    chip.classList.add('on'); post.type = chip.dataset.val;
  });
  $('photo-input').addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    post.photoDataUrl = dataUrl;
    post.photoMediaType = file.type || 'image/jpeg';
    post.photoBase64 = dataUrl.split(',')[1];
    const img = $('photo-preview'); img.src = dataUrl; img.hidden = false;
    $('photo-cap').textContent = '📷 Tap to change photo';
    $('btn-enhance').hidden = false;
    $('enhance-styles').hidden = false;
    uploadPhoto();
  });
  $('btn-enhance').addEventListener('click', onEnhance);
  $('enhance-styles').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip'); if (!chip) return;
    document.querySelectorAll('#enhance-styles .chip').forEach((c) => c.classList.remove('on'));
    chip.classList.add('on');
  });
  $('btn-generate').addEventListener('click', onGenerate);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file);
  });
}
async function uploadPhoto() {
  if (!post.photoBase64) return;
  try {
    const r = await adminApi('upload-image', { imageBase64: post.photoBase64, imageMediaType: post.photoMediaType });
    if (r.url) post.photoUrl = r.url;
  } catch {}
}

async function onEnhance() {
  if (!post.photoBase64) { toast('Add a photo first.'); return; }
  const btn = $('btn-enhance'); btn.disabled = true; $('enhance-label').textContent = 'Creating scene…';
  try {
    const style = document.querySelector('#enhance-styles .chip.on')?.dataset.val || '';
    const r = await fn('enhance-photo', {
      imageBase64: post.photoBase64,
      imageMediaType: post.photoMediaType,
      style,
    });
    if (r.error) throw new Error(r.error);
    const dataUrl = `data:image/png;base64,${r.enhancedImageBase64}`;
    post.photoBase64 = r.enhancedImageBase64;
    post.photoMediaType = 'image/png';
    post.photoDataUrl = dataUrl;
    post.photoUrl = null;
    const img = $('photo-preview'); img.src = dataUrl;
    uploadPhoto();
    toast('Photo enhanced! Now generate your post.');
  } catch (err) {
    toast(err.message || 'Could not enhance the photo.');
  } finally { btn.disabled = false; $('enhance-label').textContent = 'Enhance photo with AI scene'; }
}

async function onGenerate() {
  if (!post.photoBase64 && !$('raw-line').value.trim()) { toast('Add a photo or a line of text first.'); return; }
  const btn = $('btn-generate'); btn.disabled = true; $('gen-label').textContent = 'Writing your post…';
  try {
    const r = await contentFn('generate-post', {
      postType: post.type,
      photoBase64: post.photoBase64,
      photoMediaType: post.photoMediaType,
      rawText: $('raw-line').value.trim(),
    });
    if (r.error) throw new Error(r.error);
    fillResult(r);
    go('result');
  } catch (err) {
    toast(err.message || 'Could not generate the post.');
  } finally { btn.disabled = false; $('gen-label').textContent = 'Generate post'; }
}

function fillResult(r) {
  post.price = r.price || null;
  post.price_found = !!r.price_found && !!r.price;
  $('post-ribbon').textContent = post.type.toUpperCase();
  $('post-kicker').textContent = r.subhead || '';
  $('post-headline').textContent = r.headline || '';
  $('post-body').textContent = r.body || '';
  $('edit-headline').value = r.headline || '';
  $('edit-kicker').value = r.subhead || '';
  $('edit-body').value = r.body || '';
  // product image (optional — managers can toggle it off for a text-only poster)
  post.showImage = !!post.photoDataUrl;
  $('tog-image').classList.toggle('on', post.showImage);
  renderPostImage();
  applyPriceUi();
  // live edit bindings
  $('edit-headline').oninput = () => { $('post-headline').textContent = $('edit-headline').value; };
  $('edit-kicker').oninput = () => { $('post-kicker').textContent = $('edit-kicker').value; };
  $('edit-body').oninput = () => { $('post-body').textContent = $('edit-body').value; };
  $('post-price-input').oninput = () => { post.price = $('post-price-input').value.trim(); post.price_found = !!post.price; applyPriceBadge(); };
}

function renderPostImage() {
  const host = $('post-image');
  if (!post.showImage) { host.hidden = true; host.innerHTML = ''; return; }
  host.hidden = false;
  if (post.photoDataUrl) host.innerHTML = `<img src="${post.photoDataUrl}" alt="product" />`;
  else host.innerHTML = '<div class="cbottle"><div class="nk"></div><div class="bd"></div><div class="lb"></div></div>';
}
function applyPriceUi() {
  $('post-okchip').hidden = !post.price_found;
  $('post-warnbox').hidden = post.price_found;
  if (post.price_found) $('post-okchip').innerHTML = `✓ Price confirmed — ${esc(formatPrice(post.price))}`;
  applyPriceBadge();
}
function formatPrice(p) { const s = String(p).replace(/[^\d.]/g, ''); return s ? 'R' + s : ''; }
function applyPriceBadge() {
  const badge = $('post-badge'); const val = $('post-price');
  // Price is optional: show the badge only when a price exists, otherwise hide it entirely.
  if (post.price && post.price_found) { badge.hidden = false; badge.classList.remove('warn'); val.textContent = formatPrice(post.price); }
  else { badge.hidden = true; }
}

function wireResult() {
  $('post-channels').addEventListener('click', (e) => { const t = e.target.closest('.tog'); if (t) t.classList.toggle('on'); });
  $('tog-image').addEventListener('click', () => {
    post.showImage = !post.showImage;
    $('tog-image').classList.toggle('on', post.showImage);
    renderPostImage();
  });
  $('btn-approve').addEventListener('click', onApproveSend);
}

async function onApproveSend() {
  // Price is optional — send with or without one.
  const channels = [...document.querySelectorAll('#post-channels .tog.on')].map((t) => t.dataset.ch);
  if (!channels.length) { toast('Pick at least one channel.'); return; }
  const btn = $('btn-approve'); btn.disabled = true; btn.textContent = 'Sending…';
  const headline = $('edit-headline').value.trim();
  const body = `${$('edit-kicker').value.trim()} — ${$('edit-body').value.trim()}`.replace(/^ — /, '');
  try {
    // 1) record the post as a published special (draft→published, audited)
    const postImage = (post.showImage && post.photoUrl) || undefined;
    await adminApi('create-post', {
      postType: post.type,
      title: headline,
      body: $('edit-body').value.trim(),
      price: formatPrice(post.price).replace('R', ''),
      kicker: $('edit-kicker').value.trim(),
      source_photo: post.showImage && post.photoDataUrl ? true : false,
      image_url: postImage,
    }).catch(() => {});
    // 2) broadcast it (push/in-app/email) via the send engine
    const pushChannels = channels.filter((c) => c !== 'web');
    if (pushChannels.length) {
      await contentFn('send-push', { title: headline, body, image: postImage, audience: { type: 'all' }, channels: pushChannels, sent_by: 'admin' });
    }
    toast('Post approved & sent.');
    go('dash', 'dash');
  } catch (err) { toast(err.message || 'Send failed.'); }
  finally { btn.disabled = false; btn.textContent = 'Approve & send'; }
}

/* branded-template compositing (canvas) — NOT AI re-rendering of the product */
async function downloadCard() {
  const W = 1080, H = 1350;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  // wine gradient background
  const g = x.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#6f1d3a'); g.addColorStop(.58, '#3d121b'); g.addColorStop(1, '#160709');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  // gold hairline frame
  x.strokeStyle = 'rgba(194,162,90,.6)'; x.lineWidth = 3; x.strokeRect(40, 40, W - 80, H - 80);
  // product photo (centred, not restyled) — only when the image toggle is on
  if (post.showImage && post.photoDataUrl) {
    const img = await loadImg(post.photoDataUrl);
    const maxW = W * 0.6, maxH = H * 0.42;
    const r = Math.min(maxW / img.width, maxH / img.height);
    const dw = img.width * r, dh = img.height * r;
    x.drawImage(img, (W - dw) / 2, 360, dw, dh);
  }
  // ribbon
  x.fillStyle = '#d8bd7e'; roundRect(x, 70, 80, 360, 64, 32); x.fill();
  x.fillStyle = '#241a08'; x.font = '700 28px Jost, sans-serif'; x.textBaseline = 'middle';
  x.fillText(post.type.toUpperCase(), 100, 113);
  // price badge
  if (post.price_found && post.price) {
    x.beginPath(); x.arc(W - 150, 150, 86, 0, Math.PI * 2); x.fillStyle = '#100f12'; x.fill();
    x.lineWidth = 3; x.strokeStyle = '#c2a25a'; x.stroke();
    x.fillStyle = '#d8bd7e'; x.font = '700 22px Jost'; x.textAlign = 'center'; x.fillText('ONLY', W - 150, 122);
    x.fillStyle = '#f7f4ee'; x.font = '600 46px "Cormorant Garamond", serif'; x.fillText(formatPrice(post.price), W - 150, 168);
    x.textAlign = 'left';
  }
  // copy
  x.textAlign = 'center';
  x.fillStyle = '#d8bd7e'; x.font = '700 26px Jost'; x.fillText(($('edit-kicker').value || '').toUpperCase(), W / 2, 880);
  x.fillStyle = '#f7f4ee'; x.font = '600 72px "Cormorant Garamond", serif';
  wrapText(x, $('edit-headline').value || '', W / 2, 960, W - 200, 76);
  x.fillStyle = 'rgba(247,244,238,.85)'; x.font = '400 30px Jost';
  wrapText(x, $('edit-body').value || '', W / 2, 1130, W - 240, 40);
  x.fillStyle = '#c2a25a'; x.font = '700 22px Jost'; x.fillText('TOPS CELLAR SELECTION · BEACON ISLE', W / 2, H - 80);

  const a = document.createElement('a');
  a.href = c.toDataURL('image/png'); a.download = 'cellar-post.png'; a.click();
  toast('Branded card saved.');
}
function loadImg(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }); }
function roundRect(x, rx, ry, w, h, r) { x.beginPath(); x.moveTo(rx + r, ry); x.arcTo(rx + w, ry, rx + w, ry + h, r); x.arcTo(rx + w, ry + h, rx, ry + h, r); x.arcTo(rx, ry + h, rx, ry, r); x.arcTo(rx, ry, rx + w, ry, r); x.closePath(); }
function wrapText(ctx, text, cx, cy, maxW, lh) {
  const words = String(text).split(' '); let line = '', y = cy;
  for (const w of words) {
    const test = line + w + ' ';
    if (ctx.measureText(test).width > maxW && line) { ctx.fillText(line.trim(), cx, y); line = w + ' '; y += lh; }
    else line = test;
  }
  ctx.fillText(line.trim(), cx, y);
}

/* ---------------- BROADCAST ---------------- */
function wireBroadcast() {
  $('bc-audience').addEventListener('click', (e) => {
    const a = e.target.closest('.aud'); if (!a) return;
    document.querySelectorAll('#bc-audience .aud').forEach((x) => x.classList.remove('on'));
    a.classList.add('on');
    $('taste-opts').hidden = a.dataset.aud !== 'taste';
  });
  $('bc-channels').addEventListener('click', (e) => { const t = e.target.closest('.tog'); if (t) t.classList.toggle('on'); });
  $('btn-broadcast').addEventListener('click', onBroadcast);
}
async function onBroadcast() {
  const title = $('bc-title').value.trim();
  if (!title) { toast('Add a title.'); return; }
  const audSel = document.querySelector('#bc-audience .aud.on')?.dataset.aud || 'all';
  const audience = (audSel === 'all') ? { type: 'all' } : { type: 'membership', value: audSel };
  const channels = [...document.querySelectorAll('#bc-channels .tog.on')].map((t) => t.dataset.ch);
  if (!channels.length) { toast('Pick at least one channel.'); return; }
  const btn = $('btn-broadcast'); btn.disabled = true; btn.textContent = 'Sending…';
  try {
    const r = await contentFn('send-push', { title, body: $('bc-body').value.trim(), image: $('bc-image').value.trim() || undefined, link: $('bc-link').value.trim() || undefined, audience, channels, sent_by: 'admin' });
    toast(`Sent. ${r.pushed != null ? r.pushed + ' devices reached.' : ''}`);
    $('bc-title').value = ''; $('bc-body').value = ''; $('bc-image').value = ''; $('bc-link').value = '';
    go('dash', 'dash');
  } catch (err) { toast(err.message || 'Broadcast failed.'); }
  finally { btn.disabled = false; btn.textContent = 'Send broadcast'; }
}

/* ---------------- RESET TEST DATA ---------------- */
async function onResetTestData() {
  const email = prompt('Enter your email address to keep your account.\nAll other members, notifications and prize draws will be deleted.');
  if (!email) return;
  if (!confirm(`This will permanently delete all members except "${email}" and clear all notifications.\n\nType OK to continue.`)) return;
  const btn = $('btn-reset'); btn.disabled = true; btn.textContent = 'Resetting…';
  try {
    const r = await adminApi('reset-test-data', { keep_email: email.trim().toLowerCase() });
    if (r.error) throw new Error(r.error);
    toast(`Done. Kept ${r.kept} account(s). Reload the page to see updated stats.`);
    loadStats();
  } catch (err) { toast(err.message || 'Reset failed.'); }
  finally { btn.disabled = false; btn.textContent = '🚫 Reset test data'; }
}

/* ---------------- DRAW / STAFF / SUPPLIERS / MODE / CSV ---------------- */
async function onDraw() {
  const btn = $('btn-draw'); btn.disabled = true; btn.textContent = 'Drawing…';
  try {
    const w = await adminApi('run-draw');
    if (!w.winner) { toast('No eligible members yet.'); }
    else { $('draw-winner').hidden = false; $('draw-winner-name').textContent = w.winner.name; $('draw-winner-meta').textContent = w.winner.meta; toast('Winner drawn 🎉'); }
  } catch (err) { toast(err.message); }
  finally { btn.disabled = false; btn.textContent = 'Re-draw'; loadDraw(); }
}

async function onAddStaff() {
  const name = prompt('Staff member name:'); if (!name) return;
  const code = prompt('Their signup code (e.g. THANDI):'); if (!code) return;
  try { await adminApi('add-staff', { name, code: code.toUpperCase() }); toast('Staff member added.'); loadStaff(); }
  catch (err) { toast(err.message); }
}

async function onAddSupplier() {
  const name = prompt('Supplier name:'); if (!name) return;
  try { await adminApi('add-supplier', { name }); toast('Supplier added.'); loadSuppliers(); }
  catch (err) { toast(err.message); }
}
async function onCycleTier(el) {
  const order = ['featured', 'discovery_box', 'premier'];
  const cur = { Featured: 'featured', Box: 'discovery_box', Premier: 'premier' }[el.textContent.trim()] || 'featured';
  const next = order[(order.indexOf(cur) + 1) % order.length];
  try { await adminApi('set-supplier-tier', { id: el.dataset.supplier, tier: next }); loadSuppliers(); }
  catch (err) { toast(err.message); }
}

function wireMode() {
  $('dbmode').addEventListener('click', (e) => {
    const a = e.target.closest('.aud'); if (!a) return;
    document.querySelectorAll('#dbmode .aud').forEach((x) => x.classList.remove('on')); a.classList.add('on');
  });
  $('btn-save-mode').addEventListener('click', async () => {
    const mode = document.querySelector('#dbmode .aud.on')?.dataset.mode || 'waitlist';
    try { await adminApi('set-setting', { key: 'discovery_box_mode', value: mode }); if (STATS) STATS.discovery_box_mode = mode; toast(`Discovery Box set to ${mode === 'live' ? 'live ordering' : 'waiting list'}.`); go('dash', 'dash'); }
    catch (err) { toast(err.message); }
  });
}

async function exportCsv() {
  try {
    const r = await adminApi('members');
    const rows = r.members || [];
    const head = ['membership_number', 'first_name', 'surname', 'mobile', 'email', 'preferred_store', 'signup_source', 'marketing_consent', 'created_at'];
    const csv = [head.join(',')].concat(rows.map((m) => head.map((h) => `"${String(m[h] ?? '').replace(/"/g, '""')}"`).join(','))).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'cellar-members.csv'; a.click();
    toast(`Exported ${rows.length} members.`);
  } catch (err) { toast(err.message); }
}

/* ---------------- delegation + member search ---------------- */
function wireDelegation() {
  $('admin').addEventListener('click', (e) => {
    const actEl = e.target.closest('[data-act]');
    const goEl = e.target.closest('[data-go]');
    if (actEl) {
      const act = actEl.dataset.act;
      if (act === 'download-card') return downloadCard();
      if (act === 'add-staff') return onAddStaff();
      if (act === 'add-supplier') return onAddSupplier();
      if (act === 'cycle-tier') return onCycleTier(actEl);
      if (act === 'export-csv') return exportCsv();
    }
    if (goEl) go(goEl.dataset.go, goEl.dataset.nav);
  });
  $('btn-draw').addEventListener('click', onDraw);
  $('btn-reset').addEventListener('click', onResetTestData);
  $('member-search').addEventListener('input', () => {
    const q = $('member-search').value.trim().toLowerCase();
    renderMembers(!q ? MEMBERS : MEMBERS.filter((m) => `${m.first_name} ${m.surname} ${m.membership_number} ${m.email}`.toLowerCase().includes(q)));
  });
  $('members-list').addEventListener('change', (e) => { const s = e.target.closest('.mtype'); if (s) onSetMemberType(s); });
}

/* ---------------- MANAGE CATALOGUE (wines / events / boxes) ---------------- */
// Talks to the Netlify admin-content function (auto-deploys; uses service-role key).
async function contentApi(action, payload = {}) {
  const res = await fetch('/.netlify/functions/admin-content', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-token': TOKEN },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) throw new Error('Add your admin passphrase as ADMIN_TOKEN in Netlify to manage content.');
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// Generic caller for any Netlify function that expects the admin token.
async function contentFn(name, payload = {}) {
  const res = await fetch(`/.netlify/functions/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-token': TOKEN },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) throw new Error('Add your admin passphrase as ADMIN_TOKEN in Netlify.');
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function pad2(n) { return String(n).padStart(2, '0'); }
function toLocalInput(iso) { if (!iso) return ''; const d = new Date(iso); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }

function fillWine(w) {
  w = w || {};
  $('wf-product_code').value = w.product_code || ''; $('wf-category').value = w.category || '';
  $('wf-name').value = w.name || ''; $('wf-producer').value = w.producer || ''; $('wf-varietal').value = w.varietal || '';
  $('wf-region').value = w.region || ''; $('wf-country').value = w.country || '';
  $('wf-vintage').value = w.vintage || ''; $('wf-size').value = w.size || ''; $('wf-alcohol').value = w.alcohol != null ? w.alcohol : '';
  $('wf-serving_temp').value = w.serving_temp || '';
  $('wf-selling_price').value = w.selling_price != null ? w.selling_price : ''; $('wf-promo_price').value = w.promo_price != null ? w.promo_price : ''; $('wf-soh').value = w.soh != null ? w.soh : '';
  $('wf-food_pairings').value = w.food_pairings || ''; $('wf-story').value = w.story || ''; $('wf-tasting_notes').value = w.tasting_notes || '';
  $('wf-cellaring_potential').value = w.cellaring_potential || ''; $('wf-avg_rating').value = w.avg_rating != null ? w.avg_rating : '';
  $('wf-awards').value = w.awards || ''; $('wf-image_url').value = w.image_url || '';
  $('wf-active').value = (w.active === false) ? 'false' : 'true';
  const pv = $('wf-photo-preview'); if (pv) { if (w.image_url) { pv.src = w.image_url; pv.hidden = false; } else { pv.hidden = true; pv.src = ''; } }
}

// Shrink a chosen photo to a tidy thumbnail before upload (keeps storage light).
function resizeImage(file, max = 700, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let w = img.width, h = img.height;
      if (w > h && w > max) { h = Math.round(h * max / w); w = max; } else if (h > max) { w = Math.round(w * max / h); h = max; }
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = reject; img.src = url;
  });
}
function setPreview(previewId, url) {
  const pv = $(previewId); if (pv) { if (url) { pv.src = url; pv.hidden = false; } else { pv.hidden = true; pv.src = ''; } }
  const rm = $(previewId.replace('-preview', '-rm')); if (rm) rm.hidden = !url;
}
function removePhoto(urlId, previewId) { $(urlId).value = ''; setPreview(previewId, ''); toast('Photo removed — save to apply.'); }
// Paint a (possibly transparent) PNG cut-out onto a solid white canvas and export
// a JPEG. This is what puts the bottle on a clean white background — done in the
// browser so it never depends on a server-side image library.
function flattenOnWhite(base64png, max = 700, quality = 0.9) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let w = img.width, h = img.height;
      if (w > h && w > max) { h = Math.round(h * max / w); w = max; } else if (h > max) { w = Math.round(w * max / h); h = max; }
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = reject; img.src = 'data:image/png;base64,' + base64png;
  });
}
async function handlePhotoPick(e, targetInputId, previewId, prefix, removeBg) {
  const file = e.target.files[0]; if (!file) return;
  const pv = $(previewId);
  try {
    let dataUrl = await resizeImage(file);
    if (pv) { pv.src = dataUrl; pv.hidden = false; }
    let bgNote = '';
    if (removeBg) {
      toast('Removing background…');
      // Step 1: server runs remove.bg (needs the API key) and returns a transparent cut-out.
      const cut = await contentFn('upload-image', { imageBase64: dataUrl.split(',')[1], mime: 'image/jpeg', prefix, removeBg: true, cutoutOnly: true });
      if (cut.removed && cut.cutoutBase64) {
        // Step 2: flatten the cut-out onto white here in the browser.
        dataUrl = await flattenOnWhite(cut.cutoutBase64);
        if (pv) pv.src = dataUrl;
      } else { bgNote = cut.note || 'Background not removed.'; }
    }
    toast('Uploading photo…');
    // Upload the final image (white-flattened, or the original if removal was skipped).
    const r = await contentFn('upload-image', { imageBase64: dataUrl.split(',')[1], mime: 'image/jpeg', prefix });
    $(targetInputId).value = r.url; setPreview(previewId, r.url);
    toast(bgNote ? bgNote + ' Photo added anyway — save to keep it.' : 'Photo added — save to keep it.');
  } catch (err) { toast(err.message || 'Upload failed.'); }
  finally { e.target.value = ''; }
}
function wirePhotos() {
  [
    ['wf-photo', 'wf-image_url', 'wf-photo-preview', 'wine', true],
    ['ef-photo', 'ef-image_url', 'ef-photo-preview', 'event', false],
    ['bf-photo', 'bf-image_url', 'bf-photo-preview', 'box', false],
    ['gf-photo', 'gf-cover_url', 'gf-photo-preview', 'mag', false],
    ['pf-photo', 'pf-image_url', 'pf-photo-preview', 'prize', false],
    ['sf-photo', 'sf-image_url', 'sf-photo-preview', 'special', false],
  ].forEach(([inp, target, prev, prefix, rmbg]) => {
    const el = $(inp); if (!el) return;
    el.addEventListener('change', (e) => {
      const removeBg = (prefix === 'wine') ? $('wf-removebg').classList.contains('on') : !!rmbg;
      handlePhotoPick(e, target, prev, prefix, removeBg);
    });
    const rmBtn = $(prev.replace('-preview', '-rm')); if (rmBtn) rmBtn.addEventListener('click', () => removePhoto(target, prev));
  });
  const rb = $('wf-removebg'); if (rb) rb.addEventListener('click', () => rb.classList.toggle('on'));
}
function readWine() {
  return {
    product_code: $('wf-product_code').value.trim(), category: $('wf-category').value.trim(),
    name: $('wf-name').value.trim(), producer: $('wf-producer').value.trim(), varietal: $('wf-varietal').value.trim(),
    region: $('wf-region').value.trim(), country: $('wf-country').value.trim(),
    vintage: $('wf-vintage').value.trim(), size: $('wf-size').value.trim(), alcohol: $('wf-alcohol').value.trim(),
    serving_temp: $('wf-serving_temp').value.trim(),
    selling_price: $('wf-selling_price').value.trim(), promo_price: $('wf-promo_price').value.trim(), soh: $('wf-soh').value.trim(),
    food_pairings: $('wf-food_pairings').value.trim(), story: $('wf-story').value.trim(), tasting_notes: $('wf-tasting_notes').value.trim(),
    cellaring_potential: $('wf-cellaring_potential').value.trim(), avg_rating: $('wf-avg_rating').value.trim(),
    awards: $('wf-awards').value.trim(), image_url: $('wf-image_url').value.trim(),
    active: $('wf-active').value,
  };
}

function fillEvent(e) { e = e || {}; $('ef-title').value = e.title || ''; $('ef-datetime').value = toLocalInput(e.datetime); $('ef-location').value = e.location || ''; $('ef-capacity').value = e.capacity != null ? e.capacity : ''; $('ef-description').value = e.description || ''; $('ef-image_url').value = e.image_url || ''; setPreview('ef-photo-preview', e.image_url); }
function readEvent() { const dt = $('ef-datetime').value; return { title: $('ef-title').value.trim(), datetime: dt ? new Date(dt).toISOString() : null, location: $('ef-location').value.trim(), capacity: $('ef-capacity').value.trim(), description: $('ef-description').value.trim(), image_url: $('ef-image_url').value.trim(), status: 'confirmed' }; }

function fillBox(b) { b = b || {}; $('bf-title').value = b.title || ''; $('bf-month').value = b.month || ''; $('bf-price').value = b.price != null ? b.price : ''; $('bf-included').value = Array.isArray(b.included) ? b.included.join('\n') : ''; $('bf-availability').value = b.availability || ''; $('bf-status').value = b.status || 'waitlist'; $('bf-image_url').value = b.image_url || ''; setPreview('bf-photo-preview', b.image_url); }
function readBox() { return { title: $('bf-title').value.trim(), month: $('bf-month').value.trim(), price: $('bf-price').value.trim(), included: $('bf-included').value.split('\n').map((s) => s.trim()).filter(Boolean), availability: $('bf-availability').value.trim(), status: $('bf-status').value, image_url: $('bf-image_url').value.trim() }; }

function fillMag(g) { g = g || {}; $('gf-title').value = g.title || ''; $('gf-category').value = g.category || 'Article'; $('gf-issue_date').value = g.issue_date || ''; $('gf-excerpt').value = g.excerpt || ''; $('gf-body').value = g.body || ''; $('gf-cover_url').value = g.cover_url || ''; $('gf-content_ref').value = g.content_ref || ''; setPreview('gf-photo-preview', g.cover_url); }
function readMag() { return { title: $('gf-title').value.trim(), category: $('gf-category').value, issue_date: $('gf-issue_date').value || null, excerpt: $('gf-excerpt').value.trim(), body: $('gf-body').value.trim(), cover_url: $('gf-cover_url').value.trim(), content_ref: $('gf-content_ref').value.trim() }; }

function fillSpecial(s) { s = s || {}; $('sf-title').value = s.title || ''; $('sf-category').value = s.category || ''; $('sf-member_price').value = s.member_price != null ? s.member_price : ''; $('sf-normal_price').value = s.normal_price != null ? s.normal_price : ''; $('sf-valid_until').value = s.valid_until || ''; $('sf-image_url').value = s.image_url || ''; $('sf-link').value = s.link || ''; $('sf-status').value = s.status || 'published'; setPreview('sf-photo-preview', s.image_url); }
function readSpecial() { return { title: $('sf-title').value.trim(), category: $('sf-category').value.trim(), member_price: $('sf-member_price').value.trim(), normal_price: $('sf-normal_price').value.trim(), valid_until: $('sf-valid_until').value || null, image_url: $('sf-image_url').value.trim(), link: $('sf-link').value.trim(), status: $('sf-status').value }; }

function fillPrize(p) {
  p = p || {};
  $('pf-name').value = p.name || ''; $('pf-description').value = p.description || '';
  $('pf-value').value = p.value != null ? p.value : ''; $('pf-qty_available').value = p.qty_available != null ? p.qty_available : '1';
  $('pf-start_date').value = p.start_date || ''; $('pf-end_date').value = p.end_date || ''; $('pf-image_url').value = p.image_url || '';
  $('pf-is_bonus').value = p.is_bonus ? 'true' : 'false'; $('pf-active').value = (p.active === false) ? 'false' : 'true';
  const rem = (p.qty_available || 0) - (p.qty_awarded || 0);
  $('pf-remaining').textContent = p.id ? `Awarded ${p.qty_awarded || 0} · ${rem} remaining` : '';
  setPreview('pf-photo-preview', p.image_url);
}
function readPrize() {
  return {
    name: $('pf-name').value.trim(), description: $('pf-description').value.trim(),
    value: $('pf-value').value.trim(), qty_available: $('pf-qty_available').value.trim(),
    start_date: $('pf-start_date').value || null, end_date: $('pf-end_date').value || null,
    image_url: $('pf-image_url').value.trim(), is_bonus: $('pf-is_bonus').value, active: $('pf-active').value,
  };
}

const MGR = {
  wine: { p: 'wine', f: 'wf', list: 'list-wines', save: 'save-wine', del: 'delete-wine', fill: fillWine, read: readWine, row: (w) => ({ t: w.name, s: [w.producer, w.region].filter(Boolean).join(' · ') }) },
  event: { p: 'event', f: 'ef', list: 'list-events', save: 'save-event', del: 'delete-event', fill: fillEvent, read: readEvent, row: (e) => ({ t: e.title, s: e.datetime ? new Date(e.datetime).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '' }) },
  box: { p: 'box', f: 'bf', list: 'list-boxes', save: 'save-box', del: 'delete-box', fill: fillBox, read: readBox, row: (b) => ({ t: b.title, s: [b.month, b.status].filter(Boolean).join(' · ') }) },
  mag: { p: 'mag', f: 'gf', list: 'list-mags', save: 'save-mag', del: 'delete-mag', fill: fillMag, read: readMag, row: (g) => ({ t: g.title, s: `${g.category || 'Article'}${g.issue_date ? ' · ' + new Date(g.issue_date).toLocaleDateString('en-ZA', { month: 'short', year: 'numeric' }) : ''}` }) },
  prize: { p: 'prize', f: 'pf', list: 'list-prizes', save: 'save-prize', del: 'delete-prize', fill: fillPrize, read: readPrize, row: (p) => { const rem = (p.qty_available || 0) - (p.qty_awarded || 0); return { t: p.name + (p.is_bonus ? ' · Bonus' : ''), s: `${p.value ? rands(p.value) + ' · ' : ''}${rem}/${p.qty_available || 0} left${p.active === false ? ' · inactive' : ''}` }; } },
  special: { p: 'special', f: 'sf', list: 'list-specials', save: 'save-special', del: 'delete-special', fill: fillSpecial, read: readSpecial, row: (s) => ({ t: s.title, s: `${s.member_price ? rands(s.member_price) : ''}${s.category ? ' · ' + s.category : ''}${s.status !== 'published' ? ' · ' + s.status : ''}` }) },
};
let MITEMS = { wine: [], event: [], box: [], mag: [], prize: [], special: [] };
let EDITING = { wine: null, event: null, box: null, mag: null, prize: null, special: null };
let MSEARCH = { wine: '' };

function mgrShowForm(p) { $(`${p}-list`).hidden = true; $(`${p}-add`).hidden = true; $(`${p}-form`).hidden = false; $('vp').scrollTop = 0; }
function mgrShowList(p) { $(`${p}-list`).hidden = false; $(`${p}-add`).hidden = false; $(`${p}-form`).hidden = true; }

async function loadManage(key) {
  const m = MGR[key];
  mgrShowList(m.p);
  $(`${m.p}-list`).innerHTML = '<div class="empty">Loading…</div>';
  try {
    const r = await contentApi(m.list);
    MITEMS[key] = r.items || [];
    renderManage(key);
  } catch (err) { $(`${m.p}-list`).innerHTML = `<div class="empty">${esc(err.message)}</div>`; }
}
function mFilter(key, items) {
  const q = (MSEARCH[key] || '').trim().toLowerCase();
  if (!q) return items;
  return items.filter((it) => {
    const r = MGR[key].row(it);
    const extra = [it.product_code, it.region, it.producer, it.varietal, it.category].filter(Boolean).join(' ');
    return `${r.t} ${r.s} ${extra}`.toLowerCase().includes(q);
  });
}
function renderManage(key) {
  const m = MGR[key]; const items = mFilter(key, MITEMS[key]);
  const total = MITEMS[key].length;
  $(`${m.p}-list`).innerHTML = items.length
    ? items.map((it) => { const r = m.row(it); return `<div class="crow" data-mid="${esc(it.id)}"><div class="ci"><h4>${esc(r.t || '—')}</h4><p>${esc(r.s || '')}</p></div><div class="ch">›</div></div>`; }).join('')
    : `<div class="empty">${MSEARCH[key] ? 'No matches for “' + esc(MSEARCH[key]) + '”.' : (total ? '' : 'None yet. Tap “Add” to create one.')}</div>`;
}
function openMForm(key, item) {
  const m = MGR[key]; EDITING[key] = item ? item.id : null;
  m.fill(item);
  $(`${m.f}-delete`).hidden = !item;
  mgrShowForm(m.p);
}
async function saveMForm(key) {
  const m = MGR[key]; const body = m.read();
  if (key === 'wine' && !body.name) { toast('Name is required.'); return; }
  if (key === 'event' && (!body.title || !body.datetime)) { toast('Title and date are required.'); return; }
  if (key === 'box' && !body.title) { toast('Title is required.'); return; }
  if (key === 'prize' && !body.name) { toast('Prize name is required.'); return; }
  if (key === 'mag' && !body.title) { toast('Issue title is required.'); return; }
  if (key === 'special' && !body.title) { toast('Title is required.'); return; }
  const btn = $(`${m.f}-save`); btn.disabled = true; const label = btn.textContent; btn.textContent = 'Saving…';
  try {
    await contentApi(m.save, { id: EDITING[key] || undefined, ...body });
    toast('Saved.');
    await loadManage(key);
  } catch (err) { toast(err.message || 'Save failed.'); }
  finally { btn.disabled = false; btn.textContent = label; }
}
async function delMForm(key) {
  const m = MGR[key]; if (!EDITING[key]) { mgrShowList(m.p); return; }
  if (!confirm('Delete this permanently?')) return;
  try { await contentApi(m.del, { id: EDITING[key] }); toast('Deleted.'); await loadManage(key); }
  catch (err) { toast(err.message || 'Delete failed.'); }
}
function wireManage() {
  ['wine', 'event', 'box', 'mag', 'prize', 'special'].forEach((key) => {
    const m = MGR[key];
    $(`${m.p}-add`).addEventListener('click', () => openMForm(key, null));
    $(`${m.f}-save`).addEventListener('click', () => saveMForm(key));
    $(`${m.f}-cancel`).addEventListener('click', () => mgrShowList(m.p));
    $(`${m.f}-delete`).addEventListener('click', () => delMForm(key));
    $(`${m.p}-list`).addEventListener('click', (e) => {
      const row = e.target.closest('.crow'); if (!row) return;
      openMForm(key, MITEMS[key].find((x) => x.id === row.dataset.mid));
    });
  });
  const ws = $('wine-msearch'); if (ws) ws.addEventListener('input', () => { MSEARCH.wine = ws.value; renderManage('wine'); });
}

/* ---------------- boot ---------------- */
function start() {
  wireLogin(); wireCreate(); wireResult(); wireBroadcast(); wireMode(); wireDelegation(); wireManage(); wireInstallQr(); wireMaintenance(); wirePrizes(); wireOrders(); wirePhotos();
  if (TOKEN) {
    const hr = new Date().getHours();
    $('dash-greeting').textContent = (hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening') + ', Ashley';
    go('dash', 'dash');
  } else { go('login'); }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
