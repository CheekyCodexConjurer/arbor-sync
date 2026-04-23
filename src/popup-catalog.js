(function () {
  const AI_ICON_SVGS = Object.freeze({
    openai: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="4.8" r="2.1"></circle><circle cx="17.2" cy="7.8" r="2.1"></circle><circle cx="17.2" cy="16.2" r="2.1"></circle><circle cx="12" cy="19.2" r="2.1"></circle><circle cx="6.8" cy="16.2" r="2.1"></circle><circle cx="6.8" cy="7.8" r="2.1"></circle><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"></circle></svg>`
  });

  const PRODUCT_CATALOG = Object.freeze([
    { id: "gpt", icon: AI_ICON_SVGS.openai, name: "ChatGPT Pro", priceLabel: "R$ 99,90", priceValue: 99.90 }
  ]);

  const BILLING_CYCLE_DISCOUNTS = Object.freeze({
    1: 0,
    2: 0.05,
    3: 0.1
  });

  const productSelection = new Set(["gpt"]);
  let billingCycleMonths = 1;

  function toggleProductSelection(productId) {
    if (productSelection.has(productId)) {
      productSelection.delete(productId);
      return;
    }

    productSelection.add(productId);
  }

  function getSelectedProducts() {
    return PRODUCT_CATALOG.filter((product) => productSelection.has(product.id));
  }

  function setProductSelection(productIds) {
    productSelection.clear();
    PRODUCT_CATALOG.forEach((product) => {
      if (Array.isArray(productIds) && productIds.includes(product.id)) {
        productSelection.add(product.id);
      }
    });
  }

  function setBillingCycleMonths(months) {
    const nextValue = Number(months);
    billingCycleMonths = nextValue >= 1 && nextValue <= 3 ? nextValue : 1;
  }

  function calculateCycleTotal(products, months) {
    const cycleMonths = Number(months);
    const subtotal = (Array.isArray(products) ? products : [])
      .reduce((sum, product) => sum + product.priceValue, 0) * cycleMonths;
    const discount = BILLING_CYCLE_DISCOUNTS[cycleMonths] || 0;
    return subtotal * (1 - discount);
  }

  function getCycleDiscountPercent(months) {
    return Math.round((BILLING_CYCLE_DISCOUNTS[Number(months)] || 0) * 100);
  }

  globalThis.ArborPopupCatalog = Object.freeze({
    AI_ICON_SVGS,
    PRODUCT_CATALOG,
    BILLING_CYCLE_DISCOUNTS,
    productSelection,
    setProductSelection,
    get billingCycleMonths() {
      return billingCycleMonths;
    },
    toggleProductSelection,
    getSelectedProducts,
    setBillingCycleMonths,
    calculateCycleTotal,
    getCycleDiscountPercent
  });
})();
