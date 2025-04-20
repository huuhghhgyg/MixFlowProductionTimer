// 数据持久化相关功能
import { STORAGE_KEYS } from './constants.js';

const Storage = {
    getTasks() {
        const storedTasks = localStorage.getItem(STORAGE_KEYS.TASKS);
        return storedTasks ? JSON.parse(storedTasks) : [];
    },

    getHistory() {
        const storedHistory = localStorage.getItem(STORAGE_KEYS.HISTORY);
        return storedHistory ? JSON.parse(storedHistory) : [];
    },

    getActiveEntry() {
        const storedEntry = localStorage.getItem(STORAGE_KEYS.ACTIVE_ENTRY);
        return storedEntry ? JSON.parse(storedEntry) : null;
    },

    getTimerSettings() {
        const storedSettings = localStorage.getItem(STORAGE_KEYS.TIMER_SETTINGS);
        return storedSettings ? JSON.parse(storedSettings) : {
            reminderEnabled: true,
            reminderMinutes: 30,
            timeoutEnabled: true,
            timeoutMinutes: 60
        };
    },

    saveTasks(tasks) {
        localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(tasks));
    },

    saveHistory(history) {
        localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(history));
    },

    saveActiveEntry(activeEntry) {
        localStorage.setItem(STORAGE_KEYS.ACTIVE_ENTRY, JSON.stringify(activeEntry));
    },

    saveTimerSettings(settings) {
        localStorage.setItem(STORAGE_KEYS.TIMER_SETTINGS, JSON.stringify(settings));
    },

    clearAllData() {
        localStorage.removeItem(STORAGE_KEYS.TASKS);
        localStorage.removeItem(STORAGE_KEYS.HISTORY);
        localStorage.removeItem(STORAGE_KEYS.ACTIVE_ENTRY);
        // 保留定时器设置
        // localStorage.removeItem(STORAGE_KEYS.TIMER_SETTINGS);
    }
};

export default Storage;