import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Container,
  Paper,
  Typography,
  TextField,
  Button,
  List,
  ListItem,
  ListItemText,
  Box,
  IconButton,
  Drawer,
  Snackbar,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import {
  Mic,
  MicOff,
  Videocam,
  VideocamOff,
  Chat,
  Close,
  Share,
  ContentCopy,
} from '@mui/icons-material';
import { styled } from '@mui/material/styles';
import { io, Socket } from 'socket.io-client';
import Peer from 'peerjs';
import { Message } from '../types';

const StyledVideo = styled('video')({
  width: '100%',
  borderRadius: '8px',
});

const StyledPaper = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(2),
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
}));

const ChatDrawer = styled(Drawer)({
  '& .MuiDrawer-paper': {
    width: '300px',
    padding: '16px',
  },
});

const Meeting: React.FC = () => {
  const { id: meetingId } = useParams<{ id: string }>();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [peer, setPeer] = useState<Peer | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [transcription, setTranscription] = useState('');
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [participantCount, setParticipantCount] = useState(1);
  const videoRef = useRef<HTMLVideoElement>(null);
  const recognition = useRef<any>(null);

  const meetingUrl = `${process.env.REACT_APP_FRONTEND_URL}/meeting/${meetingId}`;

  useEffect(() => {
    // Initialize WebSocket connection
    const newSocket = io(process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000');
    setSocket(newSocket);

    // Initialize PeerJS
    const newPeer = new Peer({
      host: window.location.hostname,
      port: Number(process.env.REACT_APP_BACKEND_PORT || 5000),
      path: '/peerjs',
      secure: window.location.protocol === 'https:'
    });
    setPeer(newPeer);

    // Get user media
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((mediaStream) => {
        setStream(mediaStream);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      })
      .catch((error) => console.error('Error accessing media devices:', error));

    // Initialize speech recognition
    if ('webkitSpeechRecognition' in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition;
      recognition.current = new SpeechRecognition();
      recognition.current.continuous = true;
      recognition.current.interimResults = true;

      recognition.current.onresult = (event: any) => {
        const results = Array.from(event.results) as any[];
        const transcript = results
          .map(result => result[0].transcript)
          .join('');
        setTranscription(transcript);
        
        if (socket && results[results.length - 1].isFinal) {
          socket.emit('speech-to-text', meetingId, transcript);
        }
      };

      recognition.current.start();
    }

    return () => {
      stream?.getTracks().forEach(track => track.stop());
      socket?.disconnect();
      peer?.destroy();
      recognition.current?.stop();
    };
  }, [meetingId]);

  useEffect(() => {
    if (!socket || !peer || !stream) return;

    socket.emit('join-room', meetingId, peer.id);

    peer.on('call', (call) => {
      call.answer(stream);
      call.on('stream', (remoteStream) => {
        // Add remote stream to the UI
        const video = document.createElement('video');
        video.srcObject = remoteStream;
        video.autoplay = true;
        video.playsInline = true;
        document.getElementById('remote-videos')?.appendChild(video);
      });
    });

    socket.on('user-connected', (userId) => {
      const call = peer.call(userId, stream);
      call.on('stream', (remoteStream) => {
        // Add remote stream to the UI
        const video = document.createElement('video');
        video.srcObject = remoteStream;
        video.autoplay = true;
        video.playsInline = true;
        document.getElementById('remote-videos')?.appendChild(video);
      });
    });

    socket.on('user-joined', ({ totalUsers }) => {
      setParticipantCount(totalUsers);
    });

    socket.on('receive-message', (message: Message) => {
      setMessages(prev => [...prev, message]);
    });

    socket.on('receive-transcript', (text: string) => {
      setTranscription(text);
    });
  }, [socket, peer, stream, meetingId]);

  const copyMeetingLink = () => {
    navigator.clipboard.writeText(meetingUrl);
    setSnackbarOpen(true);
    setIsShareDialogOpen(false);
  };

  const toggleAudio = () => {
    if (stream) {
      stream.getAudioTracks().forEach(track => {
        track.enabled = !isAudioEnabled;
      });
      setIsAudioEnabled(!isAudioEnabled);
    }
  };

  const toggleVideo = () => {
    if (stream) {
      stream.getVideoTracks().forEach(track => {
        track.enabled = !isVideoEnabled;
      });
      setIsVideoEnabled(!isVideoEnabled);
    }
  };

  const sendMessage = () => {
    if (socket && newMessage.trim()) {
      const message: Message = {
        id: Math.random().toString(36).substr(2, 9),
        userId: peer?.id || '',
        userName: 'User', // TODO: Add proper user names
        content: newMessage,
        timestamp: new Date(),
      };
      socket.emit('send-message', meetingId, message);
      setMessages(prev => [...prev, message]);
      setNewMessage('');
    }
  };

  return (
    <Container maxWidth="xl" sx={{ height: '100vh', py: 2 }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box>
              <Typography variant="h5">Meeting: {meetingId}</Typography>
              <Typography variant="subtitle2" color="textSecondary">
                {participantCount} participant{participantCount !== 1 ? 's' : ''}
              </Typography>
            </Box>
            <Box>
              <IconButton onClick={toggleAudio}>
                {isAudioEnabled ? <Mic /> : <MicOff />}
              </IconButton>
              <IconButton onClick={toggleVideo}>
                {isVideoEnabled ? <Videocam /> : <VideocamOff />}
              </IconButton>
              <IconButton onClick={() => setIsChatOpen(true)}>
                <Chat />
              </IconButton>
              <IconButton onClick={() => setIsShareDialogOpen(true)}>
                <Share />
              </IconButton>
            </Box>
          </Box>
        </Box>

        <Box sx={{ flexGrow: 1, mb: 2 }}>
          <StyledPaper>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
              <Box>
                <StyledVideo ref={videoRef} autoPlay muted playsInline />
              </Box>
              <Box id="remote-videos" />
            </Box>
          </StyledPaper>
        </Box>

        <Paper sx={{ p: 2 }}>
          <Typography variant="h6">Live Transcription</Typography>
          <Typography>{transcription}</Typography>
        </Paper>
      </Box>

      {/* Share Meeting Dialog */}
      <Dialog open={isShareDialogOpen} onClose={() => setIsShareDialogOpen(false)}>
        <DialogTitle>Share Meeting</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 1 }}>
            <Typography variant="subtitle1" gutterBottom>
              Share this link with others to join the meeting:
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2 }}>
              <TextField
                fullWidth
                value={meetingUrl}
                InputProps={{ readOnly: true }}
              />
              <IconButton onClick={copyMeetingLink}>
                <ContentCopy />
              </IconButton>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsShareDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Success Snackbar */}
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={3000}
        onClose={() => setSnackbarOpen(false)}
      >
        <Alert severity="success" sx={{ width: '100%' }}>
          Meeting link copied to clipboard!
        </Alert>
      </Snackbar>

      {/* Chat Drawer */}
      <ChatDrawer
        anchor="right"
        open={isChatOpen}
        onClose={() => setIsChatOpen(false)}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="h6">Chat</Typography>
          <IconButton onClick={() => setIsChatOpen(false)}>
            <Close />
          </IconButton>
        </Box>

        <List sx={{ flexGrow: 1, overflow: 'auto' }}>
          {messages.map((message) => (
            <ListItem key={message.id}>
              <ListItemText
                primary={message.userName}
                secondary={message.content}
              />
            </ListItem>
          ))}
        </List>

        <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
          <TextField
            fullWidth
            size="small"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message..."
            onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
          />
          <Button variant="contained" onClick={sendMessage}>
            Send
          </Button>
        </Box>
      </ChatDrawer>
    </Container>
  );
};

export default Meeting;
