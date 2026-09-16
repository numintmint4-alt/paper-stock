// ═══════════════════════════════════════════════════════════════
//  STOCK ม้วนกระดาษ V6 — stock.js
//  ส่วนที่ 4: หน้า Stock คงเหลือ
// ═══════════════════════════════════════════════════════════════

// ================= STATE =================
let stockSelectedGrades = [];
let stockAllGrades = [];
let stockCache = [];

// ================= INIT =================
async function initStockTab() {
  const dateInput = $('stockDate');
  if (dateInput && !dateInput.value) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    dateInput.value = toISODate(yesterday);
  }

  await loadStockGradeFilter();
  await loadStockCustomers();
  await renderStockMatrix();
}

// ================= GRADE FILTER (grade+gram) =================
async function loadStockGradeFilter() {
  stockAllGrades = [...new Set(
    masterCache.map(m => m.grade + m.gram)
  )].sort();

  renderStockGradeList();
  updateStockGradeLabel();

  const btn = $('stockGradeFilterBtn');
  const dropdown = $('stockGradeDropdown');
  const box = $('stockGradeFilterBox');

  if (!btn || !dropdown || !box) return;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isHidden = dropdown.classList.contains('hidden');
    if (isHidden) {
      dropdown.classList.remove('hidden');
      btn.classList.add('open');
    } else {
      dropdown.classList.add('hidden');
      btn.classList.remove('open');
    }
  });

  document.addEventListener('click', (e) => {
    if (!box.contains(e.target)) {
      dropdown.classList.add('hidden');
      btn.classList.remove('open');
    }
  });
}

function renderStockGradeList() {
  const list = $('stockGradeList');
  if (!list) return;
  if (!stockAllGrades.length) {
    list.innerHTML = '<div style="padding:10px;text-align:center;color:#94a3b8;font-size:13px">ไม่มีข้อมูล</div>';
    return;
  }
  list.innerHTML = stockAllGrades.map(g => {
    const checked = stockSelectedGrades.includes(g);
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
        if (!stockSelectedGrades.includes(grade)) stockSelectedGrades.push(grade);
      } else {
        stockSelectedGrades = stockSelectedGrades.filter(g => g !== grade);
      }
      el.classList.toggle('checked', cb.checked);
      updateStockGradeLabel();
    });
  });
}

function updateStockGradeLabel() {
  const label = $('stockGradeFilterLabel');
  if (!label) return;
  if (stockSelectedGrades.length === 0) {
    label.textContent = 'ทั้งหมด';
    label.style.color = '#1e293b';
  } else if (stockSelectedGrades.length === 1) {
    label.textContent = stockSelectedGrades[0];
    label.style.color = '#1e40af';
  } else {
    label.textContent = `เลือก ${stockSelectedGrades.length} เกรด`;
    label.style.color = '#1e40af';
  }
}

function selectAllStockGrades() {
  stockSelectedGrades = [...stockAllGrades];
  renderStockGradeList();
  updateStockGradeLabel();
}

function clearAllStockGrades() {
  stockSelectedGrades = [];
  renderStockGradeList();
  updateStockGradeLabel();
}

// ================= CUSTOMER DROPDOWN =================
async function loadStockCustomers() {
  const sel = $('stockCustomer');
  if (!sel) return;
  try {
    const { data, error } = await supabase
      .from('stock_balance')
      .select('customer')
      .not('customer', 'is', null)
      .neq('customer', '');
    if (error) throw error;
    const customers = [...new Set(data.map(d => d.customer))].filter(Boolean).sort();
    const keepVal = sel.value;
    sel.innerHTML = '<option value="">ทั้งหมด</option>' +
      customers.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    sel.value = keepVal;
  } catch (e) {
    console.warn('loadStockCustomers:', e);
  }
}

// ================= RENDER STOCK MATRIX =================
async function renderStockMatrix() {
  const stockDate = $('stockDate')?.value;
  const customer = $('stockCustomer')?.value || '';
  const loc = $('stockLoc')?.value || '';
  const rollStatus = $('stockRollStatus')?.value || 'all';

  if (!stockDate) {
    alert('กรุณาเลือกวันที่ Stock');
    return;
  }

  const dateThai = thaiDateFull(stockDate);
  const gradeLabel = stockSelectedGrades.length > 0
    ? ` · เกรด: ${stockSelectedGrades.join(', ')}`
    : '';
  const custLabel = customer ? ` · ลูกค้า: ${customer}` : '';
  const locLabel = loc ? ` · ${loc}` : '';
  const statusLabel = rollStatus === 'all' ? '' :
                      rollStatus === 'full' ? ' · ม้วนเต็ม' : ' · ม้วนเศษ';

  $('stockReportTitle').innerHTML = `
    รายงาน Stock คงเหลือ ม้วนกระดาษ<br>
    ประจำวันที่ ${dateThai}
    <div class="report-subtitle">(${gradeLabel || 'ทุกเกรด'}${custLabel}${locLabel}${statusLabel})</div>
  `;

  $('stockBody').innerHTML = '<p style="text-align:center;color:#94a3b8;padding:20px">กำลังโหลด...</p>';

  try {
    const { data, error } = await supabase.rpc('get_stock_matrix', {
      p_stock_date: stockDate,
      p_grades: stockSelectedGrades.length > 0 ? stockSelectedGrades : null,
      p_customers: customer ? [customer] : null,
      p_locations: loc ? [loc] : null,
      p_roll_status: rollStatus
    });

    if (error) throw error;

    const rows = data || [];
    stockCache = rows;

    if (!rows.length) {
      $('stockBody').innerHTML = '<p style="text-align:center;color:#94a3b8;padding:30px">ไม่มีข้อมูล Stock ในเงื่อนไขที่เลือก</p>';
      return;
    }

    const rowSet = new Map();
    const colSet = new Set();
    const cells = {};
    const rowTotals = {};
    const colTotals = {};

    rows.forEach(r => {
      const rk = r.gradegram || r.grade;
      const size = r.width;
      rowSet.set(rk, r.grade);
      colSet.add(size);

      const k = rk + '|' + size;
      if (!cells[k]) cells[k] = { full: 0, scrap: 0, kgs: 0 };
      cells[k].full += Number(r.full_count) || 0;
      cells[k].scrap += Number(r.scrap_count) || 0;
      cells[k].kgs += Number(r.total_kgs) || 0;

      if (!rowTotals[rk]) rowTotals[rk] = { full: 0, scrap: 0, kgs: 0 };
      rowTotals[rk].full += Number(r.full_count) || 0;
      rowTotals[rk].scrap += Number(r.scrap_count) || 0;
      rowTotals[rk].kgs += Number(r.total_kgs) || 0;

      if (!colTotals[size]) colTotals[size] = { full: 0, scrap: 0, kgs: 0 };
      colTotals[size].full += Number(r.full_count) || 0;
      colTotals[size].scrap += Number(r.scrap_count) || 0;
      colTotals[size].kgs += Number(r.total_kgs) || 0;
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
        if (!v || (v.full === 0 && v.scrap === 0)) {
          html += '<td class="empty">-</td>';
        } else {
          let cellTxt = '';
          if (v.full > 0 && v.scrap > 0) cellTxt = `${v.full}+${v.scrap}`;
          else if (v.full > 0) cellTxt = `${v.full}`;
          else if (v.scrap > 0) cellTxt = `+${v.scrap}`;

          html += `<td class="clickable" onclick="openStockDetail('${esc(rk)}', ${s})">
            <div class="cell-content">
              <div class="cell-main">${cellTxt}</div>
              <div class="cell-sub">${v.kgs.toFixed(0)} kg</div>
            </div>
          </td>`;
        }
      });
      const rt = rowTotals[rk];
      let rowTxt = '';
      if (rt.full > 0 && rt.scrap > 0) rowTxt = `${rt.full}+${rt.scrap}`;
      else if (rt.full > 0) rowTxt = `${rt.full}`;
      else if (rt.scrap > 0) rowTxt = `+${rt.scrap}`;
      html += `<td class="total-col">${rowTxt}</td>`;
      html += '</tr>';
    });

    html += '<tr class="total-row"><td class="grade-col">Total</td>';
    colKeys.forEach(s => {
      const ct = colTotals[s];
      let txt = '';
      if (ct.full > 0 && ct.scrap > 0) txt = `${ct.full}+${ct.scrap}`;
      else if (ct.full > 0) txt = `${ct.full}`;
      else if (ct.scrap > 0) txt = `+${ct.scrap}`;
      html += `<td>${txt}</td>`;
    });
    const grand = { full: 0, scrap: 0 };
    Object.values(colTotals).forEach(ct => {
      grand.full += ct.full;
      grand.scrap += ct.scrap;
    });
    let grandTxt = '';
    if (grand.full > 0 && grand.scrap > 0) grandTxt = `${grand.full}+${grand.scrap}`;
    else if (grand.full > 0) grandTxt = `${grand.full}`;
    else if (grand.scrap > 0) grandTxt = `+${grand.scrap}`;
    html += `<td class="total-col">${grandTxt}</td>`;
    html += '</tr></tbody></table></div>';

    html += `<div class="report-foot">
      แสดง (ม้วนเต็ม + ม้วนเศษ) · คลิก Cell เพื่อดู SN · วันที่: ${dateThai}
    </div>`;

    $('stockBody').innerHTML = html;

  } catch (err) {
    console.error('renderStockMatrix error:', err);
    $('stockBody').innerHTML = `<div class="msg err">เกิดข้อผิดพลาด: ${esc(err.message)}</div>`;
  }
}

// ================= STOCK DETAIL =================
async function openStockDetail(gradegram, size) {
  const stockDate = $('stockDate')?.value;
  if (!stockDate) return;

  const match = gradegram.match(/^([A-Z]+)(\d+)$/);
  const grade = match ? match[1] : gradegram;

  $('stockDetailTitle').innerHTML = `${esc(gradegram)} · Size ${size} <span style="font-weight:400;color:#64748b;font-size:14px">(วันที่ ${stockDate})</span>`;
  openModal('modalStockDetail');
  $('stockDetailBody').innerHTML = '<p style="text-align:center;color:#94a3b8;padding:20px">กำลังโหลด...</p>';

  try {
    const { data, error } = await supabase.rpc('get_stock_detail', {
      p_stock_date: stockDate,
      p_grade: grade,
      p_width: size
    });
    if (error) throw error;

    const rows = data || [];
    if (!rows.length) {
      $('stockDetailBody').innerHTML = '<p style="text-align:center;color:#94a3b8;padding:20px">ไม่พบรายละเอียด</p>';
      return;
    }

    const fullCount = rows.filter(r => r.roll_status === 'full').length;
    const scrapCount = rows.filter(r => r.roll_status === 'scrap').length;
    const totalKgs = rows.reduce((s, r) => s + (Number(r.kgs) || 0), 0);

    let html = `<div class="msg info" style="margin-bottom:10px">
      📦 ทั้งหมด ${rows.length} ม้วน · 
      <b style="color:#166534">เต็ม ${fullCount}</b> · 
      <b style="color:#d97706">เศษ ${scrapCount}</b> · 
      <b>${totalKgs.toFixed(2)} kg</b>
    </div>`;

    html += '<div style="max-height:500px;overflow:auto"><table><thead><tr>';
    html += '<th>#</th><th>SN</th><th>Diameter</th><th>Kgs</th><th>Meter</th>';
    html += '<th>Supplier</th><th>QLT</th><th>Customer</th><th>Loc</th><th>สถานะ</th>';
    html += '</tr></thead><tbody>';

    rows.forEach((r, i) => {
      const cls = r.roll_status === 'full' ? 'full-row' : 'scrap-row';
      const statusTxt = r.roll_status === 'full' ? '✅ เต็ม' : '♻️ เศษ';
      const custTxt = r.is_customer_roll ? `👤 ${esc(r.customer)}` : esc(r.customer) || '-';
      html += `<tr class="${cls}">
        <td>${i+1}</td>
        <td><b>${esc(r.sn)}</b></td>
        <td>${Number(r.dimeter).toFixed(2)}</td>
        <td>${Number(r.kgs).toFixed(2)}</td>
        <td>${Number(r.meter || 0).toFixed(0)}</td>
        <td>${esc(r.supplier) || '-'}</td>
        <td>${esc(r.qlt) || '-'}</td>
        <td>${custTxt}</td>
        <td>${esc(r.loc) || '-'}</td>
        <td>${statusTxt}</td>
      </tr>`;
    });

    html += '</tbody></table></div>';
    $('stockDetailBody').innerHTML = html;

  } catch (err) {
    $('stockDetailBody').innerHTML = `<div class="msg err">${esc(err.message)}</div>`;
  }
}

// ================= IMPORT STOCK =================
function openStockImportModal() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  $('stockImportDate').value = toISODate(yesterday);
  $('stockImportError').innerHTML = '';
  openModal('modalStockImport');
}

function importStock(ev) {
  const f = ev.target.files[0];
  if (!f) return;

  // ปิด modal แล้วเริ่ม import
  closeModal('modalStockImport');

  const stockDate = $('stockImportDate')?.value;
  if (!stockDate) {
    alert('กรุณาเลือกวันที่');
    ev.target.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      showProgress('stockProgress', 0, 1, 'กำลังอ่านไฟล์...');
      const wb = XLSX.read(e.target.result, { type: 'array' });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      showProgress('stockProgress', 0, rows.length, `อ่านได้ ${rows.length} แถว กำลังเตรียมข้อมูล...`);

      const payload = rows.map(row => ({
        grade:           String(row['grade'] || '').trim(),
        width:           Number(row['width']) || '',
        supplier:        String(row['supplier'] || '').trim(),
        supplier_grade:  String(row['supplier_grade'] || '').trim(),
        sn:              String(row['sn'] || '').trim(),
        supplier_sn:     String(row['supplier_sn'] || '').trim(),
        dimeter:         Number(row['dimeter']) || '',
        kgs:             Number(row['kgs']) || '',
        meter:           Number(row['meter']) || '',
        supplier_doc_no: String(row['supplier_doc_no'] || '').trim(),
        buy_date:        String(row['buy_date'] || '').trim(),
        ageing:          Number(row['ageing']) || '',
        qlt:             String(row['qlt'] || '').trim(),
        customer:        String(row['customer'] || '').trim(),
        comp_no:         String(row['comp_no'] || '').trim(),
        loc:             String(row['loc'] || '').trim(),
        label_grade:     String(row['label_grade'] || '').trim(),
        created_by:      currentUser.id
      })).filter(r => r.sn && r.grade);

      if (!payload.length) {
        hideProgress('stockProgress');
        showMsg('stockImportMsg', '⚠ ไม่มีแถวที่บันทึกได้', 'err');
        return;
      }

      showProgress('stockProgress', 0, 1, `กำลังบันทึก ${payload.length} แถว...`);

      const { data, error } = await supabase.rpc('import_stock_balance', {
        rows: payload,
        p_stock_date: stockDate
      });

      if (error) {
        hideProgress('stockProgress');
        showMsg('stockImportMsg', '❌ บันทึกไม่สำเร็จ: ' + error.message, 'err');
        return;
      }

      hideProgress('stockProgress');
      showMsg('stockImportMsg',
        `✅ Import สำเร็จ ${data.inserted} แถว<br>วันที่ Stock: ${stockDate}`,
        'ok');

      $('stockDate').value = stockDate;
      await loadStockCustomers();
      await renderStockMatrix();

    } catch (ex) {
      hideProgress('stockProgress');
      showMsg('stockImportMsg', 'อ่านไฟล์ไม่สำเร็จ: ' + ex.message, 'err');
    }
  };
  reader.readAsArrayBuffer(f);
  ev.target.value = '';
}
