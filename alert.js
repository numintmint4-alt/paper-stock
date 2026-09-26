// ═══════════════════════════════════════════════════════════════
// STOCK V8 — alert.js (Flat Table + Filter + PO + Lock Date + FSC + History + Lock + Usage Plan)
// ═══════════════════════════════════════════════════════════════

let alertSelectedGrades = [];
let alertAllGrades = [];
let alertCache = [];
let alertSupplierCache = [];

// ✅ Size Filter
let alertSelectedSizes = [];
let alertAllSizes = [];

// ✅ Alert Filter
let alertSelectedFilters = ['all'];
const ALERT_ALL_FILTERS = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'lt0', label: '🔴 ขาด (< 0)' },
  { value: 'eq0', label: '🟡 พอดี (= 0)' },
  { value: 'gt0', label: '🟢 เกิน (> 0)' }
];

// ✅ Filter "สั่งซื้อ" (Order Qty)
let alertSelectedOrderFilters = ['all'];
const ALERT_ORDER_FILTERS = [
  { value: 'all',        label: 'ทั้งหมด' },
  { value: 'filled',     label: '✅ กรอกแล้ว' },
  { value: 'not_filled', label: '⬜ ยังไม่กรอก' }
];

// ✅ Filter "Sup." (Supplier)
let alertSelectedSupFilters = [];
let alertAllSupsInData = [];

// ✅ Filter "Stock" (รอบ 2)
let alertSelectedStockFilters = ['all'];
const ALERT_STOCK_FILTERS = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'eq0', label: '= 0' },
  { value: 'gt0', label: '> 0' },
  { value: 'lt0', label: '< 0' }
];

// ✅ Filter "Receive" (รอบ 2)
let alertSelectedReceiveFilters = ['all'];
const ALERT_RECEIVE_FILTERS = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'eq0', label: '= 0' },
  { value: 'gt0', label: '> 0' },
  { value: 'lt0', label: '< 0' }
];

// ✅ Filter "Usage Plan" (Phase 6)
let alertSelectedUsageFilters = ['all'];
const ALERT_USAGE_FILTERS = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'has', label: 'มี Usage' },
  { value: 'none', label: 'ไม่มี Usage' }
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

// ✅ แยกตามวันที่
const ALERT_LS_KEY_PREFIX = 'stockv8_alert_inputs_v';
const ALERT_PO_FLAG_KEY = 'stockv8_alert_po_created';
const ALERT_RECEIVE_DATES_KEY = 'stockv8_alert_receive_dates';

let alertReceiveDates = [];
let alertActiveDateIdx = 0;

// ✅ Usage Plan — ช่วงวันที่ที่ user เลือก
let alertUsageRanges = [];      // [{ date_from, date_to }]
let alertUsageSelected = null;  // { date_from, date_to } หรือ null

function getAlertLSKey(dateIdx = alertActiveDateIdx) {
  return `${ALERT_LS_KEY_PREFIX}${dateIdx + 1}`;
}

// ================= DATE HELPERS =================
function _parseLocalDate(iso) {
  if (!iso) return null;
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(y, m - 1, d);
}

function _nextWorkingDay(fromDate) {
  const d = new Date(fromDate);
  d.setDate(d.getDate() + 1);
  if (d.getDay() === 0) d.setDate(d.getDate() + 1);
  return d;
}

function calcStockDate(analyzedDate) {
  if (!analyzedDate) return '';
  const d = new Date(analyzedDate);
  d.setDate(d.getDate() - 1);
  if (d.getDay() === 0) {
    d.setDate(d.getDate() - 1);
  }
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

let _pendingPOItems = [];

// ================= INIT =================
async function initAlertTab() {
  const today = toISODate(new Date());

  const alertDateEl = $('alertDate');
  if (alertDateEl && !alertDateEl.value) alertDateEl.value = today;

  applyCalculatedDates($('alertDate')?.value || today);
  attachAlertDateListener();

  await loadAlertSuppliers();
  await loadSnapshotMonths();
  await loadAlertGradeFilter();
  loadAlertFilter();
  initAlertReceiveDates();

  // ✅ โหลด Usage Ranges + render dropdown
  await loadUsagePlanRanges();
  renderUsageRangeDropdown();

  await onAlertDateChange();
}

function applyCalculatedDates(analyzedDate) {
  if (!analyzedDate) return;

  const stockDate = calcStockDate(analyzedDate);
  const receiveDate = calcReceiveDate(analyzedDate);
  const snapshotMonth = calcSnapshotMonth(analyzedDate);

  if ($('alertStockDate')) $('alertStockDate').value = stockDate;
  if ($('alertReceiveDate')) $('alertReceiveDate').value = receiveDate;
  if ($('alertSnapshotMonth') && !$('alertSnapshotMonth').value) {
    $('alertSnapshotMonth').value = snapshotMonth;
  }
}

function attachAlertDateListener() {
  const el = $('alertDate');
  if (el && el.dataset.listenerAttached !== '1') {
    el.dataset.listenerAttached = '1';
    el.addEventListener('change', () => {
      applyCalculatedDates(el.value);
      onAlertDateChange();
    });
  }
}

// ================= ALERT HISTORY =================
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

async function onAlertDateChange() {
  const analyzedDate = $('alertDate')?.value;
  if (!analyzedDate) return;

  $('alertBody').innerHTML = '<p style="text-align:center;color:#94a3b8;padding:20px">กำลังโหลด...</p>';

  const snapshot = await loadAlertSnapshot(analyzedDate);

  if (snapshot) {
    await applyAlertSnapshot(snapshot);

    // ✅ lock เฉพาะเมื่อ snapshot เป็นของ "วันเก่า" (ข้ามวันมาแล้ว)
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

    // ✅ ล็อกทุกช่อง "ยกเว้น alertDate" → user เปลี่ยนวันกลับไปดูวันอื่นได้เสมอ
    ['alertStockDate', 'alertReceiveDate', 'alertSnapshotMonth', 'alertIncludeCustomer'].forEach(id => {
      const el = $(id);
      if (el) el.disabled = true;
    });

    // ✅ alertDate ต้องเปิดใช้งานเสมอ — ไม่แตะเลย
    const dateEl = $('alertDate');
    if (dateEl) {
      dateEl.disabled = false;
      dateEl.style.background = '';
      dateEl.style.cursor = '';
    }

    document.querySelectorAll('[onclick*="createPOFromAlert"], [onclick*="clearAlertInputs"]').forEach(btn => {
      btn.disabled = true;
      btn.style.opacity = '0.4';
      btn.style.cursor = 'not-allowed';
    });

  } else {
    if (lockBanner) lockBanner.classList.add('hidden');
    if (body) body.classList.remove('alert-locked');

    // ✅ ปลดล็อกทุกช่อง
    ['alertStockDate', 'alertReceiveDate', 'alertSnapshotMonth', 'alertIncludeCustomer'].forEach(id => {
      const el = $(id);
      if (el) {
        el.disabled = false;
        el.style.background = '';
        el.style.cursor = '';
      }
    });

    // ✅ alertDate เปิดใช้งานเสมอ
    const dateEl = $('alertDate');
    if (dateEl) {
      dateEl.disabled = false;
      dateEl.style.background = '';
      dateEl.style.cursor = '';
    }

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

    // ✅ ไม่ลบ inputs — เก็บถาวรจนกว่าจะกด "ล้างค่า"
    // clearAllAlertInputsAllDates();

    alertCache = snapshot.result_json || [];
    renderAlertFromCache();
  } catch (e) {
    console.error('applyAlertSnapshot:', e);
    $('alertBody').innerHTML = `<div class="msg err">โหลด snapshot ไม่สำเร็จ: ${esc(e.message)}</div>`;
  }
}

// ✅ Render Alert จาก cache (ไม่ต้อง query RPC)
function renderAlertFromCache() {
  if (!alertCache || !alertCache.length) {
    $('alertBody').innerHTML = '<p style="text-align:center;color:#94a3b8;padding:30px">ไม่มีข้อมูล</p>';
    return;
  }

  // ✅ เก็บ full cache
  window._alertFullCache = [...alertCache];

  // ✅ Render (summary ย้ายไปอยู่ใน date tabs แล้ว)
  let html = `<div id="alertDateTabsBox" class="alert-date-tabs"></div>`;

  const sorted = [...alertCache].sort((a, b) => {
    if (a.gradegram !== b.gradegram) return a.gradegram.localeCompare(b.gradegram);
    return a.size - b.size;
  });

  html += '<div class="report-wrap alert-scroll"><table class="alert-flat-table"><thead><tr>';
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
  html += '<th>Snapshot</th>';

  // ✅ Stock Filter
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

  // ✅ Receive Filter
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

  // ✅ Usage Plan (คอลัมน์ใหม่ + Filter)
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
  html += '</tr></thead><tbody>';

  let grandShortage = 0;

  sorted.forEach(r => {
    const a = Number(r.alert) || 0;
    let rowCls, statusTxt;
    if (a < 0)      { rowCls = 'row-red';    statusTxt = `🔴 ขาด ${Math.ceil(Math.abs(a))}`; grandShortage += Math.abs(a); }
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

    const isFSC = isFSCGrade(r.gradegram);
    const fscBadge = isFSC
      ? '<span class="badge ok" style="font-size:10px">🟢 FSC</span>'
      : '<span class="badge" style="background:#f1f5f9;color:#64748b;font-size:10px">⚪ Non-FSC</span>';

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
    html += `<td class="usage-cell">${r.usage_plan ? Number(r.usage_plan).toFixed(2) : '-'}</td>`;
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
    <td colspan="8" style="text-align:right;font-weight:700">จำนวนรวม (ม้วน)</td>
    <td style="font-weight:700;color:#dc2626;font-size:15px">${grandShortage > 0 ? grandShortage : '-'}</td>
    <td colspan="7"></td>
  </tr>`;

  html += '</tbody></table></div>';

  html += `<div class="report-foot" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
    <div>Stock Level − (Stock + Receive) = Alert · รวมต้องสั่ง ${grandShortage} ม้วน</div>
    <div style="display:flex;gap:6px">
      <button class="primary" onclick="createPOFromAlert()">📄 สร้าง PO</button>
      <button class="danger" onclick="clearAlertInputs()">🗑 ล้างค่า</button>
      <button onclick="window.print()">🖨 พิมพ์</button>
    </div>
  </div>`;

  $('alertBody').innerHTML = html;

  renderAlertDateTabs();
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
  renderAlertReceiveDates();

  // ✅ Apply filter แล้ว render ใหม่
  applyAlertFiltersAndRender();
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

// ================= SIZE FILTER =================
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

// ================= ALERT FILTER =================
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

// ================= ORDER FILTER =================
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

// ================= SUP FILTER =================
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

// ================= STOCK FILTER (รอบ 2) =================
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

// ================= RECEIVE FILTER (รอบ 2) =================
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

// ================= USAGE PLAN FILTER =================
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

// ================= APPLY FILTERS + RE-RENDER =================
function applyAlertFiltersAndRender() {
  if (!window._alertFullCache || !window._alertFullCache.length) return;

  let result = [...window._alertFullCache];

  // 1) Gradegrams
  if (alertSelectedGrades.length > 0) {
    result = result.filter(r => alertSelectedGrades.includes(r.gradegram));
  }

  // 2) Size
  if (alertSelectedSizes.length > 0) {
    result = result.filter(r => alertSelectedSizes.includes(Number(r.size)));
  }

  // 3) Alert (lt0/eq0/gt0)
  if (!alertSelectedFilters.includes('all') && alertSelectedFilters.length > 0) {
    result = result.filter(r => {
      const a = Number(r.alert) || 0;
      if (alertSelectedFilters.includes('lt0') && a < 0) return true;
      if (alertSelectedFilters.includes('eq0') && a === 0) return true;
      if (alertSelectedFilters.includes('gt0') && a > 0) return true;
      return false;
    });
  }

  // 3.5) Stock (รอบ 2)
  if (!alertSelectedStockFilters.includes('all') && alertSelectedStockFilters.length > 0) {
    result = result.filter(r => {
      const v = Number(r.stock) || 0;
      if (alertSelectedStockFilters.includes('eq0') && v === 0) return true;
      if (alertSelectedStockFilters.includes('gt0') && v > 0) return true;
      if (alertSelectedStockFilters.includes('lt0') && v < 0) return true;
      return false;
    });
  }

  // 3.6) Receive (รอบ 2)
  if (!alertSelectedReceiveFilters.includes('all') && alertSelectedReceiveFilters.length > 0) {
    result = result.filter(r => {
      const v = Number(r.receive) || 0;
      if (alertSelectedReceiveFilters.includes('eq0') && v === 0) return true;
      if (alertSelectedReceiveFilters.includes('gt0') && v > 0) return true;
      if (alertSelectedReceiveFilters.includes('lt0') && v < 0) return true;
      return false;
    });
  }

  // 3.7) Usage Plan (Phase 6)
  if (!alertSelectedUsageFilters.includes('all') && alertSelectedUsageFilters.length > 0) {
    result = result.filter(r => {
      const v = Number(r.usage_plan) || 0;
      if (alertSelectedUsageFilters.includes('has') && v > 0) return true;
      if (alertSelectedUsageFilters.includes('none') && v === 0) return true;
      return false;
    });
  }

  // 4) สั่งซื้อ
  if (!alertSelectedOrderFilters.includes('all') && alertSelectedOrderFilters.length > 0) {
    result = result.filter(r => {
      const lsKey = alertLS_Key(r.gradegram, r.size);
      const lsVal = getAlertInput(lsKey);
      const hasQty = lsVal.qty && Number(lsVal.qty) > 0;
      if (alertSelectedOrderFilters.includes('filled') && hasQty) return true;
      if (alertSelectedOrderFilters.includes('not_filled') && !hasQty) return true;
      return false;
    });
  }

  // 5) Sup.
  if (alertSelectedSupFilters.length > 0) {
    result = result.filter(r => {
      const lsKey = alertLS_Key(r.gradegram, r.size);
      const lsVal = getAlertInput(lsKey);
      const sup = lsVal.sup || '';
      if (!sup && alertSelectedSupFilters.includes('__NONE__')) return true;
      return alertSelectedSupFilters.includes(sup);
    });
  }

  alertCache = result;
  renderAlertTableBody(result);
}

// ✅ Render ใหม่เฉพาะ summary + tbody (thead คงเดิม → filter ไม่หาย)
function renderAlertTableBody(rows) {
  // ✅ อัปเดต summary + date tabs
  renderAlertDateTabs();

  // ✅ อัปเดต Size + Grade list จาก full cache
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

  // ✅ อัปเดต tbody
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

    const isFSC = isFSCGrade(r.gradegram);
    const fscBadge = isFSC
      ? '<span class="badge ok" style="font-size:10px">🟢 FSC</span>'
      : '<span class="badge" style="background:#f1f5f9;color:#64748b;font-size:10px">⚪ Non-FSC</span>';

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
    html += `<td class="usage-cell">${r.usage_plan ? Number(r.usage_plan).toFixed(2) : '-'}</td>`;
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
    <td colspan="8" style="text-align:right;font-weight:700">จำนวนรวม (ม้วน)</td>
    <td style="font-weight:700;color:#dc2626;font-size:15px">${grandShortage > 0 ? grandShortage : '-'}</td>
    <td colspan="7"></td>
  </tr>`;

  tbody.innerHTML = html;
}

// ================= DROPDOWN HELPER =================
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

// ================= LOCAL STORAGE =================
function alertLS_Key(gradegram, size) {
  return `${gradegram}|${size}`;
}
function loadAlertInputs(dateIdx = alertActiveDateIdx) {
  try {
    const raw = localStorage.getItem(getAlertLSKey(dateIdx));
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}
function saveAlertInput(key, field, value) {
  const data = loadAlertInputs();
  if (!data[key]) data[key] = {};
  data[key][field] = value;
  localStorage.setItem(getAlertLSKey(), JSON.stringify(data));

  const MARK_FIELDS = ['qty', 'sup', 'customer_roll', 'quality_b', 'note'];
  if (MARK_FIELDS.includes(field) && hasPOCreated()) {
    markAlertPOEdited();
  }
}
function getAlertInput(key, dateIdx = alertActiveDateIdx) {
  const data = loadAlertInputs(dateIdx);
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

// ================= วันที่รับสินค้า =================
function getNextWorkingDay(baseDate = new Date()) {
  const d = new Date(baseDate);
  d.setDate(d.getDate() + 1);
  if (d.getDay() === 0) d.setDate(d.getDate() + 1);
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

function addAlertReceiveDate() {
  const analyzedDate = $('alertDate')?.value;
  if (!analyzedDate) {
    alert('กรุณาเลือกวันที่วิเคราะห์ก่อน');
    return;
  }

  const sorted = [...alertReceiveDates]
    .map(_parseLocalDate)
    .filter(Boolean)
    .sort((a, b) => a - b);

  if (sorted.length === 0) {
    alertReceiveDates.push(analyzedDate);
    saveAlertReceiveDates();
    renderAlertDateTabs();
    return;
  }

  const analyzedD = _parseLocalDate(analyzedDate);
  const lastD = sorted[sorted.length - 1];
  const existing = new Set(sorted.map(d => toISODate(d)));

  let cursor = new Date(analyzedD);
  while (cursor <= lastD) {
    if (cursor.getDay() !== 0) {
      const iso = toISODate(cursor);
      if (!existing.has(iso)) {
        alertReceiveDates.push(iso);
        alertReceiveDates.sort((a, b) => _parseLocalDate(a) - _parseLocalDate(b));
        saveAlertReceiveDates();
        renderAlertDateTabs();
        return;
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  const nextD = _nextWorkingDay(lastD);
  alertReceiveDates.push(toISODate(nextD));
  alertReceiveDates.sort((a, b) => _parseLocalDate(a) - _parseLocalDate(b));
  saveAlertReceiveDates();
  renderAlertDateTabs();
}

function removeAlertReceiveDate(idx) {
  if (alertReceiveDates.length <= 1) {
    alert('ต้องมีวันที่รับสินค้าอย่างน้อย 1 วัน');
    return;
  }
  if (!confirm('ลบวันที่นี้? ข้อมูลที่กรอกในวันนี้จะหายไปด้วย')) return;

  localStorage.removeItem(getAlertLSKey(idx));

  if (alertActiveDateIdx >= idx) {
    alertActiveDateIdx = Math.max(0, alertActiveDateIdx - 1);
  }

  alertReceiveDates.splice(idx, 1);
  saveAlertReceiveDates();
  renderAlertDateTabs();
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

// ================= TAB วันที่ =================
function switchAlertDate(idx) {
  if (idx < 0 || idx >= alertReceiveDates.length) return;
  alertActiveDateIdx = idx;
  renderAlertDateTabs();
  renderAlert();
}

// ✅ Render date tabs + summary ฝั่งขวา
function renderAlertDateTabs() {
  const box = $('alertDateTabsBox');
  if (!box) return;

  // ✅ คำนวณ summary จาก full cache
  const cache = window._alertFullCache || alertCache || [];
  const totalShortage = cache.filter(r => Number(r.alert) < 0).length;
  const totalOK       = cache.filter(r => Number(r.alert) === 0).length;
  const totalOver     = cache.filter(r => Number(r.alert) > 0).length;

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
        📅 วันที่ : ${display}
      </button>
      <button type="button" class="alert-date-tab-close" onclick="removeAlertReceiveDate(${i})" title="ลบวันนี้">✕</button>
    </span>`;
  });

  html += `<button type="button" class="alert-date-add-btn" onclick="addAlertReceiveDate()">+ เพิ่มวันที่รับสินค้า</button>`;
  html += '</div>';

  // ✅ Summary ฝั่งขวา
  html += '<div class="alert-date-tabs-right">';
  html += `<span class="item red">🔴 ${totalShortage}</span>`;
  html += `<span class="item yellow">🟡 ${totalOK}</span>`;
  html += `<span class="item green">🟢 ${totalOver}</span>`;
  html += '</div>';

  box.innerHTML = html;
}

function initAlertReceiveDates() {
  alertReceiveDates = loadAlertReceiveDates();
  if (alertReceiveDates.length === 0) {
    alertReceiveDates.push(getNextWorkingDay());
    saveAlertReceiveDates();
  }
  alertActiveDateIdx = 0;
  renderAlertDateTabs();
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

  // ✅ โหลด Usage Ranges (ถ้ายังไม่มี)
  if (!alertUsageRanges.length) {
    await loadUsagePlanRanges();
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

    // ✅ เก็บข้อมูลเต็ม (ก่อนกรอง)
    window._alertFullCache = [...result];

    alertAllSizes = [...new Set(result.map(r => Number(r.size)))].sort((a, b) => a - b);
    renderAlertSizeList();
    updateAlertSizeLabel();

    // ✅ ใช้ result เต็ม render (การกรองจะทำใน renderAlertTableBody)
    const display = result;

    // ✅ Summary block ถูกลบออก (ย้ายไปอยู่ใน renderAlertDateTabs)
    let html = `<div id="alertDateTabsBox" class="alert-date-tabs"></div>`;

    if (!display.length) {
      html += '<p style="text-align:center;color:#94a3b8;padding:30px">ไม่มีรายการ 🎉</p>';
      $('alertBody').innerHTML = html;
      renderAlertDateTabs();
      alertCache = [];
      return;
    }

    const sorted = [...display].sort((a, b) => {
      if (a.gradegram !== b.gradegram) return a.gradegram.localeCompare(b.gradegram);
      return a.size - b.size;
    });

    html += '<div class="report-wrap alert-scroll"><table class="alert-flat-table"><thead><tr>';

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

    html += '<th>Snapshot</th>';

    // ✅ Stock Filter
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

    // ✅ Receive Filter
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

    // ✅ Usage Plan (คอลัมน์ใหม่ + Filter)
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

      const isFSC = isFSCGrade(r.gradegram);
      const fscBadge = isFSC
        ? '<span class="badge ok" style="font-size:10px">🟢 FSC</span>'
        : '<span class="badge" style="background:#f1f5f9;color:#64748b;font-size:10px">⚪ Non-FSC</span>';

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
      html += `<td class="usage-cell">${r.usage_plan ? Number(r.usage_plan).toFixed(2) : '-'}</td>`;
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
      <td colspan="8" style="text-align:right;font-weight:700">จำนวนรวม (ม้วน)</td>
      <td style="font-weight:700;color:#dc2626;font-size:15px">${grandShortage > 0 ? grandShortage : '-'}</td>
      <td colspan="7"></td>
    </tr>`;

    html += '</tbody></table></div>';

    html += `<div class="report-foot" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
      <div>Stock Level − (Stock + Receive) = Alert · รวมต้องสั่ง ${grandShortage} ม้วน</div>
      <div style="display:flex;gap:6px">
        <button class="primary" onclick="createPOFromAlert()">📄 สร้าง PO</button>
        <button class="danger" onclick="clearAlertInputs()">🗑 ล้างค่า</button>
        <button onclick="window.print()">🖨 พิมพ์</button>
      </div>
    </div>`;

    $('alertBody').innerHTML = html;

    // ✅ alertCache = ข้อมูลเต็ม (สำหรับ createPO)
    alertCache = display;

    // ✅ อัปเดตรายชื่อ Sup ที่มีในข้อมูล
    alertAllSupsInData = [...new Set(
      display.map(r => {
        const lsKey = alertLS_Key(r.gradegram, r.size);
        const lsVal = getAlertInput(lsKey);
        return lsVal.sup || '';
      }).filter(Boolean)
    )].sort();

    // ✅ Render filter ทั้งหมด
    renderAlertGradeList();
    renderAlertFilterList();
    renderAlertSizeList();
    renderAlertOrderFilterList();
    renderAlertSupFilterList();
    renderAlertStockFilterList();
    renderAlertReceiveFilterList();
    renderAlertUsageFilterList();
    updateAlertGradeLabel();
    updateAlertFilterLabel();
    updateAlertSizeLabel();
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
    renderAlertDateTabs();

    // ✅ Apply filter แล้ว render ใหม่ (ถ้ามี filter ค้างอยู่)
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
function onAlertInput(gradegram, size, field, value, el) {
  const key = alertLS_Key(gradegram, size);
  saveAlertInput(key, field, value);

  if (el) {
    const isFilled = (field === 'customer_roll' || field === 'quality_b')
      ? (value && value !== 'normal')
      : (value && String(value).trim() !== '');
    el.classList.toggle('filled', !!isFilled);
  }

  // ✅ ถ้ากรอก Sup → อัปเดตรายชื่อ Sup ใน filter
  if (field === 'sup' && value && !alertAllSupsInData.includes(value)) {
    alertAllSupsInData.push(value);
    alertAllSupsInData.sort();
    renderAlertSupFilterList();
  }

  // ✅ ถ้ามี filter "สั่งซื้อ" หรือ "Sup." อยู่ → re-apply filter
  const hasOrderFilter = !alertSelectedOrderFilters.includes('all') && alertSelectedOrderFilters.length > 0;
  const hasSupFilter = alertSelectedSupFilters.length > 0;
  if (field === 'qty' || field === 'sup' || hasOrderFilter || hasSupFilter) {
    applyAlertFiltersAndRender();
  }
}

// ================= CLEAR ALL ALERT INPUTS =================
function clearAlertInputs() {
  if (!confirm('⚠️ ล้างค่าที่กรอกของวันนี้ (สั่งซื้อ / Sup. / ม้วนลูกค้า / คุณภาพ B / หมายเหตุ)?')) return;

  localStorage.removeItem(getAlertLSKey());

  renderAlert();

  const msg = document.createElement('div');
  msg.className = 'msg ok';
  msg.style.cssText = 'position:fixed;top:80px;right:20px;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,.15)';
  msg.textContent = '✅ ล้างค่าของวันนี้แล้ว';
  document.body.appendChild(msg);
  setTimeout(() => msg.remove(), 2000);
}

function clearAllAlertInputsAllDates() {
  for (let i = 0; i < alertReceiveDates.length; i++) {
    localStorage.removeItem(getAlertLSKey(i));
  }
}

// ================= CREATE PO FROM ALERT =================
async function createPOFromAlert() {
  if (!alertCache || !alertCache.length) {
    alert('ไม่มีข้อมูล Alert');
    return;
  }

  const allItems = [];

  for (let dateIdx = 0; dateIdx < alertReceiveDates.length; dateIdx++) {
    const dateKey = alertReceiveDates[dateIdx];
    for (const r of alertCache) {
      const lsKey = alertLS_Key(r.gradegram, r.size);
      const lsVal = getAlertInput(lsKey, dateIdx);

      // ✅ เก็บแค่ "กรอกจำนวน" → ไม่ต้องเช็ค Sup ที่นี่
      if (!lsVal.qty || Number(lsVal.qty) <= 0) continue;

      allItems.push({
        seq: allItems.length + 1,
        receive_date: dateKey,
        receive_date_idx: dateIdx,
        gradegram: r.gradegram,
        size: r.size,
        gradegram_size: `${r.gradegram}-${Number(r.size).toFixed(2)}`,
        quantity: Number(lsVal.qty),
        sup: lsVal.sup || '',   // ✅ ปล่อยว่างได้
        customer_roll: lsVal.customer_roll || 'normal',
        quality_b: lsVal.quality_b || 'normal',
        note: lsVal.note || ''
      });
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

    // ✅ สรุปตาม Sup
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

      // ✅ แสดงหมายเหตุเฉพาะที่ไม่ใช่ ปกติ/ปกติ
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

  if (alertReceiveDates.length === 0) {
    alert('กรุณากำหนดวันที่รับสินค้าอย่างน้อย 1 วัน');
    return;
  }

  // ✅ เช็ค Sup ก่อนสร้าง PO — กันพลาด
  const missingSup = _pendingPOItems.filter(it => !it.sup || String(it.sup).trim() === '');
  if (missingSup.length > 0) {
    alert(`⚠️ ไม่สามารถสร้าง PO ได้\n\nมี ${missingSup.length} รายการที่ยังไม่ได้ระบุผู้ขาย (Sup.)\nกรุณาตรวจสอบและเลือก Sup. ให้ครบก่อน`);
    return;
  }

  const analyzedDate = toISODate(new Date());

  sessionStorage.setItem('alert_to_po', JSON.stringify({
    items: _pendingPOItems,
    analyzed_date: analyzedDate,
    receive_dates: [...alertReceiveDates],
    ref_snapshot: $('alertSnapshotMonth')?.value,
    ref_stock: $('alertStockDate')?.value,
    ref_receive: $('alertReceiveDate')?.value
  }));

  markAlertPOCreated(`ref_${Date.now()}`);

  saveAlertSnapshot([...alertReceiveDates]).then(res => {
    if (res.ok) {
      console.log('✅ Alert snapshot saved:', res.data);

      // ✅ ไม่ล้าง inputs — เก็บไว้ให้ user ดูย้อนหลัง/แก้ไข
      // clearAllAlertInputsAllDates();

      renderAlert();

      console.log('✅ Alert inputs kept (not cleared)');
    } else {
      console.warn('❌ Alert snapshot save failed:', res.error);
    }
  });

  closeModal('modalAlertPODetail');
  _pendingPOItems = [];

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

// ═══════════════════════════════════════════════════════════════
// ========== USAGE PLAN RANGES (Phase 6) ========================
// ═══════════════════════════════════════════════════════════════

async function loadUsagePlanRanges() {
  try {
    const { data, error } = await supabase.rpc('get_all_usage_plan_ranges');
    if (error) throw error;
    alertUsageRanges = data || [];
    console.log('📋 Usage ranges:', alertUsageRanges);
  } catch (e) {
    console.warn('loadUsagePlanRanges:', e);
    alertUsageRanges = [];
  }
}

// ✅ เปลี่ยนช่วง Usage
async function onUsagePlanRangeChange(value) {
  if (!value || value === '__NONE__') {
    alertUsageSelected = null;
  } else {
    const [from, to] = value.split('|');
    alertUsageSelected = { date_from: from, date_to: to };
  }
  await renderAlert();
}

// ✅ Render dropdown Usage Plan
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

// ═══════════════════════════════════════════════════════════════
// ========== USAGE PLAN IMPORT (Phase 6) ========================
// ═══════════════════════════════════════════════════════════════

let _usagePlanRows = [];
let _usagePlanDateCols = [];   // [{ key, iso, thai }]

// ✅ แปลง '28/09/26' → { iso: '2026-09-28', thai: '28/09/2569' }
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

// ✅ เปิด dialog เลือกไฟล์
function openUsagePlanImport() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.xlsx,.xls';
  input.onchange = e => handleUsagePlanFile(e.target.files[0]);
  input.click();
}

// ✅ อ่านไฟล์ + เปิด modal เลือกวันที่
async function handleUsagePlanFile(file) {
  if (!file) return;
  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);

    if (!rows.length) {
      alert('ไฟล์ไม่มีข้อมูล');
      return;
    }

    // ✅ หา date columns
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
    _usagePlanDateCols = dateCols;

    // ✅ เปิด modal
    renderUsagePlanImportModal();
    openModal('modalUsagePlanImport');

  } catch (e) {
    console.error('handleUsagePlanFile:', e);
    alert('อ่านไฟล์ไม่สำเร็จ: ' + e.message);
  }
}

// ✅ Render modal
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

// ✅ คำนวณ + ส่งไป RPC
async function confirmUsagePlanImport() {
  const from = $('usagePlanFrom')?.value;
  const to   = $('usagePlanTo')?.value;

  if (!from || !to) {
    alert('กรุณาเลือกช่วงวันที่');
    return;
  }
  if (from > to) {
    alert('วันที่ "จาก" ต้องไม่เกิน "ถึง"');
    return;
  }

  // ✅ หาคอลัมน์ที่อยู่ในช่วง
  const activeCols = _usagePlanDateCols.filter(c => c.iso >= from && c.iso <= to);
  if (!activeCols.length) {
    alert('ไม่มีคอลัมน์วันที่อยู่ในช่วงที่เลือก');
    return;
  }

  // ✅ ประมวลผล
  const result = [];
  const skipped = [];

  _usagePlanRows.forEach(row => {
    const gradegram = String(row['GRADE'] || '').trim().toUpperCase();
    const size = Number(row['SIZE']);
    if (!gradegram || !size) return;

    // ✅ หา master
    const parsed = parseGradegram(gradegram);
    const gradeNorm = normalizeGrade(parsed.grade || gradegram);
    const gramNorm = String(parsed.gram || '').replace(/^0+/, '') || parsed.gram;

    const spec = masterCache.find(m =>
      normalizeGrade(m.grade) === gradeNorm &&
      String(m.gram).replace(/^0+/, '') === String(gramNorm).replace(/^0+/, '') &&
      Number(m.size) === size
    );

    if (!spec) {
      skipped.push(`${gradegram}/${size}`);
      return;
    }

    const stdWeight = Number(spec.std_weight_kg) || 0;
    if (stdWeight <= 0) {
      skipped.push(`${gradegram}/${size} (no std)`);
      return;
    }

    // ✅ รวม kg ทุกคอลัมน์ในช่วง
    let totalKg = 0;
    activeCols.forEach(col => {
      totalKg += Number(row[col.key]) || 0;
    });

    if (totalKg <= 0) return;   // ข้ามถ้าไม่มีค่า

    const rolls = Number((totalKg / stdWeight).toFixed(4));

    result.push({
      gradegram,
      size,
      usage_rolls: rolls,
      usage_kg: Number(totalKg.toFixed(2))
    });
  });

  if (!result.length) {
    alert('ไม่มีข้อมูลที่สามารถ import ได้\n(ไม่พบใน master หรือ kg = 0)');
    return;
  }

  // ✅ ส่งไป RPC
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

    if (!data?.success) {
      throw new Error(data?.error || 'บันทึกไม่สำเร็จ');
    }

    closeModal('modalUsagePlanImport');

    // ✅ Toast สรุปผล
    showToast(
      `✅ Import สำเร็จ ${data.inserted} รายการ` +
      (skipped.length ? ` · ข้าม ${skipped.length}` : ''),
      'ok', 4000
    );

    // ✅ Reload Usage Ranges + dropdown
    await loadUsagePlanRanges();
    renderUsageRangeDropdown();

    // ✅ Refresh Alert
    await renderAlert();

  } catch (e) {
    alert('❌ ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '💾 บันทึก'; }
  }
}

// ✅ ล้าง Usage Plan (ถามวันที่)
async function clearUsagePlan() {
  const from = prompt('📅 ลบ Usage Plan จากวันที่ (YYYY-MM-DD):');
  if (!from) return;
  const to = prompt('📅 ถึงวันที่ (YYYY-MM-DD):', from);
  if (!to) return;

  if (!confirm(`⚠️ ลบ Usage Plan ช่วง ${from} ถึง ${to}?`)) return;

  try {
    const { data, error } = await supabase.rpc('clear_usage_plan', {
      p_date_from: from,
      p_date_to: to
    });
    if (error) throw error;

    showToast(`✅ ลบ ${data?.deleted || 0} รายการ`, 'ok', 3000);

    // ✅ Reset selection + reload
    alertUsageSelected = null;
    await loadUsagePlanRanges();
    renderUsageRangeDropdown();

    // ✅ Refresh Alert
    await renderAlert();
  } catch (e) {
    alert('❌ ' + e.message);
  }
}

// ================= EXPORT =================
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
      'Usage Plan': r.usage_plan || 0,
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
