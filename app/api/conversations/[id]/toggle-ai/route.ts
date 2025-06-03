import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { aiEnabled } = await request.json()
    const conversationId = params.id

    if (!conversationId) {
      return NextResponse.json(
        { error: "ID de conversación no proporcionado" },
        { status: 400 }
      )
    }

    // Actualizar el estado de IA en la conversación
    const updatedConversation = await prisma.conversation.update({
      where: { id: conversationId },
      data: { aiEnabled }
    })

    return NextResponse.json({ 
      success: true, 
      conversation: updatedConversation 
    })
  } catch (error) {
    console.error("Error al actualizar el estado de IA:", error)
    return NextResponse.json(
      { error: "Error al actualizar el estado de IA" },
      { status: 500 }
    )
  }
} 