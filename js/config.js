// js/config.js
// Public-safe values only. The anon key and VAPID PUBLIC key are designed to be
// exposed client-side. NEVER put the service-role key or VAPID private key here.
// Fill these in, or have Netlify inject them at build time.

window.CONFIG = {
  SUPABASE_URL: 'https://wwwrrtmuisdgkkwxyjdo.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind3d3JydG11aXNkZ2trd3h5amRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0MTUxOTgsImV4cCI6MjA5Nzk5MTE5OH0.I6AKhjhEqapl9PtgqTvj-XADkyrgQnJAKSxjOHlJJ4g',
  // VAPID public key (safe to expose). Private key goes ONLY in Supabase secrets.
  VAPID_PUBLIC_KEY: 'BA-TCBsMrx_18puG3bSvwjKEuFgiiHo6V5VOOKulxTvyspslCXLxoiUDqO-vIBL7drw-c8almOhYnTfgMuULuVs',
};
