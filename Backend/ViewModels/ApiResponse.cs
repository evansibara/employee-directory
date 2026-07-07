namespace EmployeeDirectory.ViewModels;

/// <summary>
/// Standard envelope for JSON API responses so the frontend always
/// knows what shape to expect, whether the call succeeded or failed.
/// </summary>
public class ApiResponse<T>
{
    public bool Success { get; set; }
    public string? Message { get; set; }
    public T? Data { get; set; }

    public static ApiResponse<T> Ok(T data) => new()
    {
        Success = true,
        Data = data
    };

    public static ApiResponse<T> Fail(string message) => new()
    {
        Success = false,
        Message = message
    };
}
