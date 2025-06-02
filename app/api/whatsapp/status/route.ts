import { NextRequest, NextResponse } from "next/server"
import { whatsappService } from "@/lib/whatsapp"

export async function GET(request: NextRequest) {
  try {
    const status = await whatsappService.getStatus()
    return NextResponse.json(status)
  } catch (error) {
    console.error("Error obteniendo estado de WhatsApp:", error)
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    )
  }
}