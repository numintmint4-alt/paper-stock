// ═══════════════════════════════════════════════════════════════
// STOCK V6 — receive.js
// ═══════════════════════════════════════════════════════════════

let receiveSelectedGrades = [];
let receiveAllGrades = [];
let receiveCache = [];

async function initReceiveTab() {
  const dateInput = $('receiveDate');
  if (dateInput && !dateInput.value) dateInput.value = toISODate(new Date());
  await loadReceiveGradeFilter();
  await renderReceive();
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

// ================= RENDER RECEIVE =================
async function renderReceive() {
  const receiveDate = $('receiveDate')?.value;
  const supplier = $('receiveSupplier')?.value || '';
  const fsc = $('receiveFsc')?.value || 'all';
  const remark = $('receiveRemark')?.value || '';
  const mode = $('receiveMode')?.value || 'matrix';
  if (!receiveDate) { alert('กรุณาเลือกวันที่รับเข้า'); return; }

  const dateThai = thaiDateFull(receiveDate);
  const gradeLabel = receiveSelectedGrades.length > 0
    ? ` · เกรด: ${receiveSelectedGrades.join(', ')}` : '';
  const supLabel = supplier ? ` · Supplier: ${supplier}` : '';
  const fscLabel = fsc === 'all' ? '' : fsc === 'fsc' ? ' · FSC' : ' · Non-FSC';
  const remarkLabel = remark ? ` · ${remark}` : '';

  $('receiveReportTitle').innerHTML = `
    รายการรับม้วนกระดาษเข้าคลัง<br>
    ประจำวันที่ ${dateThai}
    <div class="report-subtitle">(${gradeLabel || 'ทุกเกรด'}${supLabel}${fscLabel}${remarkLabel})</div>
  `;
  $('receiveBody').innerHTML = '<p style="text-align:center;color:#94a3b8;padding:20px">กำลังโหลด...</p>';

  try {
    // ✅ แก้: normalize grade ที่ส่งไป RPC
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

    if (mode === 'matrix') renderReceiveMatrix(rows, dateThai);
    else renderReceiveList(rows, dateThai);
  } catch (err) {
    console.error('renderReceive error:', err);
    $('receiveBody').innerHTML = `<div class="msg err">เกิดข้อผิดพลาด: ${esc(err.message)}</div>`;
  }
}

function renderReceiveMatrix(rows, dateThai) {
  const rowSet = new Map(); const colSet = new Set();
  const cells = {}; const rowTotals = {}; const colTotals = {};
  let grandQty = 0, grandKg = 0;

  rows.forEach(r => {
    const rk = r.gradegram || r.grade;
    const size = r.size;
    rowSet.set(rk, r.grade);
    colSet.add(size);

    const k = rk + '|' + size;
    if (!cells[k]) cells[k] = { qty: 0, kg: 0 };
    cells[k].qty += Number(r.quantity) || 0;
    cells[k].kg  += Number(r.kg_total) || 0;

    if (!rowTotals[rk]) rowTotals[rk] = { qty: 0, kg: 0 };
    rowTotals[rk].qty += Number(r.quantity) || 0;
    rowTotals[rk].kg  += Number(r.kg_total) || 0;

    if (!colTotals[size]) colTotals[size] = { qty: 0, kg: 0 };
    colTotals[size].qty += Number(r.quantity) || 0;
    colTotals[size].kg  += Number(r.kg_total) || 0;

    grandQty += Number(r.quantity) || 0;
    grandKg  += Number(r.kg_total) || 0;
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
            <div class="cell-sub">${v.kg.toFixed(0)} kg</div>
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
    แสดง จำนวน (KG) · คลิก Cell เพื่อดู PO · วันที่: ${dateThai} · รวม ${grandQty} ม้วน · ${grandKg.toFixed(0)} kg
  </div>`;
  $('receiveBody').innerHTML = html;
}

function renderReceiveList(rows, dateThai) {
  let html = '<div class="data-scroll"><table class="data-table"><thead><tr>';
  html += '<th>#</th><th>PO No.</th><th>Supplier</th><th>Gradegrams</th>';
  html += '<th>Size</th><th>Quantity</th><th>KG รวม</th><th>ราคา</th>';
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
      <td style="text-align:right">${Number(r.kg_total).toFixed(0)}</td>
      <td style="text-align:right">${priceTxt}</td>
      <td>${esc(r.remark) || '-'}</td>
      <td>${fscBadge}</td>
      <td>${custBadge}</td>
    </tr>`;
  });

  const totalQty = rows.reduce((s, r) => s + (Number(r.quantity)||0), 0);
  const totalKg  = rows.reduce((s, r) => s + (Number(r.kg_total)||0), 0);

  html += `<tr class="total-row" style="background:#cbd5e1;font-weight:700">
    <td colspan="5" style="text-align:right">Total</td>
    <td style="text-align:right">${totalQty}</td>
    <td style="text-align:right">${totalKg.toFixed(0)}</td>
    <td colspan="4"></td>
  </tr>`;
  html += '</tbody></table></div>';
  html += `<div style="margin-top:8px;font-size:13px;color:#64748b">
    แสดง ${rows.length} รายการ · วันที่: ${dateThai} · รวม ${totalQty} ม้วน · ${totalKg.toFixed(0)} kg
  </div>`;
  $('receiveBody').innerHTML = html;
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
      📦 รวม ${totalQty} ม้วน · ${totalKg.toFixed(0)} kg · ${rows.length} รายการ
    </div>`;
