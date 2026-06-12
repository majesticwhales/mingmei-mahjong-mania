import { useCallback } from "react";
import { RouterProvider } from "react-router-dom";
import "./App.css";
import { destroySocket } from "./transport/socketClient";
import { createAppRouter } from "./router/routes";
import { AuthProvider } from "./state/auth/Context";
import { useAuthToken } from "./state/auth/hooks";
import { ConnectionProvider } from "./state/connection/Context";
import { OutboxProvider } from "./state/outbox/Context";
import { LobbyProvider } from "./state/lobby/Context";
import { GameProvider } from "./state/game/Context";
import { LobbyRoomScreen } from "./screens/LobbyRoom/LobbyRoomScreen";
import { GameScreen } from "./screens/Game/GameScreen";
import { GameSummaryScreen } from "./screens/GameSummary/GameSummaryScreen";
import { GameWrapUpScreen } from "./screens/GameWrapUp/GameWrapUpScreen";

const router = createAppRouter({
  lobbyRoom: <LobbyRoomScreen />,
  game: <GameScreen />,
  gameWrapUp: <GameWrapUpScreen />,
  gameSummary: <GameSummaryScreen />,
});

function ConnectedProviders() {
  const token = useAuthToken();
  return (
    <ConnectionProvider token={token}>
      <OutboxProvider>
        <LobbyProvider>
          <GameProvider>
            <RouterProvider router={router} />
          </GameProvider>
        </LobbyProvider>
      </OutboxProvider>
    </ConnectionProvider>
  );
}

export default function App() {
  const handleLogout = useCallback(() => {
    destroySocket();
  }, []);

  return (
    <AuthProvider onLogout={handleLogout}>
      <ConnectedProviders />
    </AuthProvider>
  );
}
