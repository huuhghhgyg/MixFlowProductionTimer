import Storage from './storage.js'; // 确保导入 Storage
import { REST_ID, STORAGE_KEYS } from './constants.js'; // 导入 STORAGE_KEYS

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
        this.reloadScheduled = false;
        this.notificationListenersReady = false;
        this.pendingNotifications = [];
        // loadData 现在是异步的，但构造函数不能是异步的。
        // 我们将启动加载过程，但依赖于一个单独的初始化函数来确保在使用 appState 之前数据已加载。
        // this.loadData(); // 不再在构造函数中直接调用
        
        // 添加页面可见性变化监听
        document.addEventListener('visibilitychange', this.handleVisibilityChange.bind(this));
    }

    async loadData() {
        await Storage.loadDataFolderHandle(); // 首先加载文件夹句柄
        this.tasks = await Storage.getTasks() || [];
        this.history = await Storage.getHistory() || [];
        this.activeEntry = await Storage.getActiveEntry();
        const loadedTimerSettings = await Storage.getTimerSettings();
        // 合并加载的设置和默认设置，以防某些键丢失
        this.timerSettings = { ...this.timerSettings, ...loadedTimerSettings };
        
        // 如果有活动的任务，设置提醒和超时
        if (this.activeEntry) {
            this.setupTimers();
        }
    }

    async saveData() {
        await Storage.saveTasks(this.tasks);
        await Storage.saveHistory(this.history);
        await Storage.saveActiveEntry(this.activeEntry);
        await Storage.saveTimerSettings(this.timerSettings);
    }

    async addTask(taskName) {
        const task = {
            id: crypto.randomUUID(),
            name: taskName
        };
        this.tasks.push(task);
        await this.saveData();
        return task;
    }

    async deleteTask(taskId) {
        if (this.activeEntry?.taskId === taskId) {
            // 如果删除的是活动任务，先停止它
            await this.stopTask(taskId, false, () => {
                console.log(`Task ${taskId} stopped as part of deletion.`);
            }); 
        }
        this.tasks = this.tasks.filter(task => task.id !== taskId);
        await this.saveData();
    }

    async startTask(taskId, taskName, onStartedCallback) { // Add onStartedCallback
        // 如果有活动任务，先停止它
        if (this.activeEntry) {
            await this.stopTask(this.activeEntry.taskId, true, () => {
                console.log(`Previous task ${this.activeEntry?.taskName} stopped to start new task ${taskName}.`);
                // 旧任务停止后的特定UI更新（如果需要的话）可以在这里，
                // 但主要的“新任务已启动”的UI更新由 onStartedCallback 负责。
                // 通常，我们可能只需要确保任务列表等已刷新。
                // document.dispatchEvent(new CustomEvent('mfpt:coreTaskStoppedForNew', { detail: { taskId: this.activeEntry.taskId } }));
            }); 
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
        });        // 设置定时器
        this.setupTimers();
          // 先调用回调函数更新UI，让用户立即看到变化
        if (onStartedCallback && typeof onStartedCallback === 'function') {
            onStartedCallback();
        }

        // 使用setTimeout让保存操作完全异步，不阻塞UI
        setTimeout(async () => {
            try {
                await this.saveData();
            } catch (error) {
                console.error('保存数据时出错:', error);
            }
        }, 0);
        
        // 记录开始任务的调试信息
        console.debug(`Task started: ${taskName} (ID: ${taskId}) at ${new Date(this.activeEntry.startTime).toLocaleTimeString()}`);
    }

    async stopTask(taskId, normalStop = true, onStoppedCallback) { // Add onStoppedCallback
        if (!this.activeEntry || this.activeEntry.taskId !== taskId) {
            console.warn("Attempted to stop a task that is not active or does not match.");
            if (onStoppedCallback && typeof onStoppedCallback === 'function') {
                onStoppedCallback(false); // Indicate failure or no-op
            }
            return;
        }

        const endTime = Date.now();
        const duration = endTime - this.activeEntry.startTime;

        if (normalStop) {
            this.history.push({
                taskId: this.activeEntry.taskId,
                taskName: this.activeEntry.taskName,
                type: this.activeEntry.taskId === REST_ID ? 'stop_rest' : 'stop',
                timestamp: endTime,
                duration: duration
            });
        }        const stoppedTaskName = this.activeEntry.taskName;
        this.activeEntry = null;
        this.clearTimers();
          // 先调用回调函数更新UI，让用户立即看到变化
        if (onStoppedCallback && typeof onStoppedCallback === 'function') {
            onStoppedCallback(true); // Indicate success
        }

        // 使用setTimeout让保存操作完全异步，不阻塞UI
        setTimeout(async () => {
            try {
                await this.saveData();
            } catch (error) {
                console.error('保存数据时出错:', error);
            }
        }, 0);

        console.debug(`Task stopped: ${stoppedTaskName} (ID: ${taskId}) at ${new Date(endTime).toLocaleTimeString()}. Duration: ${duration}ms`);
        
        // 派发任务停止事件（仅在需要通知其他组件时使用）
        document.dispatchEvent(new CustomEvent('mfpt:taskStopped', { 
            detail: { 
                taskId: taskId, 
                taskName: stoppedTaskName, 
                duration: duration 
            } 
        }));
    }

    async clearHistory() {
        this.history = [];
        await this.saveData();
    }

    async clearAllData() {
        this.tasks = [];
        this.history = [];
        this.activeEntry = null;
        // 不清除定时器设置和文件夹句柄
        // this.timerSettings = { ... }; 
        await Storage.clearAllData(); // 调用 Storage 的 clearAllData
        // 清除后重新加载数据（主要为了确保 timerSettings 等从 localStorage 或默认值加载）
        await this.loadData(); 
    }

    getTasks() {
        return [...this.tasks];
    }

    getHistory(options = {}) {
        const {
            newestFirst = false,
            limit = null,
            offset = 0
        } = options;

        let historyData = [...this.history];

        // 按需截取片段，避免一次性返回全部
        if (typeof limit === 'number' && limit > 0) {
            const start = Math.max(historyData.length - offset - limit, 0);
            const end = Math.max(historyData.length - offset, 0);
            historyData = historyData.slice(start, end);
        } else if (offset > 0) {
            // 没有限制但有偏移，从末尾偏移开始
            const end = Math.max(historyData.length - offset, 0);
            historyData = historyData.slice(0, end);
        }

        if (newestFirst) {
            historyData = historyData.reverse();
        }

        return historyData;
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
            
            // 计算实际的停止时间（开始时间 + 超时时间）
            const stopTime = startTime + (this.timerSettings.timeoutMinutes * 60 * 1000);
            
            // 记录停止事件，使用超时时间点而不是当前时间
            this.history.push({
                taskId: this.activeEntry.taskId,
                taskName: this.activeEntry.taskName,
                type: 'stop',
                timestamp: stopTime
            });

            const stoppedTaskId = this.activeEntry.taskId;
            const stoppedTaskName = this.activeEntry.taskName;

            this.showNotification('超时警告', `任务"${stoppedTaskName}"已超过${this.timerSettings.timeoutMinutes}分钟，任务已停止`);

            // 先清空活动任务和定时器，再派发事件，确保UI能正确更新
            this.activeEntry = null;
            this.clearTimers();

            // 在停止任务事件中也使用超时时间点
            document.dispatchEvent(new CustomEvent('mfpt:taskStopped', {
                detail: {
                    taskId: stoppedTaskId,
                    taskName: stoppedTaskName,
                    duration: this.timerSettings.timeoutMinutes * 60 * 1000
                }
            }));

            this.saveData();
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
                    // 先刷新页面，由初始化阶段统一处理超时结算和通知
                    console.log("触发超时，准备刷新后进行结算");
                    this.scheduleTimeoutReload();
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
            
            // 计算实际的停止时间（开始时间 + 超时时间）
            const stopTime = this.activeEntry.startTime + (this.timerSettings.timeoutMinutes * 60 * 1000);
            
            // 记录停止事件，使用超时时间点而不是当前时间
            this.history.push({
                taskId: this.activeEntry.taskId,
                taskName: this.activeEntry.taskName,
                type: 'stop',
                timestamp: stopTime
            });

            const stoppedTaskId = this.activeEntry.taskId;
            const stoppedTaskName = this.activeEntry.taskName;

            this.showNotification('超时警告', `任务"${stoppedTaskName}"已超过${this.timerSettings.timeoutMinutes}分钟，任务已停止`);
            
            // 先清空活动任务，再派发事件，确保UI能正确更新
            this.activeEntry = null;
            this.clearTimers();
            
            // 在停止任务事件中也使用超时时间点
            document.dispatchEvent(new CustomEvent('mfpt:taskStopped', {
                detail: {
                    taskId: stoppedTaskId,
                    taskName: stoppedTaskName,
                    duration: this.timerSettings.timeoutMinutes * 60 * 1000
                }
            }));

            this.saveData();
            return;
        }
        
        // 重新设置定时器
        this.clearTimers();
        this.setupTimers();
    }

    scheduleTimeoutReload() {
        if (this.reloadScheduled) return;

        this.reloadScheduled = true;
        // 略微延迟以确保保存动作完成，再触发页面刷新
        setTimeout(() => {
            window.location.reload();
        }, 500);
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
        const notificationDetail = { title, message, timestamp: Date.now() };
        
        if (this.notificationListenersReady) {
            document.dispatchEvent(new CustomEvent('mfpt:notification', {
                detail: notificationDetail
            }));
        } else {
            // 缓存通知，待 UI 监听器就绪后再派发
            this.pendingNotifications.push(notificationDetail);
        }
        
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

    markNotificationListenersReady() {
        this.notificationListenersReady = true;

        if (this.pendingNotifications.length === 0) return;

        // 派发在 UI 就绪前积压的通知
        this.pendingNotifications.forEach(notification => {
            document.dispatchEvent(new CustomEvent('mfpt:notification', {
                detail: notification
            }));
        });
        this.pendingNotifications = [];
    }

    getTimerSettings() {
        return this.timerSettings;
    }

    async setDataFolder(handle) {
        await Storage.setDataFolderHandle(handle);
        // 数据源已更改，重新加载所有数据
        await this.loadData();
        // 可能需要触发UI更新事件
        document.dispatchEvent(new CustomEvent('mfpt:dataLocationChanged'));
    }

    getDataFolderHandle() {
        return Storage.dataFolderHandle;
    }
}

// 创建单例实例
const appState = new AppState();

// 异步初始化函数
export async function initializeAppState() {
    await appState.loadData();
    // 可以在这里添加其他异步初始化步骤
    console.log("AppState initialized and data loaded.");
}

export { REST_ID, appState }; // 导出 appState 实例
export default appState; // 默认导出也保留，以防现有用法
