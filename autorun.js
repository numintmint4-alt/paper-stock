/* =====================================================================
   autorun.js — วิเคราะห์/ค้นหาอัตโนมัติ
   - เปลี่ยนตัวกรองแล้วโหลดผลให้เองหลังหยุดเลือก ~0.6 วินาที
   - เปิดหน้าแล้ววิเคราะห์ให้เอง (หน้าที่เดิมยังต้องกดปุ่ม)
   - ปุ่มเดิมยังอยู่ เปลี่ยนชื่อเป็น "โหลดใหม่" ไว้กดเองเมื่อต้องการ
   ต้องโหลดหลังสคริปต์ทุกหน้า
   ===================================================================== */
(function () {
  const $q = s => document.querySelector(s);
  const call = n => (typeof window[n] === 'function' ? window[n]() : null);
  const visible = el => !!el && !el.closest('.hidden') && el.offsetParent !== null;

  const PAGES = [
    { id: 'matrix',  root: '#tab-matrix .filters',           fn: 'renderMatrix',      btn: 'button[onclick="renderMatrix()"]',
      guard: () => typeof selectedMonths !== 'undefined' && selectedMonths.length > 0 },
    { id: 'stock',   root: '#tab-stock .filters',            fn: 'renderStockMatrix', btn: 'button[onclick="renderStockMatrix()"]' },
    { id: 'receive', root: '#receiveFilterBox',              fn: 'renderReceive',     btn: 'button[onclick="renderReceive()"]' },
    { id: 'alert',   root: '#tab-alert .filters',            fn: 'renderAlert',       btn: 'button[onclick="renderAlert()"]', label: 'วิเคราะห์ใหม่',
      guard: () => !!($q('#alertStockDate') && $q('#alertStockDate').value && $q('#alertReceiveDate') && $q('#alertReceiveDate').value) },
    { id: 'alertHistory', root: '#alertHistoryCard',         fn: 'loadAlertHistory',  btn: 'button[onclick="loadAlertHistory()"]', label: 'โหลดใหม่' },
    { id: 'pivot',   root: '#pivot-monthly-container',       fn: 'loadUsagePivot',    btn: 'button[onclick="loadUsagePivot()"]' },
    { id: 'pivotY',  root: '#pivot-yearly-container',        fn: 'loadYearlyPivot',   btn: '#btnLoadYearlyPivot' },
    { id: 'res',     root: '#tab-reservations .filters',     fn: 'loadReservations', btn: 'button[onclick="loadReservations()"]' }
  ];

  // ---------- ตัวรัน: ไม่ซ้อนกัน ถ้ามีงานค้างให้รันซ้ำอีกรอบเดียว ----------
  const st = {};
  function run(p) {
    const s = st[p.id] || (st[p.id] = { busy: false, pend: false });
    if (typeof window[p.fn] !== 'function') return;
    const root = $q(p.root);
    if (!visible(root)) return;                       // หน้าไม่ได้เปิดอยู่
    if (p.guard && !p.guard()) return;                // ข้อมูลตัวกรองยังไม่ครบ
    if (s.busy) { s.pend = true; return; }
    s.busy = true; window.__autoRun = (window.__autoRun || 0) + 1;
    Promise.resolve().then(() => window[p.fn]())
      .catch(e => console.warn('[autorun]', p.id, e))
      .finally(() => {
        window.__autoRun = Math.max(0, (window.__autoRun || 1) - 1);
        s.busy = false;
        if (s.pend) { s.pend = false; run(p); }
      });
  }
  const timers = {};
  function schedule(p, ms) { clearTimeout(timers[p.id]); timers[p.id] = setTimeout(() => run(p), ms == null ? 600 : ms); }

  // ข้อความเตือนที่เด้งตอนระบบรันเอง (เช่น ยังไม่ได้เลือกเดือน) ไม่ต้องเด้งรบกวน
  const _alert = window.alert;
  window.alert = function (m) { if (window.__autoRun) { console.warn('[autorun] ซ่อนข้อความ:', m); return; } return _alert.apply(window, arguments); };

  // ---------- ตัวกรองเปลี่ยน → รันเอง ----------
  function pageOf(el) { return PAGES.find(p => { const r = $q(p.root); return r && r.contains(el); }); }
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.closest('.grade-dropdown') && t.closest('.grade-dropdown').querySelector('input[type="text"]') === t) return; // ช่องพิมพ์ค้นในรายการ
    if (t.type === 'file') return;
    const p = pageOf(t); if (p) schedule(p, 650);
  }, true);
  document.addEventListener('click', e => {
    const b = e.target.closest('.grade-actions button, .grade-dropdown .grade-actions *');
    if (b) { const p = pageOf(b); if (p) schedule(p, 700); }
  }, true);

  // ---------- เปิดหน้าแล้ววิเคราะห์เอง ----------
  function wrapInit(name, id, delay) {
    const o = window[name]; if (typeof o !== 'function') return;
    window[name] = async function () {
      const r = await o.apply(this, arguments);
      const p = PAGES.find(x => x.id === id); setTimeout(() => run(p), delay || 150);
      return r;
    };
  }
  wrapInit('initAlertTab', 'alert', 300);
  wrapInit('initUsagePivotTab', 'pivot', 300);

  // ---------- ปุ่มเดิมให้เป็นปุ่ม "โหลดใหม่" ----------
  function relabel() {
    PAGES.forEach(p => {
      const b = $q(p.btn); if (!b || b.dataset.autoLabeled) return;
      b.dataset.autoLabeled = '1';
      b.innerHTML = '🔄 ' + (p.label || 'โหลดใหม่');
      b.title = 'ระบบโหลดให้อัตโนมัติเมื่อเปลี่ยนตัวกรอง — กดปุ่มนี้เมื่ออยากโหลดซ้ำ';
      b.classList.remove('primary');
    });
  }
  // loadUsagePivot เปลี่ยนข้อความปุ่มเองตอนโหลด จึงตั้งใหม่หลังรัน
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', relabel); else relabel();
  window.autorunRelabel = relabel;
})();
