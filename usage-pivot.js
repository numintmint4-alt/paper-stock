// ==========================================
// usage-pivot.js - จัดการ Usage Pivot & Import
// ==========================================

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

            // ดึง Master จากตาราง paper_specs
            const { data: allMaster } = await supabase.from('paper_specs').select('grade, size, std_weight');
            
            const importData = rows.map(row => {
                const grade = row['grade'] || '';
                const size = parseFloat(row['Size']) || 0;
                const kgs = parseFloat(row['kgs']) || 0;

                // หาน้ำหนักต่อม้วนจาก Master
                const masterItem = allMaster.find(m => m.grade === grade && m.size === size);
                const stdWeight = masterItem ? masterItem.std_weight : 0;
                
                // คำนวณม้วน
                const rolls = stdWeight > 0 ? (kgs / stdWeight) : 0;

                return {
                    prod_date: row['prod_date'] ? row['prod_date'].split(' ')[0] : null, 
                    customer_code: row['customer_code'],
                    customer_name: row['customer_name'],
                    grade: grade,
                    width: size,
                    kgs: kgs,
                    rolls: parseFloat(rolls.toFixed(2)) 
                };
            });

            // บันทึกลงตาราง usage_records
            const { error } = await supabase.from('usage_records').insert(importData);
            
            if (error) {
                showToast('Import ล้มเหลว: ' + error.message, 'error');
            } else {
                showToast(`Import สำเร็จ ${importData.length} รายการ`, 'success');
                document.getElementById('pivot-file-upload').value = ''; // Reset Input
                loadUsagePivot(); // โหลดตารางใหม่
            }
        } catch (err) {
            console.error(err);
            showToast('เกิดข้อผิดพลาดในการอ่านไฟล์', 'error');
        }
    };
    reader.readAsArrayBuffer(file);
}

async function loadUsagePivot() {
    const month = document.getElementById('pivot-month').value;
    if (!month) return showToast('กรุณาเลือกเดือน', 'warning');

    const tbody = document.getElementById('pivot-tbody');
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;">Loading...</td></tr>';

    // ดึงข้อมูลจาก usage_records ของเดือนนั้น
    const { data, error } = await supabase
        .from('usage_records')
        .select('grade, width, rolls, customer_name')
        .gte('prod_date', `${month}-01`)
        .lte('prod_date', `${month}-31`);

    if (error) return showToast('Error loading pivot', 'error');

    // สร้าง Pivot Table
    const pivotData = {};
    const allWidths = new Set();

    data.forEach(row => {
        allWidths.add(row.width);
        if (!pivotData[row.grade]) {
            pivotData[row.grade] = { total: 0 };
        }
        if (!pivotData[row.grade][row.width]) {
            pivotData[row.grade][row.width] = 0;
        }
        pivotData[row.grade][row.width] += row.rolls;
        pivotData[row.grade].total += row.rolls;
    });

    // Render Pivot
    const thead = document.getElementById('pivot-thead');
    const sortedWidths = Array.from(allWidths).sort((a,b) => a-b);

    // Header
    let headerHtml = '<tr><th>Grade</th>';
    sortedWidths.forEach(w => headerHtml += `<th>${w}</th>`);
    headerHtml += '<th>Grand Total</th></tr>';
    thead.innerHTML = headerHtml;

    // Body
    tbody.innerHTML = '';
    Object.keys(pivotData).sort().forEach(grade => {
        const row = pivotData[grade];
        let trHtml = `<tr><td><strong>${grade}</strong></td>`;
        sortedWidths.forEach(w => {
            trHtml += `<td>${(row[w] || 0).toFixed(2)}</td>`;
        });
        trHtml += `<td style="background:#e6f2ff; font-weight:bold;">${row.total.toFixed(2)}</td></tr>`;
        tbody.innerHTML += trHtml;
    });
}
