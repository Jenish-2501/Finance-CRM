import React, { useState } from 'react';
import { useAccountingStore } from '../store/accountingStore';
import { Customer } from '../types/database';
import { formatINR } from '../utils/calculations';
import {
  Users,
  Plus,
  Search,
  Building,
  Phone,
  Mail,
  MapPin,
  CreditCard,
  Layers,
  FileText,
  BookOpen,
  ArrowRight,
  Edit2,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { Modal } from '../components/common/Modal';
import { Badge } from '../components/common/Badge';

interface CustomersViewProps {
  onSelectCustomerForBilling?: (customerId: string) => void;
  onOpenInvoice?: (invoiceId: string) => void;
}

export const CustomersView: React.FC<CustomersViewProps> = ({
  onSelectCustomerForBilling,
  onOpenInvoice
}) => {
  const {
    customers,
    createCustomer,
    updateCustomer,
    getCustomerOutstanding,
    getCustomerInventorySummary,
    invoices,
    invoicePayments,
    getCustomerLedger,
    auditLogs
  } = useAccountingStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<'overview' | 'inventory' | 'invoices' | 'payments' | 'ledger' | 'activity'>('overview');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // Form states
  const [formData, setFormData] = useState({
    customer_name: '',
    pan: '',
    gst_number: '',
    email: '',
    mobile: '',
    address: '',
    city: '',
    state: 'Gujarat',
    country: 'India',
    postal_code: '',
    state_code: '24',
    credit_limit: 500000,
    bank_name: '',
    bank_account: '',
    ifsc: ''
  });

  const allCustomers = Object.values(customers);
  const filteredCustomers = allCustomers.filter((c) => {
    const q = searchQuery.toLowerCase();
    return (
      c.customer_name.toLowerCase().includes(q) ||
      c.city.toLowerCase().includes(q) ||
      c.gst_number.toLowerCase().includes(q)
    );
  });

  const selectedCustomer = selectedCustomerId ? customers[selectedCustomerId] : null;

  const handleOpenCreate = () => {
    setFormData({
      customer_name: '',
      pan: '',
      gst_number: '',
      email: '',
      mobile: '',
      address: '',
      city: '',
      state: 'Gujarat',
      country: 'India',
      postal_code: '',
      state_code: '24',
      credit_limit: 500000,
      bank_name: '',
      bank_account: '',
      ifsc: ''
    });
    setIsCreateModalOpen(true);
  };

  const handleOpenEdit = (c: Customer) => {
    setFormData({
      customer_name: c.customer_name,
      pan: c.pan,
      gst_number: c.gst_number,
      email: c.email,
      mobile: c.mobile,
      address: c.address,
      city: c.city,
      state: c.state,
      country: c.country,
      postal_code: c.postal_code,
      state_code: c.state_code,
      credit_limit: c.credit_limit || 500000,
      bank_name: c.bank_details?.bank_name || '',
      bank_account: c.bank_details?.account_number || '',
      ifsc: c.bank_details?.ifsc || ''
    });
    setIsEditModalOpen(true);
  };

  const handleSaveCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.customer_name.trim()) return;

    createCustomer({
      customer_name: formData.customer_name.trim(),
      pan: formData.pan.trim().toUpperCase(),
      gst_number: formData.gst_number.trim().toUpperCase(),
      email: formData.email.trim(),
      mobile: formData.mobile.trim(),
      address: formData.address.trim(),
      city: formData.city.trim(),
      state: formData.state.trim(),
      country: formData.country.trim(),
      postal_code: formData.postal_code.trim(),
      state_code: formData.state_code.trim(),
      credit_limit: Number(formData.credit_limit) || 0,
      bank_details: {
        bank_name: formData.bank_name,
        account_number: formData.bank_account,
        ifsc: formData.ifsc
      },
      is_active: true
    });

    setIsCreateModalOpen(false);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerId || !formData.customer_name.trim()) return;

    updateCustomer(selectedCustomerId, {
      customer_name: formData.customer_name.trim(),
      pan: formData.pan.trim().toUpperCase(),
      gst_number: formData.gst_number.trim().toUpperCase(),
      email: formData.email.trim(),
      mobile: formData.mobile.trim(),
      address: formData.address.trim(),
      city: formData.city.trim(),
      state: formData.state.trim(),
      country: formData.country.trim(),
      postal_code: formData.postal_code.trim(),
      state_code: formData.state_code.trim(),
      credit_limit: Number(formData.credit_limit) || 0,
      bank_details: {
        bank_name: formData.bank_name,
        account_number: formData.bank_account,
        ifsc: formData.ifsc
      }
    });

    setIsEditModalOpen(false);
  };

  // Queries for selected customer
  const customerSummary = selectedCustomerId ? getCustomerInventorySummary(selectedCustomerId) : [];
  const customerInvoices = selectedCustomerId
    ? Object.values(invoices).filter((i) => i.customer_id === selectedCustomerId)
    : [];
  const customerPayments = selectedCustomerId
    ? Object.values(invoicePayments).filter((p) => {
        const inv = invoices[p.invoice_id];
        return inv && inv.customer_id === selectedCustomerId;
      })
    : [];
  const customerLedger = selectedCustomerId ? getCustomerLedger(selectedCustomerId) : [];
  const customerAudit = selectedCustomerId
    ? auditLogs.filter((a) => a.entity_id === selectedCustomerId || (a.metadata && (a.metadata as any).customerId === selectedCustomerId))
    : [];

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-white border border-neutral-200 rounded-lg shadow-2xs">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-neutral-950">Customer Directory</h1>
          <p className="text-xs text-neutral-500 font-mono mt-0.5">
            Normalized entity ledger • Tax identification and consignment reconciliation
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search customers or GSTIN..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-3 py-1.5 text-xs border border-neutral-300 rounded focus:ring-1 focus:ring-neutral-900 focus:outline-none w-64 bg-white"
            />
          </div>

          <button
            onClick={handleOpenCreate}
            className="px-3.5 py-1.5 text-xs font-semibold bg-neutral-900 text-white rounded hover:bg-neutral-800 transition-colors flex items-center gap-1.5 shadow-2xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Customer</span>
          </button>
        </div>
      </div>

      {/* Main Customers Table */}
      <div className="bg-white border border-neutral-200 rounded-lg shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50/80 font-mono text-neutral-600 text-[11px]">
                <th className="py-3 px-4">Customer Entity</th>
                <th className="py-3 px-3">State / Code</th>
                <th className="py-3 px-3">GSTIN / PAN</th>
                <th className="py-3 px-3">Contact</th>
                <th className="py-3 px-3 text-right">Outstanding Receivables</th>
                <th className="py-3 px-3 text-center">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 font-sans">
              {filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-neutral-400 text-xs">
                    No customers match your search query.
                  </td>
                </tr>
              ) : (
                filteredCustomers.map((cust) => {
                  const outstanding = getCustomerOutstanding(cust.id);
                  return (
                    <tr
                      key={cust.id}
                      className="hover:bg-neutral-50/70 transition-colors group cursor-pointer"
                      onClick={() => {
                        setSelectedCustomerId(cust.id);
                        setDetailTab('overview');
                      }}
                    >
                      <td className="py-3 px-4">
                        <div className="font-semibold text-neutral-900 group-hover:text-black">
                          {cust.customer_name}
                        </div>
                        <div className="text-[11px] text-neutral-500 font-mono">
                          ID: #{cust.id}
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        <span className="font-mono text-neutral-700">{cust.city}, {cust.state}</span>
                        <div className="text-[10px] font-mono text-neutral-400">Code: {cust.state_code}</div>
                      </td>

                      <td className="py-3 px-3 font-mono text-[11px]">
                        <div className="text-neutral-900 font-semibold">{cust.gst_number || 'Unregistered'}</div>
                        <div className="text-neutral-500">{cust.pan}</div>
                      </td>

                      <td className="py-3 px-3 text-[11px] text-neutral-600">
                        <div>{cust.mobile}</div>
                        <div className="text-neutral-400 truncate max-w-xs">{cust.email}</div>
                      </td>

                      <td className="py-3 px-3 text-right font-mono">
                        <span
                          className={`font-bold ${
                            outstanding > 0 ? 'text-amber-800' : 'text-emerald-800'
                          }`}
                        >
                          {formatINR(outstanding)}
                        </span>
                      </td>

                      <td className="py-3 px-3 text-center">
                        <Badge variant={cust.is_active ? 'success' : 'neutral'}>
                          {cust.is_active ? 'ACTIVE' : 'INACTIVE'}
                        </Badge>
                      </td>

                      <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          {onSelectCustomerForBilling && (
                            <button
                              onClick={() => onSelectCustomerForBilling(cust.id)}
                              className="px-2 py-1 text-[11px] font-medium bg-neutral-900 text-white rounded hover:bg-neutral-800"
                              title="Open billing wizard for this customer"
                            >
                              Bill
                            </button>
                          )}
                          <button
                            onClick={() => handleOpenEdit(cust)}
                            className="p-1 text-neutral-500 hover:text-neutral-900 border border-neutral-300 rounded bg-white hover:bg-neutral-100"
                            title="Edit details"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Customer 360 Detail Drawer / Modal */}
      {selectedCustomer && (
        <Modal
          isOpen={Boolean(selectedCustomerId)}
          onClose={() => setSelectedCustomerId(null)}
          title={selectedCustomer.customer_name}
          subtitle={`GSTIN: ${selectedCustomer.gst_number || 'N/A'} • State Code: ${selectedCustomer.state_code} (${selectedCustomer.state})`}
          maxWidth="4xl"
          footer={
            <div className="flex justify-between w-full items-center">
              <div className="font-mono text-xs text-neutral-600">
                Outstanding Balance:{' '}
                <span className="font-bold text-neutral-950">
                  {formatINR(getCustomerOutstanding(selectedCustomer.id))}
                </span>
              </div>
              <div className="flex gap-2">
                {onSelectCustomerForBilling && (
                  <button
                    onClick={() => {
                      onSelectCustomerForBilling(selectedCustomer.id);
                      setSelectedCustomerId(null);
                    }}
                    className="px-3.5 py-1.5 text-xs font-semibold bg-neutral-900 text-white rounded hover:bg-neutral-800"
                  >
                    Open Billing Wizard
                  </button>
                )}
                <button
                  onClick={() => setSelectedCustomerId(null)}
                  className="px-3 py-1.5 text-xs font-medium text-neutral-700 bg-white border border-neutral-300 rounded hover:bg-neutral-50"
                >
                  Close
                </button>
              </div>
            </div>
          }
        >
          <div className="space-y-4">
            {/* Tabs */}
            <div className="flex border-b border-neutral-200 gap-6 text-xs font-medium text-neutral-500">
              {[
                { id: 'overview', label: 'Entity Profile' },
                { id: 'inventory', label: `Inventory Consignments (${customerSummary.length})` },
                { id: 'invoices', label: `Invoices (${customerInvoices.length})` },
                { id: 'payments', label: `Collections (${customerPayments.length})` },
                { id: 'ledger', label: 'Financial Ledger' },
                { id: 'activity', label: 'Audit History' }
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setDetailTab(t.id as any)}
                  className={`pb-2.5 transition-colors border-b-2 -mb-px ${
                    detailTab === t.id
                      ? 'border-neutral-900 text-neutral-900 font-semibold'
                      : 'border-transparent hover:text-neutral-800'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Tab: Overview */}
            {detailTab === 'overview' && (
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="p-3.5 bg-neutral-50 border border-neutral-200 rounded space-y-2">
                  <div className="font-semibold text-neutral-700 uppercase tracking-wide text-[11px]">
                    Tax &amp; Identity Details
                  </div>
                  <div className="space-y-1 font-mono">
                    <div>
                      <span className="text-neutral-500">GSTIN:</span>{' '}
                      <span className="font-bold text-neutral-900">{selectedCustomer.gst_number || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-neutral-500">PAN:</span>{' '}
                      <span className="font-semibold text-neutral-900">{selectedCustomer.pan}</span>
                    </div>
                    <div>
                      <span className="text-neutral-500">State:</span>{' '}
                      <span>{selectedCustomer.state} (Code: {selectedCustomer.state_code})</span>
                    </div>
                    <div>
                      <span className="text-neutral-500">Credit Limit:</span>{' '}
                      <span>{formatINR(selectedCustomer.credit_limit || 0)}</span>
                    </div>
                  </div>
                </div>

                <div className="p-3.5 bg-neutral-50 border border-neutral-200 rounded space-y-2">
                  <div className="font-semibold text-neutral-700 uppercase tracking-wide text-[11px]">
                    Billing Address &amp; Contact
                  </div>
                  <div className="text-neutral-700 space-y-1">
                    <div>{selectedCustomer.address}</div>
                    <div>
                      {selectedCustomer.city}, {selectedCustomer.state} - {selectedCustomer.postal_code}
                    </div>
                    <div className="font-mono pt-1 text-[11px]">
                      <div>Phone: {selectedCustomer.mobile}</div>
                      <div>Email: {selectedCustomer.email}</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Tab: Inventory Consignments */}
            {detailTab === 'inventory' && (
              <div className="space-y-3">
                <div className="text-xs text-neutral-500">
                  Physical stock held by customer vs. unbilled quantity. Billed quantity is derived from explicit invoice allocations.
                </div>
                <div className="border border-neutral-200 rounded overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-neutral-50 font-mono text-[11px] text-neutral-600 border-b border-neutral-200">
                        <th className="py-2.5 px-3">Product</th>
                        <th className="py-2.5 px-2 text-right">Received</th>
                        <th className="py-2.5 px-2 text-right">Returned</th>
                        <th className="py-2.5 px-2 text-right">Current Held</th>
                        <th className="py-2.5 px-2 text-right">Billed Qty</th>
                        <th className="py-2.5 px-3 text-right">Unbilled Qty</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200 font-mono">
                      {customerSummary.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-6 text-center text-neutral-400">
                            No inventory movements recorded for this customer.
                          </td>
                        </tr>
                      ) : (
                        customerSummary.map((item) => (
                          <tr key={item.productId} className="hover:bg-neutral-50">
                            <td className="py-2 px-3 font-sans font-semibold text-neutral-900">
                              {item.productName}
                              <div className="text-[10px] font-mono text-neutral-400">{item.sku}</div>
                            </td>
                            <td className="py-2 px-2 text-right text-neutral-700">{item.totalReceived} {item.unitCode}</td>
                            <td className="py-2 px-2 text-right text-neutral-700">{item.totalReturned} {item.unitCode}</td>
                            <td className="py-2 px-2 text-right font-bold text-neutral-900">
                              {item.currentBalance} {item.unitCode}
                            </td>
                            <td className="py-2 px-2 text-right text-emerald-800">{item.billedQuantity} {item.unitCode}</td>
                            <td className="py-2 px-3 text-right font-bold text-amber-800">
                              {item.unbilledQuantity} {item.unitCode}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Tab: Invoices */}
            {detailTab === 'invoices' && (
              <div className="space-y-2">
                {customerInvoices.length === 0 ? (
                  <div className="py-8 text-center text-neutral-400 text-xs">No invoices created yet.</div>
                ) : (
                  <div className="border border-neutral-200 rounded divide-y divide-neutral-200 text-xs">
                    {customerInvoices.map((inv) => (
                      <div
                        key={inv.id}
                        className="p-3 flex items-center justify-between hover:bg-neutral-50 cursor-pointer"
                        onClick={() => {
                          if (onOpenInvoice) {
                            onOpenInvoice(inv.id);
                            setSelectedCustomerId(null);
                          }
                        }}
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-neutral-900">{inv.invoice_number}</span>
                            <Badge
                              variant={
                                inv.status === 'FINALIZED'
                                  ? 'success'
                                  : inv.status === 'DRAFT'
                                  ? 'warning'
                                  : 'danger'
                              }
                            >
                              {inv.status}
                            </Badge>
                          </div>
                          <div className="text-[11px] text-neutral-500 font-mono mt-0.5">
                            Period: {inv.billing_period_start} to {inv.billing_period_end}
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="font-mono font-bold text-neutral-900">{formatINR(inv.grand_total)}</div>
                          <div className="text-[11px] text-neutral-400 font-mono">
                            {new Date(inv.invoice_date).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Tab: Payments */}
            {detailTab === 'payments' && (
              <div className="space-y-2">
                {customerPayments.length === 0 ? (
                  <div className="py-8 text-center text-neutral-400 text-xs">No payments recorded yet.</div>
                ) : (
                  <div className="border border-neutral-200 rounded divide-y divide-neutral-200 text-xs">
                    {customerPayments.map((p) => (
                      <div key={p.id} className="p-3 flex items-center justify-between">
                        <div>
                          <div className="font-mono font-semibold text-emerald-800">{formatINR(p.amount)}</div>
                          <div className="text-[11px] text-neutral-500 font-mono">
                            Method: {p.payment_method} • Ref: {p.reference_number || 'N/A'}
                          </div>
                        </div>
                        <div className="text-right font-mono text-[11px] text-neutral-500">
                          {new Date(p.payment_date).toLocaleDateString()}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Tab: Ledger */}
            {detailTab === 'ledger' && (
              <div className="border border-neutral-200 rounded overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-neutral-50 font-mono text-[11px] text-neutral-600 border-b border-neutral-200">
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Ref</th>
                      <th className="py-2.5 px-3">Description</th>
                      <th className="py-2.5 px-2 text-right">Debit (+)</th>
                      <th className="py-2.5 px-2 text-right">Credit (-)</th>
                      <th className="py-2.5 px-3 text-right">Running Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200 font-mono text-[11px]">
                    {customerLedger.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-neutral-400">
                          No financial ledger entries.
                        </td>
                      </tr>
                    ) : (
                      customerLedger.map((row, idx) => (
                        <tr key={idx} className="hover:bg-neutral-50">
                          <td className="py-2 px-3 text-neutral-500">
                            {new Date(row.date).toLocaleDateString()}
                          </td>
                          <td className="py-2 px-3 font-semibold text-neutral-800">{row.referenceNumber}</td>
                          <td className="py-2 px-3 font-sans text-neutral-600">{row.description}</td>
                          <td className="py-2 px-2 text-right text-neutral-900">
                            {row.debit > 0 ? formatINR(row.debit) : '-'}
                          </td>
                          <td className="py-2 px-2 text-right text-emerald-800">
                            {row.credit > 0 ? formatINR(row.credit) : '-'}
                          </td>
                          <td className="py-2 px-3 text-right font-bold text-neutral-950">
                            {formatINR(row.balance)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Tab: Activity */}
            {detailTab === 'activity' && (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {customerAudit.length === 0 ? (
                  <div className="py-6 text-center text-neutral-400 text-xs">No audit logs for this customer.</div>
                ) : (
                  customerAudit.map((log) => (
                    <div key={log.id} className="p-2.5 bg-neutral-50 border border-neutral-200 rounded text-xs">
                      <div className="flex justify-between font-mono text-[11px]">
                        <span className="font-semibold text-neutral-800">{log.action}</span>
                        <span className="text-neutral-400">{new Date(log.created_at).toLocaleString()}</span>
                      </div>
                      <div className="text-neutral-500 text-[11px] mt-0.5">By {log.user_name}</div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Create Customer Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Add New Customer"
        subtitle="Creates a normalized customer entity in database"
        maxWidth="2xl"
      >
        <form onSubmit={handleSaveCreate} className="space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block font-semibold text-neutral-700 mb-1">Customer / Legal Name *</label>
              <input
                type="text"
                required
                value={formData.customer_name}
                onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                className="w-full p-2 border border-neutral-300 rounded focus:ring-1 focus:ring-neutral-900 focus:outline-none"
                placeholder="e.g. Acme Infra Corporation Pvt Ltd"
              />
            </div>

            <div>
              <label className="block font-semibold text-neutral-700 mb-1">GSTIN Number</label>
              <input
                type="text"
                value={formData.gst_number}
                onChange={(e) => setFormData({ ...formData, gst_number: e.target.value })}
                className="w-full p-2 border border-neutral-300 rounded uppercase font-mono"
                placeholder="e.g. 24AAACA1234A1Z5"
              />
            </div>

            <div>
              <label className="block font-semibold text-neutral-700 mb-1">PAN Number</label>
              <input
                type="text"
                value={formData.pan}
                onChange={(e) => setFormData({ ...formData, pan: e.target.value })}
                className="w-full p-2 border border-neutral-300 rounded uppercase font-mono"
                placeholder="e.g. AAACA1234A"
              />
            </div>

            <div>
              <label className="block font-semibold text-neutral-700 mb-1">Email Address</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full p-2 border border-neutral-300 rounded"
                placeholder="accounts@acmeinfra.com"
              />
            </div>

            <div>
              <label className="block font-semibold text-neutral-700 mb-1">Mobile / Phone</label>
              <input
                type="text"
                value={formData.mobile}
                onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                className="w-full p-2 border border-neutral-300 rounded font-mono"
                placeholder="+91 98250 00000"
              />
            </div>

            <div className="col-span-2">
              <label className="block font-semibold text-neutral-700 mb-1">Street Address</label>
              <input
                type="text"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="w-full p-2 border border-neutral-300 rounded"
                placeholder="Plot 45, GIDC Industrial Estate"
              />
            </div>

            <div>
              <label className="block font-semibold text-neutral-700 mb-1">City</label>
              <input
                type="text"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                className="w-full p-2 border border-neutral-300 rounded"
                placeholder="Surat"
              />
            </div>

            <div>
              <label className="block font-semibold text-neutral-700 mb-1">State Code (GST)</label>
              <input
                type="text"
                value={formData.state_code}
                onChange={(e) => setFormData({ ...formData, state_code: e.target.value })}
                className="w-full p-2 border border-neutral-300 rounded font-mono"
                placeholder="24 (Gujarat) / 27 (MH)"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-neutral-200">
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(false)}
              className="px-3.5 py-1.5 text-neutral-700 border border-neutral-300 rounded hover:bg-neutral-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 font-semibold bg-neutral-900 text-white rounded hover:bg-neutral-800"
            >
              Create Customer
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Customer Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Edit Customer"
        subtitle="Updates master customer record"
        maxWidth="2xl"
      >
        <form onSubmit={handleSaveEdit} className="space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block font-semibold text-neutral-700 mb-1">Customer / Legal Name *</label>
              <input
                type="text"
                required
                value={formData.customer_name}
                onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                className="w-full p-2 border border-neutral-300 rounded"
              />
            </div>

            <div>
              <label className="block font-semibold text-neutral-700 mb-1">GSTIN Number</label>
              <input
                type="text"
                value={formData.gst_number}
                onChange={(e) => setFormData({ ...formData, gst_number: e.target.value })}
                className="w-full p-2 border border-neutral-300 rounded uppercase font-mono"
              />
            </div>

            <div>
              <label className="block font-semibold text-neutral-700 mb-1">PAN Number</label>
              <input
                type="text"
                value={formData.pan}
                onChange={(e) => setFormData({ ...formData, pan: e.target.value })}
                className="w-full p-2 border border-neutral-300 rounded uppercase font-mono"
              />
            </div>

            <div>
              <label className="block font-semibold text-neutral-700 mb-1">Email Address</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full p-2 border border-neutral-300 rounded"
              />
            </div>

            <div>
              <label className="block font-semibold text-neutral-700 mb-1">Mobile / Phone</label>
              <input
                type="text"
                value={formData.mobile}
                onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                className="w-full p-2 border border-neutral-300 rounded font-mono"
              />
            </div>

            <div className="col-span-2">
              <label className="block font-semibold text-neutral-700 mb-1">Street Address</label>
              <input
                type="text"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="w-full p-2 border border-neutral-300 rounded"
              />
            </div>

            <div>
              <label className="block font-semibold text-neutral-700 mb-1">City</label>
              <input
                type="text"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                className="w-full p-2 border border-neutral-300 rounded"
              />
            </div>

            <div>
              <label className="block font-semibold text-neutral-700 mb-1">State Code (GST)</label>
              <input
                type="text"
                value={formData.state_code}
                onChange={(e) => setFormData({ ...formData, state_code: e.target.value })}
                className="w-full p-2 border border-neutral-300 rounded font-mono"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-neutral-200">
            <button
              type="button"
              onClick={() => setIsEditModalOpen(false)}
              className="px-3.5 py-1.5 text-neutral-700 border border-neutral-300 rounded hover:bg-neutral-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 font-semibold bg-neutral-900 text-white rounded hover:bg-neutral-800"
            >
              Update Customer
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
