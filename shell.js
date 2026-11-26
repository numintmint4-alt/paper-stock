/* =====================================================================
   shell.js — เมนูซ้าย / ธีมสว่าง-มืด / แบนเนอร์หน้า / เวอร์ชัน
   ไม่แตะตรรกะของแต่ละหน้า (การสลับหน้ายังใช้ตัวจัดการเดิมใน app.js)
   ต้องโหลดก่อน app.js
   ===================================================================== */
(function () {
  const CFG = window.APP_CONFIG;
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };

  // ---------- ไอคอนเส้นสมัยใหม่ (24x24) ----------
  const P = {
    cart:     '<circle cx="9" cy="20" r="1.6"/><circle cx="18" cy="20" r="1.6"/><path d="M2.5 3.5h2.7l2.2 11.2a1.6 1.6 0 0 0 1.6 1.3h8.1a1.6 1.6 0 0 0 1.6-1.2L20.5 8H6.2"/>',
    warehouse:'<path d="M3 9.5 12 4l9 5.5V20H3z"/><path d="M8 20v-6h8v6"/><path d="M8 16.5h8"/>',
    factory:  '<path d="M3 20V9l5 3V9l5 3V6h3l1 14z"/><path d="M3 20h18"/><path d="M8 16h1M12 16h1M16 16h1"/>',
    gear:     '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    levels:   '<rect x="3" y="12" width="4" height="9" rx="1"/><rect x="10" y="7" width="4" height="14" rx="1"/><rect x="17" y="3" width="4" height="18" rx="1"/>',
    clipboard:'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1"/><path d="m8.5 11 1.5 1.5L13 9.5M8.5 17h7"/>',
    bell:     '<path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 21a2 2 0 0 0 4 0"/><path d="M12 8v3.2M12 13.5v.1"/>',
    file:     '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M8.5 13h7M8.5 17h5"/>',
    forecast: '<rect x="3" y="4.5" width="18" height="16" rx="2.5"/><path d="M3 9.5h18M8 3v3M16 3v3"/><path d="m7.5 17 3-3 2 2 4-4.5"/><path d="M14.5 11.5h2.5V14"/>',
    boxes:    '<path d="M3 8 12 3l9 5v8l-9 5-9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
    chart:    '<path d="M3 3v18h18"/><path d="m7 15 4-5 3 3 5-7"/>',
    calcheck: '<rect x="3" y="4.5" width="18" height="16" rx="2.5"/><path d="M3 9.5h18M8 3v3M16 3v3"/><path d="m8.5 15 2.3 2.3 4.7-4.8"/>',
    inbox:    '<path d="M4 13 6.5 5.5A2 2 0 0 1 8.4 4h7.2a2 2 0 0 1 1.9 1.5L20 13"/><path d="M4 13v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5h-5l-1.2 2h-3.6L9 13z"/>',
    database: '<ellipse cx="12" cy="5.5" rx="8" ry="3"/><path d="M4 5.5v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/><path d="M4 11.5v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
    tag:      '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.3"/>',
    users:    '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.7a3.5 3.5 0 0 1 0 6.6M18 14.3a6.5 6.5 0 0 1 3.5 5.7"/>',
    logout:   '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
    sun:      '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon:     '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    menu:     '<path d="M4 6h16M4 12h16M4 18h16"/>',
    panel:    '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M9 4v16"/>',
    chev:     '<path d="m6 9 6 6 6-6"/>'
  };
  const ico = (k, cls) => '<svg class="ico ' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (P[k] || '') + '</svg>';
  window.shellIcon = ico;

  // ---------- โลโก้ (ม้วนกระดาษ) ----------
  const LOGO = '<svg class="logo-svg" viewBox="0 0 48 48" aria-hidden="true"><defs><linearGradient id="lg1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5cc8ff"/><stop offset="1" stop-color="#1d6fff"/></linearGradient></defs><rect x="3" y="3" width="42" height="42" rx="13" fill="url(#lg1)"/><ellipse cx="17" cy="24" rx="7" ry="11" fill="#fff" opacity=".95"/><ellipse cx="17" cy="24" rx="3" ry="5" fill="#2a7bff"/><path d="M17 13h16a4 4 0 0 1 4 4v14a4 4 0 0 1-4 4H17" fill="#fff" opacity=".35"/><path d="M17 13h16M17 35h16" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg>';

  // ---------- ธีม ----------
  function systemDark() { return !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches); }
  function currentTheme() { return document.documentElement.getAttribute('data-theme') || 'light'; }
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    ['themeBtn', 'loginThemeBtn'].forEach(id => {
      const b = document.getElementById(id);
      if (!b) return;
      b.innerHTML = ico(t === 'dark' ? 'sun' : 'moon');
      b.title = t === 'dark' ? 'สลับเป็นโหมดสว่าง' : 'สลับเป็นโหมดมืด';
      b.setAttribute('aria-label', b.title);
    });
  }
  window.toggleTheme = function () {
    const t = currentTheme() === 'dark' ? 'light' : 'dark';
    store.set('theme', t); applyTheme(t);
  };

  // ---------- สร้างเมนู ----------
  function buildSidebar() {
    document.title = CFG.siteName;
    document.querySelectorAll('[data-site-name]').forEach(el => { el.textContent = CFG.siteName; });
    document.querySelectorAll('[data-site-sub]').forEach(el => { el.textContent = CFG.siteSub; });
    document.querySelectorAll('[data-app-version]').forEach(el => { el.textContent = CFG.version; });
    const lg = document.querySelectorAll('[data-logo]'); lg.forEach(el => { el.innerHTML = LOGO; });

    const nav = document.getElementById('sbNav');
    if (!nav) return;
    let html = '';
    CFG.menu.forEach((g, gi) => {
      html += '<div class="sb-group open" data-group="' + g.id + '">' +
        '<button type="button" class="sb-group-head" data-gtoggle="' + g.id + '">' + ico(g.icon, 'gi') +
        '<span class="gt">' + g.title + '</span>' + ico('chev', 'chev') + '</button><div class="sb-items">';
      g.items.forEach(it => {
        html += '<button type="button" class="sb-item' + (it.adminOnly ? ' admin-only' : '') + '" data-tab="' + it.tab + '"' +
          (it.sec ? ' data-sec="' + it.sec + '"' : '') + ' data-group="' + g.id + '" title="' + it.title + '">' +
          ico(it.icon, 'ii') + '<span class="it">' + it.title + '</span></button>';
      });
      html += '</div></div>';
    });
    nav.innerHTML = html;

    nav.querySelectorAll('[data-gtoggle]').forEach(h => {
      h.onclick = () => {
        if (document.body.classList.contains('sb-collapsed')) { document.body.classList.remove('sb-collapsed'); store.set('sbCollapsed', '0'); }
        h.parentElement.classList.toggle('open');
      };
    });
  }

  // ---------- เรียกจาก app.js เมื่อเปลี่ยนหน้า ----------
  window.onShellNavigate = function (btn) {
    document.querySelectorAll('.sb-item').forEach(b => b.classList.toggle('active', b === btn));
    const g = CFG.menu.find(x => x.id === btn.dataset.group);
    const title = btn.querySelector('.it').textContent;
    const t = document.getElementById('bnTitle'); if (t) t.textContent = title;
    const s = document.getElementById('bnGroup'); if (s && g) s.textContent = g.title;
    const bc = document.getElementById('tbCrumb'); if (bc && g) bc.innerHTML = '<span>' + g.title + '</span><i>›</i><b>' + title + '</b>';
    const im = document.getElementById('bnImg'); if (im && g) im.style.backgroundImage = 'url(' + g.img + ')';
    const grp = btn.closest('.sb-group'); if (grp) grp.classList.add('open');
    document.body.classList.remove('sb-open');           // ปิดเมนูบนมือถือ
    const m = document.getElementById('main'); if (m) m.scrollTop = 0;
    window.scrollTo(0, 0);
  };

  // ---------- เริ่มทำงาน ----------
  function init() {
    buildSidebar();
    applyTheme(currentTheme());
    if (store.get('sbCollapsed') === '1') document.body.classList.add('sb-collapsed');

    const tb = document.getElementById('themeBtn'); if (tb) tb.onclick = window.toggleTheme;
    const cb = document.getElementById('sbCollapseBtn');
    if (cb) cb.onclick = () => {
      if (window.innerWidth <= 900) { document.body.classList.toggle('sb-open'); return; }
      const c = document.body.classList.toggle('sb-collapsed'); store.set('sbCollapsed', c ? '1' : '0');
    };
    const ov = document.getElementById('sbOverlay'); if (ov) ov.onclick = () => document.body.classList.remove('sb-open');
    const lo = document.getElementById('logoutIcon'); if (lo) lo.innerHTML = ico('logout');
    const cbi = document.getElementById('sbCollapseIcon'); if (cbi) cbi.innerHTML = ico('menu');
    const lt = document.getElementById('loginThemeBtn'); if (lt) { lt.onclick = window.toggleTheme; }

    const first = document.querySelector('.sb-item[data-tab="matrix"]');
    if (first) window.onShellNavigate(first);
  }
  init();   // โหลดไว้ท้าย <body> จึงเรียกทันที (ต้องสร้างเมนูก่อน app.js)
})();
