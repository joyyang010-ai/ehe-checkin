'use strict';
// Presentation-only adapter for the labelled shift descriptions already in the database.
// No participant data, credential changes, or public/private permission changes.
function shiftDetails(s) {
  const parse = raw => {
    const result = {title:'', location:'', map:'', body:[]};
    const lines = String(raw || '').split(/\r?\n/);
    for (const line of lines) {
      let m;
      if ((m = line.match(/^(?:Shift|\u73ed\u6b21)\s*[:\uff1a]\s*(.+)$/i))) result.title = m[1].trim();
      else if ((m = line.match(/^(?:Meeting point|\u96c6\u5408\u5730\u9ede)\s*[:\uff1a]\s*(.+)$/i))) result.location = m[1].trim();
      else if ((m = line.match(/^(?:Map|\u5730\u5716)\s*[:\uff1a]\s*(.+)$/i))) result.map = m[1].trim();
      else result.body.push(line);
    }
    result.body = result.body.join('\n').trim();
    return result;
  };
  const zh = parse(s?.description_zh), en = parse(s?.description_en);
  const primary = S.lang === 'zh' ? zh : en, fallback = S.lang === 'zh' ? en : zh;
  const e = eventFor(s);
  let map = primary.map || fallback.map;
  try {
    const u = new URL(map);
    if (u.protocol !== 'https:' || u.username || u.password ||
      !(u.hostname === 'maps.app.goo.gl' || (['www.google.com','maps.google.com'].includes(u.hostname) && u.pathname.startsWith('/maps')))) map = '';
  } catch { map = ''; }
  return {
    title: primary.title || fallback.title || label(roles,s?.duty),
    location: primary.location || fallback.location || e?.location || t('\u5730\u9ede\u5f85\u78ba\u8a8d','Location to be confirmed'),
    body: primary.body || fallback.body,
    map
  };
}
function shiftMeetingHTML(s) {
  const d = shiftDetails(s);
  return `<div class="shiftMeta"><strong>${t('\u96c6\u5408\u5730\u9ede','Meeting point')}</strong><br>${esc(d.location)}</div>` +
    (d.map ? `<p class="small"><a href="${esc(d.map)}" target="_blank" rel="noopener noreferrer">${t('\u958b\u555f\u5730\u5716','Open map')} \u2197</a></p>` : '');
}
summary = function(s) {
  const e = eventFor(s), d = shiftDetails(s);
  return `<div class="signupSummary"><h3>${esc(d.title)}</h3><p>${esc(name(e))}</p><p>${esc(e?.event_date || '')} \u00b7 ${time(s.starts_at)}\u2013${time(s.ends_at)} \u00b7 ${t('\u7d10\u7d04\u6642\u9593','New York time')}</p>${shiftMeetingHTML(s)}</div>`;
};
shiftCard = function(s) {
  const e = eventFor(s), c = counts(s), d = shiftDetails(s);
  const full = c.taken >= s.capacity || c.waiting > 0, ended = new Date(s.ends_at) < new Date();
  const requirements = S.lang === 'zh' ? (s.requirements_zh || s.requirements_en) : (s.requirements_en || s.requirements_zh);
  return `<article class="shiftCard"><div class="shiftCardTop"><span class="pill">${esc(e?.event_date || '')}</span><span class="pill ${full || s.requires_approval ? 'amber' : ''}">${ended?t('\u5df2\u7d50\u675f','Ended'):full?t('\u53ef\u5019\u88dc','Waitlist'):s.requires_approval?t('\u9700\u6838\u51c6','Approval required'):t('\u53ef\u5831\u540d','Open')}</span></div><h3>${esc(d.title)}</h3><div class="eventRef">${esc(name(e))}</div><div class="shiftMeta">${time(s.starts_at)}\u2013${time(s.ends_at)} \u00b7 ${t('\u7d10\u7d04\u6642\u9593','New York time')}</div>${shiftMeetingHTML(s)}<p class="shiftDesc">${esc(d.body).replace(/\n/g,'<br>')}</p>${requirements?`<p class="small muted">${esc(requirements)}</p>`:''}<div class="shiftCap"><span>${t('\u5df2\u78ba\u8a8d','Confirmed')} ${c.taken} / ${s.capacity}</span><strong>${full?t('\u53ef\u52a0\u5165\u5019\u88dc','Waitlist available'):t('\u5c1a\u9918 ','Remaining ')+Math.max(0,s.capacity-c.taken)}</strong></div><button class="btn ${full?'soft':'primary'}" data-action="signup" data-id="${esc(s.id)}" ${ended?'disabled':''}>${full?t('\u52a0\u5165\u5019\u88dc','Join waitlist'):t('\u67e5\u770b\u8207\u5831\u540d','View & sign up')} \u2192</button></article>`;
};
staffShifts = function() {
  return `<div class="actions">${btn(t('\u65b0\u589e\u73ed\u6b21','New shift'),'edit-shift','','primary')}</div><section class="panel">${table([t('\u73ed\u6b21\uff0f\u96c6\u5408\u5730\u9ede','Shift / meeting point'),t('\u6642\u9593\uff0f\u540d\u984d','Time / capacity'),t('\u767c\u5e03','Published'),t('\u64cd\u4f5c','Actions')],S.data.shifts.filter(s=>s.event_id===S.event).sort((a,b)=>a.starts_at.localeCompare(b.starts_at)||shiftDetails(a).title.localeCompare(shiftDetails(b).title)).map(s=>`<tr><td><strong>${esc(shiftDetails(s).title)}</strong>${shiftMeetingHTML(s)}<small>${s.requires_approval?t('\u9700\u6838\u51c6','Approval required'):t('\u6709\u540d\u984d\u5373\u78ba\u8a8d','Automatic confirmation')}</small></td><td>${time(s.starts_at)}\u2013${time(s.ends_at)}<br>${counts(s).taken} / ${s.capacity}</td><td>${s.published?t('\u662f','Yes'):t('\u5426\uff08\u8349\u7a3f\uff09','No (draft)')}</td><td>${btn(t('\u7de8\u8f2f','Edit'),'edit-shift',s.id)}</td></tr>`))}</section>`;
};
// Keep the existing submission workflow; improve shift names and meeting details only.
const originalOnsitePage = onsitePage;
onsitePage = function() {
  const template = document.createElement('template');
  template.innerHTML = originalOnsitePage();
  const select = template.content.querySelector('#onsiteForm select[name="shift_id"]');
  if (select) {
    for (const option of select.options) {
      const s = shift(option.value);
      if (s) option.textContent = `${nyDate(s.starts_at)} ${time(s.starts_at)} ${shiftDetails(s).title}`;
    }
    const s = shift(S.shift);
    if (s) {
      const block = document.createElement('div'); block.id = 'onsiteMeeting';
      block.innerHTML = shiftMeetingHTML(s);
      select.closest('.field').insertAdjacentElement('afterend',block);
    }
  }
  return template.innerHTML;
};
document.addEventListener('change',ev=>{
  const el = ev.target;
  if (S.busy || !el.matches?.('#onsiteForm select[name="shift_id"]')) return;
  const s = shift(el.value), block = document.getElementById('onsiteMeeting');
  if (s && block) block.innerHTML = shiftMeetingHTML(s);
});
