import { createServer, type Server } from "node:http";

type FixtureOperation = {
  operationId: string;
  attemptId: string;
  reservedPoints: bigint;
  state: "reserved" | "dispatching" | "settled" | "released";
};

export function createPlatformPointsFixtureServer() {
  const operations = new Map<string, FixtureOperation>();
  let balance = 10n;
  const server = createServer(async (request, response) => {
    if (request.method !== "POST") {
      response.writeHead(405).end();
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of request) {
      chunks.push(Buffer.from(chunk));
    }
    const body = chunks.length
      ? (JSON.parse(Buffer.concat(chunks).toString("utf8")) as any)
      : {};
    const path = new URL(request.url ?? "/", "http://fixture").pathname;
    const json = (status: number, value: unknown) => {
      response.writeHead(status, { "Content-Type": "application/json" });
      response.end(JSON.stringify(value));
    };
    if (path === "/api/platform/v1/operations/reserve") {
      const price = body.tool?.api === "item_search" ? 2n : 1n;
      const existing = operations.get(body.operationId);
      if (existing) {
        json(200, {
          holdId: `hold-${existing.operationId}`,
          reservedPoints: String(existing.reservedPoints),
        });
        return;
      }
      if (balance < price) {
        json(409, { code: "INSUFFICIENT_CREDITS" });
        return;
      }
      balance -= price;
      operations.set(body.operationId, {
        attemptId: body.attemptId,
        operationId: body.operationId,
        reservedPoints: price,
        state: "reserved",
      });
      json(200, {
        holdId: `hold-${body.operationId}`,
        priceVersion: "fixture-1",
        reservedPoints: String(price),
      });
      return;
    }
    const match = path.match(
      /^\/api\/platform\/v1\/operations\/([^/]+)(?:\/(dispatch|report|cancel))?$/
    );
    if (!match) {
      json(404, { code: "NOT_FOUND" });
      return;
    }
    const operation = operations.get(decodeURIComponent(match[1]));
    if (!operation) {
      json(404, { code: "OPERATION_NOT_FOUND" });
      return;
    }
    if (match[2] === "dispatch") {
      operation.state = "dispatching";
      const permit = Buffer.from(
        JSON.stringify({
          attemptId: operation.attemptId,
          operationId: operation.operationId,
        })
      ).toString("base64url");
      json(200, { permit });
      return;
    }
    if (match[2] === "report") {
      operation.state = body.outcome === "unknown" ? "dispatching" : "settled";
      if (body.outcome === "failed") {
        balance += operation.reservedPoints;
      }
      json(200, { state: operation.state });
      return;
    }
    if (match[2] === "cancel") {
      operation.state = "released";
      balance += operation.reservedPoints;
      json(200, { state: operation.state });
      return;
    }
    json(200, {
      ...operation,
      reservedPoints: String(operation.reservedPoints),
    });
  });
  return {
    get balance() {
      return balance;
    },
    get operationCount() {
      return operations.size;
    },
    server: server as Server,
  };
}
