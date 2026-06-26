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
    const r = await adminApi('members');
    MEMBERS = r.members || [];
    renderMembers(MEMBERS);
  } catch (err) { toast(err.message); }
}
function renderMembers(list) {
  $('members-list').innerHTML = list.length
    ? list.map((m) => `<div class="mrow"><div class="av">${esc((m.first_name || '?')[0])}</div><div class="mi"><h4>${esc(m.first_name)} ${esc(m.surname)}</h4><p>No. ${esc(m.membership_number || '—')} · joined ${m.created_at ? new Date(m.created_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' }) : ''}</p></div><span class="src">${esc(m.signup_source || 'app')}</span></div>`).join('')
    : '<div class="empty">No members yet.</div>';
}

async function loadMode() {
  try {
    const s = STATS || await adminApi('stats');
    document.querySelectorAll('#dbmode .aud').forEach((a) => a.classList.toggle('on', a.dataset.mode === (s.discovery_box_mode || 'waitlist')));
  } catch {}
}

/* ---------------- CREATE: AI post ---------------- */
const post = { type: 'Member Special', photoBase64: null, photoMediaType: null, photoDataUrl: null, price: null, price_found: false, channels: ['push', 'in_app'] };

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
    const img = $('photo-preview'); img.src = dataUrl;
    toast('Photo enhanced! Now generate your post.');
  } catch (err) {
    toast(err.message || 'Could not enhance the photo.');
  } finally { btn.disabled = false; $('enhance-label').textContent = 'Enhance photo with AI scene'; }
}

async function onGenerate() {
  if (!post.photoBase64 && !$('raw-line').value.trim()) { toast('Add a photo or a line of text first.'); return; }
  const btn = $('btn-generate'); btn.disabled = true; $('gen-label').textContent = 'Writing your post…';
  try {
    const r = await fn('generate-post', {
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
  // product image
  const host = $('post-image');
  if (post.photoDataUrl) host.innerHTML = `<img src="${post.photoDataUrl}" alt="product" />`;
  else host.innerHTML = '<div class="cbottle"><div class="nk"></div><div class="bd"></div><div class="lb"></div></div>';
  applyPriceUi();
  // live edit bindings
  $('edit-headline').oninput = () => { $('post-headline').textContent = $('edit-headline').value; };
  $('edit-kicker').oninput = () => { $('post-kicker').textContent = $('edit-kicker').value; };
  $('edit-body').oninput = () => { $('post-body').textContent = $('edit-body').value; };
  $('post-price-input').oninput = () => { post.price = $('post-price-input').value.trim(); post.price_found = !!post.price; applyPriceBadge(); };
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
  if (post.price_found && post.price) { badge.classList.remove('warn'); val.textContent = formatPrice(post.price); }
  else { badge.classList.add('warn'); val.textContent = '?'; }
}

function wireResult() {
  $('post-channels').addEventListener('click', (e) => { const t = e.target.closest('.tog'); if (t) t.classList.toggle('on'); });
  $('btn-approve').addEventListener('click', onApproveSend);
}

async function onApproveSend() {
  if (!post.price_found || !post.price) { toast('Add a price before sending — we never guess one.'); $('post-price-input')?.focus(); return; }
  const channels = [...document.querySelectorAll('#post-channels .tog.on')].map((t) => t.dataset.ch);
  if (!channels.length) { toast('Pick at least one channel.'); return; }
  const btn = $('btn-approve'); btn.disabled = true; btn.textContent = 'Sending…';
  const headline = $('edit-headline').value.trim();
  const body = `${$('edit-kicker').value.trim()} — ${$('edit-body').value.trim()}`.replace(/^ — /, '');
  try {
    // 1) record the post as a published special (draft→published, audited)
    await adminApi('create-post', {
      postType: post.type,
      title: headline,
      body: $('edit-body').value.trim(),
      price: formatPrice(post.price).replace('R', ''),
      kicker: $('edit-kicker').value.trim(),
      source_photo: post.photoDataUrl ? true : false,
    }).catch(() => {});
    // 2) broadcast it (push/in-app/email) via the send engine
    const pushChannels = channels.filter((c) => c !== 'web');
    if (pushChannels.length) {
      await fn('send-push', { title: headline, body, audience: { type: 'all' }, channels: pushChannels, sent_by: 'admin' });
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
  g.addColorStop(0, '#5e1a27'); g.addColorStop(.58, '#3d121b'); g.addColorStop(1, '#1f0a0f');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  // gold hairline frame
  x.strokeStyle = 'rgba(194,162,90,.6)'; x.lineWidth = 3; x.strokeRect(40, 40, W - 80, H - 80);
  // product photo (centred, not restyled)
  if (post.photoDataUrl) {
    const img = await loadImg(post.photoDataUrl);
    const maxW = W * 0.6, maxH = H * 0.42;
    const r = Math.min(maxW / img.width, maxH / img.height);
    const dw = img.width * r, dh = img.height * r;
    x.drawImage(img, (W - dw) / 2, 360, dw, dh);
  }
  // ribbon
  x.fillStyle = '#d8bd7e'; roundRect(x, 70, 80, 360, 64, 32); x.fill();
  x.fillStyle = '#241a08'; x.font = '700 28px Inter, sans-serif'; x.textBaseline = 'middle';
  x.fillText(post.type.toUpperCase(), 100, 113);
  // price badge
  if (post.price_found && post.price) {
    x.beginPath(); x.arc(W - 150, 150, 86, 0, Math.PI * 2); x.fillStyle = '#100f12'; x.fill();
    x.lineWidth = 3; x.strokeStyle = '#c2a25a'; x.stroke();
    x.fillStyle = '#d8bd7e'; x.font = '700 22px Inter'; x.textAlign = 'center'; x.fillText('ONLY', W - 150, 122);
    x.fillStyle = '#f7f4ee'; x.font = '600 46px "Cormorant Garamond", serif'; x.fillText(formatPrice(post.price), W - 150, 168);
    x.textAlign = 'left';
  }
  // copy
  x.textAlign = 'center';
  x.fillStyle = '#d8bd7e'; x.font = '700 26px Inter'; x.fillText(($('edit-kicker').value || '').toUpperCase(), W / 2, 880);
  x.fillStyle = '#f7f4ee'; x.font = '600 72px "Cormorant Garamond", serif';
  wrapText(x, $('edit-headline').value || '', W / 2, 960, W - 200, 76);
  x.fillStyle = 'rgba(247,244,238,.85)'; x.font = '400 30px Inter';
  wrapText(x, $('edit-body').value || '', W / 2, 1130, W - 240, 40);
  x.fillStyle = '#c2a25a'; x.font = '700 22px Inter'; x.fillText('TOPS CELLAR SELECTION CLUB · BEACON ISLE', W / 2, H - 80);

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
  const audience = audSel === 'store' ? { type: 'store', value: 'Beacon Isle' }
    : audSel === 'taste' ? { type: 'taste', value: $('bc-taste').value }
      : { type: 'all' };
  const channels = [...document.querySelectorAll('#bc-channels .tog.on')].map((t) => t.dataset.ch);
  if (!channels.length) { toast('Pick at least one channel.'); return; }
  const btn = $('btn-broadcast'); btn.disabled = true; btn.textContent = 'Sending…';
  try {
    const r = await fn('send-push', { title, body: $('bc-body').value.trim(), image: $('bc-image').value.trim() || undefined, link: $('bc-link').value.trim() || undefined, audience, channels, sent_by: 'admin' });
    toast(`Sent. ${r.pushed != null ? r.pushed + ' devices reached.' : ''}`);
    $('bc-title').value = ''; $('bc-body').value = ''; $('bc-image').value = ''; $('bc-link').value = '';
    go('dash', 'dash');
  } catch (err) { toast(err.message || 'Broadcast failed.'); }
  finally { btn.disabled = false; btn.textContent = 'Send broadcast'; }
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
  $('member-search').addEventListener('input', () => {
    const q = $('member-search').value.trim().toLowerCase();
    renderMembers(!q ? MEMBERS : MEMBERS.filter((m) => `${m.first_name} ${m.surname} ${m.membership_number} ${m.email}`.toLowerCase().includes(q)));
  });
}

/* ---------------- boot ---------------- */
function start() {
  wireLogin(); wireCreate(); wireResult(); wireBroadcast(); wireMode(); wireDelegation();
  if (TOKEN) {
    const hr = new Date().getHours();
    $('dash-greeting').textContent = (hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening') + ', Ashley';
    go('dash', 'dash');
  } else { go('login'); }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
