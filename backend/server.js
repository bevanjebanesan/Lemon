const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const { ExpressPeerServer } = require('peer');
const https = require('https');
const fs = require('fs');

// Load environment variables
dotenv.config();

// Create Express app and HTTP server
const app = express();
let server;
if (process.env.NODE_ENV === 'production') {
  const options = {
    key: fs.readFileSync('server-key.pem'),
    cert: fs.readFileSync('server-cert.pem')
  };
  server = https.createServer(options, app);
} else {
  server = http.createServer(app);
}

// Basic middleware
app.use(express.json());

// CORS setup - must be before routes
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'https://lemon-uzoe.vercel.app',
  'https://lemon-uzoe.netlify.app'
];

const corsOptions = {
  origin: function (origin, callback) {
    console.log('Request origin:', origin);
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      return callback(null, true);
    }
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.error('Origin not allowed:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Origin'],
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// PeerJS Server setup
const peerServer = ExpressPeerServer(server, {
  debug: true,
  path: '/',
  ssl: process.env.NODE_ENV === 'production',
  port: process.env.PORT || 5000,
  allow_discovery: true,
  proxied: true,
  corsOptions: corsOptions
});

// Mount PeerJS server
app.use('/peerjs', peerServer);

// PeerJS event handlers
peerServer.on('connection', (client) => {
  console.log('✅ PeerJS Client connected:', client.getId());
});

peerServer.on('disconnect', (client) => {
  console.log('❌ PeerJS Client disconnected:', client.getId());
});

peerServer.on('error', (error) => {
  console.error('⚠️ PeerJS Server error:', error);
});

// Socket.IO setup
const io = socketIO(server, {
  cors: corsOptions,
  transports: ['websocket', 'polling']
});

// Initialize rooms Map
const rooms = new Map();

// Routes
app.get('/meeting/:id', (req, res) => {
  const meetingId = req.params.id;
  console.log('📝 Creating/joining meeting:', meetingId);
  
  if (!rooms.has(meetingId)) {
    rooms.set(meetingId, { users: new Set() });
  }
  
  res.json({ 
    meetingId,
    message: 'Meeting created successfully'
  });
});

// Health check route
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    environment: process.env.NODE_ENV || 'development',
    peerjs: '✅',
    socketio: '✅',
    origin: req.headers.origin || 'no origin'
  });
});

// Meeting route
app.get('/meeting/:id', (req, res) => {
  try {
    const meetingId = req.params.id;
    if (!meetingId) throw new Error('Meeting ID is required');

    const joinUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/meeting/${meetingId}`;

    res.json({
      meetingId,
      joinUrl,
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error creating meeting:', error);
    res.status(500).json({ error: error.message });
  }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('🔌 Socket connected:', socket.id);

  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });

  socket.on('join-room', (roomId, userId) => {
    if (!roomId || !userId) return;

    console.log(`User ${userId} joining room ${roomId}`);

    // Leave previous rooms
    Array.from(socket.rooms).forEach((room) => {
      if (room !== socket.id) {
        socket.leave(room);
        updateRoomCount(room, -1);
      }
    });

    socket.join(roomId);
    const count = updateRoomCount(roomId, 1);
    socket.to(roomId).emit('user-connected', userId);
    io.to(roomId).emit('user-joined', { totalUsers: count });

    const messageHandler = (messageRoomId, message) => {
      if (messageRoomId !== roomId) return;

      io.to(roomId).emit('receive-message', {
        ...message,
        timestamp: new Date(),
      });
    };

    const disconnectHandler = () => {
      console.log(`User ${userId} disconnected from room ${roomId}`);
      socket.to(roomId).emit('user-disconnected', userId);
      const newCount = updateRoomCount(roomId, -1);
      io.to(roomId).emit('user-joined', { totalUsers: newCount });

      socket.removeListener('disconnect', disconnectHandler);
      socket.removeListener('send-message', messageHandler);
    };

    socket.on('send-message', messageHandler);
    socket.on('disconnect', disconnectHandler);
  });
});

function updateRoomCount(roomId, change) {
  const currentCount = rooms.get(roomId) || 0;
  const newCount = Math.max(0, currentCount + change);
  if (newCount === 0) {
    rooms.delete(roomId);
  } else {
    rooms.set(roomId, newCount);
  }
  return newCount;
}

// Error handler
app.use((err, req, res, next) => {
  console.error('🚨 Server error:', err);
  res.status(500).json({ error: err.message });
});

// MongoDB connection
function connectToMongoDB() {
  mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ Connected to MongoDB'))
    .catch((err) => {
      console.error('❌ MongoDB connection error:', err);
      setTimeout(connectToMongoDB, 5000);
    });
}

connectToMongoDB();

process.on('SIGTERM', () => {
  console.log('SIGTERM received. Closing server...');
  server.close(() => {
    mongoose.connection.close(false, () => {
      console.log('MongoDB connection closed');
      process.exit(0);
    });
  });
});

// Start server (using server.listen, not app.listen)
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`
🚀 Server running on port ${PORT}
📡 PeerJS server at /peerjs
🌐 CORS origins: ${allowedOrigins.join(', ')}
  `);
});
