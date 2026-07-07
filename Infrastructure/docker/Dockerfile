# syntax=docker/dockerfile:1

# ---------- Build stage ----------
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Restore first (cached layer) using just the csproj, before copying full source.
COPY EmployeeDirectory.csproj ./
RUN dotnet restore "EmployeeDirectory.csproj"

# Now copy the rest of the source (Backend/, Frontend/, Program.cs, etc.)
COPY . .

RUN dotnet publish "EmployeeDirectory.csproj" \
    -c Release \
    -o /app/publish \
    --no-restore

# ---------- Runtime stage ----------
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS final
WORKDIR /app

# Run as a non-root user (the aspnet base image ships one out of the box).
USER app

COPY --from=build /app/publish .

ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080

ENTRYPOINT ["dotnet", "EmployeeDirectory.dll"]
