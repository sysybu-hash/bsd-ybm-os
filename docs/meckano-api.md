# Meckano REST API (BSD-YBM-OS integration)

Base URL: `https://app.meckano.co.il/rest`

Authentication: header `key: <API_KEY>` (not Bearer).

## Endpoints used in app

| Path | Method | Purpose |
|------|--------|---------|
| `users` | GET | Employees list |
| `tasks` | GET | Projects / jobs |
| `punch` | POST | Clock in/out (`checkin` / `checkout`) |
| `zones` / `locations` / `sites` | GET | Work zones (sync to `MeckanoZone`) |
| `reports` | GET/POST | Attendance reports (date range) |
| `attendance` | GET/POST | Fallback attendance |
| `reports/get_attendance` | GET/POST | Fallback attendance |

## App routes

- `POST /api/meckano/reports` — normalized `{ reports, summary }`
- `GET /api/meckano/attendance` — query: `startDate`, `endDate`, filters
- `POST /api/meckano/zones/sync` — import zones into DB
- `GET/POST /api/meckano/[...path]` — generic proxy (debug / rare paths)

## Configuration

- Per-org: `Organization.meckanoApiKey` (Settings hub or Meckano widget → הגדרות)
- Fallback: `MECKANO_API_KEY` in environment

## Inventory script

Run `node scripts/meckano-api-inventory.mjs` with a valid key to refresh `docs/meckano-api-inventory.json`.
