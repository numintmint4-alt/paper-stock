// ==========================================
// reservations.js - ระบบจองม้วนกระดาษ (Roll Reservations)
// ==========================================

let resState = {
    data: [],
    gradeFilter: 'ALL'
};

// 8.1 ฟังก์ชันโหลดข้อมูลหลัก
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

// 8.2 ฟังก์ชันวาดตาราง Matrix
function renderReservationsTable() {
    const thead = document.getElementById('res-thead');
    const tbody = document.getElementById('res-tbody');
    if (!thead || !tbody) return;

    const group = resState.gradeFilter;
    const data = resState.data;

    const filteredData = data.filter(r => {
        const g = String(r.grade).toUpperCase();
        if (group === 'ALL') return true;
        if (group === 'FSC') return g.includes('F');
        return g.startsWith(group) && !g.includes('F');
    });

    if (!filteredData.length) {
        thead.innerHTML = '';
        tbody.innerHTML = '<tr><td colspan="100%" style="text-align:center;color:#94a3b8;padding:30px;">ไม่พบข้อมูลการจอง</td></tr>';
        return;
    }

    const grades = [...new Set(filteredData.map(r => r.grade))].sort();
    const sizes = [...new Set(filteredData.map(r => Number(r.size)))].sort((a,b) => a-b);
    
    let headerHtml = '<tr><th class="grade-col">Grade</th>';
    headerHtml += '<th>Supplier</th>';
    sizes.forEach(s => headerHtml += `<th>${s}</th>`);
    headerHtml += '<th>Total</th></tr>';
    thead.innerHTML = headerHtml;

    let bodyHtml = '';
    let grandTotal = 0;

    const cellMap = {};
    filteredData.forEach(r => {
        const key = `${r.grade}|${r.size}|${r.supplier}`;
        if (!cellMap[key]) cellMap[key] = 0;
        cellMap[key] += Number(r.quantity);
        grandTotal += Number(r.quantity);
    });

    grades.forEach(grade => {
        const gradeData = filteredData.filter(r => r.grade === grade);
        const gradeSizes = [...new Set(gradeData.map(r => Number(r.size)))].sort((a,b) => a-b);
        const gradeSups = [...new Set(gradeData.map(r => r.supplier))].sort();

        gradeSups.forEach((sup, idx) => {
            bodyHtml += '<tr>';
            if (idx === 0) {
                bodyHtml += `<td class="grade-col" rowspan="${gradeSups.length}">${escHtml(grade)}</td>`;
            }
            bodyHtml += `<td style="font-weight:600;color:#475569;">${escHtml(sup)}</td>`;

            gradeSizes.forEach(size => {
                const val = cellMap[`${grade}|${size}|${sup}`] || 0;
                const clickAttr = val > 0 
                    ? `onclick="openReservationDetail('${escAttr(grade)}', ${size}, '${escAttr(sup)}')" class="clickable" data-tip="จอง ${escHtml(sup)} · Size ${size} · ${val} ม้วน"` 
                    : '';
                bodyHtml += `<td ${clickAttr}>${val > 0 ? val : ''}</td>`;
            });
            bodyHtml += `<td style="font-weight:700;background:#f1f5f9;">${gradeData.filter(r => r.supplier === sup).reduce((s, r) => s + Number(r.quantity), 0)}</td>`;
            bodyHtml += '</tr>';
        });
    });

    bodyHtml += '<tr class="total-row"><td colspan="2" style="text-align:right;font-weight:700;">รวมทั้งหมด</td>';
    sizes.forEach(size => {
        const sizeTotal = filteredData.filter(r => Number(r.size) === size).reduce((s, r) => s + Number(r.quantity), 0);
        bodyHtml += `<td>${sizeTotal > 0 ? sizeTotal : ''}</td>`;
    });
    bodyHtml += `<td style="font-weight:700;background:#cbd5e1;">${grandTotal}</td></tr>`;

    tbody.innerHTML = bodyHtml;
}

// 8.3 ฟังก์ชันกรอง Grade
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

// 8.4 ฟังก์ชันเปิด Modal Drill-down
async function openReservationDetail(grade, size, supplier) {
    const modal = document.getElementById('modalReservationDetail');
    const title = document.getElementById('resDetailTitle');
    const body = document.getElementById('resDetailBody');
    if (!modal || !body) return;

    title.innerHTML = `📋 รายละเอียดการจอง: ${escHtml(grade)} (Size ${size}) - ${escHtml(supplier)}`;
    body.innerHTML = '<div style="text-align:center;padding:20px;">กำลังโหลด...</div>';
    modal.classList.add('show');

    try {
        const { data, error } = await supabase
            .from('roll_reservations')
            .select('*')
            .eq('grade', grade)
            .eq('size', size)
            .eq('supplier', supplier)
            .eq('status', 'reserved')
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!data || data.length === 0) {
            body.innerHTML = '<div style="text-align:center;padding:20px;">ไม่พบข้อมูล</div>';
            return;
        }

        const totalQty = data.reduce((sum, r) => sum + Number(r.quantity), 0);
        
        let html = `
            <div style="background:#f0f9ff; padding:16px; border-radius:8px; margin-bottom:16px; border:1px solid #bae6fd;">
                <h4 style="margin:0 0 8px; font-size:15px; color:#0369a1;">📦 สรุปยอดจอง: ${escHtml(grade)} (Size ${size})</h4>
                <div style="font-size:14px; color:#0c4a6e;">
                    Supplier: <b>${escHtml(supplier)}</b> | 
                    รวมทั้งหมด: <b style="font-size:18px; color:#0284c7;">${totalQty} ม้วน</b>
                </div>
            </div>
            
            <h4 style="margin:0 0 10px; font-size:14px; color:#475569;">📜 ประวัติการจอง</h4>
            <table class="data-table" style="width:100%; font-size:13px;">
                <thead>
                    <tr>
                        <th>วันที่</th>
                        <th>จำนวน</th>
                        <th>คุณภาพ</th>
                        <th>ปั๊มลูกค้า</th>
                        <th>ประเภท</th>
                        <th>หมายเหตุ</th>
                    </tr>
                </thead>
                <tbody>`;

        data.forEach(r => {
            const dateStr = r.reservation_date ? new Date(r.reservation_date).toLocaleDateString('th-TH') : '-';
            const reason = r.reason_type === 'forecast' ? 'ประมาณการสั่งซื้อ' : (r.reason_note || 'อื่นๆ');
            
            html += `<tr>
                <td>${dateStr}</td>
                <td style="text-align:right; font-weight:700; color:#0284c7;">${r.quantity}</td>
                <td>${r.quality === 'B' ? 'B (NC)' : 'A'}</td>
                <td>${escHtml(r.customer_mark || '-')}</td>
                <td>${escHtml(reason)}</td>
                <td>${escHtml(r.remark || '-')}</td>
            </tr>`;
        });

        html += `</tbody></table>
            <div class="form-actions" style="margin-top:20px;">
                <button type="button" class="primary" onclick="openAddReservationForm('${escAttr(grade)}', ${size}, '${escAttr(supplier)}')">➕ เพิ่มรายการจอง</button>
                <button type="button" onclick="closeModal('modalReservationDetail')">ปิด</button>
            </div>`;

        body.innerHTML = html;

    } catch (err) {
        console.error('openReservationDetail error:', err);
        body.innerHTML = `<div style="text-align:center;padding:20px;color:red;">Error: ${err.message}</div>`;
    }
}

// 8.5 ฟังก์ชันเปิดฟอร์มเพิ่มรายการจอง
function openAddReservationForm(grade, size, supplier) {
    const modalBody = document.getElementById('resDetailBody');
    const modalTitle = document.getElementById('resDetailTitle');
    if (!modalBody) return;

    if (modalTitle) modalTitle.innerHTML = `➕ เพิ่มรายการจอง: ${escHtml(grade)} (Size ${size}) - ${escHtml(supplier)}`;

    let html = `
        <div style="background:#f8fafc; padding:16px; border-radius:8px; border:1px solid #e2e8f0; margin-bottom:16px;">
            <div class="form-grid" style="grid-template-columns: 1fr 1fr; gap: 12px;">
                
                <label style="font-size:13px; font-weight:600; color:#475569;">📅 วันที่จอง
                    <input type="text" id="addResDate" name="no_autofill_add_res" autocomplete="new-password" readonly style="width:100%; margin-top:4px; padding:8px; border:1px solid #cbd5e1; border-radius:6px;">
                </label>

                <label style="font-size:13px; font-weight:600; color:#475569;">🏢 Supplier
                    <input type="text" id="addResSupplier" value="${escAttr(supplier)}" disabled style="width:100%; margin-top:4px; padding:8px; border:1px solid #cbd5e1; border-radius:6px; background:#e2e8f0;">
                </label>

                <label style="font-size:13px; font-weight:600; color:#475569;">⚖️ จำนวนม้วน (Quantity)
                    <input type="number" id="addResQty" min="1" step="1" placeholder="0" style="width:100%; margin-top:4px; padding:8px; border:1px solid #cbd5e1; border-radius:6px; font-weight:700; color:#2563eb;">
                </label>

                <label style="font-size:13px; font-weight:600; color:#475569;">🏷️ คุณภาพ (Quality)
                    <select id="addResQuality" style="width:100%; margin-top:4px; padding:8px; border:1px solid #cbd5e1; border-radius:6px;">
                        <option value="A">A (ปกติ)</option>
                        <option value="B">B (NC)</option>
                    </select>
                </label>

                <label style="font-size:13px; font-weight:600; color:#475569;">🎯 ปั๊มลูกค้า
                    <select id="addResCustomerMark" style="width:100%; margin-top:4px; padding:8px; border:1px solid #cbd5e1; border-radius:6px;">
                        <option value="-">- (ไม่ระบุ)</option>
                        <option value="ปั๊ม BT">ปั๊ม BT</option>
                        <option value="ปั๊ม F">ปั๊ม F</option>
                        <option value="ปั๊ม KTP">ปั๊ม KTP</option>
                        <option value="NC">NC</option>
                    </select>
                </label>

                <label style="font-size:13px; font-weight:600; color:#475569;">📌 ประเภทการจอง
                    <select id="addResReasonType" onchange="toggleResReasonNote()" style="width:100%; margin-top:4px; padding:8px; border:1px solid #cbd5e1; border-radius:6px;">
                        <option value="forecast">ประมาณการสั่งซื้อ</option>
                        <option value="other">อื่นๆ (ระบุเหตุผล)</option>
                    </select>
                </label>

                <label id="addResReasonNoteWrap" class="hidden" style="font-size:13px; font-weight:600; color:#475569; grid-column: 1 / -1;">📝 เหตุผล (กรณีเลือกอื่นๆ)
                    <input type="text" id="addResReasonNote" placeholder="เช่น ลูกค้าสั่งเพิ่ม" style="width:100%; margin-top:4px; padding:8px; border:1px solid #cbd5e1; border-radius:6px;">
                </label>

                <label style="font-size:13px; font-weight:600; color:#475569; grid-column: 1 / -1;">📝 หมายเหตุเพิ่มเติม
                    <input type="text" id="addResRemark" placeholder="ระบุหมายเหตุ (ถ้ามี)" style="width:100%; margin-top:4px; padding:8px; border:1px solid #cbd5e1; border-radius:6px;">
                </label>

            </div>
        </div>

        <div class="form-actions" style="margin-top:20px; border-top:1px solid #e2e8f0; padding-top:16px;">
            <button type="button" onclick="openReservationDetail('${escAttr(grade)}', ${size}, '${escAttr(supplier)}')" style="padding:8px 16px; border-radius:6px; border:1px solid #cbd5e1; background:#f8fafc; cursor:pointer;">ย้อนกลับ</button>
            <button type="button" class="primary" onclick="saveReservation('${escAttr(grade)}', ${size}, '${escAttr(supplier)}')" style="padding:8px 20px; border-radius:6px;">💾 บันทึกการจอง</button>
        </div>
    `;

    modalBody.innerHTML = html;

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

// 8.6 ฟังก์ชันสลับช่องเหตุผล
function toggleResReasonNote() {
    const type = document.getElementById('addResReasonType')?.value;
    const noteWrap = document.getElementById('addResReasonNoteWrap');
    if (noteWrap) {
        noteWrap.classList.toggle('hidden', type !== 'other');
    }
}

// 8.7 ฟังก์ชันบันทึกข้อมูล
async function saveReservation(grade, size, supplier) {
    const qty = Number(document.getElementById('addResQty')?.value);
    const resDate = document.getElementById('addResDate')?.value;
    const quality = document.getElementById('addResQuality')?.value;
    const customerMark = document.getElementById('addResCustomerMark')?.value;
    const reasonType = document.getElementById('addResReasonType')?.value;
    const reasonNote = document.getElementById('addResReasonNote')?.value || '';
    const remark = document.getElementById('addResRemark')?.value || '';

    if (!qty || qty <= 0) return showToast('กรุณากรอกจำนวนม้วนมากกว่า 0', 'warn');
    if (!resDate) return showToast('กรุณาเลือกวันที่จอง', 'warn');
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
        await openReservationDetail(grade, size, supplier);

    } catch (err) {
        console.error('saveReservation error:', err);
        showToast('บันทึกไม่สำเร็จ: ' + err.message, 'err');
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}
