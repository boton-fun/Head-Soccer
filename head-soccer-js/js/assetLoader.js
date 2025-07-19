// Asset Loader - Handles loading all 38 assets from Python version
class AssetLoader {
    constructor() {
        this.images = {};
        this.sounds = {};
        this.fonts = {};
        this.loaded = 0;
        this.total = 41; // Updated count including Goal Text, Goal Side, and Ball 01 images
        this.loadingCallbacks = [];
        
        // Asset file lists from config
        this.imageFiles = CONFIG.ASSET_FILES.IMAGES;
        this.soundFiles = CONFIG.ASSET_FILES.SOUNDS;
        this.fontFiles = CONFIG.ASSET_FILES.FONTS;
    }
    
    // Add loading progress callback
    onProgress(callback) {
        this.loadingCallbacks.push(callback);
    }
    
    // Update loading progress
    updateProgress() {
        this.loaded++;
        const progress = (this.loaded / this.total) * 100;
        
        // Update loading screen
        const progressFill = document.getElementById('progress-fill');
        const loadingText = document.getElementById('loading-text');
        
        if (progressFill) {
            progressFill.style.width = `${progress}%`;
        }
        
        if (loadingText) {
            loadingText.textContent = `Loading Assets... ${Math.floor(progress)}%`;
        }
        
        // Call progress callbacks
        this.loadingCallbacks.forEach(callback => callback(progress, this.loaded, this.total));
        
        // Hide loading screen when complete
        if (this.loaded >= this.total) {
            setTimeout(() => {
                const loadingScreen = document.getElementById('loading-screen');
                if (loadingScreen) {
                    loadingScreen.classList.add('hidden');
                }
            }, 500);
        }
    }
    
    // Load all assets
    async loadAllAssets() {
        try {
            // Load in parallel for better performance
            await Promise.all([
                this.loadImages(),
                this.loadSounds(),
                this.loadFonts()
            ]);
            
            console.log('All assets loaded successfully!');
            return true;
        } catch (error) {
            console.error('Error loading assets:', error);
            return false;
        }
    }
    
    // Load image assets
    async loadImages() {
        const imagePromises = this.imageFiles.map(filename => {
            return new Promise((resolve, reject) => {
                const img = new Image();
                
                img.onload = () => {
                    this.images[filename] = img;
                    this.updateProgress();
                    resolve(img);
                };
                
                img.onerror = () => {
                    console.error(`Failed to load image: ${filename}`);
                    reject(new Error(`Failed to load image: ${filename}`));
                };
                
                img.src = Utils.assetPath(filename);
            });
        });
        
        await Promise.all(imagePromises);
    }
    
    // Load sound assets
    async loadSounds() {
        const soundPromises = this.soundFiles.map(filename => {
            return new Promise((resolve, reject) => {
                const audio = new Audio();
                
                audio.addEventListener('canplaythrough', () => {
                    this.sounds[filename] = audio;
                    this.updateProgress();
                    resolve(audio);
                });
                
                audio.addEventListener('error', () => {
                    console.error(`Failed to load sound: ${filename}`);
                    reject(new Error(`Failed to load sound: ${filename}`));
                });
                
                audio.preload = 'auto';
                audio.src = Utils.assetPath(filename);
            });
        });
        
        await Promise.all(soundPromises);
    }
    
    // Load font assets
    async loadFonts() {
        const fontPromises = this.fontFiles.map(filename => {
            return new Promise((resolve, reject) => {
                // Create clean font name for CSS
                const fontName = filename.replace(/[^a-zA-Z0-9]/g, '');
                
                const fontFace = new FontFace(fontName, `url("${Utils.assetPath(filename)}")`);
                
                fontFace.load().then((loadedFont) => {
                    document.fonts.add(loadedFont);
                    this.fonts[filename] = {
                        name: fontName,
                        loaded: true
                    };
                    this.updateProgress();
                    resolve(loadedFont);
                }).catch((error) => {
                    console.error(`Failed to load font: ${filename}`, error);
                    reject(error);
                });
            });
        });
        
        await Promise.all(fontPromises);
    }
    
    // Get image by filename
    getImage(filename) {
        return this.images[filename];
    }
    
    // Get sound by filename
    getSound(filename) {
        return this.sounds[filename];
    }
    
    // Get font name by filename
    getFont(filename) {
        return this.fonts[filename]?.name || 'Arial';
    }
    
    // Play sound with volume (exact Python behavior)
    playSound(filename, volume = 1, loop = false) {
        const sound = this.sounds[filename];
        if (sound) {
            // Clone audio for multiple simultaneous plays
            const audioClone = sound.cloneNode();
            audioClone.volume = volume;
            audioClone.loop = loop;
            
            // Handle browser audio context requirements
            audioClone.play().catch(error => {
                console.warn('Audio play failed:', error);
            });
            
            return audioClone;
        } else {
            console.warn(`Sound not found: ${filename}`);
        }
    }
    
    // Play goal sound with exact Python randomization
    playGoalSound() {
        const goalSound = `Goal ${goalSfx}.mp3`;
        this.playSound(goalSound, CONFIG.SOUND_VOLUMES.GOAL);
        
        // Exact randomization from Python lines 911-913
        const lastGoalSfx = goalSfx;
        while (goalSfx === lastGoalSfx) {
            goalSfx = Utils.randomInt(1, 5);
        }
    }
    
    // Play cheer sound with exact Python randomization and volume
    playCheerSound() {
        // Exact volume calculation from Python line 902
        const volume = Math.random() * CONFIG.SOUND_VOLUMES.CHEER_VARIATION + CONFIG.SOUND_VOLUMES.CHEER_BASE;
        const cheerSound = `Cheer ${cheerSfx}.wav`;
        this.playSound(cheerSound, volume);
        
        // Exact randomization from Python lines 904-906
        const lastCheerSfx = cheerSfx;
        while (cheerSfx === lastCheerSfx) {
            cheerSfx = Utils.randomInt(1, 4);
        }
    }
    
    // Start background crowd sound (exact Python behavior)
    startBackgroundCrowd() {
        const backgroundSound = this.playSound('background_crowd.wav', CONFIG.SOUND_VOLUMES.BACKGROUND_CROWD, true);
        return backgroundSound;
    }
    
    // Verify all assets loaded correctly
    verifyAssets() {
        const missing = [];
        
        // Check images
        this.imageFiles.forEach(filename => {
            if (!this.images[filename]) {
                missing.push(`Image: ${filename}`);
            }
        });
        
        // Check sounds
        this.soundFiles.forEach(filename => {
            if (!this.sounds[filename]) {
                missing.push(`Sound: ${filename}`);
            }
        });
        
        // Check fonts
        this.fontFiles.forEach(filename => {
            if (!this.fonts[filename]) {
                missing.push(`Font: ${filename}`);
            }
        });
        
        if (missing.length > 0) {
            console.error('Missing assets:', missing);
            return false;
        }
        
        console.log('All 38 assets verified successfully!');
        return true;
    }
    
    // Get loading progress
    getProgress() {
        return {
            loaded: this.loaded,
            total: this.total,
            percentage: (this.loaded / this.total) * 100
        };
    }
}

// Global asset loader instance - initialize immediately
const assetLoader = new AssetLoader();
window.assetLoader = assetLoader;