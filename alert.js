// ═══════════════════════════════════════════════════════════════
//  STOCK ม้วนกระดาษ V6 — alert.js
//  ส่วนที่ 8: หน้า Roll Alert (แจ้งเตือนสั่งซื้อ)
// ═══════════════════════════════════════════════════════════════

// ================= STATE =================
let alertSelectedGrades = [];
let alertAllGrades = [];
let alertCache = [];

// ================= INIT =================
async function initAlertTab() {
  const today = toISODate(new Date());
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if ($('alertDate') && !$('alertDate').value) $('alertDate').value = today;
  if ($('alertStockDate') && !$('alertStockDate').value) $('alertStockDate').value = toISODate(yesterday);
  if ($('alertReceiveDate') && !$('alertReceiveDate').value) $('alertReceiveDate').value = today;

  await loadAlertGradeFilter();
  await renderAlert();
}

// ================= GRADE FILTER =================
async function loadAlertGradeFilter() {
  alertAllGrades = [...new Set(
    masterCache.map(m => m.grade + m.gram)
  )].sort();

  renderAlertGradeList();
  updateAlertGradeLabel();

  const btn = $('alertGradeFilterBtn');
  const dropdown = $('alertGradeDropdown');
  const box = $('alertGradeFilterBox');

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
    label.textContent = 'ทั้งหมด';
    label.style.color = '#1e293b';
  } else if (alertSelectedGrades.length === 1) {
    label.textContent = alertSelectedGrades[0];
    label.style.color = '#1e40af';
  } else {
    label.textContent = `เลือก ${alertSelectedGrades.length} เกรด`;
    label.style.color = '#1e40af';
  }
}

function selectAllAlertGrades() {
  alertSelectedGrades = [...alertAllGrades];
  renderAlertGradeList();
  updateAlertGradeLabel();
}

function clearAllAlertGrades() {
  alertSelectedGrades = [];
  renderAlertGradeList();
  updateAlertGradeLabel();
}

// ================= RENDER ALERT =================
async function renderAlert() {
  const alertDate = $('alertDate')?.value;
  const stockDate = $('alertStockDate')?.value;
  const receiveDate = $('alertReceiveDate')?.value;
  const monthsBack = Number($('alertMonths')?.value) || 3;
  const includeCustomer = $('alertIncludeCustomer')?.checked || false;
  const onlyShortage = $('alertOnlyShortage')?.checked ?? true;

  if (!alertDate || !stockDate || !receiveDate) {
    alert('กรุณาเลือกวันที่ให้ครบ');
    return;
  }

  const dateThai = thaiDateFull(alertDate);
  const gradeLabel = alertSelectedGrades.length > 0
    ? ` · เกรด: ${alertSelectedGrades.join(', ')}`
    : '';
  const custLabel = includeCustomer ? ' · รวมม้วนลูกค้า' : ' · ไม่รวมม้วนลูกค้า';

  $('alertReportTitle').innerHTML = `
    🚨 แจ้งเตือนสั่งซื้อ (Roll Alert)<br>
    ประจำวันที่ ${dateThai}
    <div class="report-subtitle">(Stock ณ ${thaiDateFull(stockDate)} · Receive ${thaiDateFull(receiveDate)} · Demand ${monthsBack} เดือน${gradeLabel}${custLabel})</div>
  `;

  $('alertBody').innerHTML = '<p style="text-align:center;color:#94a3b8;padding:20px">กำลังวิเคราะห์...</p>';

  try {
    // ===== 1. Demand จาก Stock Level (Matrix) — ยอดสูงสุดใน monthsBack เดือน =====
    const [year, m] = alertDate.split('-').map(Number);
    const toDate = new Date(year, m - 1, 0);
    const toISO = toISODate(toDate);

    let fromM = m - monthsBack + 1, fromY = year;
    while (fromM <= 0) { fromM += 12; fromY -= 1; }
    const fromISO = `${fromY}-${pad(fromM)}-01`;

    // โหลด usage_records ในช่วง monthsBack
    const usage = await fetchAllRows(() => {
      let q = supabase.from('usage_records').select('*')
        .gte('usage_date', fromISO)
        .lte('usage_date', toISO);
      return q;
    });

    // โหลด master เพื่อ map item_code → gradegram + std_weight
    const mByCode = {};
    masterCache.forEach(m => mByCode[m.item_code] = m);

    // daily sum
    const daily = {};
    usage.forEach(u => {
      const key = u.item_code + '|' + u.usage_date;
      daily[key] = (daily[key] || 0) + Number(u.used_kgs);
    });

    // หาค่าสูงสุดต่อวันของแต่ละ item_code
    const maxRolls = {};  // item_code → max rolls
    Object.entries(daily).forEach(([k, kg]) => {
      const code = k.split('|')[0];
      const m = mByCode[code]; if (!m) return;
      const std = Number(m.std_weight_kg); if (!std) return;

      const rolls = Math.ceil(kg / std);
      if (!maxRolls[code] || rolls > maxRolls[code]) {
        maxRolls[code] = rolls;
      }
    });

    // map item_code → gradegram+size → demand
    const demandMap = {};  // "gradegram|size" → demand
    Object.entries(maxRolls).forEach(([code, rolls]) => {
      const m = mByCode[code]; if (!m) return;
      const rk = m.grade + m.gram + '|' + m.size;
      demandMap[rk] = rolls;
    });

    // ===== 2. Stock คงเหลือ (ม้วนเต็ม) =====
    const stockData = await fetchAllRows(() =>
      supabase.from('stock_balance')
        .select('grade, width, is_customer_roll')
        .eq('stock_date', stockDate)
        .eq('roll_status', 'full')
    );

    // map stock → gradegram+size
    const stockMap = {};  // "gradegram|size" → count
    stockData.forEach(s => {
      if (!includeCustomer && s.is_customer_roll) return;  // ไม่รวมม้วนลูกค้า

      // หา gram จาก master
      const m = masterCache.find(x => x.grade === s.grade && x.size === s.width);
      if (!m) return;
      const rk = m.grade + m.gram + '|' + m.size;
      stockMap[rk] = (stockMap[rk] || 0) + 1;
    });

    // ===== 3. Receive =====
    const receiveData = await fetchAllRows(() =>
      supabase.from('po_receive')
        .select('grade, size, quantity, is_customer_roll')
        .eq('po_date', receiveDate)
    );

    const receiveMap = {};
    receiveData.forEach(r => {
      if (!includeCustomer && r.is_customer_roll) return;

      const m = masterCache.find(x => x.grade === r.grade && x.size === r.size);
      if (!m) return;
      const rk = m.grade + m.gram + '|' + r.size;
      receiveMap[rk] = (receiveMap[rk] || 0) + Number(r.quantity);
    });

    // ===== 4. รวมทุกอย่าง =====
    // unique keys
    const allKeys = new Set([
      ...Object.keys(demandMap),
      ...Object.keys(stockMap),
      ...Object.keys(receiveMap)
    ]);

    const result = [];
    allKeys.forEach(k => {
      const [gradegram, sizeStr] = k.split('|');
      const size = Number(sizeStr);

      // Filter เกรด
      if (alertSelectedGrades.length > 0 && !alertSelectedGrades.includes(gradegram)) return;

      const demand = demandMap[k] || 0;
      const stock = stockMap[k] || 0;
      const receive = receiveMap[k] || 0;
      const totalAvailable = stock + receive;
      const shortage = demand - totalAvailable;

      result.push({
        gradegram,
        size,
        demand,
        stock,
        receive,
        total: totalAvailable,
        shortage
      });
    });

    // เรียงตาม shortage desc
    result.sort((a, b) => b.shortage - a.shortage);

    // Filter เฉพาะที่มี shortage
    const display = onlyShortage ? result.filter(r => r.shortage > 0) : result;

    // ===== 5. สรุป =====
    const totalShortage = result.filter(r => r.shortage > 0).length;
    const totalOK = result.filter(r => r.shortage <= 0).length;

    let html = `<div class="alert-summary">
      <div class="item red">🔴 ต้องสั่งด่วน: ${totalShortage} รายการ</div>
      <div class="item green">🟢 OK: ${totalOK} รายการ</div>
    </div>`;

    if (!display.length) {
      html += '<p style="text-align:center;color:#94a3b8;padding:30px">ไม่มีรายการที่ต้องสั่งซื้อ 🎉</p>';
      $('alertBody').innerHTML = html;
      alertCache = [];
      return;
    }

    // ===== 6. Render ตาราง X-Y =====
    // จัดกลุ่มตาม Gradegram → แสดง Size ใน row
    const groupedByGrade = {};
    display.forEach(r => {
      if (!groupedByGrade[r.gradegram]) groupedByGrade[r.gradegram] = [];
      groupedByGrade[r.gradegram].push(r);
    });

    const rowKeys = Object.keys(groupedByGrade).sort();

    // หา unique sizes ทั้งหมด
    const colSet = new Set();
    display.forEach(r => colSet.add(r.size));
    const colKeys = [...colSet].sort((a,b) => a - b);

    html += '<div class="report-wrap"><table class="alert-table"><thead><tr>';
    html += '<th class="grade-col">Gradegrams</th>';
    colKeys.forEach(s => html += `<th>${s}</th>`);
    html += '<th>Total<br>ต้องสั่ง</th>';
    html += '</tr></thead><tbody>';

    rowKeys.forEach(rk => {
      const items = groupedByGrade[rk];
      let rowTotalShortage = 0;

      html += '<tr>';
      html += `<td class="grade-col">${esc(rk)}</td>`;

      colKeys.forEach(s => {
        const item = items.find(x => x.size === s);
        if (!item) {
          html += '<td class="empty">-</td>';
        } else if (item.shortage > 0) {
          // 🔴 ต้องสั่ง
          html += `<td class="clickable" onclick="openAlertDetail('${esc(rk)}', ${s}, '${stockDate}', '${receiveDate}', ${monthsBack}, ${includeCustomer})" style="cursor:pointer">
            <div style="font-weight:700;color:#dc2626;font-size:14px">${item.shortage}</div>
            <div style="font-size:10px;color:#64748b">D:${item.demand} S:${item.stock} R:${item.receive}</div>
          </td>`;
          rowTotalShortage += item.shortage;
        } else {
          // 🟢 OK
          html += `<td class="clickable" onclick="openAlertDetail('${esc(rk)}', ${s}, '${stockDate}', '${receiveDate}', ${monthsBack}, ${includeCustomer})" style="cursor:pointer;background:#f0fdf4">
            <div style="font-weight:700;color:#166534;font-size:12px">OK</div>
            <div style="font-size:10px;color:#64748b">D:${item.demand} S:${item.stock} R:${item.receive}</div>
          </td>`;
        }
      });

      html += `<td style="font-weight:700;color:#dc2626;font-size:15px">${rowTotalShortage}</td>`;
      html += '</tr>';
    });

    // Grand total row
    const grandShortage = display.reduce((s, r) => s + Math.max(0, r.shortage), 0);
    html += '<tr class="total-row"><td class="grade-col">Total</td>';
    colKeys.forEach(s => {
      const sizeShortage = display
        .filter(r => r.size === s)
        .reduce((sum, r) => sum + Math.max(0, r.shortage), 0);
      html += `<td style="background:#cbd5e1;font-weight:700;color:#dc2626">${sizeShortage || '-'}</td>`;
    });
    html += `<td style="background:#a5b4fc;font-weight:700;color:#dc2626;font-size:16px">${grandShortage}</td>`;
    html += '</tr></tbody></table></div>';

    html += `<div class="report-foot">
      D = Demand · S = Stock · R = Receive · คลิก Cell เพื่อดูรายละเอียด · 
      Demand = ยอดใช้งานสูงสุด ${monthsBack} เดือน · 
      รวมต้องสั่ง ${grandShortage} ม้วน
    </div>`;

    $('alertBody').innerHTML = html;
    alertCache = display;

  } catch (err) {
    console.error('renderAlert error:', err);
    $('alertBody').innerHTML = `<div class="msg err">เกิดข้อผิดพลาด: ${esc(err.message)}</div>`;
  }
}

// ================= ALERT DETAIL =================
async function openAlertDetail(gradegram, size, stockDate, receiveDate, monthsBack, includeCustomer) {
  // สร้าง modal content
  const match = gradegram.match(/^([A-Z]+)(\d+)$/);
  const grade = match ? match[1] : gradegram;
  const gram = match ? match[2] : '';

  let html = `<h3 style="margin-bottom:12px">📊 ${esc(gradegram)} · Size ${size}</h3>`;

  // === 1. Demand Detail (จาก usage) ===
  const [year, m] = stockDate.split('-').map(Number);
  const toDate = new Date(year, m - 1, 0);
  const toISO = toISODate(toDate);
  let fromM = m - monthsBack + 1, fromY = year;
  while (fromM <= 0) { fromM += 12; fromY -= 1; }
  const fromISO = `${fromY}-${pad(fromM)}-01`;

  // หา item_code
  const master = masterCache.find(x => x.grade === grade && x.gram == gram && x.size === size);
  if (!master) {
    $('alertBody').innerHTML += '<div class="msg err">ไม่พบ Master Data</div>';
    return;
  }

  const usage = await fetchAllRows(() =>
    supabase.from('usage_records')
      .select('usage_date, used_kgs, doc_no, roll_for_customer')
      .eq('item_code', master.item_code)
      .gte('usage_date', fromISO)
      .lte('usage_date', toISO)
      .order('usage_date', { ascending: false })
  );

  // daily sum
  const byDate = {};
  usage.forEach(u => {
    const d = u.usage_date;
    if (!byDate[d]) byDate[d] = { kg: 0, records: [] };
    byDate[d].kg += Number(u.used_kgs);
    byDate[d].records.push(u);
  });

  const std = Number(master.std_weight_kg);
  const dates = Object.keys(byDate).sort((a,b) => b.localeCompare(a));

  html += `<div class="msg info"><b>Demand (${monthsBack} เดือน):</b> ${fromISO} ถึง ${toISO}</div>`;
  html += '<h4>📈 ยอดใช้งานรายวัน (Top 10)</h4>';
  html += '<table style="margin-bottom:16px"><thead><tr><th>วันที่</th><th>KG รวม</th><th>ม้วน</th></tr></thead><tbody>';
  dates.slice(0, 10).forEach(d => {
    const info = byDate[d];
    const rolls = Math.ceil(info.kg / std);
    html += `<tr><td>${d}</td><td style="text-align:right">${info.kg.toFixed(2)}</td><td style="text-align:right"><b>${rolls}</b></td></tr>`;
  });
  html += '</tbody></table>';

  // === 2. Stock Detail ===
  const stockRows = await fetchAllRows(() =>
    supabase.from('stock_balance')
      .select('sn, dimeter, kgs, supplier, customer, is_customer_roll, roll_status')
      .eq('stock_date', stockDate)
      .eq('grade', grade)
      .eq('width', size)
      .eq('roll_status', 'full')
  );

  const filteredStock = includeCustomer ? stockRows : stockRows.filter(s => !s.is_customer_roll);

  html += `<h4>📦 Stock คงเหลือ (${stockDate}) — ${filteredStock.length} ม้วน</h4>`;
  if (filteredStock.length) {
    html += '<table style="margin-bottom:16px"><thead><tr><th>SN</th><th>Diameter</th><th>KG</th><th>Supplier</th><th>Customer</th></tr></thead><tbody>';
    filteredStock.forEach(s => {
      const custTxt = s.is_customer_roll ? `👤 ${esc(s.customer)}` : '-';
      html += `<tr>
        <td>${esc(s.sn)}</td>
        <td>${Number(s.dimeter).toFixed(2)}</td>
        <td>${Number(s.kgs).toFixed(2)}</td>
        <td>${esc(s.supplier)||'-'}</td>
        <td>${custTxt}</td>
      </tr>`;
    });
    html += '</tbody></table>';
  } else {
    html += '<p style="color:#94a3b8">ไม่มีม้วนเต็มในสต็อก</p>';
  }

  // === 3. Receive Detail ===
  const receiveRows = await fetchAllRows(() =>
    supabase.from('po_receive')
      .select('po_no, supplier, quantity, kg_total, remark, is_customer_roll')
      .eq('po_date', receiveDate)
      .eq('grade', grade)
      .eq('size', size)
  );

  const filteredReceive = includeCustomer ? receiveRows : receiveRows.filter(r => !r.is_customer_roll);

  html += `<h4>📥 Receive (${receiveDate}) — ${filteredReceive.reduce((s,r)=>s+Number(r.quantity),0)} ม้วน</h4>`;
  if (filteredReceive.length) {
    html += '<table><thead><tr><th>PO</th><th>Supplier</th><th>Quantity</th><th>KG</th><th>หมายเหตุ</th></tr></thead><tbody>';
    filteredReceive.forEach(r => {
      html += `<tr>
        <td>${esc(r.po_no)}</td>
        <td>${esc(r.supplier)}</td>
        <td style="text-align:right">${r.quantity}</td>
        <td style="text-align:right">${Number(r.kg_total).toFixed(0)}</td>
        <td>${esc(r.remark)||'-'}</td>
      </tr>`;
    });
    html += '</tbody></table>';
  } else {
    html += '<p style="color:#94a3b8">ไม่มีรายการรับเข้า</p>';
  }

  $('alertReportTitle').innerHTML = html;
}

// ================= EXPORT ALERT =================
function exportAlert() {
  if (!alertCache.length) return alert('ไม่มีข้อมูล');

  const data = alertCache.map(r => ({
    Gradegrams: r.gradegram,
    Size: r.size,
    Demand: r.demand,
    Stock: r.stock,
    Receive: r.receive,
    Total_Available: r.total,
    Shortage: r.shortage > 0 ? r.shortage : 0,
    สถานะ: r.shortage > 0 ? 'ต้องสั่ง' : 'OK'
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Alert');
  XLSX.writeFile(wb, `roll_alert_${new Date().toISOString().slice(0,10)}.xlsx`);
}
