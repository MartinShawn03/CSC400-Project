document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.querySelector('#loginForm');
    const signupForm = document.querySelector('#signupForm');

    // Fetch and display profile data (username, bio, profile picture)
    const profileUsername = document.getElementById("usernamefromsql");
    const profileBio = document.getElementById("profilebio");
    const profileImage = document.getElementById("profilepic");
    const editForm = document.getElementById("editProfileForm");

    if (profileUsername && profileBio && profileImage) {
        const xhr = new XMLHttpRequest();
        xhr.open("GET", "/user/profile?user_id=1", true); // Replace 1 with dynamic id if needed
        xhr.onload = function () {
            if (xhr.status === 200) {
                const user = JSON.parse(xhr.responseText);
                profileUsername.textContent = user.username;
                profileBio.textContent = user.bio || "Click edit to add your bio!";
                profileImage.src = user.profile_pic || "/image/prof.jpg";
            }
        };
        xhr.send();
    }

    // Handle profile edit submission
    if (editForm) {
        editForm.addEventListener("submit", function (e) {
            e.preventDefault();

            const formData = new FormData(editForm);
            const xhr = new XMLHttpRequest();
            xhr.open("POST", "/user/update-profile", true);
            xhr.onload = function () {
                if (xhr.status === 200) {
                    alert("Profile updated!");
                    window.location.reload(); // Refresh to show updates
                } else {
                    alert("Failed to update profile.");
                }
            };
            xhr.send(formData);
        });
    }

    // Login
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();  

            const username = document.querySelector('#loginUsername').value;
            const pw = document.querySelector('#loginPassword').value;
            const xhr = new XMLHttpRequest();

            xhr.open('POST', '/login.html', true);
            xhr.setRequestHeader('Content-Type', 'application/json');

            xhr.onload = function () {
                if (xhr.status == 200) {
                    window.location.href = xhr.responseURL;
                } else {
                    alert('Login failed');
                }
            };

            const data = JSON.stringify({ username, pw });
            xhr.send(data);
        });
    }

    // Signup
    if (signupForm) {
        signupForm.addEventListener('submit', (e) => {
            e.preventDefault(); 

            const username = document.querySelector('#signupUsername').value;
            const pw = document.querySelector('#signupPassword').value;
            const pwr = document.querySelector('#signupRepassword').value;
            const role = document.querySelector('#role').value;

            if (pw !== pwr) {
                alert('Passwords do not match!');
                return; 
            }

            const xhr = new XMLHttpRequest();
            xhr.open('POST', '/signup.html', true);
            xhr.setRequestHeader('Content-Type', 'application/json');

            xhr.onload = function () {
                if (xhr.status == 201) {
                    alert('Signup successful! Please log in.');
                    window.location.href = '/login.html';
                } else {
                    alert('Error signing up');
                }
            };

            const data = JSON.stringify({ username, pw, pwr, role });
            xhr.send(data);
        });
    }
    


//favorites add/remove
let currentSongId = null;

function toggleFavorite(userId, songId, add) {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', add ? '/favorites/add' : '/favorites/remove', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.send(JSON.stringify({ user_id: userId, song_id: songId }));
}

const favBtn = document.querySelector(".favorite");
const nonFavBtn = document.querySelector(".nonfavorite");

if (favBtn && nonFavBtn) {
    favBtn.addEventListener("click", () => {
        toggleFavorite(1, currentSongId, false); // remove
        favBtn.style.display = 'none';
        nonFavBtn.style.display = 'inline';
    });

    nonFavBtn.addEventListener("click", () => {
        toggleFavorite(1, currentSongId, true); // add
        favBtn.style.display = 'inline';
        nonFavBtn.style.display = 'none';
    });
}



    const albumForm = document.getElementById('albumForm');
    const songForm = document.getElementById('songForm');
    if (albumForm){ 
    // album form submission
    const userId = sessionStorage.getItem('user_id');
    albumForm.addEventListener('submit', function(e) {
        e.preventDefault(); 

        const formData = new FormData(albumForm); 
        formData.append('user_id', userId);
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/upload', true);
        xhr.onload = function() {
            if (xhr.status == 200) {
                alert('Album uploaded successfully!');
            } else {
                alert('Failed to upload album.');
            }
        };
        xhr.send(formData);

        // Reset the form after submission
        albumForm.reset();
    });
}
    if (songForm){
   // song form submission
    songForm.addEventListener('submit', function(e) {
        e.preventDefault(); 

        const formData = new FormData(songForm); 
        formData.append('user_id', userId);
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/upload', true);
        xhr.onload = function() {
            if (xhr.status == 200) {
                alert('Song uploaded successfully!');
            } else {
                alert('Failed to upload song.');
            }
        };
        xhr.send(formData);

        // Reset the form after submission
        songForm.reset();
    });

}

    // Music player setup (only on listener_main.html)
    const music = document.querySelector('#audio'); 
    const seekBar = document.querySelector('.seek-bar');
    const songName = document.querySelector('.song-name');
    const artistName = document.querySelector('.artist-name');
    const albumArt = document.querySelector('.album-art');
    const currentTime = document.querySelector('.current-time');
    const songDuration = document.querySelector('.song-duration');
    const playBtn = document.querySelector('.play');
    const pauseBtn = document.querySelector('.pause');
    const forwardBtn = document.querySelector('.forward');
    const backwardBtn = document.querySelector('.back');
    if (music && seekBar && songName && artistName && albumArt && currentTime && songDuration && playBtn && pauseBtn && forwardBtn && backwardBtn) {
        let currentMusic = 0;
        let songs = [];

        const formatTime = (time) => {
            let min = Math.floor(time/60);
            if(min <10){
                min = `0${min}`;
            }
            let sec = Math.floor(time%60);
            if(sec < 10){
               sec = `0${sec}`;
            }
            return `${min} : ${sec}`;
        };

        const setMusic = (i) => {
            currentSongId = songs[i].id;
            // Check if current song is favorited
            const xhr = new XMLHttpRequest();
            xhr.open('GET', `/favorites?user_id=1`, true); // Replace 1 with dynamic user later
            xhr.onload = function () {
                if (xhr.status === 200) {
                    const favorites = JSON.parse(xhr.responseText);
                    const isFavorited = favorites.some(song => song.id === currentSongId);
                    updateFavoriteButtons(isFavorited);
                    updatePlaylistButtons(currentSongId);
                }
            };
            xhr.send();

            
            seekBar.value = 0;
            let song = songs[i];
            currentMusic = i;
            music.src = song.path;
       
            songName.innerHTML = song.name;
            artistName.innerHTML = song.artist;
            albumArt.style.backgroundImage = `url('${song.cover}')`;
            currentTime.innerHTML = '0:00';
            
             //this will wait music to fully load and then play
            music.addEventListener('loadedmetadata', () => {
            seekBar.max = music.duration;
            songDuration.innerHTML = formatTime(music.duration);
            });

            // Reset playlist menu and icon
            resetPlaylistButtons();

        };

        function updateFavoriteButtons(isFavorited) {
            const favBtn = document.querySelector(".favorite");
            const nonFavBtn = document.querySelector(".nonfavorite");
        
            if (isFavorited) {
                favBtn.style.display = "inline";
                nonFavBtn.style.display = "none";
            } else {
                favBtn.style.display = "none";
                nonFavBtn.style.display = "inline";
            }
        }

        function updatePlaylistButtons(songId) {
            const addBtn = document.querySelector(".add-to-playlist");
            const addedBtn = document.querySelector(".added-to-playlist");
        
            const xhr = new XMLHttpRequest();
            xhr.open("GET", `/playlist/song-status?user_id=1&song_id=${songId}`, true);
            xhr.onload = function () {
                if (xhr.status === 200) {
                    const isInPlaylist = JSON.parse(xhr.responseText).inPlaylist;
                    if (isInPlaylist) {
                        addBtn.style.display = "none";
                        addedBtn.style.display = "inline";
                    } else {
                        addBtn.style.display = "inline";
                        addedBtn.style.display = "none";
                    }
                }
            };
            xhr.send();
        }
        
        //click on song
        function attachClickToSongElement(songElement, songData) {
            songElement.addEventListener('click', () => {
                currentSongId = songData.id;
                music.src = songData.path;
                songName.textContent = songData.name;
                artistName.textContent = songData.artist;
                albumArt.style.backgroundImage = `url('${songData.cover}')`;
        
                seekBar.value = 0;
                currentTime.textContent = '0:00';
        
                music.addEventListener('loadedmetadata', () => {
                    seekBar.max = music.duration;
                    songDuration.textContent = `${Math.floor(music.duration / 60)}:${Math.floor(music.duration % 60).toString().padStart(2, '0')}`;
                    music.play();
                    playBtn.style.display = 'none';
                    pauseBtn.style.display = 'inline-block';
                });
        
                // Optional: reset playlist/favorite buttons if you use them
                resetPlaylistButtons?.();
                updateFavoriteButtons?.(false);
            });
        }
        
        
     
       const loadSongs = () => {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', '/songs', true);
            xhr.onload = function () {
                if (xhr.status == 200) {
                    songs = JSON.parse(xhr.responseText);
                    if (songs.length > 0) {
                        setMusic(0);
                    }
                } else {
                    console.error('Failed to load songs');
                }
            };
            xhr.send();
        };

        loadSongs();

        setInterval(() => {
            seekBar.value = music.currentTime;
            currentTime.innerHTML = formatTime(music.currentTime);  
        }, 500);

        seekBar.addEventListener('change', () => {
            music.currentTime = seekBar.value;
        });

        playBtn.addEventListener('click', () => {
            music.play();
            playBtn.style.display = 'none';
            pauseBtn.style.display = 'inline-block';
        });

        pauseBtn.addEventListener('click', () => {
            music.pause();
            playBtn.style.display = 'inline-block';
            pauseBtn.style.display = 'none';
        });

        forwardBtn.addEventListener('click', () => {
            if(currentMusic >= songs.length -1){
                currentMusic = 0;
            } else {
                currentMusic++;
            }
            setMusic(currentMusic);
            playBtn.click();
        });

        backwardBtn.addEventListener('click', () => {
            if(currentMusic <= 0){
                currentMusic = songs.length -1;
            } else {
                currentMusic--;
            }
            setMusic(currentMusic);
            playBtn.click();
        });
    }



// Song and Album Loading
if (document.getElementById("songs") && document.getElementById("albums")) {
    const songsContainer = document.getElementById("songs");
    const albumsContainer = document.getElementById("albums");

    const loadSongsData = () => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', '/songs', true); 
        xhr.setRequestHeader('Content-Type', 'application/json');

        xhr.onload = function () {
            if (xhr.status === 200) {
                const data = JSON.parse(xhr.responseText);
                
                data.forEach(song => {
                    const songItem = document.createElement('div');
                    songItem.classList.add('song-item');
                    songItem.innerHTML = `
                        <img src="${song.cover}" alt="${song.name}">
                        <h3>${song.name}</h3>
                        <p>${song.artist}</p>
                    `;


                    songsContainer.appendChild(songItem);
                    attachClickToSongElement(songItem, song); //added for click
                });
            }
        };

        xhr.onerror = function () {
            console.error('Error fetching songs.');
        };

        xhr.send();
    };

    const loadAlbumsData = () => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', '/albums', true); 
        xhr.setRequestHeader('Content-Type', 'application/json');

        xhr.onload = function () {
            if (xhr.status === 200) {
                const data = JSON.parse(xhr.responseText);
                
                data.forEach(album => {
                    const albumItem = document.createElement('div');
                    albumItem.classList.add('album-item');
                    albumItem.innerHTML = `
                        <img src="${album.cover}" alt="${album.name}">
                        <h3>${album.name}</h3>
                        <p>${album.artist}</p>
                    `;
                    albumsContainer.appendChild(albumItem);
                });
            }
        };

        xhr.onerror = function () {
            console.error('Error fetching albums.');
        };

        xhr.send();
    };


    loadSongsData();
    loadAlbumsData();
    
}
    

    const urlParams = new URLSearchParams(window.location.search);
    const userIdFromURL = urlParams.get("user_id");

    if (userIdFromURL) {
        sessionStorage.setItem('user_id', userIdFromURL);
    }

    const userId = sessionStorage.getItem('user_id');

    // artist songs and albums on main page
    const artistSongsContainer = document.getElementById("artist_songs");
    const artistAlbumsContainer = document.getElementById("artist_albums");
    if (artistSongsContainer && artistAlbumsContainer) {
    // Get user_id from URL
   // const urlParams = new URLSearchParams(window.location.search);
   // const userId = urlParams.get("user_id");
//    const userId = "2";
    const artistLoadSongsData = () => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', `/artist_songs?user_id=${userId}`, true); 
    xhr.setRequestHeader('Content-Type', 'application/json');

    xhr.onload = function () {
        if (xhr.status === 200) {
            const data = JSON.parse(xhr.responseText);
            
            data.forEach(song => {
                const songItem = document.createElement('div');
                songItem.classList.add('song-item');
                songItem.innerHTML = `
                    <img src="${song.cover}" alt="${song.name}">
                    <h3>${song.name}</h3>
                    <p>${song.artist}</p>
                `;
                artistSongsContainer.appendChild(songItem);
            });
        }
    };
    xhr.onerror = function () {
        console.error('Error fetching artist songs.');
    };

    xhr.send();
};

    const artistLoadAlbumsData = () => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', `/artist_albums?user_id=${userId}`, true); 
    xhr.setRequestHeader('Content-Type', 'application/json');

    xhr.onload = function () {
        if (xhr.status === 200) {
            const data = JSON.parse(xhr.responseText);
            
            data.forEach(album => {
                const albumItem = document.createElement('div');
                albumItem.classList.add('album-item');
                albumItem.innerHTML = `
                    <img src="${album.cover}" alt="${album.name}">
                    <h3>${album.name}</h3>
                    <p>${album.artist}</p>
                `;
                artistAlbumsContainer.appendChild(albumItem);
            });
        }
    };

    xhr.onerror = function () {
        console.error('Error fetching artist albums.');
    };

    xhr.send();
};

artistLoadSongsData();
artistLoadAlbumsData();
}




        // Playlist Dropdown Logic
        const playlistDropdown = document.getElementById("playlistDropdown");
        const playlistOptions = document.getElementById("playlistOptions");
        const addToPlaylistBtn = document.querySelector(".add-to-playlist");
        const addedToPlxaylistBtn = document.querySelector(".added-to-playlist");
    
        if (addToPlaylistBtn) {
            addToPlaylistBtn.addEventListener("click", () => {
                if (!currentSongId) return;
    
                playlistDropdown.style.display = "block";
                playlistOptions.innerHTML = "Loading...";
    
                const xhr = new XMLHttpRequest();
                xhr.open("GET", "/playlist/list?user_id=1", true); // hardcoded user
                xhr.onload = function () {
                    if (xhr.status === 200) {
                        const playlists = JSON.parse(xhr.responseText);
                        playlistOptions.innerHTML = "";
    
                        if (playlists.length === 0) {
                            playlistOptions.innerHTML = "<p>No playlists found.</p>";
                        } else {
                            playlists.forEach(pl => {
                                const label = document.createElement("label");
                                label.innerHTML = `
                                    <input type="checkbox" data-id="${pl.id}"> ${pl.name}
                                `;
                                playlistOptions.appendChild(label);
                            });
    
                            playlistOptions.querySelectorAll("input").forEach(box => {
                                box.addEventListener("change", function () {
                                    const playlistId = this.getAttribute("data-id");
                                    const add = this.checked;
    
                                    const xhr2 = new XMLHttpRequest();
                                    xhr2.open("POST", add ? "/playlist/add-song" : "/playlist/remove-song", true);
                                    xhr2.setRequestHeader("Content-Type", "application/json");
                                    xhr2.send(JSON.stringify({
                                        playlist_id: playlistId,
                                        song_id: currentSongId
                                    }));
                                });
                            });
                        }
                    } else {
                        playlistOptions.innerHTML = "<p>Error loading playlists.</p>";
                    }
                };
                xhr.send();
            });
    
            // Reset icon on track change
            function resetPlaylistButtons() {
                addToPlaylistBtn.style.display = 'inline';
                addedToPlaylistBtn.style.display = 'none';
                playlistDropdown.style.display = 'none';
            }
    
            // Also close dropdown when clicking outside
            document.addEventListener("click", function (e) {
                if (!playlistDropdown.contains(e.target) && !addToPlaylistBtn.contains(e.target)) {
                    playlistDropdown.style.display = "none";
                }
            });
        }
    

    


});



