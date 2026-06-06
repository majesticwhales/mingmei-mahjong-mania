import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AuthContext } from "../../state/auth/Context";
import { LoginScreen } from "./LoginScreen";

describe("LoginScreen", () => {
  it("submits credentials", async () => {
    const login = vi.fn().mockResolvedValue(undefined);
    render(
      <AuthContext.Provider
        value={{
          state: { status: "anonymous" },
          login,
          register: vi.fn(),
          logout: vi.fn(),
        }}
      >
        <MemoryRouter>
          <LoginScreen />
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    await userEvent.type(screen.getByLabelText("Email"), "a@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "password123");
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));

    expect(login).toHaveBeenCalledWith({
      email: "a@example.com",
      password: "password123",
    });
  });
});
