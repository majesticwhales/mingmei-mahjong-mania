# Production database access (Fly.io)

How collaborators connect to the production Postgres database from their own machines — for example with [Postico](https://eggerapps.at/postico2/) or `psql`.

Production Postgres runs on Fly's private network. It is **not** reachable directly from the internet. Each person tunnels traffic through `fly proxy` on their laptop.

## Prerequisites

- A [Fly.io](https://fly.io) account, invited to the org that owns the apps
- [flyctl](https://fly.io/docs/hands-on/install-flyctl/) installed and logged in:

  ```bash
  fly auth login
  ```

- A Postgres client (Postico, TablePlus, `psql`, etc.)

Confirm you can see the apps:

```bash
fly apps list
# mingmei-db
# mingmei-mahjong-mania
```

## 1. Get Fly access

An org admin invites you from the [Fly dashboard](https://fly.io/dashboard):

1. Open the org → **Members** → **Invite member**
2. **Member** role is enough for proxy + SSH

You need access to **`mingmei-db`** (for the proxy). To fetch the DB password yourself, you also need access to **`mingmei-mahjong-mania`**.

## 2. Start a local tunnel

In a terminal, from any directory:

```bash
fly proxy 15432:5432 -a mingmei-db
```

Leave this terminal **open** the whole time you are connected. Press `Ctrl+C` when finished.

If port `15432` is taken, pick another local port (e.g. `15433:5432`).

**Already running Postgres on port 5432 locally?** Always map to a different local port — do not use `fly proxy 5432:5432` unless 5432 is free.

## 3. Get credentials

Fly stores the connection string as a secret; the dashboard only shows a digest, not the value.

### Option A — fetch the password yourself

Requires access to the app machine:

```bash
fly ssh console -a mingmei-mahjong-mania -C 'node -e "console.log(new URL(process.env.DATABASE_URL).password)"'
```

### Option B — shared from an admin

An admin can send the password once through a password manager (1Password, Bitwarden, etc.). Do **not** put it in Slack, email, or the repo.

### Connection values

| Field | Value |
|-------|-------|
| Host (via proxy) | `localhost` |
| Port (via proxy) | `15432` (or whatever local port you chose) |
| User | `mingmei_mahjong_mania` |
| Database | `mingmei_mahjong_mania` |
| SSL | Off when connecting through the proxy |

Do **not** use `mingmei-db.flycast` or `mingmei-db.internal` as the host in Postico — those hostnames only work inside Fly.

## 4. Connect in Postico

1. **New Favorite** (or equivalent)
2. Fill in the values from the table above
3. Paste the password from step 3
4. Connect

## Alternative: `psql` in the terminal

With the proxy running in another tab:

```bash
fly postgres connect -a mingmei-db
```

Or connect manually once you have the password:

```bash
psql "postgres://mingmei_mahjong_mania:<password>@localhost:15432/mingmei_mahjong_mania"
```

## Troubleshooting

**`address already in use` when starting the proxy**

Another process (often local Postgres) is using that port. Use a different local port, e.g. `fly proxy 15433:5432 -a mingmei-db`, and point Postico at `15433`.

**Postico can't connect**

- Is the proxy terminal still running?
- Host must be `localhost`, not a `*.fly.dev` or `*.internal` hostname
- SSL should be disabled for proxied connections

**`fly ssh console` fails with permission denied**

Ask an org admin to confirm you are invited and have access to `mingmei-mahjong-mania`.

**Connection terminated unexpectedly**

Postgres may be stopped. Check:

```bash
fly status -a mingmei-db
```

It should show `started` with passing health checks. Start it if needed:

```bash
fly machine start <machine-id> -a mingmei-db
```

(`fly status -a mingmei-db` shows the machine ID.)

## Security

- Production DB access is powerful — only invite collaborators who need it
- Never commit `DATABASE_URL` or passwords to git
- Each person runs their own proxy; tunnels are not shared between machines
- Prefer fetching the password via `fly ssh` over pasting it in chat
