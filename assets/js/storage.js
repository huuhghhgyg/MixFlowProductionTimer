// 数据持久化相关功能
import { STORAGE_KEYS } from './constants.js';

// 文件系统访问 API 的辅助函数
async function getFileHandle(directoryHandle, fileName, create = false) {
    try {
        return await directoryHandle.getFileHandle(fileName, { create });
    } catch (error) {
        console.error(`Error getting file handle for ${fileName}:`, error);
        throw error;
    }
}

async function readFile(fileHandle) {
    try {
        const file = await fileHandle.getFile();
        const contents = await file.text();
        return JSON.parse(contents);
    } catch (error) {
        // 如果文件不存在或为空，可以返回一个默认值，例如 null 或空数组
        if (error.name === 'NotFoundError' || error instanceof SyntaxError) {
            console.warn(`File not found or empty, returning default for ${fileHandle.name}`);
            return null; 
        }
        console.error(`Error reading file ${fileHandle.name}:`, error);
        throw error;
    }
}

async function writeFile(fileHandle, data) {
    try {
        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify(data, null, 2)); // 美化JSON输出
        await writable.close();
    } catch (error) {
        console.error(`Error writing file ${fileHandle.name}:`, error);
        throw error;
    }
}

const Storage = {
    dataFolderHandle: null, // 用于存储文件夹句柄

    async setDataFolderHandle(handle) {
        this.dataFolderHandle = handle;
        if (handle) {
            // 将句柄保存到 IndexedDB 以便持久化
            await this.saveDataFolderHandleToIndexedDB(handle);
        } else {
            // 如果句柄为空，则从 IndexedDB 中删除
            await this.removeDataFolderHandleFromIndexedDB();
        }
    },

    async loadDataFolderHandle() {
        try {
            const handle = await this.getDataFolderHandleFromIndexedDB();
            if (handle) {
                // 校验权限
                if (await handle.queryPermission({ mode: 'readwrite' }) === 'granted') {
                    this.dataFolderHandle = handle;
                    return handle;
                } else {
                    // 尝试请求权限
                    if (await handle.requestPermission({ mode: 'readwrite' }) === 'granted') {
                        this.dataFolderHandle = handle;
                        return handle;
                    }
                    console.warn("Permission to access data folder denied.");
                    this.dataFolderHandle = null; // 权限不足，重置句柄
                    await this.removeDataFolderHandleFromIndexedDB(); // 清除无效句柄
                    return null;
                }
            }
        } catch (error) {
            console.error("Error loading data folder handle from IndexedDB:", error);
        }
        this.dataFolderHandle = null;
        return null;
    },
    
    // 使用 IndexedDB 存储文件夹句柄
    async saveDataFolderHandleToIndexedDB(handle) {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('MFPT_DB', 1);
            request.onupgradeneeded = event => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('fileHandles')) {
                    db.createObjectStore('fileHandles');
                }
            };
            request.onsuccess = event => {
                const db = event.target.result;
                const transaction = db.transaction('fileHandles', 'readwrite');
                const store = transaction.objectStore('fileHandles');
                store.put(handle, STORAGE_KEYS.DATA_FOLDER_HANDLE);
                transaction.oncomplete = () => resolve();
                transaction.onerror = () => reject(transaction.error);
            };
            request.onerror = () => reject(request.error);
        });
    },

    async getDataFolderHandleFromIndexedDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('MFPT_DB', 1);
            // 注意：onupgradeneeded 应该在这里也定义，以防数据库首次创建
            request.onupgradeneeded = event => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('fileHandles')) {
                    db.createObjectStore('fileHandles');
                }
            };
            request.onsuccess = event => {
                const db = event.target.result;
                // 检查对象存储是否存在，以避免在数据库版本升级但尚未创建存储时出错
                if (!db.objectStoreNames.contains('fileHandles')) {
                    console.warn('fileHandles object store not found. Returning null for folder handle.');
                    resolve(null); // 或者可以尝试创建它，但这通常在 onupgradeneeded 中完成
                    return;
                }
                const transaction = db.transaction('fileHandles', 'readonly');
                const store = transaction.objectStore('fileHandles');
                const getRequest = store.get(STORAGE_KEYS.DATA_FOLDER_HANDLE);
                getRequest.onsuccess = () => resolve(getRequest.result || null);
                getRequest.onerror = () => reject(getRequest.error);
                transaction.onerror = () => reject(transaction.error); // 添加事务错误处理
            };
            request.onerror = () => reject(request.error);
        });
    },

    async removeDataFolderHandleFromIndexedDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('MFPT_DB', 1);
            request.onupgradeneeded = event => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('fileHandles')) {
                    db.createObjectStore('fileHandles');
                }
            };
            request.onsuccess = event => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('fileHandles')) {
                     resolve(); // 如果存储区不存在，则无需执行任何操作
                     return;
                }
                const transaction = db.transaction('fileHandles', 'readwrite');
                const store = transaction.objectStore('fileHandles');
                store.delete(STORAGE_KEYS.DATA_FOLDER_HANDLE);
                transaction.oncomplete = () => resolve();
                transaction.onerror = () => reject(transaction.error);
            };
            request.onerror = () => reject(request.error);
        });
    },

    async getTasks() {
        if (this.dataFolderHandle) {
            try {
                const fileHandle = await getFileHandle(this.dataFolderHandle, 'tasks.json');
                const tasks = await readFile(fileHandle);
                return tasks || []; // 如果文件不存在或为空，返回空数组
            } catch (error) {
                console.warn("Failed to load tasks from file system, falling back to localStorage", error);
                // Fallback to localStorage if file system access fails
            }
        }
        const storedTasks = localStorage.getItem(STORAGE_KEYS.TASKS);
        return storedTasks ? JSON.parse(storedTasks) : [];
    },

    async getHistory() {
        if (this.dataFolderHandle) {
            try {
                const fileHandle = await getFileHandle(this.dataFolderHandle, 'history.json');
                const history = await readFile(fileHandle);
                return history || [];
            } catch (error) {
                console.warn("Failed to load history from file system, falling back to localStorage", error);
            }
        }
        const storedHistory = localStorage.getItem(STORAGE_KEYS.HISTORY);
        return storedHistory ? JSON.parse(storedHistory) : [];
    },

    async getActiveEntry() {
        if (this.dataFolderHandle) {
            try {
                const fileHandle = await getFileHandle(this.dataFolderHandle, 'activeEntry.json');
                return await readFile(fileHandle);
            } catch (error) {
                console.warn("Failed to load active entry from file system, falling back to localStorage", error);
            }
        }
        const storedEntry = localStorage.getItem(STORAGE_KEYS.ACTIVE_ENTRY);
        return storedEntry ? JSON.parse(storedEntry) : null;
    },

    async getTimerSettings() {
        if (this.dataFolderHandle) {
            try {
                const fileHandle = await getFileHandle(this.dataFolderHandle, 'timerSettings.json');
                const settings = await readFile(fileHandle);
                return settings || { reminderEnabled: true, reminderMinutes: 30, timeoutEnabled: true, timeoutMinutes: 60 };
            } catch (error) {
                console.warn("Failed to load timer settings from file system, falling back to localStorage", error);
            }
        }
        const storedSettings = localStorage.getItem(STORAGE_KEYS.TIMER_SETTINGS);
        return storedSettings ? JSON.parse(storedSettings) : {
            reminderEnabled: true,
            reminderMinutes: 30,
            timeoutEnabled: true,
            timeoutMinutes: 60
        };
    },

    async saveTasks(tasks) {
        if (this.dataFolderHandle) {
            try {
                const fileHandle = await getFileHandle(this.dataFolderHandle, 'tasks.json', true);
                await writeFile(fileHandle, tasks);
                return;
            } catch (error) {
                console.error("Failed to save tasks to file system, saving to localStorage instead", error);
            }
        }
        localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(tasks));
    },

    async saveHistory(history) {
        if (this.dataFolderHandle) {
            try {
                const fileHandle = await getFileHandle(this.dataFolderHandle, 'history.json', true);
                await writeFile(fileHandle, history);
                return;
            } catch (error) {
                console.error("Failed to save history to file system, saving to localStorage instead", error);
            }
        }
        localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(history));
    },

    async saveActiveEntry(activeEntry) {
        if (this.dataFolderHandle) {
            try {
                const fileHandle = await getFileHandle(this.dataFolderHandle, 'activeEntry.json', true);
                await writeFile(fileHandle, activeEntry);
                return;
            } catch (error) {
                console.error("Failed to save active entry to file system, saving to localStorage instead", error);
            }
        }
        localStorage.setItem(STORAGE_KEYS.ACTIVE_ENTRY, JSON.stringify(activeEntry));
    },    async saveTimerSettings(settings) {
        if (this.dataFolderHandle) {
            try {
                const fileHandle = await getFileHandle(this.dataFolderHandle, 'timerSettings.json', true);
                await writeFile(fileHandle, settings);
                return;
            } catch (error) {
                console.error("Failed to save timer settings to file system, saving to localStorage instead", error);
            }
        }
        localStorage.setItem(STORAGE_KEYS.TIMER_SETTINGS, JSON.stringify(settings));
    },    async getThemeSettings() {
        // 主题设置始终存储在浏览器内部，不存储到外部文件夹
        const data = localStorage.getItem(STORAGE_KEYS.THEME_SETTINGS);
        return data ? JSON.parse(data) : null;
    },    async saveThemeSettings(settings) {
        // 主题设置始终存储在浏览器内部，不存储到外部文件夹
        localStorage.setItem(STORAGE_KEYS.THEME_SETTINGS, JSON.stringify(settings));
    },

    async clearAllData() {
        if (this.dataFolderHandle) {
            try {
                // 删除文件系统中的文件
                const filesToDelete = ['tasks.json', 'history.json', 'activeEntry.json'];
                for (const fileName of filesToDelete) {
                    try {
                        const fileHandle = await this.dataFolderHandle.getFileHandle(fileName);
                        // FileSystemFileHandle 没有直接的 delete 方法，需要通过其父目录的 removeEntry
                        // 然而，removeEntry 也不是标准API的一部分，并且可能不可用。
                        // 一个更可靠的方法是写入空内容或特定标记来表示数据已清除。
                        // 或者，如果API支持，直接删除文件。
                        // 目前，我们将简单地将文件内容清空。
                        await writeFile(fileHandle, null); // 或者写入空数组/对象
                    } catch (e) {
                        if (e.name !== 'NotFoundError') {
                            console.error(`Error clearing file ${fileName}:`, e);
                        }
                    }
                }
            } catch (error) {
                console.error("Error clearing data from file system, clearing from localStorage instead", error);
            }
        }        localStorage.removeItem(STORAGE_KEYS.TASKS);
        localStorage.removeItem(STORAGE_KEYS.HISTORY);
        localStorage.removeItem(STORAGE_KEYS.ACTIVE_ENTRY);
        // 保留定时器设置、主题设置和文件夹句柄
        // localStorage.removeItem(STORAGE_KEYS.TIMER_SETTINGS);
        // localStorage.removeItem(STORAGE_KEYS.THEME_SETTINGS);
        // await this.removeDataFolderHandleFromIndexedDB(); // 不在此处清除句柄，让用户手动断开
    }
};

export default Storage;