-- Core document extensions
CREATE TABLE IF NOT EXISTS invoice_items(id SERIAL PRIMARY KEY,invoice_id INT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,order_item_id INT REFERENCES order_items(id),description TEXT NOT NULL,quantity NUMERIC(15,3) NOT NULL CHECK(quantity>0),unit_price NUMERIC(15,2) NOT NULL,total_price NUMERIC(15,2) NOT NULL,currency CHAR(3) DEFAULT 'EUR',options_snapshot JSONB DEFAULT '{}');
CREATE TABLE IF NOT EXISTS supplier_invoice_items(id SERIAL PRIMARY KEY,supplier_invoice_id INT NOT NULL REFERENCES supplier_invoices(id) ON DELETE CASCADE,order_item_id INT REFERENCES order_items(id),description TEXT NOT NULL,quantity NUMERIC(15,3) NOT NULL CHECK(quantity>0),unit_price NUMERIC(15,2) NOT NULL,total_price NUMERIC(15,2) NOT NULL,currency CHAR(3) DEFAULT 'EUR');
CREATE TABLE IF NOT EXISTS incoterms(code VARCHAR(10) PRIMARY KEY,name VARCHAR(100) NOT NULL,description TEXT);
INSERT INTO incoterms(code,name) VALUES
('EXW','Ex Works'),('FCA','Free Carrier'),('CPT','Carriage Paid To'),('CIP','Carriage and Insurance Paid To'),('DAP','Delivered At Place'),('DPU','Delivered at Place Unloaded'),('DDP','Delivered Duty Paid'),('FOB','Free On Board'),('CFR','Cost and Freight'),('CIF','Cost Insurance and Freight') ON CONFLICT(code) DO NOTHING;
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_supplier_invoice_items_invoice ON supplier_invoice_items(supplier_invoice_id);
CREATE INDEX IF NOT EXISTS idx_product_price_history_product ON product_price_history(product_id,valid_from DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource,resource_id,created_at DESC);
