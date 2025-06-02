// import { NextRequest, NextResponse } from "next/server"
// import { whatsappService } from "@/lib/whatsapp"
// import { WhatsAppSessionManager } from "@/lib/whatsapp-session-manager"

// export async function POST(request: NextRequest) {
//   try {
//     // Limpiar estado del servicio de WhatsApp
//     whatsappService.clearState()
    
//     // Limpiar archivos de sesión
//     WhatsAppSessionManager.clearAllSessions()
    
//     return NextResponse.json({ 
//       message: "Sesión limpiada exitosamente",
//       success: true 
//     })
//   } catch (error) {
//     console.error("Error limpiando sesión:", error)
//     return NextResponse.json(
//       { error: "Error interno del servidor" },
//       { status: 500 }
//     )
//   }
// } 