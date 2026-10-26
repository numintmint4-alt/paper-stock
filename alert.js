// ═══════════════════════════════════════════════════════════════
//  STOCK V10.1 — alert.js
//  V.10.9 Fix: Matrix formatting (toFixed(2)) & Dedupe
//  V.10.10 Fix: เปลี่ยนหัวข้อ Alert เป็น "Stock Alert"
//  V.10.11 Fix: เปลี่ยนช่องวันที่เป็น Text + เพิ่มตัวแปลง DD/MM/YYYY ↔ YYYY-MM-DD
//  V.10.12 Fix: เปลี่ยนกลับเป็น type="date" + บังคับเลือกเดือนล่าสุดใน loadSnapshotMonths
//  V.10.13 Fix: Auto-analyze on load + on month change
//  V.10.14 Fix: Default ไม่มีวันที่รับสินค้า (ว่างไว้) + แจ้งเตือนให้กดเพิ่มวัน
//  V.10.15 Fix: applyCalculatedDates() ไม่เซ็ต alertReceiveDate (ปล่อยว่าง)
//  V.10.16 Fix: renderAlert() แสดงแถบวันที่ + ปุ่ม "+ เพิ่มวัน" แม้ยังไม่มีวันที่
//  V.10.17 Fix: Auto-load Alert History on init + default date to today
//  V.10.18 Fix: default alertReceiveDate = today + UI empty state inline
//  V.10.19 Fix: ปรับ UI empty state ใน renderAlert() ให้กระชับและถูกต้อง
//  V.10.20 Fix: ลบ duplicate empty-state ใน onAlertDateChange() ให้ renderAlert() จัดการแทน
//  V.10.21 Fix: เปลี่ยน Empty State ให้มี Date Picker เลือกวันแรกได้เลย (ไม่มีปุ่ม + เพิ่มวัน)
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════════════════════

let alertSelectedGrades = [];
let alertAllGrades = [];
let alertCache = [];
let alertSupplierCache = [];

let alertViewMode = 'matrix';

let alertSelectedSizes = [];
let alertAllSizes = [];

let alertSelectedFilters = ['all'];
let alertSelectedOrderFilters = ['all'];
let alertSelectedSupFilters = [];
let alertAllSupsInData = [];

let alertSelectedStockFilters = ['all'];
let alertSelectedReceiveFilters = ['all'];
let alertSelectedUsageFilters = ['all'];

let alertReceiveDates = [];
let alertActiveDateIdx = 0;

let alertUsageRanges = [];
let alertUsageSelected = null;

let alertHistoryMode = 'matrix';
let alertHistoryData = null;
let alertHistoryMeta = null;

let _pendingPOItems = [];

// ═══════════════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════════════

const ALERT_ALL_FILTERS = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'lt0', label: '🔴 ขาด (< 0)' },
  { value: 'eq0', label: '🟡 พอดี (= 0)' },
  { value: 'gt0', label: '🟢 เกิน (> 0)' }
];

const ALERT_ORDER_FILTERS = [
  { value: 'all',        label: 'ทั้งหมด' },
  { value: 'filled',     label: '✅ กรอกแล้ว' },
  { value: 'not_filled', label: '⬜ ยังไม่กรอก' }
];

const ALERT_STOCK_FILTERS = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'eq0', label: '= 0' },
  { value: 'gt0', label: '> 0' },
  { value: 'lt0', label: '< 0' }
];

const ALERT_RECEIVE_FILTERS = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'eq0', label: '= 0' },
  { value: 'gt0', label: '> 0' },
  { value: 'lt0', label: '< 0' }
];

const ALERT_USAGE_FILTERS = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'has', label: 'มี Usage' },
  { value: 'none', label: 'ไม่มี Usage' }
];

const ALERT_CUSTOMER_ROLLS = [
  { value: 'normal',   label: 'ปกติ' },
  { value: 'pump_f',   label: 'ปั้ม F' },
  { value: 'pump_bt',  label: 'ปั้ม BT' },
  { value: 'pump_ktp', label: 'ปั้ม KTP' }
];

const ALERT_QUALITY_B = [
  { value: 'normal', label: 'ปกติ' },
  { value: 'nc',     label: 'NC' }
];

const ALERT_LS_KEY_PREFIX = 'stockv8_alert_inputs_v';
const ALERT_PO_FLAG_KEY = 'stockv8_alert_po_created';
const ALERT_RECEIVE_DATES_KEY = 'stockv8_alert_receive_dates';

// ═══════════════════════════════════════════════════════════════
//  DATE CONVERSION HELPERS (DD/MM/YYYY ↔ YYYY-MM-DD)
// ═══════════════════════════════════════════════════════════════

function toThaiDateStr(isoDate) {
  if (!isoDate) return '';
  const str = String(isoDate).trim();
  if (str.includes('/')) return str;
  const parts = str.split('-');
  if (parts.length !== 3) return str;
  const [y, m, d] = parts;
  return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
}

function toISODateStr(thaiDate) {
  if (!thaiDate) return '';
  const str = String(thaiDate).trim();
  if (str.includes('-') && !str.includes('/')) return str;
  const parts = str.split('/');
  if (parts.length === 3) {
    const [d, m, y] = parts;
    if (!d || !m || !y) return '';
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return str;
}

// ═══════════════════════════════════════════════════════════════
//  LOCALSTORAGE KEY (ISO Date)
// ═══════════════════════════════════════════════════════════════

function getAlertLSKeyByDate(isoDate) {
  if (!isoDate) {
    const activeDate = alertReceiveDates[alertActiveDateIdx];
    if (!activeDate) return `${ALERT_LS_KEY_PREFIX}default`;
    return `${ALERT_LS_KEY_PREFIX}${activeDate}`;
  }
  return `${ALERT_LS_KEY_PREFIX}${isoDate}`;
}

function getAlertLSKey(dateIdx = alertActiveDateIdx) {
  const activeDate = alertReceiveDates[dateIdx];
  if (!activeDate) return `${ALERT_LS_KEY_PREFIX}default`;
  return `${ALERT_LS_KEY_PREFIX}${activeDate}`;
}

// ═══════════════════════════════════════════════════════════════
//  DATE HELPERS
// ═══════════════════════════════════════════════════════════════

function _parseLocalDate(iso) {
  if (!iso) return null;
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(y, m - 1, d);
}

function _nextWorkingDay(fromDate) {
  const d = new Date(fromDate);
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0) d.setDate(d.getDate() + 1);
  return d;
}

function calcStockDate(analyzedDate) {
  if (!analyzedDate) return '';
  const d = new Date(analyzedDate);
  d.setDate(d.getDate() - 1);
  if (d.getDay() === 0) d.setDate(d.getDate() - 1);
  return toISODate(d);
}

function calcReceiveDate(analyzedDate) {
  return analyzedDate || '';
}

function calcSnapshotMonth(analyzedDate) {
  if (!analyzedDate) return '';
  const d = new Date(analyzedDate);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

function fmtDateThai(d) {
  if (!d) return '-';
  const dObj = new Date(d);
  const dd = String(dObj.getDate()).padStart(2, '0');
  const mm = String(dObj.getMonth() + 1).padStart(2, '0');
  const yyyy = dObj.getFullYear() + 543;
  return `${dd}/${mm}/${yyyy}`;
}

// ═══════════════════════════════════════════════════════════════
//  CLEAN OLD KEYS
// ═══════════════════════════════════════════════════════════════

function cleanOldAlertKeys() {
  try {
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && /^stockv8_alert_inputs_v\d+$/.test(key)) {
        toRemove.push(key);
      }
    }
    toRemove.forEach(k => localStorage.removeItem(k));
    if (toRemove.length) {
      console.log(`🧹 ล้าง key เก่า ${toRemove.length} รายการ:`, toRemove);
    }
  } catch (e) {
    console.warn('cleanOldAlertKeys:', e);
  }
}

// ═══════════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════════

async function initAlertTab() {
  cleanOldAlertKeys();

  const today = toISODate(new Date());

  // 🔽 เซ็ตค่าวันที่วิเคราะห์ (ห้ามแก้) 🔽
  const alertDateEl = $('alertDate');
  if (alertDateEl) {
    alertDateEl.value = today;
    alertDateEl.readOnly = true;
    alertDateEl.style.pointerEvents = 'none';
    alertDateEl.style.background = '#f1f5f9';
    alertDateEl.style.cursor = 'not-allowed';
  }

  // 🔽 V.10.18: ให้ช่อง "วันที่สั่งซื้อ" ดีฟอลต์เป็น "วันปัจจุบัน" 🔽
  const receiveDateEl = $('alertReceiveDate');
  if (receiveDateEl && !receiveDateEl.value) {
    receiveDateEl.value = today; 
  }
  // 🔼 จบส่วนที่เพิ่ม 🔼

  const displayEl = $('alertDateDisplay');
  if (displayEl) displayEl.textContent = fmtDateThai(today);

  applyCalculatedDates(today);
  attachAlertDateListener();

  await loadAlertSuppliers();
  await loadSnapshotMonths();
  await loadAlertGradeFilter();
  loadAlertFilter();
  initAlertReceiveDates();

  await loadUsagePlanRanges();
  renderUsageRangeDropdown();

  await onAlertDateChange();

  showAlertHistoryCard();

  // 🔽 V.10.17: โหลดประวัติของวันนี้อัตโนมัติ 🔽
  await loadAlertHistory();
}

// ✅ V.10.15: ไม่เซ็ต alertReceiveDate ที่นี่ (ปล่อยให้ว่างไว้)
function applyCalculatedDates(analyzedDate) {
  if (!analyzedDate) return;

  const stockDate = calcStockDate(analyzedDate);

  if ($('alertStockDate')) $('alertStockDate').value = stockDate;
  // ❌ ไม่ต้องเซ็ต alertReceiveDate ที่นี่ (ปล่อยให้ว่างไว้)
}

function attachAlertDateListener() {
  const el = $('alertDate');
  if (!el) return;

  el.readOnly = true;
  el.style.pointerEvents = 'none';
  el.style.background = '#f1f5f9';
  el.style.cursor = 'not-allowed';

  if (el.dataset.listenerAttached === '1') return;
  el.dataset.listenerAttached = '1';
}

// ═══════════════════════════════════════════════════════════════
//  ALERT HISTORY
// ═══════════════════════════════════════════════════════════════

async function saveAlertSnapshot(receiveDates) {
  const analyzedDate = $('alertDate')?.value;

  if (!analyzedDate) {
    console.warn('saveAlertSnapshot: no analyzed_date');
    return { ok: false, error: 'ไม่มีวันที่วิเคราะห์' };
  }

  try {
    const summary = {
      shortage: alertCache.filter(r => Number(r.alert) < 0).length,
      ok:       alertCache.filter(r => Number(r.alert) === 0).length,
      over:     alertCache.filter(r => Number(r.alert) > 0).length,
      total:    alertCache.length
    };

    const filters = {
      grades: [...alertSelectedGrades],
      sizes: [...alertSelectedSizes],
      alert_filters: [...alertSelectedFilters]
    };

    const payload = {
      analyzed_date:  analyzedDate,
      snapshot_month: $('alertSnapshotMonth')?.value || null,
      stock_date:     $('alertStockDate')?.value || null,
      receive_date:   $('alertReceiveDate')?.value || null,
      receive_dates:  receiveDates || [...alertReceiveDates],
      summary_json:   summary,
      result_json:    alertCache,
      filters_json:   filters,
      analyzed_by:    currentUser?.id || null,
      updated_at:     new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('alert_history')
      .upsert(payload, { onConflict: 'analyzed_date' })
      .select()
      .single();

    if (error) throw error;
    return { ok: true, data };
  } catch (e) {
    console.error('saveAlertSnapshot:', e);
    return { ok: false, error: e.message };
  }
}

async function loadAlertSnapshot(analyzedDate) {
  if (!analyzedDate) return null;

  try {
    const { data, error } = await supabase
      .from('alert_history')
      .select('*')
      .eq('analyzed_date', analyzedDate)
      .maybeSingle();

    if (error) throw error;
    return data || null;
  } catch (e) {
    console.error('loadAlertSnapshot:', e);
    return null;
  }
}

// ✅ V.10.20: ลบ duplicate empty-state ออก — ให้ renderAlert() จัดการ UI ทั้งหมด
async function onAlertDateChange() {
  const analyzedDate = $('alertDate')?.value;
  if (!analyzedDate) return;

  // 🔽 V.10.20: ไม่ต้องเขียน empty-state ที่นี่ ให้ renderAlert() จัดการแทน 🔽
  // ถ้ามีวันที่แล้ว ค่อยโหลด snapshot / auto-analyze
  $('alertBody').innerHTML = '<p style="text-align:center;color:#94a3b8;padding:20px">กำลังโหลด...</p>';
  const snapshot = await loadAlertSnapshot(analyzedDate);
  
  if (snapshot) {
    await applyAlertSnapshot(snapshot);
    const today = toISODate(new Date());
    const isPastDay = analyzedDate < today;
    setAlertLocked(isPastDay, analyzedDate);
  } else {
    setAlertLocked(false);
    await autoAnalyzeAlert();
  }
}

async function autoAnalyzeAlert() {
  await renderAlert();
}

function setAlertLocked(locked, analyzedDate) {
  const lockBanner = $('alertLockBanner');
  const body = $('alertBody');

  if (locked) {
    if (lockBanner) {
      lockBanner.innerHTML = `🔒 ข้อมูลวันที่ <b>${fmtDateThai(analyzedDate)}</b> — ข้ามวันแล้ว ดูได้อย่างเดียว`;
      lockBanner.classList.remove('hidden');
    }

    if (body) body.classList.add('alert-locked');

    ['alertStockDate', 'alertReceiveDate', 'alertSnapshotMonth', 'alertIncludeCustomer'].forEach(id => {
      const el = $(id);
      if (el) el.disabled = true;
    });

    document.querySelectorAll('[onclick*="createPOFromAlert"], [onclick*="clearAlertInputs"]').forEach(btn => {
      btn.disabled = true;
      btn.style.opacity = '0.4';
      btn.style.cursor = 'not-allowed';
    });

  } else {
    if (lockBanner) lockBanner.classList.add('hidden');
    if (body) body.classList.remove('alert-locked');

    ['alertStockDate', 'alertReceiveDate', 'alertSnapshotMonth', 'alertIncludeCustomer'].forEach(id => {
      const el = $(id);
      if (el) {
        el.disabled = false;
        el.style.background = '';
        el.style.cursor = '';
      }
    });

    document.querySelectorAll('[onclick*="createPOFromAlert"], [onclick*="clearAlertInputs"]').forEach(btn => {
      btn.disabled = false;
      btn.style.opacity = '';
      btn.style.cursor = '';
    });
  }
}

async function applyAlertSnapshot(snapshot) {
  try {
    if (snapshot.snapshot_month) $('alertSnapshotMonth').value = snapshot.snapshot_month;
    if (snapshot.stock_date)     $('alertStockDate').value = snapshot.stock_date;
    if (snapshot.receive_date)   $('alertReceiveDate').value = snapshot.receive_date;

    if (snapshot.receive_dates && Array.isArray(snapshot.receive_dates)) {
      alertReceiveDates = [...snapshot.receive_dates];
      saveAlertReceiveDates();
      renderAlertDateTabs();
    }

    alertCache = snapshot.result_json || [];
    renderAlertFromCache();
  } catch (e) {
    console.error('applyAlertSnapshot:', e);
    $('alertBody').innerHTML = `<div class="msg err">โหลด snapshot ไม่สำเร็จ: ${esc(e.message)}</div>`;
  }
}

// ═══════════════════════════════════════════════════════════════
//  RENDER ALERT FROM CACHE
// ═══════════════════════════════════════════════════════════════

function renderAlertFromCache() {
  if (!alertCache || !alertCache.length) {
    $('alertBody').innerHTML = '<p style="text-align:center;color:#94a3b8;padding:30px">ไม่มีข้อมูล</p>';
    return;
  }

  window._alertFullCache = [...alertCache];

  let html = `<div id="alertDateTabsBox" class="alert-date-tabs"></div>`;

  html += '<div class="report-wrap alert-scroll"><table class="alert-flat-table"><thead><tr>';
  html += buildAlertTableHead();
  html += '</tr></thead><tbody></tbody></table></div>';
  html += buildAlertFoot();

  $('alertBody').innerHTML = html;

  renderAlertDateTabs();
  renderAllAlertFilters();
  renderAlertReceiveDates();

  applyAlertFiltersAndRender();
}

// ═══════════════════════════════════════════════════════════════
//  VIEW TOGGLE
// ═══════════════════════════════════════════════════════════════

function setAlertViewMode(mode) {
  if (mode !== 'flat' && mode !== 'matrix') return;
  if (alertViewMode === mode) return;
  alertViewMode = mode;
  renderAlertTableBody(alertCache);
}

function initAlertRowHover() {
  setTimeout(() => {
    const alertRows = document.querySelectorAll('.alert-flat-table tbody tr');
    alertRows.forEach(row => {
      if (row.classList.contains('total-row')) return;
      row.style.cursor = 'pointer';
      row.style.transition = 'background-color 0.15s ease';
      const cells = row.querySelectorAll('td');
      const originalColors = [];
      cells.forEach((cell, idx) => { originalColors[idx] = cell.style.backgroundColor || ''; });
      if (row._hoverAttached) return;
      row._hoverAttached = true;
      row.addEventListener('mouseenter', () => {
        cells.forEach(cell => {
          cell.style.backgroundColor = '#dbeafe';
          cell.style.transition = 'background-color 0.15s ease';
        });
      });
      row.addEventListener('mouseleave', () => {
        cells.forEach((cell, idx) => { cell.style.backgroundColor = originalColors[idx]; });
      });
    });
  }, 50);
}

// ═══════════════════════════════════════════════════════════════
//  SUPPLIERS
// ═══════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════
//  SNAPSHOT MONTHS
// ═══════════════════════════════════════════════════════════════

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

    if ($('alertSnapshotMonth') && months.length > 0) {
      $('alertSnapshotMonth').value = months[0];
    }
  } catch (e) {
    console.warn('loadSnapshotMonths:', e);
  }
}

// ═══════════════════════════════════════════════════════════════
//  FILTERS (GRADE / SIZE / ALERT / ORDER / SUP / STOCK / RECEIVE / USAGE)
// ═══════════════════════════════════════════════════════════════

// ─── GRADE ──────────────────────────────────────────────────────

async function loadAlertGradeFilter() {
  alertAllGrades = [...new Set(
    masterCache.map(m => normalizeGrade(m.grade) + m.gram)
  )].sort();
  renderAlertGradeList();
  updateAlertGradeLabel();
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
      applyAlertFiltersAndRender();
    });
  });
}

function updateAlertGradeLabel() {
  const label = $('alertGradeFilterLabel');
  if (!label) return;
  if (alertSelectedGrades.length === 0) {
    label.textContent = 'Gradegrams';
  } else if (alertSelectedGrades.length === 1) {
    label.textContent = alertSelectedGrades[0];
  } else {
    label.textContent = `Gradegrams (${alertSelectedGrades.length})`;
  }
}

function selectAllAlertGrades() {
  alertSelectedGrades = [...alertAllGrades];
  renderAlertGradeList(); updateAlertGradeLabel();
  applyAlertFiltersAndRender();
}

function clearAllAlertGrades() {
  alertSelectedGrades = [];
  renderAlertGradeList(); updateAlertGradeLabel();
  applyAlertFiltersAndRender();
}

// ─── SIZE ───────────────────────────────────────────────────────

function renderAlertSizeList() {
  const list = $('alertSizeList');
  if (!list) return;
  if (!alertAllSizes.length) {
    list.innerHTML = '<div style="padding:10px;text-align:center;color:#94a3b8;font-size:13px">ไม่มีข้อมูล</div>';
    return;
  }
  list.innerHTML = alertAllSizes.map(s => {
    const checked = alertSelectedSizes.includes(s);
    return `<label class="item ${checked ? 'checked' : ''}" data-size="${s}">
      <input type="checkbox" ${checked ? 'checked' : ''}>
      <span>${s}</span>
    </label>`;
  }).join('');
  list.querySelectorAll('.item').forEach(el => {
    const cb = el.querySelector('input[type="checkbox"]');
    cb.addEventListener('change', () => {
      const size = Number(el.dataset.size);
      if (cb.checked) {
        if (!alertSelectedSizes.includes(size)) alertSelectedSizes.push(size);
      } else {
        alertSelectedSizes = alertSelectedSizes.filter(x => x !== size);
      }
      el.classList.toggle('checked', cb.checked);
      updateAlertSizeLabel();
      applyAlertFiltersAndRender();
    });
  });
}

function updateAlertSizeLabel() {
  const label = $('alertSizeLabel');
  if (!label) return;
  if (alertSelectedSizes.length === 0) {
    label.textContent = 'Size';
    label.style.color = '#fff';
  } else if (alertSelectedSizes.length === 1) {
    label.textContent = `Size ${alertSelectedSizes[0]}`;
    label.style.color = '#fbbf24';
  } else {
    label.textContent = `Size (${alertSelectedSizes.length})`;
    label.style.color = '#fbbf24';
  }
}

function selectAllAlertSizes() {
  alertSelectedSizes = [...alertAllSizes];
  renderAlertSizeList(); updateAlertSizeLabel();
  applyAlertFiltersAndRender();
}

function clearAllAlertSizes() {
  alertSelectedSizes = [];
  renderAlertSizeList(); updateAlertSizeLabel();
  applyAlertFiltersAndRender();
}

// ─── ALERT ──────────────────────────────────────────────────────

function loadAlertFilter() {
  renderAlertFilterList();
  updateAlertFilterLabel();
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
      applyAlertFiltersAndRender();
    });
  });
}

function updateAlertFilterLabel() {
  const label = $('alertFilterLabel');
  if (!label) return;
  if (alertSelectedFilters.length === 0 || alertSelectedFilters.includes('all')) {
    label.textContent = 'Alert';
  } else if (alertSelectedFilters.length === 1) {
    const f = ALERT_ALL_FILTERS.find(x => x.value === alertSelectedFilters[0]);
    label.textContent = f ? f.label : alertSelectedFilters[0];
  } else {
    label.textContent = `Alert (${alertSelectedFilters.length})`;
  }
}

function selectAllAlertFilters() {
  alertSelectedFilters = ['all'];
  renderAlertFilterList(); updateAlertFilterLabel();
  applyAlertFiltersAndRender();
}

function clearAllAlertFilters() {
  alertSelectedFilters = [];
  renderAlertFilterList(); updateAlertFilterLabel();
  applyAlertFiltersAndRender();
}

// ─── ORDER ──────────────────────────────────────────────────────

function renderAlertOrderFilterList() {
  const list = $('alertOrderFilterList');
  if (!list) return;
  list.innerHTML = ALERT_ORDER_FILTERS.map(f => {
    const checked = alertSelectedOrderFilters.includes(f.value);
    return `<label class="item ${checked ? 'checked' : ''}" data-order-filter="${f.value}">
      <input type="checkbox" ${checked ? 'checked' : ''}>
      <span>${f.label}</span>
    </label>`;
  }).join('');
  list.querySelectorAll('.item').forEach(el => {
    const cb = el.querySelector('input[type="checkbox"]');
    cb.addEventListener('change', () => {
      const val = el.dataset.orderFilter;
      if (cb.checked) {
        if (!alertSelectedOrderFilters.includes(val)) alertSelectedOrderFilters.push(val);
      } else {
        alertSelectedOrderFilters = alertSelectedOrderFilters.filter(x => x !== val);
      }
      el.classList.toggle('checked', cb.checked);
      updateAlertOrderFilterLabel();
      applyAlertFiltersAndRender();
    });
  });
}

function updateAlertOrderFilterLabel() {
  const label = $('alertOrderFilterLabel');
  if (!label) return;
  if (alertSelectedOrderFilters.length === 0 || alertSelectedOrderFilters.includes('all')) {
    label.textContent = 'สั่งซื้อ';
  } else if (alertSelectedOrderFilters.length === 1) {
    const f = ALERT_ORDER_FILTERS.find(x => x.value === alertSelectedOrderFilters[0]);
    label.textContent = f ? f.label : alertSelectedOrderFilters[0];
  } else {
    label.textContent = `สั่งซื้อ (${alertSelectedOrderFilters.length})`;
  }
}

function selectAllAlertOrderFilters() {
  alertSelectedOrderFilters = ['all'];
  renderAlertOrderFilterList(); updateAlertOrderFilterLabel();
  applyAlertFiltersAndRender();
}

function clearAllAlertOrderFilters() {
  alertSelectedOrderFilters = [];
  renderAlertOrderFilterList(); updateAlertOrderFilterLabel();
  applyAlertFiltersAndRender();
}

// ─── SUP ────────────────────────────────────────────────────────

function renderAlertSupFilterList() {
  const list = $('alertSupFilterList');
  if (!list) return;
  if (!alertAllSupsInData.length) {
    list.innerHTML = '<div style="padding:10px;text-align:center;color:#94a3b8;font-size:13px">ไม่มีข้อมูล</div>';
    return;
  }
  const displayList = ['__NONE__', ...alertAllSupsInData];
  list.innerHTML = displayList.map(s => {
    const checked = alertSelectedSupFilters.includes(s);
    const label = s === '__NONE__' ? '— ยังไม่ระบุ —' : s;
    return `<label class="item ${checked ? 'checked' : ''}" data-sup="${esc(s)}">
      <input type="checkbox" ${checked ? 'checked' : ''}>
      <span>${esc(label)}</span>
    </label>`;
  }).join('');
  list.querySelectorAll('.item').forEach(el => {
    const cb = el.querySelector('input[type="checkbox"]');
    cb.addEventListener('change', () => {
      const val = el.dataset.sup;
      if (cb.checked) {
        if (!alertSelectedSupFilters.includes(val)) alertSelectedSupFilters.push(val);
      } else {
        alertSelectedSupFilters = alertSelectedSupFilters.filter(x => x !== val);
      }
      el.classList.toggle('checked', cb.checked);
      updateAlertSupFilterLabel();
      applyAlertFiltersAndRender();
    });
  });
}

function updateAlertSupFilterLabel() {
  const label = $('alertSupFilterLabel');
  if (!label) return;
  if (alertSelectedSupFilters.length === 0) {
    label.textContent = 'Sup.';
  } else if (alertSelectedSupFilters.length === 1) {
    label.textContent = alertSelectedSupFilters[0] === '__NONE__' ? 'ยังไม่ระบุ' : alertSelectedSupFilters[0];
  } else {
    label.textContent = `Sup. (${alertSelectedSupFilters.length})`;
  }
}

function selectAllAlertSupFilters() {
  alertSelectedSupFilters = [...alertAllSupsInData];
  renderAlertSupFilterList(); updateAlertSupFilterLabel();
  applyAlertFiltersAndRender();
}

function clearAllAlertSupFilters() {
  alertSelectedSupFilters = [];
  renderAlertSupFilterList(); updateAlertSupFilterLabel();
  applyAlertFiltersAndRender();
}

// ─── STOCK ──────────────────────────────────────────────────────

function renderAlertStockFilterList() {
  const list = $('alertStockFilterList');
  if (!list) return;
  list.innerHTML = ALERT_STOCK_FILTERS.map(f => {
    const checked = alertSelectedStockFilters.includes(f.value);
    return `<label class="item ${checked ? 'checked' : ''}" data-stock-filter="${f.value}">
      <input type="checkbox" ${checked ? 'checked' : ''}>
      <span>${f.label}</span>
    </label>`;
  }).join('');
  list.querySelectorAll('.item').forEach(el => {
    const cb = el.querySelector('input[type="checkbox"]');
    cb.addEventListener('change', () => {
      const val = el.dataset.stockFilter;
      if (cb.checked) {
        if (!alertSelectedStockFilters.includes(val)) alertSelectedStockFilters.push(val);
      } else {
        alertSelectedStockFilters = alertSelectedStockFilters.filter(x => x !== val);
      }
      el.classList.toggle('checked', cb.checked);
      updateAlertStockFilterLabel();
      applyAlertFiltersAndRender();
    });
  });
}

function updateAlertStockFilterLabel() {
  const label = $('alertStockFilterLabel');
  if (!label) return;
  if (alertSelectedStockFilters.length === 0 || alertSelectedStockFilters.includes('all')) {
    label.textContent = 'Stock';
  } else if (alertSelectedStockFilters.length === 1) {
    const f = ALERT_STOCK_FILTERS.find(x => x.value === alertSelectedStockFilters[0]);
    label.textContent = f ? f.label : alertSelectedStockFilters[0];
  } else {
    label.textContent = `Stock (${alertSelectedStockFilters.length})`;
  }
}

function selectAllAlertStockFilters() {
  alertSelectedStockFilters = ['all'];
  renderAlertStockFilterList(); updateAlertStockFilterLabel();
  applyAlertFiltersAndRender();
}

function clearAllAlertStockFilters() {
  alertSelectedStockFilters = [];
  renderAlertStockFilterList(); updateAlertStockFilterLabel();
  applyAlertFiltersAndRender();
}

// ─── RECEIVE ────────────────────────────────────────────────────

function renderAlertReceiveFilterList() {
  const list = $('alertReceiveFilterList');
  if (!list) return;
  list.innerHTML = ALERT_RECEIVE_FILTERS.map(f => {
    const checked = alertSelectedReceiveFilters.includes(f.value);
    return `<label class="item ${checked ? 'checked' : ''}" data-receive-filter="${f.value}">
      <input type="checkbox" ${checked ? 'checked' : ''}>
      <span>${f.label}</span>
    </label>`;
  }).join('');
  list.querySelectorAll('.item').forEach(el => {
    const cb = el.querySelector('input[type="checkbox"]');
    cb.addEventListener('change', () => {
      const val = el.dataset.receiveFilter;
      if (cb.checked) {
        if (!alertSelectedReceiveFilters.includes(val)) alertSelectedReceiveFilters.push(val);
      } else {
        alertSelectedReceiveFilters = alertSelectedReceiveFilters.filter(x => x !== val);
      }
      el.classList.toggle('checked', cb.checked);
      updateAlertReceiveFilterLabel();
      applyAlertFiltersAndRender();
    });
  });
}

function updateAlertReceiveFilterLabel() {
  const label = $('alertReceiveFilterLabel');
  if (!label) return;
  if (alertSelectedReceiveFilters.length === 0 || alertSelectedReceiveFilters.includes('all')) {
    label.textContent = 'Receive';
  } else if (alertSelectedReceiveFilters.length === 1) {
    const f = ALERT_RECEIVE_FILTERS.find(x => x.value === alertSelectedReceiveFilters[0]);
    label.textContent = f ? f.label : alertSelectedReceiveFilters[0];
  } else {
    label.textContent = `Receive (${alertSelectedReceiveFilters.length})`;
  }
}

function selectAllAlertReceiveFilters() {
  alertSelectedReceiveFilters = ['all'];
  renderAlertReceiveFilterList(); updateAlertReceiveFilterLabel();
  applyAlertFiltersAndRender();
}

function clearAllAlertReceiveFilters() {
  alertSelectedReceiveFilters = [];
  renderAlertReceiveFilterList(); updateAlertReceiveFilterLabel();
  applyAlertFiltersAndRender();
}

// ─── USAGE PLAN ─────────────────────────────────────────────────

function renderAlertUsageFilterList() {
  const list = $('alertUsageFilterList');
  if (!list) return;
  list.innerHTML = ALERT_USAGE_FILTERS.map(f => {
    const checked = alertSelectedUsageFilters.includes(f.value);
    return `<label class="item ${checked ? 'checked' : ''}" data-usage-filter="${f.value}">
      <input type="checkbox" ${checked ? 'checked' : ''}>
      <span>${f.label}</span>
    </label>`;
  }).join('');
  list.querySelectorAll('.item').forEach(el => {
    const cb = el.querySelector('input[type="checkbox"]');
    cb.addEventListener('change', () => {
      const val = el.dataset.usageFilter;
      if (cb.checked) {
        if (!alertSelectedUsageFilters.includes(val)) alertSelectedUsageFilters.push(val);
      } else {
        alertSelectedUsageFilters = alertSelectedUsageFilters.filter(x => x !== val);
      }
      el.classList.toggle('checked', cb.checked);
      updateAlertUsageFilterLabel();
      applyAlertFiltersAndRender();
    });
  });
}

function updateAlertUsageFilterLabel() {
  const label = $('alertUsageFilterLabel');
  if (!label) return;
  if (alertSelectedUsageFilters.length === 0 || alertSelectedUsageFilters.includes('all')) {
    label.textContent = 'Usage Plan';
  } else if (alertSelectedUsageFilters.length === 1) {
    const f = ALERT_USAGE_FILTERS.find(x => x.value === alertSelectedUsageFilters[0]);
    label.textContent = f ? f.label : alertSelectedUsageFilters[0];
  } else {
    label.textContent = `Usage (${alertSelectedUsageFilters.length})`;
  }
}

function selectAllAlertUsageFilters() {
  alertSelectedUsageFilters = ['all'];
  renderAlertUsageFilterList(); updateAlertUsageFilterLabel();
  applyAlertFiltersAndRender();
}

function clearAllAlertUsageFilters() {
  alertSelectedUsageFilters = [];
  renderAlertUsageFilterList(); updateAlertUsageFilterLabel();
  applyAlertFiltersAndRender();
}

// ═══════════════════════════════════════════════════════════════
//  APPLY FILTERS
// ═══════════════════════════════════════════════════════════════

function applyAlertFiltersAndRender() {
  if (!window._alertFullCache || !window._alertFullCache.length) return;

  let result = [...window._alertFullCache];

  if (alertSelectedGrades.length > 0) {
    result = result.filter(r => alertSelectedGrades.includes(r.gradegram));
  }

  if (alertSelectedSizes.length > 0) {
    result = result.filter(r => alertSelectedSizes.includes(Number(r.size)));
  }

  if (!alertSelectedFilters.includes('all') && alertSelectedFilters.length > 0) {
    result = result.filter(r => {
      const a = Number(r.alert) || 0;
      if (alertSelectedFilters.includes('lt0') && a < 0) return true;
      if (alertSelectedFilters.includes('eq0') && a === 0) return true;
      if (alertSelectedFilters.includes('gt0') && a > 0) return true;
      return false;
    });
  }

  if (!alertSelectedStockFilters.includes('all') && alertSelectedStockFilters.length > 0) {
    result = result.filter(r => {
      const v = Number(r.stock) || 0;
      if (alertSelectedStockFilters.includes('eq0') && v === 0) return true;
      if (alertSelectedStockFilters.includes('gt0') && v > 0) return true;
      if (alertSelectedStockFilters.includes('lt0') && v < 0) return true;
      return false;
    });
  }

  if (!alertSelectedReceiveFilters.includes('all') && alertSelectedReceiveFilters.length > 0) {
    result = result.filter(r => {
      const v = Number(r.receive) || 0;
      if (alertSelectedReceiveFilters.includes('eq0') && v === 0) return true;
      if (alertSelectedReceiveFilters.includes('gt0') && v > 0) return true;
      if (alertSelectedReceiveFilters.includes('lt0') && v < 0) return true;
      return false;
    });
  }

  if (!alertSelectedUsageFilters.includes('all') && alertSelectedUsageFilters.length > 0) {
    result = result.filter(r => {
      const v = Number(r.usage_plan) || 0;
      if (alertSelectedUsageFilters.includes('has') && v > 0) return true;
      if (alertSelectedUsageFilters.includes('none') && v === 0) return true;
      return false;
    });
  }

  if (!alertSelectedOrderFilters.includes('all') && alertSelectedOrderFilters.length > 0) {
    result = result.filter(r => {
      const totalQty = getAlertQtyTotal(r.gradegram, r.size);
      const hasQty = totalQty > 0;
      if (alertSelectedOrderFilters.includes('filled') && hasQty) return true;
      if (alertSelectedOrderFilters.includes('not_filled') && !hasQty) return true;
      return false;
    });
  }

  if (alertSelectedSupFilters.length > 0) {
    result = result.filter(r => {
      const items = getAlertItems(r.gradegram, r.size);
      if (!items.length) {
        return alertSelectedSupFilters.includes('__NONE__');
      }
      return items.some(it => {
        const sup = it.sup || '';
        if (!sup && alertSelectedSupFilters.includes('__NONE__')) return true;
        return alertSelectedSupFilters.includes(sup);
      });
    });
  }

  alertCache = result;
  renderAlertTableBody(result);
}

// ═══════════════════════════════════════════════════════════════
//  RENDER TABLE
// ═══════════════════════════════════════════════════════════════

function renderAlertTableBody(rows) {
  renderAlertDateTabs();

  const fullCache = window._alertFullCache || [];
  if (fullCache.length > 0) {
    const sizes = [...new Set(
      fullCache.map(r => Number(r.size)).filter(n => !isNaN(n) && n > 0)
    )].sort((a, b) => a - b);
    if (sizes.length > 0) {
      alertAllSizes = sizes;
      renderAlertSizeList();
      updateAlertSizeLabel();
    }

    const grades = [...new Set(
      fullCache.map(r => r.gradegram).filter(Boolean)
    )].sort();
    if (grades.length > 0) {
      alertAllGrades = grades;
      renderAlertGradeList();
      updateAlertGradeLabel();
    }
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

function onAlertItemInput(gradegram, size, idx, field, value, el) {
  const items = getAlertItems(gradegram, size);

  while (items.length <= idx) {
    items.push({ qty: '', sup: '', customer_roll: 'normal', quality_b: 'normal', note: '' });
  }

  items[idx][field] = value;

  saveAlertItems(gradegram, size, items);

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

function addFlatRow(gradegram, size) {
  const items = getAlertItems(gradegram, size);
  if (items.length >= 5) {
    alert('⚠️ เพิ่มได้สูงสุด 5 รายการต่อ cell');
    return;
  }

  items.push({ qty: '', sup: '', customer_roll: 'normal', quality_b: 'normal', note: '' });
  saveAlertItems(gradegram, size, items);
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
    if (reportFoot) {
      container.insertBefore(matrixWrap, reportFoot);
    } else {
      container.appendChild(matrixWrap);
    }
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
  html += '<th class="total-col-matrix">TOTAL</th>';
  html += '</tr></thead><tbody>';

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
      if (a < 0)        cellCls = 'matrix-red';
      else if (a === 0) cellCls = 'matrix-yellow';
      else              cellCls = 'matrix-green';

      const totalQty = getAlertQtyTotal(grade, size);
      const hasOrder = totalQty > 0;

      const items = getAlertItems(grade, size);
      const allHaveSup = items.length > 0 && items.every(it => it.sup && String(it.sup).trim());
      const hasQtyNoSup = hasOrder && !allHaveSup;

      const cartIcon = hasOrder
        ? `<svg class="matrix-cart-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
             <circle cx="9" cy="21" r="1"/>
             <circle cx="20" cy="21" r="1"/>
             <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
           </svg>`
        : '';

      let orderCls = '';
      if (hasOrder && allHaveSup) orderCls = 'has-order';
      else if (hasQtyNoSup)        orderCls = 'order-incomplete';

      html += `<td class="matrix-cell ${cellCls} ${orderCls}"
                    onclick="openAlertMatrixCell('${esc(grade)}', ${size})">
                 <div class="matrix-value">${a > 0 ? '+' + Number(a).toFixed(2) : Number(a).toFixed(2)}${cartIcon}</div>
               </td>`;
    });

    html += `<td class="total-col-matrix">${rowTotal > 0 ? '+' + rowTotal.toFixed(2) : rowTotal.toFixed(2)}</td>`;
    html += '</tr>';
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
  html += '</tr>';

  html += '</tbody></table>';

  matrixWrap.innerHTML = html;
}

// ═══════════════════════════════════════════════════════════════
//  MODAL CELL
// ═══════════════════════════════════════════════════════════════

function openAlertMatrixCell(gradegram, size) {
  const r = alertCache.find(x => x.gradegram === gradegram && Number(x.size) === Number(size));
  if (!r) { alert('ไม่พบข้อมูล'); return; }

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
        <button type="button" onclick="closeModal('modalAlertMatrixCell')">ยกเลิก</button>
        <button type="button" class="primary"
                onclick="saveMatrixOrder('${esc(gradegram)}', ${size})">
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

  return `
    <div class="matrix-order-row" data-row-idx="${idx}">
      <div class="matrix-order-row-head">
        <span class="row-label">รายการที่ ${idx + 1}</span>
        <button type="button" class="row-remove-btn"
                onclick="removeMatrixOrderRow(this)" title="ลบรายการนี้">✕</button>
      </div>

      <div class="form-row">
        <div class="form-field">
          <label>จำนวนม้วน *</label>
          <input type="number" class="qty-input matrix-row-qty"
                 min="1" step="1" placeholder="0"
                 value="${it.qty || ''}">
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
          <input type="text" class="matrix-row-note"
                 placeholder="-" value="${esc(it.note || '')}">
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

function removeMatrixOrderRow(btn) {
  const rowsBox = document.getElementById('matrixOrderRows');
  if (!rowsBox) return;

  const row = btn.closest('.matrix-order-row');
  if (row) row.remove();

  const remaining = rowsBox.querySelectorAll('.matrix-order-row').length;
  if (remaining === 0) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = renderMatrixOrderRow(0, { qty: '', sup: '', customer_roll: 'normal', quality_b: 'normal', note: '' });
    rowsBox.appendChild(wrapper.firstElementChild);
  }

  renumberMatrixOrderRows();
}

function renumberMatrixOrderRows() {
  const rows = document.querySelectorAll('#matrixOrderRows .matrix-order-row');
  rows.forEach((row, idx) => {
    const label = row.querySelector('.row-label');
    if (label) label.textContent = `รายการที่ ${idx + 1}`;
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

function saveMatrixOrder(gradegram, size) {
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

    items.push({
      qty: String(Number(qty)),
      sup,
      customer_roll: cust,
      quality_b: qual,
      note
    });
  }

  if (!items.length) {
    if (!confirm('⚠️ ไม่มีรายการที่กรอก → ต้องการลบข้อมูลของ cell นี้ทั้งหมดหรือไม่?')) return;

    saveAlertItems(gradegram, size, []);
    closeModal('modalAlertMatrixCell');
    applyAlertFiltersAndRender();
    return;
  }

  saveAlertItems(gradegram, size, items);

  closeModal('modalAlertMatrixCell');
  applyAlertFiltersAndRender();

  const total = items.reduce((s, i) => s + Number(i.qty), 0);
  const msg = document.createElement('div');
  msg.className = 'msg ok';
  msg.style.cssText = 'position:fixed;top:80px;right:20px;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,.15)';
  msg.textContent = `✅ บันทึก ${items.length} รายการ (${gradegram}-${size}) รวม ${total} ม้วน`;
  document.body.appendChild(msg);
  setTimeout(() => msg.remove(), 2000);
}

// ═══════════════════════════════════════════════════════════════
//  DROPDOWN HELPER
// ═══════════════════════════════════════════════════════════════

function _attachAlertDropdown(btnId, dropdownId, boxId, docKey) {
  const btn = $(btnId);
  const dropdown = $(dropdownId);
  const box = $(boxId);
  if (!btn || !dropdown || !box) return;

  if (btn._alertDropdownClick) {
    btn.removeEventListener('click', btn._alertDropdownClick);
  }

  btn._alertDropdownClick = (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('hidden');
    btn.classList.toggle('open');
  };
  btn.addEventListener('click', btn._alertDropdownClick);

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
//  LOCALSTORAGE (ISO Date)
// ═══════════════════════════════════════════════════════════════

function alertLS_Key(gradegram, size) {
  return `${gradegram}|${size}`;
}

function loadAlertInputs(dateOrIdx) {
  try {
    let isoDate;
    if (typeof dateOrIdx === 'string') {
      isoDate = dateOrIdx;
    } else {
      const idx = (typeof dateOrIdx === 'number') ? dateOrIdx : alertActiveDateIdx;
      isoDate = alertReceiveDates[idx];
    }

    if (!isoDate) return {};

    const raw = localStorage.getItem(`${ALERT_LS_KEY_PREFIX}${isoDate}`);
    const data = raw ? JSON.parse(raw) : {};

    Object.keys(data).forEach(key => {
      const v = data[key];
      if (v && !v.items && (v.qty !== undefined || v.sup || v.customer_roll || v.quality_b || v.note)) {
        data[key] = {
          items: [{
            qty: v.qty || '',
            sup: v.sup || '',
            customer_roll: v.customer_roll || 'normal',
            quality_b: v.quality_b || 'normal',
            note: v.note || ''
          }]
        };
      }
      if (data[key] && !data[key].items) {
        data[key] = { items: [] };
      }
    });

    return data;
  } catch { return {}; }
}

function getAlertItems(gradegram, size, dateOrIdx) {
  const data = loadAlertInputs(dateOrIdx);
  const cell = data[alertLS_Key(gradegram, size)];
  return (cell?.items || []).filter(it => it.qty && Number(it.qty) > 0);
}

function saveAlertItems(gradegram, size, items, dateOrIdx) {
  const data = loadAlertInputs(dateOrIdx);
  const key = alertLS_Key(gradegram, size);

  if (!items || !items.length) {
    delete data[key];
  } else {
    data[key] = { items: items };
  }

  let isoDate;
  if (typeof dateOrIdx === 'string') isoDate = dateOrIdx;
  else if (typeof dateOrIdx === 'number') isoDate = alertReceiveDates[dateOrIdx];
  else isoDate = alertReceiveDates[alertActiveDateIdx];

  if (isoDate) {
    localStorage.setItem(`${ALERT_LS_KEY_PREFIX}${isoDate}`, JSON.stringify(data));
  }

  if (items && items.length && hasPOCreated()) {
    markAlertPOEdited();
  }
}

function getAlertQtyTotal(gradegram, size, dateOrIdx) {
  const items = getAlertItems(gradegram, size, dateOrIdx);
  return items.reduce((sum, it) => sum + (Number(it.qty) || 0), 0);
}

function getAlertInput(keyOrGradegram, dateOrIdx) {
  let gradegram, size;

  if (typeof keyOrGradegram === 'string' && keyOrGradegram.includes('|')) {
    [gradegram, size] = keyOrGradegram.split('|');
    size = Number(size);
  } else {
    gradegram = keyOrGradegram;
    size = dateOrIdx;
    dateOrIdx = undefined;
  }

  const items = getAlertItems(gradegram, size, dateOrIdx);
  return items.length > 0 ? items[0] : {};
}

function saveAlertInput(key, field, value) {
  const data = loadAlertInputs();
  if (!data[key]) data[key] = { items: [] };
  if (!data[key].items) data[key].items = [];

  if (data[key].items.length === 0) {
    data[key].items.push({ qty: '', sup: '', customer_roll: 'normal', quality_b: 'normal', note: '' });
  }
  data[key].items[0][field] = value;

  const isoDate = alertReceiveDates[alertActiveDateIdx];
  if (isoDate) {
    localStorage.setItem(`${ALERT_LS_KEY_PREFIX}${isoDate}`, JSON.stringify(data));
  }

  const MARK_FIELDS = ['qty', 'sup', 'customer_roll', 'quality_b', 'note'];
  if (MARK_FIELDS.includes(field) && hasPOCreated()) {
    markAlertPOEdited();
  }
}

// ═══════════════════════════════════════════════════════════════
//  PO FLAG
// ═══════════════════════════════════════════════════════════════

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

function clearPOFlags() {
  localStorage.removeItem(ALERT_PO_FLAG_KEY);
}

// ═══════════════════════════════════════════════════════════════
//  RECEIVE DATES
// ═══════════════════════════════════════════════════════════════

function getNextWorkingDay(baseDate = new Date()) {
  const d = new Date(baseDate);
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0) d.setDate(d.getDate() + 1);
  return toISODate(d);
}

function loadAlertReceiveDates() {
  try {
    const raw = localStorage.getItem(ALERT_RECEIVE_DATES_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function saveAlertReceiveDates() {
  localStorage.setItem(ALERT_RECEIVE_DATES_KEY, JSON.stringify(alertReceiveDates));
}

// 🔽 ฟังก์ชันใหม่: สำหรับเซ็ตวันที่แรกจาก Empty State 🔽
function setFirstAlertDate(dateValue) {
  if (!dateValue) {
    alert('กรุณาเลือกวันที่');
    return;
  }
  
  // เซ็ตวันที่แรก
  alertReceiveDates = [dateValue];
  alertActiveDateIdx = 0;
  saveAlertReceiveDates();
  
  // รีเฟรชหน้าจอ
  renderAlertDateTabs();
  renderAlert();
}

function addAlertReceiveDate() {
  const analyzedDate = $('alertDate')?.value;
  if (!analyzedDate) {
    alert('กรุณาเลือกวันที่วิเคราะห์ก่อน');
    return;
  }

  // 🔽 เริ่มคำนวณหาวันพรุ่งนี้ (ข้ามวันอาทิตย์) 🔽
  const tomorrow = new Date(analyzedDate);
  tomorrow.setDate(tomorrow.getDate() + 1); // พรุ่งนี้
  
  // ถ้าพรุ่งนี้เป็นวันอาทิตย์ (0) ให้บวกอีก 1 วันเป็นจันทร์
  if (tomorrow.getDay() === 0) {
    tomorrow.setDate(tomorrow.getDate() + 1);
  }
  const defaultNextDate = toISODate(tomorrow);
  // 🔼 จบการคำนวณ 🔼

  // ถ้ายังไม่มีวันที่เลย ให้เพิ่มวันพรุ่งนี้เข้าไปเลย
  if (alertReceiveDates.length === 0) {
    alertReceiveDates.push(defaultNextDate);
    saveAlertReceiveDates();
    renderAlertDateTabs();
    renderAlert(); // โหลดตารางทันที
    return;
  }

  // ถ้ามีวันที่อยู่แล้ว ให้หาวันว่างถัดไป (หลังจากวันสุดท้ายที่มี)
  const sorted = [...alertReceiveDates]
    .map(_parseLocalDate)
    .filter(Boolean)
    .sort((a, b) => a - b);

  const existing = new Set(alertReceiveDates);
  const lastD = sorted[sorted.length - 1];

  const nextD = _nextWorkingDay(lastD);
  while (nextD.getDay() === 0) nextD.setDate(nextD.getDate() + 1);

  const nextISO = toISODate(nextD);
  if (existing.has(nextISO)) {
    alert('⚠️ ไม่มีวันว่างให้เพิ่ม');
    return;
  }

  alertReceiveDates.push(nextISO);
  alertReceiveDates.sort((a, b) => _parseLocalDate(a) - _parseLocalDate(b));
  saveAlertReceiveDates();
  renderAlertDateTabs();
  renderAlert(); // โหลดตารางใหม่
}

function removeAlertReceiveDate(idx) {
  // ✅ ปลดล็อก: ให้ลบวันสุดท้ายได้ เพื่อกลับไปที่ Empty State
  if (!confirm('ลบวันที่นี้? ข้อมูลที่กรอกในวันนี้จะหายไปด้วย')) return;

  const dateToRemove = alertReceiveDates[idx];
  if (dateToRemove) {
    localStorage.removeItem(`${ALERT_LS_KEY_PREFIX}${dateToRemove}`);
  }

  if (alertActiveDateIdx >= idx) {
    alertActiveDateIdx = Math.max(0, alertActiveDateIdx - 1);
  }

  alertReceiveDates.splice(idx, 1);
  saveAlertReceiveDates();
  renderAlertDateTabs();
  
  // 🔽 สำคัญ: ให้เรียก renderAlert() เพื่ออัปเดตหน้าจอเป็น Empty State ทันที 🔽
  renderAlert(); 
}

function onAlertReceiveDateChange(idx, value) {
  if (!value) return;
  alertReceiveDates[idx] = value;
  saveAlertReceiveDates();
  renderAlertDateTabs();
}

function renderAlertReceiveDates() {
  renderAlertDateTabs();
}

function switchAlertDate(idx) {
  if (idx < 0 || idx >= alertReceiveDates.length) return;
  alertActiveDateIdx = idx;
  renderAlertDateTabs();
  renderAlert(); // โหลดตารางใหม่ (ข้อมูลจะถูกดึงจาก LocalStorage ของวันนั้น)
}

function renderAlertDateTabs() {
  const box = $('alertDateTabsBox');
  if (!box) return;

  let html = '<div class="alert-date-tabs-left">';
  html += '<span class="alert-date-label">📅 วันที่รับสินค้า:</span>';

  alertReceiveDates.forEach((d, i) => {
    const dObj = new Date(d);
    const dd = String(dObj.getDate()).padStart(2, '0');
    const mm = String(dObj.getMonth() + 1).padStart(2, '0');
    const yyyy = dObj.getFullYear() + 543;
    const display = `${dd}/${mm}/${yyyy}`;
    const active = i === alertActiveDateIdx ? 'active' : '';

    html += `<span class="alert-date-tab-wrap ${active ? 'is-active' : ''}">
      <button type="button" class="alert-date-tab ${active}" onclick="switchAlertDate(${i})">
        📅 ${display}
      </button>
      <button type="button" class="alert-date-tab-close" onclick="removeAlertReceiveDate(${i})" title="ลบวันนี้">✕</button>
    </span>`;
  });

  html += `<button type="button" class="alert-date-add-btn" onclick="addAlertReceiveDate()">+ เพิ่มวัน</button>`;
  html += '</div>';

  html += '<div class="alert-view-toggle-inline">';
  html += `<button type="button" class="${alertViewMode === 'flat' ? 'active' : ''}" onclick="setAlertViewMode('flat')">📋 รายการ</button>`;
  html += `<button type="button" class="${alertViewMode === 'matrix' ? 'active' : ''}" onclick="setAlertViewMode('matrix')">📊 Matrix</button>`;
  html += '</div>';

  box.innerHTML = html;
}

function initAlertReceiveDates() {
  alertReceiveDates = loadAlertReceiveDates();

  // ลบวันที่ที่เป็นวันอาทิตย์ออก
  alertReceiveDates = alertReceiveDates.filter(d => {
    const dt = _parseLocalDate(d);
    return dt && dt.getDay() !== 0;
  });

  // 🔽 แก้ไข: ไม่ต้องสร้างวันที่เริ่มต้นอัตโนมัติ ให้เริ่มที่ Array ว่างเลย 🔽
  // if (alertReceiveDates.length === 0) { ... } <-- ลบส่วนนี้ออก

  alertActiveDateIdx = 0;
  renderAlertDateTabs();
}

// ═══════════════════════════════════════════════════════════════
//  HELPER: FSC
// ═══════════════════════════════════════════════════════════════

function isFSCGrade(gradegram) {
  if (!gradegram) return false;
  const match = String(gradegram).match(/^([A-Z]+)/);
  if (!match) return false;
  return match[1].includes('F');
}

// ═══════════════════════════════════════════════════════════════
//  RENDER ALERT (Main)
// ═══════════════════════════════════════════════════════════════

async function renderAlert() {
  const snapshotMonth = $('alertSnapshotMonth')?.value;
  const stockDate     = $('alertStockDate')?.value;
  
  // 🔽 V.10.21: ปรับ Empty State ให้มี Date Picker เลือกวันแรกได้เลย 🔽
  if (alertReceiveDates.length === 0) {
    let html = `
      <div class="alert-date-tabs" style="display:flex; align-items:center; justify-content:space-between; background:#f8fafc; border:1px solid #e2e8f0; padding:8px; border-radius:6px; margin-bottom:15px; flex-wrap:wrap; gap:8px;">
        
        <!-- กรอบสีเหลือง + ช่องเลือกวันที่ + ปุ่มตกลง -->
        <div style="background: #fef3c7; border: 1px solid #fcd34d; color: #92400e; padding: 6px 12px; border-radius: 4px; font-size: 13px; font-weight: 600; display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <span>⚠️ กรุณาเลือกวันที่รับสินค้า:</span>
          
          <input type="date" id="firstReceiveDateInput" 
                 style="padding: 4px 8px; border: 1px solid #d97706; border-radius: 4px; font-family: inherit; font-size: 13px; color: #333; outline: none;">
          
          <button type="button" onclick="setFirstAlertDate(document.getElementById('firstReceiveDateInput').value)" 
                  style="background: #d97706; color: white; border: none; padding: 4px 12px; border-radius: 4px; font-size: 13px; cursor: pointer; font-weight: bold; transition: background 0.2s;">
            ตกลง
          </button>
        </div>
        
        <!-- ปุ่มสลับโหมด -->
        <div class="alert-view-toggle-inline" style="display:flex; gap:4px; margin-left:auto;">
          <button type="button" class="${alertViewMode === 'flat' ? 'active' : ''}" onclick="setAlertViewMode('flat')">📋 รายการ</button>
          <button type="button" class="${alertViewMode === 'matrix' ? 'active' : ''}" onclick="setAlertViewMode('matrix')">📊 Matrix</button>
        </div>

      </div>
    `;
    
    $('alertBody').innerHTML = html;
    return;
  }
  // 🔼 จบเงื่อนไข 🔼

  const receiveDate   = $('alertReceiveDate')?.value;

  if (!snapshotMonth || !stockDate || !receiveDate) {
    console.warn('[Alert] ข้ามการวิเคราะห์: ข้อมูลไม่ครบ');
    return;
  }

  if (!alertUsageRanges.length) {
    await loadUsagePlanRanges();
  }

  const stockDateTH = stockDate ? thaiDateFull(stockDate) : '-';
  const receiveDateTH = receiveDate ? thaiDateFull(receiveDate) : '-';

  $('alertReportTitle').innerHTML = `
    🚨 แจ้งเตือนสั่งซื้อ (Stock Alert)
    <div class="report-subtitle" style="font-size:12px;color:#64748b;margin-top:6px">
      (Stock Level: ${snapshotMonth} · Stock ${stockDateTH} · Receive ${receiveDateTH})
    </div>
  `;

  $('alertBody').innerHTML = '<p style="text-align:center;color:#94a3b8;padding:20px">กำลังวิเคราะห์...</p>';

  try {
    const { data, error } = await supabase.rpc('get_alert_matrix_v2', {
      p_snapshot_month: snapshotMonth,
      p_stock_date:     stockDate,
      p_receive_date:   receiveDate,
      p_usage_from:     alertUsageSelected?.date_from || null,
      p_usage_to:       alertUsageSelected?.date_to   || null,
    });
    if (error) throw error;

    let result = data || [];

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

    const uniqueMap = new Map();
    result.forEach(r => {
      const key = `${r.gradegram}|${Number(r.size)}`;
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, r);
      } else {
        console.warn('⚠️ พบข้อมูล Alert ซ้ำ:', key, 'ทำการรวมยอด...');
        const existing = uniqueMap.get(key);
        existing.alert = Number(existing.alert) + Number(r.alert);
        existing.stock = Number(existing.stock) + Number(r.stock);
        existing.receive = Number(existing.receive) + Number(r.receive);
      }
    });
    result = Array.from(uniqueMap.values());

    window._alertFullCache = [...result];

    alertAllSizes = [...new Set(result.map(r => Number(r.size)))].sort((a, b) => a - b);
    renderAlertSizeList();
    updateAlertSizeLabel();

    const display = result;

    let html = `<div id="alertDateTabsBox" class="alert-date-tabs"></div>`;

    if (!display.length) {
      html += '<p style="text-align:center;color:#94a3b8;padding:30px">ไม่มีรายการ 🎉</p>';
      $('alertBody').innerHTML = html;
      renderAlertDateTabs();
      alertCache = [];
      return;
    }

    html += '<div class="report-wrap alert-scroll"><table class="alert-flat-table"><thead><tr>';
    html += buildAlertTableHead();
    html += '</tr></thead><tbody></tbody></table></div>';
    html += buildAlertFoot();

    $('alertBody').innerHTML = html;

    alertCache = display;

    alertAllSupsInData = [...new Set(
      display.map(r => {
        const items = getAlertItems(r.gradegram, r.size);
        return items.map(it => it.sup || '');
      }).flat().filter(Boolean)
    )].sort();

    renderAllAlertFilters();
    renderAlertDateTabs();

    applyAlertFiltersAndRender();

    if (hasPOEdited()) {
      showPOEditedWarning();
      const flags = loadPOFlag();
      Object.keys(flags).forEach(k => { if (flags[k]) flags[k].edited = false; });
      savePOFlag(flags);
    }
  } catch (err) {
    console.error('renderAlert error:', err);
    $('alertBody').innerHTML = `<div class="msg err">เกิดข้อผิดพลาด: ${esc(err.message)}</div>`;
  }
}

// ═══════════════════════════════════════════════════════════════
//  PO EDITED WARNING
// ═══════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════
//  INPUT
// ═══════════════════════════════════════════════════════════════

function onAlertInput(gradegram, size, field, value, el) {
  const key = alertLS_Key(gradegram, size);
  saveAlertInput(key, field, value);

  if (el) {
    const isFilled = (field === 'customer_roll' || field === 'quality_b')
      ? (value && value !== 'normal')
      : (value && String(value).trim() !== '');
    el.classList.toggle('filled', !!isFilled);
  }

  if (field === 'sup' && value && !alertAllSupsInData.includes(value)) {
    alertAllSupsInData.push(value);
    alertAllSupsInData.sort();
    renderAlertSupFilterList();
  }

  const hasOrderFilter = !alertSelectedOrderFilters.includes('all') && alertSelectedOrderFilters.length > 0;
  const hasSupFilter = alertSelectedSupFilters.length > 0;
  if (field === 'qty' || field === 'sup' || hasOrderFilter || hasSupFilter) {
    applyAlertFiltersAndRender();
  }
}

// ═══════════════════════════════════════════════════════════════
//  CLEAR
// ═══════════════════════════════════════════════════════════════

function clearAlertInputs() {
  if (!confirm('⚠️ ล้างค่าที่กรอกของวันนี้ (สั่งซื้อ / Sup. / ม้วนลูกค้า / คุณภาพ B / หมายเหตุ)?')) return;

  const activeDate = alertReceiveDates[alertActiveDateIdx];
  if (activeDate) {
    localStorage.removeItem(`${ALERT_LS_KEY_PREFIX}${activeDate}`);
  }

  renderAlert();

  const msg = document.createElement('div');
  msg.className = 'msg ok';
  msg.style.cssText = 'position:fixed;top:80px;right:20px;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,.15)';
  msg.textContent = '✅ ล้างค่าของวันนี้แล้ว';
  document.body.appendChild(msg);
  setTimeout(() => msg.remove(), 2000);
}

function clearAllAlertInputsAllDates() {
  alertReceiveDates.forEach(date => {
    localStorage.removeItem(`${ALERT_LS_KEY_PREFIX}${date}`);
  });
}

// ═══════════════════════════════════════════════════════════════
//  CREATE PO
// ═══════════════════════════════════════════════════════════════

async function createPOFromAlert() {
  if (!alertCache || !alertCache.length) {
    alert('ไม่มีข้อมูล Alert');
    return;
  }

  const allItems = [];
  const processedCells = new Set();

  const uniqueDates = [...new Set(alertReceiveDates)].filter(Boolean);
  if (uniqueDates.length === 0) {
    alert('ไม่พบวันที่รับสินค้า');
    return;
  }

  for (let dateIdx = 0; dateIdx < uniqueDates.length; dateIdx++) {
    const dateKey = uniqueDates[dateIdx];

    for (const r of alertCache) {
      const cellKey = `${r.gradegram}|${Number(r.size)}|${dateKey}`;

      if (processedCells.has(cellKey)) continue;
      processedCells.add(cellKey);

      const items = getAlertItems(r.gradegram, r.size, dateKey);
      if (!items.length) continue;

      for (const it of items) {
        if (!it.qty || Number(it.qty) <= 0) continue;

        allItems.push({
          seq: allItems.length + 1,
          receive_date: dateKey,
          receive_date_idx: dateIdx,
          gradegram: r.gradegram,
          size: Number(r.size),
          gradegram_size: `${r.gradegram}-${Number(r.size).toFixed(2)}`,
          quantity: Number(it.qty),
          sup: it.sup || '',
          customer_roll: it.customer_roll || 'normal',
          quality_b: it.quality_b || 'normal',
          note: it.note || ''
        });
      }
    }
  }

  if (!allItems.length) {
    alert('กรุณากรอกจำนวนสั่งซื้ออย่างน้อย 1 รายการ');
    return;
  }

  _pendingPOItems = allItems;
  renderAlertPODetail(allItems);
  openModal('modalAlertPODetail');
}

function renderAlertPODetail(items) {
  const labelCustomer = v => ALERT_CUSTOMER_ROLLS.find(c => c.value === v)?.label || 'ปกติ';
  const labelQuality  = v => ALERT_QUALITY_B.find(q => q.value === v)?.label || 'ปกติ';

  const fmtDate = (d) => {
    const dObj = new Date(d);
    const dd = String(dObj.getDate()).padStart(2, '0');
    const mm = String(dObj.getMonth() + 1).padStart(2, '0');
    const yyyy = dObj.getFullYear() + 543;
    return `${dd}/${mm}/${yyyy}`;
  };

  const byDate = {};
  items.forEach(it => {
    const d = it.receive_date || 'unknown';
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(it);
  });

  let totalQty = 0;
  let html = `
    <div class="po-detail-summary">
      <div>📦 <b>${items.length}</b> รายการ</div>
      <div>🔢 รวม <b>${items.reduce((s, i) => s + i.quantity, 0)}</b> ม้วน</div>
      <div>📅 <b>${Object.keys(byDate).length}</b> วันรับสินค้า</div>
    </div>`;

  Object.keys(byDate).sort().forEach(dateKey => {
    const dayItems = byDate[dateKey];
    const dayTotal = dayItems.reduce((s, i) => s + i.quantity, 0);

    const supSummary = {};
    dayItems.forEach(it => {
      const sup = it.sup || '(ไม่ระบุ)';
      supSummary[sup] = (supSummary[sup] || 0) + Number(it.quantity || 0);
    });
    const supList = Object.keys(supSummary).sort()
      .map(sup => `${esc(sup)} ${supSummary[sup]} ม้วน`)
      .join(' · ');

    html += `
      <div class="po-detail-date-section">
        <div class="po-detail-date-head">📅 วันที่รับ: <b>${fmtDate(dateKey)}</b> · ${dayItems.length} รายการ · รวม ${dayTotal} ม้วน · ${supList}</div>
        <table>
          <thead><tr>
            <th style="width:50px">#</th>
            <th style="width:180px">Gradegram-Size</th>
            <th style="width:90px;text-align:center">Quantity</th>
            <th>หมายเหตุ</th>
          </tr></thead>
          <tbody>`;

    dayItems.forEach((it, idx) => {
      totalQty += it.quantity;

      const parts = [];
      if (it.customer_roll && it.customer_roll !== 'normal') {
        parts.push(labelCustomer(it.customer_roll));
      }
      if (it.quality_b && it.quality_b !== 'normal') {
        parts.push(labelQuality(it.quality_b));
      }
      if (it.note && it.note.trim() !== '') {
        parts.push(it.note);
      }
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
        <td colspan="2" style="text-align:right">รวมวันนี้ (ม้วน)</td>
        <td style="text-align:center;color:#dc2626;font-size:15px">${dayTotal}</td>
        <td></td>
      </tr></tfoot>
      </table>
      </div>`;
  });

  html += `<div class="po-detail-grand-total">
    <b>รวมทั้งหมด: ${totalQty} ม้วน</b>
  </div>`;

  $('alertPODetailBody').innerHTML = html;
}

function confirmCreatePO() {
  if (!_pendingPOItems || !_pendingPOItems.length) return;

  const confirmBtn = document.querySelector('#modalAlertPODetail .form-actions .primary');
  if (confirmBtn && confirmBtn.disabled) return;
  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.textContent = '⏳ กำลังสร้าง PO...';
  }

  const missingSup = _pendingPOItems.filter(it => !it.sup || String(it.sup).trim() === '');
  if (missingSup.length > 0) {
    alert(`⚠️ ไม่สามารถสร้าง PO ได้\n\nมี ${missingSup.length} รายการที่ยังไม่ได้ระบุผู้ขาย (Sup.)\nกรุณาตรวจสอบและเลือก Sup. ให้ครบก่อน`);
    if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = '✅ ยืนยันสร้าง PO'; }
    return;
  }

  const analyzedDate = toISODate(new Date());

  const uniqueDates = [...new Set(alertReceiveDates)].filter(Boolean);

  sessionStorage.setItem('alert_to_po', JSON.stringify({
    items: _pendingPOItems,
    analyzed_date: analyzedDate,
    receive_dates: uniqueDates,
    ref_snapshot: $('alertSnapshotMonth')?.value,
    ref_stock: $('alertStockDate')?.value,
    ref_receive: $('alertReceiveDate')?.value
  }));

  markAlertPOCreated(`ref_${Date.now()}`);

  saveAlertSnapshot(uniqueDates).then(res => {
    if (res.ok) console.log('✅ Alert snapshot saved:', res.data);
  });

  setTimeout(() => {
    closeModal('modalAlertPODetail');
    _pendingPOItems = [];

    const poBtn = document.querySelector('.nav button[data-tab="purchase-order"]');
    if (poBtn) poBtn.click();
    else alert('ยังไม่ได้เพิ่ม Tab Purchase Order');
  }, 300);
}

// ═══════════════════════════════════════════════════════════════
//  DETAIL MODAL
// ═══════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════
//  USAGE PLAN
// ═══════════════════════════════════════════════════════════════

async function loadUsagePlanRanges() {
  try {
    const { data, error } = await supabase.rpc('get_all_usage_plan_ranges');
    if (error) throw error;
    alertUsageRanges = data || [];
  } catch (e) {
    console.warn('loadUsagePlanRanges:', e);
    alertUsageRanges = [];
  }
}

async function onUsagePlanRangeChange(value) {
  if (!value || value === '__NONE__') {
    alertUsageSelected = null;
  } else {
    const [from, to] = value.split('|');
    alertUsageSelected = { date_from: from, date_to: to };
  }
  await renderAlert();
}

function renderUsageRangeDropdown() {
  const sel = $('alertUsageRange');
  if (!sel) return;

  if (!alertUsageRanges.length) {
    sel.innerHTML = '<option value="__NONE__">— ยังไม่มีข้อมูล —</option>';
    return;
  }

  let html = '<option value="__NONE__">— ไม่ใช้ —</option>';
  alertUsageRanges.forEach(r => {
    const fromThai = fmtDateThai(r.date_from);
    const toThai   = fmtDateThai(r.date_to);
    const selected = alertUsageSelected &&
                     alertUsageSelected.date_from === r.date_from &&
                     alertUsageSelected.date_to   === r.date_to;
    html += `<option value="${r.date_from}|${r.date_to}" ${selected ? 'selected' : ''}>
      ${fromThai} - ${toThai}
    </option>`;
  });
  sel.innerHTML = html;
}

// ─── Usage Plan Import ──────────────────────────────────────────

let _usagePlanRows = [];
let _usagePlanDateCols = [];

function parseExcelDateKey(key) {
  const m = String(key).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (!m) return null;
  const dd = m[1].padStart(2, '0');
  const mm = m[2].padStart(2, '0');
  const yyShort = Number(m[3]);
  const yearCE = 2000 + yyShort;
  const yearBE = yearCE + 543;
  return {
    iso:  `${yearCE}-${mm}-${dd}`,
    thai: `${dd}/${mm}/${yearBE}`
  };
}

function openUsagePlanImport() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.xlsx,.xls';
  input.onchange = e => handleUsagePlanFile(e.target.files[0]);
  input.click();
}

async function handleUsagePlanFile(file) {
  if (!file) return;
  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    if (!rows.length) {
      alert('ไฟล์ไม่มีข้อมูล');
      return;
    }

    const firstRow = rows[0];
    const dateCols = [];
    Object.keys(firstRow).forEach(k => {
      const parsed = parseExcelDateKey(k);
      if (parsed) dateCols.push({ key: k, ...parsed });
    });

    if (!dateCols.length) {
      alert('ไม่พบคอลัมน์วันที่ในไฟล์ (รูปแบบ DD/MM/YY)');
      return;
    }

    _usagePlanRows = rows;
    _usagePlanDateCols = dateCols.sort((a, b) => a.iso.localeCompare(b.iso));

    renderUsagePlanImportModal();
    openModal('modalUsagePlanImport');
  } catch (e) {
    console.error('handleUsagePlanFile:', e);
    alert('อ่านไฟล์ไม่สำเร็จ: ' + e.message);
  }
}

function renderUsagePlanImportModal() {
  const body = $('usagePlanImportBody');
  if (!body) return;

  const minDate = _usagePlanDateCols[0].iso;
  const maxDate = _usagePlanDateCols[_usagePlanDateCols.length - 1].iso;

  let html = `
    <div class="msg info" style="margin-bottom:12px">
      📊 พบ <b>${_usagePlanRows.length}</b> แถว · <b>${_usagePlanDateCols.length}</b> คอลัมน์วันที่<br>
      ช่วง: <b>${_usagePlanDateCols[0].thai}</b> ถึง <b>${_usagePlanDateCols[_usagePlanDateCols.length - 1].thai}</b>
    </div>

    <div class="form-grid" style="grid-template-columns:1fr 1fr;gap:12px">
      <label>📅 จากวันที่ (ค.ศ.)
        <input type="date" id="usagePlanFrom" value="${minDate}" min="${minDate}" max="${maxDate}">
      </label>
      <label>📅 ถึงวันที่ (ค.ศ.)
        <input type="date" id="usagePlanTo" value="${maxDate}" min="${minDate}" max="${maxDate}">
      </label>
    </div>

    <div class="hint" style="margin-top:12px">
      💡 ระบบจะรวมค่าทุกคอลัมน์ที่อยู่ในช่วงวันที่ที่เลือก
    </div>
  `;

  body.innerHTML = html;
}

async function confirmUsagePlanImport() {
  const from = $('usagePlanFrom')?.value;
  const to   = $('usagePlanTo')?.value;

  if (!from || !to) { alert('กรุณาเลือกช่วงวันที่'); return; }
  if (from > to) { alert('วันที่ "จาก" ต้องไม่เกิน "ถึง"'); return; }

  const activeCols = _usagePlanDateCols.filter(c => c.iso >= from && c.iso <= to);
  if (!activeCols.length) { alert('ไม่มีคอลัมน์วันที่อยู่ในช่วงที่เลือก'); return; }

  const result = [];
  const skipped = [];

  _usagePlanRows.forEach(row => {
    const gradegram = String(row['GRADE'] || '').trim().toUpperCase();
    const size = Number(row['SIZE']);
    if (!gradegram || !size) return;

    const targetNorm = normalizeGrade(gradegram);
    const targetRaw  = String(gradegram).toUpperCase();

    const spec = masterCache.find(m => {
      const mGrade = normalizeGrade(m.grade);
      const mGram  = String(m.gram);
      const mFull  = mGrade + mGram;
      return (mFull === targetNorm || mFull === targetRaw) && Number(m.size) === size;
    });

    if (!spec) { skipped.push(`${gradegram}/${size}`); return; }

    const stdWeight = Number(spec.std_weight_kg) || 0;
    if (stdWeight <= 0) { skipped.push(`${gradegram}/${size} (no std)`); return; }

    let totalKg = 0;
    activeCols.forEach(col => { totalKg += Number(row[col.key]) || 0; });

    if (totalKg <= 0) return;

    const rolls = Number((totalKg / stdWeight).toFixed(4));

    result.push({
      gradegram,
      size,
      usage_rolls: rolls,
      usage_kg: Number(totalKg.toFixed(2))
    });
  });

  if (!result.length) { alert('ไม่มีข้อมูลที่สามารถ import ได้'); return; }

  const btn = $('usagePlanImportConfirmBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'กำลังบันทึก...'; }

  try {
    const { data, error } = await supabase.rpc('import_usage_plan', {
      p_date_from: from,
      p_date_to: to,
      p_rows: result,
      p_user_id: currentUser?.id
    });
    if (error) throw error;

    if (!data?.success) throw new Error(data?.error || 'บันทึกไม่สำเร็จ');

    closeModal('modalUsagePlanImport');

    showToast(
      `✅ Import สำเร็จ ${data.inserted} รายการ` +
      (skipped.length ? ` · ข้าม ${skipped.length}` : ''),
      'ok', 4000
    );

    await loadUsagePlanRanges();
    renderUsageRangeDropdown();
    await renderAlert();
  } catch (e) {
    alert('❌ ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '💾 บันทึก'; }
  }
}

async function clearUsagePlan() {
  const from = prompt('📅 ลบ Usage Plan จากวันที่ (YYYY-MM-DD):');
  if (!from) return;
  const to = prompt('📅 ถึงวันที่ (YYYY-MM-DD):', from);
  if (!to) return;

  if (!confirm(`⚠️ ลบ Usage Plan ช่วง ${from} ถึง ${to}?`)) return;

  try {
    const { data, error } = await supabase.rpc('clear_usage_plan', {
      p_date_from: from, p_date_to: to
    });
    if (error) throw error;

    showToast(`✅ ลบ ${data?.deleted || 0} รายการ`, 'ok', 3000);

    alertUsageSelected = null;
    await loadUsagePlanRanges();
    renderUsageRangeDropdown();
    await renderAlert();
  } catch (e) {
    alert('❌ ' + e.message);
  }
}

// ═══════════════════════════════════════════════════════════════
//  ALERT HISTORY
// ═══════════════════════════════════════════════════════════════

// ✅ V.10.17: บังคับให้เป็นวันที่ปัจจุบันเสมอถ้ายังไม่มีค่า
function showAlertHistoryCard() {
  const card = $('alertHistoryCard');
  if (card) card.style.display = '';
  
  const dateEl = $('alertHistoryDate');
  // 🔽 บังคับให้เป็นวันที่ปัจจุบันเสมอถ้ายังไม่มีค่า 🔽
  if (dateEl && !dateEl.value) {
    dateEl.value = toISODate(new Date());
  }
}

function setAlertHistoryMode(mode) {
  if (mode !== 'matrix' && mode !== 'flat') return;
  alertHistoryMode = mode;
  document.querySelectorAll('#alertHistoryToggle button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });
  if (alertHistoryData) renderAlertHistory();
}

// ✅ V.10.17: ถ้ายังไม่มีวันที่ ให้ใส่วันที่ปัจจุบันเข้าไปก่อน
async function loadAlertHistory() {
  const dateEl = $('alertHistoryDate');
  
  // 🔽 ถ้ายังไม่มีวันที่ ให้ใส่วันที่ปัจจุบันเข้าไปก่อน 🔽
  if (dateEl && !dateEl.value) {
    dateEl.value = toISODate(new Date());
  }

  const date = dateEl?.value;
  if (!date) { alert('กรุณาเลือกวันที่'); return; }

  const body = $('alertHistoryBody');
  if (body) body.innerHTML = '<p style="text-align:center;color:#94a3b8;padding:30px">กำลังโหลด...</p>';

  try {
    const snapshot = await loadAlertSnapshot(date);

    if (!snapshot) {
      body.innerHTML = '<p style="text-align:center;color:#94a3b8;padding:30px">ไม่พบข้อมูลของวันนี้ 🎉</p>';
      alertHistoryData = null;
      alertHistoryMeta = null;
      return;
    }

    alertHistoryData = (snapshot.result_json || []).map(r => {
      if (r.gradegram) return r;
      const m = masterCache.find(x =>
        normalizeGrade(x.grade) === normalizeGrade(r.grade) &&
        x.size === r.size
      );
      return {
        ...r,
        gradegram: m ? (normalizeGrade(m.grade) + m.gram) : r.grade
      };
    });

    alertHistoryMeta = snapshot;

    if (!alertHistoryData.length) {
      body.innerHTML = '<p style="text-align:center;color:#94a3b8;padding:30px">ไม่มีรายการ</p>';
      return;
    }

    renderAlertHistory();
  } catch (e) {
    console.error('loadAlertHistory:', e);
    body.innerHTML = `<div class="msg err">โหลดไม่สำเร็จ: ${esc(e.message)}</div>`;
  }
}

function renderAlertHistory() {
  const body = $('alertHistoryBody');
  if (!body || !alertHistoryData || !alertHistoryMeta) return;

  const metaHtml = `
    <div class="alert-history-meta">
      <span class="item">📅 วันที่วิเคราะห์: <b>${fmtDateThai(alertHistoryMeta.analyzed_date)}</b></span>
      <span class="item">📊 Stock Level: <b>${alertHistoryMeta.snapshot_month || '-'}</b></span>
      <span class="item">📥 Stock Date: <b>${alertHistoryMeta.stock_date ? fmtDateThai(alertHistoryMeta.stock_date) : '-'}</b></span>
      <span class="item">📦 Receive Date: <b>${alertHistoryMeta.receive_date ? fmtDateThai(alertHistoryMeta.receive_date) : '-'}</b></span>
    </div>
  `;

  if (alertHistoryMode === 'matrix') {
    body.innerHTML = metaHtml + buildHistoryMatrixHtml(alertHistoryData);
  } else {
    body.innerHTML = metaHtml + buildHistoryFlatHtml(alertHistoryData);
  }
}

function buildHistoryMatrixHtml(rows) {
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
      if (a < 0)        cellCls = 'matrix-red';
      else if (a === 0) cellCls = 'matrix-yellow';
      else              cellCls = 'matrix-green';

      html += `<td class="matrix-cell ${cellCls} clickable"
                   onclick="openAlertHistoryCell('${esc(grade)}', ${size})">
                 <div class="matrix-value">${a > 0 ? '+' + a : a}</div>
               </td>`;
    });
    html += `<td class="total-col-matrix">${rowTotal > 0 ? '+' + rowTotal.toFixed(2) : rowTotal.toFixed(2)}</td>`;
    html += '</tr>';
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
  return html;
}

function buildHistoryFlatHtml(rows) {
  const sorted = [...rows].sort((a, b) => {
    if (a.gradegram !== b.gradegram) return a.gradegram.localeCompare(b.gradegram);
    return a.size - b.size;
  });

  let html = '<table class="alert-flat-table" style="width:100%"><thead><tr>';
  html += '<th>Gradegrams</th><th>Size</th><th>Stock Level</th><th>Stock</th><th>Receive</th>';
  html += '<th>Usage Plan</th><th>Alert</th><th>สถานะ</th><th>FSC</th>';
  html += '</tr></thead><tbody>';

  sorted.forEach(r => {
    const a = Number(r.alert) || 0;
    let rowCls, statusTxt;
    if (a < 0)        { rowCls = 'row-red';    statusTxt = `🔴 ขาด ${Math.ceil(Math.abs(a))}`; }
    else if (a === 0) { rowCls = 'row-yellow'; statusTxt = '🟡 พอดี'; }
    else              { rowCls = 'row-green';  statusTxt = `🟢 เกิน ${Math.floor(a)}`; }

    const isFSC = isFSCGrade(r.gradegram);
    const fscBadge = isFSC ? '🟢 FSC' : '⚪ Non-FSC';

    html += `<tr class="${rowCls}" style="cursor:pointer"
                 onclick="openAlertHistoryCell('${esc(r.gradegram)}', ${r.size})">
      <td class="grade-col">${esc(r.gradegram)}</td>
      <td>${r.size}</td>
      <td>${r.snapshot}</td>
      <td>${Number(r.stock).toFixed(2)}</td>
      <td>${r.receive}</td>
      <td>${r.usage_plan ? Number(r.usage_plan).toFixed(2) : '-'}</td>
      <td class="alert-cell"><b>${a > 0 ? '+' + a : a}</b></td>
      <td class="status-cell">${statusTxt}</td>
      <td>${fscBadge}</td>
    </tr>`;
  });

  html += '</tbody></table>';
  return html;
}

function openAlertHistoryCell(gradegram, size) {
  if (!alertHistoryData || !alertHistoryMeta) return;

  const r = alertHistoryData.find(x =>
    x.gradegram === gradegram && Number(x.size) === Number(size)
  );
  if (!r) { alert('ไม่พบข้อมูล'); return; }

  const a = Number(r.alert) || 0;
  let alertCls, alertTxt, alertIcon;
  if (a < 0)        { alertCls = 'red';    alertIcon = '🔴'; alertTxt = `ขาด ${Math.ceil(Math.abs(a))} ม้วน`; }
  else if (a === 0) { alertCls = 'yellow'; alertIcon = '🟡'; alertTxt = 'พอดี'; }
  else              { alertCls = 'green';  alertIcon = '🟢'; alertTxt = `เกิน ${Math.floor(a)} ม้วน`; }

  const titleEl = $('alertMatrixCellTitle');
  if (titleEl) {
    titleEl.innerHTML = `📜 ${esc(gradegram)}-${size} <span style="color:#64748b;font-weight:400;font-size:13px">
      (ย้อนหลัง · ${fmtDateThai(alertHistoryMeta.analyzed_date)})</span>`;
  }

  const bodyEl = $('alertMatrixCellBody');
  if (!bodyEl) return;

  let html = `
    <div class="matrix-cell-summary">
      <div class="matrix-cell-summary-title">
        📋 ข้อมูลย้อนหลัง
        <span class="alert-status-badge">${alertIcon} ${alertTxt}</span>
      </div>
      <div class="matrix-cell-grid">
        <div class="matrix-cell-row">
          <span class="label">Snapshot Month:</span>
          <span class="value blue">${alertHistoryMeta.snapshot_month || '-'}</span>
        </div>
        <div class="matrix-cell-row">
          <span class="label">Stock Date:</span>
          <span class="value">${alertHistoryMeta.stock_date ? fmtDateThai(alertHistoryMeta.stock_date) : '-'}</span>
        </div>
        <div class="matrix-cell-row">
          <span class="label">Receive Date:</span>
          <span class="value">${alertHistoryMeta.receive_date ? fmtDateThai(alertHistoryMeta.receive_date) : '-'}</span>
        </div>
        <div class="matrix-cell-row">
          <span class="label">Analyzed Date:</span>
          <span class="value">${fmtDateThai(alertHistoryMeta.analyzed_date)}</span>
        </div>
      </div>
      <div class="matrix-alert-big ${alertCls}">
        Alert: ${a > 0 ? '+' + a : a} ม้วน
      </div>
    </div>

    <div class="matrix-cell-summary" style="background:linear-gradient(135deg,#f8fafc,#f1f5f9);border-color:#cbd5e1">
      <div class="matrix-cell-summary-title">📊 ข้อมูลในตาราง Matrix</div>
      <div class="matrix-cell-grid">
        <div class="matrix-cell-row">
          <span class="label">Stock Level:</span>
          <span class="value blue">${r.snapshot || 0}</span>
        </div>
        <div class="matrix-cell-row">
          <span class="label">Stock:</span>
          <span class="value">${Number(r.stock || 0).toFixed(2)}</span>
        </div>
        <div class="matrix-cell-row">
          <span class="label">Receive:</span>
          <span class="value">${r.receive || 0}</span>
        </div>
        <div class="matrix-cell-row">
          <span class="label">Usage Plan:</span>
          <span class="value">${r.usage_plan ? Number(r.usage_plan).toFixed(2) : '-'}</span>
        </div>
      </div>
    </div>

    <div class="alert-history-note" style="margin-top:12px">
      ⚠️ ข้อมูลย้อนหลัง — ไม่สามารถแก้ไข/สั่งซื้อได้
    </div>
  `;

  bodyEl.innerHTML = html;
  openModal('modalAlertMatrixCell');
}

// ═══════════════════════════════════════════════════════════════
//  EXPORT
// ═══════════════════════════════════════════════════════════════

function exportAlert() {
  if (!alertCache || !alertCache.length) return alert('ไม่มีข้อมูล');

  const data = alertCache.map(r => {
    const items = getAlertItems(r.gradegram, r.size);
    const firstItem = items.length > 0 ? items[0] : {};
    const totalQty = getAlertQtyTotal(r.gradegram, r.size);

    return {
      Gradegrams: r.gradegram,
      Size: r.size,
      Snapshot: r.snapshot,
      Stock: r.stock,
      Receive: r.receive,
      'Usage Plan': r.usage_plan || 0,
      Alert: r.alert,
      สถานะ: r.alert < 0 ? `ขาด ${Math.ceil(Math.abs(r.alert))}` : (r.alert === 0 ? 'พอดี' : `เกิน ${Math.floor(r.alert)}`),
      'จำนวนรายการ': items.length,
      สั่งซื้อ: totalQty || '',
      Sup: items.map(it => it.sup).filter(Boolean).join(', '),
      'ม้วนลูกค้า': firstItem.customer_roll
        ? (ALERT_CUSTOMER_ROLLS.find(c => c.value === firstItem.customer_roll)?.label || 'ปกติ')
        : 'ปกติ',
      'คุณภาพ B': firstItem.quality_b
        ? (ALERT_QUALITY_B.find(q => q.value === firstItem.quality_b)?.label || 'ปกติ')
        : 'ปกติ',
      FSC: isFSCGrade(r.gradegram) ? 'FSC' : 'Non-FSC',
      หมายเหตุ: items.map(it => it.note).filter(Boolean).join(', ')
    };
  });
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Alert');
  XLSX.writeFile(wb, `alert_${new Date().toISOString().slice(0,10)}.xlsx`);
}

// ═══════════════════════════════════════════════════════════════
//  HELPER: BUILD TABLE HEAD / FOOT
// ═══════════════════════════════════════════════════════════════

function buildAlertTableHead() {
  let html = '';

  // Gradegrams
  html += `<th class="th-with-filter">
    <div class="th-filter-wrap" id="alertGradeFilterBox">
      <button type="button" class="th-filter-btn" id="alertGradeFilterBtn">
        <span id="alertGradeFilterLabel">Gradegrams</span>
        <span class="arrow">▼</span>
      </button>
      <div class="grade-dropdown hidden" id="alertGradeDropdown" style="min-width:220px">
        <div class="grade-actions">
          <button type="button" onclick="selectAllAlertGrades()">✓ เลือกทั้งหมด</button>
          <button type="button" onclick="clearAllAlertGrades()">✗ ล้างทั้งหมด</button>
        </div>
        <div class="grade-list" id="alertGradeList"></div>
      </div>
    </div>
  </th>`;

  // Size
  html += `<th class="th-with-filter">
    <div class="th-filter-wrap" id="alertSizeFilterBox">
      <button type="button" class="th-filter-btn" id="alertSizeFilterBtn">
        <span id="alertSizeLabel">Size</span>
        <span class="arrow">▼</span>
      </button>
      <div class="grade-dropdown hidden" id="alertSizeDropdown" style="min-width:160px">
        <div class="grade-actions">
          <button type="button" onclick="selectAllAlertSizes()">✓ เลือกทั้งหมด</button>
          <button type="button" onclick="clearAllAlertSizes()">✗ ล้างทั้งหมด</button>
        </div>
        <div class="grade-list" id="alertSizeList"></div>
      </div>
    </div>
  </th>`;

  html += '<th>Stock Level</th>';

  // Stock
  html += `<th class="th-with-filter">
    <div class="th-filter-wrap" id="alertStockFilterBox">
      <button type="button" class="th-filter-btn" id="alertStockFilterBtn">
        <span id="alertStockFilterLabel">Stock</span>
        <span class="arrow">▼</span>
      </button>
      <div class="grade-dropdown hidden" id="alertStockFilterDropdown" style="min-width:180px">
        <div class="grade-actions">
          <button type="button" onclick="selectAllAlertStockFilters()">✓ เลือกทั้งหมด</button>
          <button type="button" onclick="clearAllAlertStockFilters()">✗ ล้างทั้งหมด</button>
        </div>
        <div class="grade-list" id="alertStockFilterList"></div>
      </div>
    </div>
  </th>`;

  // Receive
  html += `<th class="th-with-filter">
    <div class="th-filter-wrap" id="alertReceiveFilterBox">
      <button type="button" class="th-filter-btn" id="alertReceiveFilterBtn">
        <span id="alertReceiveFilterLabel">Receive</span>
        <span class="arrow">▼</span>
      </button>
      <div class="grade-dropdown hidden" id="alertReceiveFilterDropdown" style="min-width:180px">
        <div class="grade-actions">
          <button type="button" onclick="selectAllAlertReceiveFilters()">✓ เลือกทั้งหมด</button>
          <button type="button" onclick="clearAllAlertReceiveFilters()">✗ ล้างทั้งหมด</button>
        </div>
        <div class="grade-list" id="alertReceiveFilterList"></div>
      </div>
    </div>
  </th>`;

  // Usage Plan
  html += `<th class="th-with-filter">
    <div class="th-filter-wrap" id="alertUsageFilterBox">
      <button type="button" class="th-filter-btn" id="alertUsageFilterBtn">
        <span id="alertUsageFilterLabel">Usage Plan</span>
        <span class="arrow">▼</span>
      </button>
      <div class="grade-dropdown hidden" id="alertUsageFilterDropdown" style="min-width:180px">
        <div class="grade-actions">
          <button type="button" onclick="selectAllAlertUsageFilters()">✓ เลือกทั้งหมด</button>
          <button type="button" onclick="clearAllAlertUsageFilters()">✗ ล้างทั้งหมด</button>
        </div>
        <div class="grade-list" id="alertUsageFilterList"></div>
      </div>
    </div>
  </th>`;

  // Alert
  html += `<th class="th-with-filter">
    <div class="th-filter-wrap" id="alertFilterBox">
      <button type="button" class="th-filter-btn" id="alertFilterBtn">
        <span id="alertFilterLabel">Alert</span>
        <span class="arrow">▼</span>
      </button>
      <div class="grade-dropdown hidden" id="alertFilterDropdown" style="min-width:200px">
        <div class="grade-actions">
          <button type="button" onclick="selectAllAlertFilters()">✓ เลือกทั้งหมด</button>
          <button type="button" onclick="clearAllAlertFilters()">✗ ล้างทั้งหมด</button>
        </div>
        <div class="grade-list" id="alertFilterList"></div>
      </div>
    </div>
  </th>`;

  html += '<th>สถานะ</th>';

  // Order
  html += `<th class="th-with-filter">
    <div class="th-filter-wrap" id="alertOrderFilterBox">
      <button type="button" class="th-filter-btn" id="alertOrderFilterBtn">
        <span id="alertOrderFilterLabel">สั่งซื้อ</span>
        <span class="arrow">▼</span>
      </button>
      <div class="grade-dropdown hidden" id="alertOrderFilterDropdown" style="min-width:180px">
        <div class="grade-actions">
          <button type="button" onclick="selectAllAlertOrderFilters()">✓ เลือกทั้งหมด</button>
          <button type="button" onclick="clearAllAlertOrderFilters()">✗ ล้างทั้งหมด</button>
        </div>
        <div class="grade-list" id="alertOrderFilterList"></div>
      </div>
    </div>
  </th>`;

  // Sup
  html += `<th class="th-with-filter">
    <div class="th-filter-wrap" id="alertSupFilterBox">
      <button type="button" class="th-filter-btn" id="alertSupFilterBtn">
        <span id="alertSupFilterLabel">Sup.</span>
        <span class="arrow">▼</span>
      </button>
      <div class="grade-dropdown hidden" id="alertSupFilterDropdown" style="min-width:180px">
        <div class="grade-actions">
          <button type="button" onclick="selectAllAlertSupFilters()">✓ เลือกทั้งหมด</button>
          <button type="button" onclick="clearAllAlertSupFilters()">✗ ล้างทั้งหมด</button>
        </div>
        <div class="grade-list" id="alertSupFilterList"></div>
      </div>
    </div>
  </th>`;

  html += '<th>ม้วนลูกค้า</th><th>คุณภาพ B</th><th>FSC</th><th>หมายเหตุ</th>';

  return html;
}

function buildAlertFoot() {
  const footCache = window._alertFullCache || alertCache || [];
  const footShortage = footCache.filter(r => Number(r.alert) < 0).length;
  const footOK       = footCache.filter(r => Number(r.alert) === 0).length;
  const footOver     = footCache.filter(r => Number(r.alert) > 0).length;

  return `<div class="report-foot" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
    <div class="alert-foot-summary">
      <span class="item red">🔴 ${footShortage}</span>
      <span class="item yellow">🟡 ${footOK}</span>
      <span class="item green">🟢 ${footOver}</span>
    </div>
    <div style="display:flex;gap:6px">
      <button class="primary" onclick="createPOFromAlert()">📄 สร้าง PO</button>
      <button class="danger" onclick="clearAlertInputs()">🗑 ล้างค่า</button>
    </div>
  </div>`;
}

function renderAllAlertFilters() {
  renderAlertGradeList();
  renderAlertSizeList();
  renderAlertFilterList();
  renderAlertOrderFilterList();
  renderAlertSupFilterList();
  renderAlertStockFilterList();
  renderAlertReceiveFilterList();
  renderAlertUsageFilterList();

  updateAlertGradeLabel();
  updateAlertSizeLabel();
  updateAlertFilterLabel();
  updateAlertOrderFilterLabel();
  updateAlertSupFilterLabel();
  updateAlertStockFilterLabel();
  updateAlertReceiveFilterLabel();
  updateAlertUsageFilterLabel();

  _attachAlertDropdown('alertGradeFilterBtn', 'alertGradeDropdown', 'alertGradeFilterBox', 'alertGrade');
  _attachAlertDropdown('alertSizeFilterBtn', 'alertSizeDropdown', 'alertSizeFilterBox', 'alertSize');
  _attachAlertDropdown('alertFilterBtn', 'alertFilterDropdown', 'alertFilterBox', 'alertFilter');
  _attachAlertDropdown('alertOrderFilterBtn', 'alertOrderFilterDropdown', 'alertOrderFilterBox', 'alertOrderFilter');
  _attachAlertDropdown('alertSupFilterBtn', 'alertSupFilterDropdown', 'alertSupFilterBox', 'alertSupFilter');
  _attachAlertDropdown('alertStockFilterBtn', 'alertStockFilterDropdown', 'alertStockFilterBox', 'alertStockFilter');
  _attachAlertDropdown('alertReceiveFilterBtn', 'alertReceiveFilterDropdown', 'alertReceiveFilterBox', 'alertReceiveFilter');
  _attachAlertDropdown('alertUsageFilterBtn', 'alertUsageFilterDropdown', 'alertUsageFilterBox', 'alertUsageFilter');
}
