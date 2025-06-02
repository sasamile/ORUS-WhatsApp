import { NextResponse } from "next/server"
import { whatsappService } from "@/lib/whatsapp"

export async function POST() {
  try {
    // Solo limpiar el estado del servicio, sin tocar la carpeta auth
    whatsappService.clearState()
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error limpiando estado de WhatsApp:", error)
    return NextResponse.json(
      { error: "Error limpiando estado de WhatsApp" },
      { status: 500 }
    )
  }
}