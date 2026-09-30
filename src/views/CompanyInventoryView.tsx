import React, { useState } from 'react';
import { useAccountingStore } from '../store/accountingStore';
import { InventoryMovementType } from '../types/database';
import { formatINR } from '../utils/calculations';
import {
  Layers,
  Plus,
  Search,
  ArrowDownLeft,
  ArrowUpRight,
  RotateCcw,
  SlidersHorizontal,
  CheckCircle,
  FileSpreadsheet,
  Printer
} from 'lucide-react';
import { Modal } from '../components/common/Modal';
import { Badge } from '../components/common/Badge';
import { DeliveryChallanPrintView } from '../components/challan/DeliveryChallanPrintView';

export const CompanyInventoryView: React.FC = () => {
  const {
    products,
    uoms,
    getCurrentCompanyStock,
    inventoryMovements,
    createStockReceipt,
    createInventoryAdjustment,
    stockReceipts,
    customerInventoryMovements
  } = useAccountingStore();

  const [activeTab, setActiveTab] = useState<'balances' | 'movements' | 'receipts'>('balances');
  const [searchQuery, setSearchQuery] = useState('');
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [selectedChallanRef, setSelectedChallanRef] = useState<string | null>(null);

  // Stock Receipt Form
  const [receiptSupplier, setReceiptSupplier] = useState('');
  const [receiptRef, setReceiptRef] = useState('');
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().split('T')[0]);
  const [receiptNotes, setReceiptNotes] = useState('');
  const [receiptItems, setReceiptItems] = useState([
    { productId: 'prod-1', unitId: 'uom-pcs', quantity: 500, unitCost: 85 }
  ]);

  // Stock Adjustment Form
  const [adjustProductId, setAdjustProductId] = useState('prod-1');
  const [adjustQuantity, setAdjustQuantity] = useState(10);
  const [adjustType, setAdjustType] = useState<'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT'>('ADJUSTMENT_IN');
  const [adjustNotes, setAdjustNotes] = useState('');
  const [adjustError, setAdjustError] = useState('');

  const allProducts = Object.values(products);
  const filteredProducts = allProducts.filter((p) => {
    const q = searchQuery.toLowerCase();
    return p.product_name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
  });

  const movementsList = Object.values(inventoryMovements)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const handleOpenReceipt = () => {
    setReceiptSupplier('');
    setReceiptRef(`PO-${Math.floor(10000 + Math.random() * 90000)}`);
    setReceiptDate(new Date().toISOString().split('T')[0]);
    setReceiptNotes('');
    setReceiptItems([{ productId: allProducts[0]?.id || 'prod-1', unitId: 'uom-pcs', quantity: 500, unitCost: 100 }]);
    setIsReceiptModalOpen(true);
  };

  const handleAddReceiptItem = () => {
    setReceiptItems([
      ...receiptItems,
      { productId: allProducts[0]?.id || 'prod-1', unitId: 'uom-pcs', quantity: 100, unitCost: 50 }
    ]);
  };

  const handleRemoveReceiptItem = (index: number) => {
    if (receiptItems.length > 1) {
      setReceiptItems(receiptItems.filter((_, i) => i !== index));
    }
  };

  const handleSaveReceipt = (e: React.FormEvent) => {
    e.preventDefault();
    if (!receiptSupplier.trim() || receiptItems.length === 0) return;

    createStockReceipt(
      {
        supplierName: receiptSupplier.trim(),
        referenceNumber: receiptRef.trim(),
        receiptDate: new Date(receiptDate).toISOString(),
        notes: receiptNotes.trim()
      },
      receiptItems.map((item) => ({
        productId: item.productId,
        unitId: item.unitId,
        quantity: Number(item.quantity),
        unitCost: Number(item.unitCost)
      }))
    );

    setIsReceiptModalOpen(false);
  };

  const handleSaveAdjust = (e: React.FormEvent) => {
    e.preventDefault();
    setAdjustError('');
    const prod = products[adjustProductId];
    if (!prod) return;

    const result = createInventoryAdjustment({
      productId: adjustProductId,
      unitId: prod.primary_unit_id,
      quantity: Number(adjustQuantity),
      movementType: adjustType,
      notes: adjustNotes || 'Physical inventory reconciliation'
    });

    if (!result.success) {
      setAdjustError(result.error || 'Adjustment failed');
    } else {
      setIsAdjustModalOpen(false);
    }
  };

  const getMovementBadgeVariant = (type: InventoryMovementType) => {
    switch (type) {
      case 'STOCK_IN':
      case 'CUSTOMER_RETURN':
      case 'ADJUSTMENT_IN':
        return 'success';
      case 'CUSTOMER_DISPATCH':
      case 'ADJUSTMENT_OUT':
        return 'neutral';
      default:
        return 'neutral';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-white border border-neutral-200 rounded-lg shadow-2xs">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-neutral-950">Company Stock &amp; Warehouse Ledger</h1>
          <p className="text-xs text-neutral-500 font-mono mt-0.5">
            Strict ledger-based inventory • Current stock calculated as Σ(Inward - Outward)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsAdjustModalOpen(true)}
            className="px-3 py-1.5 text-xs font-medium text-neutral-700 bg-white border border-neutral-300 rounded hover:bg-neutral-50 flex items-center gap-1.5"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-neutral-500" />
            <span>Audit Adjustment</span>
          </button>

          <button
            onClick={handleOpenReceipt}
            className="px-3.5 py-1.5 text-xs font-semibold bg-neutral-900 text-white rounded hover:bg-neutral-800 transition-colors flex items-center gap-1.5 shadow-2xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Receive Inward Stock</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-neutral-200 gap-6 text-xs font-medium text-neutral-500">
        <button
          onClick={() => setActiveTab('balances')}
          className={`pb-2.5 transition-colors border-b-2 -mb-px ${
            activeTab === 'balances'
              ? 'border-neutral-900 text-neutral-900 font-semibold'
              : 'border-transparent hover:text-neutral-800'
          }`}
        >
          Warehouse Stock Balances ({allProducts.length})
        </button>
        <button
          onClick={() => setActiveTab('movements')}
          className={`pb-2.5 transition-colors border-b-2 -mb-px ${
            activeTab === 'movements'
              ? 'border-neutral-900 text-neutral-900 font-semibold'
              : 'border-transparent hover:text-neutral-800'
          }`}
        >
          Movement Ledger ({movementsList.length})
        </button>
        <button
          onClick={() => setActiveTab('receipts')}
          className={`pb-2.5 transition-colors border-b-2 -mb-px ${
            activeTab === 'receipts'
              ? 'border-neutral-900 text-neutral-900 font-semibold'
              : 'border-transparent hover:text-neutral-800'
          }`}
        >
          Stock Receipts ({Object.keys(stockReceipts).length})
        </button>
      </div>

      {/* Tab 1: Current Stock Balances */}
      {activeTab === 'balances' && (
        <div className="bg-white border border-neutral-200 rounded-lg shadow-2xs overflow-hidden">
          <div className="p-3 border-b border-neutral-200 bg-neutral-50/50 flex justify-between items-center">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Filter items..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1 text-xs border border-neutral-300 rounded focus:ring-1 focus:ring-neutral-900 focus:outline-none w-56 bg-white"
              />
            </div>
            <span className="text-[11px] font-mono text-neutral-500">
              Rule 13: Calculated purely from movements (No stored current_stock field)
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50/80 font-mono text-neutral-600 text-[11px]">
                  <th className="py-3 px-4">Product Name</th>
                  <th className="py-3 px-3">SKU</th>
                  <th className="py-3 px-3">Base UOM</th>
                  <th className="py-3 px-3 text-right">Available Warehouse Stock</th>
                  <th className="py-3 px-3 text-center">Stock Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 font-sans">
                {filteredProducts.map((prod) => {
                  const stock = getCurrentCompanyStock(prod.id);
                  const uom = uoms[prod.primary_unit_id];
                  const isLow = stock < 50;

                  return (
                    <tr key={prod.id} className="hover:bg-neutral-50/70">
                      <td className="py-3 px-4 font-semibold text-neutral-900">
                        {prod.product_name}
                      </td>
                      <td className="py-3 px-3 font-mono text-neutral-600 text-[11px]">{prod.sku}</td>
                      <td className="py-3 px-3 font-mono">
                        <Badge variant="neutral">{uom?.code || 'PCS'}</Badge>
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-sm">
                        <span className={stock > 0 ? 'text-neutral-950' : 'text-rose-600'}>
                          {stock.toLocaleString()}
                        </span>{' '}
                        <span className="text-xs font-normal text-neutral-500">{uom?.code}</span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <Badge variant={stock > 0 ? (isLow ? 'warning' : 'success') : 'danger'}>
                          {stock > 0 ? (isLow ? 'LOW STOCK' : 'IN STOCK') : 'DEPLETED'}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Movement Ledger */}
      {activeTab === 'movements' && (
        <div className="bg-white border border-neutral-200 rounded-lg shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50/80 font-mono text-neutral-600 text-[11px]">
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-3">Product</th>
                  <th className="py-3 px-3">Movement Type</th>
                  <th className="py-3 px-3 text-right">Quantity</th>
                  <th className="py-3 px-3">Reference / Notes</th>
                  <th className="py-3 px-4 font-mono text-[11px]">Audit By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 font-sans">
                {movementsList.map((mov) => {
                  const prod = products[mov.product_id];
                  const uom = uoms[mov.unit_id];
                  const isPositive =
                    mov.movement_type === 'STOCK_IN' ||
                    mov.movement_type === 'CUSTOMER_RETURN' ||
                    mov.movement_type === 'ADJUSTMENT_IN';

                  return (
                    <tr key={mov.id} className="hover:bg-neutral-50/70 font-mono text-[11px]">
                      <td className="py-3 px-4 text-neutral-500">
                        {new Date(mov.movement_date).toLocaleDateString()}
                      </td>

                      <td className="py-3 px-3 font-sans font-semibold text-neutral-900">
                        {prod?.product_name || 'Item'}
                        <div className="text-[10px] font-mono text-neutral-400">{prod?.sku}</div>
                      </td>

                      <td className="py-3 px-3">
                        <Badge variant={getMovementBadgeVariant(mov.movement_type)}>
                          {mov.movement_type.replace('_', ' ')}
                        </Badge>
                      </td>

                      <td className="py-3 px-3 text-right font-bold">
                        <span className={isPositive ? 'text-emerald-700' : 'text-neutral-900'}>
                          {isPositive ? '+' : '-'}
                          {mov.quantity}
                        </span>{' '}
                        <span className="text-[10px] text-neutral-500 font-normal">{uom?.code}</span>
                      </td>

                      <td className="py-3 px-3 font-sans text-neutral-600">
                        <div>{mov.notes}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] font-mono text-neutral-400">Ref: #{mov.reference_id}</span>
                          {mov.movement_type === 'CUSTOMER_DISPATCH' && (
                            <button
                              onClick={() => {
                                const cim = customerInventoryMovements[mov.reference_id];
                                setSelectedChallanRef(cim?.reference_id || mov.reference_id);
                              }}
                              className="px-2 py-0.5 text-[10px] font-semibold bg-neutral-900 text-white rounded hover:bg-neutral-800 inline-flex items-center gap-1 shadow-2xs cursor-pointer"
                              title="Print / View Delivery Challan"
                            >
                              <Printer className="w-3 h-3" />
                              <span>Challan</span>
                            </button>
                          )}
                        </div>
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

      {/* Tab 3: Stock Receipts */}
      {activeTab === 'receipts' && (
        <div className="bg-white border border-neutral-200 rounded-lg shadow-2xs overflow-hidden">
          <div className="divide-y divide-neutral-200 text-xs">
            {Object.values(stockReceipts).map((sr) => (
              <div key={sr.id} className="p-4 hover:bg-neutral-50 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 font-mono">
                    <span className="font-bold text-neutral-950 text-sm">{sr.receipt_number}</span>
                    <Badge variant="success">{sr.status}</Badge>
                    <span className="text-neutral-500">Ref: {sr.reference_number || 'N/A'}</span>
                  </div>
                  <div className="text-neutral-700 font-medium mt-1">Supplier: {sr.supplier_name}</div>
                  <div className="text-neutral-500 text-[11px] mt-0.5">{sr.notes}</div>
                </div>

                <div className="text-right font-mono text-neutral-500">
                  {new Date(sr.receipt_date).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Receive Inward Stock Modal */}
      <Modal
        isOpen={isReceiptModalOpen}
        onClose={() => setIsReceiptModalOpen(false)}
        title="Receive Company Stock (Inward)"
        subtitle="Generates stock receipt and logs STOCK_IN movements"
        maxWidth="2xl"
      >
        <form onSubmit={handleSaveReceipt} className="space-y-4 text-xs">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block font-semibold text-neutral-700 mb-1">Supplier / Vendor Name *</label>
              <input
                type="text"
                required
                value={receiptSupplier}
                onChange={(e) => setReceiptSupplier(e.target.value)}
                className="w-full p-2 border border-neutral-300 rounded"
                placeholder="e.g. Gujarat Steel & Alloys Corporation"
              />
            </div>

            <div>
              <label className="block font-semibold text-neutral-700 mb-1">Receipt Date</label>
              <input
                type="date"
                required
                value={receiptDate}
                onChange={(e) => setReceiptDate(e.target.value)}
                className="w-full p-2 border border-neutral-300 rounded font-mono"
              />
            </div>

            <div>
              <label className="block font-semibold text-neutral-700 mb-1">PO / Delivery Challan Ref</label>
              <input
                type="text"
                value={receiptRef}
                onChange={(e) => setReceiptRef(e.target.value)}
                className="w-full p-2 border border-neutral-300 rounded font-mono"
              />
            </div>

            <div className="col-span-2">
              <label className="block font-semibold text-neutral-700 mb-1">Notes / Remarks</label>
              <input
                type="text"
                value={receiptNotes}
                onChange={(e) => setReceiptNotes(e.target.value)}
                className="w-full p-2 border border-neutral-300 rounded"
                placeholder="Consignment inspection comments"
              />
            </div>
          </div>

          {/* Items */}
          <div className="border-t border-neutral-200 pt-3">
            <div className="flex justify-between items-center mb-2">
              <span className="font-semibold text-neutral-800 uppercase tracking-wide text-[11px]">
                Inward Stock Items
              </span>
              <button
                type="button"
                onClick={handleAddReceiptItem}
                className="px-2 py-1 text-[11px] font-semibold bg-neutral-100 hover:bg-neutral-200 border border-neutral-300 rounded"
              >
                + Add Another Item
              </button>
            </div>

            <div className="space-y-2">
              {receiptItems.map((item, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-12 gap-2 items-center p-2.5 bg-neutral-50 border border-neutral-200 rounded"
                >
                  <div className="col-span-5">
                    <label className="block text-[10px] text-neutral-500 mb-0.5">Product</label>
                    <select
                      value={item.productId}
                      onChange={(e) => {
                        const updated = [...receiptItems];
                        updated[idx].productId = e.target.value;
                        const p = products[e.target.value];
                        if (p) updated[idx].unitId = p.primary_unit_id;
                        setReceiptItems(updated);
                      }}
                      className="w-full p-1.5 border border-neutral-300 rounded bg-white text-xs"
                    >
                      {allProducts.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.product_name} ({p.sku})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="col-span-3">
                    <label className="block text-[10px] text-neutral-500 mb-0.5">Quantity</label>
                    <input
                      type="number"
                      min="1"
                      required
                      value={item.quantity}
                      onChange={(e) => {
                        const updated = [...receiptItems];
                        updated[idx].quantity = Number(e.target.value);
                        setReceiptItems(updated);
                      }}
                      className="w-full p-1.5 border border-neutral-300 rounded font-mono"
                    />
                  </div>

                  <div className="col-span-3">
                    <label className="block text-[10px] text-neutral-500 mb-0.5">Unit Cost (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={item.unitCost}
                      onChange={(e) => {
                        const updated = [...receiptItems];
                        updated[idx].unitCost = Number(e.target.value);
                        setReceiptItems(updated);
                      }}
                      className="w-full p-1.5 border border-neutral-300 rounded font-mono"
                    />
                  </div>

                  <div className="col-span-1 pt-4 text-center">
                    {receiptItems.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveReceiptItem(idx)}
                        className="text-neutral-400 hover:text-rose-600 font-bold"
                        title="Remove line"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-neutral-200">
            <button
              type="button"
              onClick={() => setIsReceiptModalOpen(false)}
              className="px-3.5 py-1.5 text-neutral-700 border border-neutral-300 rounded hover:bg-neutral-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 font-semibold bg-neutral-900 text-white rounded hover:bg-neutral-800"
            >
              Confirm Receipt
            </button>
          </div>
        </form>
      </Modal>

      {/* Audit Adjustment Modal */}
      <Modal
        isOpen={isAdjustModalOpen}
        onClose={() => setIsAdjustModalOpen(false)}
        title="Physical Inventory Adjustment"
        subtitle="Compensating ledger movement for audit corrections"
        maxWidth="md"
      >
        <form onSubmit={handleSaveAdjust} className="space-y-4 text-xs">
          {adjustError && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded">
              {adjustError}
            </div>
          )}

          <div>
            <label className="block font-semibold text-neutral-700 mb-1">Product</label>
            <select
              value={adjustProductId}
              onChange={(e) => setAdjustProductId(e.target.value)}
              className="w-full p-2 border border-neutral-300 rounded bg-white text-xs"
            >
              {allProducts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.product_name} (Current: {getCurrentCompanyStock(p.id)})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-neutral-700 mb-1">Adjustment Direction</label>
            <div className="grid grid-cols-2 gap-2">
              <label
                className={`p-2 border rounded text-center cursor-pointer ${
                  adjustType === 'ADJUSTMENT_IN'
                    ? 'border-neutral-900 bg-neutral-900 text-white font-semibold'
                    : 'border-neutral-300 bg-white text-neutral-700'
                }`}
              >
                <input
                  type="radio"
                  name="adjType"
                  value="ADJUSTMENT_IN"
                  checked={adjustType === 'ADJUSTMENT_IN'}
                  onChange={() => setAdjustType('ADJUSTMENT_IN')}
                  className="hidden"
                />
                + Adjustment In (Surplus)
              </label>

              <label
                className={`p-2 border rounded text-center cursor-pointer ${
                  adjustType === 'ADJUSTMENT_OUT'
                    ? 'border-neutral-900 bg-neutral-900 text-white font-semibold'
                    : 'border-neutral-300 bg-white text-neutral-700'
                }`}
              >
                <input
                  type="radio"
                  name="adjType"
                  value="ADJUSTMENT_OUT"
                  checked={adjustType === 'ADJUSTMENT_OUT'}
                  onChange={() => setAdjustType('ADJUSTMENT_OUT')}
                  className="hidden"
                />
                - Adjustment Out (Deficit)
              </label>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-neutral-700 mb-1">Quantity</label>
            <input
              type="number"
              min="1"
              required
              value={adjustQuantity}
              onChange={(e) => setAdjustQuantity(Number(e.target.value))}
              className="w-full p-2 border border-neutral-300 rounded font-mono"
            />
          </div>

          <div>
            <label className="block font-semibold text-neutral-700 mb-1">Audit Reconciliation Reason</label>
            <input
              type="text"
              required
              value={adjustNotes}
              onChange={(e) => setAdjustNotes(e.target.value)}
              className="w-full p-2 border border-neutral-300 rounded"
              placeholder="e.g. Physical inventory variance found during quarterly audit"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-neutral-200">
            <button
              type="button"
              onClick={() => setIsAdjustModalOpen(false)}
              className="px-3.5 py-1.5 text-neutral-700 border border-neutral-300 rounded hover:bg-neutral-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 font-semibold bg-neutral-900 text-white rounded hover:bg-neutral-800"
            >
              Post Adjustment
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
