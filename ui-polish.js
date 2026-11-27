/* =====================================================================
   ui-polish.js — (1) แทนอีโมจิด้วยไอคอนเส้นชุดเดียวกันทั้งเว็บ
                  (2) ป้ายข้อมูลในแบนเนอร์ (เดือน/วันที่/โหมด/เลขเอกสาร)
   ต้องโหลดก่อน stock-level.js (ให้ตัวจัดการพิมพ์ทำงานต่อกันถูกลำดับ)
   ===================================================================== */
(function () {
  // ---------- 1) อีโมจิ → ไอคอน ----------
  const S = {
    cal:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/>',
    chart:'<path d="M4 20V4M4 20h16"/><path d="M8 16l4-5 3 3 5-7"/>',
    clip:'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 11h6M9 15h6"/>',
    file:'<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>',
    edit:'<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>',
    tag:'<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.2"/>',
    search:'<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    imp:'<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
    exp:'<path d="M12 16V4M7 8l5-5 5 5M4 21h16"/>',
    print:'<path d="M7 9V3h10v6M7 17H5a2 2 0 01-2-2v-4a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2h-2"/><rect x="7" y="14" width="10" height="7" rx="1"/>',
    refresh:'<path d="M20 11a8 8 0 00-14-4L4 9M4 4v5h5M4 13a8 8 0 0014 4l2-2M20 20v-5h-5"/>',
    trash:'<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6"/>',
    alert:'<path d="M6 16V11a6 6 0 1112 0v5l2 2H4z"/><path d="M10 21h4"/>',
    hist:'<path d="M3 12a9 9 0 109-9 9 9 0 00-7 3L3 8"/><path d="M3 3v5h5M12 8v4l3 2"/>',
    user:'<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
    users:'<circle cx="9" cy="8" r="3.5"/><path d="M2 20c.8-3.5 3.5-5 7-5s6.2 1.5 7 5M16 4.5a3.5 3.5 0 010 7M18 15c2 .6 3.5 2 4 5"/>',
    ok:'<circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/>',
    x:'<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>',
    warn:'<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>',
    box:'<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
    flame:'<path d="M12 3c1 4 5 5 5 10a5 5 0 01-10 0c0-2 1-3 2-4 .3 1.5 1 2 2 2-1-3-1-5 1-8z"/>',
    save:'<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h7V3M8 21v-7h8v7"/>',
    lock:'<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 118 0v3"/>',
    filter:'<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    minus:'<path d="M5 12h14"/>',
    cart:'<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.5 12h11L21 7H6"/>',
    target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    spark:'<path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/>',
    key:'<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3"/>',
    bld:'<path d="M4 21V5l8-2v18M12 9h8v12M7 9h2M7 13h2M7 17h2M15 13h2M15 17h2"/>',
    scale:'<path d="M12 4v16M6 20h12M5 8h14M5 8l-3 7a3 3 0 006 0zM19 8l-3 7a3 3 0 006 0z"/>',
    pin:'<path d="M12 21v-7M8 3h8l-1 6 3 4H6l3-4z"/>',
    eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    gear:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
    clipx:'<path d="M20 11l-8 8a5 5 0 01-7-7l9-9a3.5 3.5 0 015 5l-9 9a2 2 0 01-3-3l8-8"/>',
    trophy:'<path d="M8 4h8v6a4 4 0 01-8 0zM8 6H4v2a3 3 0 003 3M16 6h4v2a3 3 0 01-3 3M12 14v4M8 21h8"/>',
    hash:'<path d="M5 9h14M5 15h14M10 3L8 21M16 3l-2 18"/>',
    bulb:'<path d="M9 18h6M10 21h4M12 3a6 6 0 00-4 10c1 1 1 2 1 3h6c0-1 0-2 1-3a6 6 0 00-4-10z"/>',
    ruler:'<path d="M3 17L17 3l4 4L7 21z"/><path d="M8 12l2 2M11 9l2 2M14 6l2 2"/>',
    help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 115 0c0 1.5-2.5 2-2.5 4M12 17h.01"/>',
    up:'<path d="M6 15l6-6 6 6"/>',
    hourglass:'<path d="M7 3h10M7 21h10M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9"/>'
  };
  const M = {
    '📅':'cal','🗓':'cal','📊':'chart','📋':'clip','📄':'file','🧾':'file','📝':'edit','✏':'edit','🔖':'tag','🏷':'tag','💰':'tag',
    '🔍':'search','📥':'imp','📤':'exp','🖨':'print','🔄':'refresh','♻':'refresh','🗑':'trash','🚨':'alert:r','📜':'hist',
    '👤':'user','👥':'users','✅':'ok:g','❌':'x:r','✕':'x:r','⚠':'warn:a','📦':'box','🔥':'flame:o','💾':'save','🔒':'lock','🔐':'lock',
    '🔽':'filter','➕':'plus','➖':'minus','🛒':'cart','🎯':'target','🆕':'spark','🌟':'spark','🎉':'spark','🔑':'key','🏢':'bld',
    '⚖':'scale','📌':'pin','👁':'eye','⚙':'gear','🛠':'gear','🔧':'gear','📎':'clipx','🏆':'trophy','🔢':'hash','💡':'bulb',
    '📏':'ruler','❓':'help','🔼':'up','🟢':'dot:g','🔴':'dot:r','🟡':'dot:a','⚪':'dot:n','✗':'x:r','⏳':'hourglass','⌛':'hourglass'
  };
  const keys = Object.keys(M).sort((a, b) => b.length - a.length).join('|');
  const RX = new RegExp('(' + keys + ')\\uFE0F?', 'g');
  const TEST = new RegExp('(' + keys + ')');
  const mk = code => {
    const [k, c] = code.split(':');
    if (k === 'dot') return '<i class="ic-dot ic-' + c + '"></i>';
    return '<svg class="ic' + (c ? ' ic-' + c : '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + S[k] + '</svg>';
  };
  const SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, OPTION: 1, TITLE: 1, SELECT: 1 };

  function processText(tn) {
    const p = tn.parentNode;
    if (!p || SKIP[p.nodeName] || !TEST.test(tn.nodeValue)) return;
    if (p.nodeName === 'OPTION' || p.closest('select,textarea,[contenteditable]')) return;
    const frag = document.createElement('span');
    frag.innerHTML = tn.nodeValue.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(RX, (m, e) => mk(M[e]));
    const wrap = document.createDocumentFragment();
    while (frag.firstChild) wrap.appendChild(frag.firstChild);
    p.replaceChild(wrap, tn);
  }
  function fixAttrs(el) {
    ['placeholder', 'title'].forEach(a => {
      const v = el.getAttribute && el.getAttribute(a);
      if (v && TEST.test(v)) el.setAttribute(a, v.replace(RX, '').trim());
    });
  }
  function fixOption(o) { if (TEST.test(o.text)) o.text = o.text.replace(RX, '').trim(); }
  function scan(root) {
    if (root.nodeType === 3) { processText(root); return; }
    if (root.nodeType !== 1 || SKIP[root.nodeName] && root.nodeName !== 'OPTION') { if (root.nodeName === 'OPTION') fixOption(root); return; }
    fixAttrs(root);
    root.querySelectorAll('[placeholder],[title]').forEach(fixAttrs);
    root.querySelectorAll('option').forEach(fixOption);
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const list = []; let n;
    while ((n = w.nextNode())) if (TEST.test(n.nodeValue)) list.push(n);
    list.forEach(processText);
  }
  let busy = false;
  const mo = new MutationObserver(muts => {
    if (busy) return; busy = true;
    try {
      muts.forEach(m => {
        if (m.type === 'childList') m.addedNodes.forEach(scan);
        else if (m.type === 'characterData') processText(m.target);
      });
    } finally { busy = false; }
  });
  function start() {
    scan(document.body);
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  // ---------- 2) ป้ายในแบนเนอร์ ----------
  const $ = id => document.getElementById(id);
  const ci = k => '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + S[k] + '</svg>';
  const val = id => { const e = $(id); return e ? (e.value || '').trim() : ''; };
  const selText = id => { const e = $(id); return e && e.selectedIndex >= 0 ? e.options[e.selectedIndex].text.replace(RX, '').trim() : ''; };
  const MON = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  function ym(v) { const m = /^(\d{4})-(\d{2})/.exec(v || ''); return m ? MON[+m[2] - 1] + ' ' + (+m[1] + 543) : ''; }
  function dmy(v) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || ''); return m ? m[3] + '/' + m[2] + '/' + (+m[1] + 543) : v; }

  const orig = {};   // ที่อยู่เดิมของ select ชื่อเรื่องรายงาน (ย้ายกลับตอนพิมพ์)
  function moveTitleSelects(toBanner) {
    const m = $('titleMonth'), y = $('titleYear');
    if (!m || !y) return;
    const mw = m.closest('.dd') || m, yw = y.closest('.dd') || y;
    if (toBanner) {
      if (!orig.parent) { orig.parent = mw.parentNode; }
      let box = $('bnTitleCtl');
      if (!box) {
        box = document.createElement('span'); box.id = 'bnTitleCtl'; box.className = 'bn-chip bn-ctl';
        box.innerHTML = ci('cal') + '<span>ประจำเดือน</span>';
      }
      // ย้ายเฉพาะเมื่อยังไม่อยู่ที่เดิม (ย้ายซ้ำทำให้รายการเลือกที่เปิดอยู่เด้งปิด)
      if (mw.parentNode !== box) box.appendChild(mw);
      if (yw.parentNode !== box) box.appendChild(yw);
      const bc = $('bnChips'); if (bc && box.parentNode !== bc) bc.insertBefore(box, bc.firstChild);
    } else if (orig.parent && mw.parentNode !== orig.parent) {
      orig.parent.appendChild(mw); orig.parent.appendChild(yw);
      const b = $('bnTitleCtl'); if (b) b.remove();
    }
  }

  function chipsFor(tab) {
    const c = [];
    if (tab === 'matrix') {
      const r = document.querySelector('input[name="mode"]:checked');
      if (r) { const l = r.closest('label'); c.push(['box', 'โหมด: ' + (l ? l.textContent.trim() : r.value)]); }
    } else if (tab === 'stock') { if (val('stockDate')) c.push(['cal', 'Stock วันที่ ' + dmy(val('stockDate'))]); }
    else if (tab === 'receive') { if (val('receiveDate')) c.push(['cal', 'รับเข้าวันที่ ' + dmy(val('receiveDate'))]); }
    else if (tab === 'alert') {
      if (val('alertDate')) c.push(['cal', 'วันที่วิเคราะห์ ' + dmy(val('alertDate'))]);
      const u = selText('alertUsageRange'); if (u && !/ไม่ใช้|ยังไม่มี/.test(u)) c.push(['chart', 'Usage Plan: ' + u]);
    } else if (tab === 'purchase-order') { if (ym(val('poMonth'))) c.push(['cal', ym(val('poMonth'))]); }
    else if (tab === 'usage-pivot') { if (ym(val('pivot-month'))) c.push(['cal', ym(val('pivot-month'))]); }
    else if (tab === 'reservations') { if (val('reservationDate')) c.push(['cal', 'ยอดจองคงเหลือวันที่ ' + dmy(val('reservationDate'))]); }
    else if (tab === 'usage-issue') {
      if (val('uiFrom') && val('uiTo')) c.push(['cal', dmy(val('uiFrom')) + ' – ' + dmy(val('uiTo'))]);
      const g = selText('uiGroup'); if (g) c.push(['layers', 'จัดกลุ่มตาม' + g]);
    }
    return c;
  }
  S.layers = '<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/>';

  function refreshChips() {
    const box = $('bnChips'); if (!box) return;
    const act = document.querySelector('[id^="tab-"]:not(.hidden)');
    const tab = act ? act.id.slice(4) : '';
    // ป้ายแบบอ่านอย่างเดียว
    box.querySelectorAll('.bn-chip:not(.bn-ctl)').forEach(e => e.remove());
    moveTitleSelects(tab === 'matrix');
    chipsFor(tab).forEach(([i, t]) => {
      const s = document.createElement('span'); s.className = 'bn-chip'; s.innerHTML = ci(i) + '<span></span>';
      s.lastChild.textContent = t; box.appendChild(s);
    });
    const code = $('bnCode');
    if (code) { const d = act && act.querySelector('.report-doc'); code.textContent = d ? d.textContent.trim() : ''; code.style.display = d ? '' : 'none'; }
  }
  let t = null;
  const later = () => { clearTimeout(t); t = setTimeout(refreshChips, 120); };
  ['change', 'input', 'click'].forEach(ev => document.addEventListener(ev, later, true));
  window.refreshBannerChips = refreshChips;
  const nav = window.onShellNavigate;
  window.onShellNavigate = function (b) { if (nav) nav(b); setTimeout(refreshChips, 60); setTimeout(refreshChips, 600); };

  // พิมพ์: คืน select ไปที่ report-title ก่อนตัวจัดการพิมพ์เดิมทำงาน
  window.addEventListener('beforeprint', () => moveTitleSelects(false));
  window.addEventListener('afterprint', () => setTimeout(refreshChips, 50));


  // ---------- 3) ตาราง Matrix: ใส่ระดับสีให้ช่องตัวเลข ----------
  function lvOf(v) { return v < 3 ? 1 : v < 6 ? 2 : 3; }
  function skinTables(root) {
    (root.querySelectorAll ? root : document).querySelectorAll('.report-table td.clickable:not([data-lv])').forEach(td => {
      const m = /-?\d+(?:\.\d+)?/.exec(td.textContent.replace(/,/g, ''));
      if (!m) return;
      td.dataset.lv = lvOf(Math.abs(parseFloat(m[0])));
      const kid = td.firstElementChild;
      if (!kid && td.childNodes.length === 1 && td.firstChild.nodeType === 3) {
        const sp = document.createElement('span'); sp.className = 'pill'; sp.textContent = td.firstChild.nodeValue; td.replaceChild(sp, td.firstChild);
      }
    });
  }
  const mo2 = new MutationObserver(muts => {
    for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1 && (n.matches('.report-wrap,.report-table,table') || n.querySelector('.report-table'))) { skinTables(n); }
  });
  mo2.observe(document.body, { childList: true, subtree: true });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  setTimeout(refreshChips, 300);
})();


/* =====================================================================
   ช่องเลือก (dropdown) / ปฏิทินเดือน / ปฏิทินวัน — หน้าตาเดียวกันทั้งเว็บ
   (ค่าจริงยังอยู่ใน <select>/<input> เดิม จึงไม่กระทบโค้ดหน้าอื่น)
   ===================================================================== */
(function () {
  const TH_M = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  const TH_S = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  const CHEV = '<svg class="dd-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';
  const CAL = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>';
  const esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const synced = [];
  let openMenu = null;

  function closeAny() { if (openMenu) { openMenu.el.remove(); openMenu.btn.classList.remove('open'); openMenu = null; } }
  document.addEventListener('mousedown', e => { if (openMenu && !openMenu.el.contains(e.target) && !openMenu.btn.contains(e.target)) closeAny(); }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAny(); });
  window.addEventListener('scroll', e => { if (openMenu && !openMenu.el.contains(e.target)) closeAny(); }, true);
  window.addEventListener('resize', closeAny);

  function place(el, btn, minW) {
    const r = btn.getBoundingClientRect();
    el.style.minWidth = Math.max(minW || 0, r.width) + 'px';
    document.body.appendChild(el);
    const h = el.offsetHeight, w = el.offsetWidth;
    let top = r.bottom + 4; if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 4);
    el.style.top = top + 'px'; el.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left)) + 'px';
  }
  function fire(el, names) { names.forEach(n => el.dispatchEvent(new Event(n, { bubbles: true }))); }

  // ----- 1) <select> -> dropdown -----
  function enhanceSelect(sel) {
    if (sel.dataset.dd || sel.multiple) return;
    sel.dataset.dd = '1';
    const wrap = document.createElement('span'); wrap.className = 'dd';
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'dd-btn';
    sel.parentNode.insertBefore(wrap, sel); wrap.appendChild(sel); wrap.appendChild(btn);
    sel.classList.add('dd-native'); sel.tabIndex = -1;
    const w = sel.style.width; if (w) wrap.style.width = w;
    const stamp = () => sel.value + '|' + sel.options.length + '|' + (sel.options[sel.selectedIndex] || {}).text;
    const label = () => { const o = sel.options[sel.selectedIndex]; btn.innerHTML = '<span class="dd-lb">' + esc(o ? o.text.trim() : '') + '</span>' + CHEV; btn.dataset.st = stamp(); btn.disabled = sel.disabled; };
    label();
    btn.addEventListener('click', () => {
      if (openMenu && openMenu.btn === btn) { closeAny(); return; }
      closeAny();
      const m = document.createElement('div'); m.className = 'dd-menu';
      Array.from(sel.options).forEach((o, i) => {
        if (o.hidden) return;
        const it = document.createElement('div'); it.className = 'dd-it' + (i === sel.selectedIndex ? ' sel' : '') + (o.disabled ? ' dis' : '');
        it.innerHTML = '<span>' + esc(o.text.trim()) + '</span>' + (i === sel.selectedIndex ? '<svg class="dd-ck" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg>' : '');
        it.addEventListener('click', () => { if (o.disabled) return; closeAny(); if (sel.selectedIndex !== i) { sel.selectedIndex = i; fire(sel, ['input', 'change']); } label(); });
        m.appendChild(it);
      });
      place(m, btn, 150); btn.classList.add('open'); openMenu = { el: m, btn };
      const s = m.querySelector('.sel'); if (s) s.scrollIntoView({ block: 'nearest' });
    });
    sel.addEventListener('change', label);
    synced.push(() => { if (!sel.isConnected) return false; if (btn.dataset.st !== stamp() || btn.disabled !== sel.disabled) label(); return true; });
  }

  // ----- 2) input[type=month] -> ปฏิทินเลือกเดือน -----
  function monthText(v) { const m = /^(\d{4})-(\d{2})/.exec(v || ''); return m ? TH_S[+m[2] - 1] + ' ' + (+m[1] + 543) : 'เลือกเดือน'; }
  function openMonthPicker(inp, btn) {
    closeAny();
    let year = /^\d{4}/.test(inp.value) ? +inp.value.slice(0, 4) : new Date().getFullYear();
    const box = document.createElement('div'); box.className = 'fc-mp ui-mp';
    const nowYm = new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0');
    const draw = () => {
      box.innerHTML = '<div class="fc-mp-head"><button type="button" data-y="-1">‹</button><b>' + (year + 543) + '</b><button type="button" data-y="1">›</button></div><div class="fc-mp-grid">' +
        TH_S.map((nm, i) => { const ym = year + '-' + String(i + 1).padStart(2, '0'); return '<button type="button" class="' + (ym === inp.value ? 'sel' : '') + (ym === nowYm ? ' now' : '') + '" data-m="' + ym + '">' + nm + '</button>'; }).join('') +
        '</div><div class="fc-mp-foot"><button type="button" data-clear="1">ล้างค่า</button><button type="button" data-now="1">เดือนนี้</button></div>';
    };
    draw();
    box.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      const set = v => { closeAny(); inp.value = v; btn.querySelector('.dd-lb').textContent = monthText(v); fire(inp, ['input', 'change']); };
      if (b.dataset.y) { year += +b.dataset.y; draw(); } else if (b.dataset.m) set(b.dataset.m); else if (b.dataset.clear) set(''); else if (b.dataset.now) set(nowYm);
    });
    place(box, btn, 236); btn.classList.add('open'); openMenu = { el: box, btn };
  }
  function enhanceMonth(inp) {
    if (inp.dataset.mp) return; inp.dataset.mp = '1';
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'dd-btn mp-btn';
    inp.type = 'hidden'; inp.parentNode.insertBefore(btn, inp.nextSibling);
    const label = () => { btn.innerHTML = CAL + '<span class="dd-lb">' + esc(monthText(inp.value)) + '</span>' + CHEV; btn.dataset.st = inp.value; };
    label();
    btn.addEventListener('click', () => { if (openMenu && openMenu.btn === btn) { closeAny(); return; } openMonthPicker(inp, btn); });
    synced.push(() => { if (!inp.isConnected) return false; if (btn.dataset.st !== inp.value) label(); return true; });
  }

  // ----- 3) input[type=date] -> flatpickr (หน้าตาเดียวกับช่องวันที่อื่น) -----
  function enhanceDate(inp) {
    if (inp.dataset.dp || typeof flatpickr === 'undefined') return; inp.dataset.dp = '1';
    if (/^(exportPoDate|dt)/.test(inp.id)) return; // app.js แปลงเป็น flatpickr เองอยู่แล้ว
    const v = inp.value;
    inp.setAttribute('type', 'text'); inp.setAttribute('autocomplete', 'off'); inp.setAttribute('placeholder', 'YYYY-MM-DD');
    inp.value = v;
    const fp = flatpickr(inp, { locale: 'th', dateFormat: 'Y-m-d', allowInput: false, disableMobile: true, defaultDate: v || null });
    synced.push(() => {
      if (!inp.isConnected) return false;
      const cur = fp.selectedDates[0] ? fp.formatDate(fp.selectedDates[0], 'Y-m-d') : '';
      if (inp.value !== cur) fp.setDate(inp.value || null, false);
      return true;
    });
  }

  function scan() {
    document.querySelectorAll('.filters select:not([data-dd]), .ui-filters select:not([data-dd]), #alertMatrixCellBody select:not([data-dd]), .bn-ctl select:not([data-dd])').forEach(enhanceSelect);
    document.querySelectorAll('input[type="month"]:not([data-mp])').forEach(i => { if (!i.closest('.modal-bg.hidden')) enhanceMonth(i); });
    document.querySelectorAll('input[type="date"]:not([data-dp])').forEach(enhanceDate);
  }
  function tick() {
    for (let i = synced.length - 1; i >= 0; i--) { try { if (synced[i]() === false) synced.splice(i, 1); } catch (e) { synced.splice(i, 1); } }
  }
  function start() {
    scan(); setInterval(scan, 1200); setInterval(tick, 600);
    // ปรับเป็นคอนโทรลใหม่ทันทีที่มีองค์ประกอบโผล่ (ก่อนวาดภาพ) กันเห็นของเก่ากระพริบ
    let pend = false;
    new MutationObserver(() => { if (pend) return; pend = true; Promise.resolve().then(() => { pend = false; try { scan(); } catch (e) {} }); })
      .observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();


/* =====================================================================
   ฟิลเตอร์เลือกหลายรายการ (.grade-filter-box) — หัวไล่สี + ค้นหา + แบ่งกลุ่ม + แท็กในช่อง + ปุ่มตกลง
   (ชั้นหน้าตาเท่านั้น: การเลือกจริงยังเป็น checkbox เดิม แต่ละหน้าจึงทำงานเหมือนเดิม)
   ===================================================================== */
(function () {
  const esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const titleOf = box => {
    const lab = box.closest('label');
    if (lab) for (const n of lab.childNodes) if (n.nodeType === 3 && n.textContent.trim()) return n.textContent.trim().replace(/[:：]\s*$/, '');
    return 'เลือกรายการ';
  };
  const items = dd => Array.from(dd.querySelectorAll('.grade-list .item'));
  const txt = it => { const sp = it.querySelector('span'); return (sp ? sp.textContent : it.textContent).trim(); };
  const cbOf = it => it.querySelector('input[type="checkbox"]');
  const isGradeBox = box => /grade/i.test(box.id || '');

  function regroup(box, list) {
    list.querySelectorAll('.gd-group').forEach(g => g.remove());
    if (!isGradeBox(box)) return;
    let prev = null;
    items(box.querySelector('.grade-dropdown')).forEach(it => {
      const m = /^[A-Z]+/.exec(txt(it)); const g = m ? m[0] : '';
      if (g && g !== prev) {
        const h = document.createElement('div'); h.className = 'gd-group'; h.dataset.g = g;
        h.innerHTML = '<span>' + esc(g) + '</span><b>เลือกทั้งกลุ่ม</b>';
        list.insertBefore(h, it);
      }
      it.dataset.g = g; prev = g;
    });
  }

  function refresh(box) {
    const dd = box.querySelector('.grade-dropdown'), btn = box.querySelector('.grade-filter-btn'); if (!dd || !btn) return;
    const its = items(dd), on = its.filter(it => cbOf(it) && cbOf(it).checked);
    const n = on.length, total = its.length;
    const c = dd.querySelector('.gd-count'); if (c) c.textContent = 'เลือกแล้ว ' + n;
    const sel = dd.querySelector('.gd-sel'); if (sel) sel.textContent = 'เลือกแล้ว ' + n + ' จาก ' + total;
    const tags = btn.querySelector('.gf-tags');
    if (tags) {
      if (n > 0 && n < total) {
        const show = on.slice(0, 2);
        tags.innerHTML = show.map(it => '<span class="gf-tag" data-k="' + its.indexOf(it) + '">' + esc(txt(it)) + '<b>×</b></span>').join('') + (n > 2 ? '<span class="gf-tag more">+' + (n - 2) + '</span>' : '');
        btn.classList.add('has-tags');
      } else { tags.innerHTML = ''; btn.classList.remove('has-tags'); }
    }
  }

  function build(box) {
    const dd = box.querySelector('.grade-dropdown'), btn = box.querySelector('.grade-filter-btn'), list = dd && dd.querySelector('.grade-list');
    if (!dd || !btn || !list || dd.dataset.gd) return;
    dd.dataset.gd = '1';
    const head = document.createElement('div'); head.className = 'gd-head';
    head.innerHTML = '<span class="gd-title">เลือก ' + esc(titleOf(box)) + '</span><span class="gd-count">เลือกแล้ว 0</span>';
    dd.insertBefore(head, dd.firstChild);
    if (!dd.querySelector('input[type="text"]')) {
      const sw = document.createElement('div'); sw.className = 'gd-search';
      sw.innerHTML = '<input type="text" placeholder="ค้นหา…" autocomplete="off">';
      head.after(sw);
      sw.firstChild.addEventListener('input', () => {
        const q = sw.firstChild.value.trim().toLowerCase();
        items(dd).forEach(it => { it.style.display = !q || txt(it).toLowerCase().includes(q) ? '' : 'none'; });
        list.querySelectorAll('.gd-group').forEach(g => {
          const any = items(dd).some(it => it.dataset.g === g.dataset.g && it.style.display !== 'none'); g.style.display = any ? '' : 'none';
        });
      });
    }
    const foot = document.createElement('div'); foot.className = 'gd-foot';
    foot.innerHTML = '<span class="gd-sel">เลือกแล้ว 0 จาก 0</span><button type="button" class="gd-ok">ตกลง</button>';
    dd.appendChild(foot);
    foot.querySelector('.gd-ok').addEventListener('click', e => { e.stopPropagation(); dd.classList.add('hidden'); btn.classList.remove('open'); });
    const tags = document.createElement('span'); tags.className = 'gf-tags';
    const arrow = btn.querySelector('.arrow'); btn.insertBefore(tags, arrow || null);
    tags.addEventListener('click', e => {
      const t = e.target.closest('.gf-tag'); if (!t) return;
      e.stopPropagation(); e.preventDefault();
      if (t.classList.contains('more')) { btn.click(); return; }
      const it = items(dd)[+t.dataset.k]; const cb = it && cbOf(it); if (cb && cb.checked) cb.click();
    });
    list.addEventListener('click', e => {
      const g = e.target.closest('.gd-group'); if (!g) return;
      const grp = items(dd).filter(it => it.dataset.g === g.dataset.g && it.style.display !== 'none');
      const allOn = grp.every(it => cbOf(it) && cbOf(it).checked);
      grp.forEach(it => { const cb = cbOf(it); if (cb && cb.checked === allOn) cb.click(); });
    });
    let raf = 0, busy = false;
    const mo = new MutationObserver(() => {
      if (busy) return; cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => { busy = true; try { regroup(box, list); refresh(box); } finally { setTimeout(() => { busy = false; }, 0); } });
    });
    mo.observe(list, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    box.addEventListener('change', () => refresh(box), true);
    regroup(box, list); refresh(box);
  }
  function scan() { document.querySelectorAll('.grade-filter-box').forEach(b => { try { build(b); } catch (e) { console.warn('[multi-select]', e); } }); }
  function start() {
    scan(); setInterval(scan, 1500);
    let pend = false;
    new MutationObserver(() => { if (pend) return; pend = true; Promise.resolve().then(() => { pend = false; scan(); }); })
      .observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();

/* =====================================================================
   Matrix: เอาเมาส์วางที่เซล → ไฮไลท์ทั้งแถวและทั้งคอลัมน์ (สีอ่อน) ทุกหน้าที่มีตาราง Matrix
   ===================================================================== */
(function () {
  const SEL = 'table.report-table, table.alert-matrix-new-table, table.yearly-pivot-table, #resBody table, #pivotBody table, #yearlyPivotBody table';
  let lastTable = null;
  function clear() {
    if (!lastTable) return;
    lastTable.querySelectorAll('.hl-line, .hl-cell').forEach(c => c.classList.remove('hl-line', 'hl-cell'));
    lastTable = null;
  }
  document.addEventListener('mouseover', e => {
    const td = e.target.closest && e.target.closest('td');
    const tb = td && td.closest(SEL);
    if (!tb || td.closest('tfoot, tr.total-row, tr.total-row-matrix')) { clear(); return; }
    if (td.classList.contains('hl-cell')) return;
    clear(); lastTable = tb;
    const tr = td.parentElement, ci = td.cellIndex;
    Array.from(tr.cells).forEach(c => c.classList.add('hl-line'));
    Array.from(tb.rows).forEach(r => { const c = r.cells[ci]; if (c && c.tagName === 'TD') c.classList.add('hl-line'); });
    td.classList.add('hl-cell');
  }, true);
  document.addEventListener('mouseleave', clear, true);
  document.addEventListener('mouseout', e => { if (!e.relatedTarget || !(e.relatedTarget.closest && e.relatedTarget.closest(SEL))) clear(); }, true);
})();


/* softLoad(el, placeholderHtml): ถ้ามีผลลัพธ์เดิมอยู่แล้ว → คงไว้จางๆ (ไม่ล้างเป็นหน้าว่าง) แล้วสลับเมื่อผลใหม่มา; ถ้ายังว่างค่อยโชว์ข้อความกำลังโหลด */
window.softLoad = function (el, html) {
  if (!el) return;
  const hasContent = el.children.length > 0 && !el.querySelector('.ld-ph') && !/กำลัง(โหลด|วิเคราะห์)/.test((el.textContent || '').slice(0, 60));
  if (hasContent) {
    if (el.classList.contains('ld-dim')) return;
    el.classList.add('ld-dim');
    const mo = new MutationObserver(() => { el.classList.remove('ld-dim'); mo.disconnect(); clearTimeout(t); });
    mo.observe(el, { childList: true, subtree: el.tagName === 'TABLE' });
    const t = setTimeout(() => { el.classList.remove('ld-dim'); mo.disconnect(); }, 20000);
    return;
  }
  el.innerHTML = html;
};


/* ป้าย "เลือกข้อมูลที่ใช้ในการคำนวณ : ปี … เดือน …" บนแถบฟิลเตอร์ของหน้าระดับ Stock */
(function () {
  const MON = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  function months() {
    try { return (typeof selectedMonths !== 'undefined' && Array.isArray(selectedMonths)) ? selectedMonths.slice().sort() : []; } catch (e) { return []; }
  }
  function textNow() {
    const y = document.getElementById('filterYear');
    const yr = y ? y.value : '';
    const ms = months().map(v => { const m = /^(\d{4})-(\d{2})/.exec(v); return m ? MON[+m[2] - 1] : v; });
    return 'เลือกข้อมูลที่ใช้ในการคำนวณ : ปี ' + (yr || '-') + ' · เดือน ' + (ms.length ? ms.join(', ') : 'ทั้งหมด');
  }
  function tick() {
    const f = document.querySelector('#tab-matrix .filters'); if (!f) return;
    let n = f.querySelector('.calc-note');
    if (!n) { n = document.createElement('div'); n.className = 'calc-note'; f.insertBefore(n, f.firstChild); }
    const t = textNow(); if (n.textContent !== t) n.textContent = t;
  }
  setInterval(tick, 400);
  document.addEventListener('change', () => setTimeout(tick, 50), true);
  document.addEventListener('click', () => setTimeout(tick, 80), true);
})();


/* แบนเนอร์สีฟ้าด้านบน: เลื่อนลง 1 ครั้งตอนอยู่บนสุด → พับเก็บ (ได้พื้นที่ทำงานเพิ่ม)
   เลื่อนขึ้นตอนอยู่บนสุดอีกครั้ง → กลับมา · การเลื่อนส่วนอื่นเหมือนเดิม · เปลี่ยนหน้า → แสดงตามปกติ */
(function () {
  const bn = () => document.querySelector('.page-banner');
  const atTop = () => (window.scrollY || document.documentElement.scrollTop || 0) <= 1;
  const scrollableUp = el => { // มีตัวเลื่อนด้านในที่เลื่อนลงมาแล้วไหม (เช่น ตาราง Matrix)
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (/(auto|scroll)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight && n.scrollTop > 0) return true;
    }
    return false;
  };
  window.addEventListener('wheel', e => {
    const b = bn(); if (!b || e.ctrlKey) return;
    if (e.target.closest && e.target.closest('.modal-bg, .dd-menu, .flatpickr-calendar')) return;
    if (e.deltaY > 0 && atTop() && !b.classList.contains('bn-collapsed')) b.classList.add('bn-collapsed');
    else if (e.deltaY < 0 && atTop() && b.classList.contains('bn-collapsed') && !scrollableUp(e.target)) b.classList.remove('bn-collapsed');
  }, { passive: true });
  const nav = window.onShellNavigate;
  window.onShellNavigate = function (x) { const b = bn(); if (b) b.classList.remove('bn-collapsed'); if (nav) return nav.apply(this, arguments); };
})();
