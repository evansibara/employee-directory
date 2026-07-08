/**
 * Employee Directory — frontend logic.
 * Vanilla JS only — no frameworks, no libraries.
 *
 *  - Debounced search (300ms), resets to page 1
 *  - Server-side pagination (Previous / Next)
 *  - Delete via DELETE /api/employees/{id} — confirm dialog, loading state,
 *    optimistic DOM removal, toast-based error handling
 *  - "/" focuses search (skipped when typing in a field already)
 */
(function () {
    "use strict";

    // ---------------------------------------------------------------
    // Config + state
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

    // A small, curated set of muted tones — not the default rainbow of
    // saturated utility-class colors. Departments and avatars share this
    // palette so the page reads as one deliberate system, not a grab-bag.
    var PALETTE = [
        "#1F4D3D", // forest
        "#8A5A2E", // terracotta
        "#2E5C82", // steel blue
        "#6B4A8A", // plum
        "#8A3B3B", // brick
        "#4A7A6B", // sage
        "#7A5C1E", // bronze
        "#5C5C8A"  // slate indigo
    ];

    // ---------------------------------------------------------------
    // DOM references
    // ---------------------------------------------------------------

    var tableWrapper = document.getElementById("tableWrapper");
    var tableBody = document.getElementById("employeeTableBody");
    var emptyState = document.getElementById("emptyState");
    var emptyStateHint = document.getElementById("emptyStateHint");
    var recordSummary = document.getElementById("recordSummary");

    var searchField = document.getElementById("searchField");
    var searchInput = document.getElementById("searchInput");
    var clearSearchBtn = document.getElementById("clearSearchBtn");

    var pageInfo = document.getElementById("pageInfo");
    var pageIndicator = document.getElementById("pageIndicator");
    var prevPageBtn = document.getElementById("prevPageBtn");
    var nextPageBtn = document.getElementById("nextPageBtn");

    var confirmModal = document.getElementById("confirmModal");
    var confirmModalName = document.getElementById("confirmModalName");
    var cancelDeleteBtn = document.getElementById("cancelDeleteBtn");
    var confirmDeleteBtn = document.getElementById("confirmDeleteBtn");
    var confirmDeleteSpinner = document.getElementById("confirmDeleteSpinner");
    var confirmDeleteLabel = document.getElementById("confirmDeleteLabel");

    var toastContainer = document.getElementById("toastContainer");

    var pendingDeleteId = null;
    var lastFocusedBeforeModal = null;

    // ---------------------------------------------------------------
    // Utilities
    // ---------------------------------------------------------------

    function debounce(fn, delayMs) {
        var timerId = null;
        return function () {
            var args = arguments;
            clearTimeout(timerId);
            timerId = setTimeout(function () { fn.apply(null, args); }, delayMs);
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

    function toneFor(seed) {
        return PALETTE[hashString(seed) % PALETTE.length];
    }

    function escapeHtml(value) {
        var div = document.createElement("div");
        div.textContent = value == null ? "" : String(value);
        return div.innerHTML;
    }

    function formatCurrency(amount) {
        return new Intl.NumberFormat("en-US", {
            style: "currency", currency: "USD", maximumFractionDigits: 0
        }).format(amount);
    }

    function formatDate(isoString) {
        return new Date(isoString).toLocaleDateString("en-US", {
            year: "numeric", month: "short", day: "numeric"
        });
    }

    function initials(firstName, lastName) {
        return ((firstName || "").charAt(0) + (lastName || "").charAt(0)).toUpperCase();
    }

    // ---------------------------------------------------------------
    // Rendering
    // ---------------------------------------------------------------

    function colorizeExistingRows() {
        tableBody.querySelectorAll(".avatar").forEach(function (el) {
            el.style.backgroundColor = toneFor(el.dataset.name || "");
        });
        tableBody.querySelectorAll(".dept__dot").forEach(function (el) {
            el.style.backgroundColor = toneFor(el.dataset.dept || "");
        });
    }

    function buildRow(employee) {
        var tr = document.createElement("tr");
        tr.dataset.id = employee.id;
        tr.className = "row-enter";

        var fullName = employee.firstName + " " + employee.lastName;
        var avatarColor = toneFor(fullName);
        var deptColor = toneFor(employee.department);

        tr.innerHTML =
            '<td>' +
                '<div class="person">' +
                    '<div class="avatar" style="background-color:' + avatarColor + '">' + initials(employee.firstName, employee.lastName) + '</div>' +
                    '<span class="person__name">' + escapeHtml(fullName) + '</span>' +
                '</div>' +
            '</td>' +
            '<td><span class="dept"><span class="dept__dot" style="background-color:' + deptColor + '"></span>' + escapeHtml(employee.department) + '</span></td>' +
            '<td class="cell-muted">' + escapeHtml(employee.jobTitle) + '</td>' +
            '<td class="cell-email">' + escapeHtml(employee.email || "") + '</td>' +
            '<td class="num">' + formatDate(employee.hireDate) + '</td>' +
            '<td class="num">' + formatCurrency(employee.salary) + '</td>' +
            '<td class="row-actions">' +
                '<button type="button" class="icon-btn delete-btn" data-id="' + employee.id + '" data-name="' + escapeHtml(fullName) + '" aria-label="Delete ' + escapeHtml(fullName) + '">' +
                    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
                        '<path stroke-linecap="round" stroke-linejoin="round" d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2m2 0-1 13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 7h14Z" />' +
                    '</svg>' +
                '</button>' +
            '</td>';

        return tr;
    }

    function renderSkeleton(rows) {
        tableBody.innerHTML = "";
        emptyState.classList.remove("is-visible");
        var widths = [140, 90, 120, 150, 80, 60];
        for (var i = 0; i < rows; i++) {
            var tr = document.createElement("tr");
            var cells = "";
            widths.forEach(function (w) {
                cells += '<td><div class="skeleton-bar" style="width:' + w + 'px"></div></td>';
            });
            cells += '<td></td>';
            tr.innerHTML = cells;
            tableBody.appendChild(tr);
        }
    }

    function renderTable(employees) {
        tableBody.innerHTML = "";

        if (!employees || employees.length === 0) {
            emptyState.classList.add("is-visible");
            emptyStateHint.textContent = state.searchTerm
                ? 'No results for "' + state.searchTerm + '". Try a different name.'
                : "There are no employees to display.";
            return;
        }

        emptyState.classList.remove("is-visible");

        var fragment = document.createDocumentFragment();
        employees.forEach(function (employee) { fragment.appendChild(buildRow(employee)); });
        tableBody.appendChild(fragment);
    }

    function renderPaginationAndSummary(data) {
        state.currentPage = data.currentPage;
        state.pageSize = data.pageSize;
        state.totalRecords = data.totalRecords;

        var totalPages = data.totalPages;

        recordSummary.innerHTML = '<strong>' + data.totalRecords + '</strong> employee' + (data.totalRecords === 1 ? "" : "s") +
            (state.searchTerm ? ' matching "' + escapeHtml(state.searchTerm) + '"' : " on record");

        if (data.totalRecords === 0) {
            pageInfo.textContent = "";
            pageIndicator.textContent = "";
        } else {
            var startRecord = (data.currentPage - 1) * data.pageSize + 1;
            var endRecord = Math.min(data.currentPage * data.pageSize, data.totalRecords);
            pageInfo.textContent = "Showing " + startRecord + "–" + endRecord + " of " + data.totalRecords;
            pageIndicator.textContent = data.currentPage + " / " + totalPages;
        }

        prevPageBtn.disabled = !data.hasPreviousPage;
        nextPageBtn.disabled = !data.hasNextPage;
    }

    function setLoading(isLoading) {
        state.isLoading = isLoading;
        if (isLoading) {
            renderSkeleton(Math.min(state.pageSize, 8));
        }
        prevPageBtn.disabled = isLoading || prevPageBtn.disabled;
        nextPageBtn.disabled = isLoading || nextPageBtn.disabled;
    }

    // ---------------------------------------------------------------
    // Toasts
    // ---------------------------------------------------------------

    function showToast(message, type) {
        var isError = type === "error";
        var toast = document.createElement("div");
        toast.className = "toast" + (isError ? " toast--error" : "");

        var icon = isError
            ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path stroke-linecap="round" d="M12 8v5m0 3h.01"/></svg>'
            : '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path stroke-linecap="round" stroke-linejoin="round" d="m8 12 3 3 5-6"/></svg>';

        toast.innerHTML = icon + '<span>' + escapeHtml(message) + '</span>';
        toastContainer.appendChild(toast);

        setTimeout(function () {
            toast.classList.add("is-leaving");
            setTimeout(function () { toast.remove(); }, 180);
        }, 4000);
    }

    // ---------------------------------------------------------------
    // Data loading
    // ---------------------------------------------------------------

    function loadEmployees() {
        if (state.isLoading) return Promise.resolve();
        setLoading(true);

        var params = new URLSearchParams({ page: state.currentPage, pageSize: state.pageSize });
        if (state.searchTerm) params.set("searchTerm", state.searchTerm);

        return fetch(config.apiUrl + "?" + params.toString(), {
            method: "GET",
            headers: { Accept: "application/json" }
        })
            .then(function (response) {
                return response.json().catch(function () { return null; }).then(function (payload) {
                    if (!response.ok || !payload || payload.success === false) {
                        throw new Error((payload && payload.message) || "Failed to load employees (" + response.status + ").");
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
                state.isLoading = false;
            });
    }

    // ---------------------------------------------------------------
    // Search
    // ---------------------------------------------------------------

    var debouncedSearch = debounce(function (value) {
        state.searchTerm = value.trim();
        state.currentPage = 1;
        loadEmployees();
    }, 300);

    searchInput.addEventListener("input", function (e) {
        var value = e.target.value;
        searchField.classList.toggle("has-value", value.length > 0);
        debouncedSearch(value);
    });

    clearSearchBtn.addEventListener("click", function () {
        searchInput.value = "";
        searchField.classList.remove("has-value");
        state.searchTerm = "";
        state.currentPage = 1;
        loadEmployees();
        searchInput.focus();
    });

    if (searchInput.value) searchField.classList.add("has-value");

    // "/" focuses search, unless already typing in an input/textarea.
    document.addEventListener("keydown", function (e) {
        if (e.key === "/" && document.activeElement !== searchInput &&
            !/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) {
            e.preventDefault();
            searchInput.focus();
        }
    });

    // ---------------------------------------------------------------
    // Pagination
    // ---------------------------------------------------------------

    prevPageBtn.addEventListener("click", function () {
        if (state.currentPage > 1) { state.currentPage -= 1; loadEmployees(); }
    });

    nextPageBtn.addEventListener("click", function () {
        state.currentPage += 1;
        loadEmployees();
    });

    // ---------------------------------------------------------------
    // Delete flow
    // ---------------------------------------------------------------

    function openConfirmModal(id, name) {
        pendingDeleteId = id;
        lastFocusedBeforeModal = document.activeElement;
        confirmModalName.textContent = name;
        confirmModal.classList.add("is-open");
        cancelDeleteBtn.focus();
    }

    function closeConfirmModal() {
        confirmModal.classList.remove("is-open");
        pendingDeleteId = null;
        if (lastFocusedBeforeModal && document.contains(lastFocusedBeforeModal)) {
            lastFocusedBeforeModal.focus();
        }
    }

    function setDeleteButtonLoading(isLoading) {
        confirmDeleteBtn.disabled = isLoading;
        cancelDeleteBtn.disabled = isLoading;
        confirmDeleteSpinner.style.display = isLoading ? "inline-block" : "none";
        confirmDeleteLabel.textContent = isLoading ? "Deleting…" : "Delete";
    }

    tableBody.addEventListener("click", function (e) {
        var btn = e.target.closest(".delete-btn");
        if (!btn) return;
        openConfirmModal(btn.dataset.id, btn.dataset.name);
    });

    cancelDeleteBtn.addEventListener("click", closeConfirmModal);

    confirmModal.addEventListener("click", function (e) {
        if (e.target === confirmModal) closeConfirmModal();
    });

    document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && confirmModal.classList.contains("is-open")) {
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
                return response.json().catch(function () { return null; }).then(function (payload) {
                    return { ok: response.ok, status: response.status, payload: payload };
                });
            })
            .then(function (result) {
                if (!result.ok) {
                    throw new Error((result.payload && result.payload.message) || "Could not delete employee (" + result.status + ").");
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

    function removeRowAndReconcile(id) {
        var row = tableBody.querySelector('tr[data-id="' + id + '"]');
        if (row) {
            row.style.transition = "opacity 0.15s ease";
            row.style.opacity = "0";
            setTimeout(function () { row.remove(); afterRowRemoved(); }, 150);
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

        if (remainingRowsOnPage === 0) renderTable([]);

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
    // Init — colorize server-rendered rows on first paint, no re-fetch
    // (the server already rendered page 1).
    // ---------------------------------------------------------------

    colorizeExistingRows();
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
