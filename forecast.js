// ==========================================
// forecast.js - Production Forecast & Usage Pivot (FIXED)
// ==========================================

const fcState = {
    currentGradeGroup: 'CA',
    masterData: [],
    // pivot state (ประกาศให้ครบ)
    pivotData: null,
    pivotWidths: [],
    pivotMonth: '',
    pivotCustomer: 'ALL',
    pivotCustomers: []   // รายชื่อลูกค้าที่โหลดมา
};

// ==========================================
// 1. Forecast Tab
// ==========================================
async function initForecastTab() {
    const tbody = document.getElementById('forecast-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="22" style="text-align:center;">กำลังโหลดข้อมูล...</td></tr>';

    await loadForecastMasterData();
    initForecastDatePickers();
    renderGradeTabs();
    await loadForecastMatrix();
}

function initForecastDatePickers() {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    const dateInput = document.getElementById('fc-stock-date');
    const monthInput = document.getElementById('fc-month');

    // stock date ใช้ flatpickr
    if (dateInput && window.flatpickrInstances && !window.flatpickrInstances['fc-stock-date']) {
        window.flatpickrInstances['fc-stock-date'] = flatpickr(dateInput, {
            locale: "th",
            dateFormat: "Y-m-d",
            defaultDate: yesterday,
            allowInput: false,
            disableMobile: true,
            onChange: () => loadForecastMatrix()
        });
    }

    // default ค่า month inputs (ถ้ายังว่าง)
    const cur = today.toISOString().slice(0, 7);
    ['fc-month', 'fc-m1', 'fc-m2', 'fc-m3', 'fc-prev-month'].forEach(id => {
        const el = document.getElementById(id);
        if (el && !el.value) el.value = cur;
    });
}

async function loadForecastMasterData() {
    // ดึงจาก paper_specs (grade + size + item_code + std_weight_kg)
    const { data, error } = await supabase
        .from('paper_specs')
        .select('grade, size, item_code, std_weight_kg');
    if (!error) fcState.masterData = data || [];
    else console.warn('loadForecastMasterData error:', error.message);
}

function renderGradeTabs() {
    const groups = ['CA', 'KA', 'KI', 'KK', 'KW', 'FSC'];
    const container = document.getElementById('fc-grade-tabs');
    if (!container) return;

    container.innerHTML = '';
    groups.forEach(group => {
        const btn = document.createElement('button');
        btn.className = `sub-tab ${fcState.currentGradeGroup === group ? 'active' : ''}`;
        btn.innerText = group;
        btn.onclick = () => {
            fcState.currentGradeGroup = group;
            renderGradeTabs();
            loadForecastMatrix();
        };
        container.appendChild(btn);
    });
}

async function loadForecastMatrix() {
    const tbody = document.getElementById('forecast-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="22" style="text-align:center;">Loading...</td></tr>';

    // 🔽 อ่านค่าอย่างปลอดภัย
    const getVal = (id) => document.getElementById(id)?.value || '';
    const selectedDate = typeof getISODateFromInput === 'function'
        ? getISODateFromInput('fc-stock-date')
        : (getVal('fc-stock-date'));
    const monthYear = getVal('fc-month');
    const m1 = getVal('fc-m1');
    const m2 = getVal('fc-m2');
    const m3 = getVal('fc-m3');
    const prevMonth = getVal('fc-prev-month');

    if (!selectedDate || !monthYear) {
        tbody.innerHTML = '<tr><td colspan="22" style="text-align:center;color:#b45309">กรุณาเลือก Stock Date และ Forecast Month</td></tr>';
        return;
    }

    try {
        // 1) Stock
        const { data: stockRaw } = await supabase
            .from('stock_balance')
            .select('grade, size, rolls')
            .eq('stock_date', selectedDate);

        const stockData = {};
        (stockRaw || []).forEach(item => {
            const k = `${item.grade}-${item.size}`;
            stockData[k] = (stockData[k] || 0) + Number(item.rolls || 0);
        });

        // 2) Forecast ที่เคยเซฟ
        const { data: savedForecast } = await supabase
            .from('forecast_data')
            .select('*')
            .eq('month_year', monthYear);

        // 3) Forecast ของเดือนก่อน
        const prevData = prevMonth
            ? (await supabase.from('forecast_data').select('*').eq('month_year', prevMonth)).data
            : [];

        // 4) Usage Snapshot ของ m1, m2, m3 (ยอดรวม ALL)
        let usageSnapshots = [];
        const months = [m1, m2, m3].filter(Boolean);
        if (months.length) {
            const { data: snaps } = await supabase
                .from('usage_snapshots')
                .select('*')
                .in('snapshot_month', months)
                .eq('customer_filter', 'ALL');
            usageSnapshots = snaps || [];
        }

        // 5) กรอง master ตาม tab
        const filteredMaster = fcState.masterData.filter(m =>
            String(m.grade || '').toUpperCase().startsWith(fcState.currentGradeGroup)
        );

        tbody.innerHTML = '';
        if (filteredMaster.length === 0) {
            tbody.innerHTML = '<tr><td colspan="22" style="text-align:center;color:gray;">ไม่พบข้อมูลใน Master</td></tr>';
            return;
        }

        filteredMaster.forEach(m => {
            const stockKey = `${m.grade}-${m.size}`;
            const stockQty = stockData[stockKey] || 0;

            const saved = (savedForecast || []).find(f =>
                f.grade === m.grade && Number(f.width) === Number(m.size)) || {};
            const prev = (prevData || []).find(p =>
                p.grade === m.grade && Number(p.width) === Number(m.size)) || {};

            const findSnap = (mon) => usageSnapshots.find(s =>
                s.snapshot_month === mon &&
                s.grade === m.grade &&
                Number(s.width) === Number(m.size)
            );

            const m1_val = findSnap(m1)?.total_rolls ?? null;
            const m2_val = findSnap(m2)?.total_rolls ?? null;
            const m3_val = findSnap(m3)?.total_rolls ?? null;

            // avg เฉพาะเดือนที่มีข้อมูล
            let avg3 = 0, cnt = 0;
            [m1_val, m2_val, m3_val].forEach(v => { if (v !== null) { avg3 += Number(v); cnt++; } });
            avg3 = cnt > 0 ? avg3 / cnt : 0;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${m.grade}</td>
                <td>${m.size}</td>
                <td class="col-m1">${m1_val !== null ? Number(m1_val).toFixed(2) : ''}</td>
                <td class="col-m2">${m2_val !== null ? Number(m2_val).toFixed(2) : ''}</td>
                <td class="col-m3">${m3_val !== null ? Number(m3_val).toFixed(2) : ''}</td>
                <td class="col-avg">${cnt > 0 ? avg3.toFixed(2) : ''}</td>

                <td><input type="number" class="fc-input" data-field="forecast_nen" value="${saved.forecast_nen || 0}"></td>
                <td><input type="number" class="fc-input" data-field="forecast_nea" value="${saved.forecast_nea || 0}"></td>
                <td><input type="number" class="fc-input" data-field="forecast_thaifood" value="${saved.forecast_thaifood || 0}"></td>
                <td><input type="number" class="fc-input" data-field="forecast_ktp" value="${saved.forecast_ktp || 0}"></td>

                <td class="actual-cell" style="background:#e6f2ff;font-weight:bold;">0.00</td>
                <td class="col-prev-actual">0.00</td>

                <td class="col-stock">${stockQty}</td>
                <td><input type="number" class="fc-input" data-field="reserve_qty" value="${saved.reserve_qty || 0}"></td>

                <td class="roll-snd-cell" style="background:#f5f5f5;">0.00</td>
                <td class="est-use-cell" style="background:#f5f5f5;">0.00</td>
                <td class="stock-level-cell">0</td>
                <td class="stock-level-half-cell">0</td>

                <td class="order-calc-cell" style="background:#e6ffe6;">0.00</td>
                <td class="col-order-round">0</td>

                <td><input type="number" class="fc-input" data-field="adjust_qty" value="${saved.adjust_qty || 0}"></td>
                <td><input type="text" class="fc-input" data-field="note" value="${(saved.note || '').replace(/"/g, '&quot;')}" style="width:100px;text-align:left;"></td>
            `;

            tr.dataset.grade = m.grade;
            tr.dataset.width = m.size;
            tr.dataset.avg3 = avg3;
            tr.dataset.stockLevel = 0; // 🔽 ถ้ามีตาราง stock_level ให้ดึงมาใส่ตรงนี้

            tr.querySelectorAll('.fc-input').forEach(inp => {
                inp.addEventListener('change', () => recalculateRow(tr, stockQty, prev));
                inp.addEventListener('input',  () => recalculateRow(tr, stockQty, prev));
            });

            tbody.appendChild(tr);
            recalculateRow(tr, stockQty, prev);
        });

    } catch (err) {
        console.error('Matrix Error:', err);
        tbody.innerHTML = `<tr><td colspan="22" style="text-align:center;color:red;">เกิดข้อผิดพลาด: ${err.message}</td></tr>`;
    }
}

function recalculateRow(tr, stockQty, prev) {
    const getVal = (field) => {
        const input = tr.querySelector(`.fc-input[data-field="${field}"]`);
        if (!input) return 0;
        const v = Number(input.value);
        return isNaN(v) ? 0 : v;
    };

    const avg3     = Number(tr.dataset.avg3 || 0);
    const stockLvl = Number(tr.dataset.stockLevel || 0);

    const fNen  = getVal('forecast_nen');
    const fNea  = getVal('forecast_nea');
    const fThai = getVal('forecast_thaifood');
    const fKtp  = getVal('forecast_ktp');
    const reserve = getVal('reserve_qty');
    const adjust  = getVal('adjust_qty');

    const actual     = avg3 + fNen + fNea + fThai + fKtp;
    const prevActual = prev
        ? (Number(prev.forecast_nen || 0) + Number(prev.forecast_nea || 0)
         + Number(prev.forecast_thaifood || 0) + Number(prev.forecast_ktp || 0))
        : 0;

    const rollSND = Number(stockQty) + reserve;
    const estUse  = actual + prevActual - rollSND;

    const stockLvl50 = stockLvl / 2;
    const orderCalc  = estUse + stockLvl50 + adjust;
    const orderRound = Math.ceil(orderCalc);

    tr.querySelector('.actual-cell').innerText       = actual.toFixed(2);
    tr.querySelector('.col-prev-actual').innerText   = prevActual.toFixed(2);
    tr.querySelector('.roll-snd-cell').innerText     = rollSND.toFixed(2);
    tr.querySelector('.est-use-cell').innerText      = estUse.toFixed(2);
    tr.querySelector('.stock-level-cell').innerText  = stockLvl.toFixed(2);
    tr.querySelector('.stock-level-half-cell').innerText = stockLvl50.toFixed(2);
    tr.querySelector('.order-calc-cell').innerText   = orderCalc.toFixed(2);
    tr.querySelector('.col-order-round').innerText   = orderRound;
}

async function saveForecastData() {
    const monthYear = document.getElementById('fc-month')?.value;
    if (!monthYear) return showToast('กรุณาเลือกเดือน Forecast', 'warn');

    const rows = document.querySelectorAll('#forecast-tbody tr');
    const payloads = [];

    rows.forEach(tr => {
        const grade = tr.dataset.grade;
        const width = tr.dataset.width;
        if (!grade || !width) return;

        const getVal = (field) => {
            const input = tr.querySelector(`.fc-input[data-field="${field}"]`);
            if (!input) return field === 'note' ? '' : 0;
            if (input.type === 'number') {
                const v = Number(input.value);
                return isNaN(v) ? 0 : v;
            }
            return input.value;
        };

        payloads.push({
            month_year: monthYear,
            grade: grade,
            width: Number(width),
            forecast_nen:      getVal('forecast_nen'),
            forecast_nea:      getVal('forecast_nea'),
            forecast_thaifood: getVal('forecast_thaifood'),
            forecast_ktp:      getVal('forecast_ktp'),
            reserve_qty:       getVal('reserve_qty'),
            adjust_qty:        getVal('adjust_qty'),
            note:              getVal('note')
        });
    });

    if (payloads.length === 0) return showToast('ไม่มีข้อมูลให้บันทึก', 'warn');

    const { error } = await supabase
        .from('forecast_data')
        .upsert(payloads, { onConflict: 'month_year,grade,width' });

    if (error) {
        console.error('saveForecast error:', error);
        showToast('บันทึกไม่สำเร็จ: ' + error.message, 'err');
    } else {
        showToast(`บันทึก Forecast สำเร็จ (${payloads.length} แถว)`, 'ok');
    }
}

// ==========================================
// 2. Usage Pivot & Snapshot
// ==========================================

async function initUsagePivotTab() {
    // ตั้งค่าเดือนเริ่มต้น
    const monthInput = document.getElementById('pivot-month');
    if (monthInput && !monthInput.value) {
        monthInput.value = new Date().toISOString().slice(0, 7);
    }

    // 🔽 populate dropdown ลูกค้า (ใช้ id ที่ตรงกับ HTML)
    const list = document.getElementById('pivotCustomerList');
    if (!list) return;
    if (fcState.pivotCustomers.length > 0) return;   // โหลดแล้วไม่ต้องซ้ำ

    try {
        // 🔽 ใช้ fetchAllRows ดึงข้อมูลทั้งหมดแบบไม่มีวันขาด
        const data = await fetchAllRows(() =>
            supabase.from('usage_records_raw').select('roll_for_customer')
        );

        const unique = [...new Set((data || [])
            .map(d => (d.roll_for_customer || '').trim())
            .filter(Boolean))]
            .sort();

        fcState.pivotCustomers = unique;

        list.innerHTML = unique.map(c => `
            <label class="item" data-customer="${escAttr(c)}">
                <input type="checkbox" value="${escAttr(c)}">
                <span>${escHtml(c)}</span>
            </label>
        `).join('');

        list.querySelectorAll('.item input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', () => {
                cb.closest('.item').classList.toggle('checked', cb.checked);
                updatePivotCustomerLabel();
            });
        });
    } catch (e) {
        console.warn('load pivot customers error:', e);
    }
}

// ===== helpers =====
function escHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escAttr(s) { return escHtml(s); }

function getSelectedPivotCustomers() {
    const list = document.getElementById('pivotCustomerList');
    if (!list) return [];
    return [...list.querySelectorAll('.item input[type="checkbox"]:checked')]
        .map(cb => cb.value);
}

function updatePivotCustomerLabel() {
    const label = document.getElementById('pivotCustomerFilterLabel');
    if (!label) return;
    const sel = getSelectedPivotCustomers();
    if (sel.length === 0)      { label.textContent = 'ทั้งหมด'; label.style.color = '#1e293b'; }
    else if (sel.length === 1) { label.textContent = sel[0]; label.style.color = '#1e40af'; }
    else                       { label.textContent = `เลือก ${sel.length} ลูกค้า`; label.style.color = '#1e40af'; }
}

function selectAllPivotCustomers() {
    document.querySelectorAll('#pivotCustomerList .item input[type="checkbox"]')
        .forEach(cb => { cb.checked = true; cb.closest('.item').classList.add('checked'); });
    updatePivotCustomerLabel();
}
function clearAllPivotCustomers() {
    document.querySelectorAll('#pivotCustomerList .item input[type="checkbox"]')
        .forEach(cb => { cb.checked = false; cb.closest('.item').classList.remove('checked'); });
    updatePivotCustomerLabel();
}

// ===== toggle dropdown (เหมือนของ tab อื่น) =====
document.addEventListener('click', (e) => {
    const btn = document.getElementById('pivotCustomerFilterBtn');
    const dd  = document.getElementById('pivotCustomerDropdown');
    const box = document.getElementById('pivotCustomerFilterBox');
    if (!btn || !dd || !box) return;
    if (btn.contains(e.target)) {
        e.stopPropagation();
        dd.classList.toggle('hidden');
        btn.classList.toggle('open');
    } else if (!box.contains(e.target)) {
        dd.classList.add('hidden');
        btn.classList.remove('open');
    }
});

async function loadUsagePivot() {
    const month = document.getElementById('pivot-month')?.value;
    if (!month) return showToast('กรุณาเลือกเดือน', 'warn');

    const selectedCustomers = getSelectedPivotCustomers();
    const tbody = document.getElementById('pivot-tbody');
    const thead = document.getElementById('pivot-thead');
    if (!tbody || !thead) return;

    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;">กำลังโหลด...</td></tr>';

    // คำนวณช่วงเดือน (กันเดือน 31 วัน)
    const [y, mo] = month.split('-').map(Number);
    const firstDay = `${month}-01`;
    const lastDay  = new Date(y, mo, 0).toISOString().slice(0, 10);

    try {
        // 🔽 ใช้ fetchAllRows ดึงข้อมูลให้ครบ (แก้ปัญหา Size หาย)
        const data = await fetchAllRows(() => {
            let q = supabase
                .from('usage_records_raw')
                .select('grade, width, used_kgs, roll_for_customer')
                .eq('is_valid', true)
                .gte('usage_date', firstDay)
                .lte('usage_date', lastDay);

            // ถ้ามีการเลือก Dropdown ลูกค้า ให้กรอง
            if (selectedCustomers.length > 0) {
                q = q.in('roll_for_customer', selectedCustomers);
            }
            return q;
        });

        const pivotData = {};
        const allWidths = new Set();

        (data || []).forEach(row => {
            allWidths.add(row.width);
            if (!pivotData[row.grade]) pivotData[row.grade] = { total: 0 };
            if (!pivotData[row.grade][row.width]) pivotData[row.grade][row.width] = 0;

            const rolls = Number(row.used_kgs) / 500;
            pivotData[row.grade][row.width] += rolls;
            pivotData[row.grade].total     += rolls;
        });

        const sortedWidths = Array.from(allWidths).sort((a, b) => a - b);

        // ===== Header =====
        let headerHtml = '<tr><th>Grade</th>';
        sortedWidths.forEach(w => headerHtml += `<th>${w}</th>`);
        headerHtml += '<th>Grand Total</th></tr>';
        thead.innerHTML = headerHtml;

        // ===== Body =====
        let bodyHtml = '';
        if (Object.keys(pivotData).length === 0) {
            bodyHtml = `<tr><td colspan="${sortedWidths.length + 2}" style="text-align:center;">ไม่มีข้อมูลในเดือนนี้</td></tr>`;
        } else {
            Object.keys(pivotData).sort().forEach(grade => {
                const row = pivotData[grade];
                bodyHtml += `<tr><td><strong>${escHtml(grade)}</strong></td>`;
                sortedWidths.forEach(w => {
                    const val = row[w] || 0;
                    bodyHtml += `<td>${val > 0 ? val.toFixed(2) : ''}</td>`;
                });
                bodyHtml += `<td style="background:#e6f2ff;font-weight:bold;">${row.total.toFixed(2)}</td></tr>`;
            });
        }
        tbody.innerHTML = bodyHtml;

        // ===== เก็บ state =====
        fcState.pivotData     = pivotData;
        fcState.pivotWidths   = sortedWidths;
        fcState.pivotMonth    = month;
        fcState.pivotCustomer = selectedCustomers.length === 0 ? 'ALL' : selectedCustomers.join(',');

        showToast(`โหลด Pivot สำเร็จ (${Object.keys(pivotData).length} grade)`, 'ok');

    } catch (err) {
        console.error(err);
        tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;color:red;">Error: ${escHtml(err.message)}</td></tr>`;
        showToast('Error loading pivot', 'err');
    }
}

async function saveUsageSnapshot() {
    if (!fcState.pivotData || !fcState.pivotMonth) {
        return showToast('กรุณากด Load Pivot ก่อนบันทึก', 'warn');
    }

    const month = fcState.pivotMonth;
    const customerFilter = fcState.pivotCustomer;
    const pivotData = fcState.pivotData;

    const payloads = [];
    Object.keys(pivotData).forEach(grade => {
        const row = pivotData[grade];
        fcState.pivotWidths.forEach(width => {
            const rolls = row[width] || 0;
            if (rolls > 0) {
                payloads.push({
                    snapshot_month: month,
                    customer_filter: customerFilter,
                    grade: grade,
                    width: Number(width),
                    total_rolls: rolls
                });
            }
        });
    });

    if (payloads.length === 0) return showToast('ไม่มีข้อมูลให้บันทึก Snapshot', 'warn');

    showToast('กำลังบันทึก Snapshot...', 'info');

    // ลบของเดิมก่อน (ถ้ามี unique จะได้ไม่ error)
    const { error: delErr } = await supabase.from('usage_snapshots')
        .delete()
        .eq('snapshot_month', month)
        .eq('customer_filter', customerFilter);

    if (delErr) {
        console.error(delErr);
        return showToast('ลบ Snapshot เก่าไม่สำเร็จ: ' + delErr.message, 'err');
    }

    const { error } = await supabase.from('usage_snapshots').insert(payloads);
    if (error) {
        console.error(error);
        showToast('บันทึก Snapshot ไม่สำเร็จ: ' + error.message, 'err');
    } else {
        showToast(`บันทึก Snapshot สำเร็จ (${payloads.length} รายการ)`, 'ok');
    }
}

// ==========================================
// 3. Import Excel (Usage Pivot) — UPDATED (delete ตรงๆ ไม่ใช้ RPC)
// ==========================================
async function handleUsageImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            showToast('กำลังอ่านไฟล์ Excel...', 'info');
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });

            if (rows.length === 0) return showToast('ไม่พบข้อมูลในไฟล์ Excel', 'warn');

            // ==========================================
            // 🔍 ขั้นตอนที่ 1: ตรวจสอบเงื่อนไข sbjob_no (ห้ามเกิน 6 แถว)
            // ==========================================
            const sbjobCounts = {};
            let missingJobNoCount = 0;

            rows.forEach(row => {
                const jobNo = String(row['sbjob_no'] || row['SBJOB_NO'] || row['job_no'] || '').trim();
                if (!jobNo) {
                    missingJobNoCount++;
                } else {
                    sbjobCounts[jobNo] = (sbjobCounts[jobNo] || 0) + 1;
                }
            });

            const invalidJobs = Object.keys(sbjobCounts).filter(jobNo => sbjobCounts[jobNo] > 6);

            if (missingJobNoCount > 0) {
                return showToast(`❌ ไฟล์มีปัญหา: พบ ${missingJobNoCount} แถวที่ไม่มี sbjob_no`, 'err', 5000);
            }

            if (invalidJobs.length > 0) {
                const exampleJobs = invalidJobs.slice(0, 3).join(', ');
                const moreText = invalidJobs.length > 3 ? ' และอื่นๆ' : '';
                return showToast(`❌ บล็อกการ Import: พบ ${invalidJobs.length} sbjob_no ที่มีแถวเกิน 6 แถว (เช่น ${exampleJobs}${moreText})`, 'err', 6000);
            }

            const uniqueJobsCount = Object.keys(sbjobCounts).length;
            showToast(`✅ ไฟล์ปกติ: พบ ${rows.length} แถว (มี ${uniqueJobsCount} sbjob_no) กำลังเตรียมบันทึก...`, 'info', 4000);

            // ==========================================
            // 🔄 ขั้นตอนที่ 2: แปลงข้อมูลและเตรียมลบของเก่า
            // ==========================================
            const batchId = crypto.randomUUID();
            const importData = [];
            const monthsToDelete = new Set();

            rows.forEach(row => {
                const rawDate  = row['prod_date'] || row['doc_date'] || row['Date'] || row['usage_date'];
                const rawWidth = row['Size'] || row['size'] || row['Width'] || row['width'];
                const rawKgs   = row['used_kgs'] || row['kgs'] || row['Kgs'];
                const rawGrade = row['grade'] || row['Grade'];
                const customer = row['customer_code'] || row['Customer'] || row['customer_name'] || row['roll_for_customer'] || '';
                const jobNo    = String(row['sbjob_no'] || row['SBJOB_NO'] || row['job_no'] || '').trim();

                const width = parseFloat(rawWidth) || 0;
                const kgs   = parseFloat(rawKgs) || 0;
                const grade = typeof normalizeGrade === 'function' ? normalizeGrade(rawGrade || '') : String(rawGrade || '').toUpperCase();
                const dateISO = typeof toISODate === 'function' ? toISODate(rawDate) : rawDate;
                
                if (dateISO && dateISO.length >= 7) {
                    monthsToDelete.add(dateISO.slice(0, 7));
                }

                const item = fcState.masterData.find(m => m.grade === grade && Number(m.size) === width);

                importData.push({
                    usage_date: dateISO,
                    doc_date:   dateISO,
                    sbjob_no:   jobNo,
                    grade:      grade,
                    width:      width,
                    used_kgs:   kgs,
                    kgs:        kgs,
                    roll_for_customer: customer,
                    item_code:  item ? item.item_code : '',
                    is_valid:   true,
                    import_batch_id: batchId,
                    created_by: currentUser?.id || null
                });
            });

            const validData = importData.filter(d => d.usage_date && d.grade && d.width > 0);
            if (validData.length === 0) return showToast('ไม่พบข้อมูลที่ถูกต้อง', 'warn');

            // ==========================================
            // 🗑️ ลบข้อมูลเก่าของเดือนนั้นๆ ทิ้งก่อน (เขียนทับ)
            // ==========================================
            if (monthsToDelete.size > 0) {
                showToast('กำลังล้างข้อมูลเก่าของเดือนในไฟล์นี้...', 'info');
                for (const m of monthsToDelete) {
                    const [y, mo] = m.split('-').map(Number);
                    const firstDay = `${m}-01`;
                    const lastDay  = new Date(y, mo, 0).toISOString().slice(0, 10);

                    // ลบโดยตรงจากตาราง (ไม่ใช้ RPC แล้ว)
                    const { error: delError } = await supabase
                        .from('usage_records_raw')
                        .delete()
                        .gte('usage_date', firstDay)
                        .lte('usage_date', lastDay);

                    if (delError) {
                        console.error(`ลบข้อมูลเดือน ${m} ไม่สำเร็จ:`, delError);
                        return showToast(`ลบข้อมูลเก่าไม่สำเร็จ (ติด RLS หรือ Network): ${delError.message}`, 'err', 6000);
                    }
                }
            }

            // ==========================================
            // 💾 ขั้นตอนที่ 3: บันทึกข้อมูลใหม่
            // ==========================================
            showToast(`กำลังบันทึก ${validData.length} รายการ...`, 'info');

            const CHUNK = 500;
            let ok = 0, fail = 0;
            for (let i = 0; i < validData.length; i += CHUNK) {
                const chunk = validData.slice(i, i + CHUNK);
                const { error } = await supabase.from('usage_records_raw').insert(chunk);
                if (error) { 
                    fail += chunk.length; 
                    console.error('Insert error:', error); 
                } else { 
                    ok += chunk.length; 
                }
            }

            if (fail > 0) {
                showToast(`Import สำเร็จ ${ok} / ล้มเหลว ${fail}`, 'err', 5000);
            } else {
                showToast(`Import สำเร็จ ${ok} รายการ`, 'ok');
            }

            document.getElementById('pivot-file-upload').value = '';
            loadUsagePivot();

        } catch (err) {
            console.error(err);
            showToast('เกิดข้อผิดพลาด: ' + err.message, 'err');
        }
    };
    reader.readAsArrayBuffer(file);
}
