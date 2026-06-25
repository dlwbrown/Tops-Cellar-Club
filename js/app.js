// js/app.js
// Core wiring for the member PWA. Screen markup ports from cellar-club-prototype.html;
// this file holds the logic the prototype only mimicked: install gate, register, push.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const sb = createClient(window.CONFIG.SUPABASE_URL, window.CONFIG.SUPABASE_ANON_KEY);

/* ---------- 1. INSTALL GATE ----------
   Membership is only granted once the app runs installed (standalone) AND notifications
   are on. iOS Safari has no install API, so we DETECT install rather than force it. */
export function isInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}
export function platform() {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'other';
}

/* Android can be offered a real install prompt; capture the event for a custom button. */
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; });
export async function triggerAndroidInstall() {
  if (!deferredPrompt) return false;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  return outcome === 'accepted';
}

/* Capture the QR zone, e.g. ?source=whisky */
export function signupSource() {
  return new URLSearchParams(location.search).get('source') || 'app';
}

/* ---------- 2. SERVICE WORKER ---------- */
export async function registerSW() {
  if (!('serviceWorker' in navigator)) return null;
  return navigator.serviceWorker.register('/service-worker.js');
}

/* ---------- 3. PUSH SUBSCRIPTION ---------- */
function urlB64ToUint8(base64) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export async function enablePush(memberId) {
  const reg = await navigator.serviceWorker.ready;
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { granted: false };

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlB64ToUint8(window.CONFIG.VAPID_PUBLIC_KEY),
  });
  const json = sub.toJSON();
  await sb.from('push_subscriptions').insert({
    member_id: memberId,
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
    device_type: platform(),
  });
  await sb.from('members').update({ notif_permission_granted: true }).eq('id', memberId);
  return { granted: true };
}

/* ---------- 4. REGISTRATION ---------- */
export async function registerMember(form) {
  // form: { first_name, surname, mobile, email, dob, preferred_store,
  //         fav_wine_styles[], fav_spirits[], marketing_consent }
  const age = (Date.now() - new Date(form.dob)) / (365.25 * 864e5);
  if (age < 18) throw new Error('You must be 18 or older to join.');

  const membership_number = String(Math.floor(1000 + Math.random() * 9000)); // replace with a real sequence
  const now = new Date().toISOString();

  const { data, error } = await sb.from('members').insert({
    ...form,
    membership_number,
    signup_source: signupSource(),
    install_completed: isInstalled(),
    account_consent: true,
    account_consent_at: now,
    marketing_consent: !!form.marketing_consent,
    marketing_consent_at: form.marketing_consent ? now : null,
  }).select().single();
  if (error) throw error;

  // auto-enter the current monthly prize draw (handle the join table / draw record server-side or here)
  return data;
}

/* ---------- 5. BOOT ---------- */
export async function boot() {
  await registerSW();
  if (!isInstalled()) {
    // show the install-gate screen (port markup from the prototype `#gate`)
    return { stage: 'gate', platform: platform() };
  }
  return { stage: 'register' };
}
