import { io } from "socket.io-client";

const productionSocketUrl = "https://looptalk-production.up.railway.app";
const localSocketUrl = "http://localhost:3001";

export const socketUrl =
  typeof window !== "undefined" && window.location.hostname === "localhost"
    ? localSocketUrl
    : productionSocketUrl;

if (typeof window !== "undefined") {
  console.log("LoopTalk socket URL:", socketUrl);
}

export const socket = io(socketUrl, {
  autoConnect: false,
  transports: ["websocket"],
});
