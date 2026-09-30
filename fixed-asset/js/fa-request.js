/* ============================================================
   fa-request.js : main controller for the Fixed Asset module
   ============================================================ */

const FA_REQUEST = (function () {

  const el = FA_UI.el;

  let currentEmail = "";
  let session = null;

  /* Asset class code -> { description, limit } */
  let classLimits = {};

  /* Full asset type list from Flow C, filtered per asset class */
  let masterAssetTypes = [];

  /* True when the selected asset class has no applicable asset type */
  let assetTypeNotApplicable = false;

  /* Requests submitted by the signed-in user */
  let myRequests = [];

  /* Value saved to SharePoint when asset type does not apply */
  const NOT_APPLICABLE_CODE = "N/A";

  /* Must match the Status choices in the FA_Requests list */
  const STATUS_LIST = ["Submitted", "Pending", "Approved", "Rejected"];

  const REQUIRED_FIELDS = [
    "faCategory",
    "faAssetDetails",
    "faAssetClass",
    "faAssetType",
    "faAmount",
    "faQuantity",
    "faLocation"
  ];

  const OTP_SENT_STATUSES = ["SUCCESS", "SENT", "OK", "CREATED"];

  const NOT_REGISTERED_STATUSES = ["UNAUTHORIZED", "NOT_FOUND", "NOTFOUND", "NO_USER"];

  /* ---------------- SAFE DOM HELPERS ----------------
     These skip silently when an element is not in the
     HTML, so one missing element never breaks the page.
     -------------------------------------------------- */

  function setText(id, text){
    const node = el(id);
    if (node) node.textContent = text;
  }

  function setValue(id, value){
    const node = el(id);
    if (node) node.value = value;
  }

  function toggleClass(id, cls, on){
    const node = el(id);
    if (node) node.classList.toggle(cls, on);
  }

  function onEvent(id, evt, handler){
    const node = el(id);
    if (node) node.addEventListener(evt, handler);
  }

  function summaryLabel(text){
    const box = el("faSummary");
    const span = box ? box.querySelector("span") : null;
    if (span) span.textContent = text;
  }

  /* ---------------- GENERAL HELPERS ---------------- */

  function activeEmail(){
    return (session && session.email) || currentEmail || "";
  }

  function statusOf(res){
    return String((res && res.status) || "").toUpperCase();
  }

  function resolveName(){
    const user = (session && session.user) || {};
    return (session && session.name) ||
           FA_OTP.getProfileName() ||
           user.name ||
           "";
  }

  function initials(name){
    const parts = String(name).trim().split(/\s+/);
    if (!parts.length || !parts[0]) return "?";
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  /* Prevents user-entered text from being rendered as HTML */
  function escapeHtml(value){
    return String(value === null || value === undefined ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatDate(iso){
    if (!iso) return "\u2014";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "\u2014";
    return d.toLocaleString("en-MY", {
      day    : "2-digit",
      month  : "short",
      year   : "numeric",
      hour   : "2-digit",
      minute : "2-digit"
    });
  }

  /* ============================================================
     ASSET TYPE FILTERING
     ============================================================ */

  function allowedClassesOf(assetType){

    const raw = assetType && assetType.allowedAssetClasses;
    if (!raw) return [];

    const list = Array.isArray(raw) ? raw : [raw];

    return list.map(function (a) {
      if (a && typeof a === "object") return String(a.Value || "").trim();
      return String(a || "").trim();
    }).filter(function (v) { return v !== ""; });
  }

  function hasDescription(assetType){
    return String((assetType && assetType.description) || "").trim() !== "";
  }

  function setAssetTypeEnabled(enabled){

    const sel = el("faAssetType");
    if (!sel) return;

    sel.disabled = !enabled;

    /* Hide the required asterisk when asset type does not apply */
    const star = document.querySelector('label[for="faAssetType"] .fa-required');
    if (star){
      star.style.display = (!enabled && assetTypeNotApplicable) ? "none" : "";
    }

    if (enabled){
      sel.style.background = "";
      sel.style.color = "";
      sel.style.cursor = "";
    } else {
      sel.style.background = "#eef1f5";
      sel.style.color = "#98a2b3";
      sel.style.cursor = "not-allowed";
      sel.classList.remove("fa-bad");
    }
  }

  function resetAssetTypes(){

    const sel = el("faAssetType");
    if (!sel) return;

    assetTypeNotApplicable = false;

    sel.innerHTML =
      '<option value="" selected disabled hidden>Select an asset class first</option>';

    setAssetTypeEnabled(false);
  }

  function filterAssetTypes(){

    const selectedClass = el("faAssetClass").value;
    const sel = el("faAssetType");

    if (!selectedClass){
      resetAssetTypes();
      return;
    }

    const filtered = masterAssetTypes
      .filter(function (t) {
        return allowedClassesOf(t).indexOf(String(selectedClass)) !== -1 &&
               hasDescription(t);
      })
      .map(function (t) {
        return { code: t.code, description: t.description };
      });

    if (!filtered.length){

      assetTypeNotApplicable = true;

      sel.innerHTML =
        '<option value="" selected>Not applicable for this asset class</option>';

      setAssetTypeEnabled(false);
      return;
    }

    assetTypeNotApplicable = false;

    FA_UI.fillSelect("faAssetType", filtered, "code", "description");
    setAssetTypeEnabled(true);
    sel.classList.remove("fa-bad");

    if (filtered.length === 1){
      sel.value = filtered[0].code;
    }
  }

  /* ============================================================
     ASSET CLASS LIMITS (per unit)
     ============================================================ */

  function toNumber(text){
    const m = String(text).trim().match(/^([\d.,]+)\s*([KkMm]?)$/);
    if (!m) return NaN;

    let n = parseFloat(m[1].replace(/,/g, ""));
    const unit = m[2].toUpperCase();

    if (unit === "K") n = n * 1000;
    if (unit === "M") n = n * 1000000;

    return n;
  }

  function parseLimit(description){

    const text = String(description || "")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");

    const bracket = text.match(/\(([^)]*)\)\s*$/);
    if (!bracket) return null;

    const t = bracket[1].replace(/\s+/g, "");
    let m;

    m = t.match(/^(<=|<|>=|>)(.+)$/);
    if (m){
      const v = toNumber(m[2]);
      if (isNaN(v)) return null;

      if (m[1] === "<=") return { max: v, maxInc: true };
      if (m[1] === "<")  return { max: v, maxInc: false };
      if (m[1] === ">=") return { min: v, minInc: true };
      return { min: v, minInc: false };
    }

    m = t.match(/^(.+?)-(.+)$/);
    if (m){
      const a = toNumber(m[1]);
      const b = toNumber(m[2]);
      if (isNaN(a) || isNaN(b)) return null;
      return { min: a, minInc: false, max: b, maxInc: true };
    }

    return null;
  }

  function describeLimit(limit){

    const parts = [];

    if (limit.min !== undefined){
      parts.push((limit.minInc ? "at least " : "above ") + FA_UI.money(limit.min));
    }

    if (limit.max !== undefined){
      parts.push((limit.maxInc ? "up to " : "below ") + FA_UI.money(limit.max));
    }

    return parts.join(" and ");
  }

  function limitError(){

    const code = el("faAssetClass").value;
    const amt  = parseFloat(el("faAmount").value);

    if (!code || isNaN(amt) || amt <= 0) return null;

    const entry = classLimits[code];
    if (!entry || !entry.limit) return null;

    const l = entry.limit;

    const tooLow =
      l.min !== undefined &&
      (l.minInc ? amt < l.min : amt <= l.min);

    const tooHigh =
      l.max !== undefined &&
      (l.maxInc ? amt > l.max : amt >= l.max);

    if (!tooLow && !tooHigh) return null;

    return "Amount per unit " + FA_UI.money(amt) +
           " is outside the limit for asset class " + code +
           " (" + describeLimit(l) + " per unit). " +
           "Please correct the amount or select the appropriate asset class.";
  }

  function checkLimitLive(){

    const err = limitError();

    if (err){
      el("faAmount").classList.add("fa-bad");
      el("faBtnSubmit").disabled = true;
      FA_UI.message("faFormMsg", "warn", err);
    } else {
      el("faBtnSubmit").disabled = false;
      const box = el("faFormMsg");
      if (box && box.classList.contains("fa-msg-warn") &&
          box.textContent.indexOf("Amount per unit") === 0){
        FA_UI.message("faFormMsg", null, null);
      }
    }
  }

  function calcTotal(){
    const qty = parseInt(el("faQuantity").value, 10);
    const amt = parseFloat(el("faAmount").value);

    if (isNaN(qty) || qty <= 0 || isNaN(amt) || amt <= 0){
      return { qty: qty, amt: amt, total: 0 };
    }

    return {
      qty   : qty,
      amt   : amt,
      total : Math.round(qty * amt * 100) / 100
    };
  }

  /* ============================================================
     MY REQUESTS
     Status is shown exactly as stored in the SharePoint
     Status column: Submitted, Pending, Approved, Rejected.
     ============================================================ */

  function rawStatus(status){
    return String(status === null || status === undefined ? "" : status).trim();
  }

  function statusClass(status){
    switch (rawStatus(status).toLowerCase()){
      case "submitted" : return "fa-st-submitted";
      case "pending"   : return "fa-st-pending";
      case "approved"  : return "fa-st-approved";
      case "rejected"  : return "fa-st-rejected";
      default          : return "fa-st-other";
    }
  }

  function switchTab(tab){

    const isNew = (tab === "new");

    toggleClass("faTabNew",  "fa-tab-active", isNew);
    toggleClass("faTabMine", "fa-tab-active", !isNew);

    toggleClass("faPanelNew",  "fa-hide", !isNew);
    toggleClass("faPanelMine", "fa-hide", isNew);

    if (!isNew){
      loadMyRequests(false);
    }
  }

  /* Each card counts only records whose Status matches exactly */
  function updateCounts(){

    const counts = {};
    STATUS_LIST.forEach(function (s) { counts[s] = 0; });

    myRequests.forEach(function (r) {
      const s = rawStatus(r.status);
      if (counts[s] !== undefined) counts[s]++;
    });

    STATUS_LIST.forEach(function (s) {
      setText("faCount" + s, counts[s]);
    });

    /* Tab badge is optional: skipped if not in the HTML */
    setText("faTabMineCount", myRequests.length);
    toggleClass("faTabMineCount", "fa-hide", myRequests.length === 0);
  }

  function metaItem(label, value){

    const shown =
      (value === "" || value === null || value === undefined) ? "\u2014" : value;

    return '<div><small>' + escapeHtml(label) + '</small><b>' +
           escapeHtml(shown) + '</b></div>';
  }

  function renderMyRequests(){

    const list = el("faReqList");
    if (!list) return;

    const searchBox = el("faReqSearch");
    const filterBox = el("faReqFilter");

    const search = String((searchBox && searchBox.value) || "").trim().toLowerCase();
    const filter = (filterBox && filterBox.value) || "";

    if (!myRequests.length){
      list.innerHTML =
        '<div class="fa-empty">You have not submitted any requests yet.</div>';
      return;
    }

    const rows = myRequests.filter(function (r) {

      const matchesSearch =
        !search ||
        String(r.requestNumber || "").toLowerCase().indexOf(search) !== -1 ||
        String(r.assetDetails  || "").toLowerCase().indexOf(search) !== -1;

      const matchesStatus =
        !filter || rawStatus(r.status) === filter;

      return matchesSearch && matchesStatus;
    });

    if (!rows.length){
      list.innerHTML =
        '<div class="fa-empty">No requests match your search or filter.</div>';
      return;
    }

    list.innerHTML = rows.map(function (r) {

      const status = rawStatus(r.status);

      const qty = parseInt(r.quantity, 10);
      const amt = parseFloat(r.amount);

      const qtyText = isNaN(qty) ? "" : String(qty);
      const amtText = isNaN(amt) ? "" : FA_UI.money(amt);

      let remark = "";

      if (r.remarks){
        remark = (status.toLowerCase() === "rejected")
          ? '<div class="fa-req-remark"><b>Reason:</b> ' + escapeHtml(r.remarks) + '</div>'
          : '<div class="fa-req-note"><b>Remarks:</b> ' + escapeHtml(r.remarks) + '</div>';
      }

      return '' +
        '<article class="fa-req-card">' +
          '<div class="fa-req-head">' +
            '<div>' +
              '<div class="fa-req-no">' + escapeHtml(r.requestNumber || "(pending)") + '</div>' +
              '<div class="fa-req-date">Submitted ' + escapeHtml(formatDate(r.submittedDate)) + '</div>' +
            '</div>' +
            (status
              ? '<span class="fa-badge-status ' + statusClass(status) + '">' + escapeHtml(status) + '</span>'
              : '') +
          '</div>' +
          (r.assetDetails
            ? '<div class="fa-req-desc">' + escapeHtml(r.assetDetails) + '</div>'
            : '') +
          '<div class="fa-req-meta">' +
            metaItem("Category",        r.requestCategory) +
            metaItem("Asset class",     r.assetClassCode) +
            metaItem("Asset type",      r.assetTypeCode) +
            metaItem("Quantity",        qtyText) +
            metaItem("Amount per unit", amtText) +
            metaItem("Location",        r.locationCode) +
          '</div>' +
          remark +
        '</article>';

    }).join("");
  }

  /* silent = true loads in the background without the loader */
  async function loadMyRequests(silent){

    const email = activeEmail();
    if (!email) return;

    if (!silent){
      FA_UI.loader(true, "Loading your requests\u2026");
      FA_UI.message("faListMsg", null, null);
    }

    try {

      const res = await FA_API.getMyRequests(email);

      myRequests = Array.isArray(res.requests) ? res.requests : [];

      updateCounts();
      renderMyRequests();

    } catch (e) {

      if (!silent){
        FA_UI.message("faListMsg", "error",
          "Unable to load your requests. " + e.message);
      }

    } finally {
      if (!silent){
        FA_UI.loader(false);
      }
    }
  }

  /* ---------------- STEP 1 : REQUEST OTP ---------------- */

  async function requestOtp(isResend){

    const email = isResend
      ? currentEmail
      : (el("faEmail").value || "").trim().toLowerCase();

    const target = isResend ? "faOtpMsg" : "faEmailMsg";

    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){
      return FA_UI.message(target, "error", "Please enter a valid email address.");
    }

    if (!email.endsWith("@" + FA_CONFIG.allowedDomain)){
      return FA_UI.message(target, "error",
        "Only @" + FA_CONFIG.allowedDomain + " email addresses are permitted.");
    }

    currentEmail = email;
    FA_UI.clearMessages();
    FA_UI.loader(true, "Sending verification code\u2026");

    try {

      const res = await FA_API.requestOtp(email);
      const status = statusOf(res);

      if (status === "LOCKED"){
        return FA_UI.message(target, "error",
          res.message || "This account is temporarily locked. Please try again later.");
      }

      if (NOT_REGISTERED_STATUSES.indexOf(status) !== -1){
        return FA_UI.message(target, "error",
          res.message || "This email address is not registered in the CGC directory.");
      }

      if (OTP_SENT_STATUSES.indexOf(status) === -1){
        return FA_UI.message(target, "error",
          res.message || "Unable to send the verification code. Please try again.");
      }

      FA_OTP.saveProfile(res.name || "", res.email || email);

      setText("faMaskedEmail", res.maskedEmail || FA_UI.maskEmail(email));

      FA_OTP.clearBoxes(false);

      FA_OTP.startExpiry(function () {
        FA_UI.message("faOtpMsg", "warn", "Your code has expired. Please request a new one.");
      });

      FA_OTP.startResendCooldown();

      el("faBtnVerify").disabled = false;

      FA_UI.showScreen("faScreenOtp");
      setTimeout(FA_OTP.focusFirst, 260);

      if (isResend){
        FA_UI.message("faOtpMsg", "ok", "A new verification code has been sent to your inbox.");
      }

    } catch (e) {
      FA_UI.message(target, "error", e.message);
    } finally {
      FA_UI.loader(false);
    }
  }

  /* ---------------- STEP 2 : VERIFY OTP ---------------- */

  async function verifyOtp(){

    const code = FA_OTP.getCode();

    if (code.length !== FA_CONFIG.otpLength){
      return FA_UI.message("faOtpMsg", "error",
        "Please enter all " + FA_CONFIG.otpLength + " digits.");
    }

    FA_UI.message("faOtpMsg", null, null);
    FA_UI.loader(true, "Verifying\u2026");

    try {

      const res = await FA_API.verifyOtp(currentEmail, code);
      const status = statusOf(res);

      if (status === "VALID" || status === "VERIFIED"){

        FA_OTP.stopTimers();

        const verifiedEmail = res.email || FA_OTP.getProfileEmail() || currentEmail;

        currentEmail = verifiedEmail;

        session = FA_OTP.saveSession({
          status : res.status,
          email  : verifiedEmail,
          name   : res.name || FA_OTP.getProfileName(),
          user   : res.user
        });

        await enterApp();

      } else if (status === "EXPIRED"){

        FA_OTP.clearBoxes(true);
        FA_UI.message("faOtpMsg", "warn",
          res.message || "This code has expired. Please request a new one.");

      } else if (status === "LOCKED"){

        FA_OTP.stopTimers();
        FA_OTP.clearBoxes(true);
        el("faBtnVerify").disabled = true;
        FA_UI.message("faOtpMsg", "error",
          res.message || "Too many incorrect attempts. Access has been locked.");

      } else if (status === "NO_CODE"){

        FA_OTP.clearBoxes(true);
        FA_UI.message("faOtpMsg", "warn",
          res.message || "No active code found. Please request a new one.");

      } else {

        FA_OTP.clearBoxes(true);

        const left = (res.attemptsLeft !== undefined && res.attemptsLeft !== null)
          ? " " + res.attemptsLeft + " attempt(s) remaining."
          : "";

        FA_UI.message("faOtpMsg", "error", "Incorrect verification code." + left);
      }

    } catch (e) {
      FA_UI.message("faOtpMsg", "error", e.message);
    } finally {
      FA_UI.loader(false);
    }
  }

  /* ---------------- STEP 3 : LOAD THE FORM ---------------- */

  async function enterApp(){

    FA_UI.loader(true, "Loading\u2026");

    try {

      const user = (session && session.user) || {};
      const displayEmail = activeEmail() || FA_OTP.getProfileEmail();
      const fullName = resolveName();

      if (fullName){
        setText("faUserName",  "Welcome, " + fullName);
        setText("faUserEmail", displayEmail);
        setText("faAvatar",    initials(fullName));
      } else {
        setText("faUserName",  "Welcome");
        setText("faUserEmail", displayEmail);
        setText("faAvatar",    displayEmail.charAt(0).toUpperCase());
      }

      setText("faUserDept", user.department || "\u2014");
      toggleClass("faBtnSignOut", "fa-hide", false);

      FA_UI.showScreen("faScreenForm");
      switchTab("new");

      const data = await FA_API.getMasterData(activeEmail());

      classLimits = {};
      (data.assetClasses || []).forEach(function (c) {
        classLimits[c.code] = {
          description : c.description,
          limit       : parseLimit(c.description)
        };
      });

      const assetClasses = (data.assetClasses || []).map(function (c) {
        return {
          code        : c.code,
          description : String(c.description || "")
                          .replace(/&lt;/g, "<")
                          .replace(/&gt;/g, ">")
        };
      });

      FA_UI.fillSelect("faAssetClass", assetClasses, "code", "description");

      masterAssetTypes = Array.isArray(data.assetTypes) ? data.assetTypes : [];
      resetAssetTypes();

      FA_UI.fillSelect("faLocation", data.locations, "code", "name");

      setValue("faAmount", "");
      setValue("faQuantity", "");
      updateTotal();
      el("faBtnSubmit").disabled = false;

    } catch (e) {
      FA_UI.message("faFormMsg", "error", "Unable to load the dropdown data. " + e.message);
    } finally {
      FA_UI.loader(false);
    }

    /* Load the request count in the background */
    loadMyRequests(true);
  }

  /* ---------------- STEP 4 : SUBMIT ---------------- */

  function readForm(){

    const t = calcTotal();

    return {
      requestCategory : el("faCategory").value,
      assetDetails    : el("faAssetDetails").value.trim(),
      assetClassCode  : el("faAssetClass").value,
      assetTypeCode   : assetTypeNotApplicable
                          ? NOT_APPLICABLE_CODE
                          : el("faAssetType").value,
      quantity        : parseInt(el("faQuantity").value, 10),
      amount          : parseFloat(el("faAmount").value),
      totalAmount     : t.total,
      locationCode    : el("faLocation").value
    };
  }

  function typeMatchesClass(classCode, typeCode){

    if (assetTypeNotApplicable) return true;
    if (!classCode || !typeCode) return true;

    const t = masterAssetTypes.filter(function (x) {
      return String(x.code) === String(typeCode);
    })[0];

    if (!t) return false;

    return allowedClassesOf(t).indexOf(String(classCode)) !== -1;
  }

  function validate(f){

    const amountEmpty   = String(el("faAmount").value || "").trim() === "";
    const quantityEmpty = String(el("faQuantity").value || "").trim() === "";
    const classLimitMsg = limitError();

    const rules = [

      ["faCategory",     !f.requestCategory,
        "Please select a request category."],

      ["faAssetDetails", !f.assetDetails,
        "Please enter the asset particulars."],

      ["faAssetClass",   !f.assetClassCode,
        "Please select an asset class."],

      ["faAssetType",    !assetTypeNotApplicable && !f.assetTypeCode,
        "Please select an asset type."],

      ["faAssetType",    !typeMatchesClass(f.assetClassCode, f.assetTypeCode),
        "The selected asset type is not valid for the selected asset class."],

      ["faAmount",       amountEmpty,
        "Please enter the amount per unit."],

      ["faAmount",       isNaN(f.amount) || f.amount <= 0,
        "Please enter a valid amount per unit greater than zero."],

      ["faAmount",       classLimitMsg !== null,
        classLimitMsg],

      ["faQuantity",     quantityEmpty,
        "Please enter the quantity."],

      ["faQuantity",     isNaN(f.quantity) || f.quantity <= 0,
        "Please enter a valid quantity greater than zero."],

      ["faQuantity",     !Number.isInteger(f.quantity),
        "Quantity must be a whole number."],

      ["faAmount",       f.totalAmount > FA_CONFIG.maxAmount,
        "The total amount exceeds the permitted limit."],

      ["faLocation",     !f.locationCode,
        "Please select a location."]

    ];

    FA_UI.clearBad();

    for (let i = 0; i < rules.length; i++){
      if (rules[i][1]){
        FA_UI.markBad(rules[i][0]);
        return rules[i][2];
      }
    }

    return null;
  }

  async function submitForm(e){

    e.preventDefault();
    FA_UI.message("faFormMsg", null, null);

    const form = readForm();
    const problem = validate(form);

    if (problem){
      return FA_UI.message("faFormMsg", "error", problem);
    }

    session = FA_OTP.getSession();

    if (!session){
      FA_UI.message("faFormMsg", "error",
        "Your session has expired. Please verify your email again.");
      return setTimeout(signOut, 2000);
    }

    const submitterEmail = activeEmail();

    if (!submitterEmail){
      FA_UI.message("faFormMsg", "error",
        "Your email could not be identified. Please verify your email again.");
      return setTimeout(signOut, 2000);
    }

    el("faBtnSubmit").disabled = true;
    FA_UI.loader(true, "Submitting your request\u2026");

    try {

      const res = await FA_API.submitRequest(submitterEmail, form);

      if (statusOf(res) === "INVALID_SESSION"){
        FA_UI.message("faFormMsg", "error",
          "Your session is no longer valid. Please verify your email again.");
        return setTimeout(signOut, 2000);
      }

      setText("faRefNo", res.requestNumber || "(pending)");
      FA_UI.showScreen("faScreenDone");

      /* Refresh the request list in the background */
      loadMyRequests(true);

    } catch (err) {
      FA_UI.message("faFormMsg", "error", err.message);
    } finally {
      el("faBtnSubmit").disabled = false;
      FA_UI.loader(false);
    }
  }

  /* ---------------- FORM HELPERS ---------------- */

  function updateTotal(){

    const t = calcTotal();

    setText("faTotal", FA_UI.money(t.total));

    if (t.total > 0){
      summaryLabel("Total amount (" + t.qty + " \u00d7 " + FA_UI.money(t.amt) + ")");
    } else {
      summaryLabel("Total amount");
    }
  }

  function resetTotals(){
    setValue("faAmount", "");
    setValue("faQuantity", "");
    setText("faCharCount", "0");
    setText("faTotal", "RM 0.00");
    summaryLabel("Total amount");
    el("faBtnSubmit").disabled = false;
  }

  function clearFormState(){

    el("faForm").reset();

    FA_UI.resetSelect("faAssetClass", "\u2014 Select \u2014");
    FA_UI.resetSelect("faLocation",   "\u2014 Select \u2014");
    resetAssetTypes();

    resetTotals();

    FA_UI.clearBad();
    FA_UI.message("faFormMsg", null, null);
  }

  function resetSelectionsOnly(){

    el("faForm").reset();

    ["faAssetClass", "faLocation"].forEach(function (id) {
      const sel = el(id);
      if (sel) sel.selectedIndex = 0;
    });

    resetAssetTypes();
    resetTotals();

    FA_UI.clearBad();
    FA_UI.message("faFormMsg", null, null);
  }

  function signOut(){

    FA_OTP.stopTimers();
    FA_OTP.clearSession();
    FA_OTP.clearProfile();

    session = null;
    currentEmail = "";
    classLimits = {};
    masterAssetTypes = [];
    myRequests = [];

    clearFormState();

    const list = el("faReqList");
    if (list) list.innerHTML = "";

    setValue("faReqSearch", "");
    setValue("faReqFilter", "");
    updateCounts();

    toggleClass("faTabNew",    "fa-tab-active", true);
    toggleClass("faTabMine",   "fa-tab-active", false);
    toggleClass("faPanelNew",  "fa-hide", false);
    toggleClass("faPanelMine", "fa-hide", true);

    setValue("faEmail", "");
    el("faBtnVerify").disabled = false;
    toggleClass("faBtnSignOut", "fa-hide", true);

    FA_UI.clearMessages();
    FA_UI.message("faListMsg", null, null);
    FA_UI.showScreen("faScreenEmail");
  }

  /* ---------------- INIT ---------------- */

  function init(){

    setText("faVersion", FA_CONFIG.appVersion);

    FA_OTP.bindBoxes(verifyOtp);

    /* OTP */
    onEvent("faBtnRequestOtp", "click", function () {
      requestOtp(false);
    });

    onEvent("faEmail", "keydown", function (e) {
      if (e.key === "Enter"){
        e.preventDefault();
        requestOtp(false);
      }
    });

    onEvent("faBtnVerify", "click", verifyOtp);

    onEvent("faBtnResend", "click", function () {
      requestOtp(true);
    });

    onEvent("faBtnChangeEmail", "click", signOut);
    onEvent("faBtnSignOut",     "click", signOut);

    /* Tabs */
    onEvent("faTabNew",  "click", function () { switchTab("new"); });
    onEvent("faTabMine", "click", function () { switchTab("mine"); });

    /* My requests toolbar */
    onEvent("faReqSearch",  "input",  renderMyRequests);
    onEvent("faReqFilter",  "change", renderMyRequests);
    onEvent("faBtnRefresh", "click",  function () {
      loadMyRequests(false);
    });

    /* Form */
    onEvent("faForm",     "submit", submitForm);
    onEvent("faBtnClear", "click",  resetSelectionsOnly);

    /* Success screen */
    onEvent("faBtnAnother", "click", function () {
      resetSelectionsOnly();
      FA_UI.showScreen("faScreenForm");
      switchTab("new");
    });

    onEvent("faBtnViewMine", "click", function () {
      resetSelectionsOnly();
      FA_UI.showScreen("faScreenForm");
      switchTab("mine");
    });

    onEvent("faAssetDetails", "input", function () {
      setText("faCharCount", this.value.length);
    });

    onEvent("faAmount",   "input", updateTotal);
    onEvent("faQuantity", "input", updateTotal);

    REQUIRED_FIELDS.forEach(function (id) {

      const node = el(id);
      if (!node) return;

      const evt = (node.tagName === "SELECT") ? "change" : "input";

      node.addEventListener(evt, function () {
        node.classList.remove("fa-bad");
        FA_UI.message("faFormMsg", null, null);
      });
    });

    onEvent("faAssetClass", "change", function () {
      filterAssetTypes();
      checkLimitLive();
    });

    onEvent("faAmount", "input", checkLimitLive);

    resetAssetTypes();

    session = FA_OTP.getSession();

    if (session){
      currentEmail = session.email || "";
      enterApp();
    } else {
      FA_UI.showScreen("faScreenEmail");
      const emailBox = el("faEmail");
      if (emailBox) emailBox.focus();
    }
  }

  return { init };

})();

document.addEventListener("DOMContentLoaded", FA_REQUEST.init);
