export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startServerTasks } = await import("./server-tasks");
  await startServerTasks();
}
