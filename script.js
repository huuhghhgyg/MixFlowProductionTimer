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
            ganttChart.resize();
        }
        // 添加对时钟显示的更新
        updateFullscreenDisplay();
    });

    fullscreenToggle.addEventListener('click', toggleFullscreen);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'f' || e.key === 'F') {
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
        localStorage.setItem('personalKanbanActiveEntry', JSON.stringify(activeEntry)); // Save active state too
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
        if (!ganttChart) {
            initGanttChart();
            return;
        }

        const sortedHistory = [...history].sort((a, b) => a.timestamp - b.timestamp);
        
        // 如果没有历史记录，显示最近1小时的范围
        if (sortedHistory.length === 0) {
            const endTime = new Date();
            const startTime = new Date(endTime.getTime() - 60 * 60 * 1000);
            return;
        }

        // 获取数据中最早和最晚的时间
        const startTime = new Date(sortedHistory[0].timestamp);
        const endTime = activeEntry ? new Date() : new Date(sortedHistory[sortedHistory.length - 1].timestamp);

        const tasks = new Set();
        sortedHistory.forEach(entry => tasks.add(entry.taskName));
        const taskList = Array.from(tasks);

        const series = [];
        let currentStart = null;
        let currentTask = null;

        sortedHistory.forEach(entry => {
            if (entry.type === 'start' || entry.type === 'start_rest') {
                currentStart = entry.timestamp;
                currentTask = entry;
            } else if ((entry.type === 'stop' || entry.type === 'stop_rest') && currentStart) {
                const taskIndex = taskList.indexOf(entry.taskName);
                series.push({
                    name: entry.taskName,
                    value: [
                        taskIndex,
                        new Date(currentStart),
                        new Date(entry.timestamp),
                        entry.taskId === REST_ID ? '休息' : entry.taskName
                    ],
                    itemStyle: entry.taskId === REST_ID ? {
                        color: getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-secondary').trim()
                    } : {
                        color: getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-primary').trim()
                    }
                });
                currentStart = null;
            }
        });

        // 添加当前活动的任务
        if (activeEntry) {
            const now = new Date();
            const taskIndex = taskList.indexOf(activeEntry.taskName);
            series.push({
                name: activeEntry.taskName,
                value: [
                    taskIndex,
                    new Date(activeEntry.startTime),
                    now,
                    activeEntry.taskId === REST_ID ? '休息' : activeEntry.taskName
                ],
                itemStyle: activeEntry.taskId === REST_ID ? {
                    color: getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-secondary').trim()
                } : {
                    color: getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-primary').trim()
                }
            });
        }

        const option = {
            tooltip: {
                formatter: function (params) {
                    const startTime = new Date(params.value[1]).toLocaleTimeString();
                    const endTime = new Date(params.value[2]).toLocaleTimeString();
                    const duration = Math.floor((params.value[2] - params.value[1]) / 1000 / 60);
                    return `${params.value[3]}<br/>
                            开始：${startTime}<br/>
                            结束：${endTime}<br/>
                            持续：${duration}分钟`;
                }
            },
            dataZoom: [
                {
                    type: 'slider',
                    xAxisIndex: 0,
                    startValue: startTime,
                    endValue: endTime,
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
                    handleStyle: {
                        color: getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-primary').trim()
                    },
                    textStyle: {
                        color: getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-on-surface-variant').trim()
                    }
                },
                {
                    type: 'inside',
                    xAxisIndex: 0
                }
            ],
            grid: {
                height: 200
            },
            xAxis: {
                type: 'time',
                position: 'top',
                min: startTime,
                max: endTime,
                axisLine: {
                    lineStyle: {
                        color: getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-outline').trim()
                    }
                },
                axisLabel: {
                    color: getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-on-surface-variant').trim()
                },
                splitLine: {
                    lineStyle: {
                        color: getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-outline-variant').trim()
                    }
                }
            },
            yAxis: {
                data: taskList,
                axisLine: {
                    lineStyle: {
                        color: getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-outline').trim()
                    }
                },
                axisLabel: {
                    color: getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-on-surface-variant').trim()
                },
                splitLine: {
                    lineStyle: {
                        color: getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-outline-variant').trim()
                    }
                }
            },
            series: [{
                type: 'custom',
                renderItem: function (params, api) {
                    const categoryIndex = api.value(0);
                    const start = api.coord([api.value(1), categoryIndex]);
                    const end = api.coord([api.value(2), categoryIndex]);
                    const height = api.size([0, 1])[1] * 0.6;
                    
                    const rectShape = {
                        x: start[0],
                        y: start[1] - height / 2,
                        width: Math.max(end[0] - start[0], 1),
                        height: height
                    };
                    
                    const isRest = api.value(3) === '休息';
                    return {
                        type: 'rect',
                        shape: rectShape,
                        style: {
                            fill: isRest ? 
                                getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-secondary').trim() :
                                getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-primary').trim(),
                            ...api.style()
                        }
                    };
                },
                encode: {
                    x: [1, 2],
                    y: 0
                },
                data: series
            }]
        };

        ganttChart.setOption(option);
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

    // 初始化
    initGanttChart();
});