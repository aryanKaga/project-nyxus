import ChatHeader from "./chat/ChatHeader";
import ChatInput from "./chat/ChatInput";
import ChatStatus from "./chat/ChatStatus";
import MessageList from "./chat/MessageList";
import RequestFlow from "./chat/RequestFlow";
import { useNyxusChat } from "./chat/useNyxusChat";
import "./NyxusChat.css";

export default function NyxusChat({ onOpenSettings }) {
  const chat = useNyxusChat();

  return (
    <main className="nyxus-root">
      <ChatHeader
        connectionStatus={chat.connectionStatus}
        onOpenSettings={onOpenSettings}
      />
      <RequestFlow events={chat.flowEvents} />
      <ChatStatus
        connectionMessage={chat.connectionMessage}
        workspaceSyncStatus={chat.workspaceSyncStatus}
      />
      <MessageList
        isStreaming={chat.isStreaming}
        isReadmeStreaming={chat.isReadmeStreaming}
        messages={chat.messages}
        messagesEndRef={chat.messagesEndRef}
        onOpenAnswer={chat.openReadmeAnswer}
        streamingText={chat.streamingText}
      />
      <ChatInput
        disabled={chat.isStreaming}
        onSend={chat.sendMessage}
        readmeMode={chat.readmeMode}
        onReadmeModeChange={chat.setReadmeMode}
      />
    </main>
  );
}
