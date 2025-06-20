import { NextRequest, NextResponse } from "next/server"
import { whatsappService } from "@/lib/whatsapp"
import { prisma } from "@/lib/prisma"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    console.log("Recibiendo petición de envío:", body)

    const { to, message, companyId, messageId } = body

    // Validación de datos
    if (!to || typeof to !== 'string') {
      console.error("Número de teléfono inválido:", to)
      return NextResponse.json(
        { error: "Número de teléfono inválido" },
        { status: 400 }
      )
    }

    if (!message || typeof message !== 'string') {
      console.error("Mensaje inválido:", message)
      return NextResponse.json(
        { error: "Mensaje inválido" },
        { status: 400 }
      )
    }

    if (!companyId || typeof companyId !== 'string') {
      console.error("ID de compañía inválido:", companyId)
      return NextResponse.json(
        { error: "ID de compañía inválido" },
        { status: 400 }
      )
    }

    // Obtener información de la compañía
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { phoneNumber: true }
    })

    if (!company) {
      console.error("Compañía no encontrada:", companyId)
      return NextResponse.json(
        { error: "Compañía no encontrada" },
        { status: 400 }
      )
    }

    if (!company.phoneNumber) {
      console.error("Compañía no tiene número configurado:", companyId)
      return NextResponse.json(
        { error: "Compañía no tiene número de WhatsApp configurado" },
        { status: 400 }
      )
    }

    // Verificar si WhatsApp está conectado
    const status = await whatsappService.getStatus(companyId)
    console.log("Estado de WhatsApp:", status)

    if (!status.connected) {
      console.error("WhatsApp no está conectado para:", companyId)
      return NextResponse.json(
        { error: "WhatsApp no está conectado" },
        { status: 400 }
      )
    }

    // Buscar la conversación existente
    const conversation = await prisma.conversation.findFirst({
      where: {
        companyId,
        senderPhone: to
      }
    })

    if (!conversation) {
      console.error("No se encontró la conversación")
      return NextResponse.json(
        { error: "No se encontró la conversación" },
        { status: 400 }
      )
    }

    // Verificar si el mensaje ya existe usando una transacción
    const result = await prisma.$transaction(async (tx) => {
      const currentConversation = await tx.conversation.findUnique({
        where: { id: conversation.id },
        select: { messages: true }
      })

      if (!currentConversation) {
        throw new Error("Conversación no encontrada")
      }

      const messages = Array.isArray(currentConversation.messages) ? currentConversation.messages : []
      const messageExists = messages.some((msg: any) => 
        msg.messageId === messageId || 
        (msg.content === message && 
         msg.direction === "out" &&
         new Date().getTime() - new Date(msg.timestamp).getTime() < 5000)
      )

      if (messageExists) {
        console.log("Mensaje duplicado detectado, ignorando...")
        return { success: true, message: "Mensaje ya enviado" }
      }

      // Enviar mensaje
      console.log("Intentando enviar mensaje:", { to, message, companyId, messageId })
      const sendResult = await whatsappService.sendMessage(companyId, to, message)
      console.log("Resultado del envío:", sendResult)

      if (!sendResult) {
        throw new Error("No se pudo enviar el mensaje")
      }

      // Crear el nuevo mensaje
      const newMessage = {
        content: message,
        direction: "out",
        timestamp: new Date().toISOString(),
        isAI: false,
        imageUrl: null,
        messageId: messageId,
        read: true
      }

      // Actualizar la conversación con el nuevo mensaje
      const updatedConversation = await tx.conversation.update({
        where: { id: conversation.id },
        data: {
          messages: [...messages, newMessage],
          lastUpdated: new Date()
        }
      })

      return { success: true, message: "Mensaje enviado exitosamente", conversation: updatedConversation }
    })

    return NextResponse.json(result)
  } catch (error: any) {
    console.error("Error enviando mensaje:", error)
    return NextResponse.json(
      { error: error.message || "Error al enviar mensaje" },
      { status: 500 }
    )
  }
} 