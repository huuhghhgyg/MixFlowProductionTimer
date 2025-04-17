import Storage from './storage.js';

export const REST_ID = 'rest';

class AppState {
    constructor() {
        this.tasks = [];
        this.history = [];
        this.activeEntry = null;
        this.loadData();
    }

    loadData() {
        this.tasks = Storage.getTasks() || [];
        this.history = Storage.getHistory() || [];
        this.activeEntry = Storage.getActiveEntry();
    }

    saveData() {
        Storage.saveTasks(this.tasks);
        Storage.saveHistory(this.history);
        Storage.saveActiveEntry(this.activeEntry);
    }

    addTask(taskName) {
        const task = {
            id: crypto.randomUUID(),
            name: taskName
        };
        this.tasks.push(task);
        this.saveData();
        return task;
    }

    deleteTask(taskId) {
        if (this.activeEntry?.taskId === taskId) {
            this.stopTask(taskId);
        }
        this.tasks = this.tasks.filter(task => task.id !== taskId);
        this.saveData();
    }

    startTask(taskId, taskName) {
        // 如果有活动任务，先停止它
        if (this.activeEntry) {
            this.stopTask(this.activeEntry.taskId);
        }

        // 创建新的活动任务
        this.activeEntry = {
            taskId,
            taskName,
            startTime: Date.now()
        };

        // 记录开始事件
        this.history.push({
            taskId,
            taskName,
            type: taskId === REST_ID ? 'start_rest' : 'start',
            timestamp: this.activeEntry.startTime
        });

        this.saveData();
    }

    stopTask(taskId) {
        if (!this.activeEntry || this.activeEntry.taskId !== taskId) {
            return;
        }

        const now = Date.now();
        
        // 记录停止事件
        this.history.push({
            taskId,
            taskName: this.activeEntry.taskName,
            type: taskId === REST_ID ? 'stop_rest' : 'stop',
            timestamp: now
        });

        this.activeEntry = null;
        this.saveData();
    }

    clearHistory() {
        if (this.activeEntry) {
            this.stopTask(this.activeEntry.taskId);
        }
        this.history = [];
        this.saveData();
    }

    clearAllData() {
        if (this.activeEntry) {
            this.stopTask(this.activeEntry.taskId);
        }
        this.tasks = [];
        this.history = [];
        this.activeEntry = null;
        this.saveData();
    }

    getTasks() {
        return [...this.tasks];
    }

    getHistory() {
        return [...this.history];
    }

    getActiveEntry() {
        return this.activeEntry;
    }
}

// 创建并导出单例实例
const appState = new AppState();
export default appState;