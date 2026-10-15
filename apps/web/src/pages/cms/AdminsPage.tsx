import { PlusOutlined } from "@ant-design/icons";
import { Button, Table, Tag } from "antd";
import { useState } from "react";

import { CreateAdminModal } from "@/components/admins/CreateAdminModal";
import { useAdmins } from "@/features/admins/hooks";
import type { Admin } from "@/features/admins/types";

const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString() : "-";

export function AdminsPage() {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [open, setOpen] = useState(false);
  const { data, isFetching } = useAdmins({ page, limit });

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
        ]}
      />
      <CreateAdminModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
