import { useCallback, useEffect, useRef, useState } from "react";
import { getVsCodeApi } from "./vscodeApi";

const STREAM_STALL_TIMEOUT_MS = 30000;
const vscode = getVsCodeApi();

function validMessages(messages) {
  if (!Array.isArray(messages)) {
    return [];
  }
  return messages.filter((message) => (
    message
    && (message.role === "user" || message.role === "assistant")
    && typeof message.text === "string"
  ));
}

export function useNyxusChat() {
  const [messages, setMessages] = useState(() => {
    const cached = typeof vscode.getState === "function" ? vscode.getState() : undefined;
    return cached?.messages ? validMessages(cached.messages) : [];
  });
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState("connecting");
  const [connectionMessage, setConnectionMessage] = useState("");
  const [workspaceIndexStatus, setWorkspaceIndexStatus] = useState("Waiting to start.");
  const [flowEvents, setFlowEvents] = useState([]);
  const [readmeMode, setReadmeMode] = useState(() => {
    const cached = typeof vscode.getState === "function" ? vscode.getState() : undefined;
    return cached?.readmeMode !== undefined ? cached.readmeMode : true;
  });
  const [agentTrace, setAgentTrace] = useState([]);

  const cachedStateRef = useRef(
    typeof vscode.getState === "function" ? vscode.getState() : undefined
  );
  const workspaceRootRef = useRef(null);
  const serverHistoryReceivedRef = useRef(false);
  const streamingTextRef = useRef("");
  const isStreamingRef = useRef(false);
  const stallTimerRef = useRef(null);
  const messagesEndRef = useRef(null);
  const pendingReadmeRef = useRef(false);

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
        case "conversation_scope": {
          const workspaceRoot = typeof message.workspaceRoot === "string"
            ? message.workspaceRoot
            : null;
          if (workspaceRootRef.current !== null && workspaceRoot !== null && workspaceRootRef.current !== workspaceRoot) {
            serverHistoryReceivedRef.current = false;
            setMessages([]);
          }
          workspaceRootRef.current = workspaceRoot;
          const cachedState = cachedStateRef.current;
          const cachedMessages = validMessages(cachedState?.messages);
          if (cachedState?.readmeMode !== undefined) {
            setReadmeMode(cachedState.readmeMode);
          }
          if (!serverHistoryReceivedRef.current && cachedMessages.length > 0) {
            const interruptedResponse = cachedState?.isStreaming
              && typeof cachedState.streamingText === "string"
              && cachedState.streamingText
              ? [{
                role: "assistant",
                text: `${cachedState.streamingText}\n\n**Response interrupted when the chat view was reloaded.**`,
                format: "readme",
              }]
              : [];
            setMessages([...cachedMessages, ...interruptedResponse]);
          }
          break;
        }
        case "connection_status":
          setConnectionStatus(message.status ?? "disconnected");
          setConnectionMessage(message.status === "connected" ? "" : message.text ?? "");
          break;
        case "workspace_index_status":
          setWorkspaceIndexStatus(message.text ?? "Workspace indexing status unavailable.");
          break;
        case "conversation_history":
          if (Array.isArray(message.messages) && message.messages.length > 0) {
            serverHistoryReceivedRef.current = true;
            const history = validMessages(message.messages.map((item) => {
              const role = item.role;
              const text = typeof item.text === "string"
                ? item.text
                : (typeof item.content === "string" ? item.content : "");
              const format = item.format || (role === "assistant" ? "readme" : undefined);
              return {
                role,
                text,
                ...(format ? { format } : {}),
              };
            }));
            if (history.length > 0) {
              setMessages(history);
            }
          }
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
          finishStream(partial ? `${partial}\n\n**Error:** ${detail}` : `**Error:** ${detail}`);
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
    const workspaceRoot = workspaceRootRef.current;
    if (typeof vscode.setState !== "function") {
      return undefined;
    }

    const timeout = setTimeout(() => {
      try {
        vscode.setState({
          version: 1,
          workspaceRoot,
          messages,
          streamingText,
          isStreaming,
          readmeMode,
        });
        vscode.postMessage({
          type: "persist_messages",
          messages,
        });
      } catch (error) {
        console.warn("Could not persist the Nyxus conversation in webview state.", error);
      }
    }, 150);
    return () => clearTimeout(timeout);
  }, [isStreaming, messages, readmeMode, streamingText]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText]);

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
    workspaceIndexStatus,
  };
}
