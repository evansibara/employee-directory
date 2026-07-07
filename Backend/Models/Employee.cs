using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace EmployeeDirectory.Models;

/// <summary>
/// Represents an employee record in the directory.
/// </summary>
public class Employee
{
    [Key]
    public int Id { get; set; }

    [Required]
    [MaxLength(100)]
    public string FirstName { get; set; } = string.Empty;

    [Required]
    [MaxLength(100)]
    public string LastName { get; set; } = string.Empty;

    [Required]
    [MaxLength(100)]
    public string Department { get; set; } = string.Empty;

    [Required]
    [MaxLength(100)]
    public string JobTitle { get; set; } = string.Empty;

    [MaxLength(150)]
    public string? Email { get; set; }

    [Column(TypeName = "datetime2")]
    public DateTime HireDate { get; set; }

    [Column(TypeName = "decimal(18,2)")]
    public decimal Salary { get; set; }

    // ---- Audit fields (do not count toward the "5 properties" requirement) ----

    [Column(TypeName = "datetime2")]
    public DateTime CreatedDate { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Soft-delete flag. Rows are never physically removed so that
    /// history/auditing is preserved; queries always filter this out.
    /// </summary>
    public bool IsDeleted { get; set; } = false;
}
