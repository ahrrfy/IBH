# Al-Ruya WhatsApp Bridge

Bridges the WhatsApp Cloud API to the Al-Ruya ERP.

- `GET  /webhook`   — Meta verification handshake
- `POST /webhook`   — inbound messages → forwards to `${ERP_API_URL}/crm/whatsapp/inbox`
- `POST /send`      — outbound: `{ to, text }` → WhatsApp Cloud API
- `GET  /health`    — liveness

## Env

| Name | Purpose |
|---|---|
| `PORT` | listen port (default 8002) |
| `WHATSAPP_VERIFY_TOKEN` | matches the value set in Meta dashboard |
| `WHATSAPP_ACCESS_TOKEN` | permanent access token from Meta |
| `WHATSAPP_PHONE_ID`     | sender phone number ID |
| `ERP_API_URL`           | base URL of the ERP API |
| `ERP_API_TOKEN`         | service-account bearer token |
