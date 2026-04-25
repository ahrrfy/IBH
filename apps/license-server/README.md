# Al-Ruya License Server (standalone)

Issues and verifies RSA-2048 signed licenses for the Al-Ruya ERP. The
license itself is opaque to clients in the field — they hold only the
**public** key and verify offline. This server exists for issuance,
heartbeat telemetry, and revocations.

## Endpoints

| Method | Path        | Auth        | Purpose |
|---|---|---|---|
| GET    | `/health`   | none        | liveness |
| POST   | `/heartbeat`| none        | `{ licenseKey }` → `{ valid, plan, expiresAt }` |
| POST   | `/issue`    | bearer      | mint a new signed license |
| POST   | `/revoke`   | bearer      | mark a `companyId` as revoked |

## Generate keys

```bash
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out private.pem
openssl rsa -pubout -in private.pem -out public.pem
```

Set `LICENSE_RSA_PRIVATE_KEY` (multi-line, PKCS#8 PEM) on the server,
and ship `LICENSE_RSA_PUBLIC_KEY` to every POS / ERP installation.

## Grace period

If the heartbeat is unreachable, the client falls back to a local
30-day grace window — the server is never on the critical path of
billing-blocking traffic.
