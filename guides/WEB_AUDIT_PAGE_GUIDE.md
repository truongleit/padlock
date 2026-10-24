# Padlock Web: Audit log page (list, then filters)

## Context

Builds the `/audit` page in the CMS (`apps/web`) on top of the existing `GET /admin/audit-logs` endpoint. The audit log is the record of admin actions on end-user accounts: every disable, reactivate or delete writes one row (admin, target user, action, time). The page is read-only.

The backend is done: the endpoint supports `page`, `limit`, `action`, `adminId`, `targetUserId`, `from`, `to`, and each row includes `adminEmail`. This guide only touches `apps/web`.

Scope (two people, two parts, done in order):
- **Part A:** data layer, route, menu item, paginated table (list).
- **Part B:** filters (action, date range, admin ID, target user ID) on top of Part A.

Not in this guide: searching by email (the API has no such filter), a Users page to deep-link from, tests.

### Where the repo should be before you start

You already have (from the admins page work):
- `Paginated` in `src/lib/api/types.ts` and the `api` ky instance in `src/lib/api/client.ts`.
- `CmsLayout` behind `RequireAuth`, with the `navItems` array.
- The server returning `adminEmail` on `GET /admin/audit-logs`.

```bash
docker compose up -d db
pnpm dev:server   # and in another terminal: pnpm dev:web
```
Log in with the seeded admin. You need a few audit rows to see anything: disable and reactivate a user through Swagger at `http://localhost:3000/docs` (`PATCH /admin/users/:id/disable`, `.../reactivate`; Authorize with your access token first). If there are no users, add 2 or 3 rows in `pnpm db:studio`.

Rules of this repo apply: `@/` alias imports only (never `./`), named exports, no `any`, `pnpm typecheck && pnpm lint` before each commit. Type the code yourself so it sticks.

### Decisions already made

| Topic | Decision |
| --- | --- |
| Data layer | A new `features/audit/{types,api,hooks}.ts`, same shape as `features/users`. The page never calls `api` directly |
| Pagination | Server-side: `page` + `limit` state in the page, passed to `useAuditLogs` |
| Who column | Shows `adminEmail`. The target user is only a UUID (the user may already be deleted), shown with a copy button |
| Action colors | `DISABLE` orange, `REACTIVATE` green, `DELETE` red |
| Date range | Sent as ISO strings: `from` = start of the first day, `to` = end of the last day |
| ID filters | Plain text inputs. Only a complete UUID is sent, because the API answers 400 to a malformed one |
| Filter change | Always goes back to page 1 |

---

## Part A: Data layer, route, menu, list

Branch: `feat/web-audit-list`.

### A1. Types (`src/features/audit/types.ts`)

```ts
export type AuditAction = "DISABLE" | "REACTIVATE" | "DELETE";

export interface AuditLog {
  id: string;
  adminId: string;
  adminEmail: string;
  targetUserId: string;
  action: AuditAction;
  createdAt: string;
}

export interface AuditListParams {
  page?: number;
  limit?: number;
  action?: AuditAction;
  adminId?: string;
  targetUserId?: string;
  from?: string;
  to?: string;
}
```

`AuditListParams` already has the filter fields. Part A just does not use them yet.

### A2. API call (`src/features/audit/api.ts`)

```ts
import type { AuditListParams, AuditLog } from "@/features/audit/types";
import { api } from "@/lib/api/client";
import type { Paginated } from "@/lib/api/types";

export const listAuditLogs = (params: AuditListParams = {}) =>
  api
    .get("admin/audit-logs", { searchParams: { ...params } })
    .json<Paginated<AuditLog>>();
```

ky drops `undefined` values from `searchParams`, so unset filters are not sent.

### A3. Query hook (`src/features/audit/hooks.ts`)

```ts
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import * as auditApi from "@/features/audit/api";
import type { AuditListParams } from "@/features/audit/types";

export const auditKeys = {
  all: ["audit"] as const,
  list: (params: AuditListParams) =>
    [...auditKeys.all, "list", params] as const,
};

export function useAuditLogs(params: AuditListParams = {}) {
  return useQuery({
    queryKey: auditKeys.list(params),
    queryFn: () => auditApi.listAuditLogs(params),
    placeholderData: keepPreviousData,
  });
}
```

`keepPreviousData` keeps the old rows on screen while the next page loads, so the table does not flash empty.

### A4. The page (`src/pages/cms/AuditPage.tsx`)

```tsx
import { Table, Tag, Typography } from "antd";
import { useState } from "react";

import { useAuditLogs } from "@/features/audit/hooks";
import type { AuditAction, AuditLog } from "@/features/audit/types";

const actionColor: Record<AuditAction, string> = {
  DISABLE: "orange",
  REACTIVATE: "green",
  DELETE: "red",
};

export function AuditPage() {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  const { data, isFetching } = useAuditLogs({ page, limit });

  return (
    <>
      <Typography.Title level={3}>Audit log</Typography.Title>
      <Table<AuditLog>
        rowKey="id"
        loading={isFetching}
        dataSource={data?.data}
        scroll={{ x: "max-content" }}
        pagination={{
          current: page,
          pageSize: limit,
          total: data?.total,
          onChange: (p, l) => {
            setPage(p);
            setLimit(l);
          },
        }}
        columns={[
          {
            title: "Time",
            dataIndex: "createdAt",
            render: (iso: string) => new Date(iso).toLocaleString(),
          },
          { title: "Admin", dataIndex: "adminEmail" },
          {
            title: "Action",
            dataIndex: "action",
            render: (a: AuditAction) => <Tag color={actionColor[a]}>{a}</Tag>,
          },
          {
            title: "Target user",
            dataIndex: "targetUserId",
            render: (id: string) => (
              <Typography.Text copyable>{id}</Typography.Text>
            ),
          },
        ]}
      />
    </>
  );
}
```

### A5. Register the route (`src/router.tsx`)

Add the import (keep imports sorted, Biome will do it for you) and the route inside the `CmsLayout` children:

```tsx
import { AuditPage } from "@/pages/cms/AuditPage";
```
```tsx
          { path: "/admins", element: <AdminsPage /> },
          { path: "/audit", element: <AuditPage /> },
```

### A6. Add the menu item (`src/components/layouts/CmsLayout.tsx`)

Add `AuditOutlined` to the icon import, and one entry to `navItems`:

```tsx
import {
  AuditOutlined,
  DashboardOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  TeamOutlined,
} from "@ant-design/icons";
```
```tsx
const navItems = [
  { key: "/", label: "Dashboard", icon: <DashboardOutlined /> },
  { key: "/admins", label: "Admins", icon: <TeamOutlined /> },
  { key: "/audit", label: "Audit log", icon: <AuditOutlined /> },
];
```

### Check

- "Audit log" appears in the sidebar and highlights when selected. `/audit` loads.
- Rows show newest first: time, admin email, a colored action tag, and the target user UUID with a copy icon.
- With more rows than the page size, paging works and changing the page size works.
- Reload on `/audit`: you stay logged in and the page loads again.

### Finish Part A

Run `pnpm typecheck && pnpm lint` first.

- Branch: `feat/web-audit-list`
- Commit: `feat(web): add audit log list page`

---

## Part B: Filters

Start from `main` with Part A merged. Branch: `feat/web-audit-filters`. Only `src/pages/cms/AuditPage.tsx` changes. `AuditListParams` already supports every filter.

### What changes

1. New antd imports: `DatePicker`, `Input`, `Select`, `Space`.
2. A `UUID` regex and a `validUuid` helper, so a half-typed ID is never sent (the API would answer 400).
3. Four new pieces of state: `action`, `range`, `adminId`, `targetUserId`, all passed to `useAuditLogs`.
4. A `filter()` wrapper that sets a value and resets the page to 1. Without it, filtering while on page 3 can leave you on a page that no longer exists.
5. A filter bar (`Space`) above the table.

### B1. The final page (replace `src/pages/cms/AuditPage.tsx`)

```tsx
import { DatePicker, Input, Select, Space, Table, Tag, Typography } from "antd";
import { useState } from "react";

import { useAuditLogs } from "@/features/audit/hooks";
import type { AuditAction, AuditLog } from "@/features/audit/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const actionColor: Record<AuditAction, string> = {
  DISABLE: "orange",
  REACTIVATE: "green",
  DELETE: "red",
};

// The API 400s on a malformed UUID, so only send complete ones.
const validUuid = (v: string) => (UUID.test(v.trim()) ? v.trim() : undefined);

export function AuditPage() {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [action, setAction] = useState<AuditAction>();
  const [range, setRange] = useState<[string, string]>();
  const [adminId, setAdminId] = useState("");
  const [targetUserId, setTargetUserId] = useState("");

  const { data, isFetching } = useAuditLogs({
    page,
    limit,
    action,
    from: range?.[0],
    to: range?.[1],
    adminId: validUuid(adminId),
    targetUserId: validUuid(targetUserId),
  });

  // Any filter change goes back to the first page.
  const filter =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(1);
    };

  return (
    <>
      <Typography.Title level={3}>Audit log</Typography.Title>
      <Space wrap style={{ marginBottom: 16 }}>
        <Select<AuditAction>
          allowClear
          placeholder="Action"
          style={{ width: 150 }}
          value={action}
          onChange={filter(setAction)}
          options={(["DISABLE", "REACTIVATE", "DELETE"] as const).map((a) => ({
            value: a,
            label: a,
          }))}
        />
        <DatePicker.RangePicker
          onChange={filter((d) =>
            setRange(
              d?.[0] && d[1]
                ? [
                    d[0].startOf("day").toISOString(),
                    d[1].endOf("day").toISOString(),
                  ]
                : undefined
            )
          )}
        />
        <Input
          allowClear
          placeholder="Admin ID"
          style={{ width: 300 }}
          value={adminId}
          onChange={(e) => filter(setAdminId)(e.target.value)}
        />
        <Input
          allowClear
          placeholder="Target user ID"
          style={{ width: 300 }}
          value={targetUserId}
          onChange={(e) => filter(setTargetUserId)(e.target.value)}
        />
      </Space>
      <Table<AuditLog>
        rowKey="id"
        loading={isFetching}
        dataSource={data?.data}
        scroll={{ x: "max-content" }}
        pagination={{
          current: page,
          pageSize: limit,
          total: data?.total,
          onChange: (p, l) => {
            setPage(p);
            setLimit(l);
          },
        }}
        columns={[
          {
            title: "Time",
            dataIndex: "createdAt",
            render: (iso: string) => new Date(iso).toLocaleString(),
          },
          { title: "Admin", dataIndex: "adminEmail" },
          {
            title: "Action",
            dataIndex: "action",
            render: (a: AuditAction) => <Tag color={actionColor[a]}>{a}</Tag>,
          },
          {
            title: "Target user",
            dataIndex: "targetUserId",
            render: (id: string) => (
              <Typography.Text copyable>{id}</Typography.Text>
            ),
          },
        ]}
      />
    </>
  );
}
```

Notes on the code:
- `<T,>` (with the comma) is needed in a `.tsx` file so the generic arrow function is not parsed as JSX.
- The Admin ID and Target user ID inputs are controlled by the raw text, but the query only receives `validUuid(...)`. While you type a partial ID the table keeps showing the previous result; the filter applies once the 36 characters form a valid UUID.
- The range picker gives you dayjs values. `startOf("day")` and `endOf("day")` make the range inclusive of both end dates.

### Check

- **Action:** pick `DELETE`, only delete rows remain. Clear it (the x), all rows return.
- **Date range:** pick today only, today's rows show. Pick a past range with no activity, the table is empty. Clear it, rows return.
- **Admin ID:** paste an admin's UUID (from the Admins page or Studio), only that admin's rows show. Delete one character: the request stops being filtered by it (no 400 in the Network tab).
- **Target user ID:** same, with a user's UUID (use the copy icon in the table).
- **Page reset:** with at least 2 pages, go to page 2, then change any filter. You land on page 1.
- Filters combine (for example action + date range).

### Finish Part B

Run `pnpm typecheck && pnpm lint` first.

- Branch: `feat/web-audit-filters`
- Commit: `feat(web): add audit log filters`

---

## Known gap (not part of this guide)

`AdminAuditLog.admin` has no `onDelete` in `prisma/schema.prisma`, so deleting an admin who has audit entries fails with a 409 from the foreign key. This is intentional for now: the log should not silently lose who acted. Decide the policy (block, keep a snapshot of the email, or `SetNull`) before relying on admin deletion in practice.
