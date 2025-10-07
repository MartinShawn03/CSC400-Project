const http = require('http');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2');
const url = require('url');

const baseDir = path.resolve(__dirname, '..');

const connection_pool = mysql.createPool({
    host: '136.113.3.49',
    user: 'nodeuser',
    password: 'csc400',
    database: 'restaurant_db',
    connectionLimit: 10
});

const server = http.createServer((req, res) => {
   // let reqPath = decodeURIComponent(req.url);
    let reqPath = decodeURIComponent(req.url.split('?')[0]);

    // Default to landing page (index.html)
    if (reqPath === '/' || reqPath === '') {
      reqPath = '/index.html';
    }

    // Map virtual URL path to actual filesystem path
    let filePath;
    if (reqPath.endsWith('.html')) {
      // All HTML files live inside public_html
      filePath = path.join(baseDir, 'public_html', reqPath);
    } else if (reqPath.startsWith('/css')) {
      filePath = path.join(baseDir, 'public_html', 'css', reqPath.replace('/css/', ''));
    } else if (reqPath.startsWith('/js')) {
      filePath = path.join(baseDir, 'public_html', 'js', reqPath.replace('/js/', ''));
    } else if (reqPath.startsWith('/Customer')) {
      filePath = path.join(baseDir, 'public_html', reqPath);
    } else if (reqPath.startsWith('/Employee')) {
      filePath = path.join(baseDir, 'public_html', reqPath);
    } else {
      // Default fallback (e.g. for images or other static files)
      filePath = path.join(baseDir, 'public_html', reqPath);
    }

    const ext = path.extname(filePath).toLowerCase();
    let contentType = 'text/html';
    switch (ext) {
        case '.css': contentType = 'text/css'; break;
        case '.js': contentType = 'application/javascript'; break;
        case '.mp3': contentType = 'audio/mpeg'; break;
        case '.png': contentType = 'image/png'; break;
        case '.jpg':
        case '.jpeg': contentType = 'image/jpeg'; break;
        case '.ico': contentType = 'image/x-icon'; break;
    }


    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 - File Not Found');
            } else {
                res.writeHead(200, { 'Content-Type': contentType });
                res.end(data);
            }
    });
    
});


server.listen(80, () => {
    console.log('Server running on port 80');
});
