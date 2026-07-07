# Employee Directory

ASP.NET Core MVC + EF Core (Code-First) + SQL Server employee directory with
server-side pagination, database-level search, and async delete via the
Fetch API.

This is a **single ASP.NET Core project** (one `.csproj`, one running
process — Views and Controllers must live in the same app for MVC's view
engine to work). Source is organized into two top-level folders so backend
and frontend concerns are physically separated:

```
EmployeeDirectory/
├── EmployeeDirectory.csproj
├── Program.cs                     ← wires up DI + points the view engine
│                                     and static files at Frontend/
├── appsettings.json
│
├── Backend/
│   ├── Controllers/EmployeesController.cs   ← HTTP only, thin
│   ├── Services/                            ← business logic (paging, search, soft-delete)
│   ├── Data/                                ← DbContext + startup seeder
│   ├── Models/                              ← EF Core entities
│   └── ViewModels/                          ← what the View/JS consume (never ViewBag/ViewData)
│
└── Frontend/
    ├── Views/Employees/Index.cshtml         ← Tailwind UI, server-rendered page 1
    └── wwwroot/js/employees.js              ← vanilla JS: search, pagination, delete
```

Controller → Service → DbContext → SQL Server. No business logic lives in the
controller; no raw entities are ever returned to the client.

> **Prefer Docker?** See [`Infrastructure/docker/DOCKER.md`](./Infrastructure/docker/DOCKER.md) —
> the whole stack (app + SQL Server) runs via `docker compose up`, no local
> .NET SDK or SQL Server install required. `DBeaver` connection instructions
> are included there too.

**Why not fully separate deployables (e.g. a Web API project + a static
site)?** That's a different architecture than what was specified — Razor
views (`.cshtml`) are compiled and rendered *inside* the ASP.NET Core
process itself, not served as static files, so they can't run as an
independent frontend app. What's been separated here is everything that
*can* be separated without changing the tech stack: source files are split
into `Backend/` and `Frontend/` folders, and `Program.cs` explicitly
reconfigures the Razor view engine (`RazorViewEngineOptions`) and
`WebRootPath` to look inside `Frontend/` instead of the framework's default
project-root locations.

## Setup

### 1. Prerequisites
- .NET 8 SDK
- SQL Server LocalDB (ships with Visual Studio) or any SQL Server instance
- EF Core CLI tools: `dotnet tool install --global dotnet-ef` (if not already installed)

### 2. Configure the connection string
Edit `appsettings.json` if you're not using LocalDB:

```json
"ConnectionStrings": {
  "DefaultConnection": "Server=(localdb)\\MSSQLLocalDB;Database=EmployeeDirectoryDb;Trusted_Connection=True;MultipleActiveResultSets=true;TrustServerCertificate=True"
}
```

### 3. Create the initial migration
```bash
cd EmployeeDirectory
dotnet restore
dotnet ef migrations add InitialCreate
```

### 4. Run the app
```bash
dotnet run
```
On first run, `Program.cs` automatically calls `Database.MigrateAsync()` and
then seeds **120 employees** with realistic randomized data (via the `Bogus`
library) — no manual `dotnet ef database update` step required.

Navigate to `https://localhost:7080/Employees`.

## API Reference

### `GET /api/employees`
Returns one page of employees.

| Query param | Type   | Default | Notes                                  |
|-------------|--------|---------|-----------------------------------------|
| `page`      | int    | 1       | 1-based                                 |
| `pageSize`  | int    | 10      | capped at 100                           |
| `searchTerm`| string | null    | matches FirstName OR LastName, case-insensitive, filtered in SQL |

**Response `200 OK`:**
```json
{
  "success": true,
  "data": {
    "employees": [
      { "id": 1, "firstName": "Jane", "lastName": "Doe", "department": "Engineering",
        "jobTitle": "Software Engineer", "email": "jane.doe@company.com",
        "hireDate": "2022-03-14T00:00:00", "salary": 95000.00 }
    ],
    "currentPage": 1,
    "pageSize": 10,
    "totalRecords": 120,
    "searchTerm": null,
    "totalPages": 12,
    "hasPreviousPage": false,
    "hasNextPage": true
  }
}
```

### `DELETE /api/employees/{id}`
Soft-deletes an employee (sets `IsDeleted = true`; the row is not physically
removed, preserving history).

| Status | When |
|--------|------|
| `200 OK` | Deleted successfully. Body: `{ "success": true, "data": { "id": 5 } }` |
| `404 Not Found` | No employee with that id (or already deleted). |
| `400 Bad Request` | `id <= 0`, or no id supplied at all. |
| `500 Internal Server Error` | Unexpected DB/server error — returned as JSON, never a raw HTML error page, so the frontend's `fetch()` can always parse the response and show a friendly message. |

### `GET /Employees`
Server-rendered MVC page (`Frontend/Views/Employees/Index.cshtml`). Accepts
the same `page` / `pageSize` / `searchTerm` query params and renders the
first page via `EmployeeListViewModel`, so the table has content even
before any JavaScript runs (progressive enhancement) — `employees.js` then
takes over for subsequent search/pagination/delete actions via `fetch()`.

## Frontend behavior (`Frontend/wwwroot/js/employees.js`)

Single vanilla-JS file, no frameworks:

- **Search** — debounced 300ms on keystroke, hits `GET /api/employees`,
  always resets to page 1.
- **Pagination** — Previous/Next buttons call the same endpoint with an
  updated `page`; buttons disable at the boundaries.
- **Delete** — click → confirm modal (Esc/backdrop/Cancel to dismiss) →
  `DELETE /api/employees/{id}` via `fetch()` → row fades out of the DOM
  (no page reload) → total count and pagination recompute. If the deleted
  row was the last one on a page beyond page 1, it steps back a page and
  refetches automatically. All network/404/500 failures are caught and
  shown as a dismissible error toast — the page never crashes.
- **Loading state** — table dims and pagination buttons disable while a
  request is in flight, so a click can't be double-fired.
- **Empty state** — shown when a search returns zero results.

## Design notes / trade-offs

- **Soft delete**: `IsDeleted` flag rather than a physical `DELETE FROM`.
  Chosen for auditability; trivial to switch to a hard delete in
  `Backend/Services/EmployeeService.cs` (`DeleteEmployeeAsync`) if the
  assessment expects that instead.
- **Search**: uses `string.Contains()`, which EF Core translates to a SQL
  `LIKE '%term%'`. This runs at the database level (never loads all rows into
  memory) and is case-insensitive under SQL Server's default collation.
- **Pagination**: `.Skip().Take()` applied after filtering, before
  materialization — only one page's worth of rows ever leaves SQL Server.
- **Async end-to-end**: `GetEmployeesAsync` / `DeleteEmployeeAsync` and every
  controller action are `async Task<IActionResult>` — no blocking DB calls.
- **No N+1 queries**: a single query per request (count + page projected
  directly into `EmployeeViewModel` via one `Select`).
