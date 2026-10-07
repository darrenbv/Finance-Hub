/* ============================================================
   pc-config.js : Petty Cash module configuration
   ============================================================ */
const PC_CONFIG = {
  moduleCode : "PC",
  moduleName : "Petty Cash Request",
  appVersion : "v1.0.0",

  /* ---- Power Automate HTTP trigger URLs ---- */
  requestOtpUrl : "https://ca5fc5190790e573a9eafd8b611366.91.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/11/workflows/33f0420df9d24fa581047ade11d2030b/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=2oMHnIsXj9_3fZjUGbxUx8Urya24YvMGQsZgeVdiMZ4",
  verifyOtpUrl  : "https://ca5fc5190790e573a9eafd8b611366.91.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/04/workflows/f6be59a13d4945efb46def390e9c78ca/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=z9sOqNYNyFxnlBceUtloiMg0xCEHqFTh5EX1Pm3RYGQ",

  /* Paste the revised PC_SubmitRequest URL here when the flow is ready */
  submitUrl     : "",

  /* ---- Access control ---- */
  allowedDomain : "cgc.com.my",

  /* ---- OTP behaviour (must match the flows) ---- */
  otpLength       : 6,
  otpValidSeconds : 60,
  resendCooldown  : 30,
  sessionMinutes  : 30,
  sessionKey      : "pc_session",

  /* ---- Uploads ---- */
  maxUploadMB       : 10,
  allowedExtensions : ["pdf", "doc", "docx", "xls", "xlsx", "jpg", "jpeg", "png"]
};
