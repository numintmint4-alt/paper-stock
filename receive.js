// ═══════════════════════════════════════════════════════════════
// STOCK V6 — receive.js (V8 - Tab + Auto-fetch PO)
// ═══════════════════════════════════════════════════════════════

let receiveSelectedGrades = [];
let receiveAllGrades = [];
let receiveCache = [];

// ✅ Tab state (1 = รายการรับเข้า, 2 = ประวัติ PO ที่ถูกลบ)
let receiveActiveTab = 1;

// ✅ Helper: ฟอร์แมตตัวเลข KG → 0,000,000.00
function fmtKg(n) {
  const num = Number(n) || 0;
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

// ✅ Helper: แปลง date → DD/MM/YYYY (พ.ศ.)
function fmtDateThai(d) {
  if (!d) return '-';
  const dObj = new Date(d);
  const dd = String(dObj.getDate()).padStart(2, '0');
  const mm = String(dObj.getMonth() + 1).padStart(2, '0');
  const yyyy = dObj.getFullYear() + 543;
  return `${dd}/${mm}/${yyyy}`;
}

async function initReceiveTab() {
  const dateInput = $('receiveDate');
  if (dateInput && !dateInput.value) dateInput.value = toISODate(new Date());
  await loadReceiveGradeFilter();
  receiveActiveTab = 1;
  renderReceiveTabs();
  await renderReceive();
}

// ✅ สลับ Tab
function switchReceiveTab(tabNum) {
  receiveActiveTab = tabNum;
  renderReceiveTabs();
  if (tabNum === 1) {
    renderReceive();
  } else {
    renderDeletedPOList();
  }
}

// ✅ Render Tab bar
function renderReceiveTabs() {
  const box = $('receiveTabsBox');
  if (!box) return;
  box.innerHTML = `
    <button type="button" class="receive-tab ${receiveActiveTab === 1 ? 'active' : ''}" onclick="switchReceiveTab(1)">
      📥 รายการรับเข้า
    </button>
    <button type="button" class="receive-tab ${receiveActiveTab === 2 ? 'active' : ''}" onclick="switchReceiveTab(2)">
      📜 ประวัติ PO ที่ถูกลบ
    </button>
  `;
}

// ================= GRADE FILTER =================
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

// ================= SUPPLIER SUMMARY =================
function renderSupplierSummary(rows, dateThai) {
  const supplierSummary = {};
  rows.forEach(r => {
    const sup = r.supplier || '(ไม่ระบุ)';
    if (!supplierSummary[sup]) supplierSummary[sup] = { qty: 0, kg: 0 };
    supplierSummary[sup].qty += Number(r.quantity) || 0;
    supplierSummary[sup].kg  += Number(r.kg_total) || 0;
  });

  const supKeys = Object.keys(supplierSummary).sort();
  let html = '<div class="supplier-summary"><h4>📊 สรุป Supplier (วันที่ ' + dateThai + ')</h4>';
  html += '<table><thead><tr><th>Supplier</th><th>จำนวน (ม้วน)</th><th>KG รวม</th></tr></thead><tbody>';
  let totalSupQty = 0, totalSupKg = 0;
  supKeys.forEach(sup => {
    const s = supplierSummary[sup];
    totalSupQty += s.qty; totalSupKg += s.kg;
    html += `<tr><td>${esc(sup)}</td>
      <td style="text-align:right">${s.qty}</td>
      <td style="text-align:right">${fmtKg(s.kg)}</td></tr>`;
  });
  html += `<tr class="total-row"><td>รวม</td>
    <td style="text-align:right">${totalSupQty}</td>
    <td style="text-align:right">${fmtKg(totalSupKg)}</td></tr>`;
  html += '</tbody></table></div>';
  return html;
}

// ================= RENDER RECEIVE =================
async function renderReceive() {
  const receiveDate = $('receiveDate')?.value;
  const supplier = $('receiveSupplier')?.value || '';
  const fsc = $('receiveFsc')?.value || 'all';
  const remark = $('receiveRemark')?.value || '';
  const mode = $('receiveMode')?.value || 'matrix';
  if (!receiveDate) { alert('กรุณาเลือกวันที่รับเข้า'); return; }

  const dateThai = thaiDateFull(receiveDate);

  $('receiveReportTitle').innerHTML = `
    รายการรับม้วนกระดาษเข้าคลัง<br>
    ประจำวันที่ ${dateThai}
  `;
  $('receiveBody').innerHTML = '<p style="text-align:center;color:#94a3b8;padding:20px">กำลังโหลด...</p>';

  try {
    // ✅ Step 1: เช็คว่ามีข้อมูลใน po_receive ของวันนี้ไหม
    const { count: existCount, error: countErr } = await supabase
      .from('po_receive')
      .select('*', { count: 'exact', head: true })
      .eq('po_date', receiveDate);

    if (countErr) throw countErr;

    // ✅ Step 2: ถ้าไม่มี → auto-fetch จาก PO
    if (!existCount || existCount === 0) {
      const fetchResult = await fetchFromPO(receiveDate, { silent: true });
      if (!fetchResult.ok) {
        // ถ้า fetch ไม่สำเร็จ หรือไม่มี PO → แสดงข้อความ (ไม่ error)
        if (fetchResult.reason === 'no_po') {
          $('receiveBody').innerHTML = '<p style="text-align:center;color:#94a3b8;padding:30px">ไม่พบ PO ของวันนี้ — ไม่มีข้อมูลให้แสดง</p>';
          return;
        }
        // error อื่น → แสดง error
        throw new Error(fetchResult.error || 'ดึงจาก PO ไม่สำเร็จ');
      }
    }

    // ✅ Step 3: Query ปกติ
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

// ================= FETCH FROM PO =================
async function fetchFromPO(receiveDate, opts = {}) {
  const { silent = false } = opts;

  try {
    // ✅ Step 1: Query PO ที่ ref_receive = วันที่นี้ + status = saved ขึ้นไป
    const { data: pos, error: poErr } = await supabase
      .from('purchase_orders')
      .select('id, po_no, sup_code, ref_receive, status')
      .eq('ref_receive', receiveDate)
      .in('status', ['saved', 'sent']);

    if (poErr) throw poErr;
    if (!pos || !pos.length) {
      return { ok: false, reason: 'no_po' };
    }

    // ✅ Step 2: ลบ po_receive ของวันนั้นทั้งหมด (replace by date)
    const { error: delErr } = await supabase
      .from('po_receive')
      .delete()
      .eq('po_date', receiveDate);

    if (delErr) throw delErr;

    // ✅ Step 3: ดึง items ของทุก PO
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
          size:        it.size,
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

    // ✅ Step 4: Insert ผ่าน RPC เดิม
    const { data: importResult, error: importErr } = await supabase.rpc('import_po_receive', {
      rows: payload,
      p_po_date: receiveDate
    });

    if (importErr) throw importErr;

    if (!silent) {
      showToast(`✅ ดึงจาก PO สำเร็จ — ${importResult?.inserted || payload.length} รายการ`, 'ok', 3000);
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

// ✅ ปุ่ม "รีเฟรชจาก PO" — manual refresh
async function refreshFromPO() {
  const receiveDate = $('receiveDate')?.value;
  if (!receiveDate) { alert('กรุณาเลือกวันที่รับเข้า'); return; }

  const dateThai = thaiDateFull(receiveDate);

  if (!confirm(`⚠️ ดึง PO ของวันที่ ${dateThai} ใหม่?\n\nจะลบข้อมูลรับเข้าของวันนี้ที่มีอยู่ แล้วดึงจาก PO แทน`)) {
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

// ================= ประวัติ PO ที่ถูกลบ =================
async function renderDeletedPOList() {
  const listEl = $('receiveBody');
  if (!listEl) return;
  listEl.innerHTML = '<p style="text-align:center;color:#94a3b8;padding:20px">กำลังโหลด...</p>';

  $('receiveReportTitle').innerHTML = `📜 ประวัติ PO ที่ถูกลบ`;

  try {
    const { data, error } = await supabase
      .from('purchase_orders')
      .select('id, po_no, po_date, ref_receive, sup_code, total_items, total_kg, status, deleted_at, deleted_by, delete_note')
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false });

    if (error) throw error;

    if (!data || !data.length) {
      listEl.innerHTML = '<p style="text-align:center;color:#94a3b8;padding:30px">ไม่มีประวัติ PO ที่ถูกลบ 🎉</p>';
      return;
    }

    let html = '<div class="data-scroll"><table class="data-table"><thead><tr>';
    html += '<th>PO No.</th><th>วันที่ออก</th><th>วันที่รับ</th><th>Sup.</th><th>จำนวน</th><th>KG รวม</th><th>วันที่ลบ</th><th>หมายเหตุ</th><th></th>';
    html += '</tr></thead><tbody>';

    data.forEach(po => {
      html += `<tr>
        <td><b>${esc(po.po_no)}</b></td>
        <td>${fmtDateThai(po.po_date)}</td>
        <td>${fmtDateThai(po.ref_receive)}</td>
        <td>${esc(po.sup_code)}</td>
        <td style="text-align:right">${po.total_items || 0}</td>
        <td style="text-align:right">${fmtKg(po.total_kg)}</td>
        <td>${po.deleted_at ? new Date(po.deleted_at).toLocaleString('th-TH') : '-'}</td>
        <td>${esc(po.delete_note) || '-'}</td>
        <td>
          <button onclick="openDeletedPODetail('${po.id}')">📄 ดูรายละเอียด</button>
        </td>
      </tr>`;
    });

    html += '</tbody></table></div>';
    html += `<div class="report-foot" style="margin-top:8px">
      แสดง ${data.length} รายการ · คลิก "ดูรายละเอียด" เพื่อดูข้อมูลทั้งหมด
    </div>`;

    listEl.innerHTML = html;
  } catch (e) {
    console.error('renderDeletedPOList:', e);
    listEl.innerHTML = `<div class="msg err">โหลดไม่สำเร็จ: ${esc(e.message)}</div>`;
  }
}

// ✅ เปิด Modal ประวัติ PO
async function openDeletedPODetail(poId) {
  $('receiveDetailTitle').textContent = '📄 รายละเอียด PO ที่ถูกลบ';
  openModal('modalReceiveDetail');
  $('receiveDetailBody').innerHTML = '<p style="text-align:center;color:#94a3b8;padding:20px">กำลังโหลด...</p>';

  try {
    const { data, error } = await supabase.rpc('get_purchase_order_detail', { p_po_id: poId });
    if (error) throw error;

    const header = data.header || {};
    const items = data.items || [];
    const logs = data.logs || [];

    $('receiveDetailTitle').innerHTML = `📄 ${esc(header.po_no)} · ${esc(header.sup_code)} <span style="color:#dc2626;font-weight:400;font-size:14px">(ถูกลบ)</span>`;

    // ✅ Header
    let html = `<div class="msg err" style="margin-bottom:14px">
      <b>⚠️ PO นี้ถูกลบแล้ว</b><br>
      <b>PO No.:</b> ${esc(header.po_no)}<br>
      <b>วันที่ออก:</b> ${fmtDateThai(header.po_date)} · 
      <b>วันที่รับ:</b> ${fmtDateThai(header.ref_receive)}<br>
      <b>Sup.:</b> ${esc(header.sup_code)} · 
      <b>รวม:</b> ${header.total_items || 0} รายการ · ${fmtKg(header.total_kg)} kg<br>
      <b>ลบเมื่อ:</b> ${header.deleted_at ? new Date(header.deleted_at).toLocaleString('th-TH') : '-'}<br>
      <b>หมายเหตุการลบ:</b> ${esc(header.delete_note) || '-'}
    </div>`;

    // ✅ Items
    html += '<h4>📦 รายการ</h4>';
    html += '<div class="data-scroll"><table class="data-table"><thead><tr>';
    html += '<th>#</th><th>PC.</th><th>Gradegram</th><th>Size</th><th>Qty</th><th>KG รวม</th><th>Price</th><th>หมายเหตุ</th>';
    html += '</tr></thead><tbody>';

    items.forEach((it, i) => {
      const isCancelled = it.status === 'cancelled';
      const rowStyle = isCancelled ? 'style="opacity:0.5;text-decoration:line-through"' : '';
      html += `<tr ${rowStyle}>
        <td>${i + 1}</td>
        <td>${esc(it.pc_code) || 'SDPC.01'}</td>
        <td><b>${esc(it.gradegram)}</b></td>
        <td>${it.size}</td>
        <td style="text-align:right">${it.quantity}</td>
        <td style="text-align:right">${fmtKg(it.kg_total)}</td>
        <td style="text-align:right">${Number(it.price || 0).toFixed(2)}</td>
        <td>${esc(it.remark_combined || it.note) || '-'}</td>
      </tr>`;
    });

    html += '</tbody></table></div>';

    // ✅ Logs
    if (logs.length) {
      html += '<h4 style="margin-top:16px">📜 ประวัติการแก้ไข</h4>';
      html += '<div class="data-scroll" style="max-height:300px"><table class="data-table"><thead><tr>';
      html += '<th>วันที่</th><th>การกระทำ</th><th>รายการ</th><th>หมายเหตุ</th>';
      html += '</tr></thead><tbody>';
      logs.forEach(l => {
        html += `<tr>
          <td>${new Date(l.changed_at).toLocaleString('th-TH')}</td>
          <td>${esc(l.action)}</td>
          <td>${esc(l.field_name || '-')}</td>
          <td>${esc(l.note || '-')}</td>
        </tr>`;
      });
      html += '</tbody></table></div>';
    }

    $('receiveDetailBody').innerHTML = html;
  } catch (e) {
    $('receiveDetailBody').innerHTML = `<div class="msg err">${esc(e.message)}</div>`;
  }
}

// ================= MATRIX =================
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
  const colKeys = [...colSet].sort((a,b) => a - b);

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
        html += `<td class="clickable" onclick="openReceiveDetail('${esc(rk)}', ${s}, '${dateThai}')">
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

// ================= LIST =================
function renderReceiveList(rows, dateThai, supHtml = '') {
  let html = '<div class="data-scroll"><table class="data-table"><thead><tr>';
  html += '<th>#</th><th>PO No.</th><th>Supplier</th><th>Gradegrams</th>';
  html += '<th>Size</th><th>Quantity</th><th>ราคา</th>';
  html += '<th>หมายเหตุ</th><th>FSC</th><th>ม้วนลูกค้า</th>';
  html += '</tr></thead><tbody>';

  rows.forEach((r, i) => {
    const fscBadge = r.is_fsc ? '<span class="badge ok">FSC</span>' : '<span class="badge bad">-</span>';
    const custBadge = r.is_customer_roll ? `<span class="badge ok">👤 ${esc(r.remark)||''}</span>` : '-';
    const priceTxt = r.price != null ? Number(r.price).toFixed(2) : '-';
    html += `<tr>
      <td>${i+1}</td>
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

  const totalQty = rows.reduce((s, r) => s + (Number(r.quantity)||0), 0);

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

// ================= RECEIVE DETAIL =================
async function openReceiveDetail(gradegram, size, dateThai) {
  const receiveDate = $('receiveDate')?.value;
  if (!receiveDate) return;

  const { grade } = parseGradegram(gradegram);

  $('receiveDetailTitle').innerHTML = `${esc(gradegram)} · Size ${size} <span style="font-weight:400;color:#64748b;font-size:14px">(วันที่ ${dateThai})</span>`;
  openModal('modalReceiveDetail');
  $('receiveDetailBody').innerHTML = '<p style="text-align:center;color:#94a3b8;padding:20px">กำลังโหลด...</p>';

  try {
    const { data, error } = await supabase.rpc('get_receive_detail', {
      p_po_date: receiveDate,
      p_grade: grade,
      p_size: size
    });
    if (error) throw error;

    const rows = data || [];
    if (!rows.length) {
      $('receiveDetailBody').innerHTML = '<p style="text-align:center;color:#94a3b8;padding:20px">ไม่พบรายละเอียด</p>';
      return;
    }

    const totalQty = rows.reduce((s, r) => s + (Number(r.quantity)||0), 0);
    const totalKg  = rows.reduce((s, r) => s + (Number(r.kg_total)||0), 0);

    let html = `<div class="msg info" style="margin-bottom:10px">
      📦 รวม ${totalQty} ม้วน · ${fmtKg(totalKg)} kg · ${rows.length} รายการ
    </div>`;

    html += '<table><thead><tr>';
    html += '<th>#</th><th>PO No.</th><th>Supplier</th><th>Quantity</th>';
    html += '<th>KG รวม</th><th>ราคา</th><th>หมายเหตุ</th><th>FSC</th>';
    html += '</tr></thead><tbody>';

    rows.forEach((r, i) => {
      const fscBadge = r.is_fsc ? '<span class="badge ok">FSC</span>' : '-';
      const priceTxt = r.price != null ? Number(r.price).toFixed(2) : '-';
      html += `<tr>
        <td>${i+1}</td>
        <td><b>${esc(r.po_no)}</b></td>
        <td>${esc(r.supplier)}</td>
        <td style="text-align:right">${r.quantity}</td>
        <td style="text-align:right">${fmtKg(r.kg_total)}</td>
        <td style="text-align:right">${priceTxt}</td>
        <td>${esc(r.remark) || '-'}</td>
        <td>${fscBadge}</td>
      </tr>`;
    });

    html += '</tbody></table>';
    $('receiveDetailBody').innerHTML = html;
  } catch (err) {
    $('receiveDetailBody').innerHTML = `<div class="msg err">${esc(err.message)}</div>`;
  }
}

// ================= EXPORT RECEIVE TO EXCEL =================
function exportReceive() {
  if (!receiveCache || !receiveCache.length) {
    alert('ไม่มีข้อมูลให้ Export');
    return;
  }
  const receiveDate = $('receiveDate')?.value || '';
  const dateThai = receiveDate ? thaiDateFull(receiveDate) : '';

  // สรุป Supplier
  const supMap = {};
  receiveCache.forEach(r => {
    const sup = r.supplier || '(ไม่ระบุ)';
    if (!supMap[sup]) supMap[sup] = { qty: 0, kg: 0 };
    supMap[sup].qty += Number(r.quantity) || 0;
    supMap[sup].kg  += Number(r.kg_total) || 0;
  });

  const wb = XLSX.utils.book_new();

  // Sheet 1: สรุป Supplier
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

  // Sheet 2: รายการทั้งหมด
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

// ═══════════════════════════════════════════════════════════════
// ⚠️ IMPORT RECEIVE — ถูกลบตาม patch
// (importReceive, openReceiveImportModal)
// ═══════════════════════════════════════════════════════════════
