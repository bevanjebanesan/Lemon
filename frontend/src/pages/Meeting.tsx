import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import Peer from 'peerjs';
import {
  Box,
  Button,
  Container,
  Paper,
  Typography,
  Snackbar,
  Alert,
  IconButton,
  CircularProgress,
} from '@mui/material';
import ChatIcon from '@mui/icons-material/Chat';
import ShareIcon from '@mui/icons-material/Share';
import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import VideocamIcon from '@mui/icons-material/Videocam';
import VideocamOffIcon from '@mui/icons-material/VideocamOff';
import ChatDrawer from '../components/ChatDrawer';

interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  content: string;
  timestamp: Date;
}

const Meeting: React.FC = () => {
  const { id: meetingId } = useParams<{ id: string }>();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [peer, setPeer] = useState<Peer | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isChatOpen, setIsChatOpen] = useState<boolean>(false);
  const [snackbarOpen, setSnackbarOpen] = useState<boolean>(false);
  const [participantCount, setParticipantCount] = useState<number>(1);
  const [isAudioEnabled, setIsAudioEnabled] = useState<boolean>(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const remoteVideosRef = useRef<HTMLDivElement>(null);

  const meetingUrl = `${process.env.REACT_APP_FRONTEND_URL}/meeting/${meetingId}`;
  const backendUrl = process.env.REACT_APP_BACKEND_URL;

  const initializeMediaDevices = async (retryCount = 0): Promise<MediaStream | null> => {
    try {
      const constraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setLocalStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      return stream;
    } catch (error) {
      console.error('Media device error:', error);
      if (error instanceof DOMException) {
        if (error.name === 'NotAllowedError') {
          setError('Please allow camera and microphone access to join the meeting.');
        } else if (error.name === 'NotFoundError') {
          setError('No camera or microphone found. Please connect a device.');
        } else if (error.name === 'NotReadableError') {
          if (retryCount < 3) {
            console.log('Device busy, retrying...');
            await new Promise(resolve => setTimeout(resolve, 1000));
            return initializeMediaDevices(retryCount + 1);
          }
          setError('Could not access your camera/microphone. Please check if another app is using them.');
        } else {
          setError('Error accessing media devices. Please check your settings.');
        }
      }
      return null;
    }
  };

  const toggleAudio = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioEnabled(audioTrack.enabled);
      }
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoEnabled(videoTrack.enabled);
      }
    }
  };

  const setupPeerConnection = async (stream: MediaStream): Promise<Peer | null> => {
    if (!stream) return null;

    const peerId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    console.log('🎥 Initializing PeerJS with ID:', peerId);

    const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000';
    const host = new URL(backendUrl).hostname;
    const port = new URL(backendUrl).port || '5000';
    
    console.log('🔗 PeerJS connecting to:', { host, port });

    const newPeer = new Peer(peerId, {
      host,
      port: parseInt(port),
      path: '/peerjs',
      secure: false,
      debug: 3,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:global.stun.twilio.com:3478' }
        ]
      }
    });

    return new Promise((resolve) => {
      let timeoutId: NodeJS.Timeout;

      const cleanup = () => {
        if (timeoutId) clearTimeout(timeoutId);
      };

      newPeer.on('open', () => {
        console.log('✅ PeerJS connected with ID:', peerId);
        cleanup();
        resolve(newPeer);
      });

      newPeer.on('error', (error) => {
        console.error('❌ PeerJS error:', error);
        cleanup();
        resolve(null);
      });

      newPeer.on('connection', (conn) => {
        console.log('🤝 Incoming peer connection:', conn.peer);
      });

      // Set a timeout for the connection attempt
      timeoutId = setTimeout(() => {
        console.error('⏰ PeerJS connection timeout');
        newPeer.destroy();
        resolve(null);
      }, 10000); // 10 seconds timeout
    });
  };

  const initializeMeeting = async () => {
    setError('');
    setIsLoading(true);

    try {
      // First get media devices
      const stream = await initializeMediaDevices();
      if (!stream) {
        setIsLoading(false);
        return;
      }

      // Then set up peer connection
      const peer = await setupPeerConnection(stream);
      if (!peer) {
        setIsLoading(false);
        setError('Failed to establish connection. Please try again.');
        return;
      }

      setPeer(peer);
      setIsLoading(false);
    } catch (error) {
      console.error('Meeting initialization error:', error);
      setError('Failed to initialize meeting. Please try again.');
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!backendUrl) {
      setError('Backend URL not configured');
      setIsLoading(false);
      return;
    }

    initializeMeeting();
  }, [backendUrl]);

  useEffect(() => {
    if (!socket || !peer || !localStream || !meetingId) return;

    console.log('Joining room:', meetingId);
    socket.emit('join-room', meetingId, peer.id);

    const handleUserConnected = (userId: string) => {
      console.log('User connected:', userId);
      const call = peer.call(userId, localStream);
      if (call) {
        call.on('stream', (remoteStream) => {
          console.log('Received stream from:', userId);
          addVideoStream(userId, remoteStream);
        });
      }
    };

    const handleUserDisconnected = (userId: string) => {
      console.log('User disconnected:', userId);
      removeUserVideo(userId);
    };

    const handleIncomingCall = (call: any) => {
      console.log('Receiving call from:', call.peer);
      call.answer(localStream);
      
      call.on('stream', (remoteStream: MediaStream) => {
        console.log('Received remote stream from:', call.peer);
        addVideoStream(call.peer, remoteStream);
      });
    };

    socket.on('user-connected', handleUserConnected);
    socket.on('user-disconnected', handleUserDisconnected);
    socket.on('receive-message', (message: ChatMessage) => {
      console.log('Received message:', message);
      setMessages(prev => [...prev, message]);
    });
    peer.on('call', handleIncomingCall);

    return () => {
      socket.off('user-connected', handleUserConnected);
      socket.off('user-disconnected', handleUserDisconnected);
      socket.off('receive-message');
      // peer.off('call', handleIncomingCall); // PeerJS doesn't support off
    };
  }, [socket, peer, localStream, meetingId]);

  const addVideoStream = (userId: string, stream: MediaStream) => {
    if (!remoteVideosRef.current) return;

    console.log('Adding video stream for:', userId);
    removeUserVideo(userId); // Remove existing video if any

    const videoContainer = document.createElement('div');
    videoContainer.id = `video-${userId}`;
    videoContainer.style.position = 'relative';
    
    const video = document.createElement('video');
    video.srcObject = stream;
    video.autoplay = true;
    video.playsInline = true;
    video.style.width = '100%';
    video.style.borderRadius = '8px';

    videoContainer.appendChild(video);
    remoteVideosRef.current.appendChild(videoContainer);

    video.play().catch(error => {
      console.error('Error playing remote video:', error);
    });
  };

  const removeUserVideo = (userId: string) => {
    const videoContainer = document.getElementById(`video-${userId}`);
    if (videoContainer) {
      videoContainer.remove();
    }
  };

  const handleSendMessage = (content: string) => {
    if (!socket || !content.trim()) return;

    const message: ChatMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      userId: peer?.id || '',
      userName: 'You',
      content: content.trim(),
      timestamp: new Date(),
    };

    console.log('Sending message:', message);
    socket.emit('send-message', meetingId, message);
    setMessages(prev => [...prev, message]);
  };

  const copyMeetingLink = () => {
    navigator.clipboard.writeText(meetingUrl);
    setSnackbarOpen(true);
  };

  if (isLoading) {
    return (
      <Box sx={{ 
        display: 'flex', 
        flexDirection: 'column',
        alignItems: 'center', 
        justifyContent: 'center', 
        height: '100vh'
      }}>
        <CircularProgress />
        <Typography sx={{ mt: 2 }}>
          Setting up your meeting...
        </Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ 
        display: 'flex', 
        flexDirection: 'column',
        alignItems: 'center', 
        justifyContent: 'center', 
        height: '100vh',
        p: 3
      }}>
        <Typography variant="h6" color="error" gutterBottom align="center">
          {error}
        </Typography>
        <Button 
          variant="contained" 
          onClick={() => window.location.reload()}
          sx={{ mt: 2 }}
        >
          Try Again
        </Button>
      </Box>
    );
  }

  return (
    <Container maxWidth="xl">
      <Box sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="h6">
            Meeting Room ({participantCount} participant{participantCount !== 1 ? 's' : ''})
          </Typography>
          <Box>
            <IconButton onClick={toggleAudio}>
              {isAudioEnabled ? <MicIcon /> : <MicOffIcon color="error" />}
            </IconButton>
            <IconButton onClick={toggleVideo}>
              {isVideoEnabled ? <VideocamIcon /> : <VideocamOffIcon color="error" />}
            </IconButton>
            <IconButton onClick={() => setIsChatOpen(!isChatOpen)}>
              <ChatIcon />
            </IconButton>
            <IconButton onClick={copyMeetingLink}>
              <ShareIcon />
            </IconButton>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', gap: 2, height: 'calc(100vh - 100px)' }}>
          <Box sx={{ flex: 1 }}>
            <Paper 
              sx={{ 
                p: 1, 
                backgroundColor: '#f5f5f5',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                gap: 2
              }}
            >
              <Box sx={{ position: 'relative', width: '300px' }}>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  style={{
                    width: '100%',
                    borderRadius: '8px',
                    transform: 'scaleX(-1)'
                  }}
                />
                <Typography
                  sx={{
                    position: 'absolute',
                    bottom: 8,
                    left: 8,
                    color: 'white',
                    backgroundColor: 'rgba(0,0,0,0.5)',
                    padding: '2px 8px',
                    borderRadius: 1,
                  }}
                >
                  You
                </Typography>
              </Box>
              
              <Box 
                ref={remoteVideosRef}
                sx={{
                  flex: 1,
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                  gap: 2,
                  overflow: 'auto'
                }}
              />
            </Paper>
          </Box>
        </Box>

        <ChatDrawer
          open={isChatOpen}
          anchor="right"
          messages={messages}
          onClose={() => setIsChatOpen(false)}
          onSendMessage={handleSendMessage}
        />

        <Snackbar
          open={snackbarOpen}
          autoHideDuration={3000}
          onClose={() => setSnackbarOpen(false)}
        >
          <Alert severity="success">
            Meeting link copied to clipboard!
          </Alert>
        </Snackbar>
      </Box>
    </Container>
  );
};

export default Meeting;
