using EmployeeDirectory.Services;
using EmployeeDirectory.ViewModels;
using Microsoft.AspNetCore.Mvc;

namespace EmployeeDirectory.Controllers;

public class EmployeesController : Controller
{
    private readonly IEmployeeService _employeeService;
    private readonly ILogger<EmployeesController> _logger;

    public EmployeesController(IEmployeeService employeeService, ILogger<EmployeesController> logger)
    {
        _employeeService = employeeService;
        _logger = logger;
    }

    /// <summary>
    /// Server-rendered entry point. Loads page 1 (or whatever query string
    /// says) so the page has content even before any JavaScript runs.
    /// Route: GET /Employees
    /// </summary>
    [HttpGet]
    [Route("/Employees")]
    [Route("/")]
    public async Task<IActionResult> Index(int page = 1, int pageSize = 10, string? searchTerm = null)
    {
        EmployeeListViewModel viewModel = await _employeeService.GetEmployeesAsync(page, pageSize, searchTerm);
        return View(viewModel);
    }

    /// <summary>
    /// JSON API used by the frontend for AJAX pagination/search.
    /// Route: GET /api/employees?page=1&amp;pageSize=10&amp;searchTerm=jane
    /// </summary>
    [HttpGet]
    [Route("/api/employees")]
    public async Task<IActionResult> GetEmployees(int page = 1, int pageSize = 10, string? searchTerm = null)
    {
        EmployeeListViewModel viewModel = await _employeeService.GetEmployeesAsync(page, pageSize, searchTerm);
        return Ok(ApiResponse<EmployeeListViewModel>.Ok(viewModel));
    }

    /// <summary>
    /// Deletes (soft-deletes) a single employee.
    /// Route: DELETE /api/employees/{id}
    /// </summary>
    [HttpDelete]
    [Route("/api/employees/{id:int}")]
    public async Task<IActionResult> DeleteEmployee(int id)
    {
        if (id <= 0)
        {
            return BadRequest(ApiResponse<object>.Fail("Employee id must be a positive integer."));
        }

        try
        {
            DeleteEmployeeResult result = await _employeeService.DeleteEmployeeAsync(id);

            return result switch
            {
                DeleteEmployeeResult.Success => Ok(ApiResponse<object>.Ok(new { id })),
                DeleteEmployeeResult.NotFound => NotFound(ApiResponse<object>.Fail($"Employee with id {id} was not found.")),
                DeleteEmployeeResult.InvalidId => BadRequest(ApiResponse<object>.Fail("Employee id must be a positive integer.")),
                _ => StatusCode(500, ApiResponse<object>.Fail("Unexpected error."))
            };
        }
        catch (Exception ex)
        {
            // Never let an unhandled DB/network exception bubble up as a raw 500 HTML page;
            // the frontend expects JSON so it can show a friendly error toast.
            _logger.LogError(ex, "Failed to delete employee {EmployeeId}", id);
            return StatusCode(500, ApiResponse<object>.Fail("Something went wrong while deleting the employee. Please try again."));
        }
    }

    /// <summary>
    /// A route that doesn't exist should still return a clean 400,
    /// e.g. GET /api/employees/{id} with a non-integer id (route
    /// constraint {id:int} already rejects it before reaching an action,
    /// but this catches any other malformed delete calls, like /api/employees/).
    /// </summary>
    [HttpDelete]
    [Route("/api/employees")]
    public IActionResult DeleteWithoutId()
    {
        return BadRequest(ApiResponse<object>.Fail("An employee id must be supplied, e.g. DELETE /api/employees/5"));
    }
}
