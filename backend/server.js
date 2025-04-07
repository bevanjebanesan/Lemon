const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const { ExpressPeerServer } = require('peer');

dotenv.config();

const app = express();
const server = http.createServer(app);

// PeerJS setup
const peerServer = ExpressPeerServer(server, {
  debug: true,
  path: '/peerjs',
  allow_discovery: true,
});

peerServer.on('connection', (client) => {
  console.log('PeerJS Client connected:', client.getId());
});
peerServer.on('disconnect', (client) => {
  console.log('PeerJS Client disconnected:', client.getId());
});
peerServer.on('error', (error) => {
  console.error('PeerJS Server error:', error);
});

app.use('/peerjs', peerServer);

// Basic middleware
app.use(express.json());

// CORS setup
app.use(cors({
  origin: true, // Allow all origins in development
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Routes
app.get('/meeting/:id', (req, res) => {
  const meetingId = req.params.id;
  
  // Check if meeting exists in our rooms Map
  if (!rooms.has(meetingId)) {
    // If it doesn't exist, create it
    rooms.set(meetingId, { users: new Set() });
  }
  
  res.json({ 
    meetingId,
    message: 'Meeting created successfully'
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Health check route
app.get('/', (req, res) => {
  res.json({
    message: 'Zoomie server is running',
    env: {
      nodeEnv: process.env.NODE_ENV,
      frontendUrl: process.env.FRONTEND_URL,
      mongoDbConnected: mongoose.connection.readyState === 1,
    },
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

// Error handler
app.use((err, req, res, next) => {
  console.error('Global error:', err);
  res.status(500).json({ error: err.message });
});

// Socket.IO setup with CORS
const io = socketIO(server, {
  cors: {
    origin: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

const rooms = new Map();

io.on('connection', (socket) => {
  console.log('Socket.IO Client connected:', socket.id);

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

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 Frontend URL: ${process.env.FRONTEND_URL || 'https://lemon-uzoe.vercel.app'}`);
});
