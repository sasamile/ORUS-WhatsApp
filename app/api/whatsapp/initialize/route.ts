import { NextResponse } from "next/server"
import { whatsappService } from "@/lib/whatsapp"

export async function POST(request: Request) {
  try {
    const { companyId } = await request.json()
    
    if (!companyId) {
      return NextResponse.json(
        { error: "Se requiere el ID de la empresa" },
        { status: 400 }
      )
    }

    console.log("Inicializando WhatsApp para compañía:", companyId)
    await whatsappService.initialize(companyId)
    
    // Esperar un momento para que se genere el QR
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    // Obtener el estado actual
    const status = await whatsappService.getStatus(companyId)
    console.log("Estado de WhatsApp:", status)
    
    return NextResponse.json(status)
  } catch (error: any) {
    console.error("Error inicializando WhatsApp:", error)
    return NextResponse.json(
      { error: error.message || "Error al inicializar WhatsApp" },
      { status: 500 }
    )
  }
}