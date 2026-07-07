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

    // Deterministic color palettes — same dept/person always gets same color.
    // ponytail: inline CSS vars instead of Tailwind class combos
    var DEPT_COLORS = [
        { bg: "rgba(99,102,241,.15)",  color: "#a5b4fc" },
        { bg: "rgba(16,185,129,.13)",  color: "#6ee7b7" },
        { bg: "rgba(245,158,11,.13)",  color: "#fcd34d" },
        { bg: "rgba(139,92,246,.14)",  color: "#c4b5fd" },
        { bg: "rgba(239,68,68,.13)",   color: "#fca5a5" },
        { bg: "rgba(6,182,212,.13)",   color: "#67e8f9" },
        { bg: "rgba(249,115,22,.13)",  color: "#fdba74" },
        { bg: "rgba(20,184,166,.13)",  color: "#5eead4" },
        { bg: "rgba(236,72,153,.13)",  color: "#f9a8d4" },
        { bg: "rgba(132,204,22,.13)",  color: "#bef264" }
    ];
    var AVATAR_PALETTE = [
        "#5c54d4", "#0d7a6a", "#b45309", "#6d28d9",
        "#b91c1c", "#0369a1", "#c2410c", "#047857"
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
        tableBody.querySelectorAll(".dept-badge").forEach(function (el) {
            var c = DEPT_COLORS[hashString(el.dataset.dept || "") % DEPT_COLORS.length];
            el.style.background = c.bg;
            el.style.color = c.color;
        });
    }

    function renderAvatars() {
        tableBody.querySelectorAll(".employee-avatar").forEach(function (el) {
            el.style.background = AVATAR_PALETTE[hashString(el.dataset.name || "") % AVATAR_PALETTE.length];
        });
    }

    function buildRow(employee) {
        var tr = document.createElement("tr");
        tr.dataset.id = employee.id;
        tr.className = "row-enter";

        var fullName = employee.firstName + " " + employee.lastName;

        tr.innerHTML =
            '<td class="name-cell">' +
                '<div class="name-wrap">' +
                    '<div class="av employee-avatar" data-name="' + escapeHtml(fullName) + '">' +
                        initials(employee.firstName, employee.lastName) +
                    '</div>' +
                    escapeHtml(fullName) +
                '</div>' +
            '</td>' +
            '<td><span class="dept-badge" data-dept="' + escapeHtml(employee.department) + '">' + escapeHtml(employee.department) + '</span></td>' +
            '<td>' + escapeHtml(employee.jobTitle) + '</td>' +
            '<td class="mono" style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escapeHtml(employee.email || "") + '</td>' +
            '<td class="mono">' + formatDate(employee.hireDate) + '</td>' +
            '<td class="mono r">' + formatCurrency(employee.salary) + '</td>' +
            '<td class="r">' +
                '<button type="button" class="del-btn delete-btn" data-id="' + employee.id + '" data-name="' + escapeHtml(fullName) + '" aria-label="Delete ' + escapeHtml(fullName) + '">' +
                    '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">' +
                        '<path stroke-linecap="round" stroke-linejoin="round" d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2m2 0-1 13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 7h14Z"/>' +
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
        tableWrapper.style.opacity = isLoading ? "0.4" : "";
        tableWrapper.style.pointerEvents = isLoading ? "none" : "";
        prevPageBtn.disabled = isLoading || prevPageBtn.disabled;
        nextPageBtn.disabled = isLoading || nextPageBtn.disabled;
    }

    // ---------------------------------------------------------------
    // Toasts
    // ---------------------------------------------------------------

    function showToast(message, type) {
        var isError = type === "error";
        var toast = document.createElement("div");
        toast.className = "toast row-enter " + (isError ? "err" : "ok");

        var iconSvg = isError
            ? '<svg class="t-icon c-err" width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path stroke-linecap="round" d="M12 8v5m0 3h.01"/></svg>'
            : '<svg class="t-icon c-ok" width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path stroke-linecap="round" stroke-linejoin="round" d="m8 12 3 3 5-6"/></svg>';

        toast.innerHTML = iconSvg + '<span>' + escapeHtml(message) + '</span>';
        toastContainer.appendChild(toast);

        setTimeout(function () {
            toast.classList.add("row-leave");
            setTimeout(function () { toast.remove(); }, 160);
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
