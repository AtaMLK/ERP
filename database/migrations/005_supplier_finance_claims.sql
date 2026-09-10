-- Supplier finance + claims/credit memo hardening.
BEGIN;

INSERT INTO permissions(resource,action) VALUES
 ('supplier_invoices','read'),('supplier_invoices','create'),('supplier_invoices','update'),('supplier_invoices','approve'),
 ('supplier_payments','read'),('supplier_payments','create'),('supplier_payments','approve'),
 ('claims','read'),('claims','create'),('claims','update'),('claims','approve'),
 ('credit_memos','read'),('credit_memos','create'),('credit_memos','approve'),
 ('financial_data','read'),('financial_data','export')
ON CONFLICT(resource,action) DO NOTHING;

INSERT INTO role_permissions(role_id,resource,action)
SELECT r.id,p.resource,p.action FROM roles r JOIN permissions p
 ON p.resource IN ('supplier_invoices','supplier_payments')
 AND p.action IN ('read','create','update','approve')
WHERE r.name='Purchase'
ON CONFLICT(role_id,resource,action) DO NOTHING;

INSERT INTO role_permissions(role_id,resource,action)
SELECT r.id,p.resource,p.action FROM roles r JOIN permissions p
 ON p.resource IN ('supplier_invoices','supplier_payments','financial_data')
 AND p.action IN ('read','create','approve','export')
WHERE r.name='Accountant'
ON CONFLICT(role_id,resource,action) DO NOTHING;

INSERT INTO role_permissions(role_id,resource,action)
SELECT r.id,p.resource,p.action FROM roles r JOIN permissions p
 ON p.resource IN ('claims','credit_memos')
 AND p.action IN ('read','create','update','approve')
WHERE r.name IN ('Export','Accountant')
ON CONFLICT(role_id,resource,action) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_supplier_invoices_supplier_status ON supplier_invoices(supplier_id,status,deleted_at);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_invoice_date ON supplier_payments(supplier_invoice_id,payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_claims_order_status ON claims(order_id,status,deleted_at);
CREATE INDEX IF NOT EXISTS idx_credit_memos_claim ON credit_memos(claim_id);

ALTER TABLE claims ADD CONSTRAINT claims_amount_positive CHECK (amount > 0);
ALTER TABLE credit_memos ADD CONSTRAINT credit_memos_amount_positive CHECK (amount > 0);

COMMIT;
