export const REST_ID = 'rest';

export const MFPT_EVENTS = {
    THEME_CHANGED: 'mfpt:themeChanged',
    NOTIFICATION: 'mfpt:notification',
    TASK_STOPPED: 'mfpt:taskStopped',
    DATA_LOCATION_CHANGED: 'mfpt:dataLocationChanged'
};

export const STORAGE_KEYS = {
    TASKS: 'mfpt_tasks',
    HISTORY: 'mfpt_history',
    ACTIVE_ENTRY: 'mfpt_active_entry',
    TIMER_SETTINGS: 'mfpt_timer_settings',
    DATA_FOLDER_HANDLE: 'mfpt_data_folder_handle',
    THEME_SETTINGS: 'mfpt_theme_settings'
};

// M3E uses each seed to generate the full light and dark palettes.
export const COLOR_THEMES = {
    GREEN: {
        id: 'green',
        name: '晨曦绿',
        description: '清新的绿色调，适合早晨工作',
        timeRange: [6, 11],
        seed: '#416900'
    },
    BLUE: {
        id: 'blue',
        name: '正午蓝',
        description: '深邃的蓝色调，保持专注',
        timeRange: [11, 14],
        seed: '#006590'
    },
    YELLOW: {
        id: 'yellow',
        name: '午后黄',
        description: '温暖的黄色调，保持活力',
        timeRange: [14, 16],
        seed: '#7F571F'
    },
    ORANGE: {
        id: 'orange',
        name: '夕阳橙',
        description: '温暖的夕阳色调，舒缓夜晚',
        timeRange: [16, 19],
        seed: '#8C4E42'
    },
    PURPLE: {
        id: 'purple',
        name: '夜幕紫',
        description: '深邃的紫色调，宁静夜晚',
        timeRange: [19, 6],
        seed: '#6D5585'
    }
};

export const THEME_MODES = {
    AUTO: 'auto',
    MANUAL: 'manual'
};
