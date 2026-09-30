import React, { useState } from 'react';
import { useAccountingStore } from '../store/accountingStore';
import { Product, ProductUnit, ProductPrice } from '../types/database';
import { formatINR } from '../utils/calculations';
import {
  Package,
  Plus,
  Search,
  Tag,
  DollarSign,
  Layers,
  ArrowRightLeft,
  Calendar,
  History,
  CheckCircle2,
  Clock
} from 'lucide-react';
import { Modal } from '../components/common/Modal';
import { Badge } from '../components/common/Badge';

export const ProductsView: React.FC = () => {
  const {
    products,
    uoms,
    productUnits,
    productPrices,
    createProduct,
    createProductPrice,
    getCurrentCompanyStock,
    customerInventoryMovements,
    customers
  } = useAccountingStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isPriceModalOpen, setIsPriceModalOpen] = useState(false);

  // New product form state
  const [newProduct, setNewProduct] = useState({
    product_name: '',
    sku: '',
    description: '',
    primary_unit_id: 'uom-pcs',
    hsn_code: '7214',
    initial_price: 100,
    has_secondary: true,
    secondary_unit_id: 'uom-box',
    conversion_to_primary: 20,
    secondary_price: 1950
  });

  // Price adjustment form state
  const [newPriceForm, setNewPriceForm] = useState({
    unit_id: '',
    price: 0,
    effective_from: new Date().toISOString().split('T')[0]
  });

  const allProducts = Object.values(products);
  const filteredProducts = allProducts.filter((p) => {
    const q = searchQuery.toLowerCase();
    return p.product_name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
  });

  const selectedProduct = selectedProductId ? products[selectedProductId] : null;

  const handleOpenCreate = () => {
    setNewProduct({
      product_name: '',
      sku: `SKU-${Math.floor(1000 + Math.random() * 9000)}`,
      description: '',
      primary_unit_id: 'uom-pcs',
      hsn_code: '7214',
      initial_price: 100,
      has_secondary: true,
      secondary_unit_id: 'uom-box',
      conversion_to_primary: 20,
      secondary_price: 1950
    });
    setIsCreateModalOpen(true);
  };

  const handleCreateProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProduct.product_name.trim() || !newProduct.sku.trim()) return;

    createProduct(
      {
        product_name: newProduct.product_name.trim(),
        sku: newProduct.sku.trim().toUpperCase(),
        description: newProduct.description.trim(),
        primary_unit_id: newProduct.primary_unit_id,
        hsn_code: newProduct.hsn_code.trim(),
        is_active: true
      },
      Number(newProduct.initial_price) || 0,
      newProduct.has_secondary
        ? {
            unitId: newProduct.secondary_unit_id,
            conversionToPrimary: Number(newProduct.conversion_to_primary) || 1,
            price: Number(newProduct.secondary_price) || 0
          }
        : undefined
    );

    setIsCreateModalOpen(false);
  };

  const handleOpenPriceModal = (prod: Product) => {
    setNewPriceForm({
      unit_id: prod.primary_unit_id,
      price: 0,
      effective_from: new Date().toISOString().split('T')[0]
    });
    setIsPriceModalOpen(true);
  };

  const handleSavePrice = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductId || newPriceForm.price <= 0) return;

    createProductPrice({
      product_id: selectedProductId,
      unit_id: newPriceForm.unit_id,
      price: Number(newPriceForm.price),
      effective_from: new Date(newPriceForm.effective_from).toISOString(),
      effective_to: null
    });

    setIsPriceModalOpen(false);
  };

  // Queries for selected product
  const productUnitsList = selectedProductId
    ? Object.values(productUnits).filter((pu) => pu.product_id === selectedProductId)
    : [];
  const productPriceHistory = selectedProductId
    ? Object.values(productPrices)
        .filter((pp) => pp.product_id === selectedProductId)
        .sort((a, b) => new Date(b.effective_from).getTime() - new Date(a.effective_from).getTime())
    : [];

  // Customer holding breakdown for this product
  const customerHoldingBreakdown: Array<{
    customerId: string;
    customerName: string;
    heldQuantity: number;
    unitCode: string;
  }> = [];

  if (selectedProductId) {
    const holdingByCust: Record<string, number> = {};
    for (const mov of Object.values(customerInventoryMovements)) {
      if (mov.product_id === selectedProductId) {
        if (!holdingByCust[mov.customer_id]) holdingByCust[mov.customer_id] = 0;
        if (mov.movement_type === 'DISPATCH' || mov.movement_type === 'ADJUSTMENT_IN') {
          holdingByCust[mov.customer_id] += mov.quantity;
        } else if (mov.movement_type === 'RETURN' || mov.movement_type === 'ADJUSTMENT_OUT') {
          holdingByCust[mov.customer_id] -= mov.quantity;
        }
      }
    }
    for (const [cId, held] of Object.entries(holdingByCust)) {
      if (held > 0) {
        const cust = customers[cId];
        const primaryUom = uoms[selectedProduct?.primary_unit_id || ''];
        customerHoldingBreakdown.push({
          customerId: cId,
          customerName: cust ? cust.customer_name : 'Unknown Customer',
          heldQuantity: held,
          unitCode: primaryUom ? primaryUom.code : 'PCS'
        });
      }
    }
  }

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-white border border-neutral-200 rounded-lg shadow-2xs">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-neutral-950">Product Catalog &amp; UOMs</h1>
          <p className="text-xs text-neutral-500 font-mono mt-0.5">
            Relational conversion ratios • Price validity histories • Stock movement ledgers
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search products or SKU..."
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
            <span>Add Product</span>
          </button>
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-white border border-neutral-200 rounded-lg shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50/80 font-mono text-neutral-600 text-[11px]">
                <th className="py-3 px-4">Item Name</th>
                <th className="py-3 px-3">SKU / HSN</th>
                <th className="py-3 px-3">Primary UOM</th>
                <th className="py-3 px-3 text-right">Active Price</th>
                <th className="py-3 px-3 text-right">Company Stock</th>
                <th className="py-3 px-3 text-center">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 font-sans">
              {filteredProducts.map((prod) => {
                const primaryUom = uoms[prod.primary_unit_id];
                const activePrice =
                  Object.values(productPrices).find(
                    (pp) => pp.product_id === prod.id && pp.unit_id === prod.primary_unit_id && !pp.effective_to
                  )?.price || 0;
                const stock = getCurrentCompanyStock(prod.id);

                return (
                  <tr
                    key={prod.id}
                    className="hover:bg-neutral-50/70 transition-colors group cursor-pointer"
                    onClick={() => setSelectedProductId(prod.id)}
                  >
                    <td className="py-3 px-4">
                      <div className="font-semibold text-neutral-900 group-hover:text-black">
                        {prod.product_name}
                      </div>
                      <div className="text-[11px] text-neutral-500 truncate max-w-sm">
                        {prod.description}
                      </div>
                    </td>

                    <td className="py-3 px-3 font-mono text-[11px]">
                      <div className="text-neutral-900 font-semibold">{prod.sku}</div>
                      <div className="text-neutral-400">HSN: {prod.hsn_code || 'N/A'}</div>
                    </td>

                    <td className="py-3 px-3 font-mono">
                      <Badge variant="neutral">{primaryUom?.code || 'PCS'}</Badge>
                      <span className="text-neutral-400 text-[11px] ml-1.5">{primaryUom?.name}</span>
                    </td>

                    <td className="py-3 px-3 text-right font-mono font-bold text-neutral-900">
                      {formatINR(activePrice)}
                      <span className="text-[10px] text-neutral-400 font-normal"> / {primaryUom?.code}</span>
                    </td>

                    <td className="py-3 px-3 text-right font-mono">
                      <span className={`font-bold ${stock > 0 ? 'text-neutral-900' : 'text-rose-600'}`}>
                        {stock.toLocaleString()}
                      </span>{' '}
                      <span className="text-[11px] text-neutral-500">{primaryUom?.code}</span>
                    </td>

                    <td className="py-3 px-3 text-center">
                      <Badge variant={prod.is_active ? 'success' : 'neutral'}>
                        {prod.is_active ? 'ACTIVE' : 'INACTIVE'}
                      </Badge>
                    </td>

                    <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => {
                          setSelectedProductId(prod.id);
                          handleOpenPriceModal(prod);
                        }}
                        className="px-2.5 py-1 text-[11px] font-medium text-neutral-700 bg-white border border-neutral-300 rounded hover:bg-neutral-100"
                        title="Update price with effective date"
                      >
                        Adjust Price
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Product Detail Modal */}
      {selectedProduct && (
        <Modal
          isOpen={Boolean(selectedProductId)}
          onClose={() => setSelectedProductId(null)}
          title={selectedProduct.product_name}
          subtitle={`SKU: ${selectedProduct.sku} • Primary UOM: ${uoms[selectedProduct.primary_unit_id]?.code || 'PCS'}`}
          maxWidth="2xl"
          footer={
            <div className="flex justify-between w-full items-center">
              <button
                onClick={() => handleOpenPriceModal(selectedProduct)}
                className="px-3.5 py-1.5 text-xs font-semibold bg-neutral-900 text-white rounded hover:bg-neutral-800"
              >
                + Update Effective Price
              </button>
              <button
                onClick={() => setSelectedProductId(null)}
                className="px-3 py-1.5 text-xs font-medium text-neutral-700 bg-white border border-neutral-300 rounded hover:bg-neutral-50"
              >
                Close
              </button>
            </div>
          }
        >
          <div className="space-y-5 text-xs">
            {/* Stock Summary */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3.5 bg-neutral-50 border border-neutral-200 rounded">
                <div className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wide">
                  Company Warehouse Stock
                </div>
                <div className="mt-1 text-2xl font-bold font-mono text-neutral-950">
                  {getCurrentCompanyStock(selectedProduct.id).toLocaleString()}{' '}
                  <span className="text-xs font-normal text-neutral-500">
                    {uoms[selectedProduct.primary_unit_id]?.code}
                  </span>
                </div>
                <div className="text-[10px] text-neutral-400 font-mono mt-0.5">
                  Calculated from Inward - Dispatches + Returns
                </div>
              </div>

              <div className="p-3.5 bg-neutral-50 border border-neutral-200 rounded">
                <div className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wide">
                  Customer Field Consignments
                </div>
                <div className="mt-1 text-2xl font-bold font-mono text-sky-800">
                  {customerHoldingBreakdown.reduce((s, c) => s + c.heldQuantity, 0).toLocaleString()}{' '}
                  <span className="text-xs font-normal text-neutral-500">
                    {uoms[selectedProduct.primary_unit_id]?.code}
                  </span>
                </div>
                <div className="text-[10px] text-neutral-400 font-mono mt-0.5">
                  Held across {customerHoldingBreakdown.length} client sites
                </div>
              </div>
            </div>

            {/* UOM Configurations */}
            <div>
              <div className="font-semibold text-neutral-800 uppercase tracking-wide text-[11px] mb-2 flex items-center gap-1.5">
                <ArrowRightLeft className="w-3.5 h-3.5 text-neutral-500" />
                Unit of Measure Conversion Rules
              </div>
              <div className="border border-neutral-200 rounded divide-y divide-neutral-200">
                {productUnitsList.map((pu) => {
                  const uom = uoms[pu.unit_id];
                  return (
                    <div key={pu.id} className="p-2.5 flex items-center justify-between font-mono">
                      <div>
                        <span className="font-bold text-neutral-900">{uom?.code}</span>
                        <span className="text-neutral-500 ml-1.5">({uom?.name})</span>
                        {pu.unit_id === selectedProduct.primary_unit_id && (
                          <span className="ml-2 text-[10px] bg-neutral-200 text-neutral-800 px-1.5 py-0.5 rounded">
                            PRIMARY BASE
                          </span>
                        )}
                      </div>
                      <div className="text-neutral-700">
                        1 {uom?.code} = <span className="font-bold">{pu.conversion_to_primary}</span>{' '}
                        {uoms[selectedProduct.primary_unit_id]?.code}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Price History */}
            <div>
              <div className="font-semibold text-neutral-800 uppercase tracking-wide text-[11px] mb-2 flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-neutral-500" />
                Price Validity History
              </div>
              <div className="border border-neutral-200 rounded divide-y divide-neutral-200">
                {productPriceHistory.map((pp) => {
                  const uom = uoms[pp.unit_id];
                  const isActive = !pp.effective_to;
                  return (
                    <div key={pp.id} className="p-2.5 flex items-center justify-between font-mono">
                      <div>
                        <span className="font-bold text-neutral-900">{formatINR(pp.price)}</span>
                        <span className="text-neutral-400 text-[11px]"> / {uom?.code}</span>
                        {isActive && (
                          <span className="ml-2 text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-bold">
                            CURRENT ACTIVE
                          </span>
                        )}
                      </div>
                      <div className="text-neutral-500 text-[11px]">
                        From {new Date(pp.effective_from).toLocaleDateString()}{' '}
                        {pp.effective_to ? `to ${new Date(pp.effective_to).toLocaleDateString()}` : 'onwards'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Customer Holding Breakdown */}
            {customerHoldingBreakdown.length > 0 && (
              <div>
                <div className="font-semibold text-neutral-800 uppercase tracking-wide text-[11px] mb-2">
                  Customer Consignment Holdings
                </div>
                <div className="border border-neutral-200 rounded divide-y divide-neutral-200 font-mono">
                  {customerHoldingBreakdown.map((cb) => (
                    <div key={cb.customerId} className="p-2.5 flex justify-between items-center">
                      <span className="font-sans font-medium text-neutral-800">{cb.customerName}</span>
                      <span className="font-bold text-neutral-950">
                        {cb.heldQuantity} {cb.unitCode}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Add Product Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Create New Product"
        subtitle="Registers catalog item, primary UOM and secondary conversion rules"
        maxWidth="2xl"
      >
        <form onSubmit={handleCreateProduct} className="space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block font-semibold text-neutral-700 mb-1">Product Name *</label>
              <input
                type="text"
                required
                value={newProduct.product_name}
                onChange={(e) => setNewProduct({ ...newProduct, product_name: e.target.value })}
                className="w-full p-2 border border-neutral-300 rounded focus:outline-none focus:ring-1 focus:ring-neutral-900"
                placeholder="e.g. Cold Rolled Steel Rod 25mm"
              />
            </div>

            <div>
              <label className="block font-semibold text-neutral-700 mb-1">SKU (Stock Keeping Unit) *</label>
              <input
                type="text"
                required
                value={newProduct.sku}
                onChange={(e) => setNewProduct({ ...newProduct, sku: e.target.value })}
                className="w-full p-2 border border-neutral-300 rounded font-mono uppercase"
              />
            </div>

            <div>
              <label className="block font-semibold text-neutral-700 mb-1">HSN / Tariff Code</label>
              <input
                type="text"
                value={newProduct.hsn_code}
                onChange={(e) => setNewProduct({ ...newProduct, hsn_code: e.target.value })}
                className="w-full p-2 border border-neutral-300 rounded font-mono"
              />
            </div>

            <div className="col-span-2">
              <label className="block font-semibold text-neutral-700 mb-1">Description</label>
              <input
                type="text"
                value={newProduct.description}
                onChange={(e) => setNewProduct({ ...newProduct, description: e.target.value })}
                className="w-full p-2 border border-neutral-300 rounded"
                placeholder="Specification and grade details"
              />
            </div>

            <div>
              <label className="block font-semibold text-neutral-700 mb-1">Primary Unit of Measure (Base)</label>
              <select
                value={newProduct.primary_unit_id}
                onChange={(e) => setNewProduct({ ...newProduct, primary_unit_id: e.target.value })}
                className="w-full p-2 border border-neutral-300 rounded bg-white font-mono"
              >
                {Object.values(uoms).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.code} - {u.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-neutral-700 mb-1">Initial Primary Unit Price (₹) *</label>
              <input
                type="number"
                step="0.01"
                required
                value={newProduct.initial_price}
                onChange={(e) => setNewProduct({ ...newProduct, initial_price: Number(e.target.value) })}
                className="w-full p-2 border border-neutral-300 rounded font-mono"
              />
            </div>

            {/* Secondary UOM & Conversion */}
            <div className="col-span-2 border-t border-neutral-200 pt-3">
              <label className="flex items-center gap-2 font-semibold text-neutral-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newProduct.has_secondary}
                  onChange={(e) => setNewProduct({ ...newProduct, has_secondary: e.target.checked })}
                  className="rounded text-neutral-900"
                />
                <span>Configure Secondary Packaging Unit (e.g. 1 BOX = 20 PCS)</span>
              </label>

              {newProduct.has_secondary && (
                <div className="grid grid-cols-3 gap-3 mt-3 p-3 bg-neutral-50 border border-neutral-200 rounded">
                  <div>
                    <label className="block text-[11px] font-semibold text-neutral-600 mb-1">Secondary Unit</label>
                    <select
                      value={newProduct.secondary_unit_id}
                      onChange={(e) => setNewProduct({ ...newProduct, secondary_unit_id: e.target.value })}
                      className="w-full p-1.5 border border-neutral-300 rounded bg-white font-mono"
                    >
                      {Object.values(uoms)
                        .filter((u) => u.id !== newProduct.primary_unit_id)
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.code} - {u.name}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-neutral-600 mb-1">
                      Conversion Factor to Primary
                    </label>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      value={newProduct.conversion_to_primary}
                      onChange={(e) =>
                        setNewProduct({ ...newProduct, conversion_to_primary: Number(e.target.value) })
                      }
                      className="w-full p-1.5 border border-neutral-300 rounded font-mono"
                      placeholder="20"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-neutral-600 mb-1">Secondary Unit Price (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={newProduct.secondary_price}
                      onChange={(e) =>
                        setNewProduct({ ...newProduct, secondary_price: Number(e.target.value) })
                      }
                      className="w-full p-1.5 border border-neutral-300 rounded font-mono"
                      placeholder="1950"
                    />
                  </div>
                </div>
              )}
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
              Create Product
            </button>
          </div>
        </form>
      </Modal>

      {/* Adjust Price Modal */}
      <Modal
        isOpen={isPriceModalOpen}
        onClose={() => setIsPriceModalOpen(false)}
        title="Record New Effective Price"
        subtitle="Inserts a new effective price and archives earlier rate"
        maxWidth="md"
      >
        <form onSubmit={handleSavePrice} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-neutral-700 mb-1">Unit of Measure</label>
            <select
              value={newPriceForm.unit_id}
              onChange={(e) => setNewPriceForm({ ...newPriceForm, unit_id: e.target.value })}
              className="w-full p-2 border border-neutral-300 rounded bg-white font-mono"
            >
              {productUnitsList.map((pu) => (
                <option key={pu.id} value={pu.unit_id}>
                  {uoms[pu.unit_id]?.code} ({uoms[pu.unit_id]?.name})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-neutral-700 mb-1">New Selling Price (₹) *</label>
            <input
              type="number"
              step="0.01"
              required
              value={newPriceForm.price}
              onChange={(e) => setNewPriceForm({ ...newPriceForm, price: Number(e.target.value) })}
              className="w-full p-2 border border-neutral-300 rounded font-mono"
              placeholder="e.g. 125.00"
            />
          </div>

          <div>
            <label className="block font-semibold text-neutral-700 mb-1">Effective Date</label>
            <input
              type="date"
              required
              value={newPriceForm.effective_from}
              onChange={(e) => setNewPriceForm({ ...newPriceForm, effective_from: e.target.value })}
              className="w-full p-2 border border-neutral-300 rounded font-mono"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-neutral-200">
            <button
              type="button"
              onClick={() => setIsPriceModalOpen(false)}
              className="px-3.5 py-1.5 text-neutral-700 border border-neutral-300 rounded hover:bg-neutral-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 font-semibold bg-neutral-900 text-white rounded hover:bg-neutral-800"
            >
              Save New Price
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
