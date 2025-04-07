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
      const backendUrl = process.env.REACT_APP_BACKEND_URL;

      if (!backendUrl) {
        throw new Error('REACT_APP_BACKEND_URL is not defined in your .env');
      }

      console.log('Creating meeting with backend URL:', backendUrl);

      const response = await fetch(`${backendUrl}/meeting/${newMeetingId}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        mode: 'cors',
        credentials: 'omit',
      });

      console.log('Response Headers:', [...response.headers.entries()]);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Server response:', errorText);
        throw new Error(`Failed to create meeting: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      console.log('Meeting created successfully:', data);
      navigate(`/meeting/${newMeetingId}`);
    } catch (error: any) {
      console.error('Error creating meeting:', error);
      alert(error.message || 'Failed to create meeting. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const joinMeeting = async () => {
    if (!meetingId.trim()) return;

    try {
      setIsLoading(true);
      const backendUrl = process.env.REACT_APP_BACKEND_URL;

      if (!backendUrl) {
        throw new Error('REACT_APP_BACKEND_URL is not defined in your .env');
      }

      console.log('Joining meeting:', meetingId);

      const response = await fetch(`${backendUrl}/meeting/${meetingId}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        mode: 'cors',
        credentials: 'omit',
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to join meeting: ${response.status} ${response.statusText} - ${errorText}`);
      }

      console.log('Meeting exists, joining...');
      navigate(`/meeting/${meetingId}`);
    } catch (error: any) {
      console.error('Error joining meeting:', error);
      alert(error.message || 'Failed to join meeting. Please check the meeting ID and try again.');
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
              onKeyDown={(e) => e.key === 'Enter' && joinMeeting()}
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
