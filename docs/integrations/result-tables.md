# Optional result tables

The Agent may choose `createResultTable`; no keyword, supplier, or successful MCP call automatically creates a table. Ordinary answers and no-table branches remain first-class. This tool never calls another model to invent or rewrite retrieved rows.

## Evidence and context

Only actual successful MCP calls enter the per-task evidence ledger. JSON `structuredContent` is preferred; otherwise the entire single text content block must parse as JSON. Prose JSON extraction, client message outputs, pending/denied/failed calls, and sources over 2 MiB are not eligible. The ledger retains at most the most recent 20 eligible calls within a cumulative 2 MiB, evicting oldest eligible calls explicitly rather than partially copying rows.

The SDK's `toModelOutput` adapter exposes the actual `sourceToolCallId`, JSON Pointer array paths/counts/fields, and a clearly marked bounded row/text preview. Raw UI/database outputs stay unchanged. Each full serialized projection is at most 2,000 UTF-8 bytes. Projection is cached at source completion, so repeated SDK conversion is pure. History restores eligible evidence only from authorized stored assistant outputs; model history shares 20 MCP projection slots, prioritizing retained eligible sources and filling spare slots with recent noneligible outcomes, and a round admits at most 32 current MCP executions. Thus at most 52 successful source projections consume 104,000 bytes combined, below the 128 KiB round budget. Duplicate call IDs across history or current calls are marked ambiguous, removed from evidence/projections, and never overwrite another source; ambiguous history occurrences are omitted rather than multiplying the prompt. Older tool outcomes are omitted from the model-only history copy, not UI/storage. Oversized field names/previews are explicitly omitted, never passed through as a fallback.

Persisted `data-mcp-source` identifies tool/server/call and actual server completion time. Legacy history without completion metadata uses the original message creation time labeled `message-recorded`, never the current clock. Approval continuation transports assistant IDs and approval decisions only, not duplicated vendor results, table contents, or attachments; stored calls remain authoritative.

## Tool and persisted envelope

Input: `{title, sourceToolCallId, rowsPath, columns?: [{path, label?}]}`. Paths are strict RFC 6901 JSON Pointers with canonical array indexes, own-property-only traversal, and prototype-related traversal denied. Rows must be an object array. Limits are 500 rows, 30 selected columns, and a 1 MiB UTF-8 envelope; exceeding any limit rejects the entire request rather than silently truncating it.

A `Document` with `kind: "sheet"` stores `{type:"result-table",version:1,chatId,source,rowsPath,rows,columns,view,notes}`. `rows` are deep-copied original JSON objects, preserving every original own field including fields that cannot be selected by a pointer. Cell values are deterministic pointer reads; missing fields are empty. A single persisted `data-resultTable` event atomically identifies the document, kind, title, content, version, and bound chat. Legacy CSV sheets remain supported separately.

The pane provides filtering, numeric/null sorting, column selection, raw-row details, separate user notes, CSV of the current view, full-envelope JSON export, versions and reopen. CSV protects formula-leading values (including whitespace/control prefixes). Only an exact original HTTP(S) URL field value becomes a link; incidental prose URLs are not extracted. The provenance label is **工具返回 · 未核验**, not independent website verification or legal certainty.

## Mutation and ownership

- `GET /api/document?id=ID&chatId=CHAT_ID` requires both document ownership and the result table's bound owned chat. Legacy document reads retain compatibility.
- `PATCH /api/document/result-table` accepts only `{id,chatId,expectedVersion,view,notes}`. `expectedVersion` is the exact latest `createdAt` ISO string. A transaction/advisory lock and latest-row lock compare versions and create a strictly later version. Stale writes return 409. The complete updated envelope must still fit its byte/schema limits before any insert.
- Generic document POST, central generic database writes, edit/update/suggestion tools reject result-table evidence, including unknown versions or damaged discriminators. No generic CSV downgrade or generic version deletion can erase the protected history and reuse its ID. View/notes updates cannot replace rows, columns, provenance or chat binding.
- No automatic refresh tool is shipped: a later Agent-selected table may use a new actual MCP source. Existing original evidence is immutable.

Verification uses synthetic fixtures and isolated mock MCP/model endpoints. This validates wire behavior and provenance, not live model decision quality or a paid supplier's acceptance.

Final local verification covered isolated HTTP/PostgreSQL/mock-model flows, production packaging and parser-worker smoke checks, plus server-rendered table structure. Interactive browser QA was not executed because browser navigation was blocked by the tool policy; SSR evidence is not an interaction test, and the policy block is not an application failure. No paid model/supplier requests were used.
