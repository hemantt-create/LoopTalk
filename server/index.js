const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3001;
const allowedOrigins = new Set(
  [
    "http://localhost:3000",
    "https://loop-talk-gilt.vercel.app",
    process.env.FRONTEND_URL,
  ].filter(Boolean)
);
const vercelPreviewOriginPattern = /^https:\/\/loop-talk.*\.vercel\.app$/;

const isAllowedOrigin = (origin) => {
  if (!origin) {
    return true;
  }

  return (
    allowedOrigins.has(origin) || vercelPreviewOriginPattern.test(origin)
  );
};

const corsOptions = {
  origin(origin, callback) {
    callback(null, isAllowedOrigin(origin));
  },
  methods: ["GET", "POST"],
};

app.use(cors(corsOptions));

app.get("/", (req, res) => {
  res.send("LoopTalk server is running");
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

const io = new Server(server, {
  cors: corsOptions,
});

const waitingQueue = [];
const activeCalls = new Map();
const recentPeers = new Map();
const onlineVisitors = new Set();
let roomCounter = 0;

const emitOnlineCount = () => {
  io.emit("online_count", { count: onlineVisitors.size });
};

const removeFromQueue = (socketId) => {
  const queueIndex = waitingQueue.indexOf(socketId);

  if (queueIndex === -1) {
    return false;
  }

  waitingQueue.splice(queueIndex, 1);
  return true;
};

const createRoomId = () => {
  roomCounter += 1;
  return `room-${Date.now()}-${roomCounter}`;
};

const areRecentPeers = (firstId, secondId) => {
  return (
    recentPeers.get(firstId) === secondId ||
    recentPeers.get(secondId) === firstId
  );
};

const removeRecentPeerReferences = (socketId) => {
  recentPeers.delete(socketId);

  for (const [currentSocketId, peerId] of recentPeers) {
    if (peerId === socketId) {
      recentPeers.delete(currentSocketId);
    }
  }
};

const notifyPeerLeft = (socketId) => {
  const call = activeCalls.get(socketId);

  if (!call) {
    return;
  }

  const currentSocket = io.sockets.sockets.get(socketId);
  const peerSocket = io.sockets.sockets.get(call.peerId);

  if (currentSocket) {
    currentSocket.leave(call.roomId);
  }

  if (peerSocket) {
    peerSocket.emit("peer_left");
    peerSocket.leave(call.roomId);
  }

  activeCalls.delete(socketId);
  activeCalls.delete(call.peerId);
  console.log("Peer left room:", call.roomId);
};

const cleanWaitingQueue = () => {
  for (let index = waitingQueue.length - 1; index >= 0; index -= 1) {
    const socketId = waitingQueue[index];
    const socket = io.sockets.sockets.get(socketId);

    if (!socket || activeCalls.has(socketId)) {
      waitingQueue.splice(index, 1);
    }
  }
};

const findWaitingPair = () => {
  cleanWaitingQueue();

  for (let firstIndex = 0; firstIndex < waitingQueue.length; firstIndex += 1) {
    for (
      let secondIndex = firstIndex + 1;
      secondIndex < waitingQueue.length;
      secondIndex += 1
    ) {
      const firstId = waitingQueue[firstIndex];
      const secondId = waitingQueue[secondIndex];

      if (areRecentPeers(firstId, secondId)) {
        console.log("Skipping recent peer rematch:", firstId, secondId);
        continue;
      }

      return { firstId, firstIndex, secondId, secondIndex };
    }
  }

  return null;
};

const tryMatchWaitingUsers = () => {
  while (waitingQueue.length >= 2) {
    const pair = findWaitingPair();

    if (!pair) {
      return;
    }

    waitingQueue.splice(pair.secondIndex, 1);
    waitingQueue.splice(pair.firstIndex, 1);

    const firstSocket = io.sockets.sockets.get(pair.firstId);
    const secondSocket = io.sockets.sockets.get(pair.secondId);

    if (
      !firstSocket ||
      !secondSocket ||
      activeCalls.has(pair.firstId) ||
      activeCalls.has(pair.secondId)
    ) {
      continue;
    }

    const roomId = createRoomId();
    const firstId = firstSocket.id;
    const secondId = secondSocket.id;

    firstSocket.join(roomId);
    secondSocket.join(roomId);

    activeCalls.set(firstId, { roomId, peerId: secondId });
    activeCalls.set(secondId, { roomId, peerId: firstId });
    recentPeers.set(firstId, secondId);
    recentPeers.set(secondId, firstId);

    firstSocket.emit("match_found", {
      roomId,
      peerId: secondId,
      isInitiator: true,
    });
    secondSocket.emit("match_found", {
      roomId,
      peerId: firstId,
      isInitiator: false,
    });

    console.log("Match found:", firstId, secondId, roomId);
  }
};

const relayToPeerInRoom = (socket, eventName, payload, logMessage) => {
  const roomId = payload?.roomId;
  const call = activeCalls.get(socket.id);

  if (!roomId || !call || call.roomId !== roomId || !socket.rooms.has(roomId)) {
    return;
  }

  const peerSocket = io.sockets.sockets.get(call.peerId);

  if (!peerSocket || !peerSocket.rooms.has(roomId)) {
    return;
  }

  peerSocket.emit(eventName, payload);
  console.log(logMessage);
};

io.on("connection", (socket) => {
  onlineVisitors.add(socket.id);
  console.log("User connected:", socket.id);
  emitOnlineCount();

  socket.on("join_queue", () => {
    if (activeCalls.has(socket.id)) {
      console.log("Already in call:", socket.id);
      return;
    }

    if (waitingQueue.includes(socket.id)) {
      console.log("Already in queue:", socket.id);
      return;
    }

    waitingQueue.push(socket.id);
    console.log("Joined queue:", socket.id, "Queue:", waitingQueue.length);
    tryMatchWaitingUsers();
  });

  socket.on("leave_queue", () => {
    if (removeFromQueue(socket.id)) {
      console.log("Left queue:", socket.id, "Queue:", waitingQueue.length);
    }
  });

  socket.on("leave_call", () => {
    notifyPeerLeft(socket.id);
  });

  socket.on("webrtc_offer", (payload) => {
    relayToPeerInRoom(socket, "webrtc_offer", payload, "offer relayed");
  });

  socket.on("webrtc_answer", (payload) => {
    relayToPeerInRoom(socket, "webrtc_answer", payload, "answer relayed");
  });

  socket.on("ice_candidate", (payload) => {
    relayToPeerInRoom(
      socket,
      "ice_candidate",
      payload,
      "ICE candidate relayed"
    );
  });

  socket.on("disconnect", () => {
    onlineVisitors.delete(socket.id);
    removeFromQueue(socket.id);
    notifyPeerLeft(socket.id);
    removeRecentPeerReferences(socket.id);
    console.log("User disconnected:", socket.id);
    emitOnlineCount();
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`LoopTalk server running on port ${PORT}`);
});
