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

  /* ============================================================
     ASSET TYPE FILTERING
     AllowedAssetClasses comes from SharePoint as:
       [ { "Id": 2, "Value": "1020" }, ... ]
     Plain strings are also accepted as a fallback.
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

  function resetAssetTypes(){

    const sel = el("faAssetType");
    if (!sel) return;

    sel.innerHTML =
      '<option value="" selected disabled hidden>Select an asset class first</option>';

    sel.disabled = true;
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
        return allowedClassesOf(t).indexOf(String(selectedClass)) !== -1;
      })
      .map(function (t) {
        return {
          code        : t.code,
          description : t.description || t.code
        };
      });

    if (!filtered.length){
      sel.innerHTML =
        '<option value="" selected disabled hidden>No asset type available for this class</option>';
      sel.disabled = true;
      FA_UI.message("faFormMsg", "warn",
        "No asset type is configured for asset class " + selectedClass +
        ". Please contact Finance.");
      return;
    }

    sel.disabled = false;
    sel.classList.remove("fa-bad");

    FA_UI.fillSelect("faAssetType", filtered, "code", "description");

    /* Auto-select when only one asset type applies (e.g. 3000 -> RENO) */
    if (filtered.length === 1){
      sel.value = filtered[0].code;
    }
  }

  /* ============================================================
     ASSET CLASS LIMITS (per unit)
     Read from the bracket at the end of the class description:
       (<=1.3K)   -> up to 1,300
       (1.3K-5K)  -> above 1,300 and up to 5,000
       (>150K)    -> above 150,000
       no bracket -> no limit
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

    /* Flow C may return &lt; / &gt; instead of < / > */
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

    /* Bracket text that is not a limit, e.g. "(IA)" */
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

  /* Total = amount per unit x quantity */
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

      el("faMaskedEmail").textContent = res.maskedEmail || FA_UI.maskEmail(email);

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
        el("faUserName").textContent  = "Welcome, " + fullName;
        el("faUserEmail").textContent = displayEmail;
        el("faAvatar").textContent    = initials(fullName);
      } else {
        el("faUserName").textContent  = "Welcome";
        el("faUserEmail").textContent = displayEmail;
        el("faAvatar").textContent    = displayEmail.charAt(0).toUpperCase();
      }

      el("faUserDept").textContent = user.department || "\u2014";
      el("faBtnSignOut").classList.remove("fa-hide");

      FA_UI.showScreen("faScreenForm");

      const data = await FA_API.getMasterData(activeEmail());

      /* Limit table from the class descriptions */
      classLimits = {};
      (data.assetClasses || []).forEach(function (c) {
        classLimits[c.code] = {
          description : c.description,
          limit       : parseLimit(c.description)
        };
      });

      /* Decode &lt; / &gt; so the dropdown shows < and > */
      const assetClasses = (data.assetClasses || []).map(function (c) {
        return {
          code        : c.code,
          description : String(c.description || "")
                          .replace(/&lt;/g, "<")
                          .replace(/&gt;/g, ">")
        };
      });

      FA_UI.fillSelect("faAssetClass", assetClasses, "code", "description");

      /* Asset types are held in memory and filtered on class change */
      masterAssetTypes = Array.isArray(data.assetTypes) ? data.assetTypes : [];
      resetAssetTypes();

      FA_UI.fillSelect("faLocation", data.locations, "code", "name");

      el("faAmount").value   = "";
      el("faQuantity").value = "";
      updateTotal();
      el("faBtnSubmit").disabled = false;

    } catch (e) {
      FA_UI.message("faFormMsg", "error", "Unable to load the dropdown data. " + e.message);
    } finally {
      FA_UI.loader(false);
    }
  }

  /* ---------------- STEP 4 : SUBMIT ---------------- */

  function readForm(){

    const t = calcTotal();

    return {
      requestCategory : el("faCategory").value,
      assetDetails    : el("faAssetDetails").value.trim(),
      assetClassCode  : el("faAssetClass").value,
      assetTypeCode   : el("faAssetType").value,
      quantity        : parseInt(el("faQuantity").value, 10),
      amount          : parseFloat(el("faAmount").value),
      totalAmount     : t.total,
      locationCode    : el("faLocation").value
    };
  }

  /* Confirms the chosen type is valid for the chosen class */
  function typeMatchesClass(classCode, typeCode){

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

      ["faAssetType",    !f.assetTypeCode,
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

      el("faRefNo").textContent = res.requestNumber || "(pending)";
      FA_UI.showScreen("faScreenDone");

    } catch (err) {
      FA_UI.message("faFormMsg", "error", err.message);
    } finally {
      el("faBtnSubmit").disabled = false;
      FA_UI.loader(false);
    }
  }

  /* ---------------- HELPERS ---------------- */

  function updateTotal(){

    const t = calcTotal();
    const label = el("faSummary").querySelector("span");

    el("faTotal").textContent = FA_UI.money(t.total);

    if (t.total > 0){
      label.textContent =
        "Total amount (" + t.qty + " \u00d7 " + FA_UI.money(t.amt) + ")";
    } else {
      label.textContent = "Total amount";
    }
  }

  function resetTotals(){
    el("faAmount").value   = "";
    el("faQuantity").value = "";
    el("faCharCount").textContent = "0";
    el("faTotal").textContent = "RM 0.00";
    el("faSummary").querySelector("span").textContent = "Total amount";
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

    clearFormState();

    el("faEmail").value = "";
    el("faBtnVerify").disabled = false;
    el("faBtnSignOut").classList.add("fa-hide");

    FA_UI.clearMessages();
    FA_UI.showScreen("faScreenEmail");
  }

  /* ---------------- INIT ---------------- */

  function init(){

    el("faVersion").textContent = FA_CONFIG.appVersion;

    FA_OTP.bindBoxes(verifyOtp);

    el("faBtnRequestOtp").addEventListener("click", function () {
      requestOtp(false);
    });

    el("faEmail").addEventListener("keydown", function (e) {
      if (e.key === "Enter"){
        e.preventDefault();
        requestOtp(false);
      }
    });

    el("faBtnVerify").addEventListener("click", verifyOtp);

    el("faBtnResend").addEventListener("click", function () {
      requestOtp(true);
    });

    el("faBtnChangeEmail").addEventListener("click", signOut);
    el("faBtnSignOut").addEventListener("click", signOut);

    el("faForm").addEventListener("submit", submitForm);

    el("faBtnClear").addEventListener("click", resetSelectionsOnly);

    el("faBtnAnother").addEventListener("click", function () {
      resetSelectionsOnly();
      FA_UI.showScreen("faScreenForm");
    });

    el("faAssetDetails").addEventListener("input", function () {
      el("faCharCount").textContent = this.value.length;
    });

    el("faAmount").addEventListener("input", updateTotal);
    el("faQuantity").addEventListener("input", updateTotal);

    /* Clear the red highlight once a field is corrected */
    REQUIRED_FIELDS.forEach(function (id) {

      const node = el(id);
      if (!node) return;

      const evt = (node.tagName === "SELECT") ? "change" : "input";

      node.addEventListener(evt, function () {
        node.classList.remove("fa-bad");
        FA_UI.message("faFormMsg", null, null);
      });
    });

    /* Registered after the listeners above so their
       messages are not wiped by the highlight reset. */
    el("faAssetClass").addEventListener("change", function () {
      filterAssetTypes();
      checkLimitLive();
    });

    el("faAmount").addEventListener("input", checkLimitLive);

    resetAssetTypes();

    session = FA_OTP.getSession();

    if (session){
      currentEmail = session.email || "";
      enterApp();
    } else {
      FA_UI.showScreen("faScreenEmail");
      el("faEmail").focus();
    }
  }

  return { init };

})();

document.addEventListener("DOMContentLoaded", FA_REQUEST.init);
