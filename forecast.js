// ==========================================
// forecast.js - Production Forecast & Usage Pivot (FIXED v2)
// ==========================================

const fcState = {
    currentGradeGroup: 'CA',
    masterData: [],
    // pivot state
    pivotData: null,
    pivotWidths: [],
    pivotMonth: '',
    pivotCustomer: 'ALL',
    pivotCustomers: [],  // รายชื่อลูกค้าที่โหลดมา
    pivotGradeFilter: 'ALL',  // แท็บกรองเกรดในหน้า Pivot (กรองเฉพาะตอนแสดงผล)
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

    // default ค่า month inputs (ถ้ายังว่าง)
    const cur = fcCurrentMonthStr();
    ['fc-month', 'fc-m1', 'fc-m2', 'fc-m3', 'fc-prev-month'].forEach(id => {
        const el = document.getElementById(id);
        if (el && !el.value) el.value = cur;
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
    console.log(`✅ โหลด Master Data สำเร็จ: ${rows.length} แถว → ${unique.length} รายการ (หลังลบซ้ำ)`);
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
            tr.dataset.stockLevel = 0; // ถ้ามีตาราง stock_level ให้ดึงมาใส่ตรงนี้

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

    // โหลด Master Data ล่วงหน้าตอนเปิดแท็บ เพื่อให้ตอนกด Load Pivot ใช้ชุดเดิมซ้ำ ไม่ต้องโหลดใหม่ทุกครั้ง
    await loadForecastMasterData();

    // populate dropdown ลูกค้า
    const list = document.getElementById('pivotCustomerList');
    if (!list) return;
    if (fcState.pivotCustomers.length > 0) return;   // โหลดแล้วไม่ต้องซ้ำ

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

// หา master item จากแถว usage (รองรับ gram แบบ 125.0 / 0125 และ grade ที่เก็บรวมหรือแยก)
// ลำดับความแม่นยำ: item_code → GRADE-SIZE → แยก grade/gram/size → grade+size
function findMasterForUsageRow(rowGrade, rowSize, rowItemCode) {
    const master = fcState.masterData;

    // ลบช่องว่างทั้งหมด + ตัวพิมพ์ใหญ่
    const norm = (v) => String(v ?? '').trim().replace(/\s+/g, '').toUpperCase();

    // จัดรูปแกรมให้เทียบกันได้: "125.0" → "125", "085" → "85", ว่าง → ""
    const normGram = (v) => {
        const s = String(v ?? '').trim();
        if (s === '') return '';
        const n = Number(s);
        return isNaN(n) ? s.toUpperCase() : String(n);
    };

    const rCode  = norm(rowItemCode);
    const rGrade = norm(rowGrade);   // เช่น "KK125"
    const rSize  = Number(rowSize);

    // ชั้นที่ 1: ถ้า raw data มี item_code ให้จับคู่ตรงๆ ก่อน (แม่นที่สุด เช่น KA125-44)
    if (rCode) {
        const hit = master.find(m => norm(m.item_code) === rCode);
        if (hit) return hit;
    }

    // ชั้นที่ 2: ประกอบ Grade + Size เป็น item_code (เช่น KA125 + 44 = KA125-44)
    const composed = norm(`${rGrade}-${rSize}`);
    let hit = master.find(m => norm(m.item_code) === composed);
    if (hit) return hit;

    // ชั้นที่ 3: แยก "KK125" เป็น "KK" + "125" แล้วเทียบ Grade, Gram, Size แยกกัน
    const gradeMatch = rGrade.match(/^([A-Z]+)(\d+)$/);
    const baseGrade = gradeMatch ? gradeMatch[1] : rGrade;          // "KK"
    const baseGram  = gradeMatch ? normGram(gradeMatch[2]) : '';    // "125"

    hit = master.find(m => {
        if (Number(m.size) !== rSize) return false;

        const mGrade = norm(m.grade);
        const mGram  = normGram(m.gram);

        // 3.1: Master เก็บ Grade แยก (KK) และ Gram แยก (125)
        if (gradeMatch && mGrade === baseGrade && mGram === baseGram) return true;

        // 3.2: Master เก็บ Grade รวมกันเป็น "KK125" เลย
        if (mGrade === rGrade) return true;

        return false;
    });
    if (hit) return hit;

    // ชั้นที่ 4: Fallback สุดท้าย ลองเทียบ Grade + Size ตรงๆ
    // (เผื่อ raw data ใส่มาแค่ "KK" โดยไม่มีแกรม)
    hit = master.find(m =>
        norm(m.grade) === rGrade && Number(m.size) === rSize
    );

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

// 🛡️ กันกดซ้ำ (Race Condition): ถ้ากำลังโหลดอยู่ ให้หยุดทันที และ disable ปุ่มระหว่างโหลด
// ตัวทำงานจริงอยู่ใน _loadUsagePivotImpl
async function loadUsagePivot() {
    if (fcState._loadingPivot) return;

    const btnLoad = document.querySelector('button[onclick="loadUsagePivot()"]')
                 || document.getElementById('btnLoadPivot');

    // ถ้าปุ่มถูก disable อยู่ (เช่น กำลังโหลดจากทางอื่น) ก็ไม่ต้องทำอะไร
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
        // ปลดล็อคเมื่อโหลดเสร็จ (ไม่ว่าจะสำเร็จหรือ error)
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
        // เผื่อกรณีที่ยังว่าง (เช่น โหลดไม่สำเร็จตอนเปิดแท็บ) ให้ลองโหลดอีกครั้งเดียว
        if (!fcState.masterData || fcState.masterData.length === 0) {
            await loadForecastMasterData();
        }

        // ถ้า Master ยังว่างอยู่ ห้ามคำนวณต่อ เพราะทุกรายการจะขึ้นว่าไม่มีใน Master
        if (!fcState.masterData || fcState.masterData.length === 0) {
            tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;color:red;">ไม่พบข้อมูล Master Data กรุณารีเฟรชหน้าเว็บ</td></tr>`;
            return showToast('ไม่พบ Master Data', 'err');
        }

        const data = await fetchAllRows(() => {
            let q = supabase
                .from('usage_records_raw')
                .select('grade, width, used_kgs, item_code')
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

        (data || []).forEach(row => {
            allWidths.add(row.width);
            if (!pivotData[row.grade]) pivotData[row.grade] = { total: 0 };
            if (!pivotData[row.grade][row.width]) pivotData[row.grade][row.width] = 0;

            const rowGrade    = String(row.grade || '').trim().toUpperCase();
            const rowSize     = Number(row.width);
            const rowItemCode = String(row.item_code || '').trim().toUpperCase();

            const masterItem = findMasterForUsageRow(rowGrade, rowSize, rowItemCode);

            const kgs = Number(row.used_kgs);
            let rolls = null;

            if (!masterItem || !masterItem.std_weight_kg || Number(masterItem.std_weight_kg) <= 0) {
                missingMasterSet.add(rowItemCode || `${rowGrade}-${rowSize}`);
            } else {
                rolls = kgs / Number(masterItem.std_weight_kg);
            }

            if (rolls !== null) {
                pivotData[row.grade][row.width] += rolls;
                pivotData[row.grade].total     += rolls;
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
        // การกรองด้วยแท็บเกรดทำเฉพาะตอนแสดงผลใน renderUsagePivotTable()
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
