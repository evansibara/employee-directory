using EmployeeDirectory.Data;
using EmployeeDirectory.Models;
using EmployeeDirectory.Services;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace EmployeeDirectory.Tests;

/// <summary>
/// Unit tests for <see cref="EmployeeService"/> business logic.
/// Each test gets a fresh in-memory database so tests never interfere
/// with each other.
/// </summary>
public class EmployeeServiceTests : IDisposable
{
    private readonly AppDbContext _context;
    private readonly EmployeeService _service;

    public EmployeeServiceTests()
    {
        // Use a unique database name per test instance to guarantee isolation.
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;

        _context = new AppDbContext(options);
        _service = new EmployeeService(_context);
    }

    public void Dispose()
    {
        _context.Dispose();
    }

    // -----------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------

    /// <summary>
    /// Seeds a batch of employees. Defaults to 25 active employees named
    /// "First_1 Last_1" through "First_25 Last_25" in the "Engineering"
    /// department.
    /// </summary>
    private async Task SeedEmployeesAsync(int count = 25, bool includeDeleted = false)
    {
        for (var i = 1; i <= count; i++)
        {
            _context.Employees.Add(new Employee
            {
                FirstName = $"First_{i}",
                LastName = $"Last_{i}",
                Department = "Engineering",
                JobTitle = "Developer",
                Email = $"emp{i}@company.com",
                HireDate = new DateTime(2024, 1, i % 28 + 1),
                Salary = 50000 + i * 1000
            });
        }

        if (includeDeleted)
        {
            _context.Employees.Add(new Employee
            {
                FirstName = "Deleted",
                LastName = "User",
                Department = "HR",
                JobTitle = "Manager",
                Email = "deleted@company.com",
                HireDate = new DateTime(2020, 6, 15),
                Salary = 80000,
                IsDeleted = true
            });
        }

        await _context.SaveChangesAsync();
    }

    // =================================================================
    // GetEmployeesAsync — Pagination
    // =================================================================

    [Fact]
    public async Task GetEmployeesAsync_ReturnsPaginatedResults_WithCorrectMetadata()
    {
        // Arrange
        await SeedEmployeesAsync(25);

        // Act — request page 2 with 10 items per page
        var result = await _service.GetEmployeesAsync(page: 2, pageSize: 10, searchTerm: null);

        // Assert
        Assert.Equal(10, result.Employees.Count);
        Assert.Equal(2, result.CurrentPage);
        Assert.Equal(10, result.PageSize);
        Assert.Equal(25, result.TotalRecords);
    }

    [Fact]
    public async Task GetEmployeesAsync_LastPage_ReturnsRemainingRecords()
    {
        // Arrange — 25 records, page 3 of 10 should have 5
        await SeedEmployeesAsync(25);

        // Act
        var result = await _service.GetEmployeesAsync(page: 3, pageSize: 10, searchTerm: null);

        // Assert
        Assert.Equal(5, result.Employees.Count);
        Assert.Equal(25, result.TotalRecords);
    }

    // =================================================================
    // GetEmployeesAsync — Search / filtering
    // =================================================================

    [Fact]
    public async Task GetEmployeesAsync_FiltersByFirstName()
    {
        // Arrange
        await SeedEmployeesAsync(25);

        // Act — "First_1" matches First_1, First_10..First_19
        var result = await _service.GetEmployeesAsync(page: 1, pageSize: 50, searchTerm: "First_1");

        // Assert — should match: First_1, First_10, First_11, ... First_19 = 11 results
        Assert.Equal(11, result.TotalRecords);
        Assert.All(result.Employees, emp =>
            Assert.Contains("First_1", emp.FirstName));
    }

    [Fact]
    public async Task GetEmployeesAsync_FiltersByLastName()
    {
        // Arrange
        await SeedEmployeesAsync(25);

        // Act — search by last name
        var result = await _service.GetEmployeesAsync(page: 1, pageSize: 50, searchTerm: "Last_5");

        // Assert — matches Last_5 only (not Last_50 since we only have 25)
        Assert.Equal(1, result.TotalRecords);
        Assert.Equal("Last_5", result.Employees[0].LastName);
    }

    [Fact]
    public async Task GetEmployeesAsync_ReturnsEmpty_WhenNoMatch()
    {
        // Arrange
        await SeedEmployeesAsync(10);

        // Act
        var result = await _service.GetEmployeesAsync(page: 1, pageSize: 10, searchTerm: "NonExistentName");

        // Assert
        Assert.Empty(result.Employees);
        Assert.Equal(0, result.TotalRecords);
    }

    [Fact]
    public async Task GetEmployeesAsync_ExcludesSoftDeletedEmployees()
    {
        // Arrange — 10 active + 1 deleted
        await SeedEmployeesAsync(count: 10, includeDeleted: true);

        // Act — no filter, should not include the deleted record
        var result = await _service.GetEmployeesAsync(page: 1, pageSize: 50, searchTerm: null);

        // Assert
        Assert.Equal(10, result.TotalRecords);
        Assert.DoesNotContain(result.Employees, emp => emp.FirstName == "Deleted");
    }

    [Fact]
    public async Task GetEmployeesAsync_WhitespaceSearchTerm_TreatedAsNoFilter()
    {
        // Arrange
        await SeedEmployeesAsync(5);

        // Act — whitespace-only search term
        var result = await _service.GetEmployeesAsync(page: 1, pageSize: 50, searchTerm: "   ");

        // Assert — should return all records (whitespace treated as empty)
        Assert.Equal(5, result.TotalRecords);
    }

    // =================================================================
    // GetEmployeesAsync — Input normalization
    // =================================================================

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    [InlineData(-999)]
    public async Task GetEmployeesAsync_InvalidPage_NormalizedToOne(int invalidPage)
    {
        // Arrange
        await SeedEmployeesAsync(5);

        // Act
        var result = await _service.GetEmployeesAsync(page: invalidPage, pageSize: 10, searchTerm: null);

        // Assert — should normalize to page 1
        Assert.Equal(1, result.CurrentPage);
        Assert.Equal(5, result.TotalRecords);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-5)]
    public async Task GetEmployeesAsync_InvalidPageSize_NormalizedToTen(int invalidPageSize)
    {
        // Arrange
        await SeedEmployeesAsync(15);

        // Act
        var result = await _service.GetEmployeesAsync(page: 1, pageSize: invalidPageSize, searchTerm: null);

        // Assert — should normalize to default page size of 10
        Assert.Equal(10, result.PageSize);
        Assert.Equal(10, result.Employees.Count);
    }

    [Fact]
    public async Task GetEmployeesAsync_ExcessivePageSize_CappedAtMaximum()
    {
        // Arrange
        await SeedEmployeesAsync(5);

        // Act — request 500 per page; MaxPageSize is 100
        var result = await _service.GetEmployeesAsync(page: 1, pageSize: 500, searchTerm: null);

        // Assert
        Assert.Equal(100, result.PageSize);
    }

    // =================================================================
    // DeleteEmployeeAsync
    // =================================================================

    [Fact]
    public async Task DeleteEmployeeAsync_ValidId_ReturnsSuccessAndSoftDeletes()
    {
        // Arrange
        await SeedEmployeesAsync(3);
        var employeeToDelete = await _context.Employees.FirstAsync();

        // Act
        var result = await _service.DeleteEmployeeAsync(employeeToDelete.Id);

        // Assert
        Assert.Equal(DeleteEmployeeResult.Success, result);

        // Verify the record is soft-deleted in the database
        var deletedEmployee = await _context.Employees.FindAsync(employeeToDelete.Id);
        Assert.NotNull(deletedEmployee);
        Assert.True(deletedEmployee.IsDeleted);
    }

    [Fact]
    public async Task DeleteEmployeeAsync_NonExistentId_ReturnsNotFound()
    {
        // Arrange
        await SeedEmployeesAsync(3);

        // Act — use an id that doesn't exist
        var result = await _service.DeleteEmployeeAsync(id: 9999);

        // Assert
        Assert.Equal(DeleteEmployeeResult.NotFound, result);
    }

    [Fact]
    public async Task DeleteEmployeeAsync_AlreadyDeletedEmployee_ReturnsNotFound()
    {
        // Arrange — seed with a deleted employee
        await SeedEmployeesAsync(count: 0, includeDeleted: true);
        var deletedEmployee = await _context.Employees.FirstAsync(e => e.IsDeleted);

        // Act — try to delete the already-deleted employee
        var result = await _service.DeleteEmployeeAsync(deletedEmployee.Id);

        // Assert — service should treat this as "not found"
        Assert.Equal(DeleteEmployeeResult.NotFound, result);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    [InlineData(-100)]
    public async Task DeleteEmployeeAsync_InvalidId_ReturnsInvalidId(int invalidId)
    {
        // Act
        var result = await _service.DeleteEmployeeAsync(invalidId);

        // Assert
        Assert.Equal(DeleteEmployeeResult.InvalidId, result);
    }
}
