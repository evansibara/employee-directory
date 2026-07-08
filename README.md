<div align="center">

# 👥 Employee Directory

**Enterprise-Grade Employee Management with Real-Time Search & Pagination**

[![.NET](https://img.shields.io/badge/.NET-8.0-512BD4?logo=dotnet&logoColor=white)](https://dotnet.microsoft.com/)
[![ASP.NET Core](https://img.shields.io/badge/ASP.NET%20Core-MVC-512BD4?logo=dotnet&logoColor=white)](https://docs.microsoft.com/en-us/aspnet/core)
[![EF Core](https://img.shields.io/badge/EF%20Core-SQL%20Server-336791?logo=microsoft-sql-server&logoColor=white)](https://docs.microsoft.com/en-us/ef/core/)
[![Docker](https://img.shields.io/badge/Docker-Supported-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![License](https://img.shields.io/badge/License-UNLICENSED-red.svg)](#-lisensi)

<p>
  A robust single-project ASP.NET Core MVC application providing an employee directory.
  Features include server-side pagination, database-level search, soft-delete capability,
  and seamless asynchronous UI updates via the Fetch API and vanilla JavaScript.
</p>

</div>

---

## 📑 Daftar Isi

- [Tentang Proyek](#-tentang-proyek)
- [Arsitektur & Tech Stack](#-arsitektur--tech-stack)
- [Fitur Utama](#-fitur-utama)
- [Panduan Memulai (Quick Start)](#-panduan-memulai-quick-start)
- [Docker Setup](#-docker-setup)
- [Struktur Folder Detail](#-struktur-folder-detail)
- [API Reference](#-api-reference)
- [Catatan Desain & Trade-offs](#-catatan-desain--trade-offs)
- [Lisensi](#-lisensi)

---

## 📖 Tentang Proyek

**Employee Directory** adalah aplikasi manajemen data karyawan yang dirancang dengan arsitektur bersih di dalam single ASP.NET Core process. Proyek ini memisahkan secara logis dan fisik antara `Backend` dan `Frontend`, menjaga agar `Controllers` dan `Views` tetap terisolasi dengan baik tanpa mengorbankan performa *server-side rendering* MVC.

Dilengkapi dengan auto-seeding (120 data karyawan realistis via `Bogus`) dan migrasi *Code-First*, aplikasi ini siap dijalankan dalam hitungan detik baik secara lokal maupun menggunakan Docker.

---

## 🏗️ Arsitektur & Tech Stack

Proyek ini adalah aplikasi single ASP.NET Core (`.csproj` tunggal) namun diorganisir sedemikian rupa agar *concerns* backend dan frontend terpisah dengan rapi.

### ⚙️ Backend (`/Backend`)

Controller mendelegasikan logika ke Service layer, yang berinteraksi dengan EF Core DbContext. Entitas raw database tidak pernah di-expose langsung ke client; semuanya di-map ke ViewModels.

| Kategori | Teknologi |
|---|---|
| **Platform** | .NET 8 SDK |
| **Framework** | ASP.NET Core MVC |
| **Database** | SQL Server (LocalDB / Dockerized SQL Server 2022) |
| **ORM** | Entity Framework Core (Code-First) |
| **Data Seeding** | Bogus (Dummy Data Generator) |
| **Pola Arsitektur** | Controller → Service → DbContext → SQL Server |

### 🎨 Frontend (`/Frontend`)

Antarmuka pengguna didasarkan pada rendering Razor yang dikombinasikan dengan Vanilla JS untuk interaksi yang responsif (SPA-like feel) tanpa *page reloads*.

| Kategori | Teknologi |
|---|---|
| **Views** | Razor Pages (`.cshtml`) |
| **Styling** | Tailwind UI / CSS |
| **Interaktivitas** | Vanilla JavaScript (ES6+), Fetch API |
| **Fitur UI** | Debounced search (300ms), Asynchronous Delete, Pagination |

---

## 🌟 Fitur Utama

1. **Soft Delete**: Data tidak pernah benar-benar dihapus secara fisik. Baris ditandai dengan `IsDeleted = true` demi menjaga integritas historis/audit, dan UI secara otomatis memudarkan (fade out) baris tersebut tanpa memuat ulang halaman.
2. **Server-Side Pagination & Search**: Query diterjemahkan ke SQL level (`Skip()`, `Take()`, dan `LIKE`) menghindari *memory overload* saat data membengkak. Hanya 1 *page* data yang keluar dari SQL Server.
3. **Asynchronous UI End-to-End**: Mulai dari HTTP Controller hingga eksekusi EF Core dilakukan secara `async Task`. Interaksi pengguna (Delete, Pagination, Search) dihandle mulus via JavaScript `fetch()`.
4. **Zero N+1 Query Problem**: Semua data untuk merender *view* diambil dalam satu kali eksekusi kueri terproyeksi (`Select` ke ViewModel).
5. **Progressive Enhancement**: Halaman pertama yang dimuat sepenuhnya di-render di server. Walau sebelum JS siap beraksi, tabel sudah menampilkan data (*SEO & First-contentful-paint friendly*).

---

## 🚀 Panduan Memulai (Quick Start)

### Prasyarat (Jalur Lokal)

- [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0)
- SQL Server LocalDB (bawaan Visual Studio) atau instance SQL Server lain.
- EF Core CLI Tools: `dotnet tool install --global dotnet-ef`

### 1. Konfigurasi Connection String

Buka `appsettings.json` dan sesuaikan *connection string* jika Anda tidak menggunakan LocalDB default:

```json
"ConnectionStrings": {
  "DefaultConnection": "Server=(localdb)\\MSSQLLocalDB;Database=EmployeeDirectoryDb;Trusted_Connection=True;MultipleActiveResultSets=true;TrustServerCertificate=True"
}
```

### 2. Generate Initial Migration

```bash
cd EmployeeDirectory
dotnet restore
dotnet ef migrations add InitialCreate
```

### 3. Jalankan Aplikasi

```bash
dotnet run
```

Saat pertama kali dijalankan, `Program.cs` akan otomatis memanggil `Database.MigrateAsync()` dan mengisi tabel dengan **120 data karyawan acak**. Anda tidak perlu menjalankan `database update` secara manual.

Akses aplikasi di: **`https://localhost:7080/Employees`**

---

## 🐳 Docker Setup

Aplikasi ini dapat dijalankan sepenuhnya dengan container tanpa harus menginstall SDK atau SQL Server lokal. Panduan lengkap ada di [`Infrastructure/docker/DOCKER.md`](./Infrastructure/docker/DOCKER.md).

### Quick Docker Start

```bash
cd Infrastructure/docker
cp .env.example .env
# Edit .env dan atur SA_PASSWORD yang kuat (8+ karakter, huruf, angka, simbol)

docker run --rm -v "$(cd ../.. && pwd):/src" -w /src mcr.microsoft.com/dotnet/sdk:8.0 \
  bash -c "dotnet tool install --global dotnet-ef && \
           export PATH=\"\$PATH:/root/.dotnet/tools\" && \
           dotnet ef migrations add InitialCreate"

docker compose up --build
```
Aplikasi akan tersedia di: **`http://localhost:8080/Employees`**

---

## 📂 Struktur Folder Detail

```text
EmployeeDirectory/
├── EmployeeDirectory.csproj
├── Program.cs                     ← Registrasi DI, modifikasi Razor view engine ke folder Frontend/
├── appsettings.json
│
├── Backend/
│   ├── Controllers/EmployeesController.cs   ← HTTP endpoint, sangat tipis (tanpa business logic)
│   ├── Services/                            ← Business logic: paginasi, search, soft-delete
│   ├── Data/                                ← DbContext + logika Auto-seed
│   ├── Models/                              ← Entitas dasar EF Core
│   └── ViewModels/                          ← DTO yang aman diekspos ke client
│
├── Frontend/
│   ├── Views/Employees/Index.cshtml         ← Tailwind UI, server-rendered page 1
│   └── wwwroot/js/employees.js              ← Logika search debounce, fetch paging & delete
│
└── Infrastructure/
    └── docker/
        ├── Dockerfile                 ← Multi-stage build
        ├── docker-compose.yml         ← Setup SQL Server + Web App
        ├── .env.example
        └── DOCKER.md
```

---

## 📡 API Reference

Base Endpoint untuk Data AJAX. *(Untuk tampilan UI, akses `GET /Employees`)*

### `GET /api/employees`

Mengambil daftar karyawan dalam satu halaman.

| Query Param | Tipe | Default | Deskripsi |
|---|---|---|---|
| `page` | `int` | `1` | Indeks halaman (1-based) |
| `pageSize` | `int` | `10` | Batas maksimal `100` baris per permintaan |
| `searchTerm` | `string` | `null` | Pencarian *case-insensitive* pada `FirstName` atau `LastName` |

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "employees": [
      {
        "id": 1, "firstName": "Jane", "lastName": "Doe",
        "department": "Engineering", "jobTitle": "Software Engineer",
        "email": "jane.doe@company.com", "hireDate": "2022-03-14T00:00:00",
        "salary": 95000.00
      }
    ],
    "currentPage": 1,
    "pageSize": 10,
    "totalRecords": 120,
    "searchTerm": null,
    "totalPages": 12,
    "hasPreviousPage": false,
    "hasNextPage": true
  }
}
```

### `DELETE /api/employees/{id}`

Melakukan *Soft-delete* karyawan.

| Status | Deskripsi |
|---|---|
| `200 OK` | Berhasil dihapus. (Body: `{ "success": true, "data": { "id": 5 } }`) |
| `400 Bad Request` | ID tidak valid (`id <= 0`) |
| `404 Not Found` | Data tidak ditemukan atau sudah berstatus dihapus |
| `500 Internal Error` | Gagal memproses, *gracefully caught* sebagai JSON bukan HTML Error Page. |

---

## 🛠️ Catatan Desain & Trade-offs

- **Mengapa tidak dipisah menjadi Web API independen dan Static React/Vue frontend?** Sesuai spesifikasi, aplikasi ini merupakan *single project* berbasis Razor. Memisahkan *deployables* secara penuh akan merubah esensi kerangka kerja ASP.NET MVC. Untuk mengakomodasi pemisahan tugas, source code dipisah secara fisik ke folder `Backend/` dan `Frontend/`, dengan `Program.cs` diinstruksikan ulang untuk membaca view di custom path `Frontend/`.
- **Vanilla JS:** Tidak menggunakan framework eksternal seperti jQuery, React, atau Vue. `employees.js` memanfaatkan *browser native features* (`fetch`, DOM API).
- **Error Handling di UI:** Setiap request HTTP (`fetch`) di-cover dengan deteksi status gagal (404, 500) yang akan memicu toast/alert pesan error, memastikan aplikasi tidak pernah nge-*crash*.

---

## 📄 Lisensi

Proyek ini berlisensi **UNLICENSED** (privat). Silakan mengacu pada kebijakan internal sebelum mendistribusikan kode.
