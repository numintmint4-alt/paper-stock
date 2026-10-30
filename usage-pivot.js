// ==========================================
// usage-pivot.js - จัดการ Usage Pivot & Import (V2)
// ==========================================

function initUsagePivotTab() {
    const monthInput = document.getElementById('pivot-month');
    if (monthInput && !monthInput.value) {
        const today = new Date();
        monthInput.value = today.toISOString().slice(0, 7);
    }
    loadUsagePivot();
}

async function handleUsageImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    showToast('กำลังประมวลผลไฟล์...', 'info');

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);

            // ✅ ใช้ std_weight_kg (ชื่อคอลัมน์จริง)
            const { data: allMaster } = await supabase
                .from('paper_specs')
                .select('grade, size, std_weight_kg');

            const importData = rows.map(row => {
                const grade = row['grade'] || '';
                const size = parseFloat(row['Size']) || 0;
                const kgs = parseFloat(row['kgs']) || 0;

                const masterItem = (allMaster || []).find(m =>
                    m.grade === grade && Number(m.size) === size
                );
                const stdWeight = masterItem ? Number(masterItem.std_weight_kg) : 0;
                const rolls = stdWeight > 0 ? (kgs / stdWeight) : 0;

                return {
                    prod_date: row['prod_date'] ? String(row['prod_date']).split(' ')[0] : null,
                    customer_code: row['customer_code'],
                    customer_name: row['customer_name'],
                    grade: grade,
                    width: size,
                    kgs: kgs,
                    rolls: parseFloat(rolls.toFixed(2))
                };
            });

            const { error } = await supabase.from('usage_records').insert(importData);

            if (error) {
                showToast('Import ล้มเหลว: ' + error.message, 'err');
            } else {
                showToast(`Import สำเร็จ ${importData.length} รายการ`, 'ok');
                const input = document.getElementById('pivot-file-upload');
                if (input) input.value = '';
                loadUsagePivot();
            }
        } catch (err) {
            console.error(err);
            showToast('เกิดข้อผิดพลาดในการอ่านไฟล์', 'err');
        }
    };
    reader.readAsArrayBuffer(file);
}

async function loadUsagePivot() {
    const month = document.getElementById('pivot-month')?.value;
    if (!month) return showToast('กรุณาเลือกเดือน', 'warn');

    const tbody = document.getElementById('pivot-tbody');
    const thead = document.getElementById('pivot-thead');
    if (!tbody || !thead) return;

    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;">Loading...</td></tr>';

    try {
        const { data, error } = await supabase
            .from('usage_records')
            .select('grade, width, rolls, customer_name')
            .gte('prod_date', `${month}-01`)
            .lte('prod_date', `${month}-31`);

        if (error) throw error;

        const pivotData = {};
        const allWidths = new Set();

        (data || []).forEach(row => {
            allWidths.add(row.width);
            if (!pivotData[row.grade]) pivotData[row.grade] = { total: 0 };
            if (!pivotData[row.grade][row.width]) pivotData[row.grade][row.width] = 0;
            pivotData[row.grade][row.width] += Number(row.rolls || 0);
            pivotData[row.grade].total += Number(row.rolls || 0);
        });

        const sortedWidths = Array.from(allWidths).sort((a, b) => a - b);

        let headerHtml = '<tr><th>Grade</th>';
        sortedWidths.forEach(w => headerHtml += `<th>${w}</th>`);
        headerHtml += '<th>Grand Total</th></tr>';
        thead.innerHTML = headerHtml;

        tbody.innerHTML = '';
        const grades = Object.keys(pivotData).sort();
        if (!grades.length) {
            tbody.innerHTML = `<tr><td colspan="${sortedWidths.length + 2}" style="text-align:center;color:#94a3b8;">ไม่มีข้อมูลในเดือนนี้</td></tr>`;
            return;
        }

        grades.forEach(grade => {
            const row = pivotData[grade];
            let trHtml = `<tr><td><strong>${grade}</strong></td>`;
            sortedWidths.forEach(w => {
                trHtml += `<td>${(row[w] || 0).toFixed(2)}</td>`;
            });
            trHtml += `<td style="background:#e6f2ff; font-weight:bold;">${row.total.toFixed(2)}</td></tr>`;
            tbody.innerHTML += trHtml;
        });
    } catch (err) {
        console.error(err);
        showToast('Error loading pivot: ' + err.message, 'err');
        tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:red;">โหลดข้อมูลไม่สำเร็จ</td></tr>';
    }
}
