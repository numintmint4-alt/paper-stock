// ==========================================
// forecast.js - Production Forecast (v25 - แยก Usage Pivot ออกไปที่ usage-pivot.js)
// ------------------------------------------
// ⚠️ ต้องโหลดไฟล์นี้ "ก่อน" usage-pivot.js เพราะ usage-pivot.js ใช้:
//    fcState, fcCurrentMonthStr, loadForecastMasterData, escHtml, escAttr
// ==========================================

const fcState = {
    currentGradeGroup: 'CA',
    masterData: [],
    masterMap: new Map(),
    // --- ส่วนของ Usage Pivot (ใช้ร่วมกันผ่าน fcState เหมือนเดิม) ---
    pivotData: null,
    pivotWidths: [],
    pivotMonth: '',
    pivotCustomer: 'ALL',
    pivotCustomers: [],
    pivotGradeFilter: 'ALL',
    _loadingPivot: false,
    _savingForecast: false,
    _savingSnapshot: false
};

// ==========================================
// 0. Shared helpers (ใช้ร่วมกับ usage-pivot.js)
// ==========================================
function fcCurrentMonthStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function escHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escAttr(s) { return escHtml(s); }

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

    const getMonthStr = (offset) => {
        const d = new Date();
        d.setMonth(d.getMonth() + offset);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    };

    const defaults = {
        'fc-month': getMonthStr(1),
        'fc-m1': getMonthStr(-1),
        'fc-m2': getMonthStr(-2),
        'fc-m3': getMonthStr(-3),
        'fc-prev-month': getMonthStr(-1)
    };

    Object.keys(defaults).forEach(id => {
        const el = document.getElementById(id);
        if (el && !el.value) el.value = defaults[id];
    });
}

async function loadForecastMasterData() {
    const buildQuery = (cols) => () => supabase
        .from('paper_specs')
        .select(cols)
        .order('item_code', { ascending: true })
        .order('size', { ascending: true });

    let rows = null;
    try {
        rows = await fetchAllRows(buildQuery('grade, size, gram, item_code, std_weight_kg'));
    } catch (err) {
        console.warn('loadForecastMasterData (with gram) error:', err?.message, '→ retry without gram');
        try {
            rows = await fetchAllRows(buildQuery('grade, size, item_code, std_weight_kg'));
        } catch (err2) {
            console.error('loadForecastMasterData error:', err2);
        }
    }

    if (!rows || rows.length === 0) {
        console.warn('⚠️ โหลด Master Data ไม่สำเร็จหรือได้ 0 รายการ');
        return;
    }

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

    fcState.masterMap.clear();
    unique.forEach(m => {
        if (!m.std_weight_kg || Number(m.std_weight_kg) <= 0) return;
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

        const { data: savedForecast } = await supabase
            .from('forecast_data')
            .select('*')
            .eq('month_year', monthYear);

        const prevData = prevMonth
            ? (await supabase.from('forecast_data').select('*').eq('month_year', prevMonth)).data
            : [];

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
