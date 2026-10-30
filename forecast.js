// ==========================================
// forecast.js - จัดการ Tab Production Forecast (V2 - Safe & Correct)
// ==========================================

const fcState = {
    currentGradeGroup: 'CA',
    masterData: [],
};

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

    if (dateInput) {
        // ลงทะเบียนกับ flatpickrInstances กลางของ app.js เพื่อให้ getISODateFromInput ใช้งานได้
        if (!window.flatpickrInstances) window.flatpickrInstances = {};
        if (!dateInput._flatpickr) {
            window.flatpickrInstances['fc-stock-date'] = flatpickr(dateInput, {
                locale: 'th',
                dateFormat: 'Y-m-d',
                defaultDate: yesterday,
                allowInput: false,
                disableMobile: true,
                onChange: () => loadForecastMatrix()
            });
        } else if (!dateInput.value) {
            // ถ้ามี instance แล้วแต่ยังไม่มีค่า ให้ใส่เมื่อวาน
            dateInput._flatpickr.setDate(yesterday, false);
        }
    }

    if (monthInput && !monthInput.value) {
        monthInput.value = today.toISOString().slice(0, 7);
    }
}

async function loadForecastMasterData() {
    try {
        // ✅ แก้ std_weight → std_weight_kg (ชื่อคอลัมน์จริงใน paper_specs)
        const { data, error } = await supabase
            .from('paper_specs')
            .select('grade, size, std_weight_kg');

        if (error) throw error;
        fcState.masterData = data || [];
    } catch (err) {
        console.error('Error loading master data:', err);
        showToast('ไม่สามารถโหลด Master Data ได้', 'err');
    }
}

function renderGradeTabs() {
    const groups = ['CA', 'KA', 'KI', 'KK', 'KW', 'FSC'];
    const container = document.getElementById('fc-grade-tabs');
    if (!container) return;

    container.innerHTML = '';

    groups.forEach(group => {
        const btn = document.createElement('button');
        btn.className = `btn-tab ${fcState.currentGradeGroup === group ? 'active' : ''}`;
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

    const dateInput = document.getElementById('fc-stock-date');
    const monthInput = document.getElementById('fc-month');
    if (!dateInput || !monthInput) return;

    // ✅ ใช้ helper กลางถ้ามี ไม่งั้น fallback
    const selectedDate = (typeof getISODateFromInput === 'function')
        ? getISODateFromInput('fc-stock-date')
        : dateInput.value;
    const monthYear = monthInput.value;

    if (!selectedDate || !monthYear) {
        tbody.innerHTML = '<tr><td colspan="22" style="text-align:center;color:#dc2626;">กรุณาเลือกวันที่ Stock และเดือน Forecast</td></tr>';
        return;
    }

    try {
        // 1) ดึง Stock
        const { data: stockRaw, error: stockErr } = await supabase
            .from('stock_balance')
            .select('grade, size, rolls')
            .eq('stock_date', selectedDate);

        if (stockErr) console.warn('Stock error:', stockErr);

        const stockData = {};
        (stockRaw || []).forEach(item => {
            const key = `${item.grade}-${item.size}`;
            stockData[key] = (stockData[key] || 0) + Number(item.rolls || 0);
        });

        // 2) ดึง Forecast ที่เคยเซฟ
        const { data: savedForecast, error: fcErr } = await supabase
            .from('forecast_data')
            .select('*')
            .eq('month_year', monthYear);

        if (fcErr) console.warn('Forecast load error:', fcErr);

        // 3) กรอง Master ตาม Tab
        const filteredMaster = fcState.masterData.filter(m =>
            String(m.grade || '').startsWith(fcState.currentGradeGroup)
        );

        tbody.innerHTML = '';

        if (filteredMaster.length === 0) {
            tbody.innerHTML = '<tr><td colspan="22" style="text-align:center; color:gray;">ไม่พบข้อมูลใน Master (ตรวจสอบตาราง paper_specs)</td></tr>';
            return;
        }

        filteredMaster.forEach(m => {
            const stockKey = `${m.grade}-${m.size}`;
            const stockQty = stockData[stockKey] || 0;
            const saved = (savedForecast || []).find(f => f.grade === m.grade && Number(f.width) === Number(m.size)) || {};

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${m.grade}</td>
                <td>${m.size}</td>
                <td>0.00</td>
                <td>0.00</td>
                <td>0.00</td>
                <td>0.00</td>
                <td><input type="number" class="fc-input" data-field="forecast_nen" value="${saved.forecast_nen || 0}"></td>
                <td><input type="number" class="fc-input" data-field="forecast_nea" value="${saved.forecast_nea || 0}"></td>
                <td><input type="number" class="fc-input" data-field="forecast_thaifood" value="${saved.forecast_thaifood || 0}"></td>
                <td><input type="number" class="fc-input" data-field="forecast_ktp" value="${saved.forecast_ktp || 0}"></td>
                <td>0.00</td>
                <td>0.00</td>
                <td style="background:#f0f8ff; font-weight:bold;">${stockQty}</td>
                <td><input type="number" class="fc-input" data-field="reserve_qty" value="${saved.reserve_qty || 0}"></td>
                <td>0.00</td>
                <td>0.00</td>
                <td>0.00</td>
                <td>0.00</td>
                <td>0.00</td>
                <td>0.00</td>
                <td><input type="number" class="fc-input" data-field="adjust_qty" value="${saved.adjust_qty || 0}"></td>
                <td><input type="text" class="fc-input" data-field="note" value="${(saved.note || '').replace(/"/g, '&quot;')}"></td>
            `;

            tr.dataset.grade = m.grade;
            tr.dataset.width = m.size;

            tr.querySelectorAll('.fc-input').forEach(input => {
                input.addEventListener('change', () => recalculateRow(tr, stockQty));
            });

            // คำนวณครั้งแรกให้ค่าตรง
            tbody.appendChild(tr);
            recalculateRow(tr, stockQty);
        });

    } catch (err) {
        console.error('Matrix Error:', err);
        tbody.innerHTML = '<tr><td colspan="22" style="text-align:center; color:red;">เกิดข้อผิดพลาดในการโหลดข้อมูล (ดู Console)</td></tr>';
    }
}

function recalculateRow(tr, stockQty) {
    const getVal = (field) => {
        const input = tr.querySelector(`.fc-input[data-field="${field}"]`);
        return input ? Number(input.value || 0) : 0;
    };

    const fNen  = getVal('forecast_nen');
    const fNea  = getVal('forecast_nea');
    const fThai = getVal('forecast_thaifood');
    const fKtp  = getVal('forecast_ktp');
    const reserve = getVal('reserve_qty');
    const adjust  = getVal('adjust_qty');

    const actual     = fNen + fNea + fThai + fKtp;
    const rollSND    = stockQty + reserve;
    const estUse     = actual - rollSND;
    const orderCalc  = estUse + adjust;
    const orderRound = Math.ceil(orderCalc);

    const tds = tr.querySelectorAll('td');
    if (tds[10]) tds[10].innerText = actual.toFixed(2);
    if (tds[14]) tds[14].innerText = rollSND;
    if (tds[15]) tds[15].innerText = estUse.toFixed(2);
    if (tds[18]) tds[18].innerText = orderCalc.toFixed(2);
    if (tds[19]) tds[19].innerText = orderRound;
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
            return input.type === 'number' ? Number(input.value || 0) : input.value;
        };

        payloads.push({
            month_year: monthYear,
            grade: grade,
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

    if (!payloads.length) return showToast('ไม่มีข้อมูลให้บันทึก', 'warn');

    const { error } = await supabase
        .from('forecast_data')
        .upsert(payloads, { onConflict: 'month_year,grade,width' });

    if (error) {
        console.error(error);
        showToast('บันทึกข้อมูลไม่สำเร็จ: ' + error.message, 'err');
    } else {
        showToast('บันทึกข้อมูล Forecast สำเร็จ', 'ok');
    }
}
