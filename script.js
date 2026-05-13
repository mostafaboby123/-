/**
 * ============================================================
 * QUOTATION SYSTEM — SCRIPT.JS
 * Arabic RTL Quotation Management App
 * Features: Product CRUD, Company Info, PDF Export
 * Storage: LocalStorage
 * ============================================================
 */

'use strict';

// ============================================================
// CONSTANTS
// ============================================================
const ADMIN_PASSWORD = '011203';
const LS_PRODUCTS    = 'qs_products';
const LS_COMPANY     = 'qs_company';
const LS_PRICES      = 'qs_prices';
const LS_NOTES       = 'qs_notes';
const LS_TERMS       = 'qs_terms';
const LS_QUOTE_NUM   = 'qs_quote_number';
const LS_STEP        = 'qs_current_step';

// Default product list
const DEFAULT_PRODUCTS = [
  { id: 1, name: 'حبارة 111S',        qty: 3  },
  { id: 2, name: 'حبارة 37A',         qty: 2  },
  { id: 3, name: 'حبارة 17A',         qty: 4  },
  { id: 4, name: 'حبارة كانون 725',   qty: 2  },
  { id: 5, name: 'حبارة 83A',         qty: 6  },
  { id: 6, name: 'حبارة برازر 2010',  qty: 4  },
  { id: 7, name: 'حبارة EXV 33',      qty: 7  },
  { id: 8, name: 'حبارة 85A',         qty: 12 },
  { id: 9, name: 'حبارة 12A',         qty: 7  },
  { id: 10,name: 'حبارة 106A',        qty: 5  },
];

// ============================================================
// STATE
// ============================================================
let products       = [];
let companyData    = {};
let prices         = {};       // { productId: unitPrice }
let quoteNumber    = '';
let currentStep    = 1;
let pendingDeleteId = null;

// ============================================================
// HELPERS
// ============================================================

/** Generate a unique product ID */
function genId() {
  return Date.now() + Math.floor(Math.random() * 1000);
}

/** Generate quote number like Q-2026-0012 */
function generateQuoteNumber() {
  const year = new Date().getFullYear();
  const stored = JSON.parse(localStorage.getItem(LS_QUOTE_NUM) || '{"year":0,"seq":0}');
  let seq = stored.year === year ? stored.seq + 1 : 1;
  localStorage.setItem(LS_QUOTE_NUM, JSON.stringify({ year, seq }));
  return `Q-${year}-${String(seq).padStart(4, '0')}`;
}

/** Format currency */
function formatCurrency(value) {
  const num = parseFloat(value) || 0;
  return 'EGP ' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Format Egyptian phone number */
function formatPhone(phone) {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11) {
    return digits.replace(/(\d{4})(\d{4})(\d{3})/, '$1-$2-$3');
  }
  return phone;
}

/** Validate Egyptian phone number */
function isValidPhone(phone) {
  const digits = phone.replace(/\D/g, '');
  return /^01[0-9]{9}$/.test(digits);
}

/** Get today's date formatted YYYY-MM-DD */
function todayDate() {
  return new Date().toISOString().split('T')[0];
}

/** Format date to Arabic readable */
function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
}

// ============================================================
// LOCAL STORAGE
// ============================================================

function saveProducts() {
  localStorage.setItem(LS_PRODUCTS, JSON.stringify(products));
}

function loadProducts() {
  const stored = localStorage.getItem(LS_PRODUCTS);
  if (stored) {
    products = JSON.parse(stored);
  } else {
    products = DEFAULT_PRODUCTS.map(p => ({ ...p }));
    saveProducts();
  }
}

function saveCompany() {
  localStorage.setItem(LS_COMPANY, JSON.stringify(companyData));
}

function loadCompany() {
  const stored = localStorage.getItem(LS_COMPANY);
  companyData = stored ? JSON.parse(stored) : {};
}

function savePrices() {
  localStorage.setItem(LS_PRICES, JSON.stringify(prices));
}

function loadPrices() {
  const stored = localStorage.getItem(LS_PRICES);
  prices = stored ? JSON.parse(stored) : {};
}

function saveNotes() {
  localStorage.setItem(LS_NOTES, document.getElementById('quoteNotes').value);
  localStorage.setItem(LS_TERMS, document.getElementById('quoteTerms').value);
}

function loadNotes() {
  const notes = localStorage.getItem(LS_NOTES) || '';
  const terms = localStorage.getItem(LS_TERMS) || '';
  document.getElementById('quoteNotes').value = notes;
  document.getElementById('quoteTerms').value = terms;
}

function saveStep() {
  localStorage.setItem(LS_STEP, currentStep);
}

// ============================================================
// RENDER: PRODUCTS TABLE (Page 1)
// ============================================================

function renderProductsTable() {
  const tbody = document.getElementById('productsBody');
  tbody.innerHTML = '';

  products.forEach((p, index) => {
    const tr = document.createElement('tr');
    tr.dataset.id = p.id;
    tr.innerHTML = `
      <td class="col-num">${index + 1}</td>
      <td>
        <input type="text" class="inline-input" value="${escapeHtml(p.name)}"
          onchange="updateProductName(${p.id}, this.value)"
          onblur="updateProductName(${p.id}, this.value)" />
      </td>
      <td class="col-qty">
        <input type="number" class="inline-input qty-inline" value="${p.qty}" min="1"
          onchange="updateProductQty(${p.id}, this.value)"
          onblur="updateProductQty(${p.id}, this.value)" />
      </td>
      <td class="col-actions">
        <button class="btn-icon danger" onclick="requestDeleteProduct(${p.id})" title="حذف المنتج">🗑️</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById('productsCount').textContent =
    `إجمالي المنتجات: ${products.length}`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ============================================================
// PRODUCT CRUD
// ============================================================

function addProduct() {
  const nameEl = document.getElementById('newProductName');
  const qtyEl  = document.getElementById('newProductQty');
  const name   = nameEl.value.trim();
  const qty    = parseInt(qtyEl.value) || 1;

  if (!name) {
    nameEl.focus();
    nameEl.style.borderColor = 'var(--danger)';
    setTimeout(() => { nameEl.style.borderColor = ''; }, 2000);
    return;
  }

  const newProduct = { id: genId(), name, qty: Math.max(1, qty) };
  products.push(newProduct);
  saveProducts();
  renderProductsTable();

  nameEl.value = '';
  qtyEl.value  = 1;
  nameEl.focus();
}

function updateProductName(id, value) {
  const trimmed = value.trim();
  if (!trimmed) return;
  const product = products.find(p => p.id === id);
  if (product) {
    product.name = trimmed;
    saveProducts();
  }
}

function updateProductQty(id, value) {
  const qty = parseInt(value);
  if (!qty || qty < 1) return;
  const product = products.find(p => p.id === id);
  if (product) {
    product.qty = qty;
    saveProducts();
  }
}

function requestDeleteProduct(id) {
  pendingDeleteId = id;
  document.getElementById('deleteModal').classList.remove('hidden');
  document.getElementById('confirmDeleteBtn').onclick = confirmDelete;
}

function confirmDelete() {
  if (!pendingDeleteId) return;
  products = products.filter(p => p.id !== pendingDeleteId);
  delete prices[pendingDeleteId];
  saveProducts();
  savePrices();
  renderProductsTable();
  closeDeleteModal();
  pendingDeleteId = null;
}

function closeDeleteModal() {
  document.getElementById('deleteModal').classList.add('hidden');
  pendingDeleteId = null;
}

// ============================================================
// STEP NAVIGATION
// ============================================================

/** Step 1 → Step 2 */
function goToStep2() {
  if (products.length === 0) {
    alert('يرجى إضافة منتج واحد على الأقل!');
    return;
  }
  currentStep = 2;
  saveStep();
  showPage(2);
  updateStepIndicator();
  populateCompanyForm();
  // Set default date if empty
  if (!document.getElementById('quoteDate').value) {
    document.getElementById('quoteDate').value = todayDate();
  }
}

/** Step 2 → Step 1 (with admin lock) */
function goBackToStep1() {
  // Show admin modal
  openAdminModal(() => {
    currentStep = 1;
    saveStep();
    showPage(1);
    updateStepIndicator();
    renderProductsTable();
  });
}

/** Step 2 → Step 3 */
function goToStep3() {
  if (!validateCompanyForm()) return;
  collectCompanyData();
  saveCompany();

  // Generate quote number if not already set
  if (!quoteNumber) {
    quoteNumber = generateQuoteNumber();
  }
  document.getElementById('quoteNumberBadge').textContent = quoteNumber;

  currentStep = 3;
  saveStep();
  showPage(3);
  updateStepIndicator();
  renderCompanySummary();
  renderPricesTable();
  loadNotes();
}

/** Step 3 → Step 2 */
function goBackToStep2() {
  saveNotesFromUI();
  currentStep = 2;
  saveStep();
  showPage(2);
  updateStepIndicator();
  populateCompanyForm();
}

/** Show a specific page */
function showPage(num) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(`page${num}`).classList.add('active');
}

/** Update step progress indicator */
function updateStepIndicator() {
  for (let i = 1; i <= 3; i++) {
    const indicator = document.getElementById(`stepIndicator${i}`);
    const line      = document.getElementById(`stepLine${i}`);
    indicator.classList.remove('active', 'done');
    if (line) line.classList.remove('done');

    if (i < currentStep) {
      indicator.classList.add('done');
      if (line) line.classList.add('done');
    } else if (i === currentStep) {
      indicator.classList.add('active');
    }
  }
}

// ============================================================
// ADMIN LOCK
// ============================================================

let adminCallback = null;

function openAdminModal(callback) {
  adminCallback = callback;
  document.getElementById('adminPasswordInput').value = '';
  document.getElementById('adminError').classList.add('hidden');
  document.getElementById('adminModal').classList.remove('hidden');
  setTimeout(() => document.getElementById('adminPasswordInput').focus(), 100);
}

function verifyAdminPassword() {
  const input = document.getElementById('adminPasswordInput').value;
  if (input === ADMIN_PASSWORD) {
    document.getElementById('adminModal').classList.add('hidden');
    document.getElementById('adminError').classList.add('hidden');
    if (typeof adminCallback === 'function') {
      adminCallback();
      adminCallback = null;
    }
  } else {
    document.getElementById('adminError').classList.remove('hidden');
    document.getElementById('adminPasswordInput').value = '';
    document.getElementById('adminPasswordInput').focus();
    // Shake animation
    const box = document.querySelector('#adminModal .modal-box');
    box.style.animation = 'none';
    box.offsetHeight; // reflow
    box.style.animation = 'shake 0.4s ease';
  }
}

function closeAdminModal() {
  document.getElementById('adminModal').classList.add('hidden');
  adminCallback = null;
}

// ============================================================
// COMPANY FORM
// ============================================================

function populateCompanyForm() {
  if (!companyData) return;
  const fields = ['companyName','companyPhone','companyAddress','managerName','managerPhone','quoteDate'];
  fields.forEach(id => {
    if (companyData[id] !== undefined) {
      document.getElementById(id).value = companyData[id];
    }
  });
}

function collectCompanyData() {
  companyData = {
    companyName:    document.getElementById('companyName').value.trim(),
    companyPhone:   document.getElementById('companyPhone').value.trim(),
    companyAddress: document.getElementById('companyAddress').value.trim(),
    managerName:    document.getElementById('managerName').value.trim(),
    managerPhone:   document.getElementById('managerPhone').value.trim(),
    quoteDate:      document.getElementById('quoteDate').value,
  };
}

function validateCompanyForm() {
  let valid = true;
  const fields = [
    { id: 'companyName',    label: 'اسم الشركة',          type: 'text' },
    { id: 'companyPhone',   label: 'رقم هاتف الشركة',     type: 'phone' },
    { id: 'companyAddress', label: 'العنوان',              type: 'text' },
    { id: 'managerName',    label: 'اسم المسؤول',          type: 'text' },
    { id: 'managerPhone',   label: 'رقم هاتف المسؤول',    type: 'phone' },
    { id: 'quoteDate',      label: 'تاريخ العرض',          type: 'date' },
  ];

  fields.forEach(f => {
    const el     = document.getElementById(f.id);
    const errEl  = document.getElementById(`err-${f.id}`);
    const value  = el.value.trim();
    let errMsg   = '';

    if (!value) {
      errMsg = `${f.label} مطلوب`;
    } else if (f.type === 'phone' && !isValidPhone(value)) {
      errMsg = 'رقم الهاتف غير صحيح (مثال: 01XXXXXXXXX)';
    }

    if (errMsg) {
      errEl.textContent = errMsg;
      el.classList.add('error');
      valid = false;
    } else {
      errEl.textContent = '';
      el.classList.remove('error');
    }
  });

  return valid;
}

// ============================================================
// COMPANY SUMMARY (Page 3 top card)
// ============================================================

function renderCompanySummary() {
  const card = document.getElementById('companySummaryCard');
  card.innerHTML = `
    <div class="summary-grid">
      <div class="summary-item">
        <span class="summary-label">🏢 الشركة</span>
        <span class="summary-value accent">${escapeHtml(companyData.companyName || '')}</span>
      </div>
      <div class="summary-item">
        <span class="summary-label">📞 الهاتف</span>
        <span class="summary-value">${escapeHtml(companyData.companyPhone || '')}</span>
      </div>
      <div class="summary-item">
        <span class="summary-label">📍 العنوان</span>
        <span class="summary-value">${escapeHtml(companyData.companyAddress || '')}</span>
      </div>
      <div class="summary-item">
        <span class="summary-label">👤 المسؤول</span>
        <span class="summary-value">${escapeHtml(companyData.managerName || '')}</span>
      </div>
      <div class="summary-item">
        <span class="summary-label">📱 هاتف المسؤول</span>
        <span class="summary-value">${escapeHtml(companyData.managerPhone || '')}</span>
      </div>
      <div class="summary-item">
        <span class="summary-label">📅 تاريخ العرض</span>
        <span class="summary-value">${formatDate(companyData.quoteDate)}</span>
      </div>
    </div>
  `;
}

// ============================================================
// PRICES TABLE (Page 3)
// ============================================================

function renderPricesTable() {
  const tbody = document.getElementById('pricesBody');
  tbody.innerHTML = '';

  products.forEach((p, index) => {
    const savedPrice = prices[p.id] || '';
    const tr = document.createElement('tr');
    tr.dataset.id = p.id;
    tr.innerHTML = `
      <td class="col-num">${index + 1}</td>
      <td>${escapeHtml(p.name)}</td>
      <td class="col-qty" style="text-align:center">${p.qty}</td>
      <td class="col-price">
        <input type="number" class="price-input" placeholder="0.00" min="0" step="0.01"
          value="${savedPrice}"
          oninput="onPriceChange(${p.id}, this.value)"
          data-id="${p.id}" />
      </td>
      <td class="col-total total-cell" id="total-${p.id}">
        ${savedPrice ? formatCurrency((parseFloat(savedPrice) || 0) * p.qty) : '—'}
      </td>
    `;
    tbody.appendChild(tr);
  });

  recalcGrandTotal();
}

function onPriceChange(id, value) {
  const price   = parseFloat(value) || 0;
  prices[id]    = value;
  savePrices();

  const product  = products.find(p => p.id === id);
  const totalEl  = document.getElementById(`total-${id}`);
  if (product && totalEl) {
    const total = price * product.qty;
    totalEl.textContent = price > 0 ? formatCurrency(total) : '—';
  }
  recalcGrandTotal();
}

function recalcGrandTotal() {
  let grand = 0;
  products.forEach(p => {
    const price = parseFloat(prices[p.id]) || 0;
    grand += price * p.qty;
  });
  document.getElementById('grandTotal').textContent = formatCurrency(grand);
}

// ============================================================
// NOTES
// ============================================================

function saveNotesFromUI() {
  localStorage.setItem(LS_NOTES, document.getElementById('quoteNotes').value);
  localStorage.setItem(LS_TERMS, document.getElementById('quoteTerms').value);
}

// ============================================================
// CLEAR ALL DATA
// ============================================================

function showClearModal() {
  document.getElementById('clearModal').classList.remove('hidden');
}

function closeClearModal() {
  document.getElementById('clearModal').classList.add('hidden');
}

function clearAllData() {
  localStorage.clear();
  products    = DEFAULT_PRODUCTS.map(p => ({ ...p }));
  companyData = {};
  prices      = {};
  quoteNumber = '';
  currentStep = 1;
  saveProducts();
  document.getElementById('quoteNumberBadge').textContent = '';
  showPage(1);
  updateStepIndicator();
  renderProductsTable();
  closeClearModal();
}

// ============================================================
// PRINT
// ============================================================

function printQuote() {
  saveNotesFromUI();
  const win = window.open('', '_blank');
  win.document.write(buildPrintHTML());
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 500);
}

// ============================================================
// PDF EXPORT — Pure jsPDF (no html2canvas)
// ============================================================

async function downloadPDF() {
  saveNotesFromUI();
  const loadingEl = document.getElementById('pdfLoading');
  loadingEl.classList.remove('hidden');

  try {
    await new Promise(r => setTimeout(r, 80)); // let spinner render

    const { jsPDF } = window.jspdf;
    const pdf  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pw   = 210;   // page width mm
    const ph   = 297;   // page height mm
    const ml   = 14;    // margin left
    const mr   = 14;    // margin right
    const cw   = pw - ml - mr;  // content width

    // ── helpers ──────────────────────────────────────────────
    let y = 0;

    function checkPageBreak(needed = 10) {
      if (y + needed > ph - 14) { pdf.addPage(); y = 16; }
    }

    function rect(x, yw, w, h, fillColor, strokeColor) {
      if (fillColor)  { pdf.setFillColor(...fillColor);   pdf.rect(x, yw, w, h, 'F'); }
      if (strokeColor){ pdf.setDrawColor(...strokeColor); pdf.rect(x, yw, w, h, 'S'); }
    }

    function text(str, x, yw, opts = {}) {
      // jsPDF has basic RTL via align:'right' — we mirror x for RTL
      pdf.text(String(str), x, yw, opts);
    }

    // jsPDF uses built-in fonts only (no Arabic shaping).
    // We render Arabic via a canvas-per-text approach using the browser.
    // Each Arabic string → small canvas → PNG → placed in PDF.
    async function arabicImg(str, fontSizePt, fontWeight, color, maxWidthMm) {
      const scale   = 3;
      const pxPerMm = 3.7795 * scale;
      const maxPx   = Math.round(maxWidthMm * pxPerMm);
      const fSizePx = Math.round(fontSizePt * 1.333 * scale);

      const cv  = document.createElement('canvas');
      const ctx = cv.getContext('2d');
      ctx.font  = `${fontWeight} ${fSizePx}px Tajawal, Arial`;

      const measured = ctx.measureText(str).width;
      cv.width  = Math.min(measured + 10, maxPx) || 10;
      cv.height = fSizePx * 1.5;

      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.font      = `${fontWeight} ${fSizePx}px Tajawal, Arial`;
      ctx.fillStyle = color || '#000000';
      ctx.direction = 'rtl';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText(str, cv.width - 2, fSizePx * 0.1, cv.width - 4);

      return {
        dataUrl : cv.toDataURL('image/png'),
        widthMm : cv.width  / pxPerMm,
        heightMm: cv.height / pxPerMm,
      };
    }

    // Place Arabic image right-aligned inside [x, yw, w] box
    async function placeAr(str, x, yw, widthMm, fontSizePt, fontWeight, color) {
      if (!str) return;
      const img = await arabicImg(str, fontSizePt, fontWeight, color, widthMm);
      const ix  = x + widthMm - img.widthMm;   // right-align
      pdf.addImage(img.dataUrl, 'PNG', ix, yw, img.widthMm, img.heightMm);
    }

    // Place Arabic image left-aligned (for LTR values like numbers/currency)
    async function placeLtr(str, x, yw, widthMm, fontSizePt, fontWeight, color) {
      if (!str) return;
      const img = await arabicImg(str, fontSizePt, fontWeight, color, widthMm);
      pdf.addImage(img.dataUrl, 'PNG', x, yw, img.widthMm, img.heightMm);
    }

    // ── HEADER BLOCK ─────────────────────────────────────────
    y = 0;
    // Navy rectangle
    rect(0, 0, pw, 40, [15, 37, 64]);

    // Gold bottom border line
    pdf.setDrawColor(201, 162, 39);
    pdf.setLineWidth(1.2);
    pdf.line(0, 40, pw, 40);
    pdf.setLineWidth(0.3);

    // Company name (large, white)
    await placeAr(companyData.companyName || 'اسم الشركة', ml, 4, cw * 0.55, 14, '900', '#ffffff');
    // Subtitle
    await placeAr('أحبار • برنترات • مستلزمات كمبيوتر', ml, 14, cw * 0.55, 7, '400', '#c9a227');

    // Quote number + date (right side of header — left in PDF coordinates since we flip)
    const qnImg = await arabicImg(quoteNumber, 10, '800', '#c9a227', 60);
    pdf.addImage(qnImg.dataUrl, 'PNG', pw - mr - qnImg.widthMm, 5, qnImg.widthMm, qnImg.heightMm);
    const dtImg = await arabicImg(formatDate(companyData.quoteDate), 7.5, '400', 'rgba(255,255,255,0.75)', 60);
    pdf.addImage(dtImg.dataUrl, 'PNG', pw - mr - dtImg.widthMm, 13, dtImg.widthMm, dtImg.heightMm);

    // Contact row
    y = 43;
    const contacts = [
      `📞 هاتف: ${companyData.companyPhone || ''}`,
      `📍 ${companyData.companyAddress || ''}`,
      `👤 ${companyData.managerName || ''}`,
      `📱 ${companyData.managerPhone || ''}`,
    ];
    // Render as 2 rows × 2 cols
    const colW = cw / 2;
    for (let i = 0; i < contacts.length; i++) {
      const cx = ml + (i % 2 === 0 ? 0 : colW);
      const cy = y + Math.floor(i / 2) * 6;
      await placeAr(contacts[i], cx, cy, colW, 7.5, '400', '#2a4060');
    }
    y += 14;

    // ── TITLE ────────────────────────────────────────────────
    y += 4;
    await placeAr('عرض سعر', ml, y, cw, 18, '900', '#1a3a5c');
    y += 10;
    // Gold divider
    pdf.setDrawColor(201, 162, 39);
    pdf.setLineWidth(1.5);
    pdf.line(pw / 2 - 15, y, pw / 2 + 15, y);
    pdf.setLineWidth(0.3);
    y += 4;
    await placeAr('موجّه إلى: جامعة بني سويف', ml, y, cw, 9, '700', '#5a6a7a');
    y += 10;

    // ── TABLE HEADER ─────────────────────────────────────────
    const cols = {
      num  : { x: ml,               w: 12  },
      name : { x: ml + 12,          w: 74  },
      qty  : { x: ml + 86,          w: 20  },
      price: { x: ml + 106,         w: 38  },
      total: { x: ml + 144,         w: 38  },
    };

    const rowH = 9;

    // Header row fill
    rect(ml, y, cw, rowH, [26, 58, 92]);

    const hLabels = [
      { col: 'num',   label: 'م' },
      { col: 'name',  label: 'المنتج' },
      { col: 'qty',   label: 'الكمية' },
      { col: 'price', label: 'سعر القطعة' },
      { col: 'total', label: 'الإجمالي' },
    ];
    for (const h of hLabels) {
      const c = cols[h.col];
      await placeAr(h.label, c.x, y + 1.5, c.w, 8, '700', '#ffffff');
    }
    y += rowH;

    // ── TABLE ROWS ───────────────────────────────────────────
    let grand = 0;
    for (let i = 0; i < products.length; i++) {
      checkPageBreak(rowH + 2);
      const p      = products[i];
      const uPrice = parseFloat(prices[p.id]) || 0;
      const total  = uPrice * p.qty;
      grand += total;

      const rowFill = i % 2 === 0 ? [255,255,255] : [245,248,252];
      rect(ml, y, cw, rowH, rowFill, [208, 220, 232]);

      await placeAr(String(i + 1),                    cols.num.x,   y + 1.5, cols.num.w,   7.5, '700', '#5a6a7a');
      await placeAr(p.name,                            cols.name.x,  y + 1.5, cols.name.w,  7.5, '500', '#1a2533');
      await placeAr(String(p.qty),                     cols.qty.x,   y + 1.5, cols.qty.w,   7.5, '700', '#1a2533');
      await placeLtr(uPrice > 0 ? formatCurrency(uPrice) : '—', cols.price.x, y + 1.5, cols.price.w, 7, '400', '#2a4060');
      await placeLtr(uPrice > 0 ? formatCurrency(total)  : '—', cols.total.x, y + 1.5, cols.total.w, 7, '700', '#1a3a5c');

      y += rowH;
    }

    // Grand total row
    checkPageBreak(rowH + 2);
    rect(ml, y, cw, rowH, [26, 58, 92], [15, 37, 64]);
    await placeAr('الإجمالي الكلي', cols.num.x, y + 1.5, cols.num.w + cols.name.w + cols.qty.w + cols.price.w, 8, '800', '#ffffff');
    await placeLtr(formatCurrency(grand), cols.total.x, y + 1.5, cols.total.w, 8, '800', '#c9a227');
    y += rowH + 6;

    // ── NOTES ────────────────────────────────────────────────
    const notes = localStorage.getItem(LS_NOTES) || '';
    const terms = localStorage.getItem(LS_TERMS) || '';

    async function renderNotesBlock(label, content) {
      if (!content.trim()) return;
      checkPageBreak(20);
      await placeAr(label, ml, y, cw, 9, '700', '#1a3a5c');
      y += 6;
      pdf.setDrawColor(208, 220, 232);
      rect(ml, y, cw, 1, [208,220,232]);
      y += 3;

      // Word-wrap content into lines ~90 chars each
      const lines = wrapText(content, 55);
      for (const line of lines) {
        checkPageBreak(7);
        await placeAr(line, ml + 2, y, cw - 4, 8, '400', '#3a4a5a');
        y += 6;
      }
      y += 4;
    }

    await renderNotesBlock('📝 ملاحظات', notes);
    await renderNotesBlock('📋 شروط الدفع والتسليم', terms);

    // ── SIGNATURE ────────────────────────────────────────────
    checkPageBreak(30);
    y += 4;
    // const sigBoxW = cw / 3 - 4;
    // const sigs = [
    //   { label: 'ختم وتوقيع الشركة',      sub: companyData.companyName || '' },
    //   { label: 'توقيع المسؤول',           sub: companyData.managerName || '' },
    //   { label: 'اعتماد جامعة بني سويف',  sub: 'الختم الرسمي' },
    // ];
    // for (let i = 0; i < sigs.length; i++) {
    //   const sx = ml + i * (sigBoxW + 6);
    //   await placeAr(sigs[i].label, sx, y, sigBoxW, 7.5, '700', '#1a3a5c');
    //   pdf.setDrawColor(26, 58, 92);
    //   pdf.setLineWidth(0.8);
    //   pdf.line(sx, y + 5, sx + sigBoxW, y + 5);
    //   pdf.setLineWidth(0.3);
    //   await placeAr(sigs[i].sub, sx, y + 20, sigBoxW, 7, '400', '#5a6a7a');
    // }
    y += 32;

    // ── FOOTER ───────────────────────────────────────────────
    pdf.setDrawColor(208, 220, 232);
    pdf.line(ml, ph - 10, pw - mr, ph - 10);
    await placeAr(quoteNumber + ' — ' + formatDate(companyData.quoteDate), ml, ph - 7, cw * 0.5, 6.5, '400', '#8a9aaa');
    await placeAr('جامعة بني سويف — عرض سعر رسمي', ml + cw * 0.5, ph - 7, cw * 0.5, 6.5, '400', '#8a9aaa');

    // ── SAVE ─────────────────────────────────────────────────
    const fileName = `عرض-سعر-${quoteNumber}.pdf`;
    pdf.save(fileName);

  } catch (err) {
    console.error('PDF error:', err);
    alert('حدث خطأ أثناء إنشاء ملف PDF:\n' + err.message);
  } finally {
    loadingEl.classList.add('hidden');
  }
}

/** Simple word-wrap for Arabic text in PDF notes */
function wrapText(str, maxChars) {
  const words  = str.split(/\s+/);
  const lines  = [];
  let   current = '';
  for (const w of words) {
    if ((current + ' ' + w).trim().length > maxChars) {
      if (current) lines.push(current.trim());
      current = w;
    } else {
      current = (current + ' ' + w).trim();
    }
  }
  if (current) lines.push(current.trim());
  return lines.length ? lines : [str];
}

// ============================================================
// BUILD PRINT / PDF HTML
// ============================================================

function buildPrintHTML(forPDF = false) {
  const notes = localStorage.getItem(LS_NOTES) || '';
  const terms = localStorage.getItem(LS_TERMS) || '';

  // Build products rows
  let grand = 0;
  let rows  = '';
  products.forEach((p, i) => {
    const unitPrice = parseFloat(prices[p.id]) || 0;
    const total     = unitPrice * p.qty;
    grand += total;
    rows += `
      <tr>
        <td style="text-align:center;padding:9px 10px;border:1px solid #ccc;">${i + 1}</td>
        <td style="padding:9px 14px;border:1px solid #ccc;">${p.name}</td>
        <td style="text-align:center;padding:9px 10px;border:1px solid #ccc;">${p.qty}</td>
        <td style="text-align:left;padding:9px 14px;border:1px solid #ccc;">${unitPrice > 0 ? formatCurrency(unitPrice) : '—'}</td>
        <td style="text-align:left;padding:9px 14px;border:1px solid #ccc;font-weight:700;">${unitPrice > 0 ? formatCurrency(total) : '—'}</td>
      </tr>
    `;
  });

  const dateFormatted = formatDate(companyData.quoteDate);

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8"/>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800;900&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Tajawal', Arial, sans-serif;
      direction: rtl;
      background: #fff;
      color: #1a2533;
      width: 794px;
      ${forPDF ? '' : 'margin: 0 auto; padding: 20px;'}
    }
    .page-wrap { width: 100%; max-width: 794px; padding: 30px 36px; background: #fff; }

    /* Header strip */
    .header-strip {
      background: linear-gradient(135deg, #0f2540 0%, #1a3a5c 60%, #2a5080 100%);
      border-radius: 10px;
      padding: 24px 28px;
      color: #fff;
      margin-bottom: 24px;
      border-bottom: 4px solid #c9a227;
    }
    .header-top { display: flex; justify-content: space-between; align-items: flex-start; }
    .company-name { font-size: 1.5rem; font-weight: 900; color: #fff; }
    .company-sub  { font-size: 0.78rem; color: #c9a227; margin-top: 4px; letter-spacing: 1px; }
    .quote-info   { text-align: left; }
    .quote-num    { font-size: 1rem; font-weight: 800; color: #c9a227; }
    .quote-date   { font-size: 0.8rem; color: rgba(255,255,255,0.7); margin-top: 4px; }
    .contact-row  { margin-top: 14px; padding-top: 14px; border-top: 1px solid rgba(255,255,255,0.15); display: flex; gap: 28px; flex-wrap: wrap; }
    .contact-item { font-size: 0.78rem; color: rgba(255,255,255,0.8); }
    .contact-item strong { color: #fff; }

    /* Title section */
    .title-section { text-align: center; margin-bottom: 22px; }
    .title-main { font-size: 1.6rem; font-weight: 900; color: #1a3a5c; letter-spacing: 1px; }
    .title-divider {
      width: 80px; height: 3px;
      background: linear-gradient(90deg, #c9a227, #e8c04a);
      margin: 8px auto;
      border-radius: 2px;
    }
    .title-recipient {
      font-size: 0.92rem; color: #5a6a7a; margin-top: 6px;
    }
    .title-recipient strong { color: #1a3a5c; }

    /* Products table */
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 0.88rem; }
    thead { background: linear-gradient(135deg, #1a3a5c, #0f2540); color: #fff; }
    thead th { padding: 12px 14px; text-align: right; font-weight: 700; border: 1px solid #0f2540; }
    tbody tr:nth-child(even) { background: #f5f8fc; }
    tbody tr td { border: 1px solid #d0dce8; }

    /* Grand total */
    .grand-total-row { background: #1a3a5c !important; }
    .grand-total-row td { color: #fff; font-weight: 800; padding: 12px 14px; border-color: #0f2540; }
    .grand-total-label { text-align: right; font-size: 0.95rem; }
    .grand-total-value { text-align: left; font-size: 1rem; color: #c9a227; }

    /* Notes */
    .notes-section { margin-bottom: 20px; }
    .section-label { font-size: 0.85rem; font-weight: 700; color: #1a3a5c; border-bottom: 2px solid #e0e8f0; padding-bottom: 6px; margin-bottom: 10px; }
    .notes-text { font-size: 0.85rem; color: #3a4a5a; line-height: 1.7; padding: 10px; background: #f8fafc; border-radius: 6px; border: 1px solid #e0e8f0; }

    /* Signature */
    .signature-section {
      display: flex; justify-content: space-between; margin-top: 32px; gap: 20px;
    }
    .sig-box {
      flex: 1; border-top: 1.5px solid #1a3a5c; padding-top: 10px;
      text-align: center; font-size: 0.8rem; color: #5a6a7a;
    }
    .sig-box strong { display: block; color: #1a3a5c; margin-bottom: 4px; font-size: 0.82rem; }
    .sig-space { height: 50px; }

    /* Footer */
    .page-footer {
      margin-top: 24px; padding-top: 14px;
      border-top: 1px solid #e0e8f0;
      display: flex; justify-content: space-between; align-items: center;
      font-size: 0.72rem; color: #8a9aaa;
    }

    @media print {
      body { width: 100%; padding: 0; }
      .page-wrap { padding: 20px 28px; }
    }
  </style>
</head>
<body>
<div class="page-wrap">

  <!-- ===== HEADER ===== -->
  <div class="header-strip">
    <div class="header-top">
      <div>
        <div class="company-name">${escapeHtml(companyData.companyName || 'اسم الشركة')}</div>
        <div class="company-sub">أحبار • برنترات • مستلزمات كمبيوتر</div>
      </div>
      <div class="quote-info">
        <div class="quote-num">${escapeHtml(quoteNumber)}</div>
        <div class="quote-date">${dateFormatted}</div>
      </div>
    </div>
    <div class="contact-row">
      <div class="contact-item">📞 <strong>هاتف:</strong> ${escapeHtml(companyData.companyPhone || '')}</div>
      <div class="contact-item">📍 <strong>العنوان:</strong> ${escapeHtml(companyData.companyAddress || '')}</div>
      <div class="contact-item">👤 <strong>المسؤول:</strong> ${escapeHtml(companyData.managerName || '')}</div>
      <div class="contact-item">📱 <strong>هاتف المسؤول:</strong> ${escapeHtml(companyData.managerPhone || '')}</div>
    </div>
  </div>

  <!-- ===== TITLE ===== -->
  <div class="title-section">
    <div class="title-main">عرض سعر</div>
    <div class="title-divider"></div>
    <div class="title-recipient">موجّه إلى: <strong>جامعة بني سويف</strong></div>
  </div>

  <!-- ===== PRODUCTS TABLE ===== -->
  <table>
    <thead>
      <tr>
        <th style="width:50px;text-align:center">م</th>
        <th>المنتج</th>
        <th style="width:80px;text-align:center">الكمية</th>
        <th style="width:150px;text-align:left">سعر القطعة</th>
        <th style="width:150px;text-align:left">الإجمالي</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr class="grand-total-row">
        <td colspan="4" class="grand-total-label">الإجمالي الكلي</td>
        <td class="grand-total-value">${formatCurrency(grand)}</td>
      </tr>
    </tfoot>
  </table>

  <!-- ===== NOTES ===== -->
  ${notes ? `
  <div class="notes-section">
    <div class="section-label">📝 ملاحظات</div>
    <div class="notes-text">${escapeHtml(notes).replace(/\n/g, '<br/>')}</div>
  </div>` : ''}

  ${terms ? `
  <div class="notes-section">
    <div class="section-label">📋 شروط الدفع والتسليم</div>
    <div class="notes-text">${escapeHtml(terms).replace(/\n/g, '<br/>')}</div>
  </div>` : ''}


</div>
</body>
</html>`;
}

// ============================================================
// TOAST NOTIFICATIONS
// ============================================================

function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toastContainer');
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span> ${message}`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('hide');
    setTimeout(() => toast.remove(), 350);
  }, duration);
}

// ============================================================
// ADMIN MENU MODAL (⋮ button on page 3)
// ============================================================

function openAdminMenuModal() {
  document.getElementById('adminMenuPasswordInput').value = '';
  document.getElementById('adminMenuError').classList.add('hidden');
  document.getElementById('adminMenuModal').classList.remove('hidden');
  setTimeout(() => document.getElementById('adminMenuPasswordInput').focus(), 100);
}

function closeAdminMenuModal() {
  document.getElementById('adminMenuModal').classList.add('hidden');
}

function verifyAdminMenuPassword() {
  const input = document.getElementById('adminMenuPasswordInput').value;
  if (input === ADMIN_PASSWORD) {
    closeAdminMenuModal();
    openAlamiaModal();
  } else {
    document.getElementById('adminMenuError').classList.remove('hidden');
    document.getElementById('adminMenuPasswordInput').value = '';
    document.getElementById('adminMenuPasswordInput').focus();
    const box = document.querySelector('#adminMenuModal .modal-box');
    box.style.animation = 'none';
    box.offsetHeight;
    box.style.animation = 'shake 0.4s ease';
  }
}

// ============================================================
// ALAMIA STORE STATE
// ============================================================

const LS_ALAMIA_PRICES = 'qs_alamia_prices';

// Fixed branding for Al Alamia Store
const ALAMIA_COMPANY = {
  companyName:    'العالمية ستور',
  companyAddress: 'مول سفنكس — المهندسين، الجيزة',
  companyPhone:   '01140030112',
  managerPhone:   '01114939714',
  managerName:    'العالمية ستور',
  quoteDate:      todayDate(),
};

let alamiaPrices = {};   // { productId: adjustedPrice }

// ============================================================
// ALAMIA MODAL — OPEN / CLOSE / RENDER
// ============================================================

function openAlamiaModal() {
  // Clone current prices as starting point
  alamiaPrices = {};
  products.forEach(p => {
    const orig = parseFloat(prices[p.id]) || 0;
    alamiaPrices[p.id] = orig;
  });

  // Restore any saved alamia prices
  const saved = localStorage.getItem(LS_ALAMIA_PRICES);
  if (saved) {
    const parsed = JSON.parse(saved);
    // Only apply if product IDs match
    products.forEach(p => {
      if (parsed[p.id] !== undefined) alamiaPrices[p.id] = parsed[p.id];
    });
  }

  document.getElementById('alamiaModal').classList.remove('hidden');

  // Set default mode to fixed
  document.querySelector('input[name="alamiaMode"][value="fixed"]').checked = true;
  document.getElementById('alamiaDiscount').value = 20;
  document.getElementById('fixedDiscountArea').classList.remove('hidden');
  document.getElementById('manualPricesArea').classList.add('hidden');

  renderAlamiaManualTable();
  updateAlamiaPreview();
}

function closeAlamiaModal() {
  document.getElementById('alamiaModal').classList.add('hidden');
}

function onAlamiaModeChange() {
  const mode = document.querySelector('input[name="alamiaMode"]:checked').value;
  if (mode === 'fixed') {
    document.getElementById('fixedDiscountArea').classList.remove('hidden');
    document.getElementById('manualPricesArea').classList.add('hidden');
  } else {
    document.getElementById('fixedDiscountArea').classList.add('hidden');
    document.getElementById('manualPricesArea').classList.remove('hidden');
  }
  updateAlamiaPreview();
}

// ============================================================
// ALAMIA — MANUAL TABLE
// ============================================================

function renderAlamiaManualTable() {
  const tbody = document.getElementById('alamiaPricesBody');
  tbody.innerHTML = '';

  products.forEach((p, i) => {
    const currentPrice = alamiaPrices[p.id] ?? (parseFloat(prices[p.id]) || 0);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="col-num">${i + 1}</td>
      <td style="font-size:0.82rem">${escapeHtml(p.name)}</td>
      <td class="col-qty" style="text-align:center">${p.qty}</td>
      <td class="col-price">
        <input type="number" class="price-input" style="font-size:0.82rem"
          value="${currentPrice}" min="0" step="0.01" placeholder="0.00"
          data-id="${p.id}"
          oninput="onAlamiaManualPriceChange(${p.id}, this.value)" />
      </td>
      <td class="col-total total-cell" id="alamia-total-${p.id}" style="font-size:0.82rem">
        ${formatCurrency(currentPrice * p.qty)}
      </td>
    `;
    tbody.appendChild(tr);
  });

  recalcAlamiaGrandTotal();
}

function onAlamiaManualPriceChange(id, value) {
  const price = parseFloat(value) || 0;
  alamiaPrices[id] = price;
  const product = products.find(p => p.id === id);
  if (product) {
    const cell = document.getElementById(`alamia-total-${id}`);
    if (cell) cell.textContent = formatCurrency(price * product.qty);
  }
  recalcAlamiaGrandTotal();
  updateAlamiaPreview();
}

function recalcAlamiaGrandTotal() {
  let grand = 0;
  products.forEach(p => {
    grand += (alamiaPrices[p.id] ?? 0) * p.qty;
  });
  const el = document.getElementById('alamiaGrandTotal');
  if (el) el.textContent = formatCurrency(grand);
}

// ============================================================
// ALAMIA — EFFECTIVE PRICES (considering mode)
// ============================================================

function getEffectiveAlamiaPrices() {
  const mode     = document.querySelector('input[name="alamiaMode"]:checked').value;
  const discount = parseFloat(document.getElementById('alamiaDiscount').value) || 0;
  const result   = {};

  products.forEach(p => {
    const orig = parseFloat(prices[p.id]) || 0;
    if (mode === 'fixed') {
      result[p.id] = Math.max(0, orig - discount);
    } else {
      result[p.id] = alamiaPrices[p.id] ?? orig;
    }
  });

  return result;
}

// ============================================================
// ALAMIA — PREVIEW SUMMARY
// ============================================================

function updateAlamiaPreview() {
  const effective = getEffectiveAlamiaPrices();
  const mode      = document.querySelector('input[name="alamiaMode"]:checked').value;
  const discount  = parseFloat(document.getElementById('alamiaDiscount').value) || 0;

  let origGrand = 0;
  let newGrand  = 0;
  products.forEach(p => {
    const orig = parseFloat(prices[p.id]) || 0;
    origGrand += orig * p.qty;
    newGrand  += (effective[p.id] ?? 0) * p.qty;
  });

  const saved    = origGrand - newGrand;
  const previewEl = document.getElementById('alamiaPreview');

  previewEl.innerHTML = `
    <div class="preview-item">
      <span class="preview-label">الإجمالي الأصلي</span>
      <span class="preview-val" style="color:var(--text-muted);text-decoration:line-through">${formatCurrency(origGrand)}</span>
    </div>
    ${mode === 'fixed' ? `
    <div class="preview-item">
      <span class="preview-label">الخصم لكل منتج</span>
      <span class="preview-val" style="color:var(--danger)">− EGP ${discount.toFixed(2)}</span>
    </div>` : ''}
    <div class="preview-item">
      <span class="preview-label">إجمالي العالمية</span>
      <span class="preview-val">${formatCurrency(newGrand)}</span>
    </div>
    ${saved > 0 ? `
    <div class="preview-item">
      <span class="preview-label">الفرق</span>
      <span class="preview-val" style="color:var(--success)">− ${formatCurrency(saved)}</span>
    </div>` : ''}
  `;
}

// ============================================================
// ALAMIA — GENERATE QUOTE (PDF or PRINT)
// ============================================================

async function generateAlamiaQuote(action) {
  const effectivePrices = getEffectiveAlamiaPrices();

  // Save alamia prices to LocalStorage (clone only)
  localStorage.setItem(LS_ALAMIA_PRICES, JSON.stringify(effectivePrices));

  // Generate a new quote number for alamia
  const year    = new Date().getFullYear();
  const stored  = JSON.parse(localStorage.getItem(LS_QUOTE_NUM) || '{"year":0,"seq":0}');
  const newSeq  = stored.year === year ? stored.seq + 1 : 1;
  localStorage.setItem(LS_QUOTE_NUM, JSON.stringify({ year, seq: newSeq }));
  const alamiaQuoteNum = `Q-${year}-${String(newSeq).padStart(4, '0')}-A`;

  const notes = localStorage.getItem(LS_NOTES) || '';
  const terms = localStorage.getItem(LS_TERMS) || '';

  closeAlamiaModal();

  if (action === 'print') {
    const win = window.open('', '_blank');
    win.document.write(buildAlaminaPrintHTML(effectivePrices, alamiaQuoteNum, notes, terms));
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 600);
    showToast('تم فتح نافذة الطباعة للعالمية ستور', 'success');
  } else {
    await generateAlamiaPDF(effectivePrices, alamiaQuoteNum, notes, terms);
  }
}

// ============================================================
// ALAMIA — PDF GENERATION (Pure jsPDF)
// ============================================================

async function generateAlamiaPDF(effectivePrices, alamiaQuoteNum, notes, terms) {
  const loadingEl = document.getElementById('pdfLoading');
  loadingEl.classList.remove('hidden');

  try {
    await new Promise(r => setTimeout(r, 80));

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pw  = 210, ph = 297, ml = 14, mr = 14;
    const cw  = pw - ml - mr;

    let y = 0;

    function checkPageBreak(needed = 10) {
      if (y + needed > ph - 14) { pdf.addPage(); y = 16; }
    }

    function rectA(x, yw, w, h, fillColor, strokeColor) {
      if (fillColor)   { pdf.setFillColor(...fillColor);   pdf.rect(x, yw, w, h, 'F'); }
      if (strokeColor) { pdf.setDrawColor(...strokeColor); pdf.rect(x, yw, w, h, 'S'); }
    }

    async function arabicImgA(str, fontSizePt, fontWeight, color, maxWidthMm) {
      const scale   = 3;
      const pxPerMm = 3.7795 * scale;
      const maxPx   = Math.round(maxWidthMm * pxPerMm);
      const fSizePx = Math.round(fontSizePt * 1.333 * scale);
      const cv  = document.createElement('canvas');
      const ctx = cv.getContext('2d');
      ctx.font  = `${fontWeight} ${fSizePx}px Tajawal, Arial`;
      const measured = ctx.measureText(str).width;
      cv.width  = Math.min(measured + 10, maxPx) || 10;
      cv.height = fSizePx * 1.5;
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.font         = `${fontWeight} ${fSizePx}px Tajawal, Arial`;
      ctx.fillStyle    = color || '#000000';
      ctx.direction    = 'rtl';
      ctx.textAlign    = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText(str, cv.width - 2, fSizePx * 0.1, cv.width - 4);
      return { dataUrl: cv.toDataURL('image/png'), widthMm: cv.width / pxPerMm, heightMm: cv.height / pxPerMm };
    }

    async function placeArA(str, x, yw, widthMm, fontSizePt, fontWeight, color) {
      if (!str) return;
      const img = await arabicImgA(str, fontSizePt, fontWeight, color, widthMm);
      pdf.addImage(img.dataUrl, 'PNG', x + widthMm - img.widthMm, yw, img.widthMm, img.heightMm);
    }

    async function placeLtrA(str, x, yw, widthMm, fontSizePt, fontWeight, color) {
      if (!str) return;
      const img = await arabicImgA(str, fontSizePt, fontWeight, color, widthMm);
      pdf.addImage(img.dataUrl, 'PNG', x, yw, img.widthMm, img.heightMm);
    }

    // ── ALAMIA GOLD HEADER ──────────────────────────────────
    // Gold gradient header (different from original navy)
    rectA(0, 0, pw, 42, [20, 12, 0]);  // dark brown bg

    // Gold accent bars
    pdf.setFillColor(201, 162, 39);
    pdf.rect(0, 0, 4, 42, 'F');
    pdf.rect(pw - 4, 0, 4, 42, 'F');

    pdf.setDrawColor(201, 162, 39);
    pdf.setLineWidth(1.5);
    pdf.line(4, 42, pw - 4, 42);
    pdf.setLineWidth(0.3);

    // Store icon area (gold circle)
    rectA(ml, 5, 18, 18, [201, 162, 39]);
    await placeArA('🏪', ml, 6, 18, 12, '400', '#ffffff');

    // Store name
    await placeArA('العالمية ستور', ml + 20, 4, cw * 0.5, 14, '900', '#c9a227');
    await placeArA('مول سفنكس — المهندسين، الجيزة', ml + 20, 15, cw * 0.5, 7, '400', '#d4a830');

    // Quote number top-left
    const qnImg = await arabicImgA(alamiaQuoteNum, 9, '800', '#c9a227', 65);
    pdf.addImage(qnImg.dataUrl, 'PNG', pw - mr - qnImg.widthMm, 5, qnImg.widthMm, qnImg.heightMm);
    const dtImg = await arabicImgA(formatDate(ALAMIA_COMPANY.quoteDate), 7, '400', '#b89020', 65);
    pdf.addImage(dtImg.dataUrl, 'PNG', pw - mr - dtImg.widthMm, 13, dtImg.widthMm, dtImg.heightMm);

    // Contact row below header
    y = 46;
    const contacts = [
      `📞 ${ALAMIA_COMPANY.companyPhone}`,
      `📱 ${ALAMIA_COMPANY.managerPhone}`,
      `📍 ${ALAMIA_COMPANY.companyAddress}`,
    ];
    for (let i = 0; i < contacts.length; i++) {
      const cx = ml + i * (cw / 3);
      await placeArA(contacts[i], cx, y, cw / 3, 7.5, '400', '#3a4a5a');
    }
    y += 10;

    // ── TITLE ───────────────────────────────────────────────
    y += 4;
    await placeArA('عرض سعر', ml, y, cw, 18, '900', '#1a3a5c');
    y += 10;
    pdf.setDrawColor(201, 162, 39);
    pdf.setLineWidth(1.5);
    pdf.line(pw / 2 - 15, y, pw / 2 + 15, y);
    pdf.setLineWidth(0.3);
    y += 4;
    await placeArA('موجّه إلى: جامعة بني سويف', ml, y, cw, 9, '700', '#5a6a7a');
    y += 10;

    // ── TABLE ───────────────────────────────────────────────
    const cols = {
      num  : { x: ml,      w: 12 },
      name : { x: ml + 12, w: 74 },
      qty  : { x: ml + 86, w: 20 },
      price: { x: ml + 106,w: 38 },
      total: { x: ml + 144,w: 38 },
    };
    const rowH = 9;

    // Gold header row
    rectA(ml, y, cw, rowH, [160, 125, 16]);
    const hLabels = [
      { col: 'num',   label: 'م' },
      { col: 'name',  label: 'المنتج' },
      { col: 'qty',   label: 'الكمية' },
      { col: 'price', label: 'سعر القطعة' },
      { col: 'total', label: 'الإجمالي' },
    ];
    for (const h of hLabels) {
      const c = cols[h.col];
      await placeArA(h.label, c.x, y + 1.5, c.w, 8, '700', '#ffffff');
    }
    y += rowH;

    let grand = 0;
    for (let i = 0; i < products.length; i++) {
      checkPageBreak(rowH + 2);
      const p      = products[i];
      const uPrice = parseFloat(effectivePrices[p.id]) || 0;
      const total  = uPrice * p.qty;
      grand += total;

      const rowFill = i % 2 === 0 ? [255,255,255] : [255,252,240];
      rectA(ml, y, cw, rowH, rowFill, [208, 220, 232]);

      await placeArA(String(i + 1), cols.num.x,   y + 1.5, cols.num.w,   7.5, '700', '#5a6a7a');
      await placeArA(p.name,        cols.name.x,  y + 1.5, cols.name.w,  7.5, '500', '#1a2533');
      await placeArA(String(p.qty), cols.qty.x,   y + 1.5, cols.qty.w,   7.5, '700', '#1a2533');
      await placeLtrA(uPrice > 0 ? formatCurrency(uPrice) : '—', cols.price.x, y + 1.5, cols.price.w, 7, '400', '#2a4060');
      await placeLtrA(uPrice > 0 ? formatCurrency(total)  : '—', cols.total.x, y + 1.5, cols.total.w, 7, '700', '#1a3a5c');
      y += rowH;
    }

    // Grand total — gold style
    checkPageBreak(rowH + 2);
    rectA(ml, y, cw, rowH, [160, 125, 16], [100, 80, 0]);
    await placeArA('الإجمالي الكلي', cols.num.x, y + 1.5,
      cols.num.w + cols.name.w + cols.qty.w + cols.price.w, 8, '800', '#ffffff');
    await placeLtrA(formatCurrency(grand), cols.total.x, y + 1.5, cols.total.w, 8, '800', '#ffffff');
    y += rowH + 6;

    // ── NOTES ───────────────────────────────────────────────
    async function renderNotesBlockA(label, content) {
      if (!content.trim()) return;
      checkPageBreak(20);
      await placeArA(label, ml, y, cw, 9, '700', '#1a3a5c');
      y += 6;
      rectA(ml, y, cw, 1, [208,220,232]);
      y += 3;
      const lines = wrapText(content, 55);
      for (const line of lines) {
        checkPageBreak(7);
        await placeArA(line, ml + 2, y, cw - 4, 8, '400', '#3a4a5a');
        y += 6;
      }
      y += 4;
    }

    await renderNotesBlockA('📝 ملاحظات', notes);
    await renderNotesBlockA('📋 شروط الدفع والتسليم', terms);

    // ── SIGNATURE ───────────────────────────────────────────
    checkPageBreak(30);
    y += 4;
    const sigBoxW = cw / 3 - 4;

    // for (let i = 0; i < sigs.length; i++) {
    //   const sx = ml + i * (sigBoxW + 6);
    //   await placeArA(sigs[i].label, sx, y, sigBoxW, 7.5, '700', '#1a3a5c');
    //   pdf.setDrawColor(160, 125, 16);
    //   pdf.setLineWidth(0.8);
    //   pdf.line(sx, y + 5, sx + sigBoxW, y + 5);
    //   pdf.setLineWidth(0.3);
    //   await placeArA(sigs[i].sub, sx, y + 20, sigBoxW, 7, '400', '#5a6a7a');
    // }

    // ── FOOTER ──────────────────────────────────────────────
    pdf.setDrawColor(201, 162, 39);
    pdf.setLineWidth(0.6);
    pdf.line(ml, ph - 10, pw - mr, ph - 10);
    pdf.setLineWidth(0.3);
    await placeArA(alamiaQuoteNum + ' — ' + formatDate(ALAMIA_COMPANY.quoteDate), ml, ph - 7, cw * 0.5, 6.5, '400', '#8a9aaa');
    await placeArA('العالمية ستور — جامعة بني سويف', ml + cw * 0.5, ph - 7, cw * 0.5, 6.5, '400', '#8a9aaa');

    const fileName = `عرض-سعر-العالمية-${alamiaQuoteNum}.pdf`;
    pdf.save(fileName);
    showToast('تم تحميل PDF العالمية ستور بنجاح ✨', 'success');

  } catch (err) {
    console.error('Alamia PDF error:', err);
    showToast('خطأ في إنشاء PDF: ' + err.message, 'error');
  } finally {
    loadingEl.classList.add('hidden');
  }
}

// ============================================================
// ALAMIA — PRINT HTML
// ============================================================

function buildAlaminaPrintHTML(effectivePrices, alamiaQuoteNum, notes, terms) {
  let grand = 0;
  let rows  = '';
  products.forEach((p, i) => {
    const unitPrice = parseFloat(effectivePrices[p.id]) || 0;
    const total     = unitPrice * p.qty;
    grand += total;
    rows += `
      <tr>
        <td style="text-align:center;padding:9px 10px;border:1px solid #d4a830;">${i + 1}</td>
        <td style="padding:9px 14px;border:1px solid #d4a830;">${escapeHtml(p.name)}</td>
        <td style="text-align:center;padding:9px 10px;border:1px solid #d4a830;">${p.qty}</td>
        <td style="text-align:left;padding:9px 14px;border:1px solid #d4a830;">${unitPrice > 0 ? formatCurrency(unitPrice) : '—'}</td>
        <td style="text-align:left;padding:9px 14px;border:1px solid #d4a830;font-weight:700;">${unitPrice > 0 ? formatCurrency(total) : '—'}</td>
      </tr>`;
  });

  const dateFormatted = formatDate(ALAMIA_COMPANY.quoteDate);

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head><meta charset="UTF-8"/>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800;900&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'Tajawal',Arial,sans-serif;direction:rtl;background:#fff;color:#1a2533;margin:0 auto;padding:20px;max-width:794px;}
  .page-wrap{padding:24px 32px;}
  .header-strip{background:linear-gradient(135deg,#140c00,#2a1800);border-radius:10px;padding:20px 24px;color:#fff;margin-bottom:20px;border:2px solid #c9a227;border-right:6px solid #c9a227;}
  .header-top{display:flex;justify-content:space-between;align-items:flex-start;}
  .store-name{font-size:1.5rem;font-weight:900;color:#c9a227;}
  .store-sub{font-size:0.78rem;color:rgba(255,255,255,0.6);margin-top:3px;}
  .quote-info{text-align:left;}
  .quote-num{font-size:0.95rem;font-weight:800;color:#c9a227;}
  .quote-date{font-size:0.78rem;color:rgba(255,255,255,0.6);margin-top:3px;}
  .contact-row{margin-top:12px;padding-top:10px;border-top:1px solid rgba(201,162,39,0.3);display:flex;gap:20px;flex-wrap:wrap;}
  .contact-item{font-size:0.78rem;color:rgba(255,255,255,0.75);}
  .title-section{text-align:center;margin:18px 0;}
  .title-main{font-size:1.5rem;font-weight:900;color:#1a3a5c;}
  .title-divider{width:80px;height:3px;background:linear-gradient(90deg,#c9a227,#e8c04a);margin:8px auto;border-radius:2px;}
  .title-recipient{font-size:0.9rem;color:#5a6a7a;}
  .title-recipient strong{color:#1a3a5c;}
  table{width:100%;border-collapse:collapse;margin-bottom:18px;font-size:0.88rem;}
  thead{background:linear-gradient(135deg,#a07d10,#c9a227);}
  thead th{padding:11px 13px;text-align:right;font-weight:700;border:1px solid #8a6500;color:#fff;}
  tbody tr:nth-child(even){background:#fffbef;}
  tbody td{border:1px solid #d4a830;}
  .grand-row{background:#1a3a5c!important;}
  .grand-row td{color:#fff;font-weight:800;padding:11px 13px;border-color:#0f2540;}
  .grand-val{text-align:left;color:#c9a227;}
  .notes-box{background:#fffbef;border:1px solid #d4a830;border-radius:6px;padding:10px 14px;margin-bottom:14px;font-size:0.85rem;color:#3a3010;line-height:1.7;}
  .notes-label{font-weight:700;color:#a07d10;margin-bottom:6px;}
  .sig-section{display:flex;justify-content:space-between;margin-top:28px;gap:16px;}
  .sig-box{flex:1;text-align:center;font-size:0.78rem;color:#5a6a7a;}
  .sig-box strong{display:block;color:#1a3a5c;margin-bottom:4px;}
  .sig-line{border-top:1.5px solid #c9a227;margin-bottom:6px;margin-top:40px;}
  .page-footer{margin-top:18px;padding-top:10px;border-top:1px solid #d4a830;display:flex;justify-content:space-between;font-size:0.72rem;color:#8a9aaa;}
  @media print{body{padding:0;}}
</style></head>
<body><div class="page-wrap">
  <div class="header-strip">
    <div class="header-top">
      <div>
        <div class="store-name">🏪 العالمية ستور</div>
        <div class="store-sub">مول سفنكس — المهندسين، الجيزة</div>
      </div>
      <div class="quote-info">
        <div class="quote-num">${escapeHtml(alamiaQuoteNum)}</div>
        <div class="quote-date">${dateFormatted}</div>
      </div>
    </div>
    <div class="contact-row">
      <div class="contact-item">📞 ${escapeHtml(ALAMIA_COMPANY.companyPhone)}</div>
      <div class="contact-item">📱 ${escapeHtml(ALAMIA_COMPANY.managerPhone)}</div>
      <div class="contact-item">📍 ${escapeHtml(ALAMIA_COMPANY.companyAddress)}</div>
    </div>
  </div>
  <div class="title-section">
    <div class="title-main">عرض سعر</div>
    <div class="title-divider"></div>
    <div class="title-recipient">موجّه إلى: <strong>جامعة بني سويف</strong></div>
  </div>
  <table>
    <thead><tr>
      <th style="width:50px;text-align:center">م</th>
      <th>المنتج</th>
      <th style="width:80px;text-align:center">الكمية</th>
      <th style="width:150px;text-align:left">سعر القطعة</th>
      <th style="width:150px;text-align:left">الإجمالي</th>
    </tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr class="grand-row">
      <td colspan="4" style="padding:11px 13px;text-align:right">الإجمالي الكلي</td>
      <td class="grand-val" style="padding:11px 13px;text-align:left">${formatCurrency(grand)}</td>
    </tr></tfoot>
  </table>
  ${notes ? `<div class="notes-box"><div class="notes-label">📝 ملاحظات</div>${escapeHtml(notes).replace(/\n/g,'<br/>')}</div>` : ''}
  ${terms ? `<div class="notes-box"><div class="notes-label">📋 شروط الدفع والتسليم</div>${escapeHtml(terms).replace(/\n/g,'<br/>')}</div>` : ''}
</div></body></html>`;
}

// ============================================================
// KEYBOARD SHORTCUTS
// ============================================================

document.addEventListener('keydown', e => {
  // Enter in admin modal → verify
  if (!document.getElementById('adminModal').classList.contains('hidden') && e.key === 'Enter') {
    verifyAdminPassword();
  }
  // Enter in admin menu modal → verify
  if (!document.getElementById('adminMenuModal').classList.contains('hidden') && e.key === 'Enter') {
    verifyAdminMenuPassword();
  }
  // Escape → close modals
  if (e.key === 'Escape') {
    closeAdminModal();
    closeDeleteModal();
    closeClearModal();
    closeAdminMenuModal();
    closeAlamiaModal();
  }
});

// Enter in "add product" name field → add product
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('newProductName').addEventListener('keydown', e => {
    if (e.key === 'Enter') addProduct();
  });
  document.getElementById('newProductQty').addEventListener('keydown', e => {
    if (e.key === 'Enter') addProduct();
  });
});

// Auto-save notes on change
['quoteNotes','quoteTerms'].forEach(id => {
  document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', saveNotesFromUI);
  });
});

// ============================================================
// SHAKE KEYFRAME (injected for modal)
// ============================================================
const shakeStyle = document.createElement('style');
shakeStyle.textContent = `
@keyframes shake {
  0%,100% { transform: translateX(0); }
  20%      { transform: translateX(-8px); }
  40%      { transform: translateX(8px); }
  60%      { transform: translateX(-6px); }
  80%      { transform: translateX(6px); }
}`;
document.head.appendChild(shakeStyle);

// ============================================================
// INIT
// ============================================================

function init() {
  loadProducts();
  loadCompany();
  loadPrices();

  // Restore quote number
  const storedQN = localStorage.getItem(LS_QUOTE_NUM);
  if (storedQN) {
    const parsed = JSON.parse(storedQN);
    const year   = new Date().getFullYear();
    if (parsed.year === year && parsed.seq > 0) {
      quoteNumber = `Q-${year}-${String(parsed.seq).padStart(4, '0')}`;
    }
  }

  // Restore step — always start at step 1 for safety (products page)
  currentStep = 1;
  showPage(1);
  updateStepIndicator();
  renderProductsTable();

  if (quoteNumber) {
    document.getElementById('quoteNumberBadge').textContent = quoteNumber;
  }
}

// Boot
init();
