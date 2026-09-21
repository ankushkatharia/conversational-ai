import { Suspense } from "react";

import { ChatShell } from "@/components/chat/ChatShell";

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="h-[calc(100vh-4rem)]" aria-hidden="true" />}>
      <ChatShell />
    </Suspense>
  );
}
