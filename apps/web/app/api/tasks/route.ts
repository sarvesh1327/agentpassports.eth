import { NextResponse } from "next/server";
import { normalizeTaskAgentNode, taskHistoryItemFromRecord } from "../../../lib/taskStore";
import { createSqliteTaskStore } from "../../../lib/taskStoreSqlite";

export const runtime = "nodejs";

/**
 * Returns DB-indexed TaskLog records for one ENS agent node.
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const agentNode = normalizeTaskAgentNode(new URL(request.url).searchParams.get("agentNode") ?? "");
    const store = createSqliteTaskStore();

    try {
      const tasks = store.listByAgentNode(agentNode).map(taskHistoryItemFromRecord);
      return NextResponse.json({ status: "ok", tasks });
    } finally {
      store.close();
    }
  } catch (error) {
    const details = error instanceof Error ? error.message : "Task history request failed";
    return NextResponse.json(
      {
        details,
        error: "InvalidTaskHistoryRequest",
        status: "error"
      },
      { status: 400 }
    );
  }
}
