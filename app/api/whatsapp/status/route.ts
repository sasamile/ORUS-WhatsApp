import { NextRequest, NextResponse } from "next/server"
import { whatsappService } from "@/lib/whatsapp"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get("companyId")

    if (!companyId) {
      return NextResponse.json(
        { error: "Se requiere el ID de la empresa" },
        { status: 400 }
      )
    }

    console.log("Verificando estado de WhatsApp para companyId:", companyId)
    const status = await whatsappService.getStatus(companyId)
    console.log("Estado de WhatsApp:", status)
    
    return NextResponse.json(status)
  } catch (error: any) {
    console.error("Error verificando estado de WhatsApp:", error)
    return NextResponse.json(
      { error: error.message || "Error al verificar estado de WhatsApp" },
      { status: 500 }
    )
  }
}