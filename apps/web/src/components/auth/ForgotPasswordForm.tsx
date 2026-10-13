import { Alert, Button, Form, Input } from "antd";
import { useState } from "react";
import { Link } from "react-router";

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);

  return (
    <Form
      layout="vertical"
      // TODO: call POST admin/auth/forgot-password via `api` once integrated.
      onFinish={() => setSent(true)}
    >
      {sent && (
        <Alert
          type="success"
          title="If the account exists, a reset link has been sent."
          style={{ marginBottom: 16 }}
        />
      )}
      <Form.Item
        name="email"
        label="Email"
        rules={[{ required: true, type: "email" }]}
      >
        <Input autoComplete="email" />
      </Form.Item>
      <Form.Item>
        <Button type="primary" htmlType="submit" block>
          Send reset link
        </Button>
      </Form.Item>
      <Link to="/login">Back to login</Link>
    </Form>
  );
}
