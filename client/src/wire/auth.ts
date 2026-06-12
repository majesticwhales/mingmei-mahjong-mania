// SERVER SOURCE: server/src/services/auth-service.ts

export interface User {
  id: string;
  email: string;
  username: string;
  isAdmin: boolean;
  createdAt: string;
}

export interface RegisterRequest {
  email: string;
  username: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: User;
  token: string;
  activeGameId: string | null;
}

export interface MeResponse {
  user: User;
  activeGameId: string | null;
}
