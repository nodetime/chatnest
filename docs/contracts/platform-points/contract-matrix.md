# Platform Points v1 契约矩阵

**Schema revision:** 以 [manifest.json](manifest.json) 和 [生成的路由/类型索引](generated-index.json) 为准。
**Point scale:** `1_000_000`
**权威边界：** Payload 写账务；ChatNest 保存执行投影；Porta 提供工具 receipt。

## 1. Endpoint 与 owner

| Endpoint | 调用方 | Provider owner | 幂等键 | 成功 fixture | 失败 fixture |
|---|---|---|---|---|---|
| `POST /api/platform/v1/operations/reserve` | ChatNest BFF | Payload | `reserve:<operationId>` | model/tool success | insufficient/platform unavailable |
| `POST /api/platform/v1/operations/{operationId}/dispatch` | ChatNest BFF | Payload | `dispatch:<operationId>` | model/tool success | permit mismatch |
| `POST /api/platform/v1/operations/{operationId}/report` | ChatNest BFF/worker | Payload | `report:<operationId>` | model/tool success | report timeout/unknown |
| `POST /api/platform/v1/internal/operations/{operationId}/report` | ChatNest settlement worker | Payload | `report:<operationId>` | retry/reconcile | report timeout/unknown |
| `GET /api/platform/v1/sessions/{sessionGroupId}` | ChatNest BFF | Payload | read-only | model/tool step details | scope mismatch |
| `GET /api/platform/v1/sessions` | ChatNest BFF | Payload | read-only | session list | unauthorized |
| `POST /api/platform/v1/payments/checkout-intent` | ChatNest BFF | Payload | client checkout key | payment completed | expired/duplicate |
| `POST /api/platform/v1/internal/identity/deactivate` | ChatNest deletion worker | Payload | `issuer + subject` | personal identity/session deactivated | missing/temporary failure |
| `POST /api/platform/v1/payments/webhook/{provider}` | Payment provider | Payload | `payment:<provider>:<eventId>` / `refund:<provider>:<eventId>` | payment completed/refund | invalid/duplicate/out-of-order |
| `POST /api/platform/v1/internal/payments/reconcile` | Production worker | Payload | stored provider event id | stale/failed inbox replay | in-progress/conflict |
| `POST /api/platform/v1/admin/billing/operations/{operationId}/reconcile` | Payload Admin/ChatNest admin | Payload | operation idempotency | manual capture/release/overage | invalid decision |
| `GET /api/platform/v1/internal/admin/capability` | ChatNest connected gate | Payload | read-only | mapped staff role | unmapped/disabled staff |
| `GET /api/platform/v1/internal/admin/billing/overview` | ChatNest Admin | Payload | read-only | operations/wallet aggregate | unmapped/disabled staff |
| `POST /api/platform/v1/internal/admin/billing/audit/export` | ChatNest Admin | Payload | request id | records bounded CSV export audit | non-admin/over limit |
| `POST /api/platform/v1/internal/admin/billing/dispute-reviews/execute` | ChatNest Admin | Payload | 审批 ID | 第二管理员执行、原款零资金移动解限 | 同人、未审批、证据变化、过期 |
| `POST /v1/{provider}/{tool}` | ChatNest via Porta | Porta | permit digest | tool success | missing/replay/expired permit |

## 2. Shared request headers

| Header | Required | Meaning |
|---|---|---|
| `Authorization` | service calls | ChatNest/Payload/Porta service credential |
| `X-Platform-User-Token` | user-scoped billing | Short-lived user subject token; never a browser secret |
| `Idempotency-Key` | mutating calls | Operation/payment idempotency boundary |
| `X-Request-Id` | all calls | Request correlation |
| `X-Platform-Internal` | internal endpoints only | Deployment control path, not browser auth |
| `X-Platform-Admin-Issuer` | connected admin endpoints | External staff issuer mapped by Payload; never trusted alone |
| `X-Platform-Admin-Subject` | connected admin endpoints | External staff subject mapped by Payload; never a free-form admin id |
| `X-Porta-Execution-Permit` | Porta required mode | Signed, short-lived tool permit |
| `X-Porta-Execution-Receipt` | Porta tool response | Signed receipt digest/summary |

## 3. Common error envelope

```json
{
  "code": "INSUFFICIENT_POINTS",
  "message": "The personal balance is insufficient for this operation.",
  "requestId": "req_fixture_001",
  "retryable": false,
  "details": {
    "operationId": "op_fixture_001",
    "state": "rejected"
  }
}
```

Rules:

- `message` is safe for user/admin display and contains no secret or provider payload;
- `retryable=true` is only for settlement/webhook/reconcile commands, never paid supplier calls;
- clients must branch on `code`, not localized `message`;
- unknown codes are treated as non-success and sent to reconciliation.

## 4. Version compatibility

- New optional fields may be added within `v1`.
- Changing state meaning, removing a required field, changing points precision or changing signature canonicalization requires a new major contract version.
- Producers must accept the previous minor schema during the compatibility window.
- Every contract change updates OpenAPI, JSON Schema, fixtures, ChatNest parser tests, Payload handler tests and Porta validation tests.
