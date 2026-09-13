-- Currency, export/shipping and GIB readiness
-- GIB is intentionally disabled: no provider credentials, network calls or send operations are defined here.

INSERT INTO permissions(resource,action) VALUES
('currencies','create'),('currencies','update'),('currencies','export'),
('export','read'),('export','create'),('export','update'),('export','export'),
('gib','read')
ON CONFLICT(resource,action) DO NOTHING;

CREATE TABLE IF NOT EXISTS gib_settings (
  id SERIAL PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  provider VARCHAR(50) NOT NULL DEFAULT 'none',
  environment VARCHAR(20) NOT NULL DEFAULT 'disabled',
  updated_by INT REFERENCES users(id),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT gib_disabled CHECK (enabled = FALSE AND provider = 'none' AND environment = 'disabled')
);
INSERT INTO gib_settings(enabled,provider,environment) VALUES(FALSE,'none','disabled')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS export_documents (
  id SERIAL PRIMARY KEY,
  shipment_id INT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  document_type VARCHAR(40) NOT NULL,
  document_number VARCHAR(100),
  destination_country VARCHAR(100),
  destination_city VARCHAR(100),
  destination_address TEXT,
  incoterm_code VARCHAR(10) REFERENCES incoterms(code),
  total_weight NUMERIC(15,3),
  weight_unit VARCHAR(10) DEFAULT 'kg',
  pallet_count INT,
  package_count INT,
  shipment_value NUMERIC(15,2),
  currency CHAR(3) DEFAULT 'EUR',
  hs_codes JSONB DEFAULT '[]',
  notes TEXT,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_export_documents_shipment ON export_documents(shipment_id,document_type);
CREATE INDEX IF NOT EXISTS idx_exchange_rates_pair_date ON exchange_rates(from_currency,to_currency,rate_date DESC);

INSERT INTO exchange_rates(from_currency,to_currency,rate,rate_date)
SELECT 'EUR','TRY',0,'2000-01-01' WHERE NOT EXISTS (SELECT 1 FROM exchange_rates WHERE from_currency='EUR' AND to_currency='TRY');
DELETE FROM exchange_rates WHERE rate_date='2000-01-01' AND rate=0;
