# Zoomie - Video Conferencing Application

A modern video conferencing application built with React, Node.js, and WebRTC.

## Features

- Real-time video conferencing
- Text chat
- Speech-to-text conversion
- User authentication
- Guest access
- Meeting sharing

## Tech Stack

### Frontend
- React.js with TypeScript
- Material-UI
- Socket.IO Client
- PeerJS
- Web Speech API

### Backend
- Node.js
- Express
- MongoDB
- Socket.IO
- JWT Authentication

## Development Setup

1. Clone the repository:
```bash
git clone [repository-url]
cd zoomie
```

2. Install dependencies:
```bash
# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

3. Set up environment variables:

Backend (.env):
```
PORT=5000
MONGODB_URI=your_mongodb_uri
JWT_SECRET=your_jwt_secret
FRONTEND_URL=your_frontend_url
```

Frontend (.env):
```
REACT_APP_BACKEND_URL=your_backend_url
REACT_APP_FRONTEND_URL=your_frontend_url
```

4. Start the development servers:

Backend:
```bash
cd backend
npm run dev
```

Frontend:
```bash
cd frontend
npm start
```

## Deployment

- Frontend: Deployed on Vercel
- Backend: Deployed on Render
- Database: MongoDB Atlas

## License

MIT
