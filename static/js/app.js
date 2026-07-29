const elements = Object.fromEntries(
  [
    "setupView", "stageView", "readyCount",
    "pdfItem", "pdfRow", "pdfSummary", "pdfAct", "pdfBody", "dropZone", "pdfInput", "pdfMeta",
    "langItem", "langSummary",
    "soundItem", "soundSummary",
    "keyOrb", "keyStatusTitle", "keyStatusText", "editKeyBtn", "keyForm", "apiKeyInput",
    "micSelect", "micTestBtn", "micTestLabel", "setupMeter",
    "enterStageBtn", "setupError",
    "slideImage", "slideLoader", "stageSurface", "stageAlert", "stageAlertText", "stageControls",
    "translateBtn", "smallerBtn", "largerBtn", "captionSizeText", "settingsBtn",
    "fullscreenPrompt", "captionLayer", "sourceCaption", "targetCaption",
    "settingsDrawer", "closeSettingsBtn", "drawerBackdrop", "stageLanguageSelect", "stageMicSelect",
    "zhToggleBtn", "captionWindowBtn", "fullscreenBtn", "resetCaptionPosBtn",
    "replacePdfBtn", "leaveStageBtn", "toastStack",
  ].map((id) => [id, document.getElementById(id)])
);

const state = {
  deck: null,
  language: localStorage.getItem("liveCaptionLanguage") || "en",
  hasApiKey: false,
  apiKeySource: "missing",
  micId: localStorage.getItem("liveCaptionMic") || "",
  micTestStream: null,
  micTestContext: null,
  micTestFrame: null,
  page: 1,
  running: false,
  websocket: null,
  reconnectTimer: null,
  reconnectAttempts: 0,
  stream: null,
  audioContext: null,
  processor: null,
  analyser: null,
  currentTarget: "",
  currentSource: "",
  showSource: localStorage.getItem("liveCaptionShowSource") === "true",
  captionScale: Number(localStorage.getItem("liveCaptionScale") || ".9"),
  pipWindow: null,
  pipTarget: null,
  pipSource: null,
  controlsTimer: null,
  lastActivity: 0,
  alertTimer: null,
  wasDisconnected: false,
  liveStatus: "idle",
  silenceTimer: null,
  silent: false,
  lastCaptionAt: 0,
  // 字幕被拖到哪：相對預設位置的位移，記在 localStorage，下次上台還在同一個地方
  capX: Number(localStorage.getItem("liveCaptionX") || 0),
  capY: Number(localStorage.getItem("liveCaptionY") || 0),
};

const captionChannel = "BroadcastChannel" in window ? new BroadcastChannel("gemini-live-caption") : null;
const languageLabels = { en: "English", ja: "日本語", ko: "한국어" };
const nativeLabels = { en: "英文", ja: "日文", ko: "韓文" };
/* 電視字幕：一句話累積到塞滿一行就整行換新。
   單位是「半形格」不是字元數——中日韓的字寬是英數的兩倍，
   用字元數算的話英文 64 字就換行、日文 64 字卻是好幾句的量，
   結果日文韓文永遠在往右長不換行（2026-07-28 SAM 實測回報）。 */
const PAGE_WIDTH = 64;
// 中日韓與全形標點：中日韓統一表意文字、平假名片假名、諺文、全形符號
const WIDE_CHAR = /[ᄀ-ᇿ⺀-〿぀-ヿ㐀-䶿一-鿿ꥠ-꥿가-힯豈-﫿︰-﹏＀-｠￠-￦]/;

function displayWidth(text) {
  let width = 0;
  for (const character of text) width += WIDE_CHAR.test(character) ? 2 : 1;
  return width;
}
// 縮字的下限。到底了還是塞不下就讓它裁掉，總比字小到台下看不到好。
const CAP_FIT_MIN = .55;
const CONTROLS_IDLE_MS = 2600;

function toast(message, type = "info") {
  const item = document.createElement("div");
  item.className = `toast ${type === "error" ? "error" : ""}`;
  item.textContent = message;
  elements.toastStack.appendChild(item);
  setTimeout(() => item.remove(), 5000);
}

function setSetupError(message = "") {
  elements.setupError.textContent = message;
}

function broadcast(payload) {
  if (captionChannel) captionChannel.postMessage(payload);
}

/* ── 上台前檢查表 ──────────────────────────────────────────────
   清單本身就是設定，一次只展開一項。四盞燈全綠才放行。 */

function setLamp(item, ready) {
  const lamp = item.querySelector(".lamp");
  lamp.classList.toggle("on", ready);
  lamp.classList.toggle("wait", !ready);
}

function toggleCheckItem(item) {
  const willOpen = !item.classList.contains("open");
  document.querySelectorAll(".check-item").forEach((node) => {
    node.classList.remove("open");
    node.querySelector(".check-row").setAttribute("aria-expanded", "false");
  });
  if (!willOpen) return;
  item.classList.add("open");
  item.querySelector(".check-row").setAttribute("aria-expanded", "true");
}

function micLabel() {
  return elements.micSelect.selectedOptions[0]?.textContent || "預設麥克風";
}

function updateReadiness() {
  const hasDeck = Boolean(state.deck);

  setLamp(elements.pdfItem, hasDeck);
  elements.pdfSummary.textContent = hasDeck
    ? `${state.deck.filename} · ${state.deck.pageCount} 頁`
    : "還沒選檔案 · PDF、最多 200 頁，只在這台電腦處理";
  elements.pdfAct.textContent = hasDeck ? "更換" : "選擇檔案";

  setLamp(elements.soundItem, state.hasApiKey);
  elements.soundSummary.textContent = state.hasApiKey
    ? `${micLabel()} · Gemini API key ${state.apiKeySource === "environment" ? "已從 .env 讀取" : "已就緒"}`
    : `${micLabel()} · 還沒設定 Gemini API key`;

  // 語言永遠算就緒，它有預設值
  const ready = [hasDeck, true, state.hasApiKey].filter(Boolean).length;
  elements.readyCount.textContent = String(ready);

  // 按鈕不能按的時候一定要說出缺什麼，不能只是變灰
  const missing = [];
  if (!hasDeck) missing.push("選擇你的 PDF 簡報");
  if (!state.hasApiKey) missing.push("設定 Gemini API key");
  elements.enterStageBtn.disabled = missing.length > 0;
  elements.enterStageBtn.textContent = missing.length === 0
    ? "進入全螢幕簡報 →"
    : missing.length === 1
      ? `還差一步：${missing[0]}`
      : `還差兩步：${missing.join("、")}`;
}

function updateKeyStatus() {
  elements.keyOrb.className = `status-orb ${state.hasApiKey ? "ready" : "error"}`;
  if (state.hasApiKey) {
    elements.keyStatusTitle.textContent = "Gemini API key 已就緒";
    elements.keyStatusText.textContent = state.apiKeySource === "environment" ? "從 .env 安全讀取" : "只在本次執行期間使用";
    elements.editKeyBtn.textContent = "更換";
    elements.keyForm.classList.add("hidden");
  } else {
    elements.keyStatusTitle.textContent = "尚未設定 API key";
    elements.keyStatusText.textContent = "使用你自己的 Gemini 額度";
    elements.editKeyBtn.textContent = "設定";
    elements.keyForm.classList.remove("hidden");
  }
  updateReadiness();
}

async function loadConfig() {
  try {
    const response = await fetch("/api/config");
    const data = await response.json();
    state.hasApiKey = Boolean(data.hasApiKey);
    state.apiKeySource = data.apiKeySource || "missing";
    updateKeyStatus();
  } catch (_error) {
    state.hasApiKey = false;
    state.apiKeySource = "missing";
    updateKeyStatus();
    setSetupError("無法讀取本機程式狀態，請重新啟動。")
  }
}

function selectLanguage(language) {
  state.language = language in languageLabels ? language : "en";
  localStorage.setItem("liveCaptionLanguage", state.language);
  document.querySelectorAll(".segment").forEach((button) => {
    const selected = button.dataset.lang === state.language;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-checked", String(selected));
  });
  elements.stageLanguageSelect.value = state.language;
  elements.langSummary.textContent = `${languageLabels[state.language]} · 台下看到的是${nativeLabels[state.language]}字幕`;
}

async function uploadPdf(file) {
  if (!file) return;
  if (file.type && file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    setSetupError("請選擇 PDF 檔案。")
    return;
  }
  if (file.size > 50 * 1024 * 1024) {
    setSetupError("PDF 不可超過 50 MB。")
    return;
  }

  setSetupError("");
  elements.pdfMeta.textContent = "正在讀取 PDF…";
  elements.dropZone.classList.add("dragging");
  const form = new FormData();
  form.append("pdf", file);

  try {
    const response = await fetch("/api/deck", { method: "POST", body: form });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "PDF 讀取失敗。")
    state.deck = data;
    state.page = 1;
    elements.pdfMeta.textContent = `${data.pageCount} 頁 · 已讀取完成`;
    elements.dropZone.querySelector(".drop-main").textContent = data.filename;
    updateReadiness();
    if (!elements.stageView.classList.contains("hidden")) await showPage(1);
  } catch (error) {
    state.deck = null;
    elements.pdfMeta.textContent = "用 Keynote 或 Google Slides？先匯出成 PDF";
    setSetupError(error.message);
    updateReadiness();
  } finally {
    elements.dropZone.classList.remove("dragging");
    elements.pdfInput.value = "";
  }
}

async function loadMicrophones(requestPermission = false) {
  if (!navigator.mediaDevices?.enumerateDevices) {
    toast("此瀏覽器無法讀取麥克風，請改用最新版 Chrome 或 Edge。", "error");
    return;
  }
  let temporaryStream = null;
  try {
    if (requestPermission) {
      temporaryStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    }
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === "audioinput");
    const options = [{ deviceId: "", label: "預設麥克風" }, ...devices.map((device, index) => ({ deviceId: device.deviceId, label: device.label || `麥克風 ${index + 1}` }))];
    [elements.micSelect, elements.stageMicSelect].forEach((select) => {
      const previous = state.micId;
      select.replaceChildren(...options.map((device) => {
        const option = document.createElement("option");
        option.value = device.deviceId;
        option.textContent = device.label;
        return option;
      }));
      if (options.some((device) => device.deviceId === previous)) select.value = previous;
    });
    updateReadiness();
  } catch (error) {
    toast(`無法存取麥克風：${error.message}`, "error");
  } finally {
    if (temporaryStream) temporaryStream.getTracks().forEach((track) => track.stop());
  }
}

function microphoneConstraints() {
  return {
    audio: state.micId
      ? { deviceId: { exact: state.micId }, echoCancellation: true, noiseSuppression: true }
      : { echoCancellation: true, noiseSuppression: true },
  };
}

function stopMeter(frameName, contextName, streamName, fillElement) {
  if (state[frameName]) cancelAnimationFrame(state[frameName]);
  state[frameName] = null;
  if (state[contextName]) state[contextName].close().catch(() => {});
  state[contextName] = null;
  if (state[streamName]) state[streamName].getTracks().forEach((track) => track.stop());
  state[streamName] = null;
  if (fillElement) fillElement.style.transform = "scaleX(0)";
}

function animateMeter(analyser, fillElement, frameName) {
  const samples = new Uint8Array(analyser.fftSize);
  const draw = () => {
    analyser.getByteTimeDomainData(samples);
    let energy = 0;
    for (const sample of samples) {
      const normalized = (sample - 128) / 128;
      energy += normalized * normalized;
    }
    const rms = Math.sqrt(energy / samples.length);
    fillElement.style.transform = `scaleX(${Math.min(1, rms / 0.08)})`;
    state[frameName] = requestAnimationFrame(draw);
  };
  draw();
}

async function toggleMicTest() {
  if (state.micTestStream) {
    stopMeter("micTestFrame", "micTestContext", "micTestStream", elements.setupMeter);
    elements.micTestBtn.classList.remove("running");
    elements.micTestLabel.textContent = "測試聲音";
    return;
  }
  try {
    state.micTestStream = await navigator.mediaDevices.getUserMedia(microphoneConstraints());
    await loadMicrophones(false);
    state.micTestContext = new AudioContext();
    const source = state.micTestContext.createMediaStreamSource(state.micTestStream);
    const analyser = state.micTestContext.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    animateMeter(analyser, elements.setupMeter, "micTestFrame");
    elements.micTestBtn.classList.add("running");
    elements.micTestLabel.textContent = "停止測試";
  } catch (error) {
    toast(`無法啟動麥克風：${error.message}`, "error");
  }
}

async function showPage(pageNumber) {
  if (!state.deck) return;
  const target = Math.max(1, Math.min(state.deck.pageCount, pageNumber));
  state.page = target;
  elements.slideLoader.classList.remove("hidden");
  const imageUrl = `/api/deck/${state.deck.deckId}/page/${target}.png`;
  const image = new Image();
  image.onload = () => {
    elements.slideImage.src = imageUrl;
    elements.slideImage.alt = `投影片第 ${target} 頁，共 ${state.deck.pageCount} 頁`;
    elements.slideImage.classList.remove("hidden");
    elements.slideLoader.classList.add("hidden");
    preloadPage(target + 1);
  };
  image.onerror = () => {
    elements.slideLoader.classList.add("hidden");
    toast("投影片頁面載入失敗，請重新上傳 PDF。", "error");
  };
  image.src = imageUrl;
}

function preloadPage(pageNumber) {
  if (!state.deck || pageNumber > state.deck.pageCount) return;
  const image = new Image();
  image.src = `/api/deck/${state.deck.deckId}/page/${pageNumber}.png`;
}

/* ── 斷線提示 ──────────────────────────────────────────────────
   正常翻譯時畫面完全乾淨（投影幕就是這個畫面）。
   只有斷線才從頂部滑下橫幅，同時把字幕調暗，讓講者知道螢幕上這句是舊的。 */

function hideStageAlert() {
  elements.stageAlert.classList.add("hidden");
  elements.stageAlert.classList.remove("ok");
  elements.stageView.classList.remove("alerting");
}

function updateStageAlert(status, label) {
  const broken = status === "reconnecting" || status === "error";
  elements.captionLayer.classList.toggle("stale", broken);
  clearTimeout(state.alertTimer);

  if (broken) {
    state.wasDisconnected = true;
    elements.stageAlert.classList.remove("hidden", "ok");
    elements.stageAlertText.textContent = label
      || (status === "error" ? "翻譯連線失敗" : "翻譯連線中斷，正在重新連線…");
    elements.stageView.classList.add("alerting");
    return;
  }

  if (status === "live" && state.wasDisconnected) {
    state.wasDisconnected = false;
    elements.stageAlert.classList.remove("hidden");
    elements.stageAlert.classList.add("ok");
    elements.stageAlertText.textContent = "已重新連上";
    elements.stageView.classList.add("alerting");
    state.alertTimer = setTimeout(hideStageAlert, 2000);
    return;
  }

  if (status === "idle") state.wasDisconnected = false;
  if (!state.silent) hideStageAlert();
}

function setLiveStatus(status, label) {
  state.liveStatus = status;
  updateStageAlert(status, label);
  broadcast({ type: "status", status });
}

/* 收不到聲音的看門狗。
   2026-07-28 SAM 實戰踩到：沒先在設定頁測過麥克風就直接上台按翻譯，
   連線是通的、畫面也顯示「正在聆聽中文…」，但講話完全沒有字幕，而且毫無提示。
   與其讓它默默失敗，不如講清楚要去哪裡檢查。 */
const SILENCE_LIMIT_MS = 12000;

function checkSilence() {
  if (!state.running || state.liveStatus !== "live") return;
  const silent = Date.now() - state.lastCaptionAt > SILENCE_LIMIT_MS;
  if (silent === state.silent) return;
  state.silent = silent;
  if (silent) {
    elements.stageAlert.classList.remove("hidden", "ok");
    elements.stageAlertText.textContent = "一直收不到聲音，檢查麥克風有沒有靜音或選錯";
    elements.stageView.classList.add("alerting");
  } else {
    hideStageAlert();
  }
}

function startSilenceWatch() {
  stopSilenceWatch();
  state.lastCaptionAt = Date.now();
  state.silenceTimer = setInterval(checkSilence, 2000);
}

function stopSilenceWatch() {
  clearInterval(state.silenceTimer);
  state.silenceTimer = null;
  state.silent = false;
}

/* ── 浮動控制列 ────────────────────────────────────────────────
   投影幕就是講者的螢幕，所以平常什麼都不顯示。
   滑鼠或鍵盤一動就浮出來，停幾秒自己收掉——跟影片播放器一樣。 */

function checkControlsIdle() {
  const busy = elements.settingsDrawer.classList.contains("open")
    || elements.stageControls.matches(":hover")
    || elements.stageControls.contains(document.activeElement);
  if (busy) state.lastActivity = Date.now();
  if (Date.now() - state.lastActivity < CONTROLS_IDLE_MS) return;
  clearInterval(state.controlsTimer);
  state.controlsTimer = null;
  elements.stageView.classList.remove("controls-awake");
}

function wakeControls() {
  state.lastActivity = Date.now();
  elements.stageView.classList.add("controls-awake");
  if (!state.controlsTimer) state.controlsTimer = setInterval(checkControlsIdle, 400);
}

/* 控制列刻意做得「叫才來」：報告中翻頁、調字級、拖字幕都不該把它召喚到投影幕上。
   規則是滑鼠移到畫面最下面那條才出現，跟工具列停靠一樣。 */
const CONTROLS_HOT_ZONE = 120;

function maybeWakeFromPointer(event) {
  if (elements.settingsDrawer.classList.contains("open")) return;
  if (elements.captionLayer.classList.contains("dragging")) return;
  const fromBottom = elements.stageView.getBoundingClientRect().bottom - event.clientY;
  if (fromBottom <= CONTROLS_HOT_ZONE) wakeControls();
}

function sleepControlsNow() {
  clearInterval(state.controlsTimer);
  state.controlsTimer = null;
  elements.stageView.classList.remove("controls-awake");
}

// 字級全部交給 CSS 的 calc(Nvw * var(--capScale))，這裡只負責改那顆變數。
// 浮窗是獨立的 document，變數不會繼承過去，所以要各設一次。
function applyCaptionScale() {
  const value = String(state.captionScale);
  document.body.style.setProperty("--capScale", value);
  if (state.pipWindow) state.pipWindow.document.body.style.setProperty("--capScale", value);
}

/* ── 字幕拖動 ──────────────────────────────────────────────────
   像 YouTube 字幕那樣用滑鼠抓著搬。位移記在 localStorage，下次上台還在原地。
   會夾在畫面內，免得拖出去之後找不回來（真的弄丟了還有面板的「字幕位置歸位」）。 */
function applyCaptionPosition() {
  elements.captionLayer.style.setProperty("--capX", `${state.capX}px`);
  elements.captionLayer.style.setProperty("--capY", `${state.capY}px`);
}

function clampCaptionPosition() {
  const stage = elements.stageView.getBoundingClientRect();
  const layer = elements.captionLayer.getBoundingClientRect();
  if (!stage.width || !layer.width) return;
  const margin = 8;
  // 先把位移退回去，算出「沒被拖過」時的位置，再夾出合法範圍
  const baseLeft = layer.left - state.capX;
  const baseTop = layer.top - state.capY;
  const minX = stage.left + margin - baseLeft;
  const maxX = stage.right - margin - layer.width - baseLeft;
  const minY = stage.top + margin - baseTop;
  const maxY = stage.bottom - margin - layer.height - baseTop;
  state.capX = maxX < minX ? (minX + maxX) / 2 : Math.min(maxX, Math.max(minX, state.capX));
  state.capY = maxY < minY ? (minY + maxY) / 2 : Math.min(maxY, Math.max(minY, state.capY));
  applyCaptionPosition();
}

function startCaptionDrag(event) {
  if (event.button !== 0) return;
  event.preventDefault();
  const startX = event.clientX - state.capX;
  const startY = event.clientY - state.capY;
  elements.captionLayer.classList.add("dragging");
  event.target.setPointerCapture?.(event.pointerId);

  const move = (moveEvent) => {
    state.capX = moveEvent.clientX - startX;
    state.capY = moveEvent.clientY - startY;
    applyCaptionPosition();
  };
  const end = () => {
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", end);
    document.removeEventListener("pointercancel", end);
    elements.captionLayer.classList.remove("dragging");
    clampCaptionPosition();
    localStorage.setItem("liveCaptionX", String(Math.round(state.capX)));
    localStorage.setItem("liveCaptionY", String(Math.round(state.capY)));
  };
  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", end);
  document.addEventListener("pointercancel", end);
}

function resetCaptionPosition() {
  state.capX = 0;
  state.capY = 0;
  localStorage.removeItem("liveCaptionX");
  localStorage.removeItem("liveCaptionY");
  applyCaptionPosition();
  toast("字幕位置已歸位。");
}

// 強制一行：量完內容寬度，塞不下就往下壓字級，不換行。
function fitCaption(element) {
  if (!element || element.classList.contains("hidden")) return;
  element.style.setProperty("--capFit", "1");
  // 容器現在是貼著內容的，量它沒意義——直接算螢幕給得起的寬度（對齊 CSS 的 max-width）
  const available = Math.min(elements.stageView.clientWidth * .94, 1740);
  const needed = element.scrollWidth;
  if (!available || !needed || needed <= available) return;
  element.style.setProperty("--capFit", String(Math.max(CAP_FIT_MIN, (available / needed) * .98)));
}

function swapCaption() {
  elements.targetCaption.classList.remove("swap");
  void elements.targetCaption.offsetWidth;
  elements.targetCaption.classList.add("swap");
}

function updateCaptionViews() {
  elements.targetCaption.textContent = state.currentTarget || "";
  // 還沒開始翻譯就整個不顯示——投影幕就是這個畫面，沒必要讓台下看到說明文字。
  // 只有已經在聽、還沒收到句子時才給講者一個「有在跑」的訊號。
  if (!state.currentTarget && state.running) {
    const placeholder = document.createElement("span");
    placeholder.className = "caption-placeholder";
    placeholder.textContent = "正在聆聽中文…";
    elements.targetCaption.appendChild(placeholder);
  }
  elements.sourceCaption.textContent = state.currentSource || "";
  elements.sourceCaption.classList.toggle("hidden", !state.showSource || !state.currentSource);
  fitCaption(elements.targetCaption);
  fitCaption(elements.sourceCaption);
  if (state.pipTarget) state.pipTarget.textContent = state.currentTarget || "等待下一句…";
  if (state.pipSource) {
    state.pipSource.textContent = state.currentSource;
    state.pipSource.classList.toggle("hidden", !state.showSource || !state.currentSource);
  }
  broadcast({ type: "caption", target: state.currentTarget, source: state.currentSource, showSource: state.showSource, captionScale: state.captionScale });
}

function addTargetText(text) {
  if (!text) return;
  // 塞滿一行就整行換新，從新片段重顯示；新行開頭帶淡入，像電視字幕一句句換。
  if (displayWidth(state.currentTarget + text) > PAGE_WIDTH) state.currentTarget = "";
  if (state.currentTarget === "") swapCaption();
  state.currentTarget += text;
  state.lastCaptionAt = Date.now();
  updateCaptionViews();
}

function addSourceText(text) {
  if (!text) return;
  state.currentSource += text;
  if (state.currentSource.length > 180) state.currentSource = state.currentSource.slice(-180);
  state.lastCaptionAt = Date.now();
  updateCaptionViews();
}

function scheduleReconnect() {
  if (!state.running || state.reconnectTimer) return;
  setLiveStatus("reconnecting");
  const delay = Math.min(8000, 1000 * 2 ** state.reconnectAttempts);
  state.reconnectAttempts += 1;
  state.reconnectTimer = setTimeout(() => {
    state.reconnectTimer = null;
    if (state.running) connectWebSocket();
  }, delay);
}

function handleGeminiError(message) {
  const text = message.message || "Gemini 連線發生錯誤。";
  toast(text, "error");
  setLiveStatus("error", text);
  if (["missing_api_key", "invalid_api_key", "quota_exhausted", "model_unavailable"].includes(message.code)) {
    stopTranslation(false, true);
  }
}

function connectWebSocket() {
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  state.websocket = new WebSocket(`${protocol}://${location.host}/ws?lang=${encodeURIComponent(state.language)}`);
  state.websocket.binaryType = "arraybuffer";
  setLiveStatus("connecting");
  state.websocket.addEventListener("open", () => { state.reconnectAttempts = 0; });
  state.websocket.addEventListener("message", (event) => {
    let message;
    try { message = JSON.parse(event.data); } catch (_error) { return; }
    if (message.type === "status" && message.state === "ready") setLiveStatus("live");
    if (message.type === "status" && message.state === "reconnecting") setLiveStatus("reconnecting");
    if (message.type === "input") addSourceText(message.text || "");
    if (message.type === "output") addTargetText(message.text || "");
    if (message.type === "turn_complete") {
      state.currentTarget = "";
      state.currentSource = "";
    }
    if (message.type === "error") handleGeminiError(message);
  });
  state.websocket.addEventListener("close", () => {
    state.websocket = null;
    if (state.running) scheduleReconnect();
  });
}

async function startTranslation() {
  if (state.running) return;
  if (!state.hasApiKey) {
    toast("請先設定 Gemini API key。", "error");
    leaveStage();
    return;
  }
  if (state.micTestStream) await toggleMicTest();

  try {
    state.stream = await navigator.mediaDevices.getUserMedia(microphoneConstraints());
    await loadMicrophones(false);
    // 照中研院實戰版：直接開 16kHz 的 AudioContext，瀏覽器自動把麥克風降頻到 16k，
    // 音訊乾淨、不用手動重採樣（手動降頻容易產生失真雜音，反而讓 Gemini 聽不清）。
    state.audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    if (state.audioContext.state === "suspended") await state.audioContext.resume();
    await state.audioContext.audioWorklet.addModule("/static/js/pcm-processor.js");
    const source = state.audioContext.createMediaStreamSource(state.stream);
    state.analyser = state.audioContext.createAnalyser();
    state.analyser.fftSize = 1024;
    state.processor = new AudioWorkletNode(state.audioContext, "pcm16-processor");
    const silentGain = state.audioContext.createGain();
    silentGain.gain.value = 0;
    source.connect(state.analyser);
    source.connect(state.processor);
    state.processor.connect(silentGain).connect(state.audioContext.destination);
    // 連續送：只要連線開著就把音訊送去 Gemini，跟中研院版一樣（不做靜音門檻）。
    state.processor.port.onmessage = (event) => {
      if (state.websocket?.readyState === WebSocket.OPEN) state.websocket.send(event.data);
    };

    state.running = true;
    state.currentTarget = "";
    state.currentSource = "";
    elements.translateBtn.classList.add("running");
    elements.translateBtn.querySelector("strong").textContent = "停止翻譯";
    connectWebSocket();
    startSilenceWatch();
    updateCaptionViews();
  } catch (error) {
    const message = `無法啟動麥克風：${error.message}`;
    toast(message, "error");
    setLiveStatus("error", message);
    stopTranslation(false, true);
  }
}

function stopTranslation(showIdle = true, preserveStatus = false) {
  state.running = false;
  stopSilenceWatch();
  if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
  state.reconnectTimer = null;
  if (state.websocket) {
    try { state.websocket.close(); } catch (_error) {}
    state.websocket = null;
  }
  if (state.processor) {
    state.processor.port.onmessage = null;
    try { state.processor.disconnect(); } catch (_error) {}
    state.processor = null;
  }
  if (state.audioContext) state.audioContext.close().catch(() => {});
  state.audioContext = null;
  if (state.stream) state.stream.getTracks().forEach((track) => track.stop());
  state.stream = null;
  state.analyser = null;
  elements.translateBtn.classList.remove("running");
  elements.translateBtn.querySelector("strong").textContent = "開始翻譯";
  if (showIdle && !preserveStatus) setLiveStatus("idle");
  updateCaptionViews();
}

/* 上台前先把麥克風叫醒一次。
   2026-07-28 SAM 實戰：沒先按過「測試聲音」就上台，按翻譯後完全沒字幕；
   回設定頁測過麥克風再上台就正常。兩者唯一的差別就是「這個 session 有沒有呼叫過
   getUserMedia」——權限還沒給、或存下來的裝置 ID 已經失效，都會在這一步才爆。
   與其讓它在台上爆，不如在還沒上台時先試一次，順便驗證裝置是真的能用。 */
async function warmUpMicrophone() {
  if (state.micTestStream) return true;   // 剛測過就不用再借一次
  try {
    const stream = await navigator.mediaDevices.getUserMedia(microphoneConstraints());
    stream.getTracks().forEach((track) => track.stop());
    await loadMicrophones(false);         // 有權限後裝置清單才拿得到真名字與 ID
    return true;
  } catch (error) {
    // 存起來的裝置不見了就退回預設麥克風再試一次，不要整個擋住
    if (state.micId) {
      state.micId = "";
      localStorage.removeItem("liveCaptionMic");
      elements.micSelect.value = "";
      elements.stageMicSelect.value = "";
      return warmUpMicrophone();
    }
    setSetupError(`麥克風沒辦法使用：${error.message}。請在「聲音與連線」按一次「測試聲音」確認。`);
    return false;
  }
}

async function enterStage() {
  if (!state.deck || !state.hasApiKey) return;
  if (!await warmUpMicrophone()) return;
  if (state.micTestStream) toggleMicTest();
  elements.setupView.classList.add("hidden");
  elements.stageView.classList.remove("hidden");
  applyStagePreferences();
  showPage(1);
  wakeControls();
  try {
    await elements.stageView.requestFullscreen();
  } catch (_error) {
    syncFullscreenUi();
  }
}

function leaveStage() {
  stopTranslation();
  closeSettings();
  sleepControlsNow();
  hideStageAlert();
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  elements.stageView.classList.add("hidden");
  elements.fullscreenPrompt.classList.add("hidden");
  elements.setupView.classList.remove("hidden");
}

/* ── 危險動作要按兩次 ──────────────────────────────────────────
   「更換 PDF」和「離開簡報」會把講者踢出簡報，上台中誤按一次就完了。 */
const dangerTimers = new Map();

function resetDanger(button) {
  clearTimeout(dangerTimers.get(button));
  dangerTimers.delete(button);
  button.classList.remove("confirming");
  button.textContent = button.dataset.label;
}

function armDanger(button, action) {
  button.addEventListener("click", () => {
    if (button.classList.contains("confirming")) {
      resetDanger(button);
      action();
      return;
    }
    document.querySelectorAll(".drawer-action.danger.confirming").forEach(resetDanger);
    button.classList.add("confirming");
    button.textContent = button.dataset.confirm;
    dangerTimers.set(button, setTimeout(() => resetDanger(button), 4000));
  });
}

function openSettings() {
  wakeControls();
  elements.settingsDrawer.removeAttribute("inert");
  elements.settingsDrawer.classList.add("open");
  elements.settingsDrawer.setAttribute("aria-hidden", "false");
  elements.drawerBackdrop.classList.remove("hidden");
}

function closeSettings() {
  document.querySelectorAll(".drawer-action.danger.confirming").forEach(resetDanger);
  elements.settingsDrawer.classList.remove("open");
  if (elements.settingsDrawer.contains(document.activeElement)) document.activeElement.blur();
  elements.settingsDrawer.setAttribute("inert", "");
  elements.settingsDrawer.setAttribute("aria-hidden", "true");
  elements.drawerBackdrop.classList.add("hidden");
}

function toggleSettings() {
  if (elements.settingsDrawer.classList.contains("open")) closeSettings();
  else openSettings();
}

function applyStagePreferences() {
  state.captionScale = Number.isFinite(state.captionScale) ? Math.max(.4, Math.min(1.8, state.captionScale)) : .9;
  applyCaptionScale();
  elements.captionSizeText.textContent = `${Math.round(state.captionScale * 100)}%`;
  elements.zhToggleBtn.classList.toggle("on", state.showSource);
  elements.zhToggleBtn.setAttribute("aria-checked", String(state.showSource));
  applyCaptionPosition();
  selectLanguage(state.language);
  updateCaptionViews();
}

function changeCaptionScale(delta) {
  state.captionScale = Math.max(.4, Math.min(1.8, state.captionScale + delta));
  localStorage.setItem("liveCaptionScale", String(state.captionScale));
  applyStagePreferences();
}

function toggleSource() {
  state.showSource = !state.showSource;
  localStorage.setItem("liveCaptionShowSource", String(state.showSource));
  applyStagePreferences();
}

async function toggleCaptionWindow() {
  if (state.pipWindow) {
    state.pipWindow.close();
    return;
  }
  if (!("documentPictureInPicture" in window)) {
    toast("此瀏覽器不支援字幕浮窗，請更新到 Chrome 116 以上或 Edge。", "error");
    return;
  }

  try {
    const pip = await window.documentPictureInPicture.requestWindow({ width: 1100, height: 240 });
    state.pipWindow = pip;
    pip.document.title = "即時字幕";
    for (const sheet of document.styleSheets) {
      if (sheet.href) {
        const link = pip.document.createElement("link");
        link.rel = "stylesheet";
        link.href = sheet.href;
        pip.document.head.appendChild(link);
      }
    }
    pip.document.body.className = "caption-page";
    const main = pip.document.createElement("main");
    main.className = "caption-page-main";
    state.pipSource = pip.document.createElement("div");
    state.pipSource.className = "caption-page-source hidden";
    state.pipTarget = pip.document.createElement("div");
    state.pipTarget.className = "caption-page-target";
    main.append(state.pipSource, state.pipTarget);
    pip.document.body.appendChild(main);
    applyCaptionScale();
    updateCaptionViews();
    elements.captionWindowBtn.classList.add("active");
    pip.addEventListener("pagehide", () => {
      state.pipWindow = null;
      state.pipTarget = null;
      state.pipSource = null;
      elements.captionWindowBtn.classList.remove("active");
    }, { once: true });
  } catch (error) {
    toast(`無法開啟字幕浮窗：${error.message}`, "error");
  }
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await elements.stageView.requestFullscreen();
  } catch (error) {
    toast(`無法切換全螢幕：${error.message}`, "error");
  } finally {
    syncFullscreenUi();
  }
}

function syncFullscreenUi() {
  const isFullscreen = Boolean(document.fullscreenElement);
  elements.fullscreenBtn.classList.toggle("active", isFullscreen);
  elements.fullscreenBtn.querySelector("span").textContent = isFullscreen ? "離開全螢幕" : "進入全螢幕";
  const stageIsVisible = !elements.stageView.classList.contains("hidden");
  elements.fullscreenPrompt.classList.toggle("hidden", isFullscreen || !stageIsVisible);
}

/* ── 事件接線 ────────────────────────────────────────────────── */

document.querySelectorAll(".check-row").forEach((row) => {
  row.addEventListener("click", () => toggleCheckItem(row.closest(".check-item")));
});
document.querySelectorAll(".segment").forEach((button) => button.addEventListener("click", () => selectLanguage(button.dataset.lang)));

elements.editKeyBtn.addEventListener("click", () => {
  elements.keyForm.classList.toggle("hidden");
  if (!elements.keyForm.classList.contains("hidden")) elements.apiKeyInput.focus();
});
elements.keyForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const apiKey = elements.apiKeyInput.value.trim();
  if (!apiKey) return;
  try {
    const response = await fetch("/api/config/key", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apiKey }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message);
    elements.apiKeyInput.value = "";
    state.hasApiKey = true;
    state.apiKeySource = "session";
    updateKeyStatus();
  } catch (error) {
    setSetupError(error.message || "API key 設定失敗。")
  }
});

elements.pdfInput.addEventListener("change", () => uploadPdf(elements.pdfInput.files[0]));
elements.dropZone.addEventListener("dragover", (event) => { event.preventDefault(); elements.dropZone.classList.add("dragging"); });
elements.dropZone.addEventListener("dragleave", () => elements.dropZone.classList.remove("dragging"));
elements.dropZone.addEventListener("drop", (event) => { event.preventDefault(); elements.dropZone.classList.remove("dragging"); uploadPdf(event.dataTransfer.files[0]); });
elements.micTestBtn.addEventListener("click", toggleMicTest);
elements.enterStageBtn.addEventListener("click", enterStage);

[elements.micSelect, elements.stageMicSelect].forEach((select) => select.addEventListener("change", (event) => {
  state.micId = event.target.value;
  localStorage.setItem("liveCaptionMic", state.micId);
  elements.micSelect.value = state.micId;
  elements.stageMicSelect.value = state.micId;
  updateReadiness();
  if (state.running) {
    stopTranslation();
    toast("麥克風已更換，請重新開始翻譯。")
  }
}));
elements.stageLanguageSelect.addEventListener("change", (event) => {
  selectLanguage(event.target.value);
  if (state.running) {
    stopTranslation();
    toast("字幕語言已更換，請重新開始翻譯。")
  }
});

elements.translateBtn.addEventListener("click", () => state.running ? stopTranslation() : startTranslation());
elements.zhToggleBtn.addEventListener("click", toggleSource);
elements.captionWindowBtn.addEventListener("click", toggleCaptionWindow);
elements.fullscreenBtn.addEventListener("click", toggleFullscreen);
elements.fullscreenPrompt.addEventListener("click", toggleFullscreen);
elements.settingsBtn.addEventListener("click", toggleSettings);
elements.closeSettingsBtn.addEventListener("click", closeSettings);
elements.drawerBackdrop.addEventListener("click", closeSettings);
elements.smallerBtn.addEventListener("click", () => changeCaptionScale(-.1));
elements.largerBtn.addEventListener("click", () => changeCaptionScale(.1));
armDanger(elements.replacePdfBtn, () => { leaveStage(); setTimeout(() => elements.pdfInput.click(), 100); });
armDanger(elements.leaveStageBtn, leaveStage);

elements.stageSurface.addEventListener("click", (event) => {
  if (event.clientX < window.innerWidth / 3) showPage(state.page - 1);
  else showPage(state.page + 1);
});
elements.stageView.addEventListener("pointermove", maybeWakeFromPointer);
[elements.targetCaption, elements.sourceCaption].forEach((caption) =>
  caption.addEventListener("pointerdown", startCaptionDrag));
elements.resetCaptionPosBtn.addEventListener("click", resetCaptionPosition);

document.addEventListener("fullscreenchange", () => {
  syncFullscreenUi();
  closeSettings();
});
document.addEventListener("keydown", (event) => {
  if (elements.stageView.classList.contains("hidden")) return;
  // 這裡本來有 `if (event.isComposing) return;`，想擋的是注音組字中誤觸快捷鍵，
  // 實際效果是注音一開著就整組快捷鍵失效（+/- 調不動字級就是這樣來的）。
  // 中研院實戰版沒有這道檢查，改回它的做法：只擋輸入框，其餘照收。
  if (["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement.tagName)) return;
  // 快捷鍵一律不喚醒控制列。報告中翻頁、調字級是家常便飯，
  // 每按一次就把控制列彈到投影幕上，台下全看得到。
  const key = event.key.toLowerCase();
  if (key === "s") {
    toggleSettings();
    event.preventDefault();
    return;
  }
  // 放大：半形 + = 、全形 ＋ ＝（中文輸入法）、數字鍵盤 +
  if (["+", "=", "＋", "＝"].includes(event.key) || event.code === "NumpadAdd" || event.code === "Equal") {
    changeCaptionScale(.08);
    event.preventDefault();
    return;
  }
  // 縮小：半形 - _ 、全形 － ＿、數字鍵盤 -
  if (["-", "_", "－", "＿"].includes(event.key) || event.code === "NumpadSubtract" || event.code === "Minus") {
    changeCaptionScale(-.08);
    event.preventDefault();
    return;
  }
  if (key === "m") state.running ? stopTranslation() : startTranslation();
  else if (key === "c") toggleSource();
  else if (key === "p") toggleCaptionWindow();
  else if (key === "f") toggleFullscreen();
  else if (["arrowright", "arrowdown", "pagedown", " "].includes(key)) showPage(state.page + 1);
  else if (["arrowleft", "arrowup", "pageup"].includes(key)) showPage(state.page - 1);
  else return;
  event.preventDefault();
});

if (captionChannel) {
  captionChannel.addEventListener("message", (event) => {
    if (event.data?.type === "caption-window-ready") {
      updateCaptionViews();
      broadcast({ type: "status", status: state.running ? "live" : "idle" });
    }
  });
}

window.addEventListener("beforeunload", () => {
  stopTranslation(false);
  stopMeter("micTestFrame", "micTestContext", "micTestStream", elements.setupMeter);
});
// 字級是 vw，視窗變大變小 CSS 自己會跟；這裡只要重量一次寬度、順便把拖出去的字幕拉回畫面內。
window.addEventListener("resize", () => {
  updateCaptionViews();
  clampCaptionPosition();
});
navigator.mediaDevices?.addEventListener?.("devicechange", () => loadMicrophones(false));

selectLanguage(state.language);
applyStagePreferences();
loadConfig();
loadMicrophones(false);
updateReadiness();
