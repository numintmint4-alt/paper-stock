// ═══════════════════════════════════════════════════════════════
// STOCK V6.1 — stock-level.js
// Month Filter + Matrix ใหม่ + Snapshot
// ═══════════════════════════════════════════════════════════════

// ================= STATE =================
let selectedMonths = [];
let allMonthsList = [];
let currentSnapshotData = null;

// ================= MONTH FILTER =================
function loadMonthFilter() {
  const yearEl = $('filterYear');
  const yearCE = yearEl ? Number(yearEl.value) - 543 : new Date().getFullYear();
  
  allMonthsList = [];
  for (let m = 1; m <= 12; m++) {
    allMonthsList.push(`${yearCE}-${pad(m)}`);
  }
  
  // default: 3 เดือนก่อนเดือนปัจจุบัน (ถ้ายังไม่เคยเลือก)
  if (selectedMonths.length === 0) {
    const now = new Date();
    const curY = now.getFullYear();
    const curM = now.getMonth() + 1;
    if (curY === yearCE) {
      let m = curM;
      for (let i = 0; i < 3; i++) {
        m -= 1;
        if (m <= 0) m += 12;
        selectedMonths.push(`${yearCE}-${pad(m)}`);
      }
      selectedMonths.sort();
    }
  }
  
  renderMonthList();
  updateMonthLabel();
  
  // ✅ attach listener แค่ครั้งเดียว (ทั้ง btn + document)
  attachMonthFilterListeners();
}

// ✅ ฟังก์ชันใหม่ — attach listener ครั้งเดียว
function attachMonthFilterListeners() {
  const btn = $('monthFilterBtn');
  const dropdown = $('monthDropdown');
  const box = $('monthFilterBox');
  if (!btn || !dropdown || !box) return;
  if (btn.dataset.listenerAttached === '1') return;
  btn.dataset.listenerAttached = '1';
  
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('hidden');
    btn.classList.toggle('open');
  });
  
  // ✅ ใช้ named function → removeEventListener ได้
  window._monthDocClickHandler = (e) => {
    if (!box.contains(e.target)) {
      dropdown.classList.add('hidden');
      btn.classList.remove('open');
    }
  };
  document.addEventListener('click', window._monthDocClickHandler);
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
  
  // ✅ ผูก event กับ label แทน checkbox (คลิกได้ทั้งแถว)
  list.querySelectorAll('.item').forEach(el => {
    el.addEventListener('click', (e) => {
      // ถ้าคลิกที่ checkbox → ปล่อยให้ browser จัดการเอง
      if (e.target.tagName === 'INPUT') return;
      
      e.preventDefault();
      const cb = el.querySelector('input[type="checkbox"]');
      cb.checked = !cb.checked;
      
      const ym = el.dataset.month;
      if (cb.checked) {
        if (!selectedMonths.includes(ym)) selectedMonths.push(ym);
      } else {
        selectedMonths = selectedMonths.filter(x => x !== ym);
      }
      selectedMonths.sort();
      el.classList.toggle('checked', cb.checked);
      updateMonthLabel();
    });
    
    // ✅ checkbox change (คลิก checkbox โดยตรง)
    const cb = el.querySelector('input[type="checkbox"]');
    cb.addEventListener('change', () => {
      const ym = el.dataset.month;
      if (cb.checked) {
        if (!selectedMonths.includes(ym)) selectedMonths.push(ym);
      } else {
        selectedMonths = selectedMonths.filter(x => x !== ym);
      }
      selectedMonths.sort();
      el.classList.toggle('checked', cb.checked);
      updateMonthLabel();
    });
  });
}

function updateMonthLabel() {
  const label = $('monthFilterLabel');
  if (!label) return;
  if (selectedMonths.length === 0) {
    label.textContent = 'ทั้งหมด'; label.style.color = '#1e293b';
  } else if (selectedMonths.length === 1) {
    const [y, m] = selectedMonths[0].split('-').map(Number);
    label.textContent = `${THAI_MONTHS[m-1]} ${y + 543}`;
    label.style.color = '#1e40af';
  } else {
    label.textContent = `เลือก ${selectedMonths.length} เดือน`;
    label.style.color = '#1e40af';
  }
}

function selectAllMonths() {
  selectedMonths = [...allMonthsList];
  renderMonthList(); updateMonthLabel();
}
function clearAllMonths() {
  selectedMonths = [];
  renderMonthList(); updateMonthLabel();
}
function onYearChange() {
  // ✅ reset selectedMonths → loadMonthFilter จะ default 3 เดือนใหม่
  selectedMonths = [];
  loadMonthFilter();
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

// ================= MATRIX (ใหม่) =================
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
  const customer = $('qCustomer').value;
  const selectedGradesInMatrix = getSelectedGrades();
  
  updateReportTitle();
  
  $('matrixBody').innerHTML = '<p style="text-align:center;color:#94a3b8;padding:20px">กำลังโหลดข้อมูล...</p>';
  
  const allUsage = await fetchAllRows(() => {
    let q = supabase.from('usage_records').select('*');
    if (matrixRange.from) q = q.gte('usage_date', matrixRange.from);
    if (matrixRange.to)   q = q.lte('usage_date', matrixRange.to);
    return q;
  });
  
  // customer dropdown
  const custSet = new Set();
  allUsage.forEach(u => {
    const c = (u.roll_for_customer || '').trim();
    if (c) custSet.add(c);
  });
  const custList = [...custSet].sort();
  const custSel = $('qCustomer');
  const keepVal = custSel.value;
  custSel.innerHTML = '<option value="">ทั้งหมด</option><option value="__GENERAL__">ทั่วไป (ไม่ระบุลูกค้า)</option>' +
    custList.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  custSel.value = keepVal;
  
  let usage = allUsage;
  if (customer === GENERAL_CUSTOMER) {
    usage = allUsage.filter(u => !u.roll_for_customer || !String(u.roll_for_customer).trim());
  } else if (customer) {
    usage = allUsage.filter(u => u.roll_for_customer === customer);
  }
  
  const mByCode = {}; masterCache.forEach(m => mByCode[m.item_code] = m);
  
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
  const rowSet = new Map(), colSet = new Set(), cells = {}, rowTotals = {}, colTotals = {};
  let grand = 0;
  
  Object.entries(perItem).forEach(([code, maxVal]) => {
    const m = mByCode[code];
    const rk = normalizeGrade(m.grade) + m.gram;
    rowSet.set(rk, m);
    colSet.add(m.size);
    const k = rk + '|' + m.size;
    cells[k] = (cells[k] || 0) + maxVal;
    rowTotals[rk] = (rowTotals[rk] || 0) + maxVal;
    colTotals[m.size] = (colTotals[m.size] || 0) + maxVal;
    grand += maxVal;
  });
  
  let rowKeys = [...rowSet.keys()].sort((a,b) => a.localeCompare(b));
  if (selectedGradesInMatrix.length > 0) {
    rowKeys = rowKeys.filter(rk => selectedGradesInMatrix.includes(rk));
  }
  
  const colSet2 = new Set(), rowTotals2 = {}, colTotals2 = {};
  let grand2 = 0;
  
  rowKeys.forEach(rk => {
    const m = rowSet.get(rk);
    if (!m) return;
    colSet2.add(m.size);
    colSet.forEach(s => {
      const v = cells[rk + '|' + s];
      if (v) {
        rowTotals2[rk] = (rowTotals2[rk] || 0) + v;
        colTotals2[s] = (colTotals2[s] || 0) + v;
        grand2 += v;
      }
    });
  });
  
  const colKeys2 = [...colSet2].sort((a,b) => a - b);
  
  if (!rowKeys.length) {
    $('matrixBody').innerHTML = '<p style="text-align:center;color:#94a3b8;padding:30px">ไม่มีข้อมูลในช่วงที่เลือก</p>';
    currentSnapshotData = null;
    return;
  }
  
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
  
  // ✅ เก็บ snapshot data
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
  
  const payload = {
    title: finalTitle,
    months: selectedMonths,
    mode: document.querySelector('input[name="mode"]:checked').value,
    customer: $('qCustomer').value,
    grades: getSelectedGrades(),
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
  
  if (error) {
    listEl.innerHTML = `<div class="msg err">${esc(error.message)}</div>`;
    return;
  }
  
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
  
  const { data, error } = await supabase
    .from('stock_level_snapshots')
    .select('*')
    .eq('id', id)
    .single();
  
  if (error || !data) {
    $('snapshotViewBody').innerHTML = `<div class="msg err">โหลดไม่สำเร็จ: ${esc(error?.message || 'ไม่พบข้อมูล')}</div>`;
    return;
  }
  
  $('snapshotViewTitle').textContent = data.title;
  
  const md = data.matrix_data || [];
  if (!md.length) {
    $('snapshotViewBody').innerHTML = '<p style="color:#94a3b8">ไม่มีข้อมูล</p>';
    return;
  }
  
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
  const colKeys = [...colSet].sort((a,b) => a - b);
  
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
  
  const dt = new Date(data.created_at).toLocaleString('th-TH');
  html += `<div class="report-foot">
    บันทึกเมื่อ: ${dt} · เดือน: ${(data.months || []).join(', ')} · 
    โหมด: ${data.mode === 'full' ? 'ม้วนเต็ม' : 'ใช้จริง'}
  </div>`;
  
  $('snapshotViewBody').innerHTML = html;
}

async function deleteSnapshot(id, title) {
  if (!confirm(`ลบ "${title}" ?`)) return;
  const { error } = await supabase.from('stock_level_snapshots').delete().eq('id', id);
  if (error) { alert('ลบไม่สำเร็จ: ' + error.message); return; }
  await loadStockLevelSnapshots();
}

function printSnapshot() {
  window.print();
}
