/**
 * template-loader.js  — SP Fashion
 * ─────────────────────────────────────────────────────────────
 * NOTE: billing.html ab directly _doTemplatePrint(), _doTemplateDownload(),
 * _doWhatsAppShare() use karta hai. Ye file settings save/read ke liye hai.
 *
 * FOLDER STRUCTURE:
 *   billing.html
 *   template-loader.js       ← ye file
 *   templates/
 *     template-thermal.html  ← 80mm / 57mm slip
 *     template-a4.html       ← (future)
 * ─────────────────────────────────────────────────────────────
 */

/**
 * Shop settings save karo (settings page se call karo)
 * @param {Object} settings
 *   shopName, shopAddress, shopPhone,
 *   selectedTemplate ('template-thermal.html' ya 'template-a4.html'),
 *   thermalSize ('80mm' ya '57mm')
 */
function saveShopSettings(settings) {
  const existing = JSON.parse(localStorage.getItem('shopSettings') || '{}');
  const merged   = { ...existing, ...settings };
  localStorage.setItem('shopSettings', JSON.stringify(merged));
  console.log('Settings saved:', merged);
}

/** Read all current settings */
function getShopSettings() {
  return JSON.parse(localStorage.getItem('shopSettings') || '{}');
}

/** Returns selected template filename */
function getSelectedTemplate() {
  const s = getShopSettings();
  return s.selectedTemplate || 'template-thermal.html';
}

/** Returns selected thermal size */
function getSelectedThermalSize() {
  const s = getShopSettings();
  return s.thermalSize || '80mm';
}

/**
 * Direct print function — billing.html ki jagah bahar se call karna ho to
 * @param {Array}  billItems - items array
 * @param {Object} meta      - { billNumber, customerName, customerPhone, 
 *                              cashReceived, status, finalPayment, 
 *                              receivedAmount, dueAmount }
 */
function printWithTemplate(billItems, meta) {
  if (!billItems || billItems.length === 0) {
    alert('No items to print!'); return;
  }
  const now = new Date();
  const totalAmount    = billItems.reduce((s, it) => s + (parseFloat(it.amount) || 0), 0);
  const fp             = (meta.finalPayment !== undefined && meta.finalPayment !== null && meta.finalPayment < totalAmount)
                          ? parseFloat(meta.finalPayment) : null;
  const effectiveTotal = fp !== null ? fp : totalAmount;
  const receivedAmt    = parseFloat(meta.receivedAmount || 0);
  const dueAmt         = parseFloat(meta.dueAmount || (meta.status === 'paid' ? 0 : effectiveTotal - receivedAmt));

  const printData = {
    billNumber:    meta.billNumber    || 'SP000000',
    customerName:  meta.customerName  || 'Cash Customer',
    customerPhone: meta.customerPhone || '',
    date:          now.toLocaleDateString('en-GB'),
    time:          now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
    items:         billItems,
    totalAmount,
    effectiveTotal,
    finalPayment:  fp,
    receivedAmount: receivedAmt,
    dueAmount:     dueAmt,
    cashReceived:  parseFloat(meta.cashReceived || 0),
    status:        meta.status || 'paid',
    thermalSize:   getSelectedThermalSize()
  };

  localStorage.setItem('printBillData', JSON.stringify(printData));

  const tpl = getSelectedTemplate();
  const win = window.open('templates/' + tpl, '_blank', 'width=500,height=700');
  if (!win) alert('Pop-up blocked! Please allow pop-ups for this site.');
}