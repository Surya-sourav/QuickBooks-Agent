import dotenv from "dotenv";
dotenv.config();
const required = (key, fallback) => {
    const val = process.env[key] ?? fallback;
    if (!val) {
        throw new Error(`Missing required env: ${key}`);
    }
    return val;
};
const requiredUrl = (key) => {
    const val = required(key);
    try {
        new URL(val);
    }
    catch {
        throw new Error(`Invalid URL for env ${key}: ${val}`);
    }
    return val;
};
export const config = {
    port: Number(process.env.PORT ?? 3000),
    databaseUrl: required("DATABASE_URL"),
    qbo: {
        clientId: required("QBO_CLIENT_ID"),
        clientSecret: required("QBO_CLIENT_SECRET"),
        redirectUri: requiredUrl("QBO_REDIRECT_URI"),
        environment: (process.env.QBO_ENV ?? "sandbox"),
        scopes: (process.env.QBO_SCOPES ?? "com.intuit.quickbooks.accounting").split(","),
        minorVersion: process.env.QBO_MINOR_VERSION ?? "70",
        dataStartDate: process.env.DATA_START_DATE ?? "2023-01-01",
        dataEndDate: process.env.DATA_END_DATE ?? "2026-01-31"
    },
    cerebras: {
        apiKey: required("CEREBRAS_API_KEY"),
        baseUrl: process.env.CEREBRAS_BASE_URL ?? "https://api.cerebras.ai/v1",
        model: process.env.CEREBRAS_MODEL ?? "zai-glm-4.7"
    }
};
export const qboApiBase = config.qbo.environment === "sandbox"
    ? "https://sandbox-quickbooks.api.intuit.com"
    : "https://quickbooks.api.intuit.com";
export const qboAuthBase = "https://appcenter.intuit.com";
export const qboTokenUrl = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
