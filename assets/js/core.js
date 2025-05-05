import Storage from './storage.js';
import { REST_ID } from './constants.js';

// 移除 uiInstance 的导入
export const STORAGE_KEYS = {
    TASKS: 'mfpt_tasks',
    HISTORY: 'mfpt_history',
    ACTIVE_ENTRY: 'mfpt_active_entry',
    TIMER_SETTINGS: 'mfpt_timer_settings'
};

class AppState {
    constructor() {
        this.tasks = [];
        this.history = [];
        this.activeEntry = null;
        this.timerSettings = {
            reminderEnabled: true,
            reminderMinutes: 30,
            timeoutEnabled: true,
            timeoutMinutes: 60
        };
        this.reminderTimeout = null;
        this.timeoutTimeout = null;
        this.loadData();
        
        // 添加页面可见性变化监听
        document.addEventListener('visibilitychange', this.handleVisibilityChange.bind(this));
    }

    loadData() {
        this.tasks = Storage.getTasks() || [];
        this.history = Storage.getHistory() || [];
        this.activeEntry = Storage.getActiveEntry();
        this.timerSettings = Storage.getTimerSettings();
        
        // 如果有活动的任务，设置提醒和超时
        if (this.activeEntry) {
            this.setupTimers();
        }
    }

    saveData() {
        Storage.saveTasks(this.tasks);
        Storage.saveHistory(this.history);
        Storage.saveActiveEntry(this.activeEntry);
        Storage.saveTimerSettings(this.timerSettings);
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

        // 设置定时器
        this.setupTimers();

        this.saveData();
        
        // 记录开始任务的调试信息
        console.log(`任务 "${taskName}" 已开始，设置了提醒：${this.timerSettings.reminderEnabled ? this.timerSettings.reminderMinutes + '分钟' : '禁用'}, 超时：${this.timerSettings.timeoutEnabled ? this.timerSettings.timeoutMinutes + '分钟' : '禁用'}`);
    }

    stopTask(taskId) {
        if (!this.activeEntry || this.activeEntry.taskId !== taskId) {
            return;
        }

        // 清除定时器
        this.clearTimers();

        const now = Date.now();
        
        // 记录停止事件
        this.history.push({
            taskId,
            taskName: this.activeEntry.taskName,
            type: taskId === REST_ID ? 'stop_rest' : 'stop',
            timestamp: now
        });

        // 触发任务停止事件
        document.dispatchEvent(new CustomEvent('mfpt:taskStopped', {
            detail: {
                taskId,
                taskName: this.activeEntry.taskName,
                duration: now - this.activeEntry.startTime
            }
        }));

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

    updateTimerSettings(settings) {
        this.timerSettings = { ...this.timerSettings, ...settings };
        this.saveData();
        
        // 如果有活动任务，重新设置定时器
        if (this.activeEntry) {
            this.clearTimers();
            this.setupTimers();
        }
        
        console.log("定时器设置已更新:", this.timerSettings);
    }

    setupTimers() {
        if (!this.activeEntry) return;

        // 如果当前是休息任务，不设置提醒和超时定时器
        if (this.activeEntry.taskId === REST_ID) {
            console.log("当前为休息任务，不设置提醒和超时定时器");
            return;
        }

        const startTime = this.activeEntry.startTime;
        const now = Date.now();
        const elapsedMinutes = (now - startTime) / (1000 * 60);

        // 如果已经超时，直接停止任务
        if (this.timerSettings.timeoutEnabled && elapsedMinutes >= this.timerSettings.timeoutMinutes) {
            console.log("检测到任务已超时，直接停止");
            this.showNotification('超时警告', `任务"${this.activeEntry.taskName}"已超过${this.timerSettings.timeoutMinutes}分钟，任务已停止`);
            // 触发停止任务事件
            document.dispatchEvent(new CustomEvent('mfpt:stopTask', {
                detail: { taskId: this.activeEntry.taskId }
            }));
            return;
        }

        // 设置提醒定时器
        if (this.timerSettings.reminderEnabled) {
            const reminderMinutesLeft = this.timerSettings.reminderMinutes - elapsedMinutes;
            
            // 如果提醒时间尚未到达
            if (reminderMinutesLeft > 0) {
                console.log(`设置提醒: ${reminderMinutesLeft.toFixed(2)}分钟后触发`);
                this.reminderTimeout = setTimeout(() => {
                    // 发送提醒通知
                    console.log("触发提醒通知");
                    this.showNotification('提醒', `任务"${this.activeEntry.taskName}"已经进行了${this.timerSettings.reminderMinutes}分钟`);
                }, reminderMinutesLeft * 60 * 1000);
            }
            // 如果已经超过提醒时间，但尚未提醒过
            else if (Math.abs(reminderMinutesLeft) < 0.5) { // 允许0.5分钟的误差
                console.log("已超过提醒时间，立即发送通知");
                this.showNotification('提醒', `任务"${this.activeEntry.taskName}"已经进行了${this.timerSettings.reminderMinutes}分钟`);
            }
        }

        // 设置超时定时器
        if (this.timerSettings.timeoutEnabled) {
            const timeoutMinutesLeft = this.timerSettings.timeoutMinutes - elapsedMinutes;
            
            // 如果超时时间尚未到达
            if (timeoutMinutesLeft > 0) {
                console.log(`设置超时: ${timeoutMinutesLeft.toFixed(2)}分钟后触发`);
                this.timeoutTimeout = setTimeout(() => {
                    // 发送超时通知并停止任务
                    console.log("触发超时，停止任务");
                    this.showNotification('超时警告', `任务"${this.activeEntry.taskName}"已超过${this.timerSettings.timeoutMinutes}分钟，任务已停止`);
                    
                    // 触发停止任务事件
                    document.dispatchEvent(new CustomEvent('mfpt:stopTask', {
                        detail: { taskId: this.activeEntry.taskId }
                    }));
                }, timeoutMinutesLeft * 60 * 1000);
            }
        }

        // 存储上次检查时间
        this.lastTimerCheckTime = now;
    }

    // 处理页面可见性变化
    handleVisibilityChange() {
        if (document.visibilityState === 'visible') {
            console.log('页面变为可见，检查是否需要更新定时器');
            this.checkTimersOnVisibilityChange();
        } else {
            console.log('页面隐藏，记录隐藏时间');
            // 记录页面隐藏时间
            this.pageHiddenTime = Date.now();
        }
    }

    // 当页面重新可见时检查定时器状态
    checkTimersOnVisibilityChange() {
        if (!this.activeEntry || this.activeEntry.taskId === REST_ID) return;

        // 计算页面不可见期间经过的时间
        const now = Date.now();
        const elapsedMinutes = (now - this.activeEntry.startTime) / (1000 * 60);

        console.log(`当前已计时: ${elapsedMinutes.toFixed(2)}分钟`);
        
        // 检查是否应该已经触发提醒
        if (this.timerSettings.reminderEnabled && 
            elapsedMinutes >= this.timerSettings.reminderMinutes && 
            Math.abs(elapsedMinutes - this.timerSettings.reminderMinutes) < 5) { // 允许5分钟的误差范围
            console.log("页面恢复后发现应该触发提醒");
            this.showNotification('提醒', `任务"${this.activeEntry.taskName}"已经进行了${this.timerSettings.reminderMinutes}分钟`);
        }
        
        // 检查是否应该已经超时
        if (this.timerSettings.timeoutEnabled && elapsedMinutes >= this.timerSettings.timeoutMinutes) {
            console.log("页面恢复后发现任务已超时");
            this.showNotification('超时警告', `任务"${this.activeEntry.taskName}"已超过${this.timerSettings.timeoutMinutes}分钟，任务已停止`);
            
            // 触发停止任务事件
            document.dispatchEvent(new CustomEvent('mfpt:stopTask', {
                detail: { taskId: this.activeEntry.taskId }
            }));
            return;
        }
        
        // 重新设置定时器
        this.clearTimers();
        this.setupTimers();
    }

    clearTimers() {
        if (this.reminderTimeout) {
            clearTimeout(this.reminderTimeout);
            this.reminderTimeout = null;
        }
        if (this.timeoutTimeout) {
            clearTimeout(this.timeoutTimeout);
            this.timeoutTimeout = null;
        }
    }

    showNotification(title, message) {
        console.log(`发送通知: ${title} - ${message}`);
        
        // 触发自定义事件，用于显示内联通知
        document.dispatchEvent(new CustomEvent('mfpt:notification', {
            detail: { title, message, timestamp: Date.now() }
        }));

        // 尝试发送系统通知
        if ('Notification' in window) {
            if (Notification.permission === 'granted') {
                try {
                    // 修复图标路径问题，使用绝对路径或相对于站点根目录的路径
                    const iconUrl = new URL('assets/icons/android-chrome-192x192.png', window.location.origin).href;
                    
                    // 创建系统通知
                    const notification = new Notification(title, { 
                        body: message,
                        icon: iconUrl,
                        tag: 'mfpt-notification', // 添加tag以避免重复通知
                        requireInteraction: true, // 保持通知直到用户交互
                        silent: false // 确保有声音
                    });
                    
                    // 添加通知事件处理
                    notification.onclick = () => {
                        // 聚焦当前窗口
                        window.focus();
                        notification.close();
                    };
                    
                    console.log("系统通知已发送");
                } catch (error) {
                    console.error("发送系统通知失败:", error);
                }
            } else if (Notification.permission !== 'denied') {
                // 如果权限不是已拒绝，而是默认状态，尝试请求权限
                console.log("尝试请求通知权限");
                Notification.requestPermission().then(permission => {
                    if (permission === 'granted') {
                        // 权限获取后，重新尝试发送通知
                        this.showNotification(title, message);
                    }
                });
            } else {
                console.log(`通知权限已被拒绝: ${Notification.permission}`);
            }
        } else {
            console.log("该浏览器不支持系统通知");
        }
    }

    getTimerSettings() {
        return { ...this.timerSettings };
    }
}

// 创建并导出单例实例
const appState = new AppState();
export { REST_ID };
export default appState;