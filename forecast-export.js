// ═══════════════════════════════════════════════════════════════
//  forecast-export.js — ประมาณการสั่งซื้อม้วนกระดาษ  [Export Excel]
//  • ส่งออกใบประมาณการที่เปิดอยู่ (กลุ่ม + Rev) เป็น .xlsx หน้าตาเหมือนไฟล์ตัวอย่าง
//    1 ชีต = 1 ใบ · 1 Gradegram = 1 ตาราง (เรียงต่อกันลงมา) · ช่องคำนวณเป็นสูตร Excel จริง
//  • ต้องโหลดหลัง forecast-ui.js  ·  ใช้ ExcelJS (โหลดใน index.html อยู่แล้ว)
// ═══════════════════════════════════════════════════════════════
(function () {
  'use strict';
  const FC = window.FC;
  const { getV, groupLabel, thMonth, pad2, toast } = FC;

  const BLUE = 'FF0070C0', SKY = 'FF71D3FF', GRAY = 'FFF2F2F2';
  const THIN = { style: 'thin', color: { argb: 'FF000000' } };
  const BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN };
  const NUM2 = '0.00', INT0 = '0';
  const val = x => (x == null || x === '' || isNaN(x)) ? null : Number(x);
  const nz = x => { const v = val(x); return (v == null || Math.abs(v) < 1e-9) ? null : v; };
  const mLabel = ym => { if (!ym) return ''; const [y, m] = ym.split('-').map(Number); return `${THAI_MONTHS[m - 1]}/${y + 543}`; };
  const dLabel = d => {
    if (!d) return '(ยังไม่ได้เลือกวันที่)';
    const [y, m, dd] = d.split('-').map(Number);
    return `${dd} ${THAI_MONTHS[m - 1]} ${y + 543}`;
  };

  function colL(n) {            // เลขคอลัมน์ → ตัวอักษร (1 → A)
    let s = '';
    while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
    return s;
  }

  function cellStyle(c, o) {
    o = o || {};
    c.border = BORDER;
    c.alignment = { horizontal: o.h || 'center', vertical: 'middle', wrapText: !!o.wrap };
    if (o.bold || o.color || o.sz) c.font = { name: 'Tahoma', bold: !!o.bold, color: o.color ? { argb: o.color } : undefined, size: o.sz || 11 };
    else c.font = { name: 'Tahoma', size: 11 };
    if (o.fill) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: o.fill } };
    if (o.fmt) c.numFmt = o.fmt;
  }

  // ───────────── วาด 1 ตาราง (1 Gradegram) เริ่มที่แถว r0  → คืนแถวถัดไปที่ว่าง ─────────────
  function drawTable(ws, W, tbl, r0) {
    const P = W.params, sizes = tbl.sizes, n = sizes.length, nc = tbl.cfg.customers.length;
    const c1 = 3, cN = 2 + n, cT = cN + 1;                       // คอลัมน์ข้อมูลตัวแรก / ตัวสุดท้าย / Total
    const vs = sizes.map(s => getV(W, tbl, s));
    const cells = sizes.map(s => tbl.cells[s]);
    const pct = tbl.cfg.pct == null ? 50 : Number(tbl.cfg.pct);

    // แถวต่างๆ (เรียงตามไฟล์ตัวอย่าง)
    let r = r0 + 2;
    const R = {};
    R.title = r0; R.size = r0 + 1;
    R.u1 = r++; R.u2 = r++; R.u3 = r++;
    R.avg = r++;
    R.cust = Array.from({ length: nc }, () => r++);
    R.lvl = r++; R.pct = r++; R.est = r++;
    R.stock = r++; R.recv = r++; R.resv = r++; R.tot = r++;
    R.estm = r++; R.after = r++; R.ea = r++;
    R.adjP = r++; R.adjM = r++; R.order = r++; R.note = r++;
    const first = R.u1, last = R.note;

    // ใส่ค่า/สูตร/สไตล์ ให้ช่อง (r, c)
    const put = (row, c, value, o) => { const cell = ws.getCell(row, c); if (value !== undefined) cell.value = value; cellStyle(cell, o); return cell; };
    const label = (row, text, o) => put(row, 1, text, Object.assign({ h: 'right', wrap: true }, o));

    // ชื่อ Gradegram
    ws.mergeCells(R.title, 1, R.title, cT);
    put(R.title, 1, tbl.label, { fill: BLUE, bold: true, color: 'FFFFFFFF', sz: 13 });
    for (let c = 2; c <= cT; c++) cellStyle(ws.getCell(R.title, c), { fill: BLUE });
    // หัว Size
    ws.mergeCells(R.size, 1, R.size, 2);
    put(R.size, 1, 'Size', { fill: SKY, bold: true }); cellStyle(ws.getCell(R.size, 2), { fill: SKY });
    sizes.forEach((s, i) => put(R.size, c1 + i, s, { fill: SKY, bold: true, sz: 9 }));
    put(R.size, cT, 'Total', { fill: SKY, bold: true });

    const merge2 = (row, text, o) => { ws.mergeCells(row, 1, row, 2); label(row, text, o); cellStyle(ws.getCell(row, 2), Object.assign({ h: 'right' }, o)); };

    // 1) การใช้ม้วนย้อนหลัง 3 เดือน
    ws.mergeCells(R.u1, 1, R.u3, 1); label(R.u1, 'การใช้ม้วน (ทั่วไป)\nย้อนหลัง 3 เดือน');
    [R.u2, R.u3].forEach(rr => cellStyle(ws.getCell(rr, 1)));
    [['u1', 'm1'], ['u2', 'm2'], ['u3', 'm3']].forEach(([k, p]) => {
      put(R[k], 2, P[p] ? mLabel(P[p]) : '(ยังไม่ได้เลือกเดือน)', { h: 'center' });
      sizes.forEach((s, i) => put(R[k], c1 + i, val(vs[i][k]), { fmt: NUM2 }));
    });
    // 2) เฉลี่ย
    merge2(R.avg, 'การใช้ม้วน (ทั่วไป) เฉลี่ย 3 เดือน');
    sizes.forEach((s, i) => { const L = colL(c1 + i);
      put(R.avg, c1 + i, { formula: `IFERROR(SUM(${L}${R.u1}:${L}${R.u3})/COUNT(${L}${R.u1}:${L}${R.u3}),"")`, result: val(vs[i].avg3) ?? 0 }, { fmt: NUM2 }); });
    // 3) ลูกค้า Forecast
    ws.mergeCells(R.cust[0], 1, R.cust[nc - 1], 1); label(R.cust[0], 'จำนวนม้วนกระดาษ - กลุ่มลูกค้า Forecast (Code)');
    R.cust.slice(1).forEach(rr => cellStyle(ws.getCell(rr, 1)));
    R.cust.forEach((rr, k) => {
      put(rr, 2, tbl.cfg.customers[k] || '', { h: 'center' });
      sizes.forEach((s, i) => put(rr, c1 + i, nz(cells[i].cust[k]), { fmt: NUM2 }));
    });
    // 4) ระดับ Stock / 5) % ของระดับ Stock
    const lvlName = P.levelSnapTitle ? shortTitleOf(P.levelSnapTitle) : mLabel(P.levelMonth);
    merge2(R.lvl, `ระดับ Stock เดือน : ${lvlName || '(ยังไม่ได้เลือก)'}`);
    sizes.forEach((s, i) => put(R.lvl, c1 + i, nz(vs[i].stock_level), { fmt: NUM2 }));
    merge2(R.pct, `${pct} % ของระดับ Stock เดือน : ${mLabel(P.levelMonth)}`);
    sizes.forEach((s, i) => { const L = colL(c1 + i);
      put(R.pct, c1 + i, { formula: `+${L}${R.lvl}*${pct}/100`, result: val(vs[i].level_pct_qty) ?? 0 }, { fmt: NUM2 }); });
    // 6) ประมาณการก่อนหัก Stock
    merge2(R.est, `ประมาณการใช้ม้วนเดือน : ${thMonth(window.FC.state.month)} (ก่อนหัก Stock)`, { h: 'center', bold: true });
    sizes.forEach((s, i) => { const L = colL(c1 + i);
      put(R.est, c1 + i, { formula: `SUM(${L}${R.avg},${L}${R.cust[0]}:${L}${R.cust[nc - 1]},${L}${R.pct})`, result: val(vs[i].est_before) ?? 0 }, { fmt: NUM2, bold: true }); });
    // 7–9) Stock / รับ / จอง
    label(R.stock, 'Stock ณ วันที่ :', { h: 'center' }); put(R.stock, 2, dLabel(P.stockDate));
    label(R.recv, 'รับม้วนกระดาษ ณ วันที่ :', { h: 'center' }); put(R.recv, 2, dLabel(P.recvDate));
    label(R.resv, 'ยอดจองคงเหลือ ณ วันที่ :', { h: 'center' }); put(R.resv, 2, dLabel(P.resvDate));
    sizes.forEach((s, i) => {
      put(R.stock, c1 + i, nz(vs[i].stock_qty), { fmt: NUM2 });
      put(R.recv, c1 + i, nz(vs[i].receive_qty), { fmt: NUM2 });
      put(R.resv, c1 + i, nz(vs[i].reserve_qty), { fmt: NUM2 });
    });
    // 10) รวมยอดจอง
    merge2(R.tot, 'ม้วนกระดาษคงเหลือรวมยอดจอง', { h: 'center' });
    sizes.forEach((s, i) => { const L = colL(c1 + i);
      put(R.tot, c1 + i, { formula: `+${L}${R.stock}+${L}${R.resv}+${L}${R.recv}`, result: val(vs[i].total_avail) ?? 0 }, { fmt: NUM2 }); });
    // 11) ประมาณการเดือนอื่น
    const em = P.estMonth ? mLabel(P.estMonth) + (W.src && W.src.estRev != null ? ` (Rev.${pad2(W.src.estRev)})` : '') : '(ยังไม่ได้เลือกเดือน)';
    label(R.estm, 'ประมาณการใช้ม้วนเดือน :', { h: 'center' }); put(R.estm, 2, em);
    sizes.forEach((s, i) => put(R.estm, c1 + i, nz(vs[i].est_month), { fmt: NUM2 }));
    // 12) คงเหลือหักประมาณการ
    merge2(R.after, `ม้วนกระดาษคงเหลือ หักประมาณการใช้ม้วนเดือน : ${P.estMonth ? mLabel(P.estMonth) : '…'} แล้ว`, { h: 'center', wrap: true });
    sizes.forEach((s, i) => { const L = colL(c1 + i);
      put(R.after, c1 + i, { formula: `+${L}${R.tot}-${L}${R.estm}`, result: val(vs[i].after_deduct) ?? 0 }, { fmt: NUM2 }); });
    // 13) ประมาณการหลังหัก Stock
    merge2(R.ea, `ประมาณการใช้ม้วนเดือน : ${thMonth(window.FC.state.month)} (หลังหัก Stock)`, { h: 'center', bold: true });
    sizes.forEach((s, i) => { const L = colL(c1 + i);
      put(R.ea, c1 + i, { formula: `+${L}${R.est}-${L}${R.after}`, result: val(vs[i].est_after) ?? 0 }, { fmt: NUM2, bold: true }); });
    // 14) ปรับเพิ่ม / ลด
    ws.mergeCells(R.adjP, 1, R.adjM, 1); label(R.adjP, 'ปรับเพิ่มหรือลดจำนวนตามความเหมาะสม ประเมินจากสถานะการณ์ ณ ปัจจุบัน', { h: 'center' });
    cellStyle(ws.getCell(R.adjM, 1));
    put(R.adjP, 2, 'ปรับเพิ่มจำนวน +', { h: 'right' }); put(R.adjM, 2, 'ปรับลดจำนวน -', { h: 'right' });
    sizes.forEach((s, i) => { put(R.adjP, c1 + i, nz(cells[i].adjP), { fmt: INT0 }); put(R.adjM, c1 + i, nz(cells[i].adjM), { fmt: INT0 }); });
    // 15) สรุปสั่งซื้อ
    merge2(R.order, `สรุปประมาณการสั่งซื้อม้วนเดือน : ${thMonth(window.FC.state.month)}`, { h: 'center', bold: true, fill: 'FFFFE699' });
    sizes.forEach((s, i) => { const L = colL(c1 + i), q = val(vs[i].order_qty) ?? 0;
      put(R.order, c1 + i, { formula: `IF(${L}${R.ea}<0,0,ROUNDUP(${L}${R.ea},0))+${L}${R.adjP}-${L}${R.adjM}`, result: q },
        { fmt: INT0, bold: true, fill: 'FFFFE699', color: q < 0 ? 'FFFF0000' : undefined }); });
    // 16) หมายเหตุ (ช่องที่มีหมายเหตุ ใส่ ! และแนบข้อความเป็น Note ของเซลล์)
    merge2(R.note, 'หมายเหตุ', { h: 'center' });
    sizes.forEach((s, i) => {
      const nt = cells[i].note, cell = put(R.note, c1 + i, nt ? '!' : null, { bold: !!nt, color: nt ? 'FFFF0000' : undefined });
      if (nt) cell.note = { texts: [{ text: `Size ${s}: ${nt}` }] };
    });

    // คอลัมน์ Total (ผลรวมแนวนอน เหมือนตัวอย่าง)
    for (let row = first; row <= last; row++) {
      const isCust = R.cust.includes(row);
      if (row === R.note) { put(row, cT, null, { fill: SKY }); continue; }
      let sum = 0;
      sizes.forEach((s, i) => {
        const key = ({ [R.u1]: 'u1', [R.u2]: 'u2', [R.u3]: 'u3', [R.avg]: 'avg3', [R.lvl]: 'stock_level', [R.pct]: 'level_pct_qty', [R.est]: 'est_before',
          [R.stock]: 'stock_qty', [R.recv]: 'receive_qty', [R.resv]: 'reserve_qty', [R.tot]: 'total_avail', [R.estm]: 'est_month',
          [R.after]: 'after_deduct', [R.ea]: 'est_after', [R.adjP]: 'adj_plus', [R.adjM]: 'adj_minus', [R.order]: 'order_qty' })[row];
        sum += isCust ? (val(cells[i].cust[R.cust.indexOf(row)]) || 0) : (val(vs[i][key]) || 0);
      });
      put(row, cT, { formula: `SUM(${colL(c1)}${row}:${colL(cN)}${row})`, result: sum }, { fmt: NUM2, fill: SKY });
    }
    return last + 2;
  }

  const shortTitleOf = t => String(t || '').replace(/^ตารางควบคุมระดับ Stock ม้วนกระดาษปกติในการสั่งซื้อ\s*/, '').replace(/^ประจำเดือน\s*/, '') || String(t || '');

  // ───────────── ปุ่ม Export ─────────────
  window.fcExport = async function () {
    const S = FC.state, W = S && S.W;
    if (!W || !W.names.length) { toast('ยังไม่มีตารางให้ Export', 'warn'); return; }
    if (typeof ExcelJS === 'undefined') { toast('ไม่พบไลบรารี ExcelJS', 'err'); return; }
    try {
      const o = W.o, wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet(`${groupLabel(S.group)} Rev${pad2(o.rev)}`.slice(0, 31), {
        views: [{ state: 'frozen', xSplit: 2, ySplit: 0 }],
        pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 } });
      ws.getColumn(1).width = 44; ws.getColumn(2).width = 30;
      const maxSizes = Math.max(...W.names.map(n => W.tables[n].sizes.length));
      for (let c = 3; c <= 3 + maxSizes; c++) ws.getColumn(c).width = 6.5;

      // หัวเรื่อง
      const status = o.status === 'approved' ? 'อนุมัติแล้ว' : (o.status === 'saved' ? 'บันทึกและล็อกแล้ว (รอเอกสารอนุมัติ)' : 'ฉบับร่าง');
      ws.getCell('A1').value = `จัดทำประมาณการสำหรับสั่งซื้อม้วนกระดาษประจำเดือน : ${thMonth(S.month)}   ·   ${groupLabel(S.group)}  Rev.${pad2(o.rev)}   (${status})`;
      ws.getCell('A1').font = { name: 'Tahoma', size: 14, bold: true };
      let r = 2;
      W.names.forEach(n => { r = drawTable(ws, W, W.tables[n], r); });
      if (W.remark) {
        ws.getCell(r, 1).value = 'หมายเหตุประมาณการ :'; ws.getCell(r, 1).font = { name: 'Tahoma', bold: true };
        ws.getCell(r, 2).value = W.remark; ws.getCell(r, 2).font = { name: 'Tahoma' };
      }
      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `ประมาณการสั่งซื้อ_${S.group}_${S.month}_Rev${pad2(o.rev)}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast('📤 Export Excel เรียบร้อย', 'ok');
    } catch (e) { console.error(e); toast('Export ไม่สำเร็จ: ' + (e.message || e), 'err', 6000); }
  };
})();
