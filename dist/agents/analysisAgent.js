import { config } from "../config.js";
import { buildSummary } from "../services/insights.js";
const safeJsonParse = (content) => {
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start)
        return null;
    try {
        return JSON.parse(content.slice(start, end + 1));
    }
    catch {
        return null;
    }
};
const fallbackResponse = (summary) => {
    const insights = [];
    if (summary.totalPayments !== null) {
        insights.push(`Total payments in range: $${summary.totalPayments.toFixed(2)}.`);
    }
    if (summary.topCustomers?.length) {
        insights.push(`Top customer by payments: ${summary.topCustomers[0].display_name ?? summary.topCustomers[0].customer_ref}.`);
    }
    if (summary.monthlyPayments?.length) {
        const last = summary.monthlyPayments[summary.monthlyPayments.length - 1];
        insights.push(`Most recent month in data: ${last.month} with $${Number(last.total).toFixed(2)} in payments.`);
    }
    const chart = {
        title: "Payments by Month",
        type: "bar",
        data: {
            labels: summary.monthlyPayments.map((m) => m.month),
            datasets: [
                {
                    label: "Payments",
                    data: summary.monthlyPayments.map((m) => Number(m.total)),
                    backgroundColor: "#1f77b4"
                }
            ]
        }
    };
    return {
        answer: "Here is a quick summary based on stored QuickBooks data. Ask a specific question for deeper analysis.",
        insights,
        charts: summary.monthlyPayments?.length ? [chart] : []
    };
};
export const runAnalysisAgent = async (question) => {
    const summary = await buildSummary();
    const system = `You are a financial analysis agent for QuickBooks data. Use only the provided summary data. \nReturn JSON only with keys: answer, insights (array of short bullets), charts (array).\nEach chart must be valid Chart.js config: {title, type, data, options}.`;
    const user = {
        question,
        dataRange: summary.dateRange,
        monthlyPayments: summary.monthlyPayments,
        monthlyJournalEntries: summary.monthlyJournalEntries,
        topCustomers: summary.topCustomers,
        transactionTypeBreakdown: summary.transactionTypeBreakdown,
        totals: {
            customers: summary.totalCustomers,
            payments: summary.totalPayments,
            journalEntries: summary.totalJournalEntries,
            transactionRows: summary.totalTransactionRows
        }
    };
    const payload = {
        model: config.cerebras.model,
        messages: [
            { role: "system", content: system },
            { role: "user", content: JSON.stringify(user) }
        ],
        temperature: 0.2
    };
    try {
        const res = await fetch(`${config.cerebras.baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${config.cerebras.apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Cerebras error: ${res.status} ${text}`);
        }
        const data = await res.json();
        const content = data?.choices?.[0]?.message?.content ?? "";
        const parsed = safeJsonParse(content);
        if (!parsed) {
            return fallbackResponse(summary);
        }
        return {
            answer: parsed.answer ?? "",
            insights: parsed.insights ?? [],
            charts: parsed.charts ?? []
        };
    }
    catch {
        return fallbackResponse(summary);
    }
};
