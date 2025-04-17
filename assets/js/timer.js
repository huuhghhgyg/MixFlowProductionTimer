import { updateTimerDisplay } from './ui.js';

class Timer {
    static timerInterval = null;

    static startTimer(startTime) {
        if (Timer.timerInterval) {
            clearInterval(Timer.timerInterval);
        }

        updateTimerDisplay(startTime);
        Timer.timerInterval = setInterval(() => {
            updateTimerDisplay(startTime);
        }, 1000);

        return Timer.timerInterval;
    }

    static stopTimer() {
        if (Timer.timerInterval) {
            clearInterval(Timer.timerInterval);
            Timer.timerInterval = null;
        }
    }

    static formatMilliseconds(ms) {
        const seconds = Math.floor(ms / 1000);
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const remainingSeconds = seconds % 60;
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
    }

    static formatDuration(ms) {
        const seconds = Math.floor(ms / 1000);
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const remainingSeconds = seconds % 60;

        const parts = [];
        
        if (hours > 0) {
            parts.push(`${hours}h`);
        }
        if (minutes > 0 || hours > 0) {
            parts.push(`${minutes}m`);
        }
        parts.push(`${remainingSeconds}s`);

        return parts.join(' ');
    }

    static formatTime(timestamp) {
        return new Date(timestamp).toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    static formatDate(timestamp) {
        return new Date(timestamp).toLocaleDateString('zh-CN', {
            month: 'long',
            day: 'numeric'
        });
    }

    static getTimePeriods(startTime, endTime) {
        const periods = [];
        let currentDate = new Date(startTime);
        currentDate.setHours(0, 0, 0, 0);
        const lastDate = new Date(endTime);
        lastDate.setHours(0, 0, 0, 0);

        while (currentDate <= lastDate) {
            periods.push(new Date(currentDate));
            currentDate.setDate(currentDate.getDate() + 1);
        }

        return periods;
    }
}

export default Timer;