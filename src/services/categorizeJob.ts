import { categorizeTransactions } from "./transactionCategorizer.js";

type JobState = {
  status: "idle" | "running" | "done" | "error";
  total: number;
  processed: number;
  categorized: number;
  failed: number;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
};

let currentJob: JobState = {
  status: "idle",
  total: 0,
  processed: 0,
  categorized: 0,
  failed: 0
};

export const getCategorizeJob = () => currentJob;

export const startCategorizeJob = async (limit: number) => {
  if (currentJob.status === "running") {
    return currentJob;
  }

  currentJob = {
    status: "running",
    total: 0,
    processed: 0,
    categorized: 0,
    failed: 0,
    startedAt: new Date().toISOString()
  };

  categorizeTransactions(limit, {
    onProgress: (state) => {
      currentJob = {
        ...currentJob,
        total: state.total,
        processed: state.processed,
        categorized: state.categorized,
        failed: state.failed,
        status: "running"
      };
    }
  })
    .then((result) => {
      currentJob = {
        ...currentJob,
        status: "done",
        processed: result.processed,
        categorized: result.categorized,
        failed: result.failed,
        finishedAt: new Date().toISOString()
      };
    })
    .catch((err: any) => {
      currentJob = {
        ...currentJob,
        status: "error",
        error: err?.message ?? "Categorization failed",
        finishedAt: new Date().toISOString()
      };
    });

  return currentJob;
};
