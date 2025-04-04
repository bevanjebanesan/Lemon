import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Typography,
  Button,
  Box,
  TextField,
  Paper,
  CircularProgress,
} from '@mui/material';
import { v4 as uuidv4 } from 'uuid';

const Home: React.FC = () => {
  const navigate = useNavigate();
  const [meetingId, setMeetingId] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const createMeeting = async () => {
    try {
      setIsLoading(true);
      const newMeetingId = uuidv4();
      console.log('Creating meeting with ID:', newMeetingId);
      
      // Verify backend is accessible
      const backendUrl = process.env.REACT_APP_BACKEND_URL;
      if (!backendUrl) {
        throw new Error('Backend URL not configured');
      }

      const response = await fetch(`${backendUrl}/meeting/${newMeetingId}`);
      if (!response.ok) {
        throw new Error('Failed to create meeting');
      }

      console.log('Meeting created successfully');
      navigate(`/meeting/${newMeetingId}`);
    } catch (error) {
      console.error('Error creating meeting:', error);
      alert('Failed to create meeting. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const joinMeeting = async () => {
    if (!meetingId.trim()) return;

    try {
      setIsLoading(true);
      console.log('Joining meeting:', meetingId);
      
      const backendUrl = process.env.REACT_APP_BACKEND_URL;
      if (!backendUrl) {
        throw new Error('Backend URL not configured');
      }

      const response = await fetch(`${backendUrl}/meeting/${meetingId}`);
      if (!response.ok) {
        throw new Error('Meeting not found');
      }

      console.log('Meeting exists, joining...');
      navigate(`/meeting/${meetingId}`);
    } catch (error) {
      console.error('Error joining meeting:', error);
      alert('Failed to join meeting. Please check the meeting ID and try again.');
    } finally {
      setIsLoading(false);
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
            disabled={isLoading}
            sx={{ mb: 3 }}
          >
            {isLoading ? (
              <CircularProgress size={24} color="inherit" />
            ) : (
              'Create New Meeting'
            )}
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
              disabled={isLoading}
            />
            <Button
              variant="contained"
              onClick={joinMeeting}
              disabled={!meetingId.trim() || isLoading}
            >
              {isLoading ? (
                <CircularProgress size={24} color="inherit" />
              ) : (
                'Join'
              )}
            </Button>
          </Box>
        </Paper>
      </Box>
    </Container>
  );
};

export default Home;
