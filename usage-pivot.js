// ==========================================
// usage-pivot.js - Roll Paper Usage
// Pivot รายเดือน / รายปี / Snapshot / Import / Drill-down
// Standalone: ไม่พึ่งพา forecast.js
//
// พึ่งพาจาก app.js:
// supabase, fetchAllRows, showToast, normalizeGrade,
// toISODate, currentUser, currentProfile
//
// พึ่งพา XLSX สำหรับ Import Excel
// ==========================================

// State เฉพาะของ Roll Paper Usage
const usagePivotState = {
    masterData: [],
    pivotData: null,
    pivotWidths: [],
    pivotMonth: '',
    pivotCustomer: 'ALL',
    pivotCustomers: [],
    pivotGradeFilter: 'ALL',
    _loadingPivot: false,
    _savingSnapshot: false
};

// เดือนปัจจุบัน
function usageCurrentMonthStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Escape HTML เฉพาะใน Usage Pivot
function usageEscHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c =>
        ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[c])
    );
}

function usageEscAttr(s) {
    return usageEscHtml(s);
}

// โหลด Master Data สำหรับคำนวณจำนวน Rolls
async function loadUsageMasterData() {
    const buildQuery = (cols) => () => supabase
        .from('paper_specs')
        .select(cols)
        .order('item_code', { ascending: true })
        .order('size', { ascending: true });

    let rows = null;

    try {
        rows = await fetchAllRows(
            buildQuery('grade, size, gram, item_code, std_weight_kg')
        );
    } catch (err) {
        console.warn(
            'loadUsageMasterData (with gram) error:',
            err?.message,
            '→ retry without gram'
        );

        try {
            rows = await fetchAllRows(
                buildQuery('grade, size, item_code, std_weight_kg')
            );
        } catch (err2) {
            console.error('loadUsageMasterData error:', err2);
        }
    }

    if (!rows || rows.length === 0) {
        console.warn('ไม่พบ Master Data จาก paper_specs');
        showToast('ไม่พบข้อมูล Master Data', 'err');
        return;
    }

    const seen = new Map();
    const unique = [];
    const conflicts = new Set();

    for (const item of rows) {
        const key = (
            item.item_code
                ? String(item.item_code)
                : `${item.grade || ''}|${item.gram || ''}|${item.size || ''}`
        ).toUpperCase().replace(/\s+/g, '');

        const exist = seen.get(key);

        if (!exist) {
            seen.set(key, item);
            unique.push(item);
        } else if (
            Number(exist.std_weight_kg) !== Number(item.std_weight_kg)
        ) {
            conflicts.add(item.item_code || `${item.grade}-${item.size}`);
        }
    }

    if (conflicts.size > 0) {
        const list = Array.from(conflicts).slice(0, 5).join(', ');

        console.warn(
            'paper_specs มีรายการซ้ำที่ std_weight_kg ไม่เท่ากัน:',
            Array.from(conflicts)
        );

        showToast(
            `Master มีรายการซ้ำที่น้ำหนักไม่เท่ากัน เช่น ${list}`,
            'warn',
            6000
        );
    }

    usagePivotState.masterData = unique;

    console.log(
        `โหลด Usage Master Data สำเร็จ: ${rows.length} แถว → ${unique.length} รายการ`
    );
}

// ==========================================
// 0. Date helpers
// ==========================================
function usageLastDayOfMonth(y, mo) {
    const last = new Date(y, mo, 0).getDate();
    return `${y}-${String(mo).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
}

// ฟังก์ชันหาเดือนล่าสุดที่มีข้อมูลใน Database
async function getLatestMonthWithData() {
    try {
        const { data, error } = await supabase
            .from('usage_records_raw')
            .select('usage_date')
            .order('usage_date', { ascending: false })
            .limit(1);

        if (error || !data || data.length === 0) {
            return usageCurrentMonthStr();
        }

        return data[0].usage_date.slice(0, 7);
    } catch (e) {
        console.warn('getLatestMonthWithData error:', e);
        return usageCurrentMonthStr();
    }
}

// ฟังก์ชันค้นหาลูกค้าใน Dropdown (ดึงจาก span เพื่อความแม่นยำ)
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

// ==========================================
// 2. Usage Pivot & Snapshot
// ==========================================

async function initUsagePivotTab() {
    const monthInput = document.getElementById('pivot-month');
    if (monthInput && !monthInput.value) {
        const latestMonth = await getLatestMonthWithData();
        monthInput.value = latestMonth;
    }

    await loadUsageMasterData();

    // ✅ โหลดตารางทันที (ไม่รอรายชื่อลูกค้าที่ดึงทั้งตารางจึงช้า) — รายชื่อลูกค้าโหลดคู่ขนานด้านล่าง
    renderSnapshotHistory();
    const _pivotFirstLoad = loadUsagePivot();

    // แสดงรายชื่อลูกค้าในหน้ารายเดือนเป็น Code (Name)
    const list = document.getElementById('pivotCustomerList');
    if (list && usagePivotState.pivotCustomers.length === 0) {
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
            usagePivotState.pivotCustomers = unique;

            list.innerHTML = unique.map(c => `
                <label class="item" data-customer="${usageEscAttr(c)}">
                    <input type="checkbox" value="${usageEscAttr(c)}">
                    <span>${usageEscHtml(c)}</span>
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

    await _pivotFirstLoad;
}

// ===== helpers: Customer dropdown (monthly) =====
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

function findMasterForUsageRow(rowGrade, rowSize, rowItemCode) {
    const master = usagePivotState.masterData;
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

function renderUsagePivotTable() {
    const tbody = document.getElementById('pivot-tbody');
    const thead = document.getElementById('pivot-thead');
    const pivotData = usagePivotState.pivotData;
    if (!tbody || !thead || !pivotData) return;

    const group  = usagePivotState.pivotGradeFilter || 'ALL';
    const grades = Object.keys(pivotData)
        .filter(g => pivotGradeMatches(g, group))
        .sort();

    const widths = group === 'ALL'
        ? usagePivotState.pivotWidths
        : usagePivotState.pivotWidths.filter(w => grades.some(g => pivotData[g][w] !== undefined));

    let headerHtml = '<tr><th>Grade</th>';
    widths.forEach(w => headerHtml += `<th>${usageEscHtml(w)}</th>`);
    headerHtml += '<th>Grand Total</th></tr>';
    thead.innerHTML = headerHtml;

    let bodyHtml = '';
    if (grades.length === 0) {
        const msg = Object.keys(pivotData).length === 0
            ? 'ไม่มีข้อมูลในเดือนนี้'
            : `ไม่มีข้อมูลเกรดกลุ่ม ${usageEscHtml(group)} ในเดือนนี้`;
        bodyHtml = `<tr><td colspan="${widths.length + 2}" style="text-align:center;">${msg}</td></tr>`;
    } else {
        grades.forEach(grade => {
            const row = pivotData[grade];
            bodyHtml += `<tr><td><strong>${usageEscHtml(grade)}</strong></td>`;
            widths.forEach(w => {
                const val = row[w] || 0;
                const tipAttr = val > 0 ? `class="clickable" data-tip="Gradegrams ${usageEscAttr(grade)} · Size ${usageEscAttr(w)}"` : '';
                bodyHtml += `<td ${tipAttr}>${val > 0 ? val.toFixed(2) : ''}</td>`;
            });
            bodyHtml += `<td style="background:#e6f2ff;font-weight:bold;">${row.total > 0 ? row.total.toFixed(2) : '0.00'}</td></tr>`;
        });
    }
    tbody.innerHTML = bodyHtml;
}

function filterPivotByGrade(gradeGroup, btnElement) {
    usagePivotState.pivotGradeFilter = gradeGroup;

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

async function loadUsagePivot() {
    if (usagePivotState._loadingPivot) return;

    const btnLoad = document.querySelector('button[onclick="loadUsagePivot()"]')
                 || document.getElementById('btnLoadPivot');

    if (btnLoad && btnLoad.disabled) return;

    usagePivotState._loadingPivot = true;

    const originalBtnText = btnLoad ? btnLoad.innerHTML : '';
    if (btnLoad) {
        btnLoad.disabled = true;
        btnLoad.innerHTML = '⏳ กำลังโหลด...';
    }

    try {
        await _loadUsagePivotImpl();
    } finally {
        usagePivotState._loadingPivot = false;
        if (btnLoad) {
            btnLoad.disabled = false;
            btnLoad.innerHTML = originalBtnText || '🔍 โหลดข้อมูล Pivot';
        }
    }
}

// ดึงจาก Raw Data (คำนวณสด)
async function _loadUsagePivotImpl() {
    const month = document.getElementById('pivot-month')?.value;
    if (!month) return showToast('กรุณาเลือกเดือน', 'warn');

    const selectedCustomers = getSelectedPivotCustomers();
    const tbody = document.getElementById('pivot-tbody');
    const thead = document.getElementById('pivot-thead');

    if (!tbody || !thead) return;

    if (typeof softLoad === 'function' && tbody.rows.length) softLoad(tbody.closest('table') || tbody, ''); else tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;">กำลังโหลด...</td></tr>';

    const [y, mo] = month.split('-').map(Number);
    const firstDay = `${month}-01`;
    const lastDay  = usageLastDayOfMonth(y, mo);

    try {
        if (!usagePivotState.masterData || usagePivotState.masterData.length === 0) {
            await loadUsageMasterData();
        }

        if (!usagePivotState.masterData || usagePivotState.masterData.length === 0) {
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

            if (selectedCustomers.length > 0) {
                // ดึงแค่ Code ออกมา เช่น "01ABB (บริษัท...)" -> "01ABB"
                const codes = selectedCustomers.map(c => {
                    const match = c.match(/^([^\(]+)/);
                    return match ? match[1].trim() : c;
                });
                q = q.in('customer_code', codes);
            }
            return q;
        });

        const pivotData = {};
        const allWidths = new Set();
        const missingMasterSet = new Set();

        (data || []).forEach(row => {
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

        const historyHeader = document.querySelector('#tab-usage-pivot h3');
        const alertBox = document.getElementById('pivot-missing-alert');

        if (historyHeader) {
            if (missingMasterSet.size > 0) {
                const missingList = Array.from(missingMasterSet).sort().map(usageEscHtml).join(', ');
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

        usagePivotState.pivotData     = pivotData;
        usagePivotState.pivotWidths   = Array.from(allWidths).sort((a, b) => a - b);
        usagePivotState.pivotMonth    = month;
        usagePivotState.pivotCustomer = selectedCustomers.length === 0 ? 'ALL' : selectedCustomers.join(',');

        renderUsagePivotTable();

        // อัปเดตข้อความหัวข้อบอกเดือน
        const monthLabel = document.getElementById('pivotCurrentMonthLabel');
        if (monthLabel) {
            const [yyyy, mm] = month.split('-');
            const thaiMonths = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
            const thaiYear = Number(yyyy) + 543;
            monthLabel.innerHTML = `ตารางแสดงผลการใช้งานม้วนกระดาษเดือน : <span style="color: var(--primary);">${thaiMonths[Number(mm) - 1]} ${thaiYear}</span>`;
        }

        if (missingMasterSet.size === 0) {
            showToast(`โหลด Pivot สำเร็จ (${Object.keys(pivotData).length} grade)`, 'ok');
        } else {
            showToast(`โหลด Pivot แล้ว แต่มี ${missingMasterSet.size} รายการที่ไม่มีใน Master`, 'warn');
        }

    } catch (err) {
        console.error(err);
        tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;color:red;">Error: ${usageEscHtml(err.message)}</td></tr>`;
        showToast('Error loading pivot', 'err');
    }
}

async function saveUsageSnapshot() {
    if (usagePivotState._savingSnapshot) return;
    usagePivotState._savingSnapshot = true;
    try {
        await _saveUsageSnapshotImpl();
    } finally {
        usagePivotState._savingSnapshot = false;
    }
}

// ดึงเดือนจาก input จริง (ไม่ใช้ usagePivotState.pivotMonth ที่อาจค้าง)
async function _saveUsageSnapshotImpl() {
    const month = document.getElementById('pivot-month')?.value;
    if (!month) return showToast('กรุณาเลือกเดือนก่อนบันทึก', 'warn');

    if (!usagePivotState.pivotData) {
        return showToast('กรุณากดโหลดข้อมูล Pivot ก่อนบันทึก', 'warn');
    }

    const selectedCustomers = getSelectedPivotCustomers();
    let customerFilter = 'ALL';

    if (selectedCustomers.length === 1) {
        customerFilter = selectedCustomers[0];
    } else if (selectedCustomers.length > 1) {
        const isGeneral = confirm(`คุณเลือก ${selectedCustomers.length} ลูกค้า\n\nต้องการบันทึกเป็นยอดรวมของ "ลูกค้าทั่วไป" ใช่หรือไม่?`);

        if (isGeneral) {
            customerFilter = 'ลูกค้าทั่วไป';
        } else {
            let groupName = prompt('กรุณากรอกชื่อกลุ่ม (ภาษาอังกฤษหรือตัวเลข 5 ตัวอักษร):');
            if (!groupName) return showToast('ยกเลิกการบันทึก', 'warn');

            const regex = /^[A-Z0-9]{5}$/;
            if (!regex.test(groupName)) {
                return showToast('❌ ชื่อกลุ่มต้องเป็นภาษาอังกฤษหรือตัวเลข 5 ตัวอักษรเท่านั้น', 'err', 5000);
            }
            customerFilter = groupName;
        }
    } else {
        customerFilter = 'ALL';
    }

    let createdBy = 'Unknown';
    if (typeof currentProfile !== 'undefined' && currentProfile && currentProfile.full_name) {
        createdBy = currentProfile.full_name;
    } else if (typeof currentUser !== 'undefined' && currentUser && currentUser.email) {
        createdBy = currentUser.email;
    }

    const pivotData = usagePivotState.pivotData;
    const payloads = [];

    Object.keys(pivotData).forEach(grade => {
        const row = pivotData[grade];
        usagePivotState.pivotWidths.forEach(width => {
            const rolls = row[width] || 0;
            if (rolls > 0) {
                payloads.push({
                    snapshot_month: month,
                    customer_filter: customerFilter,
                    grade: grade,
                    width: Number(width),
                    total_rolls: rolls,
                    created_by: createdBy
                });
            }
        });
    });

    if (payloads.length === 0) return showToast('ไม่มีข้อมูลให้บันทึก Snapshot', 'warn');

    showToast(`กำลังบันทึก Snapshot เดือน ${month}...`, 'info');

    const { error: delErr } = await supabase.from('usage_snapshots')
        .delete()
        .eq('snapshot_month', month)
        .eq('customer_filter', customerFilter);

    if (delErr) {
        console.warn('ไม่สามารถลบ Snapshot เก่าได้:', delErr.message);
    }

    const { error } = await supabase.from('usage_snapshots').insert(payloads);

    if (error) {
        console.error(error);
        showToast('บันทึก Snapshot ไม่สำเร็จ: ' + error.message, 'err');
    } else {
        showToast(`บันทึก Snapshot เดือน ${month} สำเร็จ (${payloads.length} รายการ)`, 'ok');
        document.getElementById('pivot-stale-notice')?.remove();
        renderSnapshotHistory();
    }
}

// ==========================================
// 2.1 Snapshot History (มี Dropdown เลือกปี + ปุ่มยกเลิก + RPC fallback)
// ==========================================
async function renderSnapshotHistory(selectedYear = null) {
    const wrap = document.getElementById('snapshot-history-list');
    const yearSelect = document.getElementById('snapshotYearFilter');
    if (!wrap) return;

    if (yearSelect && yearSelect.options.length === 0) {
        const currentYear = new Date().getFullYear();
        for (let i = 0; i < 5; i++) {
            const y = currentYear - i;
            const opt = document.createElement('option');
            opt.value = y;
            opt.text = `ปี ${y + 543} (${y})`;
            yearSelect.appendChild(opt);
        }
        yearSelect.value = currentYear;
    }

    const yearToFetch = selectedYear || (yearSelect ? yearSelect.value : new Date().getFullYear());
    if (!yearToFetch) return;

    wrap.innerHTML = '<div style="text-align:center; padding: 10px; color: var(--text-muted);">กำลังโหลดประวัติ...</div>';

    try {
        let data = null;

        try {
            const rpcResult = await supabase.rpc('get_snapshot_history_summary', { p_year: String(yearToFetch) });
            if (rpcResult.error) throw rpcResult.error;
            data = rpcResult.data;
        } catch (e) {
            console.warn('RPC get_snapshot_history_summary ใช้ไม่ได้ → fallback:', e.message);
        }

        if (!data) {
            const yearPrefix = `${yearToFetch}-`;
            const { data: rawData, error: rawErr } = await supabase
                .from('usage_snapshots')
                .select('snapshot_month, customer_filter, total_rolls, created_by')
                .gte('snapshot_month', `${yearPrefix}01`)
                .lte('snapshot_month', `${yearPrefix}12`)
                .order('snapshot_month', { ascending: false });

            if (rawErr) throw rawErr;

            const groups = new Map();
            (rawData || []).forEach(row => {
                const key = `${row.snapshot_month}__${row.customer_filter}`;
                if (!groups.has(key)) {
                    groups.set(key, {
                        snapshot_month: row.snapshot_month,
                        customer_filter: row.customer_filter,
                        item_count: 0,
                        total_rolls: 0,
                        created_by: row.created_by || null,
                        created_at: null
                    });
                }
                const g = groups.get(key);
                g.item_count += 1;
                g.total_rolls += Number(row.total_rolls || 0);
                if (!g.created_by && row.created_by) g.created_by = row.created_by;
            });

            data = Array.from(groups.values());
        }

        if (!data || data.length === 0) {
            wrap.innerHTML = `<div style="text-align:center; padding: 20px; color: var(--text-muted);">ไม่พบประวัติการบันทึกในปี ${Number(yearToFetch)+543}</div>`;
            return;
        }

        let html = `<table class="data-table" style="width:100%">
            <thead>
                <tr>
                    <th>เดือน</th>
                    <th>ลูกค้า</th>
                    <th style="text-align:right">จำนวนรายการ</th>
                    <th style="text-align:right">รวม Rolls</th>
                    <th>บันทึกโดย</th>
                    <th style="text-align:center; width:150px;">จัดการ</th>
                </tr>
            </thead>
            <tbody>`;

        data.forEach(g => {
            const cfLabel = g.customer_filter === 'ALL'
                ? '<span style="color:#1e40af;font-weight:600;">ALL</span>'
                : usageEscHtml(g.customer_filter);

            const dateStr = g.created_at ? new Date(g.created_at).toLocaleString('th-TH') : '';

            html += `<tr>
                <td><strong>${usageEscHtml(g.snapshot_month)}</strong></td>
                <td>${cfLabel}</td>
                <td style="text-align:right">${g.item_count}</td>
                <td style="text-align:right;font-weight:600;">${Number(g.total_rolls).toFixed(2)}</td>
                <td style="font-size:12px; color:#64748b;">${usageEscHtml(g.created_by || '-')}${dateStr ? `<br><span style="font-size:10px;">${dateStr}</span>` : ''}</td>
                <td style="text-align:center; white-space:nowrap;">
                    <button type="button" class="btn-view-snapshot"
                        data-month="${usageEscAttr(g.snapshot_month)}"
                        data-customer="${usageEscAttr(g.customer_filter)}"
                        style="padding:4px 10px;border-radius:6px;border:1px solid #cbd5e1;background:#f8fafc;cursor:pointer;margin-right:4px;">
                        👁 ดู
                    </button>
                    <button type="button" class="btn-delete-snapshot"
                        data-month="${usageEscAttr(g.snapshot_month)}"
                        data-customer="${usageEscAttr(g.customer_filter)}"
                        style="padding:4px 10px;border-radius:6px;border:1px solid #fca5a5;background:#fee2e2;color:#dc2626;cursor:pointer;">
                        ❌ ยกเลิก
                    </button>
                </td>
            </tr>`;
        });

        html += `</tbody></table>`;
        wrap.innerHTML = html;

        wrap.querySelectorAll('.btn-view-snapshot').forEach(btn => {
            btn.addEventListener('click', () => {
                viewSnapshotDetail(btn.dataset.month, btn.dataset.customer);
            });
        });

        wrap.querySelectorAll('.btn-delete-snapshot').forEach(btn => {
            btn.addEventListener('click', async () => {
                const month = btn.dataset.month;
                const customer = btn.dataset.customer;
                const confirmDelete = confirm(`⚠️ ต้องการยกเลิก (ลบ) Snapshot ของเดือน ${month} / ${customer} ใช่หรือไม่?`);

                if (confirmDelete) {
                    btn.disabled = true;
                    btn.textContent = '⏳...';
                    const { error } = await supabase.from('usage_snapshots')
                        .delete()
                        .eq('snapshot_month', month)
                        .eq('customer_filter', customer);

                    if (error) {
                        showToast('ลบไม่สำเร็จ: ' + error.message, 'err');
                        btn.disabled = false;
                        btn.textContent = '❌ ยกเลิก';
                    } else {
                        showToast('ลบ Snapshot สำเร็จ', 'ok');
                        renderSnapshotHistory(selectedYear);
                    }
                }
            });
        });

    } catch (err) {
        console.error('renderSnapshotHistory error:', err);
        wrap.innerHTML = `<div style="text-align:center; padding: 20px; color: red;">โหลดประวัติไม่สำเร็จ: ${usageEscHtml(err.message)}</div>`;
    }
}

async function viewSnapshotDetail(month, customer) {
    const modalBody = document.getElementById('snapshotViewBody');
    const modalTitle = document.getElementById('snapshotViewTitle');
    if (!modalBody) return;

    if (modalTitle) modalTitle.textContent = `รายละเอียด Snapshot — ${month} / ${customer}`;
    modalBody.innerHTML = '<div style="text-align:center; padding: 20px;">กำลังโหลด...</div>';

    const modal = document.getElementById('modalSnapshot');
    if (modal) modal.classList.add('show');

    try {
        const { data, error } = await supabase
            .from('usage_snapshots')
            .select('grade, width, total_rolls')
            .eq('snapshot_month', month)
            .eq('customer_filter', customer)
            .order('grade', { ascending: true })
            .order('width', { ascending: true });

        if (error) throw error;

        if (!data || data.length === 0) {
            modalBody.innerHTML = '<div style="text-align:center; padding: 20px;">ไม่พบข้อมูล</div>';
            return;
        }

        const grades = [];
        const widths = new Set();
        const map = new Map();

        data.forEach(row => {
            const g = row.grade;
            const w = Number(row.width);
            widths.add(w);
            if (!map.has(g)) { map.set(g, {}); grades.push(g); }
            map.get(g)[w] = (map.get(g)[w] || 0) + Number(row.total_rolls);
        });

        const sortedWidths = Array.from(widths).sort((a, b) => a - b);
        grades.sort();

        let html = '<table class="data-table" style="width:100%"><thead><tr><th>Grade</th>';
        sortedWidths.forEach(w => html += `<th style="text-align:right">${w}</th>`);
        html += '<th style="text-align:right">Total</th></tr></thead><tbody>';

        grades.forEach(g => {
            let total = 0;
            html += `<tr><td><strong>${usageEscHtml(g)}</strong></td>`;
            sortedWidths.forEach(w => {
                const v = map.get(g)[w] || 0;
                total += v;
                html += `<td style="text-align:right">${v > 0 ? v.toFixed(2) : ''}</td>`;
            });
            html += `<td style="text-align:right;font-weight:700;">${total.toFixed(2)}</td></tr>`;
        });

        html += '</tbody></table>';
        modalBody.innerHTML = html;

    } catch (err) {
        console.error('viewSnapshotDetail error:', err);
        modalBody.innerHTML = `<div style="text-align:center; padding: 20px; color: red;">${usageEscHtml(err.message)}</div>`;
    }
}

// ==========================================
// แจ้งเตือนหลัง Import: ผลสรุปรายปี/Forecast ยังเป็นค่าเดิมจนกว่าจะกด "บันทึก"
// ==========================================
function showSnapshotStaleNotice(months) {
    try {
        const old = document.getElementById('pivot-stale-notice');
        if (old) old.remove();

        const monthText = (months || []).map(m => (typeof thaiMonthShort === 'function' ? thaiMonthShort(m) : m)).join(', ');
        const html = `<div id="pivot-stale-notice" class="msg warn" style="margin:10px 0;border-left:4px solid #f59e0b;display:flex;gap:10px;align-items:flex-start;justify-content:space-between">
            <div>⚠️ <b>Import เดือน ${usageEscHtml(monthText)} สำเร็จแล้ว</b><br>
            ผลสรุปรายปีและ Forecast ยังเป็นค่าเดิม — กด <b>โหลดข้อมูล Pivot</b> แล้วกด <b>บันทึก</b> เพื่ออัปเดต
            (ทำซ้ำทุกชุดลูกค้าที่เคยบันทึก เช่น ALL และ "ลูกค้าทั่วไป")</div>
            <button type="button" onclick="document.getElementById('pivot-stale-notice')?.remove()" style="flex:none">ปิด</button>
        </div>`;

        const host = document.getElementById('pivot-monthly-container') || document.getElementById('tab-usage-pivot');
        if (host) host.insertAdjacentHTML('afterbegin', html);

        showToast('Import แล้ว — ผลสรุปรายปีและ Forecast ยังเป็นค่าเดิม กด โหลดข้อมูล Pivot แล้ว บันทึก เพื่ออัปเดต', 'warn', 10000);
    } catch (e) {
        console.warn('showSnapshotStaleNotice:', e);
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

            if (!usagePivotState.masterData || usagePivotState.masterData.length === 0) {
                await loadUsageMasterData();
            }

            const batchId = crypto.randomUUID();
            const importData = [];
            const monthsToDelete = new Set();

            rows.forEach(row => {
                const rawDate  = row['prod_date'] || row['doc_date'] || row['Date'] || row['usage_date'];
                const rawWidth = row['Size'] || row['size'] || row['Width'] || row['width'];
                const rawKgs   = row['used_kgs'] || row['kgs'] || row['Kgs'];
                const rawGrade = row['grade'] || row['Grade'];
                const customerCode = row['customer_code'] || row['Customer'] || '';
                const customerName = row['customer_name'] || '';
                const jobNo    = String(row['sbjob_no'] || row['SBJOB_NO'] || row['job_no'] || '').trim();

                const width = parseFloat(rawWidth) || 0;
                const kgs   = parseFloat(rawKgs) || 0;
                const grade = typeof normalizeGrade === 'function' ? normalizeGrade(rawGrade || '') : String(rawGrade || '').toUpperCase();
                const dateISO = typeof toISODate === 'function' ? toISODate(rawDate) : rawDate;

                if (dateISO && dateISO.length >= 7) {
                    monthsToDelete.add(dateISO.slice(0, 7));
                }

                const item = findMasterForUsageRow(String(grade || '').trim().toUpperCase(), width, '');

                importData.push({
                    usage_date: dateISO,
                    doc_date:   dateISO,
                    sbjob_no:   jobNo,
                    grade:      grade,
                    width:      width,
                    used_kgs:   kgs,
                    kgs:        kgs,
                    roll_for_customer: customerCode || customerName, // เก็บไว้เพื่อ backward compat
                    customer_code: customerCode,
                    customer_name: customerName,
                    item_code:  item ? (item.item_code || '') : '',
                    is_valid:   true,
                    import_batch_id: batchId,
                    created_by: (typeof currentUser !== 'undefined' && currentUser?.id) || null
                });
            });

            const validData = importData.filter(d => d.usage_date && d.grade && d.width > 0);
            if (validData.length === 0) return showToast('ไม่พบข้อมูลที่ถูกต้อง', 'warn');

            // V.Pivot FIX: insert ข้อมูลใหม่ให้สำเร็จก่อน แล้วค่อยลบข้อมูลเก่า
            // (เดิมลบก่อน ถ้า insert พังกลางทาง ข้อมูลทั้งเดือนหาย)
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
                    break;
                } else {
                    ok += chunk.length;
                }
            }

            if (fail > 0) {
                // ย้อนกลับ: ลบเฉพาะข้อมูลที่เพิ่งใส่ในรอบนี้ — ข้อมูลเก่ายังอยู่ครบ
                const { error: rbErr } = await supabase.from('usage_records_raw').delete().eq('import_batch_id', batchId);
                showToast('❌ Import ไม่สำเร็จ — ข้อมูลเดิมยังอยู่ครบ', 'err', 8000);
                alert(`Import ไม่สำเร็จ ระบบไม่ได้เปลี่ยนแปลงข้อมูลเดิม\n\nสาเหตุ: ${insertErrorMsg}` +
                      (rbErr ? `\n\n⚠️ ย้อนกลับข้อมูลที่ใส่ไปบางส่วนไม่สำเร็จ (${rbErr.message}) กรุณาแจ้งผู้ดูแลระบบ` : '\n\nกรุณาลอง Import ไฟล์เดิมอีกครั้ง'));
                return;
            }

            // insert สำเร็จทั้งหมด → ลบข้อมูลเก่าของเดือนเหล่านี้ (ยกเว้นชุดที่เพิ่งใส่)
            if (monthsToDelete.size > 0) {
                showToast('กำลังล้างข้อมูลเก่าของเดือนในไฟล์นี้...', 'info');
                let delFail = '';
                for (const m of monthsToDelete) {
                    const [yy, mo2] = m.split('-').map(Number);
                    const firstDay = `${m}-01`;
                    const lastDay  = usageLastDayOfMonth(yy, mo2);

                    const { error: delError } = await supabase
                        .from('usage_records_raw')
                        .delete()
                        .gte('usage_date', firstDay)
                        .lte('usage_date', lastDay)
                        .or(`import_batch_id.is.null,import_batch_id.neq.${batchId}`);

                    if (delError) {
                        console.error(`ลบข้อมูลเก่าเดือน ${m} ไม่สำเร็จ:`, delError);
                        delFail = delError.message;
                    }
                }
                if (delFail) {
                    alert(`นำเข้าข้อมูลใหม่สำเร็จ ${ok} รายการ แต่ลบข้อมูลเก่าไม่สำเร็จ (${delFail})\nข้อมูลเก่าอาจซ้ำกับข้อมูลใหม่ กรุณาแจ้งผู้ดูแลระบบ`);
                }
            }

            showToast(`Import สำเร็จ ${ok} รายการ`, 'ok');
            showSnapshotStaleNotice([...monthsToDelete].sort());

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
// 5. Pivot รายปี
// ==========================================

let yearlyPivotCustomers = [];
let yearlyPivotDataCache = null;
let yearlyPivotSizesCache = [];

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

        loadUsagePivot();

    } else {
        btnYearly.classList.add('primary');
        btnMonthly.classList.remove('primary');
        containerYearly.classList.remove('hidden');
        containerMonthly.classList.add('hidden');

        initYearlyPivot();
        if (yearlyPivotDataCache) {
            renderYearlyPivotTable('CA');
        } else {
            loadYearlyPivot();
        }
    }
}

async function initYearlyPivot() {
    const yearSelect = document.getElementById('yearly-pivot-year');
    if (yearSelect && yearSelect.options.length === 0) {
        const currentYear = new Date().getFullYear() + 543;
        for (let i = 0; i < 3; i++) {
            const opt = document.createElement('option');
            opt.value = currentYear - i - 543;
            opt.text = `ปี ${currentYear - i}`;
            yearSelect.appendChild(opt);
        }
    }

    if (yearlyPivotCustomers.length === 0) {
        await loadYearlyCustomers();
    }
}

// แสดงรายชื่อลูกค้าเป็น Code (Name)
async function loadYearlyCustomers() {
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
        yearlyPivotCustomers = unique;

        const list = document.getElementById('yearlyCustomerList');
        if (!list) return;
        list.innerHTML = unique.map(c => `
            <label class="item" data-customer="${usageEscAttr(c)}">
                <input type="checkbox" value="${usageEscAttr(c)}">
                <span>${usageEscHtml(c)}</span>
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

function toggleYearlyCustomerDropdown(e) {
    e.stopPropagation();
    const dd = document.getElementById('yearlyCustomerDropdown');
    const btn = document.getElementById('yearlyCustomerFilterBtn');
    dd.classList.toggle('hidden');
    btn.classList.toggle('open');
}

function updateYearlyCustomerLabel() {
    const label = document.getElementById('yearlyCustomerFilterLabel');
    if (!label) return;
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

document.addEventListener('click', (e) => {
    const box = document.getElementById('yearlyCustomerDropdown');
    const btn = document.getElementById('yearlyCustomerFilterBtn');
    if (box && !box.contains(e.target) && btn && !btn.contains(e.target)) {
        box.classList.add('hidden');
        btn.classList.remove('open');
    }
});

async function loadYearlyPivot() {
    const btn = document.getElementById('btnLoadYearlyPivot');
    if (btn && btn.disabled) return;

    const year = document.getElementById('yearly-pivot-year')?.value;
    if (!year) return showToast('กรุณาเลือกปี', 'warn');

    const selectedCustomers = [...document.querySelectorAll('#yearlyCustomerList input:checked')].map(cb => cb.value);

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '⏳ กำลังโหลด...';
    }
    const container = document.getElementById('yearly-pivot-result');
    container.innerHTML = '<div style="text-align:center; padding: 20px; color: var(--primary);">กำลังประมวลผลข้อมูล...</div>';

    try {
        const firstMonth = `${year}-01`;
        const lastMonth = `${year}-12`;

        const data = await fetchAllRows(() => {
            let q = supabase
                .from('usage_snapshots')
                .select('snapshot_month, grade, width, total_rolls, customer_filter')
                .gte('snapshot_month', firstMonth)
                .lte('snapshot_month', lastMonth);

            const isAllSelected = selectedCustomers.length === 0;
            if (isAllSelected) {
                q = q.eq('customer_filter', 'ALL');
            } else {
                q = q.in('customer_filter', selectedCustomers);
            }
            return q;
        });

        if (!data || data.length === 0) {
            yearlyPivotDataCache = null;
            yearlyPivotSizesCache = [];
            const tabsContainer = document.getElementById('yearly-grade-tabs-container');
            if (tabsContainer) tabsContainer.classList.add('hidden');
            container.innerHTML = '<div style="text-align:center; padding: 20px; color: var(--orange-dark);">ไม่พบข้อมูล Snapshot ในปีที่เลือก (กรุณา Import หรือกด Save Snapshot)</div>';
            return;
        }

        const pivotData = {};
        const allSizesSet = new Set();

        data.forEach(row => {
            const monthIndex = Number(row.snapshot_month.split('-')[1]) - 1;
            const gradeKey = String(row.grade || '').trim().toUpperCase().replace(/\s+/g, '');
            const rowSize = Number(row.width);
            const rolls = Number(row.total_rolls);

            if (!gradeKey) return;
            if (isNaN(monthIndex) || monthIndex < 0 || monthIndex > 11) return;

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

        console.log('✅ loadYearlyPivot:', {
            year,
            customersSelected: selectedCustomers.length === 0 ? 'ALL' : selectedCustomers,
            rowsFromDB: data.length,
            gradesInCache: sortedGrades,
            sizes: sortedSizes
        });

        if (sortedGrades.length === 0) {
            yearlyPivotDataCache = null;
            yearlyPivotSizesCache = [];
            const tabsContainer = document.getElementById('yearly-grade-tabs-container');
            if (tabsContainer) tabsContainer.classList.add('hidden');
            container.innerHTML = '<div style="text-align:center; padding: 20px; color: red;">ไม่พบข้อมูลที่สามารถคำนวณได้</div>';
            return;
        }

        yearlyPivotDataCache = pivotData;
        yearlyPivotSizesCache = sortedSizes;

        const tabsContainer = document.getElementById('yearly-grade-tabs-container');
        if (tabsContainer) tabsContainer.classList.remove('hidden');

        renderYearlyPivotTable('CA');

        // อัปเดตข้อความหัวข้อบอกปี
        const yearTitle = document.getElementById('yearlyPivotTitle');
        if (yearTitle) {
            const thaiYear = Number(year) + 543;
            yearTitle.innerHTML = `ตารางแสดงผลการใช้งานม้วนกระดาษปี : <span style="color: var(--primary);">${thaiYear}</span>`;
        }

        showToast(`โหลด Pivot รายปีสำเร็จ (จาก Snapshot, ${data.length} แถว)`, 'ok');

    } catch (err) {
        console.error(err);
        container.innerHTML = `<div style="text-align:center; padding: 20px; color: red;">เกิดข้อผิดพลาด: ${usageEscHtml(err.message)}</div>`;
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

function renderYearlyPivotTable(gradeGroup) {
    const container = document.getElementById('yearly-pivot-result');
    if (!container || !yearlyPivotDataCache) return;

    const monthNames = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
    const sortedSizes = yearlyPivotSizesCache || [];

    const groupNorm = String(gradeGroup || '').trim().toUpperCase();

    const filteredGrades = Object.keys(yearlyPivotDataCache)
        .filter(g => {
            const gn = String(g || '').trim().toUpperCase().replace(/\s+/g, '');
            if (!gn) return false;
            if (groupNorm === 'FSC') return gn.includes('F');
            if (groupNorm === 'ALL') return true;
            return gn.startsWith(groupNorm) && !gn.includes('F');
        })
        .sort();

    if (filteredGrades.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding: 20px; color: var(--text-muted);">ไม่พบข้อมูลเกรดกลุ่ม ${usageEscHtml(gradeGroup)} ในปีนี้</div>`;
        return;
    }

    let html = '';
    filteredGrades.forEach(grade => {
        const gradeData = (yearlyPivotDataCache[grade] && yearlyPivotDataCache[grade].data) || {};

        html += `<table class="yearly-pivot-table">
            <thead>
                <tr>
                    <th class="yearly-pivot-header-grade" colspan="${sortedSizes.length + 2}">${usageEscHtml(grade)}</th>
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

            const monthData = gradeData[m] || {};

            sortedSizes.forEach(size => {
                const val = monthData[size] || 0;
                monthTotal += val;
                const cellAttr = val > 0
                    ? `onclick="openCustomerDrillDown('${usageEscAttr(grade)}', ${size}, ${m + 1})" class="clickable" data-tip="Gradegrams ${usageEscAttr(grade)} · Size ${size}"`
                    : '';
                html += `<td ${cellAttr}>${val > 0 ? val.toFixed(2) : ''}</td>`;
            });

            html += `<td class="yearly-pivot-total-col">${monthTotal > 0 ? monthTotal.toFixed(2) : ''}</td></tr>`;
        }

        html += `<tr class="yearly-pivot-row-total">
            <td class="yearly-pivot-month-col">Total</td>`;

        let grandTotal = 0;
        sortedSizes.forEach(size => {
            let sizeTotal = 0;
            for (let m = 0; m < 12; m++) {
                sizeTotal += ((gradeData[m] || {})[size] || 0);
            }
            grandTotal += sizeTotal;
            html += `<td>${sizeTotal > 0 ? sizeTotal.toFixed(2) : ''}</td>`;
        });

        html += `<td class="yearly-pivot-total-col">${grandTotal > 0 ? grandTotal.toFixed(2) : ''}</td></tr>`;
        html += `</tbody></table>`;
    });

    container.innerHTML = html;
}

function filterYearlyPivot(gradeGroup, btnElement) {
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

    renderYearlyPivotTable(gradeGroup);
}

// ==========================================
// 7. Drill-down ลูกค้า (Customer Ranking & Detail)
// ==========================================
async function openCustomerDrillDown(grade, size, monthNum) {
    const year = document.getElementById('yearly-pivot-year')?.value;
    if (!year) return;

    const modal = document.getElementById('modalSnapshot');
    const modalTitle = document.getElementById('snapshotViewTitle');
    const modalBody = document.getElementById('snapshotViewBody');

    if (!modal || !modalBody) return;

    const startDate = `${year}-${String(monthNum).padStart(2, '0')}-01`;
    const lastDay = new Date(year, monthNum, 0).getDate();
    const endDate = `${year}-${String(monthNum).padStart(2, '0')}-${lastDay}`;
    const monthNames = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];

    const gradeNorm = String(grade || '').trim().toUpperCase().replace(/\s+/g, '');

    if (modalTitle) modalTitle.innerHTML = `📊 รายละเอียด: <span style="color:#2563eb;">${gradeNorm} (Size ${size})</span> - ${monthNames[monthNum-1]} ${Number(year)+543}`;
    modalBody.innerHTML = '<div style="text-align:center; padding: 40px; color:#64748b;"><div class="spinner"></div>กำลังประมวลผลข้อมูล...</div>';
    modal.classList.add('show');

    try {
        const { data, error } = await supabase
            .from('usage_records_raw')
            .select('grade, width, used_kgs, item_code, usage_date, customer_code, customer_name')
            .eq('is_valid', true)
            .gte('usage_date', startDate)
            .lte('usage_date', endDate)
            .eq('width', size);

        if (error) throw error;

        const customerStats = {};
        const productStats = {};
        const timelineStats = {};
        let totalRollsAll = 0;
        let totalKgsAll = 0;

        data.forEach(row => {
            const masterItem = findMasterForUsageRow(row.grade, row.width, row.item_code);
            if (!masterItem) return;

            const masterGradeName = (masterItem.gram ? `${masterItem.grade}${masterItem.gram}` : masterItem.grade)
                .trim().toUpperCase().replace(/\s+/g, '');
            if (masterGradeName !== gradeNorm) return;

            const rolls = Number(row.used_kgs) / Number(masterItem.std_weight_kg);
            const kgs = Number(row.used_kgs);

            const cCode = (row.customer_code || '').trim() || 'ไม่ระบุ';
            const cName = (row.customer_name || '').trim() || '';
            const cKey = `${cCode}_${cName}`;

            if (!customerStats[cKey]) customerStats[cKey] = { code: cCode, name: cName, rolls: 0, kgs: 0 };
            customerStats[cKey].rolls += rolls;
            customerStats[cKey].kgs += kgs;

            // หมายเหตุ: select ไม่ได้ดึง description/product_name มา จึง fallback เป็น customer_name
            const product = row.description || row.product_name || row.customer_name || 'ไม่ระบุสินค้า';
            const date = row.usage_date;

            if (!productStats[product]) productStats[product] = { rolls: 0, kgs: 0 };
            productStats[product].rolls += rolls;
            productStats[product].kgs += kgs;

            if (!timelineStats[date]) timelineStats[date] = { rolls: 0, kgs: 0 };
            timelineStats[date].rolls += rolls;
            timelineStats[date].kgs += kgs;

            totalRollsAll += rolls;
            totalKgsAll += kgs;
        });

        if (totalRollsAll === 0) {
            modalBody.innerHTML = '<div style="text-align:center; padding: 40px; color:#94a3b8;">ไม่พบข้อมูลการใช้งานในเดือนนี้</div>';
            return;
        }

        let html = `
        <div style="background: linear-gradient(135deg, #eff6ff, #dbeafe); border: 1px solid #93c5fd; border-radius: 10px; padding: 16px; margin-bottom: 20px; display: flex; justify-content: space-around; text-align: center;">
            <div>
                <div style="font-size: 13px; color: #1e40af; font-weight: 600; margin-bottom: 4px;">จำนวนม้วนรวม</div>
                <div style="font-size: 24px; font-weight: 800; color: #1e3a8a;">${totalRollsAll.toFixed(2)}</div>
            </div>
            <div style="border-left: 1px solid #bfdbfe;"></div>
            <div>
                <div style="font-size: 13px; color: #1e40af; font-weight: 600; margin-bottom: 4px;">น้ำหนักรวม (KG)</div>
                <div style="font-size: 24px; font-weight: 800; color: #1e3a8a;">${totalKgsAll.toLocaleString('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
            </div>
            <div style="border-left: 1px solid #bfdbfe;"></div>
            <div>
                <div style="font-size: 13px; color: #1e40af; font-weight: 600; margin-bottom: 4px;">จำนวนลูกค้า</div>
                <div style="font-size: 24px; font-weight: 800; color: #1e3a8a;">${Object.keys(customerStats).length} ราย</div>
            </div>
        </div>`;

        const sortedCustomers = Object.keys(customerStats).map(c => ({
            key: c,
            code: customerStats[c].code,
            name: customerStats[c].name,
            rolls: customerStats[c].rolls,
            kgs: customerStats[c].kgs,
            percent: (customerStats[c].rolls / totalRollsAll) * 100
        })).sort((a, b) => b.rolls - a.rolls);

        html += `<div class="drill-section">
            <div class="drill-title"><span>🏆</span> อันดับลูกค้าที่ใช้งานสูงสุด (Top Customers)</div>
            <table class="data-table" style="width:100%;">
                <thead style="background:#f8fafc; color:#334155;">
                    <tr>
                        <th style="width:60px; text-align:center;">อันดับ</th>
                        <th>ชื่อลูกค้า</th>
                        <th style="text-align:right;">จำนวน (ม้วน)</th>
                        <th style="text-align:right;">น้ำหนัก (KG)</th>
                        <th style="width:200px;">สัดส่วน</th>
                    </tr>
                </thead>
                <tbody>`;

        sortedCustomers.forEach((c, index) => {
            const rank = index + 1;
            let rankClass = 'rank-other';
            if (rank === 1) rankClass = 'rank-1';
            else if (rank === 2) rankClass = 'rank-2';
            else if (rank === 3) rankClass = 'rank-3';

            const displayStr = c.name ? `${usageEscHtml(c.code)} (${usageEscHtml(c.name)})` : usageEscHtml(c.code);

            html += `<tr>
                <td style="text-align:center;"><span class="rank-badge ${rankClass}">${rank}</span></td>
                <td style="font-weight:600; color:#1e293b;">${displayStr}</td>
                <td style="text-align:right; font-weight:700; color:#2563eb;">${c.rolls.toFixed(2)}</td>
                <td style="text-align:right; color:#64748b;">${c.kgs.toLocaleString('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                <td>
                    <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:2px;"><span>${c.percent.toFixed(1)}%</span></div>
                    <div class="customer-bar-wrap"><div class="customer-bar" style="width: ${c.percent}%;"></div></div>
                </td>
            </tr>`;
        });
        html += `</tbody></table></div>`;

        const sortedProducts = Object.keys(productStats).map(p => ({
            name: p,
            rolls: productStats[p].rolls,
            kgs: productStats[p].kgs
        })).sort((a, b) => b.rolls - a.rolls);

        html += `<div class="drill-section">
            <div class="drill-title"><span>📦</span> สินค้าที่ผลิต (Top Products)</div>
            <div style="max-height: 250px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 8px;">
                <table class="data-table" style="width:100%; margin:0;">
                    <thead style="background:#f8fafc; color:#334155; position:sticky; top:0;">
                        <tr>
                            <th>รายละเอียดสินค้า (Description)</th>
                            <th style="text-align:right; width:100px;">จำนวน (ม้วน)</th>
                            <th style="text-align:right; width:120px;">น้ำหนัก (KG)</th>
                        </tr>
                    </thead>
                    <tbody>`;

        sortedProducts.slice(0, 10).forEach(p => {
            html += `<tr>
                <td style="font-size:12.5px; color:#334155;">${usageEscHtml(p.name)}</td>
                <td style="text-align:right; font-weight:600; color:#2563eb;">${p.rolls.toFixed(2)}</td>
                <td style="text-align:right; color:#64748b;">${p.kgs.toLocaleString('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
            </tr>`;
        });
        html += `</tbody></table></div></div>`;

        // กราฟไทม์ไลน์แสดงครบทุกวันของเดือน
        const lastDayOfMonth = new Date(year, monthNum, 0).getDate();
        const allDays = [];
        for (let d = 1; d <= lastDayOfMonth; d++) {
            allDays.push(`${year}-${String(monthNum).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
        }
        const maxDailyRolls = Math.max(...allDays.map(d => (timelineStats[d]?.rolls || 0)), 1);

        html += `<div class="drill-section">
            <div class="drill-title"><span>📅</span> ไทม์ไลน์การใช้งานรายวัน</div>
            <div style="display:flex; gap:8px; align-items:flex-end; height:120px; padding-top:10px; overflow-x:auto;">
                ${allDays.map(d => {
                    const stat = timelineStats[d] || { rolls: 0, kgs: 0 };
                    const heightPercent = (stat.rolls / maxDailyRolls) * 100;
                    const day = Number(d.split('-')[2]);
                    return `
                        <div style="display:flex; flex-direction:column; align-items:center; min-width:30px;" title="วันที่ ${day}: ${stat.rolls.toFixed(2)} ม้วน">
                            <div style="font-size:10px; color:#64748b; margin-bottom:4px;">${stat.rolls > 0 ? stat.rolls.toFixed(1) : ''}</div>
                            <div style="width:20px; background:${stat.rolls > 0 ? '#3b82f6' : '#e2e8f0'}; height:${stat.rolls > 0 ? heightPercent : 2}px; border-radius:4px 4px 0 0; transition:height 0.3s;"></div>
                            <div style="font-size:11px; font-weight:700; color:#475569; margin-top:6px;">${day}</div>
                        </div>`;
                }).join('')}
            </div>
        </div>`;

        modalBody.innerHTML = html;

    } catch (err) {
        console.error('openCustomerDrillDown error:', err);
        modalBody.innerHTML = `<div style="text-align:center; padding: 40px; color:#ef4444;">เกิดข้อผิดพลาด: ${usageEscHtml(err.message)}</div>`;
    }
}
