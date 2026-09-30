/* ============================================================
   fa-api.js : all backend calls for the Fixed Asset module
   ============================================================ */

const FA_API = (function () {

  async function post(url, payload){

    if (!url || url.indexOf("PASTE_") === 0){
      throw new Error(
        "This service is not configured yet. Please contact the Automation team."
      );
    }

    let response;

    try {
      response = await fetch(url, {
        method  : "POST",
        headers : { "Content-Type": "application/json" },
        body    : JSON.stringify(payload || {})
      });
    } catch (e) {
      throw new Error("Network error. Please check your connection and try again.");
    }

    const text = await response.text();

    let data;

    try {
      data = text ? JSON.parse(text) : {};
    } catch (e) {
      throw new Error("Unexpected response received from the server.");
    }

    if (!response.ok && !data.status){
      throw new Error(data.message || ("Request failed (" + response.status + ")"));
    }

    return data;
  }

  /* ---------------- OTP ---------------- */

  function requestOtp(email){
    return post(FA_CONFIG.requestOtpUrl, {
      moduleCode : FA_CONFIG.moduleCode,
      action     : "request",
      email      : email
    });
  }

  function verifyOtp(email, code){
    return post(FA_CONFIG.verifyOtpUrl, {
      moduleCode : FA_CONFIG.moduleCode,
      action     : "verify",
      email      : email,
      code       : code
    });
  }

  /* ---------------- MASTER DATA ---------------- */

  function getMasterData(email){
    return post(FA_CONFIG.masterDataUrl, {
      moduleCode : FA_CONFIG.moduleCode,
      email      : email
    });
  }

  /* ---------------- SUBMIT ----------------
     The BCA file is sent as base64 text.
     hasBca = false when no file was uploaded.
     ---------------------------------------- */

  function submitRequest(email, form){
    return post(FA_CONFIG.submitUrl, {
      moduleCode      : FA_CONFIG.moduleCode,
      email           : email,
      requestCategory : form.requestCategory,
      assetDetails    : form.assetDetails,
      assetClassCode  : form.assetClassCode,
      assetTypeCode   : form.assetTypeCode,
      quantity        : form.quantity,
      amount          : form.amount,
      totalAmount     : form.totalAmount,
      locationCode    : form.locationCode,

      hasBca          : !!form.bcaFileContent,
      bcaFileName     : form.bcaFileName    || "",
      bcaContentType  : form.bcaContentType || "",
      bcaFileContent  : form.bcaFileContent || ""
    });
  }

  /* ---------------- MY REQUESTS ---------------- */

  function getMyRequests(email){
    return post(FA_CONFIG.myRequestsUrl, {
      moduleCode : FA_CONFIG.moduleCode,
      action     : "myRequests",
      email      : email
    });
  }

  return {
    requestOtp,
    verifyOtp,
    getMasterData,
    submitRequest,
    getMyRequests
  };

})();
