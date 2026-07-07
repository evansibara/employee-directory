namespace EmployeeDirectory.ViewModels;

/// <summary>
/// Everything the View/JS needs to render one page of results:
/// the rows themselves plus enough metadata to build pagination controls.
/// </summary>
public class EmployeeListViewModel
{
    public List<EmployeeViewModel> Employees { get; set; } = new();

    public int CurrentPage { get; set; }
    public int PageSize { get; set; }
    public int TotalRecords { get; set; }
    public string? SearchTerm { get; set; }

    public int TotalPages => PageSize == 0
        ? 0
        : (int)Math.Ceiling(TotalRecords / (double)PageSize);

    public bool HasPreviousPage => CurrentPage > 1;
    public bool HasNextPage => CurrentPage < TotalPages;
}
