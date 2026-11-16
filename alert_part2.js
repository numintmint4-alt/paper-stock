// ═══════════════════════════════════════════════════════════════
//  ALERT.JS — V.18.0 (Part 2/3)
//  RENDER TABLE + FLAT VIEW + MATRIX VIEW + DRAFT FORM
//  ✅ แก้: saveMatrixOrder (สร้าง log complete)
//  ✅ แก้: removeMatrixOrderRow (ลบ log DRAFT)
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
//  RENDER TABLE
// ═══════════════════════════════════════════════════════════════

function renderAlertTableBody(rows) {
  renderAlertDateTabs();
  const fullCache = window._alertFullCache || [];
  if (fullCache.length > 0) {
    const sizes = [...new Set(fullCache.map(r => Number(r.size)).filter(n => !isNaN(n) && n > 0))].sort((a, b) => a - b);
    if (sizes.length > 0) { alertAllSizes = sizes; renderAlertSizeList(); updateAlertSizeLabel(); }
    const grades = [...new Set(fullCache.map(r => r.gradegram).filter(Boolean))].sort();
    if (grades.length > 0) { alertAllGrades = grades; renderAlertGradeList(); updateAlertGradeLabel(); }
  }

  const container = document.getElementById('alertBody');
  if (!container) return;

  const flatWrap = container.querySelector('.report-wrap.alert-scroll');
  const matrixWrapOld = document.getElementById('alertMatrixWrap');
  if (flatWrap) flatWrap.style.display = 'none';
  if (matrixWrapOld) matrixWrapOld.style.display = 'none';

  if (alertViewMode === 'matrix') {
    if (flatWrap) flatWrap.style.display = 'none';
    renderAlertMatrixView(rows);
  } else {
    if (flatWrap) flatWrap.style.display = '';
    if (matrixWrapOld) matrixWrapOld.style.display = 'none';
    renderAlertFlatView(rows);
  }
}

// ═══════════════════════════════════════════════════════════════
//  FLAT VIEW
// ═══════════════════════════════════════════════════════════════

function renderAlertFlatView(rows) {
  const tbody = document.querySelector('.alert-flat-table tbody');
  if (!tbody) return;

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="16" style="text-align:center;color:#94a3b8;padding:30px">ไม่มีรายการ 🎉</td></tr>';
    return;
  }

  const sorted = [...rows].sort((a, b) => {
    if (a.gradegram !== b.gradegram) return a.gradegram.localeCompare(b.gradegram);
    return a.size - b.size;
  });

  let html = '';
  let grandShortage = 0;

  sorted.forEach(r => {
    const a = Number(r.alert) || 0;
    let rowCls, statusTxt;
    if (a < 0)      { rowCls = 'row-red';    statusTxt = `🔴 ขาด ${Math.ceil(Math.abs(a))}`;  grandShortage += Math.abs(a); }
    else if (a === 0) { rowCls = 'row-yellow'; statusTxt = '🟡 พอดี'; }
    else             { rowCls = 'row-green';  statusTxt = `🟢 เกิน ${Math.floor(a)}`; }

    const items = getAlertItems(r.gradegram, r.size);
    const isFSC = isFSCGrade(r.gradegram);
    const fscBadge = isFSC
      ? '<span class="badge ok" style="font-size:10px">🟢 FSC</span>'
      : '<span class="badge" style="background:#f1f5f9;color:#64748b;font-size:10px">⚪ Non-FSC</span>';

    const displayItems = items.length > 0
      ? items
      : [{ qty: '', sup: '', customer_roll: 'normal', quality_b: 'normal', note: '' }];

    displayItems.forEach((it, idx) => {
      const isFirst = idx === 0;

      html += `<tr class="${rowCls}" data-gradegram="${esc(r.gradegram)}" data-size="${r.size}" data-item-idx="${idx}">`;

      if (isFirst) {
        html += `<td class="grade-col clickable" rowspan="${displayItems.length}"
                     onclick="openAlertDetail('${esc(r.gradegram)}', ${r.size})">${esc(r.gradegram)}</td>`;
        html += `<td class="clickable" rowspan="${displayItems.length}"
                     onclick="openAlertDetail('${esc(r.gradegram)}', ${r.size})">${r.size}</td>`;
        html += `<td rowspan="${displayItems.length}">${r.snapshot}</td>`;
        html += `<td rowspan="${displayItems.length}">${Number(r.stock).toFixed(2)}</td>`;
        html += `<td rowspan="${displayItems.length}">${r.receive}</td>`;
        html += `<td class="usage-cell" rowspan="${displayItems.length}">${r.usage_plan ? Number(r.usage_plan).toFixed(2) : '-'}</td>`;
        html += `<td class="alert-cell" rowspan="${displayItems.length}"><b>${a > 0 ? '+' + a : a}</b></td>`;
        html += `<td class="status-cell" rowspan="${displayItems.length}">${statusTxt}</td>`;
      }

      const clsQty   = (it.qty && Number(it.qty) > 0) ? ' filled' : '';
      const clsSup   = it.sup ? ' filled' : '';
      const clsCust  = (it.customer_roll && it.customer_roll !== 'normal') ? ' filled' : '';
      const clsQual  = (it.quality_b && it.quality_b !== 'normal') ? ' filled' : '';
      const clsNote  = it.note ? ' filled' : '';

      const supOptions = alertSupplierCache.map(code =>
        `<option value="${esc(code)}" ${it.sup === code ? 'selected' : ''}>${esc(code)}</option>`
      ).join('');

      const custOptions = ALERT_CUSTOMER_ROLLS.map(c =>
        `<option value="${c.value}" ${it.customer_roll === c.value ? 'selected' : ''}>${c.label}</option>`
      ).join('');

      const qualOptions = ALERT_QUALITY_B.map(q =>
        `<option value="${q.value}" ${it.quality_b === q.value ? 'selected' : ''}>${q.label}</option>`
      ).join('');

      html += `<td><input type="number" class="alert-input-qty${clsQty}" placeholder="-" value="${it.qty || ''}"
                       onchange="onAlertItemInput('${esc(r.gradegram)}', ${r.size}, ${idx}, 'qty', this.value, this)"></td>`;

      html += `<td><select class="alert-input-sup${clsSup}"
                       onchange="onAlertItemInput('${esc(r.gradegram)}', ${r.size}, ${idx}, 'sup', this.value, this)">
                <option value="">-- Sup --</option>${supOptions}</select></td>`;

      html += `<td><select class="alert-input-customer${clsCust}"
                       onchange="onAlertItemInput('${esc(r.gradegram)}', ${r.size}, ${idx}, 'customer_roll', this.value, this)">${custOptions}</select></td>`;

      html += `<td><select class="alert-input-quality${clsQual}"
                       onchange="onAlertItemInput('${esc(r.gradegram)}', ${r.size}, ${idx}, 'quality_b', this.value, this)">${qualOptions}</select></td>`;

      html += `<td class="fsc-cell">${isFirst ? fscBadge : ''}</td>`;

      html += `<td><input type="text" class="alert-input-note${clsNote}" placeholder="-" value="${esc(it.note || '')}"
                       onchange="onAlertItemInput('${esc(r.gradegram)}', ${r.size}, ${idx}, 'note', this.value, this)"></td>`;

      html += `<td style="text-align:center;white-space:nowrap">`;
      if (idx === displayItems.length - 1) {
        html += `<button type="button" class="add-flat-row-btn"
                   onclick="addFlatRow('${esc(r.gradegram)}', ${r.size})"
                   title="เพิ่มบรรทัด">➕</button>`;
      }
      html += `</td>`;

      html += '</tr>';
    });
  });

  html += `<tr class="total-row">
    <td colspan="8" style="text-align:right;font-weight:700">จำนวนรวม (ม้วน)</td>
    <td style="font-weight:700;color:#dc2626;font-size:15px">${grandShortage > 0 ? grandShortage : '-'}</td>
    <td colspan="7"></td>
  </tr>`;

  tbody.innerHTML = html;
  initAlertRowHover();
}

async function onAlertItemInput(gradegram, size, idx, field, value, el) {
  const items = getAlertItems(gradegram, size);

  while (items.length <= idx) {
    items.push({ qty: '', sup: '', customer_roll: 'normal', quality_b: 'normal', note: '' });
  }

  items[idx][field] = value;
  await saveAlertItems(gradegram, size, items);

  if (el) {
    const isFilled = (field === 'customer_roll' || field === 'quality_b')
      ? (value && value !== 'normal')
      : (value && String(value).trim() !== '');
    el.classList.toggle('filled', !!isFilled);
  }

  const hasOrderFilter = !alertSelectedOrderFilters.includes('all') && alertSelectedOrderFilters.length > 0;
  const hasSupFilter = alertSelectedSupFilters.length > 0;
  if (field === 'qty' || field === 'sup' || hasOrderFilter || hasSupFilter) {
    applyAlertFiltersAndRender();
  }
}

async function addFlatRow(gradegram, size) {
  const items = getAlertItems(gradegram, size);
  if (items.length >= 5) {
    alert('⚠️ เพิ่มได้สูงสุด 5 รายการต่อ cell');
    return;
  }
  items.push({ qty: '', sup: '', customer_roll: 'normal', quality_b: 'normal', note: '' });
  await saveAlertItems(gradegram, size, items);
  applyAlertFiltersAndRender();
}

// ═══════════════════════════════════════════════════════════════
//  MATRIX VIEW
// ═══════════════════════════════════════════════════════════════

function renderAlertMatrixView(rows) {
  const container = document.getElementById('alertBody');
  if (!container) return;

  const flatWrap = container.querySelector('.report-wrap.alert-scroll');
  if (flatWrap) flatWrap.style.display = 'none';

  let matrixWrap = document.getElementById('alertMatrixWrap');
  if (!matrixWrap) {
    matrixWrap = document.createElement('div');
    matrixWrap.id = 'alertMatrixWrap';
    matrixWrap.className = 'alert-matrix-wrap';

    const reportFoot = container.querySelector('.report-foot');
    if (reportFoot) container.insertBefore(matrixWrap, reportFoot);
    else container.appendChild(matrixWrap);
  } else {
    matrixWrap.style.display = '';
  }

  if (!rows.length) {
    matrixWrap.innerHTML = '<p style="text-align:center;color:#94a3b8;padding:30px">ไม่มีรายการ 🎉</p>';
    return;
  }

  const grades = [...new Set(rows.map(r => r.gradegram))].sort();
  const sizes  = [...new Set(rows.map(r => Number(r.size)))].sort((a, b) => a - b);
  const dataMap = {};
  rows.forEach(r => { dataMap[`${r.gradegram}|${r.size}`] = r; });

  let html = '<table class="alert-matrix-new-table"><thead><tr>';
  html += '<th class="grade-col-matrix">GRADEGRAMS</th>';
  sizes.forEach(s => { html += `<th>${s}</th>`; });
  html += '<th class="total-col-matrix">TOTAL</th></tr></thead><tbody>';

  grades.forEach(grade => {
    html += '<tr>';
    html += `<td class="grade-col-matrix">${esc(grade)}</td>`;
    let rowTotal = 0;
    sizes.forEach(size => {
      const r = dataMap[`${grade}|${size}`];
      if (!r) { html += '<td class="empty-cell">-</td>'; return; }
      const a = Number(r.alert) || 0;
      rowTotal += a;
      let cellCls = '';
      if (a < 0) cellCls = 'matrix-red';
      else if (a === 0) cellCls = 'matrix-yellow';
      else cellCls = 'matrix-green';

      const totalQty = getAlertQtyTotal(grade, size);
      const hasOrder = totalQty > 0;
      const items = getAlertItems(grade, size);
      const allHaveSup = items.length > 0 && items.every(it => it.sup && String(it.sup).trim());
      const hasQtyNoSup = hasOrder && !allHaveSup;

      const cartIcon = hasOrder ? `<svg class="matrix-cart-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>` : '';

      let orderCls = '';
      if (hasOrder && allHaveSup) orderCls = 'has-order';
      else if (hasQtyNoSup) orderCls = 'order-incomplete';

      html += `<td class="matrix-cell ${cellCls} ${orderCls}" 
                   onclick="openAlertMatrixCell('${esc(grade)}', ${size})"
                   data-tip="Gradegrams ${esc(grade)} · Size ${size}">
                 <div class="matrix-value">${a > 0 ? '+' + Number(a).toFixed(2) : Number(a).toFixed(2)}${cartIcon}</div>
               </td>`;
    });
    html += `<td class="total-col-matrix">${rowTotal > 0 ? '+' + rowTotal.toFixed(2) : rowTotal.toFixed(2)}</td></tr>`;
  });

  html += '<tr class="total-row-matrix">';
  html += '<td class="grade-col-matrix" style="text-align:right">TOTAL</td>';
  sizes.forEach(size => {
    let colTotal = 0;
    grades.forEach(grade => {
      const r = dataMap[`${grade}|${size}`];
      if (r) colTotal += Number(r.alert) || 0;
    });
    html += `<td>${colTotal > 0 ? '+' + colTotal.toFixed(2) : colTotal.toFixed(2)}</td>`;
  });
  const grandTotal = rows.reduce((s, r) => s + (Number(r.alert) || 0), 0);
  html += `<td class="total-col-matrix">${grandTotal > 0 ? '+' + grandTotal.toFixed(2) : grandTotal.toFixed(2)}</td>`;
  html += '</tr></tbody></table>';
  matrixWrap.innerHTML = html;
}

// ═══════════════════════════════════════════════════════════════
//  MODAL CELL
// ═══════════════════════════════════════════════════════════════

async function openAlertMatrixCell(gradegram, size) {
  const r = alertCache.find(x => x.gradegram === gradegram && Number(x.size) === Number(size));
  if (!r) { alert('ไม่พบข้อมูล'); return; }

  const resMap = await loadAlertReservations();
  const reservations = resMap[`${gradegram}|${size}`] || [];
  const reservedTotal = reservations.reduce((s, x) => s + (Number(x.quantity) || 0), 0);

  const a = Number(r.alert) || 0;
  let alertCls, alertTxt, alertIcon;
  if (a < 0)        { alertCls = 'red';    alertIcon = '🔴'; alertTxt = `ขาด ${Math.ceil(Math.abs(a))} ม้วน`; }
  else if (a === 0) { alertCls = 'yellow'; alertIcon = '🟡'; alertTxt = 'พอดี'; }
  else              { alertCls = 'green';  alertIcon = '🟢'; alertTxt = `เกิน ${Math.floor(a)} ม้วน`; }

  const titleEl = $('alertMatrixCellTitle');
  if (titleEl) {
    titleEl.innerHTML = `📊 ${esc(gradegram)}-${size} <span style="color:#64748b;font-weight:400;font-size:13px">
      (Gradegrams ${esc(gradegram)} · Size ${size})</span>`;
  }

  const bodyEl = $('alertMatrixCellBody');
  if (!bodyEl) return;

  let html = `
    <div class="matrix-cell-summary">
      <div class="matrix-cell-summary-title">
        📋 ข้อมูลสรุป
        <span class="alert-status-badge">${alertIcon} ${alertTxt}</span>
      </div>
      <div class="matrix-cell-grid">
        <div class="matrix-cell-row">
          <span class="label">Stock Level:</span>
          <span class="value blue">${r.snapshot}</span>
        </div>
        <div class="matrix-cell-row">
          <span class="label">Stock:</span>
          <span class="value">${Number(r.stock).toFixed(2)}</span>
        </div>
        <div class="matrix-cell-row">
          <span class="label">Receive:</span>
          <span class="value">${r.receive}</span>
        </div>
        <div class="matrix-cell-row">
          <span class="label">Usage Plan:</span>
          <span class="value">${r.usage_plan ? Number(r.usage_plan).toFixed(2) : '-'}</span>
        </div>
      </div>
      <div class="matrix-alert-big ${alertCls}">
        Alert: ${a > 0 ? '+' + a : a} ม้วน
      </div>
    </div>
  `;

  html += `
    <div class="matrix-cell-summary" style="background:linear-gradient(135deg,#fffbeb,#fef3c7);border-color:#fcd34d;margin-top:12px">
      <div class="matrix-cell-summary-title" style="color:#92400e">
        🔖 ยอดจอง (Reserved)
        <span class="alert-status-badge" id="alertReservedBadge" style="background:#fbbf24;color:#fff">
          ${reservedTotal > 0 ? reservedTotal + ' ม้วน' : 'ไม่มี'}
        </span>
      </div>
      <div style="margin-top:8px" id="alertReservationBox">
        ${buildReservationHtml(reservations)}
      </div>
    </div>
  `;

  const items = getAlertItems(gradegram, size);
  const hasOrder = items.length > 0;
  const isLocked = document.getElementById('alertBody')?.classList.contains('alert-locked');

  if (isLocked) {
    html += `<div class="matrix-order-prompt" style="background:#fef3c7;border-color:#fcd34d">
      <p style="color:#92400e">🔒 ข้อมูลนี้ถูกล็อก (ข้ามวันแล้ว) — ดูได้อย่างเดียว</p>
    </div>`;
  } else if (!hasOrder) {
    html += `
      <div class="matrix-order-prompt" id="matrixOrderPrompt">
        <p>📦 ต้องการสั่งซื้อหรือไม่?</p>
        <button type="button" class="primary" onclick="showMatrixOrderForm('${esc(gradegram)}', ${size})">
          ✏️ กรอกข้อมูลสั่งซื้อ
        </button>
      </div>
    `;
  } else {
    html += renderMatrixOrderForm(gradegram, size, items);
  }

  bodyEl.innerHTML = html;
  openModal('modalAlertMatrixCell');
}

// ═══════════════════════════════════════════════════════════════
//  MATRIX ORDER FORM
// ═══════════════════════════════════════════════════════════════

function renderMatrixOrderForm(gradegram, size, items) {
  if (!items || !items.length) {
    items = [{ qty: '', sup: '', customer_roll: 'normal', quality_b: 'normal', note: '' }];
  }
  const rowsHtml = items.map((it, idx) => renderMatrixOrderRow(idx, it)).join('');
  return `
    <div class="matrix-order-form" id="matrixOrderForm"
         data-gradegram="${esc(gradegram)}" data-size="${size}">
      <div class="matrix-order-form-header">
        <h4>✏️ กรอกรายการสั่งซื้อ</h4>
        <button type="button" class="add-row-btn"
                onclick="addMatrixOrderRow('${esc(gradegram)}', ${size})">
          ➕ เพิ่มรายการ
        </button>
      </div>
      <div id="matrixOrderRows" class="matrix-order-rows">
        ${rowsHtml}
      </div>
      <div class="form-actions">
        <button type="button" onclick="cancelDraftOrder('${esc(gradegram)}', ${size})">ยกเลิก</button>
        <button type="button" class="primary" onclick="saveMatrixOrder('${esc(gradegram)}', ${size})">
          💾 บันทึก
        </button>
      </div>
    </div>
  `;
}

function renderMatrixOrderRow(idx, it) {
  const supOptions = alertSupplierCache.map(code =>
    `<option value="${esc(code)}" ${it.sup === code ? 'selected' : ''}>${esc(code)}</option>`
  ).join('');

  const custOptions = ALERT_CUSTOMER_ROLLS.map(c =>
    `<option value="${c.value}" ${it.customer_roll === c.value ? 'selected' : ''}>${c.label}</option>`
  ).join('');

  const qualOptions = ALERT_QUALITY_B.map(q =>
    `<option value="${q.value}" ${it.quality_b === q.value ? 'selected' : ''}>${q.label}</option>`
  ).join('');

  const resTag = it.res_id
    ? '<span class="row-res-tag" style="color:#38bdf8;font-weight:600;font-size:12px;margin-left:6px">(จากยอดจอง - Reserved)</span>'
    : '';

  return `
    <div class="matrix-order-row" data-row-idx="${idx}" data-res-id="${esc(String(it.res_id || ''))}">
      <div class="matrix-order-row-head">
        <span class="row-label"><span class="row-num">รายการที่ ${idx + 1}</span>${resTag}</span>
        <button type="button" class="row-remove-btn" onclick="removeMatrixOrderRow(this)" title="ลบรายการนี้">✕</button>
      </div>

      <div class="form-row">
        <div class="form-field">
          <label>จำนวนม้วน *</label>
          <input type="number" class="qty-input matrix-row-qty" min="1" step="1" placeholder="0" value="${it.qty || ''}">
        </div>
        <div class="form-field">
          <label>Sup.</label>
          <select class="matrix-row-sup">
            <option value="">-- เลือก Sup --</option>
            ${supOptions}
          </select>
        </div>
      </div>

      <div class="form-row">
        <div class="form-field">
          <label>ม้วนลูกค้า</label>
          <select class="matrix-row-cust">${custOptions}</select>
        </div>
        <div class="form-field">
          <label>คุณภาพ B</label>
          <select class="matrix-row-qual">${qualOptions}</select>
        </div>
      </div>

      <div class="form-row full">
        <div class="form-field">
          <label>หมายเหตุ</label>
          <input type="text" class="matrix-row-note" placeholder="-" value="${esc(it.note || '')}">
        </div>
      </div>
    </div>
  `;
}

function addMatrixOrderRow(gradegram, size) {
  const rowsBox = document.getElementById('matrixOrderRows');
  if (!rowsBox) return;

  const currentCount = rowsBox.querySelectorAll('.matrix-order-row').length;
  if (currentCount >= 5) {
    alert('⚠️ เพิ่มได้สูงสุด 5 รายการ');
    return;
  }

  const newRow = { qty: '', sup: '', customer_roll: 'normal', quality_b: 'normal', note: '' };
  const wrapper = document.createElement('div');
  wrapper.innerHTML = renderMatrixOrderRow(currentCount, newRow);
  rowsBox.appendChild(wrapper.firstElementChild);
  renumberMatrixOrderRows();
}

// ═══════════════════════════════════════════════════════════════
//  ✅ V.18.0: removeMatrixOrderRow — ลบ log DRAFT ตอนลบแถว
// ═══════════════════════════════════════════════════════════════

async function removeMatrixOrderRow(btn) {
  const row = btn.closest('.matrix-order-row');
  if (!row) return;

  const rowsBox = document.getElementById('matrixOrderRows');
  if (!rowsBox) return;

  const form = document.getElementById('matrixOrderForm');
  const gradegram = form?.dataset.gradegram || '';
  const size = Number(form?.dataset.size);
  const resId = row.dataset.resId || '';

  // 1. ลบแถว
  row.remove();

  // 2. ถ้าไม่เหลือแถวเลย ให้สร้างแถวว่าง 1 แถว
  if (rowsBox.querySelectorAll('.matrix-order-row').length === 0) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = renderMatrixOrderRow(0, { qty: '', sup: '', customer_roll: 'normal', quality_b: 'normal', note: '' });
    rowsBox.appendChild(wrapper.firstElementChild);
  }

  // 3. จัดเลขใหม่
  renumberMatrixOrderRows();

  // 4. แถวจาก Stock กลาง → จบแค่นี้
  if (!resId) return;

  // 5. แถวจากยอดจอง → คืนยอด
  const draftIdx = _draftPendingItems.findIndex(d => String(d.resId) === String(resId));
  if (draftIdx >= 0) {
    // 🔥 กรณีที่ 1: draft ยังไม่ save → แค่ลบออกจาก memory
    _draftPendingItems.splice(draftIdx, 1);
  } else {
    // 🔥 กรณีที่ 2: draft save แล้ว → ลบ log DRAFT + คืนสถานะ
    try {
      const { error } = await supabase
        .from('roll_reservation_logs')
        .delete()
        .eq('reservation_id', resId)
        .eq('action_type', 'complete')
        .like('reason', `DRAFT:${gradegram}-${size}`);
      
      if (error) throw error;
    } catch (err) {
      console.warn('ลบ log DRAFT ไม่สำเร็จ:', err);
    }

    await _restoreReservations([resId]);

    const saved = getAlertItems(gradegram, size);
    const i = saved.findIndex(it => String(it.res_id) === String(resId));
    if (i >= 0) {
      saved.splice(i, 1);
      await saveAlertItems(gradegram, size, saved);
      applyAlertFiltersAndRender();
    }
  }

  // 6. รีเฟรชเฉพาะกล่องยอดจอง
  await refreshReservationBox(gradegram, size);
}

async function _restoreReservations(ids) {
  const clean = (ids || []).filter(Boolean);
  if (!clean.length) return;
  try {
    const { error } = await supabase
      .from('roll_reservations')
      .update({ status: 'reserved' })
      .in('id', clean);
    if (error) throw error;

    if (typeof loadReservations === 'function') {
      try { await loadReservations(); } catch (e) { console.warn(e); }
    }
  } catch (err) {
    console.error('_restoreReservations error:', err);
    alert('⚠️ คืนยอดจองไม่สำเร็จ: ' + err.message);
  }
}

async function refreshReservationBox(gradegram, size) {
  const box = document.getElementById('alertReservationBox');
  if (!box) return;

  const resMap = await loadAlertReservations();
  const list = resMap[`${gradegram}|${size}`] || [];
  box.innerHTML = buildReservationHtml(list);

  const badge = document.getElementById('alertReservedBadge');
  if (badge) {
    const total = list.reduce((s, x) => s + (Number(x.quantity) || 0), 0);
    badge.textContent = total > 0 ? `${total} ม้วน` : 'ไม่มี';
  }
}

function renumberMatrixOrderRows() {
  const rows = document.querySelectorAll('#matrixOrderRows .matrix-order-row');
  rows.forEach((row, idx) => {
    const num = row.querySelector('.row-num');
    if (num) num.textContent = `รายการที่ ${idx + 1}`;
    row.dataset.rowIdx = idx;
  });
}

function showMatrixOrderForm(gradegram, size) {
  const items = getAlertItems(gradegram, size);
  const formHtml = renderMatrixOrderForm(gradegram, size, items);

  const prompt = document.getElementById('matrixOrderPrompt');
  if (prompt) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = formHtml;
    prompt.parentNode.replaceChild(wrapper.firstElementChild, prompt);
  }

  setTimeout(() => document.querySelector('#matrixOrderRows .matrix-row-qty')?.focus(), 100);
}

// ═══════════════════════════════════════════════════════════════
//  ✅ V.18.0: saveMatrixOrder — สร้าง log complete ตอน Save Draft
// ═══════════════════════════════════════════════════════════════

async function saveMatrixOrder(gradegram, size) {
  const rows = document.querySelectorAll('#matrixOrderRows .matrix-order-row');
  if (!rows.length) {
    alert('⚠️ ต้องมีอย่างน้อย 1 รายการ');
    return;
  }

  const items = [];

  for (const row of rows) {
    const qty = row.querySelector('.matrix-row-qty')?.value;
    const sup = row.querySelector('.matrix-row-sup')?.value || '';
    const cust = row.querySelector('.matrix-row-cust')?.value || 'normal';
    const qual = row.querySelector('.matrix-row-qual')?.value || 'normal';
    const note = row.querySelector('.matrix-row-note')?.value || '';

    if (!qty || Number(qty) <= 0) continue;

    const item = {
      qty: String(Number(qty)),
      sup,
      customer_roll: cust,
      quality_b: qual,
      note
    };
    if (row.dataset.resId) item.res_id = row.dataset.resId;

    items.push(item);
  }

  if (!items.length) {
    if (!confirm('⚠️ ไม่มีรายการที่กรอก → ต้องการลบข้อมูลของ cell นี้ทั้งหมดหรือไม่?')) return;

    const oldResIds = getAlertItems(gradegram, size).map(i => i.res_id).filter(Boolean);
    _draftPendingItems = _draftPendingItems.filter(d => !(d.gradegram === gradegram && Number(d.size) === Number(size)));
    
    // 🔥 ลบ log DRAFT เก่าด้วย (ถ้ามี)
    await _deleteDraftLogs(gradegram, size);
    
    await _restoreReservations(oldResIds);
    await saveAlertItems(gradegram, size, []);
    closeModal('modalAlertMatrixCell');
    applyAlertFiltersAndRender();
    return;
  }

  _draftPendingItems = _draftPendingItems.filter(
    d => !(d.gradegram === gradegram && Number(d.size) === Number(size))
  );

  // 🔥 ขั้นที่ 1: ลบ log DRAFT เก่าของ cell นี้ก่อน (ถ้ากด Save ซ้ำ)
  await _deleteDraftLogs(gradegram, size);

  // 🔥 ขั้นที่ 2: บันทึก draft ใหม่
  await saveAlertItems(gradegram, size, items);

  // 🔥 ขั้นที่ 3: สร้าง log complete เพื่อหักยอดจองจริง
  for (const item of items) {
    if (item.res_id && Number(item.qty) > 0) {
      await logReservationAction(
        item.res_id,
        'complete',
        -Number(item.qty),
        null,
        `DRAFT:${gradegram}-${size}`
      );
    }
  }

  closeModal('modalAlertMatrixCell');
  applyAlertFiltersAndRender();

  const total = items.reduce((s, i) => s + Number(i.qty), 0);
  const msg = document.createElement('div');
  msg.className = 'msg ok';
  msg.style.cssText = 'position:fixed;top:80px;right:20px;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,.15)';
  msg.textContent = `✅ บันทึก Draft ${items.length} รายการ (${gradegram}-${size}) รวม ${total} ม้วน`;
  document.body.appendChild(msg);
  setTimeout(() => msg.remove(), 2000);
}

// ═══════════════════════════════════════════════════════════════
//  🔥 NEW: _deleteDraftLogs — ลบ log DRAFT ของ cell
// ═══════════════════════════════════════════════════════════════

async function _deleteDraftLogs(gradegram, size) {
  try {
    const { data: logs, error } = await supabase
      .from('roll_reservation_logs')
      .select('id, reservation_id, reason')
      .eq('action_type', 'complete')
      .like('reason', `DRAFT:${gradegram}-${size}`);
    
    if (error) throw error;
    if (!logs || logs.length === 0) return;

    const ids = logs.map(l => l.id);
    const { error: delErr } = await supabase
      .from('roll_reservation_logs')
      .delete()
      .in('id', ids);
    
    if (delErr) throw delErr;
    console.log(`🗑 ลบ log DRAFT ${ids.length} รายการ (${gradegram}-${size})`);
  } catch (err) {
    console.error('_deleteDraftLogs error:', err);
  }
}

// ═══════════════════════════════════════════════════════════════
//  END OF PART 2 — ต่อใน alert_part3.js
// ═══════════════════════════════════════════════════════════════
