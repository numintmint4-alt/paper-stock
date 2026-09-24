// ================= ประวัติ PO ที่ถูกลบ =================
async function openDeletedPOList() {
  $('poDetailTitle').textContent = '📜 ประวัติ PO ที่ถูกลบ';
  $('poDetailBody').innerHTML = '<p style="text-align:center;color:#94a3b8;padding:20px">กำลังโหลด...</p>';
  openModal('modalPODetail');

  try {
    const { data, error } = await supabase
      .from('purchase_orders')
      .select('id, po_no, po_date, ref_receive, sup_code, total_items, total_kg, status, deleted_at, deleted_by, delete_note')
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false });

    if (error) throw error;

    if (!data || !data.length) {
      $('poDetailBody').innerHTML = '<p style="text-align:center;color:#94a3b8;padding:30px">ไม่มีประวัติ PO ที่ถูกลบ 🎉</p>';
      return;
    }

    let html = `<div class="msg warn" style="margin-bottom:14px">
      📜 PO ที่ถูกลบทั้งหมด <b>${data.length}</b> รายการ
    </div>`;

    html += '<div class="data-scroll"><table class="data-table"><thead><tr>';
    html += '<th>PO No.</th><th>วันที่ออก</th><th>วันที่รับ</th><th>Sup.</th><th>จำนวน</th><th>KG รวม</th><th>วันที่ลบ</th><th>หมายเหตุ</th><th></th>';
    html += '</tr></thead><tbody>';

    data.forEach(po => {
      html += `<tr>
        <td><b>${esc(po.po_no)}</b></td>
        <td>${fmtDateTH(po.po_date)}</td>
        <td>${fmtDateTH(po.ref_receive)}</td>
        <td>${esc(po.sup_code)}</td>
        <td style="text-align:right">${po.total_items || 0}</td>
        <td style="text-align:right">${Number(po.total_kg || 0).toLocaleString('en-US', {minimumFractionDigits:2})}</td>
        <td>${po.deleted_at ? new Date(po.deleted_at).toLocaleString('th-TH') : '-'}</td>
        <td>${esc(po.delete_note) || '-'}</td>
        <td>
          <button onclick="openDeletedPODetail('${po.id}')">📄 ดูรายละเอียด</button>
        </td>
      </tr>`;
    });

    html += '</tbody></table></div>';

    $('poDetailBody').innerHTML = html;
  } catch (e) {
    console.error('openDeletedPOList:', e);
    $('poDetailBody').innerHTML = `<div class="msg err">โหลดไม่สำเร็จ: ${esc(e.message)}</div>`;
  }
}

// ✅ เปิด Modal รายละเอียด PO ที่ถูกลบ
async function openDeletedPODetail(poId) {
  $('poDetailTitle').textContent = '📄 รายละเอียด PO ที่ถูกลบ';
  $('poDetailBody').innerHTML = '<p style="text-align:center;color:#94a3b8;padding:20px">กำลังโหลด...</p>';

  try {
    const { data, error } = await supabase.rpc('get_purchase_order_detail', { p_po_id: poId });
    if (error) throw error;

    const header = data.header || {};
    const items = data.items || [];
    const logs = data.logs || [];

    $('poDetailTitle').innerHTML = `📄 ${esc(header.po_no)} · ${esc(header.sup_code)} <span style="color:#dc2626;font-weight:400;font-size:14px">(ถูกลบ)</span>`;

    // ✅ Header
    let html = `<div class="msg err" style="margin-bottom:14px">
      <b>⚠️ PO นี้ถูกลบแล้ว</b><br>
      <b>PO No.:</b> ${esc(header.po_no)}<br>
      <b>วันที่ออก:</b> ${fmtDateTH(header.po_date)} · 
      <b>วันที่รับ:</b> ${fmtDateTH(header.ref_receive)}<br>
      <b>Sup.:</b> ${esc(header.sup_code)} · 
      <b>รวม:</b> ${header.total_items || 0} รายการ · ${Number(header.total_kg || 0).toLocaleString()} kg<br>
      <b>ลบเมื่อ:</b> ${header.deleted_at ? new Date(header.deleted_at).toLocaleString('th-TH') : '-'}<br>
      <b>หมายเหตุการลบ:</b> ${esc(header.delete_note) || '-'}
    </div>`;

    // ✅ Items
    html += '<h4>📦 รายการ</h4>';
    html += '<div class="data-scroll"><table class="data-table"><thead><tr>';
    html += '<th>#</th><th>PC.</th><th>Gradegram</th><th>Size</th><th>Qty</th><th>KG รวม</th><th>Price</th><th>หมายเหตุ</th>';
    html += '</tr></thead><tbody>';

    items.forEach((it, i) => {
      const isCancelled = it.status === 'cancelled';
      const rowStyle = isCancelled ? 'style="opacity:0.5;text-decoration:line-through"' : '';
      html += `<tr ${rowStyle}>
        <td>${i + 1}</td>
        <td>${esc(it.pc_code) || 'SDPC.01'}</td>
        <td><b>${esc(it.gradegram)}</b></td>
        <td>${it.size}</td>
        <td style="text-align:right">${it.quantity}</td>
        <td style="text-align:right">${Number(it.kg_total || 0).toLocaleString('en-US', {minimumFractionDigits:2})}</td>
        <td style="text-align:right">${Number(it.price || 0).toFixed(2)}</td>
        <td>${esc(it.remark_combined || it.note) || '-'}</td>
      </tr>`;
    });

    html += '</tbody></table></div>';

    // ✅ Logs
    if (logs.length) {
      html += '<h4 style="margin-top:16px">📜 ประวัติการแก้ไข</h4>';
      html += '<div class="data-scroll" style="max-height:300px"><table class="data-table"><thead><tr>';
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

    // ✅ ปุ่มกลับ
    html += `<div class="form-actions" style="margin-top:16px">
      <button onclick="openDeletedPOList()">◀ กลับไปประวัติ</button>
    </div>`;

    $('poDetailBody').innerHTML = html;
  } catch (e) {
    $('poDetailBody').innerHTML = `<div class="msg err">${esc(e.message)}</div>`;
  }
}
