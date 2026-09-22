// ═══════════════════════════════════════════════════════════════
// STOCK V8 — purchase-order.js
// Purchase Order Management (List + Form + Auto-Split + Export)
// ═══════════════════════════════════════════════════════════════

let poCache = [];
let poSuppliers = [];
let poPriceMaster = [];
let poSelectedMonth = '';
let poEditingId = null;

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

    // ✅ แยกตาม 3 กลุ่ม: FSC → ปกติ → NC
    const groups = {
      fsc:    supItems.filter(i => i.customer_roll === 'pump_f' && i.quality_b === 'normal'),
      normal: supItems.filter(i => i.customer_roll === 'normal' && i.quality_b === 'normal'),
      nc:     supItems.filter(i => i.quality_b === 'nc')
    };

    // ✅ สร้าง PO ตามกลุ่ม (FSC → ปกติ → NC)
    ['fsc', 'normal', 'nc'].forEach(grp => {
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
    const groupLabel = { fsc: '🟢 FSC', normal: '⚪ ปกติ', nc: '🔴 NC' }[po.group] || '';

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

      html += `<tr data-gradegram="${esc(it.gradegram)}" data-size="${it.size}">
        <td>${i + 1}</td>
        <td><input type="text" value="SDPC.01" style="width:80px"></td>
        <td>${esc(it.gradegram)}</td>
        <td>${it.size}</td>
        <td>${it.quantity}</td>
        <td>${Number(it.quantity * 1000).toLocaleString()}</td>
        <td>${price.toFixed(2)}</td>
        <td>${custLabel}</td>
        <td>${qualLabel}</td>
        <td>${esc(it.note) || '-'}</td>
      </tr>`;
    });

    html += `</tbody></table></div>`;
  });

  html += `<div class="form-actions" style="margin-top:16px">
    <button onclick="closeModal('modalPOForm')">ยกเลิก</button>
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
        kg_total: it.quantity * 1000,
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
  await renderPOList();

  // ล้าง pending
  window._pendingPOs = null;
  window._pendingAlertData = null;
}

// ================= PLACEHOLDER =================
function renderPOFormContent(header, items) {
  $('poFormBody').innerHTML = '<p style="text-align:center;color:#94a3b8">[อยู่ในขั้นถัดไป]</p>';
}

function openPODetail(poId) {
  alert('ดูรายละเอียด PO: ' + poId + '\n[จะทำในขั้นถัดไป]');
}

async function deletePO(poId) {
  if (!confirm('ยืนยันลบ PO?')) return;
  try {
    const { error } = await supabase.rpc('delete_purchase_order', {
      p_po_id: poId,
      p_user_id: currentUser?.id
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
