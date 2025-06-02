import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function POST(request: NextRequest) {
  try {
    const { phoneNumber, companyId } = await request.json()
    
    if (!phoneNumber || !companyId) {
      return NextResponse.json(
        { error: "Número de teléfono y ID de compañía requeridos" },
        { status: 400 }
      )
    }

    // Verificar si el número ya está en uso
    const existingCompany = await prisma.company.findFirst({
      where: {
        phoneNumber: phoneNumber,
        NOT: {
          id: companyId
        }
      }
    })

    if (existingCompany) {
      return NextResponse.json({
        isValid: false,
        message: "Este número de WhatsApp ya está siendo usado por otra compañía"
      })
    }

    return NextResponse.json({
      isValid: true,
      message: "Número disponible"
    })
  } catch (error) {
    console.error("Error validando número:", error)
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    )
  }
}