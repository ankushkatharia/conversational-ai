import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/server/current-user";
import { deleteConversation, getConversation } from "@/lib/server/conversations";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const { id } = await params;
  const conversation = getConversation(user.id, id);
  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }
  return NextResponse.json({ conversation });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const { id } = await params;
  if (!deleteConversation(user.id, id)) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
