import { Outlet } from "react-router-dom";
import { RetryBanner } from "../components/RetryBanner";
import { ToastShelf } from "../components/ToastShelf";

export function AuthedLayout() {
  return (
    <>
      <RetryBanner />
      <ToastShelf />
      <Outlet />
    </>
  );
}
