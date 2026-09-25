// ═══════════════════════════════════════════════════════════════
// STOCK V9 — purchase-order.js
// Purchase Order Management (List + Form + Auto-Split + Export)
// + Date Split + Verify Password + Mark Saved + Deleted History
// + Column Filters (PO No. / วันที่ออก / วันที่รับ / Sup. / สถานะ)
// + Filter Label ด้านบน (PO No. / วันที่ออก / วันที่รับ)
// + Add PO Items (Phase 3)
// + Inline Edit Items (Phase 3E)
// ═══════════════════════════════════════════════════════════════

let poCache = [];
let poSuppliers = [];
let poPriceMaster = [];
let poSelectedMonth = '';
let poEditingId = null;

// ✅ Filter state
let poFilterPONo = '';
let poFilterDateFrom = '';
let poFilterDateTo = '';
let poFilterSup = [];
let poFilterStatus = [];

// ================= STD WEIGHT HELPER =================
function getStdWeight(gradegram, size) {
  const match = String(gradegram).match(/^([A-Z]+F?)(\d+)$/);
  if (!match) return 0;

  const grade = match[1];
  const gram = match[2];

  const spec = masterCache.find(m =>
    normalizeGrade(m.grade) === grade &&
    String(m.gram) === gram &&
    Number(m.size) === Number(size)
  );

  return spec ? Number(spec.std_weight_kg) || 0 : 0;
}

function calcKgTotal(gradegram, size, quantity) {
  const std = getStdWeight(gradegram, size);
  return Number((std * Number(quantity)).toFixed(2));
}

// ================= DATE FORMAT HELPER =================
function fmtDateTH(d) {
  if (!d) return '-';
  const dObj = new Date(d);
  if (isNaN(dObj.getTime())) return String(d);
  const dd = String(dObj.getDate()).padStart(2, '0');
  const mm = String(dObj.getMonth() + 1).padStart(2, '0');
  const yyyy = dObj.getFullYear() + 543;
  return `${dd}/${mm}/${yyyy}`;
}

// ================= INIT =================
async function initPurchaseOrderTab() {
  const today = new Date();
  if (!poSelectedMonth) {
    poSelectedMonth = `${today.getFullYear()}-${pad(today.getMonth() + 1)}`;
  }
  const monthEl = $('poMonth');
  if (monthEl && !monthEl.value) monthEl.value = poSelectedMonth;

  await loadPOSuppliers();
  await loadPriceMaster();
  await renderPOList();

  const fromAlert = sessionStorage.getItem('alert_to_po');
  if (fromAlert) {
    try {
      const data = JSON.parse(fromAlert);
      sessionStorage.removeItem('alert_to_po');
      await openPOFormFromAlert(data);
    } catch (e) {
      console.warn('parse alert_to_po:', e);
    }
  }
}

// ================= SUPPLIERS =================
async function loadPOSuppliers() {
  try {
    const { data, error } = await supabase
      .from('paper_suppliers')
      .select('code')
      .eq('is_active', true)
      .order('code');
    if (error) throw error;
    poSuppliers = (data || []).map(s => s.code);
  } catch (e) {
    console.warn('loadPOSuppliers:', e);
    poSuppliers = ['EKP', 'MKP', 'SCK'];
  }
}

// ================= PRICE MASTER =================
async function loadPriceMaster() {
  try {
    const { data, error } = await supabase
      .from('price_master')
      .select('*')
      .eq('month', poSelectedMonth)
      .eq('is_active', true);
    if (error) throw error;
    poPriceMaster = data || [];
  } catch (e) {
    console.warn('loadPriceMaster:', e);
    poPriceMaster = [];
  }
}

function getPriceFromMaster(gradegram, customerRoll, qualityB) {
  const m = poPriceMaster.find(p => p.gradegram === gradegram);
  if (!m) return 0;

  let base = Number(m.price_normal) || 0;

  if (customerRoll === 'pump_f'   && m.price_f)   base = Number(m.price_f);
  if (customerRoll === 'pump_bt'  && m.price_bt)  base = Number(m.price_bt);
  if (customerRoll === 'pump_ktp' && m.price_ktp) base = Number(m.price_ktp);

  if (qualityB === 'nc') {
    base = base - (Number(m.nc_discount) || 0);
  }

  return Number(base.toFixed(2));
}

// ================= RENDER PO LIST (with column filters) =================
async function renderPOList() {
  const listEl = $('poListBody');
  if (!listEl) return;
  listEl.innerHTML = '<p style="text-align:center;color:#94a3b8;padding:20px">กำลังโหลด...</p>';

  try {
    const { data, error } = await supabase.rpc('get_purchase_orders', {
      p_month: poSelectedMonth,
      p_sup: null,
      p_status: null
    });
    if (error) throw error;

    poCache = data || [];
    if (!poCache.length) {
      listEl.innerHTML = '<p style="text-align:center;color:#94a3b8;padding:30px">ยังไม่มี PO ในเดือนนี้</p>';
      return;
    }

    let html = '<div class="data-scroll po-list-scroll"><table class="data-table po-list-table"><thead><tr>';

    html += `<th class="th-with-filter">
      <div class="th-filter-wrap po-filter-stack">
        <span class="po-filter-label">PO No.</span>
        <input type="text" id="poFilterPONoInput" class="po-filter-input"
               value="${esc(poFilterPONo)}"
               oninput="onPOFilterChange()">
      </div>
    </th>`;

    html += `<th class="th-with-filter">
      <div class="th-filter-wrap po-filter-stack">
        <span class="po-filter-label">วันที่ออก</span>
        <input type="date" id="poFilterDateFrom" class="po-filter-input"
               value="${esc(poFilterDateFrom)}"
               onchange="onPOFilterChange()">
      </div>
    </th>`;

    html += `<th class="th-with-filter">
      <div class="th-filter-wrap po-filter-stack">
        <span class="po-filter-label">วันที่รับ</span>
        <input type="date" id="poFilterDateTo" class="po-filter-input"
               value="${esc(poFilterDateTo)}"
               onchange="onPOFilterChange()">
      </div>
    </th>`;

    const supList = [...new Set(poCache.map(p => p.sup_code))].sort();
    html += `<th class="th-with-filter">
      <div class="th-filter-wrap" id="poFilterSupBox">
        <button type="button" class="th-filter-btn" id="poFilterSupBtn">
          <span id="poFilterSupLabel">Sup.</span>
          <span class="arrow">▼</span>
        </button>
        <div class="grade-dropdown hidden" id="poFilterSupDropdown" style="min-width:160px">
          <div class="grade-actions">
            <button type="button" onclick="selectAllPOSups()">✓ เลือกทั้งหมด</button>
            <button type="button" onclick="clearAllPOSups()">✗ ล้างทั้งหมด</button>
          </div>
          <div class="grade-list" id="poFilterSupList"></div>
        </div>
      </div>
    </th>`;

    html += '<th style="text-align:right">จำนวน</th>';
    html += '<th style="text-align:right">KG รวม</th>';

    html += `<th class="th-with-filter">
      <div class="th-filter-wrap" id="poFilterStatusBox">
        <button type="button" class="th-filter-btn" id="poFilterStatusBtn">
          <span id="poFilterStatusLabel">สถานะ</span>
          <span class="arrow">▼</span>
        </button>
        <div class="grade-dropdown hidden" id="poFilterStatusDropdown" style="min-width:180px">
          <div class="grade-actions">
            <button type="button" onclick="selectAllPOStatuses()">✓ เลือกทั้งหมด</button>
            <button type="button" onclick="clearAllPOStatuses()">✗ ล้างทั้งหมด</button>
          </div>
          <div class="grade-list" id="poFilterStatusList"></div>
        </div>
      </div>
    </th>`;

    html += '<th></th>';
    html += '</tr></thead><tbody id="poListTbody"></tbody></table></div>';
    listEl.innerHTML = html;

    renderPOListRows(poCache);
    renderPOSupFilterList(supList);
    renderPOStatusFilterList();

  } catch (e) {
    console.error('renderPOList:', e);
    listEl.innerHTML = `<div class="msg err">โหลดไม่สำเร็จ: ${esc(e.message)}</div>`;
  }
}

// ✅ Render rows
function renderPOListRows(rows) {
  const tbody = $('poListTbody');
  if (!tbody) return;

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#94a3b8;padding:30px">ไม่พบ PO ที่ตรงเงื่อนไข 🎉</td></tr>';
    return;
  }

  let html = '';
  rows.forEach(po => {
    const statusBadge = {
      draft: '<span class="badge" style="background:#fef3c7;color:#b45309">📝 Draft</span>',
      saved: '<span class="badge ok">✅ Saved</span>',
      sent:  '<span class="badge" style="background:#dbeafe;color:#1e40af">📤 Sent</span>'
    }[po.status] || po.status;

    const saveBtn = po.status === 'draft'
      ? `<button class="primary" onclick="markPOSaved('${po.id}')">✅ บันทึกเป็น Saved</button>`
      : '';

    html += `<tr>
      <td><b>${esc(po.po_no)}</b></td>
      <td>${fmtDateTH(po.po_date)}</td>
      <td>${fmtDateTH(po.ref_receive)}</td>
      <td>${esc(po.sup_code)}</td>
      <td style="text-align:right;font-weight:700;color:#1e40af">${Number(po.total_rolls || 0).toLocaleString()}</td>
      <td style="text-align:right">${Number(po.total_kg || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
      <td>${statusBadge}</td>
      <td>
        <button onclick="openPODetail('${po.id}')">📄 ดู</button>
        <button onclick="openPOFormWithVerify('${po.id}')">✏️ แก้ไข</button>
        ${saveBtn}
        <button class="danger" onclick="deletePO('${po.id}')">🗑 ลบ</button>
      </td>
    </tr>`;
  });
  tbody.innerHTML = html;
}

// ✅ Filter Change Handler
function onPOFilterChange() {
  const ponoEl = $('poFilterPONoInput');
  const fromEl = $('poFilterDateFrom');
  const toEl = $('poFilterDateTo');

  poFilterPONo = ponoEl ? ponoEl.value.trim() : '';
  poFilterDateFrom = fromEl ? fromEl.value : '';
  poFilterDateTo = toEl ? toEl.value : '';

  applyPOFiltersAndRender();
}

// ✅ Apply filters
function applyPOFiltersAndRender() {
  let result = [...poCache];

  if (poFilterPONo) {
    result = result.filter(p => String(p.po_no).toLowerCase().includes(poFilterPONo.toLowerCase()));
  }

  if (poFilterDateFrom) {
    result = result.filter(p => p.po_date && p.po_date.slice(0, 10) === poFilterDateFrom);
  }

  if (poFilterDateTo) {
    result = result.filter(p => p.ref_receive && p.ref_receive.slice(0, 10) === poFilterDateTo);
  }

  if (poFilterSup.length > 0) {
    result = result.filter(p => poFilterSup.includes(p.sup_code));
  }

  if (poFilterStatus.length > 0) {
    result = result.filter(p => poFilterStatus.includes(p.status));
  }

  renderPOListRows(result);
}

// ✅ Sup. filter list
function renderPOSupFilterList(supList) {
  const list = $('poFilterSupList');
  if (!list) return;
  list.innerHTML = supList.map(s => {
    const checked = poFilterSup.includes(s);
    return `<label class="item ${checked ? 'checked' : ''}" data-sup="${esc(s)}">
      <input type="checkbox" ${checked ? 'checked' : ''}>
      <span>${esc(s)}</span>
    </label>`;
  }).join('');
  list.querySelectorAll('.item').forEach(el => {
    const cb = el.querySelector('input[type="checkbox"]');
    cb.addEventListener('change', () => {
      const val = el.dataset.sup;
      if (cb.checked) {
        if (!poFilterSup.includes(val)) poFilterSup.push(val);
      } else {
        poFilterSup = poFilterSup.filter(x => x !== val);
      }
      el.classList.toggle('checked', cb.checked);
      updatePOSupFilterLabel();
      applyPOFiltersAndRender();
    });
  });

  _attachPOFilterDropdown('poFilterSupBtn', 'poFilterSupDropdown', 'poFilterSupBox', 'poSup');
  updatePOSupFilterLabel();
}

function updatePOSupFilterLabel() {
  const label = $('poFilterSupLabel');
  if (!label) return;
  if (poFilterSup.length === 0) label.textContent = 'Sup.';
  else if (poFilterSup.length === 1) label.textContent = poFilterSup[0];
  else label.textContent = `Sup. (${poFilterSup.length})`;
}

function selectAllPOSups() {
  const list = $('poFilterSupList');
  if (!list) return;
  poFilterSup = [...list.querySelectorAll('.item')].map(el => el.dataset.sup);
  renderPOSupFilterList(poFilterSup.map(s => s));
  applyPOFiltersAndRender();
}

function clearAllPOSups() {
  poFilterSup = [];
  const list = $('poFilterSupList');
  if (list) {
    list.querySelectorAll('.item').forEach(el => {
      el.classList.remove('checked');
      const cb = el.querySelector('input[type="checkbox"]');
      if (cb) cb.checked = false;
    });
  }
  updatePOSupFilterLabel();
  applyPOFiltersAndRender();
}

// ✅ Status filter list
function renderPOStatusFilterList() {
  const list = $('poFilterStatusList');
  if (!list) return;
  const statuses = [
    { value: 'draft', label: '📝 Draft' },
    { value: 'saved', label: '✅ Saved' },
    { value: 'sent',  label: '📤 Sent' }
  ];
  list.innerHTML = statuses.map(s => {
    const checked = poFilterStatus.includes(s.value);
    return `<label class="item ${checked ? 'checked' : ''}" data-status="${s.value}">
      <input type="checkbox" ${checked ? 'checked' : ''}>
      <span>${s.label}</span>
    </label>`;
  }).join('');
  list.querySelectorAll('.item').forEach(el => {
    const cb = el.querySelector('input[type="checkbox"]');
    cb.addEventListener('change', () => {
      const val = el.dataset.status;
      if (cb.checked) {
        if (!poFilterStatus.includes(val)) poFilterStatus.push(val);
      } else {
        poFilterStatus = poFilterStatus.filter(x => x !== val);
      }
      el.classList.toggle('checked', cb.checked);
      updatePOStatusFilterLabel();
      applyPOFiltersAndRender();
    });
  });

  _attachPOFilterDropdown('poFilterStatusBtn', 'poFilterStatusDropdown', 'poFilterStatusBox', 'poStatus');
  updatePOStatusFilterLabel();
}

function updatePOStatusFilterLabel() {
  const label = $('poFilterStatusLabel');
  if (!label) return;
  if (poFilterStatus.length === 0) label.textContent = 'สถานะ';
  else if (poFilterStatus.length === 1) {
    const s = { draft: '📝 Draft', saved: '✅ Saved', sent: '📤 Sent' }[poFilterStatus[0]];
    label.textContent = s || poFilterStatus[0];
  } else label.textContent = `สถานะ (${poFilterStatus.length})`;
}

function selectAllPOStatuses() {
  poFilterStatus = ['draft', 'saved', 'sent'];
  renderPOStatusFilterList();
  applyPOFiltersAndRender();
}

function clearAllPOStatuses() {
  poFilterStatus = [];
  renderPOStatusFilterList();
  applyPOFiltersAndRender();
}

// ✅ Dropdown helper
function _attachPOFilterDropdown(btnId, dropdownId, boxId, docKey) {
  const btn = $(btnId);
  const dropdown = $(dropdownId);
  const box = $(boxId);
  if (!btn || !dropdown || !box) return;

  if (btn._poDropdownClick) btn.removeEventListener('click', btn._poDropdownClick);
  btn._poDropdownClick = (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('hidden');
    btn.classList.toggle('open');
  };
  btn.addEventListener('click', btn._poDropdownClick);

  if (!window['_' + docKey + 'DocClick']) {
    window['_' + docKey + 'DocClick'] = (e) => {
      const b = $(btnId), d = $(dropdownId), bx = $(boxId);
      if (!b || !d || !bx) return;
      if (!bx.contains(e.target)) { d.classList.add('hidden'); b.classList.remove('open'); }
    };
    document.addEventListener('click', window['_' + docKey + 'DocClick']);
  }
}

// ================= OPEN PO FORM =================
async function openPOForm(poId) {
  poEditingId = poId || null;
  $('poFormTitle').textContent = poId ? '✏️ แก้ไข PO' : '🧾 สร้าง PO ใหม่';
  $('poFormBody').innerHTML = '<p style="text-align:center;color:#94a3b8;padding:20px">กำลังโหลด...</p>';
  openModal('modalPOForm');

  if (poId) {
    try {
      const { data, error } = await supabase.rpc('get_purchase_order_detail', { p_po_id: poId });
      if (error) throw error;
      renderPOFormContent(data.header, data.items);
    } catch (e) {
      $('poFormBody').innerHTML = `<div class="msg err">${esc(e.message)}</div>`;
    }
  } else {
    renderPOFormContent(null, []);
  }
}

// ================= OPEN PO FORM WITH VERIFY =================
async function openPOFormWithVerify(poId) {
  const po = poCache.find(p => p.id === poId);
  if (!po) return;

  if (po.status === 'saved' || po.status === 'sent') {
    const username = (currentUser?.email || '').split('@')[0] || '';
    openVerifyModal({
      username,
      title: `🔒 ยืนยันการแก้ไข PO ${po.po_no}`,
      message: `PO นี้สถานะ ${po.status.toUpperCase()} — ต้องยืนยันรหัสผ่าน + ใส่หมายเหตุก่อนแก้ไข`,
      onConfirm: (password, note) => verifyAndOpen(po, password, note)
    });
    return;
  }

  openPOForm(poId);
}

async function verifyAndOpen(po, password, note) {
  try {
    const username = (currentUser?.email || '').split('@')[0] || '';

    const res = await callAdmin('verifyPassword', { username, password });
    if (!res || !res.ok) {
      return { ok: false, error: res?.error || 'รหัสผ่านไม่ถูกต้อง' };
    }

    try {
      await supabase.from('po_change_log').insert({
        po_id: po.id,
        changed_by: currentUser?.id,
        action: 'edit_verified',
        note: note || '(ไม่ระบุ)'
      });
    } catch (logErr) {
      console.warn('po_change_log insert failed:', logErr);
    }

    openPOForm(po.id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ================= MARK PO AS SAVED =================
async function markPOSaved(poId) {
  const po = poCache.find(p => p.id === poId);
  if (!po) return;
  if (po.status !== 'draft') {
    alert('PO นี้ไม่ใช่ draft');
    return;
  }

  if (!confirm(`ยืนยันบันทึก PO ${po.po_no} เป็น Saved?\n\n⚠️ หลังจากนี้จะแก้ไขไม่ได้โดยไม่ต้องใส่รหัสผ่าน`)) return;

  try {
    const { error } = await supabase
      .from('purchase_orders')
      .update({ status: 'saved', updated_at: new Date().toISOString() })
      .eq('id', poId);
    if (error) throw error;

    alert(`✅ บันทึก ${po.po_no} เป็น Saved สำเร็จ`);
    await renderPOList();
  } catch (e) {
    alert('❌ ' + e.message);
  }
}

// ================= VERIFY PASSWORD MODAL =================
function openVerifyModal({ username, title, message, onConfirm }) {
  $('verifyPasswordTitle').textContent = title || '🔒 ยืนยันรหัสผ่าน';
  $('verifyPasswordMessage').textContent = message || '';
  $('verifyPasswordUsername').value = username || '';
  $('verifyPasswordInput').value = '';
  $('verifyPasswordNote').value = '';
  $('verifyPasswordError').innerHTML = '';

  window._verifyOnConfirm = onConfirm;

  openModal('modalVerifyPassword');

  setTimeout(() => $('verifyPasswordInput')?.focus(), 100);
}

async function confirmVerifyPassword() {
  const password = $('verifyPasswordInput').value;
  const note = $('verifyPasswordNote').value.trim();

  if (!password) {
    $('verifyPasswordError').innerHTML = '<div class="msg err">กรุณากรอกรหัสผ่าน</div>';
    return;
  }
  if (!note) {
    $('verifyPasswordError').innerHTML = '<div class="msg err">กรุณากรอกหมายเหตุ</div>';
    return;
  }

  const btn = $('verifyPasswordConfirmBtn');
  btn.disabled = true;
  btn.textContent = 'กำลังตรวจสอบ...';

  try {
    const onConfirm = window._verifyOnConfirm;
    if (typeof onConfirm !== 'function') {
      throw new Error('ไม่พบ callback');
    }
    const result = await onConfirm(password, note);

    if (result && result.ok === false) {
      $('verifyPasswordError').innerHTML = `<div class="msg err">${esc(result.error)}</div>`;
      btn.disabled = false;
      btn.textContent = '✅ ยืนยัน';
      return;
    }

    closeModal('modalVerifyPassword');
    window._verifyOnConfirm = null;
  } catch (e) {
    $('verifyPasswordError').innerHTML = `<div class="msg err">${esc(e.message)}</div>`;
  }

  btn.disabled = false;
  btn.textContent = '✅ ยืนยัน';
}

// ================= OPEN PO FORM FROM ALERT =================
async function openPOFormFromAlert(alertData) {
  poEditingId = null;

  const items = alertData.items || [];
  const byDate = {};
  items.forEach(it => {
    const d = it.receive_date || alertData.ref_receive || 'unknown';
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(it);
  });

  const sortedDates = Object.keys(byDate).sort();

  const pos = [];
  sortedDates.forEach(dateKey => {
    const dayItems = byDate[dateKey];
    const dayPOs = autoGroupPOItems(dayItems);
    dayPOs.forEach(po => {
      po.receive_date = dateKey;
      pos.push(po);
    });
  });

  $('poFormTitle').textContent = `🧾 สร้าง PO (${pos.length} ฉบับ · ${sortedDates.length} วันรับ)`;
  $('poFormBody').innerHTML = '<p>กำลังสร้าง...</p>';
  openModal('modalPOForm');

  renderMultiPOForm(pos, alertData);
}

// ================= AUTO GROUP PO =================
function autoGroupPOItems(items) {
  const supOrder = { EKP: 1, MKP: 2, SCK: 3 };

  function isFSC(gradegram) {
    if (!gradegram) return false;
    const match = String(gradegram).match(/^([A-Z]+)/);
    if (!match) return false;
    return match[1].includes('F');
  }

  const bySup = {};
  items.forEach(it => {
    if (!bySup[it.sup]) bySup[it.sup] = [];
    bySup[it.sup].push(it);
  });

  const sortedSups = Object.keys(bySup).sort((a, b) => (supOrder[a] || 99) - (supOrder[b] || 99));

  const pos = [];

  sortedSups.forEach(sup => {
    const supItems = bySup[sup];

    const groups = {
      fsc_normal:    supItems.filter(i => isFSC(i.gradegram) && i.quality_b === 'normal'),
      fsc_nc:        supItems.filter(i => isFSC(i.gradegram) && i.quality_b === 'nc'),
      nonfsc_normal: supItems.filter(i => !isFSC(i.gradegram) && i.quality_b === 'normal'),
      nonfsc_nc:     supItems.filter(i => !isFSC(i.gradegram) && i.quality_b === 'nc')
    };

    ['fsc_normal', 'fsc_nc', 'nonfsc_normal', 'nonfsc_nc'].forEach(grp => {
      const grpItems = groups[grp];
      if (!grpItems.length) return;

      for (let i = 0; i < grpItems.length; i += 15) {
        const chunk = grpItems.slice(i, i + 15);
        pos.push({
          sup_code: sup,
          items: chunk,
          group: grp
        });
      }
    });
  });

  return pos;
}

// ================= RENDER MULTI PO FORM =================
function renderMultiPOForm(posList, alertData) {
  const analyzedDate = alertData.analyzed_date || toISODate(new Date());

  let html = '';

  html += `<div class="msg info" style="margin-bottom:14px">
    <b>📋 ข้อมูลอ้างอิงจาก Alert</b><br>
    วันที่วิเคราะห์: <b>${analyzedDate}</b> (ล็อก)<br>
    Stock Level: ${alertData.ref_snapshot} · Stock: ${alertData.ref_stock} · Receive: ${alertData.ref_receive}
  </div>`;

  html += `<div class="msg warn" style="margin-bottom:14px">
    ⚠️ ระบบแยกเป็น <b>${posList.length} PO</b> ตามเงื่อนไข (วันรับ + Sup + กลุ่ม + 15 รายการ/PO)
  </div>`;

  posList.forEach((po, idx) => {
    const groupLabel = {
      fsc_normal:    '🟢 FSC · ปกติ',
      fsc_nc:        '🟢 FSC · 🔴 NC',
      nonfsc_normal: '⚪ Non-FSC · ปกติ',
      nonfsc_nc:     '⚪ Non-FSC · 🔴 NC'
    }[po.group] || po.group;

    html += `<div class="po-form-group" style="border:1px solid #cbd5e1;border-radius:8px;padding:12px;margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <div>
          <b>PO #${idx + 1}</b> · Sup: <b>${esc(po.sup_code)}</b> · ${groupLabel} · ${po.items.length} รายการ
          ${po.receive_date ? `<br><span style="color:#1e40af;font-size:12px">📅 วันที่รับ: <b>${fmtDateTH(po.receive_date)}</b></span>` : ''}
        </div>
        <div>
          PO No.: <input type="text" class="po-input-po-no" value="" placeholder="auto" style="width:150px">
        </div>
      </div>

      <table class="alert-flat-table" style="font-size:12px">
        <thead>
          <tr>
            <th>#</th>
            <th>PC.</th>
            <th>Gradegram</th>
            <th>Size</th>
            <th>Quantity</th>
            <th>KG. รวม</th>
            <th>Price</th>
            <th>ม้วนลูกค้า</th>
            <th>คุณภาพ B</th>
            <th>หมายเหตุ</th>
          </tr>
        </thead>
        <tbody>`;

    po.items.forEach((it, i) => {
      const price = getPriceFromMaster(it.gradegram, it.customer_roll, it.quality_b);
      const custLabel = { normal: 'ปกติ', pump_f: 'ปั้ม F', pump_bt: 'ปั้ม BT', pump_ktp: 'ปั้ม KTP' }[it.customer_roll] || it.customer_roll;
      const qualLabel = { normal: 'ปกติ', nc: 'NC' }[it.quality_b] || it.quality_b;

      const kgTotal = calcKgTotal(it.gradegram, it.size, it.quantity);

      html += `<tr data-gradegram="${esc(it.gradegram)}" data-size="${it.size}">
        <td>${i + 1}</td>
        <td><input type="text" value="SDPC.01" style="width:80px"></td>
        <td>${esc(it.gradegram)}</td>
        <td>${it.size}</td>
        <td>${it.quantity}</td>
        <td>${kgTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
        <td>${price.toFixed(2)}</td>
        <td>${custLabel}</td>
        <td>${qualLabel}</td>
        <td>${esc(it.note) || '-'}</td>
      </tr>`;
    });

    html += `</tbody></table></div>`;
  });

  html += `<div class="form-actions" style="margin-top:16px">
    <button onclick="cancelPOForm()">ยกเลิก</button>
    <button class="primary" onclick="saveAllPOs(this)">💾 บันทึกทั้งหมด</button>
  </div>`;

  window._pendingPOs = posList;
  window._pendingAlertData = alertData;

  $('poFormBody').innerHTML = html;
}

// ================= SAVE ALL POs =================
async function saveAllPOs(btnEl) {
  const posList = window._pendingPOs || [];
  const alertData = window._pendingAlertData || {};

  if (!posList.length) {
    alert('ไม่มี PO ให้บันทึก');
    return;
  }

  if (poEditingId) {
    const po = poCache.find(p => p.id === poEditingId);
    if (po && (po.status === 'saved' || po.status === 'sent')) {
      const username = (currentUser?.email || '').split('@')[0] || '';
      openVerifyModal({
        username,
        title: `🔒 ยืนยันการบันทึก PO ${po.po_no}`,
        message: 'PO นี้ Saved แล้ว — ต้องยืนยันรหัสผ่าน + หมายเหตุ',
        onConfirm: async (password, note) => {
          const res = await callAdmin('verifyPassword', { username, password });
          if (!res || !res.ok) {
            return { ok: false, error: res?.error || 'รหัสผ่านไม่ถูกต้อง' };
          }
          try {
            await supabase.from('po_change_log').insert({
              po_id: po.id,
              changed_by: currentUser?.id,
              action: 'save_verified',
              note: note
            });
          } catch (logErr) {
            console.warn('po_change_log insert failed:', logErr);
          }
          await _doSaveAllPOs(posList, alertData, btnEl);
          return { ok: true };
        }
      });
      return;
    }
  }

  if (!confirm(`ยืนยันบันทึก ${posList.length} PO?`)) return;
  await _doSaveAllPOs(posList, alertData, btnEl);
}

async function _doSaveAllPOs(posList, alertData, btnEl) {
  const btn = btnEl || document.querySelector('#modalPOForm .form-actions .primary');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'กำลังบันทึก...';
  }

  let successCount = 0;
  let errorMsg = '';

  for (let i = 0; i < posList.length; i++) {
    const po = posList[i];

    const today = new Date();
    const yy = String(today.getFullYear()).slice(-2);
    const mm = pad(today.getMonth() + 1);

    let poNo;
    try {
      const { data: nextNo, error: errNext } = await supabase.rpc('get_next_po_no', {
        p_yy: yy, p_mm: mm
      });
      if (errNext) throw errNext;
      poNo = nextNo;
    } catch (e) {
      errorMsg += `PO #${i + 1}: ${e.message}; `;
      continue;
    }

    const items = po.items.map((it, idx) => {
      const price = getPriceFromMaster(it.gradegram, it.customer_roll, it.quality_b);
      const custLabel = { normal: '', pump_f: 'ปั้ม F', pump_bt: 'ปั้ม BT', pump_ktp: 'ปั้ม KTP' }[it.customer_roll] || '';
      const qualLabel = { normal: '', nc: 'NC' }[it.quality_b] || '';

      const remarkParts = [custLabel, qualLabel, it.note].filter(x => x && x.trim());
      const remarkCombined = remarkParts.join(',');

      return {
        seq: idx + 1,
        pc_code: 'SDPC.01',
        gradegram: it.gradegram,
        size: it.size,
        gradegram_size: it.gradegram_size,
        quantity: it.quantity,
        kg_total: calcKgTotal(it.gradegram, it.size, it.quantity),
        price: price,
        customer_roll: it.customer_roll || 'normal',
        quality_b: it.quality_b || 'normal',
        note: it.note || '',
        remark_combined: remarkCombined
      };
    });

    const header = {
      po_no: poNo,
      po_date: alertData.analyzed_date || toISODate(new Date()),
      sup_code: po.sup_code,
      status: 'draft',
      ref_snapshot: alertData.ref_snapshot,
      ref_stock: alertData.ref_stock,
      ref_receive: po.receive_date || alertData.ref_receive,
      remark: '',
      created_by: currentUser?.id
    };

    try {
      const { error } = await supabase.rpc('save_purchase_order', {
        p_header: header,
        p_items: items
      });
      if (error) throw error;
      successCount++;
    } catch (e) {
      errorMsg += `PO #${i + 1}: ${e.message}; `;
    }
  }

  if (btn) {
    btn.disabled = false;
    btn.textContent = '💾 บันทึกทั้งหมด';
  }

  if (errorMsg) {
    alert(`✅ สำเร็จ ${successCount}/${posList.length}\n❌ Error: ${errorMsg}`);
  } else {
    alert(`✅ บันทึกสำเร็จ ${successCount} PO`);
  }

  closeModal('modalPOForm');

  const poBtn = document.querySelector('.nav button[data-tab="purchase-order"]');
  if (poBtn) poBtn.click();

  await renderPOList();

  window._pendingPOs = null;
  window._pendingAlertData = null;
}

// ================= STATE: Edit Items =================
let _editItemsRows = [];
let _editPOHeader = null;

// ================= RENDER PO FORM (EDIT) =================
function renderPOFormContent(header, items) {
  if (!header) {
    $('poFormBody').innerHTML = '<p style="text-align:center;color:#94a3b8">ไม่มีข้อมูล</p>';
    return;
  }

  _editPOHeader = header;

  // ✅ สร้าง state จาก items เดิม (เฉพาะ active)
  const activeItems = items.filter(it => it.status !== 'cancelled');
  _editItemsRows = activeItems.map((it, idx) => ({
    uid: `old_${it.id}`,
    id: it.id,
    isNew: false,
    original: { ...it },
    gradegram: it.gradegram,
    size: it.size,
    quantity: Number(it.quantity),
    price: Number(it.price || 0),
    customer_roll: it.customer_roll || 'normal',
    quality_b: it.quality_b || 'normal',
    note: it.note || '',
    removed: false
  }));

  renderPOFormTable();
}

// ✅ Render ตาราง items + ปุ่ม
function renderPOFormTable() {
  const container = $('poFormBody');
  if (!container) return;

  const header = _editPOHeader;
  const activeRows = _editItemsRows.filter(r => !r.removed);
  const totalCount = activeRows.length;
  const remaining = 15 - totalCount;

  // ✅ Info bar
  let html = `<div class="msg info" style="margin-bottom:12px">
    <b>✏️ แก้ไข PO — ${esc(header.po_no)}</b><br>
    📦 มีอยู่ <b>${totalCount}</b> รายการ · เพิ่มได้อีก <b style="color:#dc2626">${remaining > 0 ? remaining : 0}</b> รายการ<br>
    Sup: <b>${esc(header.sup_code)}</b> · วันที่รับ: <b>${fmtDateTH(header.ref_receive)}</b> · สถานะ: <b>${header.status}</b>
  </div>`;

  // ✅ ตาราง
  html += `<div class="report-wrap" style="max-height:55vh;overflow-y:auto;border:1px solid #e2e8f0;border-radius:8px">
    <table class="add-items-table">
      <thead>
        <tr>
          <th style="width:40px">#</th>
          <th style="width:130px">Gradegram</th>
          <th style="width:80px">Size</th>
          <th style="width:80px">Quantity</th>
          <th style="width:80px;text-align:right">Price</th>
          <th style="width:100px">ม้วนลูกค้า</th>
          <th style="width:90px">คุณภาพ B</th>
          <th>หมายเหตุ</th>
          <th style="width:50px"></th>
        </tr>
      </thead>
      <tbody>`;

  const uniqueGradegrams = [...new Set(masterCache.map(m => normalizeGrade(m.grade) + m.gram))].sort();

  activeRows.forEach((row, idx) => {
    const autoPrice = row.gradegram
      ? getPriceFromMaster(row.gradegram, row.customer_roll, row.quality_b)
      : 0;

    // ✅ เก่า → ใช้ row.price (ที่บันทึกไว้) | ใหม่ → ใช้ autoPrice
    const displayPrice = row.isNew ? autoPrice : row.price;

    // ✅ Size options
    const availableSizes = getAvailableSizesFor(row.gradegram);
    const gradegramOpts = uniqueGradegrams.map(g =>
      `<option value="${esc(g)}" ${row.gradegram === g ? 'selected' : ''}>${esc(g)}</option>`
    ).join('');
    const sizeOpts = availableSizes.map(s =>
      `<option value="${s}" ${Number(row.size) === s ? 'selected' : ''}>${s}</option>`
    ).join('');

    // ✅ เก่า → ล็อก gradegram/size | ใหม่ → dropdown
    const gradegramCell = row.isNew
      ? `<select onchange="onEditRowChange('${row.uid}', 'gradegram', this.value)">
           <option value="">-- เลือก --</option>${gradegramOpts}
         </select>`
      : `<b style="color:#1e293b">${esc(row.gradegram)}</b>`;

    const sizeCell = row.isNew
      ? `<select onchange="onEditRowChange('${row.uid}', 'size', this.value)" style="width:80px" ${!row.gradegram ? 'disabled' : ''}>
           <option value="">--</option>${sizeOpts}
         </select>`
      : `<b>${row.size}</b>`;

    html += `<tr data-row-uid="${row.uid}" ${row.isNew ? 'style="background:#eff6ff"' : ''}>
      <td style="text-align:center">${idx + 1}</td>
      <td>${gradegramCell}</td>
      <td>${sizeCell}</td>
      <td>
        <input type="number" value="${row.quantity || ''}" min="1" step="1"
               onchange="onEditRowChange('${row.uid}', 'quantity', this.value)"
               style="width:70px;text-align:center">
      </td>
      <td style="text-align:right;color:#dc2626;font-weight:700">
        <input type="number" value="${Number(displayPrice).toFixed(2)}" step="0.01"
               onchange="onEditRowChange('${row.uid}', 'price', this.value)"
               style="width:80px;text-align:right;color:#dc2626;font-weight:700">
      </td>
      <td>
        <select onchange="onEditRowChange('${row.uid}', 'customer_roll', this.value)">
          <option value="normal" ${row.customer_roll === 'normal' ? 'selected' : ''}>ปกติ</option>
          <option value="pump_f" ${row.customer_roll === 'pump_f' ? 'selected' : ''}>ปั้ม F</option>
          <option value="pump_bt" ${row.customer_roll === 'pump_bt' ? 'selected' : ''}>ปั้ม BT</option>
          <option value="pump_ktp" ${row.customer_roll === 'pump_ktp' ? 'selected' : ''}>ปั้ม KTP</option>
        </select>
      </td>
      <td>
        <select onchange="onEditRowChange('${row.uid}', 'quality_b', this.value)">
          <option value="normal" ${row.quality_b === 'normal' ? 'selected' : ''}>ปกติ</option>
          <option value="nc" ${row.quality_b === 'nc' ? 'selected' : ''}>NC</option>
        </select>
      </td>
      <td>
        <input type="text" value="${esc(row.note || '')}"
               onchange="onEditRowChange('${row.uid}', 'note', this.value)"
               style="width:100%;min-width:100px">
      </td>
      <td style="text-align:center">
        <button class="danger" onclick="removeEditRow('${row.uid}')"
                style="padding:4px 10px;font-size:12px">✕</button>
      </td>
    </tr>`;
  });

  html += `</tbody></table></div>`;

  // ✅ ปุ่มเพิ่มแถว + remaining
  html += `<div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;gap:8px;flex-wrap:wrap">
    <button type="button" onclick="addEditRow()" ${remaining <= 0 ? 'disabled' : ''}
            style="border:1px dashed #2563eb;color:#1e40af;background:#eff6ff;padding:8px 18px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600">
      ➕ เพิ่มแถว
    </button>
    <div style="font-size:13px;color:${remaining <= 0 ? '#dc2626' : '#475569'}">
      ${remaining <= 0 ? '⚠️ <b>ครบ 15 รายการ</b> — ไม่สามารถเพิ่มได้' : `สามารถเพิ่มได้อีก <b>${remaining}</b> รายการ`}
    </div>
  </div>`;

  // ✅ ปุ่ม action
  html += `<div class="form-actions" style="margin-top:16px;border-top:1px solid #e2e8f0;padding-top:14px">
    <button onclick="cancelPOForm()">ยกเลิก</button>
    <button class="primary" onclick="saveEditPOItems(this)">💾 บันทึกการแก้ไข</button>
  </div>`;

  container.innerHTML = html;
}

// ✅ Add row ใหม่
function addEditRow() {
  const activeCount = _editItemsRows.filter(r => !r.removed).length;
  if (activeCount >= 15) {
    alert('⚠️ ครบ 15 รายการแล้ว');
    return;
  }
  _editItemsRows.push({
    uid: `new_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    id: null,
    isNew: true,
    gradegram: '',
    size: '',
    quantity: '',
    price: 0,
    customer_roll: 'normal',
    quality_b: 'normal',
    note: '',
    removed: false
  });
  renderPOFormTable();
}

// ✅ Change handler
function onEditRowChange(uid, field, value) {
  const row = _editItemsRows.find(r => r.uid === uid);
  if (!row) return;

  row[field] = value;

  if (field === 'gradegram') {
    row.size = '';
  }

  // ✅ Re-render (เพื่ออัปเดต size + price)
  renderPOFormTable();
}

// ✅ Remove row
async function removeEditRow(uid) {
  const row = _editItemsRows.find(r => r.uid === uid);
  if (!row) return;

  if (row.isNew) {
    // ใหม่ → ลบออกจาก array
    _editItemsRows = _editItemsRows.filter(r => r.uid !== uid);
    renderPOFormTable();
    return;
  }

  // เก่า → ต้องยืนยัน + ใส่หมายเหตุ
  if (!confirm(`⚠️ ต้องการลบรายการ ${row.gradegram} ${row.size} ออกจาก PO?\n(จะถูกบันทึกเป็น "ยกเลิก")`)) return;

  const note = prompt('📝 หมายเหตุการยกเลิก:');
  if (note === null) return;
  if (!note.trim()) {
    alert('กรุณาใส่หมายเหตุ');
    return;
  }

  try {
    const { error } = await supabase.rpc('cancel_po_item', {
      p_item_id: row.id,
      p_note: note,
      p_user_id: currentUser?.id
    });
    if (error) throw error;

    // ✅ Mark removed
    row.removed = true;
    renderPOFormTable();
    alert('✅ ยกเลิกรายการสำเร็จ');
  } catch (e) {
    alert('❌ ' + e.message);
  }
}

// ✅ บันทึกการแก้ไข (ทั้ง old ที่เปลี่ยน + new ที่เพิ่ม)
async function saveEditPOItems(btnEl) {
  if (!poEditingId) {
    alert('ไม่พบ PO ที่กำลังแก้ไข');
    return;
  }

  // ✅ ตรวจสอบข้อมูล
  const activeRows = _editItemsRows.filter(r => !r.removed);

  // ✅ ตรวจ new rows
  for (const row of activeRows) {
    if (row.isNew) {
      if (!row.gradegram || !row.size || !row.quantity) {
        alert('⚠️ กรุณากรอกรายการใหม่ให้ครบ (Gradegram / Size / Quantity)');
        return;
      }
      if (Number(row.quantity) <= 0) {
        alert(`⚠️ จำนวนต้อง > 0 (${row.gradegram} ${row.size})`);
        return;
      }
    }
  }

  // ✅ แยก: rows ที่มีการแก้ไข (old) + rows ใหม่
  const updatedOld = [];
  const newRows = [];

  activeRows.forEach(row => {
    if (row.isNew) {
      newRows.push(row);
    } else {
      const orig = row.original;
      const changed =
        Number(row.quantity) !== Number(orig.quantity) ||
        Number(row.price) !== Number(orig.price) ||
        row.customer_roll !== (orig.customer_roll || 'normal') ||
        row.quality_b !== (orig.quality_b || 'normal') ||
        (row.note || '') !== (orig.note || '');

      if (changed) {
        updatedOld.push(row);
      }
    }
  });

  if (!updatedOld.length && !newRows.length) {
    alert('ไม่มีการเปลี่ยนแปลง');
    return;
  }

  const totalMsg = [];
  if (updatedOld.length) totalMsg.push(`แก้ไข ${updatedOld.length} รายการ`);
  if (newRows.length) totalMsg.push(`เพิ่ม ${newRows.length} รายการ`);

  if (!confirm(`ยืนยันบันทึก?\n\n${totalMsg.join(' · ')}`)) return;

  // ✅ Disable ปุ่ม
  const btn = btnEl || document.querySelector('#poFormBody .form-actions .primary');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'กำลังบันทึก...';
  }

  let errorMsg = '';

  // ✅ 1) อัปเดต old items ทีละรายการ
  for (const row of updatedOld) {
    try {
      const payload = {
        quantity: Number(row.quantity),
        price: Number(row.price),
        customer_roll: row.customer_roll,
        quality_b: row.quality_b,
        note: row.note || '',
        kg_total: calcKgTotal(row.gradegram, row.size, row.quantity)
      };

      const { error } = await supabase.rpc('update_po_item', {
        p_item_id: row.id,
        p_data: payload,
        p_user_id: currentUser?.id
      });
      if (error) throw error;
    } catch (e) {
      errorMsg += `แก้ไข ${row.gradegram} ${row.size}: ${e.message}; `;
    }
  }

  // ✅ 2) เพิ่ม new items (ถ้ามี)
  if (newRows.length) {
    try {
      const itemsPayload = newRows.map(r => {
        const price = Number(r.price) || getPriceFromMaster(r.gradegram, r.customer_roll, r.quality_b);
        const kgTotal = calcKgTotal(r.gradegram, r.size, r.quantity);

        const custLabel = { normal: '', pump_f: 'ปั้ม F', pump_bt: 'ปั้ม BT', pump_ktp: 'ปั้ม KTP' }[r.customer_roll] || '';
        const qualLabel = { normal: '', nc: 'NC' }[r.quality_b] || '';
        const remarkParts = [custLabel, qualLabel, r.note].filter(x => x && String(x).trim());
        const remarkCombined = remarkParts.join(',');

        return {
          pc_code: 'SDPC.01',
          gradegram: r.gradegram,
          size: Number(r.size),
          gradegram_size: `${r.gradegram}-${Number(r.size).toFixed(2)}`,
          quantity: Number(r.quantity),
          kg_total: kgTotal,
          price: price,
          customer_roll: r.customer_roll,
          quality_b: r.quality_b,
          note: r.note || '',
          remark_combined: remarkCombined
        };
      });

      const { data, error } = await supabase.rpc('add_po_items', {
        p_po_id: poEditingId,
        p_items: itemsPayload,
        p_user_id: currentUser?.id
      });
      if (error) throw error;

      if (!data || !data.success) {
        throw new Error(data?.error || 'เพิ่มรายการไม่สำเร็จ');
      }
    } catch (e) {
      errorMsg += `เพิ่มรายการใหม่: ${e.message}; `;
    }
  }

  if (btn) {
    btn.disabled = false;
    btn.textContent = '💾 บันทึกการแก้ไข';
  }

  if (errorMsg) {
    alert(`⚠️ มีข้อผิดพลาด:\n${errorMsg}`);
  } else {
    const summary = [];
    if (updatedOld.length) summary.push(`แก้ไข ${updatedOld.length}`);
    if (newRows.length) summary.push(`เพิ่ม ${newRows.length}`);
    alert(`✅ บันทึกสำเร็จ (${summary.join(' · ')})`);
  }

  // ✅ Refresh
  try {
    const { data: detail } = await supabase.rpc('get_purchase_order_detail', { p_po_id: poEditingId });
    if (detail) renderPOFormContent(detail.header, detail.items);
  } catch (e) {
    console.warn('refresh after save:', e);
  }

  await renderPOList();
}

// ================= EDIT ITEM (single field — legacy) =================
async function onPOItemEdit(itemId, field, value) {
  try {
    const payload = {};
    payload[field] = value;

    const { error } = await supabase.rpc('update_po_item', {
      p_item_id: itemId,
      p_data: payload,
      p_user_id: currentUser?.id
    });
    if (error) throw error;
  } catch (e) {
    alert('❌ ' + e.message);
  }
}

// ================= CANCEL ITEM =================
async function cancelPOItem(itemId) {
  const note = prompt('❓ หมายเหตุการยกเลิกรายการ:');
  if (note === null) return;
  if (!note.trim()) {
    alert('กรุณาใส่หมายเหตุ');
    return;
  }

  try {
    const { error } = await supabase.rpc('cancel_po_item', {
      p_item_id: itemId,
      p_note: note,
      p_user_id: currentUser?.id
    });
    if (error) throw error;

    const poId = poEditingId;
    if (poId) {
      const { data } = await supabase.rpc('get_purchase_order_detail', { p_po_id: poId });
      renderPOFormContent(data.header, data.items);
    }
    alert('✅ ยกเลิกรายการสำเร็จ');
  } catch (e) {
    alert('❌ ' + e.message);
  }
}

// ================= PO DETAIL =================
async function openPODetail(poId) {
  $('poDetailTitle').textContent = '📄 รายละเอียด PO';
  $('poDetailBody').innerHTML = '<p style="text-align:center;color:#94a3b8;padding:20px">กำลังโหลด...</p>';
  openModal('modalPODetail');

  try {
    const { data, error } = await supabase.rpc('get_purchase_order_detail', { p_po_id: poId });
    if (error) throw error;

    const header = data.header || {};
    const items = data.items || [];
    const logs = data.logs || [];

    $('poDetailTitle').innerHTML = `📄 ${esc(header.po_no)} · ${esc(header.sup_code)}`;

    const statusBadge = {
      draft: '<span class="badge" style="background:#fef3c7;color:#b45309">📝 Draft</span>',
      saved: '<span class="badge ok">✅ Saved</span>',
      sent:  '<span class="badge" style="background:#dbeafe;color:#1e40af">📤 Sent</span>'
    }[header.status] || header.status;

    let html = `<div class="msg info" style="margin-bottom:14px">
      <b>${esc(header.po_no)}</b> · ${statusBadge}<br>
      วันที่ออก: <b>${fmtDateTH(header.po_date)}</b> · วันที่รับ: <b>${fmtDateTH(header.ref_receive)}</b> · Sup: <b>${esc(header.sup_code)}</b><br>
      อ้างอิง: Stock Level <b>${header.ref_snapshot || '-'}</b> · Stock <b>${header.ref_stock || '-'}</b> · Receive <b>${header.ref_receive || '-'}</b><br>
      รวม: <b>${header.total_items || 0}</b> รายการ · <b>${Number(header.total_kg || 0).toLocaleString()}</b> kg
    </div>`;

    html += '<h4>📦 รายการ</h4>';
    html += '<div class="data-scroll"><table class="data-table"><thead><tr>';
    html += '<th>#</th><th>PC.</th><th>Gradegram</th><th>Size</th><th>Qty</th><th>KG รวม</th>';
    html += '<th>Price</th><th>ม้วนลูกค้า</th><th>คุณภาพ B</th><th>FSC</th><th>หมายเหตุ</th><th>สถานะ</th>';
    html += '</tr></thead><tbody>';

    items.forEach((it, i) => {
      const isCancelled = it.status === 'cancelled';
      const custLabel = { normal: 'ปกติ', pump_f: 'ปั้ม F', pump_bt: 'ปั้ม BT', pump_ktp: 'ปั้ม KTP' }[it.customer_roll] || 'ปกติ';
      const qualLabel = { normal: 'ปกติ', nc: 'NC' }[it.quality_b] || 'ปกติ';
      const isFSC = /^([A-Z]+)/.test(it.gradegram) && it.gradegram.match(/^([A-Z]+)/)[1].includes('F');
      const rowStyle = isCancelled ? 'style="opacity:0.5;text-decoration:line-through"' : '';

      html += `<tr ${rowStyle}>
        <td>${i + 1}</td>
        <td>${esc(it.pc_code) || 'SDPC.01'}</td>
        <td><b>${esc(it.gradegram)}</b></td>
        <td>${it.size}</td>
        <td style="text-align:right">${it.quantity}</td>
        <td style="text-align:right">${Number(it.kg_total || 0).toLocaleString()}</td>
        <td style="text-align:right">${Number(it.price || 0).toFixed(2)}</td>
        <td>${custLabel}</td>
        <td>${qualLabel}</td>
        <td>${isFSC ? '🟢' : '⚪'}</td>
        <td>${esc(it.note) || '-'}</td>
        <td>${isCancelled ? `❌ ยกเลิก: ${esc(it.cancel_note)}` : '✅ ปกติ'}</td>
      </tr>`;
    });

    html += '</tbody></table></div>';

    if (logs.length) {
      html += '<h4 style="margin-top:16px">📜 ประวัติการแก้ไข</h4>';
      html += '<div class="data-scroll" style="max-height:200px"><table class="data-table"><thead><tr>';
      html += '<th>วันที่</th><th>การกระทำ</th><th>รายการ</th><th>หมายเหตุ</th>';
      html += '</tr></thead><tbody>';
      logs.forEach(l => {
        html += `<tr>
          <td>${new Date(l.changed_at).toLocaleString('th-TH')}</td>
          <td>${esc(l.action)}</td>
          <td>${esc(l.field_name || '-')}</td>
          <td>${esc(l.note || '-')}</td>
        </tr>`;
      });
      html += '</tbody></table></div>';
    }

    $('poDetailBody').innerHTML = html;
  } catch (e) {
    $('poDetailBody').innerHTML = `<div class="msg err">${esc(e.message)}</div>`;
  }
}

// ═══════════════════════════════════════════════════════════════
// ================= ประวัติ PO ที่ถูกลบ =================
// ═══════════════════════════════════════════════════════════════

async function openDeletedPOList() {
  $('poDetailTitle').textContent = '📜 ประวัติ PO ที่ถูกลบ';
  $('poDetailBody').innerHTML = '<p style="text-align:center;color:#94a3b8;padding:20px">กำลังโหลด...</p>';
  openModal('modalPODetail');

  try {
    const { data, error } = await supabase
      .from('purchase_orders')
      .select('id, po_no, po_date, ref_receive, sup_code, total_items, total_kg, status, deleted_at, deleted_by, delete_note')
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false });

    if (error) throw error;

    if (!data || !data.length) {
      $('poDetailBody').innerHTML = '<p style="text-align:center;color:#94a3b8;padding:30px">ไม่มีประวัติ PO ที่ถูกลบ 🎉</p>';
      return;
    }

    let html = `<div class="msg warn" style="margin-bottom:14px">
      📜 PO ที่ถูกลบทั้งหมด <b>${data.length}</b> รายการ
    </div>`;

    html += '<div class="data-scroll"><table class="data-table"><thead><tr>';
    html += '<th>PO No.</th><th>วันที่ออก</th><th>วันที่รับ</th><th>Sup.</th><th>จำนวน</th><th>KG รวม</th><th>วันที่ลบ</th><th>หมายเหตุ</th><th></th>';
    html += '</tr></thead><tbody>';

    data.forEach(po => {
      html += `<tr>
        <td><b>${esc(po.po_no)}</b></td>
        <td>${fmtDateTH(po.po_date)}</td>
        <td>${fmtDateTH(po.ref_receive)}</td>
        <td>${esc(po.sup_code)}</td>
        <td style="text-align:right">${po.total_items || 0}</td>
        <td style="text-align:right">${Number(po.total_kg || 0).toLocaleString('en-US', {minimumFractionDigits:2})}</td>
        <td>${po.deleted_at ? new Date(po.deleted_at).toLocaleString('th-TH') : '-'}</td>
        <td>${esc(po.delete_note) || '-'}</td>
        <td>
          <button onclick="openDeletedPODetail('${po.id}')">📄 ดูรายละเอียด</button>
        </td>
      </tr>`;
    });

    html += '</tbody></table></div>';

    $('poDetailBody').innerHTML = html;
  } catch (e) {
    console.error('openDeletedPOList:', e);
    $('poDetailBody').innerHTML = `<div class="msg err">โหลดไม่สำเร็จ: ${esc(e.message)}</div>`;
  }
}

async function openDeletedPODetail(poId) {
  $('poDetailTitle').textContent = '📄 รายละเอียด PO ที่ถูกลบ';
  $('poDetailBody').innerHTML = '<p style="text-align:center;color:#94a3b8;padding:20px">กำลังโหลด...</p>';

  try {
    const { data, error } = await supabase.rpc('get_purchase_order_detail', { p_po_id: poId });
    if (error) throw error;

    const header = data.header || {};
    const items = data.items || [];
    const logs = data.logs || [];

    $('poDetailTitle').innerHTML = `📄 ${esc(header.po_no)} · ${esc(header.sup_code)} <span style="color:#dc2626;font-weight:400;font-size:14px">(ถูกลบ)</span>`;

    let html = `<div class="msg err" style="margin-bottom:14px">
      <b>⚠️ PO นี้ถูกลบแล้ว</b><br>
      <b>PO No.:</b> ${esc(header.po_no)}<br>
      <b>วันที่ออก:</b> ${fmtDateTH(header.po_date)} · 
      <b>วันที่รับ:</b> ${fmtDateTH(header.ref_receive)}<br>
      <b>Sup.:</b> ${esc(header.sup_code)} · 
      <b>รวม:</b> ${header.total_items || 0} รายการ · ${Number(header.total_kg || 0).toLocaleString()} kg<br>
      <b>ลบเมื่อ:</b> ${header.deleted_at ? new Date(header.deleted_at).toLocaleString('th-TH') : '-'}<br>
      <b>หมายเหตุการลบ:</b> ${esc(header.delete_note) || '-'}
    </div>`;

    html += '<h4>📦 รายการ</h4>';
    html += '<div class="data-scroll"><table class="data-table"><thead><tr>';
    html += '<th>#</th><th>PC.</th><th>Gradegram</th><th>Size</th><th>Qty</th><th>KG รวม</th><th>Price</th><th>หมายเหตุ</th>';
    html += '</tr></thead><tbody>';

    items.forEach((it, i) => {
      const isCancelled = it.status === 'cancelled';
      const rowStyle = isCancelled ? 'style="opacity:0.5;text-decoration:line-through"' : '';
      html += `<tr ${rowStyle}>
        <td>${i + 1}</td>
        <td>${esc(it.pc_code) || 'SDPC.01'}</td>
        <td><b>${esc(it.gradegram)}</b></td>
        <td>${it.size}</td>
        <td style="text-align:right">${it.quantity}</td>
        <td style="text-align:right">${Number(it.kg_total || 0).toLocaleString('en-US', {minimumFractionDigits:2})}</td>
        <td style="text-align:right">${Number(it.price || 0).toFixed(2)}</td>
        <td>${esc(it.remark_combined || it.note) || '-'}</td>
      </tr>`;
    });

    html += '</tbody></table></div>';

    if (logs.length) {
      html += '<h4 style="margin-top:16px">📜 ประวัติการแก้ไข</h4>';
      html += '<div class="data-scroll" style="max-height:300px"><table class="data-table"><thead><tr>';
      html += '<th>วันที่</th><th>การกระทำ</th><th>รายการ</th><th>หมายเหตุ</th>';
      html += '</tr></thead><tbody>';
      logs.forEach(l => {
        html += `<tr>
          <td>${new Date(l.changed_at).toLocaleString('th-TH')}</td>
          <td>${esc(l.action)}</td>
          <td>${esc(l.field_name || '-')}</td>
          <td>${esc(l.note || '-')}</td>
        </tr>`;
      });
      html += '</tbody></table></div>';
    }

    html += `<div class="form-actions" style="margin-top:16px">
      <button onclick="openDeletedPOList()">◀ กลับไปประวัติ</button>
    </div>`;

    $('poDetailBody').innerHTML = html;
  } catch (e) {
    $('poDetailBody').innerHTML = `<div class="msg err">${esc(e.message)}</div>`;
  }
}

// ================= DELETE PO =================
async function deletePO(poId) {
  const po = poCache.find(p => p.id === poId);
  if (!po) return;

  let password = null;

  if (po.status === 'saved' || po.status === 'sent') {
    password = prompt(`🔒 PO นี้สถานะ ${po.status.toUpperCase()}\nกรุณาใส่รหัสผ่านเพื่อยืนยัน:`);
    if (!password) return;
  }

  const note = prompt('📝 หมายเหตุการลบ:');
  if (note === null) return;

  if (!confirm(`⚠️ ยืนยันลบ PO ${po.po_no}?\n\n(ไม่สามารถกู้คืนได้)`)) return;

  try {
    const { error } = await supabase.rpc('delete_purchase_order', {
      p_po_id: poId,
      p_user_id: currentUser?.id,
      p_password: password,
      p_note: note
    });
    if (error) throw error;
    alert('✅ ลบสำเร็จ');
    await renderPOList();
  } catch (e) {
    alert('❌ ' + e.message);
  }
}

// ================= PO MONTH CHANGE =================
async function onPOMonthChange() {
  const monthEl = $('poMonth');
  if (!monthEl) return;
  poSelectedMonth = monthEl.value;
  await loadPriceMaster();
  await renderPOList();
}

// ================= CANCEL PO FORM =================
function cancelPOForm() {
  closeModal('modalPOForm');

  window._pendingPOs = null;
  window._pendingAlertData = null;

  _editItemsRows = [];
  _editPOHeader = null;

  const alertBtn = document.querySelector('.nav button[data-tab="alert"]');
  if (alertBtn) alertBtn.click();
}

// ================= EXPORT PO TO EXCEL =================
function exportPOToExcel() {
  if (!poCache || !poCache.length) {
    alert('ไม่มีข้อมูล PO');
    return;
  }

  if (!confirm(`Export ${poCache.length} PO เป็น Excel?`)) return;

  exportPOToExcel_Async();
}

async function exportPOToExcel_Async() {
  try {
    const allItems = [];
    const posWithItems = [];

    for (const po of poCache) {
      const { data, error } = await supabase.rpc('get_purchase_order_detail', { p_po_id: po.id });
      if (error) throw error;

      const items = (data.items || []).filter(it => it.status !== 'cancelled');

      posWithItems.push({
        po: data.header,
        items: items
      });

      items.forEach(it => {
        allItems.push({
          ...it,
          po_no: data.header.po_no,
          sup_code: data.header.sup_code
        });
      });
    }

    if (!allItems.length) {
      alert('ไม่มีรายการที่จะ export');
      return;
    }

    const wsData = [];

    wsData.push([
      'PC.', 'SUP.', 'Gradegram', 'Size', 'Gradegram-Size',
      'Quantity', 'KG. รวม', 'BU', 'Department', 'Price', 'หมายเหตุ', 'เลขที่ PO'
    ]);

    posWithItems.forEach((p) => {
      p.items.forEach((it, itemIdx) => {
        const custLabel = { normal: '', pump_f: 'ปั้ม F', pump_bt: 'ปั้ม BT', pump_ktp: 'ปั้ม KTP' }[it.customer_roll] || '';
        const qualLabel = { normal: '', nc: 'NC' }[it.quality_b] || '';
        const noteParts = [custLabel, qualLabel, it.note].filter(x => x && x.trim());
        const remarkCombined = noteParts.join(',');

        wsData.push([
          it.pc_code || 'SDPC.01',
          p.po.sup_code || '',
          it.gradegram,
          it.size,
          it.gradegram_size,
          it.quantity,
          Number(it.kg_total || 0),
          1,
          '13110',
          Number(it.price || 0),
          remarkCombined,
          itemIdx === 0 ? p.po.po_no : ''
        ]);
      });
    });

    const ws = XLSX.utils.aoa_to_sheet(wsData);

    ws['!cols'] = [
      { wch: 10 }, { wch: 8 }, { wch: 12 }, { wch: 6 }, { wch: 16 },
      { wch: 10 }, { wch: 12 }, { wch: 5 }, { wch: 12 }, { wch: 10 },
      { wch: 40 }, { wch: 16 }
    ];

    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let R = 1; R <= range.e.r; R++) {
      const kgCell = ws[XLSX.utils.encode_cell({ r: R, c: 6 })];
      if (kgCell) kgCell.z = '#,##0.00';
      const pCell = ws[XLSX.utils.encode_cell({ r: R, c: 9 })];
      if (pCell) pCell.z = '0.00';
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'PO');

    const month = poSelectedMonth || new Date().toISOString().slice(0, 7);
    XLSX.writeFile(wb, `PO_${month}.xlsx`);

    alert(`✅ Export ${allItems.length} รายการ จาก ${posWithItems.length} PO สำเร็จ`);
  } catch (e) {
    alert('❌ ' + e.message);
  }
}

// ═══════════════════════════════════════════════════════════════
// ================= ADD PO ITEMS (Phase 3) =====================
// ═══════════════════════════════════════════════════════════════

let _addItemsRows = [];

async function openAddPOItemsModal() {
  if (!poEditingId) {
    alert('ไม่พบ PO ที่กำลังแก้ไข');
    return;
  }

  try {
    const { data, error } = await supabase.rpc('get_purchase_order_detail', { p_po_id: poEditingId });
    if (error) throw error;

    const header = data.header || {};
    const items = (data.items || []).filter(it => it.status !== 'cancelled');
    const remaining = 15 - items.length;

    if (remaining <= 0) {
      alert('⚠️ PO นี้มี 15 รายการแล้ว — ไม่สามารถเพิ่มได้');
      return;
    }

    _addItemsRows = [createEmptyAddRow()];

    renderAddPOItemsModal(header, items.length, remaining);

    openModal('modalAddPOItems');

  } catch (e) {
    alert('❌ ' + e.message);
  }
}

function createEmptyAddRow() {
  return {
    uid: `row_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    pc_code: 'SDPC.01',
    gradegram: '',
    size: '',
    quantity: '',
    price: 0,
    customer_roll: 'normal',
    quality_b: 'normal',
    note: ''
  };
}

function renderAddPOItemsModal(header, currentCount, remaining) {
  const titleEl = $('addPOItemsTitle');
  if (titleEl) titleEl.innerHTML = `➕ เพิ่มรายการ — ${esc(header.po_no)}`;

  const infoBar = $('addPOItemsInfo');
  if (infoBar) {
    infoBar.innerHTML = `
      <div>📦 มีอยู่ <b>${currentCount}</b> รายการ · เพิ่มได้อีก <b style="color:#dc2626">${remaining}</b> รายการ</div>
      <div>Sup: <b>${esc(header.sup_code)}</b> · วันที่รับ: <b>${fmtDateTH(header.ref_receive)}</b></div>
    `;
  }

  renderAddPOItemsTable();
}

function renderAddPOItemsTable() {
  const tbody = $('addPOItemsTbody');
  if (!tbody) return;

  const gradegramOptions = masterCache.map(m => normalizeGrade(m.grade) + m.gram);
  const uniqueGradegrams = [...new Set(gradegramOptions)].sort();

  let html = '';
  _addItemsRows.forEach((row, idx) => {
    const availableSizes = getAvailableSizesFor(row.gradegram);

    const autoPrice = row.gradegram 
      ? getPriceFromMaster(row.gradegram, row.customer_roll, row.quality_b) 
      : 0;

    const gradegramOpts = uniqueGradegrams.map(g => 
      `<option value="${esc(g)}" ${row.gradegram === g ? 'selected' : ''}>${esc(g)}</option>`
    ).join('');

    const sizeOpts = availableSizes.map(s => 
      `<option value="${s}" ${Number(row.size) === s ? 'selected' : ''}>${s}</option>`
    ).join('');

    const canRemove = _addItemsRows.length > 1;

    html += `<tr data-row-uid="${row.uid}">
      <td style="text-align:center">${idx + 1}</td>
      <td>
        <select onchange="onAddRowChange('${row.uid}', 'gradegram', this.value)" style="width:100%;max-width:120px">
          <option value="">-- เลือก --</option>
          ${gradegramOpts}
        </select>
      </td>
      <td>
        <select onchange="onAddRowChange('${row.uid}', 'size', this.value)" style="width:80px" ${!row.gradegram ? 'disabled' : ''}>
          <option value="">--</option>
          ${sizeOpts}
        </select>
      </td>
      <td>
        <input type="number" value="${row.quantity || ''}" min="1" step="1"
               onchange="onAddRowChange('${row.uid}', 'quantity', this.value)"
               style="width:70px;text-align:center">
      </td>
      <td style="text-align:right;color:#dc2626;font-weight:700">
        ${autoPrice > 0 ? autoPrice.toFixed(2) : '-'}
      </td>
      <td>
        <select onchange="onAddRowChange('${row.uid}', 'customer_roll', this.value)" style="width:100%">
          <option value="normal"   ${row.customer_roll === 'normal' ? 'selected' : ''}>ปกติ</option>
          <option value="pump_f"   ${row.customer_roll === 'pump_f' ? 'selected' : ''}>ปั้ม F</option>
          <option value="pump_bt"  ${row.customer_roll === 'pump_bt' ? 'selected' : ''}>ปั้ม BT</option>
          <option value="pump_ktp" ${row.customer_roll === 'pump_ktp' ? 'selected' : ''}>ปั้ม KTP</option>
        </select>
      </td>
      <td>
        <select onchange="onAddRowChange('${row.uid}', 'quality_b', this.value)" style="width:100%">
          <option value="normal" ${row.quality_b === 'normal' ? 'selected' : ''}>ปกติ</option>
          <option value="nc"     ${row.quality_b === 'nc' ? 'selected' : ''}>NC</option>
        </select>
      </td>
      <td>
        <input type="text" value="${esc(row.note || '')}" 
               onchange="onAddRowChange('${row.uid}', 'note', this.value)"
               style="width:100%;min-width:100px">
      </td>
      <td style="text-align:center">
        <button class="danger" onclick="removeAddRow('${row.uid}')" 
                ${!canRemove ? 'disabled title="ต้องมีอย่างน้อย 1 แถว"' : ''}
                style="padding:4px 8px">✕</button>
      </td>
    </tr>`;
  });

  tbody.innerHTML = html;

  const remaining = 15 - (getCurrentPOItemCount() + _addItemsRows.length);
  updateAddItemsRemaining(remaining);
}

function getAvailableSizesFor(gradegram) {
  if (!gradegram) return [];
  const { grade, gram } = parseGradegram(gradegram);
  return [...new Set(
    masterCache
      .filter(m => normalizeGrade(m.grade) === grade && String(m.gram) === String(gram))
      .map(m => Number(m.size))
  )].sort((a, b) => a - b);
}

function getCurrentPOItemCount() {
  const tbody = document.querySelector('#poFormBody table tbody');
  if (!tbody) return 0;
  return tbody.querySelectorAll('tr[data-item-id]').length;
}

function updateAddItemsRemaining(remaining) {
  const label = $('addPOItemsRemaining');
  if (label) {
    if (remaining <= 0) {
      label.innerHTML = `⚠️ <b style="color:#dc2626">ครบ 15 รายการ</b> — ไม่สามารถเพิ่มได้`;
      const addBtn = $('addPOItemsAddBtn');
      if (addBtn) addBtn.disabled = true;
    } else {
      label.innerHTML = `สามารถเพิ่มได้อีก <b>${remaining}</b> รายการ`;
      const addBtn = $('addPOItemsAddBtn');
      if (addBtn) addBtn.disabled = false;
    }
  }
}

function onAddRowChange(uid, field, value) {
  const row = _addItemsRows.find(r => r.uid === uid);
  if (!row) return;

  row[field] = value;

  if (field === 'gradegram') {
    row.size = '';
  }

  renderAddPOItemsTable();
}

function addAddRow() {
  const currentTotal = getCurrentPOItemCount() + _addItemsRows.length;
  if (currentTotal >= 15) {
    alert('⚠️ เกินขีดจำกัด 15 รายการ');
    return;
  }
  _addItemsRows.push(createEmptyAddRow());
  renderAddPOItemsTable();
}

function removeAddRow(uid) {
  if (_addItemsRows.length <= 1) {
    alert('ต้องมีอย่างน้อย 1 แถว');
    return;
  }
  _addItemsRows = _addItemsRows.filter(r => r.uid !== uid);
  renderAddPOItemsTable();
}

async function saveAddPOItems() {
  if (!poEditingId) return;

  const validRows = [];
  for (const row of _addItemsRows) {
    if (!row.gradegram || !row.size || !row.quantity) continue;
    if (Number(row.quantity) <= 0) {
      alert(`⚠️ แถวที่มี ${row.gradegram} ${row.size}: จำนวนต้อง > 0`);
      return;
    }
    validRows.push(row);
  }

  if (!validRows.length) {
    alert('กรุณากรอกข้อมูลอย่างน้อย 1 แถว');
    return;
  }

  const currentCount = getCurrentPOItemCount();
  const totalAfter = currentCount + validRows.length;
  if (totalAfter > 15) {
    alert(`⚠️ เกินขีดจำกัด 15 รายการ\nมีอยู่ ${currentCount} + ใหม่ ${validRows.length} = ${totalAfter}`);
    return;
  }

  const itemsPayload = validRows.map(r => {
    const price = getPriceFromMaster(r.gradegram, r.customer_roll, r.quality_b);
    const kgTotal = calcKgTotal(r.gradegram, r.size, r.quantity);

    const custLabel = { normal: '', pump_f: 'ปั้ม F', pump_bt: 'ปั้ม BT', pump_ktp: 'ปั้ม KTP' }[r.customer_roll] || '';
    const qualLabel = { normal: '', nc: 'NC' }[r.quality_b] || '';
    const remarkParts = [custLabel, qualLabel, r.note].filter(x => x && String(x).trim());
    const remarkCombined = remarkParts.join(',');

    return {
      pc_code: r.pc_code || 'SDPC.01',
      gradegram: r.gradegram,
      size: Number(r.size),
      gradegram_size: `${r.gradegram}-${Number(r.size).toFixed(2)}`,
      quantity: Number(r.quantity),
      kg_total: kgTotal,
      price: price,
      customer_roll: r.customer_roll,
      quality_b: r.quality_b,
      note: r.note || '',
      remark_combined: remarkCombined
    };
  });

  const btn = document.querySelector('#modalAddPOItems .form-actions .primary');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'กำลังบันทึก...';
  }

  try {
    const { data, error } = await supabase.rpc('add_po_items', {
      p_po_id: poEditingId,
      p_items: itemsPayload,
      p_user_id: currentUser?.id
    });
    if (error) throw error;

    if (!data || !data.success) {
      throw new Error(data?.error || 'บันทึกไม่สำเร็จ');
    }

    alert(`✅ เพิ่ม ${data.added} รายการสำเร็จ (รวม ${data.total} รายการ)`);

    closeModal('modalAddPOItems');
    _addItemsRows = [];

    const { data: detail } = await supabase.rpc('get_purchase_order_detail', { p_po_id: poEditingId });
    if (detail) renderPOFormContent(detail.header, detail.items);

  } catch (e) {
    alert('❌ ' + e.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '💾 บันทึกการแก้ไข';
    }
  }
}

function closeAddPOItemsModal() {
  if (_addItemsRows.some(r => r.gradegram || r.size || r.quantity)) {
    if (!confirm('⚠️ มีข้อมูลที่กรอกไว้ — ต้องการปิดหรือไม่?')) return;
  }
  closeModal('modalAddPOItems');
  _addItemsRows = [];
}
