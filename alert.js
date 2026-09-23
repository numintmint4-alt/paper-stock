/* ═══════════════════════════════════════════════════════════ */
/* ========== ALERT DATE TABS (รอบที่ 4.1 — Fix :has()) ========== */
/* ═══════════════════════════════════════════════════════════ */

.alert-date-tabs {
  display: flex;
  gap: 8px;
  margin: 10px 0 14px;
  padding: 8px 12px;
  background: #f1f5f9;
  border-radius: 8px;
  flex-wrap: wrap;
  border: 1px solid #e2e8f0;
  align-items: center;
}

/* ✅ หัวข้อ "📅 วันที่รับสินค้า:" */
.alert-date-label {
  font-size: 13px;
  color: #475569;
  font-weight: 700;
  margin-right: 4px;
  white-space: nowrap;
}

/* ✅ wrap ของ Tab + ✕ */
.alert-date-tab-wrap {
  display: inline-flex;
  align-items: stretch;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid #cbd5e1;
  background: #fff;
}
.alert-date-tab-wrap:hover {
  border-color: #2563eb;
}

/* ✅ Tab */
.alert-date-tab {
  padding: 7px 14px;
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  border: none;
  background: #fff;
  color: #475569;
  cursor: pointer;
  transition: all .15s;
}
.alert-date-tab:hover {
  background: #dbeafe;
  color: #1e40af;
}
.alert-date-tab.active {
  background: #2563eb;
  color: #fff;
}

/* ✅ ปุ่ม ✕ */
.alert-date-tab-close {
  padding: 0 8px;
  border: none;
  border-left: 1px solid #cbd5e1;
  background: #fff;
  color: #dc2626;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all .15s;
}
.alert-date-tab-close:hover {
  background: #fee2e2;
  color: #991b1b;
}

/* ✅ สถานะ active — ใช้ class .is-active ที่ JS เติมให้ wrap */
.alert-date-tab-wrap.is-active {
  border-color: #1e40af;
}
.alert-date-tab-wrap.is-active .alert-date-tab-close {
  background: #2563eb;
  color: #fff;
  border-left-color: #1e40af;
}
.alert-date-tab-wrap.is-active .alert-date-tab-close:hover {
  background: #dc2626;
  color: #fff;
}

/* ✅ ปุ่ม + เพิ่มวันที่ */
.alert-date-add-btn {
  padding: 7px 14px;
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  border: 1px dashed #2563eb;
  background: #eff6ff;
  color: #1e40af;
  border-radius: 6px;
  cursor: pointer;
  transition: all .15s;
}
.alert-date-add-btn:hover {
  background: #2563eb;
  color: #fff;
  border-style: solid;
}
