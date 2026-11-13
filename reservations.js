// ==========================================
// reservations.js - ระบบจองม้วนกระดาษ (Roll Reservations)
// แก้ไข: Matrix แสดงจาก Master Data + Supplier เลือกใน Modal
// ==========================================

let resState = {
    data: [],
    gradeFilter: 'ALL'
};

// ==========================================
// 8.1 ฟังก์ชันโหลดข้อมูลหลัก
// ==========================================
async function loadReservations() {
    const tbody = document.getElementById('res-tbody');
    const thead = document.getElementById('res-thead');
    if (!tbody || !thead) return;

    tbody.innerHTML = '<tr><td colspan="100%" style="text-align:center;padding:20px;">กำลังโหลด...</td></tr>';

    try {
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

                bodyHtml += `<td ${clickAttr}>${val > 0 ? val : ''}</td>`;
            });

            bodyHtml += `<td style="font-weight:700;background:#f1f5f9;">${rowTotal > 0 ? rowTotal : ''}</td>`;
            bodyHtml += '</tr>';
        });

        // Total Row
        bodyHtml += '<tr class="total-row"><td class="grade-col" style="text-align:right;">รวมทั้งหมด</td>';
        allSizes.forEach(size => {
            const sizeTotal = data
                .filter(r => Number(r.size) === size)
                .reduce((s, r) => s + (Number(r.quantity) || 0), 0);
            grandTotal += sizeTotal;
            bodyHtml += `<td>${sizeTotal > 0 ? sizeTotal : ''}</td>`;
        });
        bodyHtml += `<td style="font-weight:700;background:#cbd5e1;">${grandTotal > 0 ? grandTotal : ''}</td></tr>`;
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
            // ไม่มีข้อมูล → เปิดฟอร์มเพิ่มทันที
            openAddReservationForm(grade, size);
            return;
        }

        const totalQty = data.reduce((sum, r) => sum + (Number(r.quantity) || 0), 0);

        let html = `
            <div style="background:#f0f9ff; padding:16px; border-radius:8px; margin-bottom:16px; border:1px solid #bae6fd;">
                <h4 style="margin:0 0 8px; font-size:15px; color:#0369a1;">📦 สรุปยอดจอง: ${escHtml(grade)} (Size ${size})</h4>
                <div style="font-size:14px; color:#0c4a6e;">
                    รวมทั้งหมด: <b style="font-size:18px; color:#0284c7;">${totalQty} ม้วน</b>
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

            html += `<tr>
                <td>${dateStr}</td>
                <td style="font-weight:600;color:#475569;">${escHtml(r.supplier || '-')}</td>
                <td style="text-align:right; font-weight:700; color:#0284c7;">${r.quantity}</td>
                <td>${r.quality === 'B' ? 'B (NC)' : 'A'}</td>
                <td>${escHtml(r.customer_mark || '-')}</td>
                <td>${escHtml(reason)}</td>
                <td>${escHtml(r.remark || '-')}</td>
            </tr>`;
        });

        html += `</tbody></table>
            <div class="form-actions" style="margin-top:20px;">
                <button type="button" class="primary" onclick="openAddReservationForm('${escAttr(grade)}', ${size})">➕ เพิ่มรายการจอง</button>
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
