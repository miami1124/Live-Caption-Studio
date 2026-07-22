const elements = Object.fromEntries(
  [
    "setupView", "stageView", "progressText", "pdfBlock", "dropZone", "pdfInput", "pdfMeta",
    "connectionBlock", "keyOrb", "keyStatusTitle", "keyStatusText", "editKeyBtn", "keyForm",
    "apiKeyInput", "micSelect", "micTestBtn", "setupMeter", "enterStageBtn", "setupError",
    "slideImage", "slideLoader", "liveStatus", "settingsBtn", "sourceCaption", "targetCaption",
    "stageDock", "translateBtn", "prevBtn", "nextBtn", "currentPage", "totalPages", "zhToggleBtn",
    "captionWindowBtn", "fullscreenBtn", "settingsDrawer", "closeSettingsBtn", "drawerBackdrop",
    "stageLanguageSelect", "stageMicSelect", "smallerBtn", "largerBtn", "captionSizeText",
    "overlayToggle", "openCaptionPageBtn", "replacePdfBtn", "leaveStageBtn", "toastStack", "stageSurface",
    "pdfReadyItem", "languageReadyItem", "languageReadyText", "keyReadyItem",
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
  meterFrame: null,
  currentTarget: "",
  currentSource: "",
  showSource: localStorage.getItem("liveCaptionShowSource") === "true",
  captionScale: Number(localStorage.getItem("liveCaptionScale") || "1"),
  overlay: localStorage.getItem("liveCaptionOverlay") !== "false",
  pipWindow: null,
  pipTarget: null,
  pipSource: null,
};

const captionChannel = "BroadcastChannel" in window ? new BroadcastChannel("gemini-live-caption") : null;
const languageLabels = { en: "English", ja: "日本語", ko: "한국어" };

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

function updateProgress() {
  const complete = [Boolean(state.deck), true, state.hasApiKey];
  const count = complete.filter(Boolean).length;
  elements.progressText.textContent = `${count} / 3 完成`;
  elements.pdfBlock.classList.toggle("complete", Boolean(state.deck));
  elements.connectionBlock.classList.toggle("complete", state.hasApiKey);
  elements.pdfReadyItem.classList.toggle("ready", Boolean(state.deck));
  elements.pdfReadyItem.querySelector("small").textContent = state.deck
    ? `${state.deck.filename} · ${state.deck.pageCount} 頁`
    : "尚未選擇檔案";
  elements.keyReadyItem.classList.toggle("ready", state.hasApiKey);
  elements.keyReadyItem.querySelector("small").textContent = state.hasApiKey
    ? (state.apiKeySource === "environment" ? "已從 .env 讀取" : "本次執行期間使用")
    : "尚未設定";
  elements.enterStageBtn.disabled = !state.deck || !state.hasApiKey;
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
  updateProgress();
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
  document.querySelectorAll(".language-option").forEach((button) => {
    const selected = button.dataset.lang === state.language;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-checked", String(selected));
  });
  elements.stageLanguageSelect.value = state.language;
  const nativeLabels = { en: "英文", ja: "日文", ko: "韓文" };
  elements.languageReadyText.textContent = `${languageLabels[state.language]} · ${nativeLabels[state.language]}`;
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
    elements.pdfMeta.textContent = `${data.filename} · ${data.pageCount} 頁`;
    elements.dropZone.querySelector(".drop-main").textContent = data.filename;
    updateProgress();
    if (!elements.stageView.classList.contains("hidden")) {
      elements.totalPages.textContent = data.pageCount;
      await showPage(1);
    }
  } catch (error) {
    state.deck = null;
    elements.pdfMeta.textContent = "檔案只會留在本機";
    setSetupError(error.message);
    updateProgress();
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
  } catch (error) {
    toast(`無法存取麥克風：${error.message}`, "error");
  } finally {
    if (temporaryStream) temporaryStream.getTracks().forEach((track) => track.stop());
  }
}

function microphoneConstraints() {
  return {
    audio: state.micId
      ? { deviceId: { exact: state.micId }, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      : { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  };
}

function stopMeter(frameName, contextName, streamName, fillElement) {
  if (state[frameName]) cancelAnimationFrame(state[frameName]);
  state[frameName] = null;
  if (state[contextName]) state[contextName].close().catch(() => {});
  state[contextName] = null;
  if (state[streamName]) state[streamName].getTracks().forEach((track) => track.stop());
  state[streamName] = null;
  if (fillElement) fillElement.style.width = "0%";
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
    fillElement.style.width = `${Math.min(100, rms / 0.08 * 100)}%`;
    state[frameName] = requestAnimationFrame(draw);
  };
  draw();
}

async function toggleMicTest() {
  if (state.micTestStream) {
    stopMeter("micTestFrame", "micTestContext", "micTestStream", elements.setupMeter);
    elements.micTestBtn.textContent = "測試聲音";
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
    elements.micTestBtn.textContent = "停止測試";
  } catch (error) {
    toast(`無法啟動麥克風：${error.message}`, "error");
  }
}

async function showPage(pageNumber) {
  if (!state.deck) return;
  const target = Math.max(1, Math.min(state.deck.pageCount, pageNumber));
  state.page = target;
  elements.currentPage.textContent = target;
  elements.totalPages.textContent = state.deck.pageCount;
  elements.slideLoader.classList.remove("hidden");
  const imageUrl = `/api/deck/${state.deck.deckId}/page/${target}.png`;
  const image = new Image();
  image.onload = () => {
    elements.slideImage.src = imageUrl;
    elements.slideImage.alt = `投影片第 ${target} 頁，共 ${state.deck.pageCount} 頁`;
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

function setLiveStatus(status, label) {
  const labels = { idle: "尚未開始", connecting: "正在連線", live: "即時翻譯中", reconnecting: "重新連線中", error: "連線失敗" };
  elements.liveStatus.className = `live-status ${status}`;
  elements.liveStatus.querySelector("strong").textContent = label || labels[status] || labels.idle;
  broadcast({ type: "status", status });
}

function updateCaptionViews() {
  elements.targetCaption.textContent = state.currentTarget || "";
  if (!state.currentTarget) {
    const placeholder = document.createElement("span");
    placeholder.className = "caption-placeholder";
    placeholder.textContent = state.running ? "正在聆聽中文…" : "按「開始翻譯」後，字幕會出現在這裡";
    elements.targetCaption.appendChild(placeholder);
  }
  elements.sourceCaption.textContent = state.currentSource;
  elements.sourceCaption.classList.toggle("hidden", !state.showSource || !state.currentSource);
  if (state.pipTarget) state.pipTarget.textContent = state.currentTarget || "等待下一句…";
  if (state.pipSource) {
    state.pipSource.textContent = state.currentSource;
    state.pipSource.classList.toggle("hidden", !state.showSource || !state.currentSource);
  }
  broadcast({ type: "caption", target: state.currentTarget, source: state.currentSource, showSource: state.showSource });
}

function addTargetText(text) {
  const limit = state.language === "en" ? 105 : 58;
  if (state.currentTarget.length + text.length > limit) state.currentTarget = "";
  if (!state.currentTarget) {
    elements.targetCaption.classList.remove("swap");
    void elements.targetCaption.offsetWidth;
    elements.targetCaption.classList.add("swap");
  }
  state.currentTarget += text;
  updateCaptionViews();
}

function addSourceText(text) {
  state.currentSource += text;
  if (state.currentSource.length > 180) state.currentSource = state.currentSource.slice(-180);
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
    state.audioContext = new AudioContext();
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
    state.processor.port.onmessage = (event) => {
      if (state.websocket?.readyState === WebSocket.OPEN) state.websocket.send(event.data);
    };

    state.running = true;
    state.currentTarget = "";
    state.currentSource = "";
    elements.translateBtn.classList.add("running");
    elements.translateBtn.querySelector("strong").textContent = "停止翻譯";
    connectWebSocket();
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

function enterStage() {
  if (!state.deck || !state.hasApiKey) return;
  if (state.micTestStream) toggleMicTest();
  elements.setupView.classList.add("hidden");
  elements.stageView.classList.remove("hidden");
  elements.totalPages.textContent = state.deck.pageCount;
  applyStagePreferences();
  showPage(1);
}

function leaveStage() {
  stopTranslation();
  closeSettings();
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  elements.stageView.classList.add("hidden");
  elements.setupView.classList.remove("hidden");
}

function openSettings() {
  elements.stageView.classList.add("controls-visible");
  elements.settingsDrawer.classList.add("open");
  elements.settingsDrawer.setAttribute("aria-hidden", "false");
  elements.drawerBackdrop.classList.remove("hidden");
}

function closeSettings() {
  elements.stageView.classList.remove("controls-visible");
  elements.settingsDrawer.classList.remove("open");
  elements.settingsDrawer.setAttribute("aria-hidden", "true");
  elements.drawerBackdrop.classList.add("hidden");
}

function toggleSettings() {
  if (elements.settingsDrawer.classList.contains("open")) closeSettings();
  else openSettings();
}

function applyStagePreferences() {
  state.captionScale = Math.max(.65, Math.min(1.5, state.captionScale));
  document.documentElement.style.setProperty("--caption-scale", String(state.captionScale));
  elements.captionSizeText.textContent = `${Math.round(state.captionScale * 100)}%`;
  elements.zhToggleBtn.classList.toggle("active", state.showSource);
  elements.zhToggleBtn.setAttribute("aria-pressed", String(state.showSource));
  elements.overlayToggle.classList.toggle("on", state.overlay);
  elements.overlayToggle.setAttribute("aria-checked", String(state.overlay));
  elements.stageView.classList.toggle("reserve-caption", !state.overlay);
  selectLanguage(state.language);
  updateCaptionViews();
}

function changeCaptionScale(delta) {
  state.captionScale = Math.max(.65, Math.min(1.5, state.captionScale + delta));
  localStorage.setItem("liveCaptionScale", String(state.captionScale));
  applyStagePreferences();
}

function toggleSource() {
  state.showSource = !state.showSource;
  localStorage.setItem("liveCaptionShowSource", String(state.showSource));
  applyStagePreferences();
}

function toggleOverlay() {
  state.overlay = !state.overlay;
  localStorage.setItem("liveCaptionOverlay", String(state.overlay));
  applyStagePreferences();
}

function openCaptionPage() {
  const popup = window.open("/captions", "live-caption-window", "popup,width=1100,height=220");
  if (!popup) toast("瀏覽器封鎖了字幕視窗，請允許本站開啟彈出視窗。", "error");
}

async function toggleCaptionWindow() {
  if (state.pipWindow) {
    state.pipWindow.close();
    return;
  }
  if (!("documentPictureInPicture" in window)) {
    openCaptionPage();
    toast("此瀏覽器不支援最上層浮窗，已改開獨立字幕頁面。")
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
  }
}

document.querySelectorAll(".language-option").forEach((button) => button.addEventListener("click", () => selectLanguage(button.dataset.lang)));
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
elements.prevBtn.addEventListener("click", () => showPage(state.page - 1));
elements.nextBtn.addEventListener("click", () => showPage(state.page + 1));
elements.zhToggleBtn.addEventListener("click", toggleSource);
elements.captionWindowBtn.addEventListener("click", toggleCaptionWindow);
elements.fullscreenBtn.addEventListener("click", toggleFullscreen);
elements.settingsBtn.addEventListener("click", openSettings);
elements.closeSettingsBtn.addEventListener("click", closeSettings);
elements.drawerBackdrop.addEventListener("click", closeSettings);
elements.smallerBtn.addEventListener("click", () => changeCaptionScale(-.1));
elements.largerBtn.addEventListener("click", () => changeCaptionScale(.1));
elements.overlayToggle.addEventListener("click", toggleOverlay);
elements.openCaptionPageBtn.addEventListener("click", openCaptionPage);
elements.replacePdfBtn.addEventListener("click", () => { leaveStage(); setTimeout(() => elements.pdfInput.click(), 100); });
elements.leaveStageBtn.addEventListener("click", leaveStage);
elements.stageSurface.addEventListener("click", (event) => {
  if (event.clientX < window.innerWidth / 3) showPage(state.page - 1);
  else showPage(state.page + 1);
});

document.addEventListener("fullscreenchange", () => {
  elements.fullscreenBtn.classList.toggle("active", Boolean(document.fullscreenElement));
  closeSettings();
});
document.addEventListener("keydown", (event) => {
  if (elements.stageView.classList.contains("hidden")) return;
  const key = event.key.toLowerCase();
  if (key === "s") {
    toggleSettings();
    event.preventDefault();
    return;
  }
  if (["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement.tagName)) return;
  if (key === "m") state.running ? stopTranslation() : startTranslation();
  else if (key === "c") toggleSource();
  else if (key === "p") toggleCaptionWindow();
  else if (key === "f") toggleFullscreen();
  else if (["arrowright", "arrowdown", "pagedown", " "].includes(key)) showPage(state.page + 1);
  else if (["arrowleft", "arrowup", "pageup"].includes(key)) showPage(state.page - 1);
  else if (["+", "="].includes(event.key)) changeCaptionScale(.08);
  else if (["-", "_"].includes(event.key)) changeCaptionScale(-.08);
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
navigator.mediaDevices?.addEventListener?.("devicechange", () => loadMicrophones(false));

selectLanguage(state.language);
applyStagePreferences();
loadConfig();
loadMicrophones(false);
updateProgress();
