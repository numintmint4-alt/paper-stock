// ==========================================
// usage-pivot.js — Usage Pivot & Snapshot (V.2)
// เป็นอิสระจาก forecast.js — ใช้ masterCache จาก app.js
// โหลดหลัง app.js เท่านั้น (ไม่ต้องรอ forecast.js)
// ==========================================

const pivotState = {
    pivotData: null,
    pivotWidths: [],
    pivotMonth: '',
    pivotCustomers: [],
    pivotGradeFilter: 'ALL',
    _loadingPivot: false,
    _savingSnapshot: false,
    // Yearly
    yearlyData: null,
    yearlyYear: null,
    yearlyCustomers: [],
    yearlyGradeFilter: 'CA',
    _loadingYearly: false,
    // Mode: 'monthly' | 'yearly'
    mode: 'monthly'
};

// ==========================================
// 0. Date helpers
// ==========================================
function pivotCurrentMonthStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function pivotLastDayOfMonth(y, mo) {
    const last = new Date(y, mo, 0).getDate();
    return `${y}-${String(mo).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
}

async function getLatestMonthWithData() {
    try {
        const { data, error } = await supabase
            .from('usage_records_raw')
            .select('usage_date')
            .order('usage_date', { ascending: false })
            .limit(1);
        if (error || !data || data.length === 0) return pivotCurrentMonthStr();
        return data[0].usage_date.slice(0, 7);
    } catch (e) {
        return pivotCurrentMonthStr();
    }
}

// ==========================================
// 0.1 Master bridge — ใช้ masterCache จาก app.js โดยตรง
// ==========================================
async function ensureMasterData() {
    // ใช้ masterCache จาก app.js ถ้ามีอยู่แล้ว
    if (typeof masterCache !== 'undefined' && Array.isArray(masterCache) && masterCache.length > 0) {
        return masterCache;
    }
    // ถ้าไม่มี → โหลดเอง
    try {
        const rows = await fetchAllRows(() =>
            supabase.from('paper_specs')
                .select('grade, size, gram, item_code, std_weight_kg')
                .order('item_code', { ascending: true })
        );
        if (typeof masterCache !== 'undefined') masterCache = rows;
        return rows;
    } catch (e) {
        console.warn('ensureMasterData error:', e);
        return [];
    }
}

// ==========================================
// 1. Customer filter helpers
// ==========================================
function filterCustomerList(searchText, mode) {
    const listId = mode === 'yearly' ? 'yearlyCustomerList' : 'pivotCustomerList';
    const list = document.getElementById(listId);
    if (!list) return;
    const text = String(searchText || '').toLowerCase().trim();
    list.querySelectorAll('.item').forEach(item => {
        const span = item.querySelector('span');
        const labelText = span ? span.textContent.toLowerCase() : '';
        item.style.display = labelText.includes(text) ? 'flex' : 'none';
    });
}

function getSelectedPivotCustomers() {
    const list = document.getElementById('pivotCustomerList');
    if (!list) return [];
    return [...list.querySelectorAll('.item input[type="checkbox"]:checked')].map(cb => cb.value);
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

// ==========================================
// 2. Master matching helpers
// ==========================================
function findMasterForUsageRow(rowGrade, rowSize, rowItemCode) {
    const master = (typeof masterCache !== 'undefined' && Array.isArray(masterCache)) ? masterCache : [];
    const clean = (v) => String(v ?? '').replace(/[\s\-_]/g, '').toUpperCase();

    const rCode  = clean(rowItemCode);
    const rGrade = clean(rowGrade);
    const rSize  = Number(rowSize);

    if (rCode) {
        const hit = master.find(m => clean(m.item_code) === rCode);
        if (hit) return hit;
    }

    const composed = `${rGrade}${rSize}`;
    let hit = master.find(m => clean(m.item_code) === composed);
    if (hit) return hit;

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

    hit = master.find(m => clean(m.grade) === rGrade && Number(m.size) === rSize);
    return hit || null;
}

function isFscGrade(grade) {
    return String(grade || '').toUpperCase().includes('F');
}

function pivotGradeMatches(grade, group) {
    const g = String(grade || '').trim().toUpperCase();
    if (!group || group === 'ALL') return true;
    if (group === 'FSC') return isFscGrade(g);
    return g.startsWith(group);
}

// ==========================================
// 3. Mode switching (Monthly / Yearly)
// ==========================================
function switchPivotMode(mode) {
    pivotState.mode = mode;

    const monthlyBtn = document.getElementById('btn-mode-monthly');
    const yearlyBtn  = document.getElementById('btn-mode-yearly');
    const monthlyBox = document.getElementById('pivot-monthly-container');
    const yearlyBox  = document.getElementById('pivot-yearly-container');

    if (mode === 'monthly') {
        monthlyBtn?.classList.add('primary');
        monthlyBtn.style.fontWeight = '700';
        yearlyBtn?.classList.remove('primary');
        yearlyBtn.style.fontWeight = '400';
        monthlyBox?.classList.remove('hidden');
        yearlyBox?.classList.add('hidden');
    } else {
        yearlyBtn?.classList.add('primary');
        yearlyBtn.style.fontWeight = '700';
        monthlyBtn?.classList.remove('primary');
        monthlyBtn.style.fontWeight = '400';
        yearlyBox?.classList.remove('hidden');
        monthlyBox?.classList.add('hidden');

        // Init yearly filters ครั้งแรก
        if (!pivotState.yearlyYear) initYearlyFilter();
    }
}

// ==========================================
// 4. Init Usage Pivot Tab
// ==========================================
async function initUsagePivotTab() {
    // ตั้งเดือน default
    const monthInput = document.getElementById('pivot-month');
    if (monthInput && !monthInput.value) {
        monthInput.value = await getLatestMonthWithData();
    }

    // โหลด customers (ครั้งแรก)
    if (pivotState.pivotCustomers.length === 0) {
        await loadPivotCustomers();
    }

    // Init yearly filter tabs (ถ้ามี)
    initYearlyFilter();

    // โหลด snapshot history
    await renderSnapshotHistory();

    // โหลด pivot monthly
    await loadUsagePivot();
}

async function loadPivotCustomers() {
    const list = document.getElementById('pivotCustomerList');
    if (!list) return;
    list.innerHTML = '<div style="padding:10px;text-align:center;color:#94a3b8;font-size:13px">กำลังโหลด...</div>';

    try {
        const data = await fetchAllRows(() =>
            supabase.from('usage_records_raw').select('customer_code, customer_name')
        );

        const uniqueSet = new Set();
        (data || []).forEach(d => {
            const code = (d.customer_code || '').trim();
            const name = (d.customer_name || '').trim();
            let display = '';
            if (code && name) display = `${code} (${name})`;
            else if (code) display = code;
            else if (name) display = name;
            if (display) uniqueSet.add(display);
        });

        const unique = [...uniqueSet].sort();
        pivotState.pivotCustomers = unique;

        list.innerHTML = unique.map(c => `
            <label class="item" data-customer="${escAttr(c)}">
                <input type="checkbox" value="${escAttr(c)}">
                <span>${escHtml(c)}</span>
            </label>
        `).join('') || '<div style="padding:10px;text-align:center;color:#94a3b8;font-size:13px">ไม่มีข้อมูลลูกค้า</div>';

        list.querySelectorAll('.item input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', () => {
                cb.closest('.item').classList.toggle('checked', cb.checked);
                updatePivotCustomerLabel();
            });
        });
    } catch (e) {
        console.warn('loadPivotCustomers error:', e);
        list.innerHTML = '<div style="padding:10px;text-align:center;color:#dc2626;font-size:13px">โหลดไม่สำเร็จ</div>';
    }
}

// ==========================================
// 5. Render Monthly Pivot Table
// ==========================================
function renderUsagePivotTable() {
    const tbody = document.getElementById('pivot-tbody');
    const thead = document.getElementById('pivot-thead');
    const pivotData = pivotState.pivotData;
    if (!tbody || !thead || !pivotData) return;

    const group  = pivotState.pivotGradeFilter || 'ALL';
    const grades = Object.keys(pivotData)
        .filter(g => pivotGradeMatches(g, group))
        .sort();

    const widths = group === 'ALL'
        ? pivotState.pivotWidths
        : pivotState.pivotWidths.filter(w => grades.some(g => pivotData[g][w] !== undefined));

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
                const tipAttr = val > 0 ? `class="clickable" data-tip="Gradegrams ${escAttr(grade)} · Size ${w}"` : '';
                bodyHtml += `<td ${tipAttr}>${val > 0 ? val.toFixed(2) : ''}</td>`;
            });
            bodyHtml += `<td style="background:#e6f2ff;font-weight:bold;">${row.total > 0 ? row.total.toFixed(2) : '0.00'}</td></tr>`;
        });
    }
    tbody.innerHTML = bodyHtml;
}

function filterPivotByGrade(gradeGroup, btnElement) {
    pivotState.pivotGradeFilter = gradeGroup;

    document.querySelectorAll('#pivot-sub-tabs .sub-tab').forEach(btn => {
        btn.classList.remove('active');
        btn.style.backgroundColor = '';
        if (btn.id === 'btn-tab-fsc') {
            btn.style.color = '#10b981';
            btn.style.borderColor = '#10b981';
        }
    });

    if (btnElement) {
        btnElement.classList.add('active');
        if (gradeGroup === 'FSC') {
            btnElement.style.backgroundColor = '#10b981';
            btnElement.style.color = '#ffffff';
        }
    }

    renderUsagePivotTable();
}

// ==========================================
// 6. Load Monthly Pivot
// ==========================================
async function loadUsagePivot() {
    if (pivotState._loadingPivot) return;
    pivotState._loadingPivot = true;

    const btnLoad = document.querySelector('button[onclick="loadUsagePivot()"]');
    const originalText = btnLoad ? btnLoad.innerHTML : '';
    if (btnLoad) { btnLoad.disabled = true; btnLoad.innerHTML = '⏳ กำลังโหลด...'; }

    try {
        const month = document.getElementById('pivot-month')?.value;
        if (!month) return showToast('กรุณาเลือกเดือน', 'warn');

        const selectedCustomers = getSelectedPivotCustomers();
        const tbody = document.getElementById('pivot-tbody');
        const thead = document.getElementById('pivot-thead');
        if (!tbody || !thead) return;

        tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;">กำลังโหลด...</td></tr>';

        const [y, mo] = month.split('-').map(Number);
        const firstDay = `${month}-01`;
        const lastDay  = pivotLastDayOfMonth(y, mo);

        await ensureMasterData();

        const data = await fetchAllRows(() => {
            let q = supabase
                .from('usage_records_raw')
                .select('grade, width, used_kgs, item_code, usage_date, customer_code, customer_name')
                .eq('is_valid', true)
                .gte('usage_date', firstDay)
                .lte('usage_date', lastDay);

            if (selectedCustomers.length > 0) {
                const codes = selectedCustomers.map(s => s.split(' (')[0].trim());
                q = q.in('customer_code', codes);
            }
            return q;
        });

        const pivot = {};
        const widthSet = new Set();

        (data || []).forEach(r => {
            const m = findMasterForUsageRow(r.grade, r.width, r.item_code);
            const std = Number(m?.std_weight_kg) || 0;
            const usedKg = Number(r.used_kgs) || 0;
            if (!std || !usedKg) return;

            const rolls = usedKg / std;
            const gradeKey = m?.grade
                ? `${m.grade}${m.gram || ''}`
                : String(r.grade || '').trim();
            const widthKey = Number(r.width);
            if (!gradeKey || !widthKey) return;

            widthSet.add(widthKey);
            if (!pivot[gradeKey]) pivot[gradeKey] = { total: 0 };
            pivot[gradeKey][widthKey] = (pivot[gradeKey][widthKey] || 0) + rolls;
            pivot[gradeKey].total += rolls;
        });

        pivotState.pivotData = pivot;
        pivotState.pivotWidths = [...widthSet].sort((a, b) => a - b);
        pivotState.pivotMonth = month;

        renderUsagePivotTable();

        // Update label
        const label = document.getElementById('pivotCurrentMonthLabel');
        if (label) {
            const [yy, mm] = month.split('-').map(Number);
            label.textContent = `ตารางแสดงผลการใช้งานม้วนกระดาษเดือน : ${THAI_MONTHS[mm - 1]} ${yy + 543}`;
        }

        if (!data || data.length === 0) showToast('ไม่พบข้อมูลในช่วงเวลานี้', 'warn');
    } catch (err) {
        console.error('loadUsagePivot error:', err);
        const tbody = document.getElementById('pivot-tbody');
        if (tbody) tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;color:red;">เกิดข้อผิดพลาด: ${escHtml(err.message)}</td></tr>`;
    } finally {
        pivotState._loadingPivot = false;
        if (btnLoad) { btnLoad.disabled = false; btnLoad.innerHTML = originalText || '🔍 โหลดข้อมูล Pivot'; }
    }
}

// ==========================================
// 7. Save Snapshot
// ==========================================
async function saveUsageSnapshot() {
    if (pivotState._savingSnapshot) return;
    pivotState._savingSnapshot = true;

    try {
        const month = pivotState.pivotMonth || document.getElementById('pivot-month')?.value;
        if (!month) return showToast('กรุณาเลือกเดือนก่อนบันทึก snapshot', 'warn');
        if (!pivotState.pivotData || Object.keys(pivotState.pivotData).length === 0) {
            return showToast('ไม่มีข้อมูล Pivot ให้บันทึก', 'warn');
        }

        const selectedCustomers = getSelectedPivotCustomers();
        const customerFilter = selectedCustomers.length === 0 ? 'ALL' : selectedCustomers.join(',');

        const payloads = [];
        Object.keys(pivotState.pivotData).forEach(gradeKey => {
            const row = pivotState.pivotData[gradeKey];
            pivotState.pivotWidths.forEach(w => {
                const val = Number(row[w] || 0);
                if (val <= 0) return;
                payloads.push({
                    snapshot_month: month,
                    grade: gradeKey,
                    width: w,
                    total_rolls: val,
                    customer_filter: customerFilter
                });
            });
        });

        if (payloads.length === 0) return showToast('ไม่มีข้อมูลให้บันทึก', 'warn');

        const { error } = await supabase
            .from('usage_snapshots')
            .upsert(payloads, { onConflict: 'snapshot_month,grade,width,customer_filter' });

        if (error) throw error;

        showToast(`บันทึก Snapshot สำเร็จ (${payloads.length} แถว)`, 'ok');
        await renderSnapshotHistory();
    } catch (err) {
        console.error('saveUsageSnapshot error:', err);
        showToast('บันทึก snapshot ไม่สำเร็จ: ' + err.message, 'err');
    } finally {
        pivotState._savingSnapshot = false;
    }
}

// ==========================================
// 8. Snapshot History
// ==========================================
async function renderSnapshotHistory(yearFilter) {
    const el = document.getElementById('snapshot-history-list');
    if (!el) return;

    el.innerHTML = '<p style="color:#94a3b8;font-size:13px">กำลังโหลด...</p>';

    try {
        const { data, error } = await supabase
            .from('usage_snapshots')
            .select('snapshot_month, customer_filter, created_at')
            .order('snapshot_month', { ascending: false });

        if (error) throw error;

        const seen = new Map();
        (data || []).forEach(r => {
            const k = `${r.snapshot_month}|${r.customer_filter}`;
            if (!seen.has(k)) seen.set(k, r);
        });

        // Populate year filter dropdown
        const yearSelect = document.getElementById('snapshotYearFilter');
        if (yearSelect) {
            const years = [...new Set([...seen.values()].map(r => r.snapshot_month.slice(0, 4)))].sort().reverse();
            const currentVal = yearSelect.value;
            yearSelect.innerHTML = '<option value="">ทั้งหมด</option>' +
                years.map(y => `<option value="${y}">${Number(y) + 543}</option>`).join('');
            if (currentVal) yearSelect.value = currentVal;
        }

        let list = [...seen.values()];
        const yf = yearFilter !== undefined ? yearFilter : (yearSelect?.value || '');
        if (yf) list = list.filter(r => r.snapshot_month.startsWith(yf));
        list = list.slice(0, 20);

        if (list.length === 0) {
            el.innerHTML = '<p style="color:#94a3b8;font-size:13px">ยังไม่มี Snapshot</p>';
            return;
        }

        el.innerHTML = `
            <table style="width:100%;font-size:13px;">
                <thead>
                    <tr><th>เดือน</th><th>Customer Filter</th><th>บันทึกเมื่อ</th></tr>
                </thead>
                <tbody>
                    ${list.map(r => `
                        <tr>
                            <td>${escHtml(r.snapshot_month)}</td>
                            <td>${escHtml(r.customer_filter)}</td>
                            <td>${r.created_at ? new Date(r.created_at).toLocaleString('th-TH') : '-'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    } catch (e) {
        el.innerHTML = `<div class="msg err">โหลดประวัติ Snapshot ไม่สำเร็จ: ${escHtml(e.message)}</div>`;
    }
}

// ==========================================
// 9. YEARLY PIVOT
// ==========================================
function initYearlyFilter() {
    const yearSelect = document.getElementById('yearly-pivot-year');
    if (!yearSelect) return;

    if (!yearSelect.dataset.loaded) {
        const now = new Date();
        const currentYear = now.getFullYear();
        const years = [];
        for (let y = currentYear; y >= currentYear - 5; y--) years.push(y);

        yearSelect.innerHTML = years.map(y =>
            `<option value="${y}">${y + 543}</option>`
        ).join('');
        yearSelect.dataset.loaded = '1';
        pivotState.yearlyYear = currentYear;
    } else {
        pivotState.yearlyYear = Number(yearSelect.value) || new Date().getFullYear();
    }

    // Bind yearly customer filter
    const yearlyList = document.getElementById('yearlyCustomerList');
    if (yearlyList && yearlyList.children.length === 0) {
        loadYearlyCustomers();
    }
}

async function loadYearlyCustomers() {
    const list = document.getElementById('yearlyCustomerList');
    if (!list) return;

    // ถ้ามี pivotCustomers แล้ว → ใช้เลย
    if (pivotState.pivotCustomers.length === 0) {
        await loadPivotCustomers();
    }

    list.innerHTML = pivotState.pivotCustomers.map(c => `
        <label class="item" data-customer="${escAttr(c)}">
            <input type="checkbox" value="${escAttr(c)}">
            <span>${escHtml(c)}</span>
        </label>
    `).join('') || '<div style="padding:10px;text-align:center;color:#94a3b8;font-size:13px">ไม่มีข้อมูลลูกค้า</div>';

    list.querySelectorAll('.item input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', () => {
            cb.closest('.item').classList.toggle('checked', cb.checked);
            updateYearlyCustomerLabel();
        });
    });
}

function toggleYearlyCustomerDropdown(e) {
    e?.stopPropagation();
    const dd = document.getElementById('yearlyCustomerDropdown');
    const btn = document.getElementById('yearlyCustomerFilterBtn');
    if (!dd || !btn) return;
    dd.classList.toggle('hidden');
    btn.classList.toggle('open');
}

function getSelectedYearlyCustomers() {
    const list = document.getElementById('yearlyCustomerList');
    if (!list) return [];
    return [...list.querySelectorAll('.item input[type="checkbox"]:checked')].map(cb => cb.value);
}

function updateYearlyCustomerLabel() {
    const label = document.getElementById('yearlyCustomerFilterLabel');
    if (!label) return;
    const sel = getSelectedYearlyCustomers();
    if (sel.length === 0)      { label.textContent = 'ทั้งหมด'; label.style.color = '#1e293b'; }
    else if (sel.length === 1) { label.textContent = sel[0]; label.style.color = '#1e40af'; }
    else                       { label.textContent = `เลือก ${sel.length} ลูกค้า`; label.style.color = '#1e40af'; }
}

function selectAllYearlyCustomers() {
    document.querySelectorAll('#yearlyCustomerList .item input[type="checkbox"]')
        .forEach(cb => { cb.checked = true; cb.closest('.item').classList.add('checked'); });
    updateYearlyCustomerLabel();
}

function clearAllYearlyCustomers() {
    document.querySelectorAll('#yearlyCustomerList .item input[type="checkbox"]')
        .forEach(cb => { cb.checked = false; cb.closest('.item').classList.remove('checked'); });
    updateYearlyCustomerLabel();
}

document.addEventListener('click', (e) => {
    const box = document.getElementById('yearlyCustomerFilterBox');
    const dd  = document.getElementById('yearlyCustomerDropdown');
    const btn = document.getElementById('yearlyCustomerFilterBtn');
    if (!box || !dd || !btn) return;
    if (!box.contains(e.target)) {
        dd.classList.add('hidden');
        btn.classList.remove('open');
    }
});

async function loadYearlyPivot() {
    if (pivotState._loadingYearly) return;
    pivotState._loadingYearly = true;

    const year = Number(document.getElementById('yearly-pivot-year')?.value) || new Date().getFullYear();
    pivotState.yearlyYear = year;

    const result = document.getElementById('yearly-pivot-result');
    if (result) result.innerHTML = '<p style="text-align:center;color:#94a3b8;padding:30px">กำลังโหลด...</p>';

    try {
        await ensureMasterData();

        const selectedCustomers = getSelectedYearlyCustomers();
        const firstDay = `${year}-01-01`;
        const lastDay  = `${year}-12-31`;

        const data = await fetchAllRows(() => {
            let q = supabase
                .from('usage_records_raw')
                .select('grade, width, used_kgs, item_code, usage_date, customer_code')
                .eq('is_valid', true)
                .gte('usage_date', firstDay)
                .lte('usage_date', lastDay);

            if (selectedCustomers.length > 0) {
                const codes = selectedCustomers.map(s => s.split(' (')[0].trim());
                q = q.in('customer_code', codes);
            }
            return q;
        });

        // pivot: { grade: { month: total, total } }
        const pivot = {};
        const months = new Set();

        (data || []).forEach(r => {
            const m = findMasterForUsageRow(r.grade, r.width, r.item_code);
            const std = Number(m?.std_weight_kg) || 0;
            const usedKg = Number(r.used_kgs) || 0;
            if (!std || !usedKg) return;

            const rolls = usedKg / std;
            const gradeKey = m?.grade ? `${m.grade}${m.gram || ''}` : String(r.grade || '').trim();
            const monthKey = r.usage_date.slice(0, 7);
            if (!gradeKey) return;

            months.add(monthKey);
            if (!pivot[gradeKey]) pivot[gradeKey] = { total: 0 };
            pivot[gradeKey][monthKey] = (pivot[gradeKey][monthKey] || 0) + rolls;
            pivot[gradeKey].total += rolls;
        });

        pivotState.yearlyData = pivot;

        // Show grade tabs
        const tabsContainer = document.getElementById('yearly-grade-tabs-container');
        if (tabsContainer) tabsContainer.classList.remove('hidden');

        renderYearlyPivotTable([...months].sort());

        const title = document.getElementById('yearlyPivotTitle');
        if (title) title.textContent = `ตารางแสดงผลการใช้งานม้วนกระดาษปี : ${year + 543}`;

        if (!data || data.length === 0) showToast('ไม่พบข้อมูลในปีนี้', 'warn');
    } catch (err) {
        console.error('loadYearlyPivot error:', err);
        if (result) result.innerHTML = `<div class="msg err">เกิดข้อผิดพลาด: ${escHtml(err.message)}</div>`;
    } finally {
        pivotState._loadingYearly = false;
    }
}

function renderYearlyPivotTable(months) {
    const result = document.getElementById('yearly-pivot-result');
    if (!result) return;

    const pivot = pivotState.yearlyData || {};
    const group = pivotState.yearlyGradeFilter || 'ALL';

    const grades = Object.keys(pivot)
        .filter(g => pivotGradeMatches(g, group))
        .sort();

    if (grades.length === 0) {
        result.innerHTML = '<p style="text-align:center;color:#94a3b8;padding:30px">ไม่มีข้อมูล</p>';
        return;
    }

    let html = '<table class="data-table"><thead><tr><th>Grade</th>';
    months.forEach(m => {
        const [yy, mm] = m.split('-').map(Number);
        html += `<th>${THAI_MONTHS_SHORT[mm - 1]} ${String(yy).slice(-2)}</th>`;
    });
    html += '<th>Grand Total</th></tr></thead><tbody>';

    grades.forEach(grade => {
        const row = pivot[grade];
        html += `<tr><td><strong>${escHtml(grade)}</strong></td>`;
        months.forEach(m => {
            const val = row[m] || 0;
            html += `<td>${val > 0 ? val.toFixed(2) : ''}</td>`;
        });
        html += `<td style="background:#e6f2ff;font-weight:bold;">${row.total > 0 ? row.total.toFixed(2) : '0.00'}</td></tr>`;
    });

    // Grand total row
    html += '<tr style="background:#f1f5f9;font-weight:bold;"><td>รวมทั้งหมด</td>';
    months.forEach(m => {
        const sum = grades.reduce((s, g) => s + (pivot[g][m] || 0), 0);
        html += `<td>${sum > 0 ? sum.toFixed(2) : ''}</td>`;
    });
    const grandTotal = grades.reduce((s, g) => s + (pivot[g].total || 0), 0);
    html += `<td>${grandTotal.toFixed(2)}</td></tr>`;

    html += '</tbody></table>';
    result.innerHTML = html;
}

function filterYearlyPivot(gradeGroup, btnElement) {
    pivotState.yearlyGradeFilter = gradeGroup;

    document.querySelectorAll('#yearly-grade-tabs-container .sub-tab').forEach(btn => {
        btn.classList.remove('active');
        btn.style.backgroundColor = '';
        if (btn.id === 'btn-tab-fsc-yearly') {
            btn.style.color = '#10b981';
            btn.style.borderColor = '#10b981';
        }
    });

    if (btnElement) {
        btnElement.classList.add('active');
        if (gradeGroup === 'FSC') {
            btnElement.style.backgroundColor = '#10b981';
            btnElement.style.color = '#ffffff';
        }
    }

    // Re-render with existing months
    if (pivotState.yearlyData) {
        const monthsSet = new Set();
        Object.keys(pivotState.yearlyData).forEach(g => {
            Object.keys(pivotState.yearlyData[g]).forEach(k => {
                if (k !== 'total') monthsSet.add(k);
            });
        });
        renderYearlyPivotTable([...monthsSet].sort());
    }
}

// ==========================================
// 10. Handle Usage Import (จาก pivot tab)
// ==========================================
async function handleUsageImport(ev) {
    const f = ev.target.files[0];
    if (!f) return;

    // Delegate ไปที่ importUsage ของ app.js ถ้ามี
    if (typeof importUsage === 'function') {
        // สร้าง fake event wrapper
        const fakeEvent = { target: { files: [f], value: '' }, _origTarget: ev.target };
        try {
            // เรียกใช้ importUsage โดยตรง (FileReader อ่านได้)
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const wb = XLSX.read(e.target.result, { type: 'array' });
                    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
                    showToast(`อ่าน ${rows.length} แถว กำลังบันทึก...`, 'info');

                    // ใช้ logic เดียวกับ app.js importUsage
                    const payload = rows.map(row => ({
                        plant_code:        findColumn(row, USAGE_COLS.plant_code) || '',
                        plant_desc:        findColumn(row, USAGE_COLS.plant_desc) || '',
                        corrugator_no:     findColumn(row, USAGE_COLS.corrugator_no) || '',
                        doc_date:          findColumn(row, USAGE_COLS.doc_date) || '',
                        doc_shift:         findColumn(row, USAGE_COLS.doc_shift) || '',
                        doc_no:            findColumn(row, USAGE_COLS.doc_no) || '',
                        stand:             findColumn(row, USAGE_COLS.stand) || '',
                        isn:               findColumn(row, USAGE_COLS.isn) || '',
                        roll_ssn:          findColumn(row, USAGE_COLS.roll_ssn) || '',
                        grade:             String(findColumn(row, USAGE_COLS.grade) || '').trim(),
                        width:             Number(findColumn(row, USAGE_COLS.width)) || '',
                        quality:           findColumn(row, USAGE_COLS.quality) || '',
                        supplier:          findColumn(row, USAGE_COLS.supplier) || '',
                        dimeter:           findColumn(row, USAGE_COLS.dimeter) ?? '',
                        kgs:               findColumn(row, USAGE_COLS.kgs) ?? '',
                        return_dimeter:    findColumn(row, USAGE_COLS.return_dimeter) ?? '',
                        return_kgs:        findColumn(row, USAGE_COLS.return_kgs) ?? '',
                        used_kgs:          Number(findColumn(row, USAGE_COLS.used_kgs)) || '',
                        roll_for_customer: findColumn(row, USAGE_COLS.roll_for_customer) || '',
                        loc:               findColumn(row, USAGE_COLS.loc) || '',
                        warehouse_no:      findColumn(row, USAGE_COLS.warehouse_no) || '',
                        usage_date:        toISODate(findColumn(row, USAGE_COLS.doc_date)),
                        item_code:         findItemCode(
                                              String(findColumn(row, USAGE_COLS.grade) || '').trim(),
                                              Number(findColumn(row, USAGE_COLS.width))
                                          ) || '',
                        created_by:        currentUser.id
                    }));

                    const CHUNK_SIZE = 500;
                    const batchId = crypto.randomUUID();
                    let sumTotal = 0, sumValid = 0, sumInvalid = 0;

                    for (let i = 0; i < payload.length; i += CHUNK_SIZE) {
                        const chunk = payload.slice(i, i + CHUNK_SIZE);
                        const { data, error } = await supabase.rpc('import_usage_full', {
                            rows: chunk,
                            batch_id: batchId
                        });
                        if (error) throw error;
                        sumTotal   += data.total || 0;
                        sumValid   += data.valid || 0;
                        sumInvalid += data.invalid || 0;
                    }

                    showToast(`✅ นำเข้า ${sumTotal} แถว · ผ่าน ${sumValid} · ไม่ผ่าน ${sumInvalid}`, sumInvalid ? 'warn' : 'ok');
                    await loadUsagePivot();
                } catch (ex) {
                    console.error('handleUsageImport error:', ex);
                    showToast('Import ไม่สำเร็จ: ' + ex.message, 'err');
                }
            };
            reader.readAsArrayBuffer(f);
        } catch (e) {
            showToast('Import ไม่สำเร็จ: ' + e.message, 'err');
        }
    } else {
        showToast('ไม่พบฟังก์ชัน importUsage', 'err');
    }

    ev.target.value = '';
}

// ==========================================
// 11. Exports
// ==========================================
window.initUsagePivotTab = initUsagePivotTab;
window.loadUsagePivot = loadUsagePivot;
window.saveUsageSnapshot = saveUsageSnapshot;
window.switchPivotMode = switchPivotMode;
window.loadYearlyPivot = loadYearlyPivot;
window.filterPivotByGrade = filterPivotByGrade;
window.filterYearlyPivot = filterYearlyPivot;
window.toggleYearlyCustomerDropdown = toggleYearlyCustomerDropdown;
window.selectAllYearlyCustomers = selectAllYearlyCustomers;
window.clearAllYearlyCustomers = clearAllYearlyCustomers;
window.selectAllPivotCustomers = selectAllPivotCustomers;
window.clearAllPivotCustomers = clearAllPivotCustomers;
window.filterCustomerList = filterCustomerList;
window.renderSnapshotHistory = renderSnapshotHistory;
window.handleUsageImport = handleUsageImport;
