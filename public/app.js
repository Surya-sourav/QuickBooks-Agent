const charts = [];

const statsEl = document.getElementById("stats");
const messagesEl = document.getElementById("messages");
const chartsEl = document.getElementById("charts");
const syncBtn = document.getElementById("syncBtn");
const disconnectBtn = document.getElementById("disconnectBtn");
const syncStatus = document.getElementById("syncStatus");

const addMessage = (text, role) => {
  const div = document.createElement("div");
  div.className = `message ${role}`;
  div.textContent = text;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
};

const renderStats = (summary) => {
  statsEl.innerHTML = "";
  const items = [
    { label: "Customers", value: summary.totalCustomers ?? 0 },
    { label: "Payments", value: summary.totalPayments?.toFixed?.(2) ?? "0.00" },
    { label: "Journal Entries", value: summary.totalJournalEntries ?? 0 },
    { label: "Transactions", value: summary.totalTransactionRows ?? 0 }
  ];

  items.forEach((item) => {
    const card = document.createElement("div");
    card.className = "stat";
    card.innerHTML = `<h3>${item.label}</h3><p>${item.value}</p>`;
    statsEl.appendChild(card);
  });
};

const fetchSummary = async () => {
  const res = await fetch("/api/data/summary");
  if (!res.ok) return;
  const summary = await res.json();
  renderStats(summary);
};

const clearCharts = () => {
  charts.forEach((chart) => chart.destroy());
  charts.length = 0;
  chartsEl.innerHTML = "";
};

const renderCharts = (chartConfigs) => {
  clearCharts();
  chartConfigs.forEach((cfg) => {
    const card = document.createElement("div");
    card.className = "chart-card";
    const title = document.createElement("h3");
    title.textContent = cfg.title ?? "Chart";
    const canvasWrap = document.createElement("div");
    canvasWrap.className = "chart-canvas";
    const canvas = document.createElement("canvas");
    canvasWrap.appendChild(canvas);
    card.appendChild(title);
    card.appendChild(canvasWrap);
    chartsEl.appendChild(card);

    const chart = new Chart(canvas.getContext("2d"), {
      type: cfg.type || "bar",
      data: cfg.data,
      options: cfg.options || { responsive: true, maintainAspectRatio: false }
    });
    charts.push(chart);
  });
};

syncBtn.addEventListener("click", async () => {
  syncStatus.textContent = "Syncing...";
  try {
    const res = await fetch("/api/ingest/run", { method: "POST" });
    const data = await res.json();
    if (!data.ok) {
      syncStatus.textContent = `Sync failed: ${data.error}`;
      return;
    }
    syncStatus.textContent = `Sync complete. Customers: ${data.result.customers}, Payments: ${data.result.payments}.`;
    await fetchSummary();
  } catch (err) {
    syncStatus.textContent = "Sync failed.";
  }
});

disconnectBtn.addEventListener("click", async () => {
  const proceed = confirm("Remove the QuickBooks connection?\\n\\nClick OK to disconnect.\\nClick Cancel to keep the connection.");
  if (!proceed) {
    return;
  }
  const removeData = confirm("Do you also want to delete all synced QuickBooks data?");
  try {
    const res = await fetch(`/api/auth/disconnect?purge=${removeData ? "1" : "0"}`, { method: "POST" });
    const data = await res.json();
    if (!data.ok) {
      syncStatus.textContent = `Disconnect failed: ${data.error}`;
      return;
    }
    syncStatus.textContent = removeData ? "Disconnected and data purged." : "Disconnected.";
    if (removeData) {
      clearCharts();
      renderStats({ totalCustomers: 0, totalPayments: 0, totalJournalEntries: 0, totalTransactionRows: 0 });
    }
  } catch {
    syncStatus.textContent = "Disconnect failed.";
  }
});

const chatForm = document.getElementById("chatForm");
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = document.getElementById("chatInput");
  const message = input.value.trim();
  if (!message) return;
  input.value = "";

  addMessage(message, "user");

  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message })
  });

  if (!res.ok) {
    addMessage("Agent error. Try again.", "agent");
    return;
  }

  const data = await res.json();
  addMessage(data.answer || "", "agent");
  if (data.insights?.length) {
    addMessage(`Insights: ${data.insights.join(" ")}`, "agent");
  }
  if (data.charts?.length) {
    renderCharts(data.charts);
  }
});

fetchSummary();
