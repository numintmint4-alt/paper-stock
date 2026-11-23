// ==========================================
// purchase-forecast.js - Production Forecast V2 (Purchase Forecast)
// สร้างใหม่ทั้งหมดเพื่อทดแทน Forecast เดิมใน Tab forecast
// ⚠️ ต้องโหลดไฟล์นี้ "หลัง" forecast.js และ usage-pivot.js
// ==========================================

const pfState = {
    currentGrade: 'CA',
    currentRev: 0,
    currentHeaderId: null,
    headers: [],       // เก็บรายการ Header ทั้งหมดที่ดึงมาจาก DB
    details: [],       // เก็บรายการ Detail ของ Rev ที่กำลังเปิดอยู่
    masterSizes: [],   // ขนาด Size ทั้งหมด (ดึงจาก Master Data)
    isLocked: false,
    isLoading: false
};

// ==========================================
// 1. ฟังก์ชันเริ่มต้น (เรียกจาก app.js เมื่อกด Tab forecast)
// ==========================================
async function initPurchaseForecastTab() {
    const tbody = document.getElementById('pf-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="22" style="text-align:center; padding:20px;">กำลังโหลดข้อมูล...</td></tr>';

    try {
        // ดึง Master Sizes (ในระบบจริงสามารถดึงจาก fcState.masterData ที่โหลดไว้แล้ว)
        if (typeof fcState !== 'undefined' && fcState.masterData && fcState.masterData.length > 0) {
            const sizes = [...new Set(fcState.masterData.map(m => Number(m.size)))];
            pfState.masterSizes = sizes.sort((a, b) => a - b);
        } else {
            // Fallback กรณีโหลด Master ไม่สำเร็จ
            pfState.masterSizes = [34, 36, 38, 40, 42, 44, 46, 48, 50, 52, 54, 56, 58, 60, 62, 64, 66, 68, 70, 72, 74, 76, 78, 80, 82, 84, 86, 88, 90, 92, 94, 96, 98];
        }

        await loadForecastHeaders();
    } catch (err) {
        console.error('initPurchaseForecastTab error:', err);
        if (tbody) tbody.innerHTML = `<tr><td colspan="22" style="text-align:center; color:red;">เกิดข้อผิดพลาด: ${err.message}</td></tr>`;
    }
}

// ==========================================
// 2. โหลด Header ทั้งหมดจาก Supabase
// ==========================================
async function loadForecastHeaders() {
    if (pfState.isLoading) return;
    pfState.isLoading = true;

    const { data, error } = await supabase
        .from('purchase_forecast_headers')
        .select('*')
        .order('created_at', { ascending: false });

    pfState.isLoading = false;

    if (error) {
        console.error('loadForecastHeaders error:', error);
        return showToast('โหลด Header ไม่สำเร็จ: ' + error.message, 'err');
    }

    pfState.headers = data || [];
    renderGradeTabs();
    renderRevTabs();
}

// ==========================================
// 3. Render Tab หลัก (CA, KA, KK, KI, FSC)
// ==========================================
function renderGradeTabs() {
    const groups = ['CA', 'KA', 'KK', 'KI', 'FSC'];
    const container = document.getElementById('pf-grade-tabs');
    if (!container) return;

    container.innerHTML = '';
    groups.forEach(g => {
        const btn = document.createElement('button');
        btn.className = `sub-tab ${pfState.currentGrade === g ? 'active' : ''}`;
        btn.innerText = g;
        btn.onclick = () => {
            pfState.currentGrade = g;
            pfState.currentRev = 0;
            pfState.currentHeaderId = null;
            renderGradeTabs();
            renderRevTabs();
        };
        container.appendChild(btn);
    });
}

// ==========================================
// 4. Render Tab ซ้อน (Rev.00, Rev.01, ...)
// ==========================================
function renderRevTabs() {
    const container = document.getElementById('pf-rev-tabs');
    if (!container) return;

    container.innerHTML = '';
    const filteredHeaders = pfState.headers.filter(h => h.grade_group === pfState.currentGrade);

    if (filteredHeaders.length === 0) {
        container.innerHTML = '<span style="color: gray; font-size: 14px; padding: 5px;">ยังไม่มีข้อมูล (กด ➕ เพิ่มประมาณการ)</span>';
        document.getElementById('pf-tbody').innerHTML = '<tr><td colspan="22" style="text-align:center; padding:20px;">ไม่มีข้อมูล</td></tr>';
        document.getElementById('pf-status-badge').innerText = 'สถานะ: -';
        document.getElementById('pf-status-badge').style.background = '#94a3b8';
        return;
    }

    // เรียงตาม Rev
    filteredHeaders.sort((a, b) => a.rev_no - b.rev_no);

    filteredHeaders.forEach(h => {
        const btn = document.createElement('button');
        btn.className = `sub-tab ${pfState.currentRev === h.rev_no ? 'active' : ''}`;
        btn.innerText = `Rev.${String(h.rev_no).padStart(2, '0')}`;
        btn.onclick = () => {
            pfState.currentRev = h.rev_no;
            pfState.currentHeaderId = h.id;
            renderRevTabs();
            loadForecastDetails();
        };
        container.appendChild(btn);
    });

    // ตั้งค่า Header ID เริ่มต้น (ถ้ายังไม่มี หรือ ID ไม่อยู่ในลิสต์)
    if (!pfState.currentHeaderId || !filteredHeaders.find(h => h.id === pfState.currentHeaderId)) {
        const latest = filteredHeaders[filteredHeaders.length - 1];
        pfState.currentRev = latest.rev_no;
        pfState.currentHeaderId = latest.id;
    }

    loadForecastDetails();
}

// ==========================================
// 5. โหลดรายละเอียดของ Rev ที่เลือก
// ==========================================
async function loadForecastDetails() {
    if (!pfState.currentHeaderId) return;

    const header = pfState.headers.find(h => h.id === pfState.currentHeaderId);
    if (!header) return;

    // อัปเดตสถานะ UI (ปุ่ม Lock/Unlock)
    updateUIBasedOnStatus(header);

    // อัปเดตหมายเหตุ
    const remarkEl = document.getElementById('pf-remark');
    if (remarkEl) remarkEl.value = header.remark || '';

    const { data, error } = await supabase
        .from('purchase_forecast_details')
        .select('*')
        .eq('header_id', pfState.currentHeaderId);

    if (error) return showToast('โหลดรายละเอียดไม่สำเร็จ: ' + error.message, 'err');

    pfState.details = data || [];
    renderForecastTable();
}

// ==========================================
// 6. Render ตาราง 22 แถว (Sticky Header + Sticky Column)
// ==========================================
function renderForecastTable() {
    const thead = document.getElementById('pf-thead');
    const tbody = document.getElementById('pf-tbody');
    if (!thead || !tbody) return;

    // สร้าง Header (Size)
    let headHtml = `<tr><th style="position: sticky; left: 0; background: #2b4b9b; z-index: 11; min-width: 220px;">รายการ</th>`;
    pfState.masterSizes.forEach(s => headHtml += `<th style="min-width: 70px;">${s}</th>`);
    headHtml += `<th style="min-width: 90px;">Total</th></tr>`;
    thead.innerHTML = headHtml;

    // รายชื่อแถวทั้ง 22 แถว
    const rows = [
        { id: 'm1_val', label: '1. การใช้ม้วน (ทั่วไป) ย้อนหลัง 3 เดือน (เดือน 1)', type: 'date-dropdown' },
        { id: 'm2_val', label: '2. การใช้ม้วน (ทั่วไป) ย้อนหลัง 3 เดือน (เดือน 2)', type: 'date-dropdown' },
        { id: 'm3_val', label: '3. การใช้ม้วน (ทั่วไป) ย้อนหลัง 3 เดือน (เดือน 3)', type: 'date-dropdown' },
        { id: 'avg3', label: '4. การใช้ม้วน (ทั่วไป) เฉลี่ย 3 เดือน', type: 'calc' },
        { id: 'cust1', label: '5. จำนวนม้วน - ลูกค้า Forecast 1', type: 'customer-dropdown' },
        { id: 'cust2', label: '6. จำนวนม้วน - ลูกค้า Forecast 2', type: 'customer-dropdown' },
        { id: 'cust3', label: '7. จำนวนม้วน - ลูกค้า Forecast 3', type: 'customer-dropdown' },
        { id: 'cust4', label: '8. จำนวนม้วน - ลูกค้า Forecast 4', type: 'customer-dropdown' },
        { id: 'cust5', label: '9. จำนวนม้วน - ลูกค้า Forecast 5', type: 'customer-dropdown' },
        { id: 'stock_level', label: '10. ระดับ Stock เดือน', type: 'date-dropdown' },
        { id: 'stock_pct', label: '11. % ของระดับ Stock', type: 'percent-input' },
        { id: 'pre_stock_use', label: '12. ประมาณการใช้ม้วนเดือน (ก่อนหัก Stock)', type: 'calc' },
        { id: 'stock_date', label: '13. Stock ณ วันที่', type: 'date-picker' },
        { id: 'receive_date', label: '14. รับม้วนกระดาษ ณ วันที่', type: 'date-picker' },
        { id: 'reserve_date', label: '15. ยอดจองคงเหลือ ณ วันที่', type: 'date-picker' },
        { id: 'total_remain', label: '16. ม้วนกระดาษคงเหลือรวมยอดจอง', type: 'calc' },
        { id: 'prev_use', label: '17. ประมาณการใช้ม้วนเดือน (เลือกเดือน)', type: 'date-dropdown' },
        { id: 'post_stock_use', label: '18. ม้วนกระดาษคงเหลือ หักประมาณการใช้', type: 'calc' },
        { id: 'post_stock_use_calc', label: '19. ประมาณการใช้ม้วนเดือน (หลังหัก Stock)', type: 'calc' },
        { id: 'adjust_plus', label: '20. ปรับเพิ่มจำนวน (+)', type: 'input' },
        { id: 'adjust_minus', label: '21. ปรับลดจำนวน (-)', type: 'input' },
        { id: 'final_order', label: '22. สรุปประมาณการสั่งซื้อม้วนเดือน', type: 'calc' }
    ];

    let bodyHtml = '';
    rows.forEach(r => {
        bodyHtml += `<tr><td style="position: sticky; left: 0; background: #f8fafc; font-weight: bold; z-index: 5; border-right: 1px solid #ddd; font-size: 13px; padding: 8px;">${r.label}</td>`;

        pfState.masterSizes.forEach(s => {
            const detail = pfState.details.find(d => Number(d.size) === Number(s)) || {};
            const val = detail[r.id] !== undefined ? detail[r.id] : '';

            if (r.type === 'calc') {
                bodyHtml += `<td class="calc-cell" data-size="${s}" data-field="${r.id}" style="text-align: right; background: #f1f5f9; padding: 5px;">0.00</td>`;
            } else if (r.type === 'input' || r.type === 'percent-input') {
                bodyHtml += `<td style="padding: 2px;"><input type="number" class="form-control pf-input" data-size="${s}" data-field="${r.id}" value="${val}" style="width: 100%; text-align: right; border: 1px solid #cbd5e1; padding: 4px;" step="0.01"></td>`;
            } else {
                // Dropdown หรือ date picker (แบบง่าย - ในอนาคตสามารถเปลี่ยนเป็น Flatpickr)
                bodyHtml += `<td style="padding: 2px;"><input type="text" class="form-control pf-input" data-size="${s}" data-field="${r.id}" value="${val}" style="width: 100%; border: 1px solid #cbd5e1; padding: 4px;" placeholder="เลือก..."></td>`;
            }
        });

        bodyHtml += `<td class="calc-total-cell" data-field="${r.id}" style="text-align: right; background: #e2e8f0; font-weight: bold; padding: 5px;">0.00</td></tr>`;
    });

    tbody.innerHTML = bodyHtml;

    // ผูก Event การคำนวณเมื่อมีการพิมพ์
    document.querySelectorAll('.pf-input').forEach(inp => {
        inp.addEventListener('input', (e) => pfRecalculateRow(e.target.dataset.size));
        inp.addEventListener('change', (e) => pfRecalculateRow(e.target.dataset.size));
    });

    // คำนวณครั้งแรก
    pfState.masterSizes.forEach(s => pfRecalculateRow(s));
}

// ==========================================
// 7. คำนวณ 22 แถว (Logic)
// ==========================================
function pfRecalculateRow(size) {
    const getVal = (field) => {
        const el = document.querySelector(`.pf-input[data-size="${size}"][data-field="${field}"]`);
        return el ? (Number(el.value) || 0) : 0;
    };

    // ⚠️ หมายเหตุ: ในระบบจริง ต้องดึงข้อมูลจาก DB ตามวันที่ที่เลือก
    // แต่ในที่นี้ผมจะใช้ค่าที่ผู้ใช้กรอกเพื่อให้เห็น Logic การคำนวณ
    
    // 1-3. การใช้ม้วน 3 เดือน
    const m1 = getVal('m1_val');
    const m2 = getVal('m2_val');
    const m3 = getVal('m3_val');
    
    // 4. เฉลี่ย 3 เดือน
    const avg3 = (m1 + m2 + m3) / 3;

    // 5-9. ลูกค้า Forecast
    const cust1 = getVal('cust1');
    const cust2 = getVal('cust2');
    const cust3 = getVal('cust3');
    const cust4 = getVal('cust4');
    const cust5 = getVal('cust5');
    const totalCust = cust1 + cust2 + cust3 + cust4 + cust5;

    // 10-11. Stock Level & %
    const stockLevel = getVal('stock_level');
    const stockPct = getVal('stock_pct') || 50;
    const stockCalc = stockLevel * (stockPct / 100);

    // 12. ประมาณการใช้ม้วน (ก่อนหัก Stock) = 4 + 5-9 + 11
    const preStockUse = avg3 + totalCust + stockCalc;

    // 13-15. ข้อมูล Stock / รับ / จอง (สมมติว่าดึงจาก DB ตามวันที่)
    const stockDate = getVal('stock_date');       // ต้องดึงจาก DB
    const receiveDate = getVal('receive_date');   // ต้องดึงจาก DB
    const reserveDate = getVal('reserve_date');   // ต้องดึงจาก DB
    
    // 16. ม้วนกระดาษคงเหลือรวมยอดจอง = 13 + 14 + 15
    const totalRemain = stockDate + receiveDate + reserveDate;

    // 17. ประมาณการใช้ม้วนเดือน (เลือกเดือน) - ดึงจาก Rev ล่าสุด
    const prevUse = getVal('prev_use');

    // 18. ม้วนกระดาษคงเหลือ หักประมาณการใช้ = 16 - 17
    const postStockUse = totalRemain - prevUse;

    // 19. ประมาณการใช้ม้วนเดือน (หลังหัก Stock) = 12 - 18
    const postStockUseCalc = preStockUse - postStockUse;

    // 20-21. ปรับเพิ่ม / ปรับลด
    const adjustPlus = getVal('adjust_plus');
    const adjustMinus = getVal('adjust_minus');

    // 22. สรุปประมาณการสั่งซื้อ = IF(19 < 0, 0, ROUNDUP(19, 0)) + 20 - 21
    let finalOrder = postStockUseCalc < 0 ? 0 : Math.ceil(postStockUseCalc);
    finalOrder = finalOrder + adjustPlus - adjustMinus;

    // อัปเดตค่าลงตาราง
    document.querySelector(`.calc-cell[data-size="${size}"][data-field="avg3"]`).innerText = avg3.toFixed(2);
    document.querySelector(`.calc-cell[data-size="${size}"][data-field="pre_stock_use"]`).innerText = preStockUse.toFixed(2);
    document.querySelector(`.calc-cell[data-size="${size}"][data-field="total_remain"]`).innerText = totalRemain.toFixed(2);
    document.querySelector(`.calc-cell[data-size="${size}"][data-field="post_stock_use"]`).innerText = postStockUse.toFixed(2);
    document.querySelector(`.calc-cell[data-size="${size}"][data-field="post_stock_use_calc"]`).innerText = postStockUseCalc.toFixed(2);

    const finalCell = document.querySelector(`.calc-cell[data-size="${size}"][data-field="final_order"]`);
    finalCell.innerText = finalOrder.toFixed(2);

    // ตรวจสอบค่าติดลบ (Validation)
    if (finalOrder < 0) {
        finalCell.style.color = 'red';
        finalCell.style.fontWeight = 'bold';
        // แจ้งเตือน (อาจจะใช้ Toast หรือแสดงข้อความใต้ช่อง)
        // showToast(`⚠️ Size ${size}: จำนวนม้วนไม่เพียงพอต่อการลดจำนวน (ติดลบ)`, 'warn');
    } else {
        finalCell.style.color = 'black';
        finalCell.style.fontWeight = 'normal';
    }

    // อัปเดต Total แนวตั้ง
    updateColumnTotal();
}

// ==========================================
// 8. อัปเดต Total แนวตั้ง (ด้านล่างของแต่ละคอลัมน์)
// ==========================================
function updateColumnTotal() {
    // คำนวณ Total ของแต่ละแถว (แนวตั้ง)
    const fields = ['m1_val', 'm2_val', 'm3_val', 'avg3', 'cust1', 'cust2', 'cust3', 'cust4', 'cust5', 'stock_level', 'pre_stock_use', 'stock_date', 'receive_date', 'reserve_date', 'total_remain', 'prev_use', 'post_stock_use', 'post_stock_use_calc', 'adjust_plus', 'adjust_minus', 'final_order'];
    
    fields.forEach(field => {
        let sum = 0;
        document.querySelectorAll(`.calc-cell[data-field="${field}"]`).forEach(cell => {
            sum += Number(cell.innerText) || 0;
        });
        const totalEl = document.querySelector(`.calc-total-cell[data-field="${field}"]`);
        if (totalEl) totalEl.innerText = sum.toFixed(2);
    });
}

// ==========================================
// 9. สร้าง Forecast ใหม่ (Modal)
// ==========================================
function openCreateForecastModal() {
    document.getElementById('new-fc-grade').value = '';
    document.getElementById('new-fc-month').value = '';
    document.getElementById('new-fc-docno').value = '';
    openModal('modal-create-forecast');
}

async function confirmCreateForecast() {
    const grade = document.getElementById('new-fc-grade').value.trim().toUpperCase();
    const month = document.getElementById('new-fc-month').value;
    const docNo = document.getElementById('new-fc-docno').value.trim();

    if (!grade || !month || !docNo) {
        return showToast('กรุณากรอกข้อมูลให้ครบถ้วน', 'warn');
    }

    // ตรวจสอบว่ามีเอกสารนี้ในเดือนนี้หรือยัง (เพื่อรัน Rev.)
    const { data: existing } = await supabase
        .from('purchase_forecast_headers')
        .select('id, rev_no')
        .eq('doc_no', docNo)
        .eq('forecast_month', month)
        .eq('grade_group', grade.replace(/[0-9]/g, '')); // เช่น CA125 -> CA

    let revNo = 0;
    if (existing && existing.length > 0) {
        revNo = Math.max(...existing.map(e => e.rev_no)) + 1;
    }

    // บันทึก Header
    const { data: newHeader, error } = await supabase
        .from('purchase_forecast_headers')
        .insert({
            doc_no: docNo,
            rev_no: revNo,
            forecast_month: month,
            grade_group: grade.replace(/[0-9]/g, ''),
            status: 'draft',
            created_by: currentUser?.email || 'Unknown'
        })
        .select()
        .single();

    if (error) return showToast('สร้างไม่สำเร็จ: ' + error.message, 'err');

    showToast(`สร้างประมาณการ ${grade} เดือน ${month} Rev.${String(revNo).padStart(2, '0')} สำเร็จ`, 'ok');
    closeModal('modal-create-forecast');

    // โหลดใหม่
    await loadForecastHeaders();
}

// ==========================================
// 10. บันทึกและ Lock
// ==========================================
async function savePurchaseForecast() {
    if (!pfState.currentHeaderId) return showToast('ไม่มีข้อมูลให้บันทึก', 'warn');

    const header = pfState.headers.find(h => h.id === pfState.currentHeaderId);
    if (!header) return;

    // รวบรวมข้อมูลจากตาราง
    const details = pfState.masterSizes.map(size => {
        const getVal = (field) => {
            const el = document.querySelector(`.pf-input[data-size="${size}"][data-field="${field}"]`);
            return el ? Number(el.value) || 0 : 0;
        };
        return {
            header_id: pfState.currentHeaderId,
            size: size,
            m1_val: getVal('m1_val'),
            m2_val: getVal('m2_val'),
            m3_val: getVal('m3_val'),
            avg3: getVal('avg3'),
            cust1: getVal('cust1'),
            cust2: getVal('cust2'),
            cust3: getVal('cust3'),
            cust4: getVal('cust4'),
            cust5: getVal('cust5'),
            stock_level: getVal('stock_level'),
            stock_pct: getVal('stock_pct'),
            pre_stock_use: getVal('pre_stock_use'),
            stock_date: getVal('stock_date') || null,
            receive_date: getVal('receive_date') || null,
            reserve_date: getVal('reserve_date') || null,
            total_remain: getVal('total_remain'),
            prev_use: getVal('prev_use'),
            post_stock_use: getVal('post_stock_use'),
            post_stock_use_calc: getVal('post_stock_use_calc'),
            adjust_plus: getVal('adjust_plus'),
            adjust_minus: getVal('adjust_minus'),
            final_order: getVal('final_order')
        };
    });

    // บันทึก Details
    const { error: detailErr } = await supabase
        .from('purchase_forecast_details')
        .upsert(details, { onConflict: 'header_id,size' });

    if (detailErr) return showToast('บันทึกรายละเอียดไม่สำเร็จ: ' + detailErr.message, 'err');

    // อัปเดตสถานะ Header เป็น Locked + หมายเหตุ
    const remark = document.getElementById('pf-remark')?.value || '';
    const { error: headErr } = await supabase
        .from('purchase_forecast_headers')
        .update({ status: 'locked', remark: remark })
        .eq('id', pfState.currentHeaderId);

    if (headErr) return showToast('อัปเดตสถานะไม่สำเร็จ: ' + headErr.message, 'err');

    showToast('บันทึกและ Lock สำเร็จ', 'ok');
    await loadForecastHeaders(); // โหลดใหม่เพื่ออัปเดต UI
}

// ==========================================
// 11. ปลดล็อก (ใส่รหัสผ่าน)
// ==========================================
async function unlockForecast() {
    const password = prompt('กรุณาใส่รหัสผ่านเพื่อแก้ไข:');
    if (!password) return;

    // ⚠️ ใช้ฟังก์ชันตรวจสอบรหัสเดียวกับระบบ PO (สมมติว่ามีฟังก์ชัน verifyPassword ใน app.js)
    // ในระบบจริงคุณอาจจะเรียก RPC หรือเช็คจากตาราง profiles
    // ตัวอย่างการเช็คแบบง่าย:
    let isValid = false;
    if (typeof verifyPassword === 'function') {
        isValid = await verifyPassword(password);
    } else {
        // Fallback สำหรับการทดสอบ
        isValid = (password === '1234');
    }

    if (!isValid) return showToast('รหัสผ่านไม่ถูกต้อง', 'err');

    // เปลี่ยนสถานะเป็น draft
    await supabase.from('purchase_forecast_headers').update({ status: 'draft' }).eq('id', pfState.currentHeaderId);
    showToast('ปลดล็อกสำเร็จ', 'ok');
    await loadForecastHeaders();
}

// ==========================================
// 12. อัปเดต UI ตามสถานะ (Lock / Unlock)
// ==========================================
function updateUIBasedOnStatus(header) {
    const isLocked = header.status === 'locked' || header.status === 'approved';
    pfState.isLocked = isLocked;

    // Disable/Enable Input ทุกตัว
    document.querySelectorAll('.pf-input').forEach(inp => inp.disabled = isLocked);

    const btnEdit = document.getElementById('pf-btn-edit');
    const btnSave = document.getElementById('pf-btn-save');
    const btnRevise = document.getElementById('pf-btn-revise');
    const badge = document.getElementById('pf-status-badge');

    if (btnEdit) btnEdit.disabled = !isLocked;
    if (btnSave) btnSave.disabled = isLocked;
    if (btnRevise) btnRevise.style.display = isLocked ? 'inline-block' : 'none';

    if (badge) {
        badge.innerText = `สถานะ: ${header.status.toUpperCase()}`;
        badge.style.background = isLocked ? '#dc2626' : '#f59e0b';
    }
}

// ==========================================
// 13. สร้าง Revise (Copy ข้อมูลจาก Rev ก่อนหน้า)
// ==========================================
async function createRevision() {
    const currentHeader = pfState.headers.find(h => h.id === pfState.currentHeaderId);
    if (!currentHeader) return;

    const newRev = currentHeader.rev_no + 1;

    // สร้าง Header ใหม่
    const { data: newHeader, error } = await supabase
        .from('purchase_forecast_headers')
        .insert({
            doc_no: currentHeader.doc_no,
            rev_no: newRev,
            forecast_month: currentHeader.forecast_month,
            grade_group: currentHeader.grade_group,
            status: 'draft',
            created_by: currentUser?.email || 'Unknown'
        })
        .select()
        .single();

    if (error) return showToast('สร้าง Revise ไม่สำเร็จ: ' + error.message, 'err');

    // Copy Details
    const newDetails = pfState.details.map(d => {
        const copy = { ...d };
        delete copy.id;
        copy.header_id = newHeader.id;
        return copy;
    });

    if (newDetails.length > 0) {
        const { error: detailErr } = await supabase.from('purchase_forecast_details').insert(newDetails);
        if (detailErr) return showToast('Copy รายละเอียดไม่สำเร็จ: ' + detailErr.message, 'err');
    }

    showToast(`สร้าง Rev.${String(newRev).padStart(2, '0')} สำเร็จ`, 'ok');
    await loadForecastHeaders();
}

// ==========================================
// 14. แนบไฟล์ (อัปโหลดไป Supabase Storage)
// ==========================================
async function handleFileUpload(event) {
    const files = event.target.files;
    if (!files.length) return;

    const header = pfState.headers.find(h => h.id === pfState.currentHeaderId);
    if (!header) return;

    showToast('กำลังอัปโหลด...', 'info');

    const uploadedUrls = [];
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileName = `${Date.now()}_${file.name}`;

        const { data, error } = await supabase.storage
            .from('forecast-attachments')
            .upload(fileName, file);

        if (error) {
            showToast('อัปโหลดไม่สำเร็จ: ' + error.message, 'err');
            return;
        }

        const { data: publicUrl } = supabase.storage.from('forecast-attachments').getPublicUrl(fileName);
        uploadedUrls.push(publicUrl.publicUrl);
    }

    // อัปเดต DB (แนบไฟล์แล้ว Lock ถาวร)
    const currentAttachments = header.attachments || [];
    const newAttachments = [...currentAttachments, ...uploadedUrls];

    await supabase
        .from('purchase_forecast_headers')
        .update({ attachments: newAttachments, status: 'approved' }) // Lock ถาวร
        .eq('id', header.id);

    showToast('แนบไฟล์และ Lock ถาวรสำเร็จ', 'ok');
    await loadForecastHeaders();
}
