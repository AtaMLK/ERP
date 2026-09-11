-- Audit metadata, explicit old/new values, price history hardening and bilingual email templates.
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS ip_address INET;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS email_templates (
  id SERIAL PRIMARY KEY,
  template_key VARCHAR(100) NOT NULL,
  language CHAR(2) NOT NULL CHECK(language IN ('en','tr')),
  subject VARCHAR(255) NOT NULL,
  body_html TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(template_key, language)
);

INSERT INTO email_templates(template_key,language,subject,body_html) VALUES
('proforma','en','Proforma Invoice {{document_number}}','Dear {{customer_name}},<br><br>Please find your proforma invoice <strong>{{document_number}}</strong> attached/below.<br><br>Best regards,<br>FZ ERP'),
('proforma','tr','Proforma Fatura {{document_number}}','Sayın {{customer_name}},<br><br>{{document_number}} numaralı proforma faturanız aşağıdadır.<br><br>Saygılarımızla,<br>FZ ERP'),
('order_confirmation','en','Order Confirmation {{order_number}}','Dear {{customer_name}},<br><br>Your order <strong>{{order_number}}</strong> has been confirmed.<br><br>Best regards,<br>FZ ERP'),
('order_confirmation','tr','Sipariş Onayı {{order_number}}','Sayın {{customer_name}},<br><br><strong>{{order_number}}</strong> numaralı siparişiniz onaylanmıştır.<br><br>Saygılarımızla,<br>FZ ERP'),
('shipment_notification','en','Shipment {{shipment_number}}','Dear {{customer_name}},<br><br>Your shipment <strong>{{shipment_number}}</strong> is on its way.<br><br>Best regards,<br>FZ ERP'),
('shipment_notification','tr','Sevkiyat {{shipment_number}}','Sayın {{customer_name}},<br><br><strong>{{shipment_number}}</strong> numaralı sevkiyatınız yola çıkmıştır.<br><br>Saygılarımızla,<br>FZ ERP'),
('invoice','en','Invoice {{document_number}}','Dear {{customer_name}},<br><br>Please find invoice <strong>{{document_number}}</strong> for your order.<br><br>Best regards,<br>FZ ERP'),
('invoice','tr','Fatura {{document_number}}','Sayın {{customer_name}},<br><br>Siparişinize ait <strong>{{document_number}}</strong> numaralı faturanız aşağıdadır.<br><br>Saygılarımızla,<br>FZ ERP'),
('customer_email','en','Message from FZ ERP','Dear {{customer_name}},<br><br>{{message}}<br><br>Best regards,<br>FZ ERP'),
('customer_email','tr','FZ ERP mesajı','Sayın {{customer_name}},<br><br>{{message}}<br><br>Saygılarımızla,<br>FZ ERP'),
('supplier_email','en','Message regarding {{order_number}}','Dear {{supplier_name}},<br><br>{{message}}<br><br>Best regards,<br>FZ ERP'),
('supplier_email','tr','{{order_number}} hakkında mesaj','Sayın {{supplier_name}},<br><br>{{message}}<br><br>Saygılarımızla,<br>FZ ERP')
ON CONFLICT(template_key,language) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_logs_status_created ON email_logs(status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_templates_key ON email_templates(template_key,language);

-- Make price history append-only at the application level: current product price changes
-- should create a new row instead of overwriting historical rows. Existing order_items
-- already store unit_purchase_price/unit_sale_price snapshots.