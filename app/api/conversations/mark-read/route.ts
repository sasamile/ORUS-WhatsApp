import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function POST(request: Request) {
  try {
    const { conversationId } = await request.json()

    if (!conversationId) {
      return NextResponse.json({ error: "ID de conversación requerido" }, { status: 400 })
    }

    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        unreadCount: 0,
        lastRead: new Date()
      }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error marcando conversación como leída:", error)
    return NextResponse.json(
      { error: "Error al marcar la conversación como leída" },
      { status: 500 }
    )
  }
} 