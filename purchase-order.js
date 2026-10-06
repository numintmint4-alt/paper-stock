-- ═══════════════════════════════════════════════════════════════
-- RPC: update_po_header
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION update_po_header(
  p_po_id       UUID,
  p_sup_code    TEXT,
  p_ref_receive DATE,
  p_po_date     DATE,
  p_user_id     UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_old RECORD;
BEGIN
  SELECT sup_code, ref_receive, po_date
    INTO v_old
    FROM purchase_orders
   WHERE id = p_po_id
     AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'ไม่พบ PO');
  END IF;

  UPDATE purchase_orders
     SET sup_code    = p_sup_code,
         ref_receive = p_ref_receive,
         po_date     = p_po_date,
         updated_at  = NOW()
   WHERE id = p_po_id;

  INSERT INTO po_change_log (
    po_id, changed_by, action, field_name, note, changed_at
  ) VALUES (
    p_po_id,
    p_user_id,
    'edit_header',
    'sup_code,ref_receive,po_date',
    format('Sup: %s→%s, Receive: %s→%s, PO Date: %s→%s',
           v_old.sup_code, p_sup_code,
           v_old.ref_receive, p_ref_receive,
           v_old.po_date, p_po_date),
    NOW()
  );

  RETURN jsonb_build_object('success', true, 'po_id', p_po_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION update_po_header(UUID, TEXT, DATE, DATE, UUID) TO authenticated;
