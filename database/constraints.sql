-- Run after schema.sql. Safe to re-run.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='orders_status_check') THEN
    ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK(status IN ('draft','supplier_ordered','proforma_sent','customer_confirmed','in_production','shipped','completed','canceled'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION prevent_locked_order_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('completed','canceled') AND (NEW.status<>OLD.status OR NEW.customer_id<>OLD.customer_id OR NEW.total_amount<>OLD.total_amount OR NEW.currency<>OLD.currency) THEN
    RAISE EXCEPTION 'Locked order cannot be modified';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_prevent_locked_order_update ON orders;
CREATE TRIGGER trg_prevent_locked_order_update BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION prevent_locked_order_update();

CREATE OR REPLACE FUNCTION record_product_price_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' AND (OLD.purchase_price IS DISTINCT FROM NEW.purchase_price OR OLD.sale_price IS DISTINCT FROM NEW.sale_price OR OLD.margin_percent IS DISTINCT FROM NEW.margin_percent OR OLD.currency IS DISTINCT FROM NEW.currency) THEN
    INSERT INTO product_price_history(product_id,purchase_price,sale_price,margin_percent,currency) VALUES(NEW.id,NEW.purchase_price,NEW.sale_price,NEW.margin_percent,NEW.currency);
  ELSIF TG_OP='INSERT' THEN
    INSERT INTO product_price_history(product_id,purchase_price,sale_price,margin_percent,currency) VALUES(NEW.id,NEW.purchase_price,NEW.sale_price,NEW.margin_percent,NEW.currency);
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_record_product_price_change ON products;
CREATE TRIGGER trg_record_product_price_change AFTER INSERT OR UPDATE ON products FOR EACH ROW EXECUTE FUNCTION record_product_price_change();

CREATE INDEX IF NOT EXISTS idx_supplier_invoices_status ON supplier_invoices(status);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_invoice ON supplier_payments(supplier_invoice_id);
