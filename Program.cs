using EmployeeDirectory.Data;
using EmployeeDirectory.Services;
using Microsoft.AspNetCore.Mvc.Razor;
using Microsoft.EntityFrameworkCore;

// WebRootPath is set explicitly to Frontend/wwwroot because this project
// keeps Backend/ (Controllers, Models, Services, Data) and Frontend/
// (Views, wwwroot) as physically separate top-level folders instead of
// the default ASP.NET Core MVC convention (wwwroot at project root).
var builder = WebApplication.CreateBuilder(new WebApplicationOptions
{
    Args = args,
    WebRootPath = "Frontend/wwwroot"
});

// ---- Services ----

builder.Services.AddControllersWithViews();

// Point the Razor view engine at Frontend/Views instead of the default
// {ProjectRoot}/Views, matching the Backend/Frontend folder split.
builder.Services.Configure<RazorViewEngineOptions>(options =>
{
    options.ViewLocationFormats.Clear();
    options.ViewLocationFormats.Add("/Frontend/Views/{1}/{0}" + RazorViewEngine.ViewExtension);
    options.ViewLocationFormats.Add("/Frontend/Views/Shared/{0}" + RazorViewEngine.ViewExtension);
});

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlServer(
        builder.Configuration.GetConnectionString("DefaultConnection")
            ?? throw new InvalidOperationException("Connection string 'DefaultConnection' was not found in appsettings.json.")));

builder.Services.AddScoped<IEmployeeService, EmployeeService>();

var app = builder.Build();

// ---- Middleware pipeline ----

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Home/Error");
    app.UseHsts();
}

// .NET's official container base images set this env var automatically.
// Skip HTTPS redirection inside containers — no dev cert is present there,
// and TLS termination in a real deployment belongs at a reverse proxy.
var isRunningInContainer = string.Equals(
    Environment.GetEnvironmentVariable("DOTNET_RUNNING_IN_CONTAINER"),
    "true", StringComparison.OrdinalIgnoreCase);

if (!isRunningInContainer)
{
    app.UseHttpsRedirection();
}

app.UseStaticFiles(); // serves Frontend/wwwroot/js for the frontend (path configured above)
app.UseRouting();
app.UseAuthorization();

app.MapControllerRoute(
    name: "default",
    pattern: "{controller=Employees}/{action=Index}/{id?}");

// ---- Apply migrations + seed data on startup, with retries ----
//
// Even with Docker Compose's `depends_on: condition: service_healthy`,
// SQL Server can still refuse the very first connection or two while it
// finishes initializing. Retry with a short backoff instead of crashing.

const int maxAttempts = 10;
for (var attempt = 1; attempt <= maxAttempts; attempt++)
{
    try
    {
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await DbSeeder.SeedAsync(db);
        break;
    }
    catch (Exception ex) when (attempt < maxAttempts)
    {
        app.Logger.LogWarning(
            "Database not ready yet (attempt {Attempt}/{MaxAttempts}): {Message}. Retrying in 3s...",
            attempt, maxAttempts, ex.Message);
        await Task.Delay(TimeSpan.FromSeconds(3));
    }
}

app.Run();
