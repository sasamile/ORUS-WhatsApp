import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys"
import qrcode from "qrcode"
import { prisma } from "./prisma"
import axios from "axios"
import path from "path"
import fs from "fs"
import { broadcast, sendToClient } from "@/app/api/ws/route"

interface Message {
  content: string
  direction: "in" | "out"
  timestamp: string
  isAI: boolean
  imageUrl?: string | null
  messageId: string
  read: boolean
}

interface Conversation {
  id: string
  senderPhone: string
  senderName: string
  senderImage: string | null
  messages: Message[]
  lastUpdated: string
  aiEnabled: boolean
  unreadCount: number
  companyPhone: string
}

class WhatsAppService {
  private sessions: Map<string, any> = new Map()
  private qrCodes: Map<string, string> = new Map()
  private phoneNumbers: Map<string, string> = new Map()
  private connectionStates: Map<string, boolean> = new Map()
  private reconnectAttempts: Map<string, number> = new Map()
  private readonly MAX_RECONNECT_ATTEMPTS = 10
  private readonly RECONNECT_INTERVAL = 5000
  private readonly QR_TIMEOUT = 60000
  private qrTimers: Map<string, NodeJS.Timeout> = new Map()
  private reconnectTimers: Map<string, NodeJS.Timeout> = new Map()
  private initializingCompanies: Set<string> = new Set()

  // Crear carpeta de autenticación específica para cada compañía
  private getAuthPath(companyId: string): string {
    const authPath = path.join(process.cwd(), "auth_sessions", companyId)
    if (!fs.existsSync(authPath)) {
      fs.mkdirSync(authPath, { recursive: true })
    }
    return authPath
  }

  async initialize(companyId: string) {
    if (this.initializingCompanies.has(companyId)) {
      console.log(`Ya hay una inicialización en proceso para la compañía ${companyId}`)
      return this.getStatus(companyId)
    }

    try {
      this.initializingCompanies.add(companyId)
      console.log(`Iniciando conexión de WhatsApp para compañía: ${companyId}`)
      
      // Verificar si ya hay una sesión activa para esta compañía
      const existingSession = await this.checkExistingSession(companyId)
      if (existingSession && this.connectionStates.get(companyId)) {
        console.log(`Sesión existente encontrada para compañía ${companyId}`)
        return this.getStatus(companyId)
      }

      const { version } = await fetchLatestBaileysVersion()
      const authPath = this.getAuthPath(companyId)
      const { state, saveCreds } = await useMultiFileAuthState(authPath)

      // Limpiar estado anterior para esta compañía
      this.clearCompanyState(companyId)

      const socket = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        browser: [`WhatsApp-${companyId}`, "Chrome", "112.0.5615.49"],
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        generateHighQualityLinkPreview: true,
        syncFullHistory: false,
        markOnlineOnConnect: true,
        retryRequestDelayMs: 5000,
      })

      this.sessions.set(companyId, socket)

      socket.ev.on("connection.update", async (update: any) => {
        const { connection, lastDisconnect, qr } = update
        console.log(`Actualización de conexión para ${companyId}:`, update)

        if (connection === "open") {
          this.connectionStates.set(companyId, true)
          this.reconnectAttempts.set(companyId, 0)
          
          // Limpiar timer de reconexión si existe
          const reconnectTimer = this.reconnectTimers.get(companyId)
          if (reconnectTimer) {
            clearTimeout(reconnectTimer)
            this.reconnectTimers.delete(companyId)
          }
          
          await this.handleSuccessfulConnection(companyId, socket)
        } else if (connection === "close") {
          this.connectionStates.set(companyId, false)
          const statusCode = lastDisconnect?.error?.output?.statusCode
          const shouldReconnect = statusCode !== DisconnectReason.loggedOut && 
                                statusCode !== DisconnectReason.connectionClosed &&
                                statusCode !== DisconnectReason.connectionReplaced

          if (shouldReconnect) {
            console.log(`Conexión cerrada para ${companyId}, programando reconexión...`)
            const currentAttempts = this.reconnectAttempts.get(companyId) || 0
            if (currentAttempts < this.MAX_RECONNECT_ATTEMPTS) {
              this.reconnectAttempts.set(companyId, currentAttempts + 1)
              const timer = setTimeout(() => {
                this.connectWithExistingSession(companyId)
            }, this.RECONNECT_INTERVAL)
              this.reconnectTimers.set(companyId, timer)
            }
          } else {
            console.log(`Conexión cerrada intencionalmente para ${companyId}`)
          }
        }

        if (qr) {
          try {
            const qrDataURL = await qrcode.toDataURL(qr, {
              errorCorrectionLevel: "H",
              margin: 1,
              scale: 8,
            })
            this.qrCodes.set(companyId, qrDataURL)
            console.log(`Código QR generado exitosamente para ${companyId}`)

            // Limpiar timer anterior si existe
            const existingTimer = this.qrTimers.get(companyId)
            if (existingTimer) clearTimeout(existingTimer)
            
            // Configurar nuevo timer
            const timer = setTimeout(() => {
              if (!this.connectionStates.get(companyId)) {
                console.log(`QR expirado para ${companyId}, intentando reconectar...`)
                this.initialize(companyId)
              }
            }, this.QR_TIMEOUT)
            this.qrTimers.set(companyId, timer)
          } catch (error) {
            console.error(`Error generando QR para ${companyId}:`, error)
          }
        }
      })

      socket.ev.on("creds.update", saveCreds)
      socket.ev.on("messages.upsert", async (m: any) => {
        await this.handleIncomingMessage(companyId, m)
      })

      // Esperar un momento para que se genere el QR o se conecte
      await new Promise(resolve => setTimeout(resolve, 3000))

    } catch (error) {
      console.error(`Error inicializando WhatsApp para ${companyId}:`, error)
      const currentAttempts = this.reconnectAttempts.get(companyId) || 0
      if (currentAttempts < this.MAX_RECONNECT_ATTEMPTS) {
        this.reconnectAttempts.set(companyId, currentAttempts + 1)
        setTimeout(() => this.initialize(companyId), this.RECONNECT_INTERVAL)
      }
    } finally {
      this.initializingCompanies.delete(companyId)
    }

    return this.getStatus(companyId)
  }

  private async checkExistingSession(companyId: string): Promise<boolean> {
    try {
      const authPath = this.getAuthPath(companyId)
      
      if (fs.existsSync(authPath)) {
        const files = fs.readdirSync(authPath)
        if (files.length > 0) {
          console.log(`Sesión existente encontrada para ${companyId}`)
          return true
        }
      }
      return false
    } catch (error) {
      console.error(`Error verificando sesión existente para ${companyId}:`, error)
      return false
    }
  }

  private async connectWithExistingSession(companyId: string) {
    try {
      console.log(`Conectando con sesión existente para ${companyId}`)
      const { version } = await fetchLatestBaileysVersion()
      const authPath = this.getAuthPath(companyId)
      const { state, saveCreds } = await useMultiFileAuthState(authPath)

      const socket = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        browser: [`WhatsApp-${companyId}`, "Chrome", "112.0.5615.49"],
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        generateHighQualityLinkPreview: true,
        syncFullHistory: false,
        markOnlineOnConnect: true,
        retryRequestDelayMs: 5000,
      })

      this.sessions.set(companyId, socket)

      socket.ev.on("connection.update", async (update: any) => {
        const { connection, lastDisconnect } = update
        console.log(`Actualización de conexión para ${companyId}:`, update)
        
        if (connection === "open") {
          this.connectionStates.set(companyId, true)
          this.reconnectAttempts.set(companyId, 0)
          await this.handleSuccessfulConnection(companyId, socket)
        } else if (connection === "close") {
          this.connectionStates.set(companyId, false)
          const statusCode = lastDisconnect?.error?.output?.statusCode
          
          const shouldReconnect = statusCode !== DisconnectReason.loggedOut && 
                                statusCode !== DisconnectReason.connectionClosed &&
                                statusCode !== DisconnectReason.connectionReplaced

          if (shouldReconnect) {
            const currentAttempts = this.reconnectAttempts.get(companyId) || 0
            if (currentAttempts < this.MAX_RECONNECT_ATTEMPTS) {
              console.log(`Conexión cerrada para ${companyId}, intentando reconectar...`)
              this.reconnectAttempts.set(companyId, currentAttempts + 1)
              setTimeout(() => this.connectWithExistingSession(companyId), 5000)
            }
          }
        }
      })

      socket.ev.on("creds.update", saveCreds)
      socket.ev.on("messages.upsert", async (m: any) => {
        await this.handleIncomingMessage(companyId, m)
      })

    } catch (error: any) {
      console.error(`Error conectando con sesión existente para ${companyId}:`, error)
      this.connectionStates.set(companyId, false)
      
      const currentAttempts = this.reconnectAttempts.get(companyId) || 0
      if (currentAttempts < this.MAX_RECONNECT_ATTEMPTS) {
        this.reconnectAttempts.set(companyId, currentAttempts + 1)
        setTimeout(() => this.connectWithExistingSession(companyId), 5000)
      }
    }
  }

  private async handleSuccessfulConnection(companyId: string, socket: any) {
    console.log(`Conectado a WhatsApp exitosamente para ${companyId}`)
    
    if (socket?.user?.id) {
      const newPhoneNumber = socket.user.id.split(":")[0]
      console.log(`Número de teléfono obtenido para ${companyId}:`, newPhoneNumber)
      
      // Validar si el número ya está en uso por otra compañía
      const conflictResult = await this.validatePhoneNumberConflict(companyId, newPhoneNumber)
      
      if (!conflictResult.isValid) {
        console.error(`Número de WhatsApp ya está en uso por otra compañía: ${companyId}`)
        throw new Error(conflictResult.message)
      }

      this.phoneNumbers.set(companyId, newPhoneNumber)
      this.connectionStates.set(companyId, true)
      this.qrCodes.delete(companyId) // Limpiar QR una vez conectado
      
      // Actualizar número de teléfono en la base de datos
      await this.updateCompanyPhoneNumber(companyId, newPhoneNumber)
      
      // Limpiar timers
      const qrTimer = this.qrTimers.get(companyId)
      if (qrTimer) {
        clearTimeout(qrTimer)
        this.qrTimers.delete(companyId)
      }

      // Emitir evento de conexión exitosa a través de WebSocket
      broadcast({
        type: "whatsapp_status",
        data: {
          companyId,
          connected: true,
          phoneNumber: newPhoneNumber
        }
      })
    } else {
      console.error(`No se pudo obtener el número de teléfono del socket para ${companyId}`)
      this.connectionStates.set(companyId, false)
    }
  }

  private async validatePhoneNumberConflict(companyId: string, phoneNumber: string): Promise<{isValid: boolean, message?: string}> {
    try {
      // Buscar si ya existe otra compañía con este número
      const existingCompany = await prisma.company.findFirst({
        where: {
          phoneNumber: phoneNumber,
          NOT: {
            id: companyId
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
      console.error(`Error validando conflicto de número para ${companyId}:`, error)
      return { isValid: false, message: "Error interno validando el número" }
    }
  }

  private async updateCompanyPhoneNumber(companyId: string, phoneNumber: string) {
    try {
      await prisma.company.update({
        where: { id: companyId },
        data: { phoneNumber: phoneNumber }
      })

      console.log(`Número de teléfono actualizado exitosamente para ${companyId}:`, phoneNumber)
    } catch (error) {
      console.error(`Error actualizando número de teléfono para ${companyId}:`, error)
      throw error
    }
  }

  async sendMessage(companyId: string, to: string, message: string) {
    try {
      console.log(`Iniciando envío de mensaje desde ${companyId} a ${to}: ${message}`)
      
      const socket = this.sessions.get(companyId)
      const isConnected = this.connectionStates.get(companyId)
      
      if (!socket || !isConnected) {
        console.error(`WhatsApp no está conectado para la compañía ${companyId}`)
        throw new Error(`WhatsApp no está conectado para la compañía ${companyId}`)
      }

      // Asegurarse de que el número tenga el formato correcto
      const formattedNumber = to.includes('@s.whatsapp.net') ? to : `${to}@s.whatsapp.net`
      
      console.log(`Enviando mensaje a ${formattedNumber}`)
      const sentMessage = await socket.sendMessage(formattedNumber, { text: message })
      
      if (!sentMessage || !sentMessage.key || !sentMessage.key.id) {
        throw new Error('No se pudo enviar el mensaje a WhatsApp')
      }

      console.log(`Mensaje enviado exitosamente a WhatsApp, ID: ${sentMessage.key.id}`)
      
      const phoneNumber = this.phoneNumbers.get(companyId)
      if (!phoneNumber) {
        throw new Error('No se encontró el número de teléfono de la compañía')
      }

      // Guardar el mensaje en la base de datos
      const savedConversation = await this.saveOutgoingMessage(
        companyId,
        to,
        message,
        sentMessage.key.id
      )

      if (!savedConversation) {
        throw new Error('No se pudo guardar el mensaje en la base de datos')
      }

      console.log(`Mensaje guardado exitosamente en la base de datos`)
      
      // Emitir evento de nuevo mensaje
      if (savedConversation.messages && Array.isArray(savedConversation.messages)) {
        const lastMessage = savedConversation.messages[savedConversation.messages.length - 1]
        broadcast({
          type: "new_message",
          data: {
            companyId,
            conversationId: savedConversation.id,
            message: lastMessage
          }
        })
      }

      return {
        success: true,
        conversationId: savedConversation.id,
        messageId: sentMessage.key.id
      }
    } catch (error) {
      console.error(`Error enviando mensaje desde ${companyId}:`, error)
      throw error
    }
  }

  async getStatus(companyId: string) {
    if (!companyId) {
      console.error("companyId es requerido para getStatus")
      return {
        connected: false,
        phoneNumber: null,
        qrCode: null,
        hasExistingSession: false,
        reconnectAttempts: 0,
        companyId: null
      }
    }

    try {
      const hasSession = await this.checkExistingSession(companyId)
      const status = {
        connected: this.connectionStates.get(companyId) || false,
        phoneNumber: this.phoneNumbers.get(companyId) || null,
        qrCode: this.qrCodes.get(companyId) || null,
        hasExistingSession: hasSession,
        reconnectAttempts: this.reconnectAttempts.get(companyId) || 0,
        companyId
      }
      console.log(`Estado actual de WhatsApp para ${companyId}:`, status)
      return status
    } catch (error) {
      console.error(`Error obteniendo estado para ${companyId}:`, error)
      return {
        connected: false,
        phoneNumber: null,
        qrCode: null,
        hasExistingSession: false,
        reconnectAttempts: 0,
        companyId
      }
    }
  }

  getPhoneNumber(companyId: string) {
    return this.phoneNumbers.get(companyId) || null
  }

  clearCompanyState(companyId: string) {
    // Limpiar timers
    const qrTimer = this.qrTimers.get(companyId)
    if (qrTimer) {
      clearTimeout(qrTimer)
      this.qrTimers.delete(companyId)
    }
    
    const reconnectTimer = this.reconnectTimers.get(companyId)
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      this.reconnectTimers.delete(companyId)
    }
    
    // Solo limpiar el estado en memoria para esta compañía
    const socket = this.sessions.get(companyId)
    if (socket) {
      try {
        socket.end()
      } catch (error) {
        console.error(`Error cerrando socket para ${companyId}:`, error)
      }
    }
    
    this.sessions.delete(companyId)
    this.qrCodes.delete(companyId)
    this.phoneNumbers.delete(companyId)
    this.connectionStates.delete(companyId)
    this.reconnectAttempts.delete(companyId)
    this.initializingCompanies.delete(companyId)
  }

  async clearCompanySession(companyId: string) {
    try {
      // Desconectar el socket
      const socket = this.sessions.get(companyId)
      if (socket) {
        try {
          await socket.logout()
          await socket.end()
        } catch (error) {
          console.error(`Error cerrando socket para ${companyId}:`, error)
        }
      }
      
      // Limpiar estado en memoria
      this.clearCompanyState(companyId)
      
      // Limpiar archivos de sesión específicos de esta compañía
      const authPath = this.getAuthPath(companyId)
      
      if (fs.existsSync(authPath)) {
        const files = fs.readdirSync(authPath)
        for (const file of files) {
          fs.unlinkSync(path.join(authPath, file))
        }
        fs.rmdirSync(authPath)
      }

      // Limpiar número de teléfono en la base de datos
      await prisma.company.update({
        where: { id: companyId },
        data: { phoneNumber: null }
      })

      console.log(`Sesión limpiada completamente para ${companyId}`)
    } catch (error) {
      console.error(`Error limpiando sesión para ${companyId}:`, error)
      throw error
    }
  }

  async checkCompanySession(companyId: string): Promise<boolean> {
    try {
      const company = await prisma.company.findUnique({
        where: { id: companyId }
      })

      const hasSession = await this.checkExistingSession(companyId)
      const isConnected = this.connectionStates.get(companyId) || false

      return !!(company?.phoneNumber && hasSession && isConnected)
    } catch (error) {
      console.error(`Error verificando sesión de compañía ${companyId}:`, error)
      return false
    }
  }

  private async handleIncomingMessage(companyId: string, m: any) {
    try {
      const msg = m.messages[0]
      if (!msg.message) {
        console.log(`Mensaje ignorado para ${companyId}: no tiene contenido`)
        return
      }

      // Verificar que el mensaje sea real
      if (!msg.key || !msg.key.remoteJid) {
        console.log(`Mensaje ignorado para ${companyId}: no tiene remitente válido`)
        return
      }

      const from = msg.key.remoteJid.split("@")[0]
      const phoneNumber = this.phoneNumbers.get(companyId)
      
      // Ignorar mensajes del sistema o del propio número
      if (from === "status" || from === phoneNumber) {
        console.log(`Mensaje ignorado para ${companyId}: mensaje del sistema o propio`)
        return
      }

      let text = ""
      let imageUrl = null
      let senderName = null
      let senderImage = null

      console.log(`Procesando mensaje para ${companyId}:`, {
        from,
        hasMessage: !!msg.message,
        messageType: Object.keys(msg.message)[0],
        isFromMe: msg.key.fromMe
      })

      // Obtener información del contacto
      const socket = this.sessions.get(companyId)
      if (socket) {
      try {
          const contact = await socket.fetchStatus(msg.key.remoteJid)
        senderName = contact?.status || from
        
        try {
            const profilePicture = await socket.profilePictureUrl(msg.key.remoteJid)
          if (profilePicture) {
            const response = await fetch(profilePicture)
            const buffer = await response.arrayBuffer()
            senderImage = `data:image/jpeg;base64,${Buffer.from(buffer).toString('base64')}`
          }
        } catch (error) {
            console.log(`No se pudo obtener la imagen del perfil para ${companyId}:`, error)
        }
      } catch (error) {
          console.log(`No se pudo obtener la información del contacto para ${companyId}:`, error)
        senderName = from
        }
      }

      // Procesar el mensaje según su tipo
      if (msg.message.imageMessage) {
        text = msg.message.imageMessage.caption || ""
        if (socket) {
        try {
            const stream = await socket.downloadMediaMessage(msg)
          const buffer = Buffer.from(await stream.arrayBuffer())
          imageUrl = `data:image/jpeg;base64,${buffer.toString('base64')}`
            console.log(`Imagen del mensaje descargada para ${companyId}`)
        } catch (error) {
            console.error(`Error descargando imagen para ${companyId}:`, error)
          }
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
        console.log(`Mensaje ignorado para ${companyId}: sin contenido`)
        return
      }

      if (phoneNumber) {
        console.log(`Guardando mensaje para ${companyId} de ${from}:`, { text, imageUrl })
        const conversation = await this.saveIncomingMessage(
          companyId,
        from,
        text,
          imageUrl,
          senderName,
          senderImage,
          msg.key.id,
          msg.key.fromMe
        )
        
        if (conversation) {
          console.log(`Conversación guardada exitosamente para ${companyId}:`, conversation.id)
          
          // Emitir evento de nuevo mensaje a través de WebSocket
          if (Array.isArray(conversation.messages) && conversation.messages.length > 0) {
            broadcast({
              type: "new_message",
              data: {
                companyId,
                conversationId: conversation.id,
                message: conversation.messages[conversation.messages.length - 1]
              }
            })
        }

        // Marcar mensaje como leído si es entrante
          if (!msg.key.fromMe && socket) {
          try {
              await socket.readMessages([msg.key])
              console.log(`Mensaje marcado como leído para ${companyId}`)
          } catch (error) {
              console.error(`Error marcando mensaje como leído para ${companyId}:`, error)
          }
        }

        // Verificar respuesta de IA solo para mensajes entrantes
        if (!msg.key.fromMe) {
            await this.handleAIResponse(companyId, from, text)
          }
      } else {
          console.error(`Error guardando conversación para ${companyId}`)
        }
      } else {
        console.error(`No se encontró número de teléfono para ${companyId}`)
      }
    } catch (error) {
      console.error(`Error procesando mensaje entrante para ${companyId}:`, error)
    }
  }

  private async saveIncomingMessage(
    companyId: string,
    senderPhone: string,
    content: string,
    imageUrl: string | null,
    senderName: string | null,
    senderImage: string | null,
    messageId: string,
    isFromMe: boolean
  ) {
    try {
      console.log(`Iniciando guardado de mensaje para ${companyId} de ${senderPhone}`)
      
      const phoneNumber = this.phoneNumbers.get(companyId)
      if (!phoneNumber) {
        console.error(`No se encontró número de teléfono para ${companyId}`)
        return null
      }

        const company = await prisma.company.findFirst({
        where: { phoneNumber }
        })

        if (!company) {
        console.error(`No se encontró la compañía con el número: ${phoneNumber}`)
        return null
      }

      console.log(`Compañía encontrada para ${companyId}:`, company.id)

        const newMessage = {
        content: content || (imageUrl ? "Imagen" : ""),
        direction: isFromMe ? "out" : "in",
          timestamp: new Date().toISOString(),
          isAI: false,
        imageUrl,
        messageId,
        read: isFromMe
      }

      console.log(`Buscando conversación existente para ${companyId} con ${senderPhone}`)
      let conversation = await prisma.conversation.findFirst({
        where: {
          companyId: company.id,
          senderPhone
        }
      })

        if (!conversation) {
        console.log(`Creando nueva conversación para ${companyId} con ${senderPhone}`)
          conversation = await prisma.conversation.create({
            data: {
              companyId: company.id,
            senderPhone,
            companyPhone: phoneNumber,
            senderName: senderName || senderPhone,
            senderImage: senderImage || null,
              messages: [newMessage],
              lastUpdated: new Date(),
              aiEnabled: false,
            unreadCount: isFromMe ? 0 : 1,
              status: "ACTIVE"
            }
          })
        console.log(`Nueva conversación creada:`, conversation.id)
        } else {
        console.log(`Actualizando conversación existente:`, conversation.id)
        const currentMessages = Array.isArray(conversation.messages) ? conversation.messages : []
          const messageExists = currentMessages.some((msg: any) => 
            msg.messageId === newMessage.messageId || 
            (msg.timestamp === newMessage.timestamp && msg.content === newMessage.content)
          )

          if (!messageExists) {
          console.log(`Agregando nuevo mensaje a la conversación`)
            const updatedMessages = [...currentMessages, newMessage]
            
            conversation = await prisma.conversation.update({
              where: { id: conversation.id },
              data: {
                messages: updatedMessages,
              lastUpdated: new Date(),
              senderName: senderName || conversation.senderName,
              senderImage: senderImage || conversation.senderImage,
              unreadCount: isFromMe ? 0 : (conversation.unreadCount + 1)
              }
            })
          console.log(`Conversación actualizada exitosamente`)
          } else {
          console.log(`Mensaje ya existe en la conversación`)
          }
        }

        // Emitir evento de actualización
      const socket = this.sessions.get(companyId)
      if (socket) {
        socket.ev.emit('conversation.update', {
          conversationId: conversation.id,
          type: 'message',
          data: conversation
        })
      }

        return conversation
    } catch (error) {
      console.error(`Error guardando mensaje entrante para ${companyId}:`, error)
        return null
    }
  }

  private async saveOutgoingMessage(companyId: string, to: string, message: string, messageId: string) {
    try {
      console.log(`Guardando mensaje saliente para ${companyId} a ${to}`)
      
      const phoneNumber = this.phoneNumbers.get(companyId)
      if (!phoneNumber) {
        console.error(`No se encontró número de teléfono para ${companyId}`)
        return null
      }

      const company = await prisma.company.findFirst({
        where: { phoneNumber }
      })

      if (!company) {
        console.error(`No se encontró la compañía con el número: ${phoneNumber}`)
        return null
      }

      const newMessage = {
        content: message,
        direction: "out",
        timestamp: new Date().toISOString(),
        isAI: false,
        imageUrl: null,
        messageId,
        read: true
      }

      console.log(`Buscando conversación existente para ${companyId} con ${to}`)
      let conversation = await prisma.conversation.findFirst({
        where: {
          companyId: company.id,
          senderPhone: to
        }
      })

      if (!conversation) {
        console.log(`Creando nueva conversación para ${companyId} con ${to}`)
        conversation = await prisma.conversation.create({
          data: {
            companyId: company.id,
            senderPhone: to,
            companyPhone: phoneNumber,
            senderName: to,
            senderImage: null,
            messages: [newMessage],
            lastUpdated: new Date(),
            aiEnabled: false,
            unreadCount: 0,
            status: "ACTIVE"
          }
        })
        console.log(`Nueva conversación creada:`, conversation.id)
      } else {
        console.log(`Actualizando conversación existente:`, conversation.id)
        const currentMessages = Array.isArray(conversation.messages) ? conversation.messages : []
        const messageExists = currentMessages.some((msg: any) => 
          msg.messageId === messageId || 
          (msg.timestamp === newMessage.timestamp && msg.content === newMessage.content)
        )

        if (!messageExists) {
          console.log(`Agregando nuevo mensaje a la conversación`)
          const updatedMessages = [...currentMessages, newMessage]
          
          conversation = await prisma.conversation.update({
            where: { id: conversation.id },
            data: {
              messages: updatedMessages,
              lastUpdated: new Date()
            }
          })
          console.log(`Conversación actualizada exitosamente`)
        } else {
          console.log(`Mensaje ya existe en la conversación`)
        }
      }

      return conversation
    } catch (error) {
      console.error(`Error guardando mensaje saliente para ${companyId}:`, error)
      return null
    }
  }

  private async handleAIResponse(companyId: string, senderPhone: string, message: string) {
    try {
      const phoneNumber = this.phoneNumbers.get(companyId)
      if (!phoneNumber) return

      const company = await prisma.company.findFirst({
        where: { phoneNumber }
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
        console.error(`Error al obtener respuesta de IA para ${companyId}`)
      }
    } catch (error) {
      console.error(`Error manejando respuesta de IA para ${companyId}:`, error)
    }
  }
}

export const whatsappService = new WhatsAppService()