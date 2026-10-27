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
