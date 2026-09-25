/* ============================================================
   fa-ui.js : shared UI helpers for the Fixed Asset module
   ============================================================ */

const FA_UI = (function () {

  const SCREENS = ["faScreenEmail","faScreenOtp","faScreenForm","faScreenDone"];
  const STEP_MAP = { faScreenEmail:1, faScreenOtp:1, faScreenForm:2, faScreenDone:3 };

  function el(id){ return document.getElementById(id); }

  function loader(show, text){
    const box = el("faLoader");
    if (!box) return;
    el("faLoaderText").textContent = text || "Processing\u2026";
    box.classList.toggle("fa-hide", !show);
  }

  function message(boxId, type, text){
    const box = el(boxId);
    if (!box) return;
    if (!text){
      box.className = "fa-msg fa-hide";
      box.textContent = "";
      return;
    }
    box.className = "fa-msg fa-msg-" + type;
    box.textContent = text;
  }

  function clearMessages(){
    ["faEmailMsg","faOtpMsg","faFormMsg"].forEach(id => message(id, null, null));
  }

  function showScreen(name){
    SCREENS.forEach(id => {
      const node = el(id);
      if (node) node.classList.add("fa-hide");
    });
    const target = el(name);
    if (target) target.classList.remove("fa-hide");

    const active = STEP_MAP[name] || 1;
    document.querySelectorAll(".fa-step").forEach(step => {
      const n = parseInt(step.dataset.step, 10);
      step.classList.toggle("fa-step-active", n === active);
      step.classList.toggle("fa-step-done", n < active);
    });

    window.scrollTo({ top:0, behavior:"smooth" });
  }

  function markBad(id){
    const node = el(id);
    if (!node) return;
    node.classList.add("fa-bad");
    node.focus();
  }

  function clearBad(){
    document.querySelectorAll(".fa-bad").forEach(n => n.classList.remove("fa-bad"));
  }

  function fillSelect(id, items, valueKey, textKey){
    const sel = el(id);
    if (!sel) return;
    sel.innerHTML = '<option value="">\u2014 Select \u2014</option>';
    (items || []).forEach(item => {
      const opt = document.createElement("option");
      opt.value = item[valueKey];
      opt.textContent = item[valueKey] + " \u2014 " + item[textKey];
      sel.appendChild(opt);
    });
  }

  function fillNumberSelect(id, numbers){
    const sel = el(id);
    if (!sel) return;
    sel.innerHTML = '<option value="">\u2014 Select \u2014</option>';
    (numbers || []).forEach(n => {
      const opt = document.createElement("option");
      opt.value = n;
      opt.textContent = n;
      sel.appendChild(opt);
    });
  }

  function money(value){
    if (isNaN(value)) return "RM 0.00";
    return "RM " + Number(value).toLocaleString("en-MY", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function maskEmail(email){
    const parts = String(email).split("@");
    if (parts.length !== 2) return email;
    const name = parts[0];
    const shown = name.slice(0, 2);
    const stars = "*".repeat(Math.max(name.length - 2, 2));
    return shown + stars + "@" + parts[1];
  }

  return {
    el, loader, message, clearMessages, showScreen,
    markBad, clearBad, fillSelect, fillNumberSelect,
    money, maskEmail
  };

})();
