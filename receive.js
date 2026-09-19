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

// ================= SUPPLIER SUMMARY (ย้ายมาจาก Summary tab) =================
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
      <td style="text-align:right">${s.kg.toFixed(0)}</td></tr>`;
  });
  html += `<tr class="total-row"><td>รวม</td>
    <td style="text-align:right">${totalSupQty}</td>
    <td style="text-align:right">${totalSupKg.toFixed(0)}</td></tr>`;
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

  // ✅ แก้: ตัด 'ทุกเกรด' ออก + สร้าง subtitle แบบมีเงื่อนไข
  const gradeLabel = receiveSelectedGrades.length > 0
    ? `เกรด: ${receiveSelectedGrades.join(', ')}` : '';
  const supLabel = supplier ? `Supplier: ${supplier}` : '';
  const fscLabel = fsc === 'all' ? '' : fsc === 'fsc' ? 'FSC' : 'Non-FSC';
  const remarkLabel = remark ? remark : '';

  // รวม label ที่มีค่าเท่านั้น
  const subParts = [gradeLabel, supLabel, fscLabel, remarkLabel].filter(Boolean);
  const subText = subParts.length ? `(${subParts.join(' · ')})` : '';

  $('receiveReportTitle').innerHTML = `
    รายการรับม้วนกระดาษเข้าคลัง<br>
    ประจำวันที่ ${dateThai}
    ${subText ? `<div class="report-subtitle">${subText}</div>` : ''}
  `;
  $('receiveBody').innerHTML = '<p style="text-align:center;color:#94a3b8;padding:20px">กำลังโหลด...</p>';

  try {
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

// ================= MATRIX (ไม่แสดง KG) =================
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

// ================= LIST (ไม่แสดง KG) =================
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
  html += `<div style="margin-top:8px;font-size:13px;color:#64748b">
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
      📦 รวม ${totalQty} ม้วน · ${totalKg.toFixed(0)} kg · ${rows.length} รายการ
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
        <td style="text-align:right">${Number(r.kg_total).toFixed(0)}</td>
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
    supRows.push([sup, supMap[sup].qty, Number(supMap[sup].kg.toFixed(0))]);
    totalQty += supMap[sup].qty;
    totalKg  += supMap[sup].kg;
  });
  supRows.push(['รวม', totalQty, Number(totalKg.toFixed(0))]);
  const wsSup = XLSX.utils.aoa_to_sheet(supRows);
  XLSX.utils.book_append_sheet(wb, wsSup, 'สรุป Supplier');

  // Sheet 2: รายการทั้งหมด (เอา KG ออก)
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

  // ชื่อไฟล์
  const fileName = `Receive_${receiveDate || 'export'}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

// ================= IMPORT RECEIVE =================
function openReceiveImportModal() {
  $('receiveImportDate').value = toISODate(new Date());
  $('receiveImportError').innerHTML = '';
  openModal('modalReceiveImport');
}

function importReceive(ev) {
  const f = ev.target.files[0];
  if (!f) return;
  closeModal('modalReceiveImport');

  const receiveDate = $('receiveImportDate')?.value;
  if (!receiveDate) { alert('กรุณาเลือกวันที่'); ev.target.value = ''; return; }

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      showProgress('receiveProgress', 0, 1, 'กำลังอ่านไฟล์...');
      const wb = XLSX.read(e.target.result, { type: 'array' });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      showProgress('receiveProgress', 0, rows.length, `อ่านได้ ${rows.length} แถว กำลังเตรียมข้อมูล...`);

      const payload = rows.map(row => {
        const keys = Object.keys(row);
        const findKey = (patterns) => {
          for (const p of patterns) {
            const found = keys.find(k => k.toLowerCase().trim() === p.toLowerCase().trim());
            if (found) return row[found];
          }
          return '';
        };

        const poNo       = String(findKey(['เลขที่ PO','po_no','po']) || '').trim();
        const pcCode     = String(findKey(['PC.','pc_code','pc']) || '').trim();
        const supplier   = String(findKey(['SUP.','supplier','sup']) || '').trim();
        const gradegram  = String(findKey(['Gradegram','grade']) || '').trim();
        const sizeRaw    = findKey(['Size','size']);
        const size       = Number(sizeRaw) || '';
        const qtyRaw     = findKey(['Quantity','quantity','qty']);
        const quantity   = Number(qtyRaw) || 0;
        const kgRaw      = findKey(['KG. รวม','kg_total','kg']);
        const kgTotal    = Number(kgRaw) || 0;
        const buRaw      = findKey(['BU','bu']);
        const bu         = Number(buRaw) || 1;
        const dept       = String(findKey(['Department','department','dept']) || '13110').trim();
        const priceRaw   = findKey(['Price','price','ราคา']);
        const price      = priceRaw !== '' && priceRaw != null ? Number(priceRaw) : null;
        const remark     = String(findKey(['หมายเหตุ','remark','note']) || '').trim();

        const gradeNorm = normalizeGrade(gradegram);

        return {
          po_no: poNo,
          pc_code: pcCode,
          supplier: supplier,
          grade: gradeNorm,
          size: size,
          quantity: quantity,
          kg_total: kgTotal,
          bu: bu,
          department: dept,
          price: price,
          remark: remark,
          created_by: currentUser.id
        };
      }).filter(r => r.po_no && r.grade && r.size);

      if (!payload.length) {
        hideProgress('receiveProgress');
        showMsg('receiveImportMsg', '⚠ ไม่มีแถวที่บันทึกได้ (ตรวจสอบคอลัมน์)', 'err');
        return;
      }

      showProgress('receiveProgress', 0, 1, `กำลังบันทึก ${payload.length} แถว...`);
      const { data, error } = await supabase.rpc('import_po_receive', {
        rows: payload,
        p_po_date: receiveDate
      });

      if (error) {
        hideProgress('receiveProgress');
        showMsg('receiveImportMsg', '❌ บันทึกไม่สำเร็จ: ' + error.message, 'err');
        return;
      }

      hideProgress('receiveProgress');
      showSuccessModal(`Import Receive สำเร็จ ${data.inserted} แถว · วันที่ ${receiveDate}`);

      $('receiveDate').value = receiveDate;
      await renderReceive();
    } catch (ex) {
      hideProgress('receiveProgress');
      showMsg('receiveImportMsg', 'อ่านไฟล์ไม่สำเร็จ: ' + ex.message, 'err');
    }
  };
  reader.readAsArrayBuffer(f);
  ev.target.value = '';
}
