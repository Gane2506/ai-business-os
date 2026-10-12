// Read-only Temporal poller check; does not enqueue work or call a provider.
const { Connection } = require("./apps/orchestrator/node_modules/@temporalio/client");
const os = require("node:os");
(async () => {
  const connection = await Connection.connect({ address: process.env.TEMPORAL_ADDRESS });
  try {
    for (const taskQueueType of [1, 2]) {
      const result = await connection.workflowService.describeTaskQueue({
        namespace: process.env.TEMPORAL_NAMESPACE || "default",
        taskQueue: { name: process.env.TEMPORAL_TASK_QUEUE || "ringee" },
        taskQueueType,
      });
      const active = result.pollers.some((p) =>
        p.identity?.includes(`@${os.hostname()}`) &&
        Date.now() - Number(p.lastAccessTime?.seconds || 0) * 1000 < 120000
      );
      if (!active) throw new Error(`No recent local poller for task queue type ${taskQueueType}`);
    }
  } finally { await connection.close(); }
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
