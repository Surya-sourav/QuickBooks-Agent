const charts = [];

const statsEl = document.getElementById("stats");
const messagesEl = document.getElementById("messages");
const chartsEl = document.getElementById("charts");
const syncBtn = document.getElementById("syncBtn");
const disconnectBtn = document.getElementById("disconnectBtn");
const syncStatus = document.getElementById("syncStatus");
const connectBtn = document.querySelector("a.btn[href='/api/auth/connect']");
const companyInfo = document.getElementById("companyInfo");
const transactionsBody = document.getElementById("transactionsBody");
const transactionsMeta = document.getElementById("transactionsMeta");
const transactionsStatus = document.getElementById("transactionsStatus");
const categorizeBtn = document.getElementById("categorizeBtn");
const syncCategoriesBtn = document.getElementById("syncCategoriesBtn");
const prevPageBtn = document.getElementById("prevPageBtn");
const nextPageBtn = document.getElementById("nextPageBtn");
const pageInfo = document.getElementById("pageInfo");
const pageSizeSelect = document.getElementById("pageSizeSelect");
const accountsBody = document.getElementById("accountsBody");
const accountsMeta = document.getElementById("accountsMeta");

let txPage = 1;
let txLimit = Number(pageSizeSelect?.value ?? 50);
let txTotal = 0;
let categorizationPoll = null;
let syncPoll = null;

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

const loadCompanyInfo = async () => {
  const res = await fetch("/api/company");
  if (!res.ok) return;
  const data = await res.json();
  if (!companyInfo) return;
  if (!data.connected || !data.company) {
    companyInfo.textContent = "QuickBooks connection not established yet.";
    return;
  }
  const name = data.company.CompanyName ?? "Company";
  const legal = data.company.LegalName ? ` • ${data.company.LegalName}` : "";
  const country = data.company.Country ? ` • ${data.company.Country}` : "";
  companyInfo.textContent = `${name}${legal}${country}`;
};
const fetchAuthStatus = async () => {
  const res = await fetch("/api/auth/status");
  if (!res.ok) return;
  const data = await res.json();
  if (data.connected) {
    syncStatus.textContent = `Connected to QuickBooks (${data.environment}).`;
    if (connectBtn) {
      connectBtn.textContent = "Connected";
    }
  }
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

const renderTransactions = (rows, total, offset, limit) => {
  if (!transactionsBody) return;
  transactionsBody.innerHTML = "";
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.txn_date ?? ""}</td>
      <td>${row.txn_type ?? ""}</td>
      <td>${row.name ?? ""}</td>
      <td>${row.account ?? ""}</td>
      <td>${row.amount ?? ""}</td>
      <td>${row.ai_category ?? "-"}</td>
      <td>${row.qb_sync_status ?? row.ai_status ?? "-"}</td>
    `;
    transactionsBody.appendChild(tr);
  });

  if (transactionsMeta) {
    transactionsMeta.textContent = `Showing ${rows.length} of ${total} transactions (offset ${offset}).`;
  }
};

const loadTransactions = async () => {
  const offset = (txPage - 1) * txLimit;
  const res = await fetch(`/api/transactions?limit=${txLimit}&offset=${offset}`);
  if (!res.ok) return;
  const data = await res.json();
  txTotal = data.total ?? 0;
  renderTransactions(data.rows ?? [], txTotal, data.offset ?? 0, data.limit ?? 0);
  updatePagination();
};

const loadAccounts = async () => {
  const res = await fetch("/api/accounts");
  if (!res.ok) return;
  const data = await res.json();
  const rows = data.rows ?? [];
  if (accountsBody) {
    accountsBody.innerHTML = "";
    rows.forEach((row) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${row.name ?? ""}</td>
        <td>${row.account_type ?? ""}</td>
        <td>${row.account_sub_type ?? ""}</td>
        <td>${row.classification ?? ""}</td>
        <td>${row.txn_count ?? 0}</td>
        <td>${row.total_amount ?? 0}</td>
      `;
      accountsBody.appendChild(tr);
    });
  }
  if (accountsMeta) {
    accountsMeta.textContent = `Loaded ${rows.length} source accounts.`;
  }
};

const updatePagination = () => {
  const totalPages = Math.max(1, Math.ceil(txTotal / txLimit));
  if (pageInfo) {
    pageInfo.textContent = `Page ${txPage} of ${totalPages}`;
  }
  if (prevPageBtn) prevPageBtn.disabled = txPage <= 1;
  if (nextPageBtn) nextPageBtn.disabled = txPage >= totalPages;
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
    await loadTransactions();
    await loadAccounts();
    await loadCompanyInfo();
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

categorizeBtn.addEventListener("click", async () => {
  if (!confirm("Run AI categorization on uncategorized transactions?")) return;
  try {
    const res = await fetch("/api/transactions/categorize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limit: 200 })
    });
    const data = await res.json();
    if (!data.ok) {
      syncStatus.textContent = `Categorization failed: ${data.error}`;
      return;
    }
    syncStatus.textContent = "Categorization started.";
    startCategorizationPolling();
  } catch {
    syncStatus.textContent = "Categorization failed.";
  }
});

syncCategoriesBtn.addEventListener("click", async () => {
  if (!confirm("Sync AI categories back to QuickBooks?")) return;
  try {
    const res = await fetch("/api/transactions/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limit: 50 })
    });
    const data = await res.json();
    if (!data.ok) {
      syncStatus.textContent = `Sync failed: ${data.error}`;
      return;
    }
    syncStatus.textContent = "Sync started.";
    startSyncPolling();
  } catch {
    syncStatus.textContent = "Sync failed.";
  }
});

const startSyncPolling = () => {
  if (syncPoll) return;
  const poll = async () => {
    try {
      const res = await fetch("/api/transactions/sync/status");
      if (!res.ok) throw new Error("sync status failed");
      const data = await res.json();
      const job = data.job;
      if (transactionsStatus) {
        if (job.status === "running") {
          transactionsStatus.innerHTML = `<span class="loader"></span> Synced ${job.synced}/${job.total} (skipped ${job.skipped}, failed ${job.failed}).`;
        } else if (job.status === "done") {
          transactionsStatus.textContent = `Sync done: ${job.synced}/${job.total} (skipped ${job.skipped}, failed ${job.failed}).`;
        } else if (job.status === "error") {
          transactionsStatus.textContent = `Sync error: ${job.error ?? "unknown"}.`;
        } else {
          transactionsStatus.textContent = "";
        }
      }

      if (job.status === "running") {
        await loadTransactions();
        syncPoll = setTimeout(poll, 1500);
      } else {
        syncPoll = null;
        await loadTransactions();
      }
    } catch {
      syncPoll = null;
    }
  };

  poll();
};

const startCategorizationPolling = () => {
  if (categorizationPoll) return;
  const poll = async () => {
    try {
      const res = await fetch("/api/transactions/categorize/status");
      if (!res.ok) throw new Error("status failed");
      const data = await res.json();
      const job = data.job;
      if (transactionsStatus) {
        if (job.status === "running") {
          transactionsStatus.innerHTML = `<span class="loader"></span> Categorized ${job.categorized}/${job.total} (failed ${job.failed}).`;
        } else if (job.status === "done") {
          transactionsStatus.textContent = `Categorization done: ${job.categorized}/${job.total} (failed ${job.failed}).`;
        } else if (job.status === "error") {
          transactionsStatus.textContent = `Categorization error: ${job.error ?? "unknown"}.`;
        } else {
          transactionsStatus.textContent = "";
        }
      }

      if (job.status === "running") {
        await loadTransactions();
        categorizationPoll = setTimeout(poll, 1500);
      } else {
        categorizationPoll = null;
        await loadTransactions();
      }
    } catch {
      categorizationPoll = null;
    }
  };

  poll();
};

if (prevPageBtn) {
  prevPageBtn.addEventListener("click", () => {
    if (txPage > 1) {
      txPage -= 1;
      loadTransactions();
    }
  });
}

if (nextPageBtn) {
  nextPageBtn.addEventListener("click", () => {
    const totalPages = Math.max(1, Math.ceil(txTotal / txLimit));
    if (txPage < totalPages) {
      txPage += 1;
      loadTransactions();
    }
  });
}

if (pageSizeSelect) {
  pageSizeSelect.addEventListener("change", (event) => {
    const value = Number(event.target.value);
    if (!Number.isNaN(value)) {
      txLimit = value;
      txPage = 1;
      loadTransactions();
    }
  });
}

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
fetchAuthStatus();
loadTransactions();
loadAccounts();
loadCompanyInfo();
