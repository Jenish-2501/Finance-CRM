import Database from 'better-sqlite3';

export function runMigrations(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      role TEXT NOT NULL,
      permissions TEXT NOT NULL, -- JSON array
      is_active INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS business_settings (
      id TEXT PRIMARY KEY,
      business_name TEXT NOT NULL,
      legal_name TEXT NOT NULL,
      gst_number TEXT NOT NULL,
      pan TEXT NOT NULL,
      address TEXT NOT NULL,
      city TEXT NOT NULL,
      state TEXT NOT NULL,
      country TEXT NOT NULL,
      postal_code TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT NOT NULL,
      website TEXT NOT NULL,
      bank_name TEXT NOT NULL,
      bank_account_number TEXT NOT NULL,
      ifsc TEXT NOT NULL,
      branch TEXT NOT NULL,
      invoice_prefix TEXT NOT NULL,
      invoice_next_number INTEGER NOT NULL,
      currency TEXT NOT NULL,
      default_gst_rate REAL NOT NULL,
      state_code TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS uoms (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      is_active INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      customer_name TEXT NOT NULL,
      pan TEXT NOT NULL,
      gst_number TEXT NOT NULL,
      email TEXT NOT NULL,
      mobile TEXT NOT NULL,
      address TEXT NOT NULL,
      city TEXT NOT NULL,
      state TEXT NOT NULL,
      country TEXT NOT NULL,
      postal_code TEXT NOT NULL,
      state_code TEXT NOT NULL,
      bank_details TEXT, -- JSON
      credit_limit REAL,
      is_active INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      product_name TEXT NOT NULL,
      sku TEXT NOT NULL,
      description TEXT NOT NULL,
      image TEXT,
      primary_unit_id TEXT NOT NULL,
      hsn_code TEXT,
      is_active INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS product_units (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      unit_id TEXT NOT NULL,
      conversion_to_primary REAL NOT NULL,
      is_stock_unit INTEGER NOT NULL,
      is_billing_unit INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (unit_id) REFERENCES uoms(id)
    );

    CREATE TABLE IF NOT EXISTS product_prices (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      unit_id TEXT NOT NULL,
      price REAL NOT NULL,
      effective_from TEXT NOT NULL,
      effective_to TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (unit_id) REFERENCES uoms(id)
    );

    CREATE TABLE IF NOT EXISTS stock_receipts (
      id TEXT PRIMARY KEY,
      receipt_number TEXT NOT NULL,
      receipt_date TEXT NOT NULL,
      supplier_name TEXT NOT NULL,
      reference_number TEXT NOT NULL,
      notes TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stock_receipt_items (
      id TEXT PRIMARY KEY,
      stock_receipt_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      unit_id TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit_cost REAL NOT NULL,
      total_cost REAL NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (stock_receipt_id) REFERENCES stock_receipts(id),
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (unit_id) REFERENCES uoms(id)
    );

    CREATE TABLE IF NOT EXISTS inventory_movements (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      unit_id TEXT NOT NULL,
      quantity REAL NOT NULL,
      movement_type TEXT NOT NULL,
      movement_date TEXT NOT NULL,
      reference_type TEXT NOT NULL,
      reference_id TEXT NOT NULL,
      notes TEXT NOT NULL,
      created_at TEXT NOT NULL,
      created_by TEXT NOT NULL,
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (unit_id) REFERENCES uoms(id)
    );

    CREATE TABLE IF NOT EXISTS customer_inventory_movements (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      unit_id TEXT NOT NULL,
      quantity REAL NOT NULL,
      movement_type TEXT NOT NULL,
      movement_date TEXT NOT NULL,
      reference_type TEXT NOT NULL,
      reference_id TEXT NOT NULL,
      notes TEXT NOT NULL,
      vehicle_number TEXT,
      transporter_name TEXT,
      eway_bill_number TEXT,
      dispatch_purpose TEXT,
      created_at TEXT NOT NULL,
      created_by TEXT NOT NULL,
      FOREIGN KEY (customer_id) REFERENCES customers(id),
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (unit_id) REFERENCES uoms(id)
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      invoice_number TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      invoice_date TEXT NOT NULL,
      billing_period_start TEXT NOT NULL,
      billing_period_end TEXT NOT NULL,
      status TEXT NOT NULL,
      subtotal REAL NOT NULL,
      discount REAL NOT NULL,
      taxable_amount REAL NOT NULL,
      cgst REAL NOT NULL,
      sgst REAL NOT NULL,
      igst REAL NOT NULL,
      other_charges REAL NOT NULL,
      grand_total REAL NOT NULL,
      customer_snapshot TEXT NOT NULL, -- JSON
      business_snapshot TEXT NOT NULL, -- JSON
      bank_snapshot TEXT NOT NULL, -- JSON
      notes TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    );

    CREATE TABLE IF NOT EXISTS invoice_items (
      id TEXT PRIMARY KEY,
      invoice_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      product_name_snapshot TEXT NOT NULL,
      sku_snapshot TEXT NOT NULL,
      unit_id TEXT NOT NULL,
      uom_snapshot TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit_price REAL NOT NULL,
      discount REAL NOT NULL,
      taxable_amount REAL NOT NULL,
      gst_rate REAL NOT NULL,
      cgst REAL NOT NULL,
      sgst REAL NOT NULL,
      igst REAL NOT NULL,
      extra_charges REAL NOT NULL,
      line_total REAL NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (invoice_id) REFERENCES invoices(id),
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (unit_id) REFERENCES uoms(id)
    );

    CREATE TABLE IF NOT EXISTS invoice_allocations (
      id TEXT PRIMARY KEY,
      invoice_id TEXT NOT NULL,
      customer_inventory_movement_id TEXT NOT NULL,
      allocated_quantity REAL NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (invoice_id) REFERENCES invoices(id),
      FOREIGN KEY (customer_inventory_movement_id) REFERENCES customer_inventory_movements(id)
    );

    CREATE TABLE IF NOT EXISTS invoice_payments (
      id TEXT PRIMARY KEY,
      invoice_id TEXT NOT NULL,
      payment_date TEXT NOT NULL,
      amount REAL NOT NULL,
      payment_method TEXT NOT NULL,
      reference_number TEXT NOT NULL,
      notes TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (invoice_id) REFERENCES invoices(id)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      old_data TEXT, -- JSON
      new_data TEXT, -- JSON
      metadata TEXT, -- JSON
      created_at TEXT NOT NULL
    );
  `);
}
