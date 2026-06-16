"use client";

import {
  Flag,
  Headphones,
  Lock,
  Mic,
  MicOff,
  PhoneOff,
  Shield,
  Shuffle,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { socket } from "@/lib/socket";

type MicrophoneStatus = "idle" | "searching" | "connected" | "denied";
type SocketStatus = "idle" | "connecting" | "connected" | "error";
type MatchInfo = {
  roomId: string;
  peerId: string;
  isInitiator: boolean;
};
type WebRtcConnectionStatus = "idle" | RTCPeerConnectionState;
type WebRtcOfferPayload = {
  roomId: string;
  offer: RTCSessionDescriptionInit;
};
type WebRtcAnswerPayload = {
  roomId: string;
  answer: RTCSessionDescriptionInit;
};
type IceCandidatePayload = {
  roomId: string;
  candidate: RTCIceCandidateInit;
};
type OnlineCountPayload = {
  count: number;
};

const webRtcConfig: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

const voiceAudioConstraints: MediaStreamConstraints = {
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1,
  },
};

const audioQualityNotes = [
  "For best voice quality, use earphones.",
  "Speaker mode may cause echo or unclear voice.",
];

export default function Home() {
  const highlights = ["Anonymous", "Voice Only", "Instant Matching"];
  const [microphoneStatus, setMicrophoneStatus] =
    useState<MicrophoneStatus>("idle");
  const [socketStatus, setSocketStatus] = useState<SocketStatus>("idle");
  const [socketMessage, setSocketMessage] = useState<string | null>(null);
  const [matchInfo, setMatchInfo] = useState<MatchInfo | null>(null);
  const [webRtcConnectionState, setWebRtcConnectionState] =
    useState<WebRtcConnectionStatus>("idle");
  const [onlineCount, setOnlineCount] = useState<number | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const microphoneStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const currentRoomIdRef = useRef<string | null>(null);
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const shouldJoinQueueRef = useRef(false);
  const hasJoinedQueueRef = useRef(false);
  const isStartingRef = useRef(false);
  const isLeavingCallRef = useRef(false);
  const sessionTokenRef = useRef(0);
  const onlineCountText =
    onlineCount === null
      ? "Checking online users…"
      : onlineCount === 1
        ? "🟢 1 person online"
        : `🟢 ${onlineCount} people online`;

  const stopMicrophoneStream = useCallback(() => {
    microphoneStreamRef.current?.getTracks().forEach((track) => {
      track.stop();
    });
    microphoneStreamRef.current = null;
  }, []);

  const setMicrophoneTracksEnabled = useCallback((enabled: boolean) => {
    microphoneStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = enabled;
    });
  }, []);

  const applySpeechContentHint = useCallback((stream: MediaStream) => {
    stream.getAudioTracks().forEach((track) => {
      if ("contentHint" in track) {
        track.contentHint = "speech";
      }
    });
  }, []);

  const stopRemoteAudio = useCallback(() => {
    if (remoteAudioRef.current) {
      remoteAudioRef.current.pause();
      remoteAudioRef.current.srcObject = null;
    }

    remoteStreamRef.current?.getTracks().forEach((track) => {
      track.stop();
    });
    remoteStreamRef.current = null;
  }, []);

  const closePeerConnection = useCallback(() => {
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    currentRoomIdRef.current = null;
    pendingIceCandidatesRef.current = [];
    stopRemoteAudio();
    setWebRtcConnectionState("idle");
  }, [stopRemoteAudio]);

  const markSessionInactive = useCallback(() => {
    sessionTokenRef.current += 1;
    shouldJoinQueueRef.current = false;
    hasJoinedQueueRef.current = false;
    isStartingRef.current = false;
    setIsStarting(false);
  }, []);

  const addPendingIceCandidates = useCallback(
    async (peerConnection: RTCPeerConnection) => {
      const candidates = pendingIceCandidatesRef.current;
      pendingIceCandidatesRef.current = [];

      for (const candidate of candidates) {
        try {
          await peerConnection.addIceCandidate(candidate);
        } catch {
          console.warn("LoopTalk: skipped stale ICE candidate");
        }
      }
    },
    [],
  );

  const createPeerConnection = useCallback((match: MatchInfo) => {
    if (!("RTCPeerConnection" in window)) {
      setSocketMessage("WebRTC is not supported in this browser.");
      return null;
    }

    const localStream = microphoneStreamRef.current;

    if (!localStream) {
      setSocketMessage("Microphone stream is not available for the call.");
      return null;
    }

    closePeerConnection();

    const peerConnection = new RTCPeerConnection(webRtcConfig);
    const remoteStream = new MediaStream();

    peerConnectionRef.current = peerConnection;
    remoteStreamRef.current = remoteStream;
    currentRoomIdRef.current = match.roomId;
    setWebRtcConnectionState(peerConnection.connectionState);

    localStream.getAudioTracks().forEach((track) => {
      peerConnection.addTrack(track, localStream);
    });

    peerConnection.onconnectionstatechange = () => {
      if (peerConnectionRef.current === peerConnection) {
        setWebRtcConnectionState(peerConnection.connectionState);
      }
    };

    peerConnection.onicecandidate = (event) => {
      if (
        peerConnectionRef.current === peerConnection &&
        event.candidate &&
        socket.connected
      ) {
        socket.emit("ice_candidate", {
          roomId: match.roomId,
          candidate: event.candidate.toJSON(),
        });
      }
    };

    peerConnection.ontrack = (event) => {
      if (peerConnectionRef.current !== peerConnection) {
        return;
      }

      remoteStream.addTrack(event.track);

      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = remoteStream;
        void remoteAudioRef.current.play().catch(() => {
          if (peerConnectionRef.current === peerConnection) {
            setSocketMessage(
              "Remote audio playback was blocked by the browser.",
            );
          }
        });
      }
    };

    return peerConnection;
  }, [closePeerConnection]);

  const startWebRtcCall = useCallback(
    async (match: MatchInfo) => {
      const peerConnection = createPeerConnection(match);

      if (!peerConnection || !match.isInitiator) {
        return;
      }

      try {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        if (peerConnectionRef.current === peerConnection && socket.connected) {
          socket.emit("webrtc_offer", {
            roomId: match.roomId,
            offer,
          });
        }
      } catch {
        if (peerConnectionRef.current === peerConnection) {
          setSocketMessage("Could not start the WebRTC audio connection.");
          closePeerConnection();
        }
      }
    },
    [closePeerConnection, createPeerConnection],
  );

  const handleWebRtcOffer = useCallback(
    async ({ roomId, offer }: WebRtcOfferPayload) => {
      const peerConnection = peerConnectionRef.current;

      if (
        !peerConnection ||
        currentRoomIdRef.current !== roomId ||
        peerConnection.signalingState === "closed" ||
        peerConnection.remoteDescription
      ) {
        return;
      }

      try {
        await peerConnection.setRemoteDescription(offer);
        await addPendingIceCandidates(peerConnection);

        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        if (peerConnectionRef.current === peerConnection && socket.connected) {
          socket.emit("webrtc_answer", {
            roomId,
            answer,
          });
        }
      } catch {
        if (peerConnectionRef.current === peerConnection) {
          setSocketMessage("Could not answer the WebRTC audio connection.");
          closePeerConnection();
        }
      }
    },
    [addPendingIceCandidates, closePeerConnection],
  );

  const handleWebRtcAnswer = useCallback(
    async ({ roomId, answer }: WebRtcAnswerPayload) => {
      const peerConnection = peerConnectionRef.current;

      if (
        !peerConnection ||
        currentRoomIdRef.current !== roomId ||
        peerConnection.signalingState !== "have-local-offer"
      ) {
        return;
      }

      try {
        await peerConnection.setRemoteDescription(answer);
        await addPendingIceCandidates(peerConnection);
      } catch {
        if (peerConnectionRef.current === peerConnection) {
          setSocketMessage("Could not complete the WebRTC audio connection.");
          closePeerConnection();
        }
      }
    },
    [addPendingIceCandidates, closePeerConnection],
  );

  const handleIceCandidate = useCallback(
    async ({ roomId, candidate }: IceCandidatePayload) => {
      const peerConnection = peerConnectionRef.current;

      if (
        !peerConnection ||
        currentRoomIdRef.current !== roomId ||
        peerConnection.signalingState === "closed"
      ) {
        return;
      }

      try {
        if (peerConnection.remoteDescription) {
          await peerConnection.addIceCandidate(candidate);
        } else {
          pendingIceCandidatesRef.current.push(candidate);
        }
      } catch {
        if (peerConnectionRef.current === peerConnection) {
          setSocketMessage("Could not add a WebRTC network candidate.");
        }
      }
    },
    [],
  );

  const handleOnlineCount = useCallback(({ count }: OnlineCountPayload) => {
    setOnlineCount(Number.isFinite(count) ? Math.max(0, count) : 0);
  }, []);

  const emitJoinQueue = useCallback(() => {
    if (
      socket.connected &&
      shouldJoinQueueRef.current &&
      !hasJoinedQueueRef.current
    ) {
      socket.emit("join_queue");
      hasJoinedQueueRef.current = true;
      console.log("LoopTalk: joined matchmaking queue");
    }
  }, []);

  const handleSocketConnect = useCallback(() => {
    setSocketStatus("connected");

    if (shouldJoinQueueRef.current) {
      setSocketMessage("Connected to LoopTalk server");
      emitJoinQueue();
    } else {
      setSocketMessage(null);
    }
  }, [emitJoinQueue]);

  const handleSocketConnectError = useCallback((error: Error) => {
    setSocketStatus("error");
    setOnlineCount(null);
    setSocketMessage(
      `Could not connect to LoopTalk server at http://localhost:3001. ${error.message || "Please make sure the backend is running."}`,
    );
  }, []);

  const handleSocketDisconnect = useCallback(() => {
    hasJoinedQueueRef.current = false;
    setOnlineCount(null);

    if (!shouldJoinQueueRef.current && !currentRoomIdRef.current) {
      setSocketStatus("idle");
      return;
    }

    closePeerConnection();
    shouldJoinQueueRef.current = Boolean(microphoneStreamRef.current);
    setMatchInfo(null);
    setIsMuted(false);
    setMicrophoneTracksEnabled(true);
    setMicrophoneStatus(shouldJoinQueueRef.current ? "searching" : "idle");
    setSocketStatus("connecting");
    setSocketMessage("Connection lost. Reconnecting to LoopTalk server...");
  }, [closePeerConnection, setMicrophoneTracksEnabled]);

  const handleMatchFound = useCallback(
    (match: MatchInfo) => {
      if (
        currentRoomIdRef.current === match.roomId &&
        peerConnectionRef.current
      ) {
        return;
      }

      shouldJoinQueueRef.current = false;
      hasJoinedQueueRef.current = false;
      isLeavingCallRef.current = false;
      setMatchInfo(match);
      setMicrophoneTracksEnabled(true);
      setIsMuted(false);
      setMicrophoneStatus("connected");
      void startWebRtcCall(match);
    },
    [setMicrophoneTracksEnabled, startWebRtcCall],
  );

  const handlePeerLeft = useCallback(() => {
    closePeerConnection();

    if (!microphoneStreamRef.current) {
      markSessionInactive();
      setMatchInfo(null);
      setMicrophoneStatus("idle");
      return;
    }

    shouldJoinQueueRef.current = true;
    hasJoinedQueueRef.current = false;
    isLeavingCallRef.current = false;
    setMatchInfo(null);
    setMicrophoneTracksEnabled(true);
    setIsMuted(false);
    setMicrophoneStatus("searching");
    setSocketMessage("Peer left. Looking for someone new...");
    emitJoinQueue();
  }, [
    closePeerConnection,
    emitJoinQueue,
    markSessionInactive,
    setMicrophoneTracksEnabled,
  ]);

  const removeSocketListeners = useCallback(() => {
    socket.off("connect", handleSocketConnect);
    socket.off("connect_error", handleSocketConnectError);
    socket.off("disconnect", handleSocketDisconnect);
    socket.off("online_count", handleOnlineCount);
    socket.off("match_found", handleMatchFound);
    socket.off("peer_left", handlePeerLeft);
    socket.off("webrtc_offer", handleWebRtcOffer);
    socket.off("webrtc_answer", handleWebRtcAnswer);
    socket.off("ice_candidate", handleIceCandidate);
  }, [
    handleIceCandidate,
    handleMatchFound,
    handleOnlineCount,
    handlePeerLeft,
    handleSocketConnect,
    handleSocketConnectError,
    handleSocketDisconnect,
    handleWebRtcAnswer,
    handleWebRtcOffer,
  ]);

  const disconnectSocket = useCallback(() => {
    removeSocketListeners();
    socket.disconnect();
  }, [removeSocketListeners]);

  const resetCallSession = useCallback(() => {
    markSessionInactive();
    setMatchInfo(null);
    closePeerConnection();
    setSocketStatus(socket.connected ? "connected" : "idle");
    setSocketMessage(null);
  }, [closePeerConnection, markSessionInactive]);

  const registerSocketListeners = useCallback(() => {
    removeSocketListeners();

    socket.on("connect", handleSocketConnect);
    socket.on("connect_error", handleSocketConnectError);
    socket.on("disconnect", handleSocketDisconnect);
    socket.on("online_count", handleOnlineCount);
    socket.on("match_found", handleMatchFound);
    socket.on("peer_left", handlePeerLeft);
    socket.on("webrtc_offer", handleWebRtcOffer);
    socket.on("webrtc_answer", handleWebRtcAnswer);
    socket.on("ice_candidate", handleIceCandidate);
  }, [
    handleIceCandidate,
    handleMatchFound,
    handleOnlineCount,
    handlePeerLeft,
    handleSocketConnect,
    handleSocketConnectError,
    handleSocketDisconnect,
    handleWebRtcAnswer,
    handleWebRtcOffer,
    removeSocketListeners,
  ]);

  const connectSocket = useCallback(() => {
    registerSocketListeners();
    setSocketStatus("connecting");
    setSocketMessage(null);

    if (socket.connected) {
      handleSocketConnect();
      return;
    }

    socket.connect();
  }, [
    handleSocketConnect,
    registerSocketListeners,
  ]);

  const connectVisitorSocket = useCallback(() => {
    registerSocketListeners();

    if (!socket.connected) {
      socket.connect();
    }
  }, [registerSocketListeners]);

  useEffect(() => {
    connectVisitorSocket();

    const handlePageExit = () => {
      closePeerConnection();
      stopMicrophoneStream();
      disconnectSocket();
    };

    window.addEventListener("beforeunload", handlePageExit);
    window.addEventListener("pagehide", handlePageExit);

    return () => {
      window.removeEventListener("beforeunload", handlePageExit);
      window.removeEventListener("pagehide", handlePageExit);
      closePeerConnection();
      stopMicrophoneStream();
      disconnectSocket();
    };
  }, [
    closePeerConnection,
    connectVisitorSocket,
    disconnectSocket,
    stopMicrophoneStream,
  ]);

  const handleStartTalking = async () => {
    if (isStartingRef.current || microphoneStatus !== "idle") {
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setMicrophoneStatus("denied");
      resetCallSession();
      return;
    }

    resetCallSession();
    const sessionToken = sessionTokenRef.current + 1;
    sessionTokenRef.current = sessionToken;
    isStartingRef.current = true;
    isLeavingCallRef.current = false;
    setIsStarting(true);

    try {
      setMicrophoneStatus("idle");
      setIsMuted(false);
      stopMicrophoneStream();
      const stream =
        await navigator.mediaDevices.getUserMedia(voiceAudioConstraints);

      if (sessionTokenRef.current !== sessionToken) {
        stream.getTracks().forEach((track) => {
          track.stop();
        });
        return;
      }

      applySpeechContentHint(stream);
      microphoneStreamRef.current = stream;
      shouldJoinQueueRef.current = true;
      hasJoinedQueueRef.current = false;
      setMatchInfo(null);
      setMicrophoneStatus("searching");
      connectSocket();
    } catch {
      if (sessionTokenRef.current === sessionToken) {
        stopMicrophoneStream();
        resetCallSession();
        setMicrophoneStatus("denied");
      }
    } finally {
      if (sessionTokenRef.current === sessionToken) {
        isStartingRef.current = false;
        setIsStarting(false);
      }
    }
  };

  const handleReport = () => {
    if (isLeavingCallRef.current) {
      return;
    }

    isLeavingCallRef.current = true;

    if (socket.connected) {
      socket.emit("leave_call");
    }

    closePeerConnection();
    resetCallSession();
    stopMicrophoneStream();
    setIsMuted(false);
    setMicrophoneStatus("idle");
    setSocketMessage(
      "Thanks for reporting. You left the chat and are back on the homepage.",
    );
  };

  const handleCancelSearch = () => {
    if (
      socket.connected &&
      (hasJoinedQueueRef.current || shouldJoinQueueRef.current)
    ) {
      socket.emit("leave_queue");
    }

    isLeavingCallRef.current = false;
    resetCallSession();
    stopMicrophoneStream();
    setIsMuted(false);
    setMicrophoneStatus("idle");
  };

  const handleToggleMute = () => {
    const nextMuted = !isMuted;

    setMicrophoneTracksEnabled(!nextMuted);
    setIsMuted(nextMuted);
  };

  const handleNextPerson = () => {
    if (isLeavingCallRef.current) {
      return;
    }

    isLeavingCallRef.current = true;

    if (socket.connected) {
      socket.emit("leave_call");
    }

    closePeerConnection();
    shouldJoinQueueRef.current = true;
    hasJoinedQueueRef.current = false;
    setMatchInfo(null);
    setMicrophoneTracksEnabled(true);
    setIsMuted(false);
    setMicrophoneStatus("searching");

    if (socket.connected) {
      emitJoinQueue();
    } else {
      connectSocket();
    }
  };

  const handleEndCall = () => {
    if (isLeavingCallRef.current) {
      return;
    }

    isLeavingCallRef.current = true;

    if (socket.connected) {
      socket.emit("leave_call");
    }

    closePeerConnection();
    resetCallSession();
    stopMicrophoneStream();
    setIsMuted(false);
    setMicrophoneStatus("idle");
  };

  return (
    <main className="relative flex min-h-screen overflow-hidden bg-[#f7f4ee] text-[#151515]">
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />
      <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(19,170,145,0.16),transparent_35%),linear-gradient(300deg,rgba(244,98,76,0.14),transparent_38%)]" />

      <section className="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 py-6 sm:px-8 lg:px-12">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              aria-hidden="true"
              className="flex size-11 items-center justify-center rounded-full bg-[#151515] shadow-[0_12px_30px_rgba(21,21,21,0.18)]"
            >
              <div className="flex h-5 items-end gap-1">
                <span className="h-3 w-1.5 rounded-full bg-[#2fd6b5]" />
                <span className="h-5 w-1.5 rounded-full bg-[#fff6e5]" />
                <span className="h-4 w-1.5 rounded-full bg-[#f4624c]" />
              </div>
            </div>
            <span className="text-xl font-black tracking-tight">LoopTalk</span>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <p className="rounded-full border border-[#151515]/10 bg-white/70 px-4 py-2 text-xs font-bold text-[#287d70] shadow-sm backdrop-blur sm:text-sm">
              <Users
                aria-hidden="true"
                className="mr-2 inline-block size-4 align-[-3px]"
                strokeWidth={2.3}
              />
              {onlineCountText}
            </p>
            <nav
              aria-label="Helpful pages"
              className="flex items-center gap-4 text-sm font-bold text-[#505050]"
            >
              <Link
                className="inline-flex items-center gap-1.5 transition hover:text-[#151515]"
                href="/safety"
              >
                <Shield aria-hidden="true" className="size-4" />
                Safety
              </Link>
              <Link
                className="inline-flex items-center gap-1.5 transition hover:text-[#151515]"
                href="/privacy"
              >
                <Lock aria-hidden="true" className="size-4" />
                Privacy
              </Link>
            </nav>
          </div>
        </header>

        <div className="grid flex-1 items-center gap-12 py-14 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.78fr)] lg:py-8">
          <div className="max-w-3xl">
            <p className="mb-5 inline-flex rounded-full border border-[#151515]/10 bg-white/70 px-4 py-2 text-sm font-semibold text-[#287d70] shadow-sm backdrop-blur">
              Random voice chats, one person at a time
            </p>

            <h1 className="max-w-4xl text-5xl font-black leading-[0.95] tracking-tight text-balance sm:text-6xl lg:text-7xl">
              Talk to random people through voice.
            </h1>

            <p className="mt-6 max-w-2xl text-lg leading-8 text-[#505050] sm:text-xl">
              LoopTalk is a simple place for spontaneous one-to-one voice
              conversations with someone new, without profiles, feeds, or
              endless setup.
            </p>

            <div className="mt-6 grid max-w-2xl gap-2 text-sm font-semibold leading-6 text-[#5f5b55]">
              <p className="flex items-start gap-2">
                <Headphones
                  aria-hidden="true"
                  className="mt-1 size-4 shrink-0 text-[#287d70]"
                />
                <span>For best voice quality, use earphones.</span>
              </p>
              <p>Speaker mode may cause echo or unclear voice.</p>
              {microphoneStatus === "idle" && (
                <p className="flex items-start gap-2 text-[#287d70]">
                  <Shield
                    aria-hidden="true"
                    className="mt-1 size-4 shrink-0"
                  />
                  <span>
                    Be respectful. Do not share personal information. You can
                    leave anytime.
                  </span>
                </p>
              )}
            </div>

            {microphoneStatus === "searching" ? (
              <div
                role="status"
                className="mt-9 inline-flex w-full flex-col gap-4 rounded-3xl border border-[#151515]/10 bg-white/72 p-5 shadow-sm backdrop-blur sm:w-auto sm:min-w-96"
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg font-bold text-[#151515]">
                    Looking for someone...
                  </span>
                  <span
                    aria-hidden="true"
                    className="flex items-center gap-1.5"
                  >
                    {[0, 1, 2].map((dot) => (
                      <span
                        key={dot}
                        className="size-2 rounded-full bg-[#2fd6b5] motion-safe:animate-bounce"
                        style={{ animationDelay: `${dot * 120}ms` }}
                      />
                    ))}
                  </span>
                </div>
                <p className="text-sm font-semibold text-[#505050]">
                  Waiting for another person to join
                </p>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={handleCancelSearch}
                    className="inline-flex w-full items-center justify-center rounded-full border border-[#151515]/15 bg-white px-5 py-3 text-sm font-bold text-[#151515] transition hover:-translate-y-0.5 hover:border-[#151515]/30 focus:outline-none focus:ring-4 focus:ring-[#2fd6b5]/25 sm:w-auto"
                  >
                    Cancel Search
                  </button>
                </div>
              </div>
            ) : microphoneStatus === "connected" ? (
              <div
                role="status"
                className="mt-9 inline-flex w-full flex-col gap-5 rounded-3xl border border-[#151515]/10 bg-white/72 p-5 shadow-sm backdrop-blur sm:w-auto sm:min-w-96"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-lg font-bold text-[#151515]">
                      Connected with a stranger
                    </p>
                    <p className="mt-1 text-sm font-semibold text-[#505050]">
                      {isMuted ? "Microphone muted" : "Voice is live"}
                    </p>
                    <p className="mt-2 break-all text-xs font-semibold text-[#8a6259]">
                      {matchInfo
                        ? `Room ${matchInfo.roomId} | Peer ${matchInfo.peerId} | Initiator: ${
                            matchInfo.isInitiator ? "yes" : "no"
                          }`
                        : "Matched with stranger"}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-[#8a6259]">
                      WebRTC: {webRtcConnectionState}
                    </p>
                    <div className="mt-3 grid gap-1 text-xs font-semibold leading-5 text-[#5f5b55]">
                      <p className="flex items-start gap-2">
                        <Headphones
                          aria-hidden="true"
                          className="mt-0.5 size-3.5 shrink-0 text-[#287d70]"
                        />
                        <span>{audioQualityNotes[0]}</span>
                      </p>
                      <p>{audioQualityNotes[1]}</p>
                    </div>
                  </div>
                  <div
                    aria-hidden="true"
                    className="flex h-10 items-center gap-1.5"
                  >
                    {[28, 18, 34, 24, 38].map((height, index) => (
                      <span
                        key={`${height}-${index}`}
                        className="w-2 rounded-full bg-[#2fd6b5] motion-safe:animate-pulse even:bg-[#f4624c]"
                        style={{
                          animationDelay: `${index * 110}ms`,
                          height,
                        }}
                      />
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={handleToggleMute}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-[#151515]/15 bg-white px-5 py-3 text-sm font-bold text-[#151515] transition hover:-translate-y-0.5 hover:border-[#151515]/30 focus:outline-none focus:ring-4 focus:ring-[#2fd6b5]/25 sm:w-auto"
                  >
                    {isMuted ? (
                      <Mic aria-hidden="true" className="size-4" />
                    ) : (
                      <MicOff aria-hidden="true" className="size-4" />
                    )}
                    {isMuted ? "Unmute" : "Mute"}
                  </button>
                  <button
                    type="button"
                    onClick={handleNextPerson}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-[#151515]/15 bg-white px-5 py-3 text-sm font-bold text-[#151515] transition hover:-translate-y-0.5 hover:border-[#151515]/30 focus:outline-none focus:ring-4 focus:ring-[#2fd6b5]/25 sm:w-auto"
                  >
                    <Shuffle aria-hidden="true" className="size-4" />
                    Next Person
                  </button>
                  <button
                    type="button"
                    onClick={handleEndCall}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-[#f4624c]/25 bg-[#f4624c] px-5 py-3 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-[#d94d3b] focus:outline-none focus:ring-4 focus:ring-[#f4624c]/20 sm:w-auto"
                  >
                    <PhoneOff aria-hidden="true" className="size-4" />
                    End Call
                  </button>
                  <button
                    type="button"
                    onClick={handleReport}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-[#151515]/15 bg-white px-5 py-3 text-sm font-bold text-[#8a3d33] transition hover:-translate-y-0.5 hover:border-[#f4624c]/35 focus:outline-none focus:ring-4 focus:ring-[#f4624c]/20 sm:w-auto"
                  >
                    <Flag aria-hidden="true" className="size-4" />
                    Report
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-9 flex flex-col gap-4 sm:flex-row sm:items-center">
                <button
                  type="button"
                  disabled={isStarting}
                  onClick={handleStartTalking}
                  className="group inline-flex w-full items-center justify-center gap-3 rounded-full bg-[#151515] px-8 py-4 text-lg font-bold text-white shadow-[0_18px_40px_rgba(21,21,21,0.24)] transition hover:-translate-y-0.5 hover:bg-[#252525] focus:outline-none focus:ring-4 focus:ring-[#2fd6b5]/35 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0 sm:w-auto"
                >
                  <Mic aria-hidden="true" className="size-5" />
                  Start Talking
                </button>
              </div>
            )}

            {microphoneStatus === "denied" && (
              <p
                role="status"
                className="mt-4 text-sm font-semibold text-[#287d70]"
              >
                Microphone access is required to start talking.
              </p>
            )}

            {socketMessage && (
              <p
                role={socketStatus === "error" ? "alert" : "status"}
                className={`mt-4 text-sm font-semibold ${
                  socketStatus === "error"
                    ? "text-[#d94d3b]"
                    : "text-[#287d70]"
                }`}
              >
                {socketMessage}
              </p>
            )}

            <div className="mt-10 grid gap-3 sm:grid-cols-3">
              {highlights.map((highlight) => (
                <div
                  key={highlight}
                  className="flex items-center gap-3 rounded-lg border border-[#151515]/10 bg-white/72 px-4 py-3 shadow-sm backdrop-blur"
                >
                  <span
                    aria-hidden="true"
                    className="size-2.5 rounded-full bg-[#f4624c] ring-4 ring-[#f4624c]/15"
                  />
                  <span className="text-sm font-bold text-[#242424]">
                    {highlight}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="relative mx-auto flex aspect-square w-full max-w-115 items-center justify-center rounded-4xl border border-[#151515]/10 bg-white/62 p-6 shadow-[0_30px_80px_rgba(21,21,21,0.12)] backdrop-blur">
            <div
              aria-hidden="true"
              className="absolute inset-6 rounded-3xl border border-dashed border-[#151515]/15"
            />
            <div className="relative flex size-52 items-center justify-center rounded-full bg-[#151515] shadow-[0_30px_70px_rgba(21,21,21,0.28)] sm:size-64">
              <div className="absolute size-[132%] rounded-full border border-[#2fd6b5]/45" />
              <div className="absolute size-[162%] rounded-full border border-[#f4624c]/30" />
              <div className="flex h-28 items-end gap-2 sm:h-32">
                {[34, 62, 92, 118, 78, 48, 86, 56].map((height, index) => (
                  <span
                    aria-hidden="true"
                    key={`${height}-${index}`}
                    className="w-3 rounded-full bg-[#fff6e5] odd:bg-[#2fd6b5] even:bg-[#f4624c] sm:w-4"
                    style={{ height }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        <footer className="pb-2 text-center text-sm leading-6 text-[#5f5b55]">
          Please keep conversations respectful. Leave any chat that feels
          uncomfortable or unsafe.{" "}
          <Link
            className="inline-flex items-center gap-1 font-bold text-[#287d70]"
            href="/safety"
          >
            <Shield aria-hidden="true" className="size-3.5" />
            Safety
          </Link>{" "}
          |{" "}
          <Link
            className="inline-flex items-center gap-1 font-bold text-[#287d70]"
            href="/privacy"
          >
            <Lock aria-hidden="true" className="size-3.5" />
            Privacy
          </Link>
        </footer>
      </section>
    </main>
  );
}
