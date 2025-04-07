const express = require('express');
const router = express.Router();

// Store active rooms
const rooms = new Map();

// Get or create meeting
router.get('/:id', async (req, res) => {
  try {
    const meetingId = req.params.id;
    console.log('📝 Meeting GET request for ID:', meetingId);
    
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
    console.error('❌ Error in meeting route:', error);
    res.status(500).json({ 
      error: 'Failed to create/join meeting',
      details: error.message
    });
  }
});

module.exports = {
  router,
  rooms // Export rooms for socket.io to use
};
