document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const newTaskInput = document.getElementById('newTaskInput');
    const addTaskButton = document.getElementById('addTaskButton');
    const startRestButton = document.getElementById('startRestButton');
    const taskListUl = document.getElementById('taskList');
    const currentTaskNameSpan = document.getElementById('currentTaskName');
    const currentTimerSpan = document.getElementById('currentTimer');
    const historyLogDiv = document.getElementById('historyLog');
    const taskMetricsDiv = document.getElementById('taskMetrics');
    const clearHistoryButton = document.getElementById('clearHistoryButton');
    const ganttChartCanvas = document.getElementById('ganttChart');
    let ganttChart = null; // 用于存储图表实例

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
    newTaskInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            addTask();
        }
    });
    startRestButton.addEventListener('click', startRest);
    clearHistoryButton.addEventListener('click', clearHistory);

    // Use event delegation for task list items
    taskListUl.addEventListener('click', (e) => {
        if (e.target && e.target.nodeName === 'LI') {
            const taskId = e.target.dataset.taskId;
            startTask(taskId);
        } else if (e.target && e.target.classList.contains('delete-task-btn')) {
            const taskId = e.target.dataset.taskId;
            deleteTask(taskId);
            e.stopPropagation(); // Prevent li click event from firing
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
    }

     function clearHistory() {
        if (confirm('确定要清除所有历史记录吗？此操作不可撤销。')) {
            if (activeEntry) {
                alert('请先停止当前活动再清除历史记录！');
                return;
            }
            history = [];
            activeEntry = null; // Ensure no active entry if somehow left
            saveState();
            renderHistory();
            calculateAndRenderMetrics();
            updateCurrentActivityDisplay(); // Reset display
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
        if (!activeEntry) { // Handle case where activity stopped between intervals
             currentTimerSpan.textContent = '00:00:00';
             return;
        }
        const now = Date.now();
        const elapsedMs = now - startTime;
        const seconds = Math.floor(elapsedMs / 1000);
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const remainingSeconds = seconds % 60;

        currentTimerSpan.textContent =
            `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
    }


    // --- Rendering Functions ---

    function renderTasks() {
        taskListUl.innerHTML = ''; // Clear existing list
        tasks.forEach(task => {
            const li = document.createElement('li');
            li.textContent = task.name;
            li.dataset.taskId = task.id; // Store task ID on the element
            if (activeEntry && activeEntry.taskId === task.id) {
                li.classList.add('active');
            }

             // Add delete button to each task item
            const deleteButton = document.createElement('button');
            deleteButton.textContent = '删除';
            deleteButton.classList.add('delete-task-btn');
            deleteButton.dataset.taskId = task.id; // Add task ID to button for easy deletion
            li.appendChild(deleteButton);


            taskListUl.appendChild(li);
        });
    }

    function updateCurrentActivityDisplay() {
        if (activeEntry) {
            currentTaskNameSpan.textContent = activeEntry.taskName;
            // Timer is updated by its own interval function
            if (!timerInterval) { // Ensure timer starts if loaded active state
                 startTimer();
            }
        } else {
            currentTaskNameSpan.textContent = '-- 无 --';
            currentTimerSpan.textContent = '00:00:00';
            clearInterval(timerInterval); // Ensure timer stops
            timerInterval = null;
        }
        updateGanttChart(); // 在更新当前活动后更新甘特图
    }

    function renderHistory() {
        historyLogDiv.innerHTML = ''; // Clear existing log
        // Sort history by timestamp for chronological order
        const sortedHistory = [...history].sort((a, b) => a.timestamp - b.timestamp);

        sortedHistory.forEach(entry => {
            const p = document.createElement('p');
            const time = new Date(entry.timestamp).toLocaleTimeString();
            let actionText = '';
            switch (entry.type) {
                case 'start': actionText = '开始任务'; break;
                case 'stop': actionText = '停止任务'; break;
                case 'start_rest': actionText = '开始休息'; break;
                case 'stop_rest': actionText = '结束休息'; break;
                default: actionText = entry.type;
            }
            p.textContent = `[${time}] ${actionText}: ${entry.taskName}`;
            historyLogDiv.appendChild(p);
        });
         // Scroll to bottom
         historyLogDiv.scrollTop = historyLogDiv.scrollHeight;
         updateGanttChart(); // 在更新历史记录后更新甘特图
    }

    function calculateAndRenderMetrics() {
        taskMetricsDiv.innerHTML = ''; // Clear previous metrics
        const taskTimes = {}; // { taskId: totalMilliseconds }
        let totalRestMs = 0;

        const sortedHistory = [...history].sort((a, b) => a.timestamp - b.timestamp);
        let currentStarts = {}; // { taskId: startTime } for active tasks/rest

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


        // Display Metrics
         const metricsTitle = document.createElement('h3');
         metricsTitle.textContent = '总时长统计:';
         taskMetricsDiv.appendChild(metricsTitle);

        tasks.forEach(task => {
            const totalMs = taskTimes[task.id] || 0;
            const timeStr = formatMilliseconds(totalMs);
            const div = document.createElement('div');
            div.textContent = `${task.name}: ${timeStr}`;
            taskMetricsDiv.appendChild(div);
        });

        const restDiv = document.createElement('div');
        restDiv.textContent = `总休息时间: ${formatMilliseconds(totalRestMs)}`;
        taskMetricsDiv.appendChild(restDiv);

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
        // 如果已存在图表实例，先销毁它
        if (ganttChart) {
            ganttChart.destroy();
            ganttChart = null;
        }

        const ctx = ganttChartCanvas.getContext('2d');
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);

        ganttChart = new Chart(ctx, {
            type: 'bar',
            data: {
                datasets: []
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y',
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            unit: 'hour',
                            displayFormats: {
                                hour: 'HH:mm'
                            },
                            tooltipFormat: 'HH:mm'
                        },
                        min: todayStart.getTime(),
                        max: todayEnd.getTime(),
                        position: 'top',
                        ticks: {
                            maxRotation: 0,
                            source: 'auto',
                            autoSkip: true,
                            maxTicksLimit: 24
                        }
                    },
                    y: {
                        beginAtZero: true
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            title: function(context) {
                                const timeRange = context[0].raw.x;
                                return `${new Date(timeRange[0]).toLocaleTimeString()} - ${new Date(timeRange[1]).toLocaleTimeString()}`;
                            }
                        }
                    }
                }
            }
        });
    }

    // 更新甘特图数据
    function updateGanttChart() {
        if (!ganttChart) {
            initGanttChart();
        }

        const sortedHistory = [...history].sort((a, b) => a.timestamp - b.timestamp);
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);
        
        // 过滤今天的记录
        const todayHistory = sortedHistory.filter(entry => {
            const entryDate = new Date(entry.timestamp);
            return entryDate >= todayStart && entryDate <= todayEnd;
        });

        const datasets = [];
        let currentStart = null;
        let currentTask = null;

        todayHistory.forEach(entry => {
            if (entry.type === 'start' || entry.type === 'start_rest') {
                currentStart = entry.timestamp;
                currentTask = entry;
            } else if ((entry.type === 'stop' || entry.type === 'stop_rest') && currentStart) {
                const color = entry.taskId === REST_ID ? '#f0ad4e' : '#5cb85c';
                datasets.push({
                    label: entry.taskName,
                    data: [{
                        x: [new Date(currentStart), new Date(entry.timestamp)],
                        y: entry.taskName
                    }],
                    backgroundColor: color,
                    borderColor: color,
                    borderWidth: 1,
                    borderSkipped: false,
                    borderRadius: 2
                });
                currentStart = null;
            }
        });

        // 如果有正在进行的任务，添加到图表
        if (activeEntry) {
            const color = activeEntry.taskId === REST_ID ? '#f0ad4e' : '#5cb85c';
            const now = new Date();
            // 确保不超过今天结束时间
            const endTime = now > todayEnd ? todayEnd : now;
            datasets.push({
                label: activeEntry.taskName,
                data: [{
                    x: [new Date(activeEntry.startTime), endTime],
                    y: activeEntry.taskName
                }],
                backgroundColor: color,
                borderColor: color,
                borderWidth: 1,
                borderSkipped: false,
                borderRadius: 2
            });
        }

        // 更新图表配置以确保合适的时间范围和刻度
        ganttChart.options.scales.x = {
            type: 'time',
            time: {
                unit: 'hour',
                displayFormats: {
                    hour: 'HH:mm'
                },
                tooltipFormat: 'HH:mm'
            },
            min: todayStart.getTime(),
            max: todayEnd.getTime(),
            position: 'top',
            ticks: {
                maxRotation: 0,
                source: 'auto',
                autoSkip: true,
                maxTicksLimit: 24 // 限制最大刻度数量
            }
        };

        ganttChart.data.datasets = datasets;
        ganttChart.update('none'); // 使用 'none' 模式更新以提高性能
    }
});

// 来源：
// 1. https://help.aliyun.com/zh/oss/use-cases/add-signatures-on-the-client-by-using-javascript-and-upload-data-to-oss
// 2. https://github.com/gaurav20161/maven-web-app
// 3. https://github.com/ShHaWkK/Temps_Donne
// 4. https://www.scribd.com/document/799517331/Kca-021-Wt-Ut-23-24-Sol-Fin
// 5. https://github.com/robin0R/todo-list
// 6. https://github.com/DelNyal/NCC_WEB
// 7. https://github.com/DustinDiazLopez/stopwatch-react-ui
// 8. https://github.com/Ali-Herrera/todo-auth