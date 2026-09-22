// ═══════════════════════════════════════════════════════════════
// STOCK V8 — price-master.js
// Master ราคา (Price Master) — ราคาต่อ Gradegram รายเดือน
// ═══════════════════════════════════════════════════════════════

let pmCache = [];
let pmSelectedMonth = '';
let pmEditingId = null;

// ================= HELPER: showMsg =================
function showMsg(elId, text, type = 'ok') {
  const el = $(elId);
  if (!el) return;
  el.innerHTML = `<div class="msg ${type}">${esc(text)}</div>`;
  setTimeout(() => { el.innerHTML = ''; }, 3000);
}

// ================= INIT =================
async function initPriceMaster() {
  const today = new Date();
  if (!pmSelectedMonth) {
    pmSelectedMonth = `${today.getFullYear()}-${pad(today.getMonth()+1)}`;
  }

  const monthEl = $('pmMonth');
  if (monthEl && !monthEl.value) monthEl.value = pmSelectedMonth;

  // ✅ เติม NC discount default จาก localStorage
  const savedNc = localStorage.getItem('stockv8_pm_nc_discount');
  if (savedNc && $('pmNcDiscount')) $('pmNcDiscount').value = savedNc;

  await loadPriceMasterList();
  renderPMList();
}

// ================= LOAD =================
async function loadPriceMasterList() {
  try {
    const { data, error } = await supabase
      .from('price_master')
      .select('*')
      .eq('month', pmSelectedMonth)
      .order('gradegram');
    if (error) throw error;
    pmCache = data || [];
  } catch (e) {
    console.warn('loadPriceMasterList:', e);
    pmCache = [];
    $('pmMsg').innerHTML = `<div class="msg err">โหลดไม่สำเร็จ: ${esc(e.message)}</div>`;
  }
}

// ================= MONTH CHANGE =================
async function onPMonthChange() {
  const monthEl = $('pmMonth');
  if (!monthEl) return;
  pmSelectedMonth = monthEl.value;
  await loadPriceMasterList();
  renderPMList();
}

// ================= NC DISCOUNT (Global) =================
async function onPMNcDiscountChange() {
  const val = Number($('pmNcDiscount')?.value || 1);
  localStorage.setItem('stockv8_pm_nc_discount', String(val));
}

// ================= RENDER LIST =================
function renderPMList() {
  const body = $('pmBody');
  if (!body) return;

  if (!pmCache.length) {
    body.innerHTML = '<p style="text-align:center;color:#94a3b8;padding:20px">ยังไม่มีราคาในเดือนนี้ — กด "🔄 สร้างราคาทั้งหมด" เพื่อเริ่ม</p>';
    return;
  }

  let html = '<div class="data-scroll"><table class="data-table"><thead><tr>';
  html += '<th>Gradegram</th><th>ราคาปกติ</th><th>ปั้ม F</th><th>ปั้ม BT</th><th>ปั้ม KTP</th><th>NC ลด</th><th>NC (auto)</th><th></th>';
  html += '</tr></thead><tbody>';

  pmCache.forEach(row => {
    const ncAuto = (Number(row.price_normal) || 0) - (Number(row.nc_discount) || 0);
    html += `<tr>
      <td><b>${esc(row.gradegram)}</b></td>
      <td style="text-align:right">${Number(row.price_normal || 0).toFixed(2)}</td>
      <td style="text-align:right">${Number(row.price_f || 0).toFixed(2)}</td>
      <td style="text-align:right">${Number(row.price_bt || 0).toFixed(2)}</td>
      <td style="text-align:right">${Number(row.price_ktp || 0).toFixed(2)}</td>
      <td style="text-align:right">${Number(row.nc_discount || 0).toFixed(2)}</td>
      <td style="text-align:right;color:#dc2626;font-weight:700">${ncAuto.toFixed(2)}</td>
      <td>
        <button onclick="openPMForm('${row.id}')">✏️ Edit</button>
        <button class="danger" onclick="deletePM('${row.id}')">🗑 ลบ</button>
      </td>
    </tr>`;
  });

  html += '</tbody></table></div>';
  body.innerHTML = html;
}

// ================= OPEN FORM (EDIT ONLY) =================
async function openPMForm(id) {
  // ✅ ต้องมี id (Edit mode เท่านั้น)
  if (!id) {
    alert('ใช้ปุ่ม "🔄 สร้างราคาทั้งหมด" เพื่อเพิ่มเกรดใหม่\nหรือกด "✏️ Edit" ที่แถวเพื่อแก้ราคา');
    return;
  }

  pmEditingId = id;
  $('pmFormError').innerHTML = '';
  $('pmfMonth').value = pmSelectedMonth;

  // ✅ สร้าง dropdown gradegram (แสดงแค่ค่าที่มี)
  const gradeSelect = $('pmfGradegram');
  if (!gradeSelect) return;

  gradeSelect.disabled = true;
  gradeSelect.style.background = '#f1f5f9';

  const row = pmCache.find(r => r.id === id);
  if (!row) return;

  gradeSelect.innerHTML = `<option value="${row.gradegram}">${row.gradegram}</option>`;

  $('pmFormTitle').textContent = `✏️ แก้ไขราคา — ${row.gradegram}`;
  gradeSelect.value = row.gradegram;
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

// ✅ อัปเดต NC อัตโนมัติ
function updatePM_NC_Auto() {
  const normal = Number($('pmfNormal').value) || 0;
  const disc = Number($('pmfNcDiscount').value) || 0;
  $('pmfNC').value = (normal - disc).toFixed(2);
}

// ================= SAVE (UPDATE ONLY) =================
async function savePMForm() {
  if (!pmEditingId) {
    $('pmFormError').innerHTML = '<div class="msg err">ไม่พบรายการที่จะแก้ไข</div>';
    return;
  }

  const gradegram = $('pmfGradegram').value;
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
    renderPMList();
    showMsg('pmMsg', `✅ แก้ไขราคา ${gradegram} สำเร็จ`, 'ok');
  } catch (e) {
    $('pmFormError').innerHTML = `<div class="msg err">${esc(e.message)}</div>`;
  }
}

// ================= DELETE =================
async function deletePM(id) {
  const row = pmCache.find(r => r.id === id);
  if (!row) return;

  if (!confirm(`ยืนยันลบราคา ${row.gradegram} เดือน ${pmSelectedMonth}?`)) return;

  try {
    const { error } = await supabase
      .from('price_master')
      .delete()
      .eq('id', id);
    if (error) throw error;

    await loadPriceMasterList();
    renderPMList();

    showMsg('pmMsg', '✅ ลบสำเร็จ', 'ok');
  } catch (e) {
    $('pmMsg').innerHTML = `<div class="msg err">ลบไม่สำเร็จ: ${esc(e.message)}</div>`;
  }
}

// ================= EXPORT =================
function exportPriceMaster() {
  if (!pmCache.length) return alert('ไม่มีข้อมูล');

  const data = pmCache.map(r => ({
    Gradegram: r.gradegram,
    Month: r.month,
    'ราคาปกติ': r.price_normal || 0,
    'ปั้ม F': r.price_f || 0,
    'ปั้ม BT': r.price_bt || 0,
    'ปั้ม KTP': r.price_ktp || 0,
    'NC ลด': r.nc_discount || 0,
    'NC (auto)': (Number(r.price_normal) || 0) - (Number(r.nc_discount) || 0)
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'PriceMaster');
  XLSX.writeFile(wb, `price_master_${pmSelectedMonth}.xlsx`);
}

// ================= IMPORT =================
async function importPriceMaster(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

    if (!rows.length) {
      $('pmMsg').innerHTML = '<div class="msg err">ไม่มีข้อมูลในไฟล์</div>';
      return;
    }

    const payloads = rows.map(r => ({
      gradegram: String(r.Gradegram || r.gradegram || '').trim().toUpperCase(),
      month: String(r.Month || r.month || pmSelectedMonth).trim(),
      price_normal: Number(r['ราคาปกติ'] || r.price_normal || 0),
      price_f: Number(r['ปั้ม F'] || r.price_f || 0),
      price_bt: Number(r['ปั้ม BT'] || r.price_bt || 0),
      price_ktp: Number(r['ปั้ม KTP'] || r.price_ktp || 0),
      nc_discount: Number(r['NC ลด'] || r.nc_discount || 0),
      is_active: true
    })).filter(p => p.gradegram && p.month);

    if (!payloads.length) {
      $('pmMsg').innerHTML = '<div class="msg err">ไม่มีแถวที่ valid (ต้องมี Gradegram + Month)</div>';
      return;
    }

    const { error } = await supabase
      .from('price_master')
      .upsert(payloads, { onConflict: 'gradegram,month' });
    if (error) throw error;

    await loadPriceMasterList();
    renderPMList();

    $('pmMsg').innerHTML = `<div class="msg ok">✅ Import สำเร็จ ${payloads.length} รายการ</div>`;
    setTimeout(() => { const el = $('pmMsg'); if (el) el.innerHTML = ''; }, 3000);
  } catch (e) {
    $('pmMsg').innerHTML = `<div class="msg err">Import ล้มเหลว: ${esc(e.message)}</div>`;
  } finally {
    event.target.value = '';
  }
}

// ================= SYNC FROM SPECS =================
async function syncPriceMaster() {
  if (!pmSelectedMonth) {
    alert('เลือกเดือนก่อน');
    return;
  }

  if (!confirm(
    `สร้างราคาสำหรับทุก gradegram ในเดือน ${pmSelectedMonth}?\n\n` +
    `• รายการที่มีอยู่แล้ว → ไม่เขียนทับ\n` +
    `• รายการใหม่ → copy จากเดือนก่อน (ถ้ามี)\n` +
    `• ถ้าเดือนก่อนไม่มี → ราคาเริ่มต้น = 0`
  )) return;

  try {
    const { data, error } = await supabase.rpc('sync_price_master_from_specs', {
      p_month: pmSelectedMonth
    });
    if (error) throw error;

    let msg = `✅ สร้างเสร็จ: `;
    msg += `เพิ่มใหม่ ${data.inserted} แถว`;
    if (data.copied > 0) msg += ` (copy จาก ${data.prev_month} ${data.copied} แถว)`;
    msg += ` · มีอยู่แล้ว ${data.existing} แถว`;

    showMsg('pmMsg', msg, 'ok');
    await loadPriceMasterList();
    renderPMList();
  } catch (e) {
    showMsg('pmMsg', '❌ ' + e.message, 'err');
  }
}
