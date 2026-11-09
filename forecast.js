// ==========================================
// forecast.js - Production Forecast & Usage Pivot (FIXED v5)
// ==========================================

const fcState = {
    currentGradeGroup: 'CA',
    masterData: [],
    masterMap: new Map(), // ✅ Map สำหรับค้นหาข้อมูลเร็วขึ้น
    // pivot state
    pivotData: null,
    pivotWidths: [],
    pivotMonth: '',
    pivotCustomer: 'ALL',
    pivotCustomers: [],
    pivotGradeFilter: 'ALL',
    // 🛡️ locks กันกดซ้ำ (Race Condition)
    _loadingPivot: false,
    _savingForecast: false,
    _savingSnapshot: false
};

// ==========================================
// 0. Date helpers (กัน timezone เพี้ยน เช่น Asia/Bangkok)
// ==========================================
function fcCurrentMonthStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// คืนวันสุดท้ายของเดือนเป็น YYYY-MM-DD (ไม่ใช้ toISOString เพราะจะถอยไป 1 วันใน UTC+7)
function fcLastDayOfMonth(y, mo) {
    const last = new Date(y, mo, 0).getDate();
    return `${y}-${String(mo).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
}

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

    // ✅ ให้ m1, m2, m3 ถอยหลังอัตโนมัติ
    const getMonthStr = (offset) => {
        const d = new Date();
        d.setMonth(d.getMonth() + offset);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    };

    const defaults = {
        'fc-month': getMonthStr(1),       // เดือนหน้า
        'fc-m1': getMonthStr(-1),         // เดือนที่แล้ว
        'fc-m2': getMonthStr(-2),         // 2 เดือนที่แล้ว
        'fc-m3': getMonthStr(-3),         // 3 เดือนที่แล้ว
        'fc-prev-month': getMonthStr(-1)  // เดือนที่แล้ว
    };

    Object.keys(defaults).forEach(id => {
        const el = document.getElementById(id);
        if (el && !el.value) el.value = defaults[id];
    });
}

async function loadForecastMasterData() {
    // Supabase จำกัดผลลัพธ์ที่ 1000 แถวต่อ 1 query แต่ paper_specs มีมากกว่านั้น
    // จึงต้องดึงเป็นหน้าๆ ด้วย fetchAllRows และ "ต้องเรียงลำดับให้คงที่" ไม่งั้นแต่ละหน้าอาจซ้ำ/ตกหล่น
    const buildQuery = (cols) => () => supabase
        .from('paper_specs')
        .select(cols)
        .order('item_code', { ascending: true })
        .order('size', { ascending: true });

    let rows = null;
    try {
        // ลองดึงพร้อม gram ก่อน
        rows = await fetchAllRows(buildQuery('grade, size, gram, item_code, std_weight_kg'));
    } catch (err) {
        // ถ้าไม่มีคอลัมน์ gram ใน DB จะ error → fallback ไปดึงแบบไม่มี gram
        console.warn('loadForecastMasterData (with gram) error:', err?.message, '→ retry without gram');
        try {
            rows = await fetchAllRows(buildQuery('grade, size, item_code, std_weight_kg'));
        } catch (err2) {
            console.error('loadForecastMasterData error:', err2);
        }
    }

    // โหลดไม่สำเร็จ หรือได้ 0 แถว → คงค่าเดิมไว้ ไม่ล้างทิ้ง (กัน Pivot พังทั้งหมด)
    if (!rows || rows.length === 0) {
        console.warn('⚠️ โหลด Master Data ไม่สำเร็จหรือได้ 0 รายการ');
        return;
    }

    // ลบแถวซ้ำ โดยยึด item_code เป็นหลัก (ถ้าไม่มี item_code ใช้ grade+gram+size)
    // และตรวจว่าแถวซ้ำมีน้ำหนักไม่เท่ากันหรือไม่
    const seen = new Map();
    const unique = [];
    const conflicts = new Set();

    for (const item of rows) {
        const key = (item.item_code
            ? String(item.item_code)
            : `${item.grade || ''}|${item.gram || ''}|${item.size || ''}`)
            .toUpperCase().replace(/\s+/g, '');
        const exist = seen.get(key);
        if (!exist) {
            seen.set(key, item);
            unique.push(item);
        } else if (Number(exist.std_weight_kg) !== Number(item.std_weight_kg)) {
            conflicts.add(item.item_code || `${item.grade}-${item.size}`);
        }
    }

    if (conflicts.size > 0) {
        const list = Array.from(conflicts).slice(0, 5).join(', ');
        console.warn('paper_specs มีรายการซ้ำที่ std_weight_kg ไม่เท่ากัน:', Array.from(conflicts));
        showToast(`⚠️ Master มีรายการซ้ำที่น้ำหนักไม่เท่ากัน (เช่น ${list}) ควรแก้ที่ตาราง paper_specs`, 'warn', 6000);
    }

    fcState.masterData = unique;

    // ✅ สร้าง Map ที่แม่นยำขึ้น (บังคับให้ 1 Grade+Size มีแค่ 1 รายการ และ Std Weight ต้อง > 0)
    fcState.masterMap.clear();
    unique.forEach(m => {
        if (!m.std_weight_kg || Number(m.std_weight_kg) <= 0) return; // ข้ามถ้าน้ำหนัก 0
        const key = `${String(m.grade).trim().toUpperCase()}-${Number(m.size)}`;
        if (!fcState.masterMap.has(key)) {
            fcState.masterMap.set(key, m);
        }
    });

    console.log(`✅ โหลด Master Data สำเร็จ: ${rows.length} แถว → ${unique.length} รายการ`);
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

    // อ่านค่าอย่างปลอดภัย
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
            const rollVal = item.rolls !== undefined ? Number(item.rolls) : 1;
            stockData[k] = (stockData[k] || 0) + rollVal;
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
                <td>${escHtml(m.grade)}</td>
                <td>${escHtml(m.size)}</td>
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
                <td><input type="text" class="fc-input" data-field="note" value="${escAttr(saved.note || '')}" style="width:100px;text-align:left;"></td>
            `;

            tr.dataset.grade = m.grade;
            tr.dataset.width = m.size;
            tr.dataset.avg3 = avg3;
            tr.dataset.stockLevel = 0;

            tr.querySelectorAll('.fc-input').forEach(inp => {
                inp.addEventListener('change', () => recalculateRow(tr, stockQty, prev));
                inp.addEventListener('input',  () => recalculateRow(tr, stockQty, prev));
            });

            tbody.appendChild(tr);
            recalculateRow(tr, stockQty, prev);
        });

    } catch (err) {
        console.error('Matrix Error:', err);
        tbody.innerHTML = `<tr><td colspan="22" style="text-align:center;color:red;">เกิดข้อผิดพลาด: ${escHtml(err.message)}</td></tr>`;
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

    // ป้องกันการบวกซ้ำซ้อน: actual คือยอดที่ต้องใช้อยู่แล้ว ไม่บวก prevActual ทับ
    const estUse = actual - rollSND;

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

// 🛡️ กันกดซ้ำ: ครอบ lock ไว้ข้างนอก ตัวทำงานจริงอยู่ใน _saveForecastDataImpl
async function saveForecastData() {
    if (fcState._savingForecast) return;
    fcState._savingForecast = true;
    try {
        await _saveForecastDataImpl();
    } finally {
        fcState._savingForecast = false;
    }
}

async function _saveForecastDataImpl() {
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
        monthInput.value = fcCurrentMonthStr();
    }

    // โหลด Master Data ล่วงหน้าตอนเปิดแท็บ
    await loadForecastMasterData();

    // populate dropdown ลูกค้า
    const list = document.getElementById('pivotCustomerList');
    if (list && fcState.pivotCustomers.length === 0) {
        try {
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

    // ✅ จุดที่ 1: ให้โหลดตาราง Pivot รายเดือนอัตโนมัติทันทีที่เข้าหน้านี้
    setTimeout(() => {
        loadUsagePivot();
    }, 100);
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

// ===== toggle dropdown =====
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

// ✅ หา master item จากแถว usage
// normalize โดยตัดช่องว่าง/ขีดกลาง/ขีดล่างออก เพื่อให้ "KA-125", "KA 125", "KA_125", "KA125" จับคู่กันได้หมด
function findMasterForUsageRow(rowGrade, rowSize, rowItemCode) {
    const master = fcState.masterData;
    // ลบช่องว่าง, ขีดกลาง, ตัวพิมพ์เล็ก ให้เหลือแต่ตัวอักษรและตัวเลข
    const clean = (v) => String(v ?? '').replace(/[\s\-_]/g, '').toUpperCase();

    const rCode  = clean(rowItemCode);
    const rGrade = clean(rowGrade);
    const rSize  = Number(rowSize);

    // ชั้นที่ 1: จับ item_code ตรงๆ
    if (rCode) {
        const hit = master.find(m => clean(m.item_code) === rCode);
        if (hit) return hit;
    }

    // ชั้นที่ 2: ประกอบ Grade + Size เป็น item_code (เช่น KA125 + 44 = KA12544)
    const composed = `${rGrade}${rSize}`;
    let hit = master.find(m => clean(m.item_code) === composed);
    if (hit) return hit;

    // ชั้นที่ 3: แยก "KK125" เป็น "KK" + "125" แล้วเทียบ grade / gram / size แยกกัน
    const gradeMatch = rGrade.match(/^([A-Z]+)(\d+)$/);
    if (gradeMatch) {
        const baseGrade = gradeMatch[1];
        const baseGram  = gradeMatch[2];

        hit = master.find(m => {
            if (Number(m.size) !== rSize) return false;
            const mGrade = clean(m.grade);
            const mGram  = String(Number(m.gram));
            return mGrade === baseGrade && mGram === baseGram;
        });
        if (hit) return hit;
    }

    // ชั้นที่ 4: Fallback เทียบ Grade + Size ตรงๆ
    hit = master.find(m => clean(m.grade) === rGrade && Number(m.size) === rSize);
    return hit || null;
}

// ===== Pivot: แท็บกรองเกรด (กรองเฉพาะตอนแสดงผล ไม่กระทบข้อมูลที่ใช้บันทึก Snapshot) =====

// เกรด FSC = ชื่อเกรดมีตัว F (เช่น CAF085)
function isFscGrade(grade) {
    return String(grade || '').toUpperCase().includes('F');
}

function pivotGradeMatches(grade, group) {
    const g = String(grade || '').trim().toUpperCase();
    if (!group || group === 'ALL') return true;
    if (group === 'FSC') return isFscGrade(g);
    return g.startsWith(group);
}

// วาดตาราง Pivot จากข้อมูลที่โหลดไว้ใน fcState ตามแท็บเกรดที่เลือก (ไม่ดึง DB ใหม่)
function renderUsagePivotTable() {
    const tbody = document.getElementById('pivot-tbody');
    const thead = document.getElementById('pivot-thead');
    const pivotData = fcState.pivotData;
    if (!tbody || !thead || !pivotData) return;

    const group  = fcState.pivotGradeFilter || 'ALL';
    const grades = Object.keys(pivotData)
        .filter(g => pivotGradeMatches(g, group))
        .sort();

    // แสดงเฉพาะความกว้างที่มีอยู่ในเกรดที่ถูกกรอง
    const widths = group === 'ALL'
        ? fcState.pivotWidths
        : fcState.pivotWidths.filter(w => grades.some(g => pivotData[g][w] !== undefined));

    let headerHtml = '<tr><th>Grade</th>';
    widths.forEach(w => headerHtml += `<th>${escHtml(w)}</th>`);
    headerHtml += '<th>Grand Total</th></tr>';
    thead.innerHTML = headerHtml;

    let bodyHtml = '';
    if (grades.length === 0) {
        const msg = Object.keys(pivotData).length === 0
            ? 'ไม่มีข้อมูลในเดือนนี้'
            : `ไม่มีข้อมูลเกรดกลุ่ม ${escHtml(group)} ในเดือนนี้`;
        bodyHtml = `<tr><td colspan="${widths.length + 2}" style="text-align:center;">${msg}</td></tr>`;
    } else {
        grades.forEach(grade => {
            const row = pivotData[grade];
            bodyHtml += `<tr><td><strong>${escHtml(grade)}</strong></td>`;
            widths.forEach(w => {
                const val = row[w] || 0;
                bodyHtml += `<td>${val > 0 ? val.toFixed(2) : ''}</td>`;
            });
            bodyHtml += `<td style="background:#e6f2ff;font-weight:bold;">${row.total > 0 ? row.total.toFixed(2) : '0.00'}</td></tr>`;
        });
    }
    tbody.innerHTML = bodyHtml;
}

// เรียกจากปุ่มแท็บ (onclick="filterPivotByGrade('CA', this)")
function filterPivotByGrade(gradeGroup, btnElement) {
    fcState.pivotGradeFilter = gradeGroup;

    // รีเซ็ตสไตล์ปุ่มทั้งหมด
    document.querySelectorAll('#pivot-sub-tabs .sub-tab').forEach(btn => {
        btn.classList.remove('active');
        btn.style.backgroundColor = '';
        btn.style.color = (btn.id === 'btn-tab-fsc') ? '#10b981' : '';
    });

    if (btnElement) {
        btnElement.classList.add('active');
        // FSC เป็นสีเขียวเมื่อถูกเลือก
        if (gradeGroup === 'FSC') {
            btnElement.style.backgroundColor = '#10b981';
            btnElement.style.color = '#ffffff';
        }
    }

    // วาดตารางใหม่จากข้อมูลที่โหลดไว้แล้ว (ไม่ต้องดึง DB ซ้ำ)
    renderUsagePivotTable();
}

// 🛡️ กันกดซ้ำ (Race Condition)
async function loadUsagePivot() {
    if (fcState._loadingPivot) return;

    const btnLoad = document.querySelector('button[onclick="loadUsagePivot()"]')
                 || document.getElementById('btnLoadPivot');

    if (btnLoad && btnLoad.disabled) return;

    fcState._loadingPivot = true;

    const originalBtnText = btnLoad ? btnLoad.innerHTML : '';
    if (btnLoad) {
        btnLoad.disabled = true;
        btnLoad.innerHTML = '⏳ กำลังโหลด...';
    }

    try {
        await _loadUsagePivotImpl();
    } finally {
        fcState._loadingPivot = false;
        if (btnLoad) {
            btnLoad.disabled = false;
            btnLoad.innerHTML = originalBtnText || '🔍 โหลดข้อมูล Pivot';
        }
    }
}

async function _loadUsagePivotImpl() {
    const month = document.getElementById('pivot-month')?.value;
    if (!month) return showToast('กรุณาเลือกเดือน', 'warn');

    const selectedCustomers = getSelectedPivotCustomers();
    const tbody = document.getElementById('pivot-tbody');
    const thead = document.getElementById('pivot-thead');

    if (!tbody || !thead) return;

    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;">กำลังโหลด...</td></tr>';

    const [y, mo] = month.split('-').map(Number);
    const firstDay = `${month}-01`;
    const lastDay  = fcLastDayOfMonth(y, mo);

    try {
        // Master โหลดมาแล้วจาก initUsagePivotTab → ใช้ชุดเดิม ไม่โหลดซ้ำทุกครั้งที่กดปุ่ม
        if (!fcState.masterData || fcState.masterData.length === 0) {
            await loadForecastMasterData();
        }

        if (!fcState.masterData || fcState.masterData.length === 0) {
            tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;color:red;">ไม่พบข้อมูล Master Data กรุณารีเฟรชหน้าเว็บ</td></tr>`;
            return showToast('ไม่พบ Master Data', 'err');
        }

        // ดึง usage_date และ doc_no มาช่วยกันซ้ำ และกรอง is_valid = true
        const data = await fetchAllRows(() => {
            let q = supabase
                .from('usage_records_raw')
                .select('grade, width, used_kgs, item_code, usage_date, doc_no')
                .eq('is_valid', true)
                .gte('usage_date', firstDay)
                .lte('usage_date', lastDay);

            if (selectedCustomers.length > 0) {
                q = q.in('roll_for_customer', selectedCustomers);
            }
            return q;
        });

        const pivotData = {};
        const allWidths = new Set();
        const missingMasterSet = new Set();
        const processedRows = new Set(); // ✅ กันการบวกซ้ำ

        // forEach: บังคับ bucket ตาม Master (grade+gram) + log เมื่อหาไม่เจอ + เพิ่ม allWidths เฉพาะแถวที่นับจริง
        (data || []).forEach(row => {
            const rowUniqueKey = `${row.usage_date}_${row.grade}_${row.width}_${row.used_kgs}`;
            if (processedRows.has(rowUniqueKey)) return;
            processedRows.add(rowUniqueKey);

            const rowGrade    = String(row.grade || '').trim().toUpperCase();
            const rowSize     = Number(row.width);
            const rowItemCode = String(row.item_code || '').trim().toUpperCase();

            const masterItem = findMasterForUsageRow(rowGrade, rowSize, rowItemCode);

            let finalGrade = rowGrade;
            let rolls = null;

            if (!masterItem || !masterItem.std_weight_kg || Number(masterItem.std_weight_kg) <= 0) {
                console.warn('❌ หา Master ไม่เจอ:', row.grade, row.width, row.item_code);
                missingMasterSet.add(rowItemCode || `${rowGrade}-${rowSize}`);
            } else {
                rolls = Number(row.used_kgs) / Number(masterItem.std_weight_kg);

                // ✅ บังคับใช้ชื่อ Grade จาก Master Data
                if (masterItem.gram) {
                    finalGrade = `${masterItem.grade}${masterItem.gram}`;
                } else {
                    finalGrade = masterItem.grade;
                }
            }

            if (rolls !== null) {
                if (!pivotData[finalGrade]) pivotData[finalGrade] = { total: 0 };
                if (!pivotData[finalGrade][rowSize]) pivotData[finalGrade][rowSize] = 0;

                pivotData[finalGrade][rowSize] += rolls;
                pivotData[finalGrade].total     += rolls;

                allWidths.add(rowSize);
            }
        });

        // ==========================================
        // แจ้งเตือนรายการที่ไม่มีใน Master
        // ==========================================
        const historyHeader = document.querySelector('#tab-usage-pivot h3');
        const alertBox = document.getElementById('pivot-missing-alert');

        if (historyHeader) {
            if (missingMasterSet.size > 0) {
                const missingList = Array.from(missingMasterSet).sort().map(escHtml).join(', ');
                const alertHtml = `<div id="pivot-missing-alert" class="msg err" style="margin-bottom: 10px; border-left: 4px solid #dc2626; background: #fee2e2; color: #991b1b; padding: 10px; border-radius: 4px; font-size: 14px;">
                    ❌ <b>พบรายการที่ไม่มีใน Master Data (ไม่สามารถคำนวณได้):</b><br>
                    <span style="word-break: break-all;">${missingList}</span>
                </div>`;

                if (alertBox) {
                    alertBox.outerHTML = alertHtml;
                } else {
                    historyHeader.insertAdjacentHTML('beforebegin', alertHtml);
                }
            } else {
                if (alertBox) alertBox.remove();
            }
        }

        // เก็บข้อมูล "ทุกเกรด" ไว้ใน state เสมอ (saveUsageSnapshot ใช้ชุดนี้)
        fcState.pivotData     = pivotData;
        fcState.pivotWidths   = Array.from(allWidths).sort((a, b) => a - b);
        fcState.pivotMonth    = month;
        fcState.pivotCustomer = selectedCustomers.length === 0 ? 'ALL' : selectedCustomers.join(',');

        renderUsagePivotTable();

        if (missingMasterSet.size === 0) {
            showToast(`โหลด Pivot สำเร็จ (${Object.keys(pivotData).length} grade)`, 'ok');
        } else {
            showToast(`โหลด Pivot แล้ว แต่มี ${missingMasterSet.size} รายการที่ไม่มีใน Master`, 'warn');
        }

    } catch (err) {
        console.error(err);
        tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;color:red;">Error: ${escHtml(err.message)}</td></tr>`;
        showToast('Error loading pivot', 'err');
    }
}

// 🛡️ กันกดซ้ำ: ตัวทำงานจริงอยู่ใน _saveUsageSnapshotImpl
async function saveUsageSnapshot() {
    if (fcState._savingSnapshot) return;
    fcState._savingSnapshot = true;
    try {
        await _saveUsageSnapshotImpl();
    } finally {
        fcState._savingSnapshot = false;
    }
}

async function _saveUsageSnapshotImpl() {
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

    // ลบของเดิมก่อน
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
// 3. Import Excel (Usage Pivot)
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
            // ขั้นตอนที่ 1: ตรวจสอบเงื่อนไข sbjob_no (ห้ามเกิน 6 แถว)
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
            // ขั้นตอนที่ 2: แปลงข้อมูลและเตรียมลบของเก่า
            // ==========================================
            if (!fcState.masterData || fcState.masterData.length === 0) {
                await loadForecastMasterData();
            }

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

                // ใช้ตัวหา master ตัวเดียวกับ Pivot เพื่อให้ item_code ที่บันทึกสอดคล้องกัน
                const item = findMasterForUsageRow(String(grade || '').trim().toUpperCase(), width, '');

                importData.push({
                    usage_date: dateISO,
                    doc_date:   dateISO,
                    sbjob_no:   jobNo,
                    grade:      grade,
                    width:      width,
                    used_kgs:   kgs,
                    kgs:        kgs,
                    roll_for_customer: customer,
                    item_code:  item ? (item.item_code || '') : '',
                    is_valid:   true,
                    import_batch_id: batchId,
                    created_by: (typeof currentUser !== 'undefined' && currentUser?.id) || null
                });
            });

            const validData = importData.filter(d => d.usage_date && d.grade && d.width > 0);
            if (validData.length === 0) return showToast('ไม่พบข้อมูลที่ถูกต้อง', 'warn');

            // ==========================================
            // ลบข้อมูลเก่าของเดือนนั้นๆ ทิ้งก่อน (เขียนทับ)
            // ==========================================
            if (monthsToDelete.size > 0) {
                showToast('กำลังล้างข้อมูลเก่าของเดือนในไฟล์นี้...', 'info');
                for (const m of monthsToDelete) {
                    const [y, mo] = m.split('-').map(Number);
                    const firstDay = `${m}-01`;
                    const lastDay  = fcLastDayOfMonth(y, mo);

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
            // ขั้นตอนที่ 3: บันทึกข้อมูลใหม่
            // ==========================================
            showToast(`กำลังบันทึก ${validData.length} รายการ...`, 'info');

            const CHUNK = 500;
            let ok = 0, fail = 0;
            let insertErrorMsg = '';

            for (let i = 0; i < validData.length; i += CHUNK) {
                const chunk = validData.slice(i, i + CHUNK);
                const { error } = await supabase.from('usage_records_raw').insert(chunk);
                if (error) {
                    fail += chunk.length;
                    insertErrorMsg = error.message;
                    console.error('Insert error:', error);
                } else {
                    ok += chunk.length;
                }
            }

            if (fail > 0) {
                showToast(`❌ Import ล้มเหลว! (สำเร็จ ${ok} / ล้มเหลว ${fail})`, 'err', 8000);
                alert(`คำเตือน: การนำเข้าข้อมูลล้มเหลวบางส่วน!\n\nสาเหตุ: ${insertErrorMsg}\n\nกรุณากด Import ไฟล์เดิมซ้ำอีกครั้งเพื่อให้ข้อมูลสมบูรณ์ (ระบบได้ลบข้อมูลเก่าไปแล้ว)`);
            } else {
                showToast(`Import สำเร็จ ${ok} รายการ`, 'ok');
            }

            const fileInput = document.getElementById('pivot-file-upload');
            if (fileInput) fileInput.value = '';
            loadUsagePivot();

        } catch (err) {
            console.error(err);
            showToast('เกิดข้อผิดพลาด: ' + err.message, 'err');
        }
    };
    reader.readAsArrayBuffer(file);
}

// ==========================================
// 5. Pivot รายปี (Yearly Pivot Mode)
// ==========================================

let yearlyPivotCustomers = []; // เก็บรายชื่อลูกค้าสำหรับโหมดรายปี
let yearlyPivotDataCache = null; // ✅ เก็บข้อมูลดิบไว้โชว์
let yearlyPivotSizesCache = [];  // ✅ เก็บ Size ที่มีทั้งหมด

// ฟังก์ชันสลับโหมด
function switchPivotMode(mode) {
    const btnMonthly = document.getElementById('btn-mode-monthly');
    const btnYearly = document.getElementById('btn-mode-yearly');
    const containerMonthly = document.getElementById('pivot-monthly-container');
    const containerYearly = document.getElementById('pivot-yearly-container');

    if (mode === 'monthly') {
        btnMonthly.classList.add('primary');
        btnYearly.classList.remove('primary');
        containerMonthly.classList.remove('hidden');
        containerYearly.classList.add('hidden');

        // ✅ สลับกลับมารายเดือน → โหลดใหม่
        loadUsagePivot();

    } else {
        btnYearly.classList.add('primary');
        btnMonthly.classList.remove('primary');
        containerYearly.classList.remove('hidden');
        containerMonthly.classList.add('hidden');

        // ✅ โหลดข้อมูลรายปีอัตโนมัติทันทีที่กดแท็บนี้
        initYearlyPivot();
        if (yearlyPivotDataCache) {
            // มี Cache แล้ว → แค่วาดตารางขึ้นมาโชว์
            renderYearlyPivotTable('CA');
        } else {
            // ยังไม่มีข้อมูล → โหลดอัตโนมัติ
            loadYearlyPivot();
        }
    }
}

// ฟังก์ชันเริ่มต้นโหมดรายปี (สร้าง Dropdown ปี และโหลดลูกค้า)
async function initYearlyPivot() {
    const yearSelect = document.getElementById('yearly-pivot-year');
    if (yearSelect && yearSelect.options.length === 0) {
        const currentYear = new Date().getFullYear() + 543; // ปี พ.ศ. ปัจจุบัน
        for (let i = 0; i < 3; i++) {
            const opt = document.createElement('option');
            opt.value = currentYear - i - 543; // เก็บ ค.ศ.
            opt.text = `ปี ${currentYear - i}`;
            yearSelect.appendChild(opt);
        }
    }

    if (yearlyPivotCustomers.length === 0) {
        await loadYearlyCustomers();
    }
}

// โหลดรายชื่อลูกค้าสำหรับ Filter
async function loadYearlyCustomers() {
    try {
        const data = await fetchAllRows(() => supabase.from('usage_records_raw').select('roll_for_customer'));
        const unique = [...new Set((data || []).map(d => (d.roll_for_customer || '').trim()).filter(Boolean))].sort();
        yearlyPivotCustomers = unique;

        const list = document.getElementById('yearlyCustomerList');
        if (!list) return;
        list.innerHTML = unique.map(c => `
            <label class="item" data-customer="${escAttr(c)}">
                <input type="checkbox" value="${escAttr(c)}">
                <span>${escHtml(c)}</span>
            </label>
        `).join('');

        list.querySelectorAll('.item input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', () => {
                cb.closest('.item').classList.toggle('checked', cb.checked);
                updateYearlyCustomerLabel();
            });
        });
    } catch (e) {
        console.warn('load yearly customers error:', e);
    }
}

// จัดการ Dropdown ลูกค้า
function toggleYearlyCustomerDropdown(e) {
    e.stopPropagation();
    const dd = document.getElementById('yearlyCustomerDropdown');
    const btn = document.getElementById('yearlyCustomerFilterBtn');
    dd.classList.toggle('hidden');
    btn.classList.toggle('open');
}

function updateYearlyCustomerLabel() {
    const label = document.getElementById('yearlyCustomerFilterLabel');
    const sel = document.querySelectorAll('#yearlyCustomerList input:checked');
    if (sel.length === 0) label.textContent = 'ลูกค้า: ทั้งหมด';
    else if (sel.length === 1) label.textContent = `ลูกค้า: ${sel[0].value}`;
    else label.textContent = `ลูกค้า: เลือก ${sel.length} ราย`;
}

function selectAllYearlyCustomers() {
    document.querySelectorAll('#yearlyCustomerList input').forEach(cb => {
        cb.checked = true; cb.closest('.item').classList.add('checked');
    });
    updateYearlyCustomerLabel();
}

function clearAllYearlyCustomers() {
    document.querySelectorAll('#yearlyCustomerList input').forEach(cb => {
        cb.checked = false; cb.closest('.item').classList.remove('checked');
    });
    updateYearlyCustomerLabel();
}

// ปิด Dropdown เมื่อคลิกข้างนอก
document.addEventListener('click', (e) => {
    const box = document.getElementById('yearlyCustomerDropdown');
    const btn = document.getElementById('yearlyCustomerFilterBtn');
    if (box && !box.contains(e.target) && btn && !btn.contains(e.target)) {
        box.classList.add('hidden');
        btn.classList.remove('open');
    }
});

// ==========================================
// ฟังก์ชันโหลดและ Render ตาราง Pivot รายปี
// ==========================================
async function loadYearlyPivot() {
    const btn = document.getElementById('btnLoadYearlyPivot');
    if (btn && btn.disabled) return;

    const year = document.getElementById('yearly-pivot-year')?.value; // ค.ศ.
    if (!year) return showToast('กรุณาเลือกปี', 'warn');

    const selectedCustomers = [...document.querySelectorAll('#yearlyCustomerList input:checked')].map(cb => cb.value);

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '⏳ กำลังโหลด...';
    }
    const container = document.getElementById('yearly-pivot-result');
    container.innerHTML = '<div style="text-align:center; padding: 20px; color: var(--primary);">กำลังประมวลผลข้อมูล...</div>';

    try {
        // 1. โหลด Master Data (ถ้ามีอยู่แล้วไม่ต้องโหลดซ้ำ)
        if (!fcState.masterData || fcState.masterData.length === 0) {
            await loadForecastMasterData();
        }

        // 2. ดึงข้อมูล Usage ของปีที่เลือก
        const firstDay = `${year}-01-01`;
        const lastDay = `${year}-12-31`;

        const data = await fetchAllRows(() => {
            let q = supabase
                .from('usage_records_raw')
                .select('grade, width, used_kgs, item_code, usage_date, roll_for_customer')
                .eq('is_valid', true)
                .gte('usage_date', firstDay)
                .lte('usage_date', lastDay);

            if (selectedCustomers.length > 0) {
                q = q.in('roll_for_customer', selectedCustomers);
            }
            return q;
        });

        if (!data || data.length === 0) {
            yearlyPivotDataCache = null;
            yearlyPivotSizesCache = [];
            const tabsContainer = document.getElementById('yearly-grade-tabs-container');
            if (tabsContainer) tabsContainer.classList.add('hidden');
            container.innerHTML = '<div style="text-align:center; padding: 20px; color: var(--orange-dark);">ไม่พบข้อมูล Usage ในปีที่เลือก</div>';
            return;
        }

        // 3. ประมวลผลข้อมูล (จัดกลุ่มตาม Grade -> Size -> Month)
        const pivotData = {};
        const allSizesSet = new Set();

        data.forEach(row => {
            const rowGrade = String(row.grade || '').trim().toUpperCase();
            const rowSize = Number(row.width);
            const rowItemCode = String(row.item_code || '').trim().toUpperCase();
            const monthIndex = new Date(row.usage_date).getMonth(); // 0-11

            // หา Master และคำนวณ Rolls
            const masterItem = findMasterForUsageRow(rowGrade, rowSize, rowItemCode);
            if (!masterItem || !masterItem.std_weight_kg || Number(masterItem.std_weight_kg) <= 0) return;

            const rolls = Number(row.used_kgs) / Number(masterItem.std_weight_kg);

            // สร้าง Key ของ Grade จาก Master (ถ้ามี gram ให้ต่อท้าย)
            const masterGrade = String(masterItem.grade || '').trim().toUpperCase();
            const masterGram = String(masterItem.gram || '').trim();
            const gradeKey = masterGrade.includes(masterGram) ? masterGrade : `${masterGrade}${masterGram}`;

            if (!pivotData[gradeKey]) {
                pivotData[gradeKey] = { data: {} };
                for (let m = 0; m < 12; m++) pivotData[gradeKey].data[m] = {};
            }

            allSizesSet.add(rowSize);

            if (!pivotData[gradeKey].data[monthIndex][rowSize]) {
                pivotData[gradeKey].data[monthIndex][rowSize] = 0;
            }
            pivotData[gradeKey].data[monthIndex][rowSize] += rolls;
        });

        const sortedSizes = Array.from(allSizesSet).sort((a, b) => a - b);
        const sortedGrades = Object.keys(pivotData).sort();

        // 4. ตรวจว่ามีข้อมูลให้คำนวณหรือไม่
        if (sortedGrades.length === 0) {
            yearlyPivotDataCache = null;
            yearlyPivotSizesCache = [];
            const tabsContainer = document.getElementById('yearly-grade-tabs-container');
            if (tabsContainer) tabsContainer.classList.add('hidden');
            container.innerHTML = '<div style="text-align:center; padding: 20px; color: red;">ไม่พบข้อมูลที่สามารถคำนวณได้ (อาจไม่มี Master)</div>';
            return;
        }

        // ✅ เก็บ Cache ไว้สำหรับการกด Tab
        yearlyPivotDataCache = pivotData;
        yearlyPivotSizesCache = sortedSizes;

        // ✅ แสดงปุ่ม Tabs
        const tabsContainer = document.getElementById('yearly-grade-tabs-container');
        if (tabsContainer) tabsContainer.classList.remove('hidden');

        // วาดตารางเริ่มต้น (CA)
        renderYearlyPivotTable('CA');
        showToast(`โหลด Pivot รายปีสำเร็จ`, 'ok');

    } catch (err) {
        console.error(err);
        container.innerHTML = `<div style="text-align:center; padding: 20px; color: red;">เกิดข้อผิดพลาด: ${escHtml(err.message)}</div>`;
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '🔍 โหลดข้อมูล Pivot รายปี';
        }
    }
}

// ==========================================
// 6. Yearly Pivot: Tabs & Render จาก Cache
// ==========================================

// ✅ ฟังก์ชันสำหรับวาดตารางตาม Grade ที่เลือก (ดึงจาก Cache)
function renderYearlyPivotTable(gradeGroup) {
    const container = document.getElementById('yearly-pivot-result');
    if (!container || !yearlyPivotDataCache) return;

    const monthNames = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
    const sortedSizes = yearlyPivotSizesCache;

    // กรองเกรดตามกลุ่มที่เลือก (เช่น CA จะได้ CA085, CA125)
    const filteredGrades = Object.keys(yearlyPivotDataCache)
        .filter(g => {
            if (gradeGroup === 'FSC') return g.includes('F');
            return g.startsWith(gradeGroup) && !g.includes('F'); // ถ้าเป็น CA ก็ไม่เอา CAF
        })
        .sort();

    if (filteredGrades.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding: 20px; color: var(--text-muted);">ไม่พบข้อมูลเกรดกลุ่ม ${escHtml(gradeGroup)} ในปีนี้</div>`;
        return;
    }

    let html = '';
    filteredGrades.forEach(grade => {
        html += `<table class="yearly-pivot-table">
            <thead>
                <tr>
                    <th class="yearly-pivot-header-grade" colspan="${sortedSizes.length + 2}">${escHtml(grade)}</th>
                </tr>
                <tr>
                    <th class="yearly-pivot-month-col">เดือน / Size</th>
                    ${sortedSizes.map(s => `<th>${s}</th>`).join('')}
                    <th class="yearly-pivot-total-col">Total</th>
                </tr>
            </thead>
            <tbody>`;

        for (let m = 0; m < 12; m++) {
            let monthTotal = 0;
            html += `<tr><td class="yearly-pivot-month-col">${monthNames[m]}</td>`;

            sortedSizes.forEach(size => {
                const val = yearlyPivotDataCache[grade].data[m][size] || 0;
                monthTotal += val;
                html += `<td>${val > 0 ? val.toFixed(2) : ''}</td>`;
            });

            html += `<td class="yearly-pivot-total-col">${monthTotal > 0 ? monthTotal.toFixed(2) : ''}</td></tr>`;
        }

        html += `<tr class="yearly-pivot-row-total">
            <td class="yearly-pivot-month-col">Total</td>`;

        let grandTotal = 0;
        sortedSizes.forEach(size => {
            let sizeTotal = 0;
            for (let m = 0; m < 12; m++) {
                sizeTotal += (yearlyPivotDataCache[grade].data[m][size] || 0);
            }
            grandTotal += sizeTotal;
            html += `<td>${sizeTotal > 0 ? sizeTotal.toFixed(2) : ''}</td>`;
        });

        html += `<td class="yearly-pivot-total-col">${grandTotal > 0 ? grandTotal.toFixed(2) : ''}</td></tr>`;
        html += `</tbody></table>`;
    });

    container.innerHTML = html;
}

// ✅ ฟังก์ชันเปลี่ยน Tab
function filterYearlyPivot(gradeGroup, btnElement) {
    // รีเซ็ตสไตล์ปุ่ม
    document.querySelectorAll('#yearly-grade-tabs-container .sub-tab').forEach(btn => {
        btn.classList.remove('active');
        if (btn.id === 'btn-tab-fsc-yearly') {
            btn.style.backgroundColor = '';
            btn.style.color = 'var(--green-dark)';
        }
    });

    if (btnElement) {
        btnElement.classList.add('active');
        if (gradeGroup === 'FSC') {
            btnElement.style.backgroundColor = 'var(--green)';
            btnElement.style.color = '#fff';
        }
    }

    // วาดตารางใหม่
    renderYearlyPivotTable(gradeGroup);
}
