import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import { AUTH_STORAGE_KEY, restClient, setTokenProvider } from "../../transport/restClient";
import type { LoginRequest, RegisterRequest } from "../../wire/auth";
import { authReducer } from "./reducer";
import type { AuthState } from "./types";

interface AuthContextValue {
  state: AuthState;
  login: (input: LoginRequest) => Promise<string | null>;
  register: (input: RegisterRequest) => Promise<string | null>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

function readStoredToken(): string | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { token?: string };
    return typeof parsed.token === "string" ? parsed.token : null;
  } catch {
    return null;
  }
}

interface Props {
  children: ReactNode;
  onLogout?: () => void;
}

export function AuthProvider({ children, onLogout }: Props) {
  const [state, dispatch] = useReducer(authReducer, { status: "unknown" });

  const token =
    state.status === "authenticated" ? state.token : null;

  useEffect(() => {
    // Fall back to localStorage so authenticated routes can fetch on first paint
    // after refresh, before auth/login/success updates in-memory token.
    setTokenProvider(() => token ?? readStoredToken());
  }, [token]);

  useEffect(() => {
    const stored = readStoredToken();
    if (!stored) {
      dispatch({ type: "auth/restore/failed" });
      return;
    }
    dispatch({ type: "auth/restore", token: stored });
    restClient
      .getMe(stored)
      .then(({ user, activeGameId }) => {
        dispatch({
          type: "auth/login/success",
          user,
          token: stored,
          activeGameId,
        });
      })
      .catch(() => {
        localStorage.removeItem(AUTH_STORAGE_KEY);
        dispatch({ type: "auth/restore/failed" });
      });
  }, []);

  const persistToken = useCallback((nextToken: string) => {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ token: nextToken }));
  }, []);

  const login = useCallback(async (input: LoginRequest) => {
    const result = await restClient.login(input);
    persistToken(result.token);
    dispatch({
      type: "auth/login/success",
      user: result.user,
      token: result.token,
      activeGameId: result.activeGameId,
    });
    return result.activeGameId;
  }, [persistToken]);

  const register = useCallback(async (input: RegisterRequest) => {
    const result = await restClient.register(input);
    persistToken(result.token);
    dispatch({
      type: "auth/login/success",
      user: result.user,
      token: result.token,
      activeGameId: result.activeGameId,
    });
    return result.activeGameId;
  }, [persistToken]);

  const logout = useCallback(() => {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    dispatch({ type: "auth/logout" });
    onLogout?.();
  }, [onLogout]);

  const value = useMemo(
    () => ({ state, login, register, logout }),
    [state, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
