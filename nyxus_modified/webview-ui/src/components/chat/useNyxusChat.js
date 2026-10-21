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
  const [workspaceSyncStatus, setWorkspaceSyncStatus] = useState("Waiting to start.");
  const [flowEvents, setFlowEvents] = useState([]);
  const [readmeMode, setReadmeMode] = useState(() => {
    const cached = typeof vscode.getState === "function" ? vscode.getState() : undefined;
    return cached?.readmeMode !== undefined ? cached.readmeMode : true;
  });
  const [agentTrace, setAgentTrace] = useState([]);

  const streamingTextRef = useRef("");
  const isStreamingRef = useRef(false);
  const pendingReadmeRef = useRef(true);
  const stallTimerRef = useRef(null);
  const messagesEndRef = useRef(null);

  const clearStallTimer = useCallback(() => {
    if (stallTimerRef.current !== null) {
      clearTimeout(stallTimerRef.current);
      stallTimerRef.current = null;
    }
  }, []);

  const finishStream = useCallback((message, format) => {
    clearStallTimer();
    setMessages((current) => [
      ...current,
      { role: "assistant", text: message, ...(format ? { format } : {}) },
    ]);
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
          : "**Error:** no response received. Please try again.",
        pendingReadmeRef.current ? "readme" : undefined
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
        case "workspace_sync_status":
          setWorkspaceSyncStatus(message.text ?? "Git workspace sync status unavailable.");
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
          setAgentTrace([]);
          armStallTimer();
          break;
        case "assistant_progress":
          if (isStreamingRef.current) {
            armStallTimer();
          }
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
        case "readme_answer": {
          // If readme_answer arrives, store or ensure markdown is present
          if (typeof message.markdown === "string" && message.markdown) {
            streamingTextRef.current = message.markdown;
            setStreamingText(message.markdown);
          }
          pendingReadmeRef.current = true;
          break;
        }
        case "assistant_end":
          finishStream(
            streamingTextRef.current,
            pendingReadmeRef.current ? "readme" : undefined
          );
          pendingReadmeRef.current = false;
          break;
        case "assistant_error": {
          const detail = typeof message.error === "string" ? message.error : "Unknown error";
          const partial = streamingTextRef.current;
          finishStream(
            partial ? `${partial}\n\n**Error:** ${detail}` : `**Error:** ${detail}`
          );
          break;
        }
        case "agent_trace": {
          if (Array.isArray(message.trace)) {
            setAgentTrace(message.trace);
          }
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

  useEffect(() => {
    if (typeof vscode.setState !== "function") {
      return;
    }
    try {
      vscode.setState({
        readmeMode,
      });
    } catch {
      // Ignore cache persistence errors
    }
  }, [readmeMode]);

  const sendMessage = useCallback((prompt, useReadmeMode = true) => {
    const text = prompt.trim();
    if (!text || isStreamingRef.current) {
      return false;
    }

    setMessages((current) => [...current, { role: "user", text }]);
    pendingReadmeRef.current = useReadmeMode !== false;
    streamingTextRef.current = "";
    setStreamingText("");
    vscode.postMessage({ type: "chat", prompt: text, readmeMode: useReadmeMode !== false });
    return true;
  }, []);

  const openReadmeAnswer = useCallback((markdown) => {
    vscode.postMessage({
      type: "open_readme_answer",
      markdown: typeof markdown === "string" ? markdown : undefined,
    });
  }, []);

  return {
    agentTrace,
    connectionMessage,
    connectionStatus,
    flowEvents,
    isReadmeStreaming: isStreaming && pendingReadmeRef.current,
    isStreaming,
    messages,
    messagesEndRef,
    openReadmeAnswer,
    readmeMode,
    sendMessage,
    setReadmeMode,
    streamingText,
    workspaceSyncStatus,
  };
}
