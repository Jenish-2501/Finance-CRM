/**
 * Database Domain Types matching SQLite Relational Schema.
 * Single-owner desktop app: no roles, no permissions, no users table.
 * Audit / created-by fields always carry the fixed owner identity below.
 */

export const OWNER_ID = 'owner';
export const OWNER_NAME = 'Owner';

export interface BusinessSettings {
  id: string;
  business_name: string;
  legal_name: string;
  gst_number: string;
  pan: string;
  address: string;
  city: string;
  state: string;
  country: string;
  postal_code: string;
  phone: string;
  email: string;
  website: string;
  bank_name: string;
  bank_account_number: string;
  ifsc: string;
  branch: string;
  invoice_prefix: string;
  invoice_next_number: number;
  invoice_start_number: number; // first number of each FY series (default 1)
  customer_next_number: number; // floor for auto-assigned plain customer numbers
  document_next_number: number; // floor for auto dispatch-document numbers (shared DISPATCH+RETURN)
  currency: string;
  default_gst_rate: number; // e.g. 5 for 5% total (2.5% CGST + 2.5% SGST intra-state)
  state_code: string; // e.g. "24" for Gujarat to distinguish intra-state (CGST+SGST) vs inter-state (IGST)
  logo_data?: string | null; // optional PNG/JPEG data URL printed as PDF watermark
  created_at: string;
  updated_at: string;
}

export interface UnitOfMeasure {
  id: string;
  code: string; // PCS, KG, BOX, GRAM, LITRE, ML, METER, DOZEN, PACK
  name: string;
  description: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: string;
  customer_name: string;
  customer_number: string; // searchable short code, unique (e.g. C-1001)
  gujarati_name?: string | null; // optional Gujarati nickname (master-data only; legal docs use customer_name)
  pan: string;
  gst_number: string;
  mobile: string;
  address: string;
  city: string;
  state: string;
  country: string;
  postal_code: string;
  bank_details?: {
    bank_name?: string;
    account_number?: string;
    ifsc?: string;
  };
  credit_limit?: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  product_name: string;
  sku: string;
  description: string;
  image?: string;
  primary_unit_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductUnit {
  id: string;
  product_id: string;
  unit_id: string;
  conversion_to_primary: number; // e.g., 1 BOX = 20 PCS => conversion_to_primary is 20
  is_stock_unit: boolean;
  is_billing_unit: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductPrice {
  id: string;
  product_id: string;
  unit_id: string;
  price: number;
  effective_from: string; // ISO date
  effective_to?: string | null; // ISO date or null for active
  created_at: string;
  updated_at: string;
}

// Per-customer selling-price override. No effective dating: the row holds the
// currently agreed price and applies immediately; every change is appended to
// CustomerPriceHistory (separate, append-only table).
export interface CustomerProductPrice {
  id: string;
  customer_id: string;
  product_id: string;
  unit_id: string;
  price: number;
  created_at: string;
  updated_at: string;
}

export interface CustomerPriceHistory {
  id: string;
  customer_id: string;
  product_id: string;
  unit_id: string;
  old_price: number | null; // null = first price ever set
  new_price: number | null; // null = override removed
  changed_at: string;
  changed_by: string; // owner identity
}

export interface StockReceipt {
  id: string;
  receipt_number: string;
  receipt_date: string;
  supplier_name: string;
  reference_number: string;
  notes: string;
  status: 'RECEIVED' | 'CANCELLED';
  created_at: string;
  updated_at: string;
}

export interface StockReceiptItem {
  id: string;
  stock_receipt_id: string;
  product_id: string;
  unit_id: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  created_at: string;
}

export type InventoryMovementType =
  | 'STOCK_IN'
  | 'CUSTOMER_DISPATCH'
  | 'CUSTOMER_RETURN'
  | 'ADJUSTMENT_IN'
  | 'ADJUSTMENT_OUT';

export interface InventoryMovement {
  id: string;
  product_id: string;
  unit_id: string;
  quantity: number; // Always positive magnitude; sign is governed by movement_type
  movement_type: InventoryMovementType;
  movement_date: string;
  reference_type: 'STOCK_RECEIPT' | 'CUSTOMER_DISPATCH' | 'CUSTOMER_RETURN' | 'MANUAL_ADJUSTMENT';
  reference_id: string;
  notes: string;
  created_at: string;
  created_by: string; // user id
}

export type CustomerMovementType =
  | 'DISPATCH'
  | 'RETURN'
  | 'ADJUSTMENT_IN'
  | 'ADJUSTMENT_OUT';

export interface CustomerInventoryMovement {
  id: string;
  customer_id: string;
  product_id: string;
  unit_id: string;
  quantity: number; // Always positive magnitude
  movement_type: CustomerMovementType;
  movement_date: string;
  reference_type: 'DISPATCH' | 'RETURN' | 'MANUAL_ADJUSTMENT';
  reference_id: string;
  document_id: string | null; // FK → dispatch_documents.id (backfilled by v9)
  created_at: string;
  created_by: string; // user id
}

export type DispatchDocumentType = 'DISPATCH' | 'RETURN';

// One row per dispatch challan / return slip. The document number lives ONCE
// here (UNIQUE per customer + type); movements point at it via document_id.
export interface DispatchDocument {
  id: string;
  document_number: string;
  customer_id: string;
  document_type: DispatchDocumentType;
  document_date: string;
  created_at: string;
}

export type InvoiceStatus = 'DRAFT' | 'FINALIZED' | 'CANCELLED';

export interface InvoiceCustomerSnapshot {
  customer_name: string;
  pan: string;
  gst_number: string;
  email: string;
  mobile: string;
  address: string;
  city: string;
  state: string;
  country: string;
  postal_code: string;
  state_code: string;
}

export interface InvoiceBusinessSnapshot {
  business_name: string;
  legal_name: string;
  gst_number: string;
  pan: string;
  address: string;
  city: string;
  state: string;
  country: string;
  postal_code: string;
  phone: string;
  email: string;
  website: string;
  state_code: string;
}

export interface InvoiceBankSnapshot {
  bank_name: string;
  bank_account_number: string;
  ifsc: string;
  branch: string;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  customer_id: string;
  invoice_date: string;
  fy: string; // financial year of invoice_date, e.g. '2025-26'; number is unique within it
  billing_period_start: string;
  billing_period_end: string;
  status: InvoiceStatus;
  subtotal: number;
  discount: number;
  taxable_amount: number;
  cgst: number;
  sgst: number;
  igst: number;
  other_charges: number;
  grand_total: number;
  customer_snapshot: InvoiceCustomerSnapshot;
  business_snapshot: InvoiceBusinessSnapshot;
  bank_snapshot: InvoiceBankSnapshot;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  product_id: string;
  product_name_snapshot: string;
  sku_snapshot: string;
  unit_id: string;
  uom_snapshot: string;
  quantity: number;
  unit_price: number;
  discount: number;
  taxable_amount: number;
  gst_rate: number;
  cgst: number;
  sgst: number;
  igst: number;
  extra_charges: number;
  line_total: number;
  created_at: string;
}

/**
 * CRITICAL ARCHITECTURAL TABLE:
 * Explicit link between Invoice and Customer Inventory Movements.
 * Eliminates naive date or "is_billed" hacks.
 */
export interface InvoiceCustomerInventoryAllocation {
  id: string;
  invoice_id: string;
  customer_inventory_movement_id: string;
  allocated_quantity: number;
  created_at: string;
}

// Per-financial-year invoice numbering series. Plain numbers restart at
// start_number every FY; created on first use (automatic rollover).
export interface InvoiceSeries {
  id: string;
  fy: string;
  next_number: number;
  start_number: number;
  created_at: string;
}

export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'UPI' | 'CHEQUE' | 'OTHER';

export interface InvoicePayment {
  id: string;
  invoice_id: string;
  payment_date: string;
  amount: number;
  payment_method: PaymentMethod;
  reference_number: string;
  notes: string;
  status: 'ACTIVE' | 'CANCELLED';
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string;
  user_name: string;
  action: string;
  entity_type: string;
  entity_id: string;
  old_data?: Record<string, unknown> | null;
  new_data?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
}
