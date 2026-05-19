# mahjong-jet-lag

A full-stack TypeScript app with a React frontend and an Express API backend.

## Stack

- **Client:** React 18, TypeScript, Vite
- **Server:** Node.js, Express, TypeScript, tsx, Sequelize, PostgreSQL
- **Dev tooling:** concurrently (run client + server together), Docker Compose (local Postgres)

## Prerequisites

- **Node.js 18+** (Node 22 recommended)
- **npm** (comes with Node)
- **Docker** (for local PostgreSQL)

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

### Database

1. Copy the server env template and adjust if needed:

   ```bash
   cp server/.env.example server/.env
   ```

2. Start PostgreSQL:

   ```bash
   npm run db:up
   ```

3. Run migrations:

   ```bash
   npm run db:migrate
   ```

4. Run seeding:

   ```bash
   npm run db:seed
   ```

5. Create the **test** database (once):

   ```sql
   CREATE DATABASE mahjong_jet_lag_test;
   ```

   Or via Docker: `docker exec -it <postgres_container> psql -U postgres -c "CREATE DATABASE mahjong_jet_lag_test;"`

   Ensure `DATABASE_URL_TEST` in `server/.env` points at it (see `server/.env.example`).

## Scripts

Run these from the **project root** unless noted otherwise.

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the Express API and Vite dev server together |
| `npm run dev:server` | Start only the API (port 3001) |
| `npm run dev:client` | Start only the React app (port 5173) |
| `npm run db:up` | Start PostgreSQL via Docker Compose |
| `npm run db:down` | Stop Docker Compose services |
| `npm run db:migrate` | Run pending Sequelize migrations |
| `npm run db:migrate:undo` | Undo the last migration |

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
| `npm run db:migrate` | Run pending migrations |
| `npm run db:migrate:undo` | Undo the last migration |
| `npm run db:migrate:status` | Show migration status |
| `npm run db:migration:generate -- --name <name>` | Create a new migration file |
| `npm test` | Run all Vitest suites |
| `npm run test:unit` | Unit tests only (no DB migrate/seed) |
| `npm run test:integration` | Integration/API tests (test DB) |
| `npm run test:watch` | Vitest watch mode |

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

The API checks the database on startup and exposes `GET /api/health` for a live connection check.

## Migrations

From the project root, generate a migration (run from `server/` or use `--prefix server`):

```bash
npm run db:migration:generate --prefix server -- --name create-example-table
```

Edit the file in `server/migrations/` (use a **`.cjs`** extension — the server package is ESM), then apply it:

```bash
npm run db:migrate
```

Define Sequelize models in `server/src/models/` to match your schema.

## Project structure

```text
mahjong-jet-lag/
├── client/              # React + Vite frontend
│   └── src/
├── server/              # Express API
│   ├── config/          # sequelize-cli config (CJS)
│   ├── migrations/      # SQL migrations
│   ├── seeders/
│   └── src/
│       ├── app.ts       # Express app (routes)
│       ├── index.ts     # Entry point, DB connect + listen
│       ├── config/
│       │   └── database.ts
│       └── models/
├── docker-compose.yml   # Local PostgreSQL
├── package.json         # Root scripts
└── README.md
```

## Troubleshooting

**Port already in use (`EADDRINUSE`)**

Another dev server may still be running. Stop it with `Ctrl+C` in that terminal, or find and kill the process using port `3001` or `5173`, then run `npm run dev` again.

**API not reachable from the client**

Make sure both the client and server are running. Use `npm run dev` from the project root, or start each app separately with `npm run dev:server` and `npm run dev:client`.
