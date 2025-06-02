import { NextRequest, NextResponse } from "next/server"
import { whatsappService } from "@/lib/whatsapp"
import { prisma } from "@/lib/prisma"

export async function POST(request: NextRequest) {
  try {
    const { to, message, companyId } = await request.json()

    if (!to || !message) {
      return NextResponse.json(
        { error: "Número de teléfono y mensaje son requeridos" },
        { status: 400 }
      )
    }

    // Obtener información de la compañía
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { phoneNumber: true }
    })

    if (!company?.phoneNumber) {
      return NextResponse.json(
        { error: "Compañía no tiene número de WhatsApp configurado" },
        { status: 400 }
      )
    }

    // Enviar mensaje
    await whatsappService.sendMessage(to, message)

    // Obtener la conversación actualizada
    const conversation = await prisma.conversation.findFirst({
      where: {
        companyId,
        senderPhone: to
      }
    })

    return NextResponse.json({
      success: true,
      message: "Mensaje enviado exitosamente",
      conversationId: conversation?.id
    })
  } catch (error: any) {
    console.error("Error enviando mensaje:", error)
    return NextResponse.json(
      { error: error.message || "Error al enviar mensaje" },
      { status: 500 }
    )
  }
} 