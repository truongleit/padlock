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
        {error && (
          <Alert
            type="error"
            title={error.message}
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}
        <Form.Item
          name="email"
          label="Email"
          rules={[{ required: true, type: "email" }]}
        >
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
