// ═══════════════════════════════════════════════════════════════
//  รายงานการเบิกใช้ม้วนกระดาษ (Phase 4)
//  เบิกใช้      = usage_records      (ม้วนที่ออกจากคลัง รวมของเสียจากการผลิต)
//  ใช้ตามผลผลิต = usage_records_raw  (is_valid=true, ไม่รวมของเสีย)
//  ม้วน = กก. ÷ น้ำหนักมาตรฐาน (Data Master) — ไม่ใช่การนับแถว
// ═══════════════════════════════════════════════════════════════
let uiInited = false;

async function initUsageIssueTab() {
  if (!uiInited) {
    uiInited = true;
    const det = $('uiImportBox');
    if (det) det.addEventListener('toggle', () => { if (det.open) renderLatestBatch(); });
    ['uiFrom', 'uiTo', 'uiGroup', 'uiGrade', 'uiSize'].forEach(id =>
      $(id).addEventListener('change', renderUsageIssue));
    $('uiReload').addEventListener('click', renderUsageIssue);
  }
  if (!masterCache || !masterCache.length) { try { await loadMaster(); } catch (e) {} }
  fillUiFilters();
  if (!$('uiFrom').value) await setUiDefaultRange();
  renderUsageIssue();
}

function fillUiFilters() {
  const gSel = $('uiGrade'), sSel = $('uiSize');
  const gOld = gSel.value, sOld = sSel.value;
  const grades = [...new Set(masterCache.map(m => m.grade + m.gram))].sort();
  const sizes = [...new Set(masterCache.map(m => String(m.size)))].sort((a, b) => Number(a) - Number(b));
  gSel.innerHTML = '<option value="">ทุกเกรด</option>' + grades.map(g => `<option>${g}</option>`).join('');
  sSel.innerHTML = '<option value="">ทุกไซส์</option>' + sizes.map(s => `<option>${s}</option>`).join('');
  gSel.value = gOld; sSel.value = sOld;
}

// เดือนล่าสุดที่มีข้อมูล (ดูจากทั้งสองตาราง เอาเดือนที่ใหม่กว่า)
async function setUiDefaultRange() {
  let latest = '';
  for (const t of ['usage_records', 'usage_records_raw']) {
    try {
      const { data } = await supabase.from(t).select('usage_date').order('usage_date', { ascending: false }).limit(1);
      if (data && data[0] && data[0].usage_date > latest) latest = data[0].usage_date;
    } catch (e) {}
  }
  let y, m;
  if (latest) { [y, m] = latest.slice(0, 7).split('-').map(Number); }
  else { const d = new Date(); y = d.getFullYear(); m = d.getMonth() + 1; }
  $('uiFrom').value = `${y}-${pad(m)}-01`;
  $('uiTo').value = `${y}-${pad(m)}-${pad(new Date(y, m, 0).getDate())}`;
}

function fmtUiNum(n, d) {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtUiDay(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

async function renderUsageIssue() {
  const body = $('uiBody');
  const from = $('uiFrom').value, to = $('uiTo').value;
  if (!from || !to) { body.innerHTML = '<p class="hint">เลือกช่วงวันที่ก่อน</p>'; return; }
  if (from > to) { body.innerHTML = '<div class="msg err">วันที่เริ่มต้นต้องไม่มากกว่าวันที่สิ้นสุด</div>'; return; }
  body.innerHTML = '<p style="text-align:center;color:#94a3b8;padding:20px">กำลังโหลดข้อมูล...</p>';

  const group = $('uiGroup').value;        // day | grade | size
  const fGrade = $('uiGrade').value, fSize = $('uiSize').value;

  let issued, produced;
  try {
    [issued, produced] = await Promise.all([
      fetchAllRows(() => supabase.from('usage_records').select('usage_date, item_code, used_kgs')
        .gte('usage_date', from).lte('usage_date', to)),
      fetchAllRows(() => supabase.from('usage_records_raw').select('usage_date, item_code, used_kgs')
        .eq('is_valid', true).gte('usage_date', from).lte('usage_date', to))
    ]);
  } catch (e) {
    body.innerHTML = `<div class="msg err">โหลดข้อมูลไม่สำเร็จ: ${e.message || e}</div>`;
    return;
  }

  const mByCode = {};
  masterCache.forEach(m => mByCode[m.item_code] = m);
  const NA = 'ไม่พบใน Master';
  let unknownKg = 0;

  const groups = {};   // key -> {iKg,iRoll,pKg,pRoll}
  const add = (rows, kgK, rollK) => rows.forEach(r => {
    const m = mByCode[r.item_code];
    const kg = Number(r.used_kgs) || 0;
    const gg = m ? m.grade + m.gram : NA, sz = m ? String(m.size) : NA;
    if (fGrade && gg !== fGrade) return;
    if (fSize && sz !== fSize) return;
    const key = group === 'day' ? r.usage_date : group === 'grade' ? gg : sz;
    const g = groups[key] || (groups[key] = { iKg: 0, iRoll: 0, pKg: 0, pRoll: 0 });
    const std = m ? Number(m.std_weight_kg) : 0;
    g[kgK] += kg;
    if (std) g[rollK] += kg / std; else if (kgK === 'iKg') unknownKg += kg;
  });
  add(issued, 'iKg', 'iRoll');
  add(produced, 'pKg', 'pRoll');

  let keys = Object.keys(groups);
  if (group === 'size') keys.sort((a, b) => (Number(a) || 1e9) - (Number(b) || 1e9));
  else keys.sort();

  if (!keys.length) {
    body.innerHTML = '<p class="hint" style="padding:16px">ไม่พบข้อมูลในช่วงที่เลือก</p>';
    return;
  }

  const tot = { iKg: 0, iRoll: 0, pKg: 0, pRoll: 0 };
  const label = group === 'day' ? 'วันที่' : group === 'grade' ? 'เกรด' : 'ไซส์';
  const rowsHtml = (name, g, isTotal) => {
    const dKg = g.iKg - g.pKg, dRoll = g.iRoll - g.pRoll;
    const pct = g.iKg ? (dKg / g.iKg * 100) : 0;
    const cls = isTotal ? ' class="ui-total"' : '';
    return `
      <tr${cls}><td rowspan="3" class="ui-grp">${name}</td><td>เบิกใช้</td><td class="num">${fmtUiNum(g.iRoll, 1)}</td><td class="num">${fmtUiNum(g.iKg, 0)}</td></tr>
      <tr${cls}><td>ใช้ตามผลผลิต</td><td class="num">${fmtUiNum(g.pRoll, 1)}</td><td class="num">${fmtUiNum(g.pKg, 0)}</td></tr>
      <tr${cls} class="ui-diff${isTotal ? ' ui-total' : ''}"><td>ส่วนต่าง (ของเสีย) <span class="ui-pct">${fmtUiNum(pct, 1)}%</span></td><td class="num ${dKg < 0 ? 'ui-neg' : ''}">${fmtUiNum(dRoll, 1)}</td><td class="num ${dKg < 0 ? 'ui-neg' : ''}">${fmtUiNum(dKg, 0)}</td></tr>`;
  };

  let html = `<div class="table-wrap"><table class="data-table ui-table">
    <thead><tr><th>${label}</th><th>รายการ</th><th>จำนวนม้วน</th><th>กิโลกรัม</th></tr></thead><tbody>`;
  keys.forEach(k => {
    const g = groups[k];
    ['iKg', 'iRoll', 'pKg', 'pRoll'].forEach(f => tot[f] += g[f]);
    html += rowsHtml(group === 'day' ? fmtUiDay(k) : k, g, false);
  });
  html += rowsHtml('รวมทั้งหมด', tot, true);
  html += '</tbody></table></div>';

  const notes = [];
  if (unknownKg > 0) notes.push(`⚠️ มีรายการเบิกใช้ ${fmtUiNum(unknownKg, 0)} กก. ที่ไม่พบใน Data Master (หรือไม่มีน้ำหนักมาตรฐาน) — นับเฉพาะกิโลกรัม ไม่นับเป็นม้วน`);
  notes.push('ส่วนต่าง = เบิกใช้ − ใช้ตามผลผลิต (ของเสียจากการผลิต) · จำนวนม้วนคำนวณจาก กก. ÷ น้ำหนักมาตรฐาน จึงมีทศนิยมได้');
  html += notes.map(n => `<p class="hint">${n}</p>`).join('');
  body.innerHTML = html;
}
