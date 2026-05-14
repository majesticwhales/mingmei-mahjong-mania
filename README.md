# mahjong-jet-lag

A full-stack TypeScript app with a React frontend and an Express API backend.

## Stack

- **Client:** React 18, TypeScript, Vite
- **Server:** Node.js, Express, TypeScript, tsx
- **Dev tooling:** concurrently (run client + server together)

## Prerequisites

- **Node.js 18+** (Node 22 recommended)
- **npm** (comes with Node)

If you use [nvm](https://github.com/nvm-sh/nvm):

```bash
nvm install 22
nvm use 22
```

## Setup

Clone or download the project, then install dependencies from the repo root:

```bash
cd mahjong-jet-lag
npm install
npm install --prefix client
npm install --prefix server
```

Or install everything in one step:

```bash
cd mahjong-jet-lag
npm install && npm install --prefix client && npm install --prefix server
```

## Scripts

Run these from the **project root** unless noted otherwise.

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the Express API and Vite dev server together |
| `npm run dev:server` | Start only the API (port 3001) |
| `npm run dev:client` | Start only the React app (port 5173) |

### Client only (`client/`)

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Type-check and build for production |
| `npm run preview` | Preview the production build locally |

### Server only (`server/`)

| Command | Description |
|---------|-------------|
| `npm run dev` | Start API with hot reload |
| `npm run start` | Start API without watch mode |

## Development

1. Start both apps:

   ```bash
   npm run dev
   ```

2. Open the client in your browser:

   ```
   http://localhost:5173
   ```

3. The API runs at:

   ```
   http://localhost:3001
   ```

During development, the Vite dev server proxies `/api/*` requests to the Express server, so the React app can call `/api/hello` without hardcoding the backend URL.

## Project structure

```text
mahjong-jet-lag/
├── client/          # React + Vite frontend
│   └── src/
├── server/          # Express API
│   └── src/
│       └── index.ts
├── package.json     # Root scripts (dev, dev:client, dev:server)
└── README.md
```

## Troubleshooting

**Port already in use (`EADDRINUSE`)**

Another dev server may still be running. Stop it with `Ctrl+C` in that terminal, or find and kill the process using port `3001` or `5173`, then run `npm run dev` again.

**API not reachable from the client**

Make sure both the client and server are running. Use `npm run dev` from the project root, or start each app separately with `npm run dev:server` and `npm run dev:client`.
