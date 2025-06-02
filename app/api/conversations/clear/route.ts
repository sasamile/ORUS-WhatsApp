import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function POST() {
  try {
    // Eliminar todas las conversaciones
    await prisma.conversation.deleteMany({})
    
    return NextResponse.json({ 
      success: true,
      message: "Todas las conversaciones han sido eliminadas" 
    })
  } catch (error) {
    console.error("Error limpiando conversaciones:", error)
    return NextResponse.json(
      { error: "Error limpiando conversaciones" },
      { status: 500 }
    )
  }
} 