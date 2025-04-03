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

// Set up PeerJS server
const peerServer = ExpressPeerServer(server, {
  debug: true,
  path: '/peerjs',
  allow_discovery: true,
  proxied: true,
  ssl: {
    key: null,
    cert: null
  }
});

// Log PeerJS events
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

// Allow connections from frontend
const io = socketIO(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'https://lemon-uzoe.vercel.app',
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000
});

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'https://lemon-uzoe.vercel.app',
  credentials: true
}));
app.use(express.json());

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Zoomie server is running',
    env: {
      nodeEnv: process.env.NODE_ENV,
      frontendUrl: process.env.FRONTEND_URL,
      mongoDbConnected: mongoose.connection.readyState === 1
    }
  });
});

// Get meeting info
app.get('/meeting/:id', (req, res) => {
  const meetingId = req.params.id;
  const joinUrl = `${process.env.FRONTEND_URL || 'https://lemon-uzoe.vercel.app'}/meeting/${meetingId}`;
  console.log('Generated meeting URL:', joinUrl);
  res.json({
    meetingId,
    joinUrl
  });
});

// Track connected users in each room
const rooms = new Map();

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Socket.IO Client connected:', socket.id);

  socket.on('join-room', (roomId, userId) => {
    if (!roomId || !userId) {
      console.error('Invalid join-room request:', { roomId, userId });
      return;
    }

    console.log(`User ${userId} joining room ${roomId}`);
    
    // Leave previous rooms
    Array.from(socket.rooms).forEach(room => {
      if (room !== socket.id) {
        socket.leave(room);
        updateRoomCount(room, -1);
      }
    });

    // Join new room
    socket.join(roomId);
    updateRoomCount(roomId, 1);
    
    // Notify others in the room
    socket.to(roomId).emit('user-connected', userId);
    
    // Send current participant count
    const count = rooms.get(roomId) || 1;
    io.to(roomId).emit('user-joined', { totalUsers: count });

    // Handle messages
    socket.on('send-message', (messageRoomId, message) => {
      if (messageRoomId !== roomId) return; // Only handle messages for current room
      
      console.log(`Message in room ${roomId}:`, message);
      io.to(roomId).emit('receive-message', {
        ...message,
        timestamp: new Date()
      });
    });

    // Handle disconnect
    const handleDisconnect = () => {
      console.log(`User ${userId} disconnected from room ${roomId}`);
      socket.to(roomId).emit('user-disconnected', userId);
      updateRoomCount(roomId, -1);
      const newCount = rooms.get(roomId) || 0;
      io.to(roomId).emit('user-joined', { totalUsers: newCount });
      
      // Clean up event listeners
      socket.removeListener('disconnect', handleDisconnect);
      socket.removeAllListeners('send-message');
    };

    socket.on('disconnect', handleDisconnect);
  });

  socket.on('send-message', (roomId, message) => {
    console.log(`Message in room ${roomId}:`, message);
    io.to(roomId).emit('receive-message', message);
  });
});

function updateRoomCount(roomId, change) {
  if (!roomId) return 0;
  
  const currentCount = rooms.get(roomId) || 0;
  const newCount = Math.max(0, currentCount + change);
  
  if (newCount === 0) {
    rooms.delete(roomId);
  } else {
    rooms.set(roomId, newCount);
  }
  
  console.log(`Room ${roomId} count updated:`, newCount);
  return newCount;
}

function broadcastRoomCount(roomId) {
  const count = rooms.get(roomId) || 0;
  io.to(roomId).emit('user-joined', {
    totalUsers: count
  });
}

// Database connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Frontend URL:', process.env.FRONTEND_URL || 'https://lemon-uzoe.vercel.app');
});
