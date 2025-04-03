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
  const videoRef = useRef<HTMLVideoElement>(null);
  const remoteVideosRef = useRef<HTMLDivElement>(null);

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

    newSocket.on('connect', () => {
      console.log('Socket connected');
    });

    newSocket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
    });

    setSocket(newSocket);

    const peerId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    console.log('Initializing peer with ID:', peerId);

    const newPeer = new Peer(peerId, {
      host: new URL(backendUrl).hostname,
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
      initializeMedia();
    });

    newPeer.on('error', (error) => {
      console.error('PeerJS error:', error);
      alert('Connection error. Please try refreshing the page.');
    });

    const initializeMedia = async () => {
      try {
        console.log('Requesting media devices...');
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true
        });

        console.log('Media access granted');
        setStream(mediaStream);

        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          videoRef.current.play().catch(error => {
            console.error('Error playing local video:', error);
          });
        }
      } catch (error: any) {
        console.error('Media access error:', error);
        if (error.name === 'NotAllowedError') {
          alert('Please allow camera and microphone access to join the meeting.');
        } else {
          alert('Error accessing camera/microphone. Please check your device settings.');
        }
      }
    };

    return () => {
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
    };
  }, [meetingId]);

  useEffect(() => {
    if (!socket || !peer || !stream) return;

    console.log('Joining room:', meetingId);
    socket.emit('join-room', meetingId, peer.id);

    socket.on('user-connected', (userId) => {
      console.log('User connected:', userId);
      connectToNewUser(userId, stream);
    });

    socket.on('user-disconnected', (userId) => {
      console.log('User disconnected:', userId);
      removeUserVideo(userId);
    });

    socket.on('receive-message', (message: Message) => {
      console.log('Received message:', message);
      setMessages(prev => [...prev, message]);
    });

    peer.on('call', (call) => {
      console.log('Receiving call from:', call.peer);
      call.answer(stream);
      
      call.on('stream', (remoteStream) => {
        console.log('Received remote stream');
        addVideoStream(call.peer, remoteStream);
      });
    });

    return () => {
      socket.off('user-connected');
      socket.off('user-disconnected');
      socket.off('receive-message');
    };
  }, [socket, peer, stream, meetingId]);

  const connectToNewUser = (userId: string, stream: MediaStream) => {
    console.log('Connecting to user:', userId);
    const call = peer?.call(userId, stream);
    
    if (call) {
      call.on('stream', (remoteStream) => {
        console.log('Received stream from:', userId);
        addVideoStream(userId, remoteStream);
      });

      call.on('close', () => {
        console.log('Call closed with:', userId);
        removeUserVideo(userId);
      });
    }
  };

  const addVideoStream = (userId: string, stream: MediaStream) => {
    if (!remoteVideosRef.current) return;

    // Remove existing video if any
    removeUserVideo(userId);

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
      }
    }
  };

  const toggleVideo = () => {
    if (stream) {
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoEnabled(videoTrack.enabled);
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

    socket.emit('send-message', meetingId, message);
    setMessages(prev => [...prev, message]);
  };

  const copyMeetingLink = () => {
    navigator.clipboard.writeText(meetingUrl);
    setSnackbarOpen(true);
  };

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
