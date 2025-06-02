// import { NextRequest, NextResponse } from "next/server"
// import { whatsappService } from "@/lib/whatsapp"
// import { WhatsAppSessionManager } from "@/lib/whatsapp-session-manager"
// import { prisma } from "@/lib/prisma"
// import fs from "fs"
// import path from "path"

// export async function POST(request: NextRequest) {
//   try {
//     const { companyId } = await request.json()
    
//     console.log("Iniciando limpieza completa de sesiones...")
    
//     // 1. Limpiar estado del servicio de WhatsApp
//     whatsappService.clearState()
//     whatsappService.clearAuthState()
    
//     // 2. Limpiar archivos de sesión
//     WhatsAppSessionManager.clearAllSessions()
    
//     // 3. Limpiar número de teléfono de la compañía si se proporciona
//     if (companyId) {
//       await prisma.company.update({
//         where: { id: companyId },
//         data: { phoneNumber: null }
//       })
//     }
    
//     // 4. Verificar y limpiar carpetas adicionales
//     const authFolder = path.join(process.cwd(), "auth")
//     if (fs.existsSync(authFolder)) {
//       fs.rmSync(authFolder, { recursive: true, force: true })
//       console.log("Carpeta auth eliminada")
//     }
    
//     const sessionFile = path.join(process.cwd(), "company-session.json")
//     if (fs.existsSync(sessionFile)) {
//       fs.unlinkSync(sessionFile)
//       console.log("Archivo company-session.json eliminado")
//     }
    
//     console.log("Limpieza completa finalizada")
    
//     return NextResponse.json({ 
//       message: "Todas las sesiones limpiadas exitosamente",
//       success: true 
//     })
//   } catch (error) {
//     console.error("Error limpiando sesiones:", error)
//     return NextResponse.json(
//       { error: "Error interno del servidor" },
//       { status: 500 }
//     )
//   }
// } 