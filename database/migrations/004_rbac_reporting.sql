-- FZ ERP: RBAC, per-user overrides, report catalog and 5-user limit.
-- Safe to run after database/schema.sql. No external integrations are enabled here.
BEGIN;

CREATE TABLE IF NOT EXISTS user_permission_overrides (
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  resource VARCHAR(100) NOT NULL,
  action VARCHAR(50) NOT NULL,
  allowed BOOLEAN NOT NULL,
  created_by INT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, resource, action)
);
CREATE INDEX IF NOT EXISTS idx_user_permission_overrides_user ON user_permission_overrides(user_id);

CREATE TABLE IF NOT EXISTS report_definitions (
  code VARCHAR(100) PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  category VARCHAR(80) NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS role_report_permissions (
  role_id INT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  report_code VARCHAR(100) NOT NULL REFERENCES report_definitions(code) ON DELETE CASCADE,
  allowed BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (role_id, report_code)
);

CREATE TABLE IF NOT EXISTS user_report_permissions (
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  report_code VARCHAR(100) NOT NULL REFERENCES report_definitions(code) ON DELETE CASCADE,
  allowed BOOLEAN NOT NULL,
  PRIMARY KEY (user_id, report_code)
);
CREATE INDEX IF NOT EXISTS idx_user_report_permissions_user ON user_report_permissions(user_id);

INSERT INTO permissions (resource, action) VALUES
 ('admin','users'), ('admin','permissions'), ('admin','reports'),
 ('financial_data','read'), ('financial_data','export'),
 ('reports','read'), ('reports','export'), ('reports','configure'),
 ('customers','export'), ('suppliers','export'), ('products','export'),
 ('orders','approve'), ('orders','cancel'),
 ('invoices','approve'), ('payments','approve'),
 ('shipments','approve'), ('claims','approve'), ('claims','credit_memo')
ON CONFLICT(resource,action) DO NOTHING;

INSERT INTO roles (name, description) VALUES
 ('Admin','Full system access and user/permission administration'),
 ('Sales','Customers, inquiries, offers and customer orders'),
 ('Purchase','Suppliers, purchasing, supplier invoices and supplier payments'),
 ('Accountant','Invoices, payments, currencies and financial reports'),
 ('Export','Shipments, packing/loading documents, export reports and claims')
ON CONFLICT(name) DO UPDATE SET description=EXCLUDED.description;

INSERT INTO role_permissions (role_id,resource,action)
SELECT r.id,p.resource,p.action FROM roles r CROSS JOIN permissions p
WHERE r.name='Admin' ON CONFLICT(role_id,resource,action) DO NOTHING;

-- Canonical role defaults. Legacy Warehouse/Viewer remain untouched for compatibility.
INSERT INTO role_permissions(role_id,resource,action)
SELECT r.id,p.resource,p.action FROM roles r CROSS JOIN permissions p
WHERE r.name='Sales' AND (
  (p.resource IN ('customers','products','offers','orders') AND p.action IN ('read','create','update')) OR
  (p.resource='customers' AND p.action='export') OR
  (p.resource='products' AND p.action='export') OR
  (p.resource='reports' AND p.action='read')
) ON CONFLICT(role_id,resource,action) DO NOTHING;

INSERT INTO role_permissions(role_id,resource,action)
SELECT r.id,p.resource,p.action FROM roles r CROSS JOIN permissions p
WHERE r.name='Purchase' AND (
  (p.resource IN ('suppliers','products','orders') AND p.action IN ('read','create','update')) OR
  (p.resource='suppliers' AND p.action='export') OR
  (p.resource='reports' AND p.action='read') OR
  (p.resource='financial_data' AND p.action='read')
) ON CONFLICT(role_id,resource,action) DO NOTHING;

INSERT INTO role_permissions(role_id,resource,action)
SELECT r.id,p.resource,p.action FROM roles r CROSS JOIN permissions p
WHERE r.name='Accountant' AND (
  p.resource IN ('invoices','payments','reports','currencies','financial_data')
) ON CONFLICT(role_id,resource,action) DO NOTHING;

INSERT INTO role_permissions(role_id,resource,action)
SELECT r.id,p.resource,p.action FROM roles r CROSS JOIN permissions p
WHERE r.name='Export' AND (
  (p.resource IN ('shipments','orders','products','claims') AND p.action IN ('read','create','update')) OR
  (p.resource='reports' AND p.action IN ('read','export')) OR
  (p.resource='products' AND p.action='read') OR
  (p.resource='customers' AND p.action='read')
) ON CONFLICT(role_id,resource,action) DO NOTHING;

INSERT INTO report_definitions (code,name,description,category,config) VALUES
 ('dashboard','Dashboard','Management KPI overview','management','{"dimensions":["date"],"metrics":["orders","revenue","profit","outstanding","shipments"]}'),
 ('sales-summary','Sales Summary','Sales value and quantity by period, customer and currency','sales','{"dimensions":["date","customer","currency"],"metrics":["quantity","revenue","average_sale_price"]}'),
 ('sales-by-product','Sales by Product','Sales quantities and revenue for each product','sales','{"dimensions":["product","date"],"metrics":["quantity_sold","revenue","average_sale_price"]}'),
 ('sales-by-customer','Sales by Customer','Sales and order performance by customer','sales','{"dimensions":["customer","date"],"metrics":["orders","quantity","revenue","profit","margin"]}'),
 ('product-profitability','Product Profitability','Product-level purchase cost, sales, gross profit and margin','profitability','{"dimensions":["product","category","product_family","date"],"metrics":["quantity_sold","revenue","purchase_cost","gross_profit","margin","average_purchase_price","average_sale_price"]}'),
 ('order-profit','Order Profit','Order profitability including allocated order costs','profitability','{"dimensions":["order","customer","date"],"metrics":["revenue","purchase_cost","transport","customs","other_cost","profit","margin"]}'),
 ('margin-analysis','Margin Analysis','Margin trends and low-margin orders/products','profitability','{"dimensions":["product","customer","date"],"metrics":["revenue","profit","margin"]}'),
 ('ar-aging','AR Aging','Customer receivables grouped by overdue age','finance','{"buckets":["current","1-30","31-60","61-90","90+"]}'),
 ('supplier-payables','Supplier Payables','Supplier outstanding invoices and aging','finance','{"buckets":["current","1-30","31-60","61-90","90+"]}'),
 ('cash-flow','Cash Flow','Customer receipts and supplier payments by period','finance','{"dimensions":["date","currency","type"],"metrics":["inflow","outflow","net"]}'),
 ('payments','Payment History','Customer and supplier payment history','finance','{"dimensions":["date","customer","supplier","currency"],"metrics":["amount"]}'),
 ('currency-exposure','Currency Exposure','Receivables, payables and order value by currency','finance','{"dimensions":["currency"],"metrics":["receivable","payable","open_orders"]}'),
 ('shipped-orders','Shipped Orders','Completed and partial shipment quantities and values','export','{"dimensions":["shipment","order","customer","country","date"],"metrics":["quantity_shipped","value","weight","pallets"]}'),
 ('pending-shipments','Pending Shipments','Orders/items not fully shipped','export','{"dimensions":["order","customer","product"],"metrics":["ordered","shipped","remaining","variance"]}'),
 ('export-summary','Export Summary','Export value and quantity by country and Incoterm','export','{"dimensions":["country","incoterm","date"],"metrics":["orders","value","quantity","weight","pallets"]}'),
 ('offer-conversion','Offer Conversion','Offer to confirmed-order conversion performance','sales','{"dimensions":["customer","date","sales_user"],"metrics":["offers","converted","conversion_rate"]}'),
 ('supplier-performance','Supplier Performance','Supplier purchase value, delivery and claims performance','purchase','{"dimensions":["supplier","date"],"metrics":["purchase_value","orders","lead_time","claims"]}'),
 ('customer-growth','Customer Growth','New and active customer trends','sales','{"dimensions":["date","country"],"metrics":["new_customers","active_customers","orders","revenue"]}'),
 ('claims-summary','Claims Summary','Claims by customer, supplier, product and status','quality','{"dimensions":["customer","supplier","product","status","date"],"metrics":["claims","quantity","credit_memo_value"]}')
ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,category=EXCLUDED.category,config=EXCLUDED.config,updated_at=NOW();

INSERT INTO role_report_permissions(role_id,report_code,allowed)
SELECT r.id,d.code,
 CASE
  WHEN r.name='Admin' THEN TRUE
  WHEN r.name='Sales' THEN d.category IN ('sales','profitability')
  WHEN r.name='Purchase' THEN d.category IN ('purchase','finance')
  WHEN r.name='Accountant' THEN d.category IN ('finance','profitability')
  WHEN r.name='Export' THEN d.category IN ('export','quality')
  ELSE FALSE END
FROM roles r CROSS JOIN report_definitions d
ON CONFLICT(role_id,report_code) DO UPDATE SET allowed=EXCLUDED.allowed;

CREATE OR REPLACE FUNCTION enforce_max_active_users()
RETURNS TRIGGER AS $$
DECLARE active_count INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(74219051);
  IF NEW.deleted_at IS NULL THEN
    SELECT COUNT(*) INTO active_count FROM users WHERE deleted_at IS NULL AND id <> NEW.id;
    IF active_count >= 5 THEN RAISE EXCEPTION 'Maximum of 5 active ERP users reached'; END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_max_active_users ON users;
CREATE TRIGGER trg_max_active_users BEFORE INSERT OR UPDATE OF deleted_at ON users
FOR EACH ROW EXECUTE FUNCTION enforce_max_active_users();

COMMIT;
