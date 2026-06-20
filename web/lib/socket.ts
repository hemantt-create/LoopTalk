import { io } from "socket.io-client";

const getSocketUrl = () => {
  if (process.env.NEXT_PUBLIC_SIGNALING_URL) {
    return process.env.NEXT_PUBLIC_SIGNALING_URL;
  }

  if (typeof window !== "undefined" && window.location.hostname === "localhost") {
    return "http://localhost:3001";
  }

  return "https://looptalk-production.up.railway.app";
};

export const socket = io(getSocketUrl(), {
  autoConnect: false,
  transports: ["websocket"],
});