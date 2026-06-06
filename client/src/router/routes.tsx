import type { ReactNode } from "react";
import { createBrowserRouter } from "react-router-dom";
import { LoginScreen } from "../screens/Login/LoginScreen";
import { RegisterScreen } from "../screens/Register/RegisterScreen";
import { LobbiesScreen } from "../screens/Lobbies/LobbiesScreen";
import { AuthedLayout } from "./AuthedLayout";
import { NotFoundScreen } from "./NotFoundScreen";
import { RequireAuth } from "./RequireAuth";
import { RootRedirect } from "./RootRedirect";

export function createAppRouter(children?: {
  lobbyRoom?: ReactNode;
  game?: ReactNode;
  gameSummary?: ReactNode;
}) {
  return createBrowserRouter([
    { path: "/", element: <RootRedirect /> },
    { path: "/login", element: <LoginScreen /> },
    { path: "/register", element: <RegisterScreen /> },
    {
      element: <RequireAuth />,
      children: [
        {
          element: <AuthedLayout />,
          children: [
        { path: "/lobbies", element: <LobbiesScreen /> },
        ...(children?.lobbyRoom
          ? [{ path: "/lobbies/:id", element: children.lobbyRoom }]
          : []),
        ...(children?.game
          ? [{ path: "/games/:id", element: children.game }]
          : []),
        ...(children?.gameSummary
          ? [{ path: "/games/:id/summary", element: children.gameSummary }]
          : []),
          ],
        },
      ],
    },
    { path: "*", element: <NotFoundScreen /> },
  ]);
}
