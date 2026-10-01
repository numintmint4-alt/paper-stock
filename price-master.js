// ═══════════════════════════════════════════════════════════════
// STOCK V8 — price-master.js
// Master ราคา (Price Master) — ราคาต่อ Gradegram รายเดือน
// + Auto-copy จากเดือนก่อนหน้า (ลบปุ่ม Sync ออก)
// + ➕ ปุ่ม "เพิ่มราคาใหม่" (Add Mode)
// + Pre-fill ราคาจากเดือนก่อนหน้า
// + 🔄 ปุ่ม "Copy จากเดือนก่อน" (forceRecopy)
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

// ================= HELPER: getPrevMonth =================
function getPrevMonth(ym) {
  if (!ym) return ym;
  const [y, m] = ym.split('-').map(Number);
  let prevM = m - 1;
  let prevY = y;
  if (prevM <= 0) { prevM = 12; prevY = y - 1; }
  return `${prevY}-${pad(prevM)}`;
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

  // ✅ ถ้าเดือนนี้ยังไม่มีราคา → auto-copy จากเดือนก่อนหน้า
  if (!pmCache.length) {
    await autoCopyFromPrevMonth();
  }

  renderPMList();
}

// ================= AUTO COPY FROM PREV MONTH =================
// ✅ ถ้าเดือนนี้ไม่มีราคาเลย → copy จากเดือนก่อนหน้าอัตโนมัติ
async function autoCopyFromPrevMonth() {
  try {
    const prevMonth = getPrevMonth(pmSelectedMonth);
    console.log('[PriceMaster] เดือน ' + pmSelectedMonth + ' ว่าง → auto-copy จาก ' + prevMonth);

    // 1) ดึงราคาเดือนก่อนหน้า
    const { data: prev, error: err1 } = await supabase
      .from('price_master')
      .select('*')
      .eq('month', prevMonth)
      .eq('is_active', true);
    if (err1) throw err1;

    if (!prev || !prev.length) {
      console.warn('[PriceMaster] เดือนก่อนหน้า (' + prevMonth + ') ไม่มีราคา → ไม่ copy');
      return;
    }

    // 2) สร้าง payload สำหรับเดือนนี้ (copy ราคามาทั้งหมด)
    const newRows = prev.map(p => ({
      gradegram: p.gradegram,
      month: pmSelectedMonth,
      price_normal: p.price_normal,
      price_f: p.price_f,
      price_bt: p.price_bt,
      price_ktp: p.price_ktp,
      nc_discount: p.nc_discount,
      is_active: true
    }));

    // 3) Insert
    const { error: err2 } = await supabase
      .from('price_master')
      .insert(newRows);
    if (err2) throw err2;

    console.log('[PriceMaster] ✅ copy ' + newRows.length + ' ราคาจาก ' + prevMonth + ' สำเร็จ');

    // 4) Reload
    await loadPriceMasterList();
    showMsg('pmMsg', `✅ Copy ราคาจากเดือน ${prevMonth} อัตโนมัติ (${newRows.length} รายการ)`, 'ok');
  } catch (e) {
    console.warn('autoCopyFromPrevMonth:', e);
    showMsg('pmMsg', 'Auto-copy ล้มเหลว: ' + e.message, 'err');
  }
}

// ═══════════════════════════════════════════════════════════════
// 🔄 FORCE RE-COPY — ปุ่ม "Copy จากเดือนก่อน" (Manual)
// ═══════════════════════════════════════════════════════════════
// ✅ Force re-copy ราคาจากเดือนก่อนหน้า (สำหรับปุ่มใน UI)
//    - ลบราคาเดือนปัจจุบันทั้งหมดก่อน
//    - แล้ว copy ใหม่จากเดือนก่อน
//    - ใช้เมื่อ auto-copy ทำงานผิดพลาด หรือต้องการ refresh
async function forceRecopy() {
  const prevMonth = getPrevMonth(pmSelectedMonth);

  if (!confirm(
    `🔄 Re-copy ราคาเดือน ${pmSelectedMonth}\n\n` +
    `จากเดือน ${prevMonth}\n\n` +
    `⚠️ ราคาเดือนปัจจุบันทั้งหมดจะถูกลบ และ copy ใหม่จากเดือนก่อน\n\n` +
    `ยืนยัน?`
  )) return;

  try {
    // 1) ลบราคาเดือนปัจจุบันทั้งหมด
    const { error: err1 } = await supabase
      .from('price_master')
      .delete()
      .eq('month', pmSelectedMonth);
    if (err1) throw err1;

    console.log('[PriceMaster] ✅ ลบราคาเดือน ' + pmSelectedMonth + ' แล้ว');

    // 2) เคลียร์ cache → auto-copy ทำงาน
    pmCache = [];
    await autoCopyFromPrevMonth();
    renderPMList();

    showMsg('pmMsg', `✅ Re-copy จาก ${prevMonth} สำเร็จ`, 'ok');
  } catch (e) {
    showMsg('pmMsg', 'Re-copy ล้มเหลว: ' + e.message, 'err');
  }
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

  // ✅ ถ้าเดือนใหม่ไม่มีราคา → auto-copy จากเดือนก่อนหน้า
  if (!pmCache.length) {
    await autoCopyFromPrevMonth();
  }

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

  // ✅ ปุ่ม "เพิ่มราคาใหม่" ด้านบน
  const topBar = `<div style="margin-bottom:12px;display:flex;justify-content:flex-end;gap:8px">
    <button class="primary" onclick="openPMAddForm()" style="padding:8px 16px">
      ➕ เพิ่มราคาใหม่
    </button>
  </div>`;

  if (!pmCache.length) {
    body.innerHTML = topBar + '<p style="text-align:center;color:#94a3b8;padding:20px">ยังไม่มีราคาในเดือนนี้<br><small>ระบบจะ copy จากเดือนก่อนหน้าอัตโนมัติ</small></p>';
    return;
  }

  let html = topBar + '<div class="data-scroll"><table class="data-table"><thead><tr>';
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
        <button onclick="openPMForm(${row.id})">✏️ Edit</button>
        <button class="danger" onclick="deletePM(${row.id})">🗑 ลบ</button>
      </td>
    </tr>`;
  });

  html += '</tbody></table></div>';
  body.innerHTML = html;
}

// ═══════════════════════════════════════════════════════════════
// ➕ ADD MODE — เพิ่มราคาใหม่
// ═══════════════════════════════════════════════════════════════

// ✅ เปิดฟอร์มเพิ่มราคาใหม่
async function openPMAddForm() {
  pmEditingId = null;
  $('pmFormError').innerHTML = '';
  $('pmfMonth').value = pmSelectedMonth;

  const gradeSelect = $('pmfGradegram');
  if (!gradeSelect) return;

  // ✅ ดึง gradegram ทั้งหมดจาก masterCache
  const allGradegrams = [...new Set(
    masterCache.map(m => normalizeGrade(m.grade) + m.gram)
  )].sort();

  // ✅ กรอง gradegram ที่มีอยู่แล้วในเดือนนี้
  const existingGradegrams = new Set(pmCache.map(r => r.gradegram));
  const availableGradegrams = allGradegrams.filter(g => !existingGradegrams.has(g));

  if (!availableGradegrams.length) {
    alert('✅ มีราคาครบทุก gradegram ในเดือนนี้แล้ว');
    return;
  }

  gradeSelect.disabled = false;
  gradeSelect.style.background = '';
  gradeSelect.innerHTML = '<option value="">-- เลือก gradegram --</option>' +
    availableGradegrams.map(g => `<option value="${esc(g)}">${esc(g)}</option>`).join('');

  $('pmFormTitle').textContent = '➕ เพิ่มราคาใหม่ — ' + pmSelectedMonth;

  // เคลียร์ค่า
  $('pmfNormal').value = '';
  $('pmfF').value = '';
  $('pmfBT').value = '';
  $('pmfKTP').value = '';
  $('pmfNcDiscount').value = localStorage.getItem('stockv8_pm_nc_discount') || 1;

  // ✅ เมื่อเลือก gradegram → ดึงราคาจากเดือนก่อนมา pre-fill
  gradeSelect.onchange = () => {
    const g = gradeSelect.value;
    if (!g) return;
    prefillFromPrevMonth(g);
  };

  updatePM_NC_Auto();
  $('pmfNormal').oninput = updatePM_NC_Auto;
  $('pmfNcDiscount').oninput = updatePM_NC_Auto;

  openModal('modalPM');
}

// ✅ Pre-fill ราคาจากเดือนก่อนหน้า
async function prefillFromPrevMonth(gradegram) {
  try {
    const prevMonth = getPrevMonth(pmSelectedMonth);
    const { data, error } = await supabase
      .from('price_master')
      .select('*')
      .eq('month', prevMonth)
      .eq('gradegram', gradegram)
      .eq('is_active', true)
      .maybeSingle();
    if (error) throw error;
    if (!data) return;

    $('pmfNormal').value = data.price_normal || '';
    $('pmfF').value = data.price_f || '';
    $('pmfBT').value = data.price_bt || '';
    $('pmfKTP').value = data.price_ktp || '';
    $('pmfNcDiscount').value = data.nc_discount || 1;

    updatePM_NC_Auto();
    console.log('[PriceMaster] Pre-fill จากเดือน ' + prevMonth + ' สำเร็จ');
  } catch (e) {
    console.warn('prefillFromPrevMonth:', e);
  }
}

// ================= OPEN FORM (EDIT) =================
async function openPMForm(id) {
  if (!id) {
    alert('ใช้ปุ่ม "auto-copy" ที่โหลดอัตโนมัติ\nหรือกด "✏️ Edit" ที่แถวเพื่อแก้ราคา');
    return;
  }

  pmEditingId = id;
  $('pmFormError').innerHTML = '';
  $('pmfMonth').value = pmSelectedMonth;

  const gradeSelect = $('pmfGradegram');
  if (!gradeSelect) return;

  gradeSelect.disabled = true;
  gradeSelect.style.background = '#f1f5f9';

  const row = pmCache.find(r => String(r.id) === String(id));
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

function updatePM_NC_Auto() {
  const normal = Number($('pmfNormal').value) || 0;
  const disc = Number($('pmfNcDiscount').value) || 0;
  $('pmfNC').value = (normal - disc).toFixed(2);
}

// ═══════════════════════════════════════════════════════════════
// SAVE — รองรับทั้ง ADD และ EDIT
// ═══════════════════════════════════════════════════════════════
async function savePMForm() {
  const gradegram = $('pmfGradegram').value;

  // ✅ Validation
  if (!gradegram) {
    $('pmFormError').innerHTML = '<div class="msg err">กรุณาเลือก gradegram</div>';
    return;
  }

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
    if (pmEditingId) {
      // ✅ EDIT MODE
      const { error } = await supabase
        .from('price_master')
        .update(payload)
        .eq('id', pmEditingId);
      if (error) throw error;

      closeModal('modalPM');
      await loadPriceMasterList();
      renderPMList();
      showMsg('pmMsg', `✅ แก้ไขราคา ${gradegram} สำเร็จ`, 'ok');
    } else {
      // ✅ ADD MODE
      payload.gradegram = gradegram;
      payload.month = pmSelectedMonth;
      payload.is_active = true;

      const { error } = await supabase
        .from('price_master')
        .insert(payload);
      if (error) throw error;

      closeModal('modalPM');
      await loadPriceMasterList();
      renderPMList();
      showMsg('pmMsg', `✅ เพิ่มราคา ${gradegram} สำเร็จ`, 'ok');
    }
  } catch (e) {
    $('pmFormError').innerHTML = `<div class="msg err">${esc(e.message)}</div>`;
  }
}

// ================= DELETE =================
async function deletePM(id) {
  const row = pmCache.find(r => String(r.id) === String(id));
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

// ═══════════════════════════════════════════════════════════════
// ❌ ลบ syncPriceMaster() ออก — ไม่ใช้แล้ว
//    เพราะมี autoCopyFromPrevMonth() ทำงานอัตโนมัติตอนเปิดหน้า
//    และมี forceRecopy() สำหรับปุ่ม Manual
// ═══════════════════════════════════════════════════════════════
