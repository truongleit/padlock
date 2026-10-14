import { Alert, Button, Form, Input } from "antd";
import { Link, useNavigate } from "react-router";

import { useLogin } from "@/features/auth/hooks";

interface LoginValues {
  email: string;
  password: string;
}

export function LoginForm() {
  const navigate = useNavigate();
  const { mutateAsync, isPending, error } = useLogin();

  return (
    <Form<LoginValues>
      layout="vertical"
      onFinish={async (values) => {
        await mutateAsync(values);
        navigate("/", { replace: true });
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
        <Input autoComplete="username" />
      </Form.Item>
      <Form.Item name="password" label="Password" rules={[{ required: true }]}>
        <Input.Password autoComplete="current-password" />
      </Form.Item>
      <Form.Item>
        <Button type="primary" htmlType="submit" block loading={isPending}>
          Log in
        </Button>
      </Form.Item>
      <Link to="/forgot-password">Forgot password?</Link>
    </Form>
  );
}
