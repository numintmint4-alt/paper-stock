// ═══════════════════════════════════════════════════════════════
//  STOCK V10.1 — receive.js — V.13.4 (Default Date: วันนี้)
// ═══════════════════════════════════════════════════════════════

let receiveSelectedGrades = [];
let receiveAllGrades = [];
let receiveCache = [];

function fmtKg(n) {
  const num = Number(n) || 0;
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function fmtDateThai(d) {
  if (!d) return '-';
  const dObj = new Date(d);
  const dd = String(dObj.getDate()).padStart(2, '0');
  const mm = String(dObj.getMonth() + 1).padStart(2, '0');
  const yyyy = dObj.getFullYear() + 543;
  return `${dd}/${mm}/${yyyy}`;
}

async function initReceiveTab() {
  const today = getTodayISO();
  
  // 🔽 ตั้งค่าเริ่มต้นเป็น "วันนี้" 🔽
  const dateInput = $('receiveDate');
  if (dateInput) dateInput.value = today;
  
  if (window.flatpickrInstances['receiveDate']) {
    window.flatpickrInstances['receiveDate'].setDate(today, true); 
  }
  
  await loadReceiveGradeFilter();
  
  // 🔽 สั่งโหลดข้อมูลทันที 🔽
  await renderReceive();
}

async function loadReceiveGradeFilter() {
  receiveAllGrades = [...new Set(
    masterCache.map(m => normalizeGrade(m.grade) + m.gram)
  )].sort();
  renderReceiveGradeList();
  updateReceiveGradeLabel();

  const btn = $('receiveGradeFilterBtn');
  const dropdown = $('receiveGradeDropdown');
  const box = $('receiveGradeFilterBox');
  if (!btn || !dropdown || !box) return;

  if (btn.dataset.listenerAttached === '1') return;
  btn.dataset.listenerAttached = '1';

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('hidden');
    btn.classList.toggle('open');
  });
  document.addEventListener('click', (e) => {
    if (!box.contains(e.target)) {
      dropdown.classList.add('hidden');
      btn.classList.remove('open');
    }
  });
}

function renderReceiveGradeList() {
  const list = $('receiveGradeList');
  if (!list) return;
  if (!receiveAllGrades.length) {
    list.innerHTML = '<div style="padding:10px;text-align:center;color:#94a3b8;font-size:13px">ไม่มีข้อมูล</div>';
    return;
  }
  list.innerHTML = receiveAllGrades.map(g => {
    const checked = receiveSelectedGrades.includes(g);
    return `<label class="item ${checked ? 'checked' : ''}" data-grade="${esc(g)}">
      <input type="checkbox" ${checked ? 'checked' : ''}>
      <span>${esc(g)}</span>
    </label>`;
  }).join('');
  list.querySelectorAll('.item').forEach(el => {
    const cb = el.querySelector('input[type="checkbox"]');
    cb.addEventListener('change', () => {
      const grade = el.dataset.grade;
      if (cb.checked) {
        if (!receiveSelectedGrades.includes(grade)) receiveSelectedGrades.push(grade);
      } else {
        receiveSelectedGrades = receiveSelectedGrades.filter(g => g !== grade);
      }
      el.classList.toggle('checked', cb.checked);
      updateReceiveGradeLabel();
    });
  });
}

function updateReceiveGradeLabel() {
  const label = $('receiveGradeFilterLabel');
  if (!label) return;
  if (receiveSelectedGrades.length === 0) {
    label.textContent = 'ทั้งหมด'; label.style.color = '#1e293b';
  } else if (receiveSelectedGrades.length === 1) {
    label.textContent = receiveSelectedGrades[0]; label.style.color = '#1e40af';
  } else {
    label.textContent = `เลือก ${receiveSelectedGrades.length} เกรด`; label.style.color = '#1e40af';
  }
}

function selectAllReceiveGrades() {
  receiveSelectedGrades = [...receiveAllGrades];
  renderReceiveGradeList(); updateReceiveGradeLabel();
}

function clearAllReceiveGrades() {
  receiveSelectedGrades = [];
  renderReceiveGradeList(); updateReceiveGradeLabel();
}

function renderSupplierSummary(rows, dateThai) {
  const supplierSummary = {};
  rows.forEach(r => {
    const sup = r.supplier || '(ไม่ระบุ)';
    if (!supplierSummary[sup]) supplierSummary[sup] = { qty: 0, kg: 0 };
    supplierSummary[sup].qty += Number(r.quantity) || 0;
    supplierSummary[sup].kg  += Number(r.kg_total) || 0;
  });

  const supKeys = Object.keys(supplierSummary).sort();
  let totalSupQty = 0, totalSupKg = 0;
  supKeys.forEach(sup => { totalSupQty += supplierSummary[sup].qty; totalSupKg += supplierSummary[sup].kg; });
  let html = '<div class="supplier-summary ss-new"><h4>📊 สรุป Supplier (วันที่ ' + dateThai + ')</h4>';
  html += '<table class="ss-table"><thead><tr><th>Supplier</th><th class="n">จำนวน (ม้วน)</th><th class="n">KG รวม</th><th class="ss-share">สัดส่วน</th></tr></thead><tbody>';
  supKeys.forEach(sup => {
    const s = supplierSummary[sup];
    const pct = totalSupKg > 0 ? Math.round((s.kg / totalSupKg) * 100) : 0;
    html += `<tr><td><span class="ss-chip">${esc(sup)}</span></td>
      <td class="n">${s.qty}</td>
      <td class="n">${fmtKg(s.kg)}</td>
      <td class="ss-share"><div class="ss-bar-row"><div class="ss-bar"><i style="width:${pct}%"></i></div><b>${pct}%</b></div></td></tr>`;
  });
  html += `<tr class="total-row"><td>รวม</td>
    <td class="n">${totalSupQty}</td>
    <td class="n">${fmtKg(totalSupKg)}</td>
    <td class="ss-share">100%</td></tr>`;
  html += '</tbody></table></div>';
  return html;
}

// V.Receive: ตรวจว่า po_receive ของวันนั้นตรงกับ PO (saved/sent) หรือยัง ถ้าไม่ตรงให้ดึงใหม่
// ใช้ร่วมกับหน้า Purchase Summary, Stock Alert และ Forecast
// หมายเหตุ: เทียบ "เลข PO" — ถ้าแก้ตัวเลขใน PO ที่ Saved ไปแล้ว ให้กด "ดึง PO ใหม่" ในหน้า Purchase Summary
async function ensureReceiveFresh(receiveDate, opts = {}) {
  try {
    const [poRes, recRes] = await Promise.all([
      supabase.from('purchase_orders').select('po_no').eq('ref_receive', receiveDate).in('status', ['saved', 'sent']),
      supabase.from('po_receive').select('po_no').eq('po_date', receiveDate)
    ]);
    if (poRes.error) throw poRes.error;
    if (recRes.error) throw recRes.error;

    const poSet = new Set((poRes.data || []).map(r => r.po_no));
    const recSet = new Set((recRes.data || []).map(r => r.po_no));

    // ไม่มี PO ของวันนั้น: คงพฤติกรรมเดิม (ถ้ามีข้อมูลเก่าอยู่ก็แสดงต่อ)
    if (poSet.size === 0) {
      return recSet.size ? { ok: true, synced: false } : { ok: false, reason: 'no_po' };
    }

    // ผู้ใช้ที่ไม่ใช่แอดมินเขียน po_receive ไม่ได้ (RLS) — ดึงเฉพาะเมื่อยังไม่มีข้อมูลเลย (พฤติกรรมเดิม)
    if (typeof isAdmin === 'function' && !isAdmin() && recSet.size > 0) {
      return { ok: true, synced: false };
    }

    let same = poSet.size === recSet.size;
    if (same) for (const n of poSet) { if (!recSet.has(n)) { same = false; break; } }
    if (same) return { ok: true, synced: false };

    const r = await fetchFromPO(receiveDate, opts);
    // ดึงใหม่ไม่สำเร็จ แต่ยังมีข้อมูลเดิม → แสดงข้อมูลเดิมต่อ แทนการขึ้น error
    if (!r.ok && r.reason !== 'no_po' && recSet.size > 0) {
      console.warn('[ensureReceiveFresh] ดึงใหม่ไม่สำเร็จ ใช้ข้อมูลเดิมแทน:', r.error);
      return { ok: true, synced: false, stale: true };
    }
    return { ...r, synced: !!r.ok };
  } catch (e) {
    console.error('ensureReceiveFresh error:', e);
    return { ok: false, error: e.message };
  }
}

async function renderReceive() {
  const receiveDate = getISODateFromInput('receiveDate');
  const supplier = $('receiveSupplier')?.value || '';
  const fsc = $('receiveFsc')?.value || 'all';
  const remark = $('receiveRemark')?.value || '';
  const mode = $('receiveMode')?.value || 'matrix';

  if (!receiveDate) {
    return;
  }

  const dateThai = thaiDateFull(receiveDate);

  $('receiveReportTitle').innerHTML = `
    สรุปรายการสั่งซื้อม้วนกระดาษ<br>
    ประจำวันที่ ${dateThai}
  `;

  softLoad($('receiveBody'), '<p class="ld-ph" style="text-align:center;color:#94a3b8;padding:20px">กำลังโหลด...</p>');

  try {
    // V.Receive FIX: เทียบรายการ PO กับข้อมูลที่แคชไว้ใน po_receive ถ้าไม่ตรงให้ดึงใหม่
    // (เดิมดึงเฉพาะตอนที่ยังไม่มีข้อมูลเลย PO ที่ Saved ทีหลังจึงไม่เข้า)
    const sync = await ensureReceiveFresh(receiveDate, { silent: true });
    if (!sync.ok) {
      if (sync.reason === 'no_po') {
        $('receiveBody').innerHTML = '<p style="text-align:center;color:#94a3b8;padding:30px">ไม่พบ PO ของวันนี้ — ไม่มีข้อมูลให้แสดง</p>';
        return;
      }
      throw new Error(sync.error || 'ดึงจาก PO ไม่สำเร็จ');
    }

    const normalizedGrades = receiveSelectedGrades.map(g => normalizeGrade(g));

    const { data, error } = await supabase.rpc('get_receive_list', {
      p_date_from: receiveDate,
      p_date_to: receiveDate,
      p_grades: normalizedGrades.length > 0 ? normalizedGrades : null,
      p_suppliers: supplier ? [supplier] : null,
      p_fsc: fsc,
      p_remarks: remark ? [remark] : null
    });
    if (error) throw error;

    const rows = data || [];
    receiveCache = rows;

    if (!rows.length) {
      $('receiveBody').innerHTML = '<p style="text-align:center;color:#94a3b8;padding:30px">ไม่มีข้อมูลในเงื่อนไขที่เลือก</p>';
      return;
    }

    const supHtml = renderSupplierSummary(rows, dateThai);
    if (mode === 'matrix') renderReceiveMatrix(rows, dateThai, supHtml);
    else renderReceiveList(rows, dateThai, supHtml);
  } catch (err) {
    console.error('renderReceive error:', err);
    $('receiveBody').innerHTML = `<div class="msg err">เกิดข้อผิดพลาด: ${esc(err.message)}</div>`;
  }
}

async function fetchFromPO(receiveDate, opts = {}) {
  const { silent = false } = opts;

  try {
    const { data: pos, error: poErr } = await supabase
      .from('purchase_orders')
      .select('id, po_no, sup_code, ref_receive, status')
      .eq('ref_receive', receiveDate)
      .in('status', ['saved', 'sent']);

    if (poErr) throw poErr;

    if (!pos || !pos.length) {
      return { ok: false, reason: 'no_po' };
    }

    const { error: delErr } = await supabase
      .from('po_receive')
      .delete()
      .eq('po_date', receiveDate);

    if (delErr) throw delErr;

    const payload = [];
    for (const po of pos) {
      const { data: detail, error: detailErr } = await supabase.rpc('get_purchase_order_detail', { p_po_id: po.id });
      if (detailErr) throw detailErr;

      const items = (detail.items || []).filter(it => it.status !== 'cancelled');

      items.forEach(it => {
        payload.push({
          po_no:       po.po_no,
          pc_code:     it.pc_code || 'SDPC.01',
          supplier:    po.sup_code,
          grade:       it.gradegram,
          gram:        it.gram || '',
          size:        Number(it.size),
          quantity:    Number(it.quantity) || 0,
          kg_total:    Number(it.kg_total) || 0,
          bu:          Number(it.bu) || 1,
          department:  it.department || '13110',
          price:       it.price != null ? Number(it.price) : null,
          remark:      it.remark_combined || '',
          created_by:  currentUser?.id || null
        });
      });
    }

    if (!payload.length) {
      return { ok: false, reason: 'no_po' };
    }

    const { data: importResult, error: importErr } = await supabase.rpc('import_po_receive', {
      rows: payload,
      p_po_date: receiveDate
    });

    if (importErr) throw importErr;

    if (!silent) {
      showToast(`✅ ดึงข้อมูลจาก PO สำเร็จ — ${importResult?.inserted || payload.length} รายการ`, 'ok', 3000);
    }

    return { ok: true, inserted: importResult?.inserted || payload.length, po_count: pos.length };
  } catch (e) {
    console.error('fetchFromPO error:', e);
    if (!silent) {
      showToast('❌ ดึงจาก PO ไม่สำเร็จ: ' + e.message, 'err', 4000);
    }
    return { ok: false, error: e.message };
  }
}

async function refreshFromPO() {
  const receiveDate = getISODateFromInput('receiveDate');
  if (!receiveDate) { alert('กรุณาเลือกวันที่สั่งซื้อ'); return; }

  const dateThai = thaiDateFull(receiveDate);

  if (!confirm(`⚠️ ดึง PO ของวันที่ ${dateThai} ใหม่?\n\nจะลบข้อมูลของวันนี้ที่มีอยู่ แล้วดึงจาก PO แทน`)) {
    return;
  }

  $('receiveBody').innerHTML = '<p style="text-align:center;color:#94a3b8;padding:20px">กำลังดึงจาก PO...</p>';

  const result = await fetchFromPO(receiveDate);

  if (!result.ok) {
    if (result.reason === 'no_po') {
      $('receiveBody').innerHTML = '<p style="text-align:center;color:#94a3b8;padding:30px">ไม่พบ PO ของวันนี้</p>';
    } else {
      $('receiveBody').innerHTML = `<div class="msg err">ดึงจาก PO ไม่สำเร็จ: ${esc(result.error)}</div>`;
    }
    return;
  }

  await renderReceive();
}

function renderReceiveMatrix(rows, dateThai, supHtml = '') {
  const rowSet = new Map(); const colSet = new Set();
  const cells = {}; const rowTotals = {}; const colTotals = {};
  let grandQty = 0;

  rows.forEach(r => {
    const rk = r.gradegram || r.grade;
    const size = r.size;
    rowSet.set(rk, r.grade);
    colSet.add(size);

    const k = rk + '|' + size;
    if (!cells[k]) cells[k] = { qty: 0 };
    cells[k].qty += Number(r.quantity) || 0;

    if (!rowTotals[rk]) rowTotals[rk] = { qty: 0 };
    rowTotals[rk].qty += Number(r.quantity) || 0;

    if (!colTotals[size]) colTotals[size] = { qty: 0 };
    colTotals[size].qty += Number(r.quantity) || 0;

    grandQty += Number(r.quantity) || 0;
  });

  const rowKeys = [...rowSet.keys()].sort();
  const colKeys = [...colSet].sort((a, b) => a - b);

  let html = '<div class="report-wrap"><table class="report-table"><thead><tr>';
  html += '<th class="grade-col">Gradegrams</th>';
  colKeys.forEach(s => html += `<th>${s}</th>`);
  html += '<th class="total-col">Total</th>';
  html += '</tr></thead><tbody>';

  rowKeys.forEach(rk => {
    html += '<tr>';
    html += `<td class="grade-col">${esc(rk)}</td>`;
    colKeys.forEach(s => {
      const v = cells[rk + '|' + s];
      if (!v || v.qty === 0) {
        html += '<td class="empty">-</td>';
      } else {
                html += `<td class="clickable" 
                     onclick="openReceiveDetail('${esc(rk)}', ${s}, '${dateThai}')"
                     data-tip="Gradegrams ${esc(rk)} · Size ${s}">
          <div class="cell-content">
            <div class="cell-main">${v.qty}</div>
          </div>
        </td>`;
      }
    });
    html += `<td class="total-col">${rowTotals[rk].qty}</td>`;
    html += '</tr>';
  });

  html += '<tr class="total-row"><td class="grade-col">Total</td>';
  colKeys.forEach(s => html += `<td>${colTotals[s].qty}</td>`);
  html += `<td class="total-col">${grandQty}</td>`;
  html += '</tr></tbody></table></div>';

  html += `<div class="report-foot">
    แสดง จำนวน · คลิก Cell เพื่อดู PO · วันที่: ${dateThai} · รวม ${grandQty} ม้วน
  </div>`;
  $('receiveBody').innerHTML = supHtml + html;
}

function renderReceiveList(rows, dateThai, supHtml = '') {
  let html = '<div class="data-scroll"><table class="data-table"><thead><tr>';
  html += '<th>#</th><th>PO No.</th><th>Supplier</th><th>Gradegrams</th>';
  html += '<th>Size</th><th>Quantity</th><th>ราคา</th>';
  html += '<th>หมายเหตุ</th><th>FSC</th><th>ม้วนลูกค้า</th>';
  html += '</tr></thead><tbody>';

  rows.forEach((r, i) => {
    const fscBadge = r.is_fsc ? '<span class="badge ok">FSC</span>' : '<span class="badge bad">-</span>';
    const custBadge = r.is_customer_roll ? `<span class="badge ok">👤 ${esc(r.remark) || ''}</span>` : '-';
    const priceTxt = r.price != null ? Number(r.price).toFixed(2) : '-';
    html += `<tr>
      <td>${i + 1}</td>
      <td><b>${esc(r.po_no)}</b></td>
      <td>${esc(r.supplier)}</td>
      <td>${esc(r.gradegram || r.grade)}</td>
      <td>${r.size}</td>
      <td style="text-align:right">${r.quantity}</td>
      <td style="text-align:right">${priceTxt}</td>
      <td>${esc(r.remark) || '-'}</td>
      <td>${fscBadge}</td>
      <td>${custBadge}</td>
    </tr>`;
  });

  const totalQty = rows.reduce((s, r) => s + (Number(r.quantity) || 0), 0);

  html += `<tr class="total-row" style="background:#cbd5e1;font-weight:700">
    <td colspan="5" style="text-align:right">Total</td>
    <td style="text-align:right">${totalQty}</td>
    <td colspan="4"></td>
  </tr>`;
  html += '</tbody></table></div>';
  html += `<div class="report-foot" style="margin-top:8px">
    แสดง ${rows.length} รายการ · วันที่: ${dateThai} · รวม ${totalQty} ม้วน
  </div>`;
  $('receiveBody').innerHTML = supHtml + html;
}

async function openReceiveDetail(gradegram, size, dateThai) {
  $('receiveDetailTitle').innerHTML = `${esc(gradegram)} · Size ${size} <span style="font-weight:400;opacity:.9;font-size:14px">(รายละเอียดการสั่งซื้อ · วันที่ ${dateThai})</span>`;
  openModal('modalReceiveDetail');
  // ใช้ข้อมูลชุดเดียวกับที่ Matrix แสดงอยู่ (ตรงกับตัวเลขในเซลเสมอ)
  const rows = (receiveCache || []).filter(r => (r.gradegram || r.grade) === gradegram && String(r.size) === String(size));
  if (!rows.length) {
    $('receiveDetailBody').innerHTML = '<p style="text-align:center;color:#94a3b8;padding:20px">ไม่พบรายละเอียด</p>';
    return;
  }
  const totalQty = rows.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
  const totalKg  = rows.reduce((s, r) => s + (Number(r.kg_total) || 0), 0);
  const sups = new Set(rows.map(r => r.supplier || '-'));
  const pos = new Set(rows.map(r => r.po_no));
  let html = `<div class="pop-chips"><span class="pc">${pos.size} PO</span><span class="pc pc-f">รวม ${totalQty} ม้วน</span><span class="pc">${sups.size} Supplier</span>${totalKg ? `<span class="pc pc-k">${fmtKg(totalKg)} kg</span>` : ''}</div>`;
  html += '<div class="pop-scroll"><table class="data-table pop-table"><thead><tr><th style="width:44px">#</th><th>PO No.</th><th>Supplier</th><th style="text-align:center">จำนวนม้วน</th><th>ประเภทม้วน</th><th>FSC</th><th>ราคา</th><th>หมายเหตุ / คุณภาพ</th></tr></thead><tbody>';
  rows.forEach((r, i) => {
    const cust = r.is_customer_roll ? `<span class="st st-f">ม้วนลูกค้า</span>` : `<span class="st st-w">ทั่วไป</span>`;
    const fsc = r.is_fsc ? '<span class="st st-s">FSC</span>' : '-';
    html += `<tr><td>${i + 1}</td><td><b>${esc(r.po_no)}</b></td><td>${esc(r.supplier) || '-'}</td>
      <td style="text-align:center"><b>${r.quantity}</b></td><td>${cust}</td><td>${fsc}</td>
      <td>${r.price != null ? Number(r.price).toFixed(2) : '-'}</td><td>${esc(r.remark) || '-'}</td></tr>`;
  });
  html += `<tr class="pop-total"><td colspan="3">รวม</td><td style="text-align:center">${totalQty}</td><td colspan="4"></td></tr></tbody></table></div>`;
  $('receiveDetailBody').innerHTML = html;
}

function exportReceive() {
  if (!receiveCache || !receiveCache.length) {
    alert('ไม่มีข้อมูลให้ Export');
    return;
  }
  const receiveDate = getISODateFromInput('receiveDate');

  const supMap = {};
  receiveCache.forEach(r => {
    const sup = r.supplier || '(ไม่ระบุ)';
    if (!supMap[sup]) supMap[sup] = { qty: 0, kg: 0 };
    supMap[sup].qty += Number(r.quantity) || 0;
    supMap[sup].kg  += Number(r.kg_total) || 0;
  });

  const wb = XLSX.utils.book_new();

  const supRows = [['Supplier', 'จำนวน (ม้วน)', 'KG รวม']];
  let totalQty = 0, totalKg = 0;
  Object.keys(supMap).sort().forEach(sup => {
    supRows.push([sup, supMap[sup].qty, Number(supMap[sup].kg.toFixed(2))]);
    totalQty += supMap[sup].qty;
    totalKg  += supMap[sup].kg;
  });
  supRows.push(['รวม', totalQty, Number(totalKg.toFixed(2))]);
  const wsSup = XLSX.utils.aoa_to_sheet(supRows);

  const rangeSup = XLSX.utils.decode_range(wsSup['!ref']);
  for (let R = 1; R <= rangeSup.e.r; R++) {
    const cell = wsSup[XLSX.utils.encode_cell({ r: R, c: 2 })];
    if (cell && cell.t === 'n') cell.z = '#,##0.00';
  }
  XLSX.utils.book_append_sheet(wb, wsSup, 'สรุป Supplier');

  const listRows = [[
    '#', 'PO No.', 'Supplier', 'Gradegrams', 'Size',
    'Quantity', 'ราคา', 'หมายเหตุ', 'FSC', 'ม้วนลูกค้า'
  ]];
  receiveCache.forEach((r, i) => {
    listRows.push([
      i + 1,
      r.po_no || '',
      r.supplier || '',
      r.gradegram || r.grade || '',
      r.size || '',
      Number(r.quantity) || 0,
      r.price != null ? Number(r.price) : '',
      r.remark || '',
      r.is_fsc ? 'FSC' : '-',
      r.is_customer_roll ? 'ลูกค้า' : '-'
    ]);
  });
  const wsList = XLSX.utils.aoa_to_sheet(listRows);
  XLSX.utils.book_append_sheet(wb, wsList, 'รายการรับเข้า');

  const fileName = `Receive_${receiveDate || 'export'}.xlsx`;
  XLSX.writeFile(wb, fileName);
}
