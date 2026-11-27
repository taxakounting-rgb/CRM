/* ==========================================================================
   19-brand.js — Company branding (name, logo, colours) and a no-op License
   shim. This is a single-owner, universal CRM: there are no plans, limits or
   subscription keys. `License` keeps the small API the modules call
   (has / allow / need / readOnly / lock ...) and always says "yes".
   ========================================================================== */
const License = {
  info: { status: 'owner' },
  isOwner() { return true; },
  async load() { this.info = { status: 'owner' }; },
  needsActivation() { return false; },
  has() { return true; },
  limit() { return 0; },
  usage() { return {}; },
  readOnly() { return false; },
  allow() { return true; },
  need() { return true; },
  lock() { return ''; },
  banner() { return ''; },
  blocked() { /* never read-only */ },
  guardAct() { return true; },
  onlineCheck() { /* not used */ }
};

/* ---------- Brand helpers ---------- */
const Brand = {
  company() { return (Store.s && Store.s.settings && Store.s.settings.company) || {}; },
  wl() { return (Store.s && Store.s.settings && Store.s.settings.whiteLabel) || {}; },
  name() { return String(this.company().name || '').trim(); },
  /* App name shown in the browser tab, sign-in screen and notifications. */
  appName() {
    const w = this.wl().appName; if (w) return w;
    const n = this.name(); if (!n) return 'CRM';
    return /crm/i.test(n) ? n : n + ' CRM';
  },
  initials() {
    const n = this.name(); if (!n) return 'C';
    const parts = n.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
    if (!parts.length) return n[0].toUpperCase();
    return (parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[1][0]).toUpperCase();
  },
  vendor() { return false; },
  powered() { return false; },
  applyPreset() { /* no presets */ },
  footer() {
    const c = this.company();
    return html`${[c.name, c.phone, c.email, c.website, c.address].filter(Boolean).join('  |  ')}`;
  },
  /* Accent colour for printed documents: dominant colour of the company logo (falls back to the theme brand colour). */
  printColor() { const c = this.company(); return /^#[0-9a-f]{6}$/i.test(c.logoColor || '') ? c.logoColor : this.color(); },
  logoColor(src) {
    return new Promise((res) => {
      const img = new Image();
      img.onerror = () => res('');
      img.onload = () => {
        try {
          const n = 48; const cv = document.createElement('canvas'); cv.width = cv.height = n;
          const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(img, 0, 0, n, n);
          const d = cx.getImageData(0, 0, n, n).data; const bins = {}; const dark = { w: 0, r: 0, g: 0, b: 0 };
          for (let i = 0; i < d.length; i += 4) {
            if (d[i + 3] < 200) continue;
            const r = d[i], g = d[i + 1], b = d[i + 2]; const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
            const sat = mx === 0 ? 0 : (mx - mn) / mx; const lum = (r * 299 + g * 587 + b * 114) / 1000;
            if (lum > 238) continue;
            if (sat < 0.28 || lum < 28) { dark.w++; dark.r += r; dark.g += g; dark.b += b; continue; }
            const k = (r >> 5) + ',' + (g >> 5) + ',' + (b >> 5); const o = bins[k] || (bins[k] = { w: 0, r: 0, g: 0, b: 0 });
            o.w += sat; o.r += r * sat; o.g += g * sat; o.b += b * sat;
          }
          let best = null; Object.values(bins).forEach((o) => { if (!best || o.w > best.w) best = o; });
          const hex = (o, div) => '#' + [o.r, o.g, o.b].map((v) => Math.round(v / div).toString(16).padStart(2, '0')).join('');
          if (best && best.w > 0) return res(hex(best, best.w));
          if (dark.w > 0) return res(hex(dark, dark.w));
          res('');
        } catch (e) { res(''); }
      };
      img.src = src;
    });
  },
  /* Works out (once per logo) the colour used for the invoice header line, tables and labels. */
  async syncLogoColor() {
    const c = this.company(); if (!c.logo) return;
    const col = await this.logoColor(c.logo);
    Store.commit((s) => { s.settings.company.logoColor = col; });
  },
  customLogo() { const c = this.company(); return c.logo ? c.logo : ''; },
  /* Brand colour of the active theme, for favicon / print */
  color() { try { return Theme.skin().brand; } catch (e) { return '#1d64c8'; } }
};

/* A generated logo (initial badge + company name) used until a logo is uploaded. */
function logoSVG(opts = {}) {
  const col = opts.color || Brand.color(); const fg = (typeof Theme !== 'undefined' && Theme.onColor) ? Theme.onColor(col) : '#fff';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="${esc(Brand.name() || 'Logo')}" class="${opts.cls || ''}"><rect width="64" height="64" rx="16" fill="${col}"/><text x="32" y="33" text-anchor="middle" dominant-baseline="central" font-family="Arial,Helvetica,sans-serif" font-weight="800" font-size="${Brand.initials().length > 1 ? 26 : 32}" fill="${fg}">${esc(Brand.initials())}</text></svg>`;
}
function brandLogo(cls = '') {
  const custom = Brand.customLogo();
  if (custom) return html`<img src="${custom}" alt="${Brand.name() || 'Company'} logo" class="${cls}">`;
  return html`<div class="gen-logo ${cls}"><i>${Brand.initials()}</i><b>${Brand.name() || 'Your Company'}</b></div>`;
}
function setFavicon() {
  const custom = typeof Brand !== 'undefined' && Store.s ? Brand.customLogo() : '';
  const uri = custom || 'data:image/svg+xml,' + encodeURIComponent(logoSVG());
  let l = document.querySelector('link[rel="icon"]'); if (!l) { l = document.createElement('link'); l.rel = 'icon'; document.head.appendChild(l); }
  l.href = uri;
}

/* ---------- Currencies ---------- */
const CURRENCIES = [
  ['USD', '$', 'US Dollar'], ['EUR', '€', 'Euro'], ['GBP', '£', 'British Pound'], ['PKR', 'Rs', 'Pakistani Rupee'], ['INR', '₹', 'Indian Rupee'],
  ['AED', 'AED', 'UAE Dirham'], ['SAR', 'SAR', 'Saudi Riyal'], ['QAR', 'QAR', 'Qatari Riyal'], ['KWD', 'KWD', 'Kuwaiti Dinar'], ['BDT', '৳', 'Bangladeshi Taka'],
  ['CAD', 'CA$', 'Canadian Dollar'], ['AUD', 'A$', 'Australian Dollar'], ['NZD', 'NZ$', 'New Zealand Dollar'], ['SGD', 'S$', 'Singapore Dollar'], ['MYR', 'RM', 'Malaysian Ringgit'],
  ['TRY', '₺', 'Turkish Lira'], ['EGP', 'E£', 'Egyptian Pound'], ['NGN', '₦', 'Nigerian Naira'], ['KES', 'KSh', 'Kenyan Shilling'], ['ZAR', 'R', 'South African Rand'],
  ['CNY', 'CN¥', 'Chinese Yuan'], ['JPY', '¥', 'Japanese Yen'], ['CHF', 'CHF', 'Swiss Franc'], ['BRL', 'R$', 'Brazilian Real'], ['MXN', 'MX$', 'Mexican Peso']
];
