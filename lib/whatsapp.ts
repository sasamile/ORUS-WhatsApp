import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys"
import qrcode from "qrcode"
import { prisma } from "./prisma"
import axios from "axios"
import { WhatsAppSessionManager } from "./whatsapp-session-manager"

class WhatsAppService {
  private socket: any = null
  private qrCode: string | null = null
  private phoneNumber: string | null = null
  private isConnected = false
  private reconnectAttempts = 0
  private readonly MAX_RECONNECT_ATTEMPTS = 10
  private readonly RECONNECT_INTERVAL = 5000
  private readonly QR_TIMEOUT = 60000
  private qrTimer: NodeJS.Timeout | null = null
  private connectionTimer: NodeJS.Timeout | null = null
  private isInitializing = false
  private currentCompanyId: string | null = null
  private sessionRetryCount = 0
  private readonly MAX_SESSION_RETRIES = 5
  private isReconnecting = false
  private reconnectTimer: NodeJS.Timeout | null = null

  async initialize(companyId?: string) {
    if (this.isInitializing || this.isReconnecting) {
      console.log("Ya hay una inicialización o reconexión en proceso...")
      return
    }

    try {
      this.isInitializing = true
      this.currentCompanyId = companyId || null
      
      console.log("Iniciando conexión de WhatsApp...")
      
      // Verificar si ya hay una sesión activa
      const existingSession = await this.checkExistingSession()
      if (existingSession) {
        console.log("Sesión existente encontrada, conectando automáticamente...")
        await this.connectWithExistingSession()
        return
      }

      const { version } = await fetchLatestBaileysVersion()
      const { state, saveCreds } = await useMultiFileAuthState("auth")

      // Limpiar estado anterior pero preservar la sesión
      this.clearState()

      this.socket = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        browser: ["WhatsApp Web", "Chrome", "112.0.5615.49"],
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        generateHighQualityLinkPreview: true,
        syncFullHistory: false,
        markOnlineOnConnect: true,
        retryRequestDelayMs: 5000,
      })

      this.socket.ev.on("connection.update", async (update: any) => {
        const { connection, lastDisconnect, qr } = update
        console.log("Actualización de conexión:", update)

        if (connection === "open") {
          this.isConnected = true
          this.reconnectAttempts = 0
          this.sessionRetryCount = 0
          if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer)
            this.reconnectTimer = null
          }
          await this.handleSuccessfulConnection()
        } else if (connection === "close") {
          this.isConnected = false
          const statusCode = lastDisconnect?.error?.output?.statusCode
          const shouldReconnect = statusCode !== DisconnectReason.loggedOut && 
                                statusCode !== DisconnectReason.connectionClosed &&
                                statusCode !== DisconnectReason.connectionReplaced

          if (shouldReconnect) {
            console.log("Conexión cerrada, programando reconexión...")
            if (this.reconnectTimer) {
              clearTimeout(this.reconnectTimer)
            }
            this.reconnectTimer = setTimeout(() => {
              this.connectWithExistingSession()
            }, this.RECONNECT_INTERVAL)
          } else {
            console.log("Conexión cerrada intencionalmente")
          }
        }

        if (qr) {
          try {
            this.qrCode = await qrcode.toDataURL(qr, {
              errorCorrectionLevel: "H",
              margin: 1,
              scale: 8,
            })
            console.log("Código QR generado exitosamente")

            if (this.qrTimer) clearTimeout(this.qrTimer)
            this.qrTimer = setTimeout(() => {
              if (!this.isConnected) {
                console.log("QR expirado, intentando reconectar...")
                this.initialize(this.currentCompanyId || undefined)
              }
            }, this.QR_TIMEOUT)
          } catch (error) {
            console.error("Error generando QR:", error)
          }
        }
      })

      this.socket.ev.on("creds.update", saveCreds)
      this.socket.ev.on("messages.upsert", async (m: any) => {
        await this.handleIncomingMessage(m)
      })

    } catch (error) {
      console.error("Error inicializando WhatsApp:", error)
      if (this.reconnectAttempts < this.MAX_RECONNECT_ATTEMPTS) {
        this.reconnectAttempts++
        setTimeout(() => this.initialize(this.currentCompanyId || undefined), this.RECONNECT_INTERVAL)
      }
    } finally {
      this.isInitializing = false
    }
  }

  private async checkExistingSession(): Promise<boolean> {
    try {
      const fs = await import('fs')
      const path = await import('path')
      const authPath = path.join(process.cwd(), "auth")
      
      if (fs.existsSync(authPath)) {
        const files = fs.readdirSync(authPath)
        if (files.length > 0) {
          console.log("Sesión existente encontrada en auth")
          return true
        }
      }
      return false
    } catch (error) {
      console.error("Error verificando sesión existente:", error)
      return false
    }
  }

  private async connectWithExistingSession() {
    try {
      const { version } = await fetchLatestBaileysVersion()
      const { state, saveCreds } = await useMultiFileAuthState("auth")

      this.socket = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        browser: ["WhatsApp Web", "Chrome", "112.0.5615.49"],
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        generateHighQualityLinkPreview: true,
        syncFullHistory: false,
        markOnlineOnConnect: true,
        retryRequestDelayMs: 5000,
      })

      this.socket.ev.on("connection.update", async (update: any) => {
        const { connection, lastDisconnect } = update
        console.log("Actualización de conexión:", update)
        
        if (connection === "open") {
          this.isConnected = true
          await this.handleSuccessfulConnection()
        } else if (connection === "close") {
          this.isConnected = false
          const statusCode = lastDisconnect?.error?.output?.statusCode
          
          // Solo reconectar si no es un cierre intencional
          const shouldReconnect = statusCode !== DisconnectReason.loggedOut && 
                                statusCode !== DisconnectReason.connectionClosed &&
                                statusCode !== DisconnectReason.connectionReplaced

          if (shouldReconnect) {
            console.log("Conexión cerrada, intentando reconectar...")
            await new Promise(resolve => setTimeout(resolve, 5000))
            await this.connectWithExistingSession()
          } else {
            console.log("Conexión cerrada intencionalmente")
          }
        }
      })

      this.socket.ev.on("creds.update", saveCreds)
      this.socket.ev.on("messages.upsert", async (m: any) => {
        await this.handleIncomingMessage(m)
      })

    } catch (error: any) {
      console.error("Error conectando con sesión existente:", error)
      this.isConnected = false
      
      // Intentar reconectar sin limpiar la sesión
      console.log("Error de conexión, intentando reconectar...")
      setTimeout(() => this.connectWithExistingSession(), 5000)
    }
  }

  private async handleSuccessfulConnection() {
    console.log("Conectado a WhatsApp exitosamente")
    
    if (this.socket?.user?.id) {
      const newPhoneNumber = this.socket.user.id.split(":")[0]
      console.log("Número de teléfono obtenido:", newPhoneNumber)
      
      // Validar si el número ya está en uso por otra compañía
      const conflictResult = await this.validatePhoneNumberConflict(newPhoneNumber)
      
      if (!conflictResult.isValid) {
        console.error("Número de WhatsApp ya está en uso por otra compañía")
        throw new Error(conflictResult.message)
      }

      this.phoneNumber = newPhoneNumber
      this.isConnected = true
      this.qrCode = null
      
      // Actualizar número de teléfono en la base de datos
      await this.updateCompanyPhoneNumber()
      
      if (this.qrTimer) clearTimeout(this.qrTimer)
      if (this.connectionTimer) clearTimeout(this.connectionTimer)

      // Emitir evento de conexión exitosa
      this.socket.ev.emit('connection.update', { 
        connection: 'open',
        phoneNumber: this.phoneNumber
      })
    } else {
      console.error("No se pudo obtener el número de teléfono del socket")
      this.isConnected = false
    }
  }

  private async validatePhoneNumberConflict(phoneNumber: string): Promise<{isValid: boolean, message?: string}> {
    try {
      if (!this.currentCompanyId) {
        return { isValid: false, message: "No se encontró el ID de la compañía" }
      }

      // Buscar si ya existe otra compañía con este número
      const existingCompany = await prisma.company.findFirst({
        where: {
          phoneNumber: phoneNumber,
          NOT: {
            id: this.currentCompanyId
          }
        }
      })

      if (existingCompany) {
        return { 
          isValid: false, 
          message: `Este número de WhatsApp ya está siendo usado por otra compañía. Por favor, use un WhatsApp diferente o desconecte el anterior.` 
        }
      }

      return { isValid: true }
    } catch (error) {
      console.error("Error validando conflicto de número:", error)
      return { isValid: false, message: "Error interno validando el número" }
    }
  }

  private async updateCompanyPhoneNumber() {
    try {
      if (!this.currentCompanyId || !this.phoneNumber) {
        console.error("Faltan datos para actualizar el número de teléfono")
        return
      }

      await prisma.company.update({
        where: { id: this.currentCompanyId },
        data: { phoneNumber: this.phoneNumber }
      })

      console.log("Número de teléfono actualizado exitosamente:", this.phoneNumber)
    } catch (error) {
      console.error("Error actualizando número de teléfono:", error)
      throw error
    }
  }

  private async handleIncomingMessage(m: any) {
    try {
      const msg = m.messages[0]
      if (!msg.message) return

      // Verificar que el mensaje sea real
      if (!msg.key || !msg.key.remoteJid) {
        console.log("Mensaje ignorado: no tiene remitente válido")
        return
      }

      const from = msg.key.remoteJid.split("@")[0]
      
      // Ignorar mensajes del sistema o del propio número
      if (from === "status" || from === this.phoneNumber) {
        console.log("Mensaje ignorado: mensaje del sistema o propio")
        return
      }

      let text = ""
      let imageUrl = null
      let senderName = null
      let senderImage = null

      console.log("Procesando mensaje:", {
        from,
        hasMessage: !!msg.message,
        messageType: Object.keys(msg.message)[0],
        isFromMe: msg.key.fromMe
      })

      // Obtener información del contacto
      try {
        // Obtener nombre del contacto
        const contact = await this.socket.fetchStatus(msg.key.remoteJid)
        senderName = contact?.status || from
        
        // Obtener imagen del contacto
        try {
          const profilePicture = await this.socket.profilePictureUrl(msg.key.remoteJid)
          if (profilePicture) {
            const response = await fetch(profilePicture)
            const buffer = await response.arrayBuffer()
            senderImage = `data:image/jpeg;base64,${Buffer.from(buffer).toString('base64')}`
            console.log("Imagen del remitente obtenida")
          }
        } catch (error) {
          console.log("No se pudo obtener la imagen del perfil:", error)
        }
      } catch (error) {
        console.log("No se pudo obtener la información del contacto:", error)
        senderName = from
      }

      // Procesar el mensaje según su tipo
      if (msg.message.imageMessage) {
        text = msg.message.imageMessage.caption || ""
        try {
          const stream = await this.socket.downloadMediaMessage(msg)
          const buffer = Buffer.from(await stream.arrayBuffer())
          imageUrl = `data:image/jpeg;base64,${buffer.toString('base64')}`
          console.log("Imagen del mensaje descargada")
        } catch (error) {
          console.error("Error descargando imagen:", error)
        }
      } else if (msg.message.videoMessage) {
        text = msg.message.videoMessage.caption || ""
      } else if (msg.message.documentMessage) {
        text = msg.message.documentMessage.fileName || ""
      } else if (msg.message.conversation) {
        text = msg.message.conversation
      } else if (msg.message.extendedTextMessage) {
        text = msg.message.extendedTextMessage.text
      }

      // Verificar que el mensaje tenga contenido
      if (!text && !imageUrl) {
        console.log("Mensaje ignorado: sin contenido")
        return
      }

      console.log("Mensaje procesado:", {
        from,
        text,
        hasImage: !!imageUrl,
        senderName,
        hasSenderImage: !!senderImage,
        isFromMe: msg.key.fromMe
      })

      if (this.phoneNumber) {
        console.log("Guardando mensaje en la base de datos...")
        
        // Buscar la compañía primero
        const company = await prisma.company.findFirst({
          where: { phoneNumber: this.phoneNumber }
        })

        if (!company) {
          console.error("No se encontró la compañía con el número:", this.phoneNumber)
          return
        }

        // Buscar o crear la conversación
        let conversation = await prisma.conversation.findFirst({
          where: {
            companyId: company.id,
            senderPhone: from
          }
        })

        const newMessage = {
          content: text || (imageUrl ? "Imagen" : ""),
          direction: msg.key.fromMe ? "out" : "in",
          timestamp: new Date().toISOString(),
          isAI: false,
          imageUrl,
          messageId: msg.key.id,
          read: msg.key.fromMe
        }

        if (!conversation) {
          console.log("Creando nueva conversación...")
          conversation = await prisma.conversation.create({
            data: {
              companyId: company.id,
              senderPhone: from,
              companyPhone: this.phoneNumber,
              senderName: senderName || from,
              senderImage: senderImage || null,
              messages: [newMessage],
              lastUpdated: new Date(),
              aiEnabled: false,
              unreadCount: msg.key.fromMe ? 0 : 1,
              status: "ACTIVE"
            }
          })
          console.log("Nueva conversación creada:", conversation.id)
        } else {
          console.log("Actualizando conversación existente:", conversation.id)
          
          // Obtener mensajes actuales
          const currentMessages = Array.isArray(conversation.messages) 
            ? conversation.messages 
            : []

          // Verificar si el mensaje ya existe
          const messageExists = currentMessages.some((msg: any) => 
            msg.messageId === newMessage.messageId || 
            (msg.timestamp === newMessage.timestamp && msg.content === newMessage.content)
          )

          if (!messageExists) {
            // Agregar el nuevo mensaje al array existente
            const updatedMessages = [...currentMessages, newMessage]
            
            // Actualizar la conversación
            conversation = await prisma.conversation.update({
              where: { id: conversation.id },
              data: {
                messages: updatedMessages,
                lastUpdated: new Date(),
                senderName: senderName || conversation.senderName,
                senderImage: senderImage || conversation.senderImage,
                unreadCount: msg.key.fromMe ? 0 : (conversation.unreadCount + 1)
              }
            })
            console.log("Conversación actualizada con nuevo mensaje:", {
              conversationId: conversation.id,
              totalMessages: updatedMessages.length,
              unreadCount: conversation.unreadCount,
              messageDirection: newMessage.direction
            })
          } else {
            console.log("Mensaje ya existe, no se actualiza")
          }
        }

        // Marcar mensaje como leído si es entrante
        if (!msg.key.fromMe) {
          try {
            await this.socket.readMessages([msg.key])
            console.log("Mensaje marcado como leído")
          } catch (error) {
            console.error("Error marcando mensaje como leído:", error)
          }
        }

        // Verificar respuesta de IA solo para mensajes entrantes
        if (!msg.key.fromMe) {
          console.log("Verificando respuesta de IA...")
          await this.handleAIResponse(from, text)
        }

        // Emitir evento de actualización
        this.socket.ev.emit('conversation.update', {
          conversationId: conversation.id,
          type: 'message',
          data: conversation
        })
      } else {
        console.error("No hay número de teléfono disponible para guardar el mensaje")
      }
    } catch (error) {
      console.error("Error procesando mensaje:", error)
    }
  }

  async sendMessage(to: string, message: string) {
    if (!this.socket || !this.isConnected) {
      throw new Error("WhatsApp no está conectado")
    }

    try {
      console.log(`Enviando mensaje a ${to}: ${message}`)
      const sentMessage = await this.socket.sendMessage(`${to}@s.whatsapp.net`, { text: message })
      
      if (this.phoneNumber) {
        console.log("Guardando mensaje saliente...")
        
        // Buscar la compañía primero
        const company = await prisma.company.findFirst({
          where: { phoneNumber: this.phoneNumber }
        })

        if (!company) {
          console.error("No se encontró la compañía con el número:", this.phoneNumber)
          return
        }

        // Buscar o crear la conversación
        let conversation = await prisma.conversation.findFirst({
          where: {
            companyId: company.id,
            senderPhone: to
          }
        })

        const newMessage = {
          content: message,
          direction: "out",
          timestamp: new Date().toISOString(),
          isAI: false,
          imageUrl: null,
          messageId: sentMessage.key.id,
          read: true
        }

        if (!conversation) {
          console.log("Creando nueva conversación...")
          conversation = await prisma.conversation.create({
            data: {
              companyId: company.id,
              senderPhone: to,
              companyPhone: this.phoneNumber,
              senderName: to,
              senderImage: null,
              messages: [newMessage],
              lastUpdated: new Date(),
              aiEnabled: false,
              unreadCount: 0,
              status: "ACTIVE"
            }
          })
          console.log("Nueva conversación creada:", conversation.id)
        } else {
          console.log("Actualizando conversación existente:", conversation.id)
          
          // Obtener mensajes actuales
          const currentMessages = Array.isArray(conversation.messages) 
            ? conversation.messages 
            : []

          // Verificar si el mensaje ya existe
          const messageExists = currentMessages.some((msg: any) => 
            msg.messageId === newMessage.messageId || 
            (msg.timestamp === newMessage.timestamp && msg.content === newMessage.content)
          )

          if (!messageExists) {
            // Agregar el nuevo mensaje al array existente
            const updatedMessages = [...currentMessages, newMessage]
            
            // Actualizar la conversación
            conversation = await prisma.conversation.update({
              where: { id: conversation.id },
              data: {
                messages: updatedMessages,
                lastUpdated: new Date()
              }
            })
            console.log("Conversación actualizada con nuevo mensaje:", {
              conversationId: conversation.id,
              totalMessages: updatedMessages.length
            })
          } else {
            console.log("Mensaje ya existe, no se actualiza")
          }
        }

        // Emitir evento de actualización
        this.socket.ev.emit('conversation.update', {
          conversationId: conversation.id,
          type: 'message',
          data: conversation
        })

        return conversation
      } else {
        console.error("No hay número de teléfono disponible para guardar el mensaje saliente")
        return null
      }
    } catch (error) {
      console.error("Error enviando mensaje:", error)
      throw error
    }
  }

  getStatus() {
    const status = {
      connected: this.isConnected,
      phoneNumber: this.phoneNumber,
      qrCode: this.qrCode,
      hasExistingSession: this.checkExistingSession(),
      isReconnecting: this.isReconnecting,
      reconnectAttempts: this.reconnectAttempts
    }
    console.log("Estado actual de WhatsApp:", status)
    return status
  }

  getPhoneNumber() {
    return this.phoneNumber
  }

  clearState() {
    if (this.qrTimer) clearTimeout(this.qrTimer)
    if (this.connectionTimer) clearTimeout(this.connectionTimer)
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    
    // Solo limpiar el estado en memoria, no la sesión
    this.socket = null
    this.qrCode = null
    this.phoneNumber = null
    this.isConnected = false
    this.reconnectAttempts = 0
    this.isInitializing = false
    this.isReconnecting = false
  }

  // Método para limpiar todo, incluyendo la sesión (solo para uso interno)
  private async clearAll() {
    try {
      // Desconectar el socket
      if (this.socket) {
        await this.socket.logout()
        await this.socket.end()
      }
      
      // Limpiar estado en memoria
      this.clearState()
      
      // Limpiar archivos de sesión
      const fs = await import('fs')
      const path = await import('path')
      const authPath = path.join(process.cwd(), "auth")
      
      if (fs.existsSync(authPath)) {
        const files = fs.readdirSync(authPath)
        for (const file of files) {
          fs.unlinkSync(path.join(authPath, file))
        }
        fs.rmdirSync(authPath)
      }
    } catch (error) {
      console.error("Error limpiando todo:", error)
    }
  }

  async checkCompanySession(companyId: string): Promise<boolean> {
    try {
      const company = await prisma.company.findUnique({
        where: { id: companyId }
      })

      return !!(company?.phoneNumber && await this.checkExistingSession())
    } catch (error) {
      console.error("Error verificando sesión de compañía:", error)
      return false
    }
  }

  private async saveMessage(
    companyPhone: string,
    senderPhone: string,
    content: string,
    direction: "in" | "out",
    isAI = false,
    imageUrl: string | null = null,
    senderName: string | null = null,
    messageId: string | null = null,
    senderImage: string | null = null
  ) {
    try {
      console.log("Intentando guardar mensaje:", { 
        companyPhone, 
        senderPhone, 
        content, 
        direction, 
        isAI,
        hasImage: !!imageUrl,
        senderName,
        messageId,
        hasSenderImage: !!senderImage
      })
      
      // Buscar la compañía
      const company = await prisma.company.findFirst({
        where: { phoneNumber: companyPhone },
      })

      if (!company) {
        console.error("No se encontró la compañía con el número:", companyPhone)
        return
      }

      const timestamp = new Date().toISOString()
      const newMessage = {
        content,
        direction,
        timestamp,
        isAI,
        imageUrl,
        messageId,
        read: direction === "out"
      }

      // Buscar o crear la conversación
      let conversation = await prisma.conversation.findFirst({
        where: {
          companyId: company.id,
          senderPhone,
        },
      })

      if (!conversation) {
        console.log("Creando nueva conversación...")
        conversation = await prisma.conversation.create({
          data: {
            companyId: company.id,
            senderPhone,
            companyPhone,
            senderName: senderName || senderPhone,
            senderImage: senderImage || null,
            messages: [newMessage],
            lastUpdated: new Date(),
            aiEnabled: false,
            unreadCount: direction === "in" ? 1 : 0,
            status: "ACTIVE"
          },
        })
        console.log("Nueva conversación creada:", conversation.id)
      } else {
        console.log("Actualizando conversación existente:", conversation.id)
        const currentMessages = Array.isArray(conversation.messages) 
          ? conversation.messages 
          : []
        
        // Verificar si el mensaje ya existe
        const messageExists = currentMessages.some((msg: any) => 
          msg.messageId === messageId || 
          (msg.timestamp === timestamp && msg.content === content)
        )

        if (!messageExists) {
          const updatedMessages = [...currentMessages, newMessage]
          
          // Actualizar la conversación
          conversation = await prisma.conversation.update({
            where: { id: conversation.id },
            data: {
              messages: updatedMessages,
              lastUpdated: new Date(),
              senderName: senderName || conversation.senderName,
              senderImage: senderImage || conversation.senderImage,
              unreadCount: direction === "in" ? (conversation.unreadCount + 1) : 0
            },
          })
          console.log("Conversación actualizada:", conversation.id)
        } else {
          console.log("Mensaje ya existe, no se actualiza")
        }
      }

      // Emitir evento de actualización
      this.socket.ev.emit('conversation.update', {
        conversationId: conversation.id,
        type: 'message',
        data: conversation
      })

    } catch (error) {
      console.error("Error guardando mensaje:", error)
      throw error
    }
  }

  private async handleAIResponse(senderPhone: string, message: string) {
    try {
      const company = await prisma.company.findFirst({
        where: { phoneNumber: this.phoneNumber! },
      })

      if (!company) return

      const conversation = await prisma.conversation.findFirst({
        where: {
          companyId: company.id,
          senderPhone,
          aiEnabled: true,
        },
        include: { company: true },
      })

      if (!conversation) return

      const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/ai/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: conversation.id,
          message,
          senderPhone,
        }),
      })

      if (!response.ok) {
        console.error("Error al obtener respuesta de IA")
      }
    } catch (error) {
      console.error("Error manejando respuesta de IA:", error)
    }
  }
}

export const whatsappService = new WhatsAppService()