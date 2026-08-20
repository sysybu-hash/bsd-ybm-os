# RBAC roles (workspace)

| Role | Label | Typical access |
|------|--------|----------------|
| `SUPER_ADMIN` / platform admin | מנהל מערכת | Platform admin widget, all orgs (gated by email) |
| `ORG_ADMIN` | מנהל ארגון | Full org: hubs, billing settings, users |
| `PROJECT_MGR` | מנהל פרויקט | Projects, scan, finance views; manage project data |
| `EMPLOYEE` / `CLIENT` / `FIELD` / `MEMBER` | עובד / מנוי | **Simple mode**: core hubs; hidden: App Builder, Field Copilot, Executive, Procurement, Logistics, Universal Command |
| `ACCOUNTANT` | רואה חשבון | Read-mostly ERP/finance; write blocked via `accountant-auth` / `allowReadOnlyRoles` |

Sources of truth:

- Session role: [`lib/auth/nextauth-callbacks.ts`](../lib/auth/nextauth-callbacks.ts)
- Labels / admin helpers: [`lib/workspace-access.ts`](../lib/workspace-access.ts)
- Launcher picker: [`lib/launcher/launcher-permissions.ts`](../lib/launcher/launcher-permissions.ts)
- API gate: [`lib/api-handler.ts`](../lib/api-handler.ts) (`withWorkspacesAuth`)
