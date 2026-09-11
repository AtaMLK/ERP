-- Production hardening: keep all IDs aligned with the real INT/SERIAL schema.
BEGIN;

-- RBAC/reporting objects must reference the existing INT identity columns.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='id' AND data_type <> 'integer') THEN
    RAISE EXCEPTION 'users.id must remain integer; migration 009 will not rewrite existing production IDs';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='roles' AND column_name='id' AND data_type <> 'integer') THEN
    RAISE EXCEPTION 'roles.id must remain integer; migration 009 will not rewrite existing production IDs';
  END IF;
END $$;

-- Defensive indexes for the real INT foreign-key paths used by RBAC/reporting.
CREATE INDEX IF NOT EXISTS idx_user_permission_overrides_user ON user_permission_overrides(user_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role_resource_action ON role_permissions(role_id,resource,action);
CREATE INDEX IF NOT EXISTS idx_user_report_permissions_user ON user_report_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_role_report_permissions_role ON role_report_permissions(role_id);

-- Financial integrity: invoice amounts and recorded payments cannot be negative.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='invoices_total_amount_nonnegative') THEN
    ALTER TABLE invoices ADD CONSTRAINT invoices_total_amount_nonnegative CHECK (total_amount >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='payments_amount_positive') THEN
    ALTER TABLE payments ADD CONSTRAINT payments_amount_positive CHECK (amount > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='supplier_payments_amount_positive') THEN
    ALTER TABLE supplier_payments ADD CONSTRAINT supplier_payments_amount_positive CHECK (amount > 0);
  END IF;
END $$;

-- Shipment quantities are positive; duplicate line entries remain allowed so partial shipments are preserved.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='shipment_items_quantity_positive') THEN
    ALTER TABLE shipment_items ADD CONSTRAINT shipment_items_quantity_positive CHECK (quantity > 0);
  END IF;
END $$;

COMMIT;
