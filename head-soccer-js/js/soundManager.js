// Enhanced Sound Manager with exact Python behavior
class SoundManager {
    constructor() {
        this.audioContext = null;
        this.sounds = {};
        this.backgroundMusic = null;
        this.masterVolume = 1.0;
        
        // Initialize audio context on first user interaction
        this.initialized = false;
        this.initPromise = null;
    }
    
    // Initialize audio context (must be called after user interaction)
    async init() {
        if (this.initialized) return true;
        
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.initialized = true;
            console.log('🔊 Sound Manager initialized');
            return true;
        } catch (error) {
            console.warn('⚠️ Audio not available:', error);
            return false;
        }
    }
    
    // Ensure audio is initialized (call before playing sounds)
    async ensureInit() {
        if (!this.initPromise) {
            this.initPromise = this.init();
        }
        return await this.initPromise;
    }
    
    // Play sound with exact Python behavior
    async playSound(filename, volume = 1, loop = false) {
        await this.ensureInit();
        
        if (!assetLoader.getSound(filename)) {
            console.warn(`🔇 Sound not found: ${filename}`);
            return null;
        }
        
        try {
            const audio = assetLoader.getSound(filename).cloneNode();
            audio.volume = volume * this.masterVolume;
            audio.loop = loop;
            
            const playPromise = audio.play();
            if (playPromise) {
                playPromise.catch(error => {
                    console.warn(`🔇 Audio play failed for ${filename}:`, error);
                });
            }
            
            return audio;
        } catch (error) {
            console.warn(`🔇 Error playing ${filename}:`, error);
            return null;
        }
    }
    
    // Play kick sound (exact from Python)
    async playKickSound() {
        return await this.playSound('kick_ball.wav', CONFIG.SOUND_VOLUMES.KICK);
    }
    
    // Play goal sound with randomization (exact from Python lines 908-913)
    async playGoalSound() {
        const goalSound = `Goal ${goalSfx}.mp3`;
        const audio = await this.playSound(goalSound, CONFIG.SOUND_VOLUMES.GOAL);
        
        // Randomize next goal sound (exact Python logic)
        const lastGoalSfx = goalSfx;
        while (goalSfx === lastGoalSfx) {
            goalSfx = Utils.randomInt(1, 5);
        }
        
        return audio;
    }
    
    // Play cheer sound with randomization (exact from Python lines 901-906)
    async playCheerSound() {
        // Exact volume calculation from Python
        const volume = Math.random() * CONFIG.SOUND_VOLUMES.CHEER_VARIATION + CONFIG.SOUND_VOLUMES.CHEER_BASE;
        const cheerSound = `Cheer ${cheerSfx}.wav`;
        const audio = await this.playSound(cheerSound, volume);
        
        // Randomize next cheer sound (exact Python logic)
        const lastCheerSfx = cheerSfx;
        while (cheerSfx === lastCheerSfx) {
            cheerSfx = Utils.randomInt(1, 4);
        }
        
        return audio;
    }
    
    // Play selection sound
    async playSelectionSound() {
        return await this.playSound('Small_pop.wav', CONFIG.SOUND_VOLUMES.SELECTION);
    }
    
    // Play countdown sound
    async playCountdownSound() {
        return await this.playSound('Countdown.mp3', CONFIG.SOUND_VOLUMES.COUNTDOWN);
    }
    
    // Play start game sound
    async playStartGameSound() {
        return await this.playSound('Start_Game.wav', CONFIG.SOUND_VOLUMES.START_GAME);
    }
    
    // Start background crowd sound (exact from Python lines 1490-1492)
    async startBackgroundCrowd() {
        const audio = await this.playSound('background_crowd.wav', CONFIG.SOUND_VOLUMES.BACKGROUND_CROWD, true);
        this.backgroundMusic = audio;
        return audio;
    }
    
    // Stop background music
    stopBackgroundMusic() {
        if (this.backgroundMusic) {
            this.backgroundMusic.pause();
            this.backgroundMusic = null;
        }
    }
    
    // Set master volume
    setMasterVolume(volume) {
        this.masterVolume = Utils.clamp(volume, 0, 1);
    }
    
    // Mute all sounds
    mute() {
        this.setMasterVolume(0);
    }
    
    // Unmute all sounds
    unmute() {
        this.setMasterVolume(1);
    }
}

// Global sound manager instance
let soundManager = new SoundManager();