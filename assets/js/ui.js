import Timer from './timer.js';
import Charts from './charts.js';
import appState, { initializeAppState } from './core.js';
import { COLOR_THEMES, MFPT_EVENTS, REST_ID } from './constants.js';
import themeManager from './theme-manager.js';

function findClosestInComposedPath(event, selector) {
    return event.composedPath().find((node) => node instanceof Element && node.matches(selector)) || null;
}

export function updateTimerDisplay(startTime) {
    if (!startTime) {
        document.getElementById('currentTimer').textContent = '00:00:00';
        document.querySelector('.fullscreen-mode .timer').textContent = '00:00:00';
        return;
    }

    const now = Date.now();
    const elapsedMs = now - startTime;
    const timeStr = Timer.formatMilliseconds(elapsedMs);

    document.getElementById('currentTimer').textContent = timeStr;

    // 更新全屏模式的显示
    const fullscreenTimer = document.querySelector('.fullscreen-mode .timer');
    if (fullscreenTimer) {
        if (window.innerWidth <= 768) {
            const [hours, minutes, seconds] = timeStr.split(':');
            fullscreenTimer.innerHTML = `${hours}:<br>${minutes}:<br>${seconds}`;
        } else {
            fullscreenTimer.textContent = timeStr;
        }
    }
}

class UI {
    static async init() {
        await Promise.all([initializeAppState(), themeManager.ready]);

        const ui = new UI();
        Charts.init();  // 注册Service Worker
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register(new URL('../../service-worker.js', import.meta.url))
                .then(registration => {
                    console.log('Service Worker registered:', registration);
                    
                    // 监听Service Worker消息
                    navigator.serviceWorker.addEventListener('message', (event) => {
                        if (event.data && event.data.type === 'UPDATE_AVAILABLE') {
                            ui.showUpdateNotification(event.data.message);
                        }
                    });
                    
                    // 检查是否有等待中的Service Worker
                    if (registration.waiting) {
                        ui.showUpdateNotification('应用已更新，刷新页面即可使用最新版本');
                    }
                    
                    // 监听新的Service Worker安装
                    registration.addEventListener('updatefound', () => {
                        const newWorker = registration.installing;
                        newWorker.addEventListener('statechange', () => {
                            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                ui.showUpdateNotification('应用已更新，刷新页面即可使用最新版本');
                            }
                        });
                    });
                    
                    // 页面加载完成后检查资源更新
                    if (navigator.serviceWorker.controller) {
                        console.log('检查应用资源更新...');
                        navigator.serviceWorker.controller.postMessage({ type: 'CHECK_UPDATE' });
                    }
                })
                .catch(error => {
                    console.log('Service Worker registration failed:', error);
                });
        }

        // 检查并请求通知权限
        if ('Notification' in window && Notification.permission !== 'granted') {
            Notification.requestPermission();
        }

        return ui;
    }

    constructor() {
        // DOM Elements
        this.newTaskInput = document.querySelector('#newTaskInput');
        this.addTaskButton = document.querySelector('#addTaskButton');
        this.startRestButton = document.querySelector('#startRestButton');
        this.stopActivityButton = document.querySelector('#stopActivityButton');
        this.taskList = document.querySelector('#taskList');
        this.currentTaskNameSpan = document.querySelector('#currentTaskName');
        this.currentTimerSpan = document.querySelector('#currentTimer');
        this.historyLogDiv = document.querySelector('#historyLog');
        this.historyScrollContainer = document.querySelector('#log-scroll-container');
        this.historyPage = 0;
        this.historyPageSize = 200;
        this.historyHasMore = true;
        this.historyLoading = false;
        this.taskMetricsDiv = document.querySelector('#taskMetrics');
        this.clearHistoryButton = document.querySelector('#clearHistoryButton');
        this.clearDataButton = document.querySelector('#clearDataButton');
        this.heatmapPanel = document.querySelector('#heatmapPanel');
        this.historyPanel = document.querySelector('#historyPanel');

        // Timer settings elements
        this.reminderMinutesInput = document.querySelector('#reminderMinutes');
        this.timeoutMinutesInput = document.querySelector('#timeoutMinutes');
        this.reminderEnabledInput = document.querySelector('#reminderEnabled');
        this.timeoutEnabledInput = document.querySelector('#timeoutEnabled');

        // Fullscreen elements
        this.fullscreenMode = document.querySelector('.fullscreen-mode');
        this.fullscreenToggle = document.querySelector('.fullscreen-toggle');
        this.fullscreenTimer = document.querySelector('.fullscreen-mode .timer');
        this.fullscreenTransitioning = false;
        this.fullscreenTransitionTimer = null;
        this.taskChips = document.querySelector('.task-chips');
        this.fullscreenChipUpdatePending = false;
        this.fullscreenChipAnimations = new WeakMap();
        this.notificationStatus = document.querySelector('#notificationStatus');
        // Data storage elements
        this.selectDataFolderButton = document.querySelector('#selectDataFolderButton');
        this.clearSelectedFolderButton = document.querySelector('#clearSelectedFolderButton');
        this.currentStorageStatus = document.querySelector('#currentStorageStatus');

        // Theme elements
        this.autoThemeSwitch = document.querySelector('#autoThemeSwitch');
        this.currentThemeStatus = document.querySelector('#currentThemeStatus');
        this.currentThemeNameText = document.querySelector('#currentThemeNameText');
        this.currentThemeDescText = document.querySelector('#currentThemeDescText');
        this.currentThemeModeText = document.querySelector('#currentThemeModeText');
        this.manualThemeSelection = document.querySelector('#manualThemeSelection');
        const themeGroup = this.manualThemeSelection.querySelector('m3e-radio-group');
        const themes = Object.values(COLOR_THEMES);
        themeGroup.innerHTML = themes.map(({ id, name, seed }) => `
            <label class="theme-option">
                <m3e-radio class="theme-option-control" value="${id}" aria-labelledby="theme-label-${id}"></m3e-radio>
                <span class="theme-swatch" style="background-color: ${seed}" aria-hidden="true"></span>
                <span id="theme-label-${id}">${name}</span>
            </label>
        `).join('');
        this.themeOptions = themeGroup.querySelectorAll('m3e-radio');
        document.querySelector('#themeSchedule').textContent = themes.map(({ name, timeRange: [start, end] }) =>
            `${name}（${start}–${end} 时）`
        ).join('、');
        this.setupEventListeners();
        this.initializeState();
        // 通知 appState，UI 的通知监听器已就绪，可以派发积压的通知
        appState.markNotificationListenersReady();
    }

    setupEventListeners() {
        // Task management
        this.addTaskButton.addEventListener('click', () => this.addTask());
        this.newTaskInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.addTask();
            }
        });        // Activity controls
        this.startRestButton.addEventListener('click', () => this.startRest());
        this.stopActivityButton.addEventListener('click', () => this.stopCurrentActivity());
        this.clearHistoryButton.addEventListener('click', () => this.clearHistory());
        this.clearDataButton.addEventListener('click', () => this.clearAllData());
        // Data storage controls
        this.selectDataFolderButton.addEventListener('click', () => this.selectDataFolder());
        this.clearSelectedFolderButton.addEventListener('click', () => this.clearSelectedFolder());

        // Theme controls
        this.autoThemeSwitch.addEventListener('change', (e) => this.toggleThemeMode(e.target.checked));
        this.themeOptions.forEach(radio => {
            radio.addEventListener('change', () => {
                if (radio.checked) this.selectManualTheme(radio.value);
            });
        });

        // Listen for theme changes
        document.addEventListener(MFPT_EVENTS.THEME_CHANGED, (e) => this.updateThemeStatus(e.detail));

        // Fullscreen mode
        this.fullscreenToggle.addEventListener('click', () => this.toggleFullscreen());
        document.addEventListener('keydown', (e) => {
            if (e.defaultPrevented || e.isComposing) return;
            if (e.key === 'Escape' && this.fullscreenMode.classList.contains('active')) {
                e.preventDefault();
                this.toggleFullscreen({ exitOnly: true });
            } else if (e.altKey && (e.key === 'f' || e.key === 'F')) {
                e.preventDefault();
                this.toggleFullscreen();
            }
        });

        // 让鼠标滚轮横向滚动 chips，避免显示滚动条
        this.taskChips?.addEventListener('wheel', (e) => {
            if (!e.ctrlKey && this.taskChips.scrollWidth > this.taskChips.clientWidth &&
                Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
                e.preventDefault();
                this.taskChips.scrollLeft += e.deltaY;
            }
        }, { passive: false });

        // Task list delegation
        this.taskList.addEventListener('click', async (e) => {
            const deleteButton = findClosestInComposedPath(e, '.task-delete-button');
            if (deleteButton) {
                e.preventDefault();
                e.stopPropagation();
                const taskId = deleteButton.getAttribute('data-task-id');
                if (taskId) {
                    await this.deleteTask(taskId);
                }
                return;
            }

            if (findClosestInComposedPath(e, '.task-important-button')) return;

            const taskItem = findClosestInComposedPath(e, 'm3e-list-item[data-task-id]');
            if (taskItem) {
                const taskId = taskItem.getAttribute('data-task-id');
                if (taskId) {
                    await this.startTask(taskId);
                }
            }
        });

        // Visibility change
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                this.updateUI();
            }
        });

        window.addEventListener('resize', () => {
            this.updateUI();
        });

        // 展开热力图面板后重绘图表
        this.heatmapPanel?.addEventListener('opened', () => {
            setTimeout(() => {
                Charts.workloadHeatmap?.resize();
                Charts.updateHeatmap();
            }, 120);
        });

        // 监听日期更改事件
        document.addEventListener('dateChange', (e) => {
            this.calculateAndRenderMetrics();
        });

        // 日志懒加载滚动监听
        this.historyLogDiv?.addEventListener('scroll', () => this.handleHistoryScroll());

        // Timer settings
        this.reminderMinutesInput.addEventListener('change', () => {
            const value = parseInt(this.reminderMinutesInput.value);
            if (value > 0) {
                appState.updateTimerSettings({ reminderMinutes: value });
            } else {
                // 恢复保存的值
                const settings = appState.getTimerSettings();
                this.reminderMinutesInput.value = settings.reminderMinutes;
            }
        });

        this.timeoutMinutesInput.addEventListener('change', () => {
            const value = parseInt(this.timeoutMinutesInput.value);
            if (value > 0) {
                appState.updateTimerSettings({ timeoutMinutes: value });
            } else {
                // 恢复保存的值
                const settings = appState.getTimerSettings();
                this.timeoutMinutesInput.value = settings.timeoutMinutes;
            }
        });

        // 开关状态变化处理
        this.reminderEnabledInput.addEventListener('change', () => {
            const checked = this.reminderEnabledInput.checked;
            appState.updateTimerSettings({ reminderEnabled: checked });
            this.updateSettingsState();
        });

        this.timeoutEnabledInput.addEventListener('change', () => {
            const checked = this.timeoutEnabledInput.checked;
            appState.updateTimerSettings({ timeoutEnabled: checked });
            this.updateSettingsState();
        });

        // 监听通知事件（统一改为 M3E snackbar）
        document.addEventListener('mfpt:notification', (event) => {
            const { title, message } = event.detail;
            this.showSnackbar(`${title}: ${message}`);
        });

        // 监听任务停止事件 - 添加这个监听器来响应任务自动停止事件
        document.addEventListener('mfpt:taskStopped', (event) => {
            console.log('收到任务停止事件:', event.detail);
            // 更新UI界面
            this.renderTasks();
            this.updateUI();
            this.updatePageTitle();
        });

        // 监听活动日志展开/折叠
        this.historyPanel?.addEventListener('opened', () => {
            this.renderHistory({ reset: true });
        });
        this.historyPanel?.addEventListener('closed', () => {
            this.historyLogDiv.innerHTML = '';
        });

        // 监听数据位置变更事件
        document.addEventListener('mfpt:dataLocationChanged', () => {
            console.log('收到数据位置变更事件');
            this.updateStorageStatus();
            this.renderTasks();
            this.updateUI();
        });
    }

    initializeState() {
        // 初始化定时器设置
        const settings = appState.getTimerSettings();
        this.reminderMinutesInput.value = settings.reminderMinutes;
        this.timeoutMinutesInput.value = settings.timeoutMinutes;
        this.reminderEnabledInput.checked = settings.reminderEnabled;
        this.timeoutEnabledInput.checked = settings.timeoutEnabled;
        this.updateSettingsState();

        this.renderTasks();
        this.renderHistory({ reset: true }); // 确保这一行存在且被调用
        this.calculateAndRenderMetrics();
        this.updateCurrentActivityDisplay();
        this.updateNotificationStatus();
        this.updateStorageStatus();
        this.initializeThemeState();
    }

    updateSettingsState() {
        // 更新提醒时间输入框状态
        if (this.reminderEnabledInput.checked) {
            this.reminderMinutesInput.disabled = false;
        } else {
            this.reminderMinutesInput.disabled = true;
        }

        // 更新超时时间输入框状态
        if (this.timeoutEnabledInput.checked) {
            this.timeoutMinutesInput.disabled = false;
        } else {
            this.timeoutMinutesInput.disabled = true;
        }
    }

    resetHistoryPagination() {
        this.historyPage = 0;
        this.historyHasMore = true;
        this.historyLoading = false;
        if (this.historyLogDiv) {
            this.historyLogDiv.innerHTML = '';
        }
    }

    handleHistoryScroll() {
        if (!this.historyHasMore || this.historyLoading) return;
        if (!this.historyLogDiv) return;
        const threshold = 40;
        const nearBottom = this.historyLogDiv.scrollTop + this.historyLogDiv.clientHeight >= this.historyLogDiv.scrollHeight - threshold;
        if (nearBottom) {
            this.loadMoreHistory();
        }
    }

    isHistoryPanelOpen() {
        return Boolean(this.historyPanel?.open);
    }

    sortHistoryEntries(history) {
        return [...history].sort((a, b) => {
            const timeCompare = b.timestamp - a.timestamp;
            if (timeCompare !== 0) return timeCompare;
            if (a.type.startsWith('stop') && b.type.startsWith('start')) return -1;
            if (a.type.startsWith('start') && b.type.startsWith('stop')) return 1;
            return 0;
        });
    }

    appendHistoryEntries(entries) {
        entries.forEach(entry => {
            const p = document.createElement('p');
            p.className = 'log-entry';
            const time = new Date(entry.timestamp).toLocaleTimeString();
            let icon = '';
            switch (entry.type) {
                case 'start':
                    icon = 'play_arrow';
                    break;
                case 'stop':
                    icon = 'stop';
                    break;
                case 'start_rest':
                    icon = 'coffee';
                    break;
                case 'stop_rest':
                    icon = 'coffee';
                    break;
                default:
                    icon = 'info';
            }

            const actionText = entry.type.startsWith('start') ?
                (entry.type === 'start_rest' ? '开始休息' : '开始任务') :
                (entry.type === 'stop_rest' ? '结束休息' : '停止任务');

            p.innerHTML = `
                <span class="material-symbols-rounded">${icon}</span>
                <span>[${time}] ${actionText}: ${entry.taskName}</span>
            `;
            this.historyLogDiv.appendChild(p);
        });
    }

    loadHistoryScrollBottom() {
        if (!this.historyLogDiv) return;
        this.historyLogDiv.scrollTop = this.historyLogDiv.scrollHeight;
    }

    updateNotificationStatus() {
        if (!('Notification' in window)) {
            this.showNotificationStatus('warning', 'error', '你的浏览器不支持通知功能');
            return;
        }

        switch (Notification.permission) {
            case 'granted':
                this.showNotificationStatus('success', 'notifications_active', '通知功能已启用');
                break;
            case 'denied':
                this.showNotificationStatus('warning', 'notifications_off',
                    '通知权限已被禁用。要重新启用通知，请点击地址栏左侧的图标，然后允许通知权限。');
                break;
            case 'default':
                this.showNotificationStatus('info', 'notifications',
                    '尚未授予通知权限。点击"允许"以启用任务提醒功能。');
                // 尝试请求权限
                Notification.requestPermission().then(() => {
                    this.updateNotificationStatus();
                });
                break;
        }
    }

    showNotificationStatus(type, icon, message) {
        this.notificationStatus.className = `notification-status ${type}`;
        this.notificationStatus.innerHTML = `
            <span class="material-symbols-rounded">${icon}</span>
            <span class="status-text">${message}</span>
        `;
    }

    // UI update methods
    updateUI() {
        this.updateCurrentActivityDisplay();
        this.calculateAndRenderMetrics();
        this.renderHistory({ reset: true }); // 增加这行，确保活动日志随状态更新
        Charts.updateGanttChart();
        this.updateFullscreenDisplay();
    }

    getMotionMs(variableName, fallbackMs) {
        const value = getComputedStyle(document.documentElement).getPropertyValue(variableName).trim();
        const match = value.match(/([\d.]+)ms/i);
        if (match) {
            const parsed = Number.parseFloat(match[1]);
            if (Number.isFinite(parsed)) return parsed;
        }
        return fallbackMs;
    }

    getMotionEasing(variableName, fallback) {
        const value = getComputedStyle(document.documentElement).getPropertyValue(variableName).trim();
        return value || fallback;
    }

    shouldReduceMotion() {
        return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    // Task management methods
    addTask() {
        const taskName = this.newTaskInput.value.trim();
        if (taskName === '') {
            this.showSnackbar('请输入任务名称。');
            this.newTaskInput.focus();
            return;
        }
        appState.addTask(taskName);
        this.newTaskInput.value = '';
        this.renderTasks();
        this.renderHistory({ reset: true }); // 添加这行
    }

    async deleteTask(taskId) {
        if (!await this.confirmAction('删除任务？', '相关历史记录会保留。', '删除')) {
            return;
        }
        await appState.deleteTask(taskId);
        this.renderTasks();
        this.calculateAndRenderMetrics();
        this.renderHistory({ reset: true }); // 添加这行
    }

    startTask(taskId) {
        const tasks = appState.getTasks();
        const task = tasks.find(t => t.id === taskId);
        if (!task) return;

        appState.startTask(taskId, task.name, () => {
            this.updateCurrentActivityDisplay();
            this.renderTasks();
            this.calculateAndRenderMetrics();
            Charts.updateGanttChart();
        });
    }

    startRest() {
        appState.startTask(REST_ID, '休息', () => {
            this.updateCurrentActivityDisplay();
            this.renderTasks();
            this.calculateAndRenderMetrics();
            Charts.updateGanttChart();
        });
    }

    stopCurrentActivity() {
        const activeEntry = appState.getActiveEntry();
        if (!activeEntry) return;

        appState.stopTask(activeEntry.taskId);
        this.renderTasks(); // 添加这行来重新渲染任务列表，清除选中状态
        this.updateUI();
    }

    async clearHistory() {
        if (!await this.confirmAction('清除历史记录？', '这将清空所有活动记录，任务列表会保留。', '清除')) return;
        await appState.clearHistory();
        this.updateUI();
    }

    async clearAllData() {
        if (!await this.confirmAction('清除所有数据？', '这将永久清除任务和活动记录，统计信息也会随之清空。', '清除')) return;
        await appState.clearAllData();
        this.updateUI();
        this.startRest(); // 自动开始休息模式
    }

    captureTaskListState() {
        if (!this.taskList) return null;

        const state = new Map();
        this.taskList.querySelectorAll('m3e-list-item[data-task-id]').forEach((item) => {
            const taskId = item.getAttribute('data-task-id');
            if (!taskId) return;
            state.set(taskId, item.hasAttribute('data-active'));
        });
        return state;
    }

    animateTaskListSelection(previousState) {
        if (!previousState || previousState.size === 0 || this.shouldReduceMotion()) return;

        const duration = this.getMotionMs('--md-sys-motion-duration-short-4', 200) + 40;
        const easing = this.getMotionEasing('--md-sys-motion-easing-emphasized', 'cubic-bezier(0.2, 0, 0, 1)');

        this.taskList.querySelectorAll('m3e-list-item[data-task-id]').forEach((item) => {
            const taskId = item.getAttribute('data-task-id');
            if (!taskId) return;

            const previous = previousState.get(taskId);
            const selectedNow = item.hasAttribute('data-active');
            if (previous === undefined || previous === selectedNow) return;

            item.animate([
                {
                    transform: selectedNow ? 'scale(0.988, 0.985)' : 'scale(1)',
                    opacity: 0.98
                },
                {
                    transform: selectedNow ? 'scale(1)' : 'scale(0.996, 0.992)',
                    opacity: 1
                },
                {
                    transform: 'scale(1, 1)',
                    opacity: 1
                }
            ], {
                duration,
                easing
            });
        });
    }

    // Rendering methods
    renderTasks() {
        const previousTaskListState = this.captureTaskListState();
        const tasks = appState.getTasks();
        const activeEntry = appState.getActiveEntry();

        let list = this.taskList.querySelector('m3e-list.m3e-task-list');
        if (!list) {
            this.taskList.innerHTML = '';
            list = document.createElement('m3e-list');
            list.className = 'm3e-task-list';
            list.setAttribute('aria-label', '任务列表');
            list.setAttribute('variant', 'segmented');
            this.taskList.appendChild(list);
        }

        const existingItems = new Map();
        list.querySelectorAll('m3e-list-item[data-task-id]').forEach((item) => {
            existingItems.set(item.getAttribute('data-task-id'), item);
        });

        let nextItem = list.firstElementChild;
        tasks.forEach((task) => {
            const taskItem = existingItems.get(task.id) || this.createTaskListItem(task.id);
            existingItems.delete(task.id);
            this.updateTaskListItem(taskItem, task, activeEntry?.taskId === task.id);

            if (taskItem === nextItem) {
                nextItem = taskItem.nextElementSibling;
            } else {
                list.insertBefore(taskItem, nextItem);
            }
        });

        existingItems.forEach((item) => item.remove());

        requestAnimationFrame(() => {
            this.animateTaskListSelection(previousTaskListState);
        });
    }

    createTaskListItem(taskId) {
        const taskItem = document.createElement('m3e-list-item');
        taskItem.className = 'm3e-task-list-item';
        taskItem.dataset.taskId = taskId;
        taskItem.innerHTML = `
            <m3e-button variant="text" class="task-start-button"><span></span></m3e-button>
            <m3e-icon-button slot="trailing" variant="standard" size="small" toggle class="task-important-button">
                <m3e-icon variant="rounded" name="star"></m3e-icon>
            </m3e-icon-button>
            <m3e-icon-button slot="trailing" variant="standard" size="small" class="task-delete-button">
                <m3e-icon variant="rounded" name="delete"></m3e-icon>
            </m3e-icon-button>
        `;
        taskItem.querySelector('.task-delete-button').dataset.taskId = taskId;
        const importantButton = taskItem.querySelector('.task-important-button');
        importantButton.addEventListener('beforeinput', (event) => {
            if (importantButton.hasAttribute('aria-busy')) event.preventDefault();
        });
        importantButton.addEventListener('change', async () => {
            importantButton.setAttribute('aria-busy', 'true');
            try {
                await appState.setTaskImportant(taskId, importantButton.selected);
            } catch (error) {
                console.error('保存任务星标失败', error);
                this.showSnackbar('无法保存任务星标，请重试。');
            } finally {
                importantButton.removeAttribute('aria-busy');
                this.renderTasks();
            }
        });
        return taskItem;
    }

    updateTaskListItem(taskItem, task, active) {
        taskItem.toggleAttribute('data-active', active);
        const start = taskItem.querySelector('.task-start-button');
        const label = start.querySelector('span');
        if (label.textContent !== task.name) label.textContent = task.name;
        if (active) {
            start.setAttribute('aria-current', 'true');
        } else {
            start.removeAttribute('aria-current');
        }

        const important = taskItem.querySelector('.task-important-button');
        if (!important.hasAttribute('aria-busy')) important.selected = task.important === true;
        important.setAttribute('aria-label', `标记重要任务 ${task.name}`);
        important.title = important.selected ? '取消星标' : '添加星标';
        taskItem.querySelector('.task-delete-button').setAttribute('aria-label', `删除任务 ${task.name}`);
    }

    async loadMoreHistory() {
        if (!this.isHistoryPanelOpen()) return;
        if (this.historyLoading || !this.historyHasMore) return;

        this.historyLoading = true;

        const offset = this.historyPage * this.historyPageSize;
        const history = appState.getHistory({
            newestFirst: true,
            limit: this.historyPageSize,
            offset
        });
        const sortedHistory = this.sortHistoryEntries(history);

        if (sortedHistory.length === 0) {
            this.historyHasMore = false;
            this.historyLoading = false;
            return;
        }

        this.appendHistoryEntries(sortedHistory);
        this.historyPage += 1;
        // 如果本次不足一整页，说明已经到底
        this.historyHasMore = sortedHistory.length === this.historyPageSize;
        this.historyLoading = false;

        if (this.historyPage === 1) {
            // 初次加载保持在列表底部，避免跳动
            this.loadHistoryScrollBottom();
        }
    }

    renderHistory({ reset = false } = {}) {
        if (!this.isHistoryPanelOpen()) {
            this.historyLogDiv.innerHTML = '';
            return;
        }

        if (reset) {
            this.resetHistoryPagination();
        }

        if (!this.historyLogDiv.children.length) {
            // 初次或重置时加载第一页
            this.loadMoreHistory();
        }
    }

    calculateAndRenderMetrics() {
        this.taskMetricsDiv.innerHTML = '';
        const selectedDate = Charts.datePicker?.valueAsDate || new Date();
        const startOfDay = new Date(selectedDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(selectedDate);
        endOfDay.setHours(23, 59, 59, 999);

        const history = appState.getHistory();
        const dayHistory = history.filter(record => {
            const recordDate = new Date(record.timestamp);
            return recordDate >= startOfDay && recordDate <= endOfDay;
        });

        const taskTimes = {};
        let totalRestMs = 0;
        const sortedHistory = [...dayHistory].sort((a, b) => a.timestamp - b.timestamp);
        let currentStarts = {};

        sortedHistory.forEach(entry => {
            if (entry.type === 'start' || entry.type === 'start_rest') {
                currentStarts[entry.taskId] = entry.timestamp;
            } else if (entry.type === 'stop' || entry.type === 'stop_rest') {
                const startTime = currentStarts[entry.taskId];
                if (startTime) {
                    const duration = entry.timestamp - startTime;
                    if (entry.taskId === REST_ID) {
                        totalRestMs += duration;
                    } else {
                        taskTimes[entry.taskId] = (taskTimes[entry.taskId] || 0) + duration;
                    }
                    delete currentStarts[entry.taskId];
                }
            }
        });

        const activeEntry = appState.getActiveEntry();
        if (activeEntry &&
            new Date(activeEntry.startTime) >= startOfDay &&
            new Date(activeEntry.startTime) <= endOfDay) {
            const durationSoFar = Date.now() - activeEntry.startTime;
            if (activeEntry.taskId === REST_ID) {
                totalRestMs += durationSoFar;
            } else {
                taskTimes[activeEntry.taskId] = (taskTimes[activeEntry.taskId] || 0) + durationSoFar;
            }
        }

        const hasTaskData = Object.values(taskTimes).some(time => time > 0);
        const hasRestData = totalRestMs > 0;

        if (!hasTaskData && !hasRestData) {
            const noDataDiv = document.createElement('div');
            noDataDiv.textContent = '当前日期没有任务记录';
            noDataDiv.className = 'text-center text-on-surface-variant dark:text-on-surface-variant-dark py-4';
            this.taskMetricsDiv.appendChild(noDataDiv);
            return;
        }

        const totalTimeMs = totalRestMs + Object.values(taskTimes).reduce((sum, time) => sum + time, 0);

        if (hasRestData || hasTaskData) {
            const restPercent = totalTimeMs > 0 ? (totalRestMs / totalTimeMs * 100) : 0;
            const restItemContainer = document.createElement('div');
            restItemContainer.className = 'metric-item-container';

            const restProgressBar = document.createElement('div');
            restProgressBar.className = 'metric-item-progress-bar';
            restProgressBar.style.width = `${restPercent}%`;

            const restContent = document.createElement('div');
            restContent.className = 'metric-item-content';
            restContent.textContent = `总休息时间: ${Timer.formatDuration(totalRestMs)}`;

            restItemContainer.appendChild(restProgressBar);
            restItemContainer.appendChild(restContent);
            this.taskMetricsDiv.appendChild(restItemContainer);
        }

        const tasks = appState.getTasks();
        const taskTimeArray = tasks
            .map(task => ({
                id: task.id,
                name: task.name,
                time: taskTimes[task.id] || 0,
                percent: totalTimeMs > 0 ? ((taskTimes[task.id] || 0) / totalTimeMs * 100) : 0
            }))
            .filter(taskTime => taskTime.time > 0)
            .sort((a, b) => b.time - a.time);

        taskTimeArray.forEach(taskTime => {
            const taskItemContainer = document.createElement('div');
            taskItemContainer.className = 'metric-item-container';

            const taskProgressBar = document.createElement('div');
            taskProgressBar.className = 'metric-item-progress-bar';
            taskProgressBar.style.width = `${taskTime.percent}%`;

            const taskContent = document.createElement('div');
            taskContent.className = 'metric-item-content';
            taskContent.textContent = `${taskTime.name}: ${Timer.formatDuration(taskTime.time)}`;

            taskItemContainer.appendChild(taskProgressBar);
            taskItemContainer.appendChild(taskContent);
            this.taskMetricsDiv.appendChild(taskItemContainer);
        });
    }

    updateCurrentActivityDisplay() {
        const activeEntry = appState.getActiveEntry();

        if (activeEntry) {
            this.currentTaskNameSpan.textContent = activeEntry.taskName;
            this.updatePageTitle(activeEntry.taskName);
            Timer.startTimer(activeEntry.startTime);
            this.stopActivityButton.disabled = false;
            this.startRestButton.disabled = activeEntry.taskId === REST_ID;        } else {
            this.currentTaskNameSpan.textContent = '-- 无活动 --';
            this.currentTimerSpan.textContent = '00:00:00';
            this.updatePageTitle(); // 恢复默认标题
            Timer.stopTimer();
            this.stopActivityButton.disabled = true;
            this.startRestButton.disabled = false;
        }

        Charts.updateGanttChart();

        if (this.fullscreenMode.classList.contains('active')) {
            this.renderTaskChips();
            this.updateFullscreenDisplay();
        }
    }

    updateFullscreenDisplay() {
        if (!this.fullscreenMode.classList.contains('active')) return;

        const timeStr = this.currentTimerSpan.textContent || '00:00:00';
        if (window.innerWidth <= 768) {
            const [hours, minutes, seconds] = timeStr.split(':');
            this.fullscreenTimer.innerHTML = `${hours}:<br>${minutes}:<br>${seconds}`;
        } else {
            this.fullscreenTimer.textContent = timeStr;
        }
    }

    captureFullscreenChipWidths() {
        const widths = new Map();
        for (const chip of this.taskChips.querySelectorAll('m3e-filter-chip')) {
            widths.set(chip, {
                width: parseFloat(getComputedStyle(chip).width),
                selected: chip.hasAttribute('selected')
            });
        }
        return widths;
    }

    animateFullscreenChipWidths(previousWidths) {
        if (this.shouldReduceMotion()) return;

        const changed = [...previousWidths].filter(([chip, previous]) =>
            chip.isConnected && chip.hasAttribute('selected') !== previous.selected);
        if (!changed.length) return;

        const duration = this.getMotionMs('--mf-motion-duration-short', 200);
        const easing = this.getMotionEasing('--mf-motion-easing-standard', 'cubic-bezier(0.2, 0, 0, 1)');

        for (const [chip] of changed) this.fullscreenChipAnimations.get(chip)?.cancel();
        const targets = changed.map(([chip]) => parseFloat(getComputedStyle(chip).width));

        changed.forEach(([chip, previous], index) => {
            const target = targets[index];
            if (!previous.width || !target || Math.abs(previous.width - target) < 0.5) return;

            const animation = chip.animate([
                { width: `${previous.width}px` },
                { width: `${target}px` }
            ], { duration, easing });
            this.fullscreenChipAnimations.set(chip, animation);
        });
    }

    renderTaskChips() {
        // A task switch can render both the stopped and started states before the same paint.
        if (!this.fullscreenChipUpdatePending) {
            const previousWidths = this.captureFullscreenChipWidths();
            this.fullscreenChipUpdatePending = true;
            queueMicrotask(async () => {
                const chips = Array.from(this.taskChips.querySelectorAll('m3e-filter-chip'));
                await Promise.all(chips.map(chip => chip.updateComplete));
                this.fullscreenChipUpdatePending = false;
                this.animateFullscreenChipWidths(previousWidths);
            });
        }

        const activeEntry = appState.getActiveEntry();
        const switchTask = (event) => {
            const chip = event.currentTarget;
            const taskId = chip.dataset.taskId;
            if (appState.getActiveEntry()?.taskId === taskId) {
                chip.selected = true;
                return;
            }
            if (!chip.selected) return;
            if (taskId === REST_ID) {
                this.startRest();
            } else {
                this.startTask(taskId);
            }
        };

        let chipSet = this.taskChips.querySelector('.fullscreen-chip-set');
        if (!chipSet) {
            chipSet = document.createElement('m3e-filter-chip-set');
            chipSet.className = 'fullscreen-chip-set';
            chipSet.setAttribute('aria-label', '全屏任务快速切换');
            this.taskChips.appendChild(chipSet);
        }

        const tasks = [{ id: REST_ID, name: '休息' }, ...appState.getTasks()];
        const existingChips = new Map(Array.from(chipSet.children, chip => [chip.dataset.taskId, chip]));
        let nextChip = chipSet.firstElementChild;
        for (const { id, name } of tasks) {
            let chip = existingChips.get(id);
            if (chip) {
                existingChips.delete(id);
            } else {
                chip = document.createElement('m3e-filter-chip');
                chip.dataset.taskId = id;
                if (id === REST_ID) {
                    chip.className = 'rest-chip';
                    const icon = document.createElement('m3e-icon');
                    icon.setAttribute('slot', 'trailing-icon');
                    icon.setAttribute('variant', 'rounded');
                    icon.setAttribute('name', 'coffee');
                    chip.appendChild(icon);
                }
                const label = document.createElement('span');
                label.className = 'block overflow-hidden text-clip';
                chip.appendChild(label);
                chip.addEventListener('change', switchTask);
            }
            if (chip.lastChild.textContent !== name) chip.lastChild.textContent = name;
            chip.selected = activeEntry?.taskId === id;

            if (chip === nextChip) {
                nextChip = chip.nextElementSibling;
            } else {
                chipSet.insertBefore(chip, nextChip);
            }
        }
        existingChips.forEach(chip => chip.remove());
    }

    toggleFullscreen({ exitOnly = false } = {}) {
        const entering = !this.fullscreenMode.classList.contains('active');
        if (exitOnly) {
            if (entering || this.fullscreenMode.classList.contains('leaving')) return;
        } else if (this.fullscreenTransitioning) {
            return;
        }

        const body = document.body;
        const duration = this.shouldReduceMotion() ? 0 : this.getMotionMs('--md-sys-motion-duration-medium-2', 300);

        this.fullscreenTransitioning = true;
        if (this.fullscreenTransitionTimer) {
            clearTimeout(this.fullscreenTransitionTimer);
            this.fullscreenTransitionTimer = null;
        }

        body.classList.remove('fullscreen-entering', 'fullscreen-leaving');
        if (entering) {
            body.classList.add('fullscreen-active', 'fullscreen-entering');
            this.fullscreenMode.classList.remove('leaving');
            this.fullscreenMode.classList.add('active');
            this.fullscreenToggle.querySelector('m3e-icon').name = 'fullscreen_exit';
            this.fullscreenToggle.setAttribute('aria-label', '退出全屏专注模式');
            this.renderTaskChips();
            this.updateFullscreenDisplay();
        } else {
            body.classList.add('fullscreen-leaving');
            this.fullscreenMode.classList.add('leaving');
            this.fullscreenToggle.querySelector('m3e-icon').name = 'fullscreen';
            this.fullscreenToggle.setAttribute('aria-label', '进入全屏专注模式');
            if (this.fullscreenMode.contains(document.activeElement)) {
                this.fullscreenToggle.focus({ preventScroll: true });
            }
        }

        const settle = () => {
            body.classList.remove('fullscreen-entering', 'fullscreen-leaving');
            if (!entering) {
                this.fullscreenMode.classList.remove('leaving');
                this.fullscreenMode.classList.remove('active');
                body.classList.remove('fullscreen-active');
            }
            this.fullscreenTransitioning = false;
            this.fullscreenTransitionTimer = null;
        };

        if (duration <= 0) {
            settle();
            return;
        }
        this.fullscreenTransitionTimer = setTimeout(settle, duration + 32);
    }

    updatePageTitle(taskName) {
        document.title = taskName ? `MFPT - ${taskName}` : 'Mixed-Flow Production Timer';
    }

    showSnackbar(message, options = {}) {
        const { action = '', dismissible = false, actionCallback = null, duration = 3000 } = options;
        if (globalThis.M3eSnackbar?.open) {
            if (action) {
                globalThis.M3eSnackbar.open(message, action, dismissible, { actionCallback, duration });
            } else {
                globalThis.M3eSnackbar.open(message, dismissible, { duration });
            }
            return;
        }
        // 兜底：保持在组件未注册时也能给出可见反馈
        alert(message);
    }

    async confirmAction(title, message, action) {
        const dialog = document.querySelector('#confirmationDialog');
        if (dialog.open) return false;

        dialog.querySelector('[slot="header"]').textContent = title;
        dialog.querySelector('.confirmation-message').textContent = message;
        dialog.querySelector('[return-value="confirm"]').textContent = action;
        dialog.returnValue = '';

        return new Promise((resolve) => {
            dialog.addEventListener('closed', () => resolve(dialog.returnValue === 'confirm'), { once: true });
            dialog.open = true;
        });
    }

    showNotification(title, message) {
        console.log(`发送通知: ${title} - ${message}`);

        // 统一走通知事件，由监听器通过 M3E snackbar 呈现
        document.dispatchEvent(new CustomEvent('mfpt:notification', {
            detail: { title, message, timestamp: Date.now() }
        }));
    }

    // Data storage methods
    async selectDataFolder() {
        try {
            // 检查浏览器是否支持File System Access API
            if (!('showDirectoryPicker' in window)) {
                this.showSnackbar('此浏览器无法选择本地文件夹。', { duration: 5000 });
                return;
            }

            // 显示文件夹选择对话框
            const folderHandle = await window.showDirectoryPicker();

            // 设置数据文件夹
            await appState.setDataFolder(folderHandle);

            // 更新UI状态
            this.updateStorageStatus();

            // 显示成功通知
            this.showNotification('存储设置', `已成功切换到本地文件夹存储：${folderHandle.name}`);

            // 刷新页面以确保后续读写都指向新选择的文件夹
            setTimeout(() => {
                window.location.reload();
            }, 300);
        } catch (error) {
            if (error.name === 'AbortError') {
                // 用户取消了文件夹选择，不显示错误
                return;
            }
            console.error('选择数据文件夹时出错:', error);
            this.showSnackbar('选择文件夹时出现错误，请重试。');
        }
    }

    async clearSelectedFolder() {
        try {
            // 询问用户确认
            if (!await this.confirmAction('恢复默认存储？', '应用将使用浏览器内部存储。现有的本地文件会保留。', '恢复默认')) {
                return;
            }

            // 清除文件夹句柄
            await appState.setDataFolder(null);

            // 更新UI状态
            this.updateStorageStatus();

            // 显示成功通知
            this.showNotification('存储设置', '已恢复到浏览器内部存储');
        } catch (error) {
            console.error('恢复默认存储时出错:', error);
            this.showSnackbar('恢复默认存储时出现错误，请重试。');
        }
    }

    updateStorageStatus() {
        const folderHandle = appState.getDataFolderHandle();

        if (folderHandle) {
            this.currentStorageStatus.className = 'notification-status success';
            this.currentStorageStatus.innerHTML = `
                <span class="material-symbols-rounded">folder</span>
                <span class="status-text">当前存储: 本地文件夹 (${folderHandle.name})</span>
            `;
        } else {
            this.currentStorageStatus.className = 'notification-status info';
            this.currentStorageStatus.innerHTML = `
                <span class="material-symbols-rounded">database</span>
                <span class="status-text">当前存储: 浏览器内部存储</span>
            `;
        }
    }

    // Theme management methods
    initializeThemeState() {
        const themeInfo = themeManager.getThemeInfo();
        this.updateThemeStatus({ theme: themeInfo.currentTheme, mode: themeInfo.themeMode });
    }

    toggleThemeMode(isAuto) {
        const mode = isAuto ? 'auto' : 'manual';
        themeManager.setThemeMode(mode);
        this.updateManualThemeSelection();
    }

    selectManualTheme(themeId) {
        if (!this.autoThemeSwitch.checked) {
            themeManager.setManualTheme(themeId);
        }
    }

    updateThemeStatus(detail) {
        const { theme, mode } = detail;

        // 更新主题名称和描述
        this.currentThemeNameText.textContent = theme.name;
        this.currentThemeDescText.textContent = theme.description;

        // 更新模式文本
        this.currentThemeModeText.textContent = mode === 'auto' ? '自动模式' : '手动模式';

        // 更新开关状态（如果需要）
        if (this.autoThemeSwitch.checked !== (mode === 'auto')) {
            this.autoThemeSwitch.checked = mode === 'auto';
        }

        this.updateManualThemeSelection();
        this.updateSelectedThemeOption(theme.id);
    }

    updateManualThemeSelection() {
        const isAuto = this.autoThemeSwitch.checked;
        this.manualThemeSelection.classList.toggle('is-hidden', isAuto);
        this.manualThemeSelection.setAttribute('aria-hidden', isAuto ? 'true' : 'false');
        this.manualThemeSelection.inert = isAuto;
    }

    updateSelectedThemeOption(themeId) {
        this.themeOptions.forEach(radio => {
            radio.checked = radio.value === themeId;
        });
    }

    // 显示应用更新通知
    showUpdateNotification(message) {
        // 移除已存在的更新通知
        const existingNotification = document.querySelector('.update-notification');
        if (existingNotification) {
            existingNotification.remove();
        }

        // 创建简洁的更新通知
        const notification = document.createElement('div');
        notification.className = 'update-notification fixed top-4 left-1/2 transform -translate-x-1/2 z-[2000] bg-primary dark:bg-primary-dark text-on-primary dark:text-on-primary-dark px-6 py-4 rounded-lg shadow-lg flex items-center gap-3';
        notification.innerHTML = `
            <m3e-icon variant="rounded" name="system_update"></m3e-icon>
            <span class="update-message text-sm font-medium" role="status"></span>
            <m3e-button variant="tonal" size="small" class="refresh-button">
                刷新
            </m3e-button>
            <m3e-icon-button variant="standard" size="small" class="close-button" aria-label="关闭更新提示">
                <m3e-icon variant="rounded" name="close"></m3e-icon>
            </m3e-icon-button>
        `;
        notification.querySelector('.update-message').textContent = message;

        document.body.appendChild(notification);

        // 添加事件监听器
        const refreshButton = notification.querySelector('.refresh-button');
        const closeButton = notification.querySelector('.close-button');

        refreshButton.addEventListener('click', () => {
            // 立即刷新页面
            window.location.reload();
        });

        closeButton.addEventListener('click', () => {
            notification.remove();
        });

        // 不自动移除，让用户自己决定何时刷新
    }
}

export default UI;
