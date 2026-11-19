(() => {
    "use strict";

    const STORAGE_KEY = "daily-movement:active-person";
    const PALETTE = [
        { color: "#FFE5B4", name: "Peach" },
        { color: "#afd6ff", name: "Sky" },
        { color: "#ffd0a8", name: "Peach" },
        { color: "#e2c6ff", name: "Lilac" },
        { color: "#ffb8b8", name: "Coral" },
        { color: "#bdf0d0", name: "Mint" },
        { color: "#ffe58f", name: "Butter" },
        { color: "#c7d1ff", name: "Periwinkle" },
    ];

    const ICON = {
        check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.2 4.2L19 6.8"/></svg>',
        plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
        pencil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>',
        trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v6M14 11v6"/></svg>',
        flame: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22c4 0 6.5-2.6 6.5-6.2 0-3-1.8-4.9-3.2-6.3-.8-.8-1.5-1.6-1.8-2.7-2 1.3-3.4 3.2-3.4 5.2 0 1.3.4 2.2 1 3-1.5 0-2.8-1.2-3.3-2.8-.9 1.1-1.8 2.6-1.8 4.6C6.5 19.2 8.5 22 12 22Z"/></svg>',
        trophy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M7 6H4v2a4 4 0 0 0 4 4M17 6h3v2a4 4 0 0 1-4 4"/></svg>',
        calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>',
        trend: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg>',
    };

    const state = {
        today: toISODate(new Date()),
        users: [],
        activeUserId: null,
        dashboard: null,
        dashboardRequest: 0,
    };

    const els = {};
    let pendingConfirm = null;
    let refreshTimer = null;

    document.addEventListener("DOMContentLoaded", init);

    function init() {
        cacheElements();
        renderColorSwatches();
        bindEvents();
        bootstrap();
        setInterval(refreshIfNewDay, 60_000);
        document.addEventListener("visibilitychange", () => {
            if (!document.hidden) refreshIfNewDay();
        });
    }

    function refreshIfNewDay() {
        const today = toISODate(new Date());
        if (today === state.today) return;
        state.today = today;
        bootstrap();
    }

    function cacheElements() {
        els.view = document.getElementById("view");
        els.peopleList = document.getElementById("people-list");
        els.addPersonButton = document.getElementById("add-person-button");
        els.personDialog = document.getElementById("person-dialog");
        els.personForm = document.getElementById("person-form");
        els.personId = document.getElementById("person-id");
        els.personName = document.getElementById("person-name");
        els.personEmoji = document.getElementById("person-emoji");
        els.personColors = document.getElementById("person-colors");
        els.personPreview = document.getElementById("person-preview");
        els.personSubmit = document.getElementById("person-submit");
        els.personTitle = document.getElementById("person-dialog-title");
        els.exerciseDialog = document.getElementById("exercise-dialog");
        els.exerciseForm = document.getElementById("exercise-form");
        els.exerciseId = document.getElementById("exercise-id");
        els.exerciseUserId = document.getElementById("exercise-user-id");
        els.exerciseName = document.getElementById("exercise-name");
        els.exerciseTarget = document.getElementById("exercise-target");
        els.exerciseSubmit = document.getElementById("exercise-submit");
        els.exerciseTitle = document.getElementById("exercise-dialog-title");
        els.confirmDialog = document.getElementById("confirm-dialog");
        els.confirmTitle = document.getElementById("confirm-title");
        els.confirmMessage = document.getElementById("confirm-message");
        els.confirmSubmit = document.getElementById("confirm-submit");
        els.toastRegion = document.getElementById("toast-region");
    }

    function bindEvents() {
        els.addPersonButton.addEventListener("click", () => openPersonDialog());
        els.peopleList.addEventListener("click", (event) => {
            const tab = event.target.closest(".person-tab");
            if (tab) selectUser(Number(tab.dataset.userId));
        });

        els.view.addEventListener("click", handleViewClick);
        els.view.addEventListener("change", handleViewChange);

        els.personForm.addEventListener("submit", handlePersonSubmit);
        els.exerciseForm.addEventListener("submit", handleExerciseSubmit);
        els.confirmSubmit.addEventListener("click", runConfirmAction);

        els.personEmoji.addEventListener("input", updatePersonPreview);
        els.personColors.addEventListener("change", updatePersonPreview);

        document.querySelectorAll("[data-close-dialog]").forEach((button) => {
            button.addEventListener("click", () => closeDialog(button.dataset.closeDialog));
        });

        [els.personDialog, els.exerciseDialog, els.confirmDialog].forEach((dialog) => {
            dialog.addEventListener("click", (event) => {
                if (event.target !== dialog) return;
                const rect = dialog.getBoundingClientRect();
                const outside =
                    event.clientX < rect.left ||
                    event.clientX > rect.right ||
                    event.clientY < rect.top ||
                    event.clientY > rect.bottom;
                if (outside) dialog.close();
            });
        });

        els.confirmDialog.addEventListener("close", () => {
            pendingConfirm = null;
            setBusy(els.confirmSubmit, false);
        });
    }

    async function bootstrap() {
        try {
            await loadUsers();
            if (!state.users.length) {
                state.activeUserId = null;
                state.dashboard = null;
                renderNoPeople();
                return;
            }

            const stored = Number(localStorage.getItem(STORAGE_KEY));
            const current = state.users.find((user) => user.id === state.activeUserId);
            const remembered = state.users.find((user) => user.id === stored);
            const nextId = current?.id || remembered?.id || state.users[0].id;
            await selectUser(nextId);
        } catch (error) {
            renderFatalError(error.message);
        }
    }

    async function loadUsers() {
        const data = await api(`/api/users?date=${state.today}`);
        const scrollPosition = els.peopleList.scrollLeft;
        state.users = data.users;
        renderPeople();
        els.peopleList.scrollLeft = scrollPosition;
    }

    async function selectUser(userId) {
        if (!state.users.some((user) => user.id === userId)) return;
        const changed = state.activeUserId !== userId;
        state.activeUserId = userId;
        localStorage.setItem(STORAGE_KEY, String(userId));

        if (changed) {
            state.dashboard = null;
            showLoading();
        }
        renderPeople();
        if (!changed && state.dashboard) return;
        await loadDashboard();
    }

    async function loadDashboard(options = {}) {
        const userId = state.activeUserId;
        if (!userId) return;
        const requestId = ++state.dashboardRequest;

        if (!state.dashboard) showLoading();

        try {
            const data = await api(`/api/users/${userId}?date=${state.today}`);
            if (requestId !== state.dashboardRequest || userId !== state.activeUserId) return;
            state.dashboard = data;
            renderDashboard(options.focusExerciseId);
        } catch (error) {
            if (requestId !== state.dashboardRequest) return;
            if (state.dashboard) {
                toast(error.message, true);
            } else {
                renderFatalError(error.message);
            }
        }
    }

    function renderPeople() {
        els.peopleList.innerHTML = state.users
            .map((user) => {
                const active = user.id === state.activeUserId;
                const color = safeColor(user.color);
                const count = Number(user.exercise_count) || 0;
                const done = Number(user.done_count) || 0;
                const progress = count ? Math.min(done / count, 1) : 0;
                const meta = !count
                    ? "No exercises yet"
                    : done >= count
                      ? "All done today"
                      : `${done} of ${count} today`;

                return `
                    <button
                        class="person-tab ${active ? "is-active" : ""}"
                        type="button"
                        data-user-id="${user.id}"
                        style="--person-color: ${color}"
                        aria-current="${active ? "page" : "false"}"
                    >
                        <span class="avatar" aria-hidden="true">${escapeHtml(user.emoji)}</span>
                        <span class="person-tab-copy">
                            <span class="person-tab-name">${escapeHtml(user.name)}</span>
                            <span class="person-tab-meta">${meta}</span>
                        </span>
                        <span class="person-mini-ring" style="--ring-progress: ${progress}" aria-hidden="true"></span>
                    </button>
                `;
            })
            .join("");
    }

    function renderDashboard(focusExerciseId = null) {
        const dashboard = state.dashboard;
        if (!dashboard) return;

        const { user, exercises, stats, history } = dashboard;
        const color = safeColor(user.color);
        const total = exercises.length;
        const historyHeading = historyTitle(user.name);
        const rangeLabel = `${formatDate(history.start, {
            month: "short",
            day: "numeric",
            year: "numeric",
        })} – ${formatDate(history.end, {
            month: "short",
            day: "numeric",
            year: "numeric",
        })}`;

        els.view.style.setProperty("--accent", color);
        els.view.innerHTML = `
            <div class="dashboard">
                <header class="page-head">
                    <div class="page-head-copy">
                        <div class="page-kicker">
                            <span>${formatDate(state.today, {
                                weekday: "long",
                                month: "long",
                                day: "numeric",
                            })}</span>
                            <span class="dot" aria-hidden="true"></span>
                            <span>Daily routine</span>
                        </div>
                        <div class="page-title-row">
                            <span class="avatar avatar--title" style="--person-color: ${color}" aria-hidden="true">${escapeHtml(user.emoji)}</span>
                            <h1 class="page-title">${escapeHtml(user.name)}</h1>
                        </div>
                    </div>
                    <div class="page-actions">
                        <span class="date-pill" title="${formatDate(state.today, {
                            weekday: "long",
                            month: "long",
                            day: "numeric",
                            year: "numeric",
                        })}">
                            <span class="live-dot" aria-hidden="true"></span>
                            Today
                        </span>
                        <button class="icon-button" type="button" data-action="edit-person" aria-label="Edit ${escapeHtml(user.name)}" title="Edit person">
                            ${ICON.pencil}
                        </button>
                        <button class="icon-button icon-button--danger" type="button" data-action="delete-person" aria-label="Delete ${escapeHtml(user.name)}" title="Delete person">
                            ${ICON.trash}
                        </button>
                    </div>
                </header>

                <section class="exercises-card" aria-labelledby="exercises-heading">
                    <div class="section-head">
                        <div class="section-title-group">
                            <h2 class="section-title" id="exercises-heading">Exercises</h2>
                            <span class="count-badge" aria-label="${total} exercises">${total}</span>
                        </div>
                        <button class="button button--primary" type="button" data-action="add-exercise">
                            ${ICON.plus}
                            Add exercise
                        </button>
                    </div>
                    ${
                        total
                            ? `<div class="exercise-list">${exercises.map(renderExerciseRow).join("")}</div>`
                            : emptyExercisesMarkup()
                    }
                </section>

                <section class="history-section" aria-labelledby="history-heading">
                    <div class="history-heading">
                        <div>
                            <span class="eyebrow">Progress</span>
                            <h2 class="history-title" id="history-heading">${escapeHtml(historyHeading)}</h2>
                        </div>
                    </div>

                    <div class="stat-grid">
                        ${statCard(ICON.flame, "Current streak", stats.current_streak, "days")}
                        ${statCard(ICON.trophy, "Best streak", stats.best_streak, "days")}
                        ${statCard(ICON.calendar, "Active days", stats.active_days, "days")}
                        ${statCard(ICON.trend, "30-day rate", `${stats.completion_rate_30}%`, "")}
                    </div>

                    <div class="history-card">
                        ${
                            total
                                ? `
                                    <div class="chart-head">
                                        <h3 class="chart-title">Last 14 days</h3>
                                        <span class="chart-legend"><span class="chart-legend-dot" aria-hidden="true"></span>Today</span>
                                    </div>
                                    ${renderTrend(history.days)}
                                    <div class="heatmap-block">
                                        <div class="chart-head">
                                            <h3 class="chart-title">52-week map</h3>
                                            <span class="chart-legend">${rangeLabel}</span>
                                        </div>
                                        ${renderHeatmap(history.days)}
                                    </div>
                                `
                                : `<div class="history-empty-note">
                                        <strong>No check-ins yet</strong>
                                        <span>Add a few exercises above and your history will start building itself.</span>
                                   </div>`
                        }
                    </div>
                </section>
            </div>
        `;

        requestAnimationFrame(() => {
            const heatmapScroller = els.view.querySelector(".heatmap-scroll");
            if (heatmapScroller) {
                heatmapScroller.scrollLeft = heatmapScroller.scrollWidth;
            }
            if (focusExerciseId) {
                const checkbox = els.view.querySelector(
                    `input[data-exercise-id="${focusExerciseId}"]`
                );
                checkbox?.focus({ preventScroll: true });
            }
        });
    }

    function renderExerciseRow(exercise) {
        const done = Boolean(exercise.done);
        const name = escapeHtml(exercise.name);
        return `
            <div class="exercise-row ${done ? "is-done" : ""}" data-row-id="${exercise.id}">
                <label class="exercise-check">
                    <input
                        type="checkbox"
                        data-action="toggle-exercise"
                        data-exercise-id="${exercise.id}"
                        ${done ? "checked" : ""}
                        aria-label="${done ? "Mark" : "Mark"} ${name} ${done ? "as not done" : "as done"}"
                    >
                    <span class="checkbox-ui" aria-hidden="true">${ICON.check}</span>
                </label>
                <div class="exercise-copy">
                    <span class="exercise-name">${name}</span>
                    <span class="exercise-target">${escapeHtml(exercise.target || "Daily")}</span>
                </div>
                <div class="exercise-actions">
                    <button class="icon-button" type="button" data-action="edit-exercise" data-exercise-id="${exercise.id}" aria-label="Edit ${name}" title="Edit exercise">
                        ${ICON.pencil}
                    </button>
                    <button class="icon-button icon-button--danger" type="button" data-action="delete-exercise" data-exercise-id="${exercise.id}" aria-label="Delete ${name}" title="Delete exercise">
                        ${ICON.trash}
                    </button>
                </div>
            </div>
        `;
    }

    function emptyExercisesMarkup() {
        return `
            <div class="empty-exercises">
                <div class="empty-illustration" aria-hidden="true">${ICON.plus}</div>
                <h3>No exercises yet</h3>
                <p>Build the daily set — a few moves you can come back to every day.</p>
                <button class="button button--primary" type="button" data-action="add-exercise">
                    ${ICON.plus}
                    Add first exercise
                </button>
            </div>
        `;
    }

    function statCard(icon, label, value, unit) {
        return `
            <article class="stat-card">
                <div class="stat-top">${icon}<span>${label}</span></div>
                <div class="stat-value">${value}${unit ? `<small>${unit}</small>` : ""}</div>
            </article>
        `;
    }

    function renderTrend(days) {
        const recent = days.slice(-14);
        return `
            <div class="trend-chart" role="img" aria-label="Daily completion over the last 14 days">
                ${recent
                    .map((day) => {
                        const percent = Number(day.percent) || 0;
                        const fillHeight = day.done ? Math.max(percent, 4) : 0;
                        const isToday = day.date === state.today;
                        const label =
                            percent === 100
                                ? "all complete"
                                : `${percent}% complete`;
                        return `
                            <div class="trend-day ${isToday ? "is-today" : ""} ${day.done ? "" : "is-empty"}"
                                title="${formatDate(day.date, {
                                    weekday: "short",
                                    month: "short",
                                    day: "numeric",
                                })}: ${label}">
                                <div class="trend-track">
                                    <div class="trend-fill" style="height: ${fillHeight}%"></div>
                                </div>
                                <span class="trend-label">${new Date(
                                    `${day.date}T12:00:00`
                                ).getDate()}</span>
                            </div>
                        `;
                    })
                    .join("")}
            </div>
        `;
    }

    function renderHeatmap(days) {
        const weeks = [];
        for (let index = 0; index < days.length; index += 7) {
            weeks.push(days.slice(index, index + 7));
        }

        let previousMonth = "";
        let lastLabelIndex = -10;
        const monthLabels = weeks
            .map((week, index) => {
                if (!week.length) return '<span class="heat-month"></span>';
                const labelDay = week[Math.min(3, week.length - 1)];
                const date = new Date(`${labelDay.date}T12:00:00`);
                const key = `${date.getFullYear()}-${date.getMonth()}`;

                // If the range opens with a sliver of a month, start with the
                // next full month so the labels never collide.
                if (index === 0 && weeks[1]?.length) {
                    const nextDay = weeks[1][Math.min(3, weeks[1].length - 1)];
                    const nextDate = new Date(`${nextDay.date}T12:00:00`);
                    const nextKey = `${nextDate.getFullYear()}-${nextDate.getMonth()}`;
                    if (nextKey !== key) {
                        previousMonth = key;
                        return '<span class="heat-month"></span>';
                    }
                }

                if (key === previousMonth) return '<span class="heat-month"></span>';
                previousMonth = key;
                if (index - lastLabelIndex < 3) return '<span class="heat-month"></span>';
                lastLabelIndex = index;
                return `<span class="heat-month"><span>${formatDate(labelDay.date, {
                    month: "short",
                })}</span></span>`;
            })
            .join("");

        const weekMarkup = weeks
            .map((week) => {
                const cells = week.map((day) => {
                    const level = heatLevel(day);
                    const isToday = day.date === state.today;
                    const label = `${formatDate(day.date, {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                    })}: ${day.done} of ${day.total} exercises`;
                    return `<span class="heat-cell level-${level} ${isToday ? "is-today" : ""}" role="img" aria-label="${label}" title="${label}"></span>`;
                });
                while (cells.length < 7) {
                    cells.push('<span class="heat-cell is-future" aria-hidden="true"></span>');
                }
                return `<div class="heat-week">${cells.join("")}</div>`;
            })
            .join("");

        const dayLabels = ["Mon", "", "Wed", "", "Fri", "", ""]
            .map((label) => `<span>${label}</span>`)
            .join("");

        const legend = [0, 1, 2, 3, 4]
            .map((level) => `<span class="heat-cell level-${level}" aria-hidden="true"></span>`)
            .join("");

        return `
            <div class="heatmap-scroll">
                <div class="heatmap">
                    <div class="heatmap-months" aria-hidden="true">${monthLabels}</div>
                    <div class="heatmap-content">
                        <div class="heatmap-day-labels" aria-hidden="true">${dayLabels}</div>
                        <div class="heatmap-weeks">${weekMarkup}</div>
                    </div>
                    <div class="heatmap-foot">
                        <span>Last 12 months</span>
                        <span class="heatmap-legend">Less ${legend} More</span>
                    </div>
                </div>
            </div>
        `;
    }

    function heatLevel(day) {
        if (!day.total || !day.done) return 0;
        const ratio = day.done / day.total;
        if (ratio >= 1) return 4;
        if (ratio >= 0.75) return 3;
        if (ratio >= 0.5) return 2;
        return 1;
    }

    function historyTitle(name) {
        const cleanName = String(name).trim();
        if (cleanName.toLowerCase() === "me") return "My history";
        return `${cleanName}${cleanName.endsWith("s") ? "'" : "'s"} history`;
    }

    function handleViewClick(event) {
        const button = event.target.closest("[data-action]");
        if (!button) return;
        const action = button.dataset.action;

        if (action === "edit-person") {
            const user = state.dashboard?.user;
            if (user) openPersonDialog(user);
        } else if (action === "delete-person") {
            const user = state.dashboard?.user;
            if (user) confirmDeletePerson(user);
        } else if (action === "add-person") {
            openPersonDialog();
        } else if (action === "add-exercise") {
            openExerciseDialog();
        } else if (action === "edit-exercise") {
            const exercise = findExercise(Number(button.dataset.exerciseId));
            if (exercise) openExerciseDialog(exercise);
        } else if (action === "delete-exercise") {
            const exercise = findExercise(Number(button.dataset.exerciseId));
            if (exercise) confirmDeleteExercise(exercise);
        } else if (action === "retry") {
            showLoading();
            bootstrap();
        }
    }

    function handleViewChange(event) {
        const checkbox = event.target.closest('[data-action="toggle-exercise"]');
        if (!checkbox) return;
        toggleExercise(checkbox);
    }

    function findExercise(exerciseId) {
        return state.dashboard?.exercises.find((exercise) => exercise.id === exerciseId);
    }

    async function toggleExercise(checkbox) {
        const exercise = findExercise(Number(checkbox.dataset.exerciseId));
        if (!exercise) return;

        const completed = checkbox.checked;
        const previous = exercise.done;
        exercise.done = completed;

        const row = checkbox.closest(".exercise-row");
        row?.classList.toggle("is-done", completed);
        updateProgressUI();

        checkbox.disabled = true;
        try {
            await api(`/api/exercises/${exercise.id}/completion`, {
                method: "PUT",
                body: { date: state.today, completed },
            });
            checkbox.disabled = false;
            scheduleDashboardRefresh();
        } catch (error) {
            exercise.done = previous;
            checkbox.checked = previous;
            row?.classList.toggle("is-done", previous);
            updateProgressUI();
            checkbox.disabled = false;
            toast(error.message, true);
        }
    }

    function updateProgressUI() {
        const dashboard = state.dashboard;
        if (!dashboard) return;

        const total = dashboard.exercises.length;
        const done = dashboard.exercises.filter((exercise) => exercise.done).length;

        const activeUser = state.users.find((user) => user.id === state.activeUserId);
        if (activeUser) activeUser.done_count = done;

        const tab = els.peopleList.querySelector(
            `.person-tab[data-user-id="${state.activeUserId}"]`
        );
        if (tab) {
            const meta = !total
                ? "No exercises yet"
                : done >= total
                  ? "All done today"
                  : `${done} of ${total} today`;
            const metaElement = tab.querySelector(".person-tab-meta");
            if (metaElement) metaElement.textContent = meta;
            const ringElement = tab.querySelector(".person-mini-ring");
            if (ringElement) {
                ringElement.style.setProperty("--ring-progress", String(total ? done / total : 0));
            }
        }
    }

    function scheduleDashboardRefresh() {
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(async () => {
            const focused = document.activeElement;
            const focusId =
                focused?.matches?.("input[data-exercise-id]") &&
                focused.closest(".exercise-row")
                    ? focused.dataset.exerciseId
                    : null;
            try {
                await Promise.all([
                    loadUsers(),
                    loadDashboard({ focusExerciseId: focusId }),
                ]);
            } catch (error) {
                toast(error.message, true);
            }
        }, 400);
    }

    function openPersonDialog(user = null) {
        els.personForm.reset();
        els.personId.value = user?.id || "";
        els.personName.value = user?.name || "";
        els.personEmoji.value = user?.emoji || "";
        const color = user?.color || nextColor();
        const radio = els.personColors.querySelector(
            `input[name="color"][value="${color}"]`
        );
        if (radio) radio.checked = true;
        els.personTitle.textContent = user ? "Edit person" : "Add a person";
        els.personSubmit.textContent = user ? "Save changes" : "Add person";
        updatePersonPreview();
        els.personDialog.showModal();
        requestAnimationFrame(() => els.personName.focus());
    }

    function renderColorSwatches() {
        els.personColors.innerHTML = PALETTE.map(
            ({ color, name }) => `
                <label class="swatch" style="--swatch-color: ${color}" title="${name}">
                    <input type="radio" name="color" value="${color}" aria-label="${name}">
                </label>
            `
        ).join("");
    }

    function updatePersonPreview() {
        const emoji = firstGrapheme(els.personEmoji.value) || "🙂";
        const color =
            els.personColors.querySelector('input[name="color"]:checked')?.value ||
            PALETTE[0].color;
        els.personPreview.textContent = emoji;
        els.personPreview.style.setProperty("--person-color", color);
    }

    async function handlePersonSubmit(event) {
        event.preventDefault();
        if (els.personSubmit.disabled) return;
        const data = new FormData(els.personForm);
        const id = String(data.get("user_id") || "");
        const name = String(data.get("name") || "").trim();
        const emoji = firstGrapheme(String(data.get("emoji") || "")) || "🙂";
        const color = String(data.get("color") || PALETTE[0].color);

        if (!name) {
            toast("Please give this person a name.", true);
            els.personName.focus();
            return;
        }

        setBusy(els.personSubmit, true, id ? "Saving…" : "Adding…");
        try {
            const result = await api(id ? `/api/users/${id}` : "/api/users", {
                method: id ? "PUT" : "POST",
                body: { name, emoji, color },
            });
            closeDialog("person-dialog");
            toast(id ? "Person updated." : "Person added.");
            await loadUsers();
            if (id) {
                if (Number(id) === state.activeUserId) await loadDashboard();
            } else {
                await selectUser(result.user.id);
            }
        } catch (error) {
            toast(error.message, true);
        } finally {
            setBusy(els.personSubmit, false);
        }
    }

    function openExerciseDialog(exercise = null) {
        els.exerciseForm.reset();
        els.exerciseId.value = exercise?.id || "";
        els.exerciseUserId.value = state.activeUserId || "";
        els.exerciseName.value = exercise?.name || "";
        els.exerciseTarget.value = exercise?.target || "";
        els.exerciseTitle.textContent = exercise ? "Edit exercise" : "Add an exercise";
        els.exerciseSubmit.textContent = exercise ? "Save changes" : "Add exercise";
        els.exerciseDialog.showModal();
        requestAnimationFrame(() => els.exerciseName.focus());
    }

    async function handleExerciseSubmit(event) {
        event.preventDefault();
        if (els.exerciseSubmit.disabled) return;
        const data = new FormData(els.exerciseForm);
        const id = String(data.get("exercise_id") || "");
        const userId = Number(data.get("user_id"));
        const name = String(data.get("name") || "").trim();
        const target = String(data.get("target") || "").trim();

        if (!name) {
            toast("Please name the exercise.", true);
            els.exerciseName.focus();
            return;
        }

        setBusy(els.exerciseSubmit, true, id ? "Saving…" : "Adding…");
        try {
            const result = await api(
                id ? `/api/exercises/${id}` : `/api/users/${userId}/exercises`,
                {
                    method: id ? "PUT" : "POST",
                    body: { name, target },
                }
            );
            closeDialog("exercise-dialog");
            toast(id ? "Exercise updated." : "Exercise added.");
            await loadUsers();
            await loadDashboard({ focusExerciseId: result.exercise.id });
        } catch (error) {
            toast(error.message, true);
        } finally {
            setBusy(els.exerciseSubmit, false);
        }
    }

    function confirmDeletePerson(user) {
        openConfirm({
            title: `Delete ${user.name}?`,
            message: `This will remove ${user.name}'s exercise set and their entire history. This can't be undone.`,
            confirmLabel: "Delete person",
            busyLabel: "Deleting…",
            onConfirm: async () => {
                await api(`/api/users/${user.id}`, { method: "DELETE" });
                if (state.activeUserId === user.id) {
                    state.activeUserId = null;
                    state.dashboard = null;
                    state.dashboardRequest += 1;
                    localStorage.removeItem(STORAGE_KEY);
                }
                toast("Person removed.");
                await loadUsers();
                if (state.users.length) {
                    await selectUser(state.users[0].id);
                } else {
                    renderNoPeople();
                }
            },
        });
    }

    function confirmDeleteExercise(exercise) {
        openConfirm({
            title: "Delete exercise?",
            message: `"${exercise.name}" and its check-off history will be removed. This can't be undone.`,
            confirmLabel: "Delete exercise",
            busyLabel: "Deleting…",
            onConfirm: async () => {
                await api(`/api/exercises/${exercise.id}`, { method: "DELETE" });
                toast("Exercise deleted.");
                await loadUsers();
                await loadDashboard();
            },
        });
    }

    function openConfirm({ title, message, confirmLabel, busyLabel, onConfirm }) {
        els.confirmTitle.textContent = title;
        els.confirmMessage.textContent = message;
        els.confirmSubmit.textContent = confirmLabel;
        els.confirmSubmit.dataset.busyLabel = busyLabel;
        pendingConfirm = onConfirm;
        els.confirmDialog.showModal();
    }

    async function runConfirmAction() {
        if (!pendingConfirm) return;
        const action = pendingConfirm;
        setBusy(els.confirmSubmit, true, els.confirmSubmit.dataset.busyLabel || "Working…");
        try {
            await action();
            els.confirmDialog.close();
        } catch (error) {
            toast(error.message, true);
        } finally {
            setBusy(els.confirmSubmit, false);
        }
    }

    function closeDialog(id) {
        const dialog = document.getElementById(id);
        if (dialog?.open) dialog.close();
    }

    function setBusy(button, busy, label) {
        if (!button) return;
        if (busy) {
            button.dataset.idleLabel = button.textContent;
            button.textContent = label || "Saving…";
            button.disabled = true;
        } else {
            if (button.dataset.idleLabel) {
                button.textContent = button.dataset.idleLabel;
                delete button.dataset.idleLabel;
            }
            button.disabled = false;
        }
    }

    function renderNoPeople() {
        els.view.style.removeProperty("--accent");
        els.view.innerHTML = `
            <div class="empty-household">
                <div class="empty-household-inner">
                    <span class="eyebrow">Welcome</span>
                    <h1>Everyone starts somewhere.</h1>
                    <p>Add the first person to create their daily exercise set and begin tracking.</p>
                    <button class="button button--primary" type="button" data-action="add-person">
                        ${ICON.plus}
                        Add a person
                    </button>
                </div>
            </div>
        `;
    }

    function renderFatalError(message) {
        els.view.style.removeProperty("--accent");
        els.view.innerHTML = `
            <div class="empty-household">
                <div class="empty-household-inner">
                    <span class="eyebrow">Something went wrong</span>
                    <h1>Couldn't load your workouts.</h1>
                    <p>${escapeHtml(message || "Please check that the server is running and try again.")}</p>
                    <button class="button button--primary" type="button" data-action="retry">Try again</button>
                </div>
            </div>
        `;
    }

    function showLoading() {
        els.view.innerHTML = `
            <div class="loading-state">
                <span class="spinner" aria-hidden="true"></span>
                <span>Loading your routine…</span>
            </div>
        `;
    }

    function toast(message, isError = false) {
        const element = document.createElement("div");
        element.className = `toast${isError ? " is-error" : ""}`;
        element.textContent = message;
        els.toastRegion.append(element);
        setTimeout(() => {
            element.classList.add("is-leaving");
            setTimeout(() => element.remove(), 220);
        }, 3200);
    }

    async function api(url, options = {}) {
        const requestOptions = { method: options.method || "GET", headers: {} };
        if (options.body !== undefined) {
            requestOptions.headers["Content-Type"] = "application/json";
            requestOptions.body = JSON.stringify(options.body);
        }
        const response = await fetch(url, requestOptions);
        let payload = null;
        try {
            payload = await response.json();
        } catch {
            payload = null;
        }
        if (!response.ok) {
            throw new Error(payload?.error || "Something went wrong. Please try again.");
        }
        return payload;
    }

    function nextColor() {
        const used = new Set(state.users.map((user) => user.color));
        return (
            PALETTE.find(({ color }) => !used.has(color))?.color ||
            PALETTE[state.users.length % PALETTE.length].color
        );
    }

    function firstGrapheme(value) {
        const text = String(value || "").trim();
        if (!text) return "";
        try {
            const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
            return [...segmenter.segment(text)][0]?.segment || "";
        } catch {
            return [...text][0] || "";
        }
    }

    function safeColor(value) {
        return /^#[0-9a-f]{6}$/i.test(String(value)) ? value : "#FFE5B4";
    }

    function escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, (character) => {
            const entities = {
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;",
            };
            return entities[character];
        });
    }

    function toISODate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    }

    function formatDate(iso, options) {
        return new Intl.DateTimeFormat(undefined, options).format(
            new Date(`${iso}T12:00:00`)
        );
    }
})();
