(function () {
  const AI_ICON_SVGS = Object.freeze({
    openai: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="4.8" r="2.1"></circle><circle cx="17.2" cy="7.8" r="2.1"></circle><circle cx="17.2" cy="16.2" r="2.1"></circle><circle cx="12" cy="19.2" r="2.1"></circle><circle cx="6.8" cy="16.2" r="2.1"></circle><circle cx="6.8" cy="7.8" r="2.1"></circle><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"></circle></svg>`,
    gemini: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.2 6.8L21 11l-6.8 2.2L12 20l-2.2-6.8L3 11l6.8-2.2L12 2z"></path></svg>`,
    claude: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 19 7v10l-7 4-7-4V7z"></path><path d="M9 9.2h6"></path><path d="M9 12h4.8"></path><path d="M9 14.8h3.6"></path></svg>`
  });

  const PRODUCT_CATALOG = Object.freeze([
    { id: "gpt", icon: AI_ICON_SVGS.openai, name: "ChatGPT Pro", priceLabel: "R$ 99,90", priceValue: 99.90 },
    { id: "gemini", icon: AI_ICON_SVGS.gemini, name: "Gemini AI Ultra", priceLabel: "R$ 120,99", priceValue: 120.99 },
    { id: "claude", icon: AI_ICON_SVGS.claude, name: "Claude Max 20x", priceLabel: "R$ 110,00", priceValue: 110 }
  ]);

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

  globalThis.ArborPopupCatalog = Object.freeze({
    AI_ICON_SVGS,
    PRODUCT_CATALOG,
    productSelection,
    setProductSelection,
    get billingCycleMonths() {
      return billingCycleMonths;
    },
    toggleProductSelection,
    getSelectedProducts,
    setBillingCycleMonths
  });
})();
