using EmployeeDirectory.Models;
using Microsoft.EntityFrameworkCore;

namespace EmployeeDirectory.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
    {
    }

    public DbSet<Employee> Employees => Set<Employee>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<Employee>(entity =>
        {
            entity.ToTable("Employees");

            entity.Property(e => e.FirstName).IsRequired().HasMaxLength(100);
            entity.Property(e => e.LastName).IsRequired().HasMaxLength(100);
            entity.Property(e => e.Department).IsRequired().HasMaxLength(100);
            entity.Property(e => e.JobTitle).IsRequired().HasMaxLength(100);
            entity.Property(e => e.Email).HasMaxLength(150);
            entity.Property(e => e.Salary).HasColumnType("decimal(18,2)");

            // Composite index to speed up the FirstName/LastName search filter.
            entity.HasIndex(e => new { e.LastName, e.FirstName })
                  .HasDatabaseName("IX_Employees_LastName_FirstName");

            // Speeds up the "WHERE IsDeleted = 0" filter applied to every query.
            entity.HasIndex(e => e.IsDeleted)
                  .HasDatabaseName("IX_Employees_IsDeleted");
        });
    }
}
