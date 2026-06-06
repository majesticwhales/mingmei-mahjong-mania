import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { HttpError } from "../../transport/httpError";
import { useAuth } from "../../state/auth/hooks";

export function LoginScreen() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login({ email, password });
      navigate("/lobbies", { replace: true });
    } catch (err) {
      if (err instanceof HttpError) {
        setError(err.message);
      } else {
        setError("Could not log in. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="screen">
      <h1 className="screen__title">mingmei&apos;s mahjong mania</h1>
      <form className="form" onSubmit={handleSubmit}>
        <label className="form__field">
          <span>Email</span>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label className="form__field">
          <span>Password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && <p className="form__error">{error}</p>}
        <button className="btn btn--primary" type="submit" disabled={submitting}>
          {submitting ? "Logging in…" : "Log in"}
        </button>
      </form>
      <p className="screen__footer">
        Need an account? <Link to="/register">Register</Link>
      </p>
    </main>
  );
}
