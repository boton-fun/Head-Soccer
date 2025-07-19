// Utility functions for Head Soccer
// Exact utilities from Python main.py

const Utils = {
    // Python mypath() equivalent
    assetPath(filename) {
        return `assets/${filename}`;
    },
    
    // Color array to CSS string
    colorToCSS(colorArray, alpha = 1) {
        if (alpha === 1) {
            return `rgb(${colorArray.join(',')})`;
        } else {
            return `rgba(${colorArray.join(',')}, ${alpha})`;
        }
    },
    
    // Degrees to radians
    degToRad(degrees) {
        return degrees * Math.PI / 180;
    },
    
    // Radians to degrees
    radToDeg(radians) {
        return radians * 180 / Math.PI;
    },
    
    // Random integer between min and max (inclusive)
    randomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    },
    
    // Random float between min and max
    randomFloat(min, max) {
        return Math.random() * (max - min) + min;
    },
    
    // Clamp value between min and max
    clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    },
    
    // Format time as MM:SS
    formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    },
    
    // Distance between two points
    distance(x1, y1, x2, y2) {
        return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
    },
    
    // Normalize angle to 0-360 range
    normalizeAngle(angle) {
        while (angle < 0) angle += 360;
        while (angle >= 360) angle -= 360;
        return angle;
    }
};

// Global utilities available everywhere
window.Utils = Utils;