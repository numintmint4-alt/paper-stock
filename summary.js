// ═══════════════════════════════════════════════════════════════
// STOCK V6 — summary.js
// ═══════════════════════════════════════════════════════════════

let summarySelectedGrades = [];
let summaryAllGrades = [];
let summaryCache = [];

async function initSummaryTab() {
  const dateInput = $('summaryDate');
  if (dateInput && !dateInput.value) dateInput.value = toISODate(new Date());
  await loadSummaryGradeFilter();
  await renderSummary();
}

async function loadSummaryGradeFilter() {
  summaryAllGrades = [...new Set(
    masterCache.map(m => normalizeGrade(m.grade) + m.gram)
  )].sort();
  renderSummaryGradeList();
  updateSummaryGradeLabel();

  const btn = $('summaryGradeFilterBtn');
  const dropdown = $('summaryGradeDropdown');
  const box = $('summaryGradeFilterBox');
  if (!btn || !dropdown || !box) return;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('hidden');
    btn.classList.toggle('open');
  });
  document.addEventListener('click', (e) => {
    if (!box.contains(e.target)) {
      dropdown.classList.add('hidden');
      btn.classList.remove('open');
    }
  });
}

function renderSummaryGradeList() {
  const list = $('summaryGradeList');
  if (!list) return;
  if (!summaryAllGrades.length) {
    list.innerHTML = '<div style="padding:10px;text-align:center;color:#94a3b8;font-size:13px">ไม่มีข้อมูล</div>';
    return;
  }
  list.innerHTML = summaryAllGrades.map(g => {
    const checked = summarySelectedGrades.includes(g);
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
        if (!summarySelectedGrades.includes(grade)) summarySelectedGrades.push(grade);
      } else {
        summarySelectedGrades = summarySelectedGrades.filter(g => g !== grade);
      }
      el.classList.toggle('checked', cb.checked);
      updateSummaryGradeLabel();
    });
  });
}

function updateSummaryGradeLabel() {
  const label = $('summaryGradeFilterLabel');
  if (!label) return;
  if (summarySelectedGrades.length === 0) {
    label.textContent = 'ทั้งหมด'; label.style.color = '#1e293b';
  } else if (summarySelectedGrades.length === 1) {
    label.textContent = summarySelectedGrades[0]; label.style.color = '#1e40af';
  } else {
    label.textContent = `เลือก ${summarySelectedGrades.length} เกรด`; label.style.color = '#1e40af';
  }
}
function selectAllSummaryGrades() {
  summarySelectedGrades = [...summaryAllGrades];
  renderSummaryGradeList(); updateSummaryGradeLabel();
}
function clearAllSummaryGrades() {
  summarySelectedGrades = [];
  renderSummaryGradeList(); updateSummaryGradeLabel();
}

async function renderSummary() {
  const summaryDate = $('summaryDate')?.value;
  const fsc = $('summaryFsc')?.value || 'all';
  const remark = $('summaryRemark')?.value || '';
  const mode = $('summaryMode')?.value || 'qty';
  if (!summaryDate) { alert('กรุณาเลือกวันที่รับเข้า'); return; }

  const dateThai = thaiDateFull(summaryDate);
  const gradeLabel = summarySelectedGrades.length > 0
    ? ` · เกรด: ${summarySelectedGrades.join(', ')}` : '';
  const fscLabel = fsc === 'all' ? '' : fsc === 'fsc' ? ' · FSC' : ' · Non-FSC';
  const remarkLabel = remark ? ` · ${remark}` : '';
  const modeLabel = mode === 'qty' ? 'จำนวน' : mode === 'kg' ? 'KG รวม' : 'จำนวน + KG';

  $('summaryReportTitle').innerHTML = `
    ตารางสรุปรายการสั่งเข้า<br>
    ประจำวันที่ ${dateThai}
    <div class="report-subtitle">(${gradeLabel || 'ทุกเกรด'}${fscLabel}${remarkLabel} · แสดง: ${modeLabel})</div>
  `;
  $('summaryBody').innerHTML = '<p style="text-align:center;color:#94a3b8;padding:20px">กำลังโหลด...</p>';

  try {
    // ✅ แก้: normalize grade
    const normalizedGrades = summarySelectedGrades.map(g => normalizeGrade(g));

    const { data, error } = await supabase.rpc('get_receive_list', {
      p_date_from: summaryDate,
      p_date_to: summaryDate,
      p_grades: normalizedGrades.length > 0 ? normalizedGrades : null,
      p_suppliers: null,
      p_fsc: fsc,
      p_remarks: remark ? [remark] : null
    });
    if (error) throw error;

    const rows = data || [];
    summaryCache = rows;
    if (!rows.length) {
      $('summaryBody').innerHTML = '<p style="text-align:center;color:#94a3b8;padding:30px">ไม่มีข้อมูลในเงื่อนไขที่เลือก</p>';
      return;
    }

    // สรุป Supplier
    const supplierSummary = {};
    rows.forEach(r => {
      const sup = r.supplier || '(ไม่ระบุ)';
      if (!supplierSummary[sup]) supplierSummary[sup] = { qty: 0, kg: 0 };
      supplierSummary[sup].qty += Number(r.quantity) || 0;
      supplierSummary[sup].kg  += Number(r.kg_total) || 0;
    });

    const supKeys = Object.keys(supplierSummary).sort();
    let supHtml = '<div class="supplier-summary"><h4>📊 สรุป Supplier (วันที่ ' + dateThai + ')</h4>';
    supHtml += '<table><thead><tr><th>Supplier</th><th>จำนวน (ม้วน)</th><th>KG รวม</th></tr></thead><tbody>';
    let totalSupQty = 0, totalSupKg = 0;
    supKeys.forEach(sup => {
      const s = supplierSummary[sup];
      totalSupQty += s.qty; totalSupKg += s.kg;
      supHtml += `<tr><td>${esc(sup)}</td>
        <td style="text-align:right">${s.qty}</td>
        <td style="text-align:right">${s.kg.toFixed(0)}</td></tr>`;
    });
    supHtml += `<tr class="total-row"><td>รวม</td>
      <td style="text-align:right">${totalSupQty}</td>
      <td style="text-align:right">${totalSupKg.toFixed(0)}</td></tr>`;
    supHtml += '</tbody></table></div>';

    // Matrix
    const rowSet = new Map(); const colSet = new Set();
    const cells = {}; const rowTotals = {}; const colTotals = {};
    let grandQty = 0, grandKg = 0;

    rows.forEach(r => {
      const rk = r.gradegram || r.grade;
      const size = r.size;
      rowSet.set(rk, r.grade);
      colSet.add(size);

      const k = rk + '|' + size;
      if (!cells[k]) cells[k] = { qty: 0, kg: 0 };
      cells[k].qty += Number(r.quantity) || 0;
      cells[k].kg  += Number(r.kg_total) || 0;

      if (!rowTotals[rk]) rowTotals[rk] = { qty: 0, kg: 0 };
      rowTotals[rk].qty += Number(r.quantity) || 0;
      rowTotals[rk].kg  += Number(r.kg_total) || 0;

      if (!colTotals[size]) colTotals[size] = { qty: 0, kg: 0 };
      colTotals[size].qty += Number(r.quantity) || 0;
      colTotals[size].kg  += Number(r.kg_total) || 0;

      grandQty += Number(r.quantity) || 0;
      grandKg  += Number(r.kg_total) || 0;
    });

    const rowKeys = [...rowSet.keys()].sort();
    const colKeys = [...colSet].sort((a,b) => a - b);

    const renderCell = (v) => {
      if (!v || v.qty === 0) return '-';
      if (mode === 'qty') return String(v.qty);
      if (mode === 'kg')  return v.kg.toFixed(0);
      return `${v.qty}<br><span style="font-size:10px;color:#64748b">${v.kg.toFixed(0)}</span>`;
    };

    let html = supHtml;
    html += '<div class="report-wrap"><table class="report-table"><thead><tr>';
    html += '<th class="grade-col">Gradegrams</th>';
    colKeys.forEach(s => html += `<th>${s}</th>`);
    html += '<th class="total-col">Total</th>';
    html += '</tr></thead><tbody>';

    rowKeys.forEach(rk => {
      html += '<tr>';
      html += `<td class="grade-col">${esc(rk)}</td>`;
      colKeys.forEach(s => {
        const v = cells[rk + '|' + s];
        if (!v || v.qty === 0) {
          html += '<td class="empty">-</td>';
        } else {
          html += `<td class="clickable" onclick="openSummaryDetail('${esc(rk)}', ${s}, '${dateThai}')">
            ${renderCell(v)}
          </td>`;
        }
      });
      html += `<td class="total-col">${renderCell(rowTotals[rk])}</td>`;
      html += '</tr>';
    });

    html += '<tr class="total-row"><td class="grade-col">Total</td>';
    colKeys.forEach(s => html += `<td>${renderCell(colTotals[s])}</td>`);
    html += `<td class="total-col">${renderCell({ qty: grandQty, kg: grandKg })}</td>`;
    html += '</tr></tbody></table></div>';
    html += `<div class="report-foot">
      วันที่: ${dateThai} · รวม ${grandQty} ม้วน · ${grandKg.toFixed(0)} kg · คลิก Cell เพื่อดู PO
    </div>`;
    $('summaryBody').innerHTML = html;
  } catch (err) {
    console.error('renderSummary error:', err);
    $('summaryBody').innerHTML = `<div class="msg err">เกิดข้อผิดพลาด: ${esc(err.message)}</div>`;
  }
}

// ================= SUMMARY DETAIL =================
// ✅ แก้: ใช้ parseGradegram() ดึง grade ที่ถูกต้อง
async function openSummaryDetail(gradegram, size, dateThai) {
  const summaryDate = $('summaryDate')?.value;
  if (!summaryDate) return;

  const { grade } = parseGradegram(gradegram);

  $('summaryDetailTitle').innerHTML = `${esc(gradegram)} · Size ${size} <span style="font-weight:400;color:#64748b;font-size:14px">(วันที่ ${dateThai})</span>`;
  openModal('modalSummaryDetail');
  $('summaryDetailBody').innerHTML = '<p style="text-align:center;color:#94a3b8;padding:20px">กำลังโหลด...</p>';

  try {
    const { data, error } = await supabase.rpc('get_receive_detail', {
      p_po_date: summaryDate,
      p_grade: grade,
      p_size: size
    });
    if (error) throw error;

    const rows = data || [];
    if (!rows.length) {
      $('summaryDetailBody').innerHTML = '<p style="text-align:center;color:#94a3b8;padding:20px">ไม่พบรายละเอียด</p>';
      return;
    }

    const totalQty = rows.reduce((s, r) => s + (Number(r.quantity)||0), 0);
    const totalKg  = rows.reduce((s, r) => s + (Number(r.kg_total)||0), 0);

    let html = `<div class="msg info" style="margin-bottom:10px">
      📦 รวม ${totalQty} ม้วน · ${totalKg.toFixed(0)} kg · ${rows.length} รายการ
    </div>`;

    html += '<table><thead><tr>';
    html += '<th>#</th><th>PO No.</th><th>Supplier</th><th>Quantity</th>';
    html += '<th>KG รวม</th><th>ราคา</th><th>หมายเหตุ</th><th>FSC</th>';
    html += '</tr></thead><tbody>';

    rows.forEach((r, i) => {
      const fscBadge = r.is_fsc ? '<span class="badge ok">FSC</span>' : '-';
      const priceTxt = r.price != null ? Number(r.price).toFixed(2) : '-';
      html += `<tr>
        <td>${i+1}</td>
        <td><b>${esc(r.po_no)}</b></td>
        <td>${esc(r.supplier)}</td>
        <td style="text-align:right">${r.quantity}</td>
        <td style="text-align:right">${Number(r.kg_total).toFixed(0)}</td>
        <td style="text-align:right">${priceTxt}</td>
        <td>${esc(r.remark) || '-'}</td>
        <td>${fscBadge}</td>
      </tr>`;
    });

    html += '</tbody></table>';
    $('summaryDetailBody').innerHTML = html;
  } catch (err) {
    $('summaryDetailBody').innerHTML = `<div class="msg err">${esc(err.message)}</div>`;
  }
}
