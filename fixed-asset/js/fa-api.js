/* ============================================================
   fa-api.js : all backend calls for the Fixed Asset module
   ============================================================ */

const FA_API = (function () {

  async function post(url, payload){

    if (!url || url.indexOf("PASTE_") === 0){
      throw new Error("This service is not configured yet. Please contact the Automation team.");
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

  function getMasterData(token){
    return post(FA_CONFIG.masterDataUrl, {
      moduleCode : FA_CONFIG.moduleCode,
      token      : token
    });
  }

  function submitRequest(token, form){
    return post(FA_CONFIG.submitUrl, {
      moduleCode      : FA_CONFIG.moduleCode,
      token           : token,
      requestCategory : form.requestCategory,
      assetDetails    : form.assetDetails,
      assetClassCode  : form.assetClassCode,
      assetTypeCode   : form.assetTypeCode,
      quantity        : form.quantity,
      amount          : form.amount,
      locationCode    : form.locationCode
    });
  }

  return { requestOtp, verifyOtp, getMasterData, submitRequest };

})();
