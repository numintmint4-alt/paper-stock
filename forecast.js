// ==========================================
// forecast.js - Production Forecast & Usage Pivot (FIXED v11)
// ==========================================

const fcState = {
    currentGradeGroup: 'CA',
    masterData: [],
    masterMap: new Map(),
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
// 0. Date helpers
// ==========================================
function fcCurrentMonthStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

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
        // ✅ ลบเลข 5000 ออก — ใช้ default 1000 วนลูปเอง
        rows = await fetchAllRows(buildQuery('grade, size, gram, item_code, std_weight_kg'));
    } catch (err) {
        console.warn('loadForecastMasterData (with gram) error:', err?.message, '→ retry without gram');
        try {
            // ✅ ลบเลข 5000 ออก
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
