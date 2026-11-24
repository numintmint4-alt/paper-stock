// ═══════════════════════════════════════════════════════════════
//  forecast-calc.js — ประมาณการสั่งซื้อม้วนกระดาษ  [1/3 สูตร + ตัวช่วย]
//  • ฟังก์ชันบริสุทธิ์ ไม่แตะ DOM / ฐานข้อมูล (ทดสอบด้วย Node ได้)
//  • สูตรข้อ 2, 5, 6, 10, 12, 13, 15 / คีย์เทียบ Gradegram / รูปแบบตัวเลข / โครงสร้างตาราง
//  • ลำดับโหลดใน index.html:  forecast-calc.js → forecast-api.js → forecast-ui.js
//  • อ่านค่า global เท่านั้น: normalizeGrade, THAI_MONTHS, masterCache (จาก app.js)
// ═══════════════════════════════════════════════════════════════

// คีย์เทียบ Gradegram ระหว่างแหล่งข้อมูล (ใช้ normalizeGrade ก่อนเสมอ แล้วตัด 0 นำหน้าของแกรม)
//   'CA097' / 'CA97' → 'CA97' · 'KAF125' / 'KA125F' → 'KAF125'
function fcKey(v) {
  let s = (typeof normalizeGrade === 'function') ? normalizeGrade(v) : String(v || '');
  s = String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  let m = s.match(/^([A-Z]+?)F(\d+)$/);
  if (m) return m[1] + 'F' + Number(m[2]);
  m = s.match(/^([A-Z]+)(\d+)F$/);
  if (m) return m[1] + 'F' + Number(m[2]);
  m = s.match(/^([A-Z]+)(\d+)$/);
  if (m) return m[1] + Number(m[2]);
  return s;
}

// แถวจากตารางต่างๆ → Gradegram (บางตารางแยก grade / gram)
function fcRowGG(r) {
  let g = String(r.gradegram || r.grade || '');
  if (!/\d/.test(g) && r.gram != null && r.gram !== '') g += r.gram;
  return g;
}

// สูตรคำนวณ 1 ช่อง (Gradegram × Size) — ตามข้อ 2, 5, 6, 10, 12, 13, 15
function fcCalcCell(i) {
  const r6 = x => Math.round(x * 1e6) / 1e6;
  const n = x => (x == null || x === '' || isNaN(x)) ? 0 : Number(x);

  const hasU = i.hasU || [false, false, false];
  const uv = [0, 1, 2].map(k => hasU[k] ? n(i.u && i.u[k]) : null);
  const used = uv.filter(x => x !== null);
  const avg3 = used.length ? used.reduce((a, b) => a + b, 0) / used.length : 0;      // ข้อ 2

  const custTotal = (i.cust || []).reduce((a, b) => a + n(b), 0);                    // ข้อ 3
  const lvl = n(i.lvl);                                                              // ข้อ 4
  const pct = (i.pct == null || isNaN(i.pct)) ? 50 : Number(i.pct);
  const lvlPct = lvl * pct / 100;                                                    // ข้อ 5
  const estBefore = avg3 + custTotal + lvlPct;                                       // ข้อ 6

  const stock = n(i.stock), recv = n(i.recv), resv = n(i.resv);                      // ข้อ 7,8,9
  const totalAvail = stock + recv + resv;                                            // ข้อ 10
  const est = n(i.est);                                                              // ข้อ 11
  const afterDeduct = totalAvail - est;                                              // ข้อ 12
  const estAfter = estBefore - afterDeduct;                                          // ข้อ 13

  const adjP = Math.max(0, Math.floor(n(i.adjP)));                                   // ข้อ 14
  const adjM = Math.max(0, Math.floor(n(i.adjM)));
  const base = estAfter < 0 ? 0 : Math.ceil(r6(estAfter));                           // IF(C22<0,0,ROUNDUP(C22,0))
  const orderQty = base + adjP - adjM;                                               // ข้อ 15

  return {
    u1: uv[0], u2: uv[1], u3: uv[2],
    avg3: r6(avg3), cust_total: r6(custTotal),
    stock_level: lvl, level_pct_qty: r6(lvlPct), est_before: r6(estBefore),
    stock_qty: stock, receive_qty: recv, reserve_qty: resv, total_avail: r6(totalAvail),
    est_month: est, after_deduct: r6(afterDeduct), est_after: r6(estAfter),
    adj_plus: adjP, adj_minus: adjM, order_qty: orderQty
  };
}

// ───────────── ค่าคงที่ / ตัวช่วย / โครงสร้างตาราง (ใส่ใน window.FC) ─────────────
(function () {
  'use strict';

  // ใบประมาณการ 1 ใบ = 1 เดือน + 1 กลุ่มนี้ + 1 Rev   (CA แยกทำ 2 ใบ: แกรมบาง / แกรมหนา)
  const THICK_FROM = 150;                       // แกรม >= 150 = แกรมหนา (CA150-185) · < 150 = แกรมบาง (CA085-125)
  const GROUP_DEFS = [
    { key: 'CA_THIN',  base: 'CA', label: 'CA บาง', hint: 'CA085–125 (แกรมบาง)', thick: false },
    { key: 'CA_THICK', base: 'CA', label: 'CA หนา', hint: 'CA150–185 (แกรมหนา)', thick: true },
    { key: 'KA', base: 'KA', label: 'KA' }, { key: 'KI', base: 'KI', label: 'KI' },
    { key: 'KK', base: 'KK', label: 'KK' }, { key: 'KW', base: 'KW', label: 'KW' },
    { key: 'FSC', base: 'FSC', label: 'FSC' }
  ];
  const GROUPS = GROUP_DEFS.map(d => d.key);
  const groupDef = k => GROUP_DEFS.find(d => d.key === k) || { key: k, base: k, label: k };
  const groupLabel = k => groupDef(k).label;
  const DEFAULT_PARAMS = {
    m1: '', m2: '', m3: '',
    levelMonth: '', levelSnapId: null, levelSnapTitle: '', levelMode: '',
    stockDate: '', recvDate: '', resvDate: '', estMonth: ''
  };
  const SRC_OF = { m1: 'usage', m2: 'usage', m3: 'usage', levelSnapId: 'level',
                   stockDate: 'stock', recvDate: 'recv', resvDate: 'resv', estMonth: 'est' };
  const CALC_ROWS = ['u1', 'u2', 'u3', 'avg3', 'stock_level', 'level_pct_qty', 'est_before',
                     'stock_qty', 'receive_qty', 'reserve_qty', 'total_avail', 'est_month',
                     'after_deduct', 'est_after', 'order_qty'];
  const NEG_MSG = 'จำนวนม้วนกระดาษจากประมาณการไม่เพียงพอต่อการลดจำนวน (ค่าติดลบ) กรุณาแก้ไขก่อนบันทึก';

  const pad2 = n => String(n).padStart(2, '0');
  const num = x => (x == null || x === '' || isNaN(x)) ? 0 : Number(x);

  function thMonth(ym) {
    if (!ym) return '';
    const [y, m] = ym.split('-').map(Number);
    return `${THAI_MONTHS[m - 1]} ${y + 543}`;
  }
  function nextMonthStr() {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + 1);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
  }
  function errText(e) {
    const m = String((e && e.message) || e || '');
    const map = [
      ['ORDER_LOCKED', 'ประมาณการนี้ถูกล็อกแล้ว แก้ไขไม่ได้'],
      ['NEGATIVE_ORDER_QTY', NEG_MSG],
      ['WRONG_PASSWORD', 'รหัสผ่านไม่ถูกต้อง'],
      ['NO_PASSWORD_SET', 'ยังไม่ได้ตั้งรหัสผ่านประมาณการ (ตั้งค่า → รหัสผ่านประมาณการสั่งซื้อ)'],
      ['NOTE_REQUIRED', 'กรุณาระบุหมายเหตุเหตุผลที่แก้ไข'],
      ['ORDER_APPROVED', 'แนบเอกสารอนุมัติแล้ว ไม่สามารถแก้ไขได้ (ให้เพิ่ม Rev แทน)'],
      ['LATEST_REV_NOT_APPROVED', 'ต้องแนบเอกสารอนุมัติของ Rev ล่าสุดก่อนจึงเพิ่ม Rev ได้'],
      ['EXISTS', 'เดือนนี้จัดทำประมาณการไปแล้ว'],
      ['ADMIN_ONLY', 'เฉพาะ Admin เท่านั้น'],
      ['PASSWORD_TOO_SHORT', 'รหัสผ่านต้องยาวอย่างน้อย 4 ตัว'],
      ['ORDER_NOT_SAVED', 'ต้องบันทึกและล็อกก่อนจึงแนบเอกสารได้'],
      ['forecast_', 'ยังไม่ได้รัน SQL (01_forecast_purchase_estimate.sql) ใน Supabase']
    ];
    for (const [k, v] of map) if (m.includes(k)) return v;
    return m;
  }

  // ═════════════ แสดงตัวเลข ═════════════
  const FMT = {
    u1: ['d2', 1], u2: ['d2', 1], u3: ['d2', 1], avg3: ['d2', 1], level_pct_qty: ['d2', 1], est_month: ['d2', 1],
    stock_level: ['auto', 1], stock_qty: ['auto', 1], receive_qty: ['auto', 1], reserve_qty: ['auto', 1], total_avail: ['auto', 1],
    est_before: ['d2', 0], after_deduct: ['d2', 0], est_after: ['d2', 0], order_qty: ['int', 0]
  };
  function fmtCell(r, v) {
    const f = FMT[r] || ['d2', 1];
    if (v == null || isNaN(v)) return '';
    if (f[1] && Math.abs(v) < 1e-9) return '';
    if (f[0] === 'int') return String(Math.round(v));
    if (f[0] === 'auto') return Number.isInteger(v) ? String(v) : v.toFixed(2);
    return Number(v).toFixed(2);
  }
  function fmtTot(r, v) {
    if (r.startsWith('cust') || r === 'adjP' || r === 'adjM') return Math.abs(v) < 1e-9 ? '' : (Number.isInteger(v) ? String(v) : v.toFixed(2));
    return fmtCell(r, v);
  }

  const shortTitle = t => String(t || '').replace(/^ตารางควบคุมระดับ Stock ม้วนกระดาษปกติในการสั่งซื้อ\s*/, '').replace(/^ประจำเดือน\s*/, '') || String(t || '');

  // ═════════════ โครงสร้างตาราง ═════════════
  const inGroup = (label, groupKey) => {
    const d = groupDef(groupKey), u = label.toUpperCase();
    if (d.base === 'FSC') return u.includes('F');
    if (!u.startsWith(d.base) || u.includes('F')) return false;
    if (d.thick === undefined) return true;
    const gram = parseInt(u.replace(/\D/g, ''), 10) || 0;
    return d.thick ? gram >= THICK_FROM : gram < THICK_FROM;
  };
  function masterDefs(group) {
    const by = new Map();
    (masterCache || []).forEach(m => {
      const label = normalizeGrade(m.grade) + m.gram;
      if (!inGroup(label, group)) return;
      if (!by.has(label)) by.set(label, new Set());
      by.get(label).add(Number(m.size));
    });
    return [...by.keys()].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
      .map(label => ({ label, sizes: [...by.get(label)].sort((a, b) => a - b) }));
  }

  function buildTables(W, dbTables, dbCells) {
    const cellsBy = {};
    dbCells.forEach(c => { (cellsBy[c.gradegram] ||= {})[Number(c.size)] = c; });
    const tbBy = {};
    dbTables.forEach(t => { tbBy[t.gradegram] = t; });

    let defs;
    if (W.locked && dbTables.length) {
      defs = dbTables.map(t => ({ label: t.gradegram, sizes: Object.keys(cellsBy[t.gradegram] || {}).map(Number).sort((a, b) => a - b) }))
        .sort((a, b) => a.label.localeCompare(b.label, 'en', { numeric: true }));
    } else defs = masterDefs(W.o.grade_group);

    defs.forEach(d => {
      const t = tbBy[d.label];
      const cfg = Object.assign({ pct: 50, customers: ['', '', ''] }, (t && t.config) || {});
      cfg.customers = Array.isArray(cfg.customers) ? cfg.customers.slice() : [];
      while (cfg.customers.length < 3) cfg.customers.push('');
      const tbl = { label: d.label, key: fcKey(d.label), sizes: d.sizes, cfg, cells: {}, _tds: {}, _neg: 0 };
      d.sizes.forEach(s => {
        const c = (cellsBy[d.label] || {})[s];
        const cust = (c && Array.isArray(c.cust)) ? c.cust.slice() : [];
        while (cust.length < cfg.customers.length) cust.push(null);
        tbl.cells[s] = { cust, adjP: c ? num(c.adj_plus) : 0, adjM: c ? num(c.adj_minus) : 0, note: (c && c.note) || '', stored: c || null };
      });
      W.tables[d.label] = tbl; W.names.push(d.label);
    });
  }

  function storedV(c) {
    const s = c.stored, f = k => (s[k] == null ? null : Number(s[k]));
    return { u1: f('u1'), u2: f('u2'), u3: f('u3'), avg3: f('avg3'), cust_total: f('cust_total'),
      stock_level: f('stock_level'), level_pct_qty: f('level_pct_qty'), est_before: f('est_before'),
      stock_qty: f('stock_qty'), receive_qty: f('receive_qty'), reserve_qty: f('reserve_qty'), total_avail: f('total_avail'),
      est_month: f('est_month'), after_deduct: f('after_deduct'), est_after: f('est_after'),
      adj_plus: num(s.adj_plus), adj_minus: num(s.adj_minus), order_qty: f('order_qty') };
  }
  function getV(W, tbl, s) {
    const c = tbl.cells[s];
    if (W.locked && c.stored) return storedV(c);
    const key = tbl.key + '|' + s, src = W.src;
    return fcCalcCell({
      u: src.usage.map.get(key) || [0, 0, 0], hasU: src.usage.has, cust: c.cust,
      lvl: src.level.get(key), pct: tbl.cfg.pct, stock: src.stock.get(key), recv: src.recv.get(key),
      resv: src.resv.get(key), est: src.est.get(key), adjP: c.adjP, adjM: c.adjM });
  }

  window.FC = Object.assign(window.FC || {}, {
    GROUPS, GROUP_DEFS, groupDef, groupLabel, THICK_FROM, DEFAULT_PARAMS, SRC_OF, CALC_ROWS, NEG_MSG,
    pad2, num, thMonth, nextMonthStr, errText, fmtCell, fmtTot, shortTitle,
    inGroup, masterDefs, buildTables, getV,
    fcKey, fcRowGG, fcCalcCell
  });
})();

if (typeof module !== 'undefined') module.exports = { fcKey, fcRowGG, fcCalcCell };
