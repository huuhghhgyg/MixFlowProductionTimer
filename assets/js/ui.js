import Timer from './timer.js';
import Storage from './storage.js';
import Charts from './charts.js';
import appState, { REST_ID } from './core.js';

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
    if (window.innerWidth <= 768) {
        const [hours, minutes, seconds] = timeStr.split(':');
        fullscreenTimer.innerHTML = `${hours}:<br>${minutes}:<br>${seconds}`;
    } else {
        fullscreenTimer.textContent = timeStr;
    }
}

class UI {
    static init() {
        const ui = new UI();
        Charts.init();
        
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
        
        // 初始化通知权限
        if ('Notification' in window && Notification.permission === 'default') {
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

        // Fullscreen elements
        this.fullscreenMode = document.querySelector('.fullscreen-mode');
        this.fullscreenToggle = document.querySelector('.fullscreen-toggle');
        this.fullscreenTimer = document.querySelector('.fullscreen-mode .timer');
        this.taskChips = document.querySelector('.task-chips');

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
    }

    initializeState() {
        this.renderTasks();
        this.renderHistory(); // 确保这一行存在且被调用
        this.calculateAndRenderMetrics();
        this.updateCurrentActivityDisplay();
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
        const history = appState.getHistory();
        const taskTimes = {};
        let totalRestMs = 0;
        let totalTimeMs = 0;

        const sortedHistory = [...history].sort((a, b) => a.timestamp - b.timestamp);
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

        // Add current active task duration
        const activeEntry = appState.getActiveEntry();
        if (activeEntry) {
            const durationSoFar = Date.now() - activeEntry.startTime;
            if (activeEntry.taskId === REST_ID) {
                totalRestMs += durationSoFar;
            } else {
                taskTimes[activeEntry.taskId] = (taskTimes[activeEntry.taskId] || 0) + durationSoFar;
            }
        }

        // Calculate total time
        totalTimeMs = totalRestMs;
        Object.values(taskTimes).forEach(time => {
            totalTimeMs += time;
        });

        // Render rest time
        const restPercent = totalTimeMs > 0 ? (totalRestMs / totalTimeMs * 100) : 0;
        const restDiv = document.createElement('div');
        restDiv.textContent = `总休息时间: ${Timer.formatDuration(totalRestMs)}`;
        restDiv.style.setProperty('--progress', `${restPercent}%`);
        restDiv.style.setProperty('--bar-color', 'var(--md-sys-color-secondary)');
        this.taskMetricsDiv.appendChild(restDiv);

        // Render task times
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
        const activeEntry = appState.getActiveEntry();
        if (!activeEntry) {
            this.fullscreenTimer.textContent = '00:00:00';
            return;
        }
        
        if (window.innerWidth <= 768) {
            const timeStr = this.currentTimerSpan.textContent;
            const [hours, minutes, seconds] = timeStr.split(':');
            this.fullscreenTimer.innerHTML = `${hours}:<br>${minutes}:<br>${seconds}`;
        } else {
            this.fullscreenTimer.textContent = this.currentTimerSpan.textContent;
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