// ====== LOGIC DÙNG CHUNG CHO CẢ 3 LINK (index.html, quan.html, admin.html) ======
const CFG = window.APP_CONFIG || {};
const APP_MODE = window.APP_MODE || "customer"; // "customer" | "owner" | "admin"
const SHOP_NAME = CFG.shopName || "Bếp Nhà Mình";
const TABLES = [...(CFG.tables || ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10"])];
const MENU_ITEMS = CFG.menuItems || [];
const CATEGORIES = CFG.categories || ["Tất cả", "Đồ ăn", "Đồ uống", "Ăn vặt"];
const RETENTION_DAYS = CFG.historyRetentionDays || 3;

const DEFAULT_CONFIG = {
  ntfyTopic: CFG.ntfyTopic || "bepnhaminh-pos-2026",
  bankId: CFG.bankId || "OCB",
  accountNo: CFG.accountNo || "0987846022",
  accountName: CFG.accountName || "LE BA TUAN"
};

const KEYS = {
  orders: "qr_pos_orders_v2",
  tableClears: "qr_pos_table_clears_v2",
  paidHistory: "qr_pos_paid_history_v2",
  paidIds: "qr_pos_paid_ids_v3",
  merges: "qr_pos_merges_v3",
  moves: "qr_pos_moves_v3",
  guest: "qr_pos_guest_v3",
  deviceId: "qr_pos_device_id_v3",
  soldOut: "qr_pos_soldout_v2",
  staffCalls: "qr_pos_staff_calls_v2",
  settings: "qr_pos_settings_v2",
  pinUnlocked: "qr_pos_pin_unlocked_v1",
  cooldownOrder: "qr_pos_cooldown_order_",
  cooldownCall: "qr_pos_cooldown_call_"
};

const savedSettings = JSON.parse(localStorage.getItem(KEYS.settings) || "{}");
if (savedSettings.accountNo === "0123456789") {
  delete savedSettings.bankId;
  delete savedSettings.accountNo;
  delete savedSettings.accountName;
}
let settings = { ...DEFAULT_CONFIG, ...savedSettings };
let currentTab = APP_MODE === "admin" ? "split" : (APP_MODE === "owner" ? "owner" : "customer");
let currentPosTab = "kitchen";
let currentCat = "Tất cả";
let currentTable = TABLES[0] || "01";
let cart = [];
let orders = JSON.parse(localStorage.getItem(KEYS.orders) || "[]");
let tableClears = JSON.parse(localStorage.getItem(KEYS.tableClears) || "{}");
let paidHistory = JSON.parse(localStorage.getItem(KEYS.paidHistory) || "[]");
let paidIds = JSON.parse(localStorage.getItem(KEYS.paidIds) || "{}");
let merges = JSON.parse(localStorage.getItem(KEYS.merges) || "{}");
let orderMoves = JSON.parse(localStorage.getItem(KEYS.moves) || "{}");
const mergeSelection = new Set();
let soldOutIds = JSON.parse(localStorage.getItem(KEYS.soldOut) || "[]");
let staffCalls = JSON.parse(localStorage.getItem(KEYS.staffCalls) || "[]");

let selectedHistoryDay = "all";
let soundEnabled = true;
let wakeLock = null;
let wakeLockWanted = false;
let sseSource = null;
let isCustomerQRMode = (APP_MODE === "customer");
let isUnlocked = (APP_MODE === "customer") || (sessionStorage.getItem(KEYS.pinUnlocked) === "1");

let pendingOptItem = null;
let pendingOptState = {};
let orderCooldownTimer = null;

// ====== TIỆN ÍCH ======
const fmt = (n) => Number(n).toLocaleString("vi-VN") + "đ";
const esc = (str) => String(str).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const noAccent = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D");

const fmtDateTime = (ts) => {
  const d = new Date(ts || Date.now());
  const hm = d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  const dm = d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
  return `${hm} (${dm})`;
};

function getDayKey(ts) {
  const d = new Date(ts || Date.now());
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getRecentDaysList() {
  const res = [];
  const now = new Date();
  const labels = ["Hôm nay", "Hôm qua", "Hôm kia"];
  for (let i = 0; i < RETENTION_DAYS; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const key = getDayKey(d.getTime());
    const dm = d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
    res.push({ key, label: labels[i] || dm, dateStr: dm });
  }
  return res;
}

function pruneOldHistory() {
  const now = new Date();
  const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (RETENTION_DAYS - 1)).getTime();
  const before = paidHistory.length;
  paidHistory = paidHistory.filter(h => (h.paidAt || 0) >= cutoff);
  if (paidHistory.length !== before) {
    localStorage.setItem(KEYS.paidHistory, JSON.stringify(paidHistory));
  }
}

function showToast(msg) {
  document.querySelectorAll(".toast").forEach(el => el.remove());
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2400);
}

// ====== KHÓA MÃ PIN (cho quan.html & admin.html) ======
function checkPinUnlock() {
  const input = document.getElementById("pinInput");
  if (!input) return;
  const val = input.value.trim();
  if (val === String(CFG.pin || "358912")) {
    isUnlocked = true;
    sessionStorage.setItem(KEYS.pinUnlocked, "1");
    document.getElementById("pinGate").classList.add("hidden");
    startStaffApp();
    showToast("Mở khóa thành công!");
  } else {
    document.getElementById("pinError").classList.remove("hidden");
    input.value = "";
    input.focus();
  }
}

function lockWithPin() {
  sessionStorage.removeItem(KEYS.pinUnlocked);
  isUnlocked = false;
  if (sseSource) sseSource.close();
  const gate = document.getElementById("pinGate");
  if (gate) {
    document.getElementById("pinInput").value = "";
    document.getElementById("pinError").classList.add("hidden");
    gate.classList.remove("hidden");
    setTimeout(() => document.getElementById("pinInput").focus(), 100);
  }
}

// ====== ÂM THANH & CHỐNG TẮT MÀN HÌNH ======
function playTingTing() {
  if (!soundEnabled || isCustomerQRMode || !isUnlocked) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [880, 1174.66].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.14);
      gain.gain.setValueAtTime(0.25, ctx.currentTime + i * 0.14);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.14 + 0.45);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.14);
      osc.stop(ctx.currentTime + i * 0.14 + 0.45);
    });
  } catch (e) {}
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  const btn = document.getElementById("soundToggleBtn");
  if (!btn) return;
  btn.textContent = soundEnabled ? "🔔 Âm báo: BẬT" : "🔕 Âm báo: TẮT";
  btn.className = "btn-sm" + (soundEnabled ? " sound-on" : "");
  if (soundEnabled) playTingTing();
}

async function requestWakeLock(silent = false) {
  if (!("wakeLock" in navigator)) {
    if (!silent) showToast("Trình duyệt này không hỗ trợ giữ sáng tự động");
    return;
  }
  try {
    wakeLock = await navigator.wakeLock.request("screen");
    wakeLockWanted = true;
    updateWakeLockUI(true);
    wakeLock.addEventListener("release", () => updateWakeLockUI(false));
  } catch (e) {
    if (!silent) showToast("Không thể bật giữ sáng màn hình");
  }
}

function releaseWakeLock() {
  wakeLockWanted = false;
  if (wakeLock) {
    wakeLock.release().catch(() => {});
    wakeLock = null;
  }
  updateWakeLockUI(false);
}

function toggleWakeLock() {
  if (wakeLock) {
    releaseWakeLock();
    showToast("Đã tắt chế độ giữ sáng màn hình");
  } else {
    requestWakeLock(false);
    showToast("Đã bật giữ sáng màn hình cho quầy");
  }
}

function updateWakeLockUI(active) {
  const btn = document.getElementById("wakeLockBtn");
  if (!btn) return;
  btn.textContent = active ? "☀️ Giữ sáng: BẬT" : "☀️ Giữ sáng: TẮT";
  btn.className = "btn-sm" + (active ? " wake-on" : "");
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && !isCustomerQRMode && isUnlocked) {
    if (wakeLockWanted && !wakeLock) requestWakeLock(true);
    pullHistory12h(false);
  }
});

// ====== CHUYỂN TAB GIAO DIỆN ======
function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));

  const mainGrid = document.getElementById("mainGrid");
  const cust = document.getElementById("customerSection");
  const owner = document.getElementById("ownerSection");
  const qr = document.getElementById("qrSection");
  const sync = document.getElementById("syncSection");
  const h3 = document.getElementById("history3Section");

  if (mainGrid) mainGrid.classList.toggle("hidden", tab === "qr" || tab === "sync" || tab === "history3");
  if (qr) qr.classList.toggle("hidden", tab !== "qr");
  if (sync) sync.classList.toggle("hidden", tab !== "sync");
  if (h3) h3.classList.toggle("hidden", tab !== "history3");

  if (tab === "split" && mainGrid && cust && owner) {
    mainGrid.className = "split-grid";
    cust.classList.remove("hidden");
    owner.classList.remove("hidden");
  } else if (tab === "customer" && mainGrid && cust) {
    mainGrid.className = "single-wrap";
    cust.classList.remove("hidden");
    if (owner) owner.classList.add("hidden");
  } else if (tab === "owner" && mainGrid && owner) {
    mainGrid.className = "single-wide";
    if (cust) cust.classList.add("hidden");
    owner.classList.remove("hidden");
  } else if (tab === "qr") {
    renderQRCodes();
  } else if (tab === "sync") {
    fillSettingsForm();
  } else if (tab === "history3") {
    renderThreeDayHistory();
  }
}

function switchPosTab(posTab) {
  currentPosTab = posTab;
  document.querySelectorAll(".pos-subtab").forEach(b => b.classList.toggle("active", b.dataset.postab === posTab));
  renderPosBoard();
}

// ====== MÀN HÌNH KHÁCH HÀNG & CHỌN SIZE/TOPPING ======
function populateTableSelect() {
  const sel = document.getElementById("tableSelect");
  if (!sel) return;
  sel.innerHTML = TABLES.map(t => `<option value="${t}">Bàn ${t}</option>`).join("");
  sel.value = currentTable;
}

function renderMenu() {
  const catBar = document.getElementById("catBar");
  const menuList = document.getElementById("menuList");
  if (!catBar || !menuList) return;

  catBar.innerHTML = CATEGORIES.map(c =>
    `<button class="cat-pill ${c === currentCat ? 'active' : ''}" onclick="currentCat='${c}'; renderMenu()">${c}</button>`
  ).join("");

  const filtered = currentCat === "Tất cả" ? MENU_ITEMS : MENU_ITEMS.filter(m => m.cat === currentCat);
  menuList.innerHTML = filtered.map(item => {
    const isOut = soldOutIds.includes(item.id);
    const hasOpts = Array.isArray(item.options) && item.options.length > 0;
    const thumbHtml = item.img
      ? `<img src="${esc(item.img)}" alt="${esc(item.name)}" onerror="this.remove();" />`
      : `<span>${item.emoji}</span>`;

    return `
      <div class="menu-card ${isOut ? 'sold-out' : ''}">
        <div class="menu-thumb">
          ${thumbHtml}
          ${isOut ? `<div class="sold-out-badge">Tạm hết</div>` : ""}
        </div>
        <div class="menu-info">
          <div class="menu-name">${esc(item.name)}</div>
          <div class="menu-desc">${esc(item.desc)}</div>
          <div class="menu-meta">
            <span class="menu-price">${fmt(item.price)}</span>
            ${hasOpts && !isOut ? `<span class="opt-tag">+ Tùy chọn</span>` : ""}
          </div>
        </div>
        <button class="btn-add" ${isOut ? "disabled" : ""} onclick="handleAddClick(${item.id})" title="Thêm vào giỏ">
          ${isOut ? "Hết" : "+"}
        </button>
      </div>
    `;
  }).join("");
}

function changeTable(val) {
  currentTable = val;
  const dtn = document.getElementById("drawerTableNum");
  const ctn = document.getElementById("callTableNum");
  const tbf = document.getElementById("tableBadgeFixed");
  if (dtn) dtn.textContent = val;
  if (ctn) ctn.textContent = val;
  if (tbf) tbf.textContent = "Bàn " + val;
  updateGuestBadge();
  updateCartUI();
  checkOrderCooldownUI();
}

function handleAddClick(id) {
  if (soldOutIds.includes(id)) return showToast("Món này hiện đang tạm hết!");
  const item = MENU_ITEMS.find(m => m.id === id);
  if (!item) return;

  if (item.options && item.options.length > 0) {
    openOptionsDrawer(item);
  } else {
    addToCartDirect(item, [], item.price);
  }
}

function openOptionsDrawer(item) {
  pendingOptItem = item;
  pendingOptState = {};
  item.options.forEach((grp, gIdx) => {
    if (grp.type === "single" && grp.choices.length > 0) pendingOptState[gIdx] = [0];
    else pendingOptState[gIdx] = [];
  });
  document.getElementById("optItemTitle").textContent = `${item.emoji} ${item.name}`;
  renderOptionsDrawer();
  document.getElementById("optionsDrawer").classList.remove("hidden");
}

function closeOptionsDrawer() {
  document.getElementById("optionsDrawer").classList.add("hidden");
  pendingOptItem = null;
}

function toggleOptionChoice(gIdx, cIdx) {
  const grp = pendingOptItem.options[gIdx];
  if (grp.type === "single") {
    pendingOptState[gIdx] = [cIdx];
  } else {
    const arr = pendingOptState[gIdx] || [];
    const pos = arr.indexOf(cIdx);
    if (pos >= 0) arr.splice(pos, 1);
    else arr.push(cIdx);
    pendingOptState[gIdx] = arr;
  }
  renderOptionsDrawer();
}

function renderOptionsDrawer() {
  if (!pendingOptItem) return;
  let extra = 0;
  const html = pendingOptItem.options.map((grp, gIdx) => {
    const selectedArr = pendingOptState[gIdx] || [];
    return `
      <div class="opt-group">
        <div class="opt-group-title">${esc(grp.title)} ${grp.type === "single" ? "(Chọn 1)" : "(Chọn nhiều)"}</div>
        <div class="opt-list">
          ${grp.choices.map((ch, cIdx) => {
            const isSel = selectedArr.includes(cIdx);
            if (isSel) extra += ch.add;
            return `
              <button type="button" class="opt-chip ${isSel ? 'selected' : ''}" onclick="toggleOptionChoice(${gIdx}, ${cIdx})">
                ${esc(ch.label)}${ch.add > 0 ? ` (+${fmt(ch.add)})` : ""}
              </button>
            `;
          }).join("")}
        </div>
      </div>
    `;
  }).join("");

  document.getElementById("optGroupsContainer").innerHTML = html;
  document.getElementById("btnConfirmOptions").textContent = `Thêm vào giỏ — ${fmt(pendingOptItem.price + extra)}`;
}

function confirmAddWithOptions() {
  if (!pendingOptItem) return;
  let extra = 0;
  const chosenLabels = [];
  pendingOptItem.options.forEach((grp, gIdx) => {
    (pendingOptState[gIdx] || []).forEach(cIdx => {
      const ch = grp.choices[cIdx];
      if (ch) {
        extra += ch.add;
        chosenLabels.push(ch.label);
      }
    });
  });
  addToCartDirect(pendingOptItem, chosenLabels, pendingOptItem.price + extra);
  closeOptionsDrawer();
}

function addToCartDirect(item, chosenLabels, unitPrice) {
  const optText = chosenLabels.join(", ");
  const cartKey = `${item.id}__${optText}`;
  const existing = cart.find(c => c.cartKey === cartKey);
  if (existing) existing.qty++;
  else cart.push({ cartKey, id: item.id, name: item.name, optText, price: unitPrice, qty: 1 });
  updateCartUI();
  showToast(`Đã thêm ${item.name}`);
}

function updateQty(cartKey, delta) {
  const idx = cart.findIndex(c => c.cartKey === cartKey);
  if (idx === -1) return;
  cart[idx].qty += delta;
  if (cart[idx].qty <= 0) cart.splice(idx, 1);
  updateCartUI();
  renderCartDrawer();
}

function updateCartUI() {
  const cnt = document.getElementById("cartCountText");
  const tot = document.getElementById("cartTotalText");
  const btn = document.getElementById("openCartBtn");
  if (!cnt || !tot || !btn) return;
  const totalQty = cart.reduce((s, i) => s + i.qty, 0);
  const totalAmt = cart.reduce((s, i) => s + i.qty * i.price, 0);
  cnt.textContent = totalQty ? `${totalQty} món đã chọn (Bàn ${currentTable})` : "Chưa chọn món nào";
  tot.textContent = fmt(totalAmt);
  btn.disabled = totalQty === 0;
}

function toggleCartDrawer(show) {
  const dr = document.getElementById("cartDrawer");
  if (!dr) return;
  dr.classList.toggle("hidden", !show);
  if (show) {
    renderCartDrawer();
    checkOrderCooldownUI();
  }
}

function renderCartDrawer() {
  const list = document.getElementById("cartItemsList");
  if (!list) return;
  if (!cart.length) {
    toggleCartDrawer(false);
    return;
  }
  list.innerHTML = cart.map(item => `
    <div class="cart-item">
      <div>
        <div style="font-weight:700; font-size:14px;">${esc(item.name)}</div>
        ${item.optText ? `<div class="cart-item-opts">${esc(item.optText)}</div>` : ""}
        <div style="font-size:12px; color:var(--primary); margin-top:2px;">${fmt(item.price)}</div>
      </div>
      <div class="qty-ctrl">
        <button class="qty-btn" onclick="updateQty('${esc(item.cartKey)}', -1)">-</button>
        <strong style="min-width:18px; text-align:center;">${item.qty}</strong>
        <button class="qty-btn" onclick="updateQty('${esc(item.cartKey)}', 1)">+</button>
      </div>
    </div>
  `).join("");
  const totalAmt = cart.reduce((s, i) => s + i.qty * i.price, 0);
  document.getElementById("drawerTotal").textContent = fmt(totalAmt);
}

// ====== CHỐNG SPAM & GỬI ĐƠN ======
function checkOrderCooldownUI() {
  const btn = document.getElementById("btnSubmitOrder");
  if (!btn) return;
  if (orderCooldownTimer) clearInterval(orderCooldownTimer);

  const update = () => {
    const lastTs = Number(localStorage.getItem(KEYS.cooldownOrder + currentTable) || 0);
    const remain = Math.ceil((lastTs + 20000 - Date.now()) / 1000);
    if (remain > 0) {
      btn.disabled = true;
      btn.textContent = `⏳ Chống đặt nhầm: đợi ${remain}s...`;
    } else {
      btn.disabled = false;
      btn.textContent = "🚀 GỬI ĐƠN XUỐNG BẾP";
      clearInterval(orderCooldownTimer);
    }
  };
  update();
  orderCooldownTimer = setInterval(update, 500);
}

async function publishNtfy(messageText, titleText = "", priority = "default") {
  if (!settings.ntfyTopic) return;
  const headers = {};
  if (titleText) headers["Title"] = titleText;
  if (priority) headers["Priority"] = priority;
  try {
    await fetch(`https://ntfy.sh/${encodeURIComponent(settings.ntfyTopic)}`, {
      method: "POST",
      headers,
      body: messageText
    });
  } catch (e) {}
}

async function submitOrder() {
  if (!cart.length) return;
  const guest = getGuest();
  if (!guest) {
    showNameModal(true);
    return;
  }
  const lastTs = Number(localStorage.getItem(KEYS.cooldownOrder + currentTable) || 0);
  if (Date.now() - lastTs < 20000) {
    return showToast("Bạn vừa gửi đơn xong, vui lòng đợi vài giây!");
  }

  const now = new Date();
  const order = {
    id: String(Math.floor(1000 + Math.random() * 9000)) + String(now.getSeconds()).padStart(2, "0"),
    table: currentTable,
    guest: guest.name,
    guestId: deviceId(),
    items: cart.map(i => ({ name: i.name, optText: i.optText || "", qty: i.qty, price: i.price })),
    note: document.getElementById("orderNote").value.trim(),
    total: cart.reduce((s, i) => s + i.qty * i.price, 0),
    status: "new",
    createdAt: now.getTime(),
    time: now.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
  };

  localStorage.setItem(KEYS.cooldownOrder + currentTable, String(Date.now()));
  checkOrderCooldownUI();

  receiveOrder(order, true, !isCustomerQRMode);

  const lines = [
    `🍜 ĐƠN MỚI - BÀN ${order.table} - ${order.guest} (#${order.id})`,
    ...order.items.map(i => `• ${i.qty}x ${i.name}${i.optText ? ` (${i.optText})` : ""} - ${fmt(i.qty * i.price)}`),
    order.note ? `📝 Ghi chú: ${order.note}` : "",
    `💰 Tổng đợt này: ${fmt(order.total)}`,
    `[DATA:${JSON.stringify(order)}]`
  ].filter(Boolean).join("\n");

  await publishNtfy(lines, "", "high");

  cart = [];
  document.getElementById("orderNote").value = "";
  updateCartUI();
  toggleCartDrawer(false);

  document.getElementById("successMsg").innerHTML = `
    Mã phiếu <b>#${esc(order.id)}</b> tại <b>Bàn ${esc(order.table)}</b> (<b>${fmt(order.total)}</b>) đã được chuyển tới quầy bếp.<br/>Quý khách có thể gọi thêm món bất cứ lúc nào!
  `;
  document.getElementById("successModal").classList.remove("hidden");
}

function closeSuccessModal() {
  document.getElementById("successModal").classList.add("hidden");
}

// ====== GỌI NHÂN VIÊN ======
function openCallStaffModal() {
  const lastCall = Number(localStorage.getItem(KEYS.cooldownCall + currentTable) || 0);
  const remain = Math.ceil((lastCall + 15000 - Date.now()) / 1000);
  if (remain > 0) return showToast(`Đã gửi yêu cầu! Vui lòng đợi ${remain}s nếu muốn gọi lại.`);
  document.getElementById("callTableNum").textContent = currentTable;
  document.getElementById("callStaffModal").classList.remove("hidden");
}

function closeCallStaffModal() {
  document.getElementById("callStaffModal").classList.add("hidden");
}

async function sendStaffCall(reason) {
  closeCallStaffModal();
  localStorage.setItem(KEYS.cooldownCall + currentTable, String(Date.now()));
  const now = new Date();
  const callObj = {
    id: "call_" + now.getTime() + "_" + currentTable,
    table: currentTable,
    reason,
    createdAt: now.getTime(),
    time: now.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
  };

  if (!isCustomerQRMode) receiveStaffCall(callObj, true);
  await publishNtfy(`🔔 BÀN ${currentTable} CẦN HỖ TRỢ: ${reason}\n[CALL:${JSON.stringify(callObj)}]`, "", "high");
  showToast(`Đã báo nhân viên tới Bàn ${currentTable}!`);
}

function receiveStaffCall(callObj, ring = true) {
  if (staffCalls.some(c => c.id === callObj.id)) return;
  staffCalls.unshift(callObj);
  localStorage.setItem(KEYS.staffCalls, JSON.stringify(staffCalls));
  renderStaffAlerts();
  if (ring) playTingTing();
}

function dismissStaffCall(id) {
  staffCalls = staffCalls.filter(c => c.id !== id);
  localStorage.setItem(KEYS.staffCalls, JSON.stringify(staffCalls));
  renderStaffAlerts();
}

function renderStaffAlerts() {
  const wrap = document.getElementById("staffAlertsWrap");
  if (!wrap) return;
  if (!staffCalls.length) {
    wrap.classList.add("hidden");
    wrap.innerHTML = "";
    return;
  }
  wrap.classList.remove("hidden");
  wrap.innerHTML = staffCalls.map(c => `
    <div class="staff-alert">
      <div>
        <strong>🔔 Bàn ${esc(c.table)} cần hỗ trợ:</strong> ${esc(c.reason)}
        <span style="font-size:12px; opacity:0.8; margin-left:6px;">(${esc(c.time)})</span>
      </div>
      <button class="btn-sm" onclick="dismissStaffCall('${esc(c.id)}')">✓ Đã xử lý</button>
    </div>
  `).join("");
}

// ====== NHẬN ĐƠN, NHÓM KHÁCH THEO TÊN & GỘP NHÓM ======
function receiveOrder(order, saveToLocal = true, ring = true) {
  if (orders.some(o => o.id === order.id)) return;
  if (!order.createdAt) order.createdAt = Date.now();
  orders.unshift(order);
  orders.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  if (saveToLocal) localStorage.setItem(KEYS.orders, JSON.stringify(orders));
  if (!isCustomerQRMode && isUnlocked) {
    renderPosBoard();
    if (ring) playTingTing();
  }
}

function isPaid(o) {
  return !!paidIds[o.id] || (o.createdAt || 0) <= (tableClears[o.table] || 0);
}

function effGuest(o) {
  const mv = orderMoves[o.id];
  return {
    guestId: mv ? mv.guestId : (o.guestId || "legacy"),
    guest: mv ? mv.guest : (o.guest || "Khách")
  };
}

function buildGroups() {
  const map = {};
  [...orders].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)).forEach(o => {
    if (isPaid(o)) return;
    const g = effGuest(o);
    const key = `${o.table}_${g.guestId}`;
    if (!map[key]) {
      map[key] = { key, table: o.table, guestId: g.guestId, baseName: g.guest, orders: [], mergedItems: {}, total: 0, firstAt: o.createdAt || 0, latestTime: o.time };
    }
    const gr = map[key];
    gr.orders.push(o);
    gr.total += o.total;
    gr.latestTime = o.time;
    o.items.forEach(it => {
      const k = `${it.name}__${it.optText || ""}__${it.price}`;
      if (!gr.mergedItems[k]) gr.mergedItems[k] = { name: it.name, optText: it.optText || "", price: it.price, qty: 0 };
      gr.mergedItems[k].qty += it.qty;
    });
  });
  const groups = Object.values(map).sort((a, b) => a.firstAt - b.firstAt);
  const byTable = {};
  groups.forEach(gr => { (byTable[gr.table] = byTable[gr.table] || []).push(gr); });
  Object.values(byTable).forEach(list => {
    const cnt = {};
    list.forEach(gr => { cnt[gr.baseName] = (cnt[gr.baseName] || 0) + 1; });
    const idx = {};
    list.forEach(gr => {
      if (cnt[gr.baseName] > 1) {
        idx[gr.baseName] = (idx[gr.baseName] || 0) + 1;
        gr.name = `${gr.baseName} ${idx[gr.baseName]}`;
      } else {
        gr.name = gr.baseName;
      }
    });
  });
  return groups;
}

function buildUnits() {
  const groups = buildGroups();
  const byKey = {};
  groups.forEach(g => { byKey[g.key] = g; });
  const used = new Set();
  const units = [];
  Object.values(merges).filter(m => !m.removed).sort((a, b) => (a.ts || 0) - (b.ts || 0)).forEach(m => {
    const members = (m.keys || []).map(k => byKey[k]).filter(Boolean).filter(g => !used.has(g.key));
    if (members.length < 2) return;
    members.forEach(g => used.add(g.key));
    units.push({
      uid: "m:" + m.id, merge: m, groups: members,
      tables: [...new Set(members.map(g => g.table))].sort(),
      total: members.reduce((s, g) => s + g.total, 0)
    });
  });
  groups.forEach(g => {
    if (!used.has(g.key)) units.push({ uid: "g:" + g.key, merge: null, groups: [g], tables: [g.table], total: g.total });
  });
  return units.sort((a, b) => a.tables[0].localeCompare(b.tables[0]) || a.groups[0].firstAt - b.groups[0].firstAt);
}

function unitLabel(u) {
  if (u.groups.length === 1) return u.groups[0].name;
  return "Gộp: " + u.groups.map(g => `${g.name} (B${g.table})`).join(" + ");
}

function unitQrInfo(u) {
  if (u.groups.length > 1) return `TT BAN ${u.tables.join("+")}`;
  const g = u.groups[0];
  const nm = noAccent(g.name).toUpperCase().replace(/[^A-Z0-9 ]/g, "").trim().slice(0, 20);
  return `TT BAN ${g.table} ${nm}`.trim();
}

const itemLis = (items) => items.map(i => `
  <li>
    <span><b>${i.qty}x</b> ${esc(i.name)}${i.optText ? `<span class="order-item-sub">${esc(i.optText)}</span>` : ""}</span>
    <span>${fmt(i.qty * i.price)}</span>
  </li>`).join("");

function renderPosBoard() {
  const board = document.getElementById("ordersBoard");
  if (!board) return;
  pruneOldHistory();

  const activeOrders = orders.filter(o => !isPaid(o));
  const newCount = activeOrders.filter(o => o.status === "new").length;
  const pendingCount = activeOrders.filter(o => o.status !== "done").length;
  const units = buildUnits();
  const allGroups = units.flatMap(u => u.groups);
  const activeTableCount = new Set(allGroups.map(g => g.table)).size;
  const servingRevenue = units.reduce((s, u) => s + u.total, 0);
  const todayKey = getDayKey(Date.now());
  const todayPaidRevenue = paidHistory.filter(h => getDayKey(h.paidAt) === todayKey).reduce((s, h) => s + h.total, 0);

  document.getElementById("statOrders").textContent = activeOrders.length;
  document.getElementById("statPending").textContent = pendingCount;
  document.getElementById("statActiveTables").textContent = activeTableCount;
  document.getElementById("statServingRevenue").textContent = fmt(servingRevenue);
  document.getElementById("statRevenue").textContent = fmt(todayPaidRevenue);
  const bnc = document.getElementById("badgeNewCount");
  if (bnc) bnc.textContent = newCount ? `(${newCount})` : "";

  document.getElementById("subBadgeKitchen").textContent = pendingCount ? `(${pendingCount})` : "";
  document.getElementById("subBadgeTables").textContent = units.length ? `(${units.length})` : "";
  document.getElementById("subBadgeHistory").textContent = paidHistory.length ? `(${paidHistory.length})` : "";
  document.getElementById("subBadgeSoldout").textContent = soldOutIds.length ? `(${soldOutIds.length})` : "";

  board.style.gridTemplateColumns = "";

  if (currentPosTab === "kitchen") {
    if (!activeOrders.length) {
      board.innerHTML = `<div class="empty-state"><h3>Chưa có phiếu báo bếp nào</h3><p style="margin-top:6px;">Khi khách quét mã QR hoặc gọi thêm món, phiếu báo bếp sẽ nổ ngay tại đây!</p></div>`;
      return;
    }
    board.innerHTML = activeOrders.map(o => {
      const stMap = {
        new: { text: "Chờ xác nhận", cls: "st-new" },
        cooking: { text: "Đang làm", cls: "st-cooking" },
        done: { text: "Đã ra món", cls: "st-done" }
      };
      const st = stMap[o.status] || stMap.new;
      const gu = effGuest(o);
      return `
        <div class="order-card ${o.status === 'new' ? 'new-order' : ''}">
          <div class="order-top">
            <div>
              <span class="badge-table">Bàn ${esc(o.table)}</span>
              <span style="font-size:12px; color:var(--slate); margin-left:6px;">#${esc(o.id)} • ${esc(o.time)}</span>
              <div style="font-size:13px; font-weight:700; margin-top:5px;">👤 ${esc(gu.guest)}</div>
            </div>
            <span class="status-pill ${st.cls}">${st.text}</span>
          </div>
          <ul class="order-items">${itemLis(o.items)}</ul>
          ${o.note ? `<div class="order-note">📝 ${esc(o.note)}</div>` : ""}
          <div class="order-total"><span>Đợt gọi này:</span><span style="color:var(--primary);">${fmt(o.total)}</span></div>
          <div class="order-btns">
            ${o.status === "new" ? `<button class="btn-act btn-confirm" onclick="setOrderStatus('${esc(o.id)}','cooking')">👨‍🍳 Nhận & Làm</button>` : ""}
            ${o.status === "cooking" ? `<button class="btn-act btn-done" onclick="setOrderStatus('${esc(o.id)}','done')">✅ Đã ra món</button>` : ""}
            <button class="btn-act btn-bill" onclick="openUnitBillByOrder('${esc(o.id)}')">🧾 Bill</button>
            <button class="btn-act btn-bill" onclick="openMoveModal('${esc(o.id)}')">↪ Đổi nhóm</button>
          </div>
        </div>
      `;
    }).join("");
  } else if (currentPosTab === "tables") {
    if (!units.length) {
      board.innerHTML = `<div class="empty-state"><h3>Tất cả các bàn đang trống</h3><p style="margin-top:6px;">Mỗi khách (theo tên nhập khi quét QR) có một bill riêng. Các đợt gọi thêm của cùng một người tự cộng dồn tại đây.</p></div>`;
      return;
    }
    const validKeys = new Set(allGroups.map(g => g.key));
    mergeSelection.forEach(k => { if (!validKeys.has(k)) mergeSelection.delete(k); });
    const selCount = mergeSelection.size;

    const toolbar = `
      <div style="grid-column:1/-1; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; background:#f8fafc; border:1px dashed #cbd5e1; border-radius:12px; padding:10px 12px;">
        <span style="font-size:13px; color:var(--slate);">☑️ Tick chọn các nhóm muốn thanh toán chung (kể cả khác bàn) rồi bấm Gộp.</span>
        <button class="btn-sm" ${selCount < 2 ? "disabled" : ""} style="${selCount >= 2 ? "background:var(--amber); color:#fff; border-color:var(--amber);" : "opacity:0.5;"}" onclick="mergeSelected()">🔗 Gộp nhóm đã chọn (${selCount})</button>
      </div>`;

    board.innerHTML = toolbar + units.map(u => {
      if (u.groups.length === 1) {
        const g = u.groups[0];
        const checked = mergeSelection.has(g.key) ? "checked" : "";
        return `
          <div class="order-card" style="border-color:#93c5fd;">
            <div class="order-top">
              <div>
                <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
                  <input type="checkbox" ${checked} onchange="toggleMergeSel('${esc(g.key)}')" style="width:18px; height:18px;" />
                  <span class="badge-table" style="background:var(--blue);">Bàn ${esc(g.table)}</span>
                  <b style="font-size:14px;">👤 ${esc(g.name)}</b>
                </label>
                <span style="font-size:11px; color:var(--slate); display:block; margin-top:4px;">${g.orders.length} lượt gọi • vào lúc ${esc(fmtDateTime(g.firstAt))}</span>
              </div>
              <span class="status-pill st-cooking">Đang phục vụ</span>
            </div>
            <ul class="order-items">${itemLis(Object.values(g.mergedItems))}</ul>
            <div class="order-total"><span>BILL ${esc(g.name.toUpperCase())}:</span><span style="color:var(--primary); font-size:17px;">${fmt(g.total)}</span></div>
            <div class="order-btns">
              <button class="btn-act btn-bill" onclick="openUnitBillModal('${esc(u.uid)}', true)">🧾 Bill & QR</button>
              <button class="btn-act btn-clear-table" onclick="payUnit('${esc(u.uid)}')">✅ Thanh toán nhóm này</button>
            </div>
          </div>
        `;
      }
      return `
        <div class="order-card" style="border:2px solid var(--amber); background:#fffbeb;">
          <div class="order-top">
            <div>
              <span class="badge-table" style="background:var(--amber);">🔗 BILL GỘP</span>
              <span style="font-size:11px; color:var(--slate); display:block; margin-top:4px;">${u.groups.length} nhóm • Bàn ${esc(u.tables.join(", "))}</span>
            </div>
            <span class="status-pill st-new">Chờ thanh toán chung</span>
          </div>
          ${u.groups.map(g => `
            <div style="margin-bottom:8px;">
              <div style="font-weight:700; font-size:13px; margin-bottom:4px;">👤 ${esc(g.name)} — Bàn ${esc(g.table)}</div>
              <ul class="order-items">${itemLis(Object.values(g.mergedItems))}</ul>
              <div style="display:flex; justify-content:space-between; font-size:12px; color:var(--slate);"><span>Tạm tính</span><b>${fmt(g.total)}</b></div>
            </div>
          `).join('<hr style="border:none; border-top:1px dashed #fcd34d; margin:6px 0;"/>')}
          <div class="order-total"><span>TỔNG BILL GỘP:</span><span style="color:var(--primary); font-size:17px;">${fmt(u.total)}</span></div>
          <div class="order-btns">
            <button class="btn-act btn-bill" onclick="openUnitBillModal('${esc(u.uid)}', true)">🧾 Bill & QR gộp</button>
            <button class="btn-act btn-clear-table" onclick="payUnit('${esc(u.uid)}')">✅ Thanh toán gộp</button>
            <button class="btn-act" style="background:var(--slate);" onclick="unmergeUnit('${esc(u.merge.id)}')">✂️ Tách ra</button>
          </div>
        </div>
      `;
    }).join("");
  } else if (currentPosTab === "history") {
    board.style.gridTemplateColumns = "1fr";
    board.innerHTML = renderHistoryCardsHtml(paidHistory, `Tất cả lịch sử đã phục vụ (${RETENTION_DAYS} ngày gần nhất)`);
  } else if (currentPosTab === "soldout") {
    board.style.gridTemplateColumns = "1fr";
    board.innerHTML = MENU_ITEMS.map(item => {
      const isOut = soldOutIds.includes(item.id);
      return `
        <div class="menu-mgr-row">
          <div>
            <strong>${item.emoji} ${esc(item.name)}</strong>
            <span style="font-size:12px; color:var(--slate); margin-left:8px;">${fmt(item.price)} • ${esc(item.cat)}</span>
          </div>
          <button class="toggle-pill ${isOut ? 'out-stock' : 'in-stock'}" onclick="toggleSoldOut(${item.id})">
            ${isOut ? "🚫 Đang Tạm hết (Bấm mở lại)" : "✅ Còn món (Bấm báo hết)"}
          </button>
        </div>
      `;
    }).join("");
  }
}

function renderHistoryCardsHtml(list, titleText) {
  if (!list.length) {
    return `<div class="empty-state"><h3>Chưa có lịch sử bàn đã phục vụ</h3><p style="margin-top:6px;">Khi bạn bấm <b>✅ Thanh toán</b>, toàn bộ món ăn, tên khách, thời gian và số tiền đã thu sẽ được lưu lại tối đa ${RETENTION_DAYS} ngày.</p></div>`;
  }
  const itemStats = {};
  list.forEach(h => {
    (h.detailedItems || h.mergedItems || []).forEach(it => {
      const key = `${it.name}__${it.optText || ""}`;
      if (!itemStats[key]) {
        itemStats[key] = { name: it.name, optText: it.optText || "", qty: 0, total: 0, lastTime: h.paidTimeStr };
      }
      itemStats[key].qty += it.qty;
      itemStats[key].total += it.qty * it.price;
    });
  });
  const itemStatsArr = Object.values(itemStats).sort((a, b) => b.qty - a.qty);
  const totalPaidAll = list.reduce((s, h) => s + h.total, 0);

  return `
    <div class="card-box" style="padding:14px; background:#f8fafc; margin-bottom:14px;">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:10px;">
        <strong style="font-size:15px;">📊 ${esc(titleText)} (${list.length} bill)</strong>
        <strong style="color:var(--green); font-size:16px;">Tổng đã thu: ${fmt(totalPaidAll)}</strong>
      </div>
      <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(220px, 1fr)); gap:8px;">
        ${itemStatsArr.map(st => `
          <div style="background:#fff; border:1px solid var(--border); border-radius:10px; padding:8px 10px; font-size:12px;">
            <div style="font-weight:700;">${esc(st.name)}${st.optText ? ` <span style="font-weight:400; color:var(--slate);">(${esc(st.optText)})</span>` : ""}</div>
            <div style="display:flex; justify-content:space-between; margin-top:4px; color:var(--slate);">
              <span>SL: <b style="color:var(--dark);">${st.qty}</b></span>
              <b style="color:var(--primary);">${fmt(st.total)}</b>
            </div>
            <div style="font-size:11px; color:var(--slate); margin-top:2px;">Gần nhất: ${esc(st.lastTime)}</div>
          </div>
        `).join("")}
      </div>
    </div>
    <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(300px, 1fr)); gap:14px;">
      ${list.map(h => `
        <div class="order-card" style="border-color:#86efac;">
          <div class="order-top">
            <div>
              <span class="badge-table" style="background:var(--green);">Bàn ${esc(h.table)}</span>
              ${h.label ? `<b style="font-size:13px; margin-left:4px;">👤 ${esc(h.label)}</b>` : ""}
              <span style="font-size:11px; color:var(--slate); display:block; margin-top:4px;">
                🕒 Vào: <b>${esc(h.startTime || "")}</b> → Thu: <b>${esc(h.paidTimeStr)}</b>
              </span>
            </div>
            <span class="status-pill st-done">Đã thanh toán</span>
          </div>
          <ul class="order-items">
            ${(h.detailedItems || h.mergedItems || []).map(i => `
              <li>
                <span>
                  <b>${i.qty}x</b> ${esc(i.name)}${i.optText ? ` <span style="font-size:11px; color:var(--slate);">(${esc(i.optText)})</span>` : ""}
                  ${(i.who || i.time) ? `<span class="order-item-sub">${i.who ? `👤 ${esc(i.who)} • ` : ""}${i.time ? `🕒 Gọi lúc ${esc(i.time)}` : ""}</span>` : ""}
                </span>
                <span>${fmt(i.qty * i.price)}</span>
              </li>
            `).join("")}
          </ul>
          ${h.notes ? `<div class="order-note">📝 ${esc(h.notes)}</div>` : ""}
          <div class="order-total"><span>ĐÃ THU:</span><span style="color:var(--green); font-size:16px;">${fmt(h.total)}</span></div>
          <div class="order-btns">
            <button class="btn-act btn-bill" style="flex:1;" onclick="openHistoryBillModal('${esc(h.id)}')">🧾 Xem / In lại Bill</button>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

// ====== TRANG LỊCH SỬ 3 NGÀY GẦN NHẤT ======
function renderThreeDayHistory() {
  const wrap = document.getElementById("history3Content");
  if (!wrap) return;
  pruneOldHistory();

  const days = getRecentDaysList();
  const byDay = {};
  days.forEach(d => { byDay[d.key] = []; });
  paidHistory.forEach(h => {
    const k = getDayKey(h.paidAt);
    if (byDay[k]) byDay[k].push(h);
  });

  const totalAll3 = paidHistory.reduce((s, h) => s + h.total, 0);
  const cardsHtml = `
    <div class="day-cards">
      <button class="day-card ${selectedHistoryDay === 'all' ? 'active' : ''}" onclick="selectedHistoryDay='all'; renderThreeDayHistory()">
        <div class="day-card-title">📅 Cả ${RETENTION_DAYS} ngày gần nhất</div>
        <div class="day-card-money">${fmt(totalAll3)}</div>
        <div class="day-card-sub">${paidHistory.length} bill đã thanh toán</div>
      </button>
      ${days.map(d => {
        const arr = byDay[d.key] || [];
        const sum = arr.reduce((s, h) => s + h.total, 0);
        return `
          <button class="day-card ${selectedHistoryDay === d.key ? 'active' : ''}" onclick="selectedHistoryDay='${d.key}'; renderThreeDayHistory()">
            <div class="day-card-title">${esc(d.label)} (${esc(d.dateStr)})</div>
            <div class="day-card-money">${fmt(sum)}</div>
            <div class="day-card-sub">${arr.length} bill đã thanh toán</div>
          </button>
        `;
      }).join("")}
    </div>
  `;

  const filtered = selectedHistoryDay === "all" ? paidHistory : (byDay[selectedHistoryDay] || []);
  const dayInfo = days.find(d => d.key === selectedHistoryDay);
  const title = dayInfo ? `${dayInfo.label} (${dayInfo.dateStr})` : `Cả ${RETENTION_DAYS} ngày gần nhất`;
  wrap.innerHTML = cardsHtml + renderHistoryCardsHtml(filtered, title);
}

function exportThreeDayReport() {
  pruneOldHistory();
  const days = getRecentDaysList();
  const lines = [`=== BÁO CÁO DOANH THU ${RETENTION_DAYS} NGÀY GẦN NHẤT (${SHOP_NAME}) ===`, `Xuất lúc: ${fmtDateTime(Date.now())}`, ""];
  days.forEach(d => {
    const arr = paidHistory.filter(h => getDayKey(h.paidAt) === d.key);
    const sum = arr.reduce((s, h) => s + h.total, 0);
    lines.push(`📅 ${d.label} (${d.dateStr}): ${arr.length} bill — Tổng thu: ${fmt(sum)}`);
    arr.forEach(h => {
      lines.push(`   • Bàn ${h.table} | ${h.label || "Khách"} | ${h.startTime} -> ${h.paidTimeStr} | ${fmt(h.total)}`);
      (h.mergedItems || h.detailedItems || []).forEach(i => {
        lines.push(`      - ${i.qty}x ${i.name}${i.optText ? ` (${i.optText})` : ""}: ${fmt(i.qty * i.price)}`);
      });
    });
    lines.push("");
  });
  const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `bao-cao-3-ngay-${getDayKey(Date.now())}.txt`;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast("Đã tải file báo cáo 3 ngày!");
}

function setOrderStatus(id, status) {
  const o = orders.find(x => x.id === id);
  if (!o) return;
  o.status = status;
  localStorage.setItem(KEYS.orders, JSON.stringify(orders));
  renderPosBoard();
}

// ====== THANH TOÁN THEO NHÓM / GỘP NHÓM / ĐỔI NHÓM ======
function buildHistoryRecord(recId, ids, label, paidAt) {
  const idSet = new Set(ids);
  const list = orders.filter(o => idSet.has(o.id)).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  const detailedItems = [];
  const tables = new Set();
  const notes = [];
  let total = 0;
  list.forEach(o => {
    const g = effGuest(o);
    tables.add(o.table);
    total += o.total;
    if (o.note) notes.push(o.note);
    o.items.forEach(it => detailedItems.push({ ...it, time: o.time || "", who: `${g.guest} (Bàn ${o.table})` }));
  });
  const merged = {};
  detailedItems.forEach(i => {
    const k = `${i.name}__${i.optText || ""}__${i.price}`;
    if (!merged[k]) merged[k] = { name: i.name, optText: i.optText || "", price: i.price, qty: 0 };
    merged[k].qty += i.qty;
  });
  return {
    id: recId,
    table: [...tables].sort().join("+"),
    label,
    startTime: list[0] ? fmtDateTime(list[0].createdAt) : fmtDateTime(paidAt),
    paidAt,
    paidTimeStr: fmtDateTime(paidAt),
    detailedItems,
    mergedItems: Object.values(merged),
    notes: notes.join(" | "),
    total,
    orderIds: ids
  };
}

function applyPaid(recId, ids, label, paidAt) {
  (ids || []).forEach(id => { paidIds[id] = 1; });
  localStorage.setItem(KEYS.paidIds, JSON.stringify(paidIds));
  if (!paidHistory.some(h => h.id === recId)) {
    paidHistory.unshift(buildHistoryRecord(recId, ids || [], label || "", paidAt || Date.now()));
    paidHistory.sort((a, b) => (b.paidAt || 0) - (a.paidAt || 0));
    pruneOldHistory();
    localStorage.setItem(KEYS.paidHistory, JSON.stringify(paidHistory));
  }
  if (!isCustomerQRMode && isUnlocked) {
    renderPosBoard();
    if (currentTab === "history3") renderThreeDayHistory();
  }
}

async function payUnit(uid) {
  const u = buildUnits().find(x => x.uid === uid);
  if (!u) return showToast("Bill này không còn nữa");
  const label = unitLabel(u);
  if (!confirm(`Xác nhận ĐÃ THU TIỀN ${fmt(u.total)} của:\n${label}?`)) return;
  const ids = u.groups.flatMap(g => g.orders.map(o => o.id));
  const nowTs = Date.now();
  const recId = "hist_" + nowTs + "_" + Math.random().toString(36).slice(2, 6);
  applyPaid(recId, ids, label, nowTs);
  showToast(`Đã thanh toán & lưu lịch sử: ${label}`);
  await publishNtfy(`[PAID:${JSON.stringify({ recId, ids, label, paidAt: nowTs })}]`, "", "min");
}

function toggleMergeSel(key) {
  if (mergeSelection.has(key)) mergeSelection.delete(key);
  else mergeSelection.add(key);
  renderPosBoard();
}

async function mergeSelected() {
  const keys = [...mergeSelection];
  if (keys.length < 2) return showToast("Hãy chọn ít nhất 2 nhóm để gộp");
  const id = "mg" + Date.now().toString(36);
  const m = { id, keys, ts: Date.now() };
  merges[id] = m;
  localStorage.setItem(KEYS.merges, JSON.stringify(merges));
  mergeSelection.clear();
  renderPosBoard();
  showToast("Đã gộp nhóm — thanh toán chung 1 bill");
  await publishNtfy(`[MERGE:${JSON.stringify(m)}]`, "", "min");
}

async function unmergeUnit(mergeId) {
  const ts = Date.now();
  merges[mergeId] = { ...(merges[mergeId] || { id: mergeId, keys: [] }), removed: true, ts: (merges[mergeId] && merges[mergeId].ts) || ts };
  localStorage.setItem(KEYS.merges, JSON.stringify(merges));
  renderPosBoard();
  showToast("Đã tách bill gộp");
  await publishNtfy(`[UNMERGE:${JSON.stringify({ id: mergeId, ts })}]`, "", "min");
}

let pendingMoveOrderId = null;
function openMoveModal(orderId) {
  const o = orders.find(x => x.id === orderId);
  if (!o) return;
  const cur = effGuest(o);
  const targets = buildGroups().filter(g => g.table === o.table && g.guestId !== cur.guestId);
  if (!targets.length) return showToast("Bàn này chưa có nhóm khác để chuyển sang");
  pendingMoveOrderId = orderId;
  document.getElementById("moveInfoText").textContent = `Phiếu #${o.id} đang thuộc nhóm "${cur.guest}" (Bàn ${o.table}). Chuyển sang nhóm:`;
  document.getElementById("moveTargetSelect").innerHTML = targets.map(g => `<option value="${esc(g.guestId)}" data-name="${esc(g.baseName)}">${esc(g.name)}</option>`).join("");
  document.getElementById("moveModal").classList.remove("hidden");
}

function closeMoveModal() {
  document.getElementById("moveModal").classList.add("hidden");
  pendingMoveOrderId = null;
}

async function confirmMove() {
  if (!pendingMoveOrderId) return;
  const sel = document.getElementById("moveTargetSelect");
  const opt = sel.options[sel.selectedIndex];
  if (!opt) return;
  const mv = { orderId: pendingMoveOrderId, guestId: opt.value, guest: opt.dataset.name, ts: Date.now() };
  orderMoves[mv.orderId] = mv;
  localStorage.setItem(KEYS.moves, JSON.stringify(orderMoves));
  closeMoveModal();
  renderPosBoard();
  showToast("Đã chuyển phiếu sang nhóm khác");
  await publishNtfy(`[MOVE:${JSON.stringify(mv)}]`, "", "min");
}

function openHistoryBillModal(histId) {
  const h = paidHistory.find(x => x.id === histId);
  if (!h) return;
  document.getElementById("btnPrintBill").classList.remove("hidden");
  document.getElementById("vietqrSection").classList.add("hidden");
  document.getElementById("billModalTitle").textContent = `🧾 Lịch sử Bill Bàn ${h.table}`;
  const itemsList = h.mergedItems || h.detailedItems || [];
  document.getElementById("billContent").innerHTML = `
    <div style="text-align:center; font-weight:bold; margin-bottom:8px;">
      ${esc(SHOP_NAME.toUpperCase())}<br/>PHIẾU ĐÃ THANH TOÁN - BÀN ${esc(h.table)}
    </div>
    ${h.label ? `<div>Khách: <b>${esc(h.label)}</b></div>` : ""}
    <div>Vào: ${esc(h.startTime || "")}</div>
    <div>Thanh toán: ${esc(h.paidTimeStr)}</div>
    <hr style="margin:8px 0; border:none; border-top:1px dashed #94a3b8;"/>
    ${itemsList.map(i => `
      <div style="display:flex; justify-content:space-between; margin:4px 0;">
        <span>${i.qty}x ${esc(i.name)}${i.optText ? ` (${esc(i.optText)})` : ""}</span>
        <span>${fmt(i.qty * i.price)}</span>
      </div>
    `).join("")}
    <hr style="margin:8px 0; border:none; border-top:1px dashed #94a3b8;"/>
    <div style="display:flex; justify-content:space-between; font-weight:bold; font-size:15px;">
      <span>ĐÃ THANH TOÁN:</span><span>${fmt(h.total)}</span>
    </div>
  `;
  document.getElementById("billModal").classList.remove("hidden");
}

async function toggleSoldOut(itemId) {
  const idx = soldOutIds.indexOf(itemId);
  if (idx >= 0) soldOutIds.splice(idx, 1);
  else soldOutIds.push(itemId);
  localStorage.setItem(KEYS.soldOut, JSON.stringify(soldOutIds));
  renderPosBoard();
  renderMenu();
  await publishNtfy(`[SOLDOUT:${JSON.stringify(soldOutIds)}]`, "", "min");
}

function clearOrders() {
  if (!orders.length && !staffCalls.length && !paidHistory.length) return;
  if (!confirm("Xóa toàn bộ đơn hiện tại và lịch sử trên máy này?")) return;
  orders = [];
  staffCalls = [];
  tableClears = {};
  paidHistory = [];
  paidIds = {};
  merges = {};
  orderMoves = {};
  mergeSelection.clear();
  localStorage.setItem(KEYS.paidIds, "{}");
  localStorage.setItem(KEYS.merges, "{}");
  localStorage.setItem(KEYS.moves, "{}");
  localStorage.setItem(KEYS.orders, "[]");
  localStorage.setItem(KEYS.staffCalls, "[]");
  localStorage.setItem(KEYS.tableClears, "{}");
  localStorage.setItem(KEYS.paidHistory, "[]");
  renderStaffAlerts();
  renderPosBoard();
  if (currentTab === "history3") renderThreeDayHistory();
  showToast("Đã xóa toàn bộ đơn và lịch sử");
}

// ====== TÊN KHÁCH, HÓA ĐƠN & VIETQR TỰ ĐỘNG ======
function deviceId() {
  let id = localStorage.getItem(KEYS.deviceId);
  if (!id) {
    id = Math.random().toString(36).slice(2, 8);
    localStorage.setItem(KEYS.deviceId, id);
  }
  return id;
}

function getGuest(table = currentTable) {
  const store = JSON.parse(localStorage.getItem(KEYS.guest) || "{}");
  return store[table] || null;
}

function updateGuestBadge() {
  const el = document.getElementById("custSub");
  if (!el) return;
  const g = getGuest();
  el.textContent = g ? `Bàn ${currentTable} • ${g.name}` : "Chọn món bên dưới • Phục vụ tại bàn";
}

let pendingSubmitAfterName = false;
function showNameModal(thenSubmit) {
  pendingSubmitAfterName = !!thenSubmit;
  document.getElementById("nameModalTable").textContent = currentTable;
  document.getElementById("guestNameInput").value = "";
  document.getElementById("nameModal").classList.remove("hidden");
  setTimeout(() => document.getElementById("guestNameInput").focus(), 100);
}

function confirmGuestName() {
  const name = document.getElementById("guestNameInput").value.trim().replace(/\s+/g, " ").slice(0, 20);
  if (!name) return showToast("Vui lòng nhập tên của bạn");
  const store = JSON.parse(localStorage.getItem(KEYS.guest) || "{}");
  store[currentTable] = { name };
  localStorage.setItem(KEYS.guest, JSON.stringify(store));
  document.getElementById("nameModal").classList.add("hidden");
  updateGuestBadge();
  if (pendingSubmitAfterName) {
    pendingSubmitAfterName = false;
    submitOrder();
  }
}

async function openCustomerBillModal() {
  await pullHistory12h(false);
  const myKey = `${currentTable}_${deviceId()}`;
  const u = buildUnits().find(x => x.groups.some(g => g.key === myKey));
  if (!u) {
    document.getElementById("btnPrintBill").classList.add("hidden");
    document.getElementById("vietqrSection").classList.add("hidden");
    document.getElementById("billModalTitle").textContent = "🧾 Hóa đơn của bạn";
    document.getElementById("billContent").innerHTML = `<div style="text-align:center; padding:12px 0; color:var(--slate);">Bạn chưa gọi món nào (hoặc bill đã được thanh toán).</div>`;
    document.getElementById("billModal").classList.remove("hidden");
    return;
  }
  showUnitBill(u, false);
}

function openUnitBillModal(uid, isOwnerView) {
  const u = buildUnits().find(x => x.uid === uid);
  if (!u) return showToast("Bill này không còn nữa");
  showUnitBill(u, isOwnerView);
}

function openUnitBillByOrder(orderId) {
  const o = orders.find(x => x.id === orderId);
  if (!o) return;
  const g = effGuest(o);
  const key = `${o.table}_${g.guestId}`;
  const u = buildUnits().find(x => x.groups.some(gr => gr.key === key));
  if (!u) return showToast("Phiếu này đã được thanh toán");
  showUnitBill(u, true);
}

function showUnitBill(u, isOwnerView) {
  document.getElementById("btnPrintBill").classList.toggle("hidden", !isOwnerView);
  const qrBox = document.getElementById("vietqrSection");
  const isMerge = u.groups.length > 1;
  document.getElementById("billModalTitle").textContent = isMerge ? "🧾 Bill gộp" : `🧾 Bill — ${u.groups[0].name}`;

  const sections = u.groups.map(g => `
    <div style="font-weight:bold; margin-top:4px;">👤 ${esc(g.name)} — Bàn ${esc(g.table)}</div>
    ${Object.values(g.mergedItems).map(i => `
      <div style="display:flex; justify-content:space-between; margin:4px 0;">
        <span>${i.qty}x ${esc(i.name)}${i.optText ? ` (${esc(i.optText)})` : ""}</span>
        <span>${fmt(i.qty * i.price)}</span>
      </div>
    `).join("")}
    ${isMerge ? `<div style="display:flex; justify-content:space-between; font-style:italic;"><span>Tạm tính</span><span>${fmt(g.total)}</span></div>` : ""}
  `).join('<hr style="margin:8px 0; border:none; border-top:1px dashed #94a3b8;"/>');

  document.getElementById("billContent").innerHTML = `
    <div style="text-align:center; font-weight:bold; margin-bottom:8px;">
      ${esc(SHOP_NAME.toUpperCase())}<br/>${isMerge ? "PHIẾU THANH TOÁN GỘP" : "PHIẾU THANH TOÁN"}
    </div>
    <hr style="margin:8px 0; border:none; border-top:1px dashed #94a3b8;"/>
    ${sections}
    <hr style="margin:8px 0; border:none; border-top:1px dashed #94a3b8;"/>
    <div style="display:flex; justify-content:space-between; font-weight:bold; font-size:15px;">
      <span>TỔNG THANH TOÁN:</span><span>${fmt(u.total)}</span>
    </div>
  `;

  if (settings.bankId && settings.accountNo) {
    const addInfo = unitQrInfo(u);
    const qrUrl = `https://img.vietqr.io/image/${encodeURIComponent(settings.bankId)}-${encodeURIComponent(settings.accountNo)}-compact2.png?amount=${u.total}&addInfo=${encodeURIComponent(addInfo)}&accountName=${encodeURIComponent(settings.accountName || "")}`;
    document.getElementById("vietqrImg").src = qrUrl;
    document.getElementById("vietqrInfoText").innerHTML = `
      Ngân hàng: <b>${esc(settings.bankId)}</b> • STK: <b>${esc(settings.accountNo)}</b><br/>
      Chủ TK: <b>${esc(settings.accountName)}</b><br/>
      Số tiền: <b style="color:var(--primary);">${fmt(u.total)}</b> • Nội dung: <b>${esc(addInfo)}</b>
    `;
    qrBox.classList.remove("hidden");
  } else {
    qrBox.classList.add("hidden");
  }
  document.getElementById("billModal").classList.remove("hidden");
}

function closeBillModal() {
  document.getElementById("billModal").classList.add("hidden");
}

// ====== TẠO MÃ QR TỪNG BÀN (luôn trỏ về index.html) ======
function renderQRCodes() {
  const grid = document.getElementById("qrGrid");
  if (!grid) return;
  grid.innerHTML = "";
  const previewEl = document.getElementById("qrTopicPreview");
  if (previewEl) previewEl.textContent = settings.ntfyTopic || "Chưa thiết lập";

  const baseUrl = new URL("index.html", window.location.href).href.split("?")[0];

  TABLES.forEach(num => {
    const link = `${baseUrl}?mode=customer&table=${num}` + (settings.ntfyTopic ? `&topic=${encodeURIComponent(settings.ntfyTopic)}` : "");
    const card = document.createElement("div");
    card.className = "qr-card";
    card.innerHTML = `
      <div style="font-weight:800; font-size:16px; color:var(--primary);">BÀN SỐ ${num}</div>
      <div class="qr-box" id="qrBox${num}"></div>
      <div style="font-size:12px; font-weight:600;">Quét mã để gọi món</div>
      <a href="${link}" target="_blank" class="btn-sm" style="text-decoration:none; color:var(--dark);">Mở thử link Bàn ${num}</a>
    `;
    grid.appendChild(card);

    const target = document.getElementById(`qrBox${num}`);
    if (typeof QRCode !== "undefined") {
      new QRCode(target, { text: link, width: 140, height: 140 });
    } else {
      target.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(link)}" alt="QR Bàn ${num}" />`;
    }
  });
}

// ====== CÀI ĐẶT QUÁN & ĐỒNG BỘ 12H QUA NTFY.SH ======
function fillSettingsForm() {
  const t = document.getElementById("ntfyTopicInput");
  if (!t) return;
  t.value = settings.ntfyTopic || "";
  document.getElementById("bankIdInput").value = settings.bankId || "OCB";
  document.getElementById("bankAccInput").value = settings.accountNo || "";
  document.getElementById("bankNameInput").value = settings.accountName || "";
  updateVietQRPreview();
  updateSyncStatus();
}

function updateVietQRPreview() {
  const img = document.getElementById("vietqrPreviewImg");
  const txt = document.getElementById("vietqrPreviewText");
  if (!img || !txt) return;
  const bankId = document.getElementById("bankIdInput").value.trim().toUpperCase();
  const acc = document.getElementById("bankAccInput").value.trim();
  const name = document.getElementById("bankNameInput").value.trim().toUpperCase();
  if (!bankId || !acc) {
    img.src = "";
    txt.textContent = "Nhập đủ Ngân hàng & Số tài khoản để xem trước mã QR";
    return;
  }
  img.src = `https://img.vietqr.io/image/${encodeURIComponent(bankId)}-${encodeURIComponent(acc)}-compact2.png?amount=10000&addInfo=${encodeURIComponent("TEST THU")}&accountName=${encodeURIComponent(name)}`;
  txt.innerHTML = `<b>${esc(bankId)}</b> • STK: <b>${esc(acc)}</b>${name ? ` • <b>${esc(name)}</b>` : ""}`;
}

async function saveSettings() {
  const topic = document.getElementById("ntfyTopicInput").value.trim().replace(/[^a-zA-Z0-9_-]/g, "");
  if (!topic) return showToast("Vui lòng nhập mã kênh hợp lệ (không dấu, không cách)");
  settings = {
    ntfyTopic: topic,
    bankId: document.getElementById("bankIdInput").value.trim().toUpperCase(),
    accountNo: document.getElementById("bankAccInput").value.trim(),
    accountName: document.getElementById("bankNameInput").value.trim().toUpperCase()
  };
  localStorage.setItem(KEYS.settings, JSON.stringify(settings));
  connectNtfySSE();
  pullHistory12h(false);
  updateSyncStatus();
  updateVietQRPreview();
  await publishNtfy(`[BANK_CONFIG:${JSON.stringify({ bankId: settings.bankId, accountNo: settings.accountNo, accountName: settings.accountName })}]`, "", "min");
  showToast("Đã lưu & đồng bộ cài đặt VietQR!");
}

async function resetDefaultSettings() {
  settings = { ...DEFAULT_CONFIG };
  localStorage.setItem(KEYS.settings, JSON.stringify(settings));
  fillSettingsForm();
  connectNtfySSE();
  await publishNtfy(`[BANK_CONFIG:${JSON.stringify({ bankId: settings.bankId, accountNo: settings.accountNo, accountName: settings.accountName })}]`, "", "min");
  showToast("Đã khôi phục cài đặt mặc định");
}

function updateSyncStatus() {
  const el = document.getElementById("syncStatusText");
  if (!el) return;
  el.innerHTML = settings.ntfyTopic
    ? `🟢 Đang kết nối kênh: <b>${esc(settings.ntfyTopic)}</b> (Tự động kéo đơn 12 giờ qua khi mở trang)`
    : `⚪ Chưa kết nối kênh nào`;
}

function handleNtfyMessageText(msgText, isHistory = false) {
  if (!msgText) return;

  const dataMatch = msgText.match(/\[DATA:(\{.*\})\]/);
  if (dataMatch) {
    try { receiveOrder(JSON.parse(dataMatch[1]), true, !isHistory); } catch (e) {}
    return;
  }

  const clearMatch = msgText.match(/\[CLEAR_TABLE:(\{.*\})\]/);
  if (clearMatch) {
    try {
      const { table, ts, record } = JSON.parse(clearMatch[1]);
      if (ts > (tableClears[table] || 0)) {
        tableClears[table] = ts;
        localStorage.setItem(KEYS.tableClears, JSON.stringify(tableClears));
      }
      if (record && !paidHistory.some(h => h.id === record.id)) {
        paidHistory.unshift(record);
        paidHistory.sort((a, b) => (b.paidAt || 0) - (a.paidAt || 0));
        pruneOldHistory();
        localStorage.setItem(KEYS.paidHistory, JSON.stringify(paidHistory));
      }
      if (!isCustomerQRMode && isUnlocked) renderPosBoard();
    } catch (e) {}
    return;
  }

  const bankMatch = msgText.match(/\[BANK_CONFIG:(\{.*\})\]/);
  if (bankMatch) {
    try {
      const bc = JSON.parse(bankMatch[1]);
      if (bc.bankId && bc.accountNo) {
        settings.bankId = bc.bankId;
        settings.accountNo = bc.accountNo;
        settings.accountName = bc.accountName || "";
        localStorage.setItem(KEYS.settings, JSON.stringify(settings));
        if (!isCustomerQRMode && currentTab === "sync") fillSettingsForm();
      }
    } catch (e) {}
    return;
  }

  const soldOutMatch = msgText.match(/\[SOLDOUT:(\[.*\])\]/);
  if (soldOutMatch) {
    try {
      soldOutIds = JSON.parse(soldOutMatch[1]);
      localStorage.setItem(KEYS.soldOut, JSON.stringify(soldOutIds));
      renderMenu();
      if (!isCustomerQRMode && isUnlocked) renderPosBoard();
    } catch (e) {}
    return;
  }

  const paidMatch = msgText.match(/\[PAID:(\{.*\})\]/);
  if (paidMatch) {
    try {
      const p = JSON.parse(paidMatch[1]);
      applyPaid(p.recId, p.ids, p.label, p.paidAt);
    } catch (e) {}
    return;
  }

  const mergeMatch = msgText.match(/\[MERGE:(\{.*\})\]/);
  if (mergeMatch) {
    try {
      const m = JSON.parse(mergeMatch[1]);
      if (!merges[m.id]) {
        merges[m.id] = m;
        localStorage.setItem(KEYS.merges, JSON.stringify(merges));
        if (!isCustomerQRMode && isUnlocked) renderPosBoard();
      }
    } catch (e) {}
    return;
  }

  const unmergeMatch = msgText.match(/\[UNMERGE:(\{.*\})\]/);
  if (unmergeMatch) {
    try {
      const m = JSON.parse(unmergeMatch[1]);
      merges[m.id] = { ...(merges[m.id] || { id: m.id, keys: [], ts: m.ts }), removed: true };
      localStorage.setItem(KEYS.merges, JSON.stringify(merges));
      if (!isCustomerQRMode && isUnlocked) renderPosBoard();
    } catch (e) {}
    return;
  }

  const moveMatch = msgText.match(/\[MOVE:(\{.*\})\]/);
  if (moveMatch) {
    try {
      const m = JSON.parse(moveMatch[1]);
      if (!orderMoves[m.orderId] || (orderMoves[m.orderId].ts || 0) < m.ts) {
        orderMoves[m.orderId] = m;
        localStorage.setItem(KEYS.moves, JSON.stringify(orderMoves));
        if (!isCustomerQRMode && isUnlocked) renderPosBoard();
      }
    } catch (e) {}
    return;
  }

  const callMatch = msgText.match(/\[CALL:(\{.*\})\]/);
  if (callMatch && !isCustomerQRMode && isUnlocked) {
    try {
      const callObj = JSON.parse(callMatch[1]);
      if (!isHistory || (Date.now() - (callObj.createdAt || 0) < 30 * 60 * 1000)) {
        receiveStaffCall(callObj, !isHistory);
      }
    } catch (e) {}
  }
}

async function pullHistory12h(notify = false) {
  if (!settings.ntfyTopic) return;
  try {
    const res = await fetch(`https://ntfy.sh/${encodeURIComponent(settings.ntfyTopic)}/json?poll=1&since=12h`);
    if (!res.ok) return;
    const text = await res.text();
    const lines = text.trim().split("\n").filter(Boolean);
    let foundCount = 0;
    lines.forEach(line => {
      try {
        const payload = JSON.parse(line);
        if (payload.event === "message" && payload.message) {
          handleNtfyMessageText(payload.message, true);
          foundCount++;
        }
      } catch (e) {}
    });
    if (notify) showToast(`Đã đồng bộ lịch sử 12 giờ qua (${foundCount} bản tin)`);
  } catch (e) {
    if (notify) showToast("Không thể kết nối mạng để kéo lịch sử");
  }
}

function connectNtfySSE() {
  if (sseSource) sseSource.close();
  updateSyncStatus();
  if (!settings.ntfyTopic) return;

  sseSource = new EventSource(`https://ntfy.sh/${encodeURIComponent(settings.ntfyTopic)}/sse`);
  sseSource.onmessage = (e) => {
    try {
      const payload = JSON.parse(e.data);
      if (payload.event === "message" && payload.message) {
        handleNtfyMessageText(payload.message, false);
      }
    } catch (err) {}
  };
}

function startStaffApp() {
  pruneOldHistory();
  renderStaffAlerts();
  renderPosBoard();
  fillSettingsForm();
  switchTab(currentTab);
  pullHistory12h(false);
  connectNtfySSE();

  const autoWakeOnce = () => {
    if (!wakeLock && !isCustomerQRMode) requestWakeLock(true);
    document.removeEventListener("click", autoWakeOnce);
  };
  document.addEventListener("click", autoWakeOnce, { once: true });
}

// ====== KHỞI TẠO ======
window.addEventListener("storage", (e) => {
  if (e.key === KEYS.orders && !isCustomerQRMode && isUnlocked) {
    orders = JSON.parse(e.newValue || "[]");
    renderPosBoard();
  } else if (e.key === KEYS.soldOut) {
    soldOutIds = JSON.parse(e.newValue || "[]");
    renderMenu();
    if (!isCustomerQRMode && isUnlocked) renderPosBoard();
  }
});

(function init() {
  populateTableSelect();

  const params = new URLSearchParams(window.location.search);
  if (params.get("topic")) settings.ntfyTopic = params.get("topic");

  if (params.get("table")) {
    currentTable = params.get("table").padStart(2, "0");
    if (!TABLES.includes(currentTable)) TABLES.push(currentTable);
    populateTableSelect();
    changeTable(currentTable);
  }

  if (APP_MODE === "customer") {
    isCustomerQRMode = true;
    document.body.classList.add("customer-only");
    if (params.get("table")) {
      const ts = document.getElementById("tableSelect");
      const tbf = document.getElementById("tableBadgeFixed");
      if (ts) ts.classList.add("hidden");
      if (tbf) tbf.classList.remove("hidden");
    }
    switchTab("customer");
    updateGuestBadge();
    if (!getGuest()) showNameModal(false);
    pullHistory12h(false);
    connectNtfySSE();
  } else {
    const gate = document.getElementById("pinGate");
    if (isUnlocked) {
      if (gate) gate.classList.add("hidden");
      startStaffApp();
    } else if (gate) {
      gate.classList.remove("hidden");
      setTimeout(() => document.getElementById("pinInput").focus(), 100);
    }
  }

  renderMenu();
  checkOrderCooldownUI();
})();
