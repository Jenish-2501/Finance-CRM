// Dispatch document headers: one row per challan / return slip.
// NEVER edit this file after release. Create a new 000N_*.ts instead.
//
// Why a header table instead of a UNIQUE index on movements.reference_id:
// a multi-item challan is legitimately N rows sharing one number, and legacy
// random refs are indistinguishable from true duplicates — no row constraint
// can express "one number = one document". So the number lives ONCE here:
// UNIQUE(customer_id, document_type, document_number), and movements point at
// it via document_id. New documents are validated + counter-driven in the app;
// this index is the structural backstop (second app instance, out-of-band edit).
//
// Legacy backfill is inherently safe: headers are synthesized per DISTINCT
// (customer, reference, type-class) group — the same key as the unique index —
// so collapsing multi-row challans can never violate it, no matter how messy
// old reference strings are. business_settings gains the shared document_next_number
// counter (dispatches and returns draw from one global plain sequence).
export const version = 9;
export const name = '0009_dispatch_documents';

export const sql = `
ALTER TABLE business_settings ADD COLUMN document_next_number INTEGER NOT NULL DEFAULT 1;
CREATE TABLE IF NOT EXISTS dispatch_documents (
  id TEXT PRIMARY KEY,
  document_number TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  document_type TEXT NOT NULL,
  document_date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);
INSERT OR IGNORE INTO dispatch_documents (id, document_number, customer_id, document_type, document_date, created_at)
SELECT
  'doc-' || customer_id || '-' ||
    CASE WHEN movement_type IN ('DISPATCH', 'ADJUSTMENT_IN') THEN 'DISPATCH' ELSE 'RETURN' END
    || '-' || reference_id,
  reference_id,
  customer_id,
  CASE WHEN movement_type IN ('DISPATCH', 'ADJUSTMENT_IN') THEN 'DISPATCH' ELSE 'RETURN' END,
  MIN(movement_date),
  MIN(created_at)
FROM customer_inventory_movements
GROUP BY customer_id, reference_id,
  CASE WHEN movement_type IN ('DISPATCH', 'ADJUSTMENT_IN') THEN 'DISPATCH' ELSE 'RETURN' END;
ALTER TABLE customer_inventory_movements ADD COLUMN document_id TEXT;
UPDATE customer_inventory_movements SET document_id = (
  SELECT d.id FROM dispatch_documents d
  WHERE d.customer_id = customer_inventory_movements.customer_id
    AND d.document_number = customer_inventory_movements.reference_id
    AND d.document_type = CASE
      WHEN customer_inventory_movements.movement_type IN ('DISPATCH', 'ADJUSTMENT_IN') THEN 'DISPATCH'
      ELSE 'RETURN' END
);
CREATE UNIQUE INDEX IF NOT EXISTS dispatch_documents_customer_type_number_unique
  ON dispatch_documents(customer_id, document_type, document_number);
CREATE INDEX IF NOT EXISTS customer_movements_document_idx
  ON customer_inventory_movements(document_id);
`;
