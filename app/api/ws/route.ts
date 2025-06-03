import { NextResponse } from "next/server"
import { WebSocketServer, WebSocket } from "ws"
import { Server } from "http"
import { whatsappService } from "@/lib/whatsapp"

let wss: WebSocketServer | null = null
const clients = new Map<string, WebSocket>()

export async function GET(req: Request) {
  try {
    if (!wss) {
      const server = (req as any).socket.server as Server
      
      wss = new WebSocketServer({ 
        noServer: true,
        clientTracking: true,
        perMessageDeflate: false,
        maxPayload: 1024 * 1024 // 1MB
      })

      // Manejar el upgrade del servidor HTTP
      server.on("upgrade", (request, socket, head) => {
        try {
          const pathname = new URL(request.url || "", `http://${request.headers.host}`).pathname

          if (pathname === "/api/ws") {
            wss?.handleUpgrade(request, socket, head, (ws) => {
              wss?.emit("connection", ws, request)
            })
          } else {
            socket.destroy()
          }
        } catch (error) {
          console.error("Error en upgrade:", error)
          socket.destroy()
        }
      })

      wss.on("connection", async (ws: WebSocket, request) => {
        try {
          const clientId = Math.random().toString(36).substring(7)
          clients.set(clientId, ws)
          
          console.log(`Cliente conectado: ${clientId}`)

          // Configurar ping para mantener la conexión viva
          let pingInterval: NodeJS.Timeout | null = null
          let pongTimeout: NodeJS.Timeout | null = null

          const setupPingPong = () => {
            if (pingInterval) {
              clearInterval(pingInterval)
            }
            if (pongTimeout) {
              clearTimeout(pongTimeout)
            }

            pingInterval = setInterval(() => {
              if (ws.readyState === WebSocket.OPEN) {
                try {
                  ws.send(JSON.stringify({ type: "ping" }))
                  
                  // Esperar respuesta pong
                  pongTimeout = setTimeout(() => {
                    console.log("No se recibió pong, cerrando conexión")
                    ws.close(1000, "No pong received")
                  }, 5000)
                } catch (error) {
                  console.error("Error enviando ping:", error)
                  ws.close(1000, "Error sending ping")
                }
              }
            }, 30000)
          }

          setupPingPong()

          // Enviar estado inicial al cliente
          try {
            const status = await whatsappService.getStatus("")
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: "whatsapp_status",
                data: status
              }))
            }
          } catch (error) {
            console.error("Error obteniendo estado inicial:", error)
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: "whatsapp_status",
                data: { connected: false }
              }))
            }
          }

          ws.on("message", async (message: string) => {
            try {
              const data = JSON.parse(message.toString())
              console.log("Mensaje recibido:", data)

              switch (data.type) {
                case "status":
                  if (data.companyId) {
                    try {
                      const status = await whatsappService.getStatus(data.companyId)
                      if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({
                          type: "whatsapp_status",
                          data: status
                        }))
                      }
                    } catch (error) {
                      console.error("Error obteniendo estado:", error)
                      if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({
                          type: "whatsapp_status",
                          data: { connected: false }
                        }))
                      }
                    }
                  }
                  break
                case "pong":
                  if (pongTimeout) {
                    clearTimeout(pongTimeout)
                    pongTimeout = null
                  }
                  break
                default:
                  console.log("Tipo de mensaje no reconocido:", data.type)
              }
            } catch (error) {
              console.error("Error procesando mensaje:", error)
            }
          })

          ws.on("error", (error) => {
            console.error("Error en WebSocket:", error)
            if (pingInterval) clearInterval(pingInterval)
            if (pongTimeout) clearTimeout(pongTimeout)
            clients.delete(clientId)
          })

          ws.on("close", (code, reason) => {
            console.log(`Cliente desconectado: ${clientId}, código: ${code}, razón: ${reason}`)
            if (pingInterval) clearInterval(pingInterval)
            if (pongTimeout) clearTimeout(pongTimeout)
            clients.delete(clientId)
          })
        } catch (error) {
          console.error("Error en conexión:", error)
          ws.close(1011, "Internal server error")
        }
      })

      wss.on("error", (error) => {
        console.error("Error en servidor WebSocket:", error)
      })
    }

    return new NextResponse(null, {
      status: 101,
      headers: {
        "Upgrade": "websocket",
        "Connection": "Upgrade"
      }
    })
  } catch (error) {
    console.error("Error en GET /ws:", error)
    return new NextResponse(null, { status: 500 })
  }
}

export function broadcast(message: any) {
  if (!wss) return
  
  const messageStr = JSON.stringify(message)
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(messageStr)
      } catch (error) {
        console.error("Error enviando mensaje broadcast:", error)
      }
    }
  })
}

export function sendToClient(clientId: string, message: any) {
  const client = clients.get(clientId)
  if (client && client.readyState === WebSocket.OPEN) {
    try {
      client.send(JSON.stringify(message))
    } catch (error) {
      console.error("Error enviando mensaje a cliente:", error)
    }
  }
} 