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
  path: '/peerjs',
  debug: true,
  allow_discovery: true,
});

app.use('/peerjs', peerServer);

// Allow connections from any origin
const io = socketIO(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true
}));
app.use(express.json());

// Simple endpoint to check if server is running
app.get('/', (req, res) => {
  res.json({ message: 'Zoomie server is running' });
});

// Get meeting info
app.get('/meeting/:id', (req, res) => {
  const meetingId = req.params.id;
  res.json({
    meetingId,
    joinUrl: `${process.env.FRONTEND_URL}/meeting/${meetingId}`
  });
});

// Database connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Track connected users in each room
const rooms = new Map();

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Join meeting room
  socket.on('join-room', (roomId, userId) => {
    // Leave previous room if any
    Array.from(socket.rooms).forEach(room => {
      if (room !== socket.id) {
        socket.leave(room);
        // Update user count in the room they're leaving
        if (rooms.has(room)) {
          rooms.set(room, rooms.get(room) - 1);
          if (rooms.get(room) <= 0) {
            rooms.delete(room);
          }
        }
      }
    });

    // Join new room
    socket.join(roomId);
    
    // Initialize or update room count
    rooms.set(roomId, (rooms.get(roomId) || 0) + 1);
    
    // Notify others in the room
    socket.to(roomId).emit('user-connected', userId);
    
    // Notify everyone in the room about the updated user count
    io.to(roomId).emit('user-joined', {
      userId,
      totalUsers: rooms.get(roomId)
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
      if (rooms.has(roomId)) {
        rooms.set(roomId, rooms.get(roomId) - 1);
        if (rooms.get(roomId) <= 0) {
          rooms.delete(roomId);
        }
        // Notify others about the updated user count
        io.to(roomId).emit('user-joined', {
          totalUsers: rooms.get(roomId) || 0
        });
      }
    });
  });

  // Handle chat messages
  socket.on('send-message', (roomId, message) => {
    // Broadcast the message to all users in the room
    io.to(roomId).emit('receive-message', message);
  });

  // Handle speech-to-text data
  socket.on('speech-to-text', (roomId, text) => {
    socket.to(roomId).emit('receive-transcript', text);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
