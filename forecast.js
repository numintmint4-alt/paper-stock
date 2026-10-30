// ==========================================
// forecast.js - จัดการ Tab Production Forecast
// ==========================================

const fcState = {
    currentGradeGroup: 'CA', // Default Tab
    masterData: [],          // เก็บ Master Grade/Width/Weight
};

// เรียกใช้เมื่อกด Tab Forecast
async function initForecastTab() {
    await loadForecastMasterData();
    initForecastDatePickers();
    renderGradeTabs();
    await loadForecastMatrix();
}

function initForecastDatePickers() {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    
    // ตั้งค่าเริ่มต้น Date Picker
    if (!document.getElementById('fc-stock-date')._flatpickr) {
        flatpickr("#fc-stock-date", {
            dateFormat: "Y-m-d",
            defaultDate: yesterday,
            onChange: () => loadForecastMatrix()
        });
    }

    // ตั้งค่า Month Pickers
    const currentMonth = today.toISOString().slice(0, 7); // YYYY-MM
    document.getElementById('fc-month').value = currentMonth;
}

// ดึง Master Data (Grade, Size, Weight)
async function loadForecastMasterData() {
    const { data, error } = await supabase
        .from('paper_specs')
        .select('grade, size, std_weight');
        
    if (error) return showToast('Error loading master data', 'error');
    fcState.masterData = data;
}

// สร้าง Tabs ย่อย CA, KA, KI, KK, KW, FSC
function renderGradeTabs() {
    const groups = ['CA', 'KA', 'KI', 'KK', 'KW', 'FSC'];
    const container = document.getElementById('fc-grade-tabs');
    container.innerHTML = '';

    groups.forEach(group => {
        const btn = document.createElement('button');
        btn.className = `btn-tab ${fcState.currentGradeGroup === group ? 'active' : ''}`;
        btn.innerText = group;
        btn.onclick = () => {
            fcState.currentGradeGroup = group;
            renderGradeTabs(); // Re-render เพื่อเปลี่ยนสี Active
            loadForecastMatrix(); // โหลดข้อมูลใหม่ตาม Tab
        };
        container.appendChild(btn);
    });
}

// ดึงข้อมูล Matrix และคำนวณ
async function loadForecastMatrix() {
    const tbody = document.getElementById('forecast-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="22" style="text-align:center;">Loading...</td></tr>';

    const selectedDate = document.getElementById('fc-stock-date').value;
    const monthYear = document.getElementById('fc-month').value;
    
    try {
        // 1. ดึงข้อมูล Stock ณ วันที่เลือก
        const { data: stockRaw } = await supabase
            .from('stock_balance') 
            .select('grade, size, rolls')
            .eq('stock_date', selectedDate);

        const stockData = {};
        stockRaw?.forEach(item => {
            const key = `${item.grade}-${item.size}`;
            stockData[key] = (stockData[key] || 0) + item.rolls;
        });

        // 2. ดึงข้อมูลที่เคย Save ไว้
        const { data: savedForecast } = await supabase
            .from('forecast_data')
            .select('*')
            .eq('month_year', monthYear);

        // 3. กรอง Master ตาม Tab ที่เลือก (เช่น KA)
        const filteredMaster = fcState.masterData.filter(m => 
            m.grade.startsWith(fcState.currentGradeGroup)
        );

        tbody.innerHTML = '';
        
        filteredMaster.forEach(m => {
            const stockKey = `${m.grade}-${m.size}`;
            const stockQty = stockData[stockKey] || 0; 
            const saved = savedForecast?.find(f => f.grade === m.grade && f.width === m.size) || {};

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${m.grade}</td>
                <td>${m.size}</td>
                <td>0.00</td> <!-- M1 (Mock) -->
                <td>0.00</td> <!-- M2 (Mock) -->
                <td>0.00</td> <!-- M3 (Mock) -->
                <td>0.00</td> <!-- Avg (Mock) -->
                <td><input type="number" class="fc-input" data-field="forecast_nen" value="${saved.forecast_nen || 0}"></td>
                <td><input type="number" class="fc-input" data-field="forecast_nea" value="${saved.forecast_nea || 0}"></td>
                <td><input type="number" class="fc-input" data-field="forecast_thaifood" value="${saved.forecast_thaifood || 0}"></td>
                <td><input type="number" class="fc-input" data-field="forecast_ktp" value="${saved.forecast_ktp || 0}"></td>
                <td>0.00</td> <!-- Actual (Mock) -->
                <td>0.00</td> <!-- Prev Actual (Mock) -->
                <td style="background:#f0f8ff; font-weight:bold;">${stockQty}</td> <!-- Stock จริง! -->
                <td><input type="number" class="fc-input" data-field="reserve_qty" value="${saved.reserve_qty || 0}"></td>
                <td>0.00</td> <!-- Roll S&D -->
                <td>0.00</td> <!-- Est Use -->
                <td>0.00</td> <!-- Stock Level -->
                <td>0.00</td> <!-- Stock Level 50% -->
                <td>0.00</td> <!-- Order Calc -->
                <td>0.00</td> <!-- Order RoundUp -->
                <td><input type="number" class="fc-input" data-field="adjust_qty" value="${saved.adjust_qty || 0}"></td>
                <td><input type="text" class="fc-input" data-field="note" value="${saved.note || ''}"></td>
            `;

            tr.dataset.grade = m.grade;
            tr.dataset.width = m.size;

            // Event Listener เมื่อแก้ไขช่อง Input
            tr.querySelectorAll('.fc-input').forEach(input => {
                input.addEventListener('change', () => recalculateRow(tr, stockQty));
            });

            tbody.appendChild(tr);
        });

    } catch (err) {
        console.error(err);
        showToast('Error loading matrix', 'error');
    }
}

// คำนวณใหม่เฉพาะแถวเมื่อมีการแก้ไข
function recalculateRow(tr, stockQty) {
    const getVal = (field) => {
        const input = tr.querySelector(`.fc-input[data-field="${field}"]`);
        return input ? Number(input.value || 0) : 0;
    };

    const fNen = getVal('forecast_nen');
    const fNea = getVal('forecast_nea');
    const fThai = getVal('forecast_thaifood');
    const fKtp = getVal('forecast_ktp');
    const reserve = getVal('reserve_qty');
    const adjust = getVal('adjust_qty');

    // --- สูตรคำนวณ (คุณสามารถปรับแต่งได้) ---
    const actual = fNen + fNea + fThai + fKtp;
    const rollSND = stockQty + reserve;
    const estUse = actual - rollSND; // ตัวอย่างการคำนวณ
    const orderCalc = estUse + adjust;
    const orderRoundUp = Math.ceil(orderCalc);

    // อัปเดตค่าในช่องที่คำนวณ (Index ของ td)
    const tds = tr.querySelectorAll('td');
    tds[10].innerText = actual.toFixed(2);       // ใช้จริง (Actual)
    tds[14].innerText = rollSND;                 // Roll S&D คงเหลือ
    tds[15].innerText = estUse.toFixed(2);       // คาดการณ์ว่าจะต้องใช้
    tds[18].innerText = orderCalc.toFixed(2);    // ยอดที่ต้องสั่งซื้อ (คำนวณ)
    tds[19].innerText = orderRoundUp;            // ยอดที่ต้องสั่งซื้อ (ROUNDUP)
}

// บันทึกข้อมูลลง Database
async function saveForecastData() {
    const monthYear = document.getElementById('fc-month').value;
    if (!monthYear) return showToast('กรุณาเลือกเดือน Forecast', 'warning');

    const rows = document.querySelectorAll('#forecast-tbody tr');
    const payloads = [];

    rows.forEach(tr => {
        const grade = tr.dataset.grade;
        const width = tr.dataset.width;
        
        const getVal = (field) => {
            const input = tr.querySelector(`.fc-input[data-field="${field}"]`);
            return input ? (input.type === 'number' ? Number(input.value || 0) : input.value) : '';
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

    const { error } = await supabase
        .from('forecast_data')
        .upsert(payloads, { onConflict: 'month_year,grade,width' });

    if (error) {
        console.error(error);
        showToast('บันทึกข้อมูลไม่สำเร็จ', 'error');
    } else {
        showToast('บันทึกข้อมูล Forecast สำเร็จ', 'success');
    }
}
