using EmployeeDirectory.ViewModels;

namespace EmployeeDirectory.Services;

public enum DeleteEmployeeResult
{
    Success,
    NotFound,
    InvalidId
}

public interface IEmployeeService
{
    /// <summary>
    /// Returns one page of employees, optionally filtered by a search term
    /// matched (case-insensitively) against FirstName or LastName.
    /// All filtering and paging happens at the database level.
    /// </summary>
    Task<EmployeeListViewModel> GetEmployeesAsync(int page, int pageSize, string? searchTerm);

    /// <summary>
    /// Soft-deletes the employee with the given id.
    /// </summary>
    Task<DeleteEmployeeResult> DeleteEmployeeAsync(int id);
}
