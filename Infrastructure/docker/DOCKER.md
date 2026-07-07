# Running with Docker

Everything runs in containers — you don't need the .NET SDK or SQL Server
installed on your machine, only **Docker Desktop** (or Docker Engine +
Compose plugin).

```
EmployeeDirectory/
├── .dockerignore                      ← must stay at project root (build context root)
├── Backend/, Frontend/, Program.cs…   ← application source
└── Infrastructure/
    └── docker/
        ├── Dockerfile                 ← multi-stage build for the app image
        ├── docker-compose.yml         ← orchestrates db + app services
        ├── .env.example               ← copy to .env and set a real SA password
        └── DOCKER.md                  ← this file
```

> **Why is `.dockerignore` not in `Infrastructure/docker/` too?** Docker
> requires it to sit at the root of the *build context* — which is the
> project root here (see `context: ../..` in `docker-compose.yml`), not
> next to the `Dockerfile`. It has to stay where it is for Docker to find it.

All commands below assume you've `cd`'d into `Infrastructure/docker/`.

## 0. One-time setup

```bash
cd Infrastructure/docker
cp .env.example .env
```
Edit `.env` and set `SA_PASSWORD` to something meeting SQL Server's
complexity rules (8+ chars, at least 3 of: uppercase / lowercase / digit /
symbol).

## 1. Generate the EF Core migration (one-time, before first build)

The repo doesn't ship a `Migrations/` folder yet — it needs to be generated
once from the `Employee` entity so the app knows what SQL to run. You don't
need the SDK installed locally for this either; run it through a throwaway
SDK container that mounts your **project root** (two levels up from here):

```bash
docker run --rm -v "$(cd ../.. && pwd):/src" -w /src mcr.microsoft.com/dotnet/sdk:8.0 \
  bash -c "dotnet tool install --global dotnet-ef && \
           export PATH=\"\$PATH:/root/.dotnet/tools\" && \
           dotnet ef migrations add InitialCreate"
```

This writes a `Migrations/` folder into the project root (owned by your
host user via the bind mount). Commit it to source control — it's part of
your codebase, not a build artifact. You only need to re-run this command
later if you change the `Employee` entity or `AppDbContext`.

> This step doesn't need SQL Server running yet — `migrations add` only
> reflects over your C# model, it doesn't connect to a database.

## 2. Build and run everything

From `Infrastructure/docker/`:
```bash
docker compose up --build
```

What happens, in order:
1. `db` (SQL Server 2022) starts; Compose waits for its healthcheck
   (`SELECT 1` via `sqlcmd`) to pass before starting `app`.
2. `app` builds from `Dockerfile` using the project root as build context
   (multi-stage: SDK → publish → slim ASP.NET runtime image) and starts.
3. On startup, `Program.cs` runs `Database.MigrateAsync()` (creates the
   `EmployeeDirectoryDb` database + applies the migration from step 1) and
   then seeds 120 employees — with a retry loop in case SQL Server needs a
   few extra seconds even after the healthcheck passes.

Once you see `Now listening on: http://[::]:8080` in the logs, open:

**http://localhost:8080/Employees**

## 3. Connect with DBeaver

The `db` service publishes port `1433` to your host, so DBeaver connects
exactly like it would to a local SQL Server install:

1. **Database → New Database Connection → SQL Server**
   (DBeaver will prompt to download the driver the first time — allow it.)
2. Connection settings:
   | Field | Value |
   |---|---|
   | Host | `localhost` |
   | Port | `1433` |
   | Database | `EmployeeDirectoryDb` (only exists after the app has started once — see step 2) |
   | Authentication | SQL Server Authentication |
   | Username | `sa` |
   | Password | the `SA_PASSWORD` you set in `.env` |
3. Open the **Driver properties** tab and set:
   - `trustServerCertificate` = `true`
   - `encrypt` = `false`

   (The container uses a self-signed dev certificate for its TLS listener;
   without this, DBeaver's connection test will fail with an SSL/cert error.)
4. Test Connection → Finish.

Once connected, expand `EmployeeDirectoryDb → Tables → Employees` and run,
e.g.:
```sql
SELECT COUNT(*) FROM Employees WHERE IsDeleted = 0;
SELECT TOP 20 * FROM Employees ORDER BY LastName;
```

## Everyday commands

Run from `Infrastructure/docker/`:

| Task | Command |
|---|---|
| Start (after first build) | `docker compose up` |
| Start + rebuild after code changes | `docker compose up --build` |
| Stop | `docker compose down` |
| Stop **and delete all data** (fresh reseed next start) | `docker compose down -v` |
| View app logs | `docker compose logs -f app` |
| View SQL Server logs | `docker compose logs -f db` |
| Shell into the app container | `docker compose exec app bash` |

## Troubleshooting

- **`app` keeps restarting / exits immediately**: check `docker compose logs app`.
  Most common cause is a missing `Migrations/` folder (see step 1) or the
  `SA_PASSWORD` in `.env` not meeting SQL Server's complexity requirements
  (the `db` container will refuse to start and its healthcheck will never pass).
- **Port already in use** (`1433` or `8080`): change the host-side port in
  `docker-compose.yml`, e.g. `"18080:8080"` for the app, and update the
  DBeaver/browser URL accordingly.
- **DBeaver: "The driver is not configured to trust the server certificate"**:
  set `trustServerCertificate=true` as described in step 3.
- **Build fails with "COPY failed: file not found"**: make sure you're
  running `docker compose` from `Infrastructure/docker/` — the `context: ../..`
  path in `docker-compose.yml` is relative to that file's own location.
