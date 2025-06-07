import { COLOR_THEMES, THEME_MODES, STORAGE_KEYS } from './constants.js';
import Storage from './storage.js';

class ThemeManager {    constructor() {
        this.currentTheme = null;
        this.themeMode = THEME_MODES.AUTO;
        this.autoSwitchInterval = null;
        this.settings = {
            themeMode: THEME_MODES.AUTO,
            currentTheme: null
        };

        this.init();
    }

    async init() {
        await this.loadSettings();
        this.applyTheme();
        this.startAutoSwitch();

        // 监听系统深色模式变化
        if (window.matchMedia) {
            const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
            mediaQuery.addEventListener('change', () => {
                if (this.themeMode === THEME_MODES.AUTO) {
                    this.applyTheme();
                }
            });
        }
    }

    async loadSettings() {
        try {
            const settings = await Storage.getThemeSettings();
            if (settings) {
                this.themeMode = settings.themeMode || THEME_MODES.AUTO;
                this.currentTheme = settings.currentTheme || this.getTimeBasedTheme().id;
            } else {
                this.themeMode = THEME_MODES.AUTO;
                this.currentTheme = this.getTimeBasedTheme().id;
            }
            this.settings = {
                themeMode: this.themeMode,
                currentTheme: this.currentTheme
            };
        } catch (error) {
            console.warn('Failed to load theme settings:', error);
            this.themeMode = THEME_MODES.AUTO;
            this.currentTheme = this.getTimeBasedTheme().id;
        }
    }
    
    async saveSettings() {
        try {
            await Storage.saveThemeSettings(this.settings);
        } catch (error) {
            console.warn('Failed to save theme settings:', error);
        }
    }

    getTimeBasedTheme() {
        const now = new Date();
        const hour = now.getHours();

        for (const theme of Object.values(COLOR_THEMES)) {
            const [start, end] = theme.timeRange;
            if (start <= end) {
                // 正常时间范围，如 [6, 11]
                if (hour >= start && hour < end) {
                    return theme;
                }
            } else {
                // 跨越午夜的时间范围，如 [22, 6]
                if (hour >= start || hour < end) {
                    return theme;
                }
            }
        }
        // 默认返回蓝色主题
        return COLOR_THEMES.BLUE;
    }

    getCurrentTheme() {
        if (this.themeMode === THEME_MODES.AUTO) {
            return this.getTimeBasedTheme();
        } else {
            return COLOR_THEMES[this.currentTheme.toUpperCase()] || COLOR_THEMES.BLUE;
        }
    }

    setThemeMode(mode) {
        this.themeMode = mode;
        this.settings.themeMode = mode;

        if (mode === THEME_MODES.AUTO) {
            this.currentTheme = this.getTimeBasedTheme().id;
            this.startAutoSwitch();
        } else {
            this.stopAutoSwitch();
        }

        this.settings.currentTheme = this.currentTheme;
        this.saveSettings();
        this.applyTheme();

        // 触发主题变化事件
        this.dispatchThemeChangeEvent();
    }

    setManualTheme(themeId) {
        if (this.themeMode === THEME_MODES.MANUAL) {
            this.currentTheme = themeId;
            this.settings.currentTheme = themeId;
            this.saveSettings();
            this.applyTheme();
            this.dispatchThemeChangeEvent();
        }
    } applyTheme() {
        const theme = this.getCurrentTheme();
        const isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        const colorScheme = isDark ? 'dark' : 'light';
        const colors = theme.colors[colorScheme];

        const root = document.documentElement;
        const body = document.body;

        // 添加过渡动画类
        body.classList.add('theme-transition');

        // 应用完整的Material Design 3颜色系统
        root.style.setProperty('--md-sys-color-primary', colors.primary);
        root.style.setProperty('--md-sys-color-on-primary', colors.onPrimary);
        root.style.setProperty('--md-sys-color-primary-container', colors.primaryContainer);
        root.style.setProperty('--md-sys-color-on-primary-container', colors.onPrimaryContainer);

        root.style.setProperty('--md-sys-color-secondary', colors.secondary);
        root.style.setProperty('--md-sys-color-on-secondary', colors.onSecondary);
        root.style.setProperty('--md-sys-color-secondary-container', colors.secondaryContainer);
        root.style.setProperty('--md-sys-color-on-secondary-container', colors.onSecondaryContainer);

        root.style.setProperty('--md-sys-color-tertiary', colors.tertiary);
        root.style.setProperty('--md-sys-color-on-tertiary', colors.onTertiary);
        root.style.setProperty('--md-sys-color-tertiary-container', colors.tertiaryContainer);
        root.style.setProperty('--md-sys-color-on-tertiary-container', colors.onTertiaryContainer);

        root.style.setProperty('--md-sys-color-error', colors.error);
        root.style.setProperty('--md-sys-color-on-error', colors.onError);
        root.style.setProperty('--md-sys-color-error-container', colors.errorContainer);
        root.style.setProperty('--md-sys-color-on-error-container', colors.onErrorContainer);

        root.style.setProperty('--md-sys-color-surface', colors.surface);
        root.style.setProperty('--md-sys-color-on-surface', colors.onSurface);
        root.style.setProperty('--md-sys-color-surface-variant', colors.surfaceVariant);
        root.style.setProperty('--md-sys-color-on-surface-variant', colors.onSurfaceVariant);

        root.style.setProperty('--md-sys-color-outline', colors.outline);
        root.style.setProperty('--md-sys-color-outline-variant', colors.outlineVariant);

        // 更新主题颜色元标签
        const themeColorMeta = document.querySelector('meta[name="theme-color"]');
        if (themeColorMeta) {
            themeColorMeta.content = colors.primary;
        }

        // 添加主题类名到body
        body.className = body.className.replace(/theme-\w+/g, '');
        body.classList.add(`theme-${theme.id}`);

        // 移除过渡动画类（在动画完成后）
        setTimeout(() => {
            body.classList.remove('theme-transition');
        }, 600);

        console.log(`Applied theme: ${theme.name} (${colorScheme} mode)`);
    }

    startAutoSwitch() {
        if (this.themeMode === THEME_MODES.AUTO) {
            this.stopAutoSwitch();

            // 每分钟检查一次是否需要切换主题
            this.autoSwitchInterval = setInterval(() => {
                const newTheme = this.getTimeBasedTheme();
                if (newTheme.id !== this.currentTheme) {
                    this.currentTheme = newTheme.id;
                    this.settings.currentTheme = this.currentTheme;
                    this.saveSettings();
                    this.applyTheme();
                    this.dispatchThemeChangeEvent();
                }
            }, 60000); // 每分钟检查一次
        }
    }

    stopAutoSwitch() {
        if (this.autoSwitchInterval) {
            clearInterval(this.autoSwitchInterval);
            this.autoSwitchInterval = null;
        }
    }

    dispatchThemeChangeEvent() {
        const theme = this.getCurrentTheme();
        document.dispatchEvent(new CustomEvent('mfpt:themeChanged', {
            detail: {
                theme: theme,
                mode: this.themeMode
            }
        }));
    }

    getThemeInfo() {
        return {
            currentTheme: this.getCurrentTheme(),
            themeMode: this.themeMode,
            availableThemes: COLOR_THEMES,
            themeModes: THEME_MODES
        };
    }

    destroy() {
        this.stopAutoSwitch();
    }
}

// 创建单例实例
const themeManager = new ThemeManager();

export default themeManager;
