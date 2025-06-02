import { NextRequest, NextResponse } from "next/server"
import { whatsappService } from "@/lib/whatsapp"
import { prisma } from "@/lib/prisma"

export async function POST(request: NextRequest) {
  try {
    const { companyId } = await request.json()
    
    if (!companyId) {
      return NextResponse.json(
        { error: "ID de compañía requerido" },
        { status: 400 }
      )
    }

    // Solo limpiar el estado de WhatsApp, sin tocar la carpeta auth
    whatsappService.clearState()
    
    // Limpiar número de teléfono de la compañía
    await prisma.company.update({
      where: { id: companyId },
      data: { phoneNumber: null }
    })
    
    return NextResponse.json({ 
      success: true,
      message: "WhatsApp desconectado exitosamente" 
    })
  } catch (error) {
    console.error("Error desconectando WhatsApp:", error)
    return NextResponse.json(
      { error: "Error desconectando WhatsApp" },
      { status: 500 }
    )
  }
}