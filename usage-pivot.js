// ==========================================
// usage-pivot.js — Usage Pivot & Snapshot
// ต้องโหลดหลัง app.js + forecast.js
// ==========================================

const pivotState = {
    pivotData: null,
    pivotWidths: [],
    pivotMonth: '',
    pivotCustomer: 'ALL',
    pivotCustomers: [],
    pivotGradeFilter: 'ALL',
    _loadingPivot: false,
    _savingSnapshot: false
};

// ==========================================
// 0. Date helpers (Pivot)
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

        if (error || !data || data.length === 0) {
            return pivotCurrentMonthStr();
        }

        return data[0].usage_date.slice(0, 7);
    } catch (e) {
        console.warn('getLatestMonthWithData error:', e);
        return pivotCurrentMonthStr();
    }
}

// ==========================================
// 0.1 Master data bridge (ใช้ master จาก forecast.js)
// ==========================================
async function ensureMasterData() {
    if (!fcState.masterData || fcState.masterData.length === 0) {
        if (typeof loadForecastMasterData === 'function') {
            await loadForecastMasterData();
        }
    }
    return fcState.masterData || [];
}

// ==========================================
// 1. Customer filter helpers
// ==========================================
function filterCustomerList(searchText, mode) {
    const listId = mode === 'monthly' ? 'pivotCustomerList' : 'yearlyCustomerList';
    const list = document.getElementById(listId);
    if (!list) return;

    const text = String(searchText || '').toLowerCase().trim();
    const items = list.querySelectorAll('.item');

    items.forEach(item => {
        const span = item.querySelector('span');
        const labelText = span ? span.textContent.toLowerCase() : '';
        item.style.display = labelText.includes(text) ? 'flex' : 'none';
    });
}

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
    const master = fcState.masterData || [];
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
// 3. Init Usage Pivot Tab
// ==========================================
async function initUsagePivotTab() {
    const monthInput = document.getElementById('pivot-month');
    if (monthInput && !monthInput.value) {
        const latestMonth = await getLatestMonthWithData();
        monthInput.value = latestMonth;
    }

    await ensureMasterData();

    // โหลดรายชื่อลูกค้า (Code (Name))
    const list = document.getElementById('pivotCustomerList');
    if (list && pivotState.pivotCustomers.length === 0) {
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

    renderSnapshotHistory();

    await loadUsagePivot();
}

// ==========================================
// 4. Render Pivot Table
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
                const tipAttr = val > 0 ? `class="clickable" data-tip="Gradegrams ${grade} · Size ${w}"` : '';
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
        btn.style.color = (btn.id === 'btn-tab-fsc') ? '#10b981' : '';
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
// 5. Load Pivot (with guard)
// ==========================================
async function loadUsagePivot() {
    if (pivotState._loadingPivot) return;

    const btnLoad = document.querySelector('button[onclick="loadUsagePivot()"]')
                 || document.getElementById('btnLoadPivot');

    if (btnLoad && btnLoad.disabled) return;

    pivotState._loadingPivot = true;

    const originalBtnText = btnLoad ? btnLoad.innerHTML : '';
    if (btnLoad) {
        btnLoad.disabled = true;
        btnLoad.innerHTML = '⏳ กำลังโหลด...';
    }

    try {
        await _loadUsagePivotImpl();
    } finally {
        pivotState._loadingPivot = false;
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
    const lastDay  = pivotLastDayOfMonth(y, mo);

    try {
        const masterData = await ensureMasterData();
        if (!masterData || masterData.length === 0) {
            tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;color:red;">ไม่พบข้อมูล Master Data กรุณารีเฟรชหน้าเว็บ</td></tr>`;
            return showToast('ไม่พบ Master Data', 'err');
        }

        const data = await fetchAllRows(() => {
            let q = supabase
                .from('usage_records_raw')
                .select('grade, width, used_kgs, item_code, usage_date, customer_code, customer_name')
                .eq('is_valid', true)
                .gte('usage_date', firstDay)
                .lte('usage_date', lastDay);

            // Customer filter: ถ้าเลือกบางราย → filter แบบ exact match กับ "Code (Name)"
            // หมายเหตุ: เก็บ value เป็น "Code (Name)" ตามที่แสดงใน dropdown
            // ถ้าต้องการ filter ตรง ๆ ที่ column customer_code ให้ปรับ logic ตรงนี้
            if (selectedCustomers.length > 0) {
                // เนื่องจาก dropdown เก็บแบบ "Code (Name)" → map กลับเป็น code
                const codes = selectedCustomers.map(s => s.split(' (')[0].trim());
                q = q.in('customer_code', codes);
            }

            return q;
        });

        // คำนวณ pivot: { grade: { width: totalRolls, total } }
        const pivot = {};
        const widthSet = new Set();

        (data || []).forEach(r => {
            const m = findMasterForUsageRow(r.grade, r.width, r.item_code);
            const std = Number(m?.std_weight_kg) || 0;
            const usedKg = Number(r.used_kgs) || 0;
            if (!std || !usedKg) return;

            const rolls = usedKg / std;

            // key grade = gradegram ของ master (เช่น CA125)
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

        if (!data || data.length === 0) {
            showToast('ไม่พบข้อมูลในช่วงเวลานี้', 'warn');
        }
    } catch (err) {
        console.error('loadUsagePivot error:', err);
        tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;color:red;">เกิดข้อผิดพลาด: ${escHtml(err.message)}</td></tr>`;
    }
}

// ==========================================
// 6. Snapshot (บันทึก pivot ลง usage_snapshots)
// ==========================================
async function saveUsageSnapshot() {
    if (pivotState._savingSnapshot) return;
    pivotState._savingSnapshot = true;

    try {
        const month = pivotState.pivotMonth
            || document.getElementById('pivot-month')?.value;
        if (!month) return showToast('กรุณาเลือกเดือนก่อนบันทึก snapshot', 'warn');

        if (!pivotState.pivotData || Object.keys(pivotState.pivotData).length === 0) {
            return showToast('ไม่มีข้อมูล Pivot ให้บันทึก', 'warn');
        }

        const selectedCustomers = getSelectedPivotCustomers();
        const customerFilter = selectedCustomers.length === 0
            ? 'ALL'
            : selectedCustomers.join(',');

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

        if (payloads.length === 0) {
            return showToast('ไม่มีข้อมูลให้บันทึก', 'warn');
        }

        const { error } = await supabase
            .from('usage_snapshots')
            .upsert(payloads, { onConflict: 'snapshot_month,grade,width,customer_filter' });

        if (error) {
            console.error('saveUsageSnapshot error:', error);
            showToast('บันทึก snapshot ไม่สำเร็จ: ' + error.message, 'err');
        } else {
            showToast(`บันทึก Snapshot สำเร็จ (${payloads.length} แถว)`, 'ok');
            await renderSnapshotHistory();
        }
    } finally {
        pivotState._savingSnapshot = false;
    }
}

async function renderSnapshotHistory() {
    const el = document.getElementById('snapshot-history');
    if (!el) return;

    el.innerHTML = '<p style="color:#94a3b8;font-size:13px">กำลังโหลด...</p>';

    try {
        const { data, error } = await supabase
            .from('usage_snapshots')
            .select('snapshot_month, customer_filter, created_at')
            .order('snapshot_month', { ascending: false });

        if (error) throw error;

        // dedupe by (month, filter)
        const seen = new Map();
        (data || []).forEach(r => {
            const k = `${r.snapshot_month}|${r.customer_filter}`;
            if (!seen.has(k)) seen.set(k, r);
        });

        const list = [...seen.values()].slice(0, 20);
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
// 7. Exports (สำหรับ reference)
// ==========================================
// ฟังก์ชันที่ app.js tab router จะเรียก:
//   - initUsagePivotTab()
//   - loadUsagePivot()
//   - filterPivotByGrade()
//   - saveUsageSnapshot()
//   - renderSnapshotHistory()
