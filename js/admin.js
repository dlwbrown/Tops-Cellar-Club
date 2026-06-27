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
      await fn('send-push', { title: headline, body, image: postImage, audience: { type: 'all' }, channels: pushChannels, sent_by: 'admin' });
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

function fillWine(w) { w = w || {}; $('wf-name').value = w.name || ''; $('wf-producer').value = w.producer || ''; $('wf-varietal').value = w.varietal || ''; $('wf-region').value = w.region || ''; $('wf-country').value = w.country || ''; $('wf-serving_temp').value = w.serving_temp || ''; $('wf-avg_rating').value = w.avg_rating != null ? w.avg_rating : ''; $('wf-food_pairings').value = w.food_pairings || ''; $('wf-story').value = w.story || ''; $('wf-tasting_notes').value = w.tasting_notes || ''; $('wf-awards').value = w.awards || ''; $('wf-image_url').value = w.image_url || ''; }
function readWine() { return { name: $('wf-name').value.trim(), producer: $('wf-producer').value.trim(), varietal: $('wf-varietal').value.trim(), region: $('wf-region').value.trim(), country: $('wf-country').value.trim(), serving_temp: $('wf-serving_temp').value.trim(), avg_rating: $('wf-avg_rating').value.trim(), food_pairings: $('wf-food_pairings').value.trim(), story: $('wf-story').value.trim(), tasting_notes: $('wf-tasting_notes').value.trim(), awards: $('wf-awards').value.trim(), image_url: $('wf-image_url').value.trim() }; }

function fillEvent(e) { e = e || {}; $('ef-title').value = e.title || ''; $('ef-datetime').value = toLocalInput(e.datetime); $('ef-location').value = e.location || ''; $('ef-capacity').value = e.capacity != null ? e.capacity : ''; $('ef-description').value = e.description || ''; $('ef-image_url').value = e.image_url || ''; }
function readEvent() { const dt = $('ef-datetime').value; return { title: $('ef-title').value.trim(), datetime: dt ? new Date(dt).toISOString() : null, location: $('ef-location').value.trim(), capacity: $('ef-capacity').value.trim(), description: $('ef-description').value.trim(), image_url: $('ef-image_url').value.trim(), status: 'confirmed' }; }

function fillBox(b) { b = b || {}; $('bf-title').value = b.title || ''; $('bf-month').value = b.month || ''; $('bf-price').value = b.price != null ? b.price : ''; $('bf-included').value = Array.isArray(b.included) ? b.included.join('\n') : ''; $('bf-availability').value = b.availability || ''; $('bf-status').value = b.status || 'waitlist'; $('bf-image_url').value = b.image_url || ''; }
function readBox() { return { title: $('bf-title').value.trim(), month: $('bf-month').value.trim(), price: $('bf-price').value.trim(), included: $('bf-included').value.split('\n').map((s) => s.trim()).filter(Boolean), availability: $('bf-availability').value.trim(), status: $('bf-status').value, image_url: $('bf-image_url').value.trim() }; }

const MGR = {
  wine: { p: 'wine', f: 'wf', list: 'list-wines', save: 'save-wine', del: 'delete-wine', fill: fillWine, read: readWine, row: (w) => ({ t: w.name, s: [w.producer, w.region].filter(Boolean).join(' · ') }) },
  event: { p: 'event', f: 'ef', list: 'list-events', save: 'save-event', del: 'delete-event', fill: fillEvent, read: readEvent, row: (e) => ({ t: e.title, s: e.datetime ? new Date(e.datetime).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '' }) },
  box: { p: 'box', f: 'bf', list: 'list-boxes', save: 'save-box', del: 'delete-box', fill: fillBox, read: readBox, row: (b) => ({ t: b.title, s: [b.month, b.status].filter(Boolean).join(' · ') }) },
};
let MITEMS = { wine: [], event: [], box: [] };
let EDITING = { wine: null, event: null, box: null };

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
function renderManage(key) {
  const m = MGR[key]; const items = MITEMS[key];
  $(`${m.p}-list`).innerHTML = items.length
    ? items.map((it, i) => { const r = m.row(it); return `<div class="crow" data-midx="${i}"><div class="ci"><h4>${esc(r.t || '—')}</h4><p>${esc(r.s || '')}</p></div><div class="ch">›</div></div>`; }).join('')
    : '<div class="empty">None yet. Tap “Add” to create one.</div>';
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
  ['wine', 'event', 'box'].forEach((key) => {
    const m = MGR[key];
    $(`${m.p}-add`).addEventListener('click', () => openMForm(key, null));
    $(`${m.f}-save`).addEventListener('click', () => saveMForm(key));
    $(`${m.f}-cancel`).addEventListener('click', () => mgrShowList(m.p));
    $(`${m.f}-delete`).addEventListener('click', () => delMForm(key));
    $(`${m.p}-list`).addEventListener('click', (e) => {
      const row = e.target.closest('.crow'); if (!row) return;
      openMForm(key, MITEMS[key][parseInt(row.dataset.midx, 10)]);
    });
  });
}

/* ---------------- boot ---------------- */
function start() {
  wireLogin(); wireCreate(); wireResult(); wireBroadcast(); wireMode(); wireDelegation(); wireManage();
  if (TOKEN) {
    const hr = new Date().getHours();
    $('dash-greeting').textContent = (hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening') + ', Ashley';
    go('dash', 'dash');
  } else { go('login'); }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
