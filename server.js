require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const querystring = require('querystring');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 5000;

// URL base de tu Frontend (en local usará Live Server, en producción usará la que definas en .env)
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://127.0.0.1:5500';

// Middleware
app.use(cors());
app.use(express.json());

// Conexión a MongoDB (Usa la variable local o remota de MongoDB Atlas)
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/spotify_db';
mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ Conectado exitosamente a MongoDB'))
    .catch((err) => console.error('❌ Error al conectar a MongoDB:', err.message));

// Variables de entorno de Spotify
const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI;

// Token en memoria
let spotifyAccessToken = '';

// ==========================================
// 1. RUTA DE INICIO DE SESIÓN CON SPOTIFY
// ==========================================
app.get(['/api/auth/spotify', '/api/auth/spotify/login'], (req, res) => {
    console.log('--> Redirigiendo a Spotify para autenticación...');
    
    const scope = 'user-top-read user-read-private user-read-email';
    
    const queryParams = querystring.stringify({
        response_type: 'code',
        client_id: CLIENT_ID,
        scope: scope,
        redirect_uri: REDIRECT_URI,
    });

    res.redirect(`https://accounts.spotify.com/authorize?${queryParams}`);
});

// ==========================================
// 2. CALLBACK DE AUTENTICACIÓN
// ==========================================
app.get('/api/auth/spotify/callback', async (req, res) => {
    const code = req.query.code || null;

    if (!code) {
        console.error('❌ No se recibió el código de autorización desde Spotify.');
        return res.redirect(`${FRONTEND_URL}/index.html?error=no_code`);
    }

    try {
        console.log('--> Intercambiando código de autorización por Token de Acceso...');
        
        const response = await axios({
            method: 'post',
            url: 'https://accounts.spotify.com/api/token',
            data: querystring.stringify({
                code: code,
                redirect_uri: REDIRECT_URI,
                grant_type: 'authorization_code'
            }),
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + (Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64'))
            }
        });

        spotifyAccessToken = response.data.access_token;
        console.log('✅ Token de acceso obtenido con éxito.');

        // Redirigir dinámicamente usando FRONTEND_URL
        res.redirect(`${FRONTEND_URL}/index.html?access_token=${spotifyAccessToken}`);

    } catch (error) {
        console.error('❌ Error en el Callback de Spotify:', error.response ? error.response.data : error.message);
        res.redirect(`${FRONTEND_URL}/index.html?error=auth_failed`);
    }
});

// ==========================================
// 3. RUTA PARA OBTENER EL WRAPPED DEL USUARIO
// ==========================================
app.get('/api/spotify/user-wrapped', async (req, res) => {
    console.log('--> Petición recibida en /api/spotify/user-wrapped');

    try {
        let token = req.headers.authorization;
        
        if (token && token.startsWith('Bearer ')) {
            token = token.split(' ')[1];
        } else {
            token = spotifyAccessToken;
        }

        if (!token) {
            console.error('❌ Error: No existe un token de acceso activo.');
            return res.status(401).json({ 
                error: 'No autenticado', 
                message: 'Debes iniciar sesión con Spotify primero.' 
            });
        }

        console.log('--> Consultando Top Artistas y Canciones a la API de Spotify...');

        const [tracksResponse, artistsResponse] = await Promise.all([
            axios.get('https://api.spotify.com/v1/me/top/tracks?limit=10&time_range=medium_term', {
                headers: { 'Authorization': `Bearer ${token}` }
            }),
            axios.get('https://api.spotify.com/v1/me/top/artists?limit=10&time_range=medium_term', {
                headers: { 'Authorization': `Bearer ${token}` }
            })
        ]);

        console.log('✅ Datos obtenidos de Spotify correctamente.');

        res.json({
            topTracks: tracksResponse.data.items,
            topArtists: artistsResponse.data.items
        });

    } catch (error) {
        console.error('❌ ERROR DETALLADO EN EL SERVIDOR (/api/spotify/user-wrapped):');
        if (error.response) {
            console.error('   Estado HTTP de Spotify:', error.response.status);
            console.error('   Respuesta de Spotify:', error.response.data);
        } else {
            console.error('   Mensaje de error interno:', error.message);
        }

        res.status(500).json({ 
            error: 'Error al cargar datos de Spotify', 
            details: error.response ? error.response.data : error.message 
        });
    }
});

// ==========================================
// INICIO DEL SERVIDOR
// ==========================================
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});