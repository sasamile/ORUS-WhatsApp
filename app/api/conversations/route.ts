import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const companyId = searchParams.get("companyId")

    if (!companyId) {
      return NextResponse.json(
        { error: "Se requiere el ID de la compañía" },
        { status: 400 }
      )
      }

    console.log(`Buscando conversaciones para companyId: ${companyId}`)

    // Primero verificar si la compañía existe
    const company = await prisma.company.findUnique({
      where: { id: companyId }
    })

    if (!company) {
      console.error(`No se encontró la compañía con ID: ${companyId}`)
      return NextResponse.json(
        { error: "Compañía no encontrada" },
        { status: 404 }
      )
    }

    // Obtener las conversaciones con información adicional
    const conversations = await prisma.conversation.findMany({
      where: {
        companyId: company.id,
        status: "ACTIVE"
      },
      orderBy: {
        lastUpdated: "desc"
      },
      select: {
        id: true,
        senderPhone: true,
        senderName: true,
        senderImage: true,
        companyPhone: true,
        messages: true,
        lastUpdated: true,
        aiEnabled: true,
        unreadCount: true,
        contactInfo: true,
        status: true
      }
    })

    console.log(`Encontradas ${conversations.length} conversaciones para ${companyId}`)

    // Verificar y limpiar los mensajes de cada conversación
    const cleanedConversations = conversations.map(conv => ({
      ...conv,
      messages: Array.isArray(conv.messages) ? conv.messages : [],
      lastUpdated: conv.lastUpdated.toISOString(),
      contactInfo: conv.contactInfo || {}
    }))

    return NextResponse.json(cleanedConversations)
  } catch (error) {
    console.error("Error obteniendo conversaciones:", error)
    return NextResponse.json(
      { error: "Error al obtener las conversaciones" },
      { status: 500 }
    )
  }
}
