// js/app.js
// Core controller for the member PWA. Screen markup is ported from the approved
// cellar-club-prototype.html into index.html; this file is the logic the prototype
// only mimicked: install gate, registration, push, routing and live data.
//
// Security model: member PII never touches the anon client. Public catalogue reads
// use the anon key (RLS public-read policies); every member WRITE (register, save
// push subscription, RSVP, waitlist, rating) goes through the `member-api` Edge
// Function, which runs server-side with the service-role key.

// Supabase JS is loaded lazily (dynamic import) so a CDN hiccup can never brick
// the app: the gate, registration and card render without it, and catalogue reads
// degrade gracefully to the built-in seed content. Member writes use fetch() to the
// member-api Edge Function and never depend on this library.

const CFG = window.CONFIG || {};
const FN = `${CFG.SUPABASE_URL}/functions/v1`;
const LS_KEY = 'cellar.member';

let sb = null;
async function getSb() {
  if (sb) return sb;
  if (!CFG.SUPABASE_URL || !CFG.SUPABASE_ANON_KEY) return null;
  try {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    sb = createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
    return sb;
  } catch { return null; }
}

/* ============================================================= *
 * 1. PLATFORM / INSTALL DETECTION
 * ============================================================= */
export function isInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}
export function platform() {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'other';
}
export function signupSource() {
  return new URLSearchParams(location.search).get('source') || 'app';
}
export function staffCode() {
  return new URLSearchParams(location.search).get('staff') || null;
}

let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; renderGate(); });
window.addEventListener('appinstalled', () => { deferredPrompt = null; });

export async function triggerAndroidInstall() {
  if (!deferredPrompt) return false;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  return outcome === 'accepted';
}

/* ============================================================= *
 * 2. SERVICE WORKER
 * ============================================================= */
export async function registerSW() {
  if (!('serviceWorker' in navigator)) return null;
  try { return await navigator.serviceWorker.register('/service-worker.js'); }
  catch { return null; }
}

/* ============================================================= *
 * 3. MEMBER STATE (local, non-PII-safe — id + display only)
 * ============================================================= */
function getMember() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch { return null; }
}
function setMember(m) { localStorage.setItem(LS_KEY, JSON.stringify(m)); }

/* Actions served by the Netlify function (auto-deploys with the site) instead of
   the Supabase member-api. These need the service-role key, which lives in Netlify. */
const NETLIFY_ACTIONS = new Set(['get-cellar', 'toggle-fav', 'add-rating', 'rsvp', 'save-subscription', 'get-me']);

/* Edge Function helpers (anon JWT satisfies default verify_jwt; service role is internal). */
async function memberApi(action, payload = {}) {
  if (NETLIFY_ACTIONS.has(action)) {
    const res = await fetch('/.netlify/functions/member', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }
  const res = await fetch(`${FN}/member-api`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': CFG.SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${CFG.SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

/* ============================================================= *
 * 4. PUSH SUBSCRIPTION
 * ============================================================= */
function urlB64ToUint8(base64) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export async function enablePush(memberId) {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return { granted: false };
  const reg = await navigator.serviceWorker.ready;
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    await memberApi('set-notif', { member_id: memberId, granted: false }).catch(() => {});
    return { granted: false };
  }
  if (!CFG.VAPID_PUBLIC_KEY || CFG.VAPID_PUBLIC_KEY.startsWith('YOUR-')) {
    // No VAPID key configured yet — record permission, skip subscription.
    await memberApi('set-notif', { member_id: memberId, granted: true }).catch(() => {});
    return { granted: true, subscribed: false };
  }
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlB64ToUint8(CFG.VAPID_PUBLIC_KEY),
  });
  const json = sub.toJSON();
  await memberApi('save-subscription', {
    member_id: memberId,
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
    device_type: platform(),
  });
  return { granted: true, subscribed: true };
}

/* ============================================================= *
 * 5. REGISTRATION
 * ============================================================= */
export async function registerMember(form) {
  const age = (Date.now() - new Date(form.dob)) / (365.25 * 864e5);
  if (!form.dob || age < 18) throw new Error('You must be 18 or older to join.');
  const member = await memberApi('register', {
    ...form,
    signup_source: signupSource(),
    staff_code: staffCode(),
    install_completed: isInstalled(),
    marketing_consent: !!form.marketing_consent,
  });
  // Keep the display name/number locally even if the register response omits them,
  // so the app can greet the member by name straight away.
  setMember({
    ...member,
    first_name: member.first_name || form.first_name || '',
    surname: member.surname || form.surname || '',
    membership_number: member.membership_number || member.membership_no || '',
    preferred_store: member.preferred_store || form.preferred_store || '',
    fav_wine_styles: form.fav_wine_styles || [],
    fav_spirits: form.fav_spirits || [],
  });
  return member;
}

/* ============================================================= *
 * 6. ROUTER
 * ============================================================= */
const ONBOARDING = ['gate', 'register', 'alerts'];
function go(id, nav) {
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('on'));
  const view = document.getElementById(id);
  if (view) view.classList.add('on');
  document.getElementById('vp').scrollTop = 0;
  const navbar = document.getElementById('nav');
  navbar.classList.toggle('hidden', ONBOARDING.includes(id));
  if (nav) setNav(nav);
  if (id === 'card') renderCard();
  if (id === 'notifications') markNotificationsSeen();
  if (id === 'cellar') loadCellar();
  if (id === 'magazine') loadMagazine();
  if (id === 'guide') loadGuide();
  // defensively clear any overlay so it can never block navigation/taps
  const rm = document.getElementById('rate-modal'); if (rm) rm.hidden = true;
  const lb = document.getElementById('lightbox'); if (lb) lb.classList.remove('on');
}
function setNav(n) {
  document.querySelectorAll('.ni2').forEach((x) => x.classList.toggle('on', x.getAttribute('data-nav') === n));
}
window.addEventListener('hashchange', () => { const h = location.hash.slice(1); if (h && document.getElementById(h)) go(h); });

/* ============================================================= *
 * 7. UI HELPERS
 * ============================================================= */
let toastTimer;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), 2600);
}
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function rands(n) { if (n == null || n === '') return ''; return 'R' + Number(n).toLocaleString('en-ZA', { minimumFractionDigits: Number(n) % 1 ? 2 : 0, maximumFractionDigits: 2 }); }
function timeAgo(iso) {
  const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 3600) return Math.max(1, Math.round(s / 60)) + 'm ago';
  if (s < 86400) return Math.round(s / 3600) + 'h ago';
  return Math.round(s / 86400) + 'd ago';
}

/* ============================================================= *
 * 8. GATE RENDERING
 * ============================================================= */
function renderGate() {
  const p = platform();
  document.getElementById('gate-ios').hidden = p !== 'ios';
  document.getElementById('gate-android').hidden = p !== 'android';
  document.getElementById('gate-other').hidden = p === 'ios' || p === 'android';
  const btn = document.getElementById('btn-android-install');
  btn.hidden = !(p === 'android' && deferredPrompt);
}

/* ============================================================= *
 * 9. REGISTER FORM WIRING
 * ============================================================= */
function wireRegister() {
  const form = document.getElementById('regform');
  // multi-select pills
  form.querySelectorAll('.pillrow[data-multi] .pill').forEach((pill) => {
    pill.addEventListener('click', () => pill.classList.toggle('on'));
  });
  // marketing consent toggle
  const consent = form.querySelector('[data-toggle="marketing_consent"]');
  consent.addEventListener('click', (e) => { e.preventDefault(); consent.querySelector('.ck').classList.toggle('on'); });

  // DOB max = today - 18y (hint; hard-checked on submit + DB)
  const dob = form.querySelector('[name="dob"]');
  const max = new Date(); max.setFullYear(max.getFullYear() - 18);
  dob.max = max.toISOString().slice(0, 10);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    form.querySelectorAll('.field').forEach((f) => f.classList.remove('invalid'));
    const data = Object.fromEntries(new FormData(form).entries());
    let ok = true;
    const fail = (name) => { const f = form.querySelector(`[name="${name}"]`)?.closest('.field'); if (f) f.classList.add('invalid'); ok = false; };
    if (!data.first_name?.trim()) fail('first_name');
    if (!data.surname?.trim()) fail('surname');
    if (!data.mobile?.trim()) fail('mobile');
    if (!/^\S+@\S+\.\S+$/.test(data.email || '')) fail('email');
    const age = data.dob ? (Date.now() - new Date(data.dob)) / (365.25 * 864e5) : 0;
    if (!data.dob || age < 18) fail('dob');
    if (!ok) { toast('Please check the highlighted fields.'); return; }

    data.fav_wine_styles = [...form.querySelectorAll('[data-multi="fav_wine_styles"] .pill.on')].map((p) => p.dataset.val);
    data.fav_spirits = [...form.querySelectorAll('[data-multi="fav_spirits"] .pill.on')].map((p) => p.dataset.val);
    data.marketing_consent = consent.querySelector('.ck').classList.contains('on');

    const btn = document.getElementById('reg-submit');
    btn.disabled = true; btn.textContent = 'Creating your membership…';
    try {
      await registerMember(data);
      go('alerts');
    } catch (err) {
      toast(err.message || 'Something went wrong. Please try again.');
    } finally {
      btn.disabled = false; btn.textContent = 'Become a member';
    }
  });
}

/* ============================================================= *
 * 10. DATA LOADERS (public reads; seed markup stays if empty/offline)
 * ============================================================= */
async function loadSettings() {
  try {
    const sb = await getSb(); if (!sb) return 'waitlist';
    const { data } = await sb.from('settings').select('value').eq('key', 'discovery_box_mode').single();
    return (data?.value || 'waitlist').toString().replace(/"/g, '');
  } catch { return 'waitlist'; }
}

async function loadHome() {
  const m = getMember();
  if (m) {
    const hour = new Date().getHours();
    const part = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    document.getElementById('greeting').innerHTML = `${part},<br><em>${esc(m.first_name || 'Member')}</em>`;
    const bits = [];
    if (m.membership_number) bits.push('Member No. ' + esc(m.membership_number));
    if (m.preferred_store) bits.push(esc(m.preferred_store));
    document.getElementById('home-meta').textContent = bits.join(' · ') || 'Tops Cellar Selection';
  }
  const sb = await getSb(); if (!sb) return;
  // current discovery box hero + "This week" box card
  let box = null;
  try {
    const { data } = await sb.from('discovery_boxes').select('*').neq('status', 'past').order('created_at', { ascending: false }).limit(1);
    if (data && data[0]) { box = data[0]; applyBoxHero(document.getElementById('home-hero'), box, true); }
  } catch {}
  // next upcoming event for the "This week" card
  let nextEvent = null;
  try {
    const { data } = await sb.from('events').select('*').gte('datetime', new Date(Date.now() - 864e5).toISOString()).order('datetime', { ascending: true }).limit(1);
    if (data && data[0]) nextEvent = data[0];
  } catch {}
  renderThisWeek(box, nextEvent);
  // featured wine (the highest-rated wine in the catalogue)
  try {
    const { data } = await sb.from('wines').select('*').or('active.is.null,active.eq.true').order('avg_rating', { ascending: false }).limit(1);
    if (data && data[0]) renderFeaturedWine(data[0]);
  } catch {}
}

// "This week" home cards come live from the current Discovery Box and next event,
// so managers control them by editing those in the admin panel.
function renderThisWeek(box, ev) {
  const host = document.getElementById('home-thisweek');
  if (!host || (!box && !ev)) return; // keep the placeholder if there's nothing yet
  let html = '';
  if (box) {
    const sub = box.price ? rands(box.price) : (box.month || 'This month');
    html += `<div class="mini" data-go="box"><div class="te">THIS MONTH&rsquo;S BOX</div><h3>${esc(box.title || 'Discovery Box')}</h3><div class="s">${esc(sub)}</div><div class="c">View the box &rarr;</div></div>`;
  }
  if (ev) {
    const d = new Date(ev.datetime);
    const when = d.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric' }) + ' · ' + d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false });
    html += `<div class="mini" data-go="events"><div class="dt">${esc(when)}</div><h3>${esc(ev.title || 'Event')}</h3><div class="s">${esc(ev.location || (ev.capacity ? ev.capacity + ' seats' : ''))}</div><div class="c">RSVP &rarr;</div></div>`;
  }
  host.innerHTML = html;
}

function renderFeaturedWine(w) {
  const host = document.getElementById('home-featured');
  host.innerHTML = `
    <div class="wine" data-go="wine" data-wine="${esc(w.id)}">
      <div class="bottle${w.image_url ? ' img' : ''}"${w.image_url ? ` style="background-image:url('${esc(w.image_url)}')"` : ''}><div class="nk"></div><div class="bd"></div><div class="lb"></div></div>
      <div class="winfo"><div class="te">${esc((w.producer || '').toUpperCase())}</div><h3>${esc(w.name)}</h3><div class="rg">${esc([w.region, w.varietal].filter(Boolean).join(' · '))}</div>
      ${w.tasting_notes ? `<div class="nt">&ldquo;${esc(w.tasting_notes)}&rdquo;</div>` : ''}
      <div class="st"><span class="s">★★★★★</span><span class="r">${(w.avg_rating || 0).toFixed(1)}</span>${priceLine(w) ? `<span class="wprice" style="margin-left:auto">${priceLine(w)}</span>` : ''}</div></div>
    </div>`;
}

function applyBoxHero(el, box, compact) {
  el.querySelector('h2').innerHTML = esc(box.title || 'This month’s box');
  const p = el.querySelector('p'); if (p && box.availability) p.textContent = box.availability;
  const pr = el.querySelector('.pr'); if (pr && box.price) pr.textContent = 'From ' + rands(box.price);
  if (box.image_url) { el.classList.add('img'); el.style.backgroundImage = `url('${box.image_url}')`; el.style.backgroundSize = 'cover'; el.style.backgroundPosition = 'center'; }
  el.dataset.boxId = box.id;
}

async function loadBox() {
  const mode = await loadSettings();
  const cta = document.getElementById('box-cta');
  const note = document.getElementById('box-cta-note');
  const ht = document.getElementById('box-ht');
  if (mode === 'live') {
    cta.textContent = 'Reserve — collect in store';
    cta.dataset.act = 'reserve-box';
    note.textContent = 'Reserve now and collect at Beacon Isle.';
    ht.textContent = 'THIS MONTH’S BOX · AVAILABLE NOW';
  } else {
    cta.textContent = 'Join the priority list';
    cta.dataset.act = 'join-waitlist';
    note.textContent = 'Subscriptions open September — you’ll be first to know.';
    ht.textContent = 'THIS MONTH’S BOX · SHIPS SEPTEMBER';
  }
  const sb = await getSb(); if (!sb) return;
  try {
    const { data } = await sb.from('discovery_boxes').select('*').neq('status', 'past').order('created_at', { ascending: false }).limit(1);
    if (data && data[0]) {
      applyBoxHero(document.getElementById('box-hero'), data[0], false);
      const inc = Array.isArray(data[0].included) ? data[0].included : [];
      if (inc.length) document.getElementById('box-included').innerHTML = inc.map((i) => '&bull; ' + esc(i)).join('<br>');
    }
    const { data: past } = await sb.from('discovery_boxes').select('title,month').eq('status', 'past').order('created_at', { ascending: false });
    if (past && past.length) {
      document.getElementById('box-previous').innerHTML = past.map((b) => `<div style="padding:10px 0;border-bottom:1px solid var(--cardbd)">${esc(b.title)} <span class="muted">· ${esc(b.month || '')}</span></div>`).join('');
    }
  } catch {}
}

async function loadSpecials() {
  try {
    const sb = await getSb(); if (!sb) return;
    const { data } = await sb.from('specials').select('*').eq('status', 'published').order('created_at', { ascending: false });
    if (!data || !data.length) return; // keep seed
    document.getElementById('specials-list').innerHTML = data.map((s) => `
      <div class="spcard">
        <span class="cat">${esc((s.category || 'SPECIAL').toUpperCase())}</span>
        <div class="mb2${s.image_url ? ' img' : ''}"${s.image_url ? ` style="background-image:url('${esc(s.image_url)}')" data-act="enlarge" data-img="${esc(s.image_url)}"` : ''}>${s.image_url ? '<span class="zoom">&#9974;</span>' : '<div class="nk"></div><div class="bd"></div><div class="lb"></div>'}</div>
        <div class="spinfo"><h4>${esc(s.title)}</h4>
          <div class="sm">${s.valid_until ? 'Until ' + new Date(s.valid_until).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' }) : 'Member price'}</div>
          <div class="prc"><span class="now">${rands(s.member_price)}</span>${s.normal_price ? `<span class="was">${rands(s.normal_price)}</span>` : ''}</div>
        </div>
      </div>`).join('');
  } catch {}
}

/* Minimal, safe Markdown → HTML for the in-app guides (headings, bold, code, lists). */
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

let guideLoaded = false;
async function loadGuide() {
  if (guideLoaded) return;
  const host = document.getElementById('guide-body');
  try {
    const res = await fetch('/USER-GUIDE.md', { cache: 'no-cache' });
    const md = await res.text();
    host.innerHTML = mdToHtml(md);
    guideLoaded = true;
  } catch { host.innerHTML = '<div class="empty">Guide unavailable offline. Reconnect and try again.</div>'; }
}

function openLightbox(src) {
  if (!src) return;
  let lb = document.getElementById('lightbox');
  if (!lb) {
    lb = document.createElement('div');
    lb.id = 'lightbox';
    lb.className = 'lightbox';
    lb.innerHTML = '<img alt=""><span class="lbx">&times;</span>';
    lb.addEventListener('click', () => { lb.classList.remove('on'); });
    document.body.appendChild(lb);
  }
  lb.querySelector('img').src = src;
  lb.classList.add('on');
}

async function loadEvents() {
  try {
    const sb = await getSb(); if (!sb) return;
    const { data } = await sb.from('events').select('*').gte('datetime', new Date(Date.now() - 864e5).toISOString()).order('datetime', { ascending: true });
    if (!data || !data.length) return;
    document.getElementById('events-list').innerHTML = data.map((ev) => {
      const d = new Date(ev.datetime);
      const mo = d.toLocaleDateString('en-ZA', { month: 'short' });
      const dy = d.getDate();
      const tm = d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false });
      return `<div class="ev" data-event="${esc(ev.id)}">
        <div class="cal"><div class="mo">${mo}</div><div class="dy">${dy}</div><div class="tm">${tm}</div></div>
        <div class="ei"><h4>${esc(ev.title)}</h4><div class="lo">${esc(ev.location || '')}</div>
        ${ev.capacity ? `<div class="seats">${ev.capacity} seats</div>` : ''}
        <span class="rsvp" data-act="rsvp" data-event="${esc(ev.id)}">RSVP</span></div>
      </div>`;
    }).join('');
  } catch {}
}

let WINES = [];
async function loadWines() {
  try {
    const sb = await getSb(); if (!sb) return;
    const { data } = await sb.from('wines').select('*').or('active.is.null,active.eq.true').order('avg_rating', { ascending: false }).limit(2000);
    if (!data || !data.length) return;
    WINES = data;
    renderWineList(data);
  } catch {}
}
function starStr(r) { const f = Math.round(r || 0); return '★★★★★☆☆☆☆☆'.slice(5 - f, 10 - f); }
// Live price: promo overrides the normal selling price.
function priceLine(w) {
  const sp = (w.selling_price != null && w.selling_price !== '') ? Number(w.selling_price) : null;
  const promo = (w.promo_price != null && w.promo_price !== '') ? Number(w.promo_price) : null;
  if (promo != null && sp != null && promo < sp) return `<span class="pnow">${rands(promo)}</span> <span class="pwas">${rands(sp)}</span>`;
  const p = promo != null ? promo : sp;
  return p != null ? `<span class="pnow">${rands(p)}</span>` : '';
}
function renderWineList(list) {
  document.getElementById('wine-list').innerHTML = list.map((w) => {
    const price = priceLine(w);
    return `
    <div class="lrow" data-go="wine" data-wine="${esc(w.id)}">
      <div class="mb${w.image_url ? ' img' : ''}"${w.image_url ? ` style="background-image:url('${esc(w.image_url)}')"` : ''}><div class="nk"></div><div class="bd"></div><div class="lb"></div></div>
      <div class="li"><h4>${esc(w.name)}</h4><div class="sm">${esc([w.producer, w.region, w.size].filter(Boolean).join(' · '))}</div>
      <div class="lmeta"><div class="stars">${starStr(w.avg_rating)} ${(w.avg_rating || 0).toFixed(1)}</div>${price ? `<div class="wprice">${price}</div>` : ''}</div></div>
    </div>`; }).join('');
}

function renderWineDetail(w) {
  const big = document.getElementById('wine-big');
  if (w.image_url) { big.classList.add('img'); big.style.backgroundImage = `url('${w.image_url}')`; }
  else { big.classList.remove('img'); big.style.backgroundImage = ''; }
  const fav = document.getElementById('wine-fav');
  fav.dataset.wine = w.id;
  fav.classList.remove('on');
  fav.innerHTML = '&#9825;';
  document.getElementById('wine-body').innerHTML = `
    <div class="te">${esc((w.producer || '').toUpperCase())}</div>
    <h1>${esc(w.name)}</h1>
    <div class="rg">${esc([w.region, w.varietal, w.country].filter(Boolean).join(' · '))}</div>
    ${priceLine(w) ? `<div class="wprice big">${priceLine(w)}${w.size ? ` <span class="psize">${esc(w.size)}</span>` : ''}</div>` : ''}
    <div class="specs">
      <div class="spec"><div class="k">Region</div><div class="v">${esc(w.region || '—')}</div></div>
      <div class="spec"><div class="k">Serve at</div><div class="v">${esc(w.serving_temp || '—')}</div></div>
      <div class="spec"><div class="k">Pairing</div><div class="v">${esc(w.food_pairings || '—')}</div></div>
      <div class="spec"><div class="k">Rating</div><div class="v">★ ${(w.avg_rating || 0).toFixed(1)}</div></div>
    </div>
    ${w.story ? `<div class="ptext">${esc(w.story)}</div>` : ''}
    ${w.awards ? `<div class="ptext"><b>Awards:</b> ${esc(w.awards)}</div>` : ''}
    <div style="margin-top:18px;display:flex;gap:10px"><button class="btn" style="flex:1" data-act="rate-wine" data-wine="${esc(w.id)}" data-wname="${esc(w.name)}">Add my rating</button><button class="btn ghost" data-act="note-wine">My notes</button></div>`;
}

// Refresh the member's membership type (set by admin) and hydrate their name/number
// from the server, so the app greets them by name even if the local record is old.
async function refreshMemberType() {
  const m = getMember(); if (!m) return;
  try {
    const me = await memberApi('get-me', { member_id: m.id });
    if (!me || me.error) return;
    const patch = { ...m };
    if ('membership_type' in me) patch.membership_type = me.membership_type;
    if (me.first_name) patch.first_name = me.first_name;
    if (me.surname) patch.surname = me.surname;
    if (me.membership_number) patch.membership_number = me.membership_number;
    setMember(patch);
    loadNotifications();
    // Re-render the greeting and card now that the real name/number are available.
    const g = document.getElementById('greeting');
    if (g && patch.first_name) {
      const hour = new Date().getHours();
      const part = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
      g.innerHTML = `${part},<br><em>${esc(patch.first_name)}</em>`;
      const meta = document.getElementById('home-meta');
      if (meta) {
        const bits = [];
        if (patch.membership_number) bits.push('Member No. ' + esc(patch.membership_number));
        if (patch.preferred_store) bits.push(esc(patch.preferred_store));
        meta.textContent = bits.join(' · ') || 'Tops Cellar Selection';
      }
    }
    if (document.getElementById('card')?.classList.contains('on')) renderCard();
  } catch {}
}

const NOTIF_MAP = new Map();
async function loadNotifications() {
  try {
    const sb = await getSb(); if (!sb) return;
    const { data: raw } = await sb.from('notifications').select('*').order('sent_at', { ascending: false }).limit(60);
    // only show notifications meant for this member (all, or their membership type)
    const myType = (getMember() || {}).membership_type || null;
    const data = (raw || []).filter((n) => {
      const a = n.audience || { type: 'all' };
      if (!a || a.type === 'all' || a.type === 'store' || a.type === 'taste') return true;
      if (a.type === 'membership') return a.value === myType;
      return true;
    }).slice(0, 40);
    const host = document.getElementById('notif-list');
    if (!data || !data.length) { host.innerHTML = '<div class="empty">Your member alerts will appear here.</div>'; updateBell(0); return; }
    const lastSeen = Number(localStorage.getItem('cellar.notifSeen') || 0);
    let unread = 0;
    NOTIF_MAP.clear();
    host.innerHTML = data.map((n, i) => {
      NOTIF_MAP.set(String(i), n);
      const isUnread = new Date(n.sent_at).getTime() > lastSeen;
      if (isUnread) unread++;
      return `<div class="nrow${isUnread ? ' unread' : ''}${n.image_url ? ' has-img' : ''}" data-notif-idx="${i}">
        <div class="ni">${n.image_url ? `<img src="${esc(n.image_url)}" alt="" loading="lazy">` : '🍷'}</div>
        <div class="nt"><h4>${esc(n.title)}</h4>${n.body ? `<p>${esc(n.body)}</p>` : ''}<div class="tm">${timeAgo(n.sent_at)}</div></div>
        <div class="nchev">›</div>
      </div>`;
    }).join('');
    updateBell(unread);
  } catch {}
}
function openNotif(n) {
  const imgEl = document.getElementById('nd-img');
  if (n.image_url) {
    imgEl.style.backgroundImage = `url('${esc(n.image_url)}')`;
    imgEl.hidden = false;
  } else {
    imgEl.hidden = true;
  }
  document.getElementById('nd-body').innerHTML = `
    <h1 class="nd-title">${esc(n.title)}</h1>
    ${n.body ? `<p class="nd-body">${esc(n.body)}</p>` : ''}
    <div class="nd-tm">${timeAgo(n.sent_at)}</div>
    ${n.link ? `<a class="btn nd-btn" href="${esc(n.link)}">View →</a>` : ''}
  `;
  go('notif-detail', 'notifications');
}
function updateBell(unread) {
  const bell = document.getElementById('home-bell');
  if (bell) bell.classList.toggle('has', unread > 0);
}
function markNotificationsSeen() {
  localStorage.setItem('cellar.notifSeen', String(Date.now()));
  updateBell(0);
}

/* ============================================================= *
 * 11. MEMBERSHIP CARD (real QR)
 * ============================================================= */
let qrRendered = false;
async function renderCard() {
  const m = getMember();
  if (!m) return;
  document.getElementById('card-name').textContent = `${m.first_name || ''} ${m.surname || ''}`.trim() || 'Cellar Member';
  document.getElementById('card-no').textContent = 'MEMBER NO. ' + (m.membership_number || '----');
  const since = m.created_at ? new Date(m.created_at).toLocaleDateString('en-ZA', { month: 'short', year: 'numeric' }) : new Date().toLocaleDateString('en-ZA', { month: 'short', year: 'numeric' });
  document.getElementById('card-tier').innerHTML = `Member since ${esc(since)} &middot; <b>Founding Member</b>`;
  if (qrRendered || !m.qr_token) return;
  try {
    const { default: QRCode } = await import('https://esm.sh/qrcode@1.5.4');
    const canvas = document.createElement('canvas');
    const value = `CELLAR:${m.membership_number || ''}:${m.qr_token}`;
    await QRCode.toCanvas(canvas, value, { width: 280, margin: 0, color: { dark: '#100f12', light: '#f7f4ee' } });
    canvas.style.cssText = 'width:100%;height:100%;display:block';
    const host = document.getElementById('card-qr');
    host.innerHTML = ''; host.appendChild(canvas);
    qrRendered = true;
  } catch { /* keep the placeholder SVG */ }
}

/* ============================================================= *
 * 12. RE-ENGAGEMENT (notifications later disabled)
 * ============================================================= */
function checkReengagement() {
  const m = getMember();
  const slot = document.getElementById('reengage-slot');
  if (!m || !('Notification' in window)) { slot.innerHTML = ''; return; }
  if (Notification.permission === 'denied' || Notification.permission === 'default') {
    slot.innerHTML = `<div class="reengage"><div class="tx"><b>Your alerts are off.</b> Turn them back on so you don’t miss your Discovery Box, events and member-only pricing.</div><button class="btn" data-act="reenable">Re-enable</button></div>`;
  } else {
    slot.innerHTML = '';
  }
}

/* ============================================================= *
 * 13. GLOBAL EVENT DELEGATION
 * ============================================================= */
function wireDelegation() {
  document.getElementById('app').addEventListener('click', async (e) => {
    const goEl = e.target.closest('[data-go]');
    const actEl = e.target.closest('[data-act]');

    const starEl = e.target.closest('#rm-stars [data-star]');
    if (starEl) { highlightStars(parseInt(starEl.dataset.star || '0')); return; }

    if (actEl) {
      const act = actEl.dataset.act;
      if (act === 'android-install') { await triggerAndroidInstall(); return; }
      if (act === 'enable-alerts') { await onEnableAlerts(actEl); return; }
      if (act === 'skip-alerts') { go('home', 'home'); return; }
      if (act === 'reenable') { await onEnableAlerts(actEl); checkReengagement(); return; }
      if (act === 'join-waitlist') { await onJoinWaitlist(actEl); return; }
      if (act === 'reserve-box') { await onJoinWaitlist(actEl, true); return; }
      if (act === 'rsvp') { e.stopPropagation(); await onRsvp(actEl); return; }
      if (act === 'toggle-fav') { onToggleFav(actEl); return; }
      if (act === 'rate-wine') { openRateModal(actEl.dataset.wine, actEl.dataset.wname); return; }
      if (act === 'close-rate') { document.getElementById('rate-modal').hidden = true; return; }
      if (act === 'save-rating') { saveRating(); return; }
      if (act === 'note-wine') { toast('Tasting notes coming soon.'); return; }
      if (act === 'enlarge') { e.stopPropagation(); openLightbox(actEl.dataset.img); return; }
    }

    const notifRow = e.target.closest('.nrow[data-notif-idx]');
    if (notifRow) { const n = NOTIF_MAP.get(notifRow.dataset.notifIdx); if (n) openNotif(n); return; }

    if (goEl) {
      if (goEl.hasAttribute('data-stop')) e.stopPropagation();
      const target = goEl.dataset.go;
      if (target === 'wine' && goEl.dataset.wine) openWine(goEl.dataset.wine);
      go(target, goEl.dataset.nav);
    }
  });

  // wine search
  const search = document.getElementById('wine-search');
  if (search) search.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    if (!WINES.length) return;
    renderWineList(!q ? WINES : WINES.filter((w) => [w.name, w.producer, w.region, w.varietal].filter(Boolean).join(' ').toLowerCase().includes(q)));
  });
}

function openWine(id) {
  if (id.startsWith('seed-')) return;
  const w = WINES.find((x) => x.id === id);
  if (!w) return;
  renderWineDetail(w);
  const isFav = CELLAR.favourites.some((f) => f.wine_id === id);
  const fav = document.getElementById('wine-fav');
  if (isFav) { fav.classList.add('on'); fav.innerHTML = '&#9829;'; }
}

async function onEnableAlerts(btn) {
  const m = getMember();
  if (!m) { go('register'); return; }
  btn.disabled = true; const label = btn.textContent; btn.textContent = 'Enabling…';
  try {
    const r = await enablePush(m.id);
    if (r.granted) { setMember({ ...m, notif_permission_granted: true }); toast('Alerts enabled. Welcome to the Club.'); go('home', 'home'); }
    else { toast('Alerts are off — you can enable them anytime from Home.'); go('home', 'home'); }
  } catch (err) {
    toast(err.message || 'Could not enable alerts.');
  } finally { btn.disabled = false; btn.textContent = label; }
}

async function onJoinWaitlist(btn, reserve) {
  const m = getMember();
  if (!m) { go('register'); return; }
  const boxId = document.getElementById('box-hero')?.dataset.boxId || null;
  btn.disabled = true;
  try {
    await memberApi('join-waitlist', { member_id: m.id, box_id: boxId, reserve: !!reserve });
    btn.textContent = reserve ? 'Reserved ✓' : 'You’re on the list ✓';
    toast(reserve ? 'Reserved — collect in store.' : 'Added to the Discovery Box priority list.');
  } catch (err) { toast(err.message || 'Could not add you to the list.'); btn.disabled = false; }
}

async function onRsvp(el) {
  const m = getMember();
  if (!m) { go('register'); return; }
  const eventId = el.dataset.event;
  try {
    await memberApi('rsvp', { member_id: m.id, event_id: eventId });
    el.textContent = 'Going ✓'; el.classList.add('going');
    toast('You’re booked. See you there.');
  } catch (err) { toast(err.message || 'Could not RSVP.'); }
}

async function onToggleFav(el) {
  const m = getMember(); if (!m) return;
  const wineEl = el.closest('[data-wine]');
  const wine_id = wineEl?.dataset.wine;
  if (!wine_id || wine_id.startsWith('seed-')) { toast('Sign in to save favourites.'); return; }
  el.classList.toggle('on');
  el.innerHTML = el.classList.contains('on') ? '&#9829;' : '&#9825;';
  try {
    await memberApi('toggle-fav', { member_id: m.id, wine_id });
    toast(el.classList.contains('on') ? 'Added to favourites.' : 'Removed from favourites.');
  } catch { el.classList.toggle('on'); el.innerHTML = el.classList.contains('on') ? '&#9829;' : '&#9825;'; }
}

/* ============================================================= *
 * 13b. CELLAR
 * ============================================================= */
let CELLAR = { favourites: [], ratings: [] };

async function loadCellar() {
  const m = getMember(); if (!m) return;
  try {
    const data = await memberApi('get-cellar', { member_id: m.id });
    CELLAR = data;
    renderFavs(); renderRatings();
  } catch {}
  loadMagazine();
}

function wineCard(w, extra = '') {
  const img = w.image_url ? `style="background-image:url('${esc(w.image_url)}')"` : '';
  return `<div class="wine ${w.image_url ? 'img' : ''}" data-go="wine" data-wine="${esc(w.id)}" ${img}>
    <div class="bottle"><div class="nk"></div><div class="bd"></div><div class="lb"></div></div>
    <div class="winfo"><div class="te">${esc((w.producer||'').toUpperCase())}</div><h3>${esc(w.name)}</h3>
    <div class="rg">${esc([w.region,w.varietal].filter(Boolean).join(' · '))}</div>${extra}</div></div>`;
}

function renderFavs() {
  const host = document.getElementById('fav-list');
  if (!CELLAR.favourites.length) { host.innerHTML = '<div class="empty">Heart a wine to save it here.</div>'; return; }
  host.innerHTML = `<div class="wine-grid">${CELLAR.favourites.map(w => wineCard(w, `<div class="st"><span class="s">★★★★★</span></div>`)).join('')}</div>`;
}

function renderRatings() {
  const host = document.getElementById('rating-list');
  if (!CELLAR.ratings.length) { host.innerHTML = '<div class="empty">Rate wines from the Discover tab.</div>'; return; }
  host.innerHTML = CELLAR.ratings.map(w => `
    <div class="rrow" data-go="wine" data-wine="${esc(w.id)}">
      <div class="rri">${w.image_url ? `<img src="${esc(w.image_url)}" alt="">` : '🍷'}</div>
      <div class="rrt"><h4>${esc(w.name)}</h4><div class="rrs">${'★'.repeat(w.rating)}${'☆'.repeat(5-w.rating)}</div>${w.note ? `<p>${esc(w.note)}</p>` : ''}</div>
    </div>`).join('');
}

let MAGAZINE = [];
let magCat = '';
async function loadMagazine() {
  try {
    const sb = await getSb(); if (!sb) return;
    const { data } = await sb.from('magazines').select('*').order('issue_date', { ascending: false }).limit(60);
    MAGAZINE = data || [];
    renderMagazine();
  } catch {}
}
function renderMagazine() {
  const host = document.getElementById('mag-list');
  if (!host) return;
  const list = magCat ? MAGAZINE.filter((m) => (m.category || 'Article') === magCat) : MAGAZINE;
  if (!list.length) { host.className = 'empty'; host.style.padding = '0 22px'; host.innerHTML = 'Fresh reading coming soon.'; return; }
  host.className = ''; host.style.padding = '';
  host.innerHTML = list.map((m, i) => `<div class="magrow" data-mag="${i}">
    ${m.cover_url ? `<div class="magcov" style="background-image:url('${esc(m.cover_url)}')"></div>` : '<div class="magcov"></div>'}
    <div class="magt"><div class="te">${esc(m.category || 'Article')}${m.issue_date ? ' · ' + new Date(m.issue_date).toLocaleDateString('en-ZA', { month: 'short', year: 'numeric' }) : ''}</div>
    <h3>${esc(m.title || '')}</h3>${m.excerpt ? `<p class="mage">${esc(m.excerpt)}</p>` : ''}</div></div>`).join('');
}
function openMagArticle(idx) {
  const filtered = magCat ? MAGAZINE.filter((m) => (m.category || 'Article') === magCat) : MAGAZINE;
  const m = filtered[idx]; if (!m) return;
  const host = document.getElementById('mag-article');
  host.innerHTML = `
    ${m.cover_url ? `<div class="mag-hero" style="background-image:url('${esc(m.cover_url)}')"></div>` : ''}
    <div class="mag-b">
      <div class="te">${esc(m.category || 'Article')}${m.issue_date ? ' · ' + new Date(m.issue_date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' }) : ''}</div>
      <h1>${esc(m.title || '')}</h1>
      ${m.body ? `<div class="ptext">${esc(m.body).replace(/\n/g, '<br>')}</div>` : ''}
      ${m.content_ref ? `<a class="btn block" href="${esc(m.content_ref)}" target="_blank" rel="noopener" style="margin-top:16px;text-align:center;text-decoration:none">Read the full piece →</a>` : ''}
    </div>`;
  go('mag-detail');
}
function wireMagazine() {
  const chips = document.getElementById('mag-chips');
  if (chips) chips.addEventListener('click', (e) => {
    const c = e.target.closest('.schip'); if (!c) return;
    chips.querySelectorAll('.schip').forEach((x) => x.classList.remove('on'));
    c.classList.add('on'); magCat = c.dataset.cat || ''; renderMagazine();
  });
  const list = document.getElementById('mag-list');
  if (list) list.addEventListener('click', (e) => { const row = e.target.closest('.magrow[data-mag]'); if (row) openMagArticle(parseInt(row.dataset.mag, 10)); });
}

function wireCellar() {
  document.getElementById('cellar').addEventListener('click', e => {
    const tab = e.target.closest('.ctab');
    if (tab) {
      document.querySelectorAll('.ctab').forEach(t => t.classList.remove('on'));
      document.querySelectorAll('.cpanel').forEach(p => p.classList.remove('on'));
      tab.classList.add('on');
      document.getElementById('cpanel-' + tab.dataset.tab)?.classList.add('on');
    }
  });
}

/* ============================================================= *
 * 13c. RATING MODAL
 * ============================================================= */
let ratingState = { wine_id: null, stars: 0 };

function openRateModal(wine_id, name) {
  ratingState = { wine_id, stars: 0 };
  document.getElementById('rm-wine-name').textContent = name || 'Rate this wine';
  document.getElementById('rm-note').value = '';
  highlightStars(0);
  document.getElementById('rate-modal').hidden = false;
}

function highlightStars(n) {
  ratingState.stars = n;
  document.querySelectorAll('#rm-stars span').forEach((s, i) => s.classList.toggle('on', i < n));
}

async function saveRating() {
  const m = getMember(); if (!m) return;
  if (!ratingState.stars) { toast('Tap a star first.'); return; }
  const btn = document.getElementById('rm-save'); btn.disabled = true; btn.textContent = 'Saving…';
  try {
    await memberApi('add-rating', { member_id: m.id, wine_id: ratingState.wine_id, rating: ratingState.stars, note: document.getElementById('rm-note').value.trim() || null });
    document.getElementById('rate-modal').hidden = true;
    toast('Rating saved!');
    loadCellar();
  } catch (err) { toast(err.message || 'Could not save.'); }
  finally { btn.disabled = false; btn.textContent = 'Save rating'; }
}

/* ============================================================= *
 * 13d. SOMMELIER
 * ============================================================= */
function wireSommelier() {
  const send = document.getElementById('som-send');
  const input = document.getElementById('som-q');
  send.addEventListener('click', doAsk);
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doAsk(); } });
  document.getElementById('sommelier').addEventListener('click', e => {
    const chip = e.target.closest('.schip');
    if (chip) { input.value = chip.dataset.q; doAsk(); }
  });
}

async function doAsk() {
  const m = getMember(); if (!m) { toast('Sign in first.'); return; }
  const input = document.getElementById('som-q');
  const q = input.value.trim(); if (!q) return;
  input.value = '';
  document.getElementById('som-intro').hidden = true;
  const thread = document.getElementById('som-messages');
  const vp = document.querySelector('.vp');
  thread.insertAdjacentHTML('beforeend', `<div class="smsg sme">${esc(q)}</div>`);
  const thinking = document.createElement('div'); thinking.className = 'smsg sma sthink'; thinking.textContent = '…'; thread.appendChild(thinking);
  if (vp) vp.scrollTop = vp.scrollHeight;
  try {
    const prefs = [...(m.fav_wine_styles || []), ...(m.fav_spirits || [])].filter(Boolean).join(', ');
    const res = await fetch('/.netlify/functions/ask-sommelier', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: q, prefs }),
    });
    const r = await res.json();
    thinking.classList.remove('sthink');
    thinking.textContent = r.answer || 'I couldn\'t answer that just now.';
    if (Array.isArray(r.wines) && r.wines.length) {
      // make the recommended wines tappable (openWine needs them in WINES)
      r.wines.forEach((w) => { if (!WINES.some((x) => x.id === w.id)) WINES.push(w); });
      const cards = r.wines.map((w) => somWineCard(w)).join('');
      thread.insertAdjacentHTML('beforeend', `<div class="som-recs">${cards}</div>`);
    }
  } catch { thinking.classList.remove('sthink'); thinking.textContent = 'Sorry, I\'m unavailable right now.'; }
  if (vp) vp.scrollTop = vp.scrollHeight;
}

function somWineCard(w) {
  const price = priceLine(w);
  const sub = [w.varietal, w.region].filter(Boolean).join(' · ');
  const img = w.image_url ? `style="background-image:url('${esc(w.image_url)}')" class="srw-img img"` : 'class="srw-img"';
  return `<div class="srw" data-go="wine" data-wine="${esc(w.id)}">
    <div ${img}>${w.image_url ? '' : '<div class="nk"></div><div class="bd"></div><div class="lb"></div>'}</div>
    <div class="srw-i"><h4>${esc(w.name)}</h4>${sub ? `<div class="srw-s">${esc(sub)}</div>` : ''}
    ${w.food_pairings ? `<div class="srw-p">🍽 ${esc(w.food_pairings)}</div>` : ''}
    ${price ? `<div class="wprice">${price}</div>` : ''}</div>
    <div class="srw-go">›</div>
  </div>`;
}

/* ============================================================= *
 * 14. BOOT
 * ============================================================= */
export async function boot() {
  await registerSW();
  const member = getMember();
  if (!isInstalled()) return { stage: 'gate', platform: platform() };
  if (!member) return { stage: 'register' };
  if (!member.notif_permission_granted && ('Notification' in window) && Notification.permission !== 'granted') return { stage: 'alerts' };
  return { stage: 'home' };
}

async function start() {
  wireRegister();
  wireDelegation();
  wireCellar();
  wireSommelier();
  wireMagazine();
  renderGate();

  const state = await boot();
  // reveal app, hide splash
  document.getElementById('app').hidden = false;
  document.getElementById('boot').classList.add('gone');

  if (state.stage === 'gate') { go('gate'); }
  else if (state.stage === 'register') { go('register'); }
  else if (state.stage === 'alerts') { go('alerts'); }
  else { go('home', 'home'); }

  // background data load for the in-app screens
  loadHome(); loadBox(); loadSpecials(); loadEvents(); loadWines(); loadNotifications(); loadCellar(); refreshMemberType();
  checkReengagement();

  // refresh content whenever the app returns to the foreground (so admin changes — new
  // images, prices, wines — show up without a full restart)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && getMember()) {
      loadHome(); loadWines(); loadSpecials(); loadEvents(); loadBox(); loadNotifications(); loadCellar();
    }
  });

  // deep link from a tapped notification (?link=/specials etc.)
  const link = new URLSearchParams(location.search).get('link');
  if (link && state.stage === 'home') { const id = link.replace(/^\//, ''); if (document.getElementById(id)) go(id); }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
