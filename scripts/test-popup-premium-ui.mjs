import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');
const popupHtml = fs.readFileSync(path.join(root, 'src', 'popup.html'), 'utf8');
const popupJs = fs.readFileSync(path.join(root, 'src', 'popup.js'), 'utf8');
const popupDomJs = fs.readFileSync(path.join(root, 'src', 'popup-dom.js'), 'utf8');
const popupCatalogJs = fs.readFileSync(path.join(root, 'src', 'popup-catalog.js'), 'utf8');
const popupRenderersJs = fs.readFileSync(path.join(root, 'src', 'popup-renderers.js'), 'utf8');
const popupComponentsCss = fs.readFileSync(path.join(root, 'src', 'popup-components.css'), 'utf8');
const popupSettingsCss = fs.readFileSync(path.join(root, 'src', 'popup-settings.css'), 'utf8');

test('popup shell exposes the premium navigation contract', () => {
  const requiredIds = [
    'loadingView',
    'authView',
    'successView',
    'mainView',
    'compatView',
    'conflictView',
    'homePanel',
    'productsPanel',
    'licensePanel',
    'settingsPanel',
    'tabHome',
    'tabProducts',
    'tabLicense',
    'tabSettings'
  ];

  for (const id of requiredIds) {
    assert.match(popupHtml, new RegExp(`id="${id}"`), `expected popup.html to include #${id}`);
  }
});

test('popup logic defines explicit view and tab routing helpers', () => {
  assert.match(popupJs, /function setActiveView\(view\)/, 'expected popup.js to define setActiveView(view)');
  assert.match(popupJs, /function setActiveTab\(tab\)/, 'expected popup.js to define setActiveTab(tab)');
});

test('popup boots into a neutral loading state before deciding between auth and main views', () => {
  assert.match(popupHtml, /id="loadingView"/, 'expected popup.html to include a dedicated loading view');
  assert.match(popupJs, /setActiveView\("loading"\);\s*setControlsEnabled\(false\);\s*refreshStatus\(\);/, 'expected popup.js to boot through loading before refreshStatus resolves');
  assert.doesNotMatch(popupJs, /setActiveView\("auth"\);\s*setControlsEnabled\(false\);\s*refreshStatus\(\);/, 'expected popup.js not to force auth view before refreshStatus resolves');
});

test('popup removes the legacy logs tab and top settings shortcut', () => {
  assert.doesNotMatch(popupHtml, />\s*Logs\s*</, 'expected popup.html to remove the Logs tab');
  assert.doesNotMatch(popupHtml, /gear|settings-shortcut|hero-action/i, 'expected popup.html to avoid a top settings shortcut');
});

test('tab navigation swaps the full page area instead of keeping a fixed shell footer', () => {
  assert.match(popupHtml, /id="pageStage"/, 'expected popup.html to define a dedicated page stage for tab content');
  assert.doesNotMatch(popupHtml, /id="shellFooter"/, 'expected popup.html to remove the fixed shell footer');

  const homePanelIndex = popupHtml.indexOf('id="homePanel"');
  const accessBtnIndex = popupHtml.indexOf('id="accessBtn"');
  const productsPanelIndex = popupHtml.indexOf('id="productsPanel"');

  assert.ok(homePanelIndex !== -1 && accessBtnIndex !== -1 && productsPanelIndex !== -1, 'expected home panel, access button and products panel to exist');
  assert.ok(accessBtnIndex > homePanelIndex && accessBtnIndex < productsPanelIndex, 'expected the primary home controls to live inside the Home page content');
});

test('popup shell does not force a 600px canvas height', () => {
  assert.doesNotMatch(popupHtml, /^\s*height:\s*600px;\s*$/m, 'expected popup.html to stop hardcoding a 600px shell height');
});

test('popup renders a human-readable expiry countdown', () => {
  assert.match(popupJs, /function formatExpiryCountdown\(expiresAtMs, nowMs = Date\.now\(\)\)/, 'expected popup.js to define a countdown formatter');
  assert.match(popupJs, /Expira \$\{formatExpiryCountdown\(session\.expiresAtMs\)\}/, 'expected popup.js to render a relative expiry label');
  assert.doesNotMatch(popupHtml, /Expira --/, 'expected popup.html to remove the empty expiry placeholder');
});

test('popup header and navigation copy are fully localized in pt-BR', () => {
  assert.doesNotMatch(popupHtml, /brand-seal/, 'expected popup header to remove the decorative extension icon');
  assert.match(popupHtml, /id="checkoutBtn"[^>]*aria-label="Finalizar compra"/, 'expected checkout CTA to expose a pt-BR aria-label');
  assert.match(popupHtml, /id="checkoutBtn"[^>]*title="Finalizar compra"/, 'expected checkout CTA to expose a pt-BR title');

  const forbiddenEnglish = [
    /Official Extension/,
    /Secure and reliable/,
    /Session protected/,
    /Ready to use/,
    />\s*Products\s*</,
    />\s*Settings\s*</,
    />\s*Checkout\s*</,
    />\s*Home\s*</,
    /Device\s[<-]/,
    /GPT Access/,
    /Perplexity Access/,
    /workflow/i
  ];

  for (const pattern of forbiddenEnglish) {
    assert.doesNotMatch(popupHtml, pattern, `expected popup.html to avoid ${pattern}`);
    assert.doesNotMatch(popupJs, pattern, `expected popup.js to avoid ${pattern}`);
  }
});

test('bottom navigation uses icon-only buttons with pt-BR accessibility labels', () => {
  assert.match(popupHtml, /id="tabHome"[\s\S]*aria-label="Início"/, 'expected home tab to expose an aria-label');
  assert.match(popupHtml, /id="tabProducts"[\s\S]*aria-label="Produtos"/, 'expected products tab to expose an aria-label');
  assert.match(popupHtml, /id="tabLicense"[\s\S]*aria-label="Licença"/, 'expected license tab to expose an aria-label');
  assert.match(popupHtml, /id="tabSettings"[\s\S]*aria-label="Configurações"/, 'expected settings tab to expose an aria-label');

  assert.doesNotMatch(popupHtml, /id="tabHome"[\s\S]*>\s*Início\s*</, 'expected home tab to remove visible text');
  assert.doesNotMatch(popupHtml, /id="tabProducts"[\s\S]*>\s*Produtos\s*</, 'expected products tab to remove visible text');
  assert.doesNotMatch(popupHtml, /id="tabLicense"[\s\S]*>\s*Licença\s*</, 'expected license tab to remove visible text');
  assert.doesNotMatch(popupHtml, /id="tabSettings"[\s\S]*>\s*Configurações\s*</, 'expected settings tab to remove visible text');
});

test('ai selector and product card expose only GPT Pro with an SVG-backed brand icon', () => {
  assert.match(popupHtml, /id="modeGpt"[\s\S]*<svg/s, 'expected the home selector to keep a GPT SVG icon');
  assert.match(popupHtml, /id="modeGpt"[\s\S]*>\s*GPT Pro\s*<\/button>/, 'expected the home selector to label the product as GPT Pro');
  assert.match(popupHtml, /id="settingsModeValue">GPT Pro<\/strong>/, 'expected the settings chip to label the product as GPT Pro');
  assert.doesNotMatch(popupHtml, /id="modePerplexity"|>\s*Perplexity\s*</, 'expected the main mode selector to remove Perplexity');
  assert.doesNotMatch(popupHtml, /id="modeGemini"|>\s*Gemini\s*</, 'expected the main mode selector to remove Gemini');
  assert.doesNotMatch(popupHtml, /id="modeClaude"|>\s*Claude\s*</, 'expected the main mode selector to remove Claude');
  assert.match(popupCatalogJs, /icon:\s*AI_ICON_SVGS\.openai/, 'expected ChatGPT product to use the OpenAI icon');
  assert.doesNotMatch(popupCatalogJs, /AI_ICON_SVGS\.gemini|AI_ICON_SVGS\.claude/, 'expected product catalog to omit Gemini and Claude icons');
});

test('home page keeps GPT as the only selectable mode and uses license entitlement copy', () => {
  assert.doesNotMatch(popupDomJs, /modeGemini|modeClaude/, 'expected popup-dom.js not to bind non-GPT mode buttons');
  assert.doesNotMatch(popupJs, /return "gemini"|return "claude"/, 'expected popup.js not to resolve non-GPT modes');
  assert.doesNotMatch(popupRenderersJs, /isGemini|isClaude/, 'expected popup-renderers.js not to track non-GPT active modes');
  assert.match(popupRenderersJs, /settingsModeValue\.textContent = "GPT Pro"/, 'expected runtime mode rendering to keep the GPT Pro label');
  assert.match(popupRenderersJs, /Sem produtos ativos/, 'expected popup-renderers.js to expose an empty-entitlement state');
  assert.match(popupRenderersJs, /bootstrapConfig\.licenseKeyConfigured \? "Licença ativa" : "Licença inativa"/, 'expected popup-renderers.js to keep active or inactive license copy');
  assert.doesNotMatch(popupRenderersJs, /Licença pendente/, 'expected popup-renderers.js to stop using the pending license label');
  assert.match(popupComponentsCss, /\.mode-selector\s*\{[^}]*grid-template-columns:\s*1fr;/, 'expected the single GPT selector to occupy the full row');
  assert.match(popupComponentsCss, /\.meta-pill \{[\s\S]*justify-content: flex-start;/, 'expected the home meta pill to left-align its content');
});

test('home license card does not render operational status logs', () => {
  assert.doesNotMatch(popupHtml, /data-shared-status/, 'expected home metadata cards not to receive runtime status log text');
  assert.doesNotMatch(popupHtml, /class="status"[^>]*data-shared-status/, 'expected the license status dot to stay decorative');
});

test('home summary removes the middle device card', () => {
  assert.doesNotMatch(popupHtml, /id="deviceMeta"/, 'expected popup.html to remove the middle device meta card');
  assert.doesNotMatch(popupJs, /deviceMeta/, 'expected popup.js to stop depending on the removed device meta card');
});

test('stop session action lives in settings instead of the home page', () => {
  const homePanelIndex = popupHtml.indexOf('id="homePanel"');
  const productsPanelIndex = popupHtml.indexOf('id="productsPanel"');
  const settingsPanelIndex = popupHtml.indexOf('id="settingsPanel"');
  const stopButtonIndex = popupHtml.indexOf('id="stopBtn"');

  assert.ok(homePanelIndex !== -1 && productsPanelIndex !== -1 && settingsPanelIndex !== -1 && stopButtonIndex !== -1, 'expected home, products, settings and stop button to exist');
  assert.ok(!(stopButtonIndex > homePanelIndex && stopButtonIndex < productsPanelIndex), 'expected stop button to be removed from the home page');
  assert.ok(stopButtonIndex > settingsPanelIndex, 'expected stop button to live inside the settings page');
});

test('settings page promotes mode into the header and groups maintenance separately', () => {
  const actionListBlock = popupSettingsCss.match(/\.settings-actions-list\s*\{[\s\S]*?\n\}/)?.[0] || "";
  assert.match(
    popupHtml,
    /class="page-heading settings-heading"[\s\S]*<h2>Ajustes<\/h2>[\s\S]*class="settings-mode-chip"[\s\S]*id="settingsModeValue"/,
    'expected settings mode to live in a compact header chip'
  );
  assert.match(popupHtml, /id="settingsToolsCard"/, 'expected settings page to include a dedicated maintenance card');
  assert.match(popupHtml, /class="settings-actions-list"/, 'expected settings utilities to live inside a compact vertical list');
  assert.doesNotMatch(popupHtml, /Manutenção/, 'expected settings card to remove the maintenance label');
  assert.match(actionListBlock, /background:\s*transparent/, 'expected the action list to stay visually clear');
  assert.match(actionListBlock, /border:\s*none/, 'expected the action list to avoid a nested card border');
  assert.match(actionListBlock, /box-shadow:\s*none/, 'expected the action list to avoid a nested card shadow');
  assert.match(popupHtml, /class="settings-tool-btn"/, 'expected the actions to remain rounded buttons');
  assert.match(popupHtml, /id="checkEnvironmentBtn"[\s\S]*data-button-label>Diagnóstico</, 'expected diagnostic action to show its label');
  assert.match(popupHtml, /id="reloadExtensionBtn"[\s\S]*data-button-label>Recarregar</, 'expected reload action to show its label');
  assert.match(popupHtml, /id="updateExtensionBtn"[\s\S]*data-button-label>Atualizar</, 'expected update action to show its label');
  assert.match(popupHtml, /id="settingsToolsCard"[\s\S]*id="stopBtn"/, 'expected stop action to live inside the same tools card');
  assert.match(
    popupHtml,
    /id="stopBtn"[^>]*aria-label="Sair"/,
    'expected the stop action to expose an aria-label'
  );
  assert.match(popupHtml, /id="stopBtn"[\s\S]*data-button-label>Sair</, 'expected stop action to show its label');
});

test('home page removes the secure and reliable reassurance card', () => {
  assert.doesNotMatch(popupHtml, /id="homeSupportTitle"/, 'expected popup.html to remove the old home reassurance title');
  assert.doesNotMatch(popupHtml, /id="homeSupportText"/, 'expected popup.html to remove the old home reassurance copy');
  assert.doesNotMatch(popupJs, /homeSupportTitle/, 'expected popup.js to stop depending on the removed home reassurance card');
  assert.doesNotMatch(popupJs, /homeSupportText/, 'expected popup.js to stop depending on the removed home reassurance card');
});

test('products page exposes a compact month switcher above the value', () => {
  assert.match(popupHtml, /id="productCycleCard"/, 'expected popup.html to include a dedicated month card');
  assert.match(popupHtml, /id="productCycle1"/, 'expected popup.html to include the 1 month switcher');
  assert.match(popupHtml, /id="productCycle2"/, 'expected popup.html to include the 2 month switcher');
  assert.match(popupHtml, /id="productCycle3"/, 'expected popup.html to include the 3 month switcher');
  assert.match(popupHtml, /id="productCycle2"[^>]*>2 meses<\/button>/, 'expected the 2 month cycle button to avoid discount copy');
  assert.match(popupHtml, /id="productCycle3"[^>]*>3 meses<\/button>/, 'expected the 3 month cycle button to avoid discount copy');
  assert.match(popupHtml, /id="productDiscountBadge"[\s\S]*class="checkout-discount hidden"/, 'expected the discount badge to live beside the checkout price');
  assert.doesNotMatch(popupHtml, /Acumulado no ciclo/, 'expected popup.html to remove the verbose cycle helper copy');
  assert.doesNotMatch(popupHtml, /id="productSummaryText"/, 'expected popup.html to remove the item count from the checkout');
  assert.doesNotMatch(popupHtml, /id="productTotalCaption"/, 'expected popup.html to remove the total caption from the checkout');
  assert.match(popupHtml, /id="checkoutBtn"/, 'expected popup.html to keep the checkout button in the product bar');
  assert.doesNotMatch(popupHtml, /Perplexity Pro/, 'expected popup.html to remove Perplexity from the product card');
  assert.doesNotMatch(popupCatalogJs, /Perplexity Pro/, 'expected popup-catalog.js to remove Perplexity from the catalog');
  assert.match(popupCatalogJs, /ChatGPT Pro", priceLabel: "R\$ 99,90", priceValue: 99\.9/, 'expected ChatGPT Pro to use the divided per-user price');
  assert.doesNotMatch(popupCatalogJs, /Gemini AI Ultra|Claude Max 20x/, 'expected the catalog to offer only GPT Pro for now');
  assert.match(popupRenderersJs, /R\$ \$\{total\.toFixed\(2\)\.replace\("\.", ","\)\}/, 'expected popup-renderers.js to format totals in Brazilian reais');
  assert.match(popupRenderersJs, /button\.className = "product-card";/, 'expected popup-renderers.js to keep products as distinct rounded cards');
  assert.match(popupComponentsCss, /\.checkout-total \{[\s\S]*font-size: 12px;/, 'expected the total value to stay aligned with product price sizes');
  assert.match(popupComponentsCss, /\.checkout-discount \{[\s\S]*font-size: 9px;[\s\S]*font-style: italic;/, 'expected the discount badge to be smaller and italic');
  assert.match(popupComponentsCss, /\.checkout-btn \{[\s\S]*width: 34px;/, 'expected the checkout CTA to remain an icon button');
  assert.match(popupCatalogJs, /let billingCycleMonths = 1;/, 'expected popup-catalog.js to persist the selected billing cycle');
  assert.match(popupCatalogJs, /BILLING_CYCLE_DISCOUNTS[\s\S]*2:\s*0\.05[\s\S]*3:\s*0\.1/, 'expected 2 and 3 month cycles to carry fixed discounts');
  assert.match(popupCatalogJs, /function calculateCycleTotal\(products, months\)/, 'expected popup-catalog.js to own discounted cycle total calculation');
  assert.match(popupCatalogJs, /function getCycleDiscountPercent\(months\)/, 'expected popup-catalog.js to expose the active discount percent');
  assert.match(popupRenderersJs, /CATALOG\.calculateCycleTotal\(selectedProducts, cycleMonths\)/, 'expected popup-renderers.js to apply cycle discounts when rendering the total');
  assert.match(popupRenderersJs, /refs\.productDiscountBadge\.textContent = `\$\{discountPercent\}% OFF`;/, 'expected popup-renderers.js to render discount copy beside the price');
});

test('license page uses a premium overview card instead of the legacy simple card', () => {
  assert.match(popupHtml, /id="licensePanel"[\s\S]*class="license-ultra-card"/, 'expected a dedicated license overview card');
  assert.match(popupHtml, /id="copyLicenseBtn"/, 'expected popup.html to expose a license copy action');
  assert.match(popupHtml, /id="licenseStatusPill"/, 'expected popup.html to include a status pill');
  assert.match(popupHtml, /id="licenseKeyValue"/, 'expected popup.html to include the masked key');
  assert.match(popupHtml, /id="licenseActivatedValue"/, 'expected popup.html to include the activation date');
  assert.match(popupHtml, /id="licenseRenewalValue"/, 'expected popup.html to include the renewal date');
  assert.doesNotMatch(popupHtml, /Expira em/, 'expected popup.html to remove the expiry label');
  assert.doesNotMatch(popupHtml, /Assentos/, 'expected popup.html to remove the seats label');
  assert.doesNotMatch(popupHtml, /Protegido/, 'expected popup.html to remove the protection footer copy');
  assert.doesNotMatch(popupHtml, /Falar com suporte/i, 'expected popup.html to remove the support CTA');
  assert.doesNotMatch(popupHtml, /id="licenseSeatsValue"/, 'expected popup.html to remove the seats metric');
  assert.doesNotMatch(popupHtml, /id="licenseExpiryValue"/, 'expected popup.html to remove the expiry summary value');
  assert.doesNotMatch(popupHtml, /id="licenseExpiryDateValue"/, 'expected popup.html to remove the expiry date label');
  assert.doesNotMatch(popupHtml, /id="licenseActionBtn"/, 'expected popup.html to remove the support action');
  assert.doesNotMatch(popupHtml, /id="licenseDeviceValue"/, 'expected popup.html to remove the old device row');
});

test('popup DOM bindings do not point to removed HTML ids', () => {
  const referencedIds = [...popupDomJs.matchAll(/byId\("([^"]+)"\)/g)].map((match) => match[1]);
  const missingIds = referencedIds.filter((id) => !new RegExp(`id="${id}"`).test(popupHtml));

  assert.deepEqual(
    missingIds,
    [],
    `expected popup-dom.js to reference only ids present in popup.html, but missing: ${missingIds.join(', ')}`
  );
});
