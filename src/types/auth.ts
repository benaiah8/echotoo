// src/types/auth.ts
export interface AuthPayload {
  email: string;
  password: string;
  // optional fields used by signup only
  repeatPassword?: string;
  username?: string;
  fullName?: string;
}
