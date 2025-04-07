const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const { ExpressPeerServer } = require('peer');

// Load environment variables
dotenv.config();

// Create Express app and HTTP server
const app = express();
const server = http.createServer(app);

// Basic middleware
app.use(express.json());

// CORS setup - must be before routes
app.use((req, res, next) => {
  const origin = req.headers.origin;
  console.log('🌐 Request origin:', origin);

  // Allow localhost and any Vercel preview URLs
  if (origin && (
    origin.includes('localhost') ||
    origin.includes('lemon-uzoe') ||
    origin.includes('vercel.app')
  )) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  // Handle preflight
  if (req.method === 'OPTIONS') {
    console.log('👋 Handling OPTIONS preflight for:', req.url);
    return res.status(204).end();
  }

  next();
});

// PeerJS Server setup
const peerServer = ExpressPeerServer(server, {
  debug: true,
  path: '/',
  port: process.env.PORT || 5000,
  allow_discovery: true,
  proxied: true
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
  transports: ['websocket', 'polling']
});

// Initialize rooms Map
const rooms = new Map();

// Routes
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Zoomie API is running',
    origin: req.headers.origin || 'no origin'
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    environment: process.env.NODE_ENV || 'development',
    peerjs: '✅',
    socketio: '✅',
    origin: req.headers.origin || 'no origin'
  });
});

// Meeting routes
app.get('/meeting/:id', (req, res) => {
  try {
    const meetingId = req.params.id;
    console.log(`📝 GET request for meeting:`, meetingId);
    
    if (!rooms.has(meetingId)) {
      console.log('🆕 Creating new meeting room:', meetingId);
      rooms.set(meetingId, { users: new Set() });
    }
    
    res.json({ 
      meetingId,
      message: 'Meeting created/joined successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error in /meeting/:id:', error);
    res.status(500).json({ 
      error: 'Failed to create/join meeting',
      details: error.message
    });
  }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('🔌 Socket connected:', socket.id);

  socket.on('join-meeting', (meetingId) => {
    console.log('👋 User joining meeting:', meetingId);
    socket.join(meetingId);
    
    const room = rooms.get(meetingId);
    if (room) {
      room.users.add(socket.id);
      io.to(meetingId).emit('user-joined', {
        userId: socket.id,
        userCount: room.users.size
      });
    }
  });

  socket.on('disconnect', () => {
    console.log('🔌 Socket disconnected:', socket.id);
  });
});

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
  `);
});
