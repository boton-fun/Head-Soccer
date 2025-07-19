const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = 8001;

// MIME types
const mimeTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg',
    '.ttf': 'font/ttf'
};

const server = http.createServer((req, res) => {
    // Add CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    
    // Decode URL to handle spaces and special characters
    const decodedUrl = decodeURIComponent(req.url === '/' ? '/main-menu.html' : req.url);
    let filePath = path.join(__dirname, decodedUrl);
    const ext = path.extname(filePath);
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    
    // Function to try serving file from multiple locations
    function tryServeFile(primaryPath, fallbackPath = null) {
        fs.readFile(primaryPath, (err, content) => {
            if (err && err.code === 'ENOENT' && fallbackPath) {
                // Try fallback path (main assets folder)
                fs.readFile(fallbackPath, (fallbackErr, fallbackContent) => {
                    if (fallbackErr) {
                        if (fallbackErr.code === 'ENOENT') {
                            res.writeHead(404);
                            res.end('File not found');
                        } else {
                            res.writeHead(500);
                            res.end('Server error');
                        }
                    } else {
                        res.writeHead(200, { 'Content-Type': contentType });
                        res.end(fallbackContent);
                    }
                });
            } else if (err) {
                if (err.code === 'ENOENT') {
                    res.writeHead(404);
                    res.end('File not found');
                } else {
                    res.writeHead(500);
                    res.end('Server error');
                }
            } else {
                res.writeHead(200, { 'Content-Type': contentType });
                res.end(content);
            }
        });
    }
    
    // Check if requesting assets - try both asset folders
    if (decodedUrl.startsWith('/assets/')) {
        const mainAssetsPath = path.join(__dirname, '..', decodedUrl);
        tryServeFile(filePath, mainAssetsPath);
    } else {
        tryServeFile(filePath);
    }
});

server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
    console.log('Game URLs:');
    console.log(`  Main Menu: http://localhost:${PORT}/main-menu.html`);
    console.log(`  Direct Play: http://localhost:${PORT}/gameplay.html`);
    
    // Auto-open browser to main menu
    exec(`start http://localhost:${PORT}/main-menu.html`);
});