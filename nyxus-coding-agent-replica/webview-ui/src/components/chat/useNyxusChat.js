import { useCallback, useEffect, useRef, useState } from "react";
import { getVsCodeApi } from "./vscodeApi";

const STREAM_STALL_TIMEOUT_MS = 30000;
const vscode = getVsCodeApi();

export function useNyxusChat() {
  const [messages, setMessages] = useState([]);
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState("connecting");
  const [connectionMessage, setConnectionMessage] = useState("");
  const [workspaceIndexStatus, setWorkspaceIndexStatus] = useState("Waiting to start.");
  const [flowEvents, setFlowEvents] = useState([]);

  const streamingTextRef = useRef("");
  const isStreamingRef = useRef(false);
  const stallTimerRef = useRef(null);
  const messagesEndRef = useRef(null);

  const clearStallTimer = useCallback(() => {
    if (stallTimerRef.current !== null) {
      clearTimeout(stallTimerRef.current);
      stallTimerRef.current = null;
    }
  }, []);

  const finishStream = useCallback((message) => {
    clearStallTimer();
    setMessages((current) => [...current, { role: "assistant", text: message }]);
    streamingTextRef.current = "";
    setStreamingText("");
    isStreamingRef.current = false;
    setIsStreaming(false);
  }, [clearStallTimer]);

  const armStallTimer = useCallback(() => {
    clearStallTimer();
    stallTimerRef.current = setTimeout(() => {
      const partial = streamingTextRef.current;
      finishStream(
        partial
          ? `${partial}\n\n**Error:** response stalled and was cut off.`
          : "**Error:** no response received. Please try again."
      );
    }, STREAM_STALL_TIMEOUT_MS);
  }, [clearStallTimer, finishStream]);

  useEffect(() => {
    function handleMessage(event) {
      const message = event.data;
      if (!message || typeof message.type !== "string") {
        return;
      }

      switch (message.type) {
        case "connection_status":
          setConnectionStatus(message.status ?? "disconnected");
          setConnectionMessage(message.status === "connected" ? "" : message.text ?? "");
          break;
        case "workspace_index_status":
          setWorkspaceIndexStatus(message.text ?? "Workspace indexing status unavailable.");
          break;
        case "flow_event":
          setFlowEvents((events) => [
            { event: message.event, time: new Date().toLocaleTimeString() },
            ...events,
          ].slice(0, 12));
          break;
        case "initialization_error":
          setMessages((current) => [
            ...current,
            { role: "assistant", text: message.text ?? "Workspace initialization failed." },
          ]);
          break;
        case "assistant_start":
          streamingTextRef.current = "";
          setStreamingText("");
          isStreamingRef.current = true;
          setIsStreaming(true);
          armStallTimer();
          break;
        case "assistant_chunk": {
          const chunk = typeof message.text === "string" ? message.text : "";
          if (!chunk) {
            return;
          }
          streamingTextRef.current += chunk;
          setStreamingText(streamingTextRef.current);
          armStallTimer();
          break;
        }
        case "assistant_end":
          finishStream(streamingTextRef.current);
          break;
        case "assistant_error": {
          const detail = typeof message.error === "string" ? message.error : "Unknown error";
          const partial = streamingTextRef.current;
          finishStream(partial ? `${partial}\n\n**Error:** ${detail}` : `**Error:** ${detail}`);
          break;
        }
        case "response":
          clearStallTimer();
          setMessages((current) => [
            ...current,
            { role: "assistant", text: typeof message.text === "string" ? message.text : "" },
          ]);
          isStreamingRef.current = false;
          setIsStreaming(false);
          break;
        default:
          break;
      }
    }

    window.addEventListener("message", handleMessage);
    vscode.postMessage({ type: "webview_ready" });
    return () => {
      window.removeEventListener("message", handleMessage);
      clearStallTimer();
    };
  }, [armStallTimer, clearStallTimer, finishStream]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText]);

  const sendMessage = useCallback((prompt) => {
    const text = prompt.trim();
    if (!text || isStreamingRef.current) {
      return false;
    }

    setMessages((current) => [...current, { role: "user", text }]);
    streamingTextRef.current = "";
    setStreamingText("");
    vscode.postMessage({ type: "chat", prompt: text });
    return true;
  }, []);

  return {
    connectionMessage,
    connectionStatus,
    flowEvents,
    isStreaming,
    messages,
    messagesEndRef,
    sendMessage,
    streamingText,
    workspaceIndexStatus,
  };
}
