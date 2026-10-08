import { Button, Form, Input } from "antd";
import { Link, useNavigate } from "react-router";

interface LoginValues {
  email: string;
  password: string;
}

export function LoginForm() {
  const navigate = useNavigate();

  return (
    <Form<LoginValues>
      layout="vertical"
      // TODO: call POST admin/auth/login via `api` once auth is integrated.
      onFinish={() => navigate("/")}
    >
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
        <Button type="primary" htmlType="submit" block>
          Log in into Mehran
        </Button>
      </Form.Item>
      <Link to="/forgot-password">Forgot password?</Link>
    </Form>
  );
}
