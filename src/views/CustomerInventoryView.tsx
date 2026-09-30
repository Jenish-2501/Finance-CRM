import React, { useState } from 'react';
import { useAccountingStore } from '../store/accountingStore';
import { CustomerMovementType } from '../types/database';
import {
  Truck,
  Plus,
  RotateCcw,
  Search,
  ArrowRight,
  ShieldCheck,
  Building,
  CheckCircle2,
  FileCheck
} from 'lucide-react';
import { Modal } from '../components/common/Modal';
import { Badge } from '../components/common/Badge';

interface CustomerInventoryViewProps {
  onOpenBillingForCustomer?: (customerId: string) => void;
}

export const CustomerInventoryView: React.FC<CustomerInventoryViewProps> = ({
  onOpenBillingForCustomer
}) => {
  const {
    customers,
    products,
    uoms,
    customerInventoryMovements,
    dispatchInventoryToCustomer,
    createCustomerReturn,
    getCustomerInventorySummary,
    getCurrentCompanyStock
  } = useAccountingStore();

  const [activeTab, setActiveTab] = useState<'holdings' | 'movements'>('holdings');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('cust-1');
  const [isDispatchModalOpen, setIsDispatchModalOpen] = useState(false);
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [operationError, setOperationError] = useState('');

  // Dispatch Form State
  const [dispatchForm, setDispatchForm] = useState({
    customerId: 'cust-1',
    productId: 'prod-1',
    unitId: 'uom-pcs',
    quantity: 100,
    referenceId: `CH-${Math.floor(1000 + Math.random() * 9000)}`,
    notes: 'Site delivery consignment'
  });

  // Return Form State
  const [returnForm, setReturnForm] = useState({
    customerId: 'cust-1',
    productId: 'prod-1',
    unitId: 'uom-pcs',
    quantity: 10,
    referenceId: `RET-${Math.floor(100 + Math.random() * 900)}`,
    notes: 'Surplus material return'
  });

  const allCustomers = Object.values(customers);
  const allProducts = Object.values(products);

  const selectedCustomerSummary = getCustomerInventorySummary(selectedCustomerId);
  const allCustomerMovements = Object.values(customerInventoryMovements)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const handleOpenDispatch = (cId?: string) => {
    setOperationError('');
    setDispatchForm({
      customerId: cId || selectedCustomerId,
      productId: allProducts[0]?.id || 'prod-1',
      unitId: products[allProducts[0]?.id || 'prod-1']?.primary_unit_id || 'uom-pcs',
      quantity: 50,
      referenceId: `CH-${Math.floor(1000 + Math.random() * 9000)}`,
      notes: 'Site delivery consignment'
    });
    setIsDispatchModalOpen(true);
  };

  const handleOpenReturn = (cId?: string, pId?: string) => {
    setOperationError('');
    setReturnForm({
      customerId: cId || selectedCustomerId,
      productId: pId || allProducts[0]?.id || 'prod-1',
      unitId: products[pId || allProducts[0]?.id || 'prod-1']?.primary_unit_id || 'uom-pcs',
      quantity: 10,
      referenceId: `RET-${Math.floor(100 + Math.random() * 900)}`,
      notes: 'Surplus site return'
    });
    setIsReturnModalOpen(true);
  };

  const handleConfirmDispatch = (e: React.FormEvent) => {
    e.preventDefault();
    setOperationError('');

    const res = dispatchInventoryToCustomer({
      customerId: dispatchForm.customerId,
      productId: dispatchForm.productId,
      unitId: dispatchForm.unitId,
      quantity: Number(dispatchForm.quantity),
      referenceId: dispatchForm.referenceId,
      notes: dispatchForm.notes
    });

    if (!res.success) {
      setOperationError(res.error || 'Dispatch failed');
    } else {
      setIsDispatchModalOpen(false);
    }
  };

  const handleConfirmReturn = (e: React.FormEvent) => {
    e.preventDefault();
    setOperationError('');

    const res = createCustomerReturn({
      customerId: returnForm.customerId,
      productId: returnForm.productId,
      unitId: returnForm.unitId,
      quantity: Number(returnForm.quantity),
      referenceId: returnForm.referenceId,
      notes: returnForm.notes
    });

    if (!res.success) {
      setOperationError(res.error || 'Return failed');
    } else {
      setIsReturnModalOpen(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-white border border-neutral-200 rounded-lg shadow-2xs">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-neutral-950">Customer Inventory &amp; Consignments</h1>
          <p className="text-xs text-neutral-500 font-mono mt-0.5">
            Atomic stock dispatch/return • Explicit unbilled vs. holding reconciliation
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleOpenReturn()}
            className="px-3 py-1.5 text-xs font-medium text-neutral-700 bg-white border border-neutral-300 rounded hover:bg-neutral-50 flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5 text-neutral-500" />
            <span>Record Customer Return</span>
          </button>

          <button
            onClick={() => handleOpenDispatch()}
            className="px-3.5 py-1.5 text-xs font-semibold bg-neutral-900 text-white rounded hover:bg-neutral-800 transition-colors flex items-center gap-1.5 shadow-2xs"
          >
            <Truck className="w-3.5 h-3.5" />
            <span>Dispatch to Customer</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-neutral-200 gap-6 text-xs font-medium text-neutral-500">
        <button
          onClick={() => setActiveTab('holdings')}
          className={`pb-2.5 transition-colors border-b-2 -mb-px ${
            activeTab === 'holdings'
              ? 'border-neutral-900 text-neutral-900 font-semibold'
              : 'border-transparent hover:text-neutral-800'
          }`}
        >
          Customer Holdings Reconciliation
        </button>
        <button
          onClick={() => setActiveTab('movements')}
          className={`pb-2.5 transition-colors border-b-2 -mb-px ${
            activeTab === 'movements'
              ? 'border-neutral-900 text-neutral-900 font-semibold'
              : 'border-transparent hover:text-neutral-800'
          }`}
        >
          Customer Movement Ledger ({allCustomerMovements.length})
        </button>
      </div>

      {/* Tab 1: Holdings Reconciliation */}
      {activeTab === 'holdings' && (
        <div className="space-y-4">
          {/* Customer Selector Card */}
          <div className="p-4 bg-white border border-neutral-200 rounded-lg flex flex-col sm:flex-row items-center justify-between gap-3 shadow-2xs">
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <Building className="w-4 h-4 text-neutral-500" />
              <label className="text-xs font-semibold text-neutral-700 whitespace-nowrap">
                Select Client Site:
              </label>
              <select
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(e.target.value)}
                className="p-1.5 text-xs border border-neutral-300 rounded bg-white text-neutral-900 font-medium focus:ring-1 focus:ring-neutral-900 focus:outline-none min-w-[260px]"
              >
                {allCustomers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.customer_name} ({c.city})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              {onOpenBillingForCustomer && (
                <button
                  onClick={() => onOpenBillingForCustomer(selectedCustomerId)}
                  className="px-3 py-1.5 text-xs font-semibold bg-neutral-900 text-white rounded hover:bg-neutral-800 flex items-center gap-1.5"
                >
                  <FileCheck className="w-3.5 h-3.5" />
                  <span>Generate Invoice for Unbilled</span>
                </button>
              )}
            </div>
          </div>

          {/* Holdings Breakdown Table */}
          <div className="bg-white border border-neutral-200 rounded-lg shadow-2xs overflow-hidden">
            <div className="p-3 border-b border-neutral-200 bg-neutral-50/70 flex justify-between items-center text-xs">
              <div className="font-semibold text-neutral-800">
                Inventory Held at {customers[selectedCustomerId]?.customer_name}
              </div>
              <div className="font-mono text-neutral-500 text-[11px]">
                Rule 56: Current Inventory ≠ Unbilled Inventory (Derived via allocations)
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-neutral-200 bg-neutral-50/80 font-mono text-neutral-600 text-[11px]">
                    <th className="py-3 px-4">Product Name</th>
                    <th className="py-3 px-3">SKU</th>
                    <th className="py-3 px-3 text-right">Dispatched In</th>
                    <th className="py-3 px-3 text-right">Returned Out</th>
                    <th className="py-3 px-3 text-right">Physically Held</th>
                    <th className="py-3 px-3 text-right">Allocated / Billed</th>
                    <th className="py-3 px-3 text-right">Remaining Billable</th>
                    <th className="py-3 px-4 text-right">Quick Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 font-sans">
                  {selectedCustomerSummary.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-neutral-400">
                        No inventory consignments or movements recorded for this customer yet.
                      </td>
                    </tr>
                  ) : (
                    selectedCustomerSummary.map((item) => (
                      <tr key={item.productId} className="hover:bg-neutral-50/70">
                        <td className="py-3 px-4 font-semibold text-neutral-900">
                          {item.productName}
                        </td>
                        <td className="py-3 px-3 font-mono text-neutral-500 text-[11px]">
                          {item.sku}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-neutral-700">
                          {item.totalReceived} {item.unitCode}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-neutral-700">
                          {item.totalReturned} {item.unitCode}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-neutral-900">
                          {item.currentBalance} {item.unitCode}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-emerald-800">
                          {item.billedQuantity} {item.unitCode}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-amber-900">
                          {item.unbilledQuantity} {item.unitCode}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex justify-end gap-1.5">
                            <button
                              onClick={() => handleOpenReturn(selectedCustomerId, item.productId)}
                              className="px-2 py-1 text-[11px] text-neutral-700 bg-white border border-neutral-300 rounded hover:bg-neutral-100"
                              title="Process return from this client site"
                            >
                              Return
                            </button>
                            {onOpenBillingForCustomer && item.unbilledQuantity > 0 && (
                              <button
                                onClick={() => onOpenBillingForCustomer(selectedCustomerId)}
                                className="px-2 py-1 text-[11px] font-medium bg-neutral-900 text-white rounded hover:bg-neutral-800"
                                title="Open billing allocation"
                              >
                                Bill
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Customer Movement Ledger */}
      {activeTab === 'movements' && (
        <div className="bg-white border border-neutral-200 rounded-lg shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50/80 font-mono text-neutral-600 text-[11px]">
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-3">Customer Entity</th>
                  <th className="py-3 px-3">Product</th>
                  <th className="py-3 px-3">Movement Type</th>
                  <th className="py-3 px-3 text-right">Quantity</th>
                  <th className="py-3 px-3">Challan / Reference</th>
                  <th className="py-3 px-4 text-neutral-500">Created By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 font-sans">
                {allCustomerMovements.map((mov) => {
                  const cust = customers[mov.customer_id];
                  const prod = products[mov.product_id];
                  const uom = uoms[mov.unit_id];
                  const isDispatch = mov.movement_type === 'DISPATCH' || mov.movement_type === 'ADJUSTMENT_IN';

                  return (
                    <tr key={mov.id} className="hover:bg-neutral-50/70 font-mono text-[11px]">
                      <td className="py-3 px-4 text-neutral-500">
                        {new Date(mov.movement_date).toLocaleDateString()}
                      </td>

                      <td className="py-3 px-3 font-sans font-semibold text-neutral-900">
                        {cust?.customer_name || 'Client'}
                      </td>

                      <td className="py-3 px-3 font-sans text-neutral-800">
                        {prod?.product_name || 'Item'}
                      </td>

                      <td className="py-3 px-3">
                        <Badge variant={isDispatch ? 'success' : 'neutral'}>
                          {mov.movement_type}
                        </Badge>
                      </td>

                      <td className="py-3 px-3 text-right font-bold">
                        <span className={isDispatch ? 'text-emerald-700' : 'text-neutral-900'}>
                          {isDispatch ? '+' : '-'}
                          {mov.quantity}
                        </span>{' '}
                        <span className="text-[10px] text-neutral-500 font-normal">{uom?.code}</span>
                      </td>

                      <td className="py-3 px-3 font-sans text-neutral-600">
                        <div>Ref: #{mov.reference_id}</div>
                        <div className="text-[10px] text-neutral-400">{mov.notes}</div>
                      </td>

                      <td className="py-3 px-4 text-neutral-500">{mov.created_by}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Dispatch Modal */}
      <Modal
        isOpen={isDispatchModalOpen}
        onClose={() => setIsDispatchModalOpen(false)}
        title="Dispatch Inventory to Customer"
        subtitle="Deducts company warehouse stock and credits customer consignment balance atomically"
        maxWidth="lg"
      >
        <form onSubmit={handleConfirmDispatch} className="space-y-4 text-xs">
          {operationError && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded">
              {operationError}
            </div>
          )}

          <div>
            <label className="block font-semibold text-neutral-700 mb-1">Customer / Consignee</label>
            <select
              value={dispatchForm.customerId}
              onChange={(e) => setDispatchForm({ ...dispatchForm, customerId: e.target.value })}
              className="w-full p-2 border border-neutral-300 rounded bg-white text-xs"
            >
              {allCustomers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.customer_name} ({c.city})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-neutral-700 mb-1">Product</label>
            <select
              value={dispatchForm.productId}
              onChange={(e) => {
                const p = products[e.target.value];
                setDispatchForm({
                  ...dispatchForm,
                  productId: e.target.value,
                  unitId: p ? p.primary_unit_id : 'uom-pcs'
                });
              }}
              className="w-full p-2 border border-neutral-300 rounded bg-white text-xs"
            >
              {allProducts.map((p) => {
                const stock = getCurrentCompanyStock(p.id);
                return (
                  <option key={p.id} value={p.id}>
                    {p.product_name} (Warehouse Stock: {stock} {uoms[p.primary_unit_id]?.code})
                  </option>
                );
              })}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-neutral-700 mb-1">Dispatch Quantity</label>
              <input
                type="number"
                min="1"
                required
                value={dispatchForm.quantity}
                onChange={(e) => setDispatchForm({ ...dispatchForm, quantity: Number(e.target.value) })}
                className="w-full p-2 border border-neutral-300 rounded font-mono"
              />
            </div>

            <div>
              <label className="block font-semibold text-neutral-700 mb-1">Delivery Challan Number</label>
              <input
                type="text"
                required
                value={dispatchForm.referenceId}
                onChange={(e) => setDispatchForm({ ...dispatchForm, referenceId: e.target.value })}
                className="w-full p-2 border border-neutral-300 rounded font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-neutral-700 mb-1">Notes / Transporter Info</label>
            <input
              type="text"
              value={dispatchForm.notes}
              onChange={(e) => setDispatchForm({ ...dispatchForm, notes: e.target.value })}
              className="w-full p-2 border border-neutral-300 rounded"
              placeholder="e.g. Transporter vehicle GJ-05-AB-1234, Site Gate 3"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-neutral-200">
            <button
              type="button"
              onClick={() => setIsDispatchModalOpen(false)}
              className="px-3.5 py-1.5 text-neutral-700 border border-neutral-300 rounded hover:bg-neutral-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 font-semibold bg-neutral-900 text-white rounded hover:bg-neutral-800"
            >
              Confirm Dispatch
            </button>
          </div>
        </form>
      </Modal>

      {/* Return Modal */}
      <Modal
        isOpen={isReturnModalOpen}
        onClose={() => setIsReturnModalOpen(false)}
        title="Record Customer Material Return"
        subtitle="Credits company warehouse and reduces customer held balance"
        maxWidth="lg"
      >
        <form onSubmit={handleConfirmReturn} className="space-y-4 text-xs">
          {operationError && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded">
              {operationError}
            </div>
          )}

          <div>
            <label className="block font-semibold text-neutral-700 mb-1">Customer / Consignee</label>
            <select
              value={returnForm.customerId}
              onChange={(e) => setReturnForm({ ...returnForm, customerId: e.target.value })}
              className="w-full p-2 border border-neutral-300 rounded bg-white text-xs"
            >
              {allCustomers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.customer_name} ({c.city})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-neutral-700 mb-1">Product</label>
            <select
              value={returnForm.productId}
              onChange={(e) => {
                const p = products[e.target.value];
                setReturnForm({
                  ...returnForm,
                  productId: e.target.value,
                  unitId: p ? p.primary_unit_id : 'uom-pcs'
                });
              }}
              className="w-full p-2 border border-neutral-300 rounded bg-white text-xs"
            >
              {allProducts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.product_name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-neutral-700 mb-1">Return Quantity</label>
              <input
                type="number"
                min="1"
                required
                value={returnForm.quantity}
                onChange={(e) => setReturnForm({ ...returnForm, quantity: Number(e.target.value) })}
                className="w-full p-2 border border-neutral-300 rounded font-mono"
              />
            </div>

            <div>
              <label className="block font-semibold text-neutral-700 mb-1">Return Challan Reference</label>
              <input
                type="text"
                required
                value={returnForm.referenceId}
                onChange={(e) => setReturnForm({ ...returnForm, referenceId: e.target.value })}
                className="w-full p-2 border border-neutral-300 rounded font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-neutral-700 mb-1">Return Reason / Notes</label>
            <input
              type="text"
              value={returnForm.notes}
              onChange={(e) => setReturnForm({ ...returnForm, notes: e.target.value })}
              className="w-full p-2 border border-neutral-300 rounded"
              placeholder="e.g. Surplus site rod returned, undamaged"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-neutral-200">
            <button
              type="button"
              onClick={() => setIsReturnModalOpen(false)}
              className="px-3.5 py-1.5 text-neutral-700 border border-neutral-300 rounded hover:bg-neutral-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 font-semibold bg-neutral-900 text-white rounded hover:bg-neutral-800"
            >
              Accept Return
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
