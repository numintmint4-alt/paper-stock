// ═══════════════════════════════════════════════════════════════
// STOCK V7 — alert.js (Flat Table + Filter แบบ Gradegrams)
// ═══════════════════════════════════════════════════════════════

let alertSelectedGrades = [];
let alertAllGrades = [];
let alertCache = [];
let alertSupplierCache = [];

// ✅ Alert Filter (แบบ Gradegrams)
let alertSelectedFilters = ['all'];
const ALERT_ALL_FILTERS = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'lt0', label: '🔴 ขาด (< 0)' },
  { value: 'eq0', label: '🟡 พอดี (= 0)' },
  { value: 'gt0', label: '🟢 เกิน (> 0)' }
];

const ALERT_LS_KEY = 'stockv7_alert_inputs';

// ================= INIT =================
async function initAlertTab() {
  const today = toISODate(new Date());
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  // ✅ วันที่วิเคราะห์ = today
  if ($('alertDate') && !$('alertDate').value) $('alertDate').value = today;
  if ($('alertStockDate') && !$('alertStockDate').value) $('alertStockDate').value = toISODate(yesterday);
  if ($('alertReceiveDate') && !$('alertReceiveDate').value) $('alertReceiveDate').value = today;

  await loadAlertSuppliers();
  await loadSnapshotMonths();
  await loadAlertGradeFilter();
  loadAlertFilter();
  await renderAlert();
}

// ================= SUPPLIERS =================
async function loadAlertSuppliers() {
  try {
    const { data, error } = await supabase
      .from('paper_suppliers')
      .select('code')
      .eq('is_active', true)
      .order('code');
    if (error) throw error;
    alertSupplierCache = (data || []).map(s => s.code);
  } catch (e) {
    console.warn('loadAlertSuppliers:', e);
    alertSupplierCache = ['EKP', 'MKP', 'SCK'];
  }
}

// ================= SNAPSHOT MONTHS =================
async function loadSnapshotMonths() {
  try {
    const { data, error } = await supabase
      .from('stock_level_snapshots')
      .select('months')
      .order('created_at', { ascending: false });
    if (error) throw error;

    const set = new Set();
    (data || []).forEach(row => {
      (row.months || []).forEach(m => set.add(m));
    });
    const months = [...set].sort().reverse();

    if ($('alertSnapshotMonth') && !$('alertSnapshotMonth').value) {
      $('alertSnapshotMonth').value = months[0] || '';
    }
  } catch (e) {
    console.warn('loadSnapshotMonths:', e);
  }
}

// ================= GRADE FILTER =================
async function loadAlertGradeFilter() {
  alertAllGrades = [...new Set(
    masterCache.map(m => normalizeGrade(m.grade) + m.gram)
  )].sort();
  renderAlertGradeList();
  updateAlertGradeLabel();
  _attachAlertDropdown('alertGradeFilterBtn', 'alertGradeDropdown', 'alertGradeFilterBox', 'alertGrade');
}

function renderAlertGradeList() {
  const list = $('alertGradeList');
  if (!list) return;
  if (!alertAllGrades.length) {
    list.innerHTML = '<div style="padding:10px;text-align:center;color:#94a3b8;font-size:13px">ไม่มีข้อมูล</div>';
    return;
  }
  list.innerHTML = alertAllGrades.map(g => {
    const checked = alertSelectedGrades.includes(g);
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
        if (!alertSelectedGrades.includes(grade)) alertSelectedGrades.push(grade);
      } else {
        alertSelectedGrades = alertSelectedGrades.filter(g => g !== grade);
      }
      el.classList.toggle('checked', cb.checked);
      updateAlertGradeLabel();
    });
  });
}

function updateAlertGradeLabel() {
  const label = $('alertGradeFilterLabel');
  if (!label) return;
  if (alertSelectedGrades.length === 0) {
    label.textContent = 'ทั้งหมด'; label.style.color = '#1e293b';
  } else if (alertSelectedGrades.length === 1) {
    label.textContent = alertSelectedGrades[0]; label.style.color = '#1e40af';
  } else {
    label.textContent = `เลือก ${alertSelectedGrades.length} เกรด`; label.style.color = '#1e40af';
  }
}
function selectAllAlertGrades() {
  alertSelectedGrades = [...alertAllGrades];
  renderAlertGradeList(); updateAlertGradeLabel();
}
function clearAllAlertGrades() {
  alertSelectedGrades = [];
  renderAlertGradeList(); updateAlertGradeLabel();
}

// ================= ALERT FILTER (แบบ Gradegrams) =================
function loadAlertFilter() {
  renderAlertFilterList();
  updateAlertFilterLabel();
  _attachAlertDropdown('alertFilterBtn', 'alertFilterDropdown', 'alertFilterBox', 'alertFilter');
}

function renderAlertFilterList() {
  const list = $('alertFilterList');
  if (!list) return;
  list.innerHTML = ALERT_ALL_FILTERS.map(f => {
    const checked = alertSelectedFilters.includes(f.value);
    return `<label class="item ${checked ? 'checked' : ''}" data-filter="${f.value}">
      <input type="checkbox" ${checked ? 'checked' : ''}>
      <span>${f.label}</span>
    </label>`;
  }).join('');
  list.querySelectorAll('.item').forEach(el => {
    const cb = el.querySelector('input[type="checkbox"]');
    cb.addEventListener('change', () => {
      const val = el.dataset.filter;
      if (cb.checked) {
        if (!alertSelectedFilters.includes(val)) alertSelectedFilters.push(val);
      } else {
        alertSelectedFilters = alertSelectedFilters.filter(x => x !== val);
      }
      el.classList.toggle('checked', cb.checked);
      updateAlertFilterLabel();
    });
  });
}

function updateAlertFilterLabel() {
  const label = $('alertFilterLabel');
  if (!label) return;
  if (alertSelectedFilters.length === 0 || alertSelectedFilters.includes('all')) {
    label.textContent = 'ทั้งหมด'; label.style.color = '#1e293b';
  } else if (alertSelectedFilters.length === 1) {
    const f = ALERT_ALL_FILTERS.find(x => x.value === alertSelectedFilters[0]);
    label.textContent = f ? f.label : alertSelectedFilters[0];
    label.style.color = '#1e40af';
  } else {
    label.textContent = `เลือก ${alertSelectedFilters.length} เงื่อนไข`;
    label.style.color = '#1e40af';
  }
}
function selectAllAlertFilters() {
  alertSelectedFilters = ['all'];
  renderAlertFilterList(); updateAlertFilterLabel();
}
function clearAllAlertFilters() {
  alertSelectedFilters = [];
  renderAlertFilterList(); updateAlertFilterLabel();
}

// ================= DROPDOWN HELPER =================
function _attachAlertDropdown(btnId, dropdownId, boxId, docKey) {
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

// ================= LOCAL STORAGE =================
function alertLS_Key(gradegram, size) {
  return `${gradegram}|${size}`;
}
function loadAlertInputs() {
  try {
    const raw = localStorage.getItem(ALERT_LS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}
function saveAlertInput(key, field, value) {
  const data = loadAlertInputs();
  if (!data[key]) data[key] = {};
  data[key][field] = value;
  localStorage.setItem(ALERT_LS_KEY, JSON.stringify(data));
}
function getAlertInput(key) {
  const data = loadAlertInputs();
  return data[key] || {};
}

// ================= RENDER ALERT (Flat Table) =================
async function renderAlert() {
  const snapshotMonth = $('alertSnapshotMonth')?.value;
  const stockDate     = $('alertStockDate')?.value;
  const receiveDate   = $('alertReceiveDate')?.value;

  if (!snapshotMonth || !stockDate || !receiveDate) {
    alert('กรุณาเลือก Stock Level / Stock / Receive ให้ครบ');
    return;
  }

  const gradeLabel = alertSelectedGrades.length > 0
    ? ` · เกรด: ${alertSelectedGrades.join(', ')}` : '';

  $('alertReportTitle').innerHTML = `
    🚨 แจ้งเตือนสั่งซื้อ (Roll Alert)<br>
    Stock Level: ${snapshotMonth}
    <div class="report-subtitle">(Stock ${thaiDateFull(stockDate)} · Receive ${thaiDateFull(receiveDate)}${gradeLabel})</div>
  `;
  $('alertBody').innerHTML = '<p style="text-align:center;color:#94a3b8;padding:20px">กำลังวิเคราะห์...</p>';

  try {
    const { data, error } = await supabase.rpc('get_alert_matrix', {
      p_snapshot_month: snapshotMonth,
      p_stock_date:     stockDate,
      p_receive_date:   receiveDate,
    });
    if (error) throw error;

    let result = data || [];

    // เพิ่ม gradegram
    result = result.map(r => {
      const m = masterCache.find(x =>
        normalizeGrade(x.grade) === normalizeGrade(r.grade) &&
        x.size === r.size
      );
      return {
        ...r,
        gradegram: m ? (normalizeGrade(m.grade) + m.gram) : r.grade
      };
    });

    // Filter grade
    if (alertSelectedGrades.length > 0) {
      result = result.filter(r => alertSelectedGrades.includes(r.gradegram));
    }

    // ✅ Filter Alert
    let display = result;
    if (!alertSelectedFilters.includes('all') && alertSelectedFilters.length > 0) {
      display = result.filter(r => {
        const a = Number(r.alert) || 0;
        if (alertSelectedFilters.includes('lt0') && a < 0) return true;
        if (alertSelectedFilters.includes('eq0') && a === 0) return true;
        if (alertSelectedFilters.includes('gt0') && a > 0) return true;
        return false;
      });
    }

    // Summary
    const totalShortage = result.filter(r => r.alert < 0).length;
    const totalOK       = result.filter(r => r.alert === 0).length;
    const totalOver     = result.filter(r => r.alert > 0).length;

    let html = `<div class="alert-summary">
      <div class="item red">🔴 ขาด: ${totalShortage} รายการ</div>
      <div class="item yellow">🟡 พอดี: ${totalOK} รายการ</div>
      <div class="item green">🟢 เกิน: ${totalOver} รายการ</div>
    </div>`;

    if (!display.length) {
      html += '<p style="text-align:center;color:#94a3b8;padding:30px">ไม่มีรายการ 🎉</p>';
      $('alertBody').innerHTML = html;
      alertCache = [];
      return;
    }

    // เรียง
    const sorted = [...display].sort((a, b) => {
      if (a.gradegram !== b.gradegram) return a.gradegram.localeCompare(b.gradegram);
      return a.size - b.size;
    });

    // ============ FLAT TABLE ============
    html += '<div class="report-wrap alert-scroll"><table class="alert-flat-table"><thead><tr>';
    html += '<th>Gradegrams</th><th>Size</th><th>Snapshot</th><th>Stock</th><th>Receive</th>';
    html += '<th>Alert</th><th>สถานะ</th><th>สั่งซื้อ</th><th>Sup.</th><th>หมายเหตุ</th>';
    html += '</tr></thead><tbody>';

    let grandShortage = 0;

    sorted.forEach(r => {
      const a = Number(r.alert) || 0;
      let rowCls, statusTxt;
      if (a < 0)      { rowCls = 'row-red';    statusTxt = `🔴 ขาด ${Math.ceil(Math.abs(a))}`;  grandShortage += Math.abs(a); }
      else if (a === 0) { rowCls = 'row-yellow'; statusTxt = '🟡 พอดี'; }
      else             { rowCls = 'row-green';  statusTxt = `🟢 เกิน ${Math.floor(a)}`; }

      const lsKey = alertLS_Key(r.gradegram, r.size);
      const lsVal = getAlertInput(lsKey);

      const supOptions = alertSupplierCache.map(code =>
        `<option value="${esc(code)}" ${lsVal.sup === code ? 'selected' : ''}>${esc(code)}</option>`
      ).join('');

      html += `<tr class="${rowCls}">`;
      html += `<td class="grade-col clickable" onclick="openAlertDetail('${esc(r.gradegram)}', ${r.size})">${esc(r.gradegram)}</td>`;
      html += `<td class="clickable" onclick="openAlertDetail('${esc(r.gradegram)}', ${r.size})">${r.size}</td>`;
      html += `<td>${r.snapshot}</td>`;
      html += `<td>${Number(r.stock).toFixed(2)}</td>`;
      html += `<td>${r.receive}</td>`;
      html += `<td class="alert-cell"><b>${a > 0 ? '+' + a : a}</b></td>`;
      html += `<td class="status-cell">${statusTxt}</td>`;
      html += `<td><input type="number" class="alert-input-qty" placeholder="-" value="${lsVal.qty || ''}" onchange="onAlertInput('${esc(r.gradegram)}', ${r.size}, 'qty', this.value)"></td>`;
      html += `<td><select class="alert-input-sup" onchange="onAlertInput('${esc(r.gradegram)}', ${r.size}, 'sup', this.value)">
        <option value="">-- Sup --</option>${supOptions}</select></td>`;
      html += `<td><input type="text" class="alert-input-note" placeholder="-" value="${esc(lsVal.note || '')}" onchange="onAlertInput('${esc(r.gradegram)}', ${r.size}, 'note', this.value)"></td>`;
      html += '</tr>';
    });

    html += `<tr class="total-row">
      <td colspan="7" style="text-align:right;font-weight:700">จำนวนรวม (ม้วน)</td>
      <td style="font-weight:700;color:#dc2626;font-size:15px">${grandShortage > 0 ? grandShortage : '-'}</td>
      <td colspan="2"></td>
    </tr>`;

    html += '</tbody></table></div>';

    html += `<div class="report-foot">
      Stock Level − (Stock + Receive) = Alert · คลิก Gradegrams/Size เพื่อดูรายละเอียด · รวมต้องสั่ง ${grandShortage} ม้วน
    </div>`;

    $('alertBody').innerHTML = html;
    alertCache = display;
  } catch (err) {
    console.error('renderAlert error:', err);
    $('alertBody').innerHTML = `<div class="msg err">เกิดข้อผิดพลาด: ${esc(err.message)}</div>`;
  }
}

// ================= INPUT =================
function onAlertInput(gradegram, size, field, value) {
  const key = alertLS_Key(gradegram, size);
  saveAlertInput(key, field, value);
}

// ================= DETAIL MODAL =================
async function openAlertDetail(gradegram, size) {
  const snapshotMonth = $('alertSnapshotMonth')?.value;
  const stockDate     = $('alertStockDate')?.value;
  const receiveDate   = $('alertReceiveDate')?.value;
  const { grade } = parseGradegram(gradegram);

  $('alertDetailTitle').innerHTML = `📊 ${esc(gradegram)} · Size ${size}`;
  openModal('modalAlertDetail');
  $('alertDetailBody').innerHTML = '<p style="text-align:center;color:#94a3b8;padding:20px">กำลังโหลด...</p>';

  try {
    const { data } = await supabase.rpc('get_alert_matrix', {
      p_snapshot_month: snapshotMonth,
      p_stock_date:     stockDate,
      p_receive_date:   receiveDate,
    });

    const row = (data || []).find(r =>
      normalizeGrade(r.grade) === normalizeGrade(grade) && r.size === size
    );

    if (!row) {
      $('alertDetailBody').innerHTML = '<div class="msg err">ไม่พบข้อมูล</div>';
      return;
    }

    const a = Number(row.alert) || 0;
    let statusHtml;
    if (a < 0)      statusHtml = `<span style="color:#dc2626;font-weight:700">🔴 ขาด ${Math.ceil(Math.abs(a))} ม้วน (${a})</span>`;
    else if (a === 0) statusHtml = `<span style="color:#b45309;font-weight:700">🟡 พอดี</span>`;
    else             statusHtml = `<span style="color:#166534;font-weight:700">🟢 เกิน ${Math.floor(a)} ม้วน (+${a})</span>`;

    let html = `
      <div class="msg info" style="margin-bottom:14px">
        <b>📊 สรุปการคำนวณ</b><br>
        Stock Level (${snapshotMonth}) = <b>${row.snapshot}</b><br>
        Stock (${stockDate}) = <b>${row.stock}</b><br>
        Receive (${receiveDate}) = <b>${row.receive}</b><br>
        <hr style="margin:8px 0;border:none;border-top:1px solid #cbd5e1">
        Alert = ${row.snapshot} − (${row.stock} + ${row.receive}) = <b>${a}</b><br>
        สถานะ: ${statusHtml}
      </div>
    `;

    const { data: receives } = await supabase
      .from('po_receive')
      .select('po_no, supplier, quantity, kg_total, remark')
      .eq('po_date', receiveDate)
      .eq('size', size);

    html += `<h4>📥 Receive (${receiveDate})</h4>`;
    if (receives && receives.length) {
      html += '<table><thead><tr><th>PO No.</th><th>Supplier</th><th>Qty</th><th>KG</th><th>หมายเหตุ</th></tr></thead><tbody>';
      receives.forEach(r => {
        html += `<tr>
          <td>${esc(r.po_no)}</td>
          <td>${esc(r.supplier) || '-'}</td>
          <td style="text-align:right">${r.quantity}</td>
          <td style="text-align:right">${Number(r.kg_total || 0).toFixed(2)}</td>
          <td>${esc(r.remark) || '-'}</td>
        </tr>`;
      });
      html += '</tbody></table>';
    } else {
      html += '<p style="color:#94a3b8">ไม่มีรายการรับเข้า</p>';
    }

    const { data: stocks } = await supabase
      .from('stock_balance')
      .select('sn, dimeter, kgs, supplier, customer, is_customer_roll, roll_status')
      .eq('stock_date', stockDate)
      .eq('grade', grade)
      .eq('width', size);

    html += `<h4 style="margin-top:16px">📦 Stock (${stockDate})</h4>`;
    if (stocks && stocks.length) {
      html += '<table><thead><tr><th>SN</th><th>Diameter</th><th>KG</th><th>Supplier</th><th>Customer</th><th>Status</th></tr></thead><tbody>';
      stocks.forEach(s => {
        const stTxt = { full: '✅ เต็ม', scrap: '♻️ เศษ', waiting: '⏳ รอกรอ' }[s.roll_status] || s.roll_status;
        html += `<tr>
          <td>${esc(s.sn)}</td>
          <td>${Number(s.dimeter || 0).toFixed(2)}</td>
          <td>${Number(s.kgs || 0).toFixed(2)}</td>
          <td>${esc(s.supplier) || '-'}</td>
          <td>${s.is_customer_roll ? '👤 ' + esc(s.customer) : '-'}</td>
          <td>${stTxt}</td>
        </tr>`;
      });
      html += '</tbody></table>';
    } else {
      html += '<p style="color:#94a3b8">ไม่มีม้วนในสต็อก</p>';
    }

    $('alertDetailBody').innerHTML = html;
  } catch (err) {
    $('alertDetailBody').innerHTML = `<div class="msg err">${esc(err.message)}</div>`;
  }
}

// ================= EXPORT =================
function exportAlert() {
  if (!alertCache || !alertCache.length) return alert('ไม่มีข้อมูล');
  const data = alertCache.map(r => ({
    Gradegrams: r.gradegram,
    Size: r.size,
    Snapshot: r.snapshot,
    Stock: r.stock,
    Receive: r.receive,
    Alert: r.alert,
    สถานะ: r.alert < 0 ? `ขาด ${Math.ceil(Math.abs(r.alert))}` : (r.alert === 0 ? 'พอดี' : `เกิน ${Math.floor(r.alert)}`)
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Alert');
  XLSX.writeFile(wb, `alert_${new Date().toISOString().slice(0,10)}.xlsx`);
}
