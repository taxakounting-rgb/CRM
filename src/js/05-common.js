/* ==========================================================================
   05-common.js — shared record helpers: delete with Undo, client timeline,
   message templates with placeholders, WhatsApp / email / call contact.
   ========================================================================== */
const Rec = {
  /* Removes item from collection, shows 5 s Undo toast, audit-logs. */
  remove(coll, item, label, module, after) {
    const arr = Store.s[coll]; const idx = arr.indexOf(item); if (idx < 0) return;
    Store.commit((s) => { s[coll].splice(idx, 1); });
    Auth.audit('delete', module, `Deleted ${label}`, { recordId: item.id, old: item });
    if (after) after(item);
    toast(`${label} deleted`, 'ok', {
      undo: () => {
        Store.commit((s) => { s[coll].splice(Math.min(idx, s[coll].length), 0, item); });
        Auth.audit('restore', module, `Undo delete: ${label}`, { recordId: item.id });
        toast('Restored');
      }
    });
  },
  stamp(o, isNew) { const now = new Date().toISOString(); if (isNew) { o.createdAt = now; o.createdBy = Auth.user ? Auth.user.username : 'system'; } o.updatedAt = now; return o; }
};

const Timeline = {
  add(clientId, type, text, at) {
    if (!clientId) return;
    Store.s.timeline.unshift({ id: uid('tl'), clientId, type, text, at: at || new Date().toISOString(), by: Auth.user ? Auth.user.name : 'System' });
    if (Store.s.timeline.length > 20000) Store.s.timeline.length = 20000;
  },
  of(clientId) { return Store.s.timeline.filter((t) => t.clientId === clientId); },
  ICON: { created: 'clients', service: 'services', task: 'tasks', invoice: 'invoices', payment: 'invoices', document: 'documents', note: 'edit', followup: 'calendar', credential: 'vault', status: 'check' }
};

const Tpl = {
  fill(text, ctx = {}) {
    const c = Store.s.settings.company || {};
    const map = Object.assign({ company: c.name || '', phone: c.phone || '', website: c.website || '' }, ctx);
    return String(text || '').replace(/\{(\w+)\}/g, (m, k) => (map[k] !== undefined && map[k] !== null ? map[k] : m));
  },
  ctxFor(client, task) {
    return { client: client ? client.name : '', code: client ? client.code : '', task: task ? task.title : '', due: task ? fmtDate(task.due) : '', officer: client ? DB.memberName(client.assignedTo) : '' };
  }
};

const Contact = {
  waNumber(m) { const d = String(m || '').replace(/\D/g, ''); if (!d) return ''; const dial = String(((Store.s.settings.company || {}).dialCode) || '').replace(/\D/g, ''); if (String(m).trim().startsWith('+')) return d; if (d.startsWith('00')) return d.slice(2); if (d.startsWith('0') && dial) return dial + d.slice(1); return d; },
  /* Opens a composer that fills a template and launches wa.me or mailto. */
  compose(channel, client, task) {
    const tpls = (Store.s.settings.templates || []).filter((t) => t.channel === channel);
    const ctx = Tpl.ctxFor(client, task);
    const target = channel === 'whatsapp' ? (client.whatsapp || client.mobile) : client.email;
    if (!target) { toast(channel === 'whatsapp' ? 'This client has no WhatsApp / mobile number.' : 'This client has no email address.', 'warn'); return; }
    const first = tpls[0] || { subject: '', body: 'Dear {client},\n\n' };
    Modal.open({
      title: channel === 'whatsapp' ? 'Send WhatsApp message' : 'Send email', size: 'md',
      body: html`<p class="muted sm">To: <b>${client.name}</b> · ${target}</p>
        <label class="fld"><span>Template</span><select data-tpl>${tpls.map((t, i) => html`<option value="${i}">${t.name}</option>`)}<option value="-1">Blank message</option></select></label>
        ${channel === 'email' ? html`<label class="fld"><span>Subject</span><input data-subj value="${Tpl.fill(first.subject, ctx)}"></label>` : ''}
        <label class="fld"><span>Message</span><textarea rows="7" data-body>${Tpl.fill(first.body, ctx)}</textarea></label>
        <p class="help">Placeholders such as {client}, {task}, {due} are filled automatically. Edit templates in Settings › Templates.</p>`,
      foot: html`<button type="button" class="btn ghost" data-close>Cancel</button><button type="button" class="btn primary" data-send>${channel === 'whatsapp' ? icon('wa') : icon('mail')}<span>${channel === 'whatsapp' ? 'Open WhatsApp' : 'Open email app'}</span></button>`,
      onMount: (el, m) => {
        el.querySelector('[data-tpl]').onchange = (e) => { const t = tpls[+e.target.value] || { subject: '', body: '' }; el.querySelector('[data-body]').value = Tpl.fill(t.body, ctx); const s = el.querySelector('[data-subj]'); if (s) s.value = Tpl.fill(t.subject, ctx); };
        el.querySelector('[data-send]').onclick = () => {
          const body = el.querySelector('[data-body]').value;
          if (channel === 'whatsapp') window.open('https://wa.me/' + this.waNumber(target) + '?text=' + encodeURIComponent(body), '_blank', 'noopener');
          else location.href = 'mailto:' + encodeURIComponent(target) + '?subject=' + encodeURIComponent(el.querySelector('[data-subj]').value) + '&body=' + encodeURIComponent(body);
          Store.commit(() => Timeline.add(client.id, 'note', `${channel === 'whatsapp' ? 'WhatsApp' : 'Email'} message sent`));
          m.close();
        };
      }
    });
  }
};

/* Simple CSV parser (quotes, commas, newlines) */
function parseCSV(text) {
  const rows = []; let row = [], cell = '', q = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}
