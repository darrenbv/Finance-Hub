/* ============================================================
   fa-request.js : main controller for the Fixed Asset module
   ============================================================ */

const FA_REQUEST = (function () {

  const el = FA_UI.el;
  let currentEmail = "";
  let session = null;

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

      if (res.status === "LOCKED"){
        return FA_UI.message(target, "error",
          res.message || "This account is temporarily locked. Please try again later.");
      }
      if (res.status === "NOT_FOUND"){
        return FA_UI.message(target, "error",
          res.message || "This email address is not registered for this service.");
      }

      el("faMaskedEmail").textContent = res.maskedEmail || FA_UI.maskEmail(email);

      FA_OTP.clearBoxes(false);
      FA_OTP.startExpiry(function () {
        FA_UI.message("faOtpMsg", "warn", "Your code has expired. Please request a new one.");
      });
      FA_OTP.startResendCooldown();

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

      if (
    res.status === "VALID" ||
    res.status === "verified"
){
        FA_OTP.stopTimers();
        session = FA_OTP.saveSession(res);
        await enterApp();

      } else if (res.status === "EXPIRED"){
        FA_OTP.clearBoxes(true);
        FA_UI.message("faOtpMsg", "warn",
          res.message || "This code has expired. Please request a new one.");

      } else if (res.status === "LOCKED"){
        FA_OTP.stopTimers();
        FA_OTP.clearBoxes(true);
        el("faBtnVerify").disabled = true;
        FA_UI.message("faOtpMsg", "error",
          res.message || "Too many incorrect attempts. Access has been locked.");

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
      const displayName = user.name || currentEmail;

      el("faUserName").textContent  = displayName;
      el("faUserEmail").textContent = user.email || currentEmail;
      el("faUserDept").textContent  = user.department || "\u2014";
      el("faAvatar").textContent    = displayName.charAt(0).toUpperCase();
      el("faBtnSignOut").classList.remove("fa-hide");

      FA_UI.showScreen("faScreenForm");

      const data = await FA_API.getMasterData(session.token);
      FA_UI.fillSelect("faAssetClass", data.assetClasses, "code", "description");
      FA_UI.fillSelect("faAssetType",  data.assetTypes,  "code", "description");
      FA_UI.fillSelect("faLocation",   data.locations,   "code", "name");
      FA_UI.fillNumberSelect("faQuantity", FA_CONFIG.quantityOptions);

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
    const rules = [
      ["faCategory",     !f.requestCategory,                 "Please select a request category."],
      ["faAssetDetails", !f.assetDetails,                    "Please enter the asset particulars."],
      ["faAssetClass",   !f.assetClassCode,                  "Please select an asset class."],
      ["faAssetType",    !f.assetTypeCode,                   "Please select an asset type."],
      ["faQuantity",     !f.quantity,                        "Please select a quantity."],
      ["faAmount",       isNaN(f.amount) || f.amount <= 0,   "Please enter a valid amount."],
      ["faAmount",       f.amount > FA_CONFIG.maxAmount,     "The amount entered exceeds the permitted limit."],
      ["faLocation",     !f.locationCode,                    "Please select a location."]
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

    session = FA_OTP.getSession();
    if (!session){
      FA_UI.message("faFormMsg", "error",
        "Your session has expired. Please verify your email again.");
      return setTimeout(signOut, 2000);
    }

    const form = readForm();
    const problem = validate(form);
    if (problem){
      return FA_UI.message("faFormMsg", "error", problem);
    }

    el("faBtnSubmit").disabled = true;
    FA_UI.loader(true, "Submitting your request\u2026");

    try {
      const res = await FA_API.submitRequest(session.token, form);

      if (res.status === "INVALID_SESSION"){
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
    el("faTotal").textContent = (!isNaN(amt) && amt > 0) ? FA_UI.money(amt) : "RM 0.00";
    if (!isNaN(qty) && !isNaN(amt) && amt > 0){
      el("faSummary").querySelector("span").textContent =
        "Estimated Total (" + qty + " unit" + (qty > 1 ? "s" : "") + ")";
    }
  }

  function signOut(){
    FA_OTP.stopTimers();
    FA_OTP.clearSession();
    session = null;
    currentEmail = "";

    el("faForm").reset();
    el("faEmail").value = "";
    el("faBtnVerify").disabled = false;
    el("faBtnSignOut").classList.add("fa-hide");
    el("faCharCount").textContent = "0";
    el("faTotal").textContent = "RM 0.00";

    FA_UI.clearMessages();
    FA_UI.clearBad();
    FA_UI.showScreen("faScreenEmail");
  }

  /* ---------------- INIT ---------------- */

  function init(){

    el("faVersion").textContent = FA_CONFIG.appVersion;

    FA_OTP.bindBoxes(verifyOtp);

    el("faBtnRequestOtp").addEventListener("click", function () { requestOtp(false); });
    el("faEmail").addEventListener("keydown", function (e) {
      if (e.key === "Enter"){ e.preventDefault(); requestOtp(false); }
    });

    el("faBtnVerify").addEventListener("click", verifyOtp);
    el("faBtnResend").addEventListener("click", function () { requestOtp(true); });
    el("faBtnChangeEmail").addEventListener("click", signOut);
    el("faBtnSignOut").addEventListener("click", signOut);

    el("faForm").addEventListener("submit", submitForm);
    el("faBtnClear").addEventListener("click", function () {
      el("faForm").reset();
      el("faCharCount").textContent = "0";
      el("faTotal").textContent = "RM 0.00";
      FA_UI.clearBad();
      FA_UI.message("faFormMsg", null, null);
    });

    el("faBtnAnother").addEventListener("click", function () {
      el("faForm").reset();
      el("faCharCount").textContent = "0";
      el("faTotal").textContent = "RM 0.00";
      FA_UI.clearBad();
      FA_UI.message("faFormMsg", null, null);
      FA_UI.showScreen("faScreenForm");
    });

    el("faAssetDetails").addEventListener("input", function () {
      el("faCharCount").textContent = this.value.length;
    });

    el("faQuantity").addEventListener("change", updateTotal);
    el("faAmount").addEventListener("input", updateTotal);

    session = FA_OTP.getSession();
    if (session){
      enterApp();
    } else {
      FA_UI.showScreen("faScreenEmail");
      el("faEmail").focus();
    }
  }

  return { init };

})();

document.addEventListener("DOMContentLoaded", FA_REQUEST.init);
