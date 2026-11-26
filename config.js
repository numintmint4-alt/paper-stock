/* =====================================================================
   config.js — ค่ากลางของเว็บ (แก้ที่ไฟล์นี้ไฟล์เดียว เปลี่ยนทั้งเว็บ)
   ===================================================================== */
window.APP_CONFIG = {
  // ชื่อเว็บ (ชั่วคราว — เปลี่ยนที่นี่ที่เดียว)
  siteName: 'CS Roll Control',
  siteSub:  'ระบบบริหารม้วนกระดาษ',

  // รูปแบบ: Version.[ครั้งที่เผยแพร่จริง].[จำนวนครั้งนับจากวันเริ่มแก้].[จำนวนครั้งที่แก้ในวันนั้น]
  //   00  = จำนวนครั้งที่เผยแพร่ให้ใช้งานจริง
  //   001 = นับครั้งที่แก้ไขตั้งแต่วันเริ่มแก้ไข
  //   01  = ครั้งที่แก้ไขในวันนั้น
  version: 'Version.00.001.01',

  // เมนูซ้าย: จัดกลุ่มตามนี้ (tab = หน้าเดิม, sec = ส่วนในหน้าตั้งค่า)
  menu: [
    { id: 'buy', title: 'จัดซื้อม้วนกระดาษ', icon: 'cart', img: 'img/turntable.jpg', items: [
      { tab: 'matrix',         title: 'ระดับ Stock ม้วนกระดาษ',                 icon: 'levels' },
      { tab: 'receive',        title: 'รายงานสั่งซื้อม้วนกระดาษประจำวัน',        icon: 'clipboard' },
      { tab: 'alert',          title: 'สั่งซื้อม้วนกระดาษประจำวัน',              icon: 'bell' },
      { tab: 'purchase-order', title: 'รายการการสั่งซื้อม้วนกระดาษ',             icon: 'file' },
      { tab: 'forecast',       title: 'จัดทำประมาณการสั่งซื้อม้วนกระดาษ',        icon: 'forecast' }
    ]},
    { id: 'wh', title: 'คลังม้วนกระดาษ', icon: 'warehouse', img: 'img/aisle.jpg', items: [
      { tab: 'stock',          title: 'รายงาน Stock คงเหลือ ม้วนกระดาษ',         icon: 'boxes' }
    ]},
    { id: 'use', title: 'การใช้ม้วนกระดาษ', icon: 'factory', img: 'img/machine.jpg', items: [
      { tab: 'usage-pivot',    title: 'รายงานการใช้ม้วนกระดาษตามผลผลิต',         icon: 'chart' },
      { tab: 'reservations',   title: 'ตารางรายการจองม้วนกระดาษ',                icon: 'calcheck' },
      { tab: 'settings', sec: 'accRolluse', title: 'รายงานการเบิกใช้ม้วนกระดาษ', icon: 'inbox' }
    ]},
    { id: 'set', title: 'ตั้งค่า', icon: 'gear', img: 'img/fsc.jpg', items: [
      { tab: 'settings', sec: 'accMaster',      title: 'Data Master',  icon: 'database' },
      { tab: 'settings', sec: 'accPriceMaster', title: 'Price Master', icon: 'tag' },
      { tab: 'settings', sec: 'accUsers',       title: 'ผู้ใช้งาน และรหัสผ่าน', icon: 'users', adminOnly: true }
    ]}
  ]
};
