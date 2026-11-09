// ==========================================
// usage-pivot.js - จัดการ Usage Pivot & Import (V3 - แก้ไขบั๊กและเพิ่มประสิทธิภาพ)
// ==========================================

function initUsagePivotTab() {
    const monthInput = document.getElementById('pivot-month');
    if (monthInput && !monthInput.value) {
        // ✅ ใช้ getTodayISO() จาก app.js เพื่อป้องกันปัญหา Timezone
        const todayISO = typeof getTodayISO === 'function' ? getTodayISO() : new Date().toISOString().slice(0, 10);
        monthInput.value = todayISO.slice(0, 7);
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

            // ดึง Master Data
            const { data: allMaster, error: masterErr } = await supabase
                .from('paper_specs')
                .select('grade, size, std_weight_kg');
            
            if (masterErr) throw masterErr;

            const importData = rows.map(row => {
                const rawGrade = row['grade'] || '';
                // ✅ ใช้ normalizeGrade จาก app.js
                const grade = typeof normalizeGrade === 'function' ? normalizeGrade(rawGrade) : String(rawGrade).trim().toUpperCase();
                const size = parseFloat(row['Size']) || 0;
                const kgs = parseFloat(row['kgs']) || 0;

                // ✅ Match Grade โดยใช้ normalizeGrade เทียบกับ DB
                const masterItem = (allMaster || []).find(m => {
                    const mGrade = typeof normalizeGrade === 'function' ? normalizeGrade(m.grade) : String(m.grade).trim().toUpperCase();
                    return mGrade === grade && Number(m.size) === size;
                });
                
                const stdWeight = masterItem ? Number(masterItem.std_weight_kg) : 0;
                const rolls = stdWeight > 0 ? (kgs / stdWeight) : 0;

                return {
                    prod_date: row['prod_date'] ? (typeof toISODate === 'function' ? toISODate(row['prod_date']) : String(row['prod_date']).split(' ')[0]) : null,
                    customer_code: row['customer_code'],
                    customer_name: row['customer_name'],
                    grade: grade, // บันทึกเป็น Format มาตรฐาน
                    width: size,
                    kgs: kgs,
                    rolls: parseFloat(rolls.toFixed(2))
                };
            });

            // ✅ เพิ่มระบบ Chunking (แบ่ง Insert ทีละ 500 แถว ป้องกัน Timeout)
            const CHUNK_SIZE = 500;
            let successCount = 0;
            
            for (let i = 0; i < importData.length; i += CHUNK_SIZE) {
                const chunk = importData.slice(i, i + CHUNK_SIZE);
                const { error } = await supabase.from('usage_records').insert(chunk);
                if (error) throw error;
                successCount += chunk.length;
            }

            showToast(`Import สำเร็จ ${successCount} รายการ`, 'ok');
            const input = document.getElementById('pivot-file-upload');
            if (input) input.value = '';
            loadUsagePivot();
            
        } catch (err) {
            console.error(err);
            showToast('Import ล้มเหลว: ' + err.message, 'err');
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

    tbody.innerHTML = '<tr><td colspan="100%" style="text-align:center;padding:20px;">Loading...</td></tr>';

    try {
        // ✅ หาวันแรก และวันสุดท้ายของเดือน (บังคับ Format YYYY-MM-DD)
        const [year, monthNum] = month.split('-').map(Number);
        const lastDay = new Date(year, monthNum, 0).getDate();
        const startDate = typeof toISODate === 'function' ? toISODate(`${month}-01`) : `${month}-01`;
        const endDate = typeof toISODate === 'function' ? toISODate(`${month}-${String(lastDay).padStart(2, '0')}`) : `${month}-${String(lastDay).padStart(2, '0')}`;

        // ✅ ตรวจสอบให้ชัวร์ว่าใน DB ชื่อคอลัมน์คือ 'grade' จริงๆ (ถ้าเป็นชื่ออื่นให้เปลี่ยนตรง select)
        const { data, error } = await supabase
            .from('usage_records')
            .select('grade, width, rolls, customer_name')
            .gte('prod_date', startDate)
            .lte('prod_date', endDate);

        if (error) throw error;

        const pivotData = {};
        const allWidths = new Set();

        (data || []).forEach(row => {
            allWidths.add(row.width);
            // ดึง Grade ออกมา (รองรับทั้ง grade และ gradegram เผื่อใน DB ตั้งชื่อต่างกัน)
            const gradeKey = row.grade || row.gradegram || 'UNKNOWN';
            
            if (!pivotData[gradeKey]) pivotData[gradeKey] = { total: 0 };
            if (!pivotData[gradeKey][row.width]) pivotData[gradeKey][row.width] = 0;
            pivotData[gradeKey][row.width] += Number(row.rolls || 0);
            pivotData[gradeKey].total += Number(row.rolls || 0);
        });

        const sortedWidths = Array.from(allWidths).sort((a, b) => a - b);

        let headerHtml = '<tr><th>Grade</th>';
        sortedWidths.forEach(w => headerHtml += `<th>${w}</th>`);
        headerHtml += '<th>Grand Total</th></tr>';
        thead.innerHTML = headerHtml;

        tbody.innerHTML = '';
        const grades = Object.keys(pivotData).sort();
        
        if (!grades.length) {
            tbody.innerHTML = `<tr><td colspan="${sortedWidths.length + 2}" style="text-align:center;color:#94a3b8;padding:20px;">ไม่มีข้อมูลในเดือนนี้</td></tr>`;
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
        tbody.innerHTML = '<tr><td colspan="100%" style="text-align:center;color:red;padding:20px;">โหลดข้อมูลไม่สำเร็จ</td></tr>';
    }
}
