/* ============================================================
   fa-config.js : Fixed Asset module configuration
   ============================================================ */

const FA_CONFIG = {

  moduleCode : "FA",
  moduleName : "Fixed Asset Number Request",
  appVersion : "v1.0.0",

  /* ---- Power Automate HTTP trigger URLs ---- */

  requestOtpUrl : "https://ca5fc5190790e573a9eafd8b611366.91.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/11/workflows/33f0420df9d24fa581047ade11d2030b/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=2oMHnIsXj9_3fZjUGbxUx8Urya24YvMGQsZgeVdiMZ4",

  verifyOtpUrl : "https://ca5fc5190790e573a9eafd8b611366.91.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/04/workflows/f6be59a13d4945efb46def390e9c78ca/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=z9sOqNYNyFxnlBceUtloiMg0xCEHqFTh5EX1Pm3RYGQ",

  masterDataUrl : "PASTE_FLOW_C_MASTER_DATA_URL",

  submitUrl : "PASTE_FLOW_D_SUBMIT_REQUEST_URL",

  /* ---- Access control ---- */

  allowedDomain : "cgc.com.my",

  /* ---- OTP behaviour ---- */

  otpLength : 6,
  otpValidSeconds : 60,
  resendCooldown : 60,
  sessionMinutes : 30,
  sessionKey : "fa_session",

  /* ---- Form options ---- */

  quantityOptions : [
    1,2,3,4,5,6,7,8,9,10,
    15,20,25,30,40,50,100
  ],

  maxAmount : 100000000

};
