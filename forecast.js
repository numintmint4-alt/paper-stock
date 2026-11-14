// ==========================================
// reservations.js - ระบบจองม้วนกระดาษ (Roll Reservations)
// แก้ไข: Matrix แสดงจาก Master Data + Supplier เลือกใน Modal
// + ระบบปรับลด/คืนยอดจอง (Decrease / Return)
// + Auto-load Master Data (ensureMasterDataLoaded)
// + Fix: เปลี่ยนตาราง Master เป็น 'paper_specs'
// + Fix: แสดงค่าติดลบใน Matrix (val !== 0)
// + NEW: Export Form / Export Data / Import Excel
// ==========================================

let resState = {
    data: [],
    gradeFilter: 'ALL'
};

// ==========================================
// ฟังก์ชันสำหรับโหลด Master Data (ถ้ายังไม่มีในหน่วยความจำ)
// ==========================================
async function ensureMasterDataLoaded() {
    // ถ้ามีข้อมูลอยู่แล้ว ไม่ต้องโหลดซ้ำ
    if (typeof fcState !== 'undefined' && fcState.masterData && fcState.masterData.length > 0) {
        return;
    }

    try {
        console.log("⏳ กำลังโหลด Master Data สำหรับหน้า Reservations...");
        // ✅ FIX: เปลี่ยนชื่อตารางจาก 'paper_master' → 'paper_specs'
        const { data, error } = await supabase
            .from('paper_specs')
            .select('*');

        if (error) throw error;

        if (typeof fcState !== 'undefined') {
            fcState.masterData = data || [];
            console.log("✅ โหลด Master Data สำเร็จ:", fcState.masterData.length, "รายการ");
        }
    } catch (err) {
        console.error("❌ โหลด Master Data ล้มเหลว:", err.message);
        showToast('ไม่สามารถโหลด Master Data ได้', 'err');
    }
}

// ==========================================
// 8.1 ฟังก์ชันโหลดข้อมูลหลัก
// ==========================================
async function loadReservations() {
    const tbody = document.getElementById('res-tbody');
    const thead = document.getElementById('res-thead');
    if (!tbody || !thead) return;

    tbody.innerHTML = '<tr><td colspan="100%" style="text-align:center;padding:20px;">กำลังโหลด...</td></tr>';

    try {
        // 👇 ให้โหลด Master Data อัตโนมัติก่อนวาดตาราง
        await ensureMasterDataLoaded();

        const { data, error } = await supabase
            .from('roll_reservations')
            .select('*')
            .eq('status', 'reserved');

        if (error) throw error;

        resState.data = data || [];

        const dateLabel = document.getElementById('resCurrentDateLabel');
        if (dateLabel) {
            const today = new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
            dateLabel.innerHTML = `ตารางการจองม้วนกระดาษ ณ วันที่ : <span style="color: var(--primary);">${today}</span>`;
        }

        renderReservationsTable();

    } catch (err) {
        console.error('loadReservations error:', err);
        tbody.innerHTML = `<tr><td colspan="100%" style="text-align:center;color:red;">Error: ${err.message}</td></tr>`;
    }
}

// ==========================================
// 8.2 ฟังก์ชันวาดตาราง Matrix (แบบเดียวกับ Roll Paper Usage)
// ==========================================
function renderReservationsTable() {
    const thead = document.getElementById('res-thead');
    const tbody = document.getElementById('res-tbody');
    if (!thead || !tbody) return;

    if (!fcState.masterData || fcState.masterData.length === 0) {
        thead.innerHTML = '';
        tbody.innerHTML = '<tr><td colspan="100%" style="text-align:center;color:#94a3b8;padding:30px;">กำลังโหลด Master Data...</td></tr>';
        return;
    }

    const group = resState.gradeFilter;
    const data = resState.data;

    // 1. Gradegrams ทั้งหมดจาก Master
    const masterGrades = [...new Set(fcState.masterData.map(m => m.grade + m.gram))].sort();

    // 2. กรองตาม Tab
    const filteredGrades = masterGrades.filter(g => {
        const gn = String(g).toUpperCase();
        if (group === 'ALL') return true;
        if (group === 'FSC') return gn.includes('F');
        return gn.startsWith(group) && !gn.includes('F');
    });

    // 3. Size ทั้งหมด
    const allSizes = [...new Set(fcState.masterData.map(m => Number(m.size)))].sort((a, b) => a - b);

    // 4. Header
    let headerHtml = '<tr><th class="grade-col">Grade</th>';
    allSizes.forEach(s => headerHtml += `<th>${s}</th>`);
    headerHtml += '<th>Total</th></tr>';
    thead.innerHTML = headerHtml;

    // 5. รวมยอดจอง: Grade|Size -> Total Qty
    const cellMap = {};
    data.forEach(r => {
        const key = `${r.grade}|${r.size}`;
        if (!cellMap[key]) cellMap[key] = 0;
        cellMap[key] += Number(r.quantity) || 0;
    });

    // 6. Body
    let bodyHtml = '';
    let grandTotal = 0;

    if (!filteredGrades.length) {
        bodyHtml = `<tr><td colspan="${allSizes.length + 2}" style="text-align:center;color:#94a3b8;padding:30px;">ไม่พบข้อมูลใน Master Data</td></tr>`;
    } else {
        filteredGrades.forEach(grade => {
            // Size ที่มีจริงของเกรดนี้
            const gradeSizes = [...new Set(
                fcState.masterData
                    .filter(m => (m.grade + m.gram) === grade)
                    .map(m => Number(m.size))
            )].sort((a, b) => a - b);

            let rowTotal = 0;
            bodyHtml += '<tr>';
            bodyHtml += `<td class="grade-col">${escHtml(grade)}</td>`;

            allSizes.forEach(size => {
                if (!gradeSizes.includes(size)) {
                    bodyHtml += '<td class="empty"></td>';
                    return;
                }

                const val = cellMap[`${grade}|${size}`] || 0;
                rowTotal += val;

                const clickAttr = `onclick="openReservationDetail('${escAttr(grade)}', ${size})" class="clickable" data-tip="Gradegrams ${escHtml(grade)} · Size ${size} · ${val} ม้วน"`;

                // ✅ FIX: แสดงค่าติดลบด้วย (val !== 0 แทน val > 0)
                const valDisplay = val !== 0 ? val : '';
                const valStyle = val < 0 ? 'color:#dc2626;font-weight:700;' : '';

                bodyHtml += `<td ${clickAttr} style="${valStyle}">${valDisplay}</td>`;
            });

            bodyHtml += `<td style="font-weight:700;background:#f1f5f9;">${rowTotal !== 0 ? rowTotal : ''}</td>`;
            bodyHtml += '</tr>';
        });

        // Total Row
        bodyHtml += '<tr class="total-row"><td class="grade-col" style="text-align:right;">รวมทั้งหมด</td>';
        allSizes.forEach(size => {
            const sizeTotal = data
                .filter(r => Number(r.size) === size)
                .reduce((s, r) => s + (Number(r.quantity) || 0), 0);
            grandTotal += sizeTotal;

            // ✅ FIX: แสดงค่าติดลบใน Total Row ด้วย
            const sizeTotalDisplay = sizeTotal !== 0 ? sizeTotal : '';
            const sizeTotalStyle = sizeTotal < 0 ? 'color:#dc2626;font-weight:700;' : '';

            bodyHtml += `<td style="${sizeTotalStyle}">${sizeTotalDisplay}</td>`;
        });
        bodyHtml += `<td style="font-weight:700;background:#cbd5e1;">${grandTotal !== 0 ? grandTotal : ''}</td></tr>`;
    }

    tbody.innerHTML = bodyHtml;
}

// ==========================================
// 8.3 ฟังก์ชันกรอง Grade
// ==========================================
function filterResByGrade(gradeGroup, btnElement) {
    resState.gradeFilter = gradeGroup;

    document.querySelectorAll('#res-sub-tabs .sub-tab').forEach(btn => {
        btn.classList.remove('active');
        if (btn.id === 'btn-tab-fsc-res') {
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

    renderReservationsTable();
}

// ==========================================
// 8.4 ฟังก์ชันเปิด Modal Drill-down (รับแค่ grade, size)
// ==========================================
async function openReservationDetail(grade, size) {
    const modal = document.getElementById('modalReservationDetail');
    const title = document.getElementById('resDetailTitle');
    const body = document.getElementById('resDetailBody');
    if (!modal || !body) return;

    title.innerHTML = `📋 รายละเอียดการจอง: ${escHtml(grade)} (Size ${size})`;
    body.innerHTML = '<div style="text-align:center;padding:20px;">กำลังโหลด...</div>';
    modal.classList.add('show');

    try {
        const { data, error } = await supabase
            .from('roll_reservations')
            .select('*')
            .eq('grade', grade)
            .eq('size', size)
            .eq('status', 'reserved')
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!data || data.length === 0) {
            openAddReservationForm(grade, size);
            return;
        }

        // คำนวณยอด
        const totalIncrease = data
            .filter(r => (Number(r.quantity) || 0) > 0)
            .reduce((s, r) => s + Number(r.quantity), 0);
        const totalDecrease = data
            .filter(r => (Number(r.quantity) || 0) < 0)
            .reduce((s, r) => s + Math.abs(Number(r.quantity)), 0);
        const totalQty = totalIncrease - totalDecrease;

        let html = `
            <div style="background:#f0f9ff; padding:16px; border-radius:8px; margin-bottom:16px; border:1px solid #bae6fd;">
                <h4 style="margin:0 0 8px; font-size:15px; color:#0369a1;">📦 สรุปยอดจอง: ${escHtml(grade)} (Size ${size})</h4>
                <div style="font-size:14px; color:#0c4a6e; line-height:1.9;">
                    ยอดจองรวม: <b style="color:#0284c7;">${totalIncrease} ม้วน</b><br>
                    ${totalDecrease > 0 ? `ปรับลด/คืน: <b style="color:#dc2626;">-${totalDecrease} ม้วน</b><br>` : ''}
                    <span style="font-size:15px;">ยอดสุทธิ: <b style="font-size:20px; color:#0284c7;">${totalQty} ม้วน</b></span>
                </div>
            </div>

            <h4 style="margin:0 0 10px; font-size:14px; color:#475569;">📜 ประวัติการจอง</h4>
            <table class="data-table" style="width:100%; font-size:13px;">
                <thead>
                    <tr>
                        <th>วันที่</th>
                        <th>Supplier</th>
                        <th>จำนวน</th>
                        <th>คุณภาพ</th>
                        <th>ปั๊มลูกค้า</th>
                        <th>ประเภท</th>
                        <th>หมายเหตุ</th>
                    </tr>
                </thead>
                <tbody>`;

        data.forEach(r => {
            const dateStr = r.reservation_date
                ? new Date(r.reservation_date).toLocaleDateString('th-TH')
                : '-';
            const reason = r.reason_type === 'forecast'
                ? 'ประมาณการสั่งซื้อ'
                : (r.reason_note || 'อื่นๆ');

            const qty = Number(r.quantity) || 0;
            const isDecrease = qty < 0;
            const qtyDisplay = isDecrease
                ? `<span style="color:#dc2626; font-weight:700;">${qty}</span>`
                : `<span style="color:#0284c7; font-weight:700;">${qty}</span>`;
            const rowStyle = isDecrease ? 'background:#fef2f2;' : '';
            const adjustNote = isDecrease && r.adjust_reason
                ? `<br><small style="color:#dc2626;">เหตุผล: ${escHtml(r.adjust_reason)}</small>`
                : '';

            html += `<tr style="${rowStyle}">
                <td>${dateStr}</td>
                <td style="font-weight:600;color:#475569;">${escHtml(r.supplier || '-')}</td>
                <td style="text-align:right;">${qtyDisplay}</td>
                <td>${r.quality === 'B' ? 'B (NC)' : 'A'}</td>
                <td>${escHtml(r.customer_mark || '-')}</td>
                <td>${escHtml(reason)}</td>
                <td>${escHtml(r.remark || '-')}${adjustNote}</td>
            </tr>`;
        });

        html += `</tbody></table>
            <div class="form-actions" style="margin-top:20px; display:flex; gap:8px; flex-wrap:wrap;">
                <button type="button" class="primary" onclick="openAddReservationForm('${escAttr(grade)}', ${size})">➕ เพิ่มรายการจอง</button>
                <button type="button" onclick="openDecreaseReservationForm('${escAttr(grade)}', ${size})"
                        style="padding:8px 16px; border-radius:6px; border:1px solid #fca5a5; background:#fef2f2; color:#b91c1c; cursor:pointer; font-weight:600;">
                    ➖ ปรับลด / คืนยอดจอง
                </button>
                <button type="button" onclick="closeModal('modalReservationDetail')">ปิด</button>
            </div>`;

        body.innerHTML = html;

    } catch (err) {
        console.error('openReservationDetail error:', err);
        body.innerHTML = `<div style="text-align:center;padding:20px;color:red;">Error: ${err.message}</div>`;
    }
}

// ==========================================
// 8.5 ฟังก์ชันเปิดฟอร์มเพิ่มรายการจอง (รับแค่ grade, size)
// ==========================================
function openAddReservationForm(grade, size) {
    const modalBody = document.getElementById('resDetailBody');
    const modalTitle = document.getElementById('resDetailTitle');
    if (!modalBody) return;

    if (modalTitle) {
        modalTitle.innerHTML = `➕ เพิ่มรายการจอง: ${escHtml(grade)} (Size ${size})`;
    }

    // ดึงรายชื่อ Supplier
    const supList = (typeof alertSupplierCache !== 'undefined' && alertSupplierCache.length > 0)
        ? alertSupplierCache
        : ['EKP', 'MKP', 'SCK'];

    const supOptions = supList.map(s =>
        `<option value="${escAttr(s)}">${escHtml(s)}</option>`
    ).join('');

    let html = `
        <div style="background:#f8fafc; padding:16px; border-radius:8px; border:1px solid #e2e8f0; margin-bottom:16px;">
            <div class="form-grid" style="grid-template-columns: 1fr 1fr; gap: 12px;">

                <label style="font-size:13px; font-weight:600; color:#475569;">📅 วันที่จอง
                    <input type="text" id="addResDate" name="no_autofill_add_res" autocomplete="new-password" readonly
                           style="width:100%; margin-top:4px; padding:8px; border:1px solid #cbd5e1; border-radius:6px;">
                </label>

                <label style="font-size:13px; font-weight:600; color:#475569;">🏢 Supplier
                    <select id="addResSupplier"
                            style="width:100%; margin-top:4px; padding:8px; border:1px solid #cbd5e1; border-radius:6px;">
                        ${supOptions}
                    </select>
                </label>

                <label style="font-size:13px; font-weight:600; color:#475569;">⚖️ จำนวนม้วน (Quantity)
                    <input type="number" id="addResQty" min="1" step="1" placeholder="0"
                           style="width:100%; margin-top:4px; padding:8px; border:1px solid #cbd5e1; border-radius:6px; font-weight:700; color:#2563eb;">
                </label>

                <label style="font-size:13px; font-weight:600; color:#475569;">🏷️ คุณภาพ (Quality)
                    <select id="addResQuality"
                            style="width:100%; margin-top:4px; padding:8px; border:1px solid #cbd5e1; border-radius:6px;">
                        <option value="A">A (ปกติ)</option>
                        <option value="B">B (NC)</option>
                    </select>
                </label>

                <label style="font-size:13px; font-weight:600; color:#475569;">🎯 ปั๊มลูกค้า
                    <select id="addResCustomerMark"
                            style="width:100%; margin-top:4px; padding:8px; border:1px solid #cbd5e1; border-radius:6px;">
                        <option value="-">- (ไม่ระบุ)</option>
                        <option value="ปั๊ม BT">ปั๊ม BT</option>
                        <option value="ปั๊ม F">ปั๊ม F</option>
                        <option value="ปั๊ม KTP">ปั๊ม KTP</option>
                        <option value="NC">NC</option>
                    </select>
                </label>

                <label style="font-size:13px; font-weight:600; color:#475569;">📌 ประเภทการจอง
                    <select id="addResReasonType" onchange="toggleResReasonNote()"
                            style="width:100%; margin-top:4px; padding:8px; border:1px solid #cbd5e1; border-radius:6px;">
                        <option value="forecast">ประมาณการสั่งซื้อ</option>
                        <option value="other">อื่นๆ (ระบุเหตุผล)</option>
                    </select>
                </label>

                <label id="addResReasonNoteWrap" class="hidden"
                       style="font-size:13px; font-weight:600; color:#475569; grid-column: 1 / -1;">
                    📝 เหตุผล (กรณีเลือกอื่นๆ)
                    <input type="text" id="addResReasonNote" placeholder="เช่น ลูกค้าสั่งเพิ่ม"
                           style="width:100%; margin-top:4px; padding:8px; border:1px solid #cbd5e1; border-radius:6px;">
                </label>

                <label style="font-size:13px; font-weight:600; color:#475569; grid-column: 1 / -1;">
                    📝 หมายเหตุเพิ่มเติม
                    <input type="text" id="addResRemark" placeholder="ระบุหมายเหตุ (ถ้ามี)"
                           style="width:100%; margin-top:4px; padding:8px; border:1px solid #cbd5e1; border-radius:6px;">
                </label>

            </div>
        </div>

        <div class="form-actions" style="margin-top:20px; border-top:1px solid #e2e8f0; padding-top:16px;">
            <button type="button" onclick="openReservationDetail('${escAttr(grade)}', ${size})"
                    style="padding:8px 16px; border-radius:6px; border:1px solid #cbd5e1; background:#f8fafc; cursor:pointer;">
                ย้อนกลับ
            </button>
            <button type="button" class="primary" onclick="saveReservation('${escAttr(grade)}', ${size})"
                    style="padding:8px 20px; border-radius:6px;">
                💾 บันทึกการจอง
            </button>
        </div>
    `;

    modalBody.innerHTML = html;

    // ตั้งค่าวันที่ + Flatpickr
    const dateInput = document.getElementById('addResDate');
    if (dateInput) {
        dateInput.value = getTodayISO();
        if (window.flatpickrInstances && !window.flatpickrInstances['addResDate']) {
            window.flatpickrInstances['addResDate'] = flatpickr(dateInput, {
                locale: "th",
                dateFormat: "Y-m-d",
                allowInput: false,
                disableMobile: true
            });
        }
    }
}

// ==========================================
// 8.6 ฟังก์ชันสลับช่องเหตุผล
// ==========================================
function toggleResReasonNote() {
    const type = document.getElementById('addResReasonType')?.value;
    const noteWrap = document.getElementById('addResReasonNoteWrap');
    if (noteWrap) {
        noteWrap.classList.toggle('hidden', type !== 'other');
    }
}

// ==========================================
// 8.7 ฟังก์ชันบันทึกข้อมูล (รับแค่ grade, size — supplier อ่านจาก select)
// ==========================================
async function saveReservation(grade, size) {
    const qty = Number(document.getElementById('addResQty')?.value);
    const resDate = document.getElementById('addResDate')?.value;
    const supplier = document.getElementById('addResSupplier')?.value;
    const quality = document.getElementById('addResQuality')?.value;
    const customerMark = document.getElementById('addResCustomerMark')?.value;
    const reasonType = document.getElementById('addResReasonType')?.value;
    const reasonNote = document.getElementById('addResReasonNote')?.value || '';
    const remark = document.getElementById('addResRemark')?.value || '';

    if (!qty || qty <= 0) return showToast('กรุณากรอกจำนวนม้วนมากกว่า 0', 'warn');
    if (!resDate) return showToast('กรุณาเลือกวันที่จอง', 'warn');
    if (!supplier) return showToast('กรุณาเลือก Supplier', 'warn');
    if (reasonType === 'other' && !reasonNote.trim()) return showToast('กรุณาระบุเหตุผล (กรณีเลือกอื่นๆ)', 'warn');

    const btn = event.target;
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '⏳ กำลังบันทึก...';

    try {
        const { error } = await supabase.from('roll_reservations').insert({
            reservation_date: resDate,
            grade: grade,
            size: size,
            supplier: supplier,
            quantity: qty,
            quality: quality,
            customer_mark: customerMark,
            reason_type: reasonType,
            reason_note: reasonNote,
            remark: remark,
            adjust_type: 'increase',
            status: 'reserved',
            created_by: currentUser?.id || null
        });

        if (error) throw error;

        showToast('✅ บันทึกการจองสำเร็จ', 'ok');
        await loadReservations();
        await openReservationDetail(grade, size);

    } catch (err) {
        console.error('saveReservation error:', err);
        showToast('บันทึกไม่สำเร็จ: ' + err.message, 'err');
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

// ==========================================
// 8.8 ฟังก์ชันเปิดฟอร์มปรับลด/คืนยอดจอง
// ==========================================
async function openDecreaseReservationForm(grade, size) {
    const modalBody = document.getElementById('resDetailBody');
    const modalTitle = document.getElementById('resDetailTitle');
    if (!modalBody) return;

    if (modalTitle) {
        modalTitle.innerHTML = `➖ ปรับลด / คืนยอดจอง: ${escHtml(grade)} (Size ${size})`;
    }

    modalBody.innerHTML = '<div style="text-align:center;padding:20px;">กำลังโหลดรายการจอง...</div>';

    try {
        // ดึงเฉพาะรายการที่เป็น "บวก" (ยอดจองจริง) เพื่อให้เลือกหักได้
        const { data, error } = await supabase
            .from('roll_reservations')
            .select('*')
            .eq('grade', grade)
            .eq('size', size)
            .eq('status', 'reserved')
            .gt('quantity', 0)
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!data || data.length === 0) {
            modalBody.innerHTML = `<div style="text-align:center;padding:30px;color:#94a3b8;">ไม่มียอดจองให้ปรับลด</div>`;
            return;
        }

        // สร้าง dropdown ให้เลือกว่าจะหักจากรายการไหน
        const srcOptions = data.map(r => {
            const dateStr = r.reservation_date
                ? new Date(r.reservation_date).toLocaleDateString('th-TH')
                : '-';
            const qualityLabel = r.quality === 'B' ? 'B(NC)' : 'A';
            const label = `${dateStr} · ${r.supplier} · ${r.quantity} ม้วน · ${qualityLabel} · ${r.customer_mark || '-'}`;
            return `<option value="${r.id}" data-qty="${r.quantity}" data-supplier="${escAttr(r.supplier || '')}">
                        ${escHtml(label)}
                    </option>`;
        }).join('');

        let html = `
            <div style="background:#fef2f2; padding:16px; border-radius:8px; border:1px solid #fecaca; margin-bottom:16px;">
                <div style="font-size:13px; color:#991b1b; margin-bottom:14px; line-height:1.6;">
                    ⚠️ การปรับลดจะ<b>ไม่ลบข้อมูลเดิม</b> แต่จะสร้างรายการใหม่เป็นยอดติดลบ
                    เพื่อเก็บประวัติการคืน/ยืมไว้ตรวจสอบย้อนหลัง
                </div>

                <div class="form-grid" style="grid-template-columns: 1fr; gap:14px;">

                    <label style="font-size:13px; font-weight:600; color:#475569;">
                        📋 เลือกรายการจองต้นทางที่จะหัก
                        <select id="decSourceId" onchange="onDecreaseSourceChange()"
                                style="width:100%; margin-top:4px; padding:8px; border:1px solid #cbd5e1; border-radius:6px;">
                            ${srcOptions}
                        </select>
                    </label>

                    <label style="font-size:13px; font-weight:600; color:#475569;">
                        ⚖️ จำนวนที่ต้องการลด (ม้วน)
                        <input type="number" id="decQty" min="1" step="1" placeholder="0"
                               style="width:100%; margin-top:4px; padding:8px; border:1px solid #cbd5e1; border-radius:6px; font-weight:700; color:#dc2626;">
                        <small id="decQtyHint" style="color:#64748b; font-weight:400;"></small>
                    </label>

                    <label style="font-size:13px; font-weight:600; color:#475569;">
                        📌 เหตุผลการปรับลด
                        <select id="decAdjustReason"
                                style="width:100%; margin-top:4px; padding:8px; border:1px solid #cbd5e1; border-radius:6px;">
                            <option value="ผู้ขายขอคืน">ผู้ขายขอคืน</option>
                            <option value="ยืมไปส่งเจ้าอื่น">ยืมไปส่งเจ้าอื่น</option>
                            <option value="ยกเลิกการจอง">ยกเลิกการจอง</option>
                            <option value="ปรับปรุงข้อมูลผิดพลาด">ปรับปรุงข้อมูลผิดพลาด</option>
                            <option value="other">อื่นๆ (ระบุ)</option>
                        </select>
                    </label>

                    <label id="decReasonNoteWrap" class="hidden"
                           style="font-size:13px; font-weight:600; color:#475569;">
                        📝 ระบุเหตุผล (กรณีเลือกอื่นๆ)
                        <input type="text" id="decReasonNote" placeholder="เช่น คืนเพราะคุณภาพไม่ผ่าน"
                               style="width:100%; margin-top:4px; padding:8px; border:1px solid #cbd5e1; border-radius:6px;">
                    </label>

                    <label style="font-size:13px; font-weight:600; color:#475569;">
                        📝 หมายเหตุเพิ่มเติม
                        <input type="text" id="decRemark" placeholder="ระบุหมายเหตุ (ถ้ามี)"
                               style="width:100%; margin-top:4px; padding:8px; border:1px solid #cbd5e1; border-radius:6px;">
                    </label>

                </div>
            </div>

            <div class="form-actions" style="margin-top:20px; border-top:1px solid #e2e8f0; padding-top:16px; display:flex; gap:8px;">
                <button type="button" onclick="openReservationDetail('${escAttr(grade)}', ${size})"
                        style="padding:8px 16px; border-radius:6px; border:1px solid #cbd5e1; background:#f8fafc; cursor:pointer;">
                    ย้อนกลับ
                </button>
                <button type="button" onclick="saveDecreaseReservation('${escAttr(grade)}', ${size})"
                        style="padding:8px 20px; border-radius:6px; background:#dc2626; color:#fff; border:none; cursor:pointer; font-weight:600;">
                    💾 บันทึกการปรับลด
                </button>
            </div>
        `;

        modalBody.innerHTML = html;

        // toggle ช่องเหตุผลอื่นๆ
        const sel = document.getElementById('decAdjustReason');
        if (sel) {
            sel.addEventListener('change', () => {
                const wrap = document.getElementById('decReasonNoteWrap');
                if (wrap) wrap.classList.toggle('hidden', sel.value !== 'other');
            });
        }

        onDecreaseSourceChange();

    } catch (err) {
        console.error('openDecreaseReservationForm error:', err);
        modalBody.innerHTML = `<div style="text-align:center;padding:20px;color:red;">Error: ${err.message}</div>`;
    }
}

// ==========================================
// 8.9 อัปเดต hint เมื่อเลือกรายการต้นทาง
// ==========================================
function onDecreaseSourceChange() {
    const sel = document.getElementById('decSourceId');
    const qtyInput = document.getElementById('decQty');
    const hint = document.getElementById('decQtyHint');
    if (!sel || !qtyInput) return;

    const opt = sel.options[sel.selectedIndex];
    const maxQty = Number(opt?.dataset?.qty || 0);

    qtyInput.max = maxQty;
    if (hint) hint.textContent = `สูงสุดที่ลดได้: ${maxQty} ม้วน (จากรายการที่เลือก)`;

    if (Number(qtyInput.value) > maxQty) {
        qtyInput.value = maxQty;
    }
}

// ==========================================
// 8.10 บันทึกการปรับลด/คืนยอดจอง (insert ยอดติดลบ)
// ==========================================
async function saveDecreaseReservation(grade, size) {
    const sourceId = document.getElementById('decSourceId')?.value;
    const decQty = Number(document.getElementById('decQty')?.value);
    const adjustReasonSel = document.getElementById('decAdjustReason')?.value;
    const reasonNote = document.getElementById('decReasonNote')?.value || '';
    const remark = document.getElementById('decRemark')?.value || '';

    if (!sourceId) return showToast('กรุณาเลือกรายการจองต้นทาง', 'warn');
    if (!decQty || decQty <= 0) return showToast('กรุณากรอกจำนวนที่ต้องการลดมากกว่า 0', 'warn');

    if (adjustReasonSel === 'other' && !reasonNote.trim()) {
        return showToast('กรุณาระบุเหตุผล (กรณีเลือกอื่นๆ)', 'warn');
    }

    const adjustReason = adjustReasonSel === 'other'
        ? reasonNote.trim()
        : adjustReasonSel;

    const btn = event.target;
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '⏳ กำลังบันทึก...';

    try {
        // ดึงข้อมูลรายการต้นทาง เพื่อ copy supplier/quality/customer_mark
        const { data: srcData, error: srcErr } = await supabase
            .from('roll_reservations')
            .select('*')
            .eq('id', sourceId)
            .single();

        if (srcErr) throw srcErr;
        if (!srcData) throw new Error('ไม่พบรายการต้นทาง');

        const srcQty = Number(srcData.quantity) || 0;
        if (decQty > srcQty) {
            throw new Error(`จำนวนที่ลด (${decQty}) มากกว่ายอดต้นทาง (${srcQty})`);
        }

        // insert รายการใหม่เป็นยอดติดลบ
        const { error } = await supabase.from('roll_reservations').insert({
            reservation_date: getTodayISO(),
            grade: grade,
            size: size,
            supplier: srcData.supplier,
            quantity: -Math.abs(decQty),
            quality: srcData.quality,
            customer_mark: srcData.customer_mark,
            reason_type: 'other',
            reason_note: `ปรับลด: ${adjustReason}`,
            adjust_type: 'decrease',
            adjust_reason: adjustReason,
            parent_reservation_id: sourceId,
            remark: remark,
            status: 'reserved',
            created_by: currentUser?.id || null
        });

        if (error) throw error;

        showToast(`✅ ปรับลด ${decQty} ม้วน สำเร็จ`, 'ok');
        await loadReservations();
        await openReservationDetail(grade, size);

    } catch (err) {
        console.error('saveDecreaseReservation error:', err);
        showToast('บันทึกไม่สำเร็จ: ' + err.message, 'err');
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

// ==========================================
// 8.11 รีเซ็ตข้อมูลการจองทั้งหมด
// ==========================================
async function resetReservations() {
    if (!confirm('⚠️ คุณต้องการลบข้อมูลการจองทั้งหมดและเริ่มนับ 1 ใหม่ใช่หรือไม่?\n\n(ข้อมูลประวัติการจองจะหายไปทั้งหมด และยอดใน Matrix จะกลายเป็น 0)')) return;

    try {
        // ลบข้อมูลทั้งหมดในตาราง roll_reservations
        const { error } = await supabase
            .from('roll_reservations')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000');

        if (error) throw error;

        showToast('✅ รีเซ็ตข้อมูลการจองเรียบร้อยแล้ว', 'ok');
        await loadReservations();
    } catch (err) {
        console.error('Reset reservations error:', err);
        showToast('รีเซ็ตไม่สำเร็จ: ' + err.message, 'err');
    }
}

// ==========================================
// 8.12 Export ฟอร์มเปล่า (สำหรับกรอกใหม่)
// ==========================================
function exportReservationForm() {
    const headers = [
        'วันที่จอง', 'Gradegrams', 'Size', 'Supplier', 
        'จำนวน (ม้วน)', 'คุณภาพ', 'ปั๊มลูกค้า', 'ประเภท', 
        'หมายเหตุ', 'สถานะ', 'การเคลื่อนไหว'
    ];

    // แถวตัวอย่าง 1 แถว
    const sampleRow = [
        '2026-11-14', 'CA125', 44, 'EKP', 
        5, 'A', 'ปั๊ม BT', 'ประมาณการ', 
        'ตัวอย่างการกรอก', 'จองอยู่', 'ปกติ'
    ];

    const wsData = [headers, sampleRow];
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    ws['!cols'] = [
        {wch: 14}, {wch: 12}, {wch: 8}, {wch: 10}, {wch: 12}, 
        {wch: 10}, {wch: 15}, {wch: 18}, {wch: 25}, {wch: 12}, {wch: 15}
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'ReservationForm');
    
    const today = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `reservation_form_${today}.xlsx`);
    
    showToast('✅ Export ฟอร์มสำเร็จ', 'ok');
}

// ==========================================
// 8.13 Export ข้อมูลจริงตามวันที่ที่เลือก
// ==========================================
function exportReservationData() {
    // 1. ดึงวันที่ที่เลือกจาก Filter
    const filterDate = document.getElementById('reservationDate')?.value || '';
    
    // 2. กรองข้อมูล
    let dataToExport = resState.data || [];
    if (filterDate) {
        dataToExport = dataToExport.filter(r => r.reservation_date === filterDate);
    }

    if (dataToExport.length === 0) {
        return showToast(`ไม่พบข้อมูลการจอง${filterDate ? ' ณ วันที่ ' + filterDate : ''}`, 'warn');
    }

    // 3. เตรียมข้อมูล
    const headers = [
        'วันที่จอง', 'Gradegrams', 'Size', 'Supplier', 
        'จำนวน (ม้วน)', 'คุณภาพ', 'ปั๊มลูกค้า', 'ประเภท', 
        'หมายเหตุ', 'สถานะ', 'การเคลื่อนไหว'
    ];

    const dataRows = dataToExport.map(r => {
        let qType = 'ปกติ';
        if (r.adjust_type === 'decrease') qType = 'ปรับลด/คืน';
        
        let dateStr = '-';
        if (r.reservation_date) {
            const d = new Date(r.reservation_date);
            dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        }

        return [
            dateStr,
            r.grade || '-',
            r.size || '-',
            r.supplier || '-',
            Number(r.quantity) || 0,
            r.quality === 'B' ? 'B' : 'A',
            r.customer_mark || '-',
            r.reason_type === 'forecast' ? 'ประมาณการ' : (r.reason_note || 'อื่นๆ'),
            r.remark || '-',
            r.status === 'reserved' ? 'จองอยู่' : 'ปิด/ตัดยอด',
            qType
        ];
    });

    // 4. สร้างไฟล์ Excel
    const wsData = [headers, ...dataRows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    ws['!cols'] = [
        {wch: 14}, {wch: 12}, {wch: 8}, {wch: 10}, {wch: 12}, 
        {wch: 10}, {wch: 15}, {wch: 18}, {wch: 25}, {wch: 12}, {wch: 15}
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'ReservationData');
    
    const dateLabel = filterDate || 'all';
    XLSX.writeFile(wb, `reservation_data_${dateLabel}.xlsx`);
    
    showToast(`✅ Export ข้อมูล ${dataToExport.length} รายการ สำเร็จ`, 'ok');
}

// ==========================================
// 8.14 Import ตารางการจองจาก Excel
// ==========================================
async function importReservations(event) {
    const file = event.target.files[0];
    if (!file) return;

    const btn = event.target.previousElementSibling; // ปุ่ม Import
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '⏳ กำลัง Import...';

    try {
        const data = await file.arrayBuffer();
        const wb = XLSX.read(data, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        if (!rows.length) throw new Error('ไฟล์ไม่มีข้อมูล');

        const payload = [];
        const errors = [];

        // ตรวจสอบข้อมูลทีละแถว
        rows.forEach((row, idx) => {
            const rowNum = idx + 2; // +2 เพราะ Excel เริ่มที่ 1 และมี Header
            const date = String(row['วันที่จอง'] || '').trim();
            const grade = String(row['Gradegrams'] || '').trim().toUpperCase();
            const size = Number(row['Size']);
            const qty = Number(row['จำนวน (ม้วน)']);
            
            if (!date || !grade || !size || isNaN(qty) || qty === 0) {
                errors.push(`แถว ${rowNum}: ข้อมูลไม่ครบ (วันที่/Grade/Size/จำนวน)`);
                return;
            }

            // จัดรูปแบบวันที่ (ลองแปลงให้เป็น YYYY-MM-DD)
            let isoDate = date;
            if (date.includes('/')) {
                const parts = date.split('/');
                if (parts.length === 3) {
                    // สมมติว่าเป็น DD/MM/YYYY
                    isoDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                }
            }

            const qualityStr = String(row['คุณภาพ'] || 'A').trim().toUpperCase();
            const quality = qualityStr.includes('B') ? 'B' : 'A';

            const reasonTypeStr = String(row['ประเภท'] || '').trim();
            const reasonType = reasonTypeStr === 'ประมาณการ' ? 'forecast' : 'other';

            payload.push({
                reservation_date: isoDate,
                grade: grade,
                size: size,
                supplier: String(row['Supplier'] || '').trim() || null,
                quantity: qty,
                quality: quality,
                customer_mark: String(row['ปั๊มลูกค้า'] || '-').trim(),
                reason_type: reasonType,
                reason_note: reasonType === 'other' ? reasonTypeStr : null,
                remark: String(row['หมายเหตุ'] || '').trim(),
                adjust_type: 'increase',
                status: 'reserved',
                created_by: currentUser?.id || null
            });
        });

        if (payload.length === 0) {
            throw new Error(`ไม่มีข้อมูลที่สามารถ Import ได้\n${errors.slice(0, 3).join('\n')}`);
        }

        // บันทึกทีละ 500 แถว (ป้องกัน payload ใหญ่เกิน)
        const CHUNK_SIZE = 500;
        let successCount = 0;

        for (let i = 0; i < payload.length; i += CHUNK_SIZE) {
            const chunk = payload.slice(i, i + CHUNK_SIZE);
            const { error } = await supabase.from('roll_reservations').insert(chunk);
            if (error) throw error;
            successCount += chunk.length;
        }

        showToast(`✅ Import สำเร็จ ${successCount} รายการ`, 'ok', 4000);
        if (errors.length > 0) {
            console.warn('Import errors:', errors);
            alert(`Import สำเร็จ ${successCount} รายการ\n\nแต่มีบางแถวที่ข้ามไป (${errors.length} แถว):\n\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? '\n...' : ''}`);
        }

        // โหลดข้อมูลใหม่
        await loadReservations();

    } catch (err) {
        console.error('importReservations error:', err);
        alert('Import ไม่สำเร็จ: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
        event.target.value = ''; // reset input file
    }
}
