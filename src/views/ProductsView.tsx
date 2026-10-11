import React, { useState } from 'react';
import { useAccountingStore } from '../store/accountingStore';
import { Product } from '../types/database';
import { formatINR } from '../utils/calculations';
import {
  Plus,
  Search,
  ArrowRightLeft,
  History
} from 'lucide-react';
import { Modal } from '../components/common/Modal';
import { Badge } from '../components/common/Badge';
import { Button, PageHeader, SearchInput, TableShell, Table, THead, TBody, TR, TH, TD, Input, Label, Select } from '../components/ui';

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
    initial_price: 100
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
      initial_price: 100
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
        is_active: true
      },
      Number(newProduct.initial_price) || 0
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
      <PageHeader
        title="Product Catalog & UOMs"
        subtitle="Relational conversion ratios • Price validity histories • Stock movement ledgers"
        actions={
          <>
            <SearchInput
              icon={<Search className="w-4 h-4" />}
              type="text"
              placeholder="Search products or SKU..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <Button variant="primary" size="md" onClick={handleOpenCreate}>
              <Plus className="w-3.5 h-3.5" />
              <span>Add Product</span>
            </Button>
          </>
        }
      />

      {/* Products Table */}
      <TableShell>
        <div className="overflow-x-auto">
          <Table className="text-left border-collapse">
            <caption className="sr-only">Products register</caption>
            <THead>
              <TR className="hover:bg-transparent">
                <TH scope="col">Item Name</TH>
                <TH scope="col">SKU</TH>
                <TH scope="col">Primary UOM</TH>
                <TH scope="col" className="text-right">Active Price</TH>
                <TH scope="col" className="text-right">Company Stock</TH>
                <TH scope="col" className="text-center">Status</TH>
                <TH scope="col" className="text-right px-4">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {filteredProducts.map((prod) => {
                const primaryUom = uoms[prod.primary_unit_id];
                const activePrice =
                  Object.values(productPrices).find(
                    (pp) => pp.product_id === prod.id && pp.unit_id === prod.primary_unit_id && !pp.effective_to
                  )?.price || 0;
                const stock = getCurrentCompanyStock(prod.id);

                return (
                  <TR
                    key={prod.id}
                    className="group cursor-pointer"
                    onClick={() => setSelectedProductId(prod.id)}
                  >
                    <TD>
                      <div className="font-semibold group-hover:text-foreground">
                        {prod.product_name}
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate max-w-sm">
                        {prod.description}
                      </div>
                    </TD>

                    <TD className="font-mono text-[11px]">
                      <div className="text-foreground font-semibold">{prod.sku}</div>
                    </TD>

                    <TD className="font-mono">
                      <Badge variant="neutral">{primaryUom?.code || 'PCS'}</Badge>
                      <span className="text-muted-foreground text-[11px] ml-1.5">{primaryUom?.name}</span>
                    </TD>

                    <TD className="text-right font-mono font-bold">
                      {formatINR(activePrice)}
                      <span className="text-[10px] text-muted-foreground font-normal"> / {primaryUom?.code}</span>
                    </TD>

                    <TD className="text-right font-mono">
                      <span className={`font-bold ${stock > 0 ? 'text-foreground' : 'text-destructive'}`}>
                        {stock.toLocaleString()}
                      </span>{' '}
                      <span className="text-[11px] text-muted-foreground">{primaryUom?.code}</span>
                    </TD>

                    <TD className="text-center">
                      <Badge variant={prod.is_active ? 'success' : 'neutral'}>
                        {prod.is_active ? 'ACTIVE' : 'INACTIVE'}
                      </Badge>
                    </TD>

                    <TD className="text-right" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setSelectedProductId(prod.id);
                          handleOpenPriceModal(prod);
                        }}
                        title="Update price with effective date"
                        className="text-[11px] px-2.5 py-1"
                      >
                        Adjust Price
                      </Button>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </div>
      </TableShell>

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
              <Button variant="primary" size="sm" onClick={() => handleOpenPriceModal(selectedProduct)}>
                + Update Effective Price
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setSelectedProductId(null)}>
                Close
              </Button>
            </div>
          }
        >
          <div className="space-y-5 text-xs">
            {/* Stock Summary */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3.5 bg-muted border border-border rounded">
                <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Company Warehouse Stock
                </div>
                <div className="mt-1 text-2xl font-bold font-mono text-foreground">
                  {getCurrentCompanyStock(selectedProduct.id).toLocaleString()}{' '}
                  <span className="text-xs font-normal text-muted-foreground">
                    {uoms[selectedProduct.primary_unit_id]?.code}
                  </span>
                </div>
                <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                  Calculated from Inward - Dispatches + Returns
                </div>
              </div>

              <div className="p-3.5 bg-muted border border-border rounded">
                <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Customer Field Consignments
                </div>
                <div className="mt-1 text-2xl font-bold font-mono text-sky-800 dark:text-sky-300">
                  {customerHoldingBreakdown.reduce((s, c) => s + c.heldQuantity, 0).toLocaleString()}{' '}
                  <span className="text-xs font-normal text-muted-foreground">
                    {uoms[selectedProduct.primary_unit_id]?.code}
                  </span>
                </div>
                <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                  Held across {customerHoldingBreakdown.length} client sites
                </div>
              </div>
            </div>

            {/* UOM Configurations */}
            <div>
              <div className="font-semibold text-foreground uppercase tracking-wide text-[11px] mb-2 flex items-center gap-1.5">
                <ArrowRightLeft className="w-3.5 h-3.5 text-muted-foreground" />
                Unit of Measure Conversion Rules
              </div>
              <div className="border border-border rounded divide-y divide-border">
                {productUnitsList.map((pu) => {
                  const uom = uoms[pu.unit_id];
                  return (
                    <div key={pu.id} className="p-2.5 flex items-center justify-between font-mono">
                      <div>
                        <span className="font-bold text-foreground">{uom?.code}</span>
                        <span className="text-muted-foreground ml-1.5">({uom?.name})</span>
                        {pu.unit_id === selectedProduct.primary_unit_id && (
                          <span className="ml-2 text-[10px] bg-muted text-foreground px-1.5 py-0.5 rounded">
                            PRIMARY BASE
                          </span>
                        )}
                      </div>
                      <div className="text-foreground">
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
              <div className="font-semibold text-foreground uppercase tracking-wide text-[11px] mb-2 flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-muted-foreground" />
                Price Validity History
              </div>
              <div className="border border-border rounded divide-y divide-border">
                {productPriceHistory.map((pp) => {
                  const uom = uoms[pp.unit_id];
                  const isActive = !pp.effective_to;
                  return (
                    <div key={pp.id} className="p-2.5 flex items-center justify-between font-mono">
                      <div>
                        <span className="font-bold text-foreground">{formatINR(pp.price)}</span>
                        <span className="text-muted-foreground text-[11px]"> / {uom?.code}</span>
                        {isActive && (
                          <Badge variant="success" className="ml-2 text-[10px] font-bold">
                            CURRENT ACTIVE
                          </Badge>
                        )}
                      </div>
                      <div className="text-muted-foreground text-[11px]">
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
                <div className="font-semibold text-foreground uppercase tracking-wide text-[11px] mb-2">
                  Customer Consignment Holdings
                </div>
                <div className="border border-border rounded divide-y divide-border font-mono">
                  {customerHoldingBreakdown.map((cb) => (
                    <div key={cb.customerId} className="p-2.5 flex justify-between items-center">
                      <span className="font-sans font-medium text-foreground">{cb.customerName}</span>
                      <span className="font-bold text-foreground">
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
        subtitle="Registers catalog item with its primary unit of measure"
        maxWidth="2xl"
      >
        <form onSubmit={handleCreateProduct} className="space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label className="mb-1">Product Name *</Label>
              <Input
                type="text"
                required
                value={newProduct.product_name}
                onChange={(e) => setNewProduct({ ...newProduct, product_name: e.target.value })}
                className="w-full p-2 border border-input rounded focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="e.g. Cold Rolled Steel Rod 25mm"
              />
            </div>

            <div>
              <Label className="mb-1">SKU (Stock Keeping Unit) *</Label>
              <Input
                type="text"
                required
                value={newProduct.sku}
                onChange={(e) => setNewProduct({ ...newProduct, sku: e.target.value })}
                className="w-full p-2 border border-input rounded font-mono uppercase"
              />
            </div>

            <div className="col-span-2">
              <Label className="mb-1">Description</Label>
              <Input
                type="text"
                value={newProduct.description}
                onChange={(e) => setNewProduct({ ...newProduct, description: e.target.value })}
                className="w-full"
                placeholder="Specification and grade details"
              />
            </div>

            <div>
              <Label className="mb-1">Primary Unit of Measure (Base)</Label>
              <Select
                value={newProduct.primary_unit_id}
                onChange={(e) => setNewProduct({ ...newProduct, primary_unit_id: e.target.value })}
                className="w-full font-mono"
              >
                {Object.values(uoms).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.code} - {u.name}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label className="mb-1">Initial Primary Unit Price (₹) *</Label>
              <Input
                type="number"
                step="0.01"
                required
                value={newProduct.initial_price}
                onChange={(e) => setNewProduct({ ...newProduct, initial_price: Number(e.target.value) })}
                className="w-full font-mono"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <Button type="button" variant="secondary" size="sm" onClick={() => setIsCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm">
              Create Product
            </Button>
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
            <Label className="mb-1">Unit of Measure</Label>
            <Select
              value={newPriceForm.unit_id}
              onChange={(e) => setNewPriceForm({ ...newPriceForm, unit_id: e.target.value })}
              className="w-full font-mono"
            >
              {productUnitsList.map((pu) => (
                <option key={pu.id} value={pu.unit_id}>
                  {uoms[pu.unit_id]?.code} ({uoms[pu.unit_id]?.name})
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label className="mb-1">New Selling Price (₹) *</Label>
            <Input
              type="number"
              step="0.01"
              required
              value={newPriceForm.price}
              onChange={(e) => setNewPriceForm({ ...newPriceForm, price: Number(e.target.value) })}
              className="w-full font-mono"
              placeholder="e.g. 125.00"
            />
          </div>

          <div>
            <Label className="mb-1">Effective Date</Label>
            <Input
              type="date"
              required
              value={newPriceForm.effective_from}
              onChange={(e) => setNewPriceForm({ ...newPriceForm, effective_from: e.target.value })}
              className="w-full font-mono"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <Button type="button" variant="secondary" size="sm" onClick={() => setIsPriceModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm">
              Save New Price
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
