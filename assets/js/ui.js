import Timer from './timer.js';
import Storage from './storage.js';
import Charts from './charts.js';
import appState from './core.js';
import { REST_ID } from './constants.js';

// 创建一个全局 UI 实例的引用，供其他模块使用
let uiInstance = null;

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
    static init() {
        const ui = new UI();
        Charts.init();
        
        // 监听停止任务事件
        document.addEventListener('mfpt:stopTask', (event) => {
            if (event.detail.taskId) {
                ui.stopCurrentActivity();
            }
        });
        
        // 注册Service Worker
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

        // 发布初始化完成事件
        document.dispatchEvent(new CustomEvent('mfpt:uiInitialized', { detail: { ui } }));
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
        
        // Timer settings elements
        this.reminderMinutesInput = document.querySelector('#reminderMinutes');
        this.timeoutMinutesInput = document.querySelector('#timeoutMinutes');
        this.reminderEnabledInput = document.querySelector('#reminderEnabled');
        this.timeoutEnabledInput = document.querySelector('#timeoutEnabled');

        // Fullscreen elements
        this.fullscreenMode = document.querySelector('.fullscreen-mode');
        this.fullscreenToggle = document.querySelector('.fullscreen-toggle');
        this.fullscreenTimer = document.querySelector('.fullscreen-mode .timer');
        this.taskChips = document.querySelector('.task-chips');

        this.notificationStatus = document.querySelector('#notificationStatus');

        this.setupEventListeners();
        this.initializeState();
    }

    setupEventListeners() {
        // Task management
        this.addTaskButton.addEventListener('click', () => this.addTask());
        this.newTaskInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.addTask();
            }
        });

        // Activity controls
        this.startRestButton.addEventListener('click', () => this.startRest());
        this.stopActivityButton.addEventListener('click', () => this.stopCurrentActivity());
        this.clearHistoryButton.addEventListener('click', () => this.clearHistory());
        this.clearDataButton.addEventListener('click', () => this.clearAllData());

        // Fullscreen mode
        this.fullscreenToggle.addEventListener('click', () => this.toggleFullscreen());
        document.addEventListener('keydown', (e) => {
            if (e.altKey && (e.key === 'f' || e.key === 'F')) {
                e.preventDefault();
                this.toggleFullscreen();
            }
        });

        // Task list delegation
        this.taskList.addEventListener('click', (e) => {
            const taskItem = e.target.closest('.task-item');
            const deleteButton = e.target.closest('.delete-button');
            
            if (deleteButton) {
                const taskId = deleteButton.getAttribute('data-task-id');
                this.deleteTask(taskId);
                e.stopPropagation();
            } else if (taskItem) {
                const taskId = taskItem.getAttribute('data-task-id');
                this.startTask(taskId);
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
        const toggleHeatmapBtn = document.querySelector('.toggle-heatmap');
        const heatmapSection = document.querySelector('.heatmap-section');
        
        toggleHeatmapBtn?.addEventListener('click', () => {
            const isCollapsed = heatmapSection.classList.contains('collapsed');
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
            
            toggleHeatmapBtn.querySelector('.material-symbols-rounded').textContent = 
                isCollapsed ? 'expand_less' : 'expand_more';
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
            }, 3000);
        });

        // 监听强制更新事件
        document.addEventListener('mfpt:forceUpdate', () => {
            console.log('收到强制更新事件');
            this.updateUI();
        });

        // 监听任务停止事件 - 添加这个监听器来响应任务自动停止事件
        document.addEventListener('mfpt:taskStopped', (event) => {
            console.log('收到任务停止事件:', event.detail);
            // 更新UI界面
            this.renderTasks();
            this.updateUI();
            this.updatePageTitle();
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
        this.renderHistory(); // 确保这一行存在且被调用
        this.calculateAndRenderMetrics();
        this.updateCurrentActivityDisplay();
        this.updateNotificationStatus();
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
    }

    startTask(taskId) {
        const tasks = appState.getTasks();
        const task = tasks.find(t => t.id === taskId);
        if (!task) return;

        // 先更新任务列表的视觉状态
        this.renderTasks();
        
        // 立即设置活动状态
        const allTasks = this.taskList.querySelectorAll('.task-item');
        allTasks.forEach(item => {
            if (item.getAttribute('data-task-id') === taskId) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        // 启动任务
        appState.startTask(taskId, task.name);
        this.updateUI();
        this.updatePageTitle(task.name);
    }

    startRest() {
        appState.startTask(REST_ID, '休息');
        this.renderTasks();
        this.updateUI();
        this.updatePageTitle('休息中');
    }

    stopCurrentActivity() {
        const activeEntry = appState.getActiveEntry();
        if (!activeEntry) return;

        appState.stopTask(activeEntry.taskId);
        this.renderTasks(); // 添加这行来重新渲染任务列表，清除选中状态
        this.updateUI();
        this.updatePageTitle();
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
            
            const taskName = document.createElement('span');
            taskName.textContent = task.name;
            
            const deleteButton = document.createElement('button');
            deleteButton.className = 'button-tonal delete-button';
            deleteButton.innerHTML = '<span class="material-symbols-rounded">delete</span>';
            deleteButton.setAttribute('data-task-id', task.id);
            
            taskItem.appendChild(taskName);
            taskItem.appendChild(deleteButton);
            this.taskList.appendChild(taskItem);
        });
    }

    renderHistory() {
        this.historyLogDiv.innerHTML = '';
        const history = appState.getHistory();
        const sortedHistory = [...history].sort((a, b) => {
            // 首先按时间戳倒序排列
            const timeCompare = b.timestamp - a.timestamp;
            if (timeCompare !== 0) return timeCompare;
            
            // 如果时间戳相同，确保"结束"事件排在"开始"事件之前
            if (a.type.startsWith('stop') && b.type.startsWith('start')) return -1;
            if (a.type.startsWith('start') && b.type.startsWith('stop')) return 1;
            return 0;
        });

        sortedHistory.forEach(entry => {
            const p = document.createElement('p');
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
        
        // 获取选中的日期
        const selectedDate = Charts.datePicker?.valueAsDate || new Date();
        const startOfDay = new Date(selectedDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(selectedDate);
        endOfDay.setHours(23, 59, 59, 999);

        // 筛选当天的历史记录
        const history = appState.getHistory();
        const dayHistory = history.filter(record => {
            const recordDate = new Date(record.timestamp);
            return recordDate >= startOfDay && recordDate <= endOfDay;
        });

        const taskTimes = {};
        let totalRestMs = 0;
        let totalTimeMs = 0;

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

        // 添加当前活动任务的时间（如果在选定日期内）
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

        // 计算总时间
        totalTimeMs = totalRestMs;
        Object.values(taskTimes).forEach(time => {
            totalTimeMs += time;
        });

        // 如果当天没有数据，显示提示信息
        if (totalTimeMs === 0) {
            const noDataDiv = document.createElement('div');
            noDataDiv.textContent = '当前日期没有任务记录';
            noDataDiv.style.textAlign = 'center';
            noDataDiv.style.color = getComputedStyle(document.documentElement)
                .getPropertyValue('--md-sys-color-on-surface-variant').trim();
            this.taskMetricsDiv.appendChild(noDataDiv);
            return;
        }

        // 渲染休息时间
        const restPercent = totalTimeMs > 0 ? (totalRestMs / totalTimeMs * 100) : 0;
        const restDiv = document.createElement('div');
        restDiv.textContent = `总休息时间: ${Timer.formatDuration(totalRestMs)}`;
        restDiv.style.setProperty('--progress', `${restPercent}%`);
        restDiv.style.setProperty('--bar-color', 'var(--md-sys-color-secondary)');
        this.taskMetricsDiv.appendChild(restDiv);

        // 渲染任务时间
        const tasks = appState.getTasks();
        const taskTimeArray = tasks.map(task => ({
            name: task.name,
            time: taskTimes[task.id] || 0,
            percent: totalTimeMs > 0 ? ((taskTimes[task.id] || 0) / totalTimeMs * 100) : 0
        })).sort((a, b) => b.time - a.time);

        taskTimeArray.forEach(taskTime => {
            const div = document.createElement('div');
            div.textContent = `${taskTime.name}: ${Timer.formatDuration(taskTime.time)}`;
            div.style.setProperty('--progress', `${taskTime.percent}%`);
            div.style.setProperty('--bar-color', 'var(--md-sys-color-primary)');
            this.taskMetricsDiv.appendChild(div);
        });
    }

    updateCurrentActivityDisplay() {
        const activeEntry = appState.getActiveEntry();
        
        if (activeEntry) {
            this.currentTaskNameSpan.textContent = activeEntry.taskName;
            Timer.startTimer(activeEntry.startTime);
            this.stopActivityButton.disabled = false;
            this.startRestButton.disabled = activeEntry.taskId === REST_ID;
        } else {
            this.currentTaskNameSpan.textContent = '-- 无活动 --';
            this.currentTimerSpan.textContent = '00:00:00';
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
            <div class="chip-content">
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
                <div class="chip-content">
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

    showNotification(message) {
        // 实现通知功能
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('生产计时器', { body: message });
        }
    }

    onStart() {
        document.dispatchEvent(new CustomEvent('timer:start'));
    }

    onStop() {
        document.dispatchEvent(new CustomEvent('timer:stop'));
    }

    onReset() {
        document.dispatchEvent(new CustomEvent('timer:reset'));
    }
}

export default UI;