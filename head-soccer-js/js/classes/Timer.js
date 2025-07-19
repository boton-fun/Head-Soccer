// Timer Class - Exact copy from Python lines 153-177
class Timer {
    constructor(length) {
        this.length = length;
        this.startTime = null;
        this.pauseStartTime = null;
        this.paused = false;
    }
    
    // Start the timer
    start() {
        this.startTime = performance.now() / 1000; // Convert to seconds like Python time.time()
    }
    
    // Pause the timer
    pause() {
        this.pauseStartTime = performance.now() / 1000;
        this.paused = true;
    }
    
    // Resume the timer
    resume() {
        const timePaused = performance.now() / 1000 - this.pauseStartTime;
        this.startTime = this.startTime + timePaused;
        this.paused = false;
    }
    
    // Get remaining time (exact Python logic from lines 172-176)
    get() {
        if (this.paused) {
            return this.length - (this.pauseStartTime - this.startTime);
        } else {
            return this.length - (performance.now() / 1000 - this.startTime);
        }
    }
    
    // Check if timer is finished
    isFinished() {
        return this.get() <= 0;
    }
    
    // Get elapsed time
    getElapsed() {
        return this.length - this.get();
    }
    
    // Reset timer
    reset() {
        this.startTime = null;
        this.pauseStartTime = null;
        this.paused = false;
    }
}