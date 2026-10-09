/* ============================================================
   pc-app.js : Petty Cash module controller
   Same patterns as the Fixed Asset module (FA_UI / FA_OTP)
   ============================================================ */
const PC = (function () {

  /* ---------------- GL MASTER (temporary, move to SharePoint later) ---------------- */
  const GL_MASTER = [
    { scope:"HQ",     costCentre:"C110030000", glCode:"64041050", description:"Auditing/Taxation/Secretarial",         expenseType:"Stamping fees",                                                   opexClass:"Admin & General" },
    { scope:"HQ",     costCentre:"C130010000", glCode:"64063020", description:"Contingencies",                         expenseType:"Miscellaneous (penalty, levy, etc.)",                            opexClass:"Admin & General" },
    { scope:"Both",   costCentre:"C140024000", glCode:"61025020", description:"Staff Entertainment and Refreshment",   expenseType:"Office or branch refreshment, meeting F&B and pantry supplies",  opexClass:"Personnel Costs" },
    { scope:"Both",   costCentre:"C140024000", glCode:"62011010", description:"Rental, Quit Rent & Assessment",        expenseType:"Signage for CGC building or branches",                           opexClass:"Establishment" },
    { scope:"HQ",     costCentre:"C140024000", glCode:"62021010", description:"Repairs & Maintenance",                 expenseType:"Air conditioning (monthly services)",                            opexClass:"Establishment" },
    { scope:"Both",   costCentre:"C140024000", glCode:"62021060", description:"Repairs & Maintenance",                 expenseType:"Ad hoc HQ repair works or branch office upkeep",                 opexClass:"Establishment" },
    { scope:"Branch", costCentre:"",           glCode:"62021050", description:"Repairs & Maintenance",                 expenseType:"Fire extinguisher maintenance and services",                     opexClass:"Establishment" },
    { scope:"Branch", costCentre:"",           glCode:"64011010", description:"Electricity & Water",                   expenseType:"Electricity (branches)",                                         opexClass:"Admin & General" },
    { scope:"Branch", costCentre:"",           glCode:"64011020", description:"Electricity & Water",                   expenseType:"Water and sewerage (branches)",                                  opexClass:"Admin & General" },
    { scope:"Branch", costCentre:"",           glCode:"64013010", description:"Telephone & Fax",                       expenseType:"Telephone and fax (branches)",                                   opexClass:"Admin & General" },
    { scope:"Branch", costCentre:"",           glCode:"64021010", description:"Postage",                               expenseType:"Courier and others",                                             opexClass:"Admin & General" },
    { scope:"Both",   costCentre:"C140024000", glCode:"64022020", description:"Printing & Stationery",                 expenseType:"Printing and stationery",                                        opexClass:"Admin & General" },
    { scope:"Branch", costCentre:"",           glCode:"64061010", description:"Library Books, Periodicals, Newspaper", expenseType:"Newspaper and magazine subscriptions",                           opexClass:"Admin & General" },
    { scope:"HQ",     costCentre:"C140024000", glCode:"64081030", description:"Security, Cleaning & Landscaping",      expenseType:"Office cleaning (miscellaneous)",                                opexClass:"Admin & General" },
    { scope:"Both",   costCentre:"C140024000", glCode:"64081040", description:"Security, Cleaning & Landscaping",      expenseType:"Consumables (kitchen utensils and others)",                      opexClass:"Admin & General" },
    { scope:"HQ",     costCentre:"C140024000", glCode:"65017020", description:"Directors' Others",                     expenseType:"Directors refreshments (F&B for Board members)",                 opexClass:"BOD Expenses" },
    { scope:"HQ",     costCentre:"C150020000", glCode:"64031010", description:"Legal Fees",                            expenseType:"Legal fees",                                                     opexClass:"Admin & General" },
    { scope:"Branch", costCentre:"",           glCode:"61027030", description:"Staff Recreation & Amenities",          expenseType:"Town Hall",                                                      opexClass:"Personnel Costs" }
  ];

  const SECTIONS = ["Requestor", "Request", "Budget & GL", "Payment", "Approvals", "Documents", "Review"];
  const SCREENS  = ["pcScreenEmail", "pcScreenOtp", "pcScreenForm", "pcScreenDone"];
  const STEP_MAP = { pcScreenEmail:1, pcScreenOtp:1, pcScreenForm:2, pcScreenDone:3 };

  /* ---------------- STATE ---------------- */
  let currentEmail = "";
  let location = "";
  let branch = "";
  let requestType = "";
  let section = 1;
  let glRows = [];
  let selectedGl = null;
  let files = [];
  let boxes = [];
  let expiryTimer = null;
  let resendTimer = null;
  let busy = false;

  /* ---------------- DOM HELPERS ---------------- */
  const el = id => document.getElementById(id);
  const val = id => String((el(id) && el(id).value) || "").trim();
  const hide = (id, on) => { const n = el(id); if (n) n.classList.toggle("fa-hide", on); };

  function loader(show, text){
    el("pcLoaderText").textContent = text || "Processing\u2026";
    hide("pcLoader", !show);
  }

  function message(id, type, text){
    const box = el(id);
    if (!box) return;
    if (!text){ box.className = "fa-msg fa-hide"; box.textContent = ""; return; }
    box.className = "fa-msg fa-msg-" + type;
    box.textContent = text;
  }

  function showScreen(name){
    SCREENS.forEach(id => hide(id, id !== name));
    const active = STEP_MAP[name] || 1;
    document.querySelectorAll(".fa-step").forEach(step => {
      const n = parseInt(step.dataset.step, 10);
      step.classList.toggle("fa-step-active", n === active);
      step.classList.toggle("fa-step-done", n < active);
    });
    window.scrollTo({ top:0, behavior:"smooth" });
  }

  function markBad(id){
    const n = el(id);
    if (n){ n.classList.add("fa-bad"); if (n.focus) n.focus(); }
  }
  function clearBad(){
    document.querySelectorAll(".fa-bad").forEach(n => n.classList.remove("fa-bad"));
  }

  function money(v){
    const n = Number(v);
    return "RM " + (isNaN(n) ? 0 : n).toLocaleString("en-MY", { minimumFractionDigits:2, maximumFractionDigits:2 });
  }
  function maskEmail(email){
    const p = String(email).split("@");
    if (p.length !== 2) return email;
    return p[0].slice(0, 2) + "*".repeat(Math.max(p[0].length - 2, 2)) + "@" + p[1];
  }
  function escapeHtml(v){
    return String(v == null ? "" : v).replace(/[&<>"']/g, c =>
      ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
  }
  function initials(name){
    const p = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (!p.length) return "?";
    return (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
  }
  function todayIso(){
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }
  function displayDate(iso){
    if (!iso) return "\u2014";
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" });
  }
  function statusOf(res){ return String((res && res.status) || "").toUpperCase(); }

  /* ---------------- API ---------------- */
  async function post(url, payload){
    if (!url) throw new Error("This service is not configured yet. Please contact the Automation team.");
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
    try { data = text ? JSON.parse(text) : {}; }
    catch (e) { throw new Error("Unexpected response received from the server."); }
    if (!response.ok && !data.status) throw new Error(data.message || "Request failed (" + response.status + ")");
    return data;
  }

  /* ---------------- SESSION ---------------- */
  function saveSession(){
    sessionStorage.setItem(PC_CONFIG.sessionKey, JSON.stringify({
      verified : true,
      email    : currentEmail,
      location : location,
      branch   : branch,
      expires  : Date.now() + PC_CONFIG.sessionMinutes * 60000
    }));
  }
  function getSession(){
    try {
      const s = JSON.parse(sessionStorage.getItem(PC_CONFIG.sessionKey) || "null");
      if (!s || s.verified !== true || Date.now() > s.expires){ clearSession(); return null; }
      return s;
    } catch (e) { clearSession(); return null; }
  }
  function clearSession(){ sessionStorage.removeItem(PC_CONFIG.sessionKey); }

  /* ---------------- RADIO GROUPS (single selection guaranteed) ---------------- */
  function bindChoiceGroup(groupId, onChange){
    const group = el(groupId);
    group.querySelectorAll("input[type=radio]").forEach(radio => {
      radio.addEventListener("change", () => {
        group.querySelectorAll(".pc-choice").forEach(c =>
          c.classList.toggle("pc-checked", c.querySelector("input").checked));
        group.classList.remove("fa-bad");
        onChange(radio.value);
      });
    });
  }
  function resetChoiceGroup(groupId){
    const group = el(groupId);
    group.querySelectorAll("input").forEach(i => { i.checked = false; });
    group.querySelectorAll(".pc-choice").forEach(c => c.classList.remove("pc-checked"));
  }

  /* ============================================================
     OTP
     ============================================================ */
  async function requestOtp(isResend){
    const target = isResend ? "pcOtpMsg" : "pcEmailMsg";
    const email = isResend ? currentEmail : val("pcEmail").toLowerCase();

    if (!isResend){
      clearBad();
      if (!location){ el("pcLocationGroup").classList.add("fa-bad"); return message(target, "error", "Please select the origination location."); }
      if (location === "Branch" && !val("pcBranch")){ markBad("pcBranch"); return message(target, "error", "Please select your branch."); }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){ markBad("pcEmail"); return message(target, "error", "Please enter a valid email address."); }
      if (!email.endsWith("@" + PC_CONFIG.allowedDomain)){ markBad("pcEmail"); return message(target, "error", "Only @" + PC_CONFIG.allowedDomain + " email addresses are permitted."); }
      currentEmail = email;
      branch = location === "Branch" ? val("pcBranch") : "";
    }

    message("pcEmailMsg", null, null);
    message("pcOtpMsg", null, null);
    loader(true, "Sending verification code\u2026");

    try {
      const res = await post(PC_CONFIG.requestOtpUrl, { moduleCode: PC_CONFIG.moduleCode, email: currentEmail });
      const s = statusOf(res);

      if (["SENT", "SUCCESS", "OK"].indexOf(s) === -1){
        return message(target, "error", res.message || "Unable to send the verification code. Please try again.");
      }

      if (res.name) sessionStorage.setItem("pc_profile_name", res.name);
      el("pcMaskedEmail").textContent = maskEmail(currentEmail);
      clearBoxes(false);
      el("pcBtnVerify").disabled = false;
      startExpiry();
      startResendCooldown();
      showScreen("pcScreenOtp");
      setTimeout(() => boxes[0] && boxes[0].focus(), 260);
      if (isResend) message("pcOtpMsg", "ok", "A new verification code has been sent to your inbox.");
    } catch (e) {
      message(target, "error", e.message);
    } finally {
      loader(false);
    }
  }

  async function verifyOtp(){
    if (busy) return;
    const code = boxes.map(b => b.value).join("");
    if (code.length !== PC_CONFIG.otpLength){
      return message("pcOtpMsg", "error", "Please enter all " + PC_CONFIG.otpLength + " digits.");
    }

    busy = true;
    message("pcOtpMsg", null, null);
    loader(true, "Verifying\u2026");

    try {
      const res = await post(PC_CONFIG.verifyOtpUrl, { moduleCode: PC_CONFIG.moduleCode, email: currentEmail, code: code });
      const s = statusOf(res);

      if (s === "VERIFIED" || s === "VALID"){
        stopTimers();
        saveSession();
        enterApp(res);
      } else if (s === "LOCKED"){
        stopTimers();
        clearBoxes(true);
        el("pcBtnVerify").disabled = true;
        el("pcBtnResend").disabled = false;
        el("pcBtnResend").textContent = "Resend code";
        message("pcOtpMsg", "error", res.message || "Too many incorrect attempts. Please request a new code.");
      } else if (s === "EXPIRED" || s === "NO_CODE"){
        clearBoxes(true);
        message("pcOtpMsg", "warn", res.message || "This code is no longer valid. Please request a new one.");
      } else {
        clearBoxes(true);
        message("pcOtpMsg", "error", res.message || "Incorrect verification code.");
      }
    } catch (e) {
      message("pcOtpMsg", "error", e.message);
    } finally {
      busy = false;
      loader(false);
    }
  }

  function bindBoxes(){
    boxes = Array.prototype.slice.call(document.querySelectorAll(".fa-otp-box"));
    boxes.forEach((box, i) => {
      box.addEventListener("input", () => {
        box.value = box.value.replace(/\D/g, "").slice(0, 1);
        box.classList.toggle("fa-filled", box.value !== "");
        if (box.value && i < boxes.length - 1) boxes[i + 1].focus();
        if (boxes.map(b => b.value).join("").length === PC_CONFIG.otpLength) verifyOtp();
      });
      box.addEventListener("keydown", e => {
        if (e.key === "Backspace" && !box.value && i > 0) boxes[i - 1].focus();
        if (e.key === "ArrowLeft" && i > 0) boxes[i - 1].focus();
        if (e.key === "ArrowRight" && i < boxes.length - 1) boxes[i + 1].focus();
      });
      box.addEventListener("focus", () => box.select());
      box.addEventListener("paste", e => {
        e.preventDefault();
        const digits = (e.clipboardData.getData("text") || "").replace(/\D/g, "").slice(0, boxes.length);
        digits.split("").forEach((d, k) => { boxes[k].value = d; boxes[k].classList.add("fa-filled"); });
        if (digits.length) boxes[Math.min(digits.length, boxes.length) - 1].focus();
        if (digits.length === PC_CONFIG.otpLength) verifyOtp();
      });
    });
  }

  function clearBoxes(flash){
    boxes.forEach(b => {
      b.value = "";
      b.classList.remove("fa-filled");
      if (flash){ b.classList.add("fa-bad"); setTimeout(() => b.classList.remove("fa-bad"), 520); }
    });
    if (boxes[0]) boxes[0].focus();
  }

  function startExpiry(){
    clearInterval(expiryTimer);
    let left = PC_CONFIG.otpValidSeconds;
    const tick = () => {
      el("pcTimer").textContent = String(Math.floor(left / 60)).padStart(2, "0") + ":" + String(left % 60).padStart(2, "0");
      if (left <= 0){
        clearInterval(expiryTimer);
        message("pcOtpMsg", "warn", "Your code has expired. Please request a new one.");
        return;
      }
      left--;
    };
    tick();
    expiryTimer = setInterval(tick, 1000);
  }

  function startResendCooldown(){
    clearInterval(resendTimer);
    let left = PC_CONFIG.resendCooldown;
    const btn = el("pcBtnResend");
    btn.disabled = true;
    btn.textContent = "Resend code (" + left + "s)";
    resendTimer = setInterval(() => {
      left--;
      btn.textContent = "Resend code (" + left + "s)";
      if (left <= 0){
        clearInterval(resendTimer);
        btn.disabled = false;
        btn.textContent = "Resend code";
      }
    }, 1000);
  }

  function stopTimers(){ clearInterval(expiryTimer); clearInterval(resendTimer); }

  /* ============================================================
     ENTER APP
     ============================================================ */
  function enterApp(res){
    const name = (res && res.name) || sessionStorage.getItem("pc_profile_name") || "";
    const dept = (res && res.user && res.user.department) || "";

    el("pcUserName").textContent  = name ? "Welcome, " + name : "Welcome";
    el("pcUserEmail").textContent = currentEmail;
    el("pcAvatar").textContent    = name ? initials(name) : currentEmail.charAt(0).toUpperCase();
    el("pcUserLocation").textContent = location === "Branch" ? "Branch \u00b7 " + branch : "Headquarters";

    if (name){ el("pcFullName").value = name; }
    if (dept){ el("pcDepartment").value = dept; }
    el("pcRequestDate").value = displayDate(todayIso());
    el("pcDateRequired").min = todayIso();

    /* Location specific behaviour */
    const isBranch = location === "Branch";
    hide("pcTypeBlock", isBranch);
    requestType = isBranch ? "Branch" : "";
    hide("pcHqApprovers", isBranch);
    hide("pcBranchApprovers", !isBranch);
    applyRequestType();

    loadOpex();
    hide("pcBtnSignOut", false);
    showScreen("pcScreenForm");
    goToSection(1);
  }

  function applyRequestType(){
    hide("pcClaimBlock", requestType !== "Claim");
  }

  /* ============================================================
     SECTIONS
     ============================================================ */
  function goToSection(n){
    section = n;
    document.querySelectorAll(".pc-section").forEach(s =>
      s.classList.toggle("fa-hide", Number(s.dataset.section) !== n));

    el("pcSecCounter").textContent = "Section " + n + " of " + SECTIONS.length;
    el("pcSecName").textContent = SECTIONS[n - 1];
    el("pcSecBar").querySelectorAll("i").forEach((bar, i) => {
      bar.classList.toggle("pc-on", i + 1 === n);
      bar.classList.toggle("pc-done", i + 1 < n);
    });

    el("pcBtnBack").disabled = n === 1;
    el("pcBtnNext").textContent = n === SECTIONS.length ? "Submit request" : "Continue";
    message("pcFormMsg", null, null);

    if (n === SECTIONS.length) buildReview();
    window.scrollTo({ top:0, behavior:"smooth" });
  }

  function next(){
    if (section === SECTIONS.length){ submit(); return; }
    const problem = validate(section);
    if (problem){ message("pcFormMsg", "error", problem); return; }
    goToSection(section + 1);
  }

  function back(){ if (section > 1) goToSection(section - 1); }

  /* ============================================================
     VALIDATION (first error per section, FA style)
     ============================================================ */
  function validate(n){
    clearBad();
    const emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
    let rules = [];

    if (n === 1){
      rules = [
        ["pcTypeGroup",   location === "HQ" && !requestType, "Please select the request type."],
        ["pcFullName",    !val("pcFullName"),   "Please enter your full name."],
        ["pcEmployeeId",  !val("pcEmployeeId"), "Please enter your employee ID."],
        ["pcDepartment",  !val("pcDepartment"), "Please enter your department."]
      ];
    }

    if (n === 2){
      const amt = parseFloat(val("pcAmount"));
      const req = val("pcDateRequired");
      rules = [
        ["pcOrigRef",      requestType === "Claim" && !val("pcOrigRef"), "Please enter the original request reference."],
        ["pcOrigAmount",   requestType === "Claim" && !(parseFloat(val("pcOrigAmount")) > 0), "Please enter the original amount."],
        ["pcAmount",       isNaN(amt) || amt <= 0, "Please enter an amount greater than zero."],
        ["pcDateRequired", !req, "Please select the date the funds are required."],
        ["pcDateRequired", !!req && req < todayIso(), "The date required cannot be in the past."],
        ["pcPurpose",      val("pcPurpose").length < 10, "Please describe the purpose in at least 10 characters."]
      ];
    }

    if (n === 3){
      rules = [
        ["pcOpex", !val("pcOpex"), "Please select the class of OPEX."],
        ["pcGl",   !selectedGl,    "Please select an SAP GL code."]
      ];
    }

    if (n === 4){
      const acc = val("pcAccount").replace(/[\s-]/g, "");
      rules = [
        ["pcBank",      !val("pcBank"), "Please select the recipient bank."],
        ["pcOtherBank", val("pcBank") === "Other" && !val("pcOtherBank"), "Please enter the bank name."],
        ["pcAccount",   !acc, "Please enter the account number."],
        ["pcAccount",   !!acc && !/^\d{6,20}$/.test(acc), "The account number must contain 6 to 20 digits."]
      ];
    }

    if (n === 5){
      const ids = location === "HQ" ? ["pcApprover1", "pcApprover2"] : ["pcVerifier", "pcBranchMgmt"];
      const a = val(ids[0]).toLowerCase();
      const b = val(ids[1]).toLowerCase();
      rules = [
        [ids[0], !emailRe.test(a), "Please enter a valid email for the first approver."],
        [ids[1], !emailRe.test(b), "Please enter a valid email for the second approver."],
        [ids[0], a === currentEmail, "You cannot approve your own request."],
        [ids[1], b === currentEmail, "You cannot approve your own request."],
        [ids[1], a === b, "Each approver must be a different person."]
      ];
    }

    if (n === 6){
      rules = [
        ["pcZone", files.length === 0, "Please upload at least one supporting document."],
        ["pcZone", totalSize() > PC_CONFIG.maxUploadMB * 1048576, "The total upload size exceeds " + PC_CONFIG.maxUploadMB + " MB."]
      ];
    }

    if (n === 7){
      rules = [["pcDeclare", !el("pcDeclare").checked, "Please accept the declaration before submitting."]];
    }

    for (let i = 0; i < rules.length; i++){
      if (rules[i][1]){ markBad(rules[i][0]); return rules[i][2]; }
    }
    return null;
  }

  /* ============================================================
     GL DROPDOWNS
     ============================================================ */
  function placeholder(text){ return '<option value="" selected disabled hidden>' + text + '</option>'; }

  function availableGl(){ return GL_MASTER.filter(r => r.scope === "Both" || r.scope === location); }

  function loadOpex(){
    const classes = [...new Set(availableGl().map(r => r.opexClass))].sort();
    el("pcOpex").innerHTML = placeholder("\u2014 Select \u2014") +
      classes.map(c => '<option value="' + escapeHtml(c) + '">' + escapeHtml(c) + '</option>').join("");
    filterGl();
  }

  function filterGl(){
    const cls = val("pcOpex");
    const sel = el("pcGl");
    glRows = cls ? availableGl().filter(r => r.opexClass === cls) : [];
    sel.innerHTML = placeholder(cls ? "\u2014 Select \u2014" : "Select a class of OPEX first") +
      glRows.map((r, i) => '<option value="' + i + '">' + r.glCode + ' \u2014 ' + escapeHtml(r.expenseType) + '</option>').join("");
    sel.disabled = !cls;
    applyGl();
  }

  function applyGl(){
    const idx = el("pcGl").value;
    selectedGl = idx === "" ? null : glRows[Number(idx)];
    hide("pcGlCard", !selectedGl);
    if (!selectedGl) return;
    el("pcGlCode").textContent = selectedGl.glCode;
    el("pcGlCostCentre").textContent = costCentre(selectedGl);
    el("pcGlDesc").textContent = selectedGl.description;
    el("pcGlType").textContent = selectedGl.expenseType;
  }

  function costCentre(r){
    if (r && r.costCentre) return r.costCentre;
    return location === "Branch" ? "To be confirmed by Finance" : "\u2014";
  }

  /* ============================================================
     FILES (FA upload pattern)
     ============================================================ */
  function ext(name){ const m = String(name).match(/\.([^.]+)$/); return m ? m[1].toLowerCase() : ""; }
  function size(b){ return b < 1024 ? b + " B" : b < 1048576 ? (b / 1024).toFixed(1) + " KB" : (b / 1048576).toFixed(2) + " MB"; }
  function totalSize(){ return files.reduce((s, f) => s + f.size, 0); }

  function addFiles(list){
    const errors = [];
    Array.prototype.slice.call(list || []).forEach(f => {
      if (PC_CONFIG.allowedExtensions.indexOf(ext(f.name)) === -1){ errors.push('"' + f.name + '" is not a supported file type.'); return; }
      if (!f.size){ errors.push('"' + f.name + '" is empty.'); return; }
      if (files.some(x => x.name === f.name && x.size === f.size)){ errors.push('"' + f.name + '" is already in the list.'); return; }
      files.push(f);
    });
    el("pcZone").classList.remove("fa-bad");
    if (errors.length) message("pcFormMsg", "warn", "Some files were not added: " + errors.join(" "));
    else message("pcFormMsg", null, null);
    renderFiles();
  }

  function renderFiles(){
    const has = files.length > 0;
    hide("pcZoneEmpty", has);
    hide("pcZoneSelected", !has);
    el("pcZone").classList.toggle("fa-has-file", has);
    el("pcFileCount").textContent = files.length + " file" + (files.length === 1 ? "" : "s") + " selected";
    el("pcFileSize").textContent = size(totalSize()) + " total of " + PC_CONFIG.maxUploadMB + " MB";

    const list = el("pcFileList");
    list.innerHTML = files.map((f, i) =>
      '<div class="fa-upload-file-row">' +
        '<div class="fa-file-icon">' + escapeHtml((ext(f.name) || "FILE").toUpperCase()) + '</div>' +
        '<div class="fa-file-info"><strong title="' + escapeHtml(f.name) + '">' + escapeHtml(f.name) + '</strong><small>' + size(f.size) + '</small></div>' +
        '<button type="button" class="fa-file-remove-one" data-i="' + i + '" aria-label="Remove">&times;</button>' +
      '</div>').join("");
    list.querySelectorAll("[data-i]").forEach(b =>
      b.addEventListener("click", () => { files.splice(Number(b.dataset.i), 1); renderFiles(); }));
  }

  function readBase64(file){
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => { const s = String(r.result || ""); resolve(s.substring(s.indexOf(",") + 1)); };
      r.onerror = () => reject(new Error('Unable to read "' + file.name + '".'));
      r.readAsDataURL(file);
    });
  }

  /* ============================================================
     REVIEW
     ============================================================ */
  function bankName(){ return val("pcBank") === "Other" ? val("pcOtherBank") : val("pcBank"); }
  function typeLabel(){
    return requestType === "Branch" ? "Branch Petty Cash" : requestType === "Claim" ? "Petty Cash Claim" : "Petty Cash Advance";
  }

  function buildReview(){
    const isHQ = location === "HQ";
    const gl = selectedGl || {};
    const blocks = [
      [1, "Requestor", [
        ["Request type", typeLabel()], ["Location", isHQ ? "Headquarters" : "Branch \u00b7 " + branch],
        ["Full name", val("pcFullName")], ["Employee ID", val("pcEmployeeId")],
        ["Department", val("pcDepartment")], ["Email", currentEmail]
      ]],
      [2, "Request", [
        ...(requestType === "Claim" ? [["Original reference", val("pcOrigRef")], ["Original amount", money(val("pcOrigAmount"))]] : []),
        ["Amount requested", money(val("pcAmount"))], ["Date required", displayDate(val("pcDateRequired"))],
        ["Purpose", val("pcPurpose"), true]
      ]],
      [3, "Budget & GL", [
        ["Class of OPEX", gl.opexClass], ["SAP GL code", gl.glCode],
        ["Cost centre", costCentre(gl)], ["GL description", gl.description],
        ["Type of expense", gl.expenseType, true]
      ]],
      [4, "Payment", [["Bank", bankName()], ["Account number", val("pcAccount")]]],
      [5, "Approvals", isHQ
        ? [["First approver", val("pcApprover1")], ["Second approver", val("pcApprover2")]]
        : [["Branch verifier", val("pcVerifier")], ["Branch Management approver", val("pcBranchMgmt")]]],
      [6, "Documents", [["Attachments", files.map(f => f.name).join(", "), true]]]
    ];

    el("pcReview").innerHTML =
      '<div class="fa-summary" style="margin:0 0 14px"><span>Amount requested</span><strong>' + money(val("pcAmount")) + '</strong></div>' +
      blocks.map(([n, title, rows]) =>
        '<div class="pc-review"><div class="pc-review-head"><strong>' + title + '</strong>' +
        '<button type="button" class="fa-link" data-goto="' + n + '">Edit</button></div><div class="pc-meta">' +
        rows.map(([l, v, full]) => '<div' + (full ? ' class="pc-full"' : '') + '><small>' + escapeHtml(l) + '</small><b>' + escapeHtml(v || "\u2014") + '</b></div>').join("") +
        '</div></div>').join("");

    el("pcReview").querySelectorAll("[data-goto]").forEach(b =>
      b.addEventListener("click", () => goToSection(Number(b.dataset.goto))));
  }

  /* ============================================================
     SUBMIT
     ============================================================ */
  async function buildPayload(){
    const gl = selectedGl || {};
    const isHQ = location === "HQ";
    const docs = [];
    for (let i = 0; i < files.length; i++){
      docs.push({ name: files[i].name, size: files[i].size, contentType: files[i].type || "application/octet-stream", contentBytes: await readBase64(files[i]) });
    }
    return {
      moduleCode               : PC_CONFIG.moduleCode,
      requestType              : requestType,
      originationLocation      : location,
      branch                   : branch,
      requestorEmail           : currentEmail,
      requestorName            : val("pcFullName"),
      employeeId               : val("pcEmployeeId"),
      department               : val("pcDepartment"),
      dateRequired             : val("pcDateRequired"),
      amountRequested          : parseFloat(val("pcAmount")),
      purpose                  : val("pcPurpose"),
      originalRequestReference : requestType === "Claim" ? val("pcOrigRef") : "",
      originalAmount           : requestType === "Claim" ? parseFloat(val("pcOrigAmount")) : 0,
      classOfOpex              : gl.opexClass || "",
      sapGlCode                : gl.glCode || "",
      sapGlDescription         : gl.description || "",
      costCentre               : gl.costCentre || "",
      expenseType              : gl.expenseType || "",
      bankName                 : bankName(),
      bankAccountNumber        : val("pcAccount").replace(/[\s-]/g, ""),
      departmentApprover1      : isHQ ? val("pcApprover1").toLowerCase() : "",
      departmentApprover2      : isHQ ? val("pcApprover2").toLowerCase() : "",
      branchVerifier           : isHQ ? "" : val("pcVerifier").toLowerCase(),
      branchManagementApprover : isHQ ? "" : val("pcBranchMgmt").toLowerCase(),
      requestDocuments         : docs,
      declarationAccepted      : true,
      submittedAt              : new Date().toISOString()
    };
  }

  async function submit(){
    for (let n = 1; n <= SECTIONS.length; n++){
      const problem = validate(n);
      if (problem){
        if (n !== section) goToSection(n);
        validate(n);
        message("pcFormMsg", "error", problem);
        return;
      }
    }

    if (!getSession()){
      message("pcFormMsg", "error", "Your session has expired. Please verify your email again.");
      return setTimeout(signOut, 2000);
    }

    if (!PC_CONFIG.submitUrl){
      const preview = await buildPayload();
      preview.requestDocuments = preview.requestDocuments.map(f => ({ name: f.name, size: f.size }));
      console.log("Payload preview (not sent):", preview);
      return message("pcFormMsg", "info", "All checks passed. Submission is not connected yet. Add the PC_SubmitRequest URL in pc-config.js. A payload preview is in the browser console (F12).");
    }

    el("pcBtnNext").disabled = true;
    el("pcBtnBack").disabled = true;
    loader(true, "Submitting your request\u2026");

    try {
      const res = await post(PC_CONFIG.submitUrl, await buildPayload());
      if (statusOf(res) !== "SUBMITTED") throw new Error(res.message || "Submission failed. Please try again.");
      el("pcRefNo").textContent = res.requestReference || res.requestId || "(pending)";
      showScreen("pcScreenDone");
    } catch (e) {
      message("pcFormMsg", "error", e.message);
    } finally {
      el("pcBtnNext").disabled = false;
      el("pcBtnBack").disabled = section === 1;
      loader(false);
    }
  }

  /* ============================================================
     RESET / SIGN OUT
     ============================================================ */
  function resetForm(){
    el("pcForm").reset();
    resetChoiceGroup("pcTypeGroup");
    requestType = location === "Branch" ? "Branch" : "";
    files = [];
    renderFiles();
    selectedGl = null;
    loadOpex();
    hide("pcOtherBankField", true);
    applyRequestType();
    el("pcCharCount").textContent = "0";
    el("pcTotal").textContent = "RM 0.00";
    el("pcRequestDate").value = displayDate(todayIso());
    const name = sessionStorage.getItem("pc_profile_name");
    if (name) el("pcFullName").value = name;
    clearBad();
  }

  function signOut(){
    stopTimers();
    clearSession();
    sessionStorage.removeItem("pc_profile_name");
    currentEmail = ""; location = ""; branch = ""; requestType = "";
    resetForm();
    resetChoiceGroup("pcLocationGroup");
    hide("pcBranchField", true);
    el("pcBranch").selectedIndex = 0;
    el("pcEmail").value = "";
    el("pcBtnVerify").disabled = false;
    hide("pcBtnSignOut", true);
    message("pcEmailMsg", null, null);
    message("pcOtpMsg", null, null);
    message("pcFormMsg", null, null);
    showScreen("pcScreenEmail");
  }

  /* ============================================================
     INIT
     ============================================================ */
  function init(){
    el("pcVersion").textContent = PC_CONFIG.appVersion;
    el("pcZoneHint").textContent = "PDF, Word, Excel, JPG or PNG \u00b7 up to " + PC_CONFIG.maxUploadMB + " MB in total";
    el("pcFile").setAttribute("accept", PC_CONFIG.allowedExtensions.map(x => "." + x).join(","));

    bindBoxes();

    bindChoiceGroup("pcLocationGroup", v => {
      location = v;
      hide("pcBranchField", v !== "Branch");
      message("pcEmailMsg", null, null);
    });
    bindChoiceGroup("pcTypeGroup", v => {
      requestType = v;
      applyRequestType();
      message("pcFormMsg", null, null);
    });

    el("pcBtnRequestOtp").addEventListener("click", () => requestOtp(false));
    el("pcEmail").addEventListener("keydown", e => { if (e.key === "Enter"){ e.preventDefault(); requestOtp(false); } });
    el("pcBtnVerify").addEventListener("click", verifyOtp);
    el("pcBtnResend").addEventListener("click", () => requestOtp(true));
    el("pcBtnChangeEmail").addEventListener("click", signOut);
    el("pcBtnSignOut").addEventListener("click", signOut);

    el("pcBtnNext").addEventListener("click", next);
    el("pcBtnBack").addEventListener("click", back);
    el("pcBtnAnother").addEventListener("click", () => { resetForm(); showScreen("pcScreenForm"); goToSection(1); });

    el("pcOpex").addEventListener("change", filterGl);
    el("pcGl").addEventListener("change", applyGl);
    el("pcBank").addEventListener("change", () => hide("pcOtherBankField", val("pcBank") !== "Other"));
    el("pcPurpose").addEventListener("input", () => { el("pcCharCount").textContent = el("pcPurpose").value.length; });
    el("pcAmount").addEventListener("input", () => { el("pcTotal").textContent = money(val("pcAmount")); });
    ["pcAmount", "pcOrigAmount"].forEach(id => el(id).addEventListener("blur", () => {
      const n = parseFloat(val(id)); if (n > 0) el(id).value = n.toFixed(2);
    }));

    document.addEventListener("input", e => {
      if (e.target.classList && e.target.classList.contains("fa-bad")){
        e.target.classList.remove("fa-bad");
        message("pcFormMsg", null, null);
      }
    });

    /* Upload */
    const input = el("pcFile");
    input.addEventListener("change", () => { addFiles(input.files); input.value = ""; });
    const zone = el("pcZone");
    ["dragenter", "dragover"].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.add("fa-drag"); }));
    ["dragleave", "drop"].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.remove("fa-drag"); }));
    zone.addEventListener("drop", e => addFiles(e.dataTransfer && e.dataTransfer.files));
    el("pcRemoveAll").addEventListener("click", () => { files = []; renderFiles(); });
    renderFiles();

    /* Resume an active session */
    const s = getSession();
    if (s){
      currentEmail = s.email; location = s.location; branch = s.branch || "";
      enterApp(null);
    } else {
      showScreen("pcScreenEmail");
    }
  }

  return { init };
})();

document.addEventListener("DOMContentLoaded", PC.init);
