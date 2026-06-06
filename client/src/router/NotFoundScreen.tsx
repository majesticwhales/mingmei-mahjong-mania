import { Link } from "react-router-dom";

export function NotFoundScreen() {
  return (
    <main className="screen">
      <h1 className="screen__title">Page not found</h1>
      <p className="screen__subtitle">That route does not exist.</p>
      <Link className="btn btn--primary" to="/">
        Go home
      </Link>
    </main>
  );
}
