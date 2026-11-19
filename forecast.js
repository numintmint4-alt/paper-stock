// ==========================================
// forecast.js — Forecast V2 (ตรงกับ index.html V.2)
// โหลดหลัง app.js เท่านั้น
// ใช้ตาราง: forecast_data, usage_snapshots, stock_balance, paper_specs
// ==========================================

// ========== STATE ==========
const fcState = {
    currentGradeGroup: 'CA',
    currentMonth: '',      // 'YYYY-MM'
    currentRev: '00',
    allRevs: ['00'],       // cache rev list per (month, grade)
    masterData: [],
    masterMap: new Map(),
    isLocked: false,
    _savingForecast: false,
    // เก็บข้อมูลที่แก้ไขค้างไว้ใน memory ก่อน save
    pendingData: {},       // { 'grade|width': { forecast_nen, ..., adjust_qty, note } }
    // เก็บไฟล์ที่แนบ (memory)
    attachedFile: null     // { name, dataURL }
};

// ========== HELPERS ==========
function fcGetVal(id) {
    return document.getElementById(id)?.value || '';
}

function fcCurrentMonthStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function fcShiftMonth(monthStr, offset) {
    const [y, m] = monthStr.split('-').map(Number);
    const d = new Date(y, m - 1 + offset, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function fcLastDayOfMonth(y, mo) {
    const last = new Date(y, mo, 0).getDate();
    return `${y}-${String(mo).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
}

// ========== 1. INIT FORECAST TAB ==========
async function initForecastTab() {
    // ตั้ง default เดือน = เดือนถัดไป
    const monthInput = document.getElementById('fc-target-month');
    if (monthInput && !monthInput.value) {
        monthInput.value = fcShiftMonth(fcCurrentMonthStr(), 1);
    }

    await loadForecastMasterData();

    // ถ้ายังไม่เคยกด init ให้เริ่มจาก狀態 ว่าง
    if (!fcState.currentMonth) {
        const tbody = document.getElementById('fc-tbody');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="20" style="text-align:center;padding:30px;color:#94a3b8;">กดปุ่ม "📝 จัดทำประมาณการสั่งซื้อ" เพื่อเริ่มต้น</td></tr>';
        }
        document.getElementById('fc-thead').innerHTML = '';
        return;
    }

    // ถ้าเคย init แล้ว → reload
    await loadForecastMatrix();
}

// ========== 2. LOAD MASTER ==========
async function loadForecastMasterData() {
    try {
        const rows = await fetchAllRows(() =>
            supabase.from('paper_specs')
                .select('grade, size, gram, item_code, std_weight_kg')
                .order('item_code', { ascending: true })
                .order('size', { ascending: true })
        );

        const seen = new Map();
        const unique = [];
        (rows || []).forEach(item => {
            const key = (item.item_code || `${item.grade || ''}|${item.gram || ''}|${item.size || ''}`)
                .toUpperCase().replace(/\s+/g, '');
            if (!seen.has(key)) {
                seen.set(key, item);
                unique.push(item);
            }
        });

        fcState.masterData = unique;

        fcState.masterMap.clear();
        unique.forEach(m => {
            if (!m.std_weight_kg || Number(m.std_weight_kg) <= 0) return;
            const key = `${String(m.grade).trim().toUpperCase()}-${Number(m.size)}`;
            if (!fcState.masterMap.has(key)) fcState.masterMap.set(key, m);
        });

        console.log(`✅ Master: ${unique.length} รายการ`);
    } catch (err) {
        console.error('loadForecastMasterData error:', err);
        showToast('โหลด Master ไม่สำเร็จ: ' + err.message, 'err');
    }
}

// ========== 3. INIT FORM (กดปุ่ม "จัดทำประมาณการ") ==========
async function initForecastForm() {
    const month = document.getElementById('fc-target-month')?.value;
    if (!month) return showToast('กรุณาเลือกเดือนที่จัดทำประมาณการ', 'warn');

    if (fcState.masterData.length === 0) {
        await loadForecastMasterData();
        if (fcState.masterData.length === 0) {
            return showToast('ไม่พบ Master Data — กรุณา Import ที่หน้า Settings', 'err');
        }
    }

    fcState.currentMonth = month;
    fcState.currentGradeGroup = 'CA';
    fcState.currentRev = '00';
    fcState.isLocked = false;
    fcState.pendingData = {};
    fcState.attachedFile = null;

    // Reset grade tab active
    document.querySelectorAll('#fc-grade-tabs button').forEach((b, i) => {
        b.classList.toggle('active', i === 0);
    });

    // โหลด rev list จาก localStorage
    loadRevListFromStorage();

    // Render rev tabs
    renderFcRevTabs();

    // โหลด matrix
    await loadForecastMatrix();

    // Enable buttons
    document.getElementById('btn-save-forecast').disabled = false;
    document.getElementById('btn-revise-forecast').style.display = 'none';
    document.getElementById('btn-upload-file').style.display = 'block';
    document.getElementById('btn-print-forecast').disabled = false;

    // Clear file
    document.getElementById('fc-file-name').textContent = '';
    document.getElementById('fc-remark').value = '';

    updateLockStatus('draft');
    showToast(`เริ่มจัดทำประมาณการเดือน ${month} (Rev.00)`, 'ok');
}

// ========== 4. SWITCH GRADE ==========
async function switchFcGrade(grade, btnEl) {
    if (fcState.isLocked) return showToast('ตารางถูกล็อค ไม่สามารถเปลี่ยน Grade', 'warn');

    document.querySelectorAll('#fc-grade-tabs button').forEach(b => b.classList.remove('active'));
    if (btnEl) btnEl.classList.add('active');

    fcState.currentGradeGroup = grade;
    fcState.currentRev = '00';
    fcState.pendingData = {};

    loadRevListFromStorage();
    renderFcRevTabs();
    await loadForecastMatrix();
}

// ========== 5. SWITCH REV ==========
async function switchFcRev(rev, btnEl) {
    if (fcState.isLocked) return showToast('ตารางถูกล็อค', 'warn');

    document.querySelectorAll('#fc-rev-tabs button').forEach(b => b.classList.remove('active'));
    if (btnEl) btnEl.classList.add('active');

    fcState.currentRev = rev;
    fcState.pendingData = {};
    await loadForecastMatrix();
}

// ========== 6. REV TABS ==========
function getRevStorageKey() {
    return `fc_revs_${fcState.currentMonth}_${fcState.currentGradeGroup}`;
}

function loadRevListFromStorage() {
    try {
        const raw = localStorage.getItem(getRevStorageKey());
        fcState.allRevs = raw ? JSON.parse(raw) : ['00'];
        if (!Array.isArray(fcState.allRevs) || fcState.allRevs.length === 0) fcState.allRevs = ['00'];
        if (!fcState.allRevs.includes(fcState.currentRev)) {
            fcState.currentRev = fcState.allRevs[fcState.allRevs.length - 1];
        }
    } catch {
        fcState.allRevs = ['00'];
    }
}

function saveRevListToStorage() {
    try {
        localStorage.setItem(getRevStorageKey(), JSON.stringify(fcState.allRevs));
    } catch {}
}

function renderFcRevTabs() {
    const container = document.getElementById('fc-rev-tabs');
    if (!container) return;

    if (!fcState.currentMonth) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = fcState.allRevs.map(r =>
        `<button class="sub-tab ${r === fcState.currentRev ? 'active' : ''}" onclick="switchFcRev('${r}', this)">Rev.${r}</button>`
    ).join('');
}

// ========== 7. LOAD MATRIX (หัวใจ) ==========
async function loadForecastMatrix() {
    const tbody = document.getElementById('fc-tbody');
    const thead = document.getElementById('fc-thead');
    if (!tbody || !thead) return;

    if (!fcState.currentMonth) {
        tbody.innerHTML = '<tr><td colspan="20" style="text-align:center;padding:30px;color:#94a3b8;">กรุณากดปุ่ม "จัดทำประมาณการสั่งซื้อ"</td></tr>';
        return;
    }

    tbody.innerHTML = '<tr><td colspan="20" style="text-align:center;padding:20px;">⏳ กำลังโหลดข้อมูล...</td></tr>';

    try {
        // --- 7.1 Master เฉพาะ grade group ---
        const masters = fcState.masterData.filter(m =>
            String(m.grade || '').toUpperCase().startsWith(fcState.currentGradeGroup) ||
            (fcState.currentGradeGroup === 'FSC' && String(m.grade || '').toUpperCase().includes('F'))
        );

        if (masters.length === 0) {
            thead.innerHTML = '';
            tbody.innerHTML = `<tr><td colspan="20" style="text-align:center;color:#94a3b8;">ไม่พบ Size สำหรับ Grade ${fcState.currentGradeGroup}</td></tr>`;
            return;
        }

        // sort by size
        masters.sort((a, b) => Number(a.size) - Number(b.size));

        // --- 7.2 Stock ล่าสุด (ใช้เดือนนี้ day สุดท้ายของเดือนก่อนหน้า) ---
        const monthStart = `${fcState.currentMonth}-01`;
        const stockRows = await fetchAllRows(() =>
            supabase.from('stock_balance')
                .select('grade, size, rolls, stock_date')
                .lte('stock_date', monthStart)
                .order('stock_date', { ascending: false })
        );
        // เอา stock_date ล่าสุดต่อ (grade,size)
        const stockMap = {};
        (stockRows || []).forEach(r => {
            const k = `${r.grade}-${Number(r.size)}`;
            if (!(k in stockMap)) stockMap[k] = Number(r.rolls) || 0;
        });

        // --- 7.3 Usage snapshots 3 เดือนย้อนหลัง ---
        const m1 = fcShiftMonth(fcState.currentMonth, -1);
        const m2 = fcShiftMonth(fcState.currentMonth, -2);
        const m3 = fcShiftMonth(fcState.currentMonth, -3);
        const snaps = await fetchAllRows(() =>
            supabase.from('usage_snapshots')
                .select('*')
                .in('snapshot_month', [m1, m2, m3])
                .eq('customer_filter', 'ALL')
        );
        const snapMap = {};
        (snaps || []).forEach(s => {
            snapMap[`${s.snapshot_month}|${s.grade}|${Number(s.width)}`] = Number(s.total_rolls) || 0;
        });

        // --- 7.4 Forecast data ปัจจุบัน ---
        const forecastRows = await fetchAllRows(() =>
            supabase.from('forecast_data').select('*').eq('month_year', fcState.currentMonth)
        );

        // --- 7.5 Prev month forecast ---
        const prevMonth = fcShiftMonth(fcState.currentMonth, -1);
        const prevRows = await fetchAllRows(() =>
            supabase.from('forecast_data').select('*').eq('month_year', prevMonth)
        );

        // --- 7.6 Build thead ---
        const cols = [
            { key: 'grade', label: 'Grade' },
            { key: 'size', label: 'Width' },
            { key: 'm1', label: 'M1' },
            { key: 'm2', label: 'M2' },
            { key: 'm3', label: 'M3' },
            { key: 'avg3', label: 'Avg 3 Mths' },
            { key: 'f_nen', label: 'Forecast (NEN)', input: true },
            { key: 'f_nea', label: 'Forecast (NEA)', input: true },
            { key: 'f_thai', label: 'Forecast (ไทยฟู้ด)', input: true },
            { key: 'f_ktp', label: 'Forecast (KTP)', input: true },
            { key: 'actual', label: 'ใช้จริง (Actual)' },
            { key: 'prev_actual', label: 'ใช้จริง (ก่อนหน้า)' },
            { key: 'stock', label: 'Stock (ณ วันที่เลือก)' },
            { key: 'reserve', label: 'ยอดจองคงเหลือ', input: true },
            { key: 'roll_snd', label: 'Roll S&D คงเหลือ' },
            { key: 'est_use', label: 'คาดการณ์ว่าจะต้องใช้' },
            { key: 'stock_lvl', label: 'Stock Level' },
            { key: 'stock_lvl_50', label: 'Stock Level 50%' },
            { key: 'order_calc', label: 'ยอดที่ต้องสั่งซื้อ (คำนวณ)' },
            { key: 'order_round', label: 'ยอดที่ต้องสั่งซื้อ (ROUNDUP)' },
            { key: 'adjust', label: 'ปรับเพิ่ม/ลด', input: true },
            { key: 'note', label: 'หมายเหตุ', input: true }
        ];

        let headHtml = '<tr>';
        cols.forEach(c => headHtml += `<th>${c.label}</th>`);
        headHtml += '</tr>';
        thead.innerHTML = headHtml;

        // --- 7.7 Build tbody ---
        tbody.innerHTML = '';
        masters.forEach(m => {
            const gradeStr = `${m.grade}${m.gram || ''}`;
            const size = Number(m.size);
            const stockKey = `${m.grade}-${size}`;
            const stockQty = stockMap[stockKey] || 0;

            // saved forecast
            const saved = (forecastRows || []).find(f =>
                f.grade === gradeStr && Number(f.width) === size
            ) || {};

            // pending edits ทับ
            const pendingKey = `${gradeStr}|${size}`;
            const pending = fcState.pendingData[pendingKey] || {};
            const merged = { ...saved, ...pending };

            // prev forecast
            const prev = (prevRows || []).find(p =>
                p.grade === gradeStr && Number(p.width) === size
            ) || {};

            // usage snapshot
            const v1 = snapMap[`${m1}|${gradeStr}|${size}`] || null;
            const v2 = snapMap[`${m2}|${gradeStr}|${size}`] || null;
            const v3 = snapMap[`${m3}|${gradeStr}|${size}`] || null;
            let avg3 = 0, cnt = 0;
            [v1, v2, v3].forEach(v => { if (v !== null && v > 0) { avg3 += v; cnt++; } });
            avg3 = cnt > 0 ? avg3 / cnt : 0;

            const tr = document.createElement('tr');
            tr.dataset.grade = gradeStr;
            tr.dataset.width = size;
            tr.dataset.avg3 = avg3;
            tr.dataset.stock = stockQty;

            tr.innerHTML = `
                <td><strong>${esc(gradeStr)}</strong></td>
                <td>${size}</td>
                <td>${v1 !== null ? Number(v1).toFixed(2) : '-'}</td>
                <td>${v2 !== null ? Number(v2).toFixed(2) : '-'}</td>
                <td>${v3 !== null ? Number(v3).toFixed(2) : '-'}</td>
                <td><b>${avg3.toFixed(2)}</b></td>
                <td><input type="number" class="fc-input" data-field="forecast_nen" value="${merged.forecast_nen || 0}" ${fcState.isLocked ? 'disabled' : ''}></td>
                <td><input type="number" class="fc-input" data-field="forecast_nea" value="${merged.forecast_nea || 0}" ${fcState.isLocked ? 'disabled' : ''}></td>
                <td><input type="number" class="fc-input" data-field="forecast_thaifood" value="${merged.forecast_thaifood || 0}" ${fcState.isLocked ? 'disabled' : ''}></td>
                <td><input type="number" class="fc-input" data-field="forecast_ktp" value="${merged.forecast_ktp || 0}" ${fcState.isLocked ? 'disabled' : ''}></td>
                <td class="actual-cell" style="background:#e6f2ff;font-weight:bold;">0.00</td>
                <td class="prev-actual-cell">${(Number(prev.forecast_nen || 0) + Number(prev.forecast_nea || 0) + Number(prev.forecast_thaifood || 0) + Number(prev.forecast_ktp || 0)).toFixed(2)}</td>
                <td class="stock-cell">${stockQty.toFixed(2)}</td>
                <td><input type="number" class="fc-input" data-field="reserve_qty" value="${merged.reserve_qty || 0}" ${fcState.isLocked ? 'disabled' : ''}></td>
                <td class="roll-snd-cell">0.00</td>
                <td class="est-use-cell">0.00</td>
                <td class="stock-lvl-cell">0</td>
                <td class="stock-lvl-50-cell">0</td>
                <td class="order-calc-cell" style="background:#e6ffe6;">0.00</td>
                <td class="order-round-cell" style="background:#fef08a;font-weight:bold;">0</td>
                <td><input type="number" class="fc-input" data-field="adjust_qty" value="${merged.adjust_qty || 0}" ${fcState.isLocked ? 'disabled' : ''}></td>
                <td><input type="text" class="fc-input" data-field="note" value="${esc(merged.note || '')}" style="width:120px;" ${fcState.isLocked ? 'disabled' : ''}></td>
            `;

            tr.querySelectorAll('.fc-input').forEach(inp => {
                inp.addEventListener('input', () => {
                    const field = inp.dataset.field;
                    if (!fcState.pendingData[pendingKey]) fcState.pendingData[pendingKey] = {};
                    fcState.pendingData[pendingKey][field] = inp.type === 'number' ? Number(inp.value) || 0 : inp.value;
                    recalculateRow(tr);
                });
            });

            tbody.appendChild(tr);
            recalculateRow(tr);
        });

        // ถ้า locked → แสดง banner
        if (fcState.isLocked) {
            document.getElementById('forecast-matrix').classList.add('fc-locked');
        } else {
            document.getElementById('forecast-matrix').classList.remove('fc-locked');
        }

    } catch (err) {
        console.error('loadForecastMatrix error:', err);
        tbody.innerHTML = `<tr><td colspan="20" style="text-align:center;color:red;">เกิดข้อผิดพลาด: ${esc(err.message)}</td></tr>`;
    }
}

// ========== 8. RECALCULATE ROW ==========
function recalculateRow(tr) {
    const getVal = field => {
        const inp = tr.querySelector(`.fc-input[data-field="${field}"]`);
        if (!inp) return 0;
        const v = Number(inp.value);
        return isNaN(v) ? 0 : v;
    };

    const avg3 = Number(tr.dataset.avg3 || 0);
    const stockQty = Number(tr.dataset.stock || 0);

    const fNen = getVal('forecast_nen');
    const fNea = getVal('forecast_nea');
    const fThai = getVal('forecast_thaifood');
    const fKtp = getVal('forecast_ktp');
    const reserve = getVal('reserve_qty');
    const adjust = getVal('adjust_qty');

    const actual = avg3 + fNen + fNea + fThai + fKtp;
    const rollSnd = stockQty + reserve;
    const estUse = actual - rollSnd;

    // Stock Level = stock ณ วันนี้ (ใช้ stockQty แทน)
    const stockLvl = stockQty;
    const stockLvl50 = stockLvl / 2;

    const orderCalc = Math.max(0, estUse + stockLvl50) + adjust;
    const orderRound = orderCalc > 0 ? Math.ceil(orderCalc) : 0;

    tr.querySelector('.actual-cell').textContent = actual.toFixed(2);
    tr.querySelector('.stock-cell').textContent = stockQty.toFixed(2);
    tr.querySelector('.roll-snd-cell').textContent = rollSnd.toFixed(2);
    tr.querySelector('.est-use-cell').textContent = estUse.toFixed(2);
    tr.querySelector('.stock-lvl-cell').textContent = stockLvl.toFixed(2);
    tr.querySelector('.stock-lvl-50-cell').textContent = stockLvl50.toFixed(2);
    tr.querySelector('.order-calc-cell').textContent = orderCalc.toFixed(2);
    tr.querySelector('.order-round-cell').textContent = orderRound;

    // Validation: ถ้า orderRound ติดลบ → แสดงเตือน
    if (orderRound < 0) {
        tr.querySelector('.order-round-cell').style.color = 'red';
        tr.querySelector('.order-round-cell').title = '❌ จำนวนไม่พอ';
    } else {
        tr.querySelector('.order-round-cell').style.color = '';
        tr.querySelector('.order-round-cell').title = '';
    }
}

// ========== 9. SAVE FORECAST ==========
async function saveForecastData() {
    if (fcState._savingForecast) return;
    if (!fcState.currentMonth) return showToast('กรุณาเริ่มจัดทำก่อน', 'warn');

    fcState._savingForecast = true;
    const btn = document.getElementById('btn-save-forecast');
    const oldText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '⏳ กำลังบันทึก...';

    try {
        // รวม pending + existing
        const payloads = [];
        document.querySelectorAll('#fc-tbody tr').forEach(tr => {
            const grade = tr.dataset.grade;
            const width = tr.dataset.width;
            if (!grade || !width) return;

            const getVal = field => {
                const inp = tr.querySelector(`.fc-input[data-field="${field}"]`);
                if (!inp) return field === 'note' ? '' : 0;
                if (inp.type === 'number') return Number(inp.value) || 0;
                return inp.value;
            };

            payloads.push({
                month_year: fcState.currentMonth,
                grade,
                width: Number(width),
                forecast_nen: getVal('forecast_nen'),
                forecast_nea: getVal('forecast_nea'),
                forecast_thaifood: getVal('forecast_thaifood'),
                forecast_ktp: getVal('forecast_ktp'),
                reserve_qty: getVal('reserve_qty'),
                adjust_qty: getVal('adjust_qty'),
                note: getVal('note')
            });
        });

        if (payloads.length === 0) {
            showToast('ไม่มีข้อมูลให้บันทึก', 'warn');
            return;
        }

        const { error } = await supabase
            .from('forecast_data')
            .upsert(payloads, { onConflict: 'month_year,grade,width' });

        if (error) throw error;

        // Lock UI
        fcState.isLocked = true;
        fcState.pendingData = {};
        document.getElementById('forecast-matrix').classList.add('fc-locked');
        document.getElementById('btn-save-forecast').disabled = true;
        document.getElementById('btn-revise-forecast').style.display = 'block';
        document.getElementById('fc-remark').disabled = true;
        document.querySelectorAll('.fc-input').forEach(i => i.disabled = true);

        updateLockStatus('locked');
        showToast(`✅ บันทึกและล็อค Forecast สำเร็จ (${payloads.length} แถว)`, 'ok');
    } catch (err) {
        console.error('saveForecastData error:', err);
        showToast('บันทึกไม่สำเร็จ: ' + err.message, 'err');
        btn.disabled = false;
        btn.innerHTML = oldText;
    } finally {
        fcState._savingForecast = false;
    }
}

// ========== 10. REVISE ==========
function openReviseModal() {
    document.getElementById('revisePassword').value = '';
    document.getElementById('reviseMsg').innerHTML = '';
    openModal('modalRevise');
}

async function confirmRevise() {
    const pwd = document.getElementById('revisePassword').value;
    if (!pwd) {
        document.getElementById('reviseMsg').innerHTML = '<div class="msg err">กรุณากรอกรหัสผ่าน</div>';
        return;
    }

    // ตรวจรหัสผ่านด้วยการ login ซ้ำ
    const { error } = await supabase.auth.signInWithPassword({
        email: currentUser.email,
        password: pwd
    });

    if (error) {
        document.getElementById('reviseMsg').innerHTML = '<div class="msg err">รหัสผ่านไม่ถูกต้อง</div>';
        return;
    }

    // ผ่าน → ปลดล็อค
    closeModal('modalRevise');

    // สร้าง Rev ใหม่
    const nextRev = String(Number(fcState.currentRev) + 1).padStart(2, '0');
    fcState.currentRev = nextRev;
    if (!fcState.allRevs.includes(nextRev)) fcState.allRevs.push(nextRev);
    saveRevListToStorage();

    // ปลดล็อค UI
    fcState.isLocked = false;
    fcState.pendingData = {};
    document.getElementById('forecast-matrix').classList.remove('fc-locked');
    document.getElementById('btn-save-forecast').disabled = false;
    document.getElementById('btn-revise-forecast').style.display = 'none';
    document.getElementById('fc-remark').disabled = false;
    document.querySelectorAll('.fc-input').forEach(i => i.disabled = false);

    renderFcRevTabs();
    updateLockStatus('revised');
    showToast(`🔄 เปิดให้แก้ไขใน Rev.${nextRev}`, 'ok');
}

// ========== 11. LOCK STATUS UI ==========
function updateLockStatus(status) {
    const el = document.getElementById('fc-lock-status');
    if (!el) return;

    const map = {
        draft: '<span class="badge" style="background:#dbeafe; color:#1e40af;">✏️ กำลังจัดทำ (Draft)</span>',
        locked: '<span class="badge" style="background:#dcfce7; color:#166534;">🔒 ล็อคแล้ว (รออนุมัติ)</span>',
        revised: '<span class="badge" style="background:#fef3c7; color:#b45309;">🔄 กำลังแก้ไข (Revise)</span>',
        approved: '<span class="badge" style="background:#f3e8ff; color:#6b21a8;">✅ อนุมัติแล้ว</span>'
    };
    el.innerHTML = map[status] || map.draft;
}

// ========== 12. FILE UPLOAD ==========
async function handleForecastFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // จำกัดขนาด 5MB
    if (file.size > 5 * 1024 * 1024) {
        showToast('ไฟล์ใหญ่เกิน 5MB', 'err');
        event.target.value = '';
        return;
    }

    // เก็บเป็น base64 ใน memory (ชั่วคราว)
    // ⚠️ ในอนาคตควรใช้ Supabase Storage bucket 'forecast-files'
    const reader = new FileReader();
    reader.onload = (e) => {
        fcState.attachedFile = { name: file.name, dataURL: e.target.result };
        document.getElementById('fc-file-name').textContent = `📎 ${file.name}`;
        document.getElementById('btn-upload-file').style.display = 'none';

        // แนบไฟล์ → ถือว่า approved → lock ถาวร
        updateLockStatus('approved');
        showToast('แนบไฟล์อนุมัติเรียบร้อย (ล็อคถาวร)', 'ok');
    };
    reader.readAsDataURL(file);
    event.target.value = '';
}

// ========== 13. EXPORT ==========
window.initForecastTab = initForecastTab;
window.initForecastForm = initForecastForm;
window.switchFcGrade = switchFcGrade;
window.switchFcRev = switchFcRev;
window.saveForecastData = saveForecastData;
window.openReviseModal = openReviseModal;
window.confirmRevise = confirmRevise;
window.handleForecastFileUpload = handleForecastFileUpload;
