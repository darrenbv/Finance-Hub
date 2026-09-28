/* ============================================================
   fa-request.js : main controller for the Fixed Asset module
   ============================================================ */

const FA_REQUEST = (function () {

  const el = FA_UI.el;

  let currentEmail = "";
  let session = null;

  const REQUIRED_FIELDS = [
    "faCategory",
    "faAssetDetails",
    "faAssetClass",
    "faAssetType",
    "faQuantity",
    "faAmount",
    "faLocation"
  ];

  /* Statuses returned by PC_SendOTP that mean the code was sent. */
  const OTP_SENT_STATUSES = [
    "SUCCESS", "SENT", "OK", "CREATED"
  ];

  /* Statuses that mean the email is not a valid CGC account. */
  const NOT_REGISTERED_STATUSES = [
    "UNAUTHORIZED", "NOT_FOUND", "NOTFOUND", "NO_USER"
  ];

  /* Always resolves to a usable email address. */
  function activeEmail(){
    return (session && session.email) || currentEmail || "";
  }

  function statusOf(res){
    return String((res && res.status) || "").toUpperCase();
  }

  /* ---------------- STEP 1 : REQUEST OTP ---------------- */

  async function requestOtp(isResend){

    const email = isResend
      ? currentEmail
      : (el("faEmail").value || "").trim().toLowerCase();

    const target = isResend ? "faOtpMsg" : "faEmailMsg";

    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){
      return FA_UI.message(target, "error",
        "Please enter a valid email address.");
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

      /* Account temporarily locked. */
      if (status === "LOCKED"){
        return FA_UI.message(target, "error",
          res.message ||
          "This account is temporarily locked. Please try again later.");
      }

      /* Email is not a recognised CGC account. */
      if (NOT_REGISTERED_STATUSES.indexOf(status) !== -1){
        return FA_UI.message(target, "error",
          res.message ||
          "This email address is not registered in the CGC directory.");
      }

      /* Anything not explicitly a success is treated as a failure,
         so the OTP screen is never shown when no code was sent.  */
      if (OTP_SENT_STATUSES.indexOf(status) === -1){
        return FA_UI.message(target, "error",
          res.message ||
          "Unable to send the verification code. Please try again.");
      }

      /* ---- Success: show the OTP screen ---- */

      el("faMaskedEmail").textContent =
        res.maskedEmail || FA_UI.maskEmail(email);

      FA_OTP.clearBoxes(false);

      FA_OTP.startExpiry(function () {
        FA_UI.message("faOtpMsg", "warn",
          "Your code has expired. Please request a new one.");
      });

      FA_OTP.startResendCooldown();

      el("faBtnVerify").disabled = false;

      FA_UI.showScreen("faScreenOtp");
      setTimeout(FA_OTP.focusFirst, 260);

      if (isResend){
        FA_UI.message("faOtpMsg", "ok",
          "A new verification code has been sent to your inbox.");
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

        /* The flow returns email but no token, so the
           entered email is kept as the fallback.      */
        const verifiedEmail = res.email || currentEmail;

        currentEmail = verifiedEmail;

        session = FA_OTP.saveSession({
          status : res.status,
          email  : verifiedEmail,
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

        const left =
          (res.attemptsLeft !== undefined && res.attemptsLeft !== null)
            ? " " + res.attemptsLeft + " attempt(s) remaining."
            : "";

        FA_UI.message("faOtpMsg", "error",
          "Incorrect verification code." + left);
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
      const displayEmail = activeEmail();
      const displayName  = user.name || displayEmail;

      el("faUserName").textContent  = displayName;
      el("faUserEmail").textContent = displayEmail;
      el("faUserDept").textContent  = user.department || "\u2014";
      el("faAvatar").textContent    = displayName.charAt(0).toUpperCase();

      el("faBtnSignOut").classList.remove("fa-hide");

      FA_UI.showScreen("faScreenForm");

      /* No token is issued by the flow, so the verified
         email is sent as the caller identity.          */
      const data = await FA_API.getMasterData(activeEmail());

      FA_UI.fillSelect("faAssetClass", data.assetClasses, "code", "description");
      FA_UI.fillSelect("faAssetType",  data.assetTypes,  "code", "description");
      FA_UI.fillSelect("faLocation",   data.locations,   "code", "name");

      /* Quantity is a number input, not a dropdown. */
      el("faQuantity").value = "";

    } catch (e) {
      FA_UI.message("faFormMsg", "error",
        "Unable to load the dropdown data. " + e.message);
    } finally {
      FA_UI.loader(false);
    }
  }

  /* ---------------- STEP 4 : SUBMIT ---------------- */

  function readForm(){
    return {
      requestCategory : el("faCategory").value,
      assetDetails    : el("faAssetDetails").value.trim(),
      assetClassCode  : el("faAssetClass").value,
      assetTypeCode   : el("faAssetType").value,
      quantity        : parseInt(el("faQuantity").value, 10),
      amount          : parseFloat(el("faAmount").value),
      locationCode    : el("faLocation").value
    };
  }

  function validate(f){

    const quantityRaw = el("faQuantity").value;
    const amountRaw   = el("faAmount").value;

    const quantityEmpty =
      quantityRaw === null || String(quantityRaw).trim() === "";

    const amountEmpty =
      amountRaw === null || String(amountRaw).trim() === "";

    const rules = [

      ["faCategory",     !f.requestCategory,
        "Please select a request category."],

      ["faAssetDetails", !f.assetDetails,
        "Please enter the asset particulars."],

      ["faAssetClass",   !f.assetClassCode,
        "Please select an asset class."],

      ["faAssetType",    !f.assetTypeCode,
        "Please select an asset type."],

      ["faQuantity",     quantityEmpty,
        "Please enter the quantity."],

      ["faQuantity",     isNaN(f.quantity) || f.quantity <= 0,
        "Please enter a valid quantity greater than zero."],

      ["faQuantity",     !Number.isInteger(f.quantity),
        "Quantity must be a whole number."],

      ["faAmount",       amountEmpty,
        "Please enter the amount."],

      ["faAmount",       isNaN(f.amount) || f.amount <= 0,
        "Please enter a valid amount greater than zero."],

      ["faAmount",       f.amount > FA_CONFIG.maxAmount,
        "The amount entered exceeds the permitted limit."],

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

    /* 1. Validate first so incomplete fields never
          produce a session message.                */
    const form = readForm();
    const problem = validate(form);

    if (problem){
      return FA_UI.message("faFormMsg", "error", problem);
    }

    /* 2. Only then confirm the session. */
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

    const qty = parseInt(el("faQuantity").value, 10);
    const amt = parseFloat(el("faAmount").value);

    el("faTotal").textContent =
      (!isNaN(amt) && amt > 0) ? FA_UI.money(amt) : "RM 0.00";

    const label = el("faSummary").querySelector("span");

    if (!isNaN(qty) && qty > 0 && !isNaN(amt) && amt > 0){
      label.textContent =
        "Estimated Total (" + qty + " unit" + (qty > 1 ? "s" : "") + ")";
    } else {
      label.textContent = "Estimated Total";
    }
  }

  function clearFormState(){

    el("faForm").reset();

    FA_UI.resetSelect("faAssetClass", "\u2014 Select \u2014");
    FA_UI.resetSelect("faAssetType",  "\u2014 Select \u2014");
    FA_UI.resetSelect("faLocation",   "\u2014 Select \u2014");

    el("faQuantity").value = "";
    el("faAmount").value   = "";

    el("faCharCount").textContent = "0";
    el("faTotal").textContent = "RM 0.00";
    el("faSummary").querySelector("span").textContent = "Estimated Total";

    FA_UI.clearBad();
    FA_UI.message("faFormMsg", null, null);
  }

  function resetSelectionsOnly(){

    el("faForm").reset();

    ["faAssetClass","faAssetType","faLocation"].forEach(function (id) {
      const sel = el(id);
      if (sel) sel.selectedIndex = 0;
    });

    el("faQuantity").value = "";
    el("faAmount").value   = "";

    el("faCharCount").textContent = "0";
    el("faTotal").textContent = "RM 0.00";
    el("faSummary").querySelector("span").textContent = "Estimated Total";

    FA_UI.clearBad();
    FA_UI.message("faFormMsg", null, null);
  }

  function signOut(){

    FA_OTP.stopTimers();
    FA_OTP.clearSession();

    session = null;
    currentEmail = "";

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

    /* Quantity is a number input, so "input" also fires
       when the spinner arrows are used.                */
    el("faQuantity").addEventListener("input", updateTotal);
    el("faAmount").addEventListener("input", updateTotal);

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
