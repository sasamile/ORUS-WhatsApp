import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function POST(request: NextRequest) {
  try {
    const { conversationId } = await request.json()

    if (!conversationId) {
      return NextResponse.json({ error: "Conversation ID is required" }, { status: 400 })
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
    })

    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 })
    }

    const updatedConversation = await prisma.conversation.update({
      where: { id: conversationId },
      data: { aiEnabled: !conversation.aiEnabled },
    })

    return NextResponse.json(updatedConversation)
  } catch (error) {
    console.error("Error toggling AI:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
