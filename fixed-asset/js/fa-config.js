/* ============================================================
   fa-config.js : Fixed Asset module configuration
   Fill in the four flow URLs after the flows are built.
   No secrets may be placed in this file.
   ============================================================ */

const FA_CONFIG = {

  moduleCode : "FA",
  moduleName : "Fixed Asset Number Request",
  appVersion : "v1.0.0",

  /* ---- Power Automate HTTP trigger URLs ---- */
  requestOtpUrl  : "PASTE_FLOW_A_REQUEST_OTP_URL",
  verifyOtpUrl   : "PASTE_FLOW_B_VERIFY_OTP_URL",
  masterDataUrl  : "PASTE_FLOW_C_MASTER_DATA_URL",
  submitUrl      : "PASTE_FLOW_D_SUBMIT_REQUEST_URL",

  /* ---- Access control ---- */
  allowedDomain  : "cgc.com.my",

  /* ---- OTP behaviour (must match the flow) ---- */
  otpLength       : 6,
  otpValidSeconds : 300,
  resendCooldown  : 60,
  sessionMinutes  : 30,
  sessionKey      : "fa_session",

  /* ---- Form options ---- */
  quantityOptions : [1,2,3,4,5,6,7,8,9,10,15,20,25,30,40,50,100],
  maxAmount       : 100000000
};
