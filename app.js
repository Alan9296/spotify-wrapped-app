const API_BASE = 'https://spotify-wrapped-app-bhh0.onrender.com/api';
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
  // Inicializar Swiper si el contenedor existe
  if (document.querySelector('.mySwiper')) {
    swiperInstance = new Swiper('.mySwiper', {
      pagination: { el: '.swiper-pagination', clickable: true },
      keyboard: true
    });
  }

  // Verificar si venimos del Login de Spotify con un token en la URL
  const urlParams = new URLSearchParams(window.location.search);
  const spotifyAccessToken = urlParams.get('access_token') || urlParams.get('spotify_access_token');

  if (spotifyAccessToken) {
    // Guardar el token para mantener la sesión activa
    localStorage.setItem('token', spotifyAccessToken);
    // Limpiar parámetros de la URL
    window.history.replaceState({}, document.title, window.location.pathname);
    loadSpotifyWrapped(spotifyAccessToken);
  } else {
    checkSession();
  }

  const spotifyBtn = document.getElementById('btn-spotify-login') || document.getElementById('btn-spotify-sync');
  spotifyBtn?.addEventListener('click', () => {
    window.location.href = 'https://spotify-wrapped-app-bhh0.onrender.com/api/auth/spotify/login';
  });

  // Cerrar / Reabrir Wrapped
  document.getElementById('btn-close-wrapped')?.addEventListener('click', closeWrapped);
  document.getElementById('btn-continue-dashboard')?.addEventListener('click', closeWrapped);
  document.getElementById('btn-reopen-wrapped')?.addEventListener('click', () => {
    const wrappedContainer = document.getElementById('wrapped-container');
    if (wrappedContainer) wrappedContainer.style.display = 'block';
  });

  // Auth local
  document.getElementById('toggle-auth-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    isRegisterMode = !isRegisterMode;
    const authForm = document.getElementById('auth-form');
    if (authForm) {
      authForm.innerHTML = isRegisterMode 
        ? `<input type="email" id="auth-email" placeholder="Correo electrónico" required>
           <input type="password" id="auth-password" placeholder="Contraseña" required>
           <button type="submit">Registrarme</button>`
        : `<input type="email" id="auth-email" placeholder="Correo electrónico" required>
           <input type="password" id="auth-password" placeholder="Contraseña" required>`;
    }
  });

  document.getElementById('auth-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('auth-email')?.value;
    const password = document.getElementById('auth-password')?.value;
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

  document.getElementById('btn-guest-mode')?.addEventListener('click', () => {
    isGuest = true;
    checkSession();
  });

  document.getElementById('btn-logout')?.addEventListener('click', () => {
    localStorage.clear();
    isGuest = false;
    checkSession();
  });

  // Importar info desde Spotify por URL
  document.getElementById('btn-fetch-spotify')?.addEventListener('click', async () => {
    const urlInput = document.getElementById('spotify-url');
    const url = urlInput ? urlInput.value : '';
    if (!url) return alert('Por favor pega un enlace de Spotify');

    try {
      const res = await fetch(`${API_BASE}/spotify-info?url=${encodeURIComponent(url)}`);
      const data = await res.json();

      if (res.ok) {
        if (document.getElementById('title')) document.getElementById('title').value = data.title;
        if (document.getElementById('artist')) document.getElementById('artist').value = data.artist;
        if (document.getElementById('album')) document.getElementById('album').value = data.album;
        if (document.getElementById('plays')) document.getElementById('plays').value = data.plays;
        if (document.getElementById('duration')) document.getElementById('duration').value = data.durationMinutes;
        if (document.getElementById('image-url')) document.getElementById('image-url').value = data.imageUrl || '';
      } else {
        alert(data.message || 'Error al obtener la información');
      }
    } catch (err) {
      alert('Error al conectar con el servidor');
    }
  });

  // Formulario de canciones
  const form = document.getElementById('song-form');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const songPayload = {
      title: document.getElementById('title')?.value || '',
      artist: document.getElementById('artist')?.value || '',
      album: document.getElementById('album')?.value || '',
      plays: Number(document.getElementById('plays')?.value || 0),
      durationMinutes: Number(document.getElementById('duration')?.value || 0),
      imageUrl: document.getElementById('image-url')?.value || ''
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

  document.getElementById('btn-cancel-edit')?.addEventListener('click', resetFormState);

  document.getElementById('search-input')?.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    const filtered = songsData.filter(s => 
      s.title.toLowerCase().includes(query) ||
      s.artist.toLowerCase().includes(query) ||
      s.album.toLowerCase().includes(query)
    );
    renderTable(filtered);
    renderChart(filtered);
  });

  document.getElementById('btn-export-csv')?.addEventListener('click', exportToCSV);
});

// Cargar Wrapped de Spotify
async function loadSpotifyWrapped(spotifyToken) {
  try {
    const res = await fetch(`${API_BASE}/spotify/user-wrapped`, {
      headers: { 'x-spotify-token': spotifyToken }
    });
    
    if (!res.ok) {
      console.warn('Error en la respuesta de Spotify Wrapped:', res.status);
      return;
    }

    const data = await res.json();

    // 1. Nombre de usuario (Soporta múltiples campos posibles)
    const displayName = data.user?.displayName || 
                        data.user?.display_name || 
                        data.user?.name || 
                        data.user?.id || 
                        'Usuario';

    const userName = document.getElementById('wrapped-user-name');
    if (userName) {
      userName.innerText = `¡Hola, ${displayName}!`;
    }

    // 2. Avatar de usuario (FallBack a SVG de DiceBear si no hay imagen de Spotify)
    const userImg = document.getElementById('wrapped-user-img');
    if (userImg) {
      const avatarUrl = data.user?.avatar || 
                        data.user?.images?.[0]?.url || 
                        `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(displayName)}`;
      userImg.src = avatarUrl;
    }

    // 3. Top Canciones (Manejo defensivo de title/name y artist/artists)
    const tracksList = document.getElementById('wrapped-tracks-list');
    if (tracksList && data.topTracks) {
      tracksList.innerHTML = data.topTracks.map(t => {
        const title = t.title || t.name || 'Canción sin título';
        let artistName = 'Artista desconocido';
        
        if (typeof t.artist === 'string' && t.artist) {
          artistName = t.artist;
        } else if (Array.isArray(t.artists)) {
          artistName = t.artists.map(a => a.name).join(', ');
        } else if (t.artists && typeof t.artists === 'string') {
          artistName = t.artists;
        }

        return `<li><strong>${title}</strong> - ${artistName}</li>`;
      }).join('');
    }

    // 4. Top Artistas
    const artistsContainer = document.getElementById('wrapped-artists-container');
    if (artistsContainer && data.topArtists) {
      artistsContainer.innerHTML = data.topArtists.map(a => {
        const imgUrl = a.image || a.images?.[0]?.url || 'https://api.dicebear.com/7.x/identicon/svg?seed=artist';
        const artistName = a.name || 'Artista';
        return `
          <div class="artist-card" style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
            <img src="${imgUrl}" alt="${artistName}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover;">
            <h4 style="margin: 0; font-size: 14px;">${artistName}</h4>
          </div>
        `;
      }).join('');
    }

    // 5. Géneros Musicales
    const genresContainer = document.getElementById('wrapped-genres-container');
    if (genresContainer && data.topGenres) {
      genresContainer.innerHTML = data.topGenres.map(g => `<span class="genre-badge">${g}</span>`).join('');
    }

    // 6. Tarjeta de Resumen
    const summaryTitle = document.getElementById('summary-user-title');
    if (summaryTitle) {
      summaryTitle.innerText = `Resumen de ${displayName}`;
    }

    const summaryContent = document.getElementById('summary-content');
    if (summaryContent) {
      const topArtist = data.topArtists?.[0]?.name || 'N/A';
      const topTrack = data.topTracks?.[0]?.title || data.topTracks?.[0]?.name || 'N/A';
      summaryContent.innerHTML = `
        <p style="margin-top: 10px;">👑 <strong>Top Artista:</strong> ${topArtist}</p>
        <p style="margin-top: 5px;">🔥 <strong>Top Canción:</strong> ${topTrack}</p>
      `;
    }

    // Mostrar el contenedor
    const authContainer = document.getElementById('auth-container');
    if (authContainer) authContainer.style.display = 'none';

    const wrappedContainer = document.getElementById('wrapped-container');
    if (wrappedContainer) wrappedContainer.style.display = 'block';

    const reopenBtn = document.getElementById('btn-reopen-wrapped');
    if (reopenBtn) reopenBtn.style.display = 'inline-block';

  } catch (err) {
    console.error('Error al conectar con Spotify:', err);
  }
}

function closeWrapped() {
  const wrappedContainer = document.getElementById('wrapped-container');
  if (wrappedContainer) wrappedContainer.style.display = 'none';

  const dashboardContainer = document.getElementById('dashboard-container');
  if (dashboardContainer) dashboardContainer.style.display = 'block';

  const userBadge = document.getElementById('user-badge');
  if (userBadge) userBadge.innerText = 'Usuario Autenticado vía Spotify';
}

function checkSession() {
  const token = localStorage.getItem('token');
  const email = localStorage.getItem('email');

  const authContainer = document.getElementById('auth-container');
  const dashboardContainer = document.getElementById('dashboard-container');
  const userBadge = document.getElementById('user-badge');

  if (token || isGuest) {
    if (authContainer) authContainer.style.display = 'none';
    if (dashboardContainer) dashboardContainer.style.display = 'block';

    if (isGuest) {
      if (userBadge) userBadge.innerText = 'Modo Invitado (Vista Previa)';
      renderDashboard(guestSongs);
    } else {
      if (userBadge) userBadge.innerText = email ? `Usuario: ${email}` : 'Usuario Autenticado';
      fetchSongs();
    }
  } else {
    if (authContainer) authContainer.style.display = 'block';
    if (dashboardContainer) dashboardContainer.style.display = 'none';
  }
}

async function fetchSongs() {
  const token = localStorage.getItem('token');
  if (!token) return;

  try {
    const response = await fetch(`${API_BASE}/songs`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (response.status === 401 || response.status === 403) {
      localStorage.clear();
      checkSession();
      return;
    }

    if (!response.ok) {
      console.warn(`La consulta de canciones retornó el estado: ${response.status}`);
      return;
    }

    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      songsData = await response.json();
      renderDashboard(songsData);
    } else {
      console.warn('Respuesta recibida no es en formato JSON.');
    }
  } catch (error) {
    console.error('Error en fetchSongs:', error);
  }
}

function renderDashboard(songs) {
  songsData = songs;
  renderTable(songs);
  renderChart(songs);
  updateKPIs(songs);
}

function updateKPIs(songs) {
  if (!Array.isArray(songs)) return;

  const totalSongs = songs.length;
  const totalPlays = songs.reduce((sum, s) => sum + (s.plays || 0), 0);
  const avgPlays = totalSongs > 0 ? Math.round(totalPlays / totalSongs) : 0;
  const totalDuration = songs.reduce((sum, s) => sum + (s.durationMinutes || 0), 0);

  const kpiTotalSongs = document.getElementById('kpi-total-songs');
  if (kpiTotalSongs) kpiTotalSongs.innerText = totalSongs;

  const kpiAvgPlays = document.getElementById('kpi-avg-plays');
  if (kpiAvgPlays) kpiAvgPlays.innerText = avgPlays.toLocaleString();

  const kpiTotalDuration = document.getElementById('kpi-total-duration');
  if (kpiTotalDuration) kpiTotalDuration.innerText = `${totalDuration.toFixed(1)} min`;
}

function renderTable(songs) {
  const tbody = document.getElementById('songs-table-body');
  if (!tbody || !Array.isArray(songs)) return;

  tbody.innerHTML = '';

  songs.forEach(song => {
    const tr = document.createElement('tr');
    const imageSrc = song.imageUrl || 'https://api.dicebear.com/7.x/identicon/svg?seed=music';
    tr.innerHTML = `
      <td><img src="${imageSrc}" class="album-cover" alt="Cover" style="width: 40px; height: 40px; border-radius: 4px; object-fit: cover;"></td>
      <td>${song.title}</td>
      <td>${song.artist}</td>
      <td>${song.album}</td>
      <td>${(song.plays || 0).toLocaleString()}</td>
      <td>${song.durationMinutes || song.duration || 0} min</td>
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
  if (document.getElementById('title')) document.getElementById('title').value = song.title;
  if (document.getElementById('artist')) document.getElementById('artist').value = song.artist;
  if (document.getElementById('album')) document.getElementById('album').value = song.album;
  if (document.getElementById('plays')) document.getElementById('plays').value = song.plays;
  if (document.getElementById('duration')) document.getElementById('duration').value = song.durationMinutes || song.duration || '';
  if (document.getElementById('image-url')) document.getElementById('image-url').value = song.imageUrl || '';

  const submitBtn = document.getElementById('btn-submit-form');
  if (submitBtn) {
    submitBtn.innerText = 'Actualizar Canción';
    submitBtn.style.background = '#eab308';
    submitBtn.style.color = 'black';
  }
  const cancelBtn = document.getElementById('btn-cancel-edit');
  if (cancelBtn) cancelBtn.style.display = 'block';
}

function resetFormState() {
  editingSongId = null;
  const form = document.getElementById('song-form');
  if (form) form.reset();

  const imgUrl = document.getElementById('image-url');
  if (imgUrl) imgUrl.value = '';

  const submitBtn = document.getElementById('btn-submit-form');
  if (submitBtn) {
    submitBtn.innerText = 'Guardar Canción';
    submitBtn.style.background = '#1db954';
    submitBtn.style.color = 'white';
  }

  const cancelBtn = document.getElementById('btn-cancel-edit');
  if (cancelBtn) cancelBtn.style.display = 'none';
}

function renderChart(songs) {
  const canvas = document.getElementById('songsChart');
  if (!canvas || !Array.isArray(songs)) return;

  const ctx = canvas.getContext('2d');

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
    csvContent += `"${s.title}","${s.artist}","${s.album}",${s.plays},${s.durationMinutes || s.duration}\n`;
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", "spotify_stats.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
