// ==========================================
// forecast.js - จัดการ Tab Production Forecast & Usage Pivot & Snapshot
// ==========================================

const fcState = {
    currentGradeGroup: 'CA',
    masterData: [],
};

// ==========================================
// 1. ส่วนของหน้า Forecast
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
    const monthInput = document.getElementById('fc-month');
    
    if (dateInput && !dateInput._flatpickr) {
        window.flatpickrInstances['fc-stock-date'] = flatpickr(dateInput, {
            locale: "th",
            dateFormat: "Y-m-d",
            defaultDate: yesterday,
            allowInput: false,
            disableMobile: true,
            onChange: () => loadForecastMatrix()
        });
    }
    
    if (monthInput && !monthInput.value) {
        monthInput.value = today.toISOString().slice(0, 7);
    }
}

async function loadForecastMasterData() {
    const { data, error } = await supabase.from('paper_specs').select('grade, size, item_code, std_weight_kg');
    if (!error) fcState.masterData = data || [];
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

    const dateInput = document.getElementById('fc-stock-date');
    const monthInput = document.getElementById('fc-month');
    const m1 = document.getElementById('fc-m1').value;
    const m2 = document.getElementById('fc-m2').value;
    const m3 = document.getElementById('fc-m3').value;
    const prevMonth = document.getElementById('fc-prev-month').value;

    if (!dateInput || !monthInput) return;
    const selectedDate = typeof getISODateFromInput === 'function' ? getISODateFromInput('fc-stock-date') : dateInput.value;
    const monthYear = monthInput.value;

    try {
        // 1. ดึง Stock ณ วันที่เลือก
        const { data: stockRaw } = await supabase.from('stock_balance').select('grade, size, rolls').eq('stock_date', selectedDate);
        const stockData = {};
        (stockRaw || []).forEach(item => {
            stockData[`${item.grade}-${item.size}`] = (stockData[`${item.grade}-${item.size}`] || 0) + Number(item.rolls || 0);
        });

        // 2. ดึง Forecast ที่เคยเซฟไว้
        const { data: savedForecast } = await supabase.from('forecast_data').select('*').eq('month_year', monthYear);
        
        // 3. ดึง Forecast ของเดือนก่อนหน้า
        const { data: prevData } = await supabase.from('forecast_data').select('*').eq('month_year', prevMonth);

        // 4. ดึง Usage Snapshot (ยอดใช้จริงที่เคย Save ไว้)
        //    - เดือน M1, M2, M3 (ดึงของทุกคน 'ALL' หรือผู้ใช้ต้องเลือกในหน้า Pivot ก่อนบันทึก)
        let usageSnapshots = [];
        if (m1 && m2 && m3) {
            const { data: snaps } = await supabase
                .from('usage_snapshots')
                .select('*')
                .in('snapshot_month', [m1, m2, m3])
                .eq('customer_filter', 'ALL'); // สมมติว่าดึงยอดรวมทุกคนมาโชว์
            usageSnapshots = snaps || [];
        }

        // 5. กรอง Master Data ตาม Tab
        const filteredMaster = fcState.masterData.filter(m => String(m.grade || '').startsWith(fcState.currentGradeGroup));
        tbody.innerHTML = '';

        if (filteredMaster.length === 0) {
            tbody.innerHTML = '<tr><td colspan="22" style="text-align:center; color:gray;">ไม่พบข้อมูลใน Master</td></tr>';
            return;
        }

        filteredMaster.forEach(m => {
            const stockKey = `${m.grade}-${m.size}`;
            const stockQty = stockData[stockKey] || 0;
            const saved = (savedForecast || []).find(f => f.grade === m.grade && Number(f.width) === Number(m.size)) || {};
            const prev = (prevData || []).find(p => p.grade === m.grade && Number(p.width) === Number(m.size)) || {};
            
            // ค้นหายอด Usage จาก Snapshot
            const snapM1 = usageSnapshots.find(s => s.snapshot_month === m1 && s.grade === m.grade && Number(s.width) === Number(m.size));
            const snapM2 = usageSnapshots.find(s => s.snapshot_month === m2 && s.grade === m.grade && Number(s.width) === Number(m.size));
            const snapM3 = usageSnapshots.find(s => s.snapshot_month === m3 && s.grade === m.grade && Number(s.width) === Number(m.size));

            // ถ้าไม่มีข้อมูล ให้เป็น null เพื่อให้แสดงช่องว่าง (ตามที่คุณต้องการ)
            const m1_val = snapM1 ? Number(snapM1.total_rolls) : null;
            const m2_val = snapM2 ? Number(snapM2.total_rolls) : null;
            const m3_val = snapM3 ? Number(snapM3.total_rolls) : null;
            
            // คำนวณ Avg 3 Mths (ถ้ามีข้อมูล)
            let avg3 = 0;
            let validMonths = 0;
            if (m1_val !== null) { avg3 += m1_val; validMonths++; }
            if (m2_val !== null) { avg3 += m2_val; validMonths++; }
            if (m3_val !== null) { avg3 += m3_val; validMonths++; }
            avg3 = validMonths > 0 ? (avg3 / validMonths) : 0;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${m.grade}</td>
                <td>${m.size}</td>
                <td class="col-m1">${m1_val !== null ? m1_val.toFixed(2) : ''}</td>
                <td class="col-m2">${m2_val !== null ? m2_val.toFixed(2) : ''}</td>
                <td class="col-m3">${m3_val !== null ? m3_val.toFixed(2) : ''}</td>
                <td class="col-avg">${validMonths > 0 ? avg3.toFixed(2) : ''}</td>
                
                <td><input type="number" class="fc-input" data-field="forecast_nen" value="${saved.forecast_nen || 0}" placeholder="0"></td>
                <td><input type="number" class="fc-input" data-field="forecast_nea" value="${saved.forecast_nea || 0}" placeholder="0"></td>
                <td><input type="number" class="fc-input" data-field="forecast_thaifood" value="${saved.forecast_thaifood || 0}" placeholder="0"></td>
                <td><input type="number" class="fc-input" data-field="forecast_ktp" value="${saved.forecast_ktp || 0}" placeholder="0"></td>
                
                <td class="actual-cell" style="background:#e6f2ff; font-weight:bold;">0.00</td>
                <td class="col-prev-actual">0.00</td>
                
                <td class="col-stock">${stockQty}</td>
                <td><input type="number" class="fc-input" data-field="reserve_qty" value="${saved.reserve_qty || 0}" placeholder="0"></td>
                
                <td class="roll-snd-cell" style="background:#f5f5f5;">0.00</td>
                <td class="est-use-cell" style="background:#f5f5f5;">0.00</td>
                <td>0</td>
                <td>0</td>
                
                <td class="order-calc-cell" style="background:#e6ffe6;">0.00</td>
                <td class="col-order-round">0</td>
                
                <td><input type="number" class="fc-input" data-field="adjust_qty" value="${saved.adjust_qty || 0}" placeholder="0"></td>
                <td><input type="text" class="fc-input" data-field="note" value="${(saved.note || '').replace(/"/g, '&quot;')}" placeholder="" style="width:100px; text-align:left;"></td>
            `;

            tr.dataset.grade = m.grade;
            tr.dataset.width = m.size;
            tr.dataset.avg3 = avg3;

            tr.querySelectorAll('.fc-input').forEach(input => {
                input.addEventListener('change', () => recalculateRow(tr, stockQty, prev));
            });

            tbody.appendChild(tr);
            recalculateRow(tr, stockQty, prev);
        });

    } catch (err) {
        console.error('Matrix Error:', err);
        tbody.innerHTML = '<tr><td colspan="22" style="text-align:center; color:red;">เกิดข้อผิดพลาด (ดู Console)</td></tr>';
    }
}

function recalculateRow(tr, stockQty, prev) {
    const getVal = (field) => {
        const input = tr.querySelector(`.fc-input[data-field="${field}"]`);
        return input ? Number(input.value || 0) : 0;
    };

    const avg3 = Number(tr.dataset.avg3 || 0);
    const fNen = getVal('forecast_nen');
    const fNea = getVal('forecast_nea');
    const fThai = getVal('forecast_thaifood');
    const fKtp = getVal('forecast_ktp');
    const reserve = getVal('reserve_qty');
    const adjust = getVal('adjust_qty');

    const actual = avg3 + fNen + fNea + fThai + fKtp;
    const prevActual = prev ? (Number(prev.forecast_nen||0) + Number(prev.forecast_nea||0) + Number(prev.forecast_thaifood||0) + Number(prev.forecast_ktp||0)) : 0;
    const rollSND = stockQty + reserve;
    const estUse = actual + prevActual - rollSND;
    
    const stockLevel = 0; // สมมติ
    const stockLevel50 = stockLevel / 2;
    
    const orderCalc = estUse + stockLevel50 + adjust;
    const orderRound = Math.ceil(orderCalc);

    tr.querySelector('.actual-cell').innerText = actual.toFixed(2);
    tr.querySelector('.col-prev-actual').innerText = prevActual.toFixed(2);
    tr.querySelector('.roll-snd-cell').innerText = rollSND.toFixed(2);
    tr.querySelector('.est-use-cell').innerText = estUse.toFixed(2);
    tr.querySelector('.order-calc-cell').innerText = orderCalc.toFixed(2);
    tr.querySelector('.col-order-round').innerText = orderRound;
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

    const { error } = await supabase.from('forecast_data').upsert(payloads, { onConflict: 'month_year,grade,width' });

    if (error) {
        showToast('บันทึกข้อมูลไม่สำเร็จ', 'err');
    } else {
        showToast('บันทึกข้อมูล Forecast สำเร็จ', 'ok');
    }
}

// ==========================================
// 2. ส่วนของหน้า Usage Pivot & Snapshot
// ==========================================
async function initUsagePivotTab() {
    const monthInput = document.getElementById('pivot-month');
    if (monthInput && !monthInput.value) {
        monthInput.value = new Date().toISOString().slice(0, 7);
    }

    // โหลดรายชื่อลูกค้าเข้าตัวกรอง (Mockup รอเชื่อมกับ Database ถ้ามี)
    const customerSelect = document.getElementById('pivot-customer');
    if (customerSelect && customerSelect.options.length <= 1) {
        // ดึงรายชื่อลูกค้าจาก usage_records_raw (ดึงเฉพาะที่ไม่ซ้ำ)
        const { data } = await supabase.from('usage_records_raw').select('roll_for_customer').limit(1000);
        const uniqueCustomers = [...new Set((data || []).map(d => d.roll_for_customer).filter(Boolean))];
        
        uniqueCustomers.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c;
            opt.innerText = c;
            customerSelect.appendChild(opt);
        });
    }
}

async function loadUsagePivot() {
    const month = document.getElementById('pivot-month').value;
    const customerFilter = document.getElementById('pivot-customer').value; // 'ALL' หรือชื่อลูกค้า
    
    if (!month) return showToast('กรุณาเลือกเดือน', 'warn');

    const tbody = document.getElementById('pivot-tbody');
    const thead = document.getElementById('pivot-thead');
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;">กำลังโหลด...</td></tr>';

    // ดึงข้อมูลจาก usage_records_raw
    let query = supabase
        .from('usage_records_raw')
        .select('grade, width, used_kgs, roll_for_customer')
        .eq('is_valid', true)
        .gte('usage_date', `${month}-01`)
        .lte('usage_date', `${month}-31`);

    // ถ้าไม่ได้เลือก 'ทั้งหมด' ให้กรองตามลูกค้า
    if (customerFilter !== 'ALL') {
        query = query.eq('roll_for_customer', customerFilter);
    }

    const { data, error } = await query;

    if (error) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;color:red;">Error: ${error.message}</td></tr>`;
        return showToast('Error loading pivot', 'err');
    }

    const pivotData = {};
    const allWidths = new Set();

    data.forEach(row => {
        allWidths.add(row.width);
        if (!pivotData[row.grade]) pivotData[row.grade] = { total: 0 };
        if (!pivotData[row.grade][row.width]) pivotData[row.grade][row.width] = 0;
        
        // คำนวณเป็นม้วน (สมมติ 500 kg = 1 ม้วน หรือดึง std_weight_kg มาหาร)
        const rolls = Number(row.used_kgs) / 500; 
        pivotData[row.grade][row.width] += rolls;
        pivotData[row.grade].total += rolls;
    });

    const sortedWidths = Array.from(allWidths).sort((a,b) => a-b);

    let headerHtml = '<tr><th>Grade</th>';
    sortedWidths.forEach(w => headerHtml += `<th>${w}</th>`);
    headerHtml += '<th>Grand Total</th></tr>';
    thead.innerHTML = headerHtml;

    let bodyHtml = '';
    if (Object.keys(pivotData).length === 0) {
        bodyHtml = `<tr><td colspan="${sortedWidths.length + 2}" style="text-align:center;">ไม่มีข้อมูลในเดือนนี้</td></tr>`;
    } else {
        Object.keys(pivotData).sort().forEach(grade => {
            const row = pivotData[grade];
            bodyHtml += `<tr><td><strong>${grade}</strong></td>`;
            sortedWidths.forEach(w => {
                // ถ้าไม่มียอดใช้ ให้เว้นว่างไว้
                const val = row[w] || 0;
                bodyHtml += `<td>${val > 0 ? val.toFixed(2) : ''}</td>`;
            });
            bodyHtml += `<td style="background:#e6f2ff; font-weight:bold;">${row.total.toFixed(2)}</td></tr>`;
        });
    }
    tbody.innerHTML = bodyHtml;

    // เก็บข้อมูล Pivot ไว้ใน State เผื่อใช้ตอน Save Snapshot
    fcState.pivotData = pivotData;
    fcState.pivotWidths = sortedWidths;
    fcState.pivotMonth = month;
    fcState.pivotCustomer = customerFilter;
}

// ฟังก์ชันบันทึก Snapshot
async function saveUsageSnapshot() {
    if (!fcState.pivotData || !fcState.pivotMonth) {
        return showToast('กรุณากด Load Pivot เพื่อดึงข้อมูลก่อนบันทึก', 'warn');
    }

    const month = fcState.pivotMonth;
    const customerFilter = fcState.pivotCustomer;
    const pivotData = fcState.pivotData;

    const payloads = [];
    Object.keys(pivotData).forEach(grade => {
        const row = pivotData[grade];
        fcState.pivotWidths.forEach(width => {
            const rolls = row[width] || 0;
            // บันทึกเฉพาะที่มีข้อมูล (หรือจะบันทึก 0 ไปด้วยก็ได้)
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

    if (payloads.length === 0) {
        return showToast('ไม่มีข้อมูลให้บันทึก Snapshot', 'warn');
    }

    showToast('กำลังบันทึก Snapshot...', 'info');

    // ลบข้อมูลเดิมของเดือน+ลูกค้านี้ทิ้งก่อน แล้วค่อย Insert ใหม่
    await supabase.from('usage_snapshots')
        .delete()
        .eq('snapshot_month', month)
        .eq('customer_filter', customerFilter);

    const { error } = await supabase.from('usage_snapshots').insert(payloads);

    if (error) {
        console.error(error);
        showToast('บันทึก Snapshot ไม่สำเร็จ: ' + error.message, 'err');
    } else {
        showToast(`บันทึก Snapshot สำเร็จ (${payloads.length} รายการ)`, 'ok');
    }
}
