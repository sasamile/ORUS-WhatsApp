import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { whatsappService } from "@/lib/whatsapp"

export async function GET() {
  try {
    const status = await whatsappService.getStatus()
    const hasSession = await status.hasExistingSession
    
    console.log("Estado inicial de WhatsApp:", {
      connected: status.connected,
      hasSession,
      phoneNumber: status.phoneNumber
    })
    
    // Si no está conectado pero tiene sesión, intentar reconectar
    if (!status.connected && hasSession) {
      console.log("WhatsApp no está conectado pero tiene sesión, intentando reconectar...")
      try {
        await whatsappService.initialize()
        
        // Esperar un momento para que la conexión se establezca
        await new Promise(resolve => setTimeout(resolve, 2000))
        
        // Verificar el estado nuevamente
        const newStatus = await whatsappService.getStatus()
        console.log("Estado después de reconexión:", {
          connected: newStatus.connected,
          hasSession: await newStatus.hasExistingSession,
          phoneNumber: newStatus.phoneNumber
        })

        if (!newStatus.connected) {
          console.log("No se pudo reconectar, pero manteniendo la sesión")
          return NextResponse.json({ 
            error: "WhatsApp no está conectado",
            connected: false,
            hasSession: true,
            conversations: []
          })
        }

        // Si la reconexión fue exitosa, actualizar el estado
        status.connected = true
        status.phoneNumber = newStatus.phoneNumber
      } catch (error) {
        console.error("Error al reconectar:", error)
        return NextResponse.json({ 
          error: "Error al reconectar WhatsApp",
          connected: false,
          hasSession: true,
          conversations: []
        })
      }
    } else if (!status.connected) {
      console.log("WhatsApp no está conectado y no hay sesión")
      return NextResponse.json({ 
        error: "WhatsApp no está conectado",
        connected: false,
        hasSession: false,
        conversations: []
      })
    }

    // Buscar la compañía por el número de teléfono
    const company = await prisma.company.findFirst({
      where: { phoneNumber: status.phoneNumber }
    })

    if (!company) {
      console.log("No se encontró la compañía para el número:", status.phoneNumber)
      return NextResponse.json({ 
        error: "No se encontró la compañía",
        connected: false,
        hasSession: true,
        conversations: []
      })
    }

    // Obtener las conversaciones
    const conversations = await prisma.conversation.findMany({
      where: { companyId: company.id },
      orderBy: { lastUpdated: "desc" },
      select: {
        id: true,
        senderPhone: true,
        senderName: true,
        senderImage: true,
        messages: true,
        lastUpdated: true,
        aiEnabled: true,
        unreadCount: true,
        contactInfo: true,
        companyPhone: true
      }
    })

    console.log("Conversaciones encontradas:", conversations.length)
    conversations.forEach(conv => {
      console.log("Conversación:", {
        id: conv.id,
        sender: conv.senderName || conv.senderPhone,
        mensajes: Array.isArray(conv.messages) ? conv.messages.length : 0,
        noLeidos: conv.unreadCount
      })
    })

    return NextResponse.json({
      conversations,
      phoneNumber: status.phoneNumber,
      connected: true,
      hasSession: true
    })
  } catch (error) {
    console.error("Error obteniendo conversaciones:", error)
    return NextResponse.json(
      { 
        error: "Error al obtener las conversaciones",
        connected: false,
        hasSession: true,
        conversations: []
      },
      { status: 500 }
    )
  }
}
