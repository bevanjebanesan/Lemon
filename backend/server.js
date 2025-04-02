const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const server = http.createServer(app);

// Allow connections from any origin
const io = socketIO(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors());
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

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Join meeting room
  socket.on('join-room', (roomId, userId) => {
    socket.join(roomId);
    socket.to(roomId).emit('user-connected', userId);
    
    // Notify everyone in the room that a new user joined
    io.to(roomId).emit('user-joined', {
      userId,
      totalUsers: io.sockets.adapter.rooms.get(roomId)?.size || 0
    });
  });

  // Handle chat messages
  socket.on('send-message', (roomId, message) => {
    io.to(roomId).emit('receive-message', message);
  });

  // Handle speech-to-text data
  socket.on('speech-to-text', (roomId, text) => {
    socket.to(roomId).emit('receive-transcript', text);
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
