// ═══════════════════════════════════════════════════════════════
//  forecast-api.js — ประมาณการสั่งซื้อม้วนกระดาษ  [2/3 ติดต่อ Supabase]
//  • ทุกการอ่าน/เขียนฐานข้อมูล + Storage อยู่ในไฟล์นี้ไฟล์เดียว  → window.FC.api
//  • ต้องรัน 01_forecast_purchase_estimate.sql ก่อน
//  • ใช้ global: supabase, fetchAllRows, showToast, fetchFromPO (จาก app.js / receive.js)
// ═══════════════════════════════════════════════════════════════
(function () {
  'use strict';
  const { fcKey, fcRowGG, pad2, thMonth } = window.FC;
  const toast = (m, t, d) => (typeof showToast === 'function') ? showToast(m, t || 'info', d) : console.log(m);
  const BUCKET = 'forecast-docs';

  // ═════════════ ตัวช่วย ═════════════
  async function fetchSafe(build) {
    try { return await fetchAllRows(() => build().order('id')); }
    catch (e) { return await fetchAllRows(build); }
  }
  function emptySrc() {
    return { usage: { map: new Map(), has: [false, false, false] }, level: new Map(), stock: new Map(),
             recv: new Map(), resv: new Map(), est: new Map(), estRev: null };
  }
  const addTo = (map, k, v) => map.set(k, (map.get(k) || 0) + v);

  // ═════════════ รายการ Snapshot / เดือนที่บันทึกแล้ว / รายชื่อลูกค้า ═════════════
  async function fetchSnaps() {
    const { data, error } = await supabase.from('stock_level_snapshots')
      .select('id, title, months, mode, created_at').order('created_at', { ascending: false });
    if (error) { toast('โหลดรายการ Stock Level Snapshot ไม่สำเร็จ: ' + error.message, 'err'); return []; }
    return data || [];
  }
  async function fetchSavedMonths(group, exceptMonth) {
    const { data } = await supabase.from('forecast_orders').select('month_year')
      .eq('grade_group', group).in('status', ['saved', 'approved']);
    return [...new Set((data || []).map(r => r.month_year))].filter(m => m !== exceptMonth).sort();
  }
  async function fetchCustomers() {
    if (typeof usagePivotState !== 'undefined' && usagePivotState.pivotCustomers && usagePivotState.pivotCustomers.length)
      return usagePivotState.pivotCustomers.slice();
    const data = await fetchAllRows(() => supabase.from('usage_records_raw').select('customer_code, customer_name'));
    const set = new Set();
    (data || []).forEach(d => {
      const code = (d.customer_code || '').trim(), name = (d.customer_name || '').trim();
      const disp = code && name ? `${code} (${name})` : (code || name);
      if (disp) set.add(disp);
    });
    return [...set].sort();
  }

  // ═════════════ แหล่งข้อมูลของแต่ละแถว (ข้อ 1, 4, 7, 8, 9, 11) ═════════════
  async function srcUsage(W) {
    const P = W.params, months = [P.m1, P.m2, P.m3];
    const map = new Map(), has = [false, false, false], missing = [];
    await Promise.all(months.map(async (m, i) => {
      if (!m) return;
      const rows = await fetchAllRows(() => supabase.from('usage_snapshots')
        .select('grade, width, total_rolls').eq('snapshot_month', m).eq('customer_filter', 'ลูกค้าทั่วไป')
        .order('grade').order('width'));
      if (!rows.length) { missing.push(m); return; }
      has[i] = true;
      rows.forEach(r => {
        const k = fcKey(r.grade) + '|' + Number(r.width);
        const a = map.get(k) || [0, 0, 0];
        a[i] += Number(r.total_rolls) || 0;
        map.set(k, a);
      });
    }));
    W.src.usage = { map, has };
    if (missing.length) toast(`⚠️ ${missing.map(thMonth).join(', ')} ยังไม่ได้บันทึกสรุปการใช้ม้วน (ลูกค้าทั่วไป) ใน Roll Paper Usage`, 'warn', 6000);
  }
  async function srcLevel(W) {
    const map = new Map(), id = W.params.levelSnapId;
    if (id) {
      const { data, error } = await supabase.from('stock_level_snapshots').select('matrix_data').eq('id', id).single();
      if (error) toast('โหลด Stock Level Snapshot ไม่สำเร็จ: ' + error.message, 'err');
      (data?.matrix_data || []).forEach(r => addTo(map, fcKey(r.gradegram) + '|' + Number(r.size), Number(r.max_rolls) || 0));
    }
    W.src.level = map;
  }
  // ข้อ 7: Stock ณ วันที่ — สูตรเดียวกับหน้า Stock Alert (get_alert_matrix_v2)
  //   = (น้ำหนักม้วนเต็ม 'full' + น้ำหนักม้วนเศษ 'scrap' ไม่รวม 'waiting' = รอกรอ) ÷ Std Weight ของ Master (Gradegram + Size)
  //   รวมน้ำหนักต่อ Gradegram+Size ก่อน แล้วค่อยหาร  → ปัดทศนิยม 2 ตำแหน่ง (เหมือน Alert)
  const STOCK_STATUS_USED = ['full', 'scrap'];
  async function srcStock(W) {
    const map = new Map(), d = W.params.stockDate;
    if (d) {
      const std = new Map();   // Gradegram|Size → Std Weight (kg)
      (masterCache || []).forEach(m => {
        const w = Number(m.std_weight_kg);
        if (w > 0) std.set(fcKey(normalizeGrade(m.grade) + m.gram) + '|' + Number(m.size), w);
      });
      const rows = await fetchSafe(() => supabase.from('stock_balance').select('grade, width, kgs, roll_status')
        .eq('stock_date', d).in('roll_status', STOCK_STATUS_USED));
      const kgs = new Map();
      rows.forEach(r => addTo(kgs, fcKey(r.grade) + '|' + Number(r.width), Number(r.kgs) || 0));
      const noStd = [];
      kgs.forEach((kg, k) => {
        const w = std.get(k);
        if (!w) { noStd.push(k); return; }
        map.set(k, Math.round(kg / w * 100) / 100);
      });
      if (noStd.length) console.warn('Stock: ไม่พบ Std Weight ใน Master ของ', noStd.join(', '));
    }
    W.src.stock = map;
  }
  async function srcRecv(W) {
    const map = new Map(), d = W.params.recvDate;
    if (d) {
      const { count } = await supabase.from('po_receive').select('*', { count: 'exact', head: true }).eq('po_date', d);
      if (!count && typeof fetchFromPO === 'function') await fetchFromPO(d, { silent: true });   // เหมือนหน้า Purchase Summary
      const { data, error } = await supabase.rpc('get_receive_list', {
        p_date_from: d, p_date_to: d, p_grades: null, p_suppliers: null, p_fsc: 'all', p_remarks: null });
      if (error) toast('โหลดยอดรับม้วนไม่สำเร็จ: ' + error.message, 'err');
      (data || []).forEach(r => addTo(map, fcKey(fcRowGG(r)) + '|' + Number(r.size), Number(r.quantity) || 0));
    }
    W.src.recv = map;
  }
  async function srcResv(W) {                         // ตรรกะเดียวกับ loadReservations() ในหน้า Roll Reservations
    const map = new Map(), d = W.params.resvDate;
    if (d) {
      const nx = new Date(d + 'T00:00:00'); nx.setDate(nx.getDate() + 1);
      const nextStr = `${nx.getFullYear()}-${pad2(nx.getMonth() + 1)}-${pad2(nx.getDate())}`;
      const res = await fetchSafe(() => supabase.from('roll_reservations').select('*').lte('reservation_date', d));
      const logs = await fetchSafe(() => supabase.from('roll_reservation_logs').select('*')
        .eq('action_type', 'complete').lt('created_at', `${nextStr}T00:00:00+07:00`));
      const byId = new Map(res.map(r => [String(r.id), r]));
      const key = r => fcKey(fcRowGG(r)) + '|' + Number(r.size);
      res.forEach(r => addTo(map, key(r), Number(r.quantity) || 0));
      logs.forEach(l => { const p = byId.get(String(l.reservation_id)); if (p) addTo(map, key(p), Number(l.qty_change) || 0); });
    }
    W.src.resv = map;
  }
  async function srcEst(W) {                          // ข้อ 11: แถว 6 ของ Rev ล่าสุด (ที่บันทึกแล้ว) ของเดือนที่เลือก
    const map = new Map(), m = W.params.estMonth;
    W.src.estRev = null;
    if (m) {
      const { data: ords } = await supabase.from('forecast_orders').select('id, rev, status')
        .eq('month_year', m).eq('grade_group', W.o.grade_group).in('status', ['saved', 'approved'])
        .order('rev', { ascending: false }).limit(1);
      if (ords && ords[0]) {
        const rows = await fetchSafe(() => supabase.from('forecast_order_cells')
          .select('gradegram, size, est_before').eq('order_id', ords[0].id));
        rows.forEach(r => map.set(fcKey(r.gradegram) + '|' + Number(r.size), Number(r.est_before) || 0));
        W.src.estRev = ords[0].rev;
      }
    }
    W.src.est = map;
  }
  const LOADERS = { usage: srcUsage, level: srcLevel, stock: srcStock, recv: srcRecv, resv: srcResv, est: srcEst };

  // ═════════════ ใบประมาณการ (forecast_*) ═════════════
  async function fetchOrders(month) {
    const { data, error } = await supabase.from('forecast_orders').select('*').eq('month_year', month).order('rev');
    if (error) throw error;
    return data || [];
  }
  async function fetchOrderDetail(orderId) {
    const [tb, cells] = await Promise.all([
      supabase.from('forecast_order_tables').select('*').eq('order_id', orderId),
      fetchSafe(() => supabase.from('forecast_order_cells').select('*').eq('order_id', orderId))
    ]);
    if (tb.error) throw tb.error;
    return { tables: tb.data || [], cells };
  }
  const must = ({ data, error }) => { if (error) throw error; return data; };

  async function createOrders(month) { return must(await supabase.rpc('forecast_create_orders', { p_month: month })); }
  async function saveOrder(orderId, params, remark, tables, lock) {
    return must(await supabase.rpc('forecast_save_order', {
      p_order_id: orderId, p_params: params, p_remark: remark || null, p_tables: tables, p_lock: !!lock }));
  }
  async function unlockOrder(orderId, password, note) {
    return must(await supabase.rpc('forecast_unlock', { p_order_id: orderId, p_password: password, p_note: note }));
  }
  async function addRev(month, group) { return must(await supabase.rpc('forecast_add_rev', { p_month: month, p_group: group })); }
  async function attachDoc(orderId, month, group, rev, file) {
    const path = `${month}/${group}_Rev${pad2(rev)}_${Date.now()}.pdf`;
    const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: 'application/pdf', upsert: false });
    if (up.error) throw up.error;
    return must(await supabase.rpc('forecast_attach_doc', { p_order_id: orderId, p_path: path, p_name: file.name }));
  }
  async function docUrl(docPath) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(docPath, 300);
    if (error) throw error;
    return data.signedUrl;
  }
  async function hasPassword() { return !!must(await supabase.rpc('forecast_has_password')); }
  async function setPassword(oldPw, newPw) { return must(await supabase.rpc('forecast_set_password', { p_old: oldPw, p_new: newPw })); }

  window.FC = Object.assign(window.FC || {}, { toast, api: {
    emptySrc, LOADERS, fetchSnaps, fetchSavedMonths, fetchCustomers,
    fetchOrders, fetchOrderDetail, createOrders, saveOrder, unlockOrder, addRev, attachDoc, docUrl,
    hasPassword, setPassword
  } });
})();
