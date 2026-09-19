// ═══════════════════════════════════════════════════════════════
//  STOCK ม้วนกระดาษ V7 — stock.js
//  เพิ่ม: multi-select Customer/Location/Status + waiting status
// ═══════════════════════════════════════════════════════════════

let stockSelectedGrades = [];
let stockAllGrades = [];

let stockSelectedCustomers = [];
let stockAllCustomers = [];

let stockSelectedLocs = [];
let stockAllLocs = [];

let stockSelectedStatuses = [];
const STOCK_ALL_STATUSES = ['full', 'scrap', 'waiting'];

let stockCache = [];

// ═══════════════════════════════════════════════════════════════
// SUCCESS MODAL
// ═══════════════════════════════════════════════════════════════
function showSuccessModal(message) {
  let modal = document.getElementById('successModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'successModal';
    modal.className = 'modal-bg';
    modal.innerHTML = `
      <div class="modal" style="max-width:400px;text-align:center">
        <div style="font-size:48px;margin-bottom:10px">✅</div>
        <div id="successModalMsg" style="font-size:15px;color:#166534;margin-bottom:16px"></div>
        <button class="primary" onclick="document.getElementById('successModal').classList.remove('show')" style="width:100%">ตกลง</button>
      </div>`;
    document.body.appendChild(modal);
  }
  document.getElementById('successModalMsg').textContent = message;
  modal.classList.add('show');
}

// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════
async function initStockTab() {
  const dateInput = $('stockDate');
  if (dateInput && !dateInput.value) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    dateInput.value = toISODate(yesterday);
  }
  await loadStockGradeFilter();
  await loadStockCustomers();
  await loadStockLocs();
  loadStockStatusFilter();
  await renderStockMatrix();
}

// ═══════════════════════════════════════════════════════════════
// GENERIC MULTI-SELECT HELPERS
// ═══════════════════════════════════════════════════════════════
function _attachDropdown(btnId, dropdownId, boxId, docKey) {
  const btn = $(btnId);
  const dropdown = $(dropdownId);
  const box = $(boxId);
  if (!btn || !dropdown || !box) return;

  if (btn.dataset.listenerAttached === '1') return;
  btn.dataset.listenerAttached = '1';

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('hidden');
    btn.classList.toggle('open');
  });

  if (!window['_' + docKey + 'DocClick']) {
    window['_' + docKey + 'DocClick'] = (e) => {
      const b = $(btnId), d = $(dropdownId), bx = $(boxId);
      if (!b || !d || !bx) return;
      if (!bx.contains(e.target)) { d.classList.add('hidden'); b.classList.remove('open'); }
    };
    document.addEventListener('click', window['_' + docKey + 'DocClick']);
  }
}

// ═══════════════════════════════════════════════════════════════
// GRADE FILTER
// ═══════════════════════════════════════════════════════════════
async function loadStockGradeFilter() {
  stockAllGrades = [...new Set(
    masterCache.map(m => normalizeGrade(m.grade) + m.gram)
  )].sort();
  renderStockGradeList();
  updateStockGradeLabel();
  _attachDropdown('stockGradeFilterBtn', 'stockGradeDropdown', 'stockGradeFilterBox', 'stockGrade');
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
    label.textContent = 'ทั้งหมด'; label.style.color = '#1e293b';
  } else if (stockSelectedGrades.length === 1) {
    label.textContent = stockSelectedGrades[0]; label.style.color = '#1e40af';
  } else {
    label.textContent = `เลือก ${stockSelectedGrades.length} เกรด`; label.style.color = '#1e40af';
  }
}

function selectAllStockGrades() {
  stockSelectedGrades = [...stockAllGrades];
  renderStockGradeList(); updateStockGradeLabel();
}
function clearAllStockGrades() {
  stockSelectedGrades = [];
  renderStockGradeList(); updateStockGradeLabel();
}

// ═══════════════════════════════════════════════════════════════
// CUSTOMER FILTER
// ═══════════════════════════════════════════════════════════════
async function loadStockCustomers() {
  try {
    const { data, error } = await supabase
      .from('stock_balance')
      .select('customer')
      .not('customer', 'is', null)
      .neq('customer', '');
    if (error) throw error;
    stockAllCustomers = [...new Set(data.map(d => d.customer))].filter(Boolean).sort();
  } catch (e) {
    console.warn('loadStockCustomers:', e);
    stockAllCustomers = [];
  }
  renderStockCustomerList();
  updateStockCustomerLabel();
  _attachDropdown('stockCustomerFilterBtn', 'stockCustomerDropdown', 'stockCustomerFilterBox', 'stockCustomer');
}

function renderStockCustomerList() {
  const list = $('stockCustomerList');
  if (!list) return;
  if (!stockAllCustomers.length) {
    list.innerHTML = '<div style="padding:10px;text-align:center;color:#94a3b8;font-size:13px">ไม่มีข้อมูล</div>';
    return;
  }
  list.innerHTML = stockAllCustomers.map(c => {
    const checked = stockSelectedCustomers.includes(c);
    return `<label class="item ${checked ? 'checked' : ''}" data-customer="${esc(c)}">
      <input type="checkbox" ${checked ? 'checked' : ''}>
      <span>${esc(c)}</span>
    </label>`;
  }).join('');

  list.querySelectorAll('.item').forEach(el => {
    const cb = el.querySelector('input[type="checkbox"]');
    cb.addEventListener('change', () => {
      const c = el.dataset.customer;
      if (cb.checked) {
        if (!stockSelectedCustomers.includes(c)) stockSelectedCustomers.push(c);
      } else {
        stockSelectedCustomers = stockSelectedCustomers.filter(x => x !== c);
      }
      el.classList.toggle('checked', cb.checked);
      updateStockCustomerLabel();
    });
  });
}

function updateStockCustomerLabel() {
  const label = $('stockCustomerFilterLabel');
  if (!label) return;
  if (stockSelectedCustomers.length === 0) {
    label.textContent = 'ทั้งหมด'; label.style.color = '#1e293b';
  } else if (stockSelectedCustomers.length === 1) {
    label.textContent = stockSelectedCustomers[0]; label.style.color = '#1e40af';
  } else {
    label.textContent = `เลือก ${stockSelectedCustomers.length} ลูกค้า`; label.style.color = '#1e40af';
  }
}

function selectAllStockCustomers() {
  stockSelectedCustomers = [...stockAllCustomers];
  renderStockCustomerList(); updateStockCustomerLabel();
}
function clearAllStockCustomers() {
  stockSelectedCustomers = [];
  renderStockCustomerList(); updateStockCustomerLabel();
}

// ═══════════════════════════════════════════════════════════════
// LOCATION FILTER
// ═══════════════════════════════════════════════════════════════
async function loadStockLocs() {
  try {
    const { data, error } = await supabase
      .from('stock_balance')
      .select('loc')
      .not('loc', 'is', null)
      .neq('loc', '');
    if (error) throw error;
    stockAllLocs = [...new Set(data.map(d => d.loc))].filter(Boolean).sort();
  } catch (e) {
    console.warn('loadStockLocs:', e);
    stockAllLocs = ['LOC1', 'LOCF'];
  }
  renderStockLocList();
  updateStockLocLabel();
  _attachDropdown('stockLocFilterBtn', 'stockLocDropdown', 'stockLocFilterBox', 'stockLoc');
}

function renderStockLocList() {
  const list = $('stockLocList');
  if (!list) return;
  if (!stockAllLocs.length) {
    list.innerHTML = '<div style="padding:10px;text-align:center;color:#94a3b8;font-size:13px">ไม่มีข้อมูล</div>';
    return;
  }
  list.innerHTML = stockAllLocs.map(c => {
    const checked = stockSelectedLocs.includes(c);
    return `<label class="item ${checked ? 'checked' : ''}" data-loc="${esc(c)}">
      <input type="checkbox" ${checked ? 'checked' : ''}>
      <span>${esc(c)}</span>
    </label>`;
  }).join('');

  list.querySelectorAll('.item').forEach(el => {
    const cb = el.querySelector('input[type="checkbox"]');
    cb.addEventListener('change', () => {
      const c = el.dataset.loc;
      if (cb.checked) {
        if (!stockSelectedLocs.includes(c)) stockSelectedLocs.push(c);
      } else {
        stockSelectedLocs = stockSelectedLocs.filter(x => x !== c);
      }
      el.classList.toggle('checked', cb.checked);
      updateStockLocLabel();
    });
  });
}

function updateStockLocLabel() {
  const label = $('stockLocFilterLabel');
  if (!label) return;
  if (stockSelectedLocs.length === 0) {
    label.textContent = 'ทั้งหมด'; label.style.color = '#1e293b';
  } else if (stockSelectedLocs.length === 1) {
    label.textContent = stockSelectedLocs[0]; label.style.color = '#1e40af';
  } else {
    label.textContent = `เลือก ${stockSelectedLocs.length} Location`; label.style.color = '#1e40af';
  }
}

function selectAllStockLocs() {
  stockSelectedLocs = [...stockAllLocs];
  renderStockLocList(); updateStockLocLabel();
}
function clearAllStockLocs() {
  stockSelectedLocs = [];
  renderStockLocList(); updateStockLocLabel();
}

// ═══════════════════════════════════════════════════════════════
// STATUS FILTER (full / scrap / waiting)
// ═══════════════════════════════════════════════════════════════
function loadStockStatusFilter() {
  renderStockStatusList();
  updateStockStatusLabel();
  _attachDropdown('stockStatusFilterBtn', 'stockStatusDropdown', 'stockStatusFilterBox', 'stockStatus');
}

const STOCK_STATUS_LABELS = {
  full: '✅ ม้วนเต็ม',
  scrap: '♻️ ม้วนเศษ',
  waiting: '⏳ รอกรอ'
};

function renderStockStatusList() {
  const list = $('stockStatusList');
  if (!list) return;
  list.innerHTML = STOCK_ALL_STATUSES.map(s => {
    const checked = stockSelectedStatuses.includes(s);
    return `<label class="item ${checked ? 'checked' : ''}" data-status="${s}">
      <input type="checkbox" ${checked ? 'checked' : ''}>
      <span>${STOCK_STATUS_LABELS[s]}</span>
    </label>`;
  }).join('');

  list.querySelectorAll('.item').forEach(el => {
    const cb = el.querySelector('input[type="checkbox"]');
    cb.addEventListener('change', () => {
      const s = el.dataset.status;
      if (cb.checked) {
        if (!stockSelectedStatuses.includes(s)) stockSelectedStatuses.push(s);
      } else {
        stockSelectedStatuses = stockSelectedStatuses.filter(x => x !== s);
      }
      el.classList.toggle('checked', cb.checked);
      updateStockStatusLabel();
    });
  });
}

function updateStockStatusLabel() {
  const label = $('stockStatusFilterLabel');
  if (!label) return;
  if (stockSelectedStatuses.length === 0) {
    label.textContent = 'ทั้งหมด'; label.style.color = '#1e293b';
  } else if (stockSelectedStatuses.length === 1) {
    label.textContent = STOCK_STATUS_LABELS[stockSelectedStatuses[0]] || stockSelectedStatuses[0];
    label.style.color = '#1e40af';
  } else {
    label.textContent = `เลือก ${stockSelectedStatuses.length} สถานะ`; label.style.color = '#1e40af';
  }
}

function selectAllStockStatuses() {
  stockSelectedStatuses = [...STOCK_ALL_STATUSES];
  renderStockStatusList(); updateStockStatusLabel();
}
function clearAllStockStatuses() {
  stockSelectedStatuses = [];
  renderStockStatusList(); updateStockStatusLabel();
}

// ═══════════════════════════════════════════════════════════════
// RENDER STOCK MATRIX
// ═══════════════════════════════════════════════════════════════
async function renderStockMatrix() {
  const stockDate = $('stockDate')?.value;
  if (!stockDate) { alert('กรุณาเลือกวันที่ Stock'); return; }

  const dateThai = thaiDateFull(stockDate);

  // สร้าง subtitle
  const custLabel = stockSelectedCustomers.length
    ? ` · ลูกค้า: ${stockSelectedCustomers.length === 1 ? stockSelectedCustomers[0] : stockSelectedCustomers.length + ' ราย'}`
    : '';
  const locLabel = stockSelectedLocs.length
    ? ` · ${stockSelectedLocs.join(', ')}`
    : '';
  const statusLabel = stockSelectedStatuses.length
    ? ` · ${stockSelectedStatuses.map(s => STOCK_STATUS_LABELS[s]).join(', ')}`
    : '';

  $('stockReportTitle').innerHTML = `
    รายงาน Stock คงเหลือ ม้วนกระดาษ<br>
    ประจำวันที่ ${dateThai}
    <div class="report-subtitle">(ทุกเกรด${custLabel}${locLabel}${statusLabel})</div>
  `;

  $('stockBody').innerHTML = '<p style="text-align:center;color:#94a3b8;padding:20px">กำลังโหลด...</p>';

  try {
    const normalizedGrades = stockSelectedGrades.map(g => normalizeGrade(g));

    // ✅ ส่ง p_roll_status เป็น jsonb
    // ถ้าไม่ได้เลือกอะไร → ส่ง null (ให้ RPC ใช้ default full+scrap+waiting)
    // ถ้าเลือก → ส่ง array jsonb
    const rollStatusParam = stockSelectedStatuses.length > 0
      ? stockSelectedStatuses
      : null;

    const { data, error } = await supabase.rpc('get_stock_matrix', {
      p_stock_date: stockDate,
      p_grades: normalizedGrades.length > 0 ? normalizedGrades : null,
      p_customers: stockSelectedCustomers.length > 0 ? stockSelectedCustomers : null,
      p_locations: stockSelectedLocs.length > 0 ? stockSelectedLocs : null,
      p_roll_status: rollStatusParam
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
      if (!cells[k]) cells[k] = { full: 0, scrap: 0, waiting: 0, kgs: 0 };
      cells[k].full    += Number(r.full_count)    || 0;
      cells[k].scrap   += Number(r.scrap_count)   || 0;
      cells[k].waiting += Number(r.waiting_count) || 0;
      cells[k].kgs     += Number(r.total_kgs)     || 0;

      if (!rowTotals[rk]) rowTotals[rk] = { full: 0, scrap: 0, waiting: 0, kgs: 0 };
      rowTotals[rk].full    += Number(r.full_count)    || 0;
      rowTotals[rk].scrap   += Number(r.scrap_count)   || 0;
      rowTotals[rk].waiting += Number(r.waiting_count) || 0;
      rowTotals[rk].kgs     += Number(r.total_kgs)     || 0;

      if (!colTotals[size]) colTotals[size] = { full: 0, scrap: 0, waiting: 0, kgs: 0 };
      colTotals[size].full    += Number(r.full_count)    || 0;
      colTotals[size].scrap   += Number(r.scrap_count)   || 0;
      colTotals[size].waiting += Number(r.waiting_count) || 0;
      colTotals[size].kgs     += Number(r.total_kgs)     || 0;
    });

    const rowKeys = [...rowSet.keys()].sort();
    const colKeys = [...colSet].sort((a,b) => a - b);

    // ═══ Helper: สร้าง text ของ cell ปกติ (เต็ม+เศษ·รอกรอ) ═══
    function buildCellText(v) {
      const parts = [];
      if (v.full > 0)    parts.push(`${v.full}`);
      if (v.scrap > 0)   parts.push(`+${v.scrap}`);
      if (v.waiting > 0) parts.push(`·${v.waiting}`);
      if (!parts.length) return '';
      // ถ้ามี full ตัวแรก ไม่ต้องมี + นำหน้า
      return parts.join('').replace(/^\+/, '');
    }

    // ═══ Helper: สร้าง text ของ Total (ผลรวมล้วน) ═══
    function buildTotalText(v) {
      const total = (v.full || 0) + (v.scrap || 0) + (v.waiting || 0);
      return total > 0 ? `${total}` : '';
    }

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
        if (!v || (v.full === 0 && v.scrap === 0 && v.waiting === 0)) {
          html += '<td class="empty">-</td>';
        } else {
          const cellTxt = buildCellText(v);
          html += `<td class="clickable" onclick="openStockDetail('${esc(rk)}', ${s})">
            <div class="cell-content">
              <div class="cell-main">${cellTxt}</div>
            </div>
          </td>`;
        }
      });
      const rt = rowTotals[rk];
      html += `<td class="total-col">${buildTotalText(rt)}</td>`;
      html += '</tr>';
    });

    html += '<tr class="total-row"><td class="grade-col">Total</td>';
    colKeys.forEach(s => {
      const ct = colTotals[s];
      html += `<td>${buildCellText(ct)}</td>`;
    });
    const grand = { full: 0, scrap: 0, waiting: 0 };
    Object.values(colTotals).forEach(ct => {
      grand.full    += ct.full;
      grand.scrap   += ct.scrap;
      grand.waiting += ct.waiting;
    });
    html += `<td class="total-col">${buildTotalText(grand)}</td>`;
    html += '</tr></tbody></table></div>';

    html += `<div class="report-foot">
      แสดง (✅ เต็ม + ♻️ เศษ + ⏳ รอกรอ) · คลิก Cell เพื่อดู SN · วันที่: ${dateThai}
    </div>`;

    $('stockBody').innerHTML = html;
  } catch (err) {
    console.error('renderStockMatrix error:', err);
    $('stockBody').innerHTML = `<div class="msg err">เกิดข้อผิดพลาด: ${esc(err.message)}</div>`;
  }
}

// ═══════════════════════════════════════════════════════════════
// STOCK DETAIL MODAL
// ═══════════════════════════════════════════════════════════════
async function openStockDetail(gradegram, size) {
  const stockDate = $('stockDate')?.value;
  if (!stockDate) return;

  const { grade } = parseGradegram(gradegram);

  // ✅ Title ฟอนต์ใหญ่ + subtitle
  $('stockDetailTitle').innerHTML = `
    ${esc(gradegram)} · Size ${size}
    <span class="stock-detail-sub">(วันที่ ${stockDate})</span>
  `;
  openModal('modalStockDetail');
  $('stockDetailBody').innerHTML = '<p style="text-align:center;color:#94a3b8;padding:20px">กำลังโหลด...</p>';

  try {
    // ✅ ส่ง p_roll_status ตาม filter ที่เลือก (ถ้าไม่มี → null = full+scrap+waiting)
    const rollStatusParam = stockSelectedStatuses.length > 0
      ? stockSelectedStatuses
      : null;

    const { data, error } = await supabase.rpc('get_stock_detail', {
      p_stock_date: stockDate,
      p_grade: grade,
      p_width: size,
      p_roll_status: rollStatusParam
    });
    if (error) throw error;

    const rows = data || [];
    if (!rows.length) {
      $('stockDetailBody').innerHTML = '<p style="text-align:center;color:#94a3b8;padding:20px">ไม่พบรายละเอียด</p>';
      return;
    }

    const fullCount    = rows.filter(r => r.roll_status === 'full').length;
    const scrapCount   = rows.filter(r => r.roll_status === 'scrap').length;
    const waitingCount = rows.filter(r => r.roll_status === 'waiting').length;
    const totalKgs     = rows.reduce((s, r) => s + (Number(r.kgs) || 0), 0);

    let html = `<div class="msg info" style="margin-bottom:12px">
      📦 ทั้งหมด ${rows.length} ม้วน ·
      <b style="color:#166534">เต็ม ${fullCount}</b> ·
      <b style="color:#d97706">เศษ ${scrapCount}</b> ·
      <b style="color:#0369a1">รอกรอ ${waitingCount}</b> ·
      <b>${totalKgs.toFixed(2)} kg</b>
    </div>`;

    html += '<div style="max-height:550px;overflow:auto"><table><thead><tr>';
    html += '<th>#</th><th>SN</th><th>Diameter</th><th>Kgs</th><th>Meter</th>';
    html += '<th>Supplier</th><th>QLT</th><th>Customer</th><th>Loc</th><th>สถานะ</th>';
    html += '</tr></thead><tbody>';

    rows.forEach((r, i) => {
      const statusMap = {
        full:    { cls: 'full-row',    txt: '✅ เต็ม' },
        scrap:   { cls: 'scrap-row',   txt: '♻️ เศษ' },
        waiting: { cls: 'waiting-row', txt: '⏳ รอกรอ' }
      };
      const st = statusMap[r.roll_status] || { cls: '', txt: r.roll_status };
      const custTxt = r.is_customer_roll ? `👤 ${esc(r.customer)}` : esc(r.customer) || '-';

      html += `<tr class="${st.cls}">
        <td>${i+1}</td>
        <td><b>${esc(r.sn)}</b></td>
        <td>${Number(r.dimeter).toFixed(2)}</td>
        <td>${Number(r.kgs).toFixed(2)}</td>
        <td>${Number(r.meter || 0).toFixed(0)}</td>
        <td>${esc(r.supplier) || '-'}</td>
        <td>${esc(r.qlt) || '-'}</td>
        <td>${custTxt}</td>
        <td>${esc(r.loc) || '-'}</td>
        <td>${st.txt}</td>
      </tr>`;
    });

    html += '</tbody></table></div>';
    $('stockDetailBody').innerHTML = html;
  } catch (err) {
    $('stockDetailBody').innerHTML = `<div class="msg err">${esc(err.message)}</div>`;
  }
}

// ═══════════════════════════════════════════════════════════════
// IMPORT STOCK
// ═══════════════════════════════════════════════════════════════
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
  closeModal('modalStockImport');

  const stockDate = $('stockImportDate')?.value;
  if (!stockDate) { alert('กรุณาเลือกวันที่'); ev.target.value = ''; return; }

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      showProgress('stockProgress', 0, 1, 'กำลังอ่านไฟล์...');
      const wb = XLSX.read(e.target.result, { type: 'array' });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      showProgress('stockProgress', 0, rows.length, `อ่านได้ ${rows.length} แถว กำลังเตรียมข้อมูล...`);

      const payload = rows.map(row => ({
        grade:           normalizeGrade(row['grade'] || ''),
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
      showSuccessModal(`Import Stock สำเร็จ ${data.inserted} แถว · วันที่ ${stockDate}`);

      $('stockDate').value = stockDate;
      await loadStockCustomers();
      await loadStockLocs();
      await renderStockMatrix();
    } catch (ex) {
      hideProgress('stockProgress');
      showMsg('stockImportMsg', 'อ่านไฟล์ไม่สำเร็จ: ' + ex.message, 'err');
    }
  };
  reader.readAsArrayBuffer(f);
  ev.target.value = '';
}
