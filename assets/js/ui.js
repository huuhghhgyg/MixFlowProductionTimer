import Timer from './timer.js';
import Charts from './charts.js';
import appState, { initializeAppState } from './core.js';
import { REST_ID } from './constants.js';
import themeManager from './theme-manager.js';

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
        // 首先初始化AppState，确保数据加载完成
        await initializeAppState();

        const ui = new UI();
        Charts.init();        // Service Worker注册移至这里// 注册Service Worker
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/service-worker.js')
                .then(registration => {
                    console.log('Service Worker registered:', registration);
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
        this.taskMetricsDiv = document.querySelector('#taskMetrics');
        this.clearHistoryButton = document.querySelector('#clearHistoryButton');
        this.clearDataButton = document.querySelector('#clearDataButton');
        this.toggleHistoryLogButton = document.querySelector('#toggleHistoryLogButton');

        // Timer settings elements
        this.reminderMinutesInput = document.querySelector('#reminderMinutes');
        this.timeoutMinutesInput = document.querySelector('#timeoutMinutes');
        this.reminderEnabledInput = document.querySelector('#reminderEnabled');
        this.timeoutEnabledInput = document.querySelector('#timeoutEnabled');

        // Fullscreen elements
        this.fullscreenMode = document.querySelector('.fullscreen-mode');
        this.fullscreenToggle = document.querySelector('.fullscreen-toggle');
        this.fullscreenToggleIcon = this.fullscreenToggle ? this.fullscreenToggle.querySelector('span') : null;
        this.fullscreenTimer = document.querySelector('.fullscreen-mode .timer');
        this.taskChips = document.querySelector('.task-chips'); this.notificationStatus = document.querySelector('#notificationStatus');
        // Data storage elements
        this.selectDataFolderButton = document.querySelector('#selectDataFolderButton');
        this.clearSelectedFolderButton = document.querySelector('#clearSelectedFolderButton');
        this.currentStorageStatus = document.querySelector('#currentStorageStatus');
        this.currentStorageLocationText = document.querySelector('#currentStorageLocationText');

        // Theme elements
        this.autoThemeSwitch = document.querySelector('#autoThemeSwitch');
        this.currentThemeStatus = document.querySelector('#currentThemeStatus');
        this.themeColorPreview = document.querySelector('#themeColorPreview');
        this.currentThemeNameText = document.querySelector('#currentThemeNameText');
        this.currentThemeDescText = document.querySelector('#currentThemeDescText');
        this.currentThemeModeText = document.querySelector('#currentThemeModeText');
        this.manualThemeSelection = document.querySelector('#manualThemeSelection');
        this.themeOptions = document.querySelectorAll('.theme-option');        this.setupEventListeners();
        this.initializeState();
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
        this.renderHistory();
        this.calculateAndRenderMetrics();
        this.updateCurrentActivityDisplay();
        this.updateNotificationStatus();
        this.updateStorageStatus();
        this.initializeThemeState();
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
        this.themeOptions.forEach(option => {
            option.addEventListener('click', (e) => {
                const themeId = e.currentTarget.getAttribute('data-theme');
                this.selectManualTheme(themeId);
            });
        });

        // Listen for theme changes
        document.addEventListener('mfpt:themeChanged', (e) => this.updateThemeStatus(e.detail));

        // Fullscreen mode
        this.fullscreenToggle.addEventListener('click', () => this.toggleFullscreen());
        document.addEventListener('keydown', (e) => {
            if (e.altKey && (e.key === 'f' || e.key === 'F')) {
                e.preventDefault();
                this.toggleFullscreen();
            }
        });

        // Task list delegation
        this.taskList.addEventListener('click', async (e) => { // Add async
            const taskItem = e.target.closest('.task-item');
            const deleteButton = e.target.closest('.delete-button');

            if (deleteButton) {
                const taskId = deleteButton.getAttribute('data-task-id');
                if (taskId) {
                    this.deleteTask(taskId);
                }
            } else if (taskItem) {
                const taskId = taskItem.getAttribute('data-task-id');
                if (taskId) {
                    // Ensure appState.activeEntry is set before UI updates that depend on it.
                    await this.startTask(taskId); // Add await
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

        // 监听热力图折叠/展开
        const toggleHeatmapBtn = document.querySelector('#toggleHeatmapButton');
        const heatmapSection = document.querySelector('#heatmapSection');

        toggleHeatmapBtn?.addEventListener('click', () => {
            let isCollapsed = heatmapSection.classList.contains('collapsed');
            if (isCollapsed) {
                // 展开热力图
                heatmapSection.classList.remove('collapsed');
                // 等待过渡动画完成后重绘热力图
                setTimeout(() => {
                    Charts.workloadHeatmap?.resize();
                    Charts.updateHeatmap();
                }, 300); // 等待过渡动画完成
            } else {
                // 折叠热力图
                heatmapSection.classList.add('collapsed');
            }
        });

        // 监听日期更改事件
        document.addEventListener('dateChange', (e) => {
            this.calculateAndRenderMetrics();
        });

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

        // 监听通知事件
        document.addEventListener('mfpt:notification', (event) => {
            const { title, message } = event.detail;
            // 创建一个内联通知
            const notification = document.createElement('div');
            notification.className = 'inline-notification';
            notification.innerHTML = `
                <span class="material-symbols-rounded">notifications</span>
                <div class="notification-content">
                    <strong>${title}</strong>
                    <p>${message}</p>
                </div>
            `;

            document.body.appendChild(notification);

            // 3秒后自动移除通知
            setTimeout(() => {
                notification.classList.add('fade-out');
                setTimeout(() => {
                    document.body.removeChild(notification);
                }, 300);
            }, 3000);        });

        // 监听任务停止事件 - 添加这个监听器来响应任务自动停止事件
        document.addEventListener('mfpt:taskStopped', (event) => {
            console.log('收到任务停止事件:', event.detail);
            // 更新UI界面
            this.renderTasks();
            this.updateUI();
            this.updatePageTitle();
        });        // 监听活动日志折叠/展开
        // const toggleLogBtn = document.querySelector('#toggleHistoryLogButton'); // Already in this.toggleHistoryLogButton
        const logSectionElement = document.querySelector('#historySection');

        if (this.toggleHistoryLogButton && logSectionElement) {
            this.toggleHistoryLogButton.addEventListener('click', () => {
                logSectionElement.classList.toggle('collapsed');
                // CSS will handle the icon rotation based on the .collapsed class
            });
        }

        // 监听数据位置变更事件
        document.addEventListener('mfpt:dataLocationChanged', () => {
            console.log('收到数据位置变更事件');
            this.updateStorageStatus();
            this.updateUI();
        });
    } initializeState() {
        // 初始化定时器设置
        const settings = appState.getTimerSettings();
        this.reminderMinutesInput.value = settings.reminderMinutes;
        this.timeoutMinutesInput.value = settings.timeoutMinutes;
        this.reminderEnabledInput.checked = settings.reminderEnabled;
        this.timeoutEnabledInput.checked = settings.timeoutEnabled;
        this.updateSettingsState();

        this.renderTasks();
        this.renderHistory(); // 确保这一行存在且被调用
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
        this.renderHistory(); // 增加这行，确保活动日志随状态更新
        Charts.updateGanttChart();
        this.updateFullscreenDisplay();
    }

    // Task management methods
    addTask() {
        const taskName = this.newTaskInput.value.trim();
        if (taskName === '') {
            alert('任务名称不能为空！');
            return;
        }
        appState.addTask(taskName);
        this.newTaskInput.value = '';
        this.renderTasks();
        this.renderHistory(); // 添加这行
    }

    deleteTask(taskId) {
        if (!confirm(`确定要删除此任务吗？相关历史记录会保留，但不再关联此任务。`)) {
            return;
        }
        appState.deleteTask(taskId);
        this.renderTasks();
        this.calculateAndRenderMetrics();
        this.renderHistory(); // 添加这行
    }      startTask(taskId) {
        const tasks = appState.getTasks();
        const task = tasks.find(t => t.id === taskId);
        if (!task) return;

        appState.startTask(taskId, task.name, () => {
            this.updateCurrentActivityDisplay();
            this.renderTasks();
            this.calculateAndRenderMetrics();
            Charts.updateGanttChart();
            this.renderTaskChips();  // 这个方法已经存在
        });
    }
        startRest() {
        appState.startTask(REST_ID, '休息', () => {
            this.updateCurrentActivityDisplay();
            this.renderTasks();
            this.calculateAndRenderMetrics();
            Charts.updateGanttChart();
            this.renderTaskChips();  // 这个方法已经存在
        });
    }    stopCurrentActivity() {
        const activeEntry = appState.getActiveEntry();
        if (!activeEntry) return;

        appState.stopTask(activeEntry.taskId);
        this.renderTasks(); // 添加这行来重新渲染任务列表，清除选中状态
        this.updateUI();
    }

    clearHistory() {
        if (confirm('确定要清除历史记录吗？此操作不会删除任务列表，但会清空所有活动记录。')) {
            appState.clearHistory(); // 使用新的clearHistory方法
            this.updateUI();
        }
    }

    clearAllData() {
        if (confirm('确定要清除所有数据吗？此操作将清除所有任务、历史记录和统计信息，且不可恢复。')) {
            appState.clearAllData();
            this.updateUI();
            this.startRest(); // 自动开始休息模式
        }
    }

    // Rendering methods
    renderTasks() {
        this.taskList.innerHTML = '';
        const tasks = appState.getTasks();
        const activeEntry = appState.getActiveEntry();

        tasks.forEach(task => {
            const taskItem = document.createElement('div');
            taskItem.className = 'task-item';
            if (activeEntry?.taskId === task.id) {
                taskItem.classList.add('active');
            }
            taskItem.setAttribute('data-task-id', task.id);

            const taskNameSpan = document.createElement('span');
            taskNameSpan.className = 'task-item-text';
            taskNameSpan.textContent = task.name;

            const deleteButton = document.createElement('button');
            deleteButton.setAttribute('aria-label', `Delete task ${task.name}`);
            deleteButton.innerHTML = '<span class="material-symbols-rounded">delete</span>';
            deleteButton.classList.add('delete-button');
            deleteButton.setAttribute('data-task-id', task.id);

            taskItem.appendChild(taskNameSpan);
            taskItem.appendChild(deleteButton);
            this.taskList.appendChild(taskItem);
        });
    }

    renderHistory() {
        this.historyLogDiv.innerHTML = '';
        const history = appState.getHistory();
        const sortedHistory = [...history].sort((a, b) => {
            const timeCompare = b.timestamp - a.timestamp;
            if (timeCompare !== 0) return timeCompare;
            if (a.type.startsWith('stop') && b.type.startsWith('start')) return -1;
            if (a.type.startsWith('start') && b.type.startsWith('stop')) return 1;
            return 0;
        }); 

        sortedHistory.forEach(entry => {
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

        this.historyLogDiv.scrollTop = this.historyLogDiv.scrollHeight;
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

    renderTaskChips() {
        this.taskChips.innerHTML = '';

        // Add rest chip
        const restChip = document.createElement('div');
        const activeEntry = appState.getActiveEntry();
        restChip.className = 'task-chip' + (activeEntry?.taskId === REST_ID ? ' active' : '');
        restChip.innerHTML = `
            <div class="chip-content flex items-center gap-2">
                <span class="material-symbols-rounded">coffee</span>
                <span class="chip-text">休息</span>
                ${activeEntry?.taskId === REST_ID ? '<span class="material-symbols-rounded check-icon">done</span>' : ''}
            </div>
        `;
        restChip.addEventListener('click', () => this.startRest());
        this.taskChips.appendChild(restChip);

        // Add task chips
        const tasks = appState.getTasks();
        tasks.forEach(task => {
            const chip = document.createElement('div');
            chip.className = 'task-chip' + (activeEntry?.taskId === task.id ? ' active' : '');
            chip.innerHTML = `
                <div class="chip-content flex items-center gap-2">
                    <span class="chip-text">${task.name}</span>
                    ${activeEntry?.taskId === task.id ? '<span class="material-symbols-rounded check-icon">done</span>' : ''}
                </div>
            `;
            chip.addEventListener('click', () => this.startTask(task.id));
            this.taskChips.appendChild(chip);
        });
    }

    toggleFullscreen() {
        const isFullscreen = this.fullscreenMode.classList.contains('active');
        this.fullscreenMode.classList.toggle('active');
        this.fullscreenToggle.querySelector('.material-symbols-rounded').textContent =
            isFullscreen ? 'fullscreen' : 'fullscreen_exit';

        if (!isFullscreen) {
            this.renderTaskChips();
            this.updateFullscreenDisplay();
        }
    }

    updatePageTitle(taskName) {
        document.title = taskName ? `MFPT - ${taskName}` : 'Mixed-Flow Production Timer';
    }

    // Rest of the existing class methods...

    updateTimer(duration) {
        this.timerDisplay.textContent = Timer.formatDuration(duration);
    }

    updateButtonStates(isRunning) {
        this.startButton.disabled = isRunning;
        this.stopButton.disabled = !isRunning;
        this.resetButton.disabled = isRunning;
    }

    updateProductList(products) {
        this.productList.innerHTML = '';
        products.forEach(product => {
            const li = document.createElement('li');
            li.className = 'product-item';
            li.innerHTML = `
                <span class="product-time">${Timer.formatTime(product.timestamp)}</span>
                <span class="product-duration">${Timer.formatDuration(product.duration)}</span>
            `;
            this.productList.appendChild(li);
        });
    }

    showNotification(title, message) {
        console.log(`发送通知: ${title} - ${message}`);

        // 触发自定义事件，用于显示内联通知
        document.dispatchEvent(new CustomEvent('mfpt:notification', {
            detail: { title, message, timestamp: Date.now() }
        }));

        // 创建一个内联通知元素并应用 Tailwind 类
        const notification = document.createElement('div');
        // 应用 Tailwind 类
        notification.className = 'inline-notification fixed bottom-6 right-6 p-4 bg-surface dark:bg-surface-dark text-on-surface dark:text-on-surface-dark rounded-md-medium shadow-md flex items-start gap-3 z-[1000] min-w-[280px] max-w-md';
        notification.innerHTML = `
            <span class="material-symbols-rounded text-primary dark:text-primary-dark text-2xl">notifications</span>
            <div class="notification-content flex-1">
                <strong class="block mb-1 text-on-surface dark:text-on-surface-dark">${title}</strong>
                <p class="m-0 text-sm text-on-surface-variant dark:text-on-surface-variant-dark">${message}</p>
            </div>
        `;

        document.body.appendChild(notification);

        // 3秒后自动移除通知
        setTimeout(() => {
            notification.classList.add('fade-out');
            setTimeout(() => {
                // Check if the element still exists before attempting to remove
                if (document.body.contains(notification)) {
                    document.body.removeChild(notification);
                }
            }, 300); // Match CSS animation duration
        }, 3000);

        // 尝试发送系统通知
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('生产计时器', { body: message });
        }
    }

    onStart() {
        document.dispatchEvent(new CustomEvent('timer:start'));
    }

    onStop() {
        document.dispatchEvent(new CustomEvent('timer:stop'));
    } onReset() {
        document.dispatchEvent(new CustomEvent('timer:reset'));
    }

    // Data storage methods
    async selectDataFolder() {
        try {
            // 检查浏览器是否支持File System Access API
            if (!('showDirectoryPicker' in window)) {
                alert('您的浏览器不支持文件系统访问功能。请使用最新版本的Chrome、Edge或其他支持的浏览器。');
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
        } catch (error) {
            if (error.name === 'AbortError') {
                // 用户取消了文件夹选择，不显示错误
                return;
            }
            console.error('选择数据文件夹时出错:', error);
            alert('选择文件夹时出现错误，请重试。');
        }
    }

    async clearSelectedFolder() {
        try {
            // 询问用户确认
            if (!confirm('确定要恢复默认存储吗？这将切换回浏览器内部存储，但不会删除现有的本地文件。')) {
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
            alert('恢复默认存储时出现错误，请重试。');
        }
    } updateStorageStatus() {
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
        this.autoThemeSwitch.checked = themeInfo.themeMode === 'auto';
        this.updateThemeStatus({ theme: themeInfo.currentTheme, mode: themeInfo.themeMode });
        this.updateManualThemeSelection();
    }

    toggleThemeMode(isAuto) {
        const mode = isAuto ? 'auto' : 'manual';
        themeManager.setThemeMode(mode);
        this.updateManualThemeSelection();
    }

    selectManualTheme(themeId) {
        if (!this.autoThemeSwitch.checked) {
            themeManager.setManualTheme(themeId);
            this.updateSelectedThemeOption(themeId);
        }
    } updateThemeStatus(detail) {
        const { theme, mode } = detail;

        // 更新主题预览颜色
        const isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        const colorScheme = isDark ? 'dark' : 'light';
        this.themeColorPreview.style.backgroundColor = theme.colors[colorScheme].primary;

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
        this.manualThemeSelection.style.display = isAuto ? 'none' : 'block';
    }

    updateSelectedThemeOption(themeId) {
        this.themeOptions.forEach(option => {
            const optionThemeId = option.getAttribute('data-theme');
            if (optionThemeId === themeId) {
                option.classList.add('selected');
                option.style.backgroundColor = 'var(--md-sys-color-primary-container)';
                option.style.borderColor = 'var(--md-sys-color-primary)';
            } else {
                option.classList.remove('selected');
                option.style.backgroundColor = '';
                option.style.borderColor = '';
            }
        });
    }
}

export default UI;