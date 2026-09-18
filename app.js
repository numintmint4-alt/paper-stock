// ═══════════════════════════════════════════════════════════════
//  STOCK ม้วนกระดาษ V6 — app.js (Core)
//  ⚙️ แก้ 3 ค่าด้านล่างก่อนใช้งาน
// ═══════════════════════════════════════════════════════════════
const SUPABASE_URL      = 'https://gwwgycbqzdjlijsuxahx.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_rMoUE6tUsQZHnJu2ULDxFg_4NAiw6wg';
const EDGE_FUNCTION_URL = 'https://gwwgycbqzdjlijsuxahx.supabase.co/functions/v1/admin-users';
// ═══════════════════════════════════════════════════════════════

if (SUPABASE_URL.includes('xxxxx')) {
  document.body.innerHTML = '<div style="padding:40px;font-family:sans-serif;color:#dc2626;background:#fee2e2;border-radius:8px;max-width:600px;margin:40px auto"><h2>⚠️ ยังไม่ได้ตั้งค่า</h2><p>กรุณาแก้ 3 ค่าด้านบนสุดของ app.js</p></div>';
  throw new Error('Config not set');
}

const HAS_EDGE_FUNCTION = !EDGE_FUNCTION_URL.includes('xxxxx');
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ================= GLOBAL STATE =================
let currentUser = null;
let currentProfile = null;
let masterCache = [];
let dataCache = [];
let matrixRange = { from: '', to: '' };
// ================= V6: Normalize Grade =================
// "CA85"   → "CA085"
// "CAF125" → "CAF125"
// "CAF"    → "CAF"
// "CA125F" → "CAF125"
function normalizeGrade(g) {
  if (!g) return '';
  g = String(g).trim().toUpperCase();

  // CAF125
  let m = g.match(/^([A-Z]+)F(\d+)$/);
  if (m) return m[1] + 'F' + m[2].padStart(3, '0');

  // CA125F
  m = g.match(/^([A-Z]+)(\d+)F$/);
  if (m) return m[1] + 'F' + m[2].padStart(3, '0');

  // CAF
  if (/^[A-Z]+F$/.test(g)) return g;

  // CA85 → CA085
  m = g.match(/^([A-Z]+)(\d+)$/);
  if (m) return m[1] + m[2].padStart(3, '0');

  return g;
}

// ================= V6: Parse Gradegram =================
// "CAF125" → { grade: "CAF", gram: "125" }
// "CA085"  → { grade: "CA085", gram: null }
function parseGradegram(gradegram) {
  if (!gradegram) return { grade: '', gram: null };
  const s = String(gradegram).trim().toUpperCase();

  let m = s.match(/^([A-Z]+)F(\d+)$/);
  if (m) return { grade: m[1] + 'F' + m[2].padStart(3, '0'), gram: m[2] };

  m = s.match(/^([A-Z]+)(\d+)$/);
  if (m) return { grade: m[1] + m[2].padStart(3, '0'), gram: null };

  if (/^[A-Z]+F$/.test(s)) return { grade: s, gram: null };
  return { grade: s, gram: null };
}
// ================= HELPERS =================
const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2, '0');
const THAI_MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
const THAI_MONTHS_SHORT = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

function openModal(id) { $(id).classList.add('show'); }
function closeModal(id) { $(id).classList.remove('show'); }
function showMsg(elId, html, type = 'ok') { $(elId).innerHTML = `<div class="msg ${type}">${html}</div>`; }
const isAdmin = () => currentProfile?.role === 'admin';
const GENERAL_CUSTOMER = '__GENERAL__';

function currentMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}`;
}
function reportMonthRange(reportMonthStr, monthsBack = 3) {
  if (!reportMonthStr) return { from: '', to: '' };
  const [y, m] = reportMonthStr.split('-').map(Number);
  const toDate = new Date(y, m - 1, 0);
  let fromM = m - monthsBack + 1, fromY = y;
  while (fromM <= 0) { fromM += 12; fromY -= 1; }
  return {
    from: `${fromY}-${pad(fromM)}-01`,
    to:   `${toDate.getFullYear()}-${pad(toDate.getMonth()+1)}-${pad(toDate.getDate())}`
  };
}
function thaiMonthTitle(monthStr) {
  if (!monthStr) return '(ทั้งหมด)';
  const [y, m] = monthStr.split('-').map(Number);
  return `เดือน ${THAI_MONTHS[m-1]} ${y + 543}`;
}
function thaiMonthShort(monthStr) {
  if (!monthStr) return '-';
  const [y, m] = monthStr.split('-').map(Number);
  return `${THAI_MONTHS_SHORT[m-1]} ${String(y+543).slice(-2)}`;
}
function thaiDateFull(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
}
function toISODate(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'number') {
    const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
    return d.toISOString().slice(0, 10);
  }
  if (v instanceof Date) return `${v.getFullYear()}-${pad(v.getMonth()+1)}-${pad(v.getDate())}`;
  const s = String(v).trim();
  if (!s) return '';
  let m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
  if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  m = s.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  return s.slice(0, 10);
}
// ✅ V6: แปลง Excel serial → วันที่ไทย (31/1/2569)
function excelDateToThai(serial) {
  if (!serial && serial !== 0) return '';
  if (typeof serial !== 'number') return String(serial);
  const utcDays = serial - 25569;
  const msPerDay = 86400 * 1000;
  const d = new Date(utcDays * msPerDay);
  const day = d.getUTCDate();
  const month = d.getUTCMonth() + 1;
  const year = d.getUTCFullYear() + 543;
  return `${day}/${month}/${year}`;
}
function findColumn(row, aliases) {
  const keys = Object.keys(row);
  for (const alias of aliases) {
    const lower = String(alias).toLowerCase().trim();
    for (const k of keys) {
      if (String(k).toLowerCase().trim() === lower) return row[k];
    }
  }
  return undefined;
}
function esc(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ================= PAGINATION =================
async function fetchAllRows(buildQuery, pageSize = 1000, onProgress = null) {
  const all = [];
  let from = 0;
  while (true) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (onProgress) onProgress(all.length);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

// ================= COLUMN ALIASES =================
const MASTER_COLS = {
  grade:         ['grade', 'เกรด'],
  gram:          ['gram', 'แกรม'],
  size:          ['size', 'ขนาด'],
  item_code:     ['item_code', 'item', 'รายการ'],
  std_weight_kg: ['std_weight_kg', 'std_weight', 'น้ำหนัก', 'weight_kg', 'weight']
};

const USAGE_COLS = {
  plant_code:        ['plant_code'],
  plant_desc:        ['plant_desc'],
  corrugator_no:     ['corrugator_no'],
  doc_date:          ['doc_date'],
  doc_shift:         ['doc_shift'],
  doc_no:            ['doc_no'],
  stand:             ['stand'],
  isn:               ['isn'],
  roll_ssn:          ['roll_ssn'],
  grade:             ['grade', 'gradegram', 'grade_gram'],
  width:             ['width'],
  quality:           ['quality'],
  supplier:          ['supplier'],
  dimeter:           ['dimeter'],
  kgs:               ['kgs'],
  return_dimeter:    ['return_dimeter'],
  return_kgs:        ['return_kgs'],
  used_kgs:          ['used_kgs'],
  roll_for_customer: ['roll_for_customer'],
  loc:               ['loc'],
  warehouse_no:      ['warehouse_no']
};

function findItemCode(grade, width) {
  const g = String(grade).trim().toUpperCase();
  const w = String(width).trim();
  const patterns = [];
  patterns.push(`${g}-${w}`);
  patterns.push(`${g}-${w.padStart(2, '0')}`);
  patterns.push(`${g}-${w.padStart(3, '0')}`);
  patterns.push(`${g}/${w}`);
  patterns.push(`${g}_${w}`);
  const m = g.match(/^([A-Z]+)(\d+)$/);
  if (m) {
    const p = m[1] + m[2].padStart(3, '0');
    patterns.push(`${p}-${w}`);
    patterns.push(`${p}-${w.padStart(2, '0')}`);
    patterns.push(`${p}-${w.padStart(3, '0')}`);
    patterns.push(`${p}/${w}`);
    patterns.push(`${p}_${w}`);
  }
  for (const code of patterns) {
    if (masterCache.find(x => x.item_code === code)) return code;
  }
  return null;
}

// ================= PROGRESS =================
function showProgress(elId, current, total, label = '') {
  const el = $(elId);
  if (!el) return;
  el.classList.remove('hidden');
  const pct = total > 0 ? Math.round(current / total * 100) : 0;
  el.innerHTML = `
    <div class="progress-wrap">
      <div class="progress-bar" style="width:${pct}%"></div>
      <div class="progress-text">${label || `กำลังประมวลผล... ${current.toLocaleString()} / ${total.toLocaleString()} (${pct}%)`}</div>
    </div>`;
}
function hideProgress(elId) {
  const el = $(elId);
  if (!el) return;
  el.classList.add('hidden');
  el.innerHTML = '';
}

// ================= ACCORDION =================
function toggleAcc(head, bodyId) {
  const body = $(bodyId);
  const isOpen = !body.classList.contains('hidden');
  if (isOpen) {
    body.classList.add('hidden');
    head.classList.remove('open');
  } else {
    body.classList.remove('hidden');
    head.classList.add('open');
    if (bodyId === 'accMaster') renderMaster();
    if (bodyId === 'accRolluse') renderLatestBatch();
    if (bodyId === 'accUsers' && HAS_EDGE_FUNCTION) loadUsers();
    if (bodyId === 'accArchive') loadArchiveStats();
  }
}

// ================= AUTH =================
async function initSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    currentUser = session.user;
    await loadProfile();
    showApp();
  } else showLogin();
}
async function loadProfile() {
  const { data } = await supabase.from('profiles').select('*').eq('id', currentUser.id).single();
  currentProfile = data || { role: 'user', full_name: currentUser.email };
}
function showLogin() { $('loginScreen').classList.remove('hidden'); $('app').classList.add('hidden'); }
function showApp() {
  $('loginScreen').classList.add('hidden');
  $('app').classList.remove('hidden');
  $('userBadge').textContent = (currentProfile?.full_name || currentUser.email) + ' · ' + (isAdmin() ? 'Admin' : 'User');
  document.querySelectorAll('.admin-only').forEach(el => el.classList.toggle('hidden', !isAdmin()));
  if (!HAS_EDGE_FUNCTION) $('accUsersWrap').classList.add('hidden');
  refreshAll();
}

$('loginBtn').onclick = async () => {
  const username = $('loginUser').value.trim().toLowerCase();
  const password = $('loginPass').value;
  const msg = $('loginMsg');
  msg.className = 'login-msg hidden';
  if (!username || !password) { msg.className='login-msg err'; msg.textContent='กรอกชื่อผู้ใช้และรหัสผ่าน'; return; }
  $('loginBtn').disabled = true; $('loginBtn').textContent = 'กำลังเข้าสู่ระบบ...';
  const { data, error } = await supabase.auth.signInWithPassword({ email: username + '@paper.local', password });
  $('loginBtn').disabled = false; $('loginBtn').textContent = 'เข้าสู่ระบบ';
  if (error) { msg.className='login-msg err'; msg.textContent='ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง'; return; }
  currentUser = data.user;
  await loadProfile();
  $('loginPass').value = '';
  showApp();
};
$('loginPass').addEventListener('keypress', e => { if (e.key === 'Enter') $('loginBtn').click(); });
$('loginUser').addEventListener('keypress', e => { if (e.key === 'Enter') $('loginPass').focus(); });
$('logoutBtn').onclick = async () => {
  if (!confirm('ออกจากระบบ?')) return;
  await supabase.auth.signOut();
  currentUser = null; currentProfile = null; showLogin();
};

// ================= TABS =================
const TAB_LIST = ['matrix','stock','summary','receive','alert','data','settings'];

document.querySelectorAll('.nav button[data-tab]').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.nav button[data-tab]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    TAB_LIST.forEach(t => $('tab-'+t).classList.toggle('hidden', t !== btn.dataset.tab));
    const t = btn.dataset.tab;
    if (t === 'matrix' && typeof renderMatrix === 'function') renderMatrix();
    if (t === 'stock' && typeof initStockTab === 'function') initStockTab();
    if (t === 'summary' && typeof initSummaryTab === 'function') initSummaryTab();
    if (t === 'receive' && typeof initReceiveTab === 'function') initReceiveTab();
    if (t === 'alert' && typeof initAlertTab === 'function') initAlertTab();
    if (t === 'data') renderData();
  };
});

// ================= MASTER =================
async function loadMaster(onProgress = null) {
  masterCache = await fetchAllRows(
    () => supabase.from('paper_specs').select('*').order('grade').order('gram').order('size'),
    1000, onProgress
  );
  return masterCache;
}

// ================= V6: MATRIX GRADE FILTER (grade+gram) =================
let selectedGrades = [];
let allGradesList = [];

async function loadGradeFilter() {
  // ✅ V6: grade + gram รวมกัน
  allGradesList = [...new Set(
    masterCache.map(m => m.grade + m.gram)
  )].sort();

  renderGradeList();
  updateGradeFilterLabel();

  const btn = $('gradeFilterBtn');
  const dropdown = $('gradeDropdown');
  const box = $('gradeFilterBox');

  if (!btn || !dropdown || !box) return;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isHidden = dropdown.classList.contains('hidden');
    if (isHidden) {
      dropdown.classList.remove('hidden');
      btn.classList.add('open');
    } else {
      dropdown.classList.add('hidden');
      btn.classList.remove('open');
    }
  });

  document.addEventListener('click', (e) => {
    if (!box.contains(e.target)) {
      dropdown.classList.add('hidden');
      btn.classList.remove('open');
    }
  });
}

function renderGradeList() {
  const list = $('gradeList');
  if (!list) return;
  if (!allGradesList.length) {
    list.innerHTML = '<div style="padding:10px;text-align:center;color:#94a3b8;font-size:13px">ไม่มีข้อมูล</div>';
    return;
  }
  list.innerHTML = allGradesList.map(g => {
    const checked = selectedGrades.includes(g);
    return `<label class="item ${checked ? 'checked' : ''}" data-grade="${esc(g)}">
      <input type="checkbox" ${checked ? 'checked' : ''}>
      <span>${esc(g)}</span>
    </label>`;
  }).join('');
  list.querySelectorAll('.item').forEach(el => {
    const cb = el.querySelector('input[type="checkbox"]');
    cb.addEventListener('change', () => {
      const grade = el.dataset.grade;
      if (cb.checked) {
        if (!selectedGrades.includes(grade)) selectedGrades.push(grade);
      } else {
        selectedGrades = selectedGrades.filter(g => g !== grade);
      }
      el.classList.toggle('checked', cb.checked);
      updateGradeFilterLabel();
    });
  });
}

function updateGradeFilterLabel() {
  const label = $('gradeFilterLabel');
  if (!label) return;
  if (selectedGrades.length === 0) {
    label.textContent = 'ทั้งหมด';
    label.style.color = '#1e293b';
  } else if (selectedGrades.length === 1) {
    label.textContent = selectedGrades[0];
    label.style.color = '#1e40af';
  } else {
    label.textContent = `เลือก ${selectedGrades.length} เกรด`;
    label.style.color = '#1e40af';
  }
}

function selectAllGrades() {
  selectedGrades = [...allGradesList];
  renderGradeList();
  updateGradeFilterLabel();
}

function clearAllGrades() {
  selectedGrades = [];
  renderGradeList();
  updateGradeFilterLabel();
}

function getSelectedGrades() {
  return selectedGrades;
}
// ================= DRILL MODAL =================
async function openDrill(gradegram, size) {
  const m = masterCache.find(r => (r.grade + r.gram) === gradegram && r.size === size);
  if (!m) return alert('ไม่พบ Item Code');
  $('drillTitle').innerHTML = `${m.item_code} <span style="font-weight:400;color:#64748b;font-size:14px">(Gradegrams ${gradegram} · Size ${size})</span>`;
  openModal('modalDrill');

  const usage = await fetchAllRows(() => {
    let q = supabase.from('usage_records').select('*').eq('item_code', m.item_code);
    if (matrixRange.from) q = q.gte('usage_date', matrixRange.from);
    if (matrixRange.to)   q = q.lte('usage_date', matrixRange.to);
    return q;
  });

  const customer = $('qCustomer').value;
  let filtered = usage;
  if (customer === GENERAL_CUSTOMER) filtered = usage.filter(u => !u.roll_for_customer || !String(u.roll_for_customer).trim());
  else if (customer) filtered = usage.filter(u => u.roll_for_customer === customer);

  const mode = document.querySelector('input[name="mode"]:checked').value;
  const std = Number(m.std_weight_kg);

  const byDate = {};
  filtered.forEach(u => {
    if (!byDate[u.usage_date]) byDate[u.usage_date] = { kg: 0, records: [] };
    byDate[u.usage_date].kg += Number(u.used_kgs);
    byDate[u.usage_date].records.push(u);
  });
  const dates = Object.keys(byDate).sort();

  let html = '<table><thead><tr><th>วันที่</th><th>kg รวม</th><th>Std Weight</th><th>จำนวนม้วน</th><th>รายการ</th><th></th></tr></thead><tbody>';
  if (!dates.length) html += '<tr><td colspan="6" style="text-align:center;color:#94a3b8">ไม่มีข้อมูล</td></tr>';
  dates.forEach(d => {
    const info = byDate[d];
    const rolls = mode === 'full' ? Math.ceil(info.kg / std) : info.kg / std;
    html += `<tr><td>${d}</td><td>${info.kg.toFixed(2)}</td><td>${std}</td>
      <td><b>${rolls.toFixed(2)}</b></td><td>${info.records.length}</td>
      <td><button onclick="toggleDate('${d}')">ดู</button></td></tr>
      <tr id="rec-${d}" class="hidden"><td colspan="6">
        <table style="background:#fff"><thead><tr><th>Doc No</th><th>ลูกค้า</th><th style="text-align:right">kg</th></tr></thead>
        <tbody>${info.records.map(r => `<tr><td>${esc(r.doc_no)||'-'}</td>
          <td>${esc(r.roll_for_customer)||'ทั่วไป'}</td>
          <td style="text-align:right">${Number(r.used_kgs).toFixed(2)}</td></tr>`).join('')}
        </tbody></table></td></tr>`;
  });
  html += '</tbody></table>';
  $('drillBody').innerHTML = html;
}
function toggleDate(d) { $('rec-'+d).classList.toggle('hidden'); }

// ================= MASTER CRUD =================
function renderMaster() {
  const q = ($('masterSearch').value || '').toLowerCase();
  const rows = masterCache.filter(r => !q || (r.grade + r.gram + r.size + r.item_code).toLowerCase().includes(q));
  let html = '<div style="max-height:550px;overflow:auto"><table><thead><tr><th>#</th><th>Gradegrams</th><th>Gram</th><th>Size</th><th>Item Code</th><th>Std Weight</th><th></th></tr></thead><tbody>';
  if (!rows.length) html += '<tr><td colspan="7" style="text-align:center;color:#94a3b8;padding:20px">ไม่มีข้อมูล</td></tr>';
  rows.forEach((r, i) => {
    html += `<tr><td>${i+1}</td><td>${r.grade}</td><td>${r.gram}</td><td>${r.size}</td>
      <td>${r.item_code}</td><td>${Number(r.std_weight_kg).toFixed(2)}</td>
      <td class="admin-only">${isAdmin() ? `<button onclick="editMaster(${r.id})">แก้ไข</button> <button class="danger" onclick="delMaster(${r.id})">ลบ</button>` : '-'}</td></tr>`;
  });
  html += '</tbody></table></div>';
  html += `<div style="margin-top:8px;font-size:13px;color:#64748b">แสดง ${rows.length} / ${masterCache.length} แถว</div>`;
  $('masterBody').innerHTML = html;
}
let editingMasterId = null;
function openMasterForm(row) {
  editingMasterId = row ? row.id : null;
  $('masterFormTitle').textContent = row ? 'แก้ไข Master Data' : 'เพิ่ม Master Data';
  $('masterFormError').innerHTML = '';
  ['Grade','Gram','Size','Item','Weight'].forEach(k => $('f'+k).value = '');
  if (row) {
    $('fGrade').value = row.grade; $('fGram').value = row.gram; $('fSize').value = row.size;
    $('fItem').value = row.item_code;
    $('fWeight').value = row.std_weight_kg;
  }
  openModal('modalMaster');
}
function editMaster(id) { openMasterForm(masterCache.find(r => r.id === id)); }

async function saveMaster() {
  const grade = $('fGrade').value.trim();
  const gram = Number($('fGram').value);
  const size = Number($('fSize').value);
  const item_code = $('fItem').value.trim();
  const std_weight_kg = Number($('fWeight').value);
  if (!grade || !gram || !size || !item_code || !std_weight_kg) {
    $('masterFormError').innerHTML = '<div class="msg err">กรอกให้ครบ (std_weight ต้อง > 0)</div>'; return;
  }
  const dup = masterCache.find(r => r.grade === grade && r.gram === gram && r.size === size && r.id !== editingMasterId);
  if (dup) { $('masterFormError').innerHTML = `<div class="msg err">⚠ ซ้ำกับ ${dup.item_code}</div>`; return; }
  const payload = { grade, gram, size, item_code, std_weight_kg };
  let error;
  if (editingMasterId) ({ error } = await supabase.from('paper_specs').update(payload).eq('id', editingMasterId));
  else ({ error } = await supabase.from('paper_specs').insert(payload));
  if (error) { $('masterFormError').innerHTML = `<div class="msg err">${error.message}</div>`; return; }
  closeModal('modalMaster');
  await loadMaster();
  await loadGradeFilter();
  renderMaster();
}
async function delMaster(id) {
  if (!confirm('ยืนยันลบ?')) return;
  const { error } = await supabase.from('paper_specs').delete().eq('id', id);
  if (error) return alert(error.message);
  await loadMaster(); renderMaster();
}
async function clearMaster() {
  if (!confirm('ลบ Master Data ทั้งหมด?')) return;
  const { error } = await supabase.from('paper_specs').delete().neq('id', 0);
  if (error) return alert(error.message);
  await loadMaster(); renderMaster();
}
function exportMaster() {
  if (!masterCache.length) return alert('ไม่มีข้อมูล');
  const data = masterCache.map(r => ({
    grade: r.grade, gram: r.gram, size: r.size,
    item_code: r.item_code, std_weight_kg: r.std_weight_kg
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Master');
  XLSX.writeFile(wb, `master_${new Date().toISOString().slice(0,10)}.xlsx`);
}

// ================= IMPORT MASTER =================
function importMaster(ev) {
  const f = ev.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = async e => {
    try {
      showProgress('masterProgress', 0, 1, 'กำลังอ่านไฟล์...');
      const wb = XLSX.read(e.target.result, { type: 'array' });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      showProgress('masterProgress', 0, rows.length, `อ่านได้ ${rows.length} แถว กำลังตรวจสอบ...`);

      const payload = [];
      const errors = [];
      const seenKeys = new Set();

      rows.forEach((row, i) => {
        const grade = String(findColumn(row, MASTER_COLS.grade) || '').trim();
        const gram = Number(findColumn(row, MASTER_COLS.gram));
        const size = Number(findColumn(row, MASTER_COLS.size));
        const item_code = String(findColumn(row, MASTER_COLS.item_code) || '').trim();
        const std_weight_kg = Number(findColumn(row, MASTER_COLS.std_weight_kg));

        if (!grade || !gram || !size || !item_code || !std_weight_kg) {
          errors.push(`แถว ${i+2}: ข้อมูลไม่ครบ`);
          return;
        }
        const key = `${grade}|${gram}|${size}`;
        if (seenKeys.has(key)) {
          errors.push(`แถว ${i+2} (${item_code}): ซ้ำในไฟล์`);
          return;
        }
        seenKeys.add(key);
        payload.push({ grade, gram, size, item_code, std_weight_kg });
      });

      if (!payload.length) {
        hideProgress('masterProgress');
        showMsg('importMasterMsg', `⚠ ไม่มีแถวที่บันทึกได้`, 'err');
        return;
      }

      showProgress('masterProgress', 0, 1, `กำลังบันทึก ${payload.length} แถว...`);
      const { data, error } = await supabase.rpc('import_master_batch', { rows: payload });
      if (error) {
        hideProgress('masterProgress');
        showMsg('importMasterMsg', '❌ บันทึกไม่สำเร็จ: ' + error.message, 'err');
        return;
      }

      hideProgress('masterProgress');
      let html = `✅ Master: เพิ่ม ${data.added} · อัปเดต ${data.updated}` + (errors.length ? ` · ⚠ ข้าม ${errors.length}` : '');
      showMsg('importMasterMsg', html, errors.length ? 'err' : 'ok');

      await loadMaster();
      await loadGradeFilter();
      renderMaster();
    } catch (ex) {
      hideProgress('masterProgress');
      showMsg('importMasterMsg', 'อ่านไฟล์ไม่สำเร็จ: ' + ex.message, 'err');
    }
  };
  r.readAsArrayBuffer(f);
  ev.target.value = '';
}

// ================= DATA TAB =================
// ✅ V6: ย้าย import_at, batch, สถานะ ไปท้ายตาราง + doc_date แปลงเป็นไทย
const RAW_COLUMNS = [
  { key: 'id', label: 'id' },
  { key: 'error_msg', label: 'error' },
  { key: 'plant_code', label: 'plant_code' },
  { key: 'plant_desc', label: 'plant_desc' },
  { key: 'corrugator_no', label: 'corrugator_no' },
  { key: 'doc_date', label: 'doc_date', isExcelDate: true },
  { key: 'doc_shift', label: 'doc_shift' },
  { key: 'doc_no', label: 'doc_no' },
  { key: 'stand', label: 'stand' },
  { key: 'isn', label: 'isn' },
  { key: 'roll_ssn', label: 'roll_ssn' },
  { key: 'grade', label: 'grade' },
  { key: 'width', label: 'width' },
  { key: 'quality', label: 'quality' },
  { key: 'supplier', label: 'supplier' },
  { key: 'dimeter', label: 'dimeter' },
  { key: 'kgs', label: 'kgs' },
  { key: 'return_dimeter', label: 'return_dimeter' },
  { key: 'return_kgs', label: 'return_kgs' },
  { key: 'used_kgs', label: 'used_kgs' },
  { key: 'roll_for_customer', label: 'roll_for_customer' },
  { key: 'loc', label: 'loc' },
  { key: 'warehouse_no', label: 'warehouse_no' },
  { key: 'usage_date', label: 'usage_date' },
  { key: 'item_code', label: 'item_code' },
  // ✅ V6: ย้ายมาท้าย
  { key: 'import_at', label: 'import_at' },
  { key: 'import_batch_id', label: 'batch' },
  { key: 'is_valid', label: 'สถานะ' }
];

async function renderData() {
  $('dataBody').innerHTML = '<p style="text-align:center;color:#94a3b8;padding:20px">กำลังโหลด...</p>';

  if (!$('dtBatch').dataset.loaded) {
    try {
      const batches = await fetchAllRows(() =>
        supabase.from('usage_records_raw').select('import_batch_id, import_at').order('import_at', { ascending: false })
      );
      const seen = new Map();
      batches.forEach(b => {
        if (b.import_batch_id && !seen.has(b.import_batch_id)) {
          seen.set(b.import_batch_id, b.import_at);
        }
      });
      const arr = [...seen.entries()];
      $('dtBatch').innerHTML = '<option value="">ทั้งหมด</option>' +
        arr.map(([id, at]) => `<option value="${id}">${new Date(at).toLocaleString('th-TH')}</option>`).join('');
      $('dtBatch').dataset.loaded = '1';
    } catch(e) { /* ignore */ }
  }

  const from = $('dtFrom').value;
  const to   = $('dtTo').value;
  const valid = $('dtValid').value;
  const batch = $('dtBatch').value;

  const rows = await fetchAllRows(() => {
    let q = supabase.from('usage_records_raw').select('*').order('id', { ascending: false });
    if (from)  q = q.gte('usage_date', from);
    if (to)    q = q.lte('usage_date', to);
    if (valid === 'valid')   q = q.eq('is_valid', true);
    if (valid === 'invalid') q = q.eq('is_valid', false);
    if (batch) q = q.eq('import_batch_id', batch);
    return q;
  });

  dataCache = rows;

  let html = '<div class="data-scroll"><table class="data-table"><thead><tr>';
  RAW_COLUMNS.forEach(c => html += `<th>${c.label}</th>`);
  html += '</tr></thead><tbody>';

  if (!rows.length) {
    html += `<tr><td colspan="${RAW_COLUMNS.length}" style="text-align:center;color:#94a3b8;padding:20px">ไม่มีข้อมูล</td></tr>`;
  } else {
    rows.slice(0, 2000).forEach(r => {
      const cls = r.is_valid === false ? 'invalid' : '';
      html += `<tr class="${cls}">`;
      RAW_COLUMNS.forEach(c => {
        let v = r[c.key];
        if (c.key === 'is_valid') {
          v = v ? '<span class="badge ok">✓</span>' : '<span class="badge bad">✗</span>';
        } else if (c.key === 'import_at' && v) {
          v = new Date(v).toLocaleString('th-TH');
        } else if (c.isExcelDate && v !== null && v !== undefined && v !== '') {
          // ✅ V6: แปลง Excel serial → วันที่ไทย
          v = excelDateToThai(Number(v));
        } else {
          v = esc(v);
        }
        html += `<td>${v ?? ''}</td>`;
      });
      html += '</tr>';
    });
  }
  html += '</tbody></table></div>';
  html += `<div style="margin-top:8px;font-size:13px;color:#64748b">แสดง ${Math.min(rows.length, 2000)} / ${rows.length} แถว</div>`;
  $('dataBody').innerHTML = html;
}

function exportData() {
  if (!dataCache.length) return alert('ไม่มีข้อมูล');
  const data = dataCache.map(r => {
    const o = {};
    RAW_COLUMNS.forEach(c => {
      let v = r[c.key];
      if (c.isExcelDate && v !== null && v !== undefined && v !== '') {
        v = excelDateToThai(Number(v));
      }
      o[c.label] = v;
    });
    return o;
  });
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'RawData');
  XLSX.writeFile(wb, `raw_usage_${new Date().toISOString().slice(0,10)}.xlsx`);
}

// ================= LATEST BATCH =================
async function renderLatestBatch() {
  const el = $('latestBatch');
  el.innerHTML = '<p style="color:#94a3b8;font-size:13px">กำลังโหลด...</p>';

  const { data: latest } = await supabase
    .from('usage_records_raw')
    .select('import_batch_id, import_at')
    .order('import_at', { ascending: false })
    .limit(1);

  if (!latest || !latest.length) {
    el.innerHTML = '<p style="color:#94a3b8;font-size:13px">ยังไม่มีข้อมูลที่ import</p>';
    return;
  }

  const batchId = latest[0].import_batch_id;
  const batchAt = new Date(latest[0].import_at).toLocaleString('th-TH');

  const validRows = await fetchAllRows(() =>
    supabase.from('usage_records_raw').select('*').eq('import_batch_id', batchId).eq('is_valid', true).limit(10)
  );
  const invalidRows = await fetchAllRows(() =>
    supabase.from('usage_records_raw').select('*').eq('import_batch_id', batchId).eq('is_valid', false)
  );
  const totalInBatch = await fetchAllRows(() =>
    supabase.from('usage_records_raw').select('id', { count: 'exact', head: false }).eq('import_batch_id', batchId)
  );

  let html = `<div class="msg info">
    <b>Batch ล่าสุด:</b> ${batchAt}<br>
    <b>ทั้งหมด:</b> ${totalInBatch.length} แถว · 
    <b style="color:#166534">ถูกต้อง:</b> ${totalInBatch.length - invalidRows.length} · 
    <b style="color:#dc2626">ไม่ผ่าน:</b> ${invalidRows.length}
  </div>`;

  html += '<h3 style="margin-top:16px">✅ ตัวอย่าง 10 แถวที่ถูกต้อง</h3>';
  html += '<div class="data-scroll" style="max-height:400px"><table class="data-table"><thead><tr>';
  ['id','doc_date','doc_no','grade','width','used_kgs','item_code','usage_date','roll_for_customer'].forEach(k => html += `<th>${k}</th>`);
  html += '</tr></thead><tbody>';
  if (!validRows.length) {
    html += '<tr><td colspan="9" style="text-align:center;color:#94a3b8">ไม่มีแถวที่ถูกต้อง</td></tr>';
  } else {
    validRows.forEach(r => {
      html += '<tr>';
      ['id','doc_date','doc_no','grade','width','used_kgs','item_code','usage_date','roll_for_customer'].forEach(k => {
        let v = r[k];
        if (k === 'doc_date' && v !== null && v !== undefined && v !== '') {
          v = excelDateToThai(Number(v));
        }
        html += `<td>${esc(v) ?? ''}</td>`;
      });
      html += '</tr>';
    });
  }
  html += '</tbody></table></div>';

  html += `<h3 style="margin-top:16px">❌ แถวที่ไม่ผ่านทั้งหมด (${invalidRows.length} แถว)</h3>`;
  html += '<div class="data-scroll" style="max-height:400px"><table class="data-table"><thead><tr>';
  ['id','doc_date','doc_no','grade','width','used_kgs','error_msg'].forEach(k => html += `<th>${k}</th>`);
  html += '</tr></thead><tbody>';
  if (!invalidRows.length) {
    html += '<tr><td colspan="7" style="text-align:center;color:#94a3b8">ไม่มีแถวที่ไม่ผ่าน 🎉</td></tr>';
  } else {
    invalidRows.forEach(r => {
      html += '<tr class="invalid">';
      ['id','doc_date','doc_no','grade','width','used_kgs'].forEach(k => {
        let v = r[k];
        if (k === 'doc_date' && v !== null && v !== undefined && v !== '') {
          v = excelDateToThai(Number(v));
        }
        html += `<td>${esc(v) ?? ''}</td>`;
      });
      html += `<td><b>${esc(r.error_msg) || 'ไม่ทราบสาเหตุ'}</b></td>`;
      html += '</tr>';
    });
  }
  html += '</tbody></table></div>';

  el.innerHTML = html;
}

// ================= IMPORT USAGE =================
function importUsage(ev) {
  const f = ev.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = async e => {
    try {
      showProgress('usageProgress', 0, 1, 'กำลังอ่านไฟล์...');
      const wb = XLSX.read(e.target.result, { type: 'array' });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      showProgress('usageProgress', 0, rows.length, `อ่านได้ ${rows.length} แถว กำลังเตรียมข้อมูล...`);

      const payload = [];
      rows.forEach((row) => {
        const usage_date = toISODate(findColumn(row, USAGE_COLS.doc_date));
        const gradegram  = String(findColumn(row, USAGE_COLS.grade) || '').trim();
        const width      = Number(findColumn(row, USAGE_COLS.width));
        const used_kgs   = Number(findColumn(row, USAGE_COLS.used_kgs));

        const item_code = (usage_date && gradegram && width) ? findItemCode(gradegram, width) : null;

        payload.push({
          plant_code:        findColumn(row, USAGE_COLS.plant_code) || '',
          plant_desc:        findColumn(row, USAGE_COLS.plant_desc) || '',
          corrugator_no:     findColumn(row, USAGE_COLS.corrugator_no) || '',
          doc_date:          findColumn(row, USAGE_COLS.doc_date) || '',
          doc_shift:         findColumn(row, USAGE_COLS.doc_shift) || '',
          doc_no:            findColumn(row, USAGE_COLS.doc_no) || '',
          stand:             findColumn(row, USAGE_COLS.stand) || '',
          isn:               findColumn(row, USAGE_COLS.isn) || '',
          roll_ssn:          findColumn(row, USAGE_COLS.roll_ssn) || '',
          grade:             gradegram,
          width:             isNaN(width) ? '' : width,
          quality:           findColumn(row, USAGE_COLS.quality) || '',
          supplier:          findColumn(row, USAGE_COLS.supplier) || '',
          dimeter:           findColumn(row, USAGE_COLS.dimeter) ?? '',
          kgs:               findColumn(row, USAGE_COLS.kgs) ?? '',
          return_dimeter:    findColumn(row, USAGE_COLS.return_dimeter) ?? '',
          return_kgs:        findColumn(row, USAGE_COLS.return_kgs) ?? '',
          used_kgs:          isNaN(used_kgs) ? '' : used_kgs,
          roll_for_customer: findColumn(row, USAGE_COLS.roll_for_customer) || '',
          loc:               findColumn(row, USAGE_COLS.loc) || '',
          warehouse_no:      findColumn(row, USAGE_COLS.warehouse_no) || '',
          usage_date:        usage_date,
          item_code:         item_code || '',
          created_by:        currentUser.id
        });
      });

      const CHUNK_SIZE = 500;
      const batchId = crypto.randomUUID();
      const totalChunks = Math.ceil(payload.length / CHUNK_SIZE);

      let sumTotal = 0, sumValid = 0, sumInvalid = 0;

      for (let i = 0; i < payload.length; i += CHUNK_SIZE) {
        const chunk = payload.slice(i, i + CHUNK_SIZE);
        const chunkNo = Math.floor(i / CHUNK_SIZE) + 1;

        showProgress('usageProgress', i + chunk.length, payload.length,
          `กำลังบันทึกชุดที่ ${chunkNo}/${totalChunks} (${i + chunk.length}/${payload.length} แถว)...`);

        const { data, error } = await supabase.rpc('import_usage_full', {
          rows: chunk,
          batch_id: batchId
        });

        if (error) {
          hideProgress('usageProgress');
          showMsg('importUsageMsg',
            `❌ บันทึกชุดที่ ${chunkNo}/${totalChunks} ไม่สำเร็จ<br><b>Error:</b> ${error.message}`,
            'err');
          await renderLatestBatch();
          return;
        }

        sumTotal   += data.total   || 0;
        sumValid   += data.valid   || 0;
        sumInvalid += data.invalid || 0;
      }

      hideProgress('usageProgress');
      let html = `✅ ทั้งหมด ${sumTotal} แถว · 
        <b style="color:#166534">ผ่าน ${sumValid}</b> · 
        <b style="color:#dc2626">ไม่ผ่าน ${sumInvalid}</b>`;
      showMsg('importUsageMsg', html, sumInvalid ? 'info' : 'ok');

      await renderLatestBatch();
    } catch (ex) {
      hideProgress('usageProgress');
      showMsg('importUsageMsg', 'อ่านไฟล์ไม่สำเร็จ: ' + ex.message, 'err');
    }
  };
  r.readAsArrayBuffer(f);
  ev.target.value = '';
}

// ================= DELETE BY MONTH =================
function openDeleteMonth() {
  $('delMonth').value = currentMonthStr();
  $('deleteMonthMsg').innerHTML = '';
  openModal('modalDeleteMonth');
}

async function exportMonthBeforeDelete() {
  const m = $('delMonth').value;
  if (!m) return alert('เลือกเดือนก่อน');
  const [y, mo] = m.split('-').map(Number);

  $('deleteMonthMsg').innerHTML = '<div class="msg info">กำลังดึงข้อมูล...</div>';
  const rows = await fetchAllRows(() =>
    supabase.from('usage_records_raw').select('*')
      .gte('usage_date', `${m}-01`)
      .lte('usage_date', `${y}-${pad(mo)}-${pad(new Date(y, mo, 0).getDate())}`)
  );

  if (!rows.length) {
    $('deleteMonthMsg').innerHTML = '<div class="msg err">ไม่พบข้อมูลในเดือนนี้</div>';
    return;
  }

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'RawData');
  XLSX.writeFile(wb, `raw_${m}.xlsx`);
  $('deleteMonthMsg').innerHTML = `<div class="msg ok">✅ Export ${rows.length} แถวแล้ว</div>`;
}

async function confirmDeleteMonth() {
  const m = $('delMonth').value;
  if (!m) return;
  const [y, mo] = m.split('-').map(Number);
  const fromShort = thaiMonthShort(m);
  if (!confirm(`⚠️ ยืนยันลบข้อมูลของเดือน ${fromShort}?`)) return;

  $('deleteMonthMsg').innerHTML = '<div class="msg info">กำลังลบ...</div>';
  const { data, error } = await supabase.rpc('delete_usage_by_month', { p_year: y, p_month: mo });
  if (error) {
    $('deleteMonthMsg').innerHTML = `<div class="msg err">ลบไม่สำเร็จ: ${error.message}</div>`;
    return;
  }
  $('deleteMonthMsg').innerHTML = `<div class="msg ok">
    ✅ ลบแล้วทั้งหมด ${data.deleted} แถว<br>
    (usage_records: ${data.deleted_main} · raw: ${data.deleted_raw})
  </div>`;
  setTimeout(() => { closeModal('modalDeleteMonth'); renderLatestBatch(); }, 2000);
}

// ================= ARCHIVE =================
async function previewArchive() {
  $('archiveMsg').innerHTML = '<div class="msg info">กำลังตรวจสอบ...</div>';
  const { data, error } = await supabase.rpc('count_archivable_usage');
  if (error) {
    $('archiveMsg').innerHTML = `<div class="msg err">ตรวจสอบไม่สำเร็จ: ${error.message}</div>`;
    return;
  }
  const cutoffThai = new Date(data.cutoff).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
  $('archiveMsg').innerHTML = `<div class="msg info">
    📊 ข้อมูลที่เก่ากว่า <b>2 ปี</b> (ก่อน ${cutoffThai})<br>
    มีทั้งหมด <b>${data.count.toLocaleString()}</b> แถว พร้อมย้าย
  </div>`;
}

async function runArchive() {
  if (!confirm('⚠️ ย้ายข้อมูลที่เก่ากว่า 2 ปี ไป Archive?')) return;
  if (!confirm('ยืนยันอีกครั้ง?')) return;

  $('archiveMsg').innerHTML = '<div class="msg info">กำลังย้ายข้อมูล...</div>';
  const { data, error } = await supabase.rpc('archive_old_usage');
  if (error) {
    $('archiveMsg').innerHTML = `<div class="msg err">ย้ายไม่สำเร็จ: ${error.message}</div>`;
    return;
  }
  const cutoffThai = new Date(data.cutoff).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
  $('archiveMsg').innerHTML = `<div class="msg ok">
    ✅ ย้ายสำเร็จ ${data.archived.toLocaleString()} แถว<br>
    (ข้อมูลก่อน ${cutoffThai})
  </div>`;
  await loadArchiveStats();
}

async function loadArchiveStats() {
  $('archiveStats').innerHTML = '<p style="color:#94a3b8;font-size:13px">กำลังโหลด...</p>';
  try {
    const { count, error } = await supabase
      .from('usage_records_archive')
      .select('*', { count: 'exact', head: true });
    if (error) throw error;

    const { data: oldest } = await supabase
      .from('usage_records_archive')
      .select('usage_date')
      .order('usage_date', { ascending: true })
      .limit(1);
    const { data: newest } = await supabase
      .from('usage_records_archive')
      .select('usage_date')
      .order('usage_date', { ascending: false })
      .limit(1);

    let html = `<div class="msg info">
      📦 <b>Archive ทั้งหมด:</b> ${(count || 0).toLocaleString()} แถว<br>`;
    if (oldest?.[0]?.usage_date) {
      html += `<b>ช่วงวันที่:</b> ${oldest[0].usage_date} ถึง ${newest[0].usage_date}`;
    }
    html += `</div>`;
    $('archiveStats').innerHTML = html;
  } catch (e) {
    $('archiveStats').innerHTML = `<div class="msg err">โหลดสถิติไม่สำเร็จ: ${e.message}</div>`;
  }
}

// ================= USERS =================
async function callAdmin(action, payload = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('ไม่ได้ login');
  const res = await fetch(EDGE_FUNCTION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
    body: JSON.stringify({ action, ...payload })
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Edge function error');
  return json;
}

async function loadUsers() {
  if (!isAdmin() || !HAS_EDGE_FUNCTION) return;
  $('usersBody').innerHTML = '<p>กำลังโหลด...</p>';
  try {
    const { users } = await callAdmin('list');
    let html = '<table><thead><tr><th>#</th><th>ชื่อผู้ใช้</th><th>ชื่อ-นามสกุล</th><th>สิทธิ์</th><th>เข้าใช้ล่าสุด</th><th></th></tr></thead><tbody>';
    users.forEach((u, i) => {
      const last = u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString('th-TH') : '-';
      html += `<tr><td>${i+1}</td><td><b>${esc(u.username)}</b></td><td>${esc(u.full_name) || '-'}</td>
        <td><span class="badge ok">${u.role}</span></td>
        <td>${last}</td>
        <td><button onclick='openChangeRole(${JSON.stringify(u)})'>เปลี่ยน Role</button>
          <button onclick='openResetPass(${JSON.stringify(u)})'>Reset รหัส</button>
          ${u.id !== currentUser.id ? `<button class="danger" onclick="delUser('${u.id}','${esc(u.username)}')">ลบ</button>` : ''}
        </td></tr>`;
    });
    html += '</tbody></table>';
    $('usersBody').innerHTML = html;
  } catch (e) {
    showMsg('usersMsg', 'โหลดไม่สำเร็จ: ' + e.message, 'err');
    $('usersBody').innerHTML = '';
  }
}

function openUserForm() {
  ['uName','uFullName','uPassword'].forEach(k => $(k).value = '');
  $('uRole').value = 'user';
  $('userFormError').innerHTML = '';
  openModal('modalUser');
}

async function saveUser() {
  const username = $('uName').value.trim();
  const full_name = $('uFullName').value.trim();
  const password = $('uPassword').value;
  const role = $('uRole').value;
  try {
    await callAdmin('create', { username, full_name, password, role });
    closeModal('modalUser');
    showMsg('usersMsg', `✅ สร้างผู้ใช้ ${username} สำเร็จ`, 'ok');
    loadUsers();
  } catch (e) { $('userFormError').innerHTML = `<div class="msg err">${e.message}</div>`; }
}

function openChangeRole(u) {
  const newRole = prompt(`เปลี่ยน role ของ "${u.username}" เป็น (admin/user):`, u.role);
  if (!newRole || !['admin','user'].includes(newRole)) return;
  const newName = prompt('ชื่อ-นามสกุล:', u.full_name || u.username) || u.full_name;
  callAdmin('updateRole', { id: u.id, role: newRole, full_name: newName })
    .then(() => { showMsg('usersMsg', `✅ เปลี่ยน role เป็น ${newRole}`, 'ok'); loadUsers(); })
    .catch(e => showMsg('usersMsg', 'ผิดพลาด: ' + e.message, 'err'));
}

function openResetPass(u) {
  const newPass = prompt(`รหัสผ่านใหม่สำหรับ "${u.username}" (อย่างน้อย 6 ตัว):`);
  if (!newPass || newPass.length < 6) return;
  callAdmin('resetPassword', { id: u.id, password: newPass })
    .then(() => showMsg('usersMsg', `✅ เปลี่ยนรหัสของ ${u.username} แล้ว`, 'ok'))
    .catch(e => showMsg('usersMsg', 'ผิดพลาด: ' + e.message, 'err'));
}

async function delUser(id, username) {
  if (!confirm(`ลบผู้ใช้ "${username}" ถาวร?`)) return;
  try {
    await callAdmin('delete', { id });
    showMsg('usersMsg', `✅ ลบ ${username} แล้ว`, 'ok');
    loadUsers();
  } catch (e) { showMsg('usersMsg', 'ผิดพลาด: ' + e.message, 'err'); }
}
// ================= SNAPSHOT (Stock Level) =================
let currentSnapshotData = null;   // เก็บ matrix ปัจจุบัน

async function saveStockLevelSnapshot() {
  const title = getCurrentTitle();
  const msgEl = $('snapshotMsg');
  
  // ดึง matrix ปัจจุบันจากตาราง
  const matrixBody = $('matrixBody');
  if (!matrixBody || !matrixBody.querySelector('table')) {
    if (msgEl) msgEl.innerHTML = '<div class="msg err">⚠ ยังไม่มีข้อมูล — กด "ค้นหา" ก่อน</div>';
    return;
  }
  
  // ✅ ดึงข้อมูล matrix จากตัวแปร (เราต้องเก็บไว้ตอน renderMatrix)
  if (!currentSnapshotData) {
    if (msgEl) msgEl.innerHTML = '<div class="msg err">⚠ ยังไม่มีข้อมูลให้บันทึก</div>';
    return;
  }
  
  // เช็ค title ซ้ำ (case-insensitive)
  const { data: existing, error: errChk } = await supabase
    .from('stock_level_snapshots')
    .select('title')
    .ilike('title', title);
  
  if (errChk) {
    if (msgEl) msgEl.innerHTML = `<div class="msg err">ตรวจสอบชื่อไม่สำเร็จ: ${esc(errChk.message)}</div>`;
    return;
  }
  
  let finalTitle = title;
  if (existing && existing.length > 0) {
    const count = existing.length;
    const choice = prompt(
      `ชื่อ "${title}" ซ้ำ ${count} ครั้ง\n` +
      `พิมพ์หมายเลขที่จะบันทึก (1-${count + 1}) หรือกด Cancel เพื่อยกเลิก:`,
      String(count + 1)
    );
    if (!choice) return;   // cancel
    const n = Number(choice);
    if (!n || n < 1 || n > count + 1) {
      if (msgEl) msgEl.innerHTML = '<div class="msg err">หมายเลขไม่ถูกต้อง</div>';
      return;
    }
    finalTitle = `${title}/${n}`;
  }
  
  // save
  const payload = {
    title: finalTitle,
    months: selectedMonths,
    mode: document.querySelector('input[name="mode"]:checked').value,
    customer: $('qCustomer').value,
    grades: getSelectedGrades(),
    matrix_data: currentSnapshotData,
    created_by: currentUser.id
  };
  
  const { error } = await supabase.from('stock_level_snapshots').insert(payload);
  
  if (error) {
    if (msgEl) msgEl.innerHTML = `<div class="msg err">บันทึกไม่สำเร็จ: ${esc(error.message)}</div>`;
    return;
  }
  
  if (msgEl) msgEl.innerHTML = `<div class="msg ok">✅ บันทึก "${esc(finalTitle)}" สำเร็จ</div>`;
  setTimeout(() => { if (msgEl) msgEl.innerHTML = ''; }, 3000);
  
  await loadStockLevelSnapshots();
}

async function loadStockLevelSnapshots() {
  const listEl = $('snapshotList');
  if (!listEl) return;
  listEl.innerHTML = '<p style="color:#94a3b8;font-size:13px">กำลังโหลด...</p>';
  
  const { data, error } = await supabase
    .from('stock_level_snapshots')
    .select('id, title, months, mode, customer, grades, created_at')
    .order('created_at', { ascending: false });
  
  if (error) {
    listEl.innerHTML = `<div class="msg err">${esc(error.message)}</div>`;
    return;
  }
  
  if (!data || !data.length) {
    listEl.innerHTML = '<p style="color:#94a3b8;font-size:13px">ยังไม่มีรายการที่บันทึกไว้</p>';
    return;
  }
  
  listEl.innerHTML = data.map(s => {
    const dt = new Date(s.created_at).toLocaleString('th-TH', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
    return `<div class="snapshot-card">
      <div class="snapshot-card-info">
        <div class="snapshot-card-title">${esc(s.title)}</div>
        <div class="snapshot-card-meta">📅 ${dt}</div>
      </div>
      <div class="snapshot-card-actions">
        <button onclick="viewSnapshot(${s.id})">👁 ดู</button>
        <button class="danger" onclick="deleteSnapshot(${s.id}, '${esc(s.title)}')">🗑 ลบ</button>
      </div>
    </div>`;
  }).join('');
}

async function viewSnapshot(id) {
  $('snapshotViewTitle').textContent = 'กำลังโหลด...';
  $('snapshotViewBody').innerHTML = '<p style="text-align:center;color:#94a3b8;padding:20px">กำลังโหลด...</p>';
  openModal('modalSnapshot');
  
  const { data, error } = await supabase
    .from('stock_level_snapshots')
    .select('*')
    .eq('id', id)
    .single();
  
  if (error || !data) {
    $('snapshotViewBody').innerHTML = `<div class="msg err">โหลดไม่สำเร็จ: ${esc(error?.message || 'ไม่พบข้อมูล')}</div>`;
    return;
  }
  
  $('snapshotViewTitle').textContent = data.title;
  
  // render matrix จาก matrix_data
  const md = data.matrix_data || [];
  if (!md.length) {
    $('snapshotViewBody').innerHTML = '<p style="color:#94a3b8">ไม่มีข้อมูล</p>';
    return;
  }
  
  // group
  const rowSet = new Set(), colSet = new Set(), cells = {}, rowTotals = {}, colTotals = {};
  let grand = 0;
  
  md.forEach(r => {
    rowSet.add(r.gradegram);
    colSet.add(r.size);
    const k = r.gradegram + '|' + r.size;
    cells[k] = r.max_rolls;
    rowTotals[r.gradegram] = (rowTotals[r.gradegram] || 0) + r.max_rolls;
    colTotals[r.size] = (colTotals[r.size] || 0) + r.max_rolls;
    grand += r.max_rolls;
  });
  
  const rowKeys = [...rowSet].sort();
  const colKeys = [...colSet].sort((a,b) => a - b);
  
  let html = '<div class="report-wrap"><table class="report-table"><thead><tr>';
  html += '<th class="grade-col">Gradegrams</th>';
  colKeys.forEach(s => html += `<th>${s}</th>`);
  html += '<th class="total-col">Total</th></tr></thead><tbody>';
  
  rowKeys.forEach(rk => {
    html += '<tr>';
    html += `<td class="grade-col">${esc(rk)}</td>`;
    colKeys.forEach(s => {
      const v = cells[rk + '|' + s];
      if (v == null) html += '<td class="empty">-</td>';
      else html += `<td>${Number(v).toFixed(2)}</td>`;
    });
    html += `<td class="total-col">${Number(rowTotals[rk] || 0).toFixed(2)}</td></tr>`;
  });
  html += '<tr class="total-row"><td class="grade-col">Total</td>';
  colKeys.forEach(s => html += `<td>${Number(colTotals[s] || 0).toFixed(2)}</td>`);
  html += `<td class="total-col">${Number(grand).toFixed(2)}</td></tr>`;
  html += '</tbody></table></div>';
  
  // meta
  const dt = new Date(data.created_at).toLocaleString('th-TH');
  html += `<div class="report-foot">
    บันทึกเมื่อ: ${dt} · เดือน: ${(data.months || []).join(', ')} · 
    โหมด: ${data.mode === 'full' ? 'ม้วนเต็ม' : 'ใช้จริง'}
  </div>`;
  
  $('snapshotViewBody').innerHTML = html;
}

async function deleteSnapshot(id, title) {
  if (!confirm(`ลบ "${title}" ?`)) return;
  const { error } = await supabase.from('stock_level_snapshots').delete().eq('id', id);
  if (error) {
    alert('ลบไม่สำเร็จ: ' + error.message);
    return;
  }
  await loadStockLevelSnapshots();
}

function printSnapshot() {
  window.print();
}
// ================= INIT =================
(function init() {
  if ($('qReportMonth')) $('qReportMonth').value = currentMonthStr();
  document.querySelectorAll('.modal-bg').forEach(el => {
    el.onclick = e => { if (e.target === el) el.classList.remove('show'); };
  });
  initSession();
})();
