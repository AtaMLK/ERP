const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { Pool } = require("pg");

require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

const root = process.cwd();
const dataFile =
  process.env.HISTORICAL_SALES_FILE ||
  path.join(root, "database/seed/historical-sales-2019-2026.csv");

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }

  if (cell || row.length) {
    row.push(cell.replace(/\r$/, ""));
    rows.push(row);
  }

  const headers = rows.shift() || [];

  return rows
    .filter((r) => r.some(Boolean))
    .map((r) =>
      Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""]))
    );
}

function readRows() {
  const raw = fs.readFileSync(dataFile, "utf8").trim();

  if (dataFile.endsWith(".gz.b64")) {
    return parseCsv(
      zlib.gunzipSync(Buffer.from(raw, "base64")).toString("utf8")
    );
  }

  return parseCsv(raw);
}

function money(value) {
  if (value == null || value === "") return null;

  const number = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(number) ? number : null;
}

function date(value) {
  if (!value) return null;

  const parsed = new Date(String(value).trim().replace(" ", "T"));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

async function findCustomer(db, name) {
  if (!name) return null;

  const result = await db.query(
    `
      SELECT id
      FROM customers
      WHERE deleted_at IS NULL
        AND lower(trim(name)) = lower(trim($1))
      ORDER BY id
      LIMIT 1
    `,
    [name]
  );

  return result.rows[0]?.id || null;
}

async function ensureCustomer(db, name) {
  const existingCustomer = await findCustomer(db, name);

  if (existingCustomer) return existingCustomer;
  if (!name) return null;

  const result = await db.query(
    `
      INSERT INTO customers(name, default_currency, status)
      VALUES($1, 'EUR', 'ACTIVE')
      RETURNING id
    `,
    [name]
  );

  return result.rows[0].id;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured");
  }

  if (!fs.existsSync(dataFile)) {
    throw new Error(`Historical sales data not found: ${dataFile}`);
  }

  const rows = readRows();
  console.log(`Found ${rows.length} historical rows.`);

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl:
      process.env.DATABASE_SSL === "true"
        ? { rejectUnauthorized: false }
        : false,
  });

  const db = await pool.connect();
  let imported = 0;
  let skipped = 0;

  try {
    await db.query("BEGIN");

    await db.query(`
      INSERT INTO suppliers(name, currency, status)
      VALUES('GDC', 'EUR', 'ACTIVE')
      ON CONFLICT(name)
      DO UPDATE SET
        currency = 'EUR',
        status = 'ACTIVE',
        updated_at = now()
    `);

    const supplierResult = await db.query(`
      SELECT id
      FROM suppliers
      WHERE name = 'GDC'
      LIMIT 1
    `);

    const supplier = supplierResult.rows[0]?.id;

    if (!supplier) {
      throw new Error("GDC supplier could not be found.");
    }

    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      const x = rows[rowIndex];

      console.log(`\nProcessing CSV row ${rowIndex + 2}:`, {
        source_year: x.source_year,
        source_row: x.source_row,
        customer: x.customer_raw,
        sales_invoice: x.sales_invoice_raw,
        sales_amount: x.sales_amount_raw,
      });

      const year = Number(x.source_year);
      const rawSourceRow = String(x.source_row ?? "").trim();
      const parsedSourceRow = Number(rawSourceRow);
      const sourceRow =
        Number.isInteger(parsedSourceRow) && parsedSourceRow > 0
          ? parsedSourceRow
          : rowIndex + 2;

      if (!Number.isInteger(year) || year <= 0) {
        console.log("  SKIPPED: invalid source_year");
        skipped++;
        continue;
      }

      const exists = await db.query(
        `
          SELECT id
          FROM historical_sales
          WHERE source_year = $1
            AND source_row = $2
          LIMIT 1
        `,
        [year, sourceRow]
      );

      if (exists.rowCount) {
        console.log("  SKIPPED: already imported");
        skipped++;
        continue;
      }

      const customerId = await ensureCustomer(db, x.customer_raw);

      if (!customerId) {
        console.log("  SKIPPED: customer not found");
        skipped++;
        continue;
      }

      const total = money(x.sales_amount_raw);
      const orderNumber =
        `HIST-${year}-${String(sourceRow).padStart(4, "0")}`;
      const orderDate = date(x.sales_date_raw ?? x.sales_date);

      console.log("  Creating order:", {
        orderNumber,
        customerId,
        orderDate,
        total,
      });

      const order = await db.query(
        `
          INSERT INTO orders(
            order_number,
            customer_id,
            customer_order_date,
            status,
            total_amount,
            currency,
            notes
          )
          VALUES(
            $1,
            $2,
            $3,
            'completed',
            COALESCE($4::numeric, 0),
            'EUR',
            $5
          )
          RETURNING id
        `,
        [
          orderNumber,
          customerId,
          orderDate,
          total,
          [
            x.quantity_raw && `Quantity raw: ${x.quantity_raw}`,
            x.notes_raw,
          ]
            .filter(Boolean)
            .join(" | ") || null,
        ]
      );

      const orderId = order.rows[0].id;
      console.log("  Order created:", orderId);

      let customerInvoiceId = null;

      const salesInvoiceRaw = String(x.sales_invoice_raw ?? "").trim();
      const normalizedSalesInvoice = salesInvoiceRaw.toUpperCase();
      const hasValidSalesInvoice =
        salesInvoiceRaw !== "" &&
        normalizedSalesInvoice !== "FATURA YOK" &&
        normalizedSalesInvoice !== "FATURA YOKTUR";

      if (hasValidSalesInvoice && total != null) {
        console.log(
          "  Creating customer invoice:",
          salesInvoiceRaw
        );

        const invoice = await db.query(
          `
            INSERT INTO invoices(
              invoice_number,
              external_invoice_number,
              order_id,
              customer_id,
              status,
              total_amount,
              currency,
              due_date
            )
            VALUES(
              $1,
              $2,
              $3,
              $4,
              'HISTORICAL',
              $5::numeric,
              'EUR',
              $6
            )
            RETURNING id
          `,
          [
            orderNumber,
            salesInvoiceRaw,
            orderId,
            customerId,
            total,
            orderDate,
          ]
        );

        customerInvoiceId = invoice.rows[0].id;
        console.log("  Customer invoice created:", customerInvoiceId);
      } else {
        console.log(
          "  No customer invoice:",
          salesInvoiceRaw || "(empty)"
        );
      }

      let supplierInvoiceId = null;
      const gdcAmount = money(x.gdc_purchase_amount_raw);
      const gdcInvoiceRaw = String(x.gdc_invoice_raw ?? "").trim();

      if (gdcInvoiceRaw && gdcAmount != null) {
        console.log("  Creating supplier invoice:", {
          invoice: gdcInvoiceRaw,
          amount: gdcAmount,
        });

        const supplierInvoice = await db.query(
          `
            INSERT INTO supplier_invoices(
              supplier_id,
              order_id,
              invoice_number,
              amount,
              currency,
              invoice_date,
              status
            )
            VALUES(
              $1,
              $2,
              $3,
              $4::numeric,
              'EUR',
              $5,
              'HISTORICAL'
            )
            ON CONFLICT(supplier_id, invoice_number)
            DO UPDATE SET
              order_id = EXCLUDED.order_id,
              amount = EXCLUDED.amount,
              invoice_date = EXCLUDED.invoice_date,
              status = 'HISTORICAL'
            RETURNING id
          `,
          [
            supplier,
            orderId,
            gdcInvoiceRaw,
            gdcAmount,
            orderDate,
          ]
        );

        supplierInvoiceId = supplierInvoice.rows[0].id;
        console.log("  Supplier invoice created:", supplierInvoiceId);
      } else {
        console.log("  No supplier invoice.");
      }

      console.log("  Creating historical_sales record...");

      await db.query(
        `
          INSERT INTO historical_sales(
            source_year,
            source_row,
            customer_raw,
            sales_invoice_raw,
            quantity_raw,
            sales_date_raw,
            sales_amount_raw,
            customer_payment_raw,
            gdc_invoice_raw,
            gdc_purchase_amount_raw,
            gdc_payment_date_raw,
            gdc_payment_amount_raw,
            claim_raw,
            notes_raw,
            customer_id,
            order_id,
            customer_invoice_id,
            supplier_invoice_id
          )
          VALUES(
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            $9,
            $10,
            $11,
            $12,
            $13,
            $14,
            $15,
            $16,
            $17,
            $18
          )
        `,
        [
          year,
          sourceRow,
          x.customer_raw,
          x.sales_invoice_raw,
          x.quantity_raw,
          x.sales_date_raw ?? x.sales_date,
          x.sales_amount_raw,
          x.customer_payment_raw,
          x.gdc_invoice_raw,
          x.gdc_purchase_amount_raw,
          x.gdc_payment_date_raw,
          x.gdc_payment_amount_raw,
          x.claim_raw,
          x.notes_raw,
          customerId,
          orderId,
          customerInvoiceId,
          supplierInvoiceId,
        ]
      );

      imported++;
      console.log(`  SUCCESS: historical row imported (${imported})`);
    }

    await db.query("COMMIT");

    console.log(
      `\nImported ${imported} historical sales rows; skipped ${skipped} already imported/invalid rows.`
    );
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    db.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`Historical sales import failed: ${error.message}`);

  if (error.detail) console.error("Detail:", error.detail);
  if (error.hint) console.error("Hint:", error.hint);
  if (error.where) console.error("Where:", error.where);

  process.exit(1);
});
