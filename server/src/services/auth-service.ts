import { UniqueConstraintError } from "sequelize";
import { hashPassword, verifyPassword } from "../auth/password.ts";
import { signAccessToken } from "../auth/jwt.ts";
import { HttpError } from "../lib/http-error.ts";
import { User } from "../models/user.ts";

export interface PublicUser {
  id: string;
  email: string;
  username: string;
  createdAt: Date;
}

export interface AuthResult {
  user: PublicUser;
  token: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const MIN_USERNAME_LENGTH = 3;
const MAX_USERNAME_LENGTH = 32;

function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    createdAt: user.createdAt,
  };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function validateRegisterInput(
  email: string,
  username: string,
  password: string,
): void {
  if (!EMAIL_REGEX.test(email)) {
    throw new HttpError(400, "validation_error", "Invalid email address");
  }
  const trimmedUsername = username.trim();
  if (
    trimmedUsername.length < MIN_USERNAME_LENGTH ||
    trimmedUsername.length > MAX_USERNAME_LENGTH
  ) {
    throw new HttpError(
      400,
      "validation_error",
      `Username must be ${MIN_USERNAME_LENGTH}-${MAX_USERNAME_LENGTH} characters`,
    );
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new HttpError(
      400,
      "validation_error",
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    );
  }
}

function mapUniqueConstraintError(err: UniqueConstraintError): HttpError {
  const field = err.errors[0]?.path;
  if (field === "email") {
    return new HttpError(409, "email_taken", "Email is already registered");
  }
  if (field === "username") {
    return new HttpError(409, "username_taken", "Username is already taken");
  }
  return new HttpError(409, "conflict", "Account already exists");
}

export async function register(
  email: string,
  username: string,
  password: string,
): Promise<AuthResult> {
  const normalizedEmail = normalizeEmail(email);
  const trimmedUsername = username.trim();
  validateRegisterInput(normalizedEmail, trimmedUsername, password);

  try {
    const user = await User.create({
      email: normalizedEmail,
      username: trimmedUsername,
      passwordHash: await hashPassword(password),
    });
    const token = signAccessToken(user.id);
    return { user: toPublicUser(user), token };
  } catch (err) {
    if (err instanceof UniqueConstraintError) {
      throw mapUniqueConstraintError(err);
    }
    throw err;
  }
}

export async function login(
  email: string,
  password: string,
): Promise<AuthResult> {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !password) {
    throw new HttpError(400, "validation_error", "Email and password are required");
  }

  const user = await User.scope("withPassword").findOne({
    where: { email: normalizedEmail },
  });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw new HttpError(401, "invalid_credentials", "Invalid email or password");
  }

  const token = signAccessToken(user.id);
  return { user: toPublicUser(user), token };
}

export async function getUserById(userId: string): Promise<PublicUser> {
  const user = await User.findByPk(userId);
  if (!user) {
    throw new HttpError(404, "not_found", "User not found");
  }
  return toPublicUser(user);
}
