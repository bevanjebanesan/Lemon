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

// ✅ Clean CORS setup (no duplicate)
app.use(cors({
  origin: 'https://lemon-uzoe.vercel.app',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true
}));

app.use(express.json());

// Error handler
app.use((err, req, res, next) => {
  console.error('Global error:', err);
  res.status(500).json({ error: err.message });
});

// ✅ Socket.IO CORS setup
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

// Health check route
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

app.get('/meeting/:id', (req, res) => {
  try {
    const meetingId = req.params.id;
    if (!meetingId) throw new Error('Meeting ID is required');

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

const rooms = new Map();

io.on('connection', (socket) => {
  console.log('Socket.IO Client connected:', socket.id);

  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });

  socket.on('join-room', (roomId, userId) => {
    try {
      if (!roomId || !userId) return;

      console.log(`User ${userId} joining room ${roomId}`);
      
      Array.from(socket.rooms).forEach(room => {
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
          timestamp: new Date()
        });
      };

      const disconnectHandler = () => {
        socket.to(roomId).emit('user-disconnected', userId);
        const newCount = updateRoomCount(roomId, -1);
        io.to(roomId).emit('user-joined', { totalUsers: newCount });

        socket.removeListener('disconnect', disconnectHandler);
        socket.removeListener('send-message', messageHandler);
      };

      socket.on('send-message', messageHandler);
      socket.on('disconnect', disconnectHandler);
    } catch (error) {
      console.error('Error in join-room:', error);
    }
  });

  socket.on('send-message', (roomId, message) => {
    io.to(roomId).emit('receive-message', message);
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
  console.log(`Room ${roomId} count updated:`, newCount);
  return newCount;
}

// MongoDB connect logic
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
