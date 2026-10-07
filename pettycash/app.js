'use strict';

/* ============================================================
   CONFIG
   ============================================================ */
const ENDPOINTS = {
  sendOtp: 'https://ca5fc5190790e573a9eafd8b611366.91.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/11/workflows/33f0420df9d24fa581047ade11d2030b/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=2oMHnIsXj9_3fZjUGbxUx8Urya24YvMGQsZgeVdiMZ4',
  verifyOtp: 'https://ca5fc5190790e573a9eafd8b611366.91.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/04/workflows/f6be59a13d4945efb46def390e9c78ca/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=z9sOqNYNyFxnlBceUtloiMg0xCEHqFTh5EX1Pm3RYGQ',

  // Paste the PC_SubmitRequest HTTP POST URL here once its Create Item mapping is updated
  submitRequest: ''
};

const OTP_VALIDITY_SECONDS = 60;
const RESEND_COOLDOWN_SECONDS = 30;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'jpg', 'jpeg', 'png'];

console.log('BUILD v6 | Wizard interface');

/* ============================================================
   GL MASTER DATA (temporary — move to a SharePoint list later)
   ============================================================ */
const GL_MASTER = [
  { scope:'HQ',     department:'PDM',  costCentre:'C110030000', glCode:'64041050', description:'Auditing/Taxation/Secretarial',         expenseType:'Stamping fees',                                                    opexClass:'Admin & General' },
  { scope:'HQ',     department:'FIN',  costCentre:'C130010000', glCode:'64063020', description:'Contingencies',                         expenseType:'Miscellaneous (penalty, levy, etc.)',                             opexClass:'Admin & General' },
  { scope:'Both',   department:'FAS',  costCentre:'C140024000', glCode:'61025020', description:'Staff Entertainment and Refreshment',   expenseType:'Office or branch refreshment, meeting F&B and pantry supplies',   opexClass:'Personnel Costs' },
  { scope:'Both',   department:'FAS',  costCentre:'C140024000', glCode:'62011010', description:'Rental, Quit Rent & Assessment',        expenseType:'Signage for CGC building or branches',                            opexClass:'Establishment' },
  { scope:'HQ',     department:'FAS',  costCentre:'C140024000', glCode:'62021010', description:'Repairs & Maintenance',                 expenseType:'Air conditioning (monthly services)',                             opexClass:'Establishment' },
  { scope:'Both',   department:'FAS',  costCentre:'C140024000', glCode:'62021060', description:'Repairs & Maintenance',                 expenseType:'Ad hoc HQ repair works or branch office upkeep and minor repairs', opexClass:'Establishment' },
  { scope:'Branch', department:'FAS',  costCentre:'',           glCode:'62021050', description:'Repairs & Maintenance',                 expenseType:'Fire extinguisher maintenance and services',                      opexClass:'Establishment' },
  { scope:'Branch', department:'FAS',  costCentre:'',           glCode:'64011010', description:'Electricity & Water',                   expenseType:'Electricity (branches)',                                          opexClass:'Admin & General' },
  { scope:'Branch', department:'FAS',  costCentre:'',           glCode:'64011020', description:'Electricity & Water',                   expenseType:'Water and sewerage (branches)',                                   opexClass:'Admin & General' },
  { scope:'Branch', department:'FAS',  costCentre:'',           glCode:'64013010', description:'Telephone & Fax',                       expenseType:'Telephone and fax (branches)',                                    opexClass:'Admin & General' },
  { scope:'Branch', department:'FAS',  costCentre:'',           glCode:'64021010', description:'Postage',                               expenseType:'Courier and others',                                              opexClass:'Admin & General' },
  { scope:'Both',   department:'FAS',  costCentre:'C140024000', glCode:'64022020', description:'Printing & Stationery',                 expenseType:'Printing and stationery',                                         opexClass:'Admin & General' },
  { scope:'Branch', department:'FAS',  costCentre:'',           glCode:'64061010', description:'Library Books, Periodicals, Newspaper', expenseType:'Newspaper and magazine subscriptions',                            opexClass:'Admin & General' },
  { scope:'HQ',     department:'FAS',  costCentre:'C140024000', glCode:'64081030', description:'Security, Cleaning & Landscaping',      expenseType:'Office cleaning (miscellaneous)',                                 opexClass:'Admin & General' },
  { scope:'Both',   department:'FAS',  costCentre:'C140024000', glCode:'64081040', description:'Security, Cleaning & Landscaping',      expenseType:'Consumables (kitchen utensils and others)',                       opexClass:'Admin & General' },
  { scope:'HQ',     department:'FAS',  costCentre:'C140024000', glCode:'65017020', description:"Directors' Others",                     expenseType:'Directors refreshments (F&B for Board members)',                  opexClass:'BOD Expenses' },
  { scope:'HQ',     department:'ITV',  costCentre:'C150020000', glCode:'64031010', description:'Legal Fees',                            expenseType:'Legal fees',                                                      opexClass:'Admin & General' },
  { scope:'Branch', department:'CCSR', costCentre:'',           glCode:'61027030', description:'Staff Recreation & Amenities',          expenseType:'Town Hall',                                                       opexClass:'Personnel Costs' }
];

const STEPS = [
  { title: 'Requestor',        desc: 'Identity and department' },
  { title: 'Request details',  desc: 'Amount and purpose' },
  { title: 'Budget & GL',      desc: 'SAP classification' },
  { title: 'Payment details',  desc: 'Recipient bank account' },
  { title: 'Approvals',        desc: 'Authority Approval Matrix' },
  { title: 'Documents',        desc: 'BCA and supporting papers' },
  { title: 'Review & submit',  desc: 'Confirm and declare' }
];

/* ============================================================
   STATE & HELPERS
   ============================================================ */
const state = {
  location: '', branch: '', requestType: '', email: '',
  step: 1, maxStep: 1,
  files: [], glRows: [], selectedGl: null,
  sending: false, verifying: false, submitting: false,
  otpTimer: null, resendTimer: null
};

const $ = id => document.getElementById(id);
const show = el => el.classList.remove('hidden');
const hide = el => el.classList.add('hidden');
const v = id => String($(id).value || '').trim();

const ICON_CHECK = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10.5l4 4 8-9"/></svg>';

function showNotice(el, msg, type) {
  if (type) { el.classList.remove('error', 'success', 'info'); el.classList.add(type); }
  el.textContent = msg;
  el.classList.add('show');
}
function hideNotice(el) { el.classList.remove('show'); }

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

function todayIso() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function formatDisplayDate(value) {
  if (!value) return '';
  let d = value;
  if (typeof value === 'string') {
    const [y, m, day] = value.split('-').map(Number);
    d = new Date(y, m - 1, day);
  }
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatRM(n) {
  return 'RM ' + Number(n || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(0) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function friendlyError(err) {
  return err.name === 'AbortError' ? 'The request timed out. Please try again.' : err.message;
}

async function postJson(url, body, timeoutMs) {
  if (!url) throw new Error('This Power Automate endpoint is not configured yet.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const text = await res.text();
    if (!text) throw new Error('The flow returned an empty response. Check its Response action.');
    try { return JSON.parse(text); }
    catch { throw new Error('The flow returned a response that is not valid JSON.'); }
  } finally {
    clearTimeout(timer);
  }
}

/* ============================================================
   ENTRY SCREENS
   ============================================================ */
function chooseLocation(btn) {
  document.querySelectorAll('[data-location]').forEach(b => b.classList.toggle('selected', b === btn));
  state.location = btn.dataset.location;
  $('locationContinue').disabled = false;
}

function openAuthentication() {
  if (!state.location) return;
  hide($('screenLocation'));
  show($('screenAuth'));
  $('authContext').textContent = state.location === 'HQ' ? 'Headquarters' : 'Branch';
  $('branchSelection').classList.toggle('hidden', state.location !== 'Branch');
  $('gateEmail').focus();
}

function returnToLocation() {
  resetOtpUi();
  hide($('screenAuth'));
  show($('screenLocation'));
}

function chooseType(btn) {
  document.querySelectorAll('[data-type]').forEach(b => b.classList.toggle('selected', b === btn));
  state.requestType = btn.dataset.type;
  $('typeContinue').disabled = false;
}

function confirmType() {
  if (state.requestType) startWizard();
}

function showUserChip() {
  $('chipEmail').textContent = state.email;
  $('chipContext').textContent = state.location === 'HQ' ? 'Headquarters' : 'Branch · ' + state.branch;
  show($('userChip'));
}

/* ============================================================
   OTP
   ============================================================ */
async function sendOTP() {
  if (state.sending) return;

  const email = v('gateEmail').toLowerCase();
  const branch = $('branchSelect').value;
  const err = $('authError'), ok = $('authSuccess'), btn = $('sendOtpButton');

  hideNotice(err);
  hideNotice(ok);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showNotice(err, 'Enter a valid CGC email address.'); return; }
  if (state.location === 'Branch' && !branch) { showNotice(err, 'Select your branch.'); return; }

  state.sending = true;
  btn.disabled = true;
  btn.textContent = 'Sending…';
  let sent = false;

  try {
    const r = await postJson(ENDPOINTS.sendOtp, { email }, 15000);
    if (r.status !== 'sent') throw new Error(r.message || 'The code could not be sent.');

    sent = true;
    state.email = email;
    state.branch = branch;

    $('gateEmail').readOnly = true;
    $('branchSelect').disabled = true;
    $('otpEmail').textContent = email;
    show($('otpArea'));
    hideNotice($('otpError'));
    $('verifyButton').disabled = false;

    showNotice(ok, 'A verification code has been sent to your inbox.');
    clearOtpDigits(true);
    startOtpTimer();
    startResendTimer();
  } catch (e) {
    showNotice(err, friendlyError(e));
  } finally {
    state.sending = false;
    btn.disabled = false;
    btn.textContent = 'Send verification code';
    if (sent) hide(btn);
  }
}

async function resendOTP() {
  hideNotice($('otpError'));
  clearOtpDigits(true);
  await sendOTP();
}

async function verifyOTP() {
  if (state.verifying) return;

  const code = Array.from(document.querySelectorAll('.otp-digit')).map(i => i.value).join('');
  const err = $('otpError'), btn = $('verifyButton');

  hideNotice(err);
  if (code.length !== 6) { showNotice(err, 'Enter all six digits.'); return; }

  state.verifying = true;
  btn.disabled = true;
  btn.textContent = 'Verifying…';
  let keepDisabled = false;

  try {
    const r = await postJson(ENDPOINTS.verifyOtp, { email: state.email, code }, 15000);

    if (r.status === 'verified') {
      clearInterval(state.otpTimer);
      clearInterval(state.resendTimer);
      routeAfterVerification(r);
      return;
    }

    showNotice(err, r.message || 'The verification code is not valid.');
    clearOtpDigits(true);

    if (['locked', 'expired', 'no_code'].includes(r.status)) {
      keepDisabled = true;
      clearInterval(state.resendTimer);
      $('resendButton').disabled = false;
      $('resendButton').textContent = 'Resend code';
    }
  } catch (e) {
    showNotice(err, friendlyError(e));
  } finally {
    state.verifying = false;
    btn.textContent = 'Verify and continue';
    btn.disabled = keepDisabled;
  }
}

function routeAfterVerification(result) {
  try {
    sessionStorage.setItem('pc_email', state.email);
    if (result.token) sessionStorage.setItem('pc_token', result.token);
  } catch (e) { /* storage may be blocked inside iframes */ }

  applyProfile(result.profile);
  showUserChip();
  hide($('screenAuth'));

  if (state.location === 'HQ') {
    show($('screenType'));
  } else {
    state.requestType = 'Branch';
    startWizard();
  }
}

function applyProfile(p) {
  if (!p) return;
  const map = { requestorName: p.displayName, department: p.department, employeeId: p.employeeId };
  Object.entries(map).forEach(([id, value]) => {
    if (value) { $(id).value = value; $(id).readOnly = true; }
  });
}

function startOtpTimer() {
  clearInterval(state.otpTimer);
  let s = OTP_VALIDITY_SECONDS;
  renderOtpTimer(s);
  state.otpTimer = setInterval(() => {
    s--;
    renderOtpTimer(s);
    if (s <= 0) {
      clearInterval(state.otpTimer);
      $('otpTimer').textContent = 'Expired';
      showNotice($('otpError'), 'The code has expired. Request a new code.');
    }
  }, 1000);
}

function renderOtpTimer(s) {
  $('otpTimer').textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}

function startResendTimer() {
  clearInterval(state.resendTimer);
  let s = RESEND_COOLDOWN_SECONDS;
  const btn = $('resendButton');
  btn.disabled = true;
  btn.textContent = 'Resend in ' + s + 's';
  state.resendTimer = setInterval(() => {
    s--;
    btn.textContent = 'Resend in ' + s + 's';
    if (s <= 0) {
      clearInterval(state.resendTimer);
      btn.disabled = false;
      btn.textContent = 'Resend code';
    }
  }, 1000);
}

function clearOtpDigits(focus) {
  document.querySelectorAll('.otp-digit').forEach(i => { i.value = ''; i.classList.remove('filled'); });
  if (focus) {
    const first = document.querySelector('.otp-digit[data-index="0"]');
    if (first) first.focus();
  }
}

function resetOtpUi() {
  clearInterval(state.otpTimer);
  clearInterval(state.resendTimer);
  hide($('otpArea'));
  hideNotice($('authError'));
  hideNotice($('authSuccess'));
  hideNotice($('otpError'));
  $('gateEmail').readOnly = false;
  $('branchSelect').disabled = false;
  show($('sendOtpButton'));
  $('verifyButton').disabled = false;
  clearOtpDigits(false);
}

/* ============================================================
   WIZARD
   ============================================================ */
function typeLabel() {
  if (state.requestType === 'Branch') return 'Branch Petty Cash Request';
  return state.requestType === 'Claim' ? 'Petty Cash Claim' : 'Petty Cash Advance';
}

function startWizard() {
  hide($('screenType'));
  show($('wizard'));

  const isBranch = state.location === 'Branch';

  $('requestorEmail').value = state.email;
  $('requestDate').value = formatDisplayDate(new Date());
  $('branchName').value = state.branch;
  $('dateRequired').min = todayIso();

  $('railLocation').textContent = isBranch ? 'Branch · ' + state.branch : 'Headquarters';
  $('railType').textContent = typeLabel();

  $('branchProfileFields').classList.toggle('hidden', !isBranch);
  $('claimReferenceSection').classList.toggle('hidden', state.requestType !== 'Claim');
  $('hqApprovalFields').classList.toggle('hidden', isBranch);
  $('branchApprovalFields').classList.toggle('hidden', !isBranch);

  loadOpexClasses();

  state.step = 1;
  state.maxStep = 1;
  showStep(1);
}

function renderStepper() {
  const list = $('stepList');
  list.innerHTML = '';

  STEPS.forEach((s, i) => {
    const n = i + 1;
    let cls = 'step-item';
    if (n === state.step) cls += ' is-current';
    else if (n < state.maxStep) cls += ' is-complete';
    else if (n > state.maxStep) cls += ' is-locked';
    const clickable = n <= state.maxStep && n !== state.step;
    if (clickable) cls += ' is-clickable';

    const li = document.createElement('li');
    li.className = cls;
    li.innerHTML =
      '<span class="step-index">' + (cls.includes('is-complete') ? ICON_CHECK : n) + '</span>' +
      '<span><span class="step-title">' + s.title + '</span><span class="step-desc">' + s.desc + '</span></span>';
    if (clickable) li.onclick = () => goToStep(n);
    list.appendChild(li);
  });
}

function showStep(n) {
  state.step = n;
  const total = STEPS.length;

  document.querySelectorAll('.step-panel').forEach(p => {
    p.classList.toggle('hidden', Number(p.dataset.step) !== n);
  });

  $('stepCounter').textContent = 'Step ' + n + ' of ' + total;
  $('mobileStepLabel').textContent = 'Step ' + n + ' of ' + total + ' · ' + STEPS[n - 1].title;
  $('progressBar').style.width = (n / total * 100) + '%';
  $('backButton').disabled = n === 1;
  $('nextButton').textContent = n === total ? 'Submit request' : 'Continue';
  hideNotice($('submitNotice'));

  if (n === total) buildReview();

  renderStepper();
  $('wizard').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function nextStep() {
  if (state.step === STEPS.length) { submitRequest(); return; }
  if (!validateStep(state.step)) return;
  state.maxStep = Math.max(state.maxStep, state.step + 1);
  showStep(state.step + 1);
}

function previousStep() {
  if (state.step > 1) showStep(state.step - 1);
}

function goToStep(n) {
  if (n <= state.maxStep) showStep(n);
}

/* ============================================================
   VALIDATION
   ============================================================ */
function markInvalid(id, msg) {
  const target = id === 'requestDocuments' ? $('dropzone') : $(id);
  target.classList.add('invalid');
  const err = target.closest('.field') && target.closest('.field').querySelector('.error-text');
  if (err) { err.textContent = msg; err.classList.add('show'); }
}

function clearValidation(scope) {
  scope.querySelectorAll('.invalid').forEach(el => el.classList.remove('invalid'));
  scope.querySelectorAll('.error-text.show').forEach(el => el.classList.remove('show'));
}

function validateStep(n) {
  const panel = document.querySelector('.step-panel[data-step="' + n + '"]');
  clearValidation(panel);

  let ok = true;
  const fail = (id, msg) => { markInvalid(id, msg); ok = false; };
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (n === 1) {
    if (!v('requestorName')) fail('requestorName', 'Enter your full name.');
    if (!v('department')) fail('department', 'Enter your department.');
    if (!v('employeeId')) fail('employeeId', 'Enter your employee ID.');
  }

  if (n === 2) {
    if (state.requestType === 'Claim') {
      if (!v('originalRequestRef')) fail('originalRequestRef', 'Enter the original request reference.');
      if (!(Number(v('originalAmount')) > 0)) fail('originalAmount', 'Enter the original amount.');
    }
    if (!(Number(v('amountRequested')) > 0)) fail('amountRequested', 'Enter an amount greater than zero.');
    const d = v('dateRequired');
    if (!d) fail('dateRequired', 'Select the date the funds are required.');
    else if (d < todayIso()) fail('dateRequired', 'The date cannot be in the past.');
    if (v('purpose').length < 10) fail('purpose', 'Describe the business purpose in at least 10 characters.');
  }

  if (n === 3) {
    if (!v('opexClass')) fail('opexClass', 'Select the class of OPEX.');
    if (!state.selectedGl) fail('glCode', 'Select an SAP GL code.');
  }

  if (n === 4) {
    if (!v('bankName')) fail('bankName', 'Select the recipient bank.');
    if (v('bankName') === 'Other' && !v('otherBankName')) fail('otherBankName', 'Enter the bank name.');
    const acc = v('bankAccountNumber').replace(/[\s-]/g, '');
    if (!acc) fail('bankAccountNumber', 'Enter the account number.');
    else if (!/^\d{6,20}$/.test(acc)) fail('bankAccountNumber', 'The account number must contain 6 to 20 digits.');
  }

  if (n === 5) {
    const fields = state.location === 'HQ'
      ? [['departmentApprover1', 'first approver'], ['departmentApprover2', 'second approver']]
      : [['branchVerifierEmail', 'branch verifier'], ['branchManagementApprover', 'Branch Management approver']];

    const seen = [];
    fields.forEach(([id, label]) => {
      const value = v(id).toLowerCase();
      if (!value) fail(id, 'Enter the ' + label + ' email.');
      else if (!emailRe.test(value)) fail(id, 'Enter a valid email address.');
      else if (value === state.email) fail(id, 'You cannot approve your own request.');
      else if (seen.includes(value)) fail(id, 'Each approver must be a different person.');
      seen.push(value);
    });

    if (state.location === 'Branch') {
      const extra = v('branchSecondApprover').toLowerCase();
      if (extra && !emailRe.test(extra)) fail('branchSecondApprover', 'Enter a valid email address.');
      else if (extra && (extra === state.email || seen.includes(extra))) fail('branchSecondApprover', 'Each approver must be a different person.');
    }
  }

  if (n === 6) {
    if (!state.files.length) fail('requestDocuments', 'Upload at least one supporting document.');
    else if (totalFileSize() > MAX_UPLOAD_BYTES) fail('requestDocuments', 'The total size exceeds 10 MB. Remove a file to continue.');
  }

  if (n === 7 && !$('declarationAccepted').checked) {
    $('declarationError').classList.add('show');
    ok = false;
  }

  if (!ok) {
    const first = panel.querySelector('input.invalid, select.invalid, textarea.invalid');
    if (first) first.focus();
  }
  return ok;
}

/* ============================================================
   GL DROPDOWNS
   ============================================================ */
function availableGlRows() {
  return GL_MASTER.filter(r => r.scope === 'Both' || r.scope === state.location);
}

function loadOpexClasses() {
  const sel = $('opexClass');
  const classes = [...new Set(availableGlRows().map(r => r.opexClass))].sort();
  sel.innerHTML = '<option value="">Select class of OPEX</option>';
  classes.forEach(c => sel.add(new Option(c, c)));
  filterGlOptions();
}

function filterGlOptions() {
  const cls = $('opexClass').value;
  const sel = $('glCode');
  state.glRows = cls ? availableGlRows().filter(r => r.opexClass === cls) : [];
  sel.innerHTML = '<option value="">' + (cls ? 'Select SAP GL code' : 'Select a class of OPEX first') + '</option>';
  sel.disabled = !cls;
  state.glRows.forEach((r, i) => sel.add(new Option(r.glCode + ' — ' + r.expenseType, String(i))));
  applySelectedGL();
}

function applySelectedGL() {
  const idx = $('glCode').value;
  state.selectedGl = idx === '' ? null : state.glRows[Number(idx)];
  const card = $('glDetail');
  if (!state.selectedGl) { hide(card); return; }

  const r = state.selectedGl;
  $('detailOpex').textContent = r.opexClass;
  $('detailGlCode').textContent = r.glCode;
  $('detailGlDescription').textContent = r.description;
  $('detailExpenseType').textContent = r.expenseType;
  $('detailCostCentre').textContent = resolveCostCentre(r);
  show(card);
}

function resolveCostCentre(r) {
  if (r && r.costCentre) return r.costCentre;
  return state.location === 'Branch' ? 'To be confirmed by Finance' : '—';
}

/* ============================================================
   FILES
   ============================================================ */
function totalFileSize() {
  return state.files.reduce((sum, f) => sum + f.size, 0);
}

function handleFiles(list) {
  const rejected = [];
  Array.from(list).forEach(f => {
    const ext = (f.name.split('.').pop() || '').toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) { rejected.push(f.name); return; }
    if (state.files.some(x => x.name === f.name && x.size === f.size)) return;
    state.files.push(f);
  });

  renderFileList();
  clearValidation($('dropzone').closest('.field'));

  if (rejected.length) markInvalid('requestDocuments', 'Not an accepted file type: ' + rejected.join(', '));
  else if (totalFileSize() > MAX_UPLOAD_BYTES) markInvalid('requestDocuments', 'The total size exceeds 10 MB. Remove a file to continue.');
}

function removeFile(index) {
  state.files.splice(index, 1);
  renderFileList();
  clearValidation($('dropzone').closest('.field'));
}

function renderFileList() {
  const ul = $('fileList');
  ul.innerHTML = '';

  state.files.forEach((f, i) => {
    const li = document.createElement('li');
    li.className = 'file-item';
    li.innerHTML = '<div class="file-meta"><div class="file-name"></div><div class="file-size"></div></div>' +
                   '<button type="button" class="link-btn">Remove</button>';
    li.querySelector('.file-name').textContent = f.name;
    li.querySelector('.file-size').textContent = formatSize(f.size);
    li.querySelector('button').onclick = () => removeFile(i);
    ul.appendChild(li);
  });

  $('fileTotal').textContent = state.files.length
    ? state.files.length + ' file(s) · ' + formatSize(totalFileSize()) + ' of 10 MB'
    : '';
}

function fileToPayload(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({
      name: file.name,
      size: file.size,
      contentType: file.type || 'application/octet-stream',
      contentBytes: String(reader.result).split(',')[1]
    });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ============================================================
   REVIEW
   ============================================================ */
function bankNameValue() {
  return v('bankName') === 'Other' ? v('otherBankName') : v('bankName');
}

function buildReview() {
  const isHQ = state.location === 'HQ';
  const isClaim = state.requestType === 'Claim';
  const gl = state.selectedGl || {};

  const sections = [
    { step: 1, title: 'Requestor', rows: [
      ['Name', v('requestorName')],
      ['Email', state.email],
      ['Department', v('department')],
      ['Employee ID', v('employeeId')],
      ['Request date', v('requestDate')],
      ...(isHQ ? [] : [['Branch', state.branch]])
    ]},
    { step: 2, title: 'Request details', rows: [
      ...(isClaim ? [['Original reference', v('originalRequestRef')], ['Original amount', formatRM(v('originalAmount'))]] : []),
      ['Date required', formatDisplayDate(v('dateRequired'))],
      ['Request type', typeLabel()],
      ['Business purpose', v('purpose'), true]
    ]},
    { step: 3, title: 'Budget & GL', rows: [
      ['Class of OPEX', gl.opexClass],
      ['SAP GL code', gl.glCode],
      ['GL description', gl.description],
      ['Cost centre', resolveCostCentre(gl)],
      ['Type of expense', gl.expenseType, true]
    ]},
    { step: 4, title: 'Payment details', rows: [
      ['Bank', bankNameValue()],
      ['Account number', v('bankAccountNumber')]
    ]},
    { step: 5, title: 'Approvals', rows: isHQ
      ? [['First approver', v('departmentApprover1')], ['Second approver', v('departmentApprover2')]]
      : [['Branch verifier', v('branchVerifierEmail')], ['Branch Management approver', v('branchManagementApprover')],
         ...(v('branchSecondApprover') ? [['Additional approver', v('branchSecondApprover')]] : [])]
    },
    { step: 6, title: 'Documents', rows: [
      ['Attachments', state.files.map(f => f.name).join(', '), true]
    ]}
  ];

  let html = '<div class="amount-hero"><span>Amount requested</span><strong>' + formatRM(v('amountRequested')) + '</strong></div>';

  sections.forEach(s => {
    html += '<section class="review-section"><div class="review-head"><h3>' + s.title + '</h3>' +
            '<button type="button" class="link-btn" onclick="goToStep(' + s.step + ')">Edit</button></div><div class="review-grid">';
    s.rows.forEach(([label, value, full]) => {
      html += '<div' + (full ? ' class="full"' : '') + '><span>' + esc(label) + '</span><strong>' + esc(value || '—') + '</strong></div>';
    });
    html += '</div></section>';
  });

  $('reviewContent').innerHTML = html;
}

/* ============================================================
   SUBMIT
   ============================================================ */
async function buildPayload() {
  const gl = state.selectedGl || {};
  const isHQ = state.location === 'HQ';
  const isClaim = state.requestType === 'Claim';
  let token = '';
  try { token = sessionStorage.getItem('pc_token') || ''; } catch (e) {}

  return {
    requestType: state.requestType,
    originationLocation: state.location,
    branch: state.branch || '',

    requestorEmail: state.email,
    requestorName: v('requestorName'),
    employeeId: v('employeeId'),
    department: v('department'),

    dateRequired: v('dateRequired'),
    amountRequested: Number(v('amountRequested')),
    purpose: v('purpose'),

    originalRequestReference: isClaim ? v('originalRequestRef') : '',
    originalAmount: isClaim ? Number(v('originalAmount')) : 0,

    classOfOpex: gl.opexClass || '',
    sapGlCode: gl.glCode || '',
    sapGlDescription: gl.description || '',
    costCentre: gl.costCentre || '',
    expenseType: gl.expenseType || '',

    bankName: bankNameValue(),
    bankAccountNumber: v('bankAccountNumber').replace(/[\s-]/g, ''),

    departmentApprover1: isHQ ? v('departmentApprover1').toLowerCase() : '',
    departmentApprover2: isHQ ? v('departmentApprover2').toLowerCase() : '',
    branchVerifier: isHQ ? '' : v('branchVerifierEmail').toLowerCase(),
    branchManagementApprover: isHQ ? '' : v('branchManagementApprover').toLowerCase(),
    branchSecondApprover: isHQ ? '' : v('branchSecondApprover').toLowerCase(),

    requestDocuments: await Promise.all(state.files.map(fileToPayload)),

    declarationAccepted: true,
    verificationToken: token,
    submittedAt: new Date().toISOString()
  };
}

async function submitRequest() {
  if (state.submitting) return;

  for (let n = 1; n <= STEPS.length; n++) {
    if (!validateStep(n)) {
      if (n !== state.step) { showStep(n); validateStep(n); }
      return;
    }
  }

  const notice = $('submitNotice');
  const btn = $('nextButton');
  hideNotice(notice);

  if (!ENDPOINTS.submitRequest) {
    const preview = await buildPayload();
    preview.requestDocuments = preview.requestDocuments.map(f => ({ name: f.name, size: f.size }));
    console.log('Payload preview (not sent):', preview);
    showNotice(notice, 'All checks passed. Submission is not connected yet. Paste the PC_SubmitRequest URL into app.js. A payload preview is in the browser console (F12).', 'info');
    return;
  }

  state.submitting = true;
  btn.disabled = true;
  $('backButton').disabled = true;
  btn.textContent = 'Submitting…';

  try {
    const r = await postJson(ENDPOINTS.submitRequest, await buildPayload(), 90000);
    if (r.status !== 'submitted') throw new Error(r.message || 'Submission failed.');
    showSuccess(r.requestReference || r.requestId || 'Pending');
  } catch (e) {
    console.error(e);
    showNotice(notice, e.name === 'AbortError'
      ? 'Submission timed out. Confirm with Finance before resubmitting to avoid a duplicate request.'
      : e.message, 'error');
  } finally {
    state.submitting = false;
    btn.disabled = false;
    $('backButton').disabled = state.step === 1;
    btn.textContent = 'Submit request';
  }
}

function showSuccess(reference) {
  hide($('wizard'));
  $('successReference').textContent = reference;
  show($('screenSuccess'));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ============================================================
   RESET
   ============================================================ */
function restartApplication(skipConfirm) {
  if (!skipConfirm && !confirm('Start over? Information entered will be cleared.')) return;

  Object.assign(state, {
    location: '', branch: '', requestType: '', email: '',
    step: 1, maxStep: 1, files: [], glRows: [], selectedGl: null
  });

  $('requestForm').reset();
  ['requestorName', 'department', 'employeeId'].forEach(id => { $(id).readOnly = false; });
  renderFileList();
  hide($('glDetail'));
  hide($('otherBankField'));
  $('purposeCount').textContent = '0 / 500';
  clearValidation(document);

  $('gateEmail').value = '';
  $('branchSelect').value = '';
  document.querySelectorAll('.choice').forEach(c => c.classList.remove('selected'));
  $('locationContinue').disabled = true;
  $('typeContinue').disabled = true;

  ['screenAuth', 'screenType', 'wizard', 'screenSuccess', 'userChip'].forEach(id => hide($(id)));
  show($('screenLocation'));

  try {
    sessionStorage.removeItem('pc_email');
    sessionStorage.removeItem('pc_token');
  } catch (e) {}

  resetOtpUi();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ============================================================
   INIT
   ============================================================ */
function init() {
  $('purpose').addEventListener('input', () => {
    $('purposeCount').textContent = $('purpose').value.length + ' / 500';
  });

  $('bankName').addEventListener('change', e => {
    $('otherBankField').classList.toggle('hidden', e.target.value !== 'Other');
  });

  ['amountRequested', 'originalAmount'].forEach(id => {
    $(id).addEventListener('blur', e => {
      const n = Number(e.target.value);
      if (n > 0) e.target.value = n.toFixed(2);
    });
  });

  $('gateEmail').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); sendOTP(); }
  });

  // Clear a field's error as soon as the user corrects it
  document.addEventListener('input', e => {
    const t = e.target;
    if (!t.classList || !t.classList.contains('invalid')) return;
    t.classList.remove('invalid');
    const err = t.closest('.field') && t.closest('.field').querySelector('.error-text');
    if (err) err.classList.remove('show');
  });

  $('declarationAccepted').addEventListener('change', () => $('declarationError').classList.remove('show'));

  // Upload
  const dz = $('dropzone');
  const input = $('requestDocuments');
  input.addEventListener('change', () => { handleFiles(input.files); input.value = ''; });
  ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('dragging'); }));
  ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('dragging'); }));
  dz.addEventListener('drop', e => handleFiles(e.dataTransfer.files));

  // OTP digits
  document.querySelectorAll('.otp-digit').forEach((input, index) => {
    input.addEventListener('input', e => {
      const d = e.target.value.replace(/\D/g, '').slice(0, 1);
      e.target.value = d;
      e.target.classList.toggle('filled', Boolean(d));
      if (d) {
        const next = document.querySelector('.otp-digit[data-index="' + (index + 1) + '"]');
        if (next) next.focus();
        else setTimeout(verifyOTP, 150);
      }
    });

    input.addEventListener('keydown', e => {
      if (e.key === 'Backspace' && !e.target.value && index > 0) {
        const prev = document.querySelector('.otp-digit[data-index="' + (index - 1) + '"]');
        if (prev) { prev.focus(); prev.value = ''; prev.classList.remove('filled'); }
      }
    });

    input.addEventListener('paste', e => {
      e.preventDefault();
      const digits = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6);
      digits.split('').forEach((d, i) => {
        const box = document.querySelector('.otp-digit[data-index="' + i + '"]');
        if (box) { box.value = d; box.classList.add('filled'); }
      });
      if (digits.length === 6) setTimeout(verifyOTP, 150);
    });
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
