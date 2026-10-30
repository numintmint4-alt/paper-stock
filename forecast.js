// ==========================================
// forecast.js - จัดการ Tab Production Forecast & Usage Pivot
// ==========================================

const fcState = {
    currentGradeGroup: 'KA', // Default Tab
    forecastData: [],        
    masterData: [],          
};

// เรียกใช้เมื่อกด Tab Forecast
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
        // ใช้คลาสของระบบเดิมเพื่อให้ดูเข้ากัน
        btn.className = `btn-tab ${fcState.currentGradeGroup === group ? 'active' : ''}`;
        btn.style = `padding:8px 16px; border-radius:6px; border:1px solid #cbd5e1; cursor:pointer; font-weight:bold; ${fcState.currentGradeGroup === group ? 'background:#3b82f6; color:white;' : 'background:white; color:#1e293b;'}`;
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
        // 1. ดึง Stock (อ้างอิงตามโครงสร้างเดิมของคุณ)
        const { data: stockRaw } = await supabase.from('stock_balance').select('grade, size, rolls').eq('stock_date', selectedDate);
        const stockData = {};
        (stockRaw || []).forEach(item => {
            stockData[`${item.grade}-${item.size}`] = (stockData[`${item.grade}-${item.size}`] || 0) + Number(item.rolls || 0);
        });

        // 2. ดึง Forecast ที่เคยเซฟ
        const { data: savedForecast } = await supabase.from('forecast_data').select('*').eq('month_year', monthYear);
        const { data: prevData } = await supabase.from('forecast_data').select('*').eq('month_year', prevMonth);

        // 3. ดึง Usage จาก RPC (ที่แก้ใหม่)
        let usageData = [];
        if (m1 && m2 && m3) {
            const { data: rpcData } = await supabase.rpc('get_general_usage_matrix', { p_month_1: m1, p_month_2: m2, p_month_3: m3 });
            usageData = rpcData || [];
        }

        // 4. กรอง Master ตาม Tab
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
            
            // Match Usage ด้วย item_code
            const usage = usageData.find(u => u.item_code === m.item_code) || { m1_rolls: 0, m2_rolls: 0, m3_rolls: 0 };

            const m1_val = Number(usage.m1_rolls);
            const m2_val = Number(usage.m2_rolls);
            const m3_val = Number(usage.m3_rolls);
            const avg3 = (m1_val + m2_val + m3_val) / 3;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${m.grade}</td>
                <td>${m.size}</td>
                <td>${m1_val.toFixed(2)}</td>
                <td>${m2_val.toFixed(2)}</td>
                <td>${m3_val.toFixed(2)}</td>
                <td style="background:#f0f8ff;">${avg3.toFixed(2)}</td>
                <td><input type="number" class="fc-input" data-field="forecast_nen" value="${saved.forecast_nen || 0}"></td>
                <td><input type="number" class="fc-input" data-field="forecast_nea" value="${saved.forecast_nea || 0}"></td>
                <td><input type="number" class="fc-input" data-field="forecast_thaifood" value="${saved.forecast_thaifood || 0}"></td>
                <td><input type="number" class="fc-input" data-field="forecast_ktp" value="${saved.forecast_ktp || 0}"></td>
                <td class="actual-cell" style="background:#e6f2ff;">0.00</td>
                <td style="color:#003366; font-weight:bold;">0.00</td>
                <td>${stockQty}</td>
                <td><input type="number" class="fc-input" data-field="reserve_qty" value="${saved.reserve_qty || 0}"></td>
                <td class="roll-snd-cell" style="background:#f5f5f5;">0.00</td>
                <td class="est-use-cell" style="background:#f5f5f5;">0.00</td>
                <td>0</td>
                <td>0</td>
                <td class="order-calc-cell" style="background:#e6ffe6;">0.00</td>
                <td class="order-round-cell" style="background:#ccffcc; font-weight:bold;">0</td>
                <td><input type="number" class="fc-input" data-field="adjust_qty" value="${saved.adjust_qty || 0}"></td>
                <td><input type="text" class="fc-input" data-field="note" value="${(saved.note || '').replace(/"/g, '&quot;')}"></td>
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

    // ใช้จริง (Actual) = Avg + Forecast
    const actual = avg3 + fNen + fNea + fThai + fKtp;
    
    // ใช้จริง (ก่อนหน้า) = Forecast ก่อนหน้า
    const prevActual = prev ? (Number(prev.forecast_nen||0) + Number(prev.forecast_nea||0) + Number(prev.forecast_thaifood||0) + Number(prev.forecast_ktp||0)) : 0;

    const rollSND = stockQty + reserve;
    const estUse = actual + prevActual - rollSND;
    
    const stockLevel = 0; // ดึงจาก Snapshot (Mockup ไว้ก่อน)
    const stockLevel50 = stockLevel / 2;
    
    const orderCalc = estUse + stockLevel50 + adjust;
    const orderRound = Math.ceil(orderCalc);

    // อัปเดตลงตาราง
    tr.querySelector('.actual-cell').innerText = actual.toFixed(2);
    tr.children[11].innerText = prevActual.toFixed(2); // ใช้จริง (ก่อนหน้า)
    tr.querySelector('.roll-snd-cell').innerText = rollSND.toFixed(2);
    tr.querySelector('.est-use-cell').innerText = estUse.toFixed(2);
    tr.querySelector('.order-calc-cell').innerText = orderCalc.toFixed(2);
    tr.querySelector('.order-round-cell').innerText = orderRound;
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
// ระบบ Usage Pivot
// ==========================================

async function initUsagePivotTab() {
    const monthInput = document.getElementById('pivot-month');
    if (monthInput && !monthInput.value) {
        monthInput.value = new Date().toISOString().slice(0, 7);
    }
}

// ✅ ฟังก์ชัน Import ที่แก้ไขแล้ว (แก้ปัญหา customer_code)
async function handleUsageImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(firstSheet);

            showToast(`กำลังประมวลผล ${rows.length} แถว...`, 'info');

            // สร้าง Batch ID สำหรับการ Import ครั้งนี้
            const batchId = crypto.randomUUID();

            const importData = rows.map(row => {
                // ดึงข้อมูลจาก Excel
                const rawDate = row['prod_date'] || row['doc_date'] || row['Date']; 
                const rawWidth = row['Size'] || row['size'] || row['Width'];
                const rawKgs = row['kgs'] || row['used_kgs'] || row['Kgs'];
                const rawGrade = row['grade'] || row['Grade'];
                
                // ดึงชื่อลูกค้า (ใช้ฟิลด์ roll_for_customer ให้ตรงกับ DB เดิม)
                const customer = row['customer_code'] || row['Customer'] || row['customer_name'] || '';

                const width = parseFloat(rawWidth) || 0;
                const kgs = parseFloat(rawKgs) || 0;
                const grade = normalizeGrade(rawGrade || ''); // ใช้ normalizeGrade จาก app.js
                
                // หา item_code จาก masterData
                const item = fcState.masterData.find(m => m.grade === grade && Number(m.size) === width);
                
                return {
                    usage_date: toISODate(rawDate),       // วันที่ตัดสต็อก
                    doc_date: toISODate(rawDate),         // วันที่เอกสาร
                    grade: grade,                         // เกรด
                    width: width,                         // ขนาด
                    used_kgs: kgs,                        // น้ำหนักที่ใช้
                    kgs: kgs,
                    roll_for_customer: customer,          // ✅ ลูกค้า (แก้จาก customer_code แล้ว)
                    item_code: item ? item.item_code : '',// Item code
                    is_valid: true,                       // สถานะถูกต้อง
                    import_batch_id: batchId,             // รหัส Batch
                    created_by: currentUser.id            // ผู้ Import
                };
            });

            // กรองแถวที่ข้อมูลสำคัญไม่ครบออก
            const validImportData = importData.filter(d => d.usage_date && d.grade && d.width > 0);

            if (validImportData.length === 0) {
                return showToast('ไม่พบข้อมูลที่ถูกต้องในไฟล์ (ตรวจสอบคอลัมน์ prod_date, Size, grade)', 'warn');
            }

            // บันทึกลง Database
            const { error } = await supabase.from('usage_records_raw').insert(validImportData);
            
            if (error) {
                console.error(error);
                showToast('Import ล้มเหลว: ' + error.message, 'err');
            } else {
                showToast(`Import สำเร็จ ${validImportData.length} รายการ`, 'ok');
                document.getElementById('pivot-file-upload').value = ''; 
                // ถ้าต้องการให้โหลด Pivot ใหม่ทันทีหลัง Import ให้เปิดบรรทัดล่างนี้
                // loadUsagePivot();
            }
        } catch (err) {
            console.error(err);
            showToast('เกิดข้อผิดพลาดในการอ่านไฟล์: ' + err.message, 'err');
        }
    };
    reader.readAsArrayBuffer(file);
}

async function loadUsagePivot() {
    const month = document.getElementById('pivot-month').value;
    if (!month) return showToast('กรุณาเลือกเดือน', 'warn');

    const tbody = document.getElementById('pivot-tbody');
    const thead = document.getElementById('pivot-thead');
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;">กำลังโหลด...</td></tr>';

    const { data, error } = await supabase
        .from('usage_records_raw')
        .select('grade, width, used_kgs')
        .eq('is_valid', true)
        .gte('usage_date', `${month}-01`)
        .lte('usage_date', `${month}-31`);

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
        
        // คำนวณเป็นม้วน
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
                bodyHtml += `<td>${(row[w] || 0).toFixed(2)}</td>`;
            });
            bodyHtml += `<td style="background:#e6f2ff; font-weight:bold;">${row.total.toFixed(2)}</td></tr>`;
        });
    }
    tbody.innerHTML = bodyHtml;
}
