/* ==========================================================================
   18-themes.js — Colour themes (skins) × Light / Dark / System mode.
   A skin sets brand colour, sidebar, page background and chart accent.
   Saved per user (user.prefs) with a firm-wide default set by admins.
   ========================================================================== */
const T = (id, name, desc, brand, brandD, brandDk, side, sideDk, bg, x = {}) => Object.assign({ id, name, desc, brand, brandD, brandDk, side, sideDk, bg }, x);
const THEMES = [
  T('classic', 'Classic', 'Black sidebar with bold red accents', '#D62828', '#b51f1f', '#e5484d', '#111111', '#0b0b0d', '#F4F5F7'),
  T('ocean', 'Ocean Blue', 'Calm corporate navy & blue', '#1d64c8', '#164f9f', '#5b9cf0', '#0b1f3a', '#08162a', '#f2f5fa'),
  T('midnight', 'Midnight Indigo', 'Deep navy with electric indigo', '#4f46e5', '#4338ca', '#8b8cf8', '#0f172a', '#0a0f1f', '#f3f4fa'),
  T('graphite', 'Graphite Blue', 'Neutral graphite, clear blue accent', '#2563eb', '#1d4fc4', '#6ea0ff', '#1f2937', '#111827', '#f3f4f6'),
  T('slate', 'Slate Minimal', 'Quiet slate greys, no colour noise', '#334155', '#1e293b', '#94a3b8', '#1e293b', '#111827', '#f4f5f7'),
  T('emerald', 'Emerald Finance', 'Deep green: money & growth', '#0b7a53', '#08603f', '#34c38f', '#0c2e24', '#0a1f19', '#f2f6f4'),
  T('forest', 'Forest', 'Natural leaf green', '#2f7d32', '#256427', '#6fcf73', '#14291a', '#0d1c12', '#f3f6f2'),
  T('olive', 'Olive Grove', 'Earthy olive & khaki', '#5b6b1f', '#485516', '#a8bd4f', '#232a12', '#171c0b', '#f6f7f1'),
  T('teal', 'Teal Professional', 'Fresh teal with deep sea sidebar', '#0e7c86', '#0a626a', '#3cc3cc', '#08333a', '#06252a', '#f1f6f7'),
  T('royal', 'Royal Purple', 'Premium violet & indigo', '#6941c6', '#53389e', '#a28bf0', '#1f1641', '#160f2f', '#f5f4fa'),
  T('berry', 'Berry', 'Rich magenta & plum', '#a21caf', '#86198f', '#e879f9', '#2a0b32', '#1c0722', '#faf5fb'),
  T('rose', 'Rose Gold', 'Elegant rose with plum sidebar', '#be3a6b', '#9c2c55', '#f0739f', '#33162a', '#230e1c', '#faf4f6'),
  T('crimson', 'Crimson', 'Strong red on dark wine', '#b91c1c', '#991b1b', '#f87171', '#2a0f12', '#1c0a0c', '#faf4f4'),
  T('sunset', 'Sunset Amber', 'Warm orange & dark chocolate', '#c2410c', '#9a3412', '#ff8a4c', '#2b1609', '#1f0f06', '#faf6f2'),
  T('ember', 'Charcoal Orange', 'Charcoal with a bright orange pop', '#ea580c', '#c2410c', '#fb923c', '#1f1f1f', '#141414', '#f6f5f4'),
  T('gold', 'Black & Gold', 'Luxury black with antique gold', '#c9a227', '#a1821d', '#e6c65c', '#121212', '#0a0a0a', '#f6f5f1'),
  T('contrast', 'High Contrast', 'Maximum readability, strong borders', '#0040c1', '#002f8f', '#8ab4ff', '#000000', '#000000', '#ffffff', { contrast: true }),
  T('clean', 'Clean Light', 'Bright white sidebar with red accents', '#D62828', '#b51f1f', '#e5484d', '#ffffff', '#14171c', '#f6f7f9', { lightSide: true, hero: '#111111' }),
  T('sky', 'Sky Light', 'Airy white sidebar, sky-blue accents', '#0284c7', '#0369a1', '#38bdf8', '#ffffff', '#0f1b2a', '#f1f7fb', { lightSide: true, hero: '#0c4a6e' }),
  T('mint', 'Fresh Mint', 'Light mint sidebar, teal accents', '#0d9488', '#0f766e', '#2dd4bf', '#f0fdfa', '#0b1f1e', '#f3faf8', { lightSide: true, hero: '#134e4a' }),
  T('lavender', 'Lavender Light', 'Soft lilac sidebar, violet accents', '#7c3aed', '#6d28d9', '#a78bfa', '#faf5ff', '#1b1330', '#f7f4fc', { lightSide: true, hero: '#4c1d95' }),
  T('blossom', 'Pink Blossom', 'Blush sidebar, raspberry accents', '#db2777', '#be185d', '#f472b6', '#fff1f5', '#2a0d1a', '#fdf4f7', { lightSide: true, hero: '#831843' }),
  T('sand', 'Desert Sand', 'Warm sand sidebar, terracotta accents', '#b45309', '#92400e', '#f59e0b', '#fbf7f0', '#25190a', '#f8f5ee', { lightSide: true, hero: '#78350f' })
];

function shadeHex(hex, p) { const c = hex.replace('#', ''); const n = [0, 2, 4].map((i) => parseInt(c.substr(i, 2), 16)); const t = p < 0 ? 0 : 255; const a = Math.abs(p); return '#' + n.map((v) => Math.round(v + (t - v) * a).toString(16).padStart(2, '0')).join(''); }
const Theme = {
  /* Mode: 'light' | 'dark' | 'system' (stored per computer and per user) */
  mode() { const u = Auth.user; return (u && u.prefs && u.prefs.mode) || localStorage.getItem('crm_theme') || 'system'; },
  dark() { const m = this.mode(); return m === 'system' ? !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) : m === 'dark'; },
  /* Custom colours (any user can build their own theme): user prefs, then this computer, then the firm default. */
  customColors() {
    const u = Auth.user; let c = u && u.prefs && u.prefs.custom;
    if (!c) { try { c = JSON.parse(localStorage.getItem('crm_custom') || 'null'); } catch (e) { c = null; } }
    if (!c && Store.s && Store.s.settings) c = Store.s.settings.customTheme;
    return c && c.brand && c.side ? c : null;
  },
  makeCustom(c, id = 'custom', name = 'My custom theme', desc = 'Your own colours') {
    const dark = this.onColor(c.side) === '#ffffff';
    return { id, name, desc, brand: c.brand, brandD: shadeHex(c.brand, -0.18), brandDk: shadeHex(c.brand, 0.25), side: c.side, lightSide: !dark, hero: dark ? c.side : shadeHex(c.brand, -0.55), sideDk: dark ? shadeHex(c.side, -0.45) : shadeHex(c.brand, -0.72), bg: /^#[0-9a-f]{6}$/i.test(c.bg || '') ? c.bg : (dark ? '#f4f5f7' : shadeHex(c.side, -0.02)) };
  },
  /* Theme list: built-in themes + the company brand colours (Settings) + the user's own custom colours */
  list() {
    const out = THEMES.slice(); const w = typeof Brand !== 'undefined' && Store.s ? Brand.wl() : {};
    if (w.color) out.push(this.makeCustom({ brand: w.color, side: w.side || '#111111' }, 'brand', 'Company brand', 'Your company colours (Settings)'));
    const c = this.customColors(); if (c) out.push(this.makeCustom(c));
    return out;
  },
  allowed() { return true; },
  skinId() { const u = Auth.user; const id = (u && u.prefs && u.prefs.skin) || localStorage.getItem('crm_skin') || (Store.s && Store.s.settings && Store.s.settings.defaultSkin) || 'ocean'; return this.list().some((t) => t.id === id) ? id : 'ocean'; },
  skin() { return this.list().find((t) => t.id === this.skinId()); },
  /* Pick white or near-black text for best contrast on a colour */
  onColor(hex) {
    const c = hex.replace('#', ''); const v = [0, 2, 4].map((i) => { const x = parseInt(c.substr(i, 2), 16) / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
    const L = 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
    return (1.05 / (L + 0.05)) >= ((L + 0.05) / 0.0545) ? '#ffffff' : '#0b0d11';
  },
  css(t) {
    const light = t.lightSide
      ? `--side-bg:${t.side};--side-text:#374151;--side-muted:#6b7280;--side-hover:#f1f2f4;--side-strong:#111;--side-line:#e5e7eb;--side-active:${t.brand};--side-active-text:${this.onColor(t.brand)};`
      : `--side-bg:${t.side};--side-text:rgba(255,255,255,.78);--side-muted:rgba(255,255,255,.55);--side-hover:rgba(255,255,255,.08);--side-strong:#fff;--side-line:rgba(255,255,255,.1);--side-active:${t.brand};--side-active-text:${this.onColor(t.brand)};`;
    const hc = t.contrast ? '--line:#6b7280;--line2:#9ca3af;--muted:#374151;--text2:#111;--text:#000;--surface2:#f3f4f6;' : '';
    const hcDk = t.contrast ? '--line:#9aa1ad;--line2:#6b7280;--muted:#d1d5db;--text2:#f1f2f4;--text:#fff;--bg:#000;--surface:#0b0b0b;--surface2:#161616;' : '';
    return `:root{--brand:${t.brand};--brand-d:${t.brandD};--on-brand:${this.onColor(t.brand)};--brand-soft:color-mix(in srgb,${t.brand} 11%,transparent);--ring:color-mix(in srgb,${t.brand} 22%,transparent);--bg:${t.bg};--hero-bg:${t.hero || t.side};${light}${hc}}
:root[data-theme=dark]{--brand:${t.brandDk};--brand-d:${t.brand};--on-brand:${this.onColor(t.brandDk)};--brand-soft:color-mix(in srgb,${t.brandDk} 16%,transparent);--ring:color-mix(in srgb,${t.brandDk} 30%,transparent);--bg:#0f1115;--hero-bg:${t.sideDk};--side-bg:${t.sideDk};--side-text:rgba(255,255,255,.78);--side-muted:rgba(255,255,255,.55);--side-hover:rgba(255,255,255,.07);--side-strong:#fff;--side-line:rgba(255,255,255,.08);--side-active:${t.brandDk};--side-active-text:${this.onColor(t.brandDk)};${hcDk}}`;
  },
  apply() {
    const t = this.skin();
    let st = document.getElementById('tak-skin'); if (!st) { st = document.createElement('style'); st.id = 'tak-skin'; document.head.appendChild(st); }
    st.textContent = this.css(t);
    document.documentElement.dataset.theme = this.dark() ? 'dark' : 'light';
    document.documentElement.dataset.skin = t.id;
    const meta = document.querySelector('meta[name=theme-color]') || Object.assign(document.head.appendChild(document.createElement('meta')), { name: 'theme-color' });
    meta.content = this.dark() ? t.sideDk : t.side;
  },
  save(patch) {
    if (patch.skin) localStorage.setItem('crm_skin', patch.skin);
    if (patch.mode) localStorage.setItem('crm_theme', patch.mode);
    const u = Auth.user; if (u) Store.commit(() => { u.prefs = Object.assign({}, u.prefs, patch); }, { silent: true });
    this.apply(); if (Auth.user && $('#sidenav')) { App.renderChrome(); Router.refresh(); }
  },
  setSkin(id) { this.save({ skin: id }); },
  setMode(m) { this.save({ mode: m }); },
  toggle() { this.setMode(this.dark() ? 'light' : 'dark'); },
  /* Called after sign-in: adopt the user's saved theme (falls back to firm default) */
  loadUser() { const p = (Auth.user && Auth.user.prefs) || {}; if (p.skin) localStorage.setItem('crm_skin', p.skin); if (p.mode) localStorage.setItem('crm_theme', p.mode); this.apply(); }
};
if (window.matchMedia) matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (Theme.mode() === 'system') { Theme.apply(); if (Auth.user && $('#sidenav')) App.renderChrome(); } });

/* ---------- Picker UI (used in the top-bar dialog and Settings › Preferences) ---------- */
const ThemeUI = {
  card(t, on) {
    return html`<button type="button" class="th-card ${on ? 'on' : ''}" data-act="theme:skin" data-id="${t.id}" aria-pressed="${on}" aria-label="${t.name} theme">${this.cardInner(t, on)}</button>`;
  },
  cardInner(t, on) {
    const side = t.lightSide ? '#e5e7eb' : 'rgba(255,255,255,.7)';
    return html`<div class="th-prev" style="background:${t.bg}"><div class="th-side" style="background:${t.side};${t.lightSide ? 'border-right:1px solid #e5e7eb' : ''}"><i class="a" style="background:${t.brand}"></i><i style="background:${side}"></i><i style="background:${side}"></i><i style="background:${side}"></i><i style="background:${side}"></i></div>
      <div class="th-main"><div class="th-kpis"><i style="background:#fff;border:1px solid #e5e7eb"></i><i style="background:#fff;border:1px solid #e5e7eb"></i><i style="background:#fff;border:1px solid ${t.brand}"></i></div><div class="th-chart" style="background:#fff">${[40, 70, 55, 90, 60].map((h) => html`<i style="height:${h}%;background:${t.brand}"></i>`)}</div></div></div>
      <div class="th-name"><span>${t.name}</span>${on ? icon('check') : html`<span class="th-dots"><i style="background:${t.side}"></i><i style="background:${t.brand}"></i><i style="background:${t.bg}"></i></span>`}</div><div class="th-desc">${t.desc}</div>`;
  },
  modeSeg() {
    const m = Theme.mode();
    return html`<div class="mode-seg" role="group" aria-label="Colour mode">${[['light', 'Light', 'sun'], ['dark', 'Dark', 'moon'], ['system', 'System', 'dashboard']].map(([id, l, ic]) => html`<button type="button" class="${m === id ? 'on' : ''}" data-act="theme:mode" data-id="${id}" aria-pressed="${m === id}">${icon(ic)}${l}</button>`)}</div>`;
  },
  gallery(withDefault) {
    const cur = Theme.skinId(); const def = (Store.s.settings && Store.s.settings.defaultSkin) || 'ocean'; const list = Theme.list();
    const group = (title, arr) => arr.length ? html`<h4 class="th-group">${title} <span class="cnt">${arr.length}</span></h4><div class="theme-grid">${arr.map((t) => this.card(t, t.id === cur))}</div>` : '';
    const cc0 = Theme.customColors() || { brand: '#0e7c86', side: '#10242b' }; const cc = Object.assign({}, cc0, { bg: Theme.makeCustom(cc0).bg });
    return html`<div class="theme-bar">${this.modeSeg()}${withDefault && Auth.can('settings', 'edit') ? html`<span class="row-acts"><span class="muted sm">Company default: <b>${(list.find((t) => t.id === def) || {}).name}</b></span>${cur !== def ? btn('Make current theme the company default', 'theme:default', { cls: 'sm ghost' }) : ''}</span>` : ''}</div>
      ${group('Dark sidebar', list.filter((t) => !t.lightSide && t.id !== 'custom' && t.id !== 'brand'))}${group('Light sidebar', list.filter((t) => t.lightSide && t.id !== 'custom' && t.id !== 'brand'))}${group('Your colours', list.filter((t) => t.id === 'custom' || t.id === 'brand'))}
      <div class="card th-custom"><h4>Build your own theme</h4><p class="muted sm">Pick 3 colours, like the built-in themes: sidebar, brand (buttons, links, charts) and page background. Text colour is chosen automatically for readability.</p>
      <div class="th-custom-row"><div class="th-card th-live" data-cust-prev>${this.cardInner(Theme.makeCustom(cc, 'custom', 'Preview', 'Updates as you pick colours'))}</div><div class="row-acts" style="justify-content:flex-start;gap:14px;flex-wrap:wrap;align-content:flex-start"><label class="th-pick"><span>1. Sidebar colour</span><input type="color" data-cust="side" value="${cc.side}"></label><label class="th-pick"><span>2. Brand colour</span><input type="color" data-cust="brand" value="${cc.brand}"></label><label class="th-pick"><span>3. Page background</span><input type="color" data-cust="bg" value="${cc.bg}"></label>${btn('Use my colours', 'theme:custom', { cls: 'primary sm' })}</div></div></div>
      <p class="help mt">Your theme is saved to your user account, so each team member can choose their own. The company default is used on the sign-in screen and for users who have not picked one.</p>`;
  },
  open() {
    Modal.open({ title: 'Themes', size: 'xl', cls: 'theme-modal', body: html`<div data-theme-gallery>${this.gallery(true)}</div>`, foot: html`<button type="button" class="btn primary" data-close>Done</button>` });
  },
  redraw() { $$('[data-theme-gallery]').forEach((g) => { g.innerHTML = String(this.gallery(true)); }); }
};
act('theme:open', () => ThemeUI.open());
act('theme:skin', (a) => { Theme.setSkin(a.dataset.id); ThemeUI.redraw(); });
act('theme:mode', (a) => { Theme.setMode(a.dataset.id); ThemeUI.redraw(); });
act('theme:custom', (a) => { const root = a.closest('.th-custom'); const c = { brand: root.querySelector('[data-cust=brand]').value, side: root.querySelector('[data-cust=side]').value, bg: root.querySelector('[data-cust=bg]').value }; try { localStorage.setItem('crm_custom', JSON.stringify(c)); } catch (e) { /* ignore */ } Theme.save({ skin: 'custom', custom: c }); ThemeUI.redraw(); toast('Custom theme applied'); });
act('theme:default', () => { const id = Theme.skinId(); Store.commit((s) => { s.settings.defaultSkin = id; if (id === 'custom') s.settings.customTheme = Theme.customColors(); }); Auth.audit('edit', 'settings', `Company default theme set to ${(Theme.list().find((t) => t.id === id) || {}).name}`); toast('Company default theme updated'); ThemeUI.redraw(); });
document.addEventListener('input', (e) => {
  const i = e.target.closest && e.target.closest('[data-cust]'); if (!i) return; const root = i.closest('.th-custom'); const v = (k) => root.querySelector(`[data-cust=${k}]`).value;
  const pv = root.querySelector('[data-cust-prev]'); if (pv) pv.innerHTML = String(ThemeUI.cardInner(Theme.makeCustom({ brand: v('brand'), side: v('side'), bg: v('bg') }, 'custom', 'Preview', 'Updates as you pick colours')));
});
