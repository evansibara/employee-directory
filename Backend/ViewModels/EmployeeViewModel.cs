namespace EmployeeDirectory.ViewModels;

/// <summary>
/// Flat, display-friendly projection of an Employee entity.
/// Keeping this separate from the EF entity means the View/JS
/// never depends on database-only fields (CreatedDate, IsDeleted).
/// </summary>
public class EmployeeViewModel
{
    public int Id { get; set; }
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string Department { get; set; } = string.Empty;
    public string JobTitle { get; set; } = string.Empty;
    public string? Email { get; set; }
    public DateTime HireDate { get; set; }
    public decimal Salary { get; set; }
}
