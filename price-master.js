// ═══════════════════════════════════════════════════════════════
// STOCK V8 — price-master.js
// Master ราคา: List + Edit + Save + Import/Export
// ═══════════════════════════════════════════════════════════════

let pmCache = [];
let pmSelectedMonth = '';
let pmEditingId = null;

// ================= INIT =================
async function initPriceMaster() {
  const today = new Date();
  if (!pmSelectedMonth) {
    pmSelectedMonth = `${today.getFullYear()}-${pad(today.getMonth()+1)}`;
  }
  const monthEl = $('pmMonth');
  if (monthEl && !monthEl.value) monthEl.value = pmSelectedMonth;

  await loadPriceMasterList();
}

// ================= LOAD LIST =================
async function loadPriceMasterList() {
  const listEl = $('pmBody');
  if (!listEl) return;
  listEl.innerHTML = '<p style="text-align:center;color:#94a3b8;padding:20px">กำลังโหลด...</p>';

  try {
    const { data, error } = await supabase
      .from('price_master')
      .select('*')
      .eq('month', pmSelectedMonth)
      .eq('is_active', true)
      .order('gradegram');
    if (error) throw error;

    pmCache = data || [];
    if (!pmCache.length) {
      listEl.innerHTML = '<p style="text-align:center;color:#94a3b8;padding:30px">ยังไม่มีราคาในเดือนนี้</p>';
      return;
    }

    // ✅ NC Discount (ใช้ค่าจากแถวแรก)
    const ncDiscount = Number(pmCache[0].nc_discount) || 1;
    if ($('pmNcDiscount')) $('pmNcDiscount').value = ncDiscount;

    let html = '<div class="data-scroll"><table class="data-table"><thead><tr>';
    html += '<th>#</th><th>Gradegram</th><th>ราคาปกติ</th><th>ปั้ม F</th><th>ปั้ม BT</th><th>ปั้ม KTP</th><th>NC (auto)</th><th></th>';
    html += '</tr></thead><tbody>';

    pmCache.forEach((r, i) => {
      const ncAuto = (Number(r.price_normal) - Number(r.nc_discount || 0)).toFixed(2);
      html += `<tr>
        <td>${i + 1}</td>
        <td><b>${esc(r.gradegram)}</b></td>
        <td>${Number(r.price_normal).toFixed(2)}</td>
        <td>${r.price_f ? Number(r.price_f).toFixed(2) : '-'}</td>
        <td>${r.price_bt ? Number(r.price_bt).toFixed(2) : '-'}</td>
        <td>${r.price_ktp ? Number(r.price_ktp).toFixed(2) : '-'}</td>
        <td style="color:#dc2626;font-weight:700">${ncAuto}</td>
        <td>
          <button onclick="openPMForm(${r.id})">✏️ Edit</button>
        </td>
      </tr>`;
    });
    html += '</tbody></table></div>';
    html += `<div style="margin-top:8px;font-size:13px;color:#64748b">แสดง ${pmCache.length} รายการ · เดือน ${pmSelectedMonth}</div>`;
    listEl.innerHTML = html;
  } catch (e) {
    console.error('loadPriceMasterList:', e);
    listEl.innerHTML = `<div class="msg err">โหลดไม่สำเร็จ: ${esc(e.message)}</div>`;
  }
}

// ================= MONTH CHANGE =================
async function onPMonthChange() {
  const el = $('pmMonth');
  if (!el) return;
  pmSelectedMonth = el.value;
  await loadPriceMasterList();
}

// ================= NC DISCOUNT CHANGE =================
async function onPMNcDiscountChange() {
  const newDiscount = Number($('pmNcDiscount').value) || 1;
  if (!confirm(`เปลี่ยน NC Discount เป็น ${newDiscount} บาท สำหรับทุก gradegram ในเดือนนี้?`)) return;

  try {
    const { error } = await supabase
      .from('price_master')
      .update({ nc_discount: newDiscount, updated_at: new Date().toISOString() })
      .eq('month', pmSelectedMonth);
    if (error) throw error;
    await loadPriceMasterList();
    showMsg('pmMsg', `✅ เปลี่ยน NC Discount เป็น ${newDiscount} บาท`, 'ok');
  } catch (e) {
    showMsg('pmMsg', '❌ ' + e.message, 'err');
  }
}

// ================= OPEN FORM =================
async function openPMForm(id) {
  pmEditingId = id || null;
  $('pmFormError').innerHTML = '';

  if (!id) {
    alert('กรุณาเพิ่มราคาผ่าน Import Excel (ตอนนี้)');
    return;
  }

  const row = pmCache.find(r => r.id === id);
  if (!row) return;

  $('pmFormTitle').textContent = `✏️ แก้ไขราคา — ${row.gradegram}`;
  $('pmfGradegram').value = row.gradegram;
  $('pmfMonth').value = row.month;
  $('pmfNormal').value = row.price_normal;
  $('pmfF').value = row.price_f || '';
  $('pmfBT').value = row.price_bt || '';
  $('pmfKTP').value = row.price_ktp || '';
  $('pmfNcDiscount').value = row.nc_discount || 1;

  updatePM_NC_Auto();
  $('pmfNormal').oninput = updatePM_NC_Auto;
  $('pmfNcDiscount').oninput = updatePM_NC_Auto;

  openModal('modalPM');
}

function updatePM_NC_Auto() {
  const normal = Number($('pmfNormal').value) || 0;
  const disc = Number($('pmfNcDiscount').value) || 0;
  $('pmfNC').value = (normal - disc).toFixed(2);
}

// ================= SAVE =================
async function savePMForm() {
  if (!pmEditingId) return;

  const payload = {
    price_normal: Number($('pmfNormal').value),
    price_f:      Number($('pmfF').value) || null,
    price_bt:     Number($('pmfBT').value) || null,
    price_ktp:    Number($('pmfKTP').value) || null,
    nc_discount:  Number($('pmfNcDiscount').value) || 1,
    updated_at:   new Date().toISOString()
  };

  if (!payload.price_normal || payload.price_normal <= 0) {
    $('pmFormError').innerHTML = '<div class="msg err">ราคาปกติต้องมากกว่า 0</div>';
    return;
  }

  try {
    const { error } = await supabase
      .from('price_master')
      .update(payload)
      .eq('id', pmEditingId);
    if (error) throw error;

    closeModal('modalPM');
    await loadPriceMasterList();
    showMsg('pmMsg', '✅ บันทึกสำเร็จ', 'ok');
  } catch (e) {
    $('pmFormError').innerHTML = `<div class="msg err">${esc(e.message)}</div>`;
  }
}

// ================= EXPORT =================
function exportPriceMaster() {
  if (!pmCache.length) return alert('ไม่มีข้อมูล');

  const data = pmCache.map(r => ({
    month: r.month,
    gradegram: r.gradegram,
    price_normal: Number(r.price_normal).toFixed(2),
    price_f:  r.price_f  ? Number(r.price_f).toFixed(2)  : '',
    price_bt: r.price_bt ? Number(r.price_bt).toFixed(2) : '',
    price_ktp: r.price_ktp ? Number(r.price_ktp).toFixed(2) : '',
    nc_discount: Number(r.nc_discount || 0).toFixed(2),
    nc_auto: (Number(r.price_normal) - Number(r.nc_discount || 0)).toFixed(2)
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Price Master');
  XLSX.writeFile(wb, `price_master_${pmSelectedMonth}.xlsx`);
}

// ================= IMPORT =================
function importPriceMaster(ev) {
  const f = ev.target.files[0];
  if (!f) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const wb = XLSX.read(e.target.result, { type: 'array' });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);

      const payload = rows.map(row => ({
        month: pmSelectedMonth,
        gradegram: String(row['gradegram'] || row['Gradegram'] || '').trim(),
        price_normal: Number(row['price_normal'] || row['ราคาปกติ'] || 0),
        price_f:  Number(row['price_f']  || row['ปั้ม F']  || 0) || null,
        price_bt: Number(row['price_bt'] || row['ปั้ม BT'] || 0) || null,
        price_ktp: Number(row['price_ktp'] || row['ปั้ม KTP'] || 0) || null,
        nc_discount: Number(row['nc_discount'] || 1)
      })).filter(r => r.gradegram && r.price_normal > 0);

      if (!payload.length) {
        showMsg('pmMsg', '⚠ ไม่มีแถวที่บันทึกได้', 'err');
        return;
      }

      // Upsert
      const { error } = await supabase
        .from('price_master')
        .upsert(payload, { onConflict: 'month,gradegram' });
      if (error) throw error;

      showMsg('pmMsg', `✅ Import สำเร็จ ${payload.length} แถว`, 'ok');
      await loadPriceMasterList();
    } catch (ex) {
      showMsg('pmMsg', '❌ ' + ex.message, 'err');
    }
  };
  reader.readAsArrayBuffer(f);
  ev.target.value = '';
}
