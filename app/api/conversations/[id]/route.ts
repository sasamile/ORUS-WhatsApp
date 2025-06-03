import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    console.log("Obteniendo conversación con ID:", params.id)

    if (!params.id) {
      return NextResponse.json(
        { error: "ID de conversación no proporcionado" },
        { status: 400 }
      )
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id: params.id },
      include: {
        company: true
      }
    })

    if (!conversation) {
      console.log("Conversación no encontrada para ID:", params.id)
      return NextResponse.json(
        { error: "Conversación no encontrada" },
        { status: 404 }
      )
    }

    // Ordenar mensajes por timestamp si existen
    if (conversation.messages) {
      const messages = Array.isArray(conversation.messages) ? conversation.messages : []
      conversation.messages = messages.sort((a: any, b: any) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      )
    }

    console.log("Conversación encontrada:", conversation.id)
    return NextResponse.json({ conversation })
  } catch (error) {
    console.error("Error detallado obteniendo conversación:", error)
    return NextResponse.json(
      { 
        error: "Error interno del servidor",
        details: error instanceof Error ? error.message : "Error desconocido"
      },
      { status: 500 }
    )
  }
} 