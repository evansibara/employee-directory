using EmployeeDirectory.Data;
using EmployeeDirectory.ViewModels;
using Microsoft.EntityFrameworkCore;

namespace EmployeeDirectory.Services;

public class EmployeeService : IEmployeeService
{
    private readonly AppDbContext _context;
    private const int MaxPageSize = 100;

    public EmployeeService(AppDbContext context)
    {
        _context = context;
    }

    public async Task<EmployeeListViewModel> GetEmployeesAsync(int page, int pageSize, string? searchTerm)
    {
        // Defensive normalization: never trust client-supplied paging values.
        page = page < 1 ? 1 : page;
        pageSize = pageSize < 1 ? 10 : Math.Min(pageSize, MaxPageSize);

        IQueryable<Models.Employee> query = _context.Employees
            .AsNoTracking()
            .Where(e => !e.IsDeleted);

        if (!string.IsNullOrWhiteSpace(searchTerm))
        {
            var term = searchTerm.Trim();

            // EF Core translates string.Contains(...) to a SQL LIKE '%term%'
            // clause executed by SQL Server, which uses the default
            // case-insensitive (CI) collation — this filter runs entirely
            // in the database, never in memory.
            query = query.Where(e =>
                e.FirstName.Contains(term) || e.LastName.Contains(term));
        }

        int totalRecords = await query.CountAsync();

        var employees = await query
            .OrderBy(e => e.LastName)
            .ThenBy(e => e.FirstName)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(e => new EmployeeViewModel
            {
                Id = e.Id,
                FirstName = e.FirstName,
                LastName = e.LastName,
                Department = e.Department,
                JobTitle = e.JobTitle,
                Email = e.Email,
                HireDate = e.HireDate,
                Salary = e.Salary
            })
            .ToListAsync();

        return new EmployeeListViewModel
        {
            Employees = employees,
            CurrentPage = page,
            PageSize = pageSize,
            TotalRecords = totalRecords,
            SearchTerm = searchTerm
        };
    }

    public async Task<DeleteEmployeeResult> DeleteEmployeeAsync(int id)
    {
        if (id <= 0)
        {
            return DeleteEmployeeResult.InvalidId;
        }

        var employee = await _context.Employees
            .FirstOrDefaultAsync(e => e.Id == id && !e.IsDeleted);

        if (employee is null)
        {
            return DeleteEmployeeResult.NotFound;
        }

        employee.IsDeleted = true;
        await _context.SaveChangesAsync();

        return DeleteEmployeeResult.Success;
    }
}
