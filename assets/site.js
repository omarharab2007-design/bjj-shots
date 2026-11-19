/* BJJ Shots: shared chrome and helpers for every page.
   Builds the rail, nav, phone menu, cursor, video lightbox and footer, then exposes window.BJJ for the page scripts. */
(() => {
const CFG = window.BJJ_CONFIG || {};
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = matchMedia('(pointer: fine)').matches;
const mobile = () => innerWidth <= 760;
const pad = (n, l = 2) => String(n).padStart(l, '0');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const page = document.body.dataset.page || 'home';

const PAGES = [
  ['home', './', 'Home'],
  ['highlights', 'highlights.html', 'Highlights'],
  ['gallery', 'gallery.html', 'Gallery'],
  ['clients', 'clients.html', 'Clients'],
  ['contact', 'contact.html', 'Book'],
];
const cur = k => k === page ? ' aria-current="page"' : '';
const ig = `https://www.instagram.com/${CFG.instagram}/`;
const wa = text => `https://wa.me/${CFG.whatsapp}${text ? '?text=' + encodeURIComponent(text) : ''}`;
const mail = (subject, body) => `mailto:${CFG.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

/* ---- chrome ---- */
document.body.insertAdjacentHTML('afterbegin', `
<a class="skip" href="#main">Skip to content</a>
<div class="grain" aria-hidden="true"></div>
<aside class="rail" aria-hidden="true">
  <img class="mark" src="logo.png" alt="">
  <span class="vert mono">Capturing Jiu-Jitsu in the Gulf</span>
  <div class="meter"><i id="meter"></i></div>
  <span class="vert mono fr" id="frame">FR 0001</span>
  <span class="vert mono">Est 2026</span>
</aside>
<nav class="nav" aria-label="Main">
  <a class="brand" href="./">BJJ SHOTS</a>
  <div class="links">${PAGES.slice(1, 4).map(p => `<a href="${p[1]}"${cur(p[0])}>${p[2]}</a>`).join('')}</div>
  <a class="cta" href="contact.html"${cur('contact')}><b></b>Book a shoot</a>
  <button class="burger" aria-expanded="false" aria-controls="menu"><span>Menu</span><i></i></button>
</nav>
<div class="menu" id="menu" role="dialog" aria-modal="true" aria-label="Menu">
  <div class="top"><b>BJJ SHOTS</b><button class="x">Close ×</button></div>
  <nav>${PAGES.map((p, i) => `<a href="${p[1]}"${cur(p[0])}><small>0${i + 1}</small>${p[2]}</a>`).join('')}</nav>
  <div class="foot mono"><a href="${wa()}" target="_blank" rel="noopener">WhatsApp ${esc(CFG.whatsappLabel)}</a><a href="mailto:${CFG.email}">${CFG.email}</a><a href="${ig}" target="_blank" rel="noopener">@${CFG.instagram}</a></div>
</div>`);
const main = $('main');
if (main && !main.id) main.id = 'main';
main?.insertAdjacentHTML('beforeend', `
<footer>
  <img src="logo.png" alt="BJJ Shots, est. 2026">
  <div class="soc">
    <a href="${ig}" target="_blank" rel="noopener">Instagram</a>
    <a href="https://www.tiktok.com/@${CFG.tiktok}" target="_blank" rel="noopener">TikTok</a>
    <a href="https://www.youtube.com/@${CFG.youtube}" target="_blank" rel="noopener">YouTube</a>
    <a href="${wa()}" target="_blank" rel="noopener">WhatsApp</a>
  </div>
  <span class="mono">© ${new Date().getFullYear()} BJJ Shots · <a href="privacy.html" style="color:inherit">Privacy</a></span>
</footer>`);
document.body.insertAdjacentHTML('beforeend', `
<div class="lb" id="lb" role="dialog" aria-modal="true" aria-label="Video player">
  <button class="x" id="lbx"><span>Close</span><b>×</b></button>
  <div class="box"><video id="lbv" controls playsinline preload="none"></video></div>
  <div class="t" id="lbt"></div>
</div>
<div class="cursor idle" aria-hidden="true"><span>Play</span></div>`);

/* ---- phone menu ---- */
const menu = $('#menu'), burger = $('.nav .burger');
let lastFocus = null;
const setMenu = on => {
  menu.classList.toggle('on', on); burger.setAttribute('aria-expanded', on);
  document.documentElement.style.overflow = on ? 'hidden' : '';
  if (on) { lastFocus = document.activeElement; setTimeout(() => $('.x', menu).focus(), 50); } else lastFocus?.focus?.();
};
burger.addEventListener('click', () => setMenu(true));
$('.x', menu).addEventListener('click', () => setMenu(false));
$$('nav a', menu).forEach(a => a.addEventListener('click', () => setMenu(false)));

/* ---- videos load and play only while on screen ---- */
const vio = new IntersectionObserver(es => es.forEach(e => {
  const v = e.target;
  if (e.isIntersecting) { if (!v.getAttribute('src') && v.dataset.src) v.src = v.dataset.src; if (!reduce || v.dataset.always) v.play().catch(() => {}); }
  else if (!v.paused) v.pause();
}), { rootMargin: '120px 300px' });
const watch = (root = document) => $$('video[data-src]', root).forEach(v => vio.observe(v));

/* ---- video lightbox ---- */
const lb = $('#lb'), lbv = $('#lbv'), lbt = $('#lbt');
let lbFrom = null;
const openVideo = ({ src, poster, title, tag, link }) => {
  lbFrom = document.activeElement;
  lbv.src = src; lbv.poster = poster || '';
  lbt.innerHTML = `<small class="mono">${esc(tag || '')}</small>${esc(title || '')}${link ? `<br><a href="${esc(link)}" target="_blank" rel="noopener">Watch on Instagram ↗</a>` : ''}`;
  lb.classList.add('on'); lbv.muted = false; lbv.play().catch(() => {});
  $('#lbx').focus({ preventScroll: true });
};
const closeVideo = () => { lb.classList.remove('on'); lbv.pause(); lbFrom?.focus?.({ preventScroll: true }); };
$('#lbx').addEventListener('click', closeVideo);
lb.addEventListener('click', e => { if (e.target === lb) closeVideo(); });
addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (lb.classList.contains('on')) closeVideo();
  else if (menu.classList.contains('on')) setMenu(false);
});
// any element with data-video opens the player
document.addEventListener('click', e => {
  const t = e.target.closest('[data-video]'); if (!t) return;
  e.preventDefault();
  openVideo({ src: t.dataset.video, poster: t.dataset.poster, title: t.dataset.title, tag: t.dataset.tag, link: t.dataset.link });
});

/* ---- cursor ---- */
const cursor = $('.cursor');
let mx = innerWidth / 2, my = innerHeight / 2, cx = mx, cy = my;
if (fine) {
  addEventListener('pointermove', e => { mx = e.clientX; my = e.clientY; cursor.classList.remove('idle'); }, { passive: true });
  document.addEventListener('pointerleave', () => cursor.classList.add('idle'));
  document.addEventListener('pointerover', e => {
    cursor.classList.toggle('play', !!e.target.closest('[data-video], [data-cursor=play]'));
    cursor.classList.toggle('hide', !!e.target.closest('[data-cursor=hide], input, textarea, select'));
  });
} else cursor.style.display = 'none';

/* ---- reveals + split titles ---- */
const rvio = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); rvio.unobserve(e.target); } }), { threshold: .15 });
const reveal = (root = document) => $$('.rv', root).forEach(el => rvio.observe(el));
reveal();
// .ph-title lines: each <span class="l"> rises out of its own slot
$$('.ph-title').forEach(t => {
  $$('.l', t).forEach(l => { l.outerHTML = `<span class="clip"><span class="ln">${l.innerHTML}</span></span>`; });
  $$('.ln', t).forEach((ln, i) => ln.style.transitionDelay = `${.1 + i * .12}s`);
  requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add('in')));
});

/* ---- rail meter + cursor follow ---- */
const meter = $('#meter'), frameEl = $('#frame');
const tick = () => {
  const tot = document.documentElement.scrollHeight - innerHeight, pg = tot > 0 ? scrollY / tot : 0;
  meter.style.transform = `scaleY(${pg})`;
  frameEl.textContent = 'FR ' + pad(1 + Math.round(pg * 2399), 4);
  if (fine) { cx += (mx - cx) * .25; cy += (my - cy) * .25; cursor.style.translate = `${cx}px ${cy}px`; }
  requestAnimationFrame(tick);
};
requestAnimationFrame(tick);

/* ---- data ---- */
const json = async url => { const r = await fetch(url, { cache: 'no-cache' }); if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); };
const fmtDate = d => { if (!d) return ''; try { const s = String(d); if (s.length === 7) return new Date(s + '-15T12:00:00').toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }); return new Date(s.length === 10 ? s + 'T12:00:00' : s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return d; } };
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

window.BJJ = { CFG, $, $$, clamp, ease, pad, esc, reduce, fine, mobile, wa, mail, ig, watch, reveal, openVideo, json, fmtDate, store, get mouse() { return { x: mx, y: my }; } };
})();
