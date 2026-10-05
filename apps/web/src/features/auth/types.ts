export interface Session {
  id: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface ResetPasswordInput {
  token: string;
  newPassword: string;
}

export interface AccessToken {
  accessToken: string;
}
