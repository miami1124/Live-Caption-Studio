const sourceElement = document.getElementById("floatingSource");
const targetElement = document.getElementById("floatingTarget");
const statusElement = document.getElementById("floatingStatus");
const channel = "BroadcastChannel" in window ? new BroadcastChannel("gemini-live-caption") : null;

function updateStatus(status) {
  const labels = {
    idle: "等待連線",
    connecting: "正在連線",
    live: "即時翻譯中",
    reconnecting: "重新連線中",
    error: "連線失敗",
  };
  statusElement.className = `caption-page-status ${status === "live" ? "live" : ""}`;
  statusElement.innerHTML = `<span></span>${labels[status] || labels.idle}`;
}

if (channel) {
  channel.addEventListener("message", (event) => {
    const message = event.data || {};
    if (message.type === "caption") {
      targetElement.textContent = message.target || "等待下一句…";
      sourceElement.textContent = message.source || "";
      sourceElement.classList.toggle("hidden", !message.showSource || !message.source);
    }
    if (message.type === "status") updateStatus(message.status);
  });
  channel.postMessage({ type: "caption-window-ready" });
} else {
  targetElement.textContent = "此瀏覽器不支援跨分頁字幕同步，請改用最新版 Chrome 或 Edge。";
  updateStatus("error");
}
