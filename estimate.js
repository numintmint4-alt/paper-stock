// ==========================================
// estimate.js - Production Forecast V3 (Final)
// ==========================================

const pfState = {
    currentGrade: 'CA',
    currentRev: 0,
    currentHeaderId: null,
    headers: [],
    details: [],
    masterSizes: [],
    isLocked: false
};

// 1. Init
async function initForecastTab() {
    const tbody = document.getElementById('pf-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="30" style="text-align:center;">กำลังโหลดข้อมูล...</td></tr>';

    // ดึง Master Sizes
    if (typeof masterCache !== 'undefined' && masterCache.length > 0) {
        const sizes = [...new Set(masterCache.map(m => Number(m.size)))];
        pfState.masterSizes = sizes.sort((a, b) => a - b);
    } else {
        pfState.masterSizes = [34, 36, 38, 40, 42, 44, 46, 48, 50, 52, 54, 56, 58, 60, 62, 64, 66, 68, 70, 72, 74, 76, 78, 80, 82, 84, 86, 88, 90, 92, 94, 96, 98];
    }

    await loadForecastHeaders();
}

// 2. Load Headers
async function loadForecastHeaders() {
    const { data, error } = await supabase
        .from('purchase_forecast_headers')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) return showToast('โหลดข้อมูลไม่สำเร็จ: ' + error.message, 'err');
    
    pfState.headers = data || [];
    renderGradeTabs();
    renderRevSidebar();
}

// 3. Render Grade Tabs
function renderGradeTabs() {
    const groups = ['CA', 'KA', 'KK', 'KI', 'FSC'];
    const container = document.getElementById('pf-grade-tabs');
    if (!container) return;

    container.innerHTML = '';
    groups.forEach(g => {
        const btn = document.createElement('button');
        btn.className = `pf-tab-btn ${pfState.currentGrade === g ? 'active' : ''}`;
        btn.innerText = g;
        btn.onclick = () => {
            pfState.currentGrade = g;
            pfState.currentRev = 0;
            pfState.currentHeaderId = null;
            renderGradeTabs();
            renderRevSidebar();
        };
        container.appendChild(btn);
    });
}

// 4. Render Rev Sidebar
function renderRevSidebar() {
    const container = document.getElementById('pf-rev-sidebar');
    if (!container) return;

    container.innerHTML = '';
    const filtered = pfState.headers.filter(h => h.grade_group === pfState.currentGrade);

    if (filtered.length === 0) {
        container.innerHTML = '<div style="padding: 10px; color: #64748b; font-size: 12px; text-align: center;">ไม่มีข้อมูล</div>';
        document.getElementById('pf-tbody').innerHTML = '<tr><td colspan="30" style="text-align:center; padding: 20px;">กรุณากดปุ่ม "จัดทำประมาณการสั่งซื้อ" เพื่อเริ่มต้น</td></tr>';
        document.getElementById('pf-status-badge').innerText = 'สถานะ: -';
        return;
    }

    filtered.sort((a, b) => a.rev_no - b.rev_no);

    filtered.forEach(h => {
        const btn = document.createElement('button');
        btn.className = `pf-rev-btn ${pfState.currentRev === h.rev_no ? 'active' : ''}`;
        btn.innerHTML = `<span style="writing-mode: vertical-rl; transform: rotate(180deg);">Rev.${String(h.rev_no).padStart(2, '0')}</span>`;
        btn.onclick = () => {
            pfState.currentRev = h.rev_no;
            pfState.currentHeaderId = h.id;
            renderRevSidebar();
        };
        container.appendChild(btn);
    });

    if (!pfState.currentHeaderId || !filtered.find(h => h.id === pfState.currentHeaderId)) {
        const latest = filtered[filtered.length - 1];
        pfState.currentRev = latest.rev_no;
        pfState.currentHeaderId = latest.id;
    }

    loadForecastDetails();
}

// 5. Load Details
async function loadForecastDetails() {
    if (!pfState.currentHeaderId) return;

    const header = pfState.headers.find(h => h.id === pfState.currentHeaderId);
    if (!header) return;

    updateUIBasedOnStatus(header);
    
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

// 6. Render Table (22 Rows)
function renderForecastTable() {
    const thead = document.getElementById('pf-thead');
    const tbody = document.getElementById('pf-tbody');
    if (!thead || !tbody) return;

    // Header Size
    let headHtml = `<tr><th class="pf-sticky-col" style="min-width: 250px;">รายการ</th>`;
    pfState.masterSizes.forEach(s => headHtml += `<th style="min-width: 70px;">${s}</th>`);
    headHtml += `</tr>`;
    thead.innerHTML = headHtml;

    const rows = [
        { id: 'm1_val', label: 'การใช้ม้วน (ทั่วไป) ย้อนหลัง 3 เดือน (เดือน 1)', type: 'date-dropdown' },
        { id: 'm2_val', label: 'การใช้ม้วน (ทั่วไป) ย้อนหลัง 3 เดือน (เดือน 2)', type: 'date-dropdown' },
        { id: 'm3_val', label: 'การใช้ม้วน (ทั่วไป) ย้อนหลัง 3 เดือน (เดือน 3)', type: 'date-dropdown' },
        { id: 'avg3', label: 'การใช้ม้วน (ทั่วไป) เฉลี่ย 3 เดือน', type: 'calc' },
        { id: 'cust1', label: 'จำนวนม้วน - ลูกค้า Forecast 1', type: 'customer-dropdown' },
        { id: 'cust2', label: 'จำนวนม้วน - ลูกค้า Forecast 2', type: 'customer-dropdown' },
        { id: 'cust3', label: 'จำนวนม้วน - ลูกค้า Forecast 3', type: 'customer-dropdown' },
        { id: 'cust4', label: 'จำนวนม้วน - ลูกค้า Forecast 4', type: 'customer-dropdown' },
        { id: 'cust5', label: 'จำนวนม้วน - ลูกค้า Forecast 5', type: 'customer-dropdown' },
        { id: 'stock_level', label: 'ระดับ Stock เดือน', type: 'date-dropdown' },
        { id: 'stock_pct', label: '% ของระดับ Stock', type: 'percent-input' },
        { id: 'pre_stock_use', label: 'ประมาณการใช้ม้วนเดือน (ก่อนหัก Stock)', type: 'calc' },
        { id: 'stock_date', label: 'Stock ณ วันที่', type: 'date-picker' },
        { id: 'receive_date', label: 'รับม้วนกระดาษ ณ วันที่', type: 'date-picker' },
        { id: 'reserve_date', label: 'ยอดจองคงเหลือ ณ วันที่', type: 'date-picker' },
        { id: 'total_remain', label: 'ม้วนกระดาษคงเหลือรวมยอดจอง', type: 'calc' },
        { id: 'prev_use', label: 'ประมาณการใช้ม้วนเดือน (เลือกเดือน)', type: 'date-dropdown' },
        { id: 'post_stock_use', label: 'ม้วนกระดาษคงเหลือ หักประมาณการใช้', type: 'calc' },
        { id: 'post_stock_use_calc', label: 'ประมาณการใช้ม้วนเดือน (หลังหัก Stock)', type: 'calc' },
        { id: 'adjust_plus', label: 'ปรับเพิ่มจำนวน (+)', type: 'input' },
        { id: 'adjust_minus', label: 'ปรับลดจำนวน (-)', type: 'input' },
        { id: 'final_order', label: 'สรุปประมาณการสั่งซื้อม้วนเดือน', type: 'calc' }
    ];

    let bodyHtml = '';
    rows.forEach(r => {
        bodyHtml += `<tr><td class="pf-sticky-col">${r.label}</td>`;
        pfState.masterSizes.forEach(s => {
            const detail = pfState.details.find(d => Number(d.size) === Number(s)) || {};
            const val = detail[r.id] !== undefined ? detail[r.id] : '';

            if (r.type === 'calc') {
                bodyHtml += `<td class="calc-cell" data-size="${s}" data-field="${r.id}" style="text-align: right;">0.00</td>`;
            } else if (r.type === 'input' || r.type === 'percent-input') {
                bodyHtml += `<td><input type="number" class="pf-input" data-size="${s}" data-field="${r.id}" value="${val}" step="0.01"></td>`;
            } else {
                bodyHtml += `<td><input type="text" class="pf-input" data-size="${s}" data-field="${r.id}" value="${val}" placeholder="เลือก..."></td>`;
            }
        });
        bodyHtml += `</tr>`;
    });

    tbody.innerHTML = bodyHtml;

    // ผูก Event
    document.querySelectorAll('.pf-input').forEach(inp => {
        inp.addEventListener('input', (e) => pfRecalculateRow(e.target.dataset.size));
    });

    pfState.masterSizes.forEach(s => pfRecalculateRow(s));
}

// 7. Calculate Logic
function pfRecalculateRow(size) {
    const getVal = (field) => {
        const el = document.querySelector(`.pf-input[data-size="${size}"][data-field="${field}"]`);
        return el ? (Number(el.value) || 0) : 0;
    };

    const m1 = getVal('m1_val');
    const m2 = getVal('m2_val');
    const m3 = getVal('m3_val');
    const avg3 = (m1 + m2 + m3) / 3;

    const cust1 = getVal('cust1');
    const cust2 = getVal('cust2');
    const cust3 = getVal('cust3');
    const cust4 = getVal('cust4');
    const cust5 = getVal('cust5');
    const totalCust = cust1 + cust2 + cust3 + cust4 + cust5;

    const stockLevel = getVal('stock_level');
    const stockPct = getVal('stock_pct') || 50;
    const stockCalc = stockLevel * (stockPct / 100);

    const preStockUse = avg3 + totalCust + stockCalc;

    const stockDate = getVal('stock_date'); 
    const receiveDate = getVal('receive_date'); 
    const reserveDate = getVal('reserve_date'); 
    
    const totalRemain = stockDate + receiveDate + reserveDate;
    const prevUse = getVal('prev_use');
    const postStockUse = totalRemain - prevUse;
    const postStockUseCalc = preStockUse - postStockUse;

    const adjustPlus = getVal('adjust_plus');
    const adjustMinus = getVal('adjust_minus');

    let finalOrder = postStockUseCalc < 0 ? 0 : Math.ceil(postStockUseCalc);
    finalOrder = finalOrder + adjustPlus - adjustMinus;

    // Update DOM
    document.querySelector(`.calc-cell[data-size="${size}"][data-field="avg3"]`).innerText = avg3.toFixed(2);
    document.querySelector(`.calc-cell[data-size="${size}"][data-field="pre_stock_use"]`).innerText = preStockUse.toFixed(2);
    document.querySelector(`.calc-cell[data-size="${size}"][data-field="total_remain"]`).innerText = totalRemain.toFixed(2);
    document.querySelector(`.calc-cell[data-size="${size}"][data-field="post_stock_use"]`).innerText = postStockUse.toFixed(2);
    document.querySelector(`.calc-cell[data-size="${size}"][data-field="post_stock_use_calc"]`).innerText = postStockUseCalc.toFixed(2);
    document.querySelector(`.calc-cell[data-size="${size}"][data-field="final_order"]`).innerText = finalOrder.toFixed(2);
}

// 8. Modal Functions
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

    if (!grade || !month || !docNo) return showToast('กรุณากรอกข้อมูลให้ครบถ้วน', 'warn');

    const { data: existing } = await supabase
        .from('purchase_forecast_headers')
        .select('id, rev_no')
        .eq('doc_no', docNo)
        .eq('forecast_month', month)
        .eq('grade_group', grade.replace(/[0-9]/g, ''));

    let revNo = 0;
    if (existing && existing.length > 0) {
        revNo = Math.max(...existing.map(e => e.rev_no)) + 1;
    }

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
        .select().single();

    if (error) return showToast('สร้างไม่สำเร็จ: ' + error.message, 'err');

    showToast(`สร้างประมาณการ ${grade} เดือน ${month} Rev.${String(revNo).padStart(2, '0')} สำเร็จ`, 'ok');
    closeModal('modal-create-forecast');
    await loadForecastHeaders();
}

// 9. Save & Lock
async function savePurchaseForecast() {
    if (!pfState.currentHeaderId) return showToast('ไม่มีข้อมูลให้บันทึก', 'warn');

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
            adjust_plus: getVal('adjust_plus'),
            adjust_minus: getVal('adjust_minus'),
            final_order: getVal('final_order')
        };
    });

    const { error: detailErr } = await supabase
        .from('purchase_forecast_details')
        .upsert(details, { onConflict: 'header_id,size' });

    if (detailErr) return showToast('บันทึกรายละเอียดไม่สำเร็จ: ' + detailErr.message, 'err');

    const remark = document.getElementById('pf-remark')?.value || '';
    const { error: headErr } = await supabase
        .from('purchase_forecast_headers')
        .update({ status: 'locked', remark: remark })
        .eq('id', pfState.currentHeaderId);

    if (headErr) return showToast('อัปเดตสถานะไม่สำเร็จ: ' + headErr.message, 'err');

    showToast('บันทึกและล็อคสำเร็จ', 'ok');
    await loadForecastHeaders();
}

// 10. Unlock (ใช้รหัสเดียวกับ PO)
async function unlockForecast() {
    const password = prompt('กรุณาใส่รหัสผ่านเพื่อแก้ไข:');
    if (!password) return;

    let isValid = false;
    if (typeof verifyPassword === 'function') {
        isValid = await verifyPassword(password);
    } else {
        isValid = (password === '1234'); // Fallback
    }

    if (!isValid) return showToast('รหัสผ่านไม่ถูกต้อง', 'err');

    await supabase.from('purchase_forecast_headers').update({ status: 'draft' }).eq('id', pfState.currentHeaderId);
    showToast('ปลดล็อกสำเร็จ', 'ok');
    await loadForecastHeaders();
}

// 11. Update UI
function updateUIBasedOnStatus(header) {
    const isLocked = header.status === 'locked' || header.status === 'approved';
    pfState.isLocked = isLocked;

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
        badge.style.color = '#fff';
    }
}

// 12. Create Revise
async function createRevision() {
    const currentHeader = pfState.headers.find(h => h.id === pfState.currentHeaderId);
    if (!currentHeader) return;

    const newRev = currentHeader.rev_no + 1;

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
        .select().single();

    if (error) return showToast('สร้าง Revise ไม่สำเร็จ: ' + error.message, 'err');

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

// 13. Upload File
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
        const { error } = await supabase.storage.from('forecast-attachments').upload(fileName, file);

        if (error) return showToast('อัปโหลดไม่สำเร็จ: ' + error.message, 'err');

        const { data: publicUrl } = supabase.storage.from('forecast-attachments').getPublicUrl(fileName);
        uploadedUrls.push(publicUrl.publicUrl);
    }

    const currentAttachments = header.attachments || [];
    const newAttachments = [...currentAttachments, ...uploadedUrls];

    await supabase.from('purchase_forecast_headers').update({ attachments: newAttachments, status: 'approved' }).eq('id', header.id);

    showToast('แนบไฟล์และล็อคถาวรสำเร็จ', 'ok');
    await loadForecastHeaders();
}
