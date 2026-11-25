// ═══════════════════════════════════════════════════════════════
//  forecast-ui.js — ประมาณการสั่งซื้อม้วนกระดาษ  [3/3 หน้าจอ + เหตุการณ์]
//  • แท็บเกรด CA KA KI KK KW FSC  +  แท็บ Rev ซ้อนด้านข้าง (Rev.00, Rev.01, …)
//  • 1 ตาราง = 1 Gradegram (Size ดึงจาก Master paper_specs)
//  • สถานะ: draft (แก้ไขได้) → saved (ล็อก, แก้ต้องใส่รหัสผ่าน) → approved (แนบ PDF แล้ว, ล็อกทั้งหมด)
//  • ไม่เรียก supabase ตรงๆ — ผ่าน FC.api เท่านั้น  ·  ต้องโหลดหลัง forecast-calc.js และ forecast-api.js
// ═══════════════════════════════════════════════════════════════
(function () {
  'use strict';
  const { GROUPS, GROUP_DEFS, groupLabel, DEFAULT_PARAMS, SRC_OF, CALC_ROWS, NEG_MSG, pad2, num, thMonth, nextMonthStr, errText,
          fmtCell, fmtTot, shortTitle, buildTables, getV, fcCalcCell, toast, api } = window.FC;

  const S = {
    month: '', group: 'CA_THIN',
    orders: {}, selId: {}, hasOrders: false,
    W: null, grams: [],
    snaps: null, savedMonths: [],
    customers: [], custLoading: false,
    fp: [], seq: 0, saving: false, bound: false, pwResolve: null
  };

  const $id = id => document.getElementById(id);
  window.FC.state = S;     // ให้ forecast-export.js อ่านใบที่เปิดอยู่
  const { LOADERS, emptySrc } = api;

  // ═════════════ Stock Level Snapshot / เดือนที่บันทึกแล้ว ═════════════
  async function ensureSnaps(force) { if (S.snaps && !force) return; S.snaps = await api.fetchSnaps(); }
  const snapMonths = () => new Set((S.snaps || []).flatMap(s => s.months || []));
  const snapOptions = m => (S.snaps || []).filter(s => (s.months || []).includes(m));
  function defaultSnap(opts) { return opts.find(s => s.mode === 'full') || opts[0] || null; }  // ปกติใช้ม้วนเต็ม
  async function loadSavedMonths(group) { S.savedMonths = await api.fetchSavedMonths(group, S.month); }

  // ═════════════ โหลดแหล่งข้อมูลเข้า W.src ═════════════
  async function loadSource(name) {
    const W = S.W; if (!W) return;
    const box = $id('fcTables'); if (box) box.classList.add('fc-busy');
    try { await LOADERS[name](W); }
    catch (e) { console.error('loadSource', name, e); toast(`โหลดข้อมูล (${name}) ไม่สำเร็จ: ${errText(e)}`, 'err', 6000); }
    finally { if (box) box.classList.remove('fc-busy'); }
  }
  async function loadAllSources(W) {
    await Promise.all(Object.keys(LOADERS).map(async n => {
      try { await LOADERS[n](W); } catch (e) { console.error('loadSource', n, e); toast(`โหลดข้อมูล (${n}) ไม่สำเร็จ: ${errText(e)}`, 'err', 6000); }
    }));
  }

  async function ensureCustomers() {
    if (S.customers.length || S.custLoading) return;
    S.custLoading = true;
    try { S.customers = await api.fetchCustomers(); } catch (e) { console.warn('load customers', e); }
    S.custLoading = false;
    if (S.W && !S.W.locked) renderTables();
  }

  // ═════════════ โหลดเดือน / เอกสาร ═════════════
  const curOrder = () => {
    const arr = S.orders[S.group] || [];
    return arr.find(o => o.id === S.selId[S.group]) || arr[arr.length - 1] || null;
  };

  async function loadMonth(keepId) {
    const box = $id('fcTables');
    if (box) box.innerHTML = '<div class="fc-loading">กำลังโหลด…</div>';
    const seq = ++S.seq;
    let data;
    try { data = await api.fetchOrders(S.month); }
    catch (error) {
      if (seq !== S.seq) return;
      if (box) box.innerHTML = `<div class="msg err">${esc(errText(error))}</div>`;
      return;
    }
    if (seq !== S.seq) return;
    S.orders = {}; GROUPS.forEach(g => { S.orders[g] = []; });
    (data || []).forEach(o => { if (S.orders[o.grade_group]) S.orders[o.grade_group].push(o); });
    S.hasOrders = (data || []).length > 0;
    GROUPS.forEach(g => {
      const arr = S.orders[g];
      if (keepId && arr.some(o => o.id === keepId)) S.selId[g] = keepId;
      else if (!arr.some(o => o.id === S.selId[g])) S.selId[g] = arr.length ? arr[arr.length - 1].id : null;
    });
    paintHeader();
    const o = curOrder();
    if (!o) { S.W = null; renderEmpty(); return; }
    await openOrder(o);
  }

  async function openOrder(o) {
    const seq = ++S.seq;
    const box = $id('fcTables');
    if (box) box.innerHTML = '<div class="fc-loading">กำลังโหลด…</div>';
    const W = { o, locked: o.status !== 'draft', params: Object.assign({}, DEFAULT_PARAMS, o.params || {}),
                remark: o.remark || '', tables: {}, names: [], src: emptySrc() };
    try {
      const d = await api.fetchOrderDetail(o.id);
      buildTables(W, d.tables, d.cells);
      if (!W.locked) {
        await Promise.all([ensureSnaps(), loadSavedMonths(o.grade_group)]);
        await loadAllSources(W);
      }
    } catch (e) {
      console.error(e);
      if (seq === S.seq && box) box.innerHTML = `<div class="msg err">โหลดไม่สำเร็จ: ${esc(errText(e))}</div>`;
      return;
    }
    if (seq !== S.seq) return;
    S.W = W; S.grams = [];
    paintHeader(); renderToolbar(); renderTables(); renderFooter();
    ensureCustomers();
  }

  // ═════════════ ส่วนหัวหน้า (แท็บเกรด / Rev / ปุ่ม) ═════════════
  function paintHeader() {
    const mb = $id('fcMonthBtn'); if (mb) mb.textContent = thMonth(S.month) || '(เลือกเดือน)';
    const cb = $id('fcCreateBtn'); if (cb) { cb.disabled = S.hasOrders; cb.title = S.hasOrders ? 'เดือนนี้จัดทำประมาณการแล้ว' : ''; }
    // แท็บเกรด
    const gt = $id('fcGradeTabs');
    if (gt) gt.innerHTML = GROUP_DEFS.map(d => {
      const g = d.key, arr = S.orders[g] || [], last = arr[arr.length - 1];
      const badge = !last ? '' : (last.status === 'approved' ? ' ✅' : (last.status === 'saved' ? ' 🔒' : ''));
      return `<button type="button" class="sub-tab ${g === 'FSC' ? 'fc-fsc' : ''} ${g === S.group ? 'active' : ''}" title="${esc(d.hint || d.label)}" onclick="fcSelectGroup('${g}')">${esc(d.label)}${badge}</button>`;
    }).join('');
    // แท็บ Rev ซ้อนด้านข้าง
    const rt = $id('fcRevTabs');
    const arr = S.orders[S.group] || [];
    if (rt) {
      if (!arr.length) rt.innerHTML = '';
      else {
        const cur = curOrder(), last = arr[arr.length - 1];
        const canAdd = last.status === 'approved';
        rt.innerHTML = arr.map(o => `<button type="button" class="fc-rev-tab st-${o.status} ${cur && o.id === cur.id ? 'active' : ''}"
            title="${o.status === 'draft' ? 'ร่าง' : (o.status === 'saved' ? 'ล็อกแล้ว (รอแนบเอกสารอนุมัติ)' : 'อนุมัติแล้ว')}"
            onclick="fcSelectRev('${o.id}')">Rev.${pad2(o.rev)}${o.status === 'approved' ? ' ✓' : (o.status === 'saved' ? ' 🔒' : '')}</button>`).join('') +
          `<button type="button" class="fc-rev-tab fc-rev-add" ${canAdd ? '' : 'disabled'}
            title="${canAdd ? 'เพิ่ม Rev ใหม่ (คัดลอกข้อมูลจาก Rev ล่าสุด)' : 'ต้องแนบเอกสารอนุมัติของ Rev ล่าสุดก่อน'}"
            onclick="fcAddRev()">+ Rev.</button>`;
      }
    }
  }

  function renderEmpty() {
    const box = $id('fcTables');
    if (box) box.innerHTML = `<div class="fc-empty">
        <div style="font-size:42px">📝</div>
        <div>ยังไม่ได้จัดทำประมาณการสั่งซื้อ เดือน <b>${esc(thMonth(S.month))}</b></div>
        <div class="fc-empty-sub">กดปุ่ม <b>“จัดทำประมาณการสั่งซื้อ”</b> ด้านบน ระบบจะสร้างตารางเปล่า Rev.00 ให้ทุกกลุ่ม (CA บาง, CA หนา, KA, KI, KK, KW, FSC)</div>
      </div>`;
    ['fcToolbar', 'fcFooter'].forEach(id => { const el = $id(id); if (el) el.innerHTML = ''; });
  }

  function statusChip(o) {
    if (o.status === 'approved') return '<span class="fc-chip ok">✅ อนุมัติแล้ว (แนบเอกสารแล้ว)</span>';
    if (o.status === 'saved') return '<span class="fc-chip lock">🔒 บันทึกและล็อกแล้ว — รอแนบเอกสารอนุมัติ</span>';
    return '<span class="fc-chip draft">✏️ ร่าง — กำลังจัดทำ</span>';
  }

  function gramLabel() {
    const n = S.grams.length;
    return n === 0 ? 'ทั้งหมด' : (n === 1 ? S.grams[0] : `เลือก ${n} แกรม`);
  }
  function renderToolbar() {
    const el = $id('fcToolbar'), W = S.W; if (!el || !W) return;
    const o = W.o;
    const gramItems = W.names.map(n => { const on = S.grams.includes(n);
      return `<label class="item ${on ? 'checked' : ''}"><input type="checkbox" value="${esc(n)}" ${on ? 'checked' : ''} onchange="fcGramChange(this)"><span>${esc(n)}</span></label>`; }).join('');
    let btns = '';
    if (o.status === 'draft') {
      btns = `<button type="button" onclick="fcSave(false)">💾 บันทึกร่าง</button>
              <button type="button" class="primary" onclick="fcSave(true)">🔒 บันทึกและล็อก</button>`;
    } else if (o.status === 'saved') {
      btns = `<button type="button" onclick="fcUnlock()" style="background:#fffbeb;color:#b45309;border-color:#fcd34d">✏️ แก้ไข (ใส่รหัสผ่าน)</button>
              <button type="button" class="primary" onclick="fcAttachPick()">📎 แนบเอกสารอนุมัติ (PDF)</button>`;
    } else {
      btns = `<button type="button" class="primary" onclick="fcViewDoc()">📄 ดูเอกสารอนุมัติ${o.doc_name ? ' (' + esc(o.doc_name) + ')' : ''}</button>`;
    }
    const saved = o.saved_at ? ` · บันทึกเมื่อ ${new Date(o.saved_at).toLocaleString('th-TH')}` : '';
    el.innerHTML = `<div class="fc-tb-left"><b>${esc(groupLabel(S.group))} · Rev.${pad2(o.rev)}</b> ${statusChip(o)}<span class="fc-muted">${saved}</span></div>
      <div class="fc-tb-right">
        <div class="fc-inline">แสดงแกรม
          <div class="grade-filter-box" id="fcGramBox">
            <button type="button" class="grade-filter-btn" onclick="fcGramToggle(event)"><span id="fcGramLabel">${esc(gramLabel())}</span><span class="arrow">▼</span></button>
            <div class="grade-dropdown fc-gram-drop hidden" id="fcGramDrop">
              <div class="grade-actions">
                <button type="button" onclick="fcGramAll()">✓ เลือกทั้งหมด</button>
                <button type="button" onclick="fcGramClear()">✗ ล้างทั้งหมด</button>
              </div>
              <div class="grade-list" id="fcGramList">${gramItems}</div>
            </div>
          </div>
        </div>
        <button type="button" onclick="fcExport()" title="ส่งออกใบนี้เป็นไฟล์ Excel">📤 Export Excel</button>
        ${btns}
      </div>`;
  }

  function renderFooter() {
    const el = $id('fcFooter'), W = S.W; if (!el || !W) return;
    el.innerHTML = `<label class="fc-remark-lbl">📝 หมายเหตุประมาณการ (${esc(groupLabel(S.group))} Rev.${pad2(W.o.rev)})</label>
      <textarea id="fcRemark" rows="2" placeholder="ระบุหมายเหตุ (ถ้ามี) ก่อนกดบันทึกและล็อก" ${W.locked ? 'disabled' : ''}>${esc(W.remark)}</textarea>`;
    $id('fcRemark').addEventListener('input', e => { if (S.W) S.W.remark = e.target.value; });
  }

  // ═════════════ ตาราง ═════════════
  const monthBtn = (p, val, L) =>
    `<button type="button" class="fc-gray fc-pick" data-act="monthpick" data-p="${p}" ${L ? 'disabled' : ''}>${val ? esc(thMonth(val)) : '(เลือกเดือน)'}</button>`;
  const dateIn = (p, val, L) =>
    `<input type="text" class="fc-gray fc-date" data-p="${p}" name="no_autofill_fc_${p}" autocomplete="new-password" value="${esc(val || '')}" placeholder="(เลือกวันที่)" readonly ${L ? 'disabled' : ''}>`;

  function custOptions(tbl, i) {
    const cur = tbl.cfg.customers[i] || '';
    const taken = new Set(tbl.cfg.customers.filter((x, k) => x && k !== i));
    let list = S.customers;
    if (cur && !list.includes(cur)) list = [cur, ...list];
    return '<option value="">(เลือกลูกค้า)</option>' + list.map(c =>
      `<option value="${esc(c)}" ${c === cur ? 'selected' : ''} ${taken.has(c) ? 'disabled' : ''}>${esc(c)}</option>`).join('');
  }

  function tableHTML(W, tbl) {
    const L = W.locked, P = W.params, g = esc(tbl.label), n = tbl.sizes.length, nc = tbl.cfg.customers.length;
    const calc = r => tbl.sizes.map(s => `<td class="fc-c" data-r="${r}" data-s="${s}"></td>`).join('') + `<td class="fc-tot" data-r="${r}" data-t="1"></td>`;
    const full = (r, label, cls) => `<tr class="fc-row ${cls || ''}"><td class="fc-g" colspan="2">${label}</td>${calc(r)}</tr>`;
    const sub = (r, grp, span, subHtml, cls) => `<tr class="fc-row ${cls || ''}">${grp != null ? `<td class="fc-g" rowspan="${span}">${grp}</td>` : ''}<td class="fc-s">${subHtml}</td>${calc(r)}</tr>`;
    const inputs = (act, getv, i) => tbl.sizes.map(s => {
      const v = getv(s);
      return `<td class="fc-in"><input type="number" min="0" step="${act === 'cust' ? 'any' : '1'}" data-act="${act}" data-g="${g}" data-s="${s}"${i != null ? ` data-i="${i}"` : ''} value="${v == null || v === 0 && act !== 'cust' ? '' : v}" ${L ? 'disabled' : ''}></td>`;
    }).join('');
    const fm = esc(thMonth(S.month)), lm = P.levelMonth ? esc(thMonth(P.levelMonth)) : '…', em = P.estMonth ? esc(thMonth(P.estMonth)) : '…';

    let h = `<table class="fc-table" data-g="${g}"><thead>
      <tr><th class="fc-title" colspan="${n + 3}"><span>${g}</span><span class="fc-warnmsg hidden">⚠ ${NEG_MSG}</span></th></tr>
      <tr><th class="fc-g fc-h" colspan="2">Size</th>${tbl.sizes.map(s => `<th>${s}</th>`).join('')}<th class="fc-tot-h">Total</th></tr></thead><tbody>`;

    // 1) การใช้ม้วน (ทั่วไป) ย้อนหลัง 3 เดือน
    ['m1', 'm2', 'm3'].forEach((p, i) => {
      h += sub('u' + (i + 1), i === 0 ? 'การใช้ม้วน (ทั่วไป)<br>ย้อนหลัง 3 เดือน' : null, 3, monthBtn(p, P[p], L));
    });
    // 2) เฉลี่ย
    h += full('avg3', 'การใช้ม้วน (ทั่วไป) เฉลี่ย 3 เดือน', 'fc-calc fc-hl1');
    // 3) กลุ่มลูกค้า Forecast
    for (let i = 0; i < nc; i++) {
      const cur = tbl.cfg.customers[i] || '';
      const sel = L ? `<span class="fc-gray fc-static" title="${esc(cur)}">${esc(cur) || '-'}</span>`
        : `<select class="fc-gray fc-cust" data-act="custname" data-g="${g}" data-i="${i}">${custOptions(tbl, i)}</select>` +
          (i >= 3 ? `<button type="button" class="fc-x" title="ลบแถวนี้" data-act="delcust" data-g="${g}" data-i="${i}">✕</button>` : '');
      const grp = i === 0 ? `จำนวนม้วนกระดาษ - กลุ่มลูกค้า<br>Forecast (Code)${L ? '' : `<br><button type="button" class="fc-mini" data-act="addcust" data-g="${g}">＋ เพิ่มแถว</button>`}` : null;
      h += `<tr class="fc-row">${grp != null ? `<td class="fc-g" rowspan="${nc}">${grp}</td>` : ''}<td class="fc-s">${sel}</td>${inputs('cust', s => tbl.cells[s].cust[i], i)}<td class="fc-tot" data-r="cust${i}" data-t="1"></td></tr>`;
    }
    // 4) ระดับ Stock เดือน (เลือกเดือน + Snapshot)
    let snapSel = '';
    if (L) snapSel = P.levelSnapTitle ? `<span class="fc-snapname" title="${esc(P.levelSnapTitle)}">${esc(shortTitle(P.levelSnapTitle))}${P.levelMode ? ' · ' + (P.levelMode === 'full' ? 'ม้วนเต็ม' : 'ใช้จริง') : ''}</span>` : '';
    else if (P.levelMonth) {
      const opts = snapOptions(P.levelMonth);
      snapSel = `<select class="fc-gray fc-snap" data-act="snap">${opts.length ? opts.map(s => `<option value="${s.id}" ${String(s.id) === String(P.levelSnapId) ? 'selected' : ''}>${esc(shortTitle(s.title))} · ${s.mode === 'full' ? 'ม้วนเต็ม' : 'ใช้จริง'}</option>`).join('') : '<option value="">— ไม่มี Snapshot —</option>'}</select>`;
    }
    h += `<tr class="fc-row"><td class="fc-g">ระดับ Stock เดือน :</td><td class="fc-s">${monthBtn('levelMonth', P.levelMonth, L)}${snapSel ? '<br>' + snapSel : ''}</td>${calc('stock_level')}</tr>`;
    // 5) % ของระดับ Stock
    h += full('level_pct_qty', `<input type="number" class="fc-pct" min="0" max="100" step="1" data-act="pct" data-g="${g}" value="${tbl.cfg.pct}" ${L ? 'disabled' : ''}> % ของระดับ Stock เดือน : ${lm}`);
    // 6) ประมาณการ (ก่อนหัก Stock)
    h += full('est_before', `ประมาณการใช้ม้วนเดือน : <b>${fm}</b> (ก่อนหัก Stock)`, 'fc-calc fc-strong fc-hl2');
    // 7-9) Stock / รับม้วน / ยอดจอง
    h += sub('stock_qty', 'Stock ณ วันที่ :', 1, dateIn('stockDate', P.stockDate, L));
    h += sub('receive_qty', 'รับม้วนกระดาษ ณ วันที่', 1, dateIn('recvDate', P.recvDate, L));
    h += sub('reserve_qty', 'ยอดจองคงเหลือ ณ วันที่ :', 1, dateIn('resvDate', P.resvDate, L));
    // 10) คงเหลือรวมยอดจอง
    h += full('total_avail', 'ม้วนกระดาษคงเหลือรวมยอดจอง', 'fc-calc fc-hl1');
    // 11) ประมาณการใช้ม้วนเดือน (Rev ล่าสุดที่บันทึก)
    h += sub('est_month', 'ประมาณการใช้ม้วนเดือน :', 1, monthBtn('estMonth', P.estMonth, L) + (W.src.estRev != null ? ` <small class="fc-muted">Rev.${pad2(W.src.estRev)}</small>` : ''));
    // 12) / 13)
    h += full('after_deduct', `ม้วนกระดาษคงเหลือ หักประมาณการใช้ม้วนเดือน : ${em} แล้ว`, 'fc-calc');
    h += full('est_after', `ประมาณการใช้ม้วนเดือน : <b>${fm}</b> (หลังหัก Stock)`, 'fc-calc fc-strong fc-hl2');
    // 14) ปรับเพิ่ม/ลด
    h += `<tr class="fc-row fc-adj"><td class="fc-g" rowspan="2">ปรับเพิ่มหรือลดจำนวนตามความเหมาะสม<br>ประเมินจากสถานการณ์ปัจจุบัน</td><td class="fc-s">ปรับเพิ่มจำนวน +</td>${inputs('adjP', s => tbl.cells[s].adjP)}<td class="fc-tot" data-r="adjP" data-t="1"></td></tr>`;
    h += `<tr class="fc-row fc-adj"><td class="fc-s">ปรับลดจำนวน −</td>${inputs('adjM', s => tbl.cells[s].adjM)}<td class="fc-tot" data-r="adjM" data-t="1"></td></tr>`;
    // 15) สรุป
    h += full('order_qty', `สรุปประมาณการสั่งซื้อม้วนเดือน : <b>${fm}</b>`, 'fc-final');
    // 16) หมายเหตุ
    h += `<tr class="fc-row"><td class="fc-g" colspan="2">หมายเหตุ</td>${tbl.sizes.map(s => {
      const nt = tbl.cells[s].note;
      return `<td class="fc-note-td"><button type="button" class="fc-note ${nt ? 'has' : ''}" data-act="note" data-g="${g}" data-s="${s}" title="${esc(nt || (L ? '' : 'คลิกเพื่อใส่หมายเหตุ'))}">${nt ? '!' : (L ? '' : '＋')}</button></td>`;
    }).join('')}<td class="fc-tot"></td></tr>`;
    return h + '</tbody></table>';
  }

  function renderTables() {
    const box = $id('fcTables'), W = S.W; if (!box || !W) return;
    const sxs = {}; box.querySelectorAll('.fc-tbl-wrap').forEach(w => { sxs[w.dataset.gw] = w.scrollLeft; });
    const wy = window.scrollY;
    S.fp.forEach(f => { try { f.destroy(); } catch (e) { /* ignore */ } }); S.fp = [];
    const names = S.grams.length ? W.names.filter(n => S.grams.includes(n)) : W.names;
    if (!names.length) { box.innerHTML = '<div class="fc-empty"><div>ไม่พบ Gradegram ของกลุ่มนี้ใน Master Data</div></div>'; return; }
    box.innerHTML = names.map(n => `<div class="fc-tbl-wrap" data-gw="${esc(n)}">${tableHTML(W, W.tables[n])}</div>`).join('');
    // วันที่ (flatpickr เหมือนหน้าอื่น)
    box.querySelectorAll('input.fc-date:not([disabled])').forEach(el => {
      const p = el.dataset.p;
      S.fp.push(flatpickr(el, { locale: 'th', dateFormat: 'Y-m-d', defaultDate: el.value || null, allowInput: false, disableMobile: true,
        onChange: (d, str) => { if (S.W && str !== (S.W.params[p] || '')) setParam(p, str); } }));
    });
    names.forEach(n => {
      const tbl = W.tables[n], el = box.querySelector(`table[data-g="${CSS.escape(n)}"]`);
      tbl._tds = {};
      el.querySelectorAll('td[data-r]').forEach(td => { tbl._tds[td.dataset.r + '|' + (td.dataset.t ? 't' : td.dataset.s)] = td; });
      tbl._el = el;
      recalcTable(tbl, true);
    });
    box.querySelectorAll('.fc-tbl-wrap').forEach(w => { if (sxs[w.dataset.gw]) w.scrollLeft = sxs[w.dataset.gw]; });
    if (Math.abs(window.scrollY - wy) > 1) window.scrollTo(0, wy);
  }

  function recalcTable(tbl, silent) {
    const W = S.W; if (!W || !tbl._el) return;
    const tot = {}; let neg = 0;
    const put = (r, s, v) => { const td = tbl._tds[r + '|' + s]; if (td) td.textContent = fmtCell(r, v); };
    tbl.sizes.forEach(s => {
      const v = getV(W, tbl, s), c = tbl.cells[s];
      CALC_ROWS.forEach(r => { put(r, s, v[r]); if (v[r] != null) tot[r] = (tot[r] || 0) + v[r]; });
      c.cust.forEach((x, i) => { tot['cust' + i] = (tot['cust' + i] || 0) + num(x); });
      tot.adjP = (tot.adjP || 0) + c.adjP; tot.adjM = (tot.adjM || 0) + c.adjM;
      const bad = v.order_qty != null && v.order_qty < 0;
      if (bad) neg++;
      ['est_after', 'after_deduct', 'est_before'].forEach(r => { const td = tbl._tds[r + '|' + s]; if (td) td.classList.toggle('fc-neg-val', (v[r] || 0) < -1e-9); });
      const td15 = tbl._tds['order_qty|' + s]; if (td15) { td15.classList.toggle('fc-neg', bad); td15.title = bad ? NEG_MSG : ''; }
      const rs = tbl._el.querySelector(`input[data-act="adjM"][data-s="${s}"]`); if (rs) rs.classList.toggle('fc-neg-in', bad);
    });
    Object.keys(tot).forEach(r => { const td = tbl._tds[r + '|t']; if (td) td.textContent = fmtTot(r, tot[r]); });
    const wm = tbl._el.querySelector('.fc-warnmsg'); if (wm) wm.classList.toggle('hidden', neg === 0);
    if (!silent && neg > tbl._neg) toast('⚠️ ' + NEG_MSG, 'warn', 4500);
    tbl._neg = neg;
  }

  // ═════════════ เปลี่ยนค่าในช่องสีเทา ═════════════
  async function setParam(p, v) {
    const W = S.W; if (!W || W.locked) return;
    W.params[p] = v;
    if (p === 'levelMonth') {
      const sn = v ? defaultSnap(snapOptions(v)) : null;
      applySnap(W, sn);
      await loadSource('level');
    } else if (p === 'levelSnapId') {
      applySnap(W, (S.snaps || []).find(s => String(s.id) === String(v)) || null);
      await loadSource('level');
    } else if (SRC_OF[p]) await loadSource(SRC_OF[p]);
    renderTables();
  }
  function applySnap(W, sn) {
    W.params.levelSnapId = sn ? sn.id : null;
    W.params.levelSnapTitle = sn ? sn.title : '';
    W.params.levelMode = sn ? sn.mode : '';
  }

  // ตัวเลือกเดือน+ปี (ปีแสดงเป็น พ.ศ.)
  function closePicker() { const el = $id('fcMp'); if (el) el.remove(); document.removeEventListener('mousedown', onDocDown, true); }
  function onDocDown(e) { const el = $id('fcMp'); if (el && !el.contains(e.target) && !e.target.closest('[data-act="monthpick"],#fcMonthBtn')) closePicker(); }
  function openMonthPicker(anchor, opt) {
    closePicker();
    let year = opt.value ? Number(opt.value.slice(0, 4)) : new Date().getFullYear();
    const box = document.createElement('div'); box.id = 'fcMp'; box.className = 'fc-mp';
    const draw = () => {
      box.innerHTML = `<div class="fc-mp-head"><button type="button" data-y="-1">◀</button><b>${year + 543}</b><button type="button" data-y="1">▶</button></div>
        <div class="fc-mp-grid">${THAI_MONTHS_SHORT.map((nm, i) => {
          const ym = `${year}-${pad2(i + 1)}`, ok = !opt.allowed || opt.allowed.has(ym);
          return `<button type="button" class="${ym === opt.value ? 'sel' : ''}" data-m="${ym}" ${ok ? '' : 'disabled'}>${nm}</button>`;
        }).join('')}</div>
        ${opt.hint ? `<div class="fc-mp-hint">${opt.hint}</div>` : ''}
        ${opt.clearable ? '<div class="fc-mp-foot"><button type="button" data-clear="1">ล้างค่า</button></div>' : ''}`;
    };
    draw();
    box.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b || b.disabled) return;
      if (b.dataset.y) { year += Number(b.dataset.y); draw(); }
      else if (b.dataset.m) { closePicker(); opt.onPick(b.dataset.m); }
      else if (b.dataset.clear) { closePicker(); opt.onPick(''); }
    });
    document.body.appendChild(box);
    const r = anchor.getBoundingClientRect();
    box.style.top = Math.min(window.innerHeight - 290, r.bottom + 4) + 'px';
    box.style.left = Math.max(8, Math.min(window.innerWidth - 250, r.left)) + 'px';
    setTimeout(() => document.addEventListener('mousedown', onDocDown, true), 0);
  }

  // ═════════════ เหตุการณ์ในตาราง ═════════════
  function bindOnce() {
    if (S.bound) return; S.bound = true;
    const box = $id('fcTables');

    box.addEventListener('input', e => {
      const t = e.target, act = t.dataset.act, W = S.W;
      if (!act || !W || W.locked) return;
      const tbl = W.tables[t.dataset.g]; if (!tbl) return;
      if (act === 'cust') {
        const v = t.value === '' ? null : Number(t.value);
        tbl.cells[Number(t.dataset.s)].cust[Number(t.dataset.i)] = (v == null || isNaN(v)) ? null : v;
      } else if (act === 'adjP' || act === 'adjM') {
        const v = Math.max(0, Math.floor(Number(t.value) || 0));
        tbl.cells[Number(t.dataset.s)][act] = v;
      } else if (act === 'pct') {
        tbl.cfg.pct = t.value === '' ? 0 : Math.min(100, Math.max(0, Number(t.value)));
      } else return;
      recalcTable(tbl);
    });

    box.addEventListener('change', e => {
      const t = e.target, act = t.dataset.act, W = S.W;
      if (!act || !W || W.locked) return;
      const tbl = W.tables[t.dataset.g];
      if (act === 'custname') {
        const i = Number(t.dataset.i), v = t.value;
        if (v && tbl.cfg.customers.some((x, k) => k !== i && x === v)) { toast('ลูกค้านี้ถูกเลือกในตารางนี้แล้ว', 'warn'); t.value = tbl.cfg.customers[i] || ''; return; }
        tbl.cfg.customers[i] = v; renderTables();
      } else if (act === 'snap') setParam('levelSnapId', t.value || null);
    });

    box.addEventListener('click', e => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      const act = b.dataset.act, W = S.W; if (!W) return;
      if (act === 'monthpick') {
        if (W.locked) return;
        const p = b.dataset.p;
        const opt = { value: W.params[p], clearable: true, onPick: ym => setParam(p, ym) };
        if (p === 'levelMonth') { opt.allowed = snapMonths(); opt.hint = 'เลือกได้เฉพาะเดือนที่บันทึก Snapshot ไว้ในหน้า Stock Level'; }
        if (p === 'estMonth') { opt.allowed = new Set(S.savedMonths); opt.hint = 'เลือกได้เฉพาะเดือนที่บันทึกประมาณการไว้แล้ว (ไม่ใช่เดือนที่กำลังจัดทำ)'; }
        openMonthPicker(b, opt);
        return;
      }
      if (W.locked && act !== 'note') return;
      const tbl = W.tables[b.dataset.g];
      if (act === 'note') {
        const s = Number(b.dataset.s), c = tbl.cells[s];
        if (W.locked) { if (c.note) alert(`หมายเหตุ ${tbl.label} Size ${s}:\n\n${c.note}`); return; }
        const v = prompt(`หมายเหตุ ${tbl.label} · Size ${s}`, c.note || '');
        if (v === null) return;
        c.note = v.trim(); b.textContent = c.note ? '!' : '＋'; b.classList.toggle('has', !!c.note); b.title = c.note || 'คลิกเพื่อใส่หมายเหตุ';
      } else if (act === 'addcust') {
        tbl.cfg.customers.push('');
        tbl.sizes.forEach(s => tbl.cells[s].cust.push(null));
        renderTables();
      } else if (act === 'delcust') {
        const i = Number(b.dataset.i);
        if (i < 3) return;
        if (tbl.sizes.some(s => num(tbl.cells[s].cust[i])) && !confirm('แถวนี้มีจำนวนม้วนอยู่ ยืนยันลบ?')) return;
        tbl.cfg.customers.splice(i, 1);
        tbl.sizes.forEach(s => tbl.cells[s].cust.splice(i, 1));
        renderTables();
      }
    });

    document.addEventListener('click', e => {
      const d = $id('fcGramDrop'); if (d && !d.classList.contains('hidden') && !e.target.closest('#fcGramBox')) d.classList.add('hidden');
    });
    $id('fcPdfInput').addEventListener('change', fcAttachUpload);
    ['fcPwInput', 'fcPwNote'].forEach(id => $id(id)?.addEventListener('keypress', e => { if (e.key === 'Enter') window.fcPwConfirm(); }));
  }

  // ═════════════ บันทึก / ล็อก / แก้ไข / แนบ / Rev ═════════════
  function anyNegative(W) {
    return W.names.some(n => { const t = W.tables[n]; return t.sizes.some(s => (getV(W, t, s).order_qty || 0) < 0); });
  }
  function buildPayload(W) {
    return W.names.map(n => {
      const t = W.tables[n];
      return { gradegram: n, config: { pct: t.cfg.pct, customers: t.cfg.customers },
        cells: t.sizes.map(s => { const c = t.cells[s], v = getV(W, t, s);
          return Object.assign({ size: s }, v, { cust: c.cust, adj_plus: c.adjP, adj_minus: c.adjM, note: c.note || null }); }) };
    });
  }

  window.fcSave = async function (lock) {
    const W = S.W; if (!W || W.locked || S.saving) return;
    if (anyNegative(W)) { toast('❌ ' + NEG_MSG, 'err', 6000); W.names.forEach(n => recalcTable(W.tables[n], true)); return; }
    if (lock) {
      const P = W.params, miss = [];
      if (!P.m1 && !P.m2 && !P.m3) miss.push('การใช้ม้วนย้อนหลัง');
      if (!P.levelSnapId) miss.push('ระดับ Stock เดือน');
      if (!P.stockDate) miss.push('Stock ณ วันที่');
      if (!P.recvDate) miss.push('รับม้วนกระดาษ ณ วันที่');
      if (!P.resvDate) miss.push('ยอดจองคงเหลือ ณ วันที่');
      let msg = `ยืนยัน "บันทึกและล็อก" ${groupLabel(S.group)} Rev.${pad2(W.o.rev)} เดือน ${thMonth(S.month)} ?\n\nหลังล็อกจะแก้ไขไม่ได้ (ต้องใส่รหัสผ่านก่อน)`;
      if (miss.length) msg = `⚠️ ยังไม่ได้เลือก: ${miss.join(', ')}\n\n` + msg;
      if (!confirm(msg)) return;
    }
    S.saving = true;
    try {
      await api.saveOrder(W.o.id, W.params, W.remark, buildPayload(W), lock);
      toast(lock ? '🔒 บันทึกและล็อกเรียบร้อย — แนบเอกสารอนุมัติ (PDF) เมื่อลงนามครบ' : '💾 บันทึกร่างเรียบร้อย', 'ok', 4000);
      await loadMonth(W.o.id);
    } catch (e) { console.error(e); toast('บันทึกไม่สำเร็จ: ' + errText(e), 'err', 6000); }
    finally { S.saving = false; }
  };

  // ขอรหัสผ่าน (Modal)
  function askPassword(title, message) {
    if (S.pwResolve) { S.pwResolve(null); S.pwResolve = null; }
    $id('fcPwTitle').textContent = title; $id('fcPwMsg').innerHTML = message;
    $id('fcPwInput').value = ''; $id('fcPwNote').value = ''; $id('fcPwErr').innerHTML = '';
    openModal('modalFcPassword');
    setTimeout(() => $id('fcPwInput').focus(), 50);
    return new Promise(res => { S.pwResolve = res; });
  }
  window.fcPwConfirm = function () {
    const pw = $id('fcPwInput').value, note = $id('fcPwNote').value.trim();
    if (!pw) { $id('fcPwErr').innerHTML = '<div class="msg err">กรุณากรอกรหัสผ่าน</div>'; return; }
    if (!note) { $id('fcPwErr').innerHTML = '<div class="msg err">กรุณาระบุหมายเหตุเหตุผลที่แก้ไข</div>'; return; }
    closeModal('modalFcPassword');
    if (S.pwResolve) { S.pwResolve({ password: pw, note }); S.pwResolve = null; }
  };
  window.fcPwCancel = function () {
    closeModal('modalFcPassword');
    if (S.pwResolve) { S.pwResolve(null); S.pwResolve = null; }
  };

  window.fcUnlock = async function () {
    const W = S.W; if (!W || W.o.status !== 'saved') return;
    const r = await askPassword('🔒 ยืนยันรหัสผ่านเพื่อแก้ไข',
      `ปลดล็อก <b>${esc(groupLabel(S.group))} Rev.${pad2(W.o.rev)}</b> เดือน ${esc(thMonth(S.month))}<br>กรอกรหัสผ่านประมาณการสั่งซื้อ และระบุเหตุผลที่แก้ไข`);
    if (!r) return;
    try {
      await api.unlockOrder(W.o.id, r.password, r.note);
      toast('✏️ ปลดล็อกแล้ว แก้ไขได้ — อย่าลืมกดบันทึกและล็อกอีกครั้ง', 'ok', 4000);
      await loadMonth(W.o.id);
    } catch (e) { toast('ปลดล็อกไม่สำเร็จ: ' + errText(e), 'err', 6000); }
  };

  window.fcAttachPick = function () {
    const W = S.W; if (!W || W.o.status !== 'saved') return;
    $id('fcPdfInput').value = ''; $id('fcPdfInput').click();
  };
  async function fcAttachUpload(ev) {
    const f = ev.target.files && ev.target.files[0], W = S.W;
    if (!f || !W || W.o.status !== 'saved') return;
    if (!(f.type === 'application/pdf' || /\.pdf$/i.test(f.name))) { toast('กรุณาเลือกไฟล์ PDF เท่านั้น', 'warn'); return; }
    if (f.size > 15 * 1024 * 1024) { toast('ไฟล์ใหญ่เกิน 15 MB', 'warn'); return; }
    if (!confirm(`แนบเอกสารอนุมัติ "${f.name}" ให้ ${groupLabel(S.group)} Rev.${pad2(W.o.rev)} ?\n\nหลังแนบ จะล็อกทั้งหมด แก้ไขไม่ได้ (ทำได้เฉพาะ + เพิ่ม Rev)`)) return;
    toast('กำลังอัปโหลด PDF…', 'info', 8000);
    try {
      await api.attachDoc(W.o.id, S.month, S.group, W.o.rev, f);
      toast('✅ แนบเอกสารอนุมัติเรียบร้อย — เพิ่ม Rev ได้จากแท็บด้านข้าง', 'ok', 5000);
      await loadMonth(W.o.id);
    } catch (e) { console.error(e); toast('แนบไฟล์ไม่สำเร็จ: ' + errText(e), 'err', 6000); }
  }
  window.fcViewDoc = async function () {
    const W = S.W; if (!W || !W.o.doc_path) return;
    try { window.open(await api.docUrl(W.o.doc_path), '_blank'); }
    catch (error) { toast('เปิดไฟล์ไม่สำเร็จ: ' + error.message, 'err'); }
  };

  window.fcAddRev = async function () {
    const arr = S.orders[S.group] || [], last = arr[arr.length - 1];
    if (!last || last.status !== 'approved') return;
    if (!confirm(`เพิ่ม Rev.${pad2(last.rev + 1)} ของ ${groupLabel(S.group)} เดือน ${thMonth(S.month)} ?\n\nระบบจะคัดลอกข้อมูลจาก Rev.${pad2(last.rev)} มาให้แก้ไขต่อ`)) return;
    try {
      const data = await api.addRev(S.month, S.group);
      toast(`➕ เพิ่ม Rev.${pad2(data.rev)} แล้ว`, 'ok');
      await loadMonth(data.id);
    } catch (e) { toast('เพิ่ม Rev ไม่สำเร็จ: ' + errText(e), 'err', 6000); }
  };

  window.fcCreateOrders = async function () {
    if (!S.month) return toast('กรุณาเลือกเดือนที่จะจัดทำประมาณการ', 'warn');
    if (S.hasOrders) return;
    if (!confirm(`จัดทำประมาณการสั่งซื้อ เดือน ${thMonth(S.month)} ?\n\nระบบจะสร้างตารางเปล่า Rev.00 ให้ทุกกลุ่ม (CA บาง, CA หนา, KA, KI, KK, KW, FSC)`)) return;
    try {
      await api.createOrders(S.month);
      toast('🆕 สร้างตารางประมาณการเรียบร้อย', 'ok');
      await loadMonth();
    } catch (e) { toast('สร้างไม่สำเร็จ: ' + errText(e), 'err', 6000); }
  };

  window.fcPickForecastMonth = function (anchor) {
    openMonthPicker(anchor, { value: S.month, onPick: ym => { if (ym && ym !== S.month) { S.month = ym; S.selId = {}; loadMonth(); } } });
  };
  window.fcSelectGroup = function (g) { S.group = g; S.grams = []; paintHeader(); const o = curOrder(); if (o) openOrder(o); else { S.W = null; renderEmpty(); } };
  window.fcSelectRev = function (id) { S.selId[S.group] = id; const o = curOrder(); paintHeader(); if (o) openOrder(o); };
  // เลือกแกรมที่จะแสดง (ติ๊กได้หลายตัว · ไม่ติ๊กเลย = ทั้งหมด)
  function gramRefresh() {
    const lb = $id('fcGramLabel'); if (lb) lb.textContent = gramLabel();
    document.querySelectorAll('#fcGramList .item').forEach(el => {
      const cb = el.querySelector('input'); cb.checked = S.grams.includes(cb.value); el.classList.toggle('checked', cb.checked);
    });
    renderTables();
  }
  window.fcGramToggle = function (ev) { ev.stopPropagation(); const d = $id('fcGramDrop'); if (d) d.classList.toggle('hidden'); };
  window.fcGramChange = function (cb) {
    const v = cb.value;
    S.grams = cb.checked ? (S.grams.includes(v) ? S.grams : S.grams.concat([v])) : S.grams.filter(x => x !== v);
    gramRefresh();
  };
  window.fcGramAll = function () { S.grams = S.W ? S.W.names.slice() : []; gramRefresh(); };
  window.fcGramClear = function () { S.grams = []; gramRefresh(); };

  // ═════════════ ตั้งค่ารหัสผ่าน (หน้า ตั้งค่า — Admin) ═════════════
  window.initForecastPwSettings = async function () {
    const box = $id('fcPwBody'); if (!box) return;
    box.innerHTML = '<p class="hint">กำลังโหลด…</p>';
    let has;
    try { has = await api.hasPassword(); }
    catch (error) { box.innerHTML = `<div class="msg err">${esc(errText(error))}</div>`; return; }
    box.innerHTML = `<div class="msg ${has ? 'ok' : 'err'}" style="margin-bottom:12px">${has ? '✅ ตั้งรหัสผ่านไว้แล้ว' : '⚠️ ยังไม่ได้ตั้งรหัสผ่าน — จะปลดล็อกแก้ไขประมาณการไม่ได้'}</div>
      <div class="form-grid" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr));max-width:760px">
        ${has ? '<label>รหัสผ่านเดิม <input type="password" id="fcPwOld" autocomplete="new-password"></label>' : ''}
        <label>รหัสผ่านใหม่ (อย่างน้อย 4 ตัว) <input type="password" id="fcPwNew" autocomplete="new-password"></label>
        <label>ยืนยันรหัสผ่านใหม่ <input type="password" id="fcPwNew2" autocomplete="new-password"></label>
      </div>
      <div class="filters" style="margin-top:12px"><button class="primary" onclick="fcSavePassword()">💾 ${has ? 'เปลี่ยน' : 'ตั้ง'}รหัสผ่าน</button></div>
      <div id="fcPwSetMsg"></div>`;
  };
  window.fcSavePassword = async function () {
    const n1 = $id('fcPwNew').value, n2 = $id('fcPwNew2').value, old = $id('fcPwOld')?.value || '';
    const msg = (h, t) => { $id('fcPwSetMsg').innerHTML = `<div class="msg ${t}" style="margin-top:10px">${h}</div>`; };
    if (n1.length < 4) return msg('รหัสผ่านใหม่ต้องมีอย่างน้อย 4 ตัว', 'err');
    if (n1 !== n2) return msg('รหัสผ่านใหม่ไม่ตรงกัน', 'err');
    try { await api.setPassword(old, n1); }
    catch (error) { return msg(esc(errText(error)), 'err'); }
    toast('✅ บันทึกรหัสผ่านเรียบร้อย', 'ok');
    window.initForecastPwSettings();
  };

  // ═════════════ จุดเข้า (เรียกจาก Tab Router ใน app.js) ═════════════
  window.initForecastTab = async function () {
    if (!S.month) S.month = nextMonthStr();
    try { if (!masterCache || !masterCache.length) await loadMaster(); } catch (e) { console.error(e); }
    bindOnce();
    await loadMonth();
  };
})();
