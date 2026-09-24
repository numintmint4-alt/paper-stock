// ═══════════════════════════════════════════════════════════════
// STOCK V6.3 — stock-level.js (FULL)
// Month Filter + Customer Filter + Gradegrams Filter + Size Filter
// + Matrix + Snapshot
// ═══════════════════════════════════════════════════════════════

// ================= STATE =================
let selectedMonths = [];
let allMonthsList = [];
let currentSnapshotData = null;

// ✅ Size Filter
let selectedSizes = [];
let allSizesList = [];

// ✅ Customer Filter (ใหม่)
let selectedCustomers = [];
let allCustomersList = [];

// ================= MONTH FILTER =================
function loadMonthFilter() {
  const yearEl = $('filterYear');
  const yearCE = yearEl ? Number(yearEl.value) - 543 : new Date().getFullYear();

  allMonthsList = [];
  for (let m = 1; m <= 12; m++) {
    allMonthsList.push(`${yearCE}-${pad(m)}`);
  }

  // ✅ default: เดือนปัจจุบัน (ถ้าปีที่เลือก = ปีปัจจุบัน)
  if (selectedMonths.length === 0) {
    const now = new Date();
    const curY = now.getFullYear();
    const curM = now.getMonth() + 1;
    if (curY === yearCE) {
      selectedMonths = [`${yearCE}-${pad(curM)}`];
    } else {
      // ✅ ถ้าเลือกปีอื่น → default เดือน 1 ของปีนั้น
      selectedMonths = [`${yearCE}-01`];
    }
  }

  renderMonthList();
  updateMonthLabel();
  attachMonthFilterListeners();
}

function attachMonthFilterListeners() {
  const btn = $('monthFilterBtn');
  const dropdown = $('monthDropdown');
  const box = $('monthFilterBox');
  if (!btn || !dropdown || !box) return;
  if (btn.dataset.listenerAttached === '1') return;
  btn.dataset.listenerAttached = '1';

  btn.onclick = (e) => {
    e.preventDefault(); e.stopPropagation();
    dropdown.classList.toggle('hidden');
    btn.classList.toggle('open');
  };

  if (!window._monthDocClickHandler) {
    window._monthDocClickHandler = (e) => {
      const b = $('monthFilterBtn'), d = $('monthDropdown'), bx = $('monthFilterBox');
      if (!b || !d || !bx) return;
      if (!bx.contains(e.target)) { d.classList.add('hidden'); b.classList.remove('open'); }
    };
    document.addEventListener('click', window._monthDocClickHandler);
  }
}

function renderMonthList() {
  const list = $('monthList');
  if (!list) return;
  if (!allMonthsList.length) {
    list.innerHTML = '<div style="padding:10px;text-align:center;color:#94a3b8;font-size:13px">ไม่มีข้อมูล</div>';
    return;
  }
  list.innerHTML = allMonthsList.map(ym => {
    const [y, m] = ym.split('-').map(Number);
    const label = `${THAI_MONTHS[m-1]} ${y + 543}`;
    const checked = selectedMonths.includes(ym);
    return `<label class="item ${checked ? 'checked' : ''}" data-month="${ym}">
      <input type="checkbox" ${checked ? 'checked' : ''}>
      <span>${label}</span>
    </label>`;
  }).join('');

  list.querySelectorAll('.item').forEach(el => {
    const cb = el.querySelector('input[type="checkbox"]');
    el.addEventListener('click', (e) => {
      if (e.target.tagName === 'INPUT') return;
      e.preventDefault();
      cb.checked = !cb.checked;
      const ym = el.dataset.month;
      if (cb.checked) { if (!selectedMonths.includes(ym)) selectedMonths.push(ym); }
      else selectedMonths = selectedMonths.filter(x => x !== ym);
      selectedMonths.sort();
      el.classList.toggle('checked', cb.checked);
      updateMonthLabel();
    });
    cb.addEventListener('change', () => {
      const ym = el.dataset.month;
      if (cb.checked) { if (!selectedMonths.includes(ym)) selectedMonths.push(ym); }
      else selectedMonths = selectedMonths.filter(x => x !== ym);
      selectedMonths.sort();
      el.classList.toggle('checked', cb.checked);
      updateMonthLabel();
    });
  });
}

function updateMonthLabel() {
  const label = $('monthFilterLabel');
  if (!label) return;
  if (selectedMonths.length === 0) { label.textContent = 'ทั้งหมด'; label.style.color = '#1e293b'; }
  else if (selectedMonths.length === 1) {
    const [y, m] = selectedMonths[0].split('-').map(Number);
    label.textContent = `${THAI_MONTHS[m-1]} ${y + 543}`;
    label.style.color = '#1e40af';
  } else { label.textContent = `เลือก ${selectedMonths.length} เดือน`; label.style.color = '#1e40af'; }
}

function selectAllMonths() { selectedMonths = [...allMonthsList]; renderMonthList(); updateMonthLabel(); }
function clearAllMonths() { selectedMonths = []; renderMonthList(); updateMonthLabel(); }
function onYearChange() { selectedMonths = []; loadMonthFilter(); }

// ================= SIZE FILTER =================
function loadSizeFilter() {
  if (!masterCache || masterCache.length === 0) {
    console.log('[SizeFilter] masterCache ว่าง — รอ 300ms แล้วลองใหม่');
    setTimeout(loadSizeFilter, 300);
    return;
  }

  allSizesList = [...new Set(
    masterCache.map(m => Number(m.size)).filter(Boolean)
  )].sort((a, b) => a - b);

  console.log('[SizeFilter] ✅ โหลด ' + allSizesList.length + ' Size:', allSizesList);
  renderSizeList();
  updateSizeFilterLabel();
  attachSizeFilterListeners();
}

function attachSizeFilterListeners() {
  const btn = $('sizeFilterBtn');
  const dropdown = $('sizeDropdown');
  const box = $('sizeFilterBox');
  if (!btn || !dropdown || !box) {
    console.warn('[SizeFilter] ไม่พบ element — เช็ค id ใน index.html');
    return;
  }
  if (btn.dataset.listenerAttached === '1') return;
  btn.dataset.listenerAttached = '1';

  btn.onclick = (e) => {
    e.preventDefault(); e.stopPropagation();
    dropdown.classList.toggle('hidden');
    btn.classList.toggle('open');
  };

  if (!window._sizeDocClickHandler) {
    window._sizeDocClickHandler = (e) => {
      const b = $('sizeFilterBtn'), d = $('sizeDropdown'), bx = $('sizeFilterBox');
      if (!b || !d || !bx) return;
      if (!bx.contains(e.target)) { d.classList.add('hidden'); b.classList.remove('open'); }
    };
    document.addEventListener('click', window._sizeDocClickHandler);
  }
}

function renderSizeList() {
  const list = $('sizeList');
  if (!list) return;
  if (!allSizesList.length) {
    list.innerHTML = '<div style="padding:10px;text-align:center;color:#94a3b8;font-size:13px">ไม่มีข้อมูล</div>';
    return;
  }
  list.innerHTML = allSizesList.map(s => {
    const checked = selectedSizes.includes(s);
    return `<label class="item ${checked ? 'checked' : ''}" data-size="${s}">
      <input type="checkbox" ${checked ? 'checked' : ''}>
      <span>${s}</span>
    </label>`;
  }).join('');

  list.querySelectorAll('.item').forEach(el => {
    const cb = el.querySelector('input[type="checkbox"]');
    el.addEventListener('click', (e) => {
      if (e.target.tagName === 'INPUT') return;
      e.preventDefault();
      cb.checked = !cb.checked;
      const size = Number(el.dataset.size);
      if (cb.checked) { if (!selectedSizes.includes(size)) selectedSizes.push(size); }
      else selectedSizes = selectedSizes.filter(x => x !== size);
      selectedSizes.sort((a, b) => a - b);
      el.classList.toggle('checked', cb.checked);
      updateSizeFilterLabel();
    });
    cb.addEventListener('change', () => {
      const size = Number(el.dataset.size);
      if (cb.checked) { if (!selectedSizes.includes(size)) selectedSizes.push(size); }
      else selectedSizes = selectedSizes.filter(x => x !== size);
      selectedSizes.sort((a, b) => a - b);
      el.classList.toggle('checked', cb.checked);
      updateSizeFilterLabel();
    });
  });
}

function updateSizeFilterLabel() {
  const label = $('sizeFilterLabel');
  if (!label) return;
  if (selectedSizes.length === 0) { label.textContent = 'ทั้งหมด'; label.style.color = '#1e293b'; }
  else if (selectedSizes.length === 1) { label.textContent = String(selectedSizes[0]); label.style.color = '#1e40af'; }
  else { label.textContent = `เลือก ${selectedSizes.length} Size`; label.style.color = '#1e40af'; }
}

function selectAllSizes() { selectedSizes = [...allSizesList]; renderSizeList(); updateSizeFilterLabel(); }
function clearAllSizes() { selectedSizes = []; renderSizeList(); updateSizeFilterLabel(); }
function getSelectedSizes() { return selectedSizes; }

// ================= CUSTOMER FILTER (ใหม่) =================
function loadCustomerFilter(custList) {
  // อัปเดต allCustomersList — เก็บค่าที่เคยเลือกไว้ (selectedCustomers) ไม่ให้หาย
  if (Array.isArray(custList) && custList.length > 0) {
    // รวมรายชื่อใหม่ + ค่าที่เคยเลือกไว้ (ถ้าหลุดจาก list ใหม่ ให้คงไว้)
    const merged = new Set([...custList, ...selectedCustomers]);
    allCustomersList = [...merged].sort();
  } else {
    // ถ้าไม่มีข้อมูลเลย ก็ยังคงค่าที่เคยเลือกไว้
    if (allCustomersList.length === 0) allCustomersList = [...selectedCustomers];
  }

  console.log('[CustomerFilter] ✅ โหลด ' + allCustomersList.length + ' ลูกค้า:', allCustomersList);
  renderCustomerList();
  updateCustomerFilterLabel();
  attachCustomerFilterListeners();
}

function attachCustomerFilterListeners() {
  const btn = $('customerFilterBtn');
  const dropdown = $('customerDropdown');
  const box = $('customerFilterBox');
  if (!btn || !dropdown || !box) {
    console.warn('[CustomerFilter] ไม่พบ element — เช็ค id ใน index.html');
    return;
  }
  if (btn.dataset.listenerAttached === '1') return;
  btn.dataset.listenerAttached = '1';

  btn.onclick = (e) => {
    e.preventDefault(); e.stopPropagation();
    dropdown.classList.toggle('hidden');
    btn.classList.toggle('open');
  };

  if (!window._customerDocClickHandler) {
    window._customerDocClickHandler = (e) => {
      const b = $('customerFilterBtn'), d = $('customerDropdown'), bx = $('customerFilterBox');
      if (!b || !d || !bx) return;
      if (!bx.contains(e.target)) { d.classList.add('hidden'); b.classList.remove('open'); }
    };
    document.addEventListener('click', window._customerDocClickHandler);
  }
}

function renderCustomerList() {
  const list = $('customerList');
  if (!list) return;

  // เพิ่ม __GENERAL__ เป็นตัวเลือกแรกเสมอ (ถ้ายังไม่มี)
  const displayList = ['__GENERAL__', ...allCustomersList.filter(c => c !== '__GENERAL__')];

  if (displayList.length === 0) {
    list.innerHTML = '<div style="padding:10px;text-align:center;color:#94a3b8;font-size:13px">ไม่มีข้อมูล</div>';
    return;
  }

  list.innerHTML = displayList.map(c => {
    const isGeneral = c === '__GENERAL__';
    const label = isGeneral ? '— ทั่วไป (ไม่ระบุลูกค้า) —' : c;
    const checked = selectedCustomers.includes(c);
    return `<label class="item ${checked ? 'checked' : ''}" data-customer="${esc(c)}">
      <input type="checkbox" ${checked ? 'checked' : ''}>
      <span>${esc(label)}</span>
    </label>`;
  }).join('');

  list.querySelectorAll('.item').forEach(el => {
    const cb = el.querySelector('input[type="checkbox"]');
    const val = el.dataset.customer;

    el.addEventListener('click', (e) => {
      if (e.target.tagName === 'INPUT') return;
      e.preventDefault();
      cb.checked = !cb.checked;
      toggleCustomer(val, cb.checked);
      el.classList.toggle('checked', cb.checked);
    });
    cb.addEventListener('change', () => {
      toggleCustomer(val, cb.checked);
      el.classList.toggle('checked', cb.checked);
    });
  });
}

function toggleCustomer(val, isChecked) {
  if (isChecked) {
    if (!selectedCustomers.includes(val)) selectedCustomers.push(val);
  } else {
    selectedCustomers = selectedCustomers.filter(x => x !== val);
  }
  updateCustomerFilterLabel();
}

function updateCustomerFilterLabel() {
  const label = $('customerFilterLabel');
  if (!label) return;
  if (selectedCustomers.length === 0) {
    label.textContent = 'ทั้งหมด';
    label.style.color = '#1e293b';
  } else if (selectedCustomers.length === 1) {
    const c = selectedCustomers[0];
    label.textContent = c === '__GENERAL__' ? 'ทั่วไป' : c;
    label.style.color = '#1e40af';
  } else {
    label.textContent = `เลือก ${selectedCustomers.length} ลูกค้า`;
    label.style.color = '#1e40af';
  }
}

function selectAllCustomers() {
  selectedCustomers = ['__GENERAL__', ...allCustomersList.filter(c => c !== '__GENERAL__')];
  renderCustomerList();
  updateCustomerFilterLabel();
}

function clearAllCustomers() {
  selectedCustomers = [];
  renderCustomerList();
  updateCustomerFilterLabel();
}

function getSelectedCustomers() {
  return selectedCustomers;
}

// ================= TITLE BUILDER =================
function updateReportTitle() {
  const mEl = $('titleMonth');
  const yEl = $('titleYear');
  if (!mEl || !yEl) return;
  const m = Number(mEl.value);
  const y = Number(yEl.value);
  const titleEl = $('reportTitle');
  if (titleEl) titleEl.innerHTML = `ตารางควบคุมระดับ Stock<br>ประจำเดือน ${THAI_MONTHS[m-1]} ${y}`;
}

function getCurrentTitle() {
  const mEl = $('titleMonth');
  const yEl = $('titleYear');
  if (!mEl || !yEl) return 'ตารางควบคุมระดับ Stock';
  const m = Number(mEl.value);
  const y = Number(yEl.value);
  return `ตารางควบคุมระดับ Stock ประจำเดือน ${THAI_MONTHS[m-1]} ${y}`;
}

// ================= MATRIX =================
async function renderMatrix() {
  if (selectedMonths.length === 0) {
    alert('กรุณาเลือกเดือนก่อน');
    return;
  }

  const sortedMonths = [...selectedMonths].sort();
  const fromYM = sortedMonths[0];
  const toYM = sortedMonths[sortedMonths.length - 1];

  const [fromY, fromM] = fromYM.split('-').map(Number);
  const [toY, toM] = toYM.split('-').map(Number);

  const fromISO = `${fromY}-${pad(fromM)}-01`;
  const toDate = new Date(toY, toM, 0);
  const toISO = `${toY}-${pad(toM)}-${pad(toDate.getDate())}`;

  matrixRange = { from: fromISO, to: toISO };

  const mode = document.querySelector('input[name="mode"]:checked').value;
  const customers = getSelectedCustomers();  // ✅ เปลี่ยนจาก const customer = $('qCustomer').value;
  const selectedGradesInMatrix = getSelectedGrades();

  updateReportTitle();

  $('matrixBody').innerHTML = '<p style="text-align:center;color:#94a3b8;padding:20px">กำลังโหลดข้อมูล...</p>';

  const allUsage = await fetchAllRows(() => {
    let q = supabase.from('usage_records').select('*');
    if (matrixRange.from) q = q.gte('usage_date', matrixRange.from);
    if (matrixRange.to)   q = q.lte('usage_date', matrixRange.to);
    return q;
  });

  // ✅ สร้างรายชื่อลูกค้าจาก allUsage แล้วส่งให้ loadCustomerFilter
  const custSet = new Set();
  allUsage.forEach(u => {
    const c = (u.roll_for_customer || '').trim();
    if (c) custSet.add(c);
  });
  const custList = [...custSet].sort();
  loadCustomerFilter(custList);

  // ✅ กรองลูกค้าตาม selectedCustomers
  let usage = allUsage;
  if (customers.length > 0) {
    usage = allUsage.filter(u => {
      const c = (u.roll_for_customer || '').trim();
      if (customers.includes('__GENERAL__') && !c) return true;
      return customers.includes(c);
    });
  }

  const mByCode = {};
  masterCache.forEach(m => mByCode[m.item_code] = m);

  // group by item_code + usage_date
  const daily = {};
  usage.forEach(u => {
    const key = u.item_code + '|' + u.usage_date;
    daily[key] = (daily[key] || 0) + Number(u.used_kgs);
  });

  // max ต่อ item_code
  const perItem = {};
  Object.entries(daily).forEach(([k, kg]) => {
    const code = k.split('|')[0];
    const m = mByCode[code]; if (!m) return;
    const std = Number(m.std_weight_kg);
    if (!std) return;
    let rolls = mode === 'full' ? Math.ceil(kg / std) : kg / std;
    if (!perItem[code] || rolls > perItem[code]) perItem[code] = rolls;
  });

  // matrix
  const rowSet = new Map(), colSet = new Set(), cells = {};
  Object.entries(perItem).forEach(([code, maxVal]) => {
    const m = mByCode[code];
    const rk = normalizeGrade(m.grade) + m.gram;
    rowSet.set(rk, m);
    colSet.add(Number(m.size));
    const k = rk + '|' + m.size;
    cells[k] = (cells[k] || 0) + maxVal;
  });

  // rowKeys + filter Gradegrams
  let rowKeys = [...rowSet.keys()].sort((a, b) => a.localeCompare(b));
  if (selectedGradesInMatrix.length > 0) {
    rowKeys = rowKeys.filter(rk => selectedGradesInMatrix.includes(rk));
  }

  // colKeys2 จาก colSet + filter Size
  let colKeys2 = [...colSet].sort((a, b) => a - b);
  const selectedSizesInMatrix = getSelectedSizes();
  if (selectedSizesInMatrix.length > 0) {
    colKeys2 = colKeys2.filter(s => selectedSizesInMatrix.includes(s));
  }

  // คำนวณ totals จาก colKeys2
  const rowTotals2 = {}, colTotals2 = {};
  let grand2 = 0;

  rowKeys.forEach(rk => {
    colKeys2.forEach(s => {
      const v = cells[rk + '|' + s];
      if (v) {
        rowTotals2[rk] = (rowTotals2[rk] || 0) + v;
        colTotals2[s] = (colTotals2[s] || 0) + v;
        grand2 += v;
      }
    });
  });

  if (!rowKeys.length || !colKeys2.length) {
    $('matrixBody').innerHTML = '<p style="text-align:center;color:#94a3b8;padding:30px">ไม่มีข้อมูลในช่วงที่เลือก</p>';
    currentSnapshotData = null;
    return;
  }

  // render
  let html = '<div class="report-wrap"><table class="report-table"><thead><tr><th class="grade-col">Gradegrams</th>';
  colKeys2.forEach(s => html += `<th>${s}</th>`);
  html += '<th class="total-col">Total</th></tr></thead><tbody>';

  rowKeys.forEach(rk => {
    html += '<tr>';
    html += `<td class="grade-col">${esc(rk)}</td>`;
    colKeys2.forEach(s => {
      const v = cells[rk + '|' + s];
      if (!v) html += '<td class="empty">-</td>';
      else html += `<td class="clickable" onclick="openDrill('${esc(rk)}',${s})">${Number(v).toFixed(2)}</td>`;
    });
    html += `<td class="total-col">${Number(rowTotals2[rk] || 0).toFixed(2)}</td></tr>`;
  });
  html += '<tr class="total-row"><td class="grade-col">Total</td>';
  colKeys2.forEach(s => html += `<td>${Number(colTotals2[s] || 0).toFixed(2)}</td>`);
  html += `<td class="total-col">${Number(grand2).toFixed(2)}</td></tr></tbody></table></div>`;
  html += `<div class="report-foot">แสดงเป็นจำนวนม้วน · โหมด: ${mode === 'full' ? 'ม้วนเต็ม' : 'ใช้จริง'} · ยอดสูงสุดต่อวัน</div>`;
  $('matrixBody').innerHTML = html;

  // snapshot data
  currentSnapshotData = [];
  rowKeys.forEach(rk => {
    colKeys2.forEach(s => {
      const v = cells[rk + '|' + s];
      if (v) currentSnapshotData.push({ gradegram: rk, size: s, max_rolls: v });
    });
  });
}

// ================= SNAPSHOT =================
async function saveStockLevelSnapshot() {
  const title = getCurrentTitle();
  const msgEl = $('snapshotMsg');

  if (!currentSnapshotData || !currentSnapshotData.length) {
    if (msgEl) msgEl.innerHTML = '<div class="msg err">⚠ ยังไม่มีข้อมูล — กด "ค้นหา" ก่อน</div>';
    return;
  }

  const { data: existing, error: errChk } = await supabase
    .from('stock_level_snapshots')
    .select('title')
    .ilike('title', title);

  if (errChk) {
    if (msgEl) msgEl.innerHTML = `<div class="msg err">ตรวจสอบชื่อไม่สำเร็จ: ${esc(errChk.message)}</div>`;
    return;
  }

  let finalTitle = title;
  if (existing && existing.length > 0) {
    const count = existing.length;
    const choice = prompt(
      `ชื่อ "${title}" ซ้ำ ${count} ครั้ง\n` +
      `พิมพ์หมายเลขที่จะบันทึก (1-${count + 1}) หรือกด Cancel เพื่อยกเลิก:`,
      String(count + 1)
    );
    if (!choice) return;
    const n = Number(choice);
    if (!n || n < 1 || n > count + 1) {
      if (msgEl) msgEl.innerHTML = '<div class="msg err">หมายเลขไม่ถูกต้อง</div>';
      return;
    }
    finalTitle = `${title}/${n}`;
  }

  // ✅ Validation: months ต้องมีเดือนของ title อยู่ด้วย
  const mEl = $('titleMonth');
  const yEl = $('titleYear');
  const titleMonthYM = `${Number(yEl.value) - 543}-${pad(Number(mEl.value))}`;

  if (!selectedMonths.includes(titleMonthYM)) {
    if (msgEl) {
      msgEl.innerHTML = `<div class="msg err">
        ⚠ <b>ไม่สามารถบันทึกได้</b><br>
        Title บอก "<b>${THAI_MONTHS[Number(mEl.value)-1]} ${yEl.value}</b>" (= <code>${titleMonthYM}</code>)<br>
        แต่ months ที่เลือกคือ <code>[${selectedMonths.join(', ')}]</code><br><br>
        → กรุณาติ๊กเลือกเดือน <b>${titleMonthYM}</b> ใน filter "เดือน" ก่อนกดบันทึก
      </div>`;
    }
    alert(`⚠ ไม่สามารถบันทึกได้\n\nเดือนใน Title (${titleMonthYM}) ไม่ตรงกับ months ที่เลือก\nกรุณาติ๊กเลือกเดือนให้ตรงกันก่อน`);
    return;
  }

  const payload = {
    title: finalTitle,
    months: selectedMonths,
    mode: document.querySelector('input[name="mode"]:checked').value,
    customer: getSelectedCustomers().join(','),  // ✅ join เป็น string
    grades: getSelectedGrades(),
    sizes: getSelectedSizes(),
    matrix_data: currentSnapshotData,
    created_by: currentUser.id
  };

  const { error } = await supabase.from('stock_level_snapshots').insert(payload);
  if (error) {
    if (msgEl) msgEl.innerHTML = `<div class="msg err">บันทึกไม่สำเร็จ: ${esc(error.message)}</div>`;
    return;
  }

  if (msgEl) msgEl.innerHTML = `<div class="msg ok">✅ บันทึก "${esc(finalTitle)}" สำเร็จ</div>`;
  setTimeout(() => { if (msgEl) msgEl.innerHTML = ''; }, 3000);

  await loadStockLevelSnapshots();
}

async function loadStockLevelSnapshots() {
  const listEl = $('snapshotList');
  if (!listEl) return;
  listEl.innerHTML = '<p style="color:#94a3b8;font-size:13px">กำลังโหลด...</p>';

  const { data, error } = await supabase
    .from('stock_level_snapshots')
    .select('id, title, months, mode, customer, grades, created_at')
    .order('created_at', { ascending: false });

  if (error) { listEl.innerHTML = `<div class="msg err">${esc(error.message)}</div>`; return; }
  if (!data || !data.length) {
    listEl.innerHTML = '<p style="color:#94a3b8;font-size:13px">ยังไม่มีรายการที่บันทึกไว้</p>';
    return;
  }

  listEl.innerHTML = data.map(s => {
    const dt = new Date(s.created_at).toLocaleString('th-TH', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
    return `<div class="snapshot-card">
      <div class="snapshot-card-info">
        <div class="snapshot-card-title">${esc(s.title)}</div>
        <div class="snapshot-card-meta">📅 ${dt}</div>
      </div>
      <div class="snapshot-card-actions">
        <button onclick="viewSnapshot(${s.id})">👁 ดู</button>
        <button class="danger" onclick="deleteSnapshot(${s.id}, '${esc(s.title)}')">🗑 ลบ</button>
      </div>
    </div>`;
  }).join('');
}

async function viewSnapshot(id) {
  $('snapshotViewTitle').textContent = 'กำลังโหลด...';
  $('snapshotViewBody').innerHTML = '<p style="text-align:center;color:#94a3b8;padding:20px">กำลังโหลด...</p>';
  openModal('modalSnapshot');

  const { data, error } = await supabase.from('stock_level_snapshots').select('*').eq('id', id).single();
  if (error || !data) {
    $('snapshotViewBody').innerHTML = `<div class="msg err">โหลดไม่สำเร็จ: ${esc(error?.message || 'ไม่พบข้อมูล')}</div>`;
    return;
  }

  $('snapshotViewTitle').textContent = data.title;
  const md = data.matrix_data || [];
  if (!md.length) { $('snapshotViewBody').innerHTML = '<p style="color:#94a3b8">ไม่มีข้อมูล</p>'; return; }

  const rowSet = new Set(), colSet = new Set(), cells = {}, rowTotals = {}, colTotals = {};
  let grand = 0;
  md.forEach(r => {
    rowSet.add(r.gradegram);
    colSet.add(r.size);
    const k = r.gradegram + '|' + r.size;
    cells[k] = r.max_rolls;
    rowTotals[r.gradegram] = (rowTotals[r.gradegram] || 0) + r.max_rolls;
    colTotals[r.size] = (colTotals[r.size] || 0) + r.max_rolls;
    grand += r.max_rolls;
  });

  const rowKeys = [...rowSet].sort();
  const colKeys = [...colSet].sort((a, b) => a - b);

  let html = '<div class="report-wrap"><table class="report-table"><thead><tr>';
  html += '<th class="grade-col">Gradegrams</th>';
  colKeys.forEach(s => html += `<th>${s}</th>`);
  html += '<th class="total-col">Total</th></tr></thead><tbody>';

  rowKeys.forEach(rk => {
    html += '<tr>';
    html += `<td class="grade-col">${esc(rk)}</td>`;
    colKeys.forEach(s => {
      const v = cells[rk + '|' + s];
      if (v == null) html += '<td class="empty">-</td>';
      else html += `<td>${Number(v).toFixed(2)}</td>`;
    });
    html += `<td class="total-col">${Number(rowTotals[rk] || 0).toFixed(2)}</td></tr>`;
  });
  html += '<tr class="total-row"><td class="grade-col">Total</td>';
  colKeys.forEach(s => html += `<td>${Number(colTotals[s] || 0).toFixed(2)}</td>`);
  html += `<td class="total-col">${Number(grand).toFixed(2)}</td></tr>`;
  html += '</tbody></table></div>';

  // ✅ เพิ่มแสดงลูกค้าที่เคยกรองไว้
  const dt = new Date(data.created_at).toLocaleString('th-TH');
  let customerDisplay = 'ทั้งหมด';
  if (data.customer) {
    const custArr = String(data.customer).split(',').map(c => c.trim()).filter(Boolean);
    if (custArr.length > 0) {
      customerDisplay = custArr.map(c => c === '__GENERAL__' ? 'ทั่วไป (ไม่ระบุลูกค้า)' : c).join(', ');
    }
  }

  html += `<div class="report-foot">
    บันทึกเมื่อ: ${dt}<br>
    เดือน: ${(data.months || []).join(', ')} · 
    โหมด: ${data.mode === 'full' ? 'ม้วนเต็ม' : 'ใช้จริง'}<br>
    ลูกค้า: ${esc(customerDisplay)}
  </div>`;
  $('snapshotViewBody').innerHTML = html;
}

async function deleteSnapshot(id, title) {
  if (!confirm(`ลบ "${title}" ?`)) return;
  const { error } = await supabase.from('stock_level_snapshots').delete().eq('id', id);
  if (error) { alert('ลบไม่สำเร็จ: ' + error.message); return; }
  await loadStockLevelSnapshots();
}

function printSnapshot() { window.print(); }

// ═══════════════════════════════════════════════════════════════
// INIT — โหลด Month Filter
// ═══════════════════════════════════════════════════════════════
(function initStockLevel() {
  const run = () => {
    setTimeout(() => {
      if (typeof loadMonthFilter === 'function') {
        loadMonthFilter();
        console.log('[StockLevel] ✅ loadMonthFilter() called');
      }
      if (typeof loadStockLevelSnapshots === 'function') {
        loadStockLevelSnapshots();
      }
    }, 150);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();

// ═══════════════════════════════════════════════════════════════
// PRINT HANDLER — เปลี่ยน <select> เป็น <span> ตอนพิมพ์
// เพื่อควบคุมช่องว่างระหว่าง "ประจำเดือน [เดือน] [ปี]"
// ═══════════════════════════════════════════════════════════════
window.addEventListener('beforeprint', () => {
  const mSel = document.getElementById('titleMonth');
  const ySel = document.getElementById('titleYear');
  if (!mSel || !ySel) return;

  // เก็บ reference ไว้ restore
  window._printBackup = {
    monthSel: mSel,
    yearSel: ySel
  };

  // สร้าง span แทน <select>
  const mSpan = document.createElement('span');
  mSpan.textContent = mSel.options[mSel.selectedIndex].text;
  mSpan.className = 'title-select-print';
  mSpan.id = 'titleMonthPrint';

  const ySpan = document.createElement('span');
  ySpan.textContent = ySel.options[ySel.selectedIndex].text;
  ySpan.className = 'title-select-print';
  ySpan.id = 'titleYearPrint';

  // แทนที่ใน DOM
  mSel.parentNode.replaceChild(mSpan, mSel);
  ySel.parentNode.replaceChild(ySpan, ySel);
});

window.addEventListener('afterprint', () => {
  if (!window._printBackup) return;
  const b = window._printBackup;

  const mSpan = document.getElementById('titleMonthPrint');
  const ySpan = document.getElementById('titleYearPrint');

  if (mSpan && b.monthSel) mSpan.parentNode.replaceChild(b.monthSel, mSpan);
  if (ySpan && b.yearSel) ySpan.parentNode.replaceChild(b.yearSel, ySpan);

  window._printBackup = null;
});
