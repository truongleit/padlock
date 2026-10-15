import { PlusOutlined } from "@ant-design/icons";
import { App, Button, Popconfirm, Space, Table, Tag } from "antd";
import { useState } from "react";

import { CreateAdminModal } from "@/components/admins/CreateAdminModal";
import {
  useAdmins,
  useRemoveAdmin,
  useUpdateAdmin,
} from "@/features/admins/hooks";
import type { Admin } from "@/features/admins/types";

const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString() : "-";

export function AdminsPage() {
  const { message } = App.useApp();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [open, setOpen] = useState(false);
  const { data, isFetching } = useAdmins({ page, limit });
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

  return (
    <>
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          marginBottom: 16,
        }}
      >
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setOpen(true)}
        >
          New admin
        </Button>
      </div>
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
          {
            title: "Actions",
            render: (_, admin) => {
              const isActive = admin.status === "ACTIVE";
              const toggle = () =>
                run(
                  () =>
                    updateAdmin.mutateAsync({
                      id: admin.id,
                      status: isActive ? "DISABLED" : "ACTIVE",
                    }),
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
                    <Button
                      size="small"
                      disabled={busy}
                      onClick={isActive ? undefined : toggle}
                    >
                      {isActive ? "Disable" : "Reactivate"}
                    </Button>
                  </Popconfirm>
                  <Popconfirm
                    title="Delete this admin?"
                    okText="Delete"
                    okButtonProps={{ danger: true }}
                    onConfirm={() =>
                      run(
                        () => removeAdmin.mutateAsync(admin.id),
                        "Admin deleted"
                      )
                    }
                  >
                    <Button size="small" danger disabled={busy}>
                      Delete
                    </Button>
                  </Popconfirm>
                </Space>
              );
            },
          },
        ]}
      />
      <CreateAdminModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
