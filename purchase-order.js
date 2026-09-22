// ═══════════════════════════════════════════════════════════════
// STOCK V8 — purchase-order.js
// Purchase Order Management (List + Form + Auto-Split + Export)
// ═══════════════════════════════════════════════════════════════

let poCache = [];
let poSuppliers = [];
let poPriceMaster = [];
let poSelectedMonth = '';
let poEditingId = null;

// ================= STD WEIGHT HELPER =================
function getStdWeight(gradegram, size) {
  // ✅ หา std_weight_kg จาก masterCache
  // gradegram = 'CA105' → grade = 'CA', gram = '105'
  const match = String(gradegram).match(/^([A-Z]+F?)(\d+)$/);
  if (!match) return 0;

  const grade = match[1];     // 'CA' หรือ 'CAF'
  const gram = match[2];      // '105'

  // หา paper_specs ที่ตรง grade + gram + size
  const spec = masterCache.find(m =>
    normalizeGrade(m.grade) === grade &&
    String(m.gram) === gram &&
    Number(m.size) === Number(size)
  );

  return spec ? Number(spec.std_weight_kg) || 0 : 0;
}

// ✅ คำนวณ KG. รวม
function calcKgTotal(gradegram, size, quantity) {
  const std = getStdWeight(gradegram, size);
  return Number((std * Number(quantity)).toFixed(2));
}

// ================= INIT =================
async function initPurchaseOrderTab() {
  const today = new Date();
  if (!poSelectedMonth) {
    poSelectedMonth = `${today.getFullYear()}-${pad(today.getMonth()+1)}`;
  }
  // ✅ set ค่าใน input poMonth
  const monthEl = $('poMonth');
  if (monthEl && !monthEl.value) monthEl.value = poSelectedMonth;

  await loadPOSuppliers();
  await loadPriceMaster();
  await renderPOList();

  // ✅ ตรวจสอบว่ามีข้อมูลจาก Alert ส่งมาไหม
  const fromAlert = sessionStorage.getItem('alert_to_po');
  if (fromAlert) {
    try {
      const data = JSON.parse(fromAlert);
      sessionStorage.removeItem('alert_to_po');
      await openPOFormFromAlert(data);
    } catch (e) {
      console.warn('parse alert_to_po:', e);
    }
  }
}

// ================= SUPPLIERS =================
async function loadPOSuppliers() {
  try {
    const { data, error } = await supabase
      .from('paper_suppliers')
      .select('code')
      .eq('is_active', true)
      .order('code');
    if (error) throw error;
    poSuppliers = (data || []).map(s => s.code);
  } catch (e) {
    console.warn('loadPOSuppliers:', e);
    poSuppliers = ['EKP', 'MKP', 'SCK'];
  }
}

// ================= PRICE MASTER =================
async function loadPriceMaster() {
  try {
    const { data, error } = await supabase
      .from('price_master')
      .select('*')
      .eq('month', poSelectedMonth)
      .eq('is_active', true);
    if (error) throw error;
    poPriceMaster = data || [];
  } catch (e) {
    console.warn('loadPriceMaster:', e);
    poPriceMaster = [];
  }
}

function getPriceFromMaster(gradegram, customerRoll, qualityB) {
  const m = poPriceMaster.find(p => p.gradegram === gradegram);
  if (!m) return 0;

  let base = Number(m.price_normal) || 0;

  if (customerRoll === 'pump_f'   && m.price_f)   base = Number(m.price_f);
  if (customerRoll === 'pump_bt'  && m.price_bt)  base = Number(m.price_bt);
  if (customerRoll === 'pump_ktp' && m.price_ktp) base = Number(m.price_ktp);

  if (qualityB === 'nc') {
    base = base - (Number(m.nc_discount) || 0);
  }

  return Number(base.toFixed(2));
}

// ================= RENDER PO LIST =================
async function renderPOList() {
  const listEl = $('poListBody');
  if (!listEl) return;
  listEl.innerHTML = '<p style="text-align:center;color:#94a3b8;padding:20px">กำลังโหลด...</p>';

  try {
    const { data, error } = await supabase.rpc('get_purchase_orders', {
      p_month: poSelectedMonth,
      p_sup: null,
      p_status: null
    });
    if (error) throw error;

    poCache = data || [];
    if (!poCache.length) {
      listEl.innerHTML = '<p style="text-align:center;color:#94a3b8;padding:30px">ยังไม่มี PO ในเดือนนี้</p>';
      return;
    }

    let html = '<div class="data-scroll"><table class="data-table"><thead><tr>';
    html += '<th>PO No.</th><th>วันที่</th><th>Sup.</th><th>จำนวน</th><th>KG รวม</th><th>สถานะ</th><th></th>';
    html += '</tr></thead><tbody>';

    poCache.forEach(po => {
      const statusBadge = {
        draft: '<span class="badge" style="background:#fef3c7;color:#b45309">📝 Draft</span>',
        saved: '<span class="badge ok">✅ Saved</span>',
        sent:  '<span class="badge" style="background:#dbeafe;color:#1e40af">📤 Sent</span>'
      }[po.status] || po.status;

      html += `<tr>
        <td><b>${esc(po.po_no)}</b></td>
        <td>${po.po_date || '-'}</td>
        <td>${esc(po.sup_code)}</td>
        <td style="text-align:right">${po.total_items || 0}</td>
        <td style="text-align:right">${Number(po.total_kg || 0).toLocaleString('en-US', {minimumFractionDigits:2})}</td>
        <td>${statusBadge}</td>
        <td>
          <button onclick="openPODetail('${po.id}')">📄 ดู</button>
          <button onclick="openPOForm('${po.id}')">✏️ แก้ไข</button>
          <button class="danger" onclick="deletePO('${po.id}')">🗑 ลบ</button>
        </td>
      </tr>`;
    });
    html += '</tbody></table></div>';
    listEl.innerHTML = html;
  } catch (e) {
    console.error('renderPOList:', e);
    listEl.innerHTML = `<div class="msg err">โหลดไม่สำเร็จ: ${esc(e.message)}</div>`;
  }
}

// ================= OPEN PO FORM =================
async function openPOForm(poId) {
  poEditingId = poId || null;
  $('poFormTitle').textContent = poId ? '✏️ แก้ไข PO' : '🧾 สร้าง PO ใหม่';
  $('poFormBody').innerHTML = '<p style="text-align:center;color:#94a3b8;padding:20px">กำลังโหลด...</p>';
  openModal('modalPOForm');

  if (poId) {
    try {
      const { data, error } = await supabase.rpc('get_purchase_order_detail', { p_po_id: poId });
      if (error) throw error;
      renderPOFormContent(data.header, data.items);
    } catch (e) {
      $('poFormBody').innerHTML = `<div class="msg err">${esc(e.message)}</div>`;
    }
  } else {
    renderPOFormContent(null, []);
  }
}

// ================= OPEN PO FORM FROM ALERT =================
async function openPOFormFromAlert(alertData) {
  poEditingId = null;

  // ✅ แยก PO อัตโนมัติ
  const pos = autoGroupPOItems(alertData.items);

  // เปิด PO แรก
  $('poFormTitle').textContent = `🧾 สร้าง PO (${pos.length} ฉบับ)`;
  $('poFormBody').innerHTML = '<p>กำลังสร้าง...</p>';
  openModal('modalPOForm');

  renderMultiPOForm(pos, alertData);
}

// ================= AUTO GROUP PO =================
function autoGroupPOItems(items) {
  // ✅ เรียงตามลำดับ Sup: EKP → MKP → SCK
  const supOrder = { EKP: 1, MKP: 2, SCK: 3 };

  // ✅ ฟังก์ชันตรวจ FSC (จาก gradegram prefix)
  function isFSC(gradegram) {
    if (!gradegram) return false;
    const match = String(gradegram).match(/^([A-Z]+)/);
    if (!match) return false;
    return match[1].includes('F');
  }

  // ✅ แยกตาม Sup
  const bySup = {};
  items.forEach(it => {
    if (!bySup[it.sup]) bySup[it.sup] = [];
    bySup[it.sup].push(it);
  });

  // ✅ เรียง Sup
  const sortedSups = Object.keys(bySup).sort((a, b) => (supOrder[a] || 99) - (supOrder[b] || 99));

  const pos = [];

  sortedSups.forEach(sup => {
    const supItems = bySup[sup];

    // ✅ แยก 4 กลุ่ม: FSC+ปกติ, FSC+NC, Non-FSC+ปกติ, Non-FSC+NC
    const groups = {
      fsc_normal:    supItems.filter(i => isFSC(i.gradegram) && i.quality_b === 'normal'),
      fsc_nc:        supItems.filter(i => isFSC(i.gradegram) && i.quality_b === 'nc'),
      nonfsc_normal: supItems.filter(i => !isFSC(i.gradegram) && i.quality_b === 'normal'),
      nonfsc_nc:     supItems.filter(i => !isFSC(i.gradegram) && i.quality_b === 'nc')
    };

    // ✅ ลำดับ: FSC+ปกติ → FSC+NC → Non-FSC+ปกติ → Non-FSC+NC
    ['fsc_normal', 'fsc_nc', 'nonfsc_normal', 'nonfsc_nc'].forEach(grp => {
      const grpItems = groups[grp];
      if (!grpItems.length) return;

      // แยกเป็น chunks ละ 15
      for (let i = 0; i < grpItems.length; i += 15) {
        const chunk = grpItems.slice(i, i + 15);
        pos.push({
          sup_code: sup,
          items: chunk,
          group: grp
        });
      }
    });
  });

  return pos;
}

// ================= RENDER MULTI PO FORM =================
function renderMultiPOForm(posList, alertData) {
  const analyzedDate = alertData.analyzed_date || toISODate(new Date());

  let html = '';

  // อ้างอิง
  html += `<div class="msg info" style="margin-bottom:14px">
    <b>📋 ข้อมูลอ้างอิงจาก Alert</b><br>
    วันที่วิเคราะห์: <b>${analyzedDate}</b> (ล็อก)<br>
    Stock Level: ${alertData.ref_snapshot} · Stock: ${alertData.ref_stock} · Receive: ${alertData.ref_receive}
  </div>`;

  html += `<div class="msg warn" style="margin-bottom:14px">
    ⚠️ ระบบแยกเป็น <b>${posList.length} PO</b> ตามเงื่อนไข (Sup + กลุ่ม + 15 รายการ/PO)
  </div>`;

  posList.forEach((po, idx) => {
    const groupLabel = {
      fsc_normal:    '🟢 FSC · ปกติ',
      fsc_nc:        '🟢 FSC · 🔴 NC',
      nonfsc_normal: '⚪ Non-FSC · ปกติ',
      nonfsc_nc:     '⚪ Non-FSC · 🔴 NC'
    }[po.group] || po.group;

    html += `<div class="po-form-group" style="border:1px solid #cbd5e1;border-radius:8px;padding:12px;margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <div>
          <b>PO #${idx + 1}</b> · Sup: <b>${esc(po.sup_code)}</b> · ${groupLabel} · ${po.items.length} รายการ
        </div>
        <div>
          PO No.: <input type="text" class="po-input-po-no" value="" placeholder="auto" style="width:150px">
        </div>
      </div>

      <table class="alert-flat-table" style="font-size:12px">
        <thead>
          <tr>
            <th>#</th>
            <th>PC.</th>
            <th>Gradegram</th>
            <th>Size</th>
            <th>Quantity</th>
            <th>KG. รวม</th>
            <th>Price</th>
            <th>ม้วนลูกค้า</th>
            <th>คุณภาพ B</th>
            <th>หมายเหตุ</th>
          </tr>
        </thead>
        <tbody>`;

    po.items.forEach((it, i) => {
      const price = getPriceFromMaster(it.gradegram, it.customer_roll, it.quality_b);
      const custLabel = { normal: 'ปกติ', pump_f: 'ปั้ม F', pump_bt: 'ปั้ม BT', pump_ktp: 'ปั้ม KTP' }[it.customer_roll] || it.customer_roll;
      const qualLabel = { normal: 'ปกติ', nc: 'NC' }[it.quality_b] || it.quality_b;

      // ✅ คำนวณ KG จาก std_weight
      const kgTotal = calcKgTotal(it.gradegram, it.size, it.quantity);

      html += `<tr data-gradegram="${esc(it.gradegram)}" data-size="${it.size}">
        <td>${i + 1}</td>
        <td><input type="text" value="SDPC.01" style="width:80px"></td>
        <td>${esc(it.gradegram)}</td>
        <td>${it.size}</td>
        <td>${it.quantity}</td>
        <td>${kgTotal.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
        <td>${price.toFixed(2)}</td>
        <td>${custLabel}</td>
        <td>${qualLabel}</td>
        <td>${esc(it.note) || '-'}</td>
      </tr>`;
    });

    html += `</tbody></table></div>`;
  });

  html += `<div class="form-actions" style="margin-top:16px">
    <button onclick="cancelPOForm()">ยกเลิก</button>
    <button class="primary" onclick="saveAllPOs()">💾 บันทึกทั้งหมด</button>
  </div>`;

  // เก็บข้อมูลไว้ใช้ตอน save
  window._pendingPOs = posList;
  window._pendingAlertData = alertData;

  $('poFormBody').innerHTML = html;
}

// ================= SAVE ALL POs =================
async function saveAllPOs() {
  const posList = window._pendingPOs || [];
  const alertData = window._pendingAlertData || {};

  if (!posList.length) {
    alert('ไม่มี PO ให้บันทึก');
    return;
  }

  if (!confirm(`ยืนยันบันทึก ${posList.length} PO?`)) return;

  const btn = event.target;
  btn.disabled = true;
  btn.textContent = 'กำลังบันทึก...';

  let successCount = 0;
  let errorMsg = '';

  for (let i = 0; i < posList.length; i++) {
    const po = posList[i];

    // ✅ สร้างเลข PO
    const today = new Date();
    const yy = String(today.getFullYear()).slice(-2);
    const mm = pad(today.getMonth() + 1);

    let poNo;
    try {
      const { data: nextNo, error: errNext } = await supabase.rpc('get_next_po_no', {
        p_yy: yy, p_mm: mm
      });
      if (errNext) throw errNext;
      poNo = nextNo;
    } catch (e) {
      errorMsg += `PO #${i+1}: ${e.message}; `;
      continue;
    }

    // ✅ เตรียม items
    const items = po.items.map((it, idx) => {
      const price = getPriceFromMaster(it.gradegram, it.customer_roll, it.quality_b);
      const custLabel = { normal: '', pump_f: 'ปั้ม F', pump_bt: 'ปั้ม BT', pump_ktp: 'ปั้ม KTP' }[it.customer_roll] || '';
      const qualLabel = { normal: '', nc: 'NC' }[it.quality_b] || '';

      const remarkParts = [custLabel, qualLabel, it.note].filter(x => x && x.trim());
      const remarkCombined = remarkParts.join(',');

      return {
        seq: idx + 1,
        pc_code: 'SDPC.01',
        gradegram: it.gradegram,
        size: it.size,
        gradegram_size: it.gradegram_size,
        quantity: it.quantity,
        kg_total: calcKgTotal(it.gradegram, it.size, it.quantity),   // ✅ ใช้ std_weight
        price: price,
        customer_roll: it.customer_roll || 'normal',
        quality_b: it.quality_b || 'normal',
        note: it.note || '',
        remark_combined: remarkCombined
      };
    });

    // ✅ header
    const header = {
      po_no: poNo,
      po_date: toISODate(new Date()),
      sup_code: po.sup_code,
      status: 'draft',
      ref_snapshot: alertData.ref_snapshot,
      ref_stock: alertData.ref_stock,
      ref_receive: alertData.ref_receive,
      remark: '',
      created_by: currentUser?.id
    };

    try {
      const { error } = await supabase.rpc('save_purchase_order', {
        p_header: header,
        p_items: items
      });
      if (error) throw error;
      successCount++;
    } catch (e) {
      errorMsg += `PO #${i+1}: ${e.message}; `;
    }
  }

  btn.disabled = false;
  btn.textContent = '💾 บันทึกทั้งหมด';

  if (errorMsg) {
    alert(`✅ สำเร็จ ${successCount}/${posList.length}\n❌ Error: ${errorMsg}`);
  } else {
    alert(`✅ บันทึกสำเร็จ ${successCount} PO`);
  }

  closeModal('modalPOForm');

  // ✅ ไปหน้า PO List
  const poBtn = document.querySelector('.nav button[data-tab="purchase-order"]');
  if (poBtn) poBtn.click();

  await renderPOList();

  // ล้าง pending
  window._pendingPOs = null;
  window._pendingAlertData = null;
}

// ================= RENDER PO FORM (EDIT) =================
function renderPOFormContent(header, items) {
  if (!header) {
    $('poFormBody').innerHTML = '<p style="text-align:center;color:#94a3b8">ไม่มีข้อมูล</p>';
    return;
  }

  let html = `<div class="msg info" style="margin-bottom:14px">
    <b>${esc(header.po_no)}</b> · Sup: <b>${esc(header.sup_code)}</b><br>
    วันที่: ${header.po_date || '-'} · สถานะ: <b>${header.status}</b>
  </div>`;

  html += `<div class="po-form-group">
    <table class="alert-flat-table" style="font-size:12px">
      <thead><tr>
        <th>#</th><th>PC.</th><th>Gradegram</th><th>Size</th><th>Quantity</th><th>Price</th>
        <th>ม้วนลูกค้า</th><th>คุณภาพ B</th><th>หมายเหตุ</th><th></th>
      </tr></thead>
      <tbody>`;

  items.filter(it => it.status !== 'cancelled').forEach((it, i) => {
    const custLabel = { normal: 'ปกติ', pump_f: 'ปั้ม F', pump_bt: 'ปั้ม BT', pump_ktp: 'ปั้ม KTP' }[it.customer_roll] || 'ปกติ';
    const qualLabel = { normal: 'ปกติ', nc: 'NC' }[it.quality_b] || 'ปกติ';

    html += `<tr data-item-id="${it.id}">
      <td>${i + 1}</td>
      <td><input type="text" value="${esc(it.pc_code) || 'SDPC.01'}" style="width:80px" onchange="onPOItemEdit('${it.id}', 'pc_code', this.value)"></td>
      <td>${esc(it.gradegram)}</td>
      <td>${it.size}</td>
      <td><input type="number" value="${it.quantity}" style="width:60px" onchange="onPOItemEdit('${it.id}', 'quantity', this.value)"></td>
      <td><input type="number" value="${Number(it.price || 0).toFixed(2)}" step="0.01" style="width:70px" onchange="onPOItemEdit('${it.id}', 'price', this.value)"></td>
      <td>
        <select onchange="onPOItemEdit('${it.id}', 'customer_roll', this.value)">
          <option value="normal" ${it.customer_roll === 'normal' ? 'selected' : ''}>ปกติ</option>
          <option value="pump_f" ${it.customer_roll === 'pump_f' ? 'selected' : ''}>ปั้ม F</option>
          <option value="pump_bt" ${it.customer_roll === 'pump_bt' ? 'selected' : ''}>ปั้ม BT</option>
          <option value="pump_ktp" ${it.customer_roll === 'pump_ktp' ? 'selected' : ''}>ปั้ม KTP</option>
        </select>
      </td>
      <td>
        <select onchange="onPOItemEdit('${it.id}', 'quality_b', this.value)">
          <option value="normal" ${it.quality_b === 'normal' ? 'selected' : ''}>ปกติ</option>
          <option value="nc" ${it.quality_b === 'nc' ? 'selected' : ''}>NC</option>
        </select>
      </td>
      <td><input type="text" value="${esc(it.note) || ''}" style="width:150px" onchange="onPOItemEdit('${it.id}', 'note', this.value)"></td>
      <td><button class="danger" onclick="cancelPOItem('${it.id}')">❌ ยกเลิก</button></td>
    </tr>`;
  });

  html += `</tbody></table></div>`;

  html += `<div class="form-actions" style="margin-top:16px">
    <button onclick="cancelPOForm()">ยกเลิก</button>
    <button class="primary" onclick="closeModal('modalPOForm'); renderPOList();">💾 ปิด</button>
  </div>`;

  $('poFormBody').innerHTML = html;
}

// ================= EDIT ITEM =================
async function onPOItemEdit(itemId, field, value) {
  try {
    const payload = {};
    payload[field] = value;

    const { error } = await supabase.rpc('update_po_item', {
      p_item_id: itemId,
      p_data: payload,
      p_user_id: currentUser?.id
    });
    if (error) throw error;
    // ✅ Silent success
  } catch (e) {
    alert('❌ ' + e.message);
  }
}

// ================= CANCEL ITEM =================
async function cancelPOItem(itemId) {
  const note = prompt('❓ หมายเหตุการยกเลิกรายการ:');
  if (note === null) return;
  if (!note.trim()) {
    alert('กรุณาใส่หมายเหตุ');
    return;
  }

  try {
    const { error } = await supabase.rpc('cancel_po_item', {
      p_item_id: itemId,
      p_note: note,
      p_user_id: currentUser?.id
    });
    if (error) throw error;

    // Reload PO detail
    const poId = poEditingId;
    if (poId) {
      const { data } = await supabase.rpc('get_purchase_order_detail', { p_po_id: poId });
      renderPOFormContent(data.header, data.items);
    }
    alert('✅ ยกเลิกรายการสำเร็จ');
  } catch (e) {
    alert('❌ ' + e.message);
  }
}

// ================= PO DETAIL =================
async function openPODetail(poId) {
  $('poDetailTitle').textContent = '📄 รายละเอียด PO';
  $('poDetailBody').innerHTML = '<p style="text-align:center;color:#94a3b8;padding:20px">กำลังโหลด...</p>';
  openModal('modalPODetail');

  try {
    const { data, error } = await supabase.rpc('get_purchase_order_detail', { p_po_id: poId });
    if (error) throw error;

    const header = data.header || {};
    const items = data.items || [];
    const logs = data.logs || [];

    $('poDetailTitle').innerHTML = `📄 ${esc(header.po_no)} · ${esc(header.sup_code)}`;

    const statusBadge = {
      draft: '<span class="badge" style="background:#fef3c7;color:#b45309">📝 Draft</span>',
      saved: '<span class="badge ok">✅ Saved</span>',
      sent:  '<span class="badge" style="background:#dbeafe;color:#1e40af">📤 Sent</span>'
    }[header.status] || header.status;

    // Header
    let html = `<div class="msg info" style="margin-bottom:14px">
      <b>${esc(header.po_no)}</b> · ${statusBadge}<br>
      วันที่: <b>${header.po_date || '-'}</b> · Sup: <b>${esc(header.sup_code)}</b><br>
      อ้างอิง: Stock Level <b>${header.ref_snapshot || '-'}</b> · Stock <b>${header.ref_stock || '-'}</b> · Receive <b>${header.ref_receive || '-'}</b><br>
      รวม: <b>${header.total_items || 0}</b> รายการ · <b>${Number(header.total_kg || 0).toLocaleString()}</b> kg
    </div>`;

    // Items
    html += '<h4>📦 รายการ</h4>';
    html += '<div class="data-scroll"><table class="data-table"><thead><tr>';
    html += '<th>#</th><th>PC.</th><th>Gradegram</th><th>Size</th><th>Qty</th><th>KG รวม</th>';
    html += '<th>Price</th><th>ม้วนลูกค้า</th><th>คุณภาพ B</th><th>FSC</th><th>หมายเหตุ</th><th>สถานะ</th>';
    html += '</tr></thead><tbody>';

    items.forEach((it, i) => {
      const isCancelled = it.status === 'cancelled';
      const custLabel = { normal: 'ปกติ', pump_f: 'ปั้ม F', pump_bt: 'ปั้ม BT', pump_ktp: 'ปั้ม KTP' }[it.customer_roll] || 'ปกติ';
      const qualLabel = { normal: 'ปกติ', nc: 'NC' }[it.quality_b] || 'ปกติ';
      const isFSC = /^([A-Z]+)/.test(it.gradegram) && it.gradegram.match(/^([A-Z]+)/)[1].includes('F');
      const rowStyle = isCancelled ? 'style="opacity:0.5;text-decoration:line-through"' : '';

      html += `<tr ${rowStyle}>
        <td>${i + 1}</td>
        <td>${esc(it.pc_code) || 'SDPC.01'}</td>
        <td><b>${esc(it.gradegram)}</b></td>
        <td>${it.size}</td>
        <td style="text-align:right">${it.quantity}</td>
        <td style="text-align:right">${Number(it.kg_total || 0).toLocaleString()}</td>
        <td style="text-align:right">${Number(it.price || 0).toFixed(2)}</td>
        <td>${custLabel}</td>
        <td>${qualLabel}</td>
        <td>${isFSC ? '🟢' : '⚪'}</td>
        <td>${esc(it.note) || '-'}</td>
        <td>${isCancelled ? `❌ ยกเลิก: ${esc(it.cancel_note)}` : '✅ ปกติ'}</td>
      </tr>`;
    });

    html += '</tbody></table></div>';

    // Logs
    if (logs.length) {
      html += '<h4 style="margin-top:16px">📜 ประวัติการแก้ไข</h4>';
      html += '<div class="data-scroll" style="max-height:200px"><table class="data-table"><thead><tr>';
      html += '<th>วันที่</th><th>การกระทำ</th><th>รายการ</th><th>หมายเหตุ</th>';
      html += '</tr></thead><tbody>';
      logs.forEach(l => {
        html += `<tr>
          <td>${new Date(l.changed_at).toLocaleString('th-TH')}</td>
          <td>${esc(l.action)}</td>
          <td>${esc(l.field_name || '-')}</td>
          <td>${esc(l.note || '-')}</td>
        </tr>`;
      });
      html += '</tbody></table></div>';
    }

    $('poDetailBody').innerHTML = html;
  } catch (e) {
    $('poDetailBody').innerHTML = `<div class="msg err">${esc(e.message)}</div>`;
  }
}

// ================= DELETE PO =================
async function deletePO(poId) {
  const po = poCache.find(p => p.id === poId);
  if (!po) return;

  let password = null;

  // ✅ ถ้า status = saved → ขอรหัสผ่าน
  if (po.status === 'saved' || po.status === 'sent') {
    password = prompt(`🔒 PO นี้สถานะ ${po.status.toUpperCase()}\nกรุณาใส่รหัสผ่านเพื่อยืนยัน:`);
    if (!password) return;
  }

  const note = prompt('📝 หมายเหตุการลบ:');
  if (note === null) return;

  if (!confirm(`⚠️ ยืนยันลบ PO ${po.po_no}?\n\n(ไม่สามารถกู้คืนได้)`)) return;

  try {
    const { error } = await supabase.rpc('delete_purchase_order', {
      p_po_id: poId,
      p_user_id: currentUser?.id,
      p_password: password,
      p_note: note
    });
    if (error) throw error;
    alert('✅ ลบสำเร็จ');
    await renderPOList();
  } catch (e) {
    alert('❌ ' + e.message);
  }
}

// ================= PO MONTH CHANGE =================
async function onPOMonthChange() {
  const monthEl = $('poMonth');
  if (!monthEl) return;
  poSelectedMonth = monthEl.value;
  await loadPriceMaster();
  await renderPOList();
}

// ================= CANCEL PO FORM =================
function cancelPOForm() {
  // ✅ ปิด modal
  closeModal('modalPOForm');

  // ✅ ล้าง pending
  window._pendingPOs = null;
  window._pendingAlertData = null;

  // ✅ กลับไป Tab Alert
  const alertBtn = document.querySelector('.nav button[data-tab="alert"]');
  if (alertBtn) alertBtn.click();
}

// ================= EXPORT PO TO EXCEL =================
function exportPOToExcel() {
  if (!poCache || !poCache.length) {
    alert('ไม่มีข้อมูล PO');
    return;
  }

  if (!confirm(`Export ${poCache.length} PO เป็น Excel?`)) return;

  // ✅ ดึง items ของทุก PO
  exportPOToExcel_Async();
}

async function exportPOToExcel_Async() {
  try {
    const allItems = [];
    const posWithItems = [];

    for (const po of poCache) {
      const { data, error } = await supabase.rpc('get_purchase_order_detail', { p_po_id: po.id });
      if (error) throw error;

      const items = (data.items || []).filter(it => it.status !== 'cancelled');

      posWithItems.push({
        po: data.header,
        items: items
      });

      items.forEach(it => {
        allItems.push({
          ...it,
          po_no: data.header.po_no,
          sup_code: data.header.sup_code
        });
      });
    }

    if (!allItems.length) {
      alert('ไม่มีรายการที่จะ export');
      return;
    }

    // ✅ สร้าง Sheet
    const wsData = [];

    // Header row
    wsData.push([
      'PC.', 'SUP.', 'Gradegram', 'Size', 'Gradegram-Size',
      'Quantity', 'KG. รวม', 'BU', 'Department', 'Price', 'หมายเหตุ', 'เลขที่ PO'
    ]);

    // Data rows
    posWithItems.forEach((p, poIdx) => {
      p.items.forEach((it, itemIdx) => {
        const custLabel = { normal: '', pump_f: 'ปั้ม F', pump_bt: 'ปั้ม BT', pump_ktp: 'ปั้ม KTP' }[it.customer_roll] || '';
        const qualLabel = { normal: '', nc: 'NC' }[it.quality_b] || '';
        const noteParts = [custLabel, qualLabel, it.note].filter(x => x && x.trim());
        const remarkCombined = noteParts.join(',');

        wsData.push([
          it.pc_code || 'SDPC.01',
          p.po.sup_code || '',
          it.gradegram,
          it.size,
          it.gradegram_size,
          it.quantity,
          Number(it.kg_total || 0),
          1,
          '13110',
          Number(it.price || 0),
          remarkCombined,
          itemIdx === 0 ? p.po.po_no : ''   // ✅ แค่บรรทัดแรก
        ]);
      });
    });

    // สร้าง Worksheet
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // ✅ กำหนด column widths
    ws['!cols'] = [
      { wch: 10 }, { wch: 8 }, { wch: 12 }, { wch: 6 }, { wch: 16 },
      { wch: 10 }, { wch: 12 }, { wch: 5 }, { wch: 12 }, { wch: 10 },
      { wch: 40 }, { wch: 16 }
    ];

    // ✅ Number format
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let R = 1; R <= range.e.r; R++) {
      // KG. รวม (col 6)
      const kgCell = ws[XLSX.utils.encode_cell({ r: R, c: 6 })];
      if (kgCell) kgCell.z = '#,##0.00';
      // Price (col 9)
      const pCell = ws[XLSX.utils.encode_cell({ r: R, c: 9 })];
      if (pCell) pCell.z = '0.00';
    }

    // ✅ สร้าง Workbook
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'PO');

    // ✅ ดาวน์โหลด
    const month = poSelectedMonth || new Date().toISOString().slice(0, 7);
    XLSX.writeFile(wb, `PO_${month}.xlsx`);

    alert(`✅ Export ${allItems.length} รายการ จาก ${posWithItems.length} PO สำเร็จ`);
  } catch (e) {
    alert('❌ ' + e.message);
  }
}
