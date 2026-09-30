/**
 * Database Domain Types matching PostgreSQL Relational Schema
 * All entities mirror real database tables and relational keys.
 */

export type RoleType = 'ADMIN' | 'ACCOUNTANT' | 'INVENTORY_MANAGER' | 'SALES_EXECUTIVE' | 'AUDITOR';

export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: RoleType;
  permissions: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

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
  currency: string;
  default_gst_rate: number; // e.g. 18 for 18%
  state_code: string; // e.g. "24" for Gujarat to distinguish intra-state (CGST+SGST) vs inter-state (IGST)
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
  pan: string;
  gst_number: string;
  email: string;
  mobile: string;
  address: string;
  city: string;
  state: string;
  country: string;
  postal_code: string;
  state_code: string; // for GST intra/inter determination
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
  hsn_code?: string;
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
  notes: string;
  created_at: string;
  created_by: string; // user id
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
