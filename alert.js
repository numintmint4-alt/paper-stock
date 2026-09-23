// ═══════════════════════════════════════════════════════════════
// STOCK V8 — alert.js (Flat Table + Filter + PO + Lock Date + FSC)
// ═══════════════════════════════════════════════════════════════

let alertSelectedGrades = [];
let alertAllGrades = [];
let alertCache = [];
let alertSupplierCache = [];

// ✅ Alert Filter
let alertSelectedFilters = ['all'];
const ALERT_ALL_FILTERS = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'lt0', label: '🔴 ขาด (< 0)' },
  { value: 'eq0', label: '🟡 พอดี (= 0)' },
  { value: 'gt0', label: '🟢 เกิน (> 0)' }
];

// ✅ Customer Roll (ม้วนลูกค้า)
const ALERT_CUSTOMER_ROLLS = [
  { value: 'normal',   label: 'ปกติ' },
  { value: 'pump_f',   label: 'ปั้ม F' },
  { value: 'pump_bt',  label: 'ปั้ม BT' },
  { value: 'pump_ktp', label: 'ปั้ม KTP' }
];

// ✅ Quality B (คุณภาพ B)
const ALERT_QUALITY_B = [
  { value: 'normal', label: 'ปกติ' },
  { value: 'nc',     label: 'NC' }
];

const ALERT_LS_KEY = 'stockv8_alert_inputs';
const ALERT_PO_FLAG_KEY = 'stockv8_alert_po_created';
const ALERT_RECEIVE_DATES_KEY = 'stockv8_alert_receive_dates';

// ✅ วันที่รับสินค้า (array ของ string YYYY-MM-DD)
let alertReceiveDates = [];

// ✅ เก็บ items รอไว้ก่อนยืนยัน PO
let _pendingPOItems = [];

// ================= INIT =================
async function initAlertTab() {
  const today = toISODate(new Date());

  // ✅ Lock วันที่วิเคราะห์ = today (disable)
  const alertDateEl = $('alertDate');
  if (alertDateEl) {
    alertDateEl.value = today;
    alertDateEl.disabled = true;
    alertDateEl.style.background = '#f1f5f9';
    alertDateEl.style.cursor = 'not-allowed';
  }

  // default stock = เมื่อวาน
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if ($('alertStockDate') && !$('alertStockDate').value) $('alertStockDate').value = toISODate(yesterday);
  if ($('alertReceiveDate') && !$('alertReceiveDate').value) $('alertReceiveDate').value = today;

  await loadAlertSuppliers();
  await loadSnapshotMonths();
  await loadAlertGradeFilter();
  loadAlertFilter();
  initAlertReceiveDates();  // ✅ เพิ่มบรรทัดนี้
  // ✅ ไม่ต้องเช็ค hasPOEdited() ที่นี่ — ให้ renderAlert() จัดการ
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

// ================= ALERT FILTER =================
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

// ✅ แก้จุดที่ 1: mark เฉพาะ field ที่กำหนด + ต้องมี PO flag อยู่แล้ว
function saveAlertInput(key, field, value) {
  const data = loadAlertInputs();
  if (!data[key]) data[key] = {};
  data[key][field] = value;
  localStorage.setItem(ALERT_LS_KEY, JSON.stringify(data));

  // ✅ Mark ว่ามีการแก้ไข เฉพาะ field ที่กำหนด + ต้องมี PO flag อยู่แล้ว
  const MARK_FIELDS = ['qty', 'sup', 'customer_roll', 'quality_b', 'note'];
  if (MARK_FIELDS.includes(field) && hasPOCreated()) {
    markAlertPOEdited();
  }
}

function getAlertInput(key) {
  const data = loadAlertInputs();
  return data[key] || {};
}

// ================= PO FLAG =================
function loadPOFlag() {
  try {
    const raw = localStorage.getItem(ALERT_PO_FLAG_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}
function savePOFlag(data) {
  localStorage.setItem(ALERT_PO_FLAG_KEY, JSON.stringify(data));
}

function markAlertPOCreated(refKey) {
  const flags = loadPOFlag();
  flags[refKey] = { created_at: new Date().toISOString(), edited: false };
  savePOFlag(flags);
}

// ✅ แก้จุดที่ 2: เพิ่ม hasPOCreated()
function hasPOCreated() {
  const flags = loadPOFlag();
  return Object.values(flags).some(f => f && f.created_at);
}

function markAlertPOEdited() {
  const flags = loadPOFlag();
  let changed = false;
  Object.keys(flags).forEach(k => {
    if (flags[k] && flags[k].created_at && !flags[k].edited) {
      flags[k].edited = true;
      flags[k].edited_at = new Date().toISOString();
      changed = true;
    }
  });
  if (changed) savePOFlag(flags);
}

function hasPOEdited() {
  const flags = loadPOFlag();
  return Object.values(flags).some(f => f.edited === true);
}

// ✅ แก้จุดที่ 2: เพิ่ม clearPOFlags() (เรียกหลังยืนยันสร้าง PO สำเร็จถ้าต้องการรีเซ็ต)
function clearPOFlags() {
  localStorage.removeItem(ALERT_PO_FLAG_KEY);
}

// ================= วันที่รับสินค้า =================

// ✅ คำนวณวันถัดไป ไม่รวมอาทิตย์
// ศุกร์→เสาร์, เสาร์→จันทร์, อาทิตย์→จันทร์
function getNextWorkingDay(baseDate = new Date()) {
  const d = new Date(baseDate);
  d.setDate(d.getDate() + 1);
  // ถ้าเป็นอาทิตย์ (0) → เลื่อนไปจันทร์
  if (d.getDay() === 0) d.setDate(d.getDate() + 1);
  return toISODate(d);
}

// ✅ โหลดวันที่จาก localStorage
function loadAlertReceiveDates() {
  try {
    const raw = localStorage.getItem(ALERT_RECEIVE_DATES_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

// ✅ บันทึกวันที่
function saveAlertReceiveDates() {
  localStorage.setItem(ALERT_RECEIVE_DATES_KEY, JSON.stringify(alertReceiveDates));
}

// ✅ เพิ่มวันที่ใหม่
function addAlertReceiveDate() {
  const next = getNextWorkingDay();
  // ✅ default = วันถัดไป (ถ้ามีอยู่แล้ว +1 วัน จากวันสุดท้าย)
  let defaultDate = next;
  if (alertReceiveDates.length > 0) {
    const last = alertReceiveDates[alertReceiveDates.length - 1];
    const d = new Date(last);
    d.setDate(d.getDate() + 1);
    if (d.getDay() === 0) d.setDate(d.getDate() + 1);
    defaultDate = toISODate(d);
  }
  alertReceiveDates.push(defaultDate);
  saveAlertReceiveDates();
  renderAlertReceiveDates();
}

// ✅ ลบวันที่
function removeAlertReceiveDate(idx) {
  alertReceiveDates.splice(idx, 1);
  saveAlertReceiveDates();
  renderAlertReceiveDates();
}

// ✅ แก้ไขวันที่
function onAlertReceiveDateChange(idx, value) {
  if (!value) return;
  alertReceiveDates[idx] = value;
  saveAlertReceiveDates();
}

// ✅ Render ช่องวันที่ + ปุ่ม
function renderAlertReceiveDates() {
  const box = $('alertReceiveDateBox');
  if (!box) return;

  let html = '<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">';
  html += '<span style="font-size:13px;color:#475569;font-weight:600">📅 วันที่รับสินค้า:</span>';

  if (alertReceiveDates.length === 0) {
    html += '<span style="font-size:12px;color:#94a3b8">(ยังไม่ได้กำหนด)</span>';
  } else {
    alertReceiveDates.forEach((d, i) => {
      // ✅ format DD/MM/YYYY
      const dObj = new Date(d);
      const dd = String(dObj.getDate()).padStart(2, '0');
      const mm = String(dObj.getMonth() + 1).padStart(2, '0');
      const yyyy = dObj.getFullYear() + 543;
      const display = `${dd}/${mm}/${yyyy}`;

      html += `<span style="display:inline-flex;align-items:center;gap:4px;background:#eff6ff;border:1px solid #2563eb;border-radius:6px;padding:4px 8px;font-size:13px">
        <input type="date" value="${d}" onchange="onAlertReceiveDateChange(${i}, this.value)" style="border:none;background:transparent;font-size:13px;color:#1e3a8a;font-weight:600;width:130px;cursor:pointer">
        <button type="button" onclick="removeAlertReceiveDate(${i})" style="background:none;border:none;color:#dc2626;cursor:pointer;font-size:14px;padding:0 2px">✕</button>
      </span>`;
    });
  }

  html += `<button type="button" onclick="addAlertReceiveDate()" class="primary" style="padding:4px 10px;font-size:12px">+ เพิ่มวันที่รับสินค้า</button>`;
  html += '</div>';

  box.innerHTML = html;
}

// ✅ โหลด + Render ตอน init
function initAlertReceiveDates() {
  alertReceiveDates = loadAlertReceiveDates();
  // ถ้ายังไม่มี → default 1 วัน = วันถัดไป
  if (alertReceiveDates.length === 0) {
    alertReceiveDates.push(getNextWorkingDay());
    saveAlertReceiveDates();
  }
  renderAlertReceiveDates();
}

// ================= HELPER: FSC =================
function isFSCGrade(gradegram) {
  if (!gradegram) return false;
  const match = String(gradegram).match(/^([A-Z]+)/);
  if (!match) return false;
  return match[1].includes('F');
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

    // Filter Alert
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
      <div id="alertReceiveDateBox" style="margin-left:auto"></div>
    </div>`;

    if (!display.length) {
      html += '<p style="text-align:center;color:#94a3b8;padding:30px">ไม่มีรายการ 🎉</p>';
      $('alertBody').innerHTML = html;
      renderAlertReceiveDates();  // ✅ render วันที่หลังจาก DOM พร้อม
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
    html += '<th>Alert</th><th>สถานะ</th><th>สั่งซื้อ</th><th>Sup.</th>';
    html += '<th>ม้วนลูกค้า</th><th>คุณภาพ B</th><th>FSC</th><th>หมายเหตุ</th>';
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

      const custOptions = ALERT_CUSTOMER_ROLLS.map(c =>
        `<option value="${c.value}" ${lsVal.customer_roll === c.value ? 'selected' : ''}>${c.label}</option>`
      ).join('');

      const qualOptions = ALERT_QUALITY_B.map(q =>
        `<option value="${q.value}" ${lsVal.quality_b === q.value ? 'selected' : ''}>${q.label}</option>`
      ).join('');

      // ✅ FSC (auto จาก grade)
      const isFSC = isFSCGrade(r.gradegram);
      const fscBadge = isFSC
        ? '<span class="badge ok" style="font-size:10px">🟢 FSC</span>'
        : '<span class="badge" style="background:#f1f5f9;color:#64748b;font-size:10px">⚪ Non-FSC</span>';

      // ✅ แก้จุดที่ 3: เพิ่ม class "filled" ถ้ามีค่า
      const clsQty   = (lsVal.qty && Number(lsVal.qty) > 0) ? ' filled' : '';
      const clsSup   = lsVal.sup ? ' filled' : '';
      const clsCust  = (lsVal.customer_roll && lsVal.customer_roll !== 'normal') ? ' filled' : '';
      const clsQual  = (lsVal.quality_b && lsVal.quality_b !== 'normal') ? ' filled' : '';
      const clsNote  = lsVal.note ? ' filled' : '';

      html += `<tr class="${rowCls}">`;
      html += `<td class="grade-col clickable" onclick="openAlertDetail('${esc(r.gradegram)}', ${r.size})">${esc(r.gradegram)}</td>`;
      html += `<td class="clickable" onclick="openAlertDetail('${esc(r.gradegram)}', ${r.size})">${r.size}</td>`;
      html += `<td>${r.snapshot}</td>`;
      html += `<td>${Number(r.stock).toFixed(2)}</td>`;
      html += `<td>${r.receive}</td>`;
      html += `<td class="alert-cell"><b>${a > 0 ? '+' + a : a}</b></td>`;
      html += `<td class="status-cell">${statusTxt}</td>`;
      html += `<td><input type="number" class="alert-input-qty${clsQty}" placeholder="-" value="${lsVal.qty || ''}" onchange="onAlertInput('${esc(r.gradegram)}', ${r.size}, 'qty', this.value, this)"></td>`;
      html += `<td><select class="alert-input-sup${clsSup}" onchange="onAlertInput('${esc(r.gradegram)}', ${r.size}, 'sup', this.value, this)">
        <option value="">-- Sup --</option>${supOptions}</select></td>`;
      html += `<td><select class="alert-input-customer${clsCust}" onchange="onAlertInput('${esc(r.gradegram)}', ${r.size}, 'customer_roll', this.value, this)">${custOptions}</select></td>`;
      html += `<td><select class="alert-input-quality${clsQual}" onchange="onAlertInput('${esc(r.gradegram)}', ${r.size}, 'quality_b', this.value, this)">${qualOptions}</select></td>`;
      html += `<td class="fsc-cell">${fscBadge}</td>`;
      html += `<td><input type="text" class="alert-input-note${clsNote}" placeholder="-" value="${esc(lsVal.note || '')}" onchange="onAlertInput('${esc(r.gradegram)}', ${r.size}, 'note', this.value, this)"></td>`;
      html += '</tr>';
    });

    html += `<tr class="total-row">
      <td colspan="7" style="text-align:right;font-weight:700">จำนวนรวม (ม้วน)</td>
      <td style="font-weight:700;color:#dc2626;font-size:15px">${grandShortage > 0 ? grandShortage : '-'}</td>
      <td colspan="5"></td>
    </tr>`;

    html += '</tbody></table></div>';

    // ✅ แก้จุดที่ 3: ตัด Export ออก + เพิ่ม Modal popup check
    html += `<div class="report-foot" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
      <div>Stock Level − (Stock + Receive) = Alert · รวมต้องสั่ง ${grandShortage} ม้วน</div>
      <div style="display:flex;gap:6px">
        <button class="primary" onclick="createPOFromAlert()">📄 สร้าง PO</button>
        <button class="danger" onclick="clearAlertInputs()">🗑 ล้างค่า</button>
        <button onclick="window.print()">🖨 พิมพ์</button>
      </div>
    </div>`;

    $('alertBody').innerHTML = html;
    renderAlertReceiveDates();  // ✅ render วันที่หลังจาก DOM พร้อม
    alertCache = display;

    // ✅ ตรวจสอบ Popup แจ้งเตือน: เฉพาะกรณี "แก้ไขหลังสร้าง PO"
    if (hasPOEdited()) {
      showPOEditedWarning();
      // รีเซ็ต edited flag หลังแสดง popup แล้ว (แสดงครั้งเดียว)
      const flags = loadPOFlag();
      Object.keys(flags).forEach(k => { if (flags[k]) flags[k].edited = false; });
      savePOFlag(flags);
    }
  } catch (err) {
    console.error('renderAlert error:', err);
    $('alertBody').innerHTML = `<div class="msg err">เกิดข้อผิดพลาด: ${esc(err.message)}</div>`;
  }
}

// ================= PO Edited Warning =================
function showPOEditedWarning() {
  let modal = document.getElementById('modalPOEditedWarning');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modalPOEditedWarning';
    modal.className = 'modal-bg';
    modal.innerHTML = `
      <div class="modal" style="max-width:480px;text-align:center">
        <div style="font-size:48px;margin-bottom:10px">⚠️</div>
        <h3 style="margin:0 0 12px;color:#dc2626">มีการแก้ไข Alert</h3>
        <p style="color:#475569;margin-bottom:20px;line-height:1.6">
          คุณได้แก้ไขข้อมูล Alert หลังจากสร้าง PO ไปแล้ว<br>
          ต้องการอัปเดต PO ให้ตรงกับ Alert ปัจจุบันหรือไม่?
        </p>
        <div style="display:flex;gap:8px;justify-content:center">
          <button onclick="dismissPOWarning()">ไม่ต้อง</button>
          <button class="primary" onclick="dismissPOWarning()">รับทราบ</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }
  modal.classList.add('show');
}

function dismissPOWarning() {
  const modal = document.getElementById('modalPOEditedWarning');
  if (modal) modal.classList.remove('show');
}

// ================= INPUT =================
// ✅ แก้จุดที่ 7: ใช้ this แทน event.target + toggle filled class ทันที
function onAlertInput(gradegram, size, field, value, el) {
  const key = alertLS_Key(gradegram, size);
  saveAlertInput(key, field, value);

  // ✅ toggle class "filled" ทันที
  if (el) {
    const isFilled = (field === 'customer_roll' || field === 'quality_b')
      ? (value && value !== 'normal')
      : (value && String(value).trim() !== '');
    el.classList.toggle('filled', !!isFilled);
  }
}

// ================= CLEAR ALL ALERT INPUTS =================
function clearAlertInputs() {
  if (!confirm('⚠️ ล้างค่าที่กรอกทั้งหมด (สั่งซื้อ / Sup. / ม้วนลูกค้า / คุณภาพ B / หมายเหตุ)?')) return;

  localStorage.removeItem(ALERT_LS_KEY);

  renderAlert();

  const msg = document.createElement('div');
  msg.className = 'msg ok';
  msg.style.cssText = 'position:fixed;top:80px;right:20px;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,.15)';
  msg.textContent = '✅ ล้างค่าทั้งหมดแล้ว';
  document.body.appendChild(msg);
  setTimeout(() => msg.remove(), 2000);
}

// ================= CREATE PO FROM ALERT =================
// ✅ แก้จุดที่ 6: เปิด Modal แทนการยืนยันทันที
async function createPOFromAlert() {
  if (!alertCache || !alertCache.length) {
    alert('ไม่มีข้อมูล Alert');
    return;
  }

  const items = [];

  for (const r of alertCache) {
    const lsKey = alertLS_Key(r.gradegram, r.size);
    const lsVal = getAlertInput(lsKey);

    if (!lsVal.qty || Number(lsVal.qty) <= 0) continue;
    if (!lsVal.sup) continue;

    items.push({
      seq: items.length + 1,
      gradegram: r.gradegram,
      size: r.size,
      gradegram_size: `${r.gradegram}-${Number(r.size).toFixed(2)}`,
      quantity: Number(lsVal.qty),
      sup: lsVal.sup,
      customer_roll: lsVal.customer_roll || 'normal',
      quality_b: lsVal.quality_b || 'normal',
      note: lsVal.note || ''
    });
  }

  if (!items.length) {
    alert('กรุณากรอกจำนวนสั่งซื้อ + Sup. อย่างน้อย 1 รายการ');
    return;
  }

  // ✅ เปิด Modal แสดงรายละเอียดก่อนยืนยัน
  _pendingPOItems = items;
  renderAlertPODetail(items);
  openModal('modalAlertPODetail');
}

// ✅ Render Modal รายละเอียดก่อนสร้าง PO
function renderAlertPODetail(items) {
  const labelCustomer = v => ALERT_CUSTOMER_ROLLS.find(c => c.value === v)?.label || 'ปกติ';
  const labelQuality  = v => ALERT_QUALITY_B.find(q => q.value === v)?.label || 'ปกติ';

  let totalQty = 0;

  // ✅ แสดงวันที่รับสินค้า (DD/MM/YYYY)
  const datesHtml = alertReceiveDates.map(d => {
    const dObj = new Date(d);
    const dd = String(dObj.getDate()).padStart(2, '0');
    const mm = String(dObj.getMonth() + 1).padStart(2, '0');
    const yyyy = dObj.getFullYear() + 543;
    return `${dd}/${mm}/${yyyy}`;
  }).join(' · ');

  let html = `
    <div class="po-detail-summary">
      <div>📦 <b>${items.length}</b> รายการ</div>
      <div>🔢 รวม <b>${items.reduce((s, i) => s + i.quantity, 0)}</b> ม้วน</div>
      <div>📅 วันที่รับสินค้า: <b style="color:#1e40af">${esc(datesHtml) || '(ยังไม่ได้กำหนด)'}</b></div>
    </div>
    <table>
      <thead><tr>
        <th style="width:50px">#</th>
        <th style="width:180px">Gradegram-Size</th>
        <th style="width:90px;text-align:center">Quantity</th>
        <th>หมายเหตุ</th>
      </tr></thead>
      <tbody>`;

  items.forEach((it, idx) => {
    totalQty += it.quantity;
    const parts = [
      labelCustomer(it.customer_roll),
      labelQuality(it.quality_b),
      it.note || ''
    ].filter(x => x && x.trim() !== '');
    const remarkCombined = parts.join(',');

    html += `<tr>
      <td style="text-align:center">${idx + 1}</td>
      <td><b>${esc(it.gradegram_size)}</b></td>
      <td style="text-align:center;font-weight:700;color:#1e40af">${it.quantity}</td>
      <td>${esc(remarkCombined)}</td>
    </tr>`;
  });

  html += `</tbody>
    <tfoot><tr style="background:#cbd5e1;font-weight:700">
      <td colspan="2" style="text-align:right">จำนวนรวม (ม้วน)</td>
      <td style="text-align:center;color:#dc2626;font-size:15px">${totalQty}</td>
      <td></td>
    </tr></tfoot>
    </table>`;

  $('alertPODetailBody').innerHTML = html;
}

// ✅ ยืนยันสร้าง PO
function confirmCreatePO() {
  if (!_pendingPOItems || !_pendingPOItems.length) return;

  if (alertReceiveDates.length === 0) {
    alert('กรุณากำหนดวันที่รับสินค้าอย่างน้อย 1 วัน');
    return;
  }

  const analyzedDate = toISODate(new Date());

  sessionStorage.setItem('alert_to_po', JSON.stringify({
    items: _pendingPOItems,
    analyzed_date: analyzedDate,
    receive_dates: [...alertReceiveDates],   // ✅ ส่งวันที่รับทั้งหมด
    ref_snapshot: $('alertSnapshotMonth')?.value,
    ref_stock: $('alertStockDate')?.value,
    ref_receive: $('alertReceiveDate')?.value
  }));

  // ✅ Mark flag ก่อนเปลี่ยน tab
  markAlertPOCreated(`ref_${Date.now()}`);

  closeModal('modalAlertPODetail');
  _pendingPOItems = [];

  // ไป Tab PO
  const poBtn = document.querySelector('.nav button[data-tab="purchase-order"]');
  if (poBtn) poBtn.click();
  else alert('ยังไม่ได้เพิ่ม Tab Purchase Order');
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
        Alert = (${row.stock} + ${row.receive}) − ${row.snapshot} = <b>${a}</b><br>
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

// ================= EXPORT (ยังเก็บไว้เผื่อเรียกจากที่อื่น) =================
function exportAlert() {
  if (!alertCache || !alertCache.length) return alert('ไม่มีข้อมูล');

  const data = alertCache.map(r => {
    const lsVal = getAlertInput(alertLS_Key(r.gradegram, r.size));
    return {
      Gradegrams: r.gradegram,
      Size: r.size,
      Snapshot: r.snapshot,
      Stock: r.stock,
      Receive: r.receive,
      Alert: r.alert,
      สถานะ: r.alert < 0 ? `ขาด ${Math.ceil(Math.abs(r.alert))}` : (r.alert === 0 ? 'พอดี' : `เกิน ${Math.floor(r.alert)}`),
      สั่งซื้อ: lsVal.qty || '',
      Sup: lsVal.sup || '',
      ม้วนลูกค้า: ALERT_CUSTOMER_ROLLS.find(c => c.value === lsVal.customer_roll)?.label || 'ปกติ',
      'คุณภาพ B': ALERT_QUALITY_B.find(q => q.value === lsVal.quality_b)?.label || 'ปกติ',
      FSC: isFSCGrade(r.gradegram) ? 'FSC' : 'Non-FSC',
      หมายเหตุ: lsVal.note || ''
    };
  });
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Alert');
  XLSX.writeFile(wb, `alert_${new Date().toISOString().slice(0,10)}.xlsx`);
}
