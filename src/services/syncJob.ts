import { syncCategorizedTransactions } from "./transactionSync.js";

type JobState = {
  status: "idle" | "running" | "done" | "error";
  total: number;
  processed: number;
  synced: number;
  skipped: number;
  failed: number;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
};

let currentJob: JobState = {
  status: "idle",
  total: 0,
  processed: 0,
  synced: 0,
  skipped: 0,
  failed: 0
};

export const getSyncJob = () => currentJob;

export const startSyncJob = async (limit: number) => {
  if (currentJob.status === "running") {
    return currentJob;
  }

  currentJob = {
    status: "running",
    total: 0,
    processed: 0,
    synced: 0,
    skipped: 0,
    failed: 0,
    startedAt: new Date().toISOString()
  };

  syncCategorizedTransactions(limit, {
    onProgress: (state) => {
      currentJob = {
        ...currentJob,
        status: "running",
        total: state.total,
        processed: state.processed,
        synced: state.synced,
        skipped: state.skipped,
        failed: state.failed
      };
    }
  })
    .then((result) => {
      currentJob = {
        ...currentJob,
        status: "done",
        total: result.total,
        processed: result.processed,
        synced: result.synced,
        skipped: result.skipped,
        failed: result.failed,
        finishedAt: new Date().toISOString()
      };
    })
    .catch((err: any) => {
      currentJob = {
        ...currentJob,
        status: "error",
        error: err?.message ?? "Sync failed",
        finishedAt: new Date().toISOString()
      };
    });

  return currentJob;
};
