const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const PORT = process.env.PORT || 3001;

// --- Import Routes and Middleware ---
const resultsRoutes = require('./routes/results');
const geminiRoutes = require('./routes/gemini');
const { verifyToken, admin } = require('./middleware/auth'); // ✅ fixed
const notificationsRoutes = require('./routes/notifications');
const { startNotificationsScheduler } = require('./jobs/scheduler');

// --- MongoDB Connection ---
const mongoURI = process.env.MONGO_URI;
mongoose.connect(mongoURI)
  .then(() => console.log(' MongoDB connected successfully.'))
  .catch(err => console.error(' MongoDB connection error:', err));

// --- Middleware ---
const allowedOrigins = [
  'http://localhost:5173',
  'https://bloomence-2.onrender.com',
  'https://bloomence-mss1.onrender.com'
];
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true); // allow non-browser tools
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 204
};
app.use(cors(corsOptions));
app.use(bodyParser.json());
app.use(express.json());

// --- Routes ---
app.use('/api/results', verifyToken, resultsRoutes); // 
app.use('/api/gemini', verifyToken, geminiRoutes);   // 
app.use('/api/notifications', verifyToken, notificationsRoutes);

// Basic health route (moved off '/')
app.get('/health', (req, res) => {
  if (mongoose.connection.readyState === 1) {
    res.status(200).send('Backend is running and MongoDB is READY.');
  } else {
    res.status(503).send('Backend is running, but MongoDB connection failed.');
  }
});

// --- Serve Frontend Build & SPA Fallback ---
// Serve static assets from the Vite build output
const frontendDistPath = path.resolve(__dirname, '../frontend/dist');
app.use(express.static(frontendDistPath));

// Important: place SPA fallback AFTER API routes but BEFORE server start.
// This ensures non-API routes are handled by React Router.
app.get(/^\/(?!api).*/, (req, res) => {
  res.sendFile(path.join(frontendDistPath, 'index.html'));
});

// --- Realtime ---
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: allowedOrigins }
});

io.use(async (socket, next) => {
  try {
    const authHeader = socket.handshake.auth && socket.handshake.auth.token
      ? `Bearer ${socket.handshake.auth.token}`
      : socket.handshake.headers && socket.handshake.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return next(new Error('unauthorized'));
    const idToken = authHeader.split('Bearer ')[1];
    const decoded = await admin.auth().verifyIdToken(idToken);
    socket.data.user = decoded;
    socket.join(decoded.uid);
    return next();
  } catch (e) {
    return next(e);
  }
});

io.on('connection', () => { });

app.set('io', io);

// --- Server Start ---
server.listen(PORT, () => console.log(` Server running on port ${PORT}`));
startNotificationsScheduler();