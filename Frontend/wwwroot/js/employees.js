/**
 * Employee Directory — frontend logic.
 * No frameworks: plain fetch(), plain DOM APIs.
 *
 * Responsibilities:
 *  - Debounced search (300ms) against GET /api/employees, resets to page 1
 *  - Server-side pagination controls (Previous / Next)
 *  - Delete via DELETE /api/employees/{id} with a confirm dialog, a loading
 *    spinner on the confirm button, and toast-based error handling that
 *    never crashes the page.
 */
(function () {
    "use strict";

    // ---------------------------------------------------------------
    // Setup / config (read from data-* attributes set by the server)
    // ---------------------------------------------------------------

    var app = document.getElementById("app");

    var config = {
        apiUrl: app.dataset.apiUrl,
        deleteUrlBase: app.dataset.deleteUrlBase
    };

    var state = {
        currentPage: parseInt(app.dataset.initialPage, 10) || 1,
        pageSize: parseInt(app.dataset.initialPageSize, 10) || 10,
        searchTerm: app.dataset.initialSearchTerm || "",
        totalRecords: parseInt(app.dataset.initialTotalRecords, 10) || 0,
        isLoading: false
    };

    // Deterministic color palettes so the same department/person always
    // gets the same color, without a server round-trip for styling.
    var DEPT_PALETTE = [
        { bg: "bg-blue-50", text: "text-blue-700" },
        { bg: "bg-emerald-50", text: "text-emerald-700" },
        { bg: "bg-amber-50", text: "text-amber-700" },
        { bg: "bg-violet-50", text: "text-violet-700" },
        { bg: "bg-rose-50", text: "text-rose-700" },
        { bg: "bg-cyan-50", text: "text-cyan-700" },
        { bg: "bg-orange-50", text: "text-orange-700" },
        { bg: "bg-teal-50", text: "text-teal-700" },
        { bg: "bg-fuchsia-50", text: "text-fuchsia-700" },
        { bg: "bg-lime-50", text: "text-lime-700" }
    ];
    var AVATAR_PALETTE = [
        "#2563EB", "#0D9488", "#D97706", "#7C3AED",
        "#DC2626", "#0891B2", "#EA580C", "#059669"
    ];

    // ---------------------------------------------------------------
    // DOM references
    // ---------------------------------------------------------------

    var tableWrapper = document.getElementById("tableWrapper");
    var tableBody = document.getElementById("employeeTableBody");
    var emptyState = document.getElementById("emptyState");
    var emptyStateHint = document.getElementById("emptyStateHint");
    var recordSummary = document.getElementById("recordSummary");

    var searchInput = document.getElementById("searchInput");
    var clearSearchBtn = document.getElementById("clearSearchBtn");

    var pageInfo = document.getElementById("pageInfo");
    var pageIndicator = document.getElementById("pageIndicator");
    var prevPageBtn = document.getElementById("prevPageBtn");
    var nextPageBtn = document.getElementById("nextPageBtn");

    var confirmModal = document.getElementById("confirmModal");
    var confirmModalBackdrop = document.getElementById("confirmModalBackdrop");
    var confirmModalName = document.getElementById("confirmModalName");
    var cancelDeleteBtn = document.getElementById("cancelDeleteBtn");
    var confirmDeleteBtn = document.getElementById("confirmDeleteBtn");
    var confirmDeleteSpinner = document.getElementById("confirmDeleteSpinner");
    var confirmDeleteLabel = document.getElementById("confirmDeleteLabel");

    var toastContainer = document.getElementById("toastContainer");

    var pendingDeleteId = null;
    var pendingDeleteName = null;

    // ---------------------------------------------------------------
    // Utilities
    // ---------------------------------------------------------------

    function debounce(fn, delayMs) {
        var timerId = null;
        return function () {
            var args = arguments;
            clearTimeout(timerId);
            timerId = setTimeout(function () {
                fn.apply(null, args);
            }, delayMs);
        };
    }

    function hashString(str) {
        var hash = 0;
        for (var i = 0; i < str.length; i++) {
            hash = (hash << 5) - hash + str.charCodeAt(i);
            hash |= 0;
        }
        return Math.abs(hash);
    }

    function escapeHtml(value) {
        var div = document.createElement("div");
        div.textContent = value == null ? "" : String(value);
        return div.innerHTML;
    }

    function formatCurrency(amount) {
        return new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
            maximumFractionDigits: 0
        }).format(amount);
    }

    function formatDate(isoString) {
        var date = new Date(isoString);
        return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
    }

    function initials(firstName, lastName) {
        var a = (firstName || "").charAt(0);
        var b = (lastName || "").charAt(0);
        return (a + b).toUpperCase();
    }

    // ---------------------------------------------------------------
    // Rendering
    // ---------------------------------------------------------------

    function renderDeptBadges() {
        var badges = tableBody.querySelectorAll(".dept-badge");
        badges.forEach(function (el) {
            var dept = el.dataset.dept || "";
            var palette = DEPT_PALETTE[hashString(dept) % DEPT_PALETTE.length];
            el.classList.add(palette.bg, palette.text);
        });
    }

    function renderAvatars() {
        var avatars = tableBody.querySelectorAll(".employee-avatar");
        avatars.forEach(function (el) {
            var name = el.dataset.name || "";
            var color = AVATAR_PALETTE[hashString(name) % AVATAR_PALETTE.length];
            el.style.backgroundColor = color;
        });
    }

    function buildRow(employee) {
        var tr = document.createElement("tr");
        tr.dataset.id = employee.id;
        tr.className = "row-enter hover:bg-zinc-50/70 transition-colors";

        var fullName = employee.firstName + " " + employee.lastName;

        tr.innerHTML =
            '<td class="px-5 py-3">' +
                '<div class="flex items-center gap-3">' +
                    '<div class="employee-avatar h-8 w-8 rounded-full flex items-center justify-center text-[11px] font-semibold text-white shrink-0" data-name="' + escapeHtml(fullName) + '">' +
                        initials(employee.firstName, employee.lastName) +
                    '</div>' +
                    '<span class="font-medium text-zinc-800">' + escapeHtml(fullName) + '</span>' +
                '</div>' +
            '</td>' +
            '<td class="px-5 py-3">' +
                '<span class="dept-badge inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium" data-dept="' + escapeHtml(employee.department) + '">' +
                    escapeHtml(employee.department) +
                '</span>' +
            '</td>' +
            '<td class="px-5 py-3 text-zinc-600">' + escapeHtml(employee.jobTitle) + '</td>' +
            '<td class="px-5 py-3 text-zinc-500 truncate max-w-[180px]">' + escapeHtml(employee.email || "") + '</td>' +
            '<td class="px-5 py-3 text-zinc-500 font-mono-num text-xs">' + formatDate(employee.hireDate) + '</td>' +
            '<td class="px-5 py-3 text-right font-mono-num text-zinc-700">' + formatCurrency(employee.salary) + '</td>' +
            '<td class="px-5 py-3 text-right">' +
                '<button type="button" class="delete-btn inline-flex items-center justify-center h-8 w-8 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500/30 transition" ' +
                    'data-id="' + employee.id + '" data-name="' + escapeHtml(fullName) + '" aria-label="Delete ' + escapeHtml(fullName) + '">' +
                    '<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">' +
                        '<path stroke-linecap="round" stroke-linejoin="round" d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2m2 0-1 13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 7h14Z" />' +
                    '</svg>' +
                '</button>' +
            '</td>';

        return tr;
    }

    function renderTable(employees) {
        tableBody.innerHTML = "";

        if (!employees || employees.length === 0) {
            tableWrapper.classList.add("hidden");
            emptyState.classList.remove("hidden");
            emptyStateHint.textContent = state.searchTerm
                ? 'No results for "' + state.searchTerm + '". Try a different name.'
                : "There are no employees to display.";
            return;
        }

        tableWrapper.classList.remove("hidden");
        emptyState.classList.add("hidden");

        var fragment = document.createDocumentFragment();
        employees.forEach(function (employee) {
            fragment.appendChild(buildRow(employee));
        });
        tableBody.appendChild(fragment);

        renderDeptBadges();
        renderAvatars();
    }

    function renderPaginationAndSummary(data) {
        state.currentPage = data.currentPage;
        state.pageSize = data.pageSize;
        state.totalRecords = data.totalRecords;

        var totalPages = data.totalPages;

        recordSummary.textContent = data.totalRecords + " employee" + (data.totalRecords === 1 ? "" : "s") +
            (state.searchTerm ? ' matching "' + state.searchTerm + '"' : "");

        if (data.totalRecords === 0) {
            pageInfo.textContent = "";
            pageIndicator.textContent = "";
        } else {
            var startRecord = (data.currentPage - 1) * data.pageSize + 1;
            var endRecord = Math.min(data.currentPage * data.pageSize, data.totalRecords);
            pageInfo.textContent = "Showing " + startRecord + "–" + endRecord + " of " + data.totalRecords;
            pageIndicator.textContent = "Page " + data.currentPage + " of " + totalPages;
        }

        prevPageBtn.disabled = !data.hasPreviousPage;
        nextPageBtn.disabled = !data.hasNextPage;
    }

    function setLoading(isLoading) {
        state.isLoading = isLoading;
        tableWrapper.classList.toggle("opacity-40", isLoading);
        tableWrapper.classList.toggle("pointer-events-none", isLoading);
        prevPageBtn.disabled = isLoading || prevPageBtn.disabled;
        nextPageBtn.disabled = isLoading || nextPageBtn.disabled;
    }

    // ---------------------------------------------------------------
    // Toasts
    // ---------------------------------------------------------------

    function showToast(message, type) {
        var isError = type === "error";
        var toast = document.createElement("div");
        toast.className =
            "row-enter flex items-start gap-2.5 px-4 py-3 rounded-lg shadow-md text-sm border " +
            (isError
                ? "bg-red-50 border-red-200 text-red-800"
                : "bg-emerald-50 border-emerald-200 text-emerald-800");

        var iconSvg = isError
            ? '<svg class="h-4 w-4 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path stroke-linecap="round" d="M12 8v5m0 3h.01"/></svg>'
            : '<svg class="h-4 w-4 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path stroke-linecap="round" stroke-linejoin="round" d="m8 12 3 3 5-6"/></svg>';

        toast.innerHTML = iconSvg + '<span class="flex-1">' + escapeHtml(message) + '</span>';
        toastContainer.appendChild(toast);

        setTimeout(function () {
            toast.classList.add("row-leave");
            setTimeout(function () {
                toast.remove();
            }, 200);
        }, 4000);
    }

    // ---------------------------------------------------------------
    // Data loading
    // ---------------------------------------------------------------

    function loadEmployees() {
        if (state.isLoading) return Promise.resolve();

        setLoading(true);

        var params = new URLSearchParams({
            page: state.currentPage,
            pageSize: state.pageSize
        });
        if (state.searchTerm) {
            params.set("searchTerm", state.searchTerm);
        }

        return fetch(config.apiUrl + "?" + params.toString(), {
            method: "GET",
            headers: { Accept: "application/json" }
        })
            .then(function (response) {
                return response.json().catch(function () {
                    return null;
                }).then(function (payload) {
                    if (!response.ok || !payload || payload.success === false) {
                        var message = (payload && payload.message) || "Failed to load employees (" + response.status + ").";
                        throw new Error(message);
                    }
                    return payload.data;
                });
            })
            .then(function (data) {
                renderTable(data.employees);
                renderPaginationAndSummary(data);
            })
            .catch(function (err) {
                showToast(err.message || "Network error — could not load employees.", "error");
            })
            .finally(function () {
                setLoading(false);
            });
    }

    // ---------------------------------------------------------------
    // Search (debounced, resets to page 1)
    // ---------------------------------------------------------------

    var debouncedSearch = debounce(function (value) {
        state.searchTerm = value.trim();
        state.currentPage = 1;
        loadEmployees();
    }, 300);

    searchInput.addEventListener("input", function (e) {
        var value = e.target.value;
        clearSearchBtn.classList.toggle("hidden", value.length === 0);
        debouncedSearch(value);
    });

    clearSearchBtn.addEventListener("click", function () {
        searchInput.value = "";
        clearSearchBtn.classList.add("hidden");
        state.searchTerm = "";
        state.currentPage = 1;
        loadEmployees();
        searchInput.focus();
    });

    if (searchInput.value) {
        clearSearchBtn.classList.remove("hidden");
    }

    // ---------------------------------------------------------------
    // Pagination
    // ---------------------------------------------------------------

    prevPageBtn.addEventListener("click", function () {
        if (state.currentPage > 1) {
            state.currentPage -= 1;
            loadEmployees();
        }
    });

    nextPageBtn.addEventListener("click", function () {
        state.currentPage += 1;
        loadEmployees();
    });

    // ---------------------------------------------------------------
    // Delete flow: confirm modal -> Fetch API DELETE -> DOM update
    // ---------------------------------------------------------------

    function openConfirmModal(id, name) {
        pendingDeleteId = id;
        pendingDeleteName = name;
        confirmModalName.textContent = name;
        confirmModal.classList.remove("hidden");
        cancelDeleteBtn.focus();
    }

    function closeConfirmModal() {
        confirmModal.classList.add("hidden");
        pendingDeleteId = null;
        pendingDeleteName = null;
    }

    function setDeleteButtonLoading(isLoading) {
        confirmDeleteBtn.disabled = isLoading;
        cancelDeleteBtn.disabled = isLoading;
        confirmDeleteSpinner.classList.toggle("hidden", !isLoading);
        confirmDeleteLabel.textContent = isLoading ? "Deleting…" : "Delete";
    }

    // Event delegation: rows are re-rendered dynamically, so listen on the tbody.
    tableBody.addEventListener("click", function (e) {
        var btn = e.target.closest(".delete-btn");
        if (!btn) return;
        openConfirmModal(btn.dataset.id, btn.dataset.name);
    });

    cancelDeleteBtn.addEventListener("click", closeConfirmModal);
    confirmModalBackdrop.addEventListener("click", closeConfirmModal);

    document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && !confirmModal.classList.contains("hidden")) {
            closeConfirmModal();
        }
    });

    confirmDeleteBtn.addEventListener("click", function () {
        if (!pendingDeleteId) return;

        var id = pendingDeleteId;
        setDeleteButtonLoading(true);

        fetch(config.deleteUrlBase + "/" + id, {
            method: "DELETE",
            headers: { Accept: "application/json" }
        })
            .then(function (response) {
                return response.json().catch(function () {
                    return null;
                }).then(function (payload) {
                    return { ok: response.ok, status: response.status, payload: payload };
                });
            })
            .then(function (result) {
                if (!result.ok) {
                    var message = (result.payload && result.payload.message) ||
                        "Could not delete employee (" + result.status + ").";
                    throw new Error(message);
                }

                removeRowAndReconcile(id);
                showToast("Employee deleted successfully.", "success");
            })
            .catch(function (err) {
                showToast(err.message || "Network error — could not delete employee.", "error");
            })
            .finally(function () {
                setDeleteButtonLoading(false);
                closeConfirmModal();
            });
    });

    /**
     * Optimistically removes the row from the DOM (no page reload), updates
     * the visible total count, and — if that was the last row on a page
     * beyond page 1 — steps back a page and refetches so the user never
     * lands on an empty page.
     */
    function removeRowAndReconcile(id) {
        var row = tableBody.querySelector('tr[data-id="' + id + '"]');
        if (row) {
            row.classList.add("row-leave");
            setTimeout(function () {
                row.remove();
                afterRowRemoved();
            }, 150);
        } else {
            afterRowRemoved();
        }
    }

    function afterRowRemoved() {
        state.totalRecords = Math.max(0, state.totalRecords - 1);
        var remainingRowsOnPage = tableBody.querySelectorAll("tr[data-id]").length;

        if (remainingRowsOnPage === 0 && state.currentPage > 1) {
            state.currentPage -= 1;
            loadEmployees();
            return;
        }

        if (remainingRowsOnPage === 0) {
            renderTable([]);
        }

        var totalPages = state.pageSize === 0 ? 0 : Math.ceil(state.totalRecords / state.pageSize);
        renderPaginationAndSummary({
            currentPage: state.currentPage,
            pageSize: state.pageSize,
            totalRecords: state.totalRecords,
            totalPages: totalPages,
            hasPreviousPage: state.currentPage > 1,
            hasNextPage: state.currentPage < totalPages
        });
    }

    // ---------------------------------------------------------------
    // Init — colorize the server-rendered rows on first paint.
    // No initial fetch: the server already rendered page 1 in the HTML.
    // ---------------------------------------------------------------

    renderDeptBadges();
    renderAvatars();
    renderPaginationAndSummary({
        currentPage: state.currentPage,
        pageSize: state.pageSize,
        totalRecords: state.totalRecords,
        totalPages: state.pageSize === 0 ? 0 : Math.ceil(state.totalRecords / state.pageSize),
        hasPreviousPage: state.currentPage > 1,
        hasNextPage: state.currentPage * state.pageSize < state.totalRecords
    });

    if (tableBody.querySelectorAll("tr[data-id]").length === 0) {
        renderTable([]);
    }
})();
