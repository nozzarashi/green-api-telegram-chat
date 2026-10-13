import { useRef, useState } from 'react';
import { ConnectInstanceForm } from '@/features/connect-instance';
import type { ConnectedSession } from '@/features/connect-instance';
import { CreateChatForm } from '@/features/create-chat';
import { ChatWorkspace } from '@/widgets/chat-workspace';
import { useChatController } from '../model/use-chat-controller';

function ConnectedChat({ session, onLogout }: { session: ConnectedSession; onLogout: () => void }) {
  const [creatingChat, setCreatingChat] = useState(false);
  const composerInputRef = useRef<HTMLTextAreaElement>(null);
  const controller = useChatController(session.api);
  return (
    <>
      <ChatWorkspace
        chats={controller.state.chats}
        activeChatId={controller.state.activeChatId}
        connection={controller.connection}
        instanceId={session.instanceId}
        messenger={session.messenger}
        onSelectChat={controller.selectChat}
        onCloseChat={controller.closeChat}
        composerInputRef={composerInputRef}
        onNewChat={() => setCreatingChat(true)}
        onLogout={onLogout}
        onDraftChange={controller.changeDraft}
        onSend={controller.send}
        onRetry={controller.retry}
      />
      {creatingChat && (
        <CreateChatForm
          api={session.api}
          messenger={session.messenger}
          onClose={() => setCreatingChat(false)}
          getSuccessFocus={() => composerInputRef.current}
          onCreate={(chat) => {
            controller.createChat(chat);
            setCreatingChat(false);
          }}
        />
      )}
    </>
  );
}
export function ChatPage() {
  const [session, setSession] = useState<ConnectedSession | null>(null);
  return session ? (
    <ConnectedChat session={session} onLogout={() => setSession(null)} />
  ) : (
    <ConnectInstanceForm onConnect={setSession} />
  );
}
