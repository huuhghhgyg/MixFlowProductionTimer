import '../../dist/m3e.js';
import { COLOR_THEMES, THEME_MODES, MFPT_EVENTS } from './constants.js';
import Storage from './storage.js';

class ThemeManager {
    constructor() {
        this.currentTheme = null;
        this.themeMode = THEME_MODES.AUTO;
        this.autoSwitchInterval = null;
        this.themeTransitionTimer = null;
        this.systemScheme = window.matchMedia('(prefers-color-scheme: dark)');
        this.appliedColors = [];
        this.onSystemSchemeChange = () => this.syncTheme({ animate: true });
        this.onPageResume = () => {
            if (document.visibilityState === 'visible') this.syncTheme();
        };
        this.ready = this.init();
    }

    async init() {
        await this.loadSettings();
        await this.applyTheme({ animate: false });
        this.startAutoSwitch();
        this.systemScheme.addEventListener('change', this.onSystemSchemeChange);
        document.addEventListener('visibilitychange', this.onPageResume);
        document.addEventListener('resume', this.onPageResume);
        window.addEventListener('focus', this.onPageResume);
        window.addEventListener('pageshow', this.onPageResume);
    }

    async loadSettings() {
        try {
            const settings = await Storage.getThemeSettings();
            this.themeMode = settings?.themeMode === THEME_MODES.MANUAL ? THEME_MODES.MANUAL : THEME_MODES.AUTO;
            this.currentTheme = this.themeMode === THEME_MODES.MANUAL && typeof settings.currentTheme === 'string'
                ? settings.currentTheme
                : this.getTimeBasedTheme().id;
        } catch (error) {
            console.warn('Failed to load theme settings:', error);
            this.themeMode = THEME_MODES.AUTO;
            this.currentTheme = this.getTimeBasedTheme().id;
        }
    }
    
    async saveSettings() {
        try {
            await Storage.saveThemeSettings({ themeMode: this.themeMode, currentTheme: this.currentTheme });
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
        this.currentTheme = this.getCurrentTheme().id;
        this.themeMode = mode;

        if (mode === THEME_MODES.AUTO) {
            this.currentTheme = this.getTimeBasedTheme().id;
            this.startAutoSwitch();
        } else {
            this.stopAutoSwitch();
        }

        this.saveSettings();
        this.applyTheme();
    }

    setManualTheme(themeId) {
        if (this.themeMode === THEME_MODES.MANUAL) {
            this.currentTheme = themeId;
            this.saveSettings();
            this.applyTheme();
        }
    }

    readThemeColors() {
        const style = getComputedStyle(document.documentElement);
        return ['primary', 'surface', 'secondary-container'].map(role =>
            style.getPropertyValue(`--md-sys-color-${role}`).trim()
        );
    }

    syncTheme({ animate = false } = {}) {
        const theme = this.getCurrentTheme();
        const scheme = this.systemScheme.matches ? 'dark' : 'light';
        const m3eTheme = document.getElementById('appTheme');
        const colors = this.readThemeColors();
        if (m3eTheme.color === theme.seed && m3eTheme.scheme === scheme &&
            colors.every((color, index) => color && color === this.appliedColors[index])) return;

        return this.applyTheme({ animate });
    }

    async applyTheme({ animate = true } = {}) {
        const theme = this.getCurrentTheme();
        const colorScheme = this.systemScheme.matches ? 'dark' : 'light';
        const body = document.body;

        if (this.themeMode === THEME_MODES.AUTO && theme.id !== this.currentTheme) {
            this.currentTheme = theme.id;
            this.saveSettings();
        }

        if (this.themeTransitionTimer) {
            clearTimeout(this.themeTransitionTimer);
            this.themeTransitionTimer = null;
        }
        body.classList.remove('theme-transition');
        if (animate) {
            void body.offsetWidth;
            body.classList.add('theme-transition');
            this.themeTransitionTimer = setTimeout(() => {
                body.classList.remove('theme-transition');
                this.themeTransitionTimer = null;
            }, 320);
        }

        const m3eTheme = document.getElementById('appTheme');
        m3eTheme.setAttribute('color', theme.seed);
        m3eTheme.setAttribute('scheme', colorScheme);
        // Reapply the palette even when the theme attributes have not changed.
        m3eTheme.requestUpdate();

        // M3E applies the palette during its update. Consumers read the resolved tokens.
        await m3eTheme.updateComplete;
        this.appliedColors = this.readThemeColors();
        document.querySelector('meta[name="theme-color"]').content = this.appliedColors[0];
        this.dispatchThemeChangeEvent();
    }

    startAutoSwitch() {
        if (this.themeMode === THEME_MODES.AUTO) {
            this.stopAutoSwitch();

            // 每分钟检查一次是否需要切换主题
            this.autoSwitchInterval = setInterval(() => this.syncTheme({ animate: true }), 60000);
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
        document.dispatchEvent(new CustomEvent(MFPT_EVENTS.THEME_CHANGED, {
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
        this.systemScheme.removeEventListener('change', this.onSystemSchemeChange);
        document.removeEventListener('visibilitychange', this.onPageResume);
        document.removeEventListener('resume', this.onPageResume);
        window.removeEventListener('focus', this.onPageResume);
        window.removeEventListener('pageshow', this.onPageResume);
        if (this.themeTransitionTimer) {
            clearTimeout(this.themeTransitionTimer);
            this.themeTransitionTimer = null;
        }
    }
}

// 创建单例实例
const themeManager = new ThemeManager();

export default themeManager;
