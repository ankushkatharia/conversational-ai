import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/server/current-user";
import {
  createConversation,
  listConversations,
} from "@/lib/server/conversations";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  return NextResponse.json({ conversations: listConversations(user.id) });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  let title = "New conversation";
  try {
    const body = (await req.json()) as { title?: string };
    if (body.title && body.title.trim()) title = body.title.trim();
  } catch {
    /* empty body is fine */
  }
  const conversation = createConversation(user.id, title);
  return NextResponse.json({ conversation }, { status: 201 });
}
