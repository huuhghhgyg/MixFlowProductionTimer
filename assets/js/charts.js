import appState, { REST_ID } from './core.js';
import Timer from './timer.js';

class Charts {
    static ganttChart = null;
    static workloadHeatmap = null;
    static datePicker = null;

    static init() {
        this.ganttChart = echarts.init(document.getElementById('ganttChart'));
        this.workloadHeatmap = echarts.init(document.getElementById('workloadHeatmap'));
        this.datePicker = document.getElementById('ganttDatePicker');
        
        // 设置日期选择器为今天
        this.datePicker.valueAsDate = new Date();
        
        // 初始化图表
        this.updateGanttChart();
        this.updateHeatmap();

        // 设置事件监听器
        this.setupEventListeners();
    }

    static setupEventListeners() {
        // 监听窗口大小变化
        window.addEventListener('resize', () => {
            if (this.ganttChart) {
                this.ganttChart.resize();
            }
            if (this.workloadHeatmap) {
                this.workloadHeatmap.resize();
            }
        });

        // 监听日期选择
        this.datePicker?.addEventListener('change', () => {
            this.updateGanttChart();
        });

        // 监听热力图折叠/展开
        const toggleHeatmapBtn = document.querySelector('.toggle-heatmap');
        const heatmapSection = document.querySelector('.heatmap-section');
        
        toggleHeatmapBtn?.addEventListener('click', () => {
            heatmapSection.classList.toggle('collapsed');
            const isExpanded = !heatmapSection.classList.contains('collapsed');
            toggleHeatmapBtn.querySelector('.material-symbols-rounded').textContent = 
                isExpanded ? 'expand_less' : 'expand_more';
            
            if (isExpanded) {
                setTimeout(() => {
                    this.workloadHeatmap?.resize();
                    this.updateHeatmap();
                }, 300);
            }
        });

        // 设置热力图事件监听器
        if (this.workloadHeatmap) {
            // 移除旧的事件监听器
            this.workloadHeatmap.off('mouseover');
            this.workloadHeatmap.off('mouseout');
            
            // 添加新的事件监听器
            this.workloadHeatmap.on('mouseover', (params) => {
                if (params.componentType === 'series') {
                    const selectedDate = new Date(params.data[0]);
                    if (!isNaN(selectedDate.getTime())) {
                        this.datePicker.valueAsDate = selectedDate;
                        this.updateGanttChart();
                    }
                }
            });

            this.workloadHeatmap.on('mouseout', () => {
                const today = new Date();
                this.datePicker.valueAsDate = today;
                this.updateGanttChart();
            });
        }
    }

    static updateGanttChart() {
        if (!this.ganttChart) return;

        const selectedDate = this.datePicker.valueAsDate;
        const startOfDay = new Date(selectedDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(selectedDate);
        endOfDay.setHours(23, 59, 59, 999);

        // 筛选当天的任务记录
        const history = appState.getHistory();
        const dayTasks = history.filter(record => {
            const recordDate = new Date(record.timestamp);
            return recordDate >= startOfDay && recordDate <= endOfDay;
        });

        // 如果没有数据，显示空状态
        if (dayTasks.length === 0) {
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
            this.ganttChart.setOption(option, true);
            return;
        }

        // 计算时间轴范围
        const sortedHistory = [...dayTasks].sort((a, b) => a.timestamp - b.timestamp);
        let timeRange = {
            start: new Date(sortedHistory[0].timestamp),
            end: new Date(sortedHistory[sortedHistory.length - 1].timestamp)
        };

        // 如果当前有活动任务且是今天的，将结束时间延伸到现在
        const activeEntry = appState.getActiveEntry();
        if (activeEntry && new Date(activeEntry.startTime).toDateString() === selectedDate.toDateString()) {
            timeRange.end = new Date();
        }

        // 获取任务列表
        const tasks = new Set();
        sortedHistory.forEach(entry => tasks.add(entry.taskName));
        if (activeEntry && new Date(activeEntry.startTime).toDateString() === selectedDate.toDateString()) {
            tasks.add(activeEntry.taskName);
        }
        const taskList = Array.from(tasks);

        // 构建系列数据
        const series = [];
        let currentStart = null;
        let currentTask = null;

        // 处理历史记录中的任务
        sortedHistory.forEach(entry => {
            if (entry.type === 'start' || entry.type === 'start_rest') {
                if (currentStart && currentTask) {
                    this.addSeriesItem(series, currentTask, currentStart, entry.timestamp, taskList);
                }
                currentStart = entry.timestamp;
                currentTask = entry;
            } else if ((entry.type === 'stop' || entry.type === 'stop_rest') && currentStart && currentTask) {
                this.addSeriesItem(series, currentTask, currentStart, entry.timestamp, taskList);
                currentStart = null;
                currentTask = null;
            }
        });

        // 添加当前活动的任务
        if (activeEntry && new Date(activeEntry.startTime).toDateString() === selectedDate.toDateString()) {
            this.addSeriesItem(series, activeEntry, activeEntry.startTime, Date.now(), taskList);
        }

        // 动态计算甘特图高度
        const isMobile = window.innerWidth <= 768;
        const itemHeight = isMobile ? 24 : 40;
        const minHeight = isMobile ? 200 : 300;
        const titleHeight = 40;
        const calculatedHeight = Math.max(minHeight, taskList.length * itemHeight + titleHeight);
        
        // 更新甘特图容器高度
        document.getElementById('ganttChart').style.height = `${calculatedHeight}px`;
        this.ganttChart.resize();

        // 更新图表配置
        const option = {
            animation: false,
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
                    }
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
                    overflow: 'truncate'
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
                        style: api.style()
                    };
                },
                encode: {
                    x: [1, 2],
                    y: 0
                },
                data: series
            }]
        };

        this.ganttChart.setOption(option, true);
    }

    static addSeriesItem(series, task, startTime, endTime, taskList) {
        const taskIndex = taskList.indexOf(task.taskName);
        if (taskIndex !== -1) {
            series.push({
                name: task.taskName,
                value: [
                    taskIndex,
                    new Date(startTime),
                    new Date(endTime),
                    task.taskId === REST_ID ? '休息' : task.taskName
                ],
                itemStyle: task.taskId === REST_ID ? {
                    color: getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-secondary').trim()
                } : {
                    color: getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-primary').trim()
                }
            });
        }
    }

    static createGanttChartOption(taskList, series, startOfDay, endOfDay) {
        const isMobile = window.innerWidth <= 768;
        return {
            animation: false,
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
                min: startOfDay,
                max: endOfDay,
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
                    }
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
                    overflow: 'truncate'
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
                        style: api.style()
                    };
                },
                encode: {
                    x: [1, 2],
                    y: 0
                },
                data: series
            }]
        };
    }

    static updateHeatmap() {
        if (!this.workloadHeatmap) return;

        const today = new Date();
        const yearAgo = new Date();
        yearAgo.setFullYear(today.getFullYear() - 1);

        // 初始化日期数据
        const dateData = new Map();
        for (let d = new Date(yearAgo); d <= today; d.setDate(d.getDate() + 1)) {
            dateData.set(d.toISOString().split('T')[0], 0);
        }

        // 计算每天的工作时长（分钟）
        const history = appState.getHistory();
        const sortedHistory = [...history].sort((a, b) => a.timestamp - b.timestamp);
        let currentStarts = {};

        sortedHistory.forEach(entry => {
            const date = new Date(entry.timestamp).toISOString().split('T')[0];
            
            if (entry.type === 'start' || entry.type === 'start_rest') {
                currentStarts[entry.taskId] = entry.timestamp;
            } else if (entry.type === 'stop' || entry.type === 'stop_rest') {
                const startTime = currentStarts[entry.taskId];
                if (startTime) {
                    const duration = (entry.timestamp - startTime) / (1000 * 60);
                    if (entry.taskId !== REST_ID && dateData.has(date)) {
                        dateData.set(date, (dateData.get(date) || 0) + duration);
                    }
                    delete currentStarts[entry.taskId];
                }
            }
        });

        // 添加当前活动的时长
        const activeEntry = appState.getActiveEntry();
        if (activeEntry && activeEntry.taskId !== REST_ID) {
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

        const option = this.createHeatmapOption(heatmapData, yearAgo, today);
        this.workloadHeatmap.setOption(option, true);
    }

    static createHeatmapOption(heatmapData, yearAgo, today) {
        // 计算布局参数
        const container = document.getElementById('workloadHeatmap');
        const padding = { left: 50, right: 30, top: 40, bottom: 80 };
        const usableWidth = container.clientWidth - padding.left - padding.right;
        const usableHeight = container.clientHeight - padding.top - padding.bottom;

        const weeks = 53;
        const days = 7;
        
        const cellByWidth = Math.floor((usableWidth - 40) / weeks);
        const cellByHeight = Math.floor(usableHeight / days);
        const cellSize = Math.max(Math.min(cellByWidth, cellByHeight), 24);

        const totalWidth = cellSize * weeks;
        const newLeft = Math.max(padding.left, Math.floor((container.clientWidth - totalWidth) / 2));

        return {
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
                max: Math.max(...heatmapData.map(item => item[1])),
                calculable: true,
                orient: 'horizontal',
                left: 'center',
                bottom: 10,
                itemWidth: 16,
                itemHeight: 60,
                textStyle: {
                    fontSize: 12,
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
                top: padding.top,
                left: newLeft,
                right: padding.right,
                bottom: padding.bottom,
                cellSize: [cellSize, cellSize],
                range: [yearAgo.toISOString().split('T')[0], today.toISOString().split('T')[0]],
                itemStyle: {
                    borderWidth: 1,
                    borderColor: getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-outline-variant').trim(),
                },
                splitLine: { show: false },
                yearLabel: { show: false },
                monthLabel: {
                    nameMap: 'cn',
                    fontSize: 12,
                    align: 'center',
                    margin: 12,
                    padding: [12, 4, 4, 4],
                    color: getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-on-surface-variant').trim()
                },
                dayLabel: {
                    firstDay: 1,
                    nameMap: ['日', '一', '二', '三', '四', '五', '六'],
                    fontSize: 12,
                    margin: 8,
                    color: getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-on-surface-variant').trim()
                }
            },
            series: {
                type: 'heatmap',
                coordinateSystem: 'calendar',
                data: heatmapData
            }
        };
    }
}

export default Charts;