/* ============================================================
   CONFIG
   ============================================================ */
const ENDPOINTS = {
  sendOtp: 'https://ca5fc5190790e573a9eafd8b611366.91.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/11/workflows/33f0420df9d24fa581047ade11d2030b/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=2oMHnIsXj9_3fZjUGbxUx8Urya24YvMGQsZgeVdiMZ4',
  verifyOtp: 'https://ca5fc5190790e573a9eafd8b611366.91.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/04/workflows/f6be59a13d4945efb46def390e9c78ca/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=z9sOqNYNyFxnlBceUtloiMg0xCEHqFTh5EX1Pm3RYGQ',

  // Leave blank until the new lifecycle PC_SubmitRequest flow is built
  submitRequest: ''
};

const OTP_VALIDITY_SECONDS = 60;
const RESEND_COOLDOWN_SECONDS = 30;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB total

console.log('🔧 BUILD v4 | Lifecycle front end');

/* ============================================================
   GL MASTER DATA (temporary — replace with SharePoint lookup)
   ============================================================ */
const GL_MASTER = [
  { scope:'HQ',     department:'PDM',  costCentre:'C110030000', glCode:'64041050', description:'Auditing/Taxation/Secretarial',       expenseType:'Stamping Fees',                                                   opexClass:'Admin & General' },
  { scope:'HQ',     department:'FIN',  costCentre:'C130010000', glCode:'64063020', description:'Contingencies',                       expenseType:'Miscellaneous (Penalty, Levy & Etc.)',                            opexClass:'Admin & General' },
  { scope:'Both',   department:'FAS',  costCentre:'C140024000', glCode:'61025020', description:'Staff Entertainment and Refreshment', expenseType:'Office / branch refreshment, meeting F&B and pantry supplies',   opexClass:'Personnel Costs' },
  { scope:'Both',   department:'FAS',  costCentre:'C140024000', glCode:'62011010', description:'Rental, Quit Rent & Assessment',      expenseType:'Signage for CGC building or branches',                            opexClass:'Establishment' },
  { scope:'HQ',     department:'FAS',  costCentre:'C140024000', glCode:'62021010', description:'Repairs & maintenance',               expenseType:'Air conditioning (monthly services)',                             opexClass:'Establishment' },
  { scope:'Both',   department:'FAS',  costCentre:'C140024000', glCode:'62021060', description:'Repairs & maintenance',               expenseType:'Ad hoc HQ repair works / branch office upkeep and minor repairs', opexClass:'Establishment' },
  { scope:'Branch', department:'FAS',  costCentre:'',           glCode:'62021050', description:'Repairs & maintenance',               expenseType:'Fire extinguishers maintenance and services',                     opexClass:'Establishment' },
  { scope:'Branch', department:'FAS',  costCentre:'',           glCode:'64011010', description:'Electricity & Water',                 expenseType:'Electricity (branches)',                                          opexClass:'Admin & General' },
  { scope:'Branch', department:'FAS',  costCentre:'',           glCode:'64011020', description:'Electricity & Water',                 expenseType:'Water & sewerage (branches)',                                     opexClass:'Admin & General' },
  { scope:'Branch', department:'FAS',  costCentre:'',           glCode:'64013010', description:'Telephone & Fax',                     expenseType:'Telephone & fax (branches)',                                      opexClass:'Admin & General' },
  { scope:'Branch', department:'FAS',  costCentre:'',           glCode:'64021010', description:'Postage',                             expenseType:'Courier and others',                                              opexClass:'Admin & General' },
  { scope:'Both',   department:'FAS',  costCentre:'C140024000', glCode:'64022020', description:'Printing & Stationery',               expenseType:'Printing & stationery',                                           opexClass:'Admin & General' },
  { scope:'Branch', department:'FAS',  costCentre:'',           glCode:'64061010', description:'Library books, Periodicals, Newspaper', expenseType:'Newspapers / magazines subscription',                           opexClass:'Admin & General' },
  { scope:'HQ',     department:'FAS',  costCentre:'C140024000', glCode:'64081030', description:'Security, cleaning & landscaping',    expenseType:'Office cleaning - miscellaneous',                                 opexClass:'Admin & General' },
  { scope:'Both',   department:'FAS',  costCentre:'C140024000', glCode:'64081040', description:'Security, cleaning & landscaping',    expenseType:'Consumables - kitchen utensils and others',                       opexClass:'Admin & General' },
  { scope:'HQ',     department:'FAS',  costCentre:'C140024000', glCode:'65017020', description:"Directors' Others",                   expenseType:'Directors refreshments - F&B for Board members',                  opexClass:'BOD Expenses' },
  { scope:'HQ',     department:'ITV',  costCentre:'C150020000', glCode:'64031010', description:'Legal Fees',                          expenseType:'Legal fees',                                                      opexClass:'Admin & General' },
  { scope:'Branch', department:'CCSR', costCentre:'',           glCode:'61027030', description:'Staff Recreation & Amenities',        expenseType:'Town Hall',                                                       opexClass:'Personnel Costs' }
];

const WORKFLOWS = {
  HQ: [
    'Request Submitted', 'Dept Approver 1', 'Dept Approver 2',
    'Finance Processor', 'Finance Approver', 'Payment Disbursed',
    'Requestor Acknowledges', 'Purchase Receipts', 'Finance Validation', 'SAP Posting'
  ],
  Branch: [
    'Branch Maker', 'Branch Verifier', 'Branch Mgmt Approval',
    'Finance Processor', 'Finance Approver', 'Payment Disbursed',
    'Requestor Acknowledges', 'Purchase Receipts', 'Finance Validation', 'SAP Posting'
  ]
};

/* ============================================================
   STATE
   ============================================================ */
let selectedLocation = '';
let selectedBranch = '';
let requestType = '';
let verifiedEmail = '';
let otpTimerHandle = null;
let resendTimerHandle = null;
let isSendingOtp = false;
let isVerifyingOtp = false;
let isSubmitting = false;
let filteredGlRows = [];

const $ = id => document.getElementById(id);

/* ============================================================
   NAVIGATION
   ============================================================ */
function chooseLocation(card) {
  document.querySelectorAll('.select-card[data-location]').forEach(c => c.classList.remove('selected'));
  card.classList.add('selected');
  selectedLocation = card.dataset.location;
  $('locationContinue').disabled = false;
}

function openAuthentication() {
  if (!selectedLocation) return;
  $('locationScreen').classList.add('hidden');
  $('authenticationScreen').classList.remove('hidden');
  $('locationTag').textContent = selectedLocation === 'HQ' ? 'HEADQUARTERS' : 'BRANCH';
  $('branchSelection').classList.toggle('hidden', selectedLocation !== 'Branch');
}

function returnToLocation() {
  resetOtpUi();
  $('authenticationScreen').classList.add('hidden');
  $('locationScreen').classList.remove('hidden');
}

function returnToAuthentication() {
  $('requestTypeScreen').classList.add('hidden');
  $('authenticationScreen').classList.remove('hidden');
}

/* ============================================================
   HTTP HELPERS
   ============================================================ */
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
    if (!text) throw new Error('The flow returned an empty response. Check the Response action.');

    let data;
    try { data = JSON.parse(text); }
    catch { throw new Error('The flow returned a response that is not valid JSON.'); }

    return data;
  } finally {
    clearTimeout(timer);
  }
}

function friendlyError(err) {
  return err.name === 'AbortError' ? 'The request timed out. Please try again.' : err.message;
}

function showMessage(el, msg) {
  el.textContent = msg;
  el.classList.add('show');
}

/* ============================================================
   OTP: SEND
   ============================================================ */
async function sendOTP() {
  if (isSendingOtp) return;

  const email = $('gateEmail').value.trim().toLowerCase();
  const branch = $('branchSelect').value;
  const errBox = $('authError');
  const okBox = $('authSuccess');
  const btn = $('sendOtpButton');

  errBox.classList.remove('show');
  okBox.classList.remove('show');

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showMessage(errBox, 'Enter a valid CGC email address.');
    return;
  }
  if (selectedLocation === 'Branch' && !branch) {
    showMessage(errBox, 'Select your branch.');
    return;
  }

  isSendingOtp = true;
  btn.disabled = true;
  btn.textContent = 'Sending...';

  try {
    const result = await postJson(ENDPOINTS.sendOtp, { email }, 15000);

    if (result.status !== 'sent') {
      throw new Error(result.message || 'The code could not be sent.');
    }

    verifiedEmail = email;
    selectedBranch = branch;

    $('gateEmail').readOnly = true;
    $('branchSelect').disabled = true;
    $('otpEmail').textContent = email;
    $('otpArea').classList.remove('hidden');
    $('otpError').classList.remove('show');
    $('verifyButton').disabled = false;

    showMessage(okBox, 'Verification code sent. Check your inbox.');
    clearOtpDigits();
    startOtpTimer();
    startResendTimer();
  } catch (err) {
    showMessage(errBox, friendlyError(err));
  } finally {
    isSendingOtp = false;
    btn.disabled = false;
    btn.textContent = 'Resend Verification Code';
  }
}

async function resendOTP() {
  clearOtpDigits();
  $('otpError').classList.remove('show');
  await sendOTP();
}

/* ============================================================
   OTP: VERIFY
   ============================================================ */
async function verifyOTP() {
  if (isVerifyingOtp) return;

  const code = Array.from(document.querySelectorAll('.otp-digit')).map(i => i.value).join('');
  const errBox = $('otpError');
  const btn = $('verifyButton');

  errBox.classList.remove('show');

  if (code.length !== 6) {
    showMessage(errBox, 'Enter all six digits.');
    return;
  }

  isVerifyingOtp = true;
  btn.disabled = true;
  btn.textContent = 'Verifying...';

  let locked = false;

  try {
    const result = await postJson(ENDPOINTS.verifyOtp, { email: verifiedEmail, code }, 15000);

    if (result.status === 'verified') {
      clearInterval(otpTimerHandle);
      clearInterval(resendTimerHandle);
      routeAfterVerification(result);
      return;
    }

    showMessage(errBox, result.message || 'The verification code is not valid.');
    clearOtpDigits();

    if (result.status === 'locked' || result.status === 'expired' || result.status === 'no_code') {
      locked = true;
      $('resendButton').disabled = false;
      $('resendButton').textContent = 'Resend Code';
      clearInterval(resendTimerHandle);
    }
  } catch (err) {
    showMessage(errBox, friendlyError(err));
  } finally {
    isVerifyingOtp = false;
    btn.textContent = 'Verify and Continue';
    btn.disabled = locked;
  }
}

function routeAfterVerification(result) {
  try {
    sessionStorage.setItem('pc_email', verifiedEmail);
    if (result.token) sessionStorage.setItem('pc_token', result.token);
  } catch (e) { /* iframe may block storage */ }

  // Auto-fill if PC_VerifyOTP later returns a profile object
  if (result.profile) {
    $('requestorName').value = result.profile.displayName || '';
    $('department').value = result.profile.department || '';
    $('employeeId').value = result.profile.employeeId || '';
  }

  $('authenticationScreen').classList.add('hidden');

  if (selectedLocation === 'HQ') {
    $('requestTypeScreen').classList.remove('hidden');
  } else {
    openRequestForm('Advance');
  }
}

/* ============================================================
   OTP: TIMERS & INPUTS
   ============================================================ */
function startOtpTimer() {
  clearInterval(otpTimerHandle);
  let seconds = OTP_VALIDITY_SECONDS;
  renderOtpTimer(seconds);

  otpTimerHandle = setInterval(() => {
    seconds--;
    renderOtpTimer(seconds);
    if (seconds <= 0) {
      clearInterval(otpTimerHandle);
      $('otpTimer').textContent = 'EXPIRED';
      showMessage($('otpError'), 'The code has expired. Request a new code.');
    }
  }, 1000);
}

function renderOtpTimer(seconds) {
  const m = String(Math.floor(seconds / 60)).padStart(2, '0');
  const s = String(seconds % 60).padStart(2, '0');
  $('otpTimer').textContent = m + ':' + s;
}

function startResendTimer() {
  clearInterval(resendTimerHandle);
  let seconds = RESEND_COOLDOWN_SECONDS;
  const btn = $('resendButton');
  btn.disabled = true;
  btn.textContent = 'Resend in ' + seconds + 's';

  resendTimerHandle = setInterval(() => {
    seconds--;
    btn.textContent = 'Resend in ' + seconds + 's';
    if (seconds <= 0) {
      clearInterval(resendTimerHandle);
      btn.disabled = false;
      btn.textContent = 'Resend Code';
    }
  }, 1000);
}

function clearOtpDigits() {
  document.querySelectorAll('.otp-digit').forEach(i => {
    i.value = '';
    i.classList.remove('filled');
  });
  const first = document.querySelector('.otp-digit[data-index="0"]');
  if (first) first.focus();
}

function resetOtpUi() {
  clearInterval(otpTimerHandle);
  clearInterval(resendTimerHandle);
  $('otpArea').classList.add('hidden');
  $('authError').classList.remove('show');
  $('authSuccess').classList.remove('show');
  $('otpError').classList.remove('show');
  $('gateEmail').readOnly = false;
  $('branchSelect').disabled = false;
  $('sendOtpButton').textContent = 'Send Verification Code';
  $('verifyButton').disabled = false;
  clearOtpDigits();
}

/* ============================================================
   REQUEST FORM
   ============================================================ */
function openRequestForm(type) {
  requestType = type;

  $('requestTypeScreen').classList.add('hidden');
  $('requestScreen').classList.remove('hidden');

  $('displayLocation').textContent = selectedLocation === 'Branch' ? 'Branch - ' + selectedBranch : 'Headquarters';
  $('displayEmail').textContent = verifiedEmail;
  $('requestorEmail').value = verifiedEmail;
  $('requestDate').value = getLocalDate();
  $('branchName').value = selectedBranch;

  $('requestBadge').textContent = selectedLocation === 'Branch'
    ? 'BRANCH PETTY CASH'
    : 'HQ PETTY CASH ' + type.toUpperCase();

  $('claimReferenceSection').classList.toggle('hidden', type !== 'Claim');
  $('bankSection').classList.toggle('hidden', type === 'Claim');
  $('branchProfileFields').classList.toggle('hidden', selectedLocation !== 'Branch');
  $('hqApprovalFields').classList.toggle('hidden', selectedLocation !== 'HQ');
  $('branchApprovalFields').classList.toggle('hidden', selectedLocation !== 'Branch');

  $('summaryLocation').textContent = selectedLocation === 'Branch' ? selectedBranch : 'Headquarters';
  $('summaryType').textContent = selectedLocation === 'Branch' ? 'Branch Petty Cash' : type;

  buildWorkflow();
  loadOpexClasses();
  updateSummaryAmount();
}

function buildWorkflow() {
  const container = $('workflowSteps');
  container.innerHTML = '';
  WORKFLOWS[selectedLocation].forEach((label, i) => {
    const step = document.createElement('div');
    step.className = 'workflow-step' + (i === 0 ? ' active' : '');
    step.innerHTML = '<div class="bubble">' + (i + 1) + '</div><span>' + label + '</span>';
    container.appendChild(step);
  });
}

/* ============================================================
   GL DROPDOWNS
   ============================================================ */
function availableGlRows() {
  return GL_MASTER.filter(r => r.scope === 'Both' || r.scope === selectedLocation);
}

function loadOpexClasses() {
  const select = $('opexClass');
  const classes = [...new Set(availableGlRows().map(r => r.opexClass))].sort();
  select.innerHTML = '<option value="">-- Select Class --</option>';
  classes.forEach(c => select.add(new Option(c, c)));
  filterGlOptions();
}

function filterGlOptions() {
  const cls = $('opexClass').value;
  const select = $('glCode');

  filteredGlRows = availableGlRows().filter(r => !cls || r.opexClass === cls);

  select.innerHTML = '<option value="">-- Select GL Code --</option>';
  filteredGlRows.forEach((r, i) => {
    select.add(new Option(r.glCode + ' - ' + r.expenseType, String(i)));
  });

  clearGlDetails();
}

function applySelectedGL() {
  const idx = $('glCode').value;
  const row = idx === '' ? null : filteredGlRows[Number(idx)];

  if (!row) { clearGlDetails(); return; }

  $('costCentre').value = row.costCentre || (selectedLocation === 'Branch' ? 'Pending branch cost centre' : '');
  $('glDescription').value = row.description;
  $('expenseType').value = row.expenseType;
}

function getSelectedGlRow() {
  const idx = $('glCode').value;
  return idx === '' ? null : filteredGlRows[Number(idx)];
}

function clearGlDetails() {
  $('costCentre').value = '';
  $('glDescription').value = '';
  $('expenseType').value = '';
}

/* ============================================================
   VALIDATION
   ============================================================ */
function validateForm() {
  clearValidation();

  const required = ['employeeId', 'amountRequested', 'dateRequired', 'purpose', 'opexClass', 'glCode', 'requestDocuments'];

  if (requestType === 'Advance' || selectedLocation === 'Branch') {
    required.push('bankName', 'bankAccountNumber');
    if ($('bankName').value === 'Other') required.push('otherBankName');
  }
  if (requestType === 'Claim' && selectedLocation === 'HQ') {
    required.push('originalRequestRef', 'originalAmount');
  }
  if (selectedLocation === 'HQ') {
    required.push('departmentApprover1', 'departmentApprover2');
  } else {
    required.push('branchVerifierEmail', 'branchManagementApprover');
  }

  let valid = true;

  required.forEach(id => {
    const field = $(id);
    if (!field) return;
    const empty = field.type === 'file' ? field.files.length === 0 : !String(field.value || '').trim();
    if (empty) { markInvalid(field); valid = false; }
  });

  const amount = Number($('amountRequested').value);
  if (!Number.isFinite(amount) || amount <= 0) {
    markInvalid($('amountRequested'));
    valid = false;
  }

  const files = Array.from($('requestDocuments').files);
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  if (totalSize > MAX_UPLOAD_BYTES) {
    markInvalid($('requestDocuments'));
    alert('Total attachment size exceeds 10 MB. Please reduce file sizes.');
    valid = false;
  }

  if (!$('declarationAccepted').checked) {
    $('declarationError').classList.add('show');
    valid = false;
  }

  if (!valid) {
    const first = document.querySelector('.invalid');
    if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  return valid;
}

function markInvalid(field) {
  field.classList.add('invalid');
  const err = field.parentElement.querySelector('.error-text');
  if (err) err.classList.add('show');
}

function clearValidation() {
  document.querySelectorAll('.invalid').forEach(f => f.classList.remove('invalid'));
  document.querySelectorAll('.error-text.show').forEach(e => e.classList.remove('show'));
}

/* ============================================================
   PAYLOAD & SUBMIT
   ============================================================ */
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

async function collectFiles(inputId) {
  const input = $(inputId);
  if (!input || !input.files.length) return [];
  return Promise.all(Array.from(input.files).map(fileToPayload));
}

async function buildPayload() {
  const gl = getSelectedGlRow();
  let token = '';
  try { token = sessionStorage.getItem('pc_token') || ''; } catch (e) {}

  const bankName = $('bankName').value === 'Other' ? $('otherBankName').value.trim() : $('bankName').value;

  return {
    processVersion: 'LifecycleV2',
    requestType: selectedLocation === 'Branch' ? 'Branch' : requestType,
    originationLocation: selectedLocation,
    branch: selectedBranch || '',

    requestorEmail: verifiedEmail,
    requestorName: $('requestorName').value,
    employeeId: $('employeeId').value.trim(),
    department: $('department').value,

    dateRequired: $('dateRequired').value,
    amountRequested: Number($('amountRequested').value),
    purpose: $('purpose').value.trim(),

    originalRequestReference: requestType === 'Claim' ? $('originalRequestRef').value.trim() : '',
    originalAmount: requestType === 'Claim' ? Number($('originalAmount').value) || 0 : 0,

    classOfOpex: gl ? gl.opexClass : '',
    glDepartment: gl ? gl.department : '',
    costCentre: gl && gl.costCentre ? gl.costCentre : $('branchCostCentre').value,
    sapGlCode: gl ? gl.glCode : '',
    sapGlDescription: gl ? gl.description : '',
    expenseType: gl ? gl.expenseType : '',

    bankName: bankName,
    bankAccountNumber: $('bankAccountNumber').value.trim(),

    departmentApprover1: $('departmentApprover1').value.trim(),
    departmentApprover2: $('departmentApprover2').value.trim(),
    branchVerifier: $('branchVerifierEmail').value.trim(),
    branchManagementApprover: $('branchManagementApprover').value.trim(),
    branchSecondApprover: $('branchSecondApprover').value.trim(),

    requestDocuments: await collectFiles('requestDocuments'),

    declarationAccepted: true,
    verificationToken: token,
    submittedAt: new Date().toISOString()
  };
}

async function submitRequest() {
  if (isSubmitting) return;
  if (!validateForm()) return;

  if (!ENDPOINTS.submitRequest) {
    const preview = await buildPayload();
    preview.requestDocuments = preview.requestDocuments.map(f => ({ name: f.name, size: f.size }));
    console.log('📦 Payload preview (not sent):', preview);
    alert('The form is complete. Submission is not connected yet because the new PC_SubmitRequest flow has not been built.\n\nPress F12 > Console to view the payload preview.');
    return;
  }

  const btn = $('submitButton');
  isSubmitting = true;
  btn.disabled = true;
  btn.textContent = 'Submitting...';

  try {
    const payload = await buildPayload();
    const result = await postJson(ENDPOINTS.submitRequest, payload, 90000);

    if (result.status !== 'submitted') {
      throw new Error(result.message || 'Submission failed.');
    }

    alert('Request submitted successfully.\n\nReference: ' + (result.requestReference || 'Pending'));
    restartApplication(true);
  } catch (err) {
    console.error(err);
    alert(err.name === 'AbortError'
      ? 'Submission timed out. Check your request history before resubmitting.'
      : err.message);
  } finally {
    isSubmitting = false;
    btn.disabled = false;
    btn.textContent = 'Submit Request';
  }
}

/* ============================================================
   UTILITIES
   ============================================================ */
function getLocalDate() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function updateSummaryAmount() {
  const v = Number($('amountRequested').value) || 0;
  $('summaryAmount').textContent = 'RM ' + v.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function restartApplication(skipConfirm) {
  if (!skipConfirm && !confirm('Start over? All unsaved information will be cleared.')) return;

  selectedLocation = '';
  selectedBranch = '';
  requestType = '';
  verifiedEmail = '';

  $('requestForm').reset();
  $('gateEmail').value = '';
  $('branchSelect').value = '';
  $('otherBankField').classList.add('hidden');
  clearValidation();

  $('requestScreen').classList.add('hidden');
  $('requestTypeScreen').classList.add('hidden');
  $('authenticationScreen').classList.add('hidden');
  $('locationScreen').classList.remove('hidden');
  $('locationContinue').disabled = true;

  document.querySelectorAll('.select-card').forEach(c => c.classList.remove('selected'));

  try {
    sessionStorage.removeItem('pc_email');
    sessionStorage.removeItem('pc_token');
  } catch (e) {}

  resetOtpUi();
}

/* ============================================================
   EVENT LISTENERS
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  $('amountRequested').addEventListener('input', updateSummaryAmount);

  $('bankName').addEventListener('change', e => {
    $('otherBankField').classList.toggle('hidden', e.target.value !== 'Other');
  });

  document.querySelectorAll('.otp-digit').forEach((input, index) => {
    input.addEventListener('input', e => {
      const v = e.target.value.replace(/\D/g, '').slice(0, 1);
      e.target.value = v;
      e.target.classList.toggle('filled', Boolean(v));
      if (v) {
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
});
