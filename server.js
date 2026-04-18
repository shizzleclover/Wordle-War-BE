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

// No `cors` package — allow any origin so split deploys (e.g. Vercel + Railway) work in the browser.
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json());

// Logger middleware
app.use((req, res, next) => {
  const oldJson = res.json;
  const oldSend = res.send;

  res.json = function (body) {
    console.log(`[HTTP API] ${req.method} ${req.url} | Status: ${res.statusCode} | Response:`, JSON.stringify(body));
    return oldJson.apply(res, arguments);
  };

  res.send = function (body) {
    // Only log if we haven't logged via json
    if (typeof body === 'string') {
      console.log(`[HTTP API] ${req.method} ${req.url} | Status: ${res.statusCode} | Response Text:`, body);
    }
    return oldSend.apply(res, arguments);
  };

  next();
});

app.use('/api/auth', authRoutes);
app.use('/api', apiRoutes);

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
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
