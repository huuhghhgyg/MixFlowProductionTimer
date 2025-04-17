// 数据持久化相关功能
const STORAGE_KEYS = {
    TASKS: 'mfpt_tasks',
    HISTORY: 'mfpt_history',
    ACTIVE_ENTRY: 'mfpt_active_entry'
};

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

    saveTasks(tasks) {
        localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(tasks));
    },

    saveHistory(history) {
        localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(history));
    },

    saveActiveEntry(activeEntry) {
        localStorage.setItem(STORAGE_KEYS.ACTIVE_ENTRY, JSON.stringify(activeEntry));
    },

    clearAllData() {
        localStorage.removeItem(STORAGE_KEYS.TASKS);
        localStorage.removeItem(STORAGE_KEYS.HISTORY);
        localStorage.removeItem(STORAGE_KEYS.ACTIVE_ENTRY);
    }
};

export default Storage;