// ═══════════════════════════════════════════════════════════════
//  ALERT.JS — V.18.5 (Part 3/3)
//  DATABASE SYNC + PO + DETAIL + RESERVATIONS
//  ✅ แก้ V.18.5: loadAlertReservations คำนวณยอดสุทธิให้ตรงหน้า Reservations (ทุก status, หักแถวปรับลดตาม parent_reservation_id, หัก complete log)
//  ✅ แก้: loadAlertReservations (หักยอดที่ใช้ใน alert_active_inputs ทุกวัน)
//  ✅ เพิ่ม: _getUsedReservationQtyMap()
//  ✅ แก้: buildReservationHtml (แสดงยอดสุทธิ + ใช้แล้ว)
//  ✅ แก้: getAlertReservedTotal (ใช้ยอดสุทธิ)
//  ✅ แก้: clearAlertInputs (ไม่ลบ log DRAFT แล้ว)
//  ✅ แก้: cancelDraftOrder (ไม่ลบ log DRAFT แล้ว)
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
//  DROPDOWN HELPER
// ═══════════════════════════════════════════════════════════════

function _attachAlertDropdown(btnId, dropdownId, boxId, docKey) {
  const btn = $(btnId);
  const dropdown = $(dropdownId);
  const box = $(boxId);
  if (!btn || !dropdown || !box) return;

  if (btn._alertDropdownClick) {
    btn.removeEventListener('click', btn._alertDropdownClick);
  }

  btn._alertDropdownClick = (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('hidden');
    btn.classList.toggle('open');
  };
  btn.addEventListener('click', btn._alertDropdownClick);

  if (!window['_' + docKey + 'DocClick']) {
    window['_' + docKey + 'DocClick'] = (e) => {
      const b = $(btnId), d = $(dropdownId), bx = $(boxId);
      if (!b || !d || !bx) return;
      if (!bx.contains(e.target)) { d.classList.add('hidden'); b.classList.remove('open'); }
    };
    document.addEventListener('click', window['_' + docKey + 'DocClick']);
  }
}

// ═══════════════════════════════════════════════════════════════
//  DATABASE SYNC
// ═══════════════════════════════════════════════════════════════

// ─── RECEIVE DATES ──────────────────────────────────────────────
async function fetchAlertReceiveDatesFromDB() {
  try {
    const { data, error } = await supabase
      .from('alert_receive_dates')
      .select('date_value')
      .order('date_value');
    if (error) throw error;
    _dbReceiveDates = (data || []).map(d => d.date_value);
    return _dbReceiveDates;
  } catch (err) {
    console.error('fetchAlertReceiveDatesFromDB:', err);
    return [];
  }
}

async function addAlertReceiveDateToDB(dateVal) {
  const { error } = await supabase
    .from('alert_receive_dates')
    .insert({ date_value: dateVal });
  if (error && error.code !== '23505') throw error;
  await fetchAlertReceiveDatesFromDB();
}

async function removeAlertReceiveDateFromDB(dateVal) {
  await supabase.from('alert_receive_dates').delete().eq('date_value', dateVal);
  await fetchAlertReceiveDatesFromDB();
}

// ─── ACTIVE INPUTS ──────────────────────────────────────────────
async function fetchAlertInputsFromDB(dateIso) {
  if (!dateIso) return [];
  try {
    const { data, error } = await supabase
      .from('alert_active_inputs')
      .select('*')
      .eq('receive_date', dateIso);
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('fetchAlertInputsFromDB:', err);
    return [];
  }
}

async function _loadActiveInputsToMemory() {
  const activeIso = alertReceiveDates[alertActiveDateIdx];
  if (!activeIso) return;
  const dbInputs = await fetchAlertInputsFromDB(activeIso);
  _dbAlertInputs[activeIso] = {};
  dbInputs.forEach(row => {
    const key = `${row.gradegram}|${row.size}`;
    if (!_dbAlertInputs[activeIso][key]) _dbAlertInputs[activeIso][key] = [];
    _dbAlertInputs[activeIso][key].push({
      qty: row.qty,
      sup: row.sup,
      customer_roll: row.customer_roll,
      quality_b: row.quality_b,
      note: row.note,
      res_id: row.res_id || ''
    });
  });
}

function getAlertItems(gradegram, size, dateOrIdx) {
  let isoDate = '';
  if (typeof dateOrIdx === 'string') isoDate = dateOrIdx;
  else if (typeof dateOrIdx === 'number') isoDate = alertReceiveDates[dateOrIdx];
  else isoDate = alertReceiveDates[alertActiveDateIdx];

  if (!isoDate) return [];

  const dayData = _dbAlertInputs[isoDate] || {};
  const cell = dayData[`${gradegram}|${size}`];
  return (cell || []).filter(it => it.qty && Number(it.qty) > 0);
}

function getAlertQtyTotal(gradegram, size, dateOrIdx) {
  const items = getAlertItems(gradegram, size, dateOrIdx);
  return items.reduce((sum, it) => sum + (Number(it.qty) || 0), 0);
}

async function saveAlertItems(gradegram, size, items, dateOrIdx) {
  let isoDate = '';
  if (typeof dateOrIdx === 'string') isoDate = dateOrIdx;
  else if (typeof dateOrIdx === 'number') isoDate = alertReceiveDates[dateOrIdx];
  else isoDate = alertReceiveDates[alertActiveDateIdx];

  if (!isoDate) return;

  // อัปเดต Memory ก่อน
  if (!_dbAlertInputs[isoDate]) _dbAlertInputs[isoDate] = {};
  _dbAlertInputs[isoDate][`${gradegram}|${size}`] = items;

  // เรียงคิวต่อรายการ (วัน+เกรด+ไซส์) กันบันทึกซ้อนกันตอนพิมพ์/กดเร็วๆ
  const qKey = `${isoDate}|${gradegram}|${size}`;
  window._alertSaveQ = window._alertSaveQ || {};
  const run = async () => {
    let backup = null;
    try {
      // 1) เก็บสำเนาของเดิมไว้ก่อน (เผื่อบันทึกใหม่ไม่สำเร็จ จะได้คืนค่าเดิม ไม่ให้ข้อมูลหาย)
      const { data: old, error: e0 } = await supabase.from('alert_active_inputs')
        .select('*').eq('receive_date', isoDate).eq('gradegram', gradegram).eq('size', size);
      if (e0) throw e0;
      backup = old || [];

      // 2) ลบของเดิม
      const { error: eDel } = await supabase.from('alert_active_inputs')
        .delete().eq('receive_date', isoDate).eq('gradegram', gradegram).eq('size', size);
      if (eDel) throw eDel;

      // 3) บันทึกชุดใหม่ — ถ้าล้มเหลว คืนค่าเดิม
      if (items && items.length > 0) {
        const payload = items.map(it => ({
          receive_date: isoDate,
          gradegram: gradegram,
          size: size,
          qty: Number(it.qty) || 0,
          sup: it.sup || '',
          customer_roll: it.customer_roll || 'normal',
          quality_b: it.quality_b || 'normal',
          note: it.note || '',
          updated_by: currentUser?.id || null,
          res_id: it.res_id || it.reservation_id || null
        }));
        const { error } = await supabase.from('alert_active_inputs').insert(payload);
        if (error) {
          if (backup.length) {
            const restore = backup.map(r => { const c = { ...r }; delete c.id; return c; });
            const { error: eRes } = await supabase.from('alert_active_inputs').insert(restore);
            if (eRes) console.error('Restore alert_active_inputs failed:', eRes);
            else _dbAlertInputs[isoDate][`${gradegram}|${size}`] = backup.map(r => ({
              qty: r.qty, sup: r.sup, customer_roll: r.customer_roll, quality_b: r.quality_b, note: r.note, res_id: r.res_id
            }));
          }
          throw error;
        }
      }
    } catch (err) {
      console.error('Autosave Error:', err);
      if (typeof showToast === 'function') {
        showToast('⚠️ บันทึกอัตโนมัติไม่สำเร็จ (ข้อมูลเดิมยังอยู่): ' + (err.message || err), 'err');
      }
    }
  };
  window._alertSaveQ[qKey] = (window._alertSaveQ[qKey] || Promise.resolve()).then(run, run);
  return window._alertSaveQ[qKey];
}

// ═══════════════════════════════════════════════════════════════
//  PO FLAG
// ═══════════════════════════════════════════════════════════════

function loadPOFlag() {
  try {
    const raw = localStorage.getItem(ALERT_PO_FLAG_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function savePOFlag(data) {
  localStorage.setItem(ALERT_PO_FLAG_KEY, JSON.stringify(data));
}

function markAlertPOCreated(refKey) {
  const flags = loadPOFlag();
  flags[refKey] = { created_at: new Date().toISOString(), edited: false };
  savePOFlag(flags);
}

function hasPOCreated() {
  const flags = loadPOFlag();
  return Object.values(flags).some(f => f && f.created_at);
}

function markAlertPOEdited() {
  const flags = loadPOFlag();
  let changed = false;
  Object.keys(flags).forEach(k => {
    if (flags[k] && flags[k].created_at && !flags[k].edited) {
      flags[k].edited = true;
      flags[k].edited_at = new Date().toISOString();
      changed = true;
    }
  });
  if (changed) savePOFlag(flags);
}

function hasPOEdited() {
  const flags = loadPOFlag();
  return Object.values(flags).some(f => f.edited === true);
}

function clearPOFlags() {
  localStorage.removeItem(ALERT_PO_FLAG_KEY);
}

// ═══════════════════════════════════════════════════════════════
//  RECEIVE DATES (DB)
// ═══════════════════════════════════════════════════════════════

function getNextWorkingDay(baseDate = new Date()) {
  const d = new Date(baseDate);
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0) d.setDate(d.getDate() + 1);
  return toISODate(d);
}

async function setFirstAlertDate(dateValue) {
  if (!dateValue) {
    alert('กรุณาเลือกวันที่');
    return;
  }
  await addAlertReceiveDateToDB(dateValue);
  alertReceiveDates = [..._dbReceiveDates];
  alertActiveDateIdx = 0;
  renderAlertDateTabs();
  await renderAlert();
}

async function addAlertReceiveDate() {
  const analyzedDate = getISODateFromInput('alertDate');
  if (!analyzedDate) return alert('กรุณาเลือกวันที่วิเคราะห์ก่อน');

  const tomorrow = new Date(analyzedDate);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (tomorrow.getDay() === 0) tomorrow.setDate(tomorrow.getDate() + 1);
  const defaultNextDate = toISODate(tomorrow);

  if (alertReceiveDates.length === 0) {
    await addAlertReceiveDateToDB(defaultNextDate);
    alertReceiveDates = [..._dbReceiveDates];
    renderAlertDateTabs();
    await renderAlert();
    return;
  }

  const sorted = [...alertReceiveDates].map(_parseLocalDate).filter(Boolean).sort((a, b) => a - b);
  const existing = new Set(alertReceiveDates);
  const lastD = sorted[sorted.length - 1];
  const nextD = _nextWorkingDay(lastD);
  while (nextD.getDay() === 0) nextD.setDate(nextD.getDate() + 1);
  const nextISO = toISODate(nextD);
  if (existing.has(nextISO)) return alert('⚠️ ไม่มีวันว่างให้เพิ่ม');

  await addAlertReceiveDateToDB(nextISO);
  alertReceiveDates = [..._dbReceiveDates];
  renderAlertDateTabs();
  await renderAlert();
}

async function removeAlertReceiveDate(idx) {
  if (!confirm('ลบวันที่นี้? ข้อมูลที่กรอกในวันนี้จะหายไปด้วย')) return;
  const dateToRemove = alertReceiveDates[idx];
  if (dateToRemove) {
    await removeAlertReceiveDateFromDB(dateToRemove);
    await supabase.from('alert_active_inputs').delete().eq('receive_date', dateToRemove);
    delete _dbAlertInputs[dateToRemove];
  }
  _draftPendingItems = [];
  if (alertActiveDateIdx >= idx) alertActiveDateIdx = Math.max(0, alertActiveDateIdx - 1);
  alertReceiveDates = [..._dbReceiveDates];
  renderAlertDateTabs();
  await renderAlert();
}

function onAlertReceiveDateChange(idx, value) {
  if (!value) return;
  alertReceiveDates[idx] = value;
  renderAlertDateTabs();
}

function renderAlertReceiveDates() {
  renderAlertDateTabs();
}

async function switchAlertDate(idx) {
  if (idx < 0 || idx >= alertReceiveDates.length) return;
  alertActiveDateIdx = idx;

  const activeIso = alertReceiveDates[idx];
  if (activeIso && !_dbAlertInputs[activeIso]) {
    await _loadActiveInputsToMemory();
  }

  // 🔥 V.17.2: กรอง Draft ที่ไม่ตรงกับวันนี้ออก (แต่ไม่คืนยอด เพราะ draft ยังค้างอยู่)
  _draftPendingItems = _draftPendingItems.filter(d => {
    if (!d.date) return true; // draft เก่าที่ไม่มี date → เก็บไว้
    return d.date === activeIso;
  });

  renderAlertDateTabs();
  await renderAlert();
}

function renderAlertDateTabs() {
  const box = $('alertDateTabsBox');
  if (!box) return;

  let html = '<div class="alert-date-tabs-left">';
  html += '<span class="alert-date-label">📅 วันที่รับสินค้า:</span>';

  alertReceiveDates.forEach((d, i) => {
    const dObj = new Date(d);
    const dd = String(dObj.getDate()).padStart(2, '0');
    const mm = String(dObj.getMonth() + 1).padStart(2, '0');
    const yyyy = dObj.getFullYear() + 543;
    const display = `${dd}/${mm}/${yyyy}`;
    const active = i === alertActiveDateIdx ? 'active' : '';

    html += `<span class="alert-date-tab-wrap ${active ? 'is-active' : ''}">
      <button type="button" class="alert-date-tab ${active}" onclick="switchAlertDate(${i})">
        📅 ${display}
      </button>
      <button type="button" class="alert-date-tab-close" onclick="removeAlertReceiveDate(${i})" title="ลบวันนี้">✕</button>
    </span>`;
  });

  html += `<button type="button" class="alert-date-add-btn" onclick="addAlertReceiveDate()">+ เพิ่มวัน</button>`;
  html += '</div>';

  box.innerHTML = html;
}

async function initAlertReceiveDates() {
  await fetchAlertReceiveDatesFromDB();
  alertReceiveDates = [..._dbReceiveDates];
  alertActiveDateIdx = 0;
  renderAlertDateTabs();
}

// ═══════════════════════════════════════════════════════════════
//  HELPER: FSC
// ═══════════════════════════════════════════════════════════════

function isFSCGrade(gradegram) {
  if (!gradegram) return false;
  const match = String(gradegram).match(/^([A-Z]+)/);
  if (!match) return false;
  return match[1].includes('F');
}

// ═══════════════════════════════════════════════════════════════
//  RENDER ALERT (Main)
// ═══════════════════════════════════════════════════════════════

async function renderAlert() {
  const snapshotMonth = $('alertSnapshotMonth')?.value;
  const stockDate     = getISODateFromInput('alertStockDate');

  if (alertReceiveDates.length === 0) {
    const html = `
      <div class="alert-date-tabs first-date-bar">
        <span class="fd-ic">📅</span>
        <span class="fd-txt">เลือกวันที่รับสินค้าก่อน แล้วระบบจะวิเคราะห์ให้</span>
        <input type="text" id="firstReceiveDateInput" placeholder="วว/ดด/ปปปป" autocomplete="off">
        <button type="button" class="fd-ok" onclick="setFirstAlertDate(getISODateFromInput('firstReceiveDateInput'))">ตกลง</button>
      </div>
    `;
    $('alertBody').innerHTML = html;

    setTimeout(() => {
      initFirstReceiveDatePicker();
    }, 50);

    return;
  }

  const receiveDate = getISODateFromInput('alertReceiveDate');

  if (!snapshotMonth || !stockDate || !receiveDate) {
    console.warn('[Alert] ข้ามการวิเคราะห์: ข้อมูลไม่ครบ');
    return;
  }

  if (!alertUsageRanges.length) {
    await loadUsagePlanRanges();
  }

  const stockDateTH = stockDate ? thaiDateFull(stockDate) : '-';
  const receiveDateTH = receiveDate ? thaiDateFull(receiveDate) : '-';

  $('alertReportTitle').innerHTML = `
    🚨 แจ้งเตือนสั่งซื้อ (Stock Alert)
    <div class="report-subtitle" style="font-size:12px;color:#64748b;margin-top:6px">
      (Stock Level: ${snapshotMonth} · Stock ${stockDateTH} · Receive ${receiveDateTH})
    </div>
  `;

  $('alertBody').innerHTML = '<p style="text-align:center;color:#94a3b8;padding:20px">กำลังวิเคราะห์...</p>';

  try {
    // V.18.6: ให้ยอดรับม้วนตรงกับ PO ล่าสุดก่อนคำนวณ (เหมือนหน้า Purchase Summary)
    if (typeof ensureReceiveFresh === 'function') {
      try { await ensureReceiveFresh(receiveDate, { silent: true }); } catch (e) { console.warn('[Alert] sync receive:', e); }
    }
    const { data, error } = await supabase.rpc('get_alert_matrix_v2', {
      p_snapshot_month: snapshotMonth,
      p_stock_date:     stockDate,
      p_receive_date:   receiveDate,
      p_usage_from:     alertUsageSelected?.date_from || null,
      p_usage_to:       alertUsageSelected?.date_to   || null,
    });
    if (error) throw error;

    let result = data || [];

    result = result.map(r => {
      const m = masterCache.find(x =>
        normalizeGrade(x.grade) === normalizeGrade(r.grade) &&
        x.size === r.size
      );
      return {
        ...r,
        gradegram: m ? (normalizeGrade(m.grade) + m.gram) : r.grade
      };
    });

    const uniqueMap = new Map();
    result.forEach(r => {
      const key = `${r.gradegram}|${Number(r.size)}`;
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, r);
      } else {
        console.warn('⚠️ พบข้อมูล Alert ซ้ำ:', key, 'ทำการรวมยอด...');
        const existing = uniqueMap.get(key);
        existing.alert = Number(existing.alert) + Number(r.alert);
        existing.stock = Number(existing.stock) + Number(r.stock);
        existing.receive = Number(existing.receive) + Number(r.receive);
      }
    });
    result = Array.from(uniqueMap.values());

    window._alertFullCache = [...result];

    alertAllSizes = [...new Set(result.map(r => Number(r.size)))].sort((a, b) => a - b);
    renderAlertSizeList();
    updateAlertSizeLabel();

    const display = result;

    let html = `<div id="alertDateTabsBox" class="alert-date-tabs"></div>`;

    if (!display.length) {
      html += '<p style="text-align:center;color:#94a3b8;padding:30px">ไม่มีรายการ 🎉</p>';
      $('alertBody').innerHTML = html;
      renderAlertDateTabs();
      alertCache = [];
      return;
    }

    html += '<div class="report-wrap alert-scroll"><table class="alert-flat-table"><thead><tr>';
    html += buildAlertTableHead();
    html += '</tr></thead><tbody></tbody></table></div>';
    html += buildAlertFoot();

    $('alertBody').innerHTML = html;

    alertCache = display;

    // 🔥 โหลด inputs ของวันปัจจุบันจาก DB
    await _loadActiveInputsToMemory();

    alertAllSupsInData = [...new Set(
      display.map(r => {
        const items = getAlertItems(r.gradegram, r.size);
        return items.map(it => it.sup || '');
      }).flat().filter(Boolean)
    )].sort();

    renderAllAlertFilters();
    renderAlertDateTabs();

    applyAlertFiltersAndRender();

    if (hasPOEdited()) {
      showPOEditedWarning();
      const flags = loadPOFlag();
      Object.keys(flags).forEach(k => { if (flags[k]) flags[k].edited = false; });
      savePOFlag(flags);
    }
  } catch (err) {
    console.error('renderAlert error:', err);
    $('alertBody').innerHTML = `<div class="msg err">เกิดข้อผิดพลาด: ${esc(err.message)}</div>`;
  }
}

// ═══════════════════════════════════════════════════════════════
//  PO EDITED WARNING
// ═══════════════════════════════════════════════════════════════

function showPOEditedWarning() {
  let modal = document.getElementById('modalPOEditedWarning');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modalPOEditedWarning';
    modal.className = 'modal-bg';
    modal.innerHTML = `
      <div class="modal" style="max-width:480px;text-align:center">
        <div style="font-size:48px;margin-bottom:10px">⚠️</div>
        <h3 style="margin:0 0 12px;color:#dc2626">มีการแก้ไข Alert</h3>
        <p style="color:#475569;margin-bottom:20px;line-height:1.6">
          คุณได้แก้ไขข้อมูล Alert หลังจากสร้าง PO ไปแล้ว<br>
          ต้องการอัปเดต PO ให้ตรงกับ Alert ปัจจุบันหรือไม่?
        </p>
        <div style="display:flex;gap:8px;justify-content:center">
          <button onclick="dismissPOWarning()">ไม่ต้อง</button>
          <button class="primary" onclick="dismissPOWarning()">รับทราบ</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }
  modal.classList.add('show');
}

function dismissPOWarning() {
  const modal = document.getElementById('modalPOEditedWarning');
  if (modal) modal.classList.remove('show');
}

// ═══════════════════════════════════════════════════════════════
//  INPUT (legacy alias)
// ═══════════════════════════════════════════════════════════════

async function onAlertInput(gradegram, size, field, value, el) {
  const items = getAlertItems(gradegram, size);
  if (items.length === 0) {
    items.push({ qty: '', sup: '', customer_roll: 'normal', quality_b: 'normal', note: '' });
  }
  items[0][field] = value;
  await saveAlertItems(gradegram, size, items);

  if (el) {
    const isFilled = (field === 'customer_roll' || field === 'quality_b')
      ? (value && value !== 'normal')
      : (value && String(value).trim() !== '');
    el.classList.toggle('filled', !!isFilled);
  }

  if (field === 'sup' && value && !alertAllSupsInData.includes(value)) {
    alertAllSupsInData.push(value);
    alertAllSupsInData.sort();
    renderAlertSupFilterList();
  }

  const hasOrderFilter = !alertSelectedOrderFilters.includes('all') && alertSelectedOrderFilters.length > 0;
  const hasSupFilter = alertSelectedSupFilters.length > 0;
  if (field === 'qty' || field === 'sup' || hasOrderFilter || hasSupFilter) {
    applyAlertFiltersAndRender();
  }
}

// ═══════════════════════════════════════════════════════════════
//  CLEAR
// ═══════════════════════════════════════════════════════════════

async function clearAlertInputs() {
  if (!confirm('⚠️ ล้างค่าที่กรอกของวันนี้ (สั่งซื้อ / Sup. / ม้วนลูกค้า / คุณภาพ B / หมายเหตุ)?')) return;

  const activeDate = alertReceiveDates[alertActiveDateIdx];

  // 🔥 คืนยอดจองทั้งหมดที่ค้างอยู่ใน Draft ของวันนี้กลับเข้าระบบ
  const draftsToRestore = _draftPendingItems.filter(d => {
    return !d.date || d.date === activeDate;
  });

  if (draftsToRestore.length > 0) {
    const resIds = draftsToRestore.map(d => d.resId);
    await _restoreReservations(resIds);

    _draftPendingItems = _draftPendingItems.filter(d => !draftsToRestore.includes(d));
  }

  // ลบ inputs ของวันนี้ (ไม่ยุ่งกับ roll_reservation_logs แล้ว)
  if (activeDate) {
    try {
      await supabase.from('alert_active_inputs').delete().eq('receive_date', activeDate);
      if (_dbAlertInputs[activeDate]) {
        _dbAlertInputs[activeDate] = {};
      }
    } catch (err) {
      console.warn('ล้างข้อมูลไม่สำเร็จ:', err);
    }
  }

  await renderAlert();

  const msg = document.createElement('div');
  msg.className = 'msg ok';
  msg.style.cssText = 'position:fixed;top:80px;right:20px;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,.15)';
  msg.textContent = '✅ ล้างค่าและคืนยอดจองแล้ว';
  document.body.appendChild(msg);
  setTimeout(() => msg.remove(), 2000);
}

// ═══════════════════════════════════════════════════════════════
//  CREATE PO
// ═══════════════════════════════════════════════════════════════

async function createPOFromAlert() {
  if (_draftPendingItems && _draftPendingItems.length > 0) {
    const draftNames = _draftPendingItems.map(d => `${d.gradegram}-${d.size} (${d.qty} ม้วน)`).join(', ');
    alert(`⚠️ คุณมีรายการ Draft PO ที่ยังไม่ได้ทำการบันทึก\n\nรายการ: ${draftNames}\n\nกรุณากลับไปกด "บันทึก" หรือ "ยกเลิก" ที่ฟอร์มด้านล่างก่อน`);
    return;
  }

  if (!alertCache || !alertCache.length) {
    alert('ไม่มีข้อมูล Alert');
    return;
  }

  const allItems = [];
  const processedCells = new Set();

  const uniqueDates = [...new Set(alertReceiveDates)].filter(Boolean);
  if (uniqueDates.length === 0) {
    alert('ไม่พบวันที่รับสินค้า');
    return;
  }

  for (let dateIdx = 0; dateIdx < uniqueDates.length; dateIdx++) {
    const dateKey = uniqueDates[dateIdx];

    if (!_dbAlertInputs[dateKey]) {
      const dbInputs = await fetchAlertInputsFromDB(dateKey);
      _dbAlertInputs[dateKey] = {};
      dbInputs.forEach(row => {
        const key = `${row.gradegram}|${row.size}`;
        if (!_dbAlertInputs[dateKey][key]) _dbAlertInputs[dateKey][key] = [];
        _dbAlertInputs[dateKey][key].push({
          qty: row.qty,
          sup: row.sup,
          customer_roll: row.customer_roll,
          quality_b: row.quality_b,
          note: row.note,
          res_id: row.res_id || ''
        });
      });
    }

    // V.18.6 FIX: วนจากชุดข้อมูลเต็ม ไม่ใช่ชุดที่ถูกฟิลเตอร์ (กันรายการนอกฟิลเตอร์หายจาก PO)
    for (const r of (window._alertFullCache && window._alertFullCache.length ? window._alertFullCache : alertCache)) {
      const cellKey = `${r.gradegram}|${Number(r.size)}|${dateKey}`;

      if (processedCells.has(cellKey)) continue;
      processedCells.add(cellKey);

      const items = getAlertItems(r.gradegram, r.size, dateKey);
      if (!items.length) continue;

      for (const it of items) {
        if (!it.qty || Number(it.qty) <= 0) continue;

        allItems.push({
          seq: allItems.length + 1,
          receive_date: dateKey,
          receive_date_idx: dateIdx,
          gradegram: r.gradegram,
          size: Number(r.size),
          gradegram_size: `${r.gradegram}-${Number(r.size).toFixed(2)}`,
          quantity: Number(it.qty),
          sup: it.sup || '',
          customer_roll: it.customer_roll || 'normal',
          quality_b: it.quality_b || 'normal',
          note: it.note || '',
          // 🔥 V.16.0: ส่ง reservation_id ต่อไปยังหน้า PO
          reservation_id: it.reservation_id || it.res_id || null
        });
      }
    }
  }

  if (!allItems.length) {
    alert('กรุณากรอกจำนวนสั่งซื้ออย่างน้อย 1 รายการ');
    return;
  }

  _pendingPOItems = allItems;
  renderAlertPODetail(allItems);
  openModal('modalAlertPODetail');
}

function renderAlertPODetail(items) {
  const labelCustomer = v => ALERT_CUSTOMER_ROLLS.find(c => c.value === v)?.label || 'ปกติ';
  const labelQuality  = v => ALERT_QUALITY_B.find(q => q.value === v)?.label || 'ปกติ';

  const fmtDate = (d) => {
    const dObj = new Date(d);
    const dd = String(dObj.getDate()).padStart(2, '0');
    const mm = String(dObj.getMonth() + 1).padStart(2, '0');
    const yyyy = dObj.getFullYear() + 543;
    return `${dd}/${mm}/${yyyy}`;
  };

  const byDate = {};
  items.forEach(it => {
    const d = it.receive_date || 'unknown';
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(it);
  });

  let totalQty = 0;
  let html = `
    <div class="po-detail-summary">
      <div>📦 <b>${items.length}</b> รายการ</div>
      <div>🔢 รวม <b>${items.reduce((s, i) => s + i.quantity, 0)}</b> ม้วน</div>
      <div>📅 <b>${Object.keys(byDate).length}</b> วันรับสินค้า</div>
    </div>`;

  Object.keys(byDate).sort().forEach(dateKey => {
    const dayItems = byDate[dateKey];
    const dayTotal = dayItems.reduce((s, i) => s + i.quantity, 0);

    const supSummary = {};
    dayItems.forEach(it => {
      const sup = it.sup || '(ไม่ระบุ)';
      supSummary[sup] = (supSummary[sup] || 0) + Number(it.quantity || 0);
    });
    const supList = Object.keys(supSummary).sort()
      .map(sup => `${esc(sup)} ${supSummary[sup]} ม้วน`)
      .join(' · ');

    html += `
      <div class="po-detail-date-section">
        <div class="po-detail-date-head">📅 วันที่รับ: <b>${fmtDate(dateKey)}</b> · ${dayItems.length} รายการ · รวม ${dayTotal} ม้วน · ${supList}</div>
        <table>
          <thead><tr>
            <th style="width:50px">#</th>
            <th style="width:180px">Gradegram-Size</th>
            <th style="width:90px;text-align:center">Quantity</th>
            <th>หมายเหตุ</th>
          </tr></thead>
          <tbody>`;

    dayItems.forEach((it, idx) => {
      totalQty += it.quantity;

      const parts = [];
      if (it.customer_roll && it.customer_roll !== 'normal') {
        parts.push(labelCustomer(it.customer_roll));
      }
      if (it.quality_b && it.quality_b !== 'normal') {
        parts.push(labelQuality(it.quality_b));
      }
      if (it.note && it.note.trim() !== '') {
        parts.push(it.note);
      }
      const remarkCombined = parts.join(',');

      html += `<tr>
        <td style="text-align:center">${idx + 1}</td>
        <td><b>${esc(it.gradegram_size)}</b></td>
        <td style="text-align:center;font-weight:700;color:#1e40af">${it.quantity}</td>
        <td>${esc(remarkCombined)}</td>
      </tr>`;
    });

    html += `</tbody>
      <tfoot><tr style="background:#cbd5e1;font-weight:700">
        <td colspan="2" style="text-align:right">รวมวันนี้ (ม้วน)</td>
        <td style="text-align:center;color:#dc2626;font-size:15px">${dayTotal}</td>
        <td></td>
      </tr></tfoot>
      </table>
      </div>`;
  });

  html += `<div class="po-detail-grand-total">
    <b>รวมทั้งหมด: ${totalQty} ม้วน</b>
  </div>`;

  $('alertPODetailBody').innerHTML = html;
}

// ═══════════════════════════════════════════════════════════════
//  CONFIRM CREATE PO (V.15.0 — ไม่ UPDATE roll_reservations)
// ═══════════════════════════════════════════════════════════════

async function confirmCreatePO() {
  if (!_pendingPOItems || !_pendingPOItems.length) return;

  const confirmBtn = document.querySelector('#modalAlertPODetail .form-actions .primary');
  if (confirmBtn && confirmBtn.disabled) return;
  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.textContent = '⏳ กำลังสร้าง PO...';
  }

  const missingSup = _pendingPOItems.filter(it => !it.sup || String(it.sup).trim() === '');
  if (missingSup.length > 0) {
    alert(`⚠️ ไม่สามารถสร้าง PO ได้\n\nมี ${missingSup.length} รายการที่ยังไม่ได้ระบุผู้ขาย (Sup.)\nกรุณาตรวจสอบและเลือก Sup. ให้ครบก่อน`);
    if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = '✅ ยืนยันสร้าง PO'; }
    return;
  }

  try {
    const analyzedDate = getISODateFromInput('alertDate') || toISODate(new Date());
    const uniqueDates = [...new Set(alertReceiveDates)].filter(Boolean);

    sessionStorage.setItem('alert_to_po', JSON.stringify({
      items: _pendingPOItems,
      analyzed_date: analyzedDate,
      receive_dates: uniqueDates,
      ref_snapshot: $('alertSnapshotMonth')?.value,
      ref_stock: getISODateFromInput('alertStockDate'),
      ref_receive: getISODateFromInput('alertReceiveDate')
    }));

    markAlertPOCreated(`ref_${Date.now()}`);

    saveAlertSnapshot(uniqueDates).then(res => {
      if (res.ok) console.log('✅ Alert snapshot saved:', res.data);
    });

    setTimeout(() => {
      closeModal('modalAlertPODetail');
      _pendingPOItems = [];

      const poBtn = document.querySelector('.nav button[data-tab="purchase-order"]');
      if (poBtn) poBtn.click();
      else alert('ยังไม่ได้เพิ่ม Tab Purchase Order');

      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.textContent = '✅ ยืนยันสร้าง PO';
      }
    }, 300);

  } catch (err) {
    console.error('Create PO Error:', err);
    alert(`⚠️ ไม่สามารถสร้าง PO ได้\n\n${err.message}\n\nกรุณาตรวจสอบและลองใหม่อีกครั้ง`);
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.textContent = '✅ ยืนยันสร้าง PO';
    }
  }
}

// ═══════════════════════════════════════════════════════════════
//  DETAIL MODAL
// ═══════════════════════════════════════════════════════════════

async function openAlertDetail(gradegram, size) {
  const snapshotMonth = $('alertSnapshotMonth')?.value;
  const stockDate     = getISODateFromInput('alertStockDate');
  const receiveDate   = getISODateFromInput('alertReceiveDate');
  const { grade } = parseGradegram(gradegram);

  $('alertDetailTitle').innerHTML = `📊 ${esc(gradegram)} · Size ${size}`;
  openModal('modalAlertDetail');
  $('alertDetailBody').innerHTML = '<p style="text-align:center;color:#94a3b8;padding:20px">กำลังโหลด...</p>';

  try {
    const { data } = await supabase.rpc('get_alert_matrix', {
      p_snapshot_month: snapshotMonth,
      p_stock_date:     stockDate,
      p_receive_date:   receiveDate,
    });

    const row = (data || []).find(r =>
      normalizeGrade(r.grade) === normalizeGrade(grade) && r.size === size
    );

    if (!row) {
      $('alertDetailBody').innerHTML = '<div class="msg err">ไม่พบข้อมูล</div>';
      return;
    }

    const a = Number(row.alert) || 0;
    let statusHtml;
    if (a < 0)      statusHtml = `<span style="color:#dc2626;font-weight:700">🔴 ขาด ${Math.ceil(Math.abs(a))} ม้วน (${a})</span>`;
    else if (a === 0) statusHtml = `<span style="color:#b45309;font-weight:700">🟡 พอดี</span>`;
    else             statusHtml = `<span style="color:#166534;font-weight:700">🟢 เกิน ${Math.floor(a)} ม้วน (+${a})</span>`;

    let html = `
      <div class="msg info" style="margin-bottom:14px">
        <b>📊 สรุปการคำนวณ</b><br>
        Stock Level (${snapshotMonth}) = <b>${row.snapshot}</b><br>
        Stock (${stockDate}) = <b>${row.stock}</b><br>
        Receive (${receiveDate}) = <b>${row.receive}</b><br>
        <hr style="margin:8px 0;border:none;border-top:1px solid #cbd5e1">
        Alert = (${row.stock} + ${row.receive}) − ${row.snapshot} = <b>${a}</b><br>
        สถานะ: ${statusHtml}
      </div>
    `;

    const { data: receives } = await supabase
      .from('po_receive')
      .select('po_no, supplier, quantity, kg_total, remark')
      .eq('po_date', receiveDate)
      .eq('size', size);

    html += `<h4>📥 Receive (${receiveDate})</h4>`;
    if (receives && receives.length) {
      html += '<table><thead><tr><th>PO No.</th><th>Supplier</th><th>Qty</th><th>KG</th><th>หมายเหตุ</th></tr></thead><tbody>';
      receives.forEach(r => {
        html += `<tr>
          <td>${esc(r.po_no)}</td>
          <td>${esc(r.supplier) || '-'}</td>
          <td style="text-align:right">${r.quantity}</td>
          <td style="text-align:right">${Number(r.kg_total || 0).toFixed(2)}</td>
          <td>${esc(r.remark) || '-'}</td>
        </tr>`;
      });
      html += '</tbody></table>';
    } else {
      html += '<p style="color:#94a3b8">ไม่มีรายการรับเข้า</p>';
    }

    const { data: stocks } = await supabase
      .from('stock_balance')
      .select('sn, dimeter, kgs, supplier, customer, is_customer_roll, roll_status')
      .eq('stock_date', stockDate)
      .eq('grade', grade)
      .eq('width', size);

    html += `<h4 style="margin-top:16px">📦 Stock (${stockDate})</h4>`;
    if (stocks && stocks.length) {
      html += '<table><thead><tr><th>SN</th><th>Diameter</th><th>KG</th><th>Supplier</th><th>Customer</th><th>Status</th></tr></thead><tbody>';
      stocks.forEach(s => {
        const stTxt = { full: '✅ เต็ม', scrap: '♻️ เศษ', waiting: '⏳ รอกรอ' }[s.roll_status] || s.roll_status;
        html += `<tr>
          <td>${esc(s.sn)}</td>
          <td>${Number(s.dimeter || 0).toFixed(2)}</td>
          <td>${Number(s.kgs || 0).toFixed(2)}</td>
          <td>${esc(s.supplier) || '-'}</td>
          <td>${s.is_customer_roll ? '👤 ' + esc(s.customer) : '-'}</td>
          <td>${stTxt}</td>
        </tr>`;
      });
      html += '</tbody></table>';
    } else {
      html += '<p style="color:#94a3b8">ไม่มีม้วนในสต็อก</p>';
    }

    $('alertDetailBody').innerHTML = html;
  } catch (err) {
    $('alertDetailBody').innerHTML = `<div class="msg err">${esc(err.message)}</div>`;
  }
}

// ═══════════════════════════════════════════════════════════════
//  USAGE PLAN
// ═══════════════════════════════════════════════════════════════

async function loadUsagePlanRanges() {
  try {
    const { data, error } = await supabase.rpc('get_all_usage_plan_ranges');
    if (error) throw error;
    alertUsageRanges = data || [];
  } catch (e) {
    console.warn('loadUsagePlanRanges:', e);
    alertUsageRanges = [];
  }
}

async function onUsagePlanRangeChange(value) {
  if (!value || value === '__NONE__') {
    alertUsageSelected = null;
  } else {
    const [from, to] = value.split('|');
    alertUsageSelected = { date_from: from, date_to: to };
  }
  await renderAlert();
}

function renderUsageRangeDropdown() {
  const sel = $('alertUsageRange');
  if (!sel) return;

  if (!alertUsageRanges.length) {
    sel.innerHTML = '<option value="__NONE__">— ยังไม่มีข้อมูล —</option>';
    return;
  }

  let html = '<option value="__NONE__">— ไม่ใช้ —</option>';
  alertUsageRanges.forEach(r => {
    const fromThai = fmtDateThai(r.date_from);
    const toThai   = fmtDateThai(r.date_to);
    const selected = alertUsageSelected &&
                     alertUsageSelected.date_from === r.date_from &&
                     alertUsageSelected.date_to   === r.date_to;
    html += `<option value="${r.date_from}|${r.date_to}" ${selected ? 'selected' : ''}>
      ${fromThai} - ${toThai}
    </option>`;
  });
  sel.innerHTML = html;
}

// ─── Usage Plan Import ──────────────────────────────────────────

let _usagePlanRows = [];
let _usagePlanDateCols = [];

function parseExcelDateKey(key) {
  const m = String(key).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (!m) return null;
  const dd = m[1].padStart(2, '0');
  const mm = m[2].padStart(2, '0');
  const yyShort = Number(m[3]);
  const yearCE = 2000 + yyShort;
  const yearBE = yearCE + 543;
  return {
    iso:  `${yearCE}-${mm}-${dd}`,
    thai: `${dd}/${mm}/${yearBE}`
  };
}

function openUsagePlanImport() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.xlsx,.xls';
  input.onchange = e => handleUsagePlanFile(e.target.files[0]);
  input.click();
}

async function handleUsagePlanFile(file) {
  if (!file) return;
  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    if (!rows.length) {
      alert('ไฟล์ไม่มีข้อมูล');
      return;
    }

    const firstRow = rows[0];
    const dateCols = [];
    Object.keys(firstRow).forEach(k => {
      const parsed = parseExcelDateKey(k);
      if (parsed) dateCols.push({ key: k, ...parsed });
    });

    if (!dateCols.length) {
      alert('ไม่พบคอลัมน์วันที่ในไฟล์ (รูปแบบ DD/MM/YY)');
      return;
    }

    _usagePlanRows = rows;
    _usagePlanDateCols = dateCols.sort((a, b) => a.iso.localeCompare(b.iso));

    renderUsagePlanImportModal();
    openModal('modalUsagePlanImport');
  } catch (e) {
    console.error('handleUsagePlanFile:', e);
    alert('อ่านไฟล์ไม่สำเร็จ: ' + e.message);
  }
}

function renderUsagePlanImportModal() {
  const body = $('usagePlanImportBody');
  if (!body) return;

  const minDate = _usagePlanDateCols[0].iso;
  const maxDate = _usagePlanDateCols[_usagePlanDateCols.length - 1].iso;

  let html = `
    <div class="msg info" style="margin-bottom:12px">
      📊 พบ <b>${_usagePlanRows.length}</b> แถว · <b>${_usagePlanDateCols.length}</b> คอลัมน์วันที่<br>
      ช่วง: <b>${_usagePlanDateCols[0].thai}</b> ถึง <b>${_usagePlanDateCols[_usagePlanDateCols.length - 1].thai}</b>
    </div>

    <div class="form-grid" style="grid-template-columns:1fr 1fr;gap:12px">
      <label>📅 จากวันที่ (ค.ศ.)
        <input type="date" id="usagePlanFrom" value="${minDate}" min="${minDate}" max="${maxDate}">
      </label>
      <label>📅 ถึงวันที่ (ค.ศ.)
        <input type="date" id="usagePlanTo" value="${maxDate}" min="${minDate}" max="${maxDate}">
      </label>
    </div>

    <div class="hint" style="margin-top:12px">
      💡 ระบบจะรวมค่าทุกคอลัมน์ที่อยู่ในช่วงวันที่ที่เลือก
    </div>
  `;

  body.innerHTML = html;
}

async function confirmUsagePlanImport() {
  const from = $('usagePlanFrom')?.value;
  const to   = $('usagePlanTo')?.value;

  if (!from || !to) { alert('กรุณาเลือกช่วงวันที่'); return; }
  if (from > to) { alert('วันที่ "จาก" ต้องไม่เกิน "ถึง"'); return; }

  const activeCols = _usagePlanDateCols.filter(c => c.iso >= from && c.iso <= to);
  if (!activeCols.length) { alert('ไม่มีคอลัมน์วันที่อยู่ในช่วงที่เลือก'); return; }

  const result = [];
  const skipped = [];

  _usagePlanRows.forEach(row => {
    const gradegram = String(row['GRADE'] || '').trim().toUpperCase();
    const size = Number(row['SIZE']);
    if (!gradegram || !size) return;

    const targetNorm = normalizeGrade(gradegram);
    const targetRaw  = String(gradegram).toUpperCase();

    const spec = masterCache.find(m => {
      const mGrade = normalizeGrade(m.grade);
      const mGram  = String(m.gram);
      const mFull  = mGrade + mGram;
      return (mFull === targetNorm || mFull === targetRaw) && Number(m.size) === size;
    });

    if (!spec) { skipped.push(`${gradegram}/${size}`); return; }

    const stdWeight = Number(spec.std_weight_kg) || 0;
    if (stdWeight <= 0) { skipped.push(`${gradegram}/${size} (no std)`); return; }

    let totalKg = 0;
    activeCols.forEach(col => { totalKg += Number(row[col.key]) || 0; });

    if (totalKg <= 0) return;

    const rolls = Number((totalKg / stdWeight).toFixed(4));

    result.push({
      gradegram,
      size,
      usage_rolls: rolls,
      usage_kg: Number(totalKg.toFixed(2))
    });
  });

  if (!result.length) { alert('ไม่มีข้อมูลที่สามารถ import ได้'); return; }

  const btn = $('usagePlanImportConfirmBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'กำลังบันทึก...'; }

  try {
    const { data, error } = await supabase.rpc('import_usage_plan', {
      p_date_from: from,
      p_date_to: to,
      p_rows: result,
      p_user_id: currentUser?.id
    });
    if (error) throw error;

    if (!data?.success) throw new Error(data?.error || 'บันทึกไม่สำเร็จ');

    closeModal('modalUsagePlanImport');

    if (typeof showToast === 'function') {
      showToast(
        `✅ Import สำเร็จ ${data.inserted} รายการ` + (skipped.length ? ` · ข้าม ${skipped.length}` : ''),
        'ok', 4000
      );
    }

    await loadUsagePlanRanges();
    renderUsageRangeDropdown();
    await renderAlert();
  } catch (e) {
    alert('❌ ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '💾 บันทึก'; }
  }
}

async function clearUsagePlan() {
  const from = prompt('📅 ลบ Usage Plan จากวันที่ (YYYY-MM-DD):');
  if (!from) return;
  const to = prompt('📅 ถึงวันที่ (YYYY-MM-DD):', from);
  if (!to) return;

  if (!confirm(`⚠️ ลบ Usage Plan ช่วง ${from} ถึง ${to}?`)) return;

  try {
    const { data, error } = await supabase.rpc('clear_usage_plan', {
      p_date_from: from, p_date_to: to
    });
    if (error) throw error;

    if (typeof showToast === 'function') {
      showToast(`✅ ลบ ${data?.deleted || 0} รายการ`, 'ok', 3000);
    }

    alertUsageSelected = null;
    await loadUsagePlanRanges();
    renderUsageRangeDropdown();
    await renderAlert();
  } catch (e) {
    alert('❌ ' + e.message);
  }
}

// ═══════════════════════════════════════════════════════════════
//  ALERT HISTORY
// ═══════════════════════════════════════════════════════════════

function showAlertHistoryCard() {
  const card = $('alertHistoryCard');
  if (card) card.style.display = '';

  const dateEl = $('alertHistoryDate');
  if (dateEl && !dateEl.value) {
    const today = toISODate(new Date());
    dateEl.value = today;

    if (window.flatpickrInstances && window.flatpickrInstances['alertHistoryDate']) {
      window.flatpickrInstances['alertHistoryDate'].setDate(today, false);
    }
  }
}

function setAlertHistoryMode(mode) {
  if (mode !== 'matrix' && mode !== 'flat') return;
  alertHistoryMode = mode;
  document.querySelectorAll('#alertHistoryToggle button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });
  if (alertHistoryData) renderAlertHistory();
}

async function loadAlertHistory() {
  const date = getISODateFromInput('alertHistoryDate');

  if (!date) {
    alert('กรุณาเลือกวันที่ก่อนกดปุ่ม "ดู"');
    return;
  }

  const body = $('alertHistoryBody');
  if (body) body.innerHTML = '<p style="text-align:center;color:#94a3b8;padding:30px">กำลังโหลด...</p>';

  try {
    const snapshot = await loadAlertSnapshot(date);

    if (!snapshot) {
      body.innerHTML = `<p style="text-align:center;color:#94a3b8;padding:30px">ไม่พบข้อมูลของวันที่ ${fmtDateThai(date)} 🎉<br><small>ลองตรวจสอบว่าวันนี้มีการบันทึก Snapshot ไว้หรือไม่</small></p>`;
      alertHistoryData = null;
      alertHistoryMeta = null;
      return;
    }

    alertHistoryData = (snapshot.result_json || []).map(r => {
      if (r.gradegram) return r;
      const m = masterCache.find(x =>
        normalizeGrade(x.grade) === normalizeGrade(r.grade) &&
        x.size === r.size
      );
      return {
        ...r,
        gradegram: m ? (normalizeGrade(m.grade) + m.gram) : r.grade
      };
    });

    alertHistoryMeta = snapshot;

    if (!alertHistoryData.length) {
      body.innerHTML = '<p style="text-align:center;color:#94a3b8;padding:30px">ไม่มีรายการ</p>';
      return;
    }

    renderAlertHistory();
  } catch (e) {
    console.error('loadAlertHistory:', e);
    body.innerHTML = `<div class="msg err">โหลดไม่สำเร็จ: ${esc(e.message)}</div>`;
  }
}

function renderAlertHistory() {
  const body = $('alertHistoryBody');
  if (!body || !alertHistoryData || !alertHistoryMeta) return;

  const metaHtml = `
    <div class="alert-history-meta">
      <span class="item">📅 วันที่วิเคราะห์: <b>${fmtDateThai(alertHistoryMeta.analyzed_date)}</b></span>
      <span class="item">📊 Stock Level: <b>${alertHistoryMeta.snapshot_month || '-'}</b></span>
      <span class="item">📥 Stock Date: <b>${alertHistoryMeta.stock_date ? fmtDateThai(alertHistoryMeta.stock_date) : '-'}</b></span>
      <span class="item">📦 Receive Date: <b>${alertHistoryMeta.receive_date ? fmtDateThai(alertHistoryMeta.receive_date) : '-'}</b></span>
    </div>
  `;

  if (alertHistoryMode === 'matrix') {
    body.innerHTML = metaHtml + buildHistoryMatrixHtml(alertHistoryData);
  } else {
    body.innerHTML = metaHtml + buildHistoryFlatHtml(alertHistoryData);
  }
}

function buildHistoryMatrixHtml(rows) {
  const grades = [...new Set(rows.map(r => r.gradegram))].sort();
  const sizes  = [...new Set(rows.map(r => Number(r.size)))].sort((a, b) => a - b);
  const dataMap = {};
  rows.forEach(r => { dataMap[`${r.gradegram}|${r.size}`] = r; });

  let html = '<table class="alert-matrix-new-table"><thead><tr>';
  html += '<th class="grade-col-matrix">GRADEGRAMS</th>';
  sizes.forEach(s => { html += `<th>${s}</th>`; });
  html += '<th class="total-col-matrix">TOTAL</th></tr></thead><tbody>';

  grades.forEach(grade => {
    html += '<tr>';
    html += `<td class="grade-col-matrix">${esc(grade)}</td>`;
    let rowTotal = 0;
    sizes.forEach(size => {
      const r = dataMap[`${grade}|${size}`];
      if (!r) { html += '<td class="empty-cell">-</td>'; return; }
      const a = Number(r.alert) || 0;
      rowTotal += a;
      let cellCls = '';
      if (a < 0)        cellCls = 'matrix-red';
      else if (a === 0) cellCls = 'matrix-yellow';
      else              cellCls = 'matrix-green';

      html += `<td class="matrix-cell ${cellCls} clickable"
                   onclick="openAlertHistoryCell('${esc(grade)}', ${size})">
                 <div class="matrix-value">${a > 0 ? '+' + a : a}</div>
               </td>`;
    });
    html += `<td class="total-col-matrix">${rowTotal > 0 ? '+' + rowTotal.toFixed(2) : rowTotal.toFixed(2)}</td>`;
    html += '</tr>';
  });

  html += '<tr class="total-row-matrix">';
  html += '<td class="grade-col-matrix" style="text-align:right">TOTAL</td>';
  sizes.forEach(size => {
    let colTotal = 0;
    grades.forEach(grade => {
      const r = dataMap[`${grade}|${size}`];
      if (r) colTotal += Number(r.alert) || 0;
    });
    html += `<td>${colTotal > 0 ? '+' + colTotal.toFixed(2) : colTotal.toFixed(2)}</td>`;
  });
  const grandTotal = rows.reduce((s, r) => s + (Number(r.alert) || 0), 0);
  html += `<td class="total-col-matrix">${grandTotal > 0 ? '+' + grandTotal.toFixed(2) : grandTotal.toFixed(2)}</td>`;
  html += '</tr></tbody></table>';
  return html;
}

function buildHistoryFlatHtml(rows) {
  const sorted = [...rows].sort((a, b) => {
    if (a.gradegram !== b.gradegram) return a.gradegram.localeCompare(b.gradegram);
    return a.size - b.size;
  });

  let html = '<table class="alert-flat-table" style="width:100%"><thead><tr>';
  html += '<th>Gradegrams</th><th>Size</th><th>Stock Level</th><th>Stock</th><th>Receive</th>';
  html += '<th>Usage Plan</th><th>Alert</th><th>สถานะ</th><th>FSC</th>';
  html += '</tr></thead><tbody>';

  sorted.forEach(r => {
    const a = Number(r.alert) || 0;
    let rowCls, statusTxt;
    if (a < 0)        { rowCls = 'row-red';    statusTxt = `🔴 ขาด ${Math.ceil(Math.abs(a))}`; }
    else if (a === 0) { rowCls = 'row-yellow'; statusTxt = '🟡 พอดี'; }
    else              { rowCls = 'row-green';  statusTxt = `🟢 เกิน ${Math.floor(a)}`; }

    const isFSC = isFSCGrade(r.gradegram);
    const fscBadge = isFSC ? '🟢 FSC' : '⚪ Non-FSC';

    html += `<tr class="${rowCls}" style="cursor:pointer"
                 onclick="openAlertHistoryCell('${esc(r.gradegram)}', ${r.size})">
      <td class="grade-col">${esc(r.gradegram)}</td>
      <td>${r.size}</td>
      <td>${r.snapshot}</td>
      <td>${Number(r.stock).toFixed(2)}</td>
      <td>${r.receive}</td>
      <td>${r.usage_plan ? Number(r.usage_plan).toFixed(2) : '-'}</td>
      <td class="alert-cell"><b>${a > 0 ? '+' + a : a}</b></td>
      <td class="status-cell">${statusTxt}</td>
      <td>${fscBadge}</td>
    </tr>`;
  });

  html += '</tbody></table>';
  return html;
}

function openAlertHistoryCell(gradegram, size) {
  if (!alertHistoryData || !alertHistoryMeta) return;

  const r = alertHistoryData.find(x =>
    x.gradegram === gradegram && Number(x.size) === Number(size)
  );
  if (!r) { alert('ไม่พบข้อมูล'); return; }

  const a = Number(r.alert) || 0;
  let alertCls, alertTxt, alertIcon;
  if (a < 0)        { alertCls = 'red';    alertIcon = '🔴'; alertTxt = `ขาด ${Math.ceil(Math.abs(a))} ม้วน`; }
  else if (a === 0) { alertCls = 'yellow'; alertIcon = '🟡'; alertTxt = 'พอดี'; }
  else              { alertCls = 'green';  alertIcon = '🟢'; alertTxt = `เกิน ${Math.floor(a)} ม้วน`; }

  const titleEl = $('alertMatrixCellTitle');
  if (titleEl) {
    titleEl.innerHTML = `📜 ${esc(gradegram)}-${size}`;
  }

  const bodyEl = $('alertMatrixCellBody');
  if (!bodyEl) return;

  let html = `
    <div class="matrix-cell-summary">
      <div class="matrix-cell-summary-title">
        📋 ข้อมูลสรุป (จาก Snapshot)
        <span class="alert-status-badge">${alertIcon} ${alertTxt}</span>
      </div>
      <div class="matrix-cell-grid">
        <div class="matrix-cell-row">
          <span class="label">Stock Level:</span>
          <span class="value blue">${r.snapshot}</span>
        </div>
        <div class="matrix-cell-row">
          <span class="label">Stock:</span>
          <span class="value">${Number(r.stock).toFixed(2)}</span>
        </div>
        <div class="matrix-cell-row">
          <span class="label">Receive:</span>
          <span class="value">${r.receive}</span>
        </div>
        <div class="matrix-cell-row">
          <span class="label">Usage Plan:</span>
          <span class="value">${r.usage_plan ? Number(r.usage_plan).toFixed(2) : '-'}</span>
        </div>
      </div>
      <div class="matrix-alert-big ${alertCls}">
        Alert: ${a > 0 ? '+' + a : a} ม้วน
      </div>
    </div>
  `;

  bodyEl.innerHTML = html;
  openModal('modalAlertMatrixCell');
}

// ═══════════════════════════════════════════════════════════════
//  EXPORT
// ═══════════════════════════════════════════════════════════════

function exportAlert() {
  if (!alertCache || !alertCache.length) return alert('ไม่มีข้อมูล');

  const data = alertCache.map(r => {
    const items = getAlertItems(r.gradegram, r.size);
    const firstItem = items.length > 0 ? items[0] : {};
    const totalQty = getAlertQtyTotal(r.gradegram, r.size);

    return {
      Gradegrams: r.gradegram,
      Size: r.size,
      Snapshot: r.snapshot,
      Stock: r.stock,
      Receive: r.receive,
      'Usage Plan': r.usage_plan || 0,
      Alert: r.alert,
      สถานะ: r.alert < 0 ? `ขาด ${Math.ceil(Math.abs(r.alert))}` : (r.alert === 0 ? 'พอดี' : `เกิน ${Math.floor(r.alert)}`),
      'จำนวนรายการ': items.length,
      สั่งซื้อ: totalQty || '',
      Sup: items.map(it => it.sup).filter(Boolean).join(', '),
      'ม้วนลูกค้า': firstItem.customer_roll
        ? (ALERT_CUSTOMER_ROLLS.find(c => c.value === firstItem.customer_roll)?.label || 'ปกติ')
        : 'ปกติ',
      'คุณภาพ B': firstItem.quality_b
        ? (ALERT_QUALITY_B.find(q => q.value === firstItem.quality_b)?.label || 'ปกติ')
        : 'ปกติ',
      FSC: isFSCGrade(r.gradegram) ? 'FSC' : 'Non-FSC',
      หมายเหตุ: items.map(it => it.note).filter(Boolean).join(', ')
    };
  });
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Alert');
  XLSX.writeFile(wb, `alert_${new Date().toISOString().slice(0,10)}.xlsx`);
}

// ═══════════════════════════════════════════════════════════════
//  HELPER: BUILD TABLE HEAD / FOOT
// ═══════════════════════════════════════════════════════════════

function buildAlertTableHead() {
  let html = '';

  html += `<th class="th-with-filter">
    <div class="th-filter-wrap" id="alertGradeFilterBox">
      <button type="button" class="th-filter-btn" id="alertGradeFilterBtn">
        <span id="alertGradeFilterLabel">Gradegrams</span>
        <span class="arrow">▼</span>
      </button>
      <div class="grade-dropdown hidden" id="alertGradeDropdown" style="min-width:220px">
        <div class="grade-actions">
          <button type="button" onclick="selectAllAlertGrades()">✓ เลือกทั้งหมด</button>
          <button type="button" onclick="clearAllAlertGrades()">✗ ล้างทั้งหมด</button>
        </div>
        <div class="grade-list" id="alertGradeList"></div>
      </div>
    </div>
  </th>`;

  html += `<th class="th-with-filter">
    <div class="th-filter-wrap" id="alertSizeFilterBox">
      <button type="button" class="th-filter-btn" id="alertSizeFilterBtn">
        <span id="alertSizeLabel">Size</span>
        <span class="arrow">▼</span>
      </button>
      <div class="grade-dropdown hidden" id="alertSizeDropdown" style="min-width:160px">
        <div class="grade-actions">
          <button type="button" onclick="selectAllAlertSizes()">✓ เลือกทั้งหมด</button>
          <button type="button" onclick="clearAllAlertSizes()">✗ ล้างทั้งหมด</button>
        </div>
        <div class="grade-list" id="alertSizeList"></div>
      </div>
    </div>
  </th>`;

  html += '<th>Stock Level</th>';

  html += `<th class="th-with-filter">
    <div class="th-filter-wrap" id="alertStockFilterBox">
      <button type="button" class="th-filter-btn" id="alertStockFilterBtn">
        <span id="alertStockFilterLabel">Stock</span>
        <span class="arrow">▼</span>
      </button>
      <div class="grade-dropdown hidden" id="alertStockFilterDropdown" style="min-width:180px">
        <div class="grade-actions">
          <button type="button" onclick="selectAllAlertStockFilters()">✓ เลือกทั้งหมด</button>
          <button type="button" onclick="clearAllAlertStockFilters()">✗ ล้างทั้งหมด</button>
        </div>
        <div class="grade-list" id="alertStockFilterList"></div>
      </div>
    </div>
  </th>`;

  html += `<th class="th-with-filter">
    <div class="th-filter-wrap" id="alertReceiveFilterBox">
      <button type="button" class="th-filter-btn" id="alertReceiveFilterBtn">
        <span id="alertReceiveFilterLabel">Receive</span>
        <span class="arrow">▼</span>
      </button>
      <div class="grade-dropdown hidden" id="alertReceiveFilterDropdown" style="min-width:180px">
        <div class="grade-actions">
          <button type="button" onclick="selectAllAlertReceiveFilters()">✓ เลือกทั้งหมด</button>
          <button type="button" onclick="clearAllAlertReceiveFilters()">✗ ล้างทั้งหมด</button>
        </div>
        <div class="grade-list" id="alertReceiveFilterList"></div>
      </div>
    </div>
  </th>`;

  html += `<th class="th-with-filter">
    <div class="th-filter-wrap" id="alertUsageFilterBox">
      <button type="button" class="th-filter-btn" id="alertUsageFilterBtn">
        <span id="alertUsageFilterLabel">Usage Plan</span>
        <span class="arrow">▼</span>
      </button>
      <div class="grade-dropdown hidden" id="alertUsageFilterDropdown" style="min-width:180px">
        <div class="grade-actions">
          <button type="button" onclick="selectAllAlertUsageFilters()">✓ เลือกทั้งหมด</button>
          <button type="button" onclick="clearAllAlertUsageFilters()">✗ ล้างทั้งหมด</button>
        </div>
        <div class="grade-list" id="alertUsageFilterList"></div>
      </div>
    </div>
  </th>`;

  html += `<th class="th-with-filter">
    <div class="th-filter-wrap" id="alertFilterBox">
      <button type="button" class="th-filter-btn" id="alertFilterBtn">
        <span id="alertFilterLabel">Alert</span>
        <span class="arrow">▼</span>
      </button>
      <div class="grade-dropdown hidden" id="alertFilterDropdown" style="min-width:200px">
        <div class="grade-actions">
          <button type="button" onclick="selectAllAlertFilters()">✓ เลือกทั้งหมด</button>
          <button type="button" onclick="clearAllAlertFilters()">✗ ล้างทั้งหมด</button>
        </div>
        <div class="grade-list" id="alertFilterList"></div>
      </div>
    </div>
  </th>`;

  html += '<th>สถานะ</th>';

  html += `<th class="th-with-filter">
    <div class="th-filter-wrap" id="alertOrderFilterBox">
      <button type="button" class="th-filter-btn" id="alertOrderFilterBtn">
        <span id="alertOrderFilterLabel">สั่งซื้อ</span>
        <span class="arrow">▼</span>
      </button>
      <div class="grade-dropdown hidden" id="alertOrderFilterDropdown" style="min-width:180px">
        <div class="grade-actions">
          <button type="button" onclick="selectAllAlertOrderFilters()">✓ เลือกทั้งหมด</button>
          <button type="button" onclick="clearAllAlertOrderFilters()">✗ ล้างทั้งหมด</button>
        </div>
        <div class="grade-list" id="alertOrderFilterList"></div>
      </div>
    </div>
  </th>`;

  html += `<th class="th-with-filter">
    <div class="th-filter-wrap" id="alertSupFilterBox">
      <button type="button" class="th-filter-btn" id="alertSupFilterBtn">
        <span id="alertSupFilterLabel">Sup.</span>
        <span class="arrow">▼</span>
      </button>
      <div class="grade-dropdown hidden" id="alertSupFilterDropdown" style="min-width:180px">
        <div class="grade-actions">
          <button type="button" onclick="selectAllAlertSupFilters()">✓ เลือกทั้งหมด</button>
          <button type="button" onclick="clearAllAlertSupFilters()">✗ ล้างทั้งหมด</button>
        </div>
        <div class="grade-list" id="alertSupFilterList"></div>
      </div>
    </div>
  </th>`;

  html += '<th>ม้วนลูกค้า</th><th>คุณภาพ B</th><th>FSC</th><th>หมายเหตุ</th>';

  return html;
}

function buildAlertFoot() {
  const footCache = window._alertFullCache || alertCache || [];
  const footShortage = footCache.filter(r => Number(r.alert) < 0).length;
  const footOK       = footCache.filter(r => Number(r.alert) === 0).length;
  const footOver     = footCache.filter(r => Number(r.alert) > 0).length;

  return `<div class="report-foot" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
    <div class="alert-foot-summary">
      <span class="item red">🔴 ${footShortage}</span>
      <span class="item yellow">🟡 ${footOK}</span>
      <span class="item green">🟢 ${footOver}</span>
    </div>
    <div style="display:flex;gap:6px">
      <button class="primary" onclick="createPOFromAlert()">📄 สร้าง PO</button>
      <button class="danger" onclick="clearAlertInputs()">🗑 ล้างค่า</button>
    </div>
  </div>`;
}

function renderAllAlertFilters() {
  renderAlertGradeList();
  renderAlertSizeList();
  renderAlertFilterList();
  renderAlertOrderFilterList();
  renderAlertSupFilterList();
  renderAlertStockFilterList();
  renderAlertReceiveFilterList();
  renderAlertUsageFilterList();

  updateAlertGradeLabel();
  updateAlertSizeLabel();
  updateAlertFilterLabel();
  updateAlertOrderFilterLabel();
  updateAlertSupFilterLabel();
  updateAlertStockFilterLabel();
  updateAlertReceiveFilterLabel();
  updateAlertUsageFilterLabel();

  _attachAlertDropdown('alertGradeFilterBtn', 'alertGradeDropdown', 'alertGradeFilterBox', 'alertGrade');
  _attachAlertDropdown('alertSizeFilterBtn', 'alertSizeDropdown', 'alertSizeFilterBox', 'alertSize');
  _attachAlertDropdown('alertFilterBtn', 'alertFilterDropdown', 'alertFilterBox', 'alertFilter');
  _attachAlertDropdown('alertOrderFilterBtn', 'alertOrderFilterDropdown', 'alertOrderFilterBox', 'alertOrderFilter');
  _attachAlertDropdown('alertSupFilterBtn', 'alertSupFilterDropdown', 'alertSupFilterBox', 'alertSupFilter');
  _attachAlertDropdown('alertStockFilterBtn', 'alertStockFilterDropdown', 'alertStockFilterBox', 'alertStockFilter');
  _attachAlertDropdown('alertReceiveFilterBtn', 'alertReceiveFilterDropdown', 'alertReceiveFilterBox', 'alertReceiveFilter');
  _attachAlertDropdown('alertUsageFilterBtn', 'alertUsageFilterDropdown', 'alertUsageFilterBox', 'alertUsageFilter');
}

// ═══════════════════════════════════════════════════════════════
//  RESERVATIONS (ยอดจองม้วน)
// ═══════════════════════════════════════════════════════════════

// ───────────────────────────────────────────────────────────────
//  _getUsedReservationQtyMap — V.18.2
//  รวมยอด qty ที่ถูกใช้ใน alert_active_inputs (ทุกวัน) แยกตาม res_id
//  • วันที่โหลดอยู่ใน memory → ใช้ memory (ใหม่กว่า DB)
//  • วันที่ไม่ได้อยู่ใน memory → ใช้ข้อมูลจาก DB
//  • Draft ที่ยังไม่ได้บันทึกลง alert_active_inputs → บวกเพิ่ม (กันนับซ้ำ)
// ───────────────────────────────────────────────────────────────
async function _getUsedReservationQtyMap() {
  const usedMap = {};
  const add = (resId, qty) => {
    const q = Number(qty) || 0;
    if (!resId || q <= 0) return;
    const k = String(resId);
    usedMap[k] = (usedMap[k] || 0) + q;
  };

  const memDates = new Set(Object.keys(_dbAlertInputs || {}));
  const memResIds = new Set();

  // 1. จาก memory (ทุกวันที่โหลดไว้แล้ว)
  Object.values(_dbAlertInputs || {}).forEach(dayData => {
    Object.values(dayData || {}).forEach(items => {
      (items || []).forEach(it => {
        if (it.res_id && Number(it.qty) > 0) {
          add(it.res_id, it.qty);
          memResIds.add(String(it.res_id));
        }
      });
    });
  });

  // 2. จาก DB เฉพาะวันที่ยังไม่อยู่ใน memory
  try {
    const data = await _alertFetchAll(() => supabase
      .from('alert_active_inputs')
      .select('res_id, qty, receive_date')
      .not('res_id', 'is', null));

    (data || []).forEach(row => {
      if (memDates.has(row.receive_date)) return; // memory เป็นตัวแทนวันนั้นแล้ว
      add(row.res_id, row.qty);
    });
  } catch (e) {
    console.warn('_getUsedReservationQtyMap DB:', e);
  }

  // 3. Draft ที่ยังค้างอยู่ใน memory และยังไม่ถูกบันทึกลงช่องกรอก
  if (typeof _draftPendingItems !== 'undefined' && _draftPendingItems.length > 0) {
    _draftPendingItems.forEach(d => {
      if (!d.resId) return;
      if (memResIds.has(String(d.resId))) return; // บันทึกแล้ว → นับไปแล้ว
      add(d.resId, d.qty);
    });
  }

  return usedMap;
}

// ดึงข้อมูลทุกแถว (Supabase จำกัด 1,000 แถว/ครั้ง) — เรียงตาม id เพื่อให้แบ่งหน้าไม่ตกหล่น
async function _alertFetchAll(build) {
  const pageSize = 1000;
  const run = async (withOrder) => {
    const all = [];
    for (let from = 0; ; from += pageSize) {
      let q = build();
      if (withOrder) q = q.order('id');
      const { data, error } = await q.range(from, from + pageSize - 1);
      if (error) throw error;
      if (!data || !data.length) break;
      all.push(...data);
      if (data.length < pageSize) break;
    }
    return all;
  };
  try { return await run(true); } catch (e) { return await run(false); }
}

async function loadAlertReservations() {
  try {
    // 1. ดึงข้อมูลการจอง "ทุกสถานะ" (ให้ตรงกับหน้า Reservations ที่ไม่กรอง status)
    //    เพื่อให้แถวปรับลดหาแถวต้นทางเจอเสมอ แม้ต้นทางจะเปลี่ยนสถานะไปแล้ว
    const resData = await _alertFetchAll(() => supabase
      .from('roll_reservations')
      .select('*'));

    // 2. ดึง Audit Log (complete) เท่านั้น
    //    หมายเหตุ: การปรับลด (decrease) ถูกเก็บเป็น "แถวจองจำนวนติดลบ" ใน roll_reservations
    //    ซึ่งจัดการในขั้นที่ 4.5 แล้ว จึงไม่ต้องหักจาก Log ซ้ำ
    const logData = await _alertFetchAll(() => supabase
      .from('roll_reservation_logs')
      .select('*')
      .eq('action_type', 'complete'));

    // 3. จัดกลุ่มข้อมูลตาม grade|size
    const resMap = {};
    (resData || []).forEach(r => {
      const key = `${r.grade}|${r.size}`;
      if (!resMap[key]) resMap[key] = [];
      resMap[key].push({ ...r });
    });

    // 4. หักลบยอดจาก Log (complete)
    if (logData && logData.length > 0) {
      logData.forEach(log => {
        const parent = (resData || []).find(r => r.id === log.reservation_id);
        if (parent) {
          const key = `${parent.grade}|${parent.size}`;
          if (resMap[key]) {
            const target = resMap[key].find(r => r.id === parent.id);
            if (target) {
              target.quantity = (Number(target.quantity) || 0) + (Number(log.qty_change) || 0);
            }
          }
        }
      });
    }

    // 4.5 🔥 หักแถวปรับลด (quantity ติดลบ) ออกจากแถวจองที่เป็นบวก
    //      ลำดับ: parent_reservation_id → กลุ่มเดียวกัน (supplier|quality|customer_mark) → แถวบวกอื่นใน grade|size
    //      ใช้แถวเก่าสุดก่อน (FIFO) แล้วลบแถวติดลบออกจากรายการแสดงผล
    Object.keys(resMap).forEach(key => {
      const rows = resMap[key];
      const negatives = rows.filter(r => Number(r.quantity) < 0);
      if (!negatives.length) return;

      const byAge = (a, b) =>
        String(a.reservation_date || a.created_at || '').localeCompare(String(b.reservation_date || b.created_at || ''));
      const positives = rows.filter(r => Number(r.quantity) > 0).sort(byAge);
      const rowById = {};
      rows.forEach(r => { rowById[String(r.id)] = r; });
      const groupOf = r => `${r.supplier || '-'}|${r.quality || 'A'}|${r.customer_mark || '-'}`;

      const applyTo = (neg, candidates) => {
        let remain = Math.abs(Number(neg.quantity) || 0);
        for (const p of candidates) {
          if (remain <= 0) break;
          const have = Number(p.quantity) || 0;
          if (have <= 0) continue;
          const take = Math.min(have, remain);
          p.quantity = have - take;
          remain -= take;
        }
        neg.quantity = -remain; // ส่วนที่หักไม่หมด (ถ้ามี)
      };

      negatives.forEach(neg => {
        // มีแถวต้นทาง (parent_reservation_id) → หักจากต้นทางเท่านั้น ส่วนเกินทิ้ง ไม่ไปหักแถวอื่น
        const parent = neg.parent_reservation_id ? rowById[String(neg.parent_reservation_id)] : null;
        if (parent) {
          applyTo(neg, [parent]);
          return;
        }
        // ไม่มีต้นทาง (ข้อมูลเก่า) → กลุ่มเดียวกันก่อน แล้วค่อยแถวบวกอื่น (เก่าสุดก่อน)
        applyTo(neg, positives.filter(p => groupOf(p) === groupOf(neg)));
        if (Number(neg.quantity) < 0) applyTo(neg, positives);
      });

      // ตัดแถวติดลบออก (ผลของมันถูกหักเข้าแถวบวกแล้ว)
      resMap[key] = rows.filter(r => Number(r.quantity) > 0);
    });

    // 5. 🔥 หักยอดที่ถูกใช้ใน alert_active_inputs ของทุกวัน (+ Draft ที่ค้างอยู่)
    const usedMap = await _getUsedReservationQtyMap();

    Object.keys(resMap).forEach(key => {
      const mapped = resMap[key].map(r => {
        const used = usedMap[String(r.id)] || 0;
        const netQty = Math.max(0, (Number(r.quantity) || 0) - used);
        return {
          ...r,
          _used_qty: used,
          _net_qty: netQty
        };
      });
      resMap[key] = mapped.filter(r => r._net_qty > 0); // ซ่อนรายการที่ใช้หมดแล้ว
      resMap[key]._hidden = mapped.filter(r => r._net_qty <= 0 && (Number(r.quantity) || 0) > 0); // เก็บไว้แจ้งผู้ใช้ว่าทำไมไม่แสดง
    });

    return resMap;
  } catch (err) {
    console.error('loadAlertReservations error:', err);
    return {};
  }
}

function getAlertReservedTotal(resMap, gradegram, size) {
  if (!resMap) return 0;
  const list = resMap[`${gradegram}|${size}`] || [];
  return list.reduce((sum, r) => sum + (Number(r._net_qty ?? r.quantity) || 0), 0);
}

// ═══════════════════════════════════════════════════════════════
//  buildReservationHtml — V.18.2
//  ✅ แสดงยอดสุทธิ (_net_qty) + ยอดที่ใช้แล้ว (_used_qty)
// ═══════════════════════════════════════════════════════════════

function buildReservationHtml(list) {
  if (!list || !list.length) {
    const hid = (list && list._hidden) || [];
    if (hid.length) {
      const q = hid.reduce((t, r) => t + (Number(r.quantity) || 0), 0);
      return `<p style="color:#64748b;margin:8px 0;text-align:center;">มียอดจอง ${q} ม้วน แต่ถูกนำไปใช้ในใบสั่งซื้อ (วันที่รับอื่น/ฉบับร่าง) หมดแล้ว</p>`;
    }
    return '<p style="color:#94a3b8;margin:8px 0;text-align:center;">ไม่มีรายการจอง</p>';
  }

  const groupedMap = {};

  list.forEach(r => {
    const key = `${r.supplier || '-'}|${r.quality || 'A'}|${r.customer_mark || '-'}`;

    if (!groupedMap[key]) {
      groupedMap[key] = {
        supplier: r.supplier || '-',
        quality: r.quality || 'A',
        customer_mark: r.customer_mark || '-',
        total_qty: 0,
        used_qty: 0,
        items: []
      };
    }

    groupedMap[key].total_qty += (Number(r._net_qty ?? r.quantity) || 0);
    groupedMap[key].used_qty  += (Number(r._used_qty) || 0);
    groupedMap[key].items.push(r);
  });

  const groupedList = Object.values(groupedMap);

  let html = '<div style="display:flex; flex-direction:column; gap:8px; margin-top:8px;">';

  groupedList.forEach((g) => {
    const qualityTxt = g.quality === 'B' ? 'B' : 'A';
    const qualityColor = g.quality === 'B' ? '#dc2626' : '#166534';
    const qualityBg = g.quality === 'B' ? '#fee2e2' : '#dcfce7';

    // 🔥 V.18.2: ใช้ยอดสุทธิที่ loadAlertReservations หักให้แล้ว
    const remainingQty = g.total_qty;

    const usedTag = g.used_qty > 0
      ? `<span style="color:#f59e0b; font-size:11px;">(ใช้แล้ว ${g.used_qty})</span>`
      : '';

    const firstItem = g.items.find(r => (Number(r._net_qty ?? r.quantity) || 0) > 0) || g.items[0];
    const safeId = firstItem.id;

    html += `
      <div style="background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:10px 14px; display:flex; justify-content:space-between; align-items:center; box-shadow:0 1px 2px rgba(0,0,0,0.02);">
        <div style="display:flex; flex-direction:column; gap:4px;">
          <div style="font-size:13px; font-weight:600; color:#1e293b;">
            🏢 ${esc(g.supplier)} ${usedTag}
          </div>
          <div style="font-size:12px; color:#64748b; display:flex; align-items:center; gap:6px;">
            <span>ลูกค้า: ${esc(g.customer_mark)}</span>
            <span style="background:${qualityBg}; color:${qualityColor}; padding:2px 6px; border-radius:4px; font-weight:700; font-size:11px;">คุณภาพ ${qualityTxt}</span>
          </div>
        </div>

        <div style="display:flex; align-items:center; gap:12px;">
          <div style="text-align:right;">
            <div style="font-size:16px; font-weight:700; color:${remainingQty <= 0 ? '#94a3b8' : '#b45309'};">${remainingQty}</div>
            <div style="font-size:10px; color:#94a3b8;">ม้วน</div>
          </div>

          ${remainingQty > 0
            ? `<button type="button"
                      onclick="onReservationCartClick('${safeId}', '${escAttr(firstItem.grade)}', ${Number(firstItem.size) || 0}, ${remainingQty}, '${escAttr(g.supplier)}', '${escAttr(g.quality)}')"
                      style="background:#e0f2fe; color:#0369a1; border:1px solid #bae6fd; padding:6px 12px; border-radius:6px; cursor:pointer; font-weight:700; font-size:12px; display:flex; align-items:center; gap:6px; transition:all 0.2s;"
                      onmouseover="this.style.background='#bae6fd'"
                      onmouseout="this.style.background='#e0f2fe'"
                      title="นำไปสั่งซื้อ">
                🛒 ใส่ตะกร้า
              </button>`
            : `<div style="color:#166534; font-size:12px; font-weight:700; padding:6px 10px; background:#dcfce7; border-radius:6px;">✅ ใช้ครบแล้ว</div>`
          }
        </div>
      </div>
    `;
  });

  html += '</div>';
  return html;
}

function onReservationCartClick(resId, gradegram, size, maxQty, supplier, quality) {
  let modal = document.getElementById('modalCartQty');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modalCartQty';
    modal.className = 'modal-bg';
    modal.innerHTML = `
      <div class="modal" style="max-width:400px; text-align:center; padding:24px;">
        <h3 style="margin-top:0; color:#1e293b;">🛒 ระบุจำนวนที่ต้องการสั่ง</h3>
        <div style="background:#f8fafc; padding:12px; border-radius:8px; margin-bottom:16px; font-size:13px; text-align:left;">
          <div style="margin-bottom:4px;"><b>Gradegram:</b> ${esc(gradegram)} (Size ${size})</div>
          <div style="margin-bottom:4px;"><b>Supplier:</b> ${esc(supplier || '-')}</div>
          <div><b>คุณภาพ:</b> ${quality === 'B' ? 'B (NC)' : 'A'}</div>
        </div>
        
        <label style="display:block; text-align:left; font-size:13px; font-weight:600; color:#475569; margin-bottom:6px;">จำนวนที่ต้องการสั่ง (ม้วน)</label>
        <input type="number" id="cartQtyInput" min="1" step="1" value="${maxQty}" 
               style="width:100%; padding:10px; font-size:18px; font-weight:700; text-align:center; border:2px solid #cbd5e1; border-radius:8px; outline:none; color:#0284c7; margin-bottom:20px;"
               onfocus="this.select()">
        
        <div style="display:flex; gap:10px;">
          <button type="button" onclick="closeModal('modalCartQty')" style="flex:1; padding:10px; border-radius:6px; border:1px solid #cbd5e1; background:#f8fafc; cursor:pointer;">ยกเลิก</button>
          <button type="button" class="primary" id="cartConfirmBtn" onclick="confirmCartQty('${escAttr(resId)}', '${escAttr(gradegram)}', ${size}, '${escAttr(supplier)}', '${escAttr(quality)}')" style="flex:1; padding:10px; border-radius:6px; cursor:pointer;">🛒 ใส่ตะกร้า</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  } else {
    const infoDiv = modal.querySelector('.modal div[style*="background:#f8fafc"]');
    if (infoDiv) {
      infoDiv.innerHTML = `
        <div style="margin-bottom:4px;"><b>Gradegram:</b> ${esc(gradegram)} (Size ${size})</div>
        <div style="margin-bottom:4px;"><b>Supplier:</b> ${esc(supplier || '-')}</div>
        <div><b>คุณภาพ:</b> ${quality === 'B' ? 'B (NC)' : 'A'}</div>
      `;
    }
    const qtyInput = modal.querySelector('#cartQtyInput');
    if (qtyInput) qtyInput.value = maxQty;
    const confirmBtn = modal.querySelector('#cartConfirmBtn');
    if (confirmBtn) {
      confirmBtn.setAttribute('onclick', `confirmCartQty('${escAttr(resId)}', '${escAttr(gradegram)}', ${size}, '${escAttr(supplier)}', '${escAttr(quality)}')`);
      confirmBtn.textContent = '🛒 ใส่ตะกร้า';
    }
  }

  modal.classList.add('show');
  setTimeout(() => {
    const input = document.getElementById('cartQtyInput');
    if (input) { input.focus(); input.select(); }
  }, 100);
}

// ═══════════════════════════════════════════════════════════════
//  CONFIRM CART QTY (ไม่แตะ DB, DB ยังเป็น reserved)
// ═══════════════════════════════════════════════════════════════

async function confirmCartQty(resId, gradegram, size, supplier, quality) {
  const qty = Number(document.getElementById('cartQtyInput').value);
  if (!qty || qty <= 0) return alert('กรุณาระบุจำนวนมากกว่า 0');

  // 1. บันทึก Draft ลง Memory ฝั่ง Client เท่านั้น (Database ยังเป็น reserved)
  _draftPendingItems.push({ resId, gradegram, size, qty, supplier, quality });

  closeModal('modalCartQty');

  // 2. เติมข้อมูลลงฟอร์มด้านล่าง (พร้อมจำ resId)
  fillOrderForm(gradegram, size, qty, supplier, quality, resId);

  // 3. รีเฟรชเฉพาะกล่องยอดจอง (เพื่อให้ยอดลดลงแค่บนหน้าจอ)
  await refreshReservationBox(gradegram, size);
}

// ═══════════════════════════════════════════════════════════════
//  FILL ORDER FORM
// ═══════════════════════════════════════════════════════════════

function fillOrderForm(gradegram, size, qty, supplier, quality, resId) {
  let form = document.getElementById('matrixOrderForm');
  if (!form) {
    const prompt = document.getElementById('matrixOrderPrompt');
    if (prompt) { showMatrixOrderForm(gradegram, size); form = document.getElementById('matrixOrderForm'); }
  }
  if (!form) return alert('ไม่พบฟอร์มสั่งซื้อ');

  const rowsBox = document.getElementById('matrixOrderRows');
  if (rowsBox) {
    const existingRows = rowsBox.querySelectorAll('.matrix-order-row');
    if (existingRows.length === 1) {
      const firstRowQty = existingRows[0].querySelector('.matrix-row-qty')?.value;
      if (!firstRowQty || Number(firstRowQty) === 0) {
        rowsBox.innerHTML = '';
      }
    }

    const currentCount = rowsBox.querySelectorAll('.matrix-order-row').length;
    const newRow = {
      qty: qty,
      sup: supplier,
      customer_roll: 'normal',
      quality_b: quality === 'B' ? 'nc' : 'normal',
      note: '',
      res_id: resId || ''
    };

    const wrapper = document.createElement('div');
    wrapper.innerHTML = renderMatrixOrderRow(currentCount, newRow);
    rowsBox.appendChild(wrapper.firstElementChild);
    renumberMatrixOrderRows();

    setTimeout(() => {
      const newRows = rowsBox.querySelectorAll('.matrix-order-row');
      const lastRow = newRows[newRows.length - 1];
      if (lastRow) {
        lastRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
        lastRow.style.backgroundColor = '#fef3c7';
        setTimeout(() => lastRow.style.backgroundColor = '', 1500);
      }
    }, 100);
  }
}

// ✅ V.18.1: cancelDraftOrder — ไม่ลบ log DRAFT แล้ว (ไม่มี log ตอน Draft)
async function cancelDraftOrder(gradegram, size) {
  if (gradegram !== undefined && size !== undefined) {
    _draftPendingItems = _draftPendingItems.filter(d => !(d.gradegram === gradegram && Number(d.size) === Number(size)));

    const savedItems = getAlertItems(gradegram, size);
    const oldResIds = savedItems.map(i => i.res_id).filter(Boolean);
    if (oldResIds.length > 0) {
      await _restoreReservations(oldResIds);
    }

    await saveAlertItems(gradegram, size, []);

    closeModal('modalAlertMatrixCell');
    applyAlertFiltersAndRender();
  } else {
    _draftPendingItems = [];
    closeModal('modalAlertMatrixCell');
  }
}

// ═══════════════════════════════════════════════════════════════
//  END OF FILE — alert_part3.js V.18.5
// ═══════════════════════════════════════════════════════════════
