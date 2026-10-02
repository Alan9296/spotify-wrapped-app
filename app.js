const API_BASE = 'http://127.0.0.1:5000/api';
let chartInstance = null;
let songsData = [];
let editingSongId = null;
let swiperInstance = null;

let isGuest = false;
let isRegisterMode = false;
let guestSongs = [
  { _id: 'g1', title: 'Bohemian Rhapsody', artist: 'Queen', album: 'A Night at the Opera', plays: 9800, durationMinutes: 5.9, imageUrl: '' },
  { _id: 'g2', title: 'Blinding Lights', artist: 'The Weeknd', album: 'After Hours', plays: 8500, durationMinutes: 3.3, imageUrl: '' }
];

document.addEventListener('DOMContentLoaded', () => {
  // Inicializar Swiper
  swiperInstance = new Swiper('.mySwiper', {
    pagination: { el: '.swiper-pagination', clickable: true },
    keyboard: true
  });

  // Verificar si venimos del Login de Spotify con un token en la URL
  const urlParams = new URLSearchParams(window.location.search);
  const spotifyAccessToken = urlParams.get('spotify_access_token');

  if (spotifyAccessToken) {
    // Limpiar URL
    window.history.replaceState({}, document.title, window.location.pathname);
    loadSpotifyWrapped(spotifyAccessToken);
  } else {
    checkSession();
  }

  // Redirigir a Spotify Login
  document.getElementById('btn-spotify-login').addEventListener('click', () => {
    window.location.href = `${API_BASE}/auth/spotify/login`;
  });

  // Cerrar / Reabrir Wrapped
  document.getElementById('btn-close-wrapped').addEventListener('click', closeWrapped);
  document.getElementById('btn-continue-dashboard').addEventListener('click', closeWrapped);
  document.getElementById('btn-reopen-wrapped').addEventListener('click', () => {
    document.getElementById('wrapped-container').style.display = 'block';
  });

  // Auth local
  document.getElementById('toggle-auth-link').addEventListener('click', (e) => {
    e.preventDefault();
    isRegisterMode = !isRegisterMode;
    document.getElementById('auth-form').innerHTML = isRegisterMode 
      ? `<input type="email" id="auth-email" placeholder="Correo electrónico" required>
         <input type="password" id="auth-password" placeholder="Contraseña" required>
         <button type="submit">Registrarme</button>`
      : `<input type="email" id="auth-email" placeholder="Correo electrónico" required>
         <input type="password" id="auth-password" placeholder="Contraseña" required>
         <button type="submit">Entrar al Dashboard</button>`;
  });

  document.getElementById('auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const endpoint = isRegisterMode ? '/auth/register' : '/auth/login';

    try {
      const res = await fetch(API_BASE + endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();

      if (res.ok) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('email', data.email);
        isGuest = false;
        checkSession();
      } else {
        alert(data.message || 'Error en la autenticación');
      }
    } catch (err) {
      alert('Error al conectar con el servidor');
    }
  });

  document.getElementById('btn-guest-mode').addEventListener('click', () => {
    isGuest = true;
    checkSession();
  });

  document.getElementById('btn-logout').addEventListener('click', () => {
    localStorage.clear();
    isGuest = false;
    checkSession();
  });

  // Importar info desde Spotify por URL
  document.getElementById('btn-fetch-spotify').addEventListener('click', async () => {
    const url = document.getElementById('spotify-url').value;
    if (!url) return alert('Por favor pega un enlace de Spotify');

    try {
      const res = await fetch(`${API_BASE}/spotify-info?url=${encodeURIComponent(url)}`);
      const data = await res.json();

      if (res.ok) {
        document.getElementById('title').value = data.title;
        document.getElementById('artist').value = data.artist;
        document.getElementById('album').value = data.album;
        document.getElementById('plays').value = data.plays;
        document.getElementById('duration').value = data.durationMinutes;
        document.getElementById('image-url').value = data.imageUrl || '';
      } else {
        alert(data.message || 'Error al obtener la información');
      }
    } catch (err) {
      alert('Error al conectar con el servidor');
    }
  });

  // Formulario canciones
  const form = document.getElementById('song-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const songPayload = {
      title: document.getElementById('title').value,
      artist: document.getElementById('artist').value,
      album: document.getElementById('album').value,
      plays: Number(document.getElementById('plays').value),
      durationMinutes: Number(document.getElementById('duration').value),
      imageUrl: document.getElementById('image-url').value
    };

    if (isGuest) {
      if (editingSongId) {
        const index = guestSongs.findIndex(s => s._id === editingSongId);
        if (index !== -1) guestSongs[index] = { ...songPayload, _id: editingSongId };
      } else {
        guestSongs.push({ ...songPayload, _id: 'g_' + Date.now() });
      }
      resetFormState();
      renderDashboard(guestSongs);
      form.reset();
      return;
    }

    const token = localStorage.getItem('token');
    try {
      if (editingSongId) {
        await fetch(`${API_BASE}/songs/${editingSongId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify(songPayload)
        });
      } else {
        await fetch(`${API_BASE}/songs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify(songPayload)
        });
      }
      resetFormState();
      form.reset();
      fetchSongs();
    } catch (error) {
      console.error('Error al guardar canción:', error);
    }
  });

  document.getElementById('btn-cancel-edit').addEventListener('click', resetFormState);

  document.getElementById('search-input').addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    const filtered = songsData.filter(s => 
      s.title.toLowerCase().includes(query) ||
      s.artist.toLowerCase().includes(query) ||
      s.album.toLowerCase().includes(query)
    );
    renderTable(filtered);
    renderChart(filtered);
  });

  document.getElementById('btn-export-csv').addEventListener('click', exportToCSV);
});

// Cargar Wrapped de Spotify
async function loadSpotifyWrapped(spotifyToken) {
  try {
    const res = await fetch(`${API_BASE}/spotify/user-wrapped`, {
      headers: { 'x-spotify-token': spotifyToken }
    });
    const data = await res.json();

    if (!res.ok) return alert('Error al cargar datos de Spotify');

    // Popular slides del Wrapped
    document.getElementById('wrapped-user-img').src = data.user.avatar;
    document.getElementById('wrapped-user-name').innerText = `¡Hola, ${data.user.displayName}!`;

    // Tracks
    const tracksList = document.getElementById('wrapped-tracks-list');
    tracksList.innerHTML = data.topTracks.map(t => `<li><strong>${t.title}</strong> - ${t.artist}</li>`).join('');

    // Artists
    const artistsContainer = document.getElementById('wrapped-artists-container');
    artistsContainer.innerHTML = data.topArtists.map(a => `
      <div class="artist-card">
        <img src="${a.image}" alt="${a.name}">
        <h4>${a.name}</h4>
      </div>
    `).join('');

    // Genres
    const genresContainer = document.getElementById('wrapped-genres-container');
    genresContainer.innerHTML = data.topGenres.map(g => `<span class="genre-badge">${g}</span>`).join('');

    // Summary Card
    document.getElementById('summary-user-title').innerText = `Resumen de ${data.user.displayName}`;
    document.getElementById('summary-content').innerHTML = `
      <p style="margin-top: 10px;">👑 <strong>Top Artista:</strong> ${data.topArtists[0]?.name || 'N/A'}</p>
      <p style="margin-top: 5px;">🔥 <strong>Top Canción:</strong> ${data.topTracks[0]?.title || 'N/A'}</p>
    `;

    document.getElementById('auth-container').style.display = 'none';
    document.getElementById('wrapped-container').style.display = 'block';
    document.getElementById('btn-reopen-wrapped').style.display = 'inline-block';

  } catch (err) {
    console.error(err);
    alert('Error al conectar con Spotify');
  }
}

function closeWrapped() {
  document.getElementById('wrapped-container').style.display = 'none';
  document.getElementById('dashboard-container').style.display = 'block';
  document.getElementById('user-badge').innerText = 'Usuario Autenticado vía Spotify';
}

function checkSession() {
  const token = localStorage.getItem('token');
  const email = localStorage.getItem('email');

  if (token || isGuest) {
    document.getElementById('auth-container').style.display = 'none';
    document.getElementById('dashboard-container').style.display = 'block';

    if (isGuest) {
      document.getElementById('user-badge').innerText = 'Modo Invitado (Vista Previa)';
      renderDashboard(guestSongs);
    } else {
      document.getElementById('user-badge').innerText = `Usuario: ${email}`;
      fetchSongs();
    }
  } else {
    document.getElementById('auth-container').style.display = 'block';
    document.getElementById('dashboard-container').style.display = 'none';
  }
}

async function fetchSongs() {
  const token = localStorage.getItem('token');
  try {
    const response = await fetch(`${API_BASE}/songs`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (response.status === 401 || response.status === 403) {
      localStorage.clear();
      checkSession();
      return;
    }
    songsData = await response.json();
    renderDashboard(songsData);
  } catch (error) {
    console.error('Error al obtener canciones:', error);
  }
}

function renderDashboard(songs) {
  songsData = songs;
  renderTable(songs);
  renderChart(songs);
  updateKPIs(songs);
}

function updateKPIs(songs) {
  const totalSongs = songs.length;
  const totalPlays = songs.reduce((sum, s) => sum + s.plays, 0);
  const avgPlays = totalSongs > 0 ? Math.round(totalPlays / totalSongs) : 0;
  const totalDuration = songs.reduce((sum, s) => sum + s.durationMinutes, 0);

  document.getElementById('kpi-total-songs').innerText = totalSongs;
  document.getElementById('kpi-avg-plays').innerText = avgPlays.toLocaleString();
  document.getElementById('kpi-total-duration').innerText = `${totalDuration.toFixed(1)} min`;
}

function renderTable(songs) {
  const tbody = document.getElementById('songs-table-body');
  tbody.innerHTML = '';

  songs.forEach(song => {
    const tr = document.createElement('tr');
    const imageSrc = song.imageUrl || 'https://via.placeholder.com/45?text=🎵';
    tr.innerHTML = `
      <td><img src="${imageSrc}" class="album-cover" alt="Cover"></td>
      <td>${song.title}</td>
      <td>${song.artist}</td>
      <td>${song.album}</td>
      <td>${song.plays.toLocaleString()}</td>
      <td>${song.durationMinutes} min</td>
      <td>
        <button onclick="editSong('${song._id}')" style="background: #eab308; color: black; border: none; padding: 6px 10px; border-radius: 4px; cursor: pointer; margin-right: 5px; font-weight: bold;">Editar</button>
        <button onclick="deleteSong('${song._id}')" style="background: #ef4444; color: white; border: none; padding: 6px 10px; border-radius: 4px; cursor: pointer; font-weight: bold;">Eliminar</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function deleteSong(id) {
  if (!confirm('¿Seguro que deseas eliminar esta canción?')) return;

  if (isGuest) {
    guestSongs = guestSongs.filter(s => s._id !== id);
    renderDashboard(guestSongs);
    return;
  }

  const token = localStorage.getItem('token');
  try {
    await fetch(`${API_BASE}/songs/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    fetchSongs();
  } catch (err) {
    console.error('Error al eliminar:', err);
  }
}

function editSong(id) {
  const song = songsData.find(s => s._id === id);
  if (!song) return;

  editingSongId = id;
  document.getElementById('title').value = song.title;
  document.getElementById('artist').value = song.artist;
  document.getElementById('album').value = song.album;
  document.getElementById('plays').value = song.plays;
  document.getElementById('duration').value = song.durationMinutes;
  document.getElementById('image-url').value = song.imageUrl || '';

  const submitBtn = document.getElementById('btn-submit-form');
  submitBtn.innerText = 'Actualizar Canción';
  submitBtn.style.background = '#eab308';
  submitBtn.style.color = 'black';
  document.getElementById('btn-cancel-edit').style.display = 'block';
}

function resetFormState() {
  editingSongId = null;
  document.getElementById('song-form').reset();
  document.getElementById('image-url').value = '';

  const submitBtn = document.getElementById('btn-submit-form');
  submitBtn.innerText = 'Guardar Canción';
  submitBtn.style.background = '#1db954';
  submitBtn.style.color = 'white';
  document.getElementById('btn-cancel-edit').style.display = 'none';
}

function renderChart(songs) {
  const ctx = document.getElementById('songsChart').getContext('2d');

  if (chartInstance) {
    chartInstance.destroy();
  }

  chartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: songs.map(s => s.title),
      datasets: [{
        label: 'Reproducciones',
        data: songs.map(s => s.plays),
        backgroundColor: '#1db954'
      }]
    },
    options: {
      responsive: true,
      scales: {
        y: { beginAtZero: true, ticks: { color: '#ffffff' } },
        x: { ticks: { color: '#ffffff' } }
      },
      plugins: {
        legend: { labels: { color: '#ffffff' } }
      }
    }
  });
}

function exportToCSV() {
  if (songsData.length === 0) return alert('No hay datos para exportar');

  let csvContent = "data:text/csv;charset=utf-8,Titulo,Artista,Album,Reproducciones,Duracion\n";
  songsData.forEach(s => {
    csvContent += `"${s.title}","${s.artist}","${s.album}",${s.plays},${s.durationMinutes}\n`;
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", "spotify_stats.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}