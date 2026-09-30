import { useState, useEffect, useRef, useCallback } from "react";

import "./NyxusChat.css";
import ChatComposer from "./ChatComposer";
import ChatHeader from "./ChatHeader";
import MessageList from "./MessageList";

/* =========================================================
   STREAM CONFIG
   ========================================================= */

const STREAM_STALL_TIMEOUT_MS = 30000;


/* =========================================================
   VS CODE API
   ========================================================= */

function acquireVsCodeApiSafe() {

  // SSR safety
  if (typeof window === "undefined") {
    return {
      postMessage(message) {
        console.log("[Mock VSCode] postMessage:", message);
      },
    };
  }


  // Already acquired
  if (window.__nyxusVscodeApi) {
    return window.__nyxusVscodeApi;
  }


  // Running inside VS Code Webview
  if (typeof window.acquireVsCodeApi === "function") {

    const api = window.acquireVsCodeApi();

    window.__nyxusVscodeApi = api;

    return api;
  }


  // Normal browser development
  const mockApi = {

    postMessage(message) {

      console.log(
        "[Mock VSCode] postMessage:",
        message
      );

    },

  };


  window.__nyxusVscodeApi = mockApi;

  return mockApi;
}


const vscode = acquireVsCodeApiSafe();


/* =========================================================
   MAIN CHAT
   ========================================================= */

export default function NyxusChat() {


  /* =======================================================
     STATE
     ======================================================= */

  const [messages, setMessages] = useState([]);

  const [input, setInput] = useState("");

  const [isStreaming, setIsStreaming] = useState(false);

  const [streamingText, setStreamingText] = useState("");

  const [connectionStatus, setConnectionStatus] = useState("connecting");

  const [connectionError, setConnectionError] = useState("");


  /* =======================================================
     REFS
     ======================================================= */

  /*
   * This is the authoritative streaming response.
   *
   * DO NOT rely on React state inside assistant_end.
   */
  const streamingTextRef = useRef("");


  /*
   * Stall timeout.
   */
  const stallTimerRef = useRef(null);


  /*
   * Textarea.
   */
  const textareaRef = useRef(null);


  /*
   * Scroll target.
   */
  const messagesEndRef = useRef(null);


  /* =======================================================
     SCROLL
     ======================================================= */

  const scrollToBottom = useCallback(() => {

    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });

  }, []);


  useEffect(() => {

    scrollToBottom();

  }, [
    messages,
    streamingText,
    scrollToBottom,
  ]);


  /* =======================================================
     CLEAR STALL TIMER
     ======================================================= */

  const clearStallTimer = useCallback(() => {

    if (stallTimerRef.current !== null) {

      clearTimeout(
        stallTimerRef.current
      );

      stallTimerRef.current = null;
    }

  }, []);


  /* =======================================================
     STREAM STALL TIMER
     ======================================================= */

  const armStallTimer = useCallback(() => {

    clearStallTimer();


    stallTimerRef.current = setTimeout(() => {

      console.error(
        "[React] Stream stalled"
      );


      const partialResponse =
        streamingTextRef.current;


      const errorText =
        partialResponse
          ? `${partialResponse}\n\n**Error:** response stalled and was cut off.`
          : "**Error:** no response received. Please try again.";


      setMessages((prev) => [
        ...prev,

        {
          role: "assistant",
          text: errorText,
        },

      ]);


      streamingTextRef.current = "";

      setStreamingText("");

      setIsStreaming(false);

      stallTimerRef.current = null;


    }, STREAM_STALL_TIMEOUT_MS);

  }, [
    clearStallTimer,
  ]);


  /* =======================================================
     RECEIVE MESSAGES FROM VS CODE
     ======================================================= */

  useEffect(() => {


    function handleMessage(event) {

      const msg = event.data;


      if (!msg || !msg.type) {
        return;
      }

      if (msg.type === "server_status") {
        const validStatuses = [
          "connected",
          "connecting",
          "disconnected",
          "error",
        ];
        const status = validStatuses.includes(msg.status)
          ? msg.status
          : "disconnected";
        setConnectionStatus(status);
        setConnectionError(status === "error" ? msg.error ?? "" : "");
        return;
      }


      console.log(
        "[React] Received:",
        msg.type,
        msg
      );


      /* ===================================================
         ASSISTANT START
         =================================================== */

      if (msg.type === "assistant_start") {

        console.log(
          "[React] Assistant stream started"
        );


        /*
         * Reset previous stream.
         */
        streamingTextRef.current = "";


        setStreamingText("");


        setIsStreaming(true);


        /*
         * Start watchdog.
         */
        armStallTimer();


        return;
      }


      /* ===================================================
         ASSISTANT CHUNK
         =================================================== */

      if (msg.type === "assistant_chunk") {


        /*
         * IMPORTANT:
         *
         * Backend must send:
         *
         * {
         *   type: "assistant_chunk",
         *   text: "hello"
         * }
         *
         * NOT:
         *
         * {
         *   token: "hello"
         * }
         */
        const chunk = msg.text ?? "";


        if (!chunk) {

          console.warn(
            "[React] Empty assistant chunk"
          );

          return;
        }


        console.log(
          "[React] Chunk:",
          JSON.stringify(chunk)
        );


        /*
         * Append to authoritative buffer.
         */
        streamingTextRef.current += chunk;


        /*
         * Update React state so UI renders
         * incrementally.
         */
        setStreamingText(
          streamingTextRef.current
        );


        /*
         * Reset watchdog because we received
         * data.
         */
        armStallTimer();


        return;
      }


      /* ===================================================
         ASSISTANT END
         =================================================== */

      if (msg.type === "assistant_end") {


        console.log(
          "[React] Assistant stream ended"
        );


        clearStallTimer();


        /*
         * Get complete response from REF.
         */
        const finalText =
          streamingTextRef.current;


        console.log(
          "[React] Final response length:",
          finalText.length
        );

        console.log(
          "[React] Final response (JSON):",
          JSON.stringify(finalText)
        );


        /*
         * Move stream into permanent messages.
         */
        setMessages((prev) => [

          ...prev,

          {
            role: "assistant",
            text: finalText,
          },

        ]);


        /*
         * Reset stream.
         */
        streamingTextRef.current = "";

        setStreamingText("");

        setIsStreaming(false);


        return;
      }


      /* ===================================================
         ASSISTANT ERROR
         =================================================== */

      if (msg.type === "assistant_error") {


        console.error(
          "[React] Assistant error:",
          msg.error
        );


        clearStallTimer();


        const partialResponse =
          streamingTextRef.current;


        const errorMessage =
          partialResponse
            ? `${partialResponse}\n\n**Error:** ${msg.error ?? "Unknown error"}`
            : `**Error:** ${msg.error ?? "Unknown error"}`;


        setMessages((prev) => [

          ...prev,

          {
            role: "assistant",
            text: errorMessage,
          },

        ]);


        streamingTextRef.current = "";

        setStreamingText("");

        setIsStreaming(false);


        return;
      }


      /* ===================================================
         NON-STREAMING RESPONSE
         =================================================== */

      if (msg.type === "response") {


        clearStallTimer();


        setMessages((prev) => [

          ...prev,

          {
            role: "assistant",
            text: msg.text ?? "",
          },

        ]);


        setIsStreaming(false);


        return;
      }

    }


    /*
     * Register listener.
     */
    window.addEventListener(
      "message",
      handleMessage
    );


    /*
     * Cleanup.
     */
    return () => {

      window.removeEventListener(
        "message",
        handleMessage
      );

      clearStallTimer();

    };


  }, [
    armStallTimer,
    clearStallTimer,
  ]);


  /* =======================================================
     INPUT CHANGE
     ======================================================= */

  function handleInputChange(e) {

    setInput(e.target.value);


    const textarea = e.target;


    textarea.style.height = "42px";


    textarea.style.height =
      Math.min(
        textarea.scrollHeight,
        120
      ) + "px";
  }


  /* =======================================================
     KEYBOARD
     ======================================================= */

  function handleKeyDown(e) {

    if (
      e.key === "Enter" &&
      !e.shiftKey &&
      !e.nativeEvent.isComposing
    ) {

      e.preventDefault();

      handleSend();
    }
  }

  function handleReconnect() {
    setConnectionStatus("connecting");
    vscode.postMessage({ type: "reconnect" });
  }


  /* =======================================================
     SEND MESSAGE
     ======================================================= */

  function handleSend() {

    const text = input.trim();


    /*
     * Don't send empty messages.
     */
    if (!text) {
      return;
    }


    /*
     * Don't send another request while
     * current response is streaming.
     */
    if (isStreaming) {
      return;
    }


    console.log(
      "[React] Sending:",
      text
    );


    /* ===================================================
       ADD USER MESSAGE
       =================================================== */

    setMessages((prev) => [

      ...prev,

      {
        role: "user",
        text,
      },

    ]);


    /* ===================================================
       RESET STREAM BUFFER
       =================================================== */

    streamingTextRef.current = "";

    setStreamingText("");


    /* ===================================================
       SEND TO VS CODE EXTENSION
       =================================================== */

    vscode.postMessage({

      type: "chat",

      prompt: text,

    });


    /* ===================================================
       CLEAR INPUT
       =================================================== */

    setInput("");


    if (textareaRef.current) {

      textareaRef.current.style.height =
        "42px";

    }

  }


  /* =======================================================
     RENDER
     ======================================================= */

  return (

    <div className="nyxus-root">
      <ChatHeader
        connectionError={connectionError}
        connectionStatus={connectionStatus}
        onReconnect={handleReconnect}
      />
      <MessageList
        isStreaming={isStreaming}
        messages={messages}
        messagesEndRef={messagesEndRef}
        onSuggestion={(suggestion) => {
          setInput(suggestion);
          textareaRef.current?.focus();
        }}
        streamingText={streamingText}
      />
      <ChatComposer
        input={input}
        isStreaming={isStreaming}
        onInputChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onSend={handleSend}
        textareaRef={textareaRef}
      />
    </div>

  );
}