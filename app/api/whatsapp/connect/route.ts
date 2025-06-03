import { NextResponse } from "next/server"
import { whatsappService } from "@/lib/whatsapp"

export async function POST(req: Request) {
  try {
    const { companyId } = await req.json()

    if (!companyId) {
      return NextResponse.json(
        { error: "Se requiere el ID de la compañía" },
        { status: 400 }
      )
    }

    console.log(`Intentando reconectar WhatsApp para companyId: ${companyId}`)

    // Intentar reconectar
    const status = await whatsappService.initialize(companyId)
    
    if (status.connected) {
      console.log(`Reconexión exitosa para ${companyId}`)
      return NextResponse.json({
        connected: true,
        phoneNumber: status.phoneNumber,
        hasExistingSession: status.hasExistingSession
      })
    }

    console.log(`No se pudo reconectar para ${companyId}`)
    return NextResponse.json({
      connected: false,
      phoneNumber: null,
      hasExistingSession: status.hasExistingSession
    })
  } catch (error) {
    console.error("Error reconectando WhatsApp:", error)
    return NextResponse.json(
      { error: "Error al reconectar WhatsApp" },
      { status: 500 }
    )
  }
} 