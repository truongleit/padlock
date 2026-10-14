# Padlock Web: Admins page (list, create, disable/reactivate/delete)

## Context

Builds the `/admins` page in the CMS (`apps/web`) on top of the existing `/admins` CRUD from `ADMIN_CRUD_GUIDE.md`. Everything lives in one page component; the API layer already exists.

Scope:
- **Part A:** route, menu item, paginated table (list).
- **Part B:** "New admin" modal (create).
- **Part C:** per-row Disable / Reactivate and Delete buttons.

Not in this guide: search/status filters, editing email, tests.

### Where the repo should be before you start

You already have (from the auth-guard and token-refresh work):
- `src/features/admins/{api,hooks,types}.ts` with `useAdmins`, `useCreateAdmin`, `useUpdateAdmin`, `useRemoveAdmin` and the `adminKeys` factory. Every mutation invalidates `adminKeys.all`, so the table refreshes on its own.
- `Paginated` / `ListParams` / `AccountStatus` in `src/lib/api/types.ts`.
- `CmsLayout` behind `RequireAuth`, and `App.useApp()` available (antd `<App>` wrapper is in `Providers`).

```bash
docker compose up -d db
pnpm dev:server   # and in another terminal: pnpm dev:web
```
Log in with the seeded admin. Rules of this repo apply: `@/` alias imports only, named exports, no `any`, `pnpm typecheck && pnpm lint` before each commit.

### Decisions already made

| Topic | Decision |
| --- | --- |
| Data layer | Reuse `features/admins/hooks.ts`. Do not call `api` from the page |
| Pagination | Server-side: `page` + `limit` state in the page, passed to `useAdmins` |
| Errors | Table actions: `message.error`. Create form: inline `Alert` inside the modal |
| Confirmations | `Popconfirm` for Disable and Delete; Reactivate is harmless, so no confirm |
| Disable/Reactivate | `PATCH /admins/:id` with `{ status }`, not a separate endpoint |

---

## Part A: Route, menu, list

### A1. Create `src/pages/cms/AdminsPage.tsx`

Start with only the list. State and table:

```tsx
export function AdminsPage() {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const { data, isFetching } = useAdmins({ page, limit });

  return (
    <Table<Admin>
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
          render: (s: Admin["status"]) => (
            <Tag color={s === "ACTIVE" ? "green" : "red"}>{s}</Tag>
          ),
        },
        { title: "Created", dataIndex: "createdAt", render: formatDate },
        { title: "Last login", dataIndex: "lastLoginAt", render: formatDate },
      ]}
    />
  );
}
```

with a module-level helper (`lastLoginAt` is nullable):
```tsx
const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString() : "-";
```

Why it works: `useAdmins` uses `keepPreviousData`, so the table does not flash empty when you change page. `data.total` drives the page count.

### A2. Register the route (`src/router.tsx`)

Add the import and a child under the `CmsLayout` route:
```tsx
import { AdminsPage } from "@/pages/cms/AdminsPage";
// ...
children: [
  { path: "/", element: <DashboardPage /> },
  { path: "/admins", element: <AdminsPage /> },
],
```

### A3. Add the menu item (`src/components/layouts/CmsLayout.tsx`)

Import `TeamOutlined` from `@ant-design/icons` and add to the menu items array:
```tsx
{ key: "/admins", label: "Admins", icon: <TeamOutlined /> },
```
The `key` must equal the route path so the menu highlights and navigates correctly.

### Check
Open `/admins`: you see the seeded admin, status tag green. Create a few more rows via Swagger (`POST /admins`) and set page size to confirm paging.

Suggested branch: `feat/web-admins-list`
Suggested commit message: `feat(web): add admins list page`

---

## Part B: Create

### B1. Create the modal component (`src/components/admins/CreateAdminModal.tsx`)

The modal owns its form, mutation and reset logic, so the page only tracks whether it is open.

```tsx
import { Alert, App, Form, Input, Modal } from "antd";

import { useCreateAdmin } from "@/features/admins/hooks";
import type { CreateAdminInput } from "@/features/admins/types";

interface CreateAdminModalProps {
  open: boolean;
  onClose: () => void;
}

export function CreateAdminModal({ open, onClose }: CreateAdminModalProps) {
  const { message } = App.useApp();
  const [form] = Form.useForm<CreateAdminInput>();
  const { mutateAsync, isPending, error, reset } = useCreateAdmin();

  const close = () => {
    onClose();
    form.resetFields();
    reset(); // clears the previous server error
  };

  return (
    <Modal
      title="New admin"
      open={open}
      okText="Create"
      confirmLoading={isPending}
      onOk={() => form.submit()}
      onCancel={close}
      destroyOnHidden
    >
      <Form<CreateAdminInput>
        form={form}
        layout="vertical"
        onFinish={async (values) => {
          await mutateAsync(values);
          message.success("Admin created");
          close();
        }}
      >
        {error && <Alert type="error" title={error.message} showIcon style={{ marginBottom: 16 }} />}
        <Form.Item name="email" label="Email" rules={[{ required: true, type: "email" }]}>
          <Input autoComplete="off" />
        </Form.Item>
        <Form.Item
          name="password"
          label="Password"
          extra="12 to 128 characters"
          rules={[{ required: true, min: 12, max: 128 }]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
```

Notes:
- The OK button is outside the `<Form>`, hence `onOk={() => form.submit()}`.
- Password rules mirror the server DTO (12 to 128). If the DTO changes, change both.
- `onFinish` awaits `mutateAsync`; on failure it throws, `close()` is skipped, and the modal stays open showing `error` (e.g. 409 duplicate email from the global error filter).
- `onFinish` throwing an unhandled rejection is acceptable here because the error is already surfaced via `error`.

### B2. Use it in the page (`src/pages/cms/AdminsPage.tsx`)

```tsx
import { PlusOutlined } from "@ant-design/icons";
import { useState } from "react";

import { CreateAdminModal } from "@/components/admins/CreateAdminModal";

const [open, setOpen] = useState(false);
```

Wrap the return in a fragment, add the button above the table, and render the modal after it:
```tsx
<div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
  <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
    New admin
  </Button>
</div>
{/* ...Table... */}
<CreateAdminModal open={open} onClose={() => setOpen(false)} />
```

### Check
Create an admin: modal closes, toast shows, new row appears (cache invalidation). Create the same email again: red alert "already exists"-style message, modal stays. Cancel, reopen: form and alert are cleared.

Suggested branch: `feat/web-admins-create`
Suggested commit message: `feat(web): add create admin modal`

---

## Part C: Disable / Reactivate / Delete

### C1. Mutations and a small runner

```tsx
const { message } = App.useApp();
const updateAdmin = useUpdateAdmin();
const removeAdmin = useRemoveAdmin();
const busy = updateAdmin.isPending || removeAdmin.isPending;

const run = async (action: () => Promise<unknown>, success: string) => {
  try {
    await action();
    message.success(success);
  } catch (e) {
    message.error(e instanceof Error ? e.message : "Something went wrong");
  }
};
```
`busy` disables all row buttons while any action is in flight, which avoids double submits.

### C2. Actions column

Add as the last column:
```tsx
{
  title: "Actions",
  render: (_, admin) => {
    const isActive = admin.status === "ACTIVE";
    const toggle = () =>
      run(
        () => updateAdmin.mutateAsync({ id: admin.id, status: isActive ? "DISABLED" : "ACTIVE" }),
        "Admin updated"
      );
    return (
      <Space>
        <Popconfirm
          title="Disable this admin?"
          okText="Disable"
          okButtonProps={{ danger: true }}
          disabled={!isActive}
          onConfirm={toggle}
        >
          <Button size="small" disabled={busy} onClick={isActive ? undefined : toggle}>
            {isActive ? "Disable" : "Reactivate"}
          </Button>
        </Popconfirm>
        <Popconfirm
          title="Delete this admin?"
          okText="Delete"
          okButtonProps={{ danger: true }}
          onConfirm={() => run(() => removeAdmin.mutateAsync(admin.id), "Admin deleted")}
        >
          <Button size="small" danger disabled={busy}>Delete</Button>
        </Popconfirm>
      </Space>
    );
  },
},
```

The one trick: a single button is both Disable and Reactivate. `Popconfirm` is `disabled` when the admin is already disabled, so clicking "Reactivate" skips the confirm and its own `onClick={toggle}` fires. When active, `onClick` is `undefined` and the confirm's `onConfirm` fires `toggle`.

### Check
- Disable an admin: tag turns red, button reads "Reactivate". Click it: back to green, no confirm.
- Delete: confirm, row disappears.
- Server rules to know: disabling an admin revokes their sessions, and the JWT guard rejects non-`ACTIVE` admins. Try disabling yourself and observe the next request 401; the refresh-on-401 flow will then send you to login. (Optional follow-up: hide these buttons for the current admin.)

Suggested branch: `feat/web-admins-actions`
Suggested commit message: `feat(web): add disable, reactivate and delete admin actions`

---

## Finish

```bash
pnpm typecheck && pnpm lint
```
Then update the Layout section of `CLAUDE.md` if the page list changed.

Exercises: add `search` / `status` filters (`ListQueryDto` already supports them server-side; pass through `ListParams`), and block self-disable/self-delete using `GET /admin/auth/me`.
