export default function ConversationsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Conversations</h2>
        <p className="text-muted-foreground">View chat history from your website visitors.</p>
      </div>
      <div className="flex h-100 items-center justify-center rounded-lg border border-dashed text-center">
        <div className="max-w-100 space-y-2">
          <h3 className="text-lg font-semibold">No conversations found</h3>
          <p className="text-sm text-muted-foreground">
            When someone chats with your bot, their conversation history will appear here.
          </p>
        </div>
      </div>
    </div>
  );
}
