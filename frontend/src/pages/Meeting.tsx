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
import { Message } from '../types';
import ChatDrawer from '../components/ChatDrawer';

const Meeting: React.FC = () => {
  const { id: meetingId } = useParams<{ id: string }>();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [peer, setPeer] = useState<Peer | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [participantCount, setParticipantCount] = useState(1);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const remoteVideosRef = useRef<HTMLDivElement>(null);
  const [mediaRequested, setMediaRequested] = useState(false);

  const meetingUrl = `${process.env.REACT_APP_FRONTEND_URL}/meeting/${meetingId}`;
  const backendUrl = process.env.REACT_APP_BACKEND_URL;

  const initializeMedia = async () => {
    try {
      console.log('Requesting media devices...');
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });

      console.log('Media access granted:', mediaStream.getTracks().map(t => t.kind));
      setStream(mediaStream);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        await videoRef.current.play();
        console.log('Local video playing');
      }

      return mediaStream;
    } catch (error: any) {
      console.error('Media access error:', error);
      if (error.name === 'NotAllowedError') {
        throw new Error('Please allow camera and microphone access to join the meeting');
      } else if (error.name === 'NotFoundError') {
        throw new Error('No camera or microphone found. Please check your device connections');
      } else if (error.name === 'NotReadableError') {
        throw new Error('Your camera or microphone is already in use by another application');
      } else {
        throw new Error('Failed to access camera/microphone. Please check your device settings');
      }
    }
  };

  useEffect(() => {
    if (!backendUrl) {
      setError('Backend URL not configured');
      setIsLoading(false);
      return;
    }

    const setupMeeting = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // 1. Get media stream first
        if (!mediaRequested) {
          setMediaRequested(true);
          const mediaStream = await initializeMedia();
          if (!mediaStream) return;
        }

        // 2. Set up Socket.IO
        console.log('Connecting to backend:', backendUrl);
        const newSocket = io(backendUrl, {
          transports: ['websocket'],
          withCredentials: true,
          reconnection: true,
          reconnectionAttempts: 5,
          reconnectionDelay: 1000,
        });

        newSocket.on('connect_error', (error) => {
          console.error('Socket connection error:', error);
          setError('Unable to connect to the server. Please check your internet connection');
        });

        newSocket.on('connect', () => {
          console.log('Socket connected successfully');
        });

        setSocket(newSocket);

        // 3. Set up PeerJS
        const peerId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        console.log('Initializing PeerJS with ID:', peerId);

        const peerHost = new URL(backendUrl).hostname;
        console.log('PeerJS host:', peerHost);

        const newPeer = new Peer(peerId, {
          host: peerHost,
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
              }
            ]
          }
        });

        newPeer.on('open', (id) => {
          console.log('PeerJS connected with ID:', id);
          setPeer(newPeer);
          setIsLoading(false);
        });

        newPeer.on('error', (error) => {
          console.error('PeerJS error:', error);
          setError('Connection error. Please try refreshing the page');
        });

        return () => {
          if (stream) {
            stream.getTracks().forEach(track => {
              track.stop();
              console.log('Stopped track:', track.kind);
            });
          }
          newSocket.disconnect();
          newPeer.destroy();
        };
      } catch (error: any) {
        console.error('Meeting setup error:', error);
        setError(error.message || 'Failed to set up meeting');
        setIsLoading(false);
      }
    };

    const cleanup = setupMeeting();
    return () => {
      cleanup.then(cleanupFn => cleanupFn && cleanupFn());
    };
  }, [backendUrl, mediaRequested]);

  useEffect(() => {
    if (!socket || !peer || !stream || !meetingId) return;

    console.log('Joining room:', meetingId);
    socket.emit('join-room', meetingId, peer.id);

    const handleUserConnected = (userId: string) => {
      console.log('User connected:', userId);
      const call = peer.call(userId, stream);
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
      call.answer(stream);
      
      call.on('stream', (remoteStream: MediaStream) => {
        console.log('Received remote stream from:', call.peer);
        addVideoStream(call.peer, remoteStream);
      });
    };

    socket.on('user-connected', handleUserConnected);
    socket.on('user-disconnected', handleUserDisconnected);
    socket.on('receive-message', (message: Message) => {
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
  }, [socket, peer, stream, meetingId]);

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

  const toggleAudio = () => {
    if (stream) {
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioEnabled(audioTrack.enabled);
        console.log('Audio track enabled:', audioTrack.enabled);
      }
    }
  };

  const toggleVideo = () => {
    if (stream) {
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoEnabled(videoTrack.enabled);
        console.log('Video track enabled:', videoTrack.enabled);
      }
    }
  };

  const handleSendMessage = (content: string) => {
    if (!socket || !content.trim()) return;

    const message: Message = {
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
