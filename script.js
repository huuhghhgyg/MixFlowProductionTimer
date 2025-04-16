document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const newTaskInput = document.querySelector('#newTaskInput');
    const addTaskButton = document.querySelector('#addTaskButton');
    const startRestButton = document.querySelector('#startRestButton');
    const stopActivityButton = document.querySelector('#stopActivityButton');
    const taskList = document.querySelector('#taskList');
    const currentTaskNameSpan = document.querySelector('#currentTaskName');
    const currentTimerSpan = document.querySelector('#currentTimer');
    const historyLogDiv = document.querySelector('#historyLog');
    const taskMetricsDiv = document.querySelector('#taskMetrics');
    const clearHistoryButton = document.querySelector('#clearHistoryButton');
    const ganttChartCanvas = document.getElementById('ganttChart');
    const clearDataButton = document.querySelector('#clearDataButton');
    let ganttChart = null;

    const fullscreenMode = document.querySelector('.fullscreen-mode');
    const fullscreenToggle = document.querySelector('.fullscreen-toggle');
    const fullscreenTimer = document.querySelector('.fullscreen-mode .timer');
    const taskChips = document.querySelector('.task-chips');

    // 日期选择器初始化
    const ganttDatePicker = document.getElementById('ganttDatePicker');
    ganttDatePicker.valueAsDate = new Date();

    // 热力图初始化
    const workloadHeatmap = echarts.init(document.getElementById('workloadHeatmap'));

    // --- State Variables ---
    let tasks = []; // Array of task objects { id, name }
    let history = []; // Array of history entries { id, taskId, taskName, type: 'start'/'stop'/'start_rest'/'stop_rest', timestamp }
    let activeEntry = null; // { historyId, taskId, taskName, type, startTime } or null
    let timerInterval = null; // Holds the interval ID for the timer

    // --- Constants ---
    const REST_ID = '__REST__'; // Special ID for rest periods

    // --- Initialization ---
    loadState();
    renderTasks();
    renderHistory();
    calculateAndRenderMetrics();
    updateCurrentActivityDisplay(); // Update display based on loaded state
    initGanttChart();

    // --- Event Listeners ---
    // 添加页面可见性变化监听器
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            // 页面变为可见时更新显示
            updateCurrentActivityDisplay();
            calculateAndRenderMetrics();
            if (ganttChart) {
                updateGanttChart();
            }
        }
    });

    addTaskButton.addEventListener('click', addTask);
    newTaskInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            addTask();
        }
    });
    startRestButton.addEventListener('click', startRest);
    stopActivityButton.addEventListener('click', stopCurrentActivity);
    clearHistoryButton.addEventListener('click', clearHistory);
    clearDataButton.addEventListener('click', clearAllData);
    window.addEventListener('resize', () => {
        if (ganttChart) {
            updateGanttChart(); // 不仅仅是resize，而是完全更新
        }
        // 添加对时钟显示的更新
        updateFullscreenDisplay();
        workloadHeatmap.resize();
    });

    fullscreenToggle.addEventListener('click', toggleFullscreen);
    document.addEventListener('keydown', (e) => {
        if (e.altKey && (e.key === 'f' || e.key === 'F')) {
            e.preventDefault(); // 防止触发浏览器的默认行为
            toggleFullscreen();
        }
    });

    // Use event delegation for task list items
    taskList.addEventListener('click', (e) => {
        const taskItem = e.target.closest('.task-item');
        const deleteButton = e.target.closest('.delete-button');
        
        if (deleteButton) {
            const taskId = deleteButton.getAttribute('data-task-id');
            deleteTask(taskId);
            e.stopPropagation();
        } else if (taskItem || e.target.parentElement?.classList.contains('task-item')) {
            const item = taskItem || e.target.parentElement;
            const taskId = item.getAttribute('data-task-id');
            startTask(taskId);
        }
    });

    // 当日期选择器变化时更新甘特图
    ganttDatePicker.addEventListener('change', () => {
        updateGanttChart();
    });

    // --- Core Functions ---

    function addTask() {
        const taskName = newTaskInput.value.trim();
        if (taskName === '') {
            alert('任务名称不能为空！');
            return;
        }
        const newTask = {
            id: Date.now().toString(), // Simple unique ID
            name: taskName
        };
        tasks.push(newTask);
        newTaskInput.value = '';
        saveState();
        renderTasks();
    }

    function deleteTask(taskId) {
        // Prevent deleting the active task without stopping it first
        if (activeEntry && activeEntry.taskId === taskId) {
             alert('请先停止当前任务再删除！');
             return;
        }

        // Confirm before deleting
        const taskToDelete = tasks.find(t => t.id === taskId);
        if (!taskToDelete || !confirm(`确定要删除任务 "${taskToDelete.name}" 吗？相关历史记录也会保留，但不再关联此任务。`)) {
            return;
        }


        tasks = tasks.filter(task => task.id !== taskId);

        // Optionally: Mark history entries related to this task as 'deleted_task' or similar
        // history = history.map(entry => {
        //     if (entry.taskId === taskId) {
        //         return { ...entry, taskName: `${entry.taskName} (已删除)` };
        //     }
        //     return entry;
        // });

        saveState();
        renderTasks();
        calculateAndRenderMetrics(); // Recalculate metrics as task is gone
    }


    function startTask(taskId) {
        const task = tasks.find(t => t.id === taskId);
        if (!task) return; // Task not found

        // If the same task is already active, do nothing
        if (activeEntry && activeEntry.taskId === taskId) {
            return;
        }

        stopCurrentActivity(); // Stop any previous activity (task or rest)

        const now = Date.now();
        const historyId = now.toString() + Math.random().toString(16).slice(2); // More unique ID
        const newHistoryEntry = {
            id: historyId,
            taskId: task.id,
            taskName: task.name,
            type: 'start',
            timestamp: now
        };
        history.push(newHistoryEntry);

        activeEntry = {
            historyId: historyId,
            taskId: task.id,
            taskName: task.name,
            type: 'task', // Differentiate between task and rest
            startTime: now
        };

        saveState();
        renderTasks(); // Update highlighting
        renderHistory();
        updateCurrentActivityDisplay();
        startTimer();
        updatePageTitle(task.name);
    }

    function startRest() {
        // If rest is already active, do nothing
        if (activeEntry && activeEntry.taskId === REST_ID) {
            return;
        }

        stopCurrentActivity(); // Stop any current task

        const now = Date.now();
         const historyId = now.toString() + Math.random().toString(16).slice(2);
        const newHistoryEntry = {
            id: historyId,
            taskId: REST_ID,
            taskName: '休息',
            type: 'start_rest',
            timestamp: now
        };
        history.push(newHistoryEntry);

        activeEntry = {
            historyId: historyId,
            taskId: REST_ID,
            taskName: '休息',
            type: 'rest',
            startTime: now
        };

        saveState();
        renderTasks(); // De-highlight any task
        renderHistory();
        updateCurrentActivityDisplay();
        startTimer();
        updatePageTitle('休息中');
    }

    function stopCurrentActivity() {
        if (!activeEntry) return; // Nothing is active

        clearInterval(timerInterval);
        timerInterval = null;

        const now = Date.now();
        const stopType = activeEntry.type === 'task' ? 'stop' : 'stop_rest';
        const stopHistoryEntry = {
            id: now.toString() + Math.random().toString(16).slice(2),
            taskId: activeEntry.taskId, // ID of the task/rest being stopped
            taskName: activeEntry.taskName,
            type: stopType,
            timestamp: now,
            // Link to the start event for duration calculation later
            linkedEntryId: activeEntry.historyId
        };
        history.push(stopHistoryEntry);

        activeEntry = null; // No longer active

        saveState();
        renderTasks(); // Update highlighting
        renderHistory();
        calculateAndRenderMetrics(); // Update metrics after stopping
        updateCurrentActivityDisplay();
        updatePageTitle();
    }

    function clearHistory() {
        if (confirm('确定要清除历史记录吗？此操作不会删除任务列表，但会清空所有活动记录。')) {
            // 如果有活动任务，先停止
            if (activeEntry) {
                stopCurrentActivity();
            }
            history = [];
            saveState();
            renderHistory();
            calculateAndRenderMetrics();
            updateCurrentActivityDisplay();
        }
    }

    // --- Timer Functions ---

    function startTimer() {
        if (!activeEntry || timerInterval) return; // Only start if active and not already running

        const startTime = activeEntry.startTime;
        updateTimerDisplay(startTime); // Initial display

        timerInterval = setInterval(() => {
            updateTimerDisplay(startTime);
        }, 1000);
    }

    function updateTimerDisplay(startTime) {
        if (!activeEntry) {
            currentTimerSpan.textContent = '00:00:00';
            updateFullscreenDisplay();
            return;
        }

        const now = Date.now();
        const elapsedMs = now - startTime;
        const seconds = Math.floor(elapsedMs / 1000);
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const remainingSeconds = seconds % 60;

        const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
        currentTimerSpan.textContent = timeStr;
        updateFullscreenDisplay();
    }

    function updateFullscreenDisplay() {
        if (!fullscreenMode.classList.contains('active')) return;
        
        // 在移动设备上使用换行显示但保留冒号
        if (window.innerWidth <= 768) {
            const timeStr = currentTimerSpan.textContent;
            const [hours, minutes, seconds] = timeStr.split(':');
            fullscreenTimer.innerHTML = `${hours}:<br>${minutes}:<br>${seconds}`;
        } else {
            fullscreenTimer.textContent = currentTimerSpan.textContent;
        }
    }

    // --- Rendering Functions ---

    function renderTasks() {
        taskList.innerHTML = '';
        tasks.forEach(task => {
            const taskItem = document.createElement('div');
            taskItem.className = 'task-item';
            taskItem.setAttribute('data-task-id', task.id);
            
            const taskName = document.createElement('span');
            taskName.textContent = task.name;
            
            const deleteButton = document.createElement('button');
            deleteButton.className = 'button-tonal delete-button';
            deleteButton.innerHTML = '<span class="material-symbols-rounded">delete</span>';
            deleteButton.setAttribute('data-task-id', task.id);
            
            taskItem.appendChild(taskName);
            taskItem.appendChild(deleteButton);

            if (activeEntry && activeEntry.taskId === task.id) {
                taskItem.classList.add('active');
            }

            taskList.appendChild(taskItem);
        });
    }

    function updateCurrentActivityDisplay() {
        if (activeEntry) {
            currentTaskNameSpan.textContent = activeEntry.taskName;
            if (!timerInterval) {
                startTimer();
            }
            // 当活动存在时启用停止按钮
            stopActivityButton.disabled = false;
            // 当正在休息时才禁用休息按钮
            startRestButton.disabled = activeEntry.taskId === REST_ID;
        } else {
            currentTaskNameSpan.textContent = '-- 无活动 --';
            currentTimerSpan.textContent = '00:00:00';
            clearInterval(timerInterval);
            timerInterval = null;
            // 当没有活动时禁用停止按钮
            stopActivityButton.disabled = true;
            startRestButton.disabled = false;
        }
        updateGanttChart();

        if (fullscreenMode.classList.contains('active')) {
            renderTaskChips();
            updateFullscreenDisplay();
        }
    }

    function renderHistory() {
        historyLogDiv.innerHTML = '';
        const sortedHistory = [...history].sort((a, b) => a.timestamp - b.timestamp);

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
                    icon = 'coffee'; // 移除 _off 后缀
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
            historyLogDiv.appendChild(p);
        });
        historyLogDiv.scrollTop = historyLogDiv.scrollHeight;
        updateGanttChart();
    }

    function calculateAndRenderMetrics() {
        taskMetricsDiv.innerHTML = '';
        const taskTimes = {}; // { taskId: totalMilliseconds }
        let totalRestMs = 0;
        let totalTimeMs = 0;

        const sortedHistory = [...history].sort((a, b) => a.timestamp - b.timestamp);
        let currentStarts = {};

        sortedHistory.forEach(entry => {
            if (entry.type === 'start' || entry.type === 'start_rest') {
                 // Record start time, overwriting if already started (handles potential data issues)
                 currentStarts[entry.taskId] = entry.timestamp;
            } else if (entry.type === 'stop' || entry.type === 'stop_rest') {
                const startTime = currentStarts[entry.taskId];
                if (startTime) {
                     const duration = entry.timestamp - startTime;
                     if (entry.taskId === REST_ID) {
                         totalRestMs += duration;
                     } else {
                         if (!taskTimes[entry.taskId]) {
                             taskTimes[entry.taskId] = 0;
                         }
                         taskTimes[entry.taskId] += duration;
                     }
                     // Remove from current starts once stopped
                     delete currentStarts[entry.taskId];
                }
            }
        });

        // Handle currently active entry (if any) - add its duration up to now
         if (activeEntry) {
             const durationSoFar = Date.now() - activeEntry.startTime;
             if (activeEntry.taskId === REST_ID) {
                 totalRestMs += durationSoFar;
             } else {
                 if (!taskTimes[activeEntry.taskId]) {
                     taskTimes[activeEntry.taskId] = 0;
                 }
                 taskTimes[activeEntry.taskId] += durationSoFar;
             }
         }

        // 计算总时间（包括休息时间）
        totalTimeMs = totalRestMs;
        Object.values(taskTimes).forEach(time => {
            totalTimeMs += time;
        });

        // 首先显示总休息时间
        const restPercent = totalTimeMs > 0 ? (totalRestMs / totalTimeMs * 100) : 0;
        const restDiv = document.createElement('div');
        restDiv.textContent = `总休息时间: ${formatMilliseconds(totalRestMs)}`;
        restDiv.style.setProperty('--progress', `${restPercent}%`);
        restDiv.style.setProperty('--bar-color', 'var(--md-sys-color-secondary)');
        taskMetricsDiv.appendChild(restDiv);

        // 将任务时间转换为数组并按时间降序排序
        const taskTimeArray = tasks.map(task => ({
            name: task.name,
            time: taskTimes[task.id] || 0,
            percent: totalTimeMs > 0 ? ((taskTimes[task.id] || 0) / totalTimeMs * 100) : 0
        })).sort((a, b) => b.time - a.time);

        taskTimeArray.forEach(taskTime => {
            const div = document.createElement('div');
            div.textContent = `${taskTime.name}: ${formatMilliseconds(taskTime.time)}`;
            div.style.setProperty('--progress', `${taskTime.percent}%`);
            div.style.setProperty('--bar-color', 'var(--md-sys-color-primary)');
            taskMetricsDiv.appendChild(div);
        });

    }

     function formatMilliseconds(ms) {
        const seconds = Math.floor(ms / 1000);
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const remainingSeconds = seconds % 60;
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
    }


    // --- Persistence ---

    function saveState() {
        localStorage.setItem('personalKanbanTasks', JSON.stringify(tasks));
        localStorage.setItem('personalKanbanHistory', JSON.stringify(history));
        localStorage.setItem('personalKanbanActiveEntry', JSON.stringify(activeEntry));
        updateHeatmap(); // 每次保存状态时更新热力图
    }

    function loadState() {
        const storedTasks = localStorage.getItem('personalKanbanTasks');
        const storedHistory = localStorage.getItem('personalKanbanHistory');
        const storedActiveEntry = localStorage.getItem('personalKanbanActiveEntry');

        if (storedTasks) {
            tasks = JSON.parse(storedTasks);
        }
        if (storedHistory) {
            history = JSON.parse(storedHistory);
        }
         if (storedActiveEntry) {
            activeEntry = JSON.parse(storedActiveEntry);
             // If the browser was closed while active, need to potentially adjust
             // For simplicity, we'll restart the timer based on loaded start time
             // A more robust solution might mark it as interrupted or paused.
             if (activeEntry) {
                 // We don't automatically restart the timer here,
                 // updateCurrentActivityDisplay will call startTimer if needed.
             }
        }
    }

    // 初始化甘特图
    function initGanttChart() {
        if (ganttChart) {
            ganttChart.dispose();
        }
        ganttChart = echarts.init(document.getElementById('ganttChart'));
        updateGanttChart();
    }

    // 更新甘特图数据
    function updateGanttChart() {
        const selectedDate = ganttDatePicker.valueAsDate;
        const startOfDay = new Date(selectedDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(selectedDate);
        endOfDay.setHours(23, 59, 59, 999);

        // 筛选当天的任务记录
        const dayTasks = history.filter(record => {
            const recordDate = new Date(record.timestamp);
            return recordDate >= startOfDay && recordDate <= endOfDay;
        });

        if (!ganttChart) {
            initGanttChart();
            return;
        }

        // 获取排序后的历史记录
        const sortedHistory = [...dayTasks].sort((a, b) => a.timestamp - b.timestamp);
        
        // 如果没有数据，显示空状态
        if (sortedHistory.length === 0) {
            const option = {
                graphic: [{
                    type: 'text',
                    left: 'center',
                    top: 'middle',
                    style: {
                        text: '当前日期没有任务记录',
                        fontSize: 14,
                        fill: getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-on-surface-variant').trim()
                    }
                }],
                grid: {
                    show: false
                },
                xAxis: { show: false },
                yAxis: { show: false }
            };
            ganttChart.setOption(option, true);
            return;
        }

        // 计算时间轴范围
        let timeRange = {
            start: new Date(sortedHistory[0].timestamp),
            end: new Date(sortedHistory[sortedHistory.length - 1].timestamp)
        };

        // 如果当前有活动任务且是今天的，将结束时间延伸到现在
        if (activeEntry && new Date(activeEntry.startTime).toDateString() === selectedDate.toDateString()) {
            timeRange.end = new Date();
        }

        // 在时间范围前后各添加一些边距（30分钟）
        timeRange.start = new Date(timeRange.start.getTime());
        timeRange.end = new Date(timeRange.end.getTime() + 10);

        // 确保时间范围不超出当天
        if (timeRange.start < startOfDay) timeRange.start = startOfDay;
        if (timeRange.end > endOfDay) timeRange.end = endOfDay;

        // 获取任务列表（包括当前活动任务）
        const tasks = new Set();
        sortedHistory.forEach(entry => tasks.add(entry.taskName));
        if (activeEntry && new Date(activeEntry.startTime).toDateString() === selectedDate.toDateString()) {
            tasks.add(activeEntry.taskName);
        }
        const taskList = Array.from(tasks);

        // 动态计算甘特图高度
        const isMobile = window.innerWidth <= 768;
        const itemHeight = isMobile ? 24 : 40;
        const minHeight = isMobile ? 200 : 300;
        const titleHeight = 40;
        const calculatedHeight = Math.max(minHeight, taskList.length * itemHeight + titleHeight);
        
        // 更新甘特图容器高度
        ganttChartCanvas.style.height = `${calculatedHeight}px`;
        ganttChart.resize();

        // 构建系列数据
        const series = [];
        let currentStart = null;
        let currentTask = null;

        // 处理历史记录中的任务
        sortedHistory.forEach(entry => {
            if (entry.type === 'start' || entry.type === 'start_rest') {
                // 如果已经有未结束的任务，先结束它
                if (currentStart && currentTask) {
                    const taskIndex = taskList.indexOf(currentTask.taskName);
                    if (taskIndex !== -1) {
                        series.push({
                            name: currentTask.taskName,
                            value: [
                                taskIndex,
                                new Date(currentStart),
                                new Date(entry.timestamp),
                                currentTask.taskId === REST_ID ? '休息' : currentTask.taskName
                            ],
                            itemStyle: currentTask.taskId === REST_ID ? {
                                color: getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-secondary').trim()
                            } : {
                                color: getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-primary').trim()
                            }
                        });
                    }
                }
                currentStart = entry.timestamp;
                currentTask = entry;
            } else if ((entry.type === 'stop' || entry.type === 'stop_rest') && currentStart && currentTask) {
                const taskIndex = taskList.indexOf(currentTask.taskName);
                if (taskIndex !== -1) {
                    series.push({
                        name: currentTask.taskName,
                        value: [
                            taskIndex,
                            new Date(currentStart),
                            new Date(entry.timestamp),
                            currentTask.taskId === REST_ID ? '休息' : currentTask.taskName
                        ],
                        itemStyle: currentTask.taskId === REST_ID ? {
                            color: getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-secondary').trim()
                        } : {
                            color: getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-primary').trim()
                        }
                    });
                }
                currentStart = null;
                currentTask = null;
            }
        });

        // 添加当前活动的任务
        if (activeEntry && new Date(activeEntry.startTime).toDateString() === selectedDate.toDateString()) {
            const taskIndex = taskList.indexOf(activeEntry.taskName);
            if (taskIndex !== -1) {
                series.push({
                    name: activeEntry.taskName,
                    value: [
                        taskIndex,
                        new Date(activeEntry.startTime),
                        new Date(),
                        activeEntry.taskId === REST_ID ? '休息' : activeEntry.taskName
                    ],
                    itemStyle: activeEntry.taskId === REST_ID ? {
                        color: getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-secondary').trim()
                    } : {
                        color: getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-primary').trim()
                    }
                });
            }
        }

        // 更新图表配置
        const option = {
            animation: false, // 禁用动画以提高性能
            tooltip: {
                formatter: function (params) {
                    const startTime = new Date(params.value[1]).toLocaleTimeString();
                    const endTime = new Date(params.value[2]).toLocaleTimeString();
                    const duration = Math.floor((params.value[2] - params.value[1]) / 1000 / 60);
                    const hours = Math.floor(duration / 60);
                    const minutes = duration % 60;
                    const durationText = hours > 0 
                        ? `${hours}小时${minutes}分钟`
                        : `${minutes}分钟`;
                    return `${params.value[3]}<br/>
                            开始：${startTime}<br/>
                            结束：${endTime}<br/>
                            持续：${durationText}`;
                }
            },
            dataZoom: [{
                type: 'slider',
                xAxisIndex: 0,
                startValue: timeRange.start,
                endValue: timeRange.end,
                height: isMobile ? 20 : 30,
                borderColor: getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-outline').trim(),
                selectedDataBackground: {
                    lineStyle: {
                        color: getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-primary').trim()
                    },
                    areaStyle: {
                        color: getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-primary-container').trim()
                    }
                },
                fillerColor: getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-surface-variant').trim(),
                handleSize: isMobile ? 15 : 20,
                handleStyle: {
                    color: getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-primary').trim()
                },
                textStyle: {
                    color: getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-on-surface-variant').trim(),
                    fontSize: isMobile ? 10 : 12
                },
                showDetail: !isMobile,
                rangeMode: ['value', 'value']
            }, {
                type: 'inside',
                xAxisIndex: 0,
                startValue: timeRange.start,
                endValue: timeRange.end
            }],
            grid: {
                top: isMobile ? 40 : 60,
                bottom: isMobile ? 30 : 40,
                left: isMobile ? 60 : 80,
                right: isMobile ? 10 : 20,
                containLabel: true
            },
            xAxis: {
                type: 'time',
                position: 'top',
                min: timeRange.start,
                max: timeRange.end,
                axisLine: {
                    lineStyle: {
                        color: getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-outline-variant').trim()
                    }
                },
                axisLabel: {
                    color: getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-on-surface-variant').trim(),
                    fontSize: isMobile ? 10 : 12,
                    formatter: function (value) {
                        const date = new Date(value);
                        return isMobile
                            ? `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`
                            : date.toLocaleTimeString();
                    },
                    interval: isMobile ? 'auto' : 0
                },
                splitLine: {
                    show: !isMobile,
                    lineStyle: {
                        color: getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-outline-variant').trim(),
                        opacity: 0.3
                    }
                }
            },
            yAxis: {
                data: taskList,
                axisLine: {
                    lineStyle: {
                        color: getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-outline-variant').trim()
                    }
                },
                axisLabel: {
                    color: getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-on-surface-variant').trim(),
                    fontSize: isMobile ? 10 : 12,
                    width: isMobile ? 50 : 80,
                    overflow: 'truncate',
                    formatter: function (value) {
                        if (isMobile && value.length > 6) {
                            return value.substr(0, 6) + '...';
                        }
                        return value;
                    }
                }
            },
            series: [{
                type: 'custom',
                renderItem: function (params, api) {
                    const categoryIndex = api.value(0);
                    const start = api.coord([api.value(1), categoryIndex]);
                    const end = api.coord([api.value(2), categoryIndex]);
                    const height = Math.min(api.size([0, 1])[1] * 0.6, 30);
                    
                    return {
                        type: 'rect',
                        shape: {
                            x: start[0],
                            y: start[1] - height / 2,
                            width: Math.max(end[0] - start[0], 2),
                            height: height
                        },
                        style: api.style({
                            fill: api.value(3) === '休息' ? 
                                getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-secondary').trim() :
                                getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-primary').trim()
                        })
                    };
                },
                encode: {
                    x: [1, 2],
                    y: 0
                },
                data: series
            }]
        };

        ganttChart.setOption(option, true);
    }

    function updateHeatmap() {
        // 获取过去365天的数据
        const today = new Date();
        const yearAgo = new Date();
        yearAgo.setFullYear(today.getFullYear() - 1);

        // 初始化日期数据
        const dateData = new Map();
        for (let d = new Date(yearAgo); d <= today; d.setDate(d.getDate() + 1)) {
            dateData.set(d.toISOString().split('T')[0], 0);
        }

        // 计算每天的工作时长（分钟）
        const sortedHistory = [...history].sort((a, b) => a.timestamp - b.timestamp);
        let currentStarts = {};

        sortedHistory.forEach(entry => {
            const date = new Date(entry.timestamp).toISOString().split('T')[0];
            
            if (entry.type === 'start' || entry.type === 'start_rest') {
                currentStarts[entry.taskId] = entry.timestamp;
            } else if (entry.type === 'stop' || entry.type === 'stop_rest') {
                const startTime = currentStarts[entry.taskId];
                if (startTime) {
                    const duration = (entry.timestamp - startTime) / (1000 * 60); // 转换为分钟
                    if (dateData.has(date)) {
                        dateData.set(date, (dateData.get(date) || 0) + duration);
                    }
                    delete currentStarts[entry.taskId];
                }
            }
        });

        // 添加当前活动的时长
        if (activeEntry) {
            const now = Date.now();
            const date = new Date(now).toISOString().split('T')[0];
            const duration = (now - activeEntry.startTime) / (1000 * 60);
            if (dateData.has(date)) {
                dateData.set(date, (dateData.get(date) || 0) + duration);
            }
        }

        // 转换为ECharts数据格式
        const heatmapData = Array.from(dateData).map(([date, value]) => {
            return [date, Math.round(value)];
        });

        const option = {
            tooltip: {
                position: 'top',
                formatter: function (params) {
                    const date = new Date(params.data[0]);
                    const minutes = params.data[1];
                    const hours = Math.floor(minutes / 60);
                    const remainingMinutes = minutes % 60;
                    return `${date.toLocaleDateString()}<br/>工作时长: ${hours}小时${remainingMinutes}分钟`;
                }
            },
            visualMap: {
                min: 0,
                max: Math.max(...Array.from(dateData.values())),
                calculable: true,
                orient: 'horizontal',
                left: 'center',
                bottom: '0%',
                textStyle: {
                    color: getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-on-surface-variant').trim()
                },
                inRange: {
                    color: [
                        getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-surface-variant').trim(),
                        getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-primary-container').trim(),
                        getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-primary').trim()
                    ]
                }
            },
            calendar: {
                top: 30,
                left: 30,
                right: 30,
                cellSize: ['auto', 20],
                range: [yearAgo.toISOString().split('T')[0], today.toISOString().split('T')[0]],
                itemStyle: {
                    borderWidth: 1, // 保留日期方块的边框
                    borderColor: getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-outline-variant').trim(),
                    borderRadius: 4,
                    color: getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-surface-variant').trim()
                },
                splitLine: {
                    show: false // 隐藏月份分割线
                },
                orient: 'horizontal', // 水平排列
                dayLabel: {
                    firstDay: 1, // 从周一开始
                    nameMap: ['日', '一', '二', '三', '四', '五', '六'],
                    color: getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-on-surface-variant').trim()
                },
                monthLabel: {
                    show: true,
                    color: getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-on-surface-variant').trim()
                },
                yearLabel: {
                    show: false
                },
                silent: false // 确保事件可以被触发
            },
            series: {
                type: 'heatmap',
                coordinateSystem: 'calendar',
                data: heatmapData,
                emphasis: {
                    itemStyle: {
                        borderColor: getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-primary').trim(),
                        borderWidth: 2
                    }
                }
            }
        };

        workloadHeatmap.setOption(option);
        
        // 移除旧的事件监听器
        workloadHeatmap.off('mouseover');
        workloadHeatmap.off('mouseout');
        
        // 添加新的事件监听器
        workloadHeatmap.on('mouseover', function(params) {
            if (params.componentType === 'series') {
                const selectedDate = new Date(params.data[0]);
                if (!isNaN(selectedDate.getTime())) { // 确保日期有效
                    ganttDatePicker.valueAsDate = selectedDate;
                    updateGanttChart();
                }
            }
        });

        workloadHeatmap.on('mouseout', function() {
            const today = new Date();
            ganttDatePicker.valueAsDate = today;
            updateGanttChart();
        });
    }

    // 清除所有数据
    function clearAllData() {
        if (confirm('确定要清除所有数据吗？此操作将清除所有任务、历史记录和统计信息，且不可恢复。')) {
            // 如果有活动任务，先停止计时器
            if (timerInterval) {
                clearInterval(timerInterval);
                timerInterval = null;
            }

            tasks = [];
            history = [];
            activeEntry = null;
            localStorage.clear();
            
            renderTasks();
            renderHistory();
            calculateAndRenderMetrics();
            updateCurrentActivityDisplay();

            // 自动开始休息模式
            startRest();
        }
    }

    function toggleFullscreen() {
        const isFullscreen = fullscreenMode.classList.contains('active');
        fullscreenMode.classList.toggle('active');
        fullscreenToggle.querySelector('.material-symbols-rounded').textContent = 
            isFullscreen ? 'fullscreen' : 'fullscreen_exit';
        
        if (!isFullscreen) {
            renderTaskChips();
            updateFullscreenDisplay();
        }
    }

    function renderTaskChips() {
        taskChips.innerHTML = '';
        // 添加休息选项
        const restChip = document.createElement('div');
        restChip.className = 'task-chip' + (activeEntry?.taskId === REST_ID ? ' active' : '');
        restChip.innerHTML = `
            <div class="chip-content">
                <span class="material-symbols-rounded">coffee</span>
                <span class="chip-text">休息</span>
                ${activeEntry?.taskId === REST_ID ? '<span class="material-symbols-rounded check-icon">done</span>' : ''}
            </div>
        `;
        restChip.addEventListener('click', startRest);
        taskChips.appendChild(restChip);

        // 添加所有任务
        tasks.forEach(task => {
            const chip = document.createElement('div');
            chip.className = 'task-chip' + (activeEntry?.taskId === task.id ? ' active' : '');
            chip.innerHTML = `
                <div class="chip-content">
                    <span class="chip-text">${task.name}</span>
                    ${activeEntry?.taskId === task.id ? '<span class="material-symbols-rounded check-icon">done</span>' : ''}
                </div>
            `;
            chip.addEventListener('click', () => startTask(task.id));
            taskChips.appendChild(chip);
        });
    }

    function updatePageTitle(taskName) {
        if (taskName) {
            document.title = `MFPT - ${taskName}`;
        } else {
            document.title = 'Mixed-Flow Production Timer';
        }
    }

    // 修改保存任务记录的函数，添加热力图更新
    function saveTaskHistory() {
        localStorage.setItem('taskHistory', JSON.stringify(history));
        updateGanttChart();
        updateHeatmap();
    }

    // 初始化
    initGanttChart();
    updateHeatmap();
});