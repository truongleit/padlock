# Padlock Web: Users page (list, then search/filter and actions)

## Context

Builds the `/users` page in the CMS (`apps/web`) on top of the existing `/admin/users` endpoints (SRS FR-13, UC-25 to UC-28). It is where an admin views registered end-user accounts and disables, reactivates or deletes them. Every one of those actions writes a row you can then see on the `/audit` page.

The backend is done, and so is the web data layer: `src/features/users/{types,api,hooks}.ts` already has `listUsers`, `disableUser`, `reactivateUser`, `removeUser` and the matching hooks. This guide only adds the page, the route and the menu item in `apps/web`.

Because the vault is zero-knowledge (NFR-SEC-5), the API returns only `id`, `email`, `status` and `createdAt`. The page must never try to show anything else.

Scope (two people, two parts, done in order):
- **Part A:** route, menu item, read-only paginated table (list).
- **Part B:** email search, status filter, and the disable / reactivate / delete actions on top of Part A.

Not in this guide: a user detail page, linking a row to the audit log, tests.

### Where the repo should be before you start

You already have:
- `features/users/{types,api,hooks}.ts` (`useUsers`, `useDisableUser`, `useReactivateUser`, `useRemoveUser`).
- `Paginated`, `ListParams`, `AccountStatus` in `src/lib/api/types.ts`.
- `CmsLayout` behind `RequireAuth`, with the `navItems` array, and `AdminsPage` as the reference for a table page with actions.

```bash
docker compose up -d db
pnpm dev:server   # and in another terminal: pnpm dev:web
```
Log in with the seeded admin. You need a few users to see anything. There is no user sign-up yet, so add 3 or 4 rows in `pnpm db:studio` (table `users`). The crypto columns just need any placeholder bytes and the JSON `{}` for `kdf_params`; if Studio makes that awkward, ask the team for a seed.

Rules of this repo apply: `@/` alias imports only (never `./`), named exports, no `any`, `pnpm typecheck && pnpm lint` before each commit. Type the code yourself so it sticks.

### Decisions already made

| Topic | Decision |
| --- | --- |
| Data layer | Reuse `features/users/*` as is. The page never calls `api` directly |
| Pagination | Server-side: `page` + `limit` state in the page, passed to `useUsers` |
| Columns | Email, Status tag (`ACTIVE` green, `DISABLED` red), Created, Actions. Nothing else exists on `User` |
| Search | By email, sent as `search`. Submitted with Enter or the search icon, not on every keystroke |
| Status filter | `ACTIVE` / `DISABLED`, clearable |
| Filter change | Always goes back to page 1 |
| Disable | Needs a confirm (it revokes the user's sessions). Reactivate does not |
| Delete | Needs a confirm that says the vault is permanently removed |
| Feedback | `message.success` / `message.error` from `App.useApp()`, same as `AdminsPage` |
| Busy state | All action buttons are disabled while any of the three mutations is pending |

---

## Part A: Route, menu, list

Branch: `feat/web-users-list`.

### A1. The page (`src/pages/cms/UsersPage.tsx`)

```tsx
import { Table, Tag } from "antd";
import { useState } from "react";

import { useUsers } from "@/features/users/hooks";
import type { User } from "@/features/users/types";

const formatDate = (iso: string) => new Date(iso).toLocaleString();

export function UsersPage() {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const { data, isFetching } = useUsers({ page, limit });

  return (
    <Table<User>
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
        { title: "Email", dataIndex: "email" },
        {
          title: "Status",
          dataIndex: "status",
          render: (s: User["status"]) => (
            <Tag color={s === "ACTIVE" ? "green" : "red"}>{s}</Tag>
          ),
        },
        { title: "Created", dataIndex: "createdAt", render: formatDate },
      ]}
    />
  );
}
```

`useUsers` already uses `keepPreviousData`, so the old rows stay on screen while the next page loads.

### A2. Register the route (`src/router.tsx`)

Add the import (Biome sorts imports for you) and the route inside the `CmsLayout` children, before `/admins`:

```tsx
import { UsersPage } from "@/pages/cms/UsersPage";
```
```tsx
          { path: "/users", element: <UsersPage /> },
          { path: "/admins", element: <AdminsPage /> },
```

### A3. Add the menu item (`src/components/layouts/CmsLayout.tsx`)

Add `UserOutlined` to the icon import, and one entry to `navItems` before Admins:

```tsx
import {
  AuditOutlined,
  DashboardOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  TeamOutlined,
  UserOutlined,
} from "@ant-design/icons";
```
```tsx
const navItems = [
  { key: "/", label: "Dashboard", icon: <DashboardOutlined /> },
  { key: "/users", label: "Users", icon: <UserOutlined /> },
  { key: "/admins", label: "Admins", icon: <TeamOutlined /> },
  { key: "/audit", label: "Audit log", icon: <AuditOutlined /> },
];
```

### Check

- "Users" appears in the sidebar and highlights when selected. `/users` loads.
- Rows show email, a green or red status tag, and the created date.
- With more rows than the page size, paging works and changing the page size works.
- Reload on `/users`: you stay logged in and the page loads again.

### Finish Part A

Run `pnpm typecheck && pnpm lint` first.

- Branch: `feat/web-users-list`
- Commit: `feat(web): add users list page`

---

## Part B: Search, status filter, actions

Start from `main` with Part A merged. Branch: `feat/web-users-actions`. Only `src/pages/cms/UsersPage.tsx` changes.

### What changes

1. New antd imports: `App`, `Button`, `Input`, `Popconfirm`, `Select`, `Space`.
2. State for `search` and `status`, passed to `useUsers`. An empty search is sent as `undefined` so it is not in the query string.
3. A filter bar above the table. Each handler also calls `setPage(1)`. Without it, filtering while on page 3 can leave you on a page that no longer exists.
4. The three mutation hooks, a `busy` flag, and a `run()` helper that awaits the mutation and shows a success or error message (same helper as `AdminsPage`).
5. An Actions column: Disable (with confirm) or Reactivate depending on status, plus Delete (with confirm).

### B1. The final page (replace `src/pages/cms/UsersPage.tsx`)

```tsx
import {
  App,
  Button,
  Input,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
} from "antd";
import { useState } from "react";

import {
  useDisableUser,
  useReactivateUser,
  useRemoveUser,
  useUsers,
} from "@/features/users/hooks";
import type { User } from "@/features/users/types";
import type { AccountStatus } from "@/lib/api/types";

const formatDate = (iso: string) => new Date(iso).toLocaleString();

export function UsersPage() {
  const { message } = App.useApp();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<AccountStatus>();
  const { data, isFetching } = useUsers({
    page,
    limit,
    search: search || undefined,
    status,
  });
  const disableUser = useDisableUser();
  const reactivateUser = useReactivateUser();
  const removeUser = useRemoveUser();
  const busy =
    disableUser.isPending || reactivateUser.isPending || removeUser.isPending;

  const run = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action();
      message.success(success);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Something went wrong");
    }
  };

  return (
    <>
      <Space wrap style={{ marginBottom: 16 }}>
        <Input.Search
          allowClear
          placeholder="Search by email"
          style={{ width: 260 }}
          onSearch={(v) => {
            setSearch(v.trim());
            setPage(1);
          }}
        />
        <Select<AccountStatus>
          allowClear
          placeholder="All statuses"
          style={{ width: 160 }}
          options={[
            { value: "ACTIVE", label: "Active" },
            { value: "DISABLED", label: "Disabled" },
          ]}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
        />
      </Space>
      <Table<User>
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
          { title: "Email", dataIndex: "email" },
          {
            title: "Status",
            dataIndex: "status",
            render: (s: User["status"]) => (
              <Tag color={s === "ACTIVE" ? "green" : "red"}>{s}</Tag>
            ),
          },
          { title: "Created", dataIndex: "createdAt", render: formatDate },
          {
            title: "Actions",
            render: (_, user) => (
              <Space>
                {user.status === "ACTIVE" ? (
                  <Popconfirm
                    title="Disable this user?"
                    description="Their sessions will be revoked."
                    okText="Disable"
                    okButtonProps={{ danger: true }}
                    onConfirm={() =>
                      run(
                        () => disableUser.mutateAsync(user.id),
                        "User disabled"
                      )
                    }
                  >
                    <Button size="small" disabled={busy}>
                      Disable
                    </Button>
                  </Popconfirm>
                ) : (
                  <Button
                    size="small"
                    disabled={busy}
                    onClick={() =>
                      run(
                        () => reactivateUser.mutateAsync(user.id),
                        "User reactivated"
                      )
                    }
                  >
                    Reactivate
                  </Button>
                )}
                <Popconfirm
                  title="Delete this user?"
                  description="This permanently removes the account and its vault."
                  okText="Delete"
                  okButtonProps={{ danger: true }}
                  onConfirm={() =>
                    run(() => removeUser.mutateAsync(user.id), "User deleted")
                  }
                >
                  <Button size="small" danger disabled={busy}>
                    Delete
                  </Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />
    </>
  );
}
```

Notes on the code:
- Mutations are `mutateAsync` inside `run()` so a failure (for example a 404 because someone else already deleted the user) lands in the `catch` and shows an error toast instead of an unhandled rejection.
- The hooks already invalidate `userKeys.all` on success, so the table refetches by itself. You do not need to touch the cache.
- Disable is wrapped in `Popconfirm`; Reactivate is a plain button because it is harmless and easy to undo.
- `Input.Search` fires `onSearch` on Enter or the icon click. With `allowClear`, clicking the x also calls `onSearch("")`, which clears the filter.

### Check

- **Search:** type part of an email and press Enter, only matching users remain. Clear it (the x), all users return.
- **Status:** pick `Disabled`, only disabled users remain. Clear it, all return. Combine search + status.
- **Page reset:** with at least 2 pages, go to page 2, then change any filter. You land on page 1.
- **Disable:** click Disable on an active user, confirm. A success toast appears, the tag turns red and the button becomes Reactivate.
- **Reactivate:** click it, the tag turns green again.
- **Delete:** click Delete, confirm. The row disappears. The confirm text mentions the vault.
- **Audit trail:** open `/audit`, there is one new row per action you just did.
- **Busy state:** while a request is in flight the action buttons are disabled.

### Finish Part B

Run `pnpm typecheck && pnpm lint` first.

- Branch: `feat/web-users-actions`
- Commit: `feat(web): add users search and actions`
