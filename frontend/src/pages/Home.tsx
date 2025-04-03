import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Typography,
  Button,
  Box,
  TextField,
  Paper,
} from '@mui/material';
import { v4 as uuidv4 } from 'uuid';

const Home: React.FC = () => {
  const navigate = useNavigate();
  const [meetingId, setMeetingId] = useState('');

  const createMeeting = () => {
    const newMeetingId = uuidv4();
    navigate(`/meeting/${newMeetingId}`);
  };

  const joinMeeting = () => {
    if (meetingId.trim()) {
      navigate(`/meeting/${meetingId}`);
    }
  };

  return (
    <Container maxWidth="sm">
      <Box sx={{ mt: 8, textAlign: 'center' }}>
        <Typography variant="h3" gutterBottom>
          Welcome to Zoomie
        </Typography>
        <Typography variant="subtitle1" color="textSecondary" paragraph>
          Start or join a video conference with just one click
        </Typography>

        <Paper sx={{ p: 4, mt: 4 }}>
          <Button
            variant="contained"
            color="primary"
            size="large"
            fullWidth
            onClick={createMeeting}
            sx={{ mb: 3 }}
          >
            Create New Meeting
          </Button>

          <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
            Or Join an Existing Meeting
          </Typography>

          <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
            <TextField
              fullWidth
              placeholder="Enter Meeting ID"
              value={meetingId}
              onChange={(e) => setMeetingId(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && joinMeeting()}
            />
            <Button
              variant="contained"
              onClick={joinMeeting}
              disabled={!meetingId.trim()}
            >
              Join
            </Button>
          </Box>
        </Paper>
      </Box>
    </Container>
  );
};

export default Home;
