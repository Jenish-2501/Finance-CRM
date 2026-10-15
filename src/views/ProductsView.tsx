import React, { useEffect, useRef, useState } from 'react';
import { useAccountingStore } from '../store/accountingStore';
import { Product } from '../types/database';
import { formatINR, toPcsDisplayQty } from '../utils/calculations';
import {
  Plus,
  Search,
  ArrowRightLeft,
  History,
  Scale
} from 'lucide-react';
import { Modal } from '../components/common/Modal';
import { Badge } from '../components/common/Badge';
import { Button, PageHeader, SearchInput, TableShell, Table, THead, TBody, TR, TH, TD, Input, Label, Select, Alert } from '../components/ui';
import { useT } from '../i18n';

export const ProductsView: React.FC = () => {
  const { t } = useT();
  const {
    products,
    uoms,
    productUnits,
    productPrices,
    createProduct,
    createProductPrice,
    getCurrentCompanyStock,
    getPieceWeightMapping,
    savePieceWeightMapping,
    removePieceWeightMapping,
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
    initial_price: 100,
    grams_per_piece: ''
  });
  const [createError, setCreateError] = useState('');

  // Price adjustment form state
  const [newPriceForm, setNewPriceForm] = useState({
    unit_id: '',
    price: 0,
    effective_from: new Date().toISOString().split('T')[0]
  });

  // Piece-weight mapping form state (GRAM-primary products billed in KG)
  const [pieceGrams, setPieceGrams] = useState('');
  const [pieceMsg, setPieceMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  // Our own save/remove re-runs the sync effect below (productUnits changed) —
  // the flag keeps that sync from wiping the confirmation message we just set.
  const keepPieceMsgRef = useRef(false);

  const allProducts = Object.values(products);
  const filteredProducts = allProducts.filter((p) => {
    const q = searchQuery.toLowerCase();
    return p.product_name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
  });

  const selectedProduct = selectedProductId ? products[selectedProductId] : null;

  const isNewWeightPrimary = ['GRAM', 'KG'].includes(
    (uoms[newProduct.primary_unit_id]?.code || '').toUpperCase()
  );

  const handleOpenCreate = () => {
    setNewProduct({
      product_name: '',
      sku: `SKU-${Math.floor(1000 + Math.random() * 9000)}`,
      description: '',
      primary_unit_id: 'uom-pcs',
      initial_price: 100,
      grams_per_piece: ''
    });
    setCreateError('');
    setIsCreateModalOpen(true);
  };

  const handleCreateProduct = (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');
    if (!newProduct.product_name.trim() || !newProduct.sku.trim()) return;
    const gramsRaw = newProduct.grams_per_piece.trim();
    if (gramsRaw !== '' && (!Number.isFinite(Number(gramsRaw)) || Number(gramsRaw) <= 0)) {
      setCreateError(t('products.errPieceInvalid'));
      return;
    }
    // Validate mapping feasibility BEFORE creating (a failed mapping save must
    // never leave a half-configured duplicate behind on resubmit).
    if (gramsRaw !== '' && !isNewWeightPrimary) {
      setCreateError(t('products.pieceCreateTip'));
      return;
    }

    const created = createProduct(
      {
        product_name: newProduct.product_name.trim(),
        sku: newProduct.sku.trim().toUpperCase(),
        description: newProduct.description.trim(),
        primary_unit_id: newProduct.primary_unit_id,
        is_active: true
      },
      Number(newProduct.initial_price) || 0
    );

    // GRAM-primary + grams entered → create the PCS mapping together.
    if (gramsRaw !== '') {
      const result = savePieceWeightMapping(created.id, Number(gramsRaw));
      if (!result.success) {
        setCreateError(result.error || t('products.errPieceInvalid'));
        return;
      }
    }

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

  // Piece-weight mapping for the selected product (null = unmapped).
  // Shown for weight-primary (GRAM or KG) products; GRAM is exact, KG rounds
  // stock to the nearest 10 g (warned below, never blocked).
  const pieceMapping = selectedProductId ? getPieceWeightMapping(selectedProductId) : null;
  const primaryCode = (uoms[selectedProduct?.primary_unit_id || '']?.code || '').toUpperCase();
  const isWeightPrimary = primaryCode === 'GRAM' || primaryCode === 'KG';
  const primaryIsKg = primaryCode === 'KG';
  const gramsForWarn =
    pieceGrams.trim() !== '' && Number.isFinite(Number(pieceGrams))
      ? Number(pieceGrams)
      : (pieceMapping?.gramsPerPiece ?? NaN);
  const showKgRoundingWarn =
    primaryIsKg &&
    Number.isFinite(gramsForWarn) &&
    Math.abs(gramsForWarn / 10 - Math.round(gramsForWarn / 10)) > 1e-9;
  const hasKgPrice = selectedProductId
    ? productPriceHistory.some((pp) => pieceMapping && pp.unit_id === pieceMapping.kgUnitId)
    : false;

  useEffect(() => {
    setPieceGrams(pieceMapping ? String(pieceMapping.gramsPerPiece) : '');
    if (keepPieceMsgRef.current) keepPieceMsgRef.current = false;
    else setPieceMsg(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProductId, productUnits]);

  const handleSavePieceMapping = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductId) return;
    const grams = Number(pieceGrams);
    if (!Number.isFinite(grams) || grams <= 0) {
      setPieceMsg({ kind: 'error', text: t('products.errPieceInvalid') });
      return;
    }
    keepPieceMsgRef.current = true;
    const result = savePieceWeightMapping(selectedProductId, grams);
    setPieceMsg(
      result.success
        ? { kind: 'success', text: t('products.msgPieceSaved') }
        : { kind: 'error', text: result.error || t('products.errPieceInvalid') }
    );
  };

  const handleRemovePieceMapping = () => {
    if (!selectedProductId) return;
    keepPieceMsgRef.current = true;
    const result = removePieceWeightMapping(selectedProductId);
    setPieceMsg(
      result.success
        ? { kind: 'success', text: t('products.msgPieceRemoved') }
        : { kind: 'error', text: result.error || t('products.errPieceInvalid') }
    );
  };

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
        title={t('products.title')}
        subtitle={t('products.subtitle')}
        actions={
          <>
            <SearchInput
              icon={<Search className="w-4 h-4" />}
              type="text"
              placeholder={t('products.searchPh')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <Button variant="primary" size="md" onClick={handleOpenCreate}>
              <Plus className="w-3.5 h-3.5" />
              <span>{t('products.add')}</span>
            </Button>
          </>
        }
      />

      {/* Products Table */}
      <TableShell>
        <div className="overflow-x-auto">
          <Table className="text-left border-collapse">
            <caption className="sr-only">{t('products.caption')}</caption>
            <THead>
              <TR className="hover:bg-transparent">
                <TH scope="col">{t('products.thItem')}</TH>
                <TH scope="col">{t('products.thSku')}</TH>
                <TH scope="col">{t('products.thUom')}</TH>
                <TH scope="col" className="text-right">{t('products.thPrice')}</TH>
                <TH scope="col" className="text-right">{t('products.thStock')}</TH>
                <TH scope="col" className="text-center">{t('products.thStatus')}</TH>
                <TH scope="col" className="text-right px-4">{t('products.thActions')}</TH>
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
                // Piece-mapped products lead with PCS (weight as reference).
                const listMapping = getPieceWeightMapping(prod.id);
                const listPus = listMapping
                  ? Object.values(productUnits).filter((pu) => pu.product_id === prod.id)
                  : [];
                const listPcs = listMapping
                  ? toPcsDisplayQty(listMapping, stock, prod.primary_unit_id, listPus)
                  : null;

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
                      {listPcs !== null ? (
                        <>
                          <span className={`font-bold ${stock > 0 ? 'text-foreground' : 'text-destructive'}`}>
                            {listPcs.toLocaleString()} PCS
                          </span>{' '}
                          <span className="block text-[10px] font-normal text-muted-foreground">
                            (≈ {stock.toLocaleString()} {primaryUom?.code})
                          </span>
                        </>
                      ) : (
                        <>
                          <span className={`font-bold ${stock > 0 ? 'text-foreground' : 'text-destructive'}`}>
                            {stock.toLocaleString()}
                          </span>{' '}
                          <span className="text-[11px] text-muted-foreground">{primaryUom?.code}</span>
                        </>
                      )}
                    </TD>

                    <TD className="text-center">
                      <Badge variant={prod.is_active ? 'success' : 'neutral'}>
                        {prod.is_active ? t('common.active') : t('common.inactive')}
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
                        title={t('products.adjustTitle')}
                        className="text-[11px] px-2.5 py-1"
                      >
                        {t('products.adjustPrice')}
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
          subtitle={t('products.detailSubtitle', { sku: selectedProduct.sku, uom: uoms[selectedProduct.primary_unit_id]?.code || 'PCS' })}
          maxWidth="2xl"
          footer={
            <div className="flex justify-between w-full items-center">
              <Button variant="primary" size="sm" onClick={() => handleOpenPriceModal(selectedProduct)}>
                {t('products.updatePrice')}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setSelectedProductId(null)}>
                {t('common.close')}
              </Button>
            </div>
          }
        >
          <div className="space-y-5 text-xs">
            {/* Stock Summary */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3.5 bg-muted border border-border rounded">
                <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                  {t('products.warehouseStock')}
                </div>
                <div className="mt-1 text-2xl font-bold font-mono text-foreground">
                  {(() => {
                    if (!selectedProduct) return null;
                    const stock = getCurrentCompanyStock(selectedProduct.id);
                    const mapping = getPieceWeightMapping(selectedProduct.id);
                    if (!mapping) {
                      return (
                        <>
                          {stock.toLocaleString()}{' '}
                          <span className="text-xs font-normal text-muted-foreground">
                            {uoms[selectedProduct.primary_unit_id]?.code}
                          </span>
                        </>
                      );
                    }
                    const pus = Object.values(productUnits).filter((pu) => pu.product_id === selectedProduct.id);
                    const pcs = toPcsDisplayQty(mapping, stock, selectedProduct.primary_unit_id, pus);
                    return (
                      <>
                        {(pcs ?? stock).toLocaleString()} PCS{' '}
                        <span className="text-xs font-normal text-muted-foreground">
                          (≈ {stock.toLocaleString()} {uoms[selectedProduct.primary_unit_id]?.code})
                        </span>
                      </>
                    );
                  })()}
                </div>
                <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                  {t('products.stockFormula')}
                </div>
              </div>

              <div className="p-3.5 bg-muted border border-border rounded">
                <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                  {t('products.fieldConsign')}
                </div>
                <div className="mt-1 text-2xl font-bold font-mono text-sky-800 dark:text-sky-300">
                  {(() => {
                    if (!selectedProduct) return null;
                    const held = customerHoldingBreakdown.reduce((s, c) => s + c.heldQuantity, 0);
                    const mapping = getPieceWeightMapping(selectedProduct.id);
                    if (!mapping) {
                      return (
                        <>
                          {held.toLocaleString()}{' '}
                          <span className="text-xs font-normal text-muted-foreground">
                            {uoms[selectedProduct.primary_unit_id]?.code}
                          </span>
                        </>
                      );
                    }
                    const pus = Object.values(productUnits).filter((pu) => pu.product_id === selectedProduct.id);
                    const pcs = toPcsDisplayQty(mapping, held, selectedProduct.primary_unit_id, pus);
                    return (
                      <>
                        {(pcs ?? held).toLocaleString()} PCS{' '}
                        <span className="text-xs font-normal text-muted-foreground">
                          (≈ {held.toLocaleString()} {uoms[selectedProduct.primary_unit_id]?.code})
                        </span>
                      </>
                    );
                  })()}
                </div>
                <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                  {t('products.heldAcross', { count: customerHoldingBreakdown.length })}
                </div>
              </div>
            </div>

            {/* UOM Configurations */}
            <div>
              <div className="font-semibold text-foreground uppercase tracking-wide text-[11px] mb-2 flex items-center gap-1.5">
                <ArrowRightLeft className="w-3.5 h-3.5 text-muted-foreground" />
                {t('products.uomRules')}
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
                            {t('products.primaryBase')}
                          </span>
                        )}
                      </div>
                      <div className="text-foreground">
                        {t('products.convLine', { from: uom?.code ?? '', factor: pu.conversion_to_primary, to: uoms[selectedProduct.primary_unit_id]?.code ?? '' })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Piece-weight mapping (weight-primary products billed in KG) */}
            {isWeightPrimary && (
              <div>
                <div className="font-semibold text-foreground uppercase tracking-wide text-[11px] mb-2 flex items-center gap-1.5">
                  <Scale className="w-3.5 h-3.5 text-muted-foreground" />
                  {t('products.pieceTitle')}
                </div>
                <div className="border border-border rounded p-3.5 space-y-3 bg-muted/40">
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {t('products.pieceNote')}
                  </p>
                  {pieceMapping ? (
                    <p className="text-xs font-mono font-semibold text-foreground">
                      {t('products.pieceMapped', { grams: pieceMapping.gramsPerPiece })}
                    </p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">
                      {t('products.pieceUnmapped')}
                    </p>
                  )}
                  {pieceMsg && (
                    <Alert tone={pieceMsg.kind === 'success' ? 'success' : 'destructive'}>
                      <span className="text-xs">{pieceMsg.text}</span>
                    </Alert>
                  )}
                  <form onSubmit={handleSavePieceMapping} className="flex flex-col sm:flex-row sm:items-end gap-3">
                    <div className="sm:w-56">
                      <Label className="mb-1">{t('products.pieceGrams')}</Label>
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        required
                        value={pieceGrams}
                        onChange={(e) => setPieceGrams(e.target.value)}
                        placeholder={t('products.pieceGramsPh')}
                        className="w-full font-mono"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Button type="submit" variant="primary" size="sm">
                        {t('products.pieceSave')}
                      </Button>
                      {pieceMapping && (
                        <Button type="button" variant="secondary" size="sm" onClick={handleRemovePieceMapping}>
                          {t('products.pieceRemove')}
                        </Button>
                      )}
                    </div>
                  </form>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    {t('products.pieceWarnEdit')}
                  </p>
                  {showKgRoundingWarn && (
                    <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-300 leading-relaxed">
                      {t('products.pieceKgRoundingWarn', { grams: gramsForWarn })}
                    </p>
                  )}
                  {pieceMapping && !hasKgPrice && (
                    <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-300 leading-relaxed">
                      {t('products.pieceKgPriceHint')}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Price History */}
            <div>
              <div className="font-semibold text-foreground uppercase tracking-wide text-[11px] mb-2 flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-muted-foreground" />
                {t('products.priceHistory')}
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
                            {t('products.currentActive')}
                          </Badge>
                        )}
                      </div>
                      <div className="text-muted-foreground text-[11px]">
                        {pp.effective_to
                          ? t('products.dateRange', { from: new Date(pp.effective_from).toLocaleDateString(), to: new Date(pp.effective_to).toLocaleDateString() })
                          : t('products.fromOnwards', { from: new Date(pp.effective_from).toLocaleDateString() })}
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
                  {t('products.holdingsTitle')}
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
        title={t('products.createTitle')}
        subtitle={t('products.createSubtitle')}
        maxWidth="2xl"
      >
        <form onSubmit={handleCreateProduct} className="space-y-4 text-xs">
          {createError && (
            <Alert tone="destructive">{createError}</Alert>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label className="mb-1">{t('products.fName')}</Label>
              <Input
                type="text"
                required
                value={newProduct.product_name}
                onChange={(e) => setNewProduct({ ...newProduct, product_name: e.target.value })}
                className="w-full p-2 border border-input rounded focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder={t('products.fNamePh')}
              />
            </div>

            <div>
              <Label className="mb-1">{t('products.fSku')}</Label>
              <Input
                type="text"
                required
                value={newProduct.sku}
                onChange={(e) => setNewProduct({ ...newProduct, sku: e.target.value })}
                className="w-full p-2 border border-input rounded font-mono uppercase"
              />
            </div>

            <div className="col-span-2">
              <Label className="mb-1">{t('products.fDesc')}</Label>
              <Input
                type="text"
                value={newProduct.description}
                onChange={(e) => setNewProduct({ ...newProduct, description: e.target.value })}
                className="w-full"
                placeholder={t('products.fDescPh')}
              />
            </div>

            <div>
              <Label className="mb-1">{t('products.fUom')}</Label>
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
              <Label className="mb-1">{t('products.fPrice')}</Label>
              <Input
                type="number"
                step="0.01"
                required
                value={newProduct.initial_price}
                onChange={(e) => setNewProduct({ ...newProduct, initial_price: Number(e.target.value) })}
                className="w-full font-mono"
              />
            </div>

            {isNewWeightPrimary ? (
              <div className="col-span-2">
                <Label className="mb-1">{t('products.pieceCreateGrams')}</Label>
                <Input
                  type="number"
                  min={0}
                  step="any"
                  value={newProduct.grams_per_piece}
                  onChange={(e) => setNewProduct({ ...newProduct, grams_per_piece: e.target.value })}
                  className="w-full font-mono"
                  placeholder={t('products.pieceGramsPh')}
                />
                <p className="text-[10px] text-muted-foreground mt-0.5">{t('products.pieceNote')}</p>
              </div>
            ) : (
              <div className="col-span-2">
                <p className="text-[10px] text-muted-foreground leading-relaxed">{t('products.pieceCreateTip')}</p>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <Button type="button" variant="secondary" size="sm" onClick={() => setIsCreateModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant="primary" size="sm">
              {t('products.create')}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Adjust Price Modal */}
      <Modal
        isOpen={isPriceModalOpen}
        onClose={() => setIsPriceModalOpen(false)}
        title={t('products.priceTitle')}
        subtitle={t('products.priceSubtitle')}
        maxWidth="md"
      >
        <form onSubmit={handleSavePrice} className="space-y-4 text-xs">
          <div>
            <Label className="mb-1">{t('products.pUnit')}</Label>
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
            <Label className="mb-1">{t('products.pPrice')}</Label>
            <Input
              type="number"
              step="0.01"
              required
              value={newPriceForm.price}
              onChange={(e) => setNewPriceForm({ ...newPriceForm, price: Number(e.target.value) })}
              className="w-full font-mono"
              placeholder={t('products.pPricePh')}
            />
          </div>

          <div>
            <Label className="mb-1">{t('products.pDate')}</Label>
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
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant="primary" size="sm">
              {t('products.savePrice')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
