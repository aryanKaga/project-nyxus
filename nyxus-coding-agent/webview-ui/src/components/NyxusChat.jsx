import { useState, useEffect, useRef, useCallback } from "react";

import {
  NyxusIcon,
  SendIcon,
  TypingDots,
} from "./NyxusIcons";

import "./NyxusChat.css";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeRaw from "rehype-raw";
import rehypeKatex from "rehype-katex";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import "katex/dist/katex.min.css";


/* =========================================================
   MARKDOWN SANITIZATION
   ========================================================= */

/*
 * IMPORTANT: rehypeKatex must run BEFORE rehypeSanitize in the
 * plugin list below, and this schema must whitelist KaTeX's
 * generated tags/attrs — otherwise sanitize strips the math
 * markup right back out after katex renders it.
 */
const markdownSanitizeSchema = {
  ...defaultSchema,

  attributes: {
    ...defaultSchema.attributes,

    code: [
      ...(defaultSchema.attributes?.code || []),
      "className",
    ],

    span: [
      ...(defaultSchema.attributes?.span || []),
      "className",
      "style",
    ],

    div: [
      ...(defaultSchema.attributes?.div || []),
      "className",
      "style",
    ],

    "*": [
      ...(defaultSchema.attributes?.["*"] || []),
      "className",
    ],
  },

  tagNames: [
    ...(defaultSchema.tagNames || []),
    "math",
    "semantics",
    "mrow",
    "mi",
    "mo",
    "mn",
    "msup",
    "msub",
    "msubsup",
    "mfrac",
    "msqrt",
    "mroot",
    "mtable",
    "mtr",
    "mtd",
    "mspace",
    "mtext",
    "mstyle",
    "annotation",
  ],
};


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
   MARKDOWN COMPONENT
   ========================================================= */

/*
 * IMPORTANT:
 *
 * This component should only be used for COMPLETED
 * assistant messages.
 *
 * We intentionally do NOT use ReactMarkdown while the
 * response is streaming (see the streaming bubble below) —
 * partial markdown/LaTeX syntax can be split across chunks
 * and renders incorrectly mid-stream.
 */
function MarkdownMessage({ content }) {

  return (
    <div className="nyxus-markdown">

      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[
          rehypeRaw,
          rehypeKatex,
          [rehypeSanitize, markdownSanitizeSchema],
        ]}
      >
        {content}
      </ReactMarkdown>

    </div>
  );
}


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
     WELCOME
     ======================================================= */

  const showWelcome =
    messages.length === 0 &&
    !isStreaming;


  /* =======================================================
     RENDER
     ======================================================= */

  return (

    <div className="nyxus-root">


      {/* =================================================
          HEADER
      ================================================= */}

      <div className="nyxus-header">

        <NyxusIcon size={24} />

        <span className="nyxus-header-title">
          Nyxus
        </span>

        <span className="nyxus-status-dot" />

      </div>


      {/* =================================================
          MESSAGES
      ================================================= */}

      <div className="nyxus-messages">


        {/* =================================================
            WELCOME
        ================================================= */}

        {showWelcome && (

          <div className="nyxus-welcome">

            <div
              style={{
                color:
                  "var(--nyxus-accent)",
              }}
            >

              <NyxusIcon size={56} />

            </div>


            <div className="nyxus-welcome-text">

              Hello! I am Nyxus.

              <br />

              How can I help you today?

            </div>


            <div className="nyxus-welcome-sub">

              // ready to assist

            </div>

          </div>

        )}


        {/* =================================================
            COMPLETED MESSAGES
        ================================================= */}

        {messages.map((msg, index) => (

          <div
            key={index}
            className={`nyxus-msg ${msg.role}`}
          >


            {/* Avatar */}

            <div className="nyxus-msg-avatar">

              {msg.role === "assistant"
                ? <NyxusIcon size={14} />
                : "U"
              }

            </div>


            {/* Message */}

            <div className="nyxus-msg-bubble">


              {msg.role === "assistant" ? (

                <MarkdownMessage
                  content={msg.text}
                />

              ) : (

                msg.text

              )}


            </div>

          </div>

        ))}


        {/* =================================================
            CURRENT STREAMING MESSAGE
        ================================================= */}

        {isStreaming && (

          <div className="nyxus-msg assistant">


            {/* Avatar */}

            <div className="nyxus-msg-avatar">

              <NyxusIcon size={14} />

            </div>


            {/* Streaming bubble */}

            <div className="nyxus-streaming-bubble">


              {!streamingText ? (

                <TypingDots />

              ) : (

                /*
                 * IMPORTANT:
                 *
                 * DO NOT use ReactMarkdown here.
                 *
                 * Markdown/LaTeX may be incomplete because
                 * responses can split syntax across chunks.
                 */
                <div className="nyxus-streaming-text">

                  {streamingText}

                  <span className="nyxus-cursor" />

                </div>

              )}

            </div>


          </div>

        )}


        {/* =================================================
            SCROLL TARGET
        ================================================= */}

        <div ref={messagesEndRef} />


      </div>


      {/* =================================================
          INPUT
      ================================================= */}

      <div className="nyxus-input-area">

        <div className="nyxus-input-wrapper">


          <textarea
            ref={textareaRef}

            className="nyxus-textarea"

            placeholder="Ask Nyxus anything..."

            rows={1}

            value={input}

            onChange={handleInputChange}

            onKeyDown={handleKeyDown}

            disabled={isStreaming}
          />


          <button
            className="nyxus-send-btn"

            onClick={handleSend}

            disabled={
              !input.trim() ||
              isStreaming
            }
          >

            <SendIcon />

          </button>


        </div>

      </div>


    </div>

  );
}