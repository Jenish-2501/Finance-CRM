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
  FileCheck,
  Printer,
  FileText,
  Trash2,
  PlusCircle
} from 'lucide-react';
import { Modal } from '../components/common/Modal';
import { Badge } from '../components/common/Badge';
import { DeliveryChallanPrintView } from '../components/challan/DeliveryChallanPrintView';

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
    dispatchBatchInventoryToCustomer,
    createCustomerReturn,
    getCustomerInventorySummary,
    getCurrentCompanyStock
  } = useAccountingStore();

  const [activeTab, setActiveTab] = useState<'holdings' | 'movements'>('holdings');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('cust-1');
  const [isDispatchModalOpen, setIsDispatchModalOpen] = useState(false);
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [selectedChallanRef, setSelectedChallanRef] = useState<string | null>(null);
  const [operationError, setOperationError] = useState('');

  // Dispatch Form State
  const [dispatchForm, setDispatchForm] = useState({
    customerId: 'cust-1',
    referenceId: `CH-${Math.floor(1000 + Math.random() * 9000)}`,
    vehicleNumber: 'GJ-05-BX-4921',
    transporterName: 'ABC Logistics / Road Transport',
    ewayBillNumber: '',
    dispatchPurpose: 'Consignment Transfer (Rule 55)',
    notes: 'Direct site consignment dispatch',
    items: [
      {
        productId: 'prod-1',
        unitId: 'uom-pcs',
        quantity: 50
      }
    ]
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

  const handleOpenDispatch = (cId?: string, pId?: string) => {
    setOperationError('');
    const targetProd = pId ? products[pId] : allProducts[0];
    setDispatchForm({
      customerId: cId || selectedCustomerId,
      referenceId: `CH-${Math.floor(1000 + Math.random() * 9000)}`,
      vehicleNumber: 'GJ-05-BX-4921',
      transporterName: 'ABC Logistics / Road Transport',
      ewayBillNumber: '',
      dispatchPurpose: 'Consignment Transfer (Rule 55)',
      notes: 'Site delivery consignment',
      items: [
        {
          productId: targetProd?.id || 'prod-1',
          unitId: targetProd?.primary_unit_id || 'uom-pcs',
          quantity: 50
        }
      ]
    });
    setIsDispatchModalOpen(true);
  };

  const handleAddDispatchItem = () => {
    const defaultProd = allProducts[0];
    setDispatchForm({
      ...dispatchForm,
      items: [
        ...dispatchForm.items,
        {
          productId: defaultProd?.id || 'prod-1',
          unitId: defaultProd?.primary_unit_id || 'uom-pcs',
          quantity: 20
        }
      ]
    });
  };

  const handleRemoveDispatchItem = (index: number) => {
    if (dispatchForm.items.length <= 1) return;
    setDispatchForm({
      ...dispatchForm,
      items: dispatchForm.items.filter((_, idx) => idx !== index)
    });
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

    if (dispatchForm.items.length === 0) {
      setOperationError('Please add at least one product item to dispatch.');
      return;
    }

    const res = dispatchBatchInventoryToCustomer({
      customerId: dispatchForm.customerId,
      referenceId: dispatchForm.referenceId.trim(),
      vehicleNumber: dispatchForm.vehicleNumber.trim(),
      transporterName: dispatchForm.transporterName.trim(),
      ewayBillNumber: dispatchForm.ewayBillNumber.trim(),
      dispatchPurpose: dispatchForm.dispatchPurpose,
      notes: dispatchForm.notes.trim(),
      items: dispatchForm.items.map((it) => ({
        productId: it.productId,
        unitId: it.unitId,
        quantity: Number(it.quantity)
      }))
    });

    if (!res.success) {
      setOperationError(res.error || 'Dispatch failed');
    } else {
      setIsDispatchModalOpen(false);
      // Immediately open generated Delivery Challan for print & preview
      if (res.referenceId) {
        setSelectedChallanRef(res.referenceId);
      }
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
                          <div className="flex justify-end items-center gap-1.5">
                            <button
                              onClick={() => handleOpenDispatch(selectedCustomerId, item.productId)}
                              className="px-2.5 py-1 text-[11px] font-semibold bg-neutral-900 text-white rounded hover:bg-neutral-800 flex items-center gap-1 shadow-2xs cursor-pointer"
                              title="Dispatch stock to this client with Delivery Challan"
                            >
                              <Truck className="w-3 h-3 text-neutral-300" />
                              <span>Dispatch</span>
                            </button>
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
                                className="px-2 py-1 text-[11px] font-medium bg-emerald-700 text-white rounded hover:bg-emerald-800"
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
                  <th className="py-3 px-3">Challan / Transporter</th>
                  <th className="py-3 px-3 text-center">Delivery Challan</th>
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
                        <div className="font-semibold text-neutral-900 font-mono">Ref: #{mov.reference_id}</div>
                        <div className="text-[10px] text-neutral-400">
                          {mov.vehicle_number ? `Vehicle: ${mov.vehicle_number} • ` : ''}
                          {mov.notes}
                        </div>
                      </td>

                      <td className="py-3 px-3 text-center">
                        {isDispatch ? (
                          <button
                            onClick={() => setSelectedChallanRef(mov.reference_id)}
                            className="px-2.5 py-1 text-[11px] font-semibold bg-neutral-900 text-white rounded hover:bg-neutral-800 transition-colors inline-flex items-center gap-1.5 shadow-2xs cursor-pointer"
                            title="Print / View GST Delivery Challan"
                          >
                            <Printer className="w-3.5 h-3.5 text-neutral-300" />
                            <span>Print Challan</span>
                          </button>
                        ) : (
                          <span className="text-[10px] font-mono text-neutral-400">Return Slip</span>
                        )}
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

      {/* Dispatch Modal with Logistics and Multi-Item Support */}
      <Modal
        isOpen={isDispatchModalOpen}
        onClose={() => setIsDispatchModalOpen(false)}
        title="Create Customer Dispatch & Delivery Challan"
        subtitle="Rule 55 CGST Delivery Challan generation with atomic company-to-customer stock transfer"
        maxWidth="2xl"
      >
        <form onSubmit={handleConfirmDispatch} className="space-y-4 text-xs">
          {operationError && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded font-medium">
              {operationError}
            </div>
          )}

          {/* Consignee and Challan Header */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-neutral-50 border border-neutral-200 rounded">
            <div className="sm:col-span-2">
              <label className="block font-semibold text-neutral-700 mb-1">Customer / Consignee *</label>
              <select
                value={dispatchForm.customerId}
                onChange={(e) => setDispatchForm({ ...dispatchForm, customerId: e.target.value })}
                className="w-full p-2 border border-neutral-300 rounded bg-white text-xs"
              >
                {allCustomers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.customer_name} ({c.city}, GST: {c.gst_number || 'N/A'})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-neutral-700 mb-1">Challan Number *</label>
              <input
                type="text"
                required
                value={dispatchForm.referenceId}
                onChange={(e) => setDispatchForm({ ...dispatchForm, referenceId: e.target.value })}
                className="w-full p-2 border border-neutral-300 rounded font-mono font-bold"
                placeholder="e.g. CH-2026-1001"
              />
            </div>
          </div>

          {/* Logistics & Transporter Details */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-semibold text-neutral-700 mb-1">Vehicle Number</label>
              <input
                type="text"
                value={dispatchForm.vehicleNumber}
                onChange={(e) => setDispatchForm({ ...dispatchForm, vehicleNumber: e.target.value })}
                className="w-full p-2 border border-neutral-300 rounded font-mono"
                placeholder="e.g. GJ-05-BX-4921"
              />
            </div>

            <div>
              <label className="block font-semibold text-neutral-700 mb-1">Transporter Name</label>
              <input
                type="text"
                value={dispatchForm.transporterName}
                onChange={(e) => setDispatchForm({ ...dispatchForm, transporterName: e.target.value })}
                className="w-full p-2 border border-neutral-300 rounded"
                placeholder="e.g. ABC Logistics"
              />
            </div>

            <div>
              <label className="block font-semibold text-neutral-700 mb-1">E-Way Bill Number (if any)</label>
              <input
                type="text"
                value={dispatchForm.ewayBillNumber}
                onChange={(e) => setDispatchForm({ ...dispatchForm, ewayBillNumber: e.target.value })}
                className="w-full p-2 border border-neutral-300 rounded font-mono"
                placeholder="e.g. 241098492019"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-neutral-700 mb-1">Nature of Movement / Purpose</label>
              <select
                value={dispatchForm.dispatchPurpose}
                onChange={(e) => setDispatchForm({ ...dispatchForm, dispatchPurpose: e.target.value })}
                className="w-full p-2 border border-neutral-300 rounded bg-white"
              >
                <option value="Consignment Transfer (Rule 55)">Consignment Transfer (Rule 55)</option>
                <option value="Customer Site Storage & Holding">Customer Site Storage &amp; Holding</option>
                <option value="Supply on Approval / Testing">Supply on Approval / Testing</option>
                <option value="Job Work / Processing">Job Work / Processing</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-neutral-700 mb-1">Gate / Site Instructions</label>
              <input
                type="text"
                value={dispatchForm.notes}
                onChange={(e) => setDispatchForm({ ...dispatchForm, notes: e.target.value })}
                className="w-full p-2 border border-neutral-300 rounded"
                placeholder="e.g. Direct site unload via Gate 2"
              />
            </div>
          </div>

          {/* Items Section */}
          <div className="border border-neutral-200 rounded p-3 bg-neutral-50/50 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-neutral-900 uppercase text-[11px] tracking-wider flex items-center gap-1.5">
                <Truck className="w-3.5 h-3.5 text-neutral-700" />
                Goods to Dispatch ({dispatchForm.items.length} Product{dispatchForm.items.length > 1 ? 's' : ''})
              </span>
              <button
                type="button"
                onClick={handleAddDispatchItem}
                className="px-2.5 py-1 text-[11px] font-semibold bg-white border border-neutral-300 rounded hover:bg-neutral-100 flex items-center gap-1 text-neutral-800 cursor-pointer"
              >
                <PlusCircle className="w-3 h-3 text-neutral-600" />
                <span>+ Add Item to Challan</span>
              </button>
            </div>

            <div className="space-y-2">
              {dispatchForm.items.map((item, idx) => {
                const selectedProd = products[item.productId];
                const availableStock = selectedProd ? getCurrentCompanyStock(selectedProd.id) : 0;
                const prodUom = selectedProd ? uoms[selectedProd.primary_unit_id] : null;

                return (
                  <div
                    key={idx}
                    className="p-3 bg-white border border-neutral-200 rounded grid grid-cols-12 gap-2 items-center"
                  >
                    <div className="col-span-12 sm:col-span-6">
                      <label className="block text-[10px] font-mono text-neutral-500 mb-0.5">
                        Product Item #{idx + 1}
                      </label>
                      <select
                        value={item.productId}
                        onChange={(e) => {
                          const newProdId = e.target.value;
                          const p = products[newProdId];
                          const newItems = [...dispatchForm.items];
                          newItems[idx] = {
                            ...newItems[idx],
                            productId: newProdId,
                            unitId: p ? p.primary_unit_id : 'uom-pcs'
                          };
                          setDispatchForm({ ...dispatchForm, items: newItems });
                        }}
                        className="w-full p-1.5 border border-neutral-300 rounded bg-white text-xs"
                      >
                        {allProducts.map((p) => {
                          const stock = getCurrentCompanyStock(p.id);
                          return (
                            <option key={p.id} value={p.id}>
                              {p.product_name} (Warehouse: {stock} {uoms[p.primary_unit_id]?.code})
                            </option>
                          );
                        })}
                      </select>
                      <div className="text-[10px] font-mono text-neutral-500 mt-0.5">
                        Available in Warehouse: <span className="font-bold text-neutral-800">{availableStock} {prodUom?.code}</span>
                      </div>
                    </div>

                    <div className="col-span-8 sm:col-span-4">
                      <label className="block text-[10px] font-mono text-neutral-500 mb-0.5">
                        Quantity ({prodUom?.code})
                      </label>
                      <input
                        type="number"
                        min="1"
                        required
                        value={item.quantity}
                        onChange={(e) => {
                          const newItems = [...dispatchForm.items];
                          newItems[idx] = {
                            ...newItems[idx],
                            quantity: Number(e.target.value)
                          };
                          setDispatchForm({ ...dispatchForm, items: newItems });
                        }}
                        className="w-full p-1.5 border border-neutral-300 rounded font-mono font-bold text-sm"
                      />
                    </div>

                    <div className="col-span-4 sm:col-span-2 flex justify-end items-end h-full pt-4">
                      {dispatchForm.items.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => handleRemoveDispatchItem(idx)}
                          className="p-1.5 text-neutral-400 hover:text-rose-600 rounded transition-colors cursor-pointer"
                          title="Remove item"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      ) : (
                        <span className="text-[10px] font-mono text-neutral-400">Primary</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-neutral-200">
            <span className="text-[11px] font-mono text-neutral-500 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              Will generate printable Delivery Challan immediately
            </span>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsDispatchModalOpen(false)}
                className="px-3.5 py-1.5 text-neutral-700 border border-neutral-300 rounded hover:bg-neutral-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 font-semibold bg-neutral-900 text-white rounded hover:bg-neutral-800 transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Confirm &amp; Generate Challan</span>
              </button>
            </div>
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
      {/* Global Delivery Challan Print & Preview Modal */}
      {selectedChallanRef && (
        <Modal
          isOpen={Boolean(selectedChallanRef)}
          onClose={() => setSelectedChallanRef(null)}
          title={`Delivery Challan #${selectedChallanRef}`}
          subtitle="Rule 55 CGST / SGST Delivery Challan for customer goods dispatch"
          maxWidth="full"
        >
          <DeliveryChallanPrintView
            challanReference={selectedChallanRef}
            onClose={() => setSelectedChallanRef(null)}
          />
        </Modal>
      )}
    </div>
  );
};
