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
    const backendUrl = process.env.REACT_APP_BACKEND_URL;
    if (!backendUrl) {
      console.error('Backend URL not configured');
      return;
    }

    console.log('Connecting to backend:', backendUrl);
    const newSocket = io(backendUrl, {
      transports: ['websocket'],
      withCredentials: true
    });

    setSocket(newSocket);

    const peerId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    
    const backendHostname = new URL(backendUrl).hostname;
    console.log('PeerJS connecting to:', backendHostname);

    const newPeer = new Peer(peerId, {
      host: backendHostname,
      secure: true,
      port: 443,
      path: '/peerjs',
      debug: 3,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { 
            urls: 'turn:numb.viagenie.ca',
            username: 'webrtc@live.com',
            credential: 'muazkh'
          },
          {
            urls: 'turn:openrelay.metered.ca:80',
            username: 'openrelayproject',
            credential: 'openrelayproject'
          }
        ]
      }
    });

    newPeer.on('open', (id) => {
      console.log('Connected to PeerJS server with ID:', id);
      setPeer(newPeer);
      initializeMedia();
    });

    newPeer.on('error', (error) => {
      console.error('PeerJS error:', error);
      if (error.type === 'browser-incompatible') {
        alert('Your browser might not support WebRTC. Please try using Chrome or Firefox.');
      } else if (error.type === 'disconnected') {
        alert('Connection lost. Please check your internet connection and refresh the page.');
      } else {
        alert('Connection error. Please try refreshing the page.');
      }
    });

    const initializeMedia = async () => {
      try {
        console.log('Requesting media devices...');
        const constraints = {
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'user'
          },
          audio: true
        };
        console.log('Media constraints:', constraints);
        
        const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        console.log('Media access granted:', mediaStream.getTracks().map(t => t.kind));
        
        setStream(mediaStream);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          console.log('Local video stream set');
        }
      } catch (error: any) {
        console.error('Media access error:', error);
        if (error.name === 'NotAllowedError') {
          alert('Camera/Microphone access denied. Please allow access in your browser settings.');
        } else if (error.name === 'NotFoundError') {
          alert('No camera/microphone found. Please check your device connections.');
        } else {
          alert(`Error accessing media devices: ${error.message}`);
        }
      }
    };

    return () => {
      console.log('Cleaning up connections...');
      if (stream) {
        stream.getTracks().forEach(track => {
          track.stop();
          console.log('Stopped track:', track.kind);
        });
      }
      if (socket) {
        socket.disconnect();
        console.log('Socket disconnected');
      }
      if (peer) {
        peer.destroy();
        console.log('Peer destroyed');
      }
      if (recognition.current) {
        recognition.current.stop();
        console.log('Speech recognition stopped');
      }
    };
  }, [meetingId]);

  useEffect(() => {
    if (!socket || !peer || !stream) {
      console.log('Waiting for all connections...', { 
        socket: !!socket, 
        peer: !!peer, 
        stream: !!stream 
      });
      return;
    }

    console.log('All connections ready, joining room:', meetingId);
    socket.emit('join-room', meetingId, peer.id);

    peer.on('call', (call) => {
      console.log('Receiving call from:', call.peer);
      call.answer(stream);
      call.on('stream', (remoteStream) => {
        console.log('Received remote stream');
        addVideoStream(remoteStream);
      });
      call.on('error', (error) => {
        console.error('Error in call:', error);
      });
    });

    socket.on('user-connected', (userId) => {
      console.log('User connected:', userId);
      connectToNewUser(userId, stream);
    });

    socket.on('user-joined', ({ totalUsers }) => {
      console.log('Total users in room:', totalUsers);
      setParticipantCount(totalUsers);
    });

    socket.on('receive-message', (message: Message) => {
      setMessages(prev => [...prev, message]);
    });

    socket.on('receive-transcript', (text: string) => {
      setTranscription(text);
    });
  }, [socket, peer, stream, meetingId]);

  const connectToNewUser = (userId: string, stream: MediaStream) => {
    console.log('Connecting to new user:', userId);
    const call = peer?.call(userId, stream);
    if (call) {
      call.on('stream', (remoteStream) => {
        console.log('Received stream from new user');
        addVideoStream(remoteStream);
      });
      call.on('error', (error) => {
        console.error('Error in call:', error);
      });
    }
  };

  const addVideoStream = (remoteStream: MediaStream) => {
    const video = document.createElement('video');
    video.srcObject = remoteStream;
    video.autoplay = true;
    video.playsInline = true;
    const remoteVideos = document.getElementById('remote-videos');
    if (remoteVideos) {
      const existingVideos = remoteVideos.getElementsByTagName('video');
      for (let i = 0; i < existingVideos.length; i++) {
        const existingVideo = existingVideos[i];
        if (existingVideo.srcObject === remoteStream) {
          existingVideo.remove();
          break;
        }
      }
      remoteVideos.appendChild(video);
    }
  };

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
        userName: 'User', 
        content: newMessage,
        timestamp: new Date(),
      };
      socket.emit('send-message', meetingId, message);
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

      <Snackbar
        open={snackbarOpen}
        autoHideDuration={3000}
        onClose={() => setSnackbarOpen(false)}
      >
        <Alert severity="success" sx={{ width: '100%' }}>
          Meeting link copied to clipboard!
        </Alert>
      </Snackbar>

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
