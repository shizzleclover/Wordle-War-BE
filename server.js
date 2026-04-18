require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const connectDB = require('./config/db');
const { socketAuthMiddleware } = require('./middleware/auth');
const setupSocketHandler = require('./game/socketHandler');
const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');
const socialRoutes = require('./routes/social');
const dailyRoutes = require('./routes/daily');

const app = express();
const server = http.createServer(app);

// Robust CORS implementation
app.use((req, res, next) => {
  const origin = req.headers.origin;
  // Allow all origins that end with localhost or the production domain
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});

app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/social', socialRoutes);
app.use('/api/daily', dailyRoutes);
app.use('/api', apiRoutes);

const io = new Server(server, {
  cors: { 
    origin: true, // Echoes the request origin
    methods: ['GET', 'POST'],
    credentials: true
  },
});

io.use(socketAuthMiddleware);

setupSocketHandler(io);

const PORT = process.env.PORT || 3001;

async function start() {
  await connectDB();

  server.listen(PORT, () => {
    console.log(`\n🎮 Wordle War server running on port ${PORT}`);
    console.log(`📡 Socket.IO ready\n`);
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
