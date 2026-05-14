import { useEffect, useState } from "react";
import "./App.css";

export default function App() {
  const [message, setMessage] = useState("Loading...");

  useEffect(() => {
    fetch("/api/hello")
      .then((res) => res.json())
      .then((data) => setMessage(data.message))
      .catch(() => setMessage("Could not reach the API. Is the server running?"));
  }, []);

  return (
    <main className="app">
      <h1>mahjong-jet-lag</h1>
      <p>{message}</p>
    </main>
  );
}
