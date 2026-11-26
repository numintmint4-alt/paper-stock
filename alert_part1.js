// ═══════════════════════════════════════════════════════════════
//  STOCK V10.1 — alert.js — V.18.0 (Part 1/3)
//  STATE + INIT + FILTERS + APPLY FILTERS
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

// 🔥 Draft in-memory
let _draftPendingItems = [];

// 🔥 DB cache
let _dbAlertInputs = {};      // { "2026-11-14": { "CA125|44": [items] } }
let _dbReceiveDates = [];

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

const ALERT_PO_FLAG_KEY = 'stockv8_alert_po_created';

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

function fmtDateThai(d) {
  if (!d) return '-';
  const dObj = new Date(d);
  const dd = String(dObj.getDate()).padStart(2, '0');
  const mm = String(dObj.getMonth() + 1).padStart(2, '0');
  const yyyy = dObj.getFullYear() + 543;
  return `${dd}/${mm}/${yyyy}`;
}

// ═══════════════════════════════════════════════════════════════
//  LAZY INIT: firstReceiveDateInput Flatpickr
// ═══════════════════════════════════════════════════════════════

function initFirstReceiveDatePicker() {
  const el = document.getElementById('firstReceiveDateInput');
  if (!el) return;
  if (window.flatpickrInstances && window.flatpickrInstances['firstReceiveDateInput']) return;

  el.setAttribute('type', 'text');
  el.setAttribute('placeholder', 'YYYY-MM-DD');
  el.setAttribute('autocomplete', 'new-password');

  if (!window.flatpickrInstances) window.flatpickrInstances = {};

  window.flatpickrInstances['firstReceiveDateInput'] = flatpickr(el, {
    locale: "th",
    dateFormat: "Y-m-d",
    allowInput: false,
    disableMobile: true
  });

  console.log('[Alert] ✅ initFirstReceiveDatePicker() ready');
}

// ═══════════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════════

async function initAlertTab() {
  const today = getTodayISO();
  const currentMonthStr = today.slice(0, 7);

  const yesterday = new Date(today + 'T00:00:00');
  yesterday.setDate(yesterday.getDate() - 1);
  if (yesterday.getDay() === 0) yesterday.setDate(yesterday.getDate() - 1);
  const stockDate = toISODate(yesterday);

  const alertDateEl = $('alertDate');
  if (alertDateEl) {
    alertDateEl.value = today;
    alertDateEl.readOnly = true;
    alertDateEl.style.pointerEvents = 'none';
    alertDateEl.style.background = '#f1f5f9';
    alertDateEl.style.cursor = 'not-allowed';
  }

  if (window.flatpickrInstances && window.flatpickrInstances['alertDate']) {
    window.flatpickrInstances['alertDate'].setDate(today, false);
  }
  if (window.flatpickrInstances && window.flatpickrInstances['alertStockDate']) {
    window.flatpickrInstances['alertStockDate'].setDate(stockDate, false);
  }
  if (window.flatpickrInstances && window.flatpickrInstances['alertReceiveDate']) {
    window.flatpickrInstances['alertReceiveDate'].setDate(today, false);
  }

  const monthInput = $('alertSnapshotMonth');
  if (monthInput) monthInput.value = currentMonthStr;

  console.log('[initAlertTab] today       =', today);
  console.log('[initAlertTab] stockDate   =', stockDate);

  attachAlertDateListener();

  await loadAlertSuppliers();
  await loadSnapshotMonths();

  if (monthInput) monthInput.value = currentMonthStr;

  await loadAlertGradeFilter();
  loadAlertFilter();
  await initAlertReceiveDates();
  await loadUsagePlanRanges();
  renderUsageRangeDropdown();

  await onAlertDateChange();

  showAlertHistoryCard();

  if (alertReceiveDates.length > 0 && window._alertFullCache && window._alertFullCache.length > 0) {
    if (alertViewMode === 'matrix') applyAlertFiltersAndRender();
  }

  if (typeof loadAlertHistory === 'function') loadAlertHistory();
}

function applyCalculatedDates(analyzedDate) {
  if (!analyzedDate) return;
  const stockDate = calcStockDate(analyzedDate);
  if (window.flatpickrInstances && window.flatpickrInstances['alertStockDate']) {
    window.flatpickrInstances['alertStockDate'].setDate(stockDate, false);
  }
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
//  ALERT HISTORY (save / load)
// ═══════════════════════════════════════════════════════════════

async function saveAlertSnapshot(receiveDates) {
  const analyzedDate = getISODateFromInput('alertDate');
  if (!analyzedDate) return { ok: false, error: 'ไม่มีวันที่วิเคราะห์' };

  try {
    // V.18.6 FIX: บันทึกชุดข้อมูลเต็ม ไม่ใช่ชุดที่ถูกฟิลเตอร์
    const fullData = (window._alertFullCache && window._alertFullCache.length) ? window._alertFullCache : alertCache;
    const summary = {
      shortage: fullData.filter(r => Number(r.alert) < 0).length,
      ok:       fullData.filter(r => Number(r.alert) === 0).length,
      over:     fullData.filter(r => Number(r.alert) > 0).length,
      total:    fullData.length
    };

    const filters = {
      grades: [...alertSelectedGrades],
      sizes: [...alertSelectedSizes],
      alert_filters: [...alertSelectedFilters]
    };

    const payload = {
      analyzed_date:  analyzedDate,
      snapshot_month: $('alertSnapshotMonth')?.value || null,
      stock_date:     getISODateFromInput('alertStockDate') || null,
      receive_date:   getISODateFromInput('alertReceiveDate') || null,
      receive_dates:  receiveDates || [...alertReceiveDates],
      summary_json:   summary,
      result_json:    fullData,
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

async function onAlertDateChange() {
  const analyzedDate = getISODateFromInput('alertDate');
  if (!analyzedDate) return;

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

    if (snapshot.receive_dates && Array.isArray(snapshot.receive_dates)) {
      alertReceiveDates = [...snapshot.receive_dates];
      renderAlertDateTabs();
    }

    alertCache = snapshot.result_json || [];
    await renderAlertFromCache();
  } catch (e) {
    console.error('applyAlertSnapshot:', e);
    $('alertBody').innerHTML = `<div class="msg err">โหลด snapshot ไม่สำเร็จ: ${esc(e.message)}</div>`;
  }
}

// ═══════════════════════════════════════════════════════════════
//  RENDER ALERT FROM CACHE
// ═══════════════════════════════════════════════════════════════

async function renderAlertFromCache() {
  if (!alertCache || !alertCache.length) {
    $('alertBody').innerHTML = '<p style="text-align:center;color:#94a3b8;padding:30px">ไม่มีข้อมูล</p>';
    return;
  }

  window._alertFullCache = [...alertCache];

  let html = `<div id="alertDateTabsBox" class="alert-date-tabs"></div>`;

  html += '<div class="report-wrap alert-scroll" style="display:none;"><table class="alert-flat-table"><thead><tr>';
  html += buildAlertTableHead();
  html += '</tr></thead><tbody></tbody></table></div>';
  html += buildAlertFoot();

  $('alertBody').innerHTML = html;

  renderAlertDateTabs();
  renderAllAlertFilters();
  renderAlertReceiveDates();

  await _loadActiveInputsToMemory();

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
      // ค่าเริ่มต้นถูก set ใน initAlertTab แล้ว
    }
  } catch (e) {
    console.warn('loadSnapshotMonths:', e);
  }
}

// ═══════════════════════════════════════════════════════════════
//  FILTERS
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

  if (alertSelectedGrades.length > 0) result = result.filter(r => alertSelectedGrades.includes(r.gradegram));
  if (alertSelectedSizes.length > 0) result = result.filter(r => alertSelectedSizes.includes(Number(r.size)));

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
      if (!items.length) return alertSelectedSupFilters.includes('__NONE__');
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
//  END OF PART 1 — ต่อใน alert_part2.js
// ═══════════════════════════════════════════════════════════════
