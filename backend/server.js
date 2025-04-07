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

// Set up PeerJS server with more configuration
const peerServer = ExpressPeerServer(server, {
  debug: true,
  path: '/peerjs',
  port: 443,
  proxied: true,
  allow_discovery: true,
  alive_timeout: 60000,
  key: 'peerjs',
  ssl: {
    key: null,
    cert: null
  }
});

// Log PeerJS events for debugging
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

// CORS middleware to ensure headers are set properly
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'https://lemon-uzoe.vercel.app');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

// Regular CORS setup
app.use(cors({
  origin: 'https://lemon-uzoe.vercel.app',
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true,
  optionsSuccessStatus: 200
}));

app.use(express.json());

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Global error:', err);
  res.status(500).json({ error: err.message });
});

// Socket.IO CORS config
const io = socketIO(server, {
  cors: {
    origin: 'https://lemon-uzoe.vercel.app',
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization']
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
  allowEIO3: true
});

// Health check endpoint with detailed info
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

// Get meeting info with better error handling
app.get('/meeting/:id', (req, res) => {
  try {
    const meetingId = req.params.id;
    if (!meetingId) {
      throw new Error('Meeting ID is required');
    }

    console.log('Creating meeting:', {
      id: meetingId,
      origin: req.headers.origin,
      frontendUrl: process.env.FRONTEND_URL
    });

    const joinUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/meeting/${meetingId}`;
    console.log('Generated meeting URL:', joinUrl);

    res.json({
      meetingId,
      joinUrl,
      serverTime: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error creating meeting:', error);
    res.status(500).json({ error: error.message });
  }
});

// Track connected users in each room
const rooms = new Map();

// Socket.IO connection handling with better error handling
io.on('connection', (socket) => {
  console.log('Socket.IO Client connected:', socket.id);

  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });

  socket.on('join-room', (roomId, userId) => {
    try {
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
      const count = updateRoomCount(roomId, 1);
      
      // Notify others in the room
      socket.to(roomId).emit('user-connected', userId);
      io.to(roomId).emit('user-joined', { totalUsers: count });

      // Handle messages
      const messageHandler = (messageRoomId, message) => {
        try {
          if (messageRoomId !== roomId) return;
          
          console.log(`Message in room ${roomId}:`, message);
          io.to(roomId).emit('receive-message', {
            ...message,
            timestamp: new Date()
          });
        } catch (error) {
          console.error('Error handling message:', error);
        }
      };

      socket.on('send-message', messageHandler);

      // Handle disconnect
      const disconnectHandler = () => {
        try {
          console.log(`User ${userId} disconnected from room ${roomId}`);
          socket.to(roomId).emit('user-disconnected', userId);
          const newCount = updateRoomCount(roomId, -1);
          io.to(roomId).emit('user-joined', { totalUsers: newCount });
          
          // Clean up event listeners
          socket.removeListener('disconnect', disconnectHandler);
          socket.removeListener('send-message', messageHandler);
        } catch (error) {
          console.error('Error handling disconnect:', error);
        }
      };

      socket.on('disconnect', disconnectHandler);
    } catch (error) {
      console.error('Error in join-room:', error);
    }
  });

  socket.on('send-message', (roomId, message) => {
    console.log(`Message in room ${roomId}:`, message);
    io.to(roomId).emit('receive-message', message);
  });
});

function updateRoomCount(roomId, change) {
  try {
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
  } catch (error) {
    console.error('Error updating room count:', error);
    return 0;
  }
}

function broadcastRoomCount(roomId) {
  const count = rooms.get(roomId) || 0;
  io.to(roomId).emit('user-joined', {
    totalUsers: count
  });
}

// Database connection with retry logic
function connectToMongoDB() {
  mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => {
      console.error('MongoDB connection error:', err);
      console.log('Retrying connection in 5 seconds...');
      setTimeout(connectToMongoDB, 5000);
    });
}

connectToMongoDB();

// Handle server shutdown gracefully
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Closing server...');
  server.close(() => {
    console.log('Server closed');
    mongoose.connection.close(false, () => {
      console.log('MongoDB connection closed');
      process.exit(0);
    });
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Frontend URL:', process.env.FRONTEND_URL || 'https://lemon-uzoe.vercel.app');
});
