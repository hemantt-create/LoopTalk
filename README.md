# LoopTalk 🎙️

LoopTalk is a full-stack random one-to-one voice chat web app. It allows users to connect with a random person through live voice chat, without login or profiles.

Live Website: https://loop-talk-gilt.vercel.app
Backend Health Check: https://looptalk-production.up.railway.app

## Features

* Random one-to-one voice matching
* Live WebRTC voice calling
* Microphone permission handling
* Mute/unmute support
* Next Person option
* End Call option
* Basic report flow
* Privacy and safety pages
* Mobile responsive UI
* Earphones and speaker-mode guidance for better audio quality

## Tech Stack

### Frontend

* Next.js
* React
* TypeScript
* Tailwind CSS
* Vercel for deployment

### Backend

* Node.js
* Express.js
* Socket.IO
* Railway for deployment

### Real-Time Voice

* Socket.IO for matchmaking and WebRTC signalling
* WebRTC for peer-to-peer audio communication

## How It Works

LoopTalk uses Socket.IO to connect users to the backend server. When two users click “Start Talking,” the backend places them into a waiting queue and matches them into a room.

After matching, Socket.IO is used only for WebRTC signalling. The actual voice call happens directly between the two browsers using WebRTC.

Basic flow:

```text
User joins queue
↓
Backend matches two users
↓
Socket.IO exchanges WebRTC offer/answer/ICE candidates
↓
Browsers connect directly through WebRTC
↓
Live voice call starts
```

## Project Structure

```text
LoopTalk
├── server
│   ├── index.js
│   ├── package.json
│   └── package-lock.json
│
└── web
    ├── app
    │   ├── page.tsx
    │   ├── privacy
    │   └── safety
    ├── lib
    │   └── socket.ts
    ├── package.json
    └── package-lock.json
```

## Local Setup

### 1. Clone the repository

```bash
git clone https://github.com/hemantt-create/LoopTalk.git
cd LoopTalk
```

### 2. Start the backend

```bash
cd server
npm install
npm start
```

The backend runs on:

```text
http://localhost:3001
```

### 3. Start the frontend

Open another terminal:

```bash
cd web
npm install
npm run dev
```

The frontend runs on:

```text
http://localhost:3000
```

## Environment Variables

For the frontend, set:

```env
NEXT_PUBLIC_SIGNALING_URL=https://looptalk-production.up.railway.app
```

For local development, if this variable is not set, the app falls back to:

```text
http://localhost:3001
```

For the backend, set:

```env
FRONTEND_URL=https://loop-talk-gilt.vercel.app
```

This allows the deployed frontend to connect to the backend safely.

## Important Notes

LoopTalk is currently an MVP/private beta project.

For best voice quality, users should use earphones. Speaker mode may cause echo, unclear voice, or background noise because the speaker audio can enter the microphone again.

Voice calls are not recorded or stored by the app.

## Safety

Users should:

* Be respectful
* Avoid sharing personal information
* Leave the call if uncomfortable
* Use the report option if needed
* Use earphones for better audio quality

## Deployment

* Frontend deployed on Vercel
* Backend deployed on Railway
* Code hosted on GitHub

## Future Improvements

* Database-based report storage
* Block same user option
* Better moderation tools
* TURN server for stricter networks
* Better speaker-mode audio handling
* User feedback system
* Better analytics and diagnostics

## Author

Built by Hemant Patel as a full-stack real-time voice chat project.
