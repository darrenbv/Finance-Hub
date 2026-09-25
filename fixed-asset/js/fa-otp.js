/* ============================================================
   fa-otp.js : OTP input behaviour, timers and session handling
   ============================================================ */

const FA_OTP = (function () {

  let boxes = [];
  let expiryTimer = null;
  let resendTimer = null;

  /* ---------------- SESSION ---------------- */

  function saveSession(data){
    const session = {
      token   : data.token,
      user    : data.user || {},
      expires : Date.now() + (FA_CONFIG.sessionMinutes * 60000)
    };
    sessionStorage.setItem(FA_CONFIG.sessionKey, JSON.stringify(session));
    return session;
  }

  function getSession(){
    const raw = sessionStorage.getItem(FA_CONFIG.sessionKey);
    if (!raw) return null;
    try {
      const session = JSON.parse(raw);
      if (!session.token || Date.now() > session.expires){
        clearSession();
        return null;
      }
      return session;
    } catch (e) {
      clearSession();
      return null;
    }
  }

  function clearSession(){
    sessionStorage.removeItem(FA_CONFIG.sessionKey);
  }

  /* ---------------- INPUT BEHAVIOUR ---------------- */

  function bindBoxes(onComplete){
    boxes = Array.prototype.slice.call(document.querySelectorAll(".fa-otp-box"));

    boxes.forEach(function (box, i) {

      box.addEventListener("input", function () {
        box.value = box.value.replace(/\D/g, "");
        box.classList.toggle("fa-filled", box.value !== "");
        box.classList.remove("fa-bad");
        if (box.value && i < boxes.length - 1) boxes[i + 1].focus();
        if (getCode().length === FA_CONFIG.otpLength && typeof onComplete === "function"){
          onComplete();
        }
      });

      box.addEventListener("keydown", function (e) {
        if (e.key === "Backspace" && !box.value && i > 0) boxes[i - 1].focus();
        if (e.key === "ArrowLeft"  && i > 0) boxes[i - 1].focus();
        if (e.key === "ArrowRight" && i < boxes.length - 1) boxes[i + 1].focus();
      });

      box.addEventListener("focus", function () { box.select(); });

      box.addEventListener("paste", function (e) {
        e.preventDefault();
        const digits = (e.clipboardData.getData("text") || "").replace(/\D/g, "");
        if (!digits) return;
        digits.split("").slice(0, boxes.length).forEach(function (d, k) {
          boxes[k].value = d;
          boxes[k].classList.add("fa-filled");
          boxes[k].classList.remove("fa-bad");
        });
        const last = Math.min(digits.length, boxes.length) - 1;
        if (last >= 0) boxes[last].focus();
        if (getCode().length === FA_CONFIG.otpLength && typeof onComplete === "function"){
          onComplete();
        }
      });

    });
  }

  function getCode(){
    return boxes.map(function (b) { return b.value; }).join("");
  }

  function focusFirst(){
    if (boxes.length) boxes[0].focus();
  }

  function clearBoxes(markInvalid){
    boxes.forEach(function (b) {
      b.value = "";
      b.classList.remove("fa-filled");
      if (markInvalid){
        b.classList.add("fa-bad");
        setTimeout(function () { b.classList.remove("fa-bad"); }, 520);
      }
    });
    focusFirst();
  }

  /* ---------------- TIMERS ---------------- */

  function startExpiry(onExpire){
    clearInterval(expiryTimer);
    let left = FA_CONFIG.otpValidSeconds;

    const label = document.getElementById("faTimer");
    const wrap  = document.getElementById("faCountdown");
    if (wrap) wrap.classList.remove("fa-expired");

    function tick(){
      const m = String(Math.floor(left / 60)).padStart(2, "0");
      const s = String(left % 60).padStart(2, "0");
      if (label) label.textContent = m + ":" + s;
      if (left <= 0){
        clearInterval(expiryTimer);
        if (wrap) wrap.classList.add("fa-expired");
        if (typeof onExpire === "function") onExpire();
        return;
      }
      left--;
    }

    tick();
    expiryTimer = setInterval(tick, 1000);
  }

  function startResendCooldown(){
    clearInterval(resendTimer);
    let left = FA_CONFIG.resendCooldown;

    const btn   = document.getElementById("faBtnResend");
    const label = document.getElementById("faResendTimer");
    if (!btn) return;

    btn.disabled = true;
    btn.innerHTML = 'Resend code (<span id="faResendTimer">' + left + '</span>s)';

    resendTimer = setInterval(function () {
      left--;
      const span = document.getElementById("faResendTimer");
      if (span) span.textContent = left;
      if (left <= 0){
        clearInterval(resendTimer);
        btn.disabled = false;
        btn.textContent = "Resend code";
      }
    }, 1000);
  }

  function stopTimers(){
    clearInterval(expiryTimer);
    clearInterval(resendTimer);
  }

  return {
    bindBoxes, getCode, clearBoxes, focusFirst,
    startExpiry, startResendCooldown, stopTimers,
    saveSession, getSession, clearSession
  };

})();
