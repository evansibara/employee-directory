using Bogus;
using EmployeeDirectory.Models;
using Microsoft.EntityFrameworkCore;

namespace EmployeeDirectory.Data;

/// <summary>
/// Seeds the database with realistic sample data on startup, if empty.
/// Kept separate from OnModelCreating (HasData) because HasData requires
/// static seed values with fixed keys, which does not scale well to 100+
/// randomized rows and complicates future migrations.
/// </summary>
public static class DbSeeder
{
    private static readonly string[] Departments =
    {
        "Engineering", "Sales", "Marketing", "Human Resources",
        "Finance", "Customer Support", "Product", "Operations",
        "Legal", "IT"
    };

    private static readonly string[] JobTitles =
    {
        "Software Engineer", "Senior Software Engineer", "Product Manager",
        "Sales Representative", "Account Executive", "Marketing Specialist",
        "HR Coordinator", "Financial Analyst", "Support Specialist",
        "Operations Manager", "Legal Counsel", "IT Administrator",
        "QA Engineer", "Data Analyst", "UX Designer"
    };

    public static async Task SeedAsync(AppDbContext context)
    {
        // Ensure the schema exists (applies any pending migrations).
        await context.Database.MigrateAsync();

        bool hasData = await context.Employees.AnyAsync();
        if (hasData)
        {
            return;
        }

        var faker = new Faker<Employee>()
            .RuleFor(e => e.FirstName, f => f.Name.FirstName())
            .RuleFor(e => e.LastName, f => f.Name.LastName())
            .RuleFor(e => e.Department, f => f.PickRandom(Departments))
            .RuleFor(e => e.JobTitle, f => f.PickRandom(JobTitles))
            .RuleFor(e => e.Email, (f, e) =>
                f.Internet.Email(e.FirstName, e.LastName, "company.com").ToLowerInvariant())
            .RuleFor(e => e.HireDate, f => f.Date.Past(8).Date)
            .RuleFor(e => e.Salary, f => Math.Round(f.Random.Decimal(45_000, 180_000), 2))
            .RuleFor(e => e.CreatedDate, _ => DateTime.UtcNow)
            .RuleFor(e => e.IsDeleted, _ => false);

        var employees = faker.Generate(120);

        await context.Employees.AddRangeAsync(employees);
        await context.SaveChangesAsync();
    }
}
