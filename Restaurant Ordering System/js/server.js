const http = require('http');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2');
const formidable = require('formidable'); // use "npm install formidable"
const multiparty = require("multiparty"); //use "npm install multiparty"
const url = require('url');

const baseDir = path.resolve(__dirname, '..');

const connection_pool = mysql.createPool({
    host: '34.74.71.179',
    user: 'nodeuser',
    password: 'node330',
    database: 'musicDatabase',
    connectionLimit: 10
});

const server = http.createServer((req, res) => {
   // let reqPath = decodeURIComponent(req.url);
    let reqPath = decodeURIComponent(req.url.split('?')[0]);

    // Default to login.html
    if (reqPath == '/' || reqPath == '') {
        reqPath = '/login.html';
    }

    // Map virtual URL path to actual filesystem path
    let filePath;
    if (reqPath.startsWith('/image') || reqPath.startsWith('/music') || reqPath.endsWith('.html')) {
        filePath = path.join(baseDir, 'public_html', reqPath);
    } else if (reqPath.startsWith('/css')) {
        filePath = path.join(baseDir, 'css', reqPath.replace('/css/', ''));
    } else if (reqPath.startsWith('/js')) {
        filePath = path.join(baseDir, 'js', reqPath.replace('/js/', ''));
    } else {
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
    

    // handle the login 
    if (req.method == 'POST' && reqPath == '/login.html') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', () => {
            const query = JSON.parse(body); 

            connection_pool.query(`SELECT * FROM users WHERE username = '${query.username}' AND password = '${query.pw}'`,
                function (error, results) {
                    if (error) {
                        console.log(error);
                    }

                    if (results.length > 0) {
                        const user = results[0];
                        const user_id = user.id;
                        if (user.role == 'listener') {
                            res.writeHead(302, { 'Location': `/listener_main.html?user_id=${user_id}` });
                        } else if (user.role == 'artist') {
                            res.writeHead(302, { 'Location': `/artist_main.html?user_id=${user_id}` });
                        }
                        res.end();
                    } else {
                        res.writeHead(400, { 'Content-Type': 'text/plain' });
                        res.end('Invalid username or password');
                    }
                }
            );
        });
        return;
    }

    // handle signup
    if (req.method == 'POST' && reqPath == '/signup.html') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', () => {
            const query = JSON.parse(body); 

            if (query.pw !== query.pwr) {
                res.writeHead(400, { 'Content-Type': 'text/plain' });
                return res.end('Passwords do not match');
            }

            connection_pool.query(`INSERT INTO users (username, password, role, date_joined) VALUES ('${query.username}', '${query.pw}', '${query.role}',NOW())`,
                function (error) {
                    if (error) {
                        console.log(error);
                    }

                        res.writeHead(201, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ message: 'Signup successful! Please log in.' }));
                }
            );
        });
        return;
    }

    //get song from database
    if (req.method == 'GET' && reqPath == '/songs') {
        connection_pool.query('SELECT * FROM songs',
        (error, results) => {
            if (error) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                return res.end('Error retrieving songs');
            }
            // Send back a list of songs
            const songList = results.map(song => ({
                id: song.id,
                name: song.name,
                artist: song.artist,
                cover: song.cover, 
                path: song.path     
            }));

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(songList));
        });
        return;
    } 

    // Get albums
    if (req.method == 'GET' && reqPath == '/albums') {
        connection_pool.query('SELECT * FROM albums', 
        (error, results) => {
            if (error) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                return res.end('Error retrieving albums');
            }
            const albumList = results.map(album => ({
                id: album.id,
                name: album.name,
                artist: album.artist,
                cover: album.cover
            }));
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(albumList));
        });
        return;
     }
    

    // get artists songs
    if (req.method == 'GET' && reqPath == '/artist_songs') {
      // const urlObj = new URL(req.url, `http://${req.headers.host}`);
      //  const userId = urlObj.searchParams.get('user_id');
        const queryParams = url.parse(req.url, true).query;
        const userId = queryParams.user_id; 
        connection_pool.query('SELECT * FROM songs WHERE artist_id = ?', [userId], (error, results) => {
           if (error) {
              res.writeHead(500, { 'Content-Type': 'text/plain' });
              return res.end('Error retrieving artist songs');
           }
           const songList = results.map(song => ({
               name: song.name,
               artist: song.artist,
               cover: song.cover,
               path: song.path
           }));
           res.writeHead(200, { 'Content-Type': 'application/json' });
           res.end(JSON.stringify(songList));
    });
    return;
}

// get artist albums
    if (req.method == 'GET' && reqPath == '/artist_albums') {
      // const urlObj = new URL(req.url, `http://${req.headers.host}`);
      // const userId = urlObj.searchParams.get('user_id');
       const queryParams = url.parse(req.url, true).query;
       const userId = queryParams.user_id; 
       
       connection_pool.query('SELECT * FROM albums WHERE artist_id = ?', [userId], (error, results) => {
            if (error) {
               res.writeHead(500, { 'Content-Type': 'text/plain' });
               return res.end('Error retrieving artist albums');
            }
            const albumList = results.map(album => ({
                name: album.name,
                artist: album.artist,
                cover: album.cover
            }));
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(albumList));
        });
    return;
}

    // Get favorite songs for a user
    if (req.method === 'GET' && reqPath === '/favorites') {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const userId = url.searchParams.get('user_id');

        connection_pool.query(`
            SELECT s.id, s.name, s.artist, s.cover, s.path
            FROM favorites f
            JOIN songs s ON f.song_id = s.id
            WHERE f.user_id = ?
        `, [userId], (err, results) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                return res.end('Database error');
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(results));
        });
        return;
    }

    // Add favorite
    if (req.method === 'POST' && reqPath === '/favorites/add') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', () => {
            const { user_id, song_id } = JSON.parse(body);
            connection_pool.query(`INSERT IGNORE INTO favorites (user_id, song_id) VALUES (?, ?)`,
                [user_id, song_id],
                err => {
                    if (err) {
                        res.writeHead(500, { 'Content-Type': 'text/plain' });
                        return res.end('Error adding favorite');
                    }
                    res.writeHead(200, { 'Content-Type': 'text/plain' });
                    res.end('Added');
                });
        });
        return;
    }

    // Remove favorite
    if (req.method === 'POST' && reqPath === '/favorites/remove') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', () => {
            const { user_id, song_id } = JSON.parse(body);
            connection_pool.query(`DELETE FROM favorites WHERE user_id = ? AND song_id = ?`,
                [user_id, song_id],
                err => {
                    if (err) {
                        res.writeHead(500, { 'Content-Type': 'text/plain' });
                        return res.end('Error removing favorite');
                    }
                    res.writeHead(200, { 'Content-Type': 'text/plain' });
                    res.end('Removed');
                });
        });
        return;
    }

    // Get all playlists for a user
    if (req.method === 'GET' && reqPath === '/playlist/list') {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const userId = url.searchParams.get('user_id');

        connection_pool.query(
            `SELECT id, name, image FROM playlists WHERE user_id = ?`,
            [userId],
            (err, results) => {
                if (err) {
                    res.writeHead(500, {'Content-Type': 'text/plain'});
                    return res.end('Error loading playlists');
                }
                res.writeHead(200, {'Content-Type': 'application/json'});
                res.end(JSON.stringify(results));
            }
        );
        return;
    }


    // Create new playlist
    if (req.method === 'POST' && reqPath === '/playlist/create') {
        const form = new multiparty.Form();
        form.parse(req, (err, fields, files) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                return res.end('Upload error');
            }
    
            const userId = fields.user_id[0];
            const name = fields.name[0];
            const file = files.image[0];
    
            const newFilename = `playlist_${Date.now()}${path.extname(file.originalFilename)}`;
            const uploadPath = path.join(baseDir, 'public_html', 'image', newFilename);


    
            fs.copyFile(file.path, uploadPath, (err) => {
                if (err) {
                    res.writeHead(500, { 'Content-Type': 'text/plain' });
                    return res.end('Error saving image');
                }
    
                const imagePath = `/image/${newFilename}`;
    
                connection_pool.query(
                    `INSERT INTO playlists (user_id, name, image) VALUES (?, ?, ?)`,
                    [userId, name, imagePath],
                    (err) => {
                        if (err) {
                            res.writeHead(500, { 'Content-Type': 'text/plain' });
                            return res.end('Database error');
                        }
    
                        res.writeHead(200, { 'Content-Type': 'text/plain' });
                        res.end('Playlist created');
                    }
                );
            });
        });
        return;
    }
    

    //Get Playlist Info
    if (req.method === 'GET' && reqPath === '/playlist/info') {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const playlistId = url.searchParams.get('playlist_id');
    
        connection_pool.query(
            `SELECT name, image, DATE_FORMAT(created_on, '%M %d, %Y') as created FROM playlists WHERE id = ?`,
            [playlistId],
            (err, results) => {
                if (err || results.length === 0) {
                    res.writeHead(500, { 'Content-Type': 'text/plain' });
                    return res.end('Error loading playlist info');
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(results[0]));
            }
        );
        return;
    }
    
    //Get Songs in Playlist
    if (req.method === 'GET' && reqPath === '/playlist/songs') {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const playlistId = url.searchParams.get('playlist_id');
    
        connection_pool.query(
            `SELECT s.id, s.name, s.artist, s.cover, s.path
             FROM playlist_songs ps
             JOIN songs s ON ps.song_id = s.id
             WHERE ps.playlist_id = ?`,
            [playlistId],
            (err, results) => {
                if (err) {
                    res.writeHead(500, { 'Content-Type': 'text/plain' });
                    return res.end('Error loading songs');
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(results));
            }
        );
        return;
    }
    

    //Remove Songs from Playlist
    if (req.method === 'POST' && reqPath === '/playlist/remove-song') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', () => {
            const { playlist_id, song_id } = JSON.parse(body);
            connection_pool.query(
                `DELETE FROM playlist_songs WHERE playlist_id = ? AND song_id = ?`,
                [playlist_id, song_id],
                err => {
                    if (err) {
                        res.writeHead(500, { 'Content-Type': 'text/plain' });
                        return res.end('Error removing song');
                    }
                    res.writeHead(200, { 'Content-Type': 'text/plain' });
                    res.end('Song removed');
                }
            );
        });
        return;
    }

    // Returns true/false if song is in any playlist for this user
    if (req.method === 'GET' && reqPath === '/playlist/song-status') {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const user_id = url.searchParams.get('user_id');
        const song_id = url.searchParams.get('song_id');

        connection_pool.query(
            `SELECT COUNT(*) AS count FROM playlist_songs 
            JOIN playlists ON playlist_songs.playlist_id = playlists.id 
            WHERE playlists.user_id = ? AND playlist_songs.song_id = ?`,
            [user_id, song_id],
            (err, results) => {
                if (err) {
                    res.writeHead(500);
                    return res.end("Error checking status");
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ inPlaylist: results[0].count > 0 }));
            }
        );
        return;
    }

    // Returns array of playlist IDs that contain the song
    if (req.method === 'GET' && reqPath === '/playlist/song-playlists') {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const user_id = url.searchParams.get('user_id');
        const song_id = url.searchParams.get('song_id');

        connection_pool.query(
            `SELECT playlists.id FROM playlist_songs 
            JOIN playlists ON playlist_songs.playlist_id = playlists.id 
            WHERE playlists.user_id = ? AND playlist_songs.song_id = ?`,
            [user_id, song_id],
            (err, results) => {
                if (err) {
                    res.writeHead(500);
                    return res.end("Error fetching song playlists");
                }
                const ids = results.map(r => r.id);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(ids));
            }
        );
        return;
    }

        

    //Delete Entire Playlist
    if (req.method === 'POST' && reqPath === '/playlist/delete') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', () => {
            const { playlist_id } = JSON.parse(body);
            connection_pool.query(
                `DELETE FROM playlists WHERE id = ?`,
                [playlist_id],
                err => {
                    if (err) {
                        res.writeHead(500, { 'Content-Type': 'text/plain' });
                        return res.end('Error deleting playlist');
                    }
                    res.writeHead(200, { 'Content-Type': 'text/plain' });
                    res.end('Playlist deleted');
                }
            );
        });
        return;
    }
    

    //Add Song to Playlist
    if (req.method === 'POST' && reqPath === '/playlist/add-song') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', () => {
            const { playlist_id, song_id } = JSON.parse(body);
            connection_pool.query(
                `INSERT IGNORE INTO playlist_songs (playlist_id, song_id) VALUES (?, ?)`,
                [playlist_id, song_id],
                err => {
                    if (err) {
                        res.writeHead(500, { 'Content-Type': 'text/plain' });
                        return res.end('Error adding song');
                    }
                    res.writeHead(200, { 'Content-Type': 'text/plain' });
                    res.end('Added');
                }
            );
        });
        return;
    }
    
    //Profile Update
    if (req.method === 'GET' && reqPath === '/profile/info') {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const userId = url.searchParams.get('user_id');
    
        connection_pool.query(
            `SELECT username, bio, profile_image FROM users WHERE id = ?`,
            [userId],
            (err, results) => {
                if (err || results.length === 0) {
                    res.writeHead(500, { 'Content-Type': 'text/plain' });
                    return res.end('Error loading profile info');
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(results[0]));
            }
        );
        return;
    }


    //Post Profile Update
    if (req.method === 'POST' && reqPath === '/profile/update') {
        const form = new multiparty.Form();
        form.parse(req, (err, fields, files) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                return res.end('Upload error');
            }
    
            const userId = fields.user_id[0];
            const bio = fields.bio ? fields.bio[0] : '';
            let profileImagePath = null;
    
            if (files.image && files.image[0].originalFilename !== '') {
                const file = files.image[0];
                const newFilename = `profile_${Date.now()}${path.extname(file.originalFilename)}`;
                const uploadPath = path.join(baseDir, 'public_html', 'image', newFilename);
    
                fs.copyFileSync(file.path, uploadPath);
                profileImagePath = `image/${newFilename}`;
            }
    
            let query = 'UPDATE users SET bio = ?';
            let params = [bio];
    
            if (profileImagePath) {
                query += ', profile_image = ?';
                params.push(profileImagePath);
            }
    
            query += ' WHERE id = ?';
            params.push(userId);
    
            connection_pool.query(query, params, err => {
                if (err) {
                    res.writeHead(500, { 'Content-Type': 'text/plain' });
                    return res.end('Database error');
                }
                res.writeHead(200, { 'Content-Type': 'text/plain' });
                res.end('Profile updated');
            });
        });
        return;
    }
    
    

    // handle artist songs and albums upload
    if (req.method == 'POST' && req.url == '/upload') {
       // const queryParams = url.parse(req.url, true).query;
       // const userId = queryParams.user_id; 
        const form = new formidable.IncomingForm({
            multiples: true,
            uploadDir: path.join(__dirname,'..', 'public_html', 'music'), 
            keepExtensions: true 
        });

        form.parse(req, (err, fields, files) => {   
            if (err) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Error uploading files');
                return;
            }
        const userId = fields.user_id; 
            // this handle album uplooad
            if (files.albumart) {
               // const albumFilePath = path.basename(files.albumfile[0].filepath);
                const albumCoverPath = path.basename(files.albumart[0].filepath);
                
               // fs.renameSync(files.albumfile[0].filepath, path.join(__dirname,'..', 'public_html', 'music', albumFilePath));
                fs.renameSync(files.albumart[0].filepath, path.join(__dirname,'..', 'public_html', 'image', albumCoverPath));

                connection_pool.query(`INSERT INTO albums (name, artist, cover, date_added, artist_id) VALUES ('${fields.albumtitle}', '${fields.artistname}', 'image/${albumCoverPath}', NOW(), ${userId})`,
                    (error, results) => {
                        if (error){
                           res.writeHead(500, { 'Content-Type': 'text/plain' });
                           res.end('Database Error');
                           return;
                        }
                        res.writeHead(200, { 'Content-Type': 'text/plain' });
                        res.end('Album uploaded successfully');
                    });
                return;
            }
            // this handle songs upload
            if (files.songfile) {
                const songFilePath = path.basename(files.songfile[0].filepath);
                const songCoverPath = path.basename(files.songart[0].filepath);
               
                fs.renameSync(files.songfile[0].filepath, path.join(__dirname,'..', 'public_html', 'music', songFilePath));
                fs.renameSync(files.songart[0].filepath, path.join(__dirname,'..', 'public_html', 'image', songCoverPath));

                connection_pool.query(`INSERT INTO songs (name, artist, cover, path, artist_id) VALUES ('${fields.songtitle}', '${fields.artistname}', 'image/${songCoverPath}', 'music/${songFilePath}',${userId})`,
                    (error, results) => {
                        if (error){
                           res.writeHead(500, { 'Content-Type': 'text/plain' });
                           res.end('Database Error');
                           return;
                        }
                        res.writeHead(200, { 'Content-Type': 'text/plain' });
                        res.end('Song uploaded successfully');
                    });
            }
        });

        return;
    }
 
    // handle favorite
    if (req.method == "POST" && reqPath == "/addFavorite") {
    let body = "";
    req.on("data", chunk => {
        body += chunk;
    });

    req.on("end", () => {
        const data = JSON.parse(body);
        const songId = data.songId;
        const userId = 1; 

        //  Add the song to the user's favorite list
        connection_pool.query(
            "INSERT INTO favorites (user_id, song_id) VALUES (?, ?)",
            [userId, songId],
            (error, results) => {
                if (error) {
                    res.writeHead(500, { "Content-Type": "text/plain" });
                    return res.end("Error adding song to favorites");
                }

                res.writeHead(200, { "Content-Type": "text/plain" });
                res.end("Song added to favorites");
            }
        );
    });

    return;
    }
 

    // Remove from favorites
if (req.method == "POST" && reqPath == "/removeFavorite") {
    let body = "";
    req.on("data", chunk => {
        body += chunk;
    });

    req.on("end", () => {
        const data = JSON.parse(body);
        const songId = data.songId;
        const userId = 1; 

        //  Remove the song from the user's favorite list
        connection_pool.query(
            "DELETE FROM favorites WHERE user_id = ? AND song_id = ?",
            [userId, songId],
            (error, results) => {
                if (error) {
                    res.writeHead(500, { "Content-Type": "text/plain" });
                    return res.end("Error removing song from favorites");
                }

                res.writeHead(200, { "Content-Type": "text/plain" });
                res.end("Song removed from favorites");
            }
        );
    });

    return;
}

        

    // Handle Range Requests for MP3 files
    if (ext == '.mp3') {
        fs.stat(filePath, (err, stats) => {
            if (err) {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                return res.end('404 - File Not Found');
            }
            const range = req.headers.range;
            if (!range) {
                res.writeHead(200, {
                    'Content-Type': contentType,
                    'Content-Length': stats.size,
                });
                fs.createReadStream(filePath).pipe(res);
            } else {
                const parts = range.replace(/bytes=/, "").split("-");
                const start = parseInt(parts[0], 10);
                const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;

                if (start >= stats.size) {
                    res.writeHead(416, {
                        'Content-Range': `bytes */${stats.size}`
                    });
                    return res.end();
                }

                const chunkSize = (end - start) + 1;
                const stream = fs.createReadStream(filePath, { start, end });

                res.writeHead(206, {
                    'Content-Range': `bytes ${start}-${end}/${stats.size}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': chunkSize,
                    'Content-Type': contentType
                });

                stream.pipe(res);
            }
        });
       } else {
           fs.readFile(filePath, (err, data) => {
               if (err) {
                  res.writeHead(404, { 'Content-Type': 'text/plain' });
                  res.end('404 - File Not Found');
               } else {
                   res.writeHead(200, { 'Content-Type': contentType });
                   res.end(data);
               }
           });
    }

});

server.listen(80, () => {
    console.log('Server running on port 80');
});
