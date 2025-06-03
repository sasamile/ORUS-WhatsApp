import { NextRequest, NextResponse } from "next/server"
import { whatsappService } from "@/lib/whatsapp"
import { prisma } from "@/lib/prisma"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    console.log("Recibiendo petición de envío:", body)

    const { to, message, companyId } = body

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

    // Enviar mensaje
    console.log("Intentando enviar mensaje:", { to, message, companyId })
    const result = await whatsappService.sendMessage(companyId, to, message)
    console.log("Resultado del envío:", result)

    if (!result.success) {
      return NextResponse.json(
        { error: "No se pudo enviar el mensaje" },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: "Mensaje enviado exitosamente",
      conversationId: result.conversationId
    })
  } catch (error: any) {
    console.error("Error enviando mensaje:", error)
    return NextResponse.json(
      { error: error.message || "Error al enviar mensaje" },
      { status: 500 }
    )
  }
} 