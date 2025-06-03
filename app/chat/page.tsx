"use client"

import { useEffect, useState, useRef } from "react"
import { useRouter } from "next/navigation"
import axios from "axios"

interface Message {
  content: string
  direction: "in" | "out"
  timestamp: string
  isAI: boolean
  imageUrl?: string | null
  messageId: string
}

interface Conversation {
  id: string
  phoneNumber: string
  name: string
  lastMessage: string
  lastMessageTime: string
  unreadCount: number
  messages: Message[]
  isAI: boolean
  senderImage: string | null
  aiEnabled: boolean
  senderName: string
  senderPhone: string
  lastUpdated: string
}

export default function ChatPage() {
  const router = useRouter()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null)
  const [message, setMessage] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isRedirecting, setIsRedirecting] = useState(false)
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [isReconnecting, setIsReconnecting] = useState(false)

  // Referencias para el contenedor de mensajes
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const prevMessagesLengthRef = useRef<number>(0)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined)
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Función para verificar si el usuario está al final del chat
  const isAtBottom = () => {
    if (!chatContainerRef.current) return true
    const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current
    return scrollHeight - scrollTop - clientHeight < 50
  }

  // Función para hacer scroll al último mensaje
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  // Efecto para hacer scroll cuando se selecciona una conversación
  useEffect(() => {
    if (selectedConversation) {
      scrollToBottom()
      prevMessagesLengthRef.current = selectedConversation.messages.length
    }
  }, [selectedConversation?.id])

  // Efecto para hacer scroll cuando llega un nuevo mensaje
  useEffect(() => {
    if (selectedConversation?.messages) {
      const currentLength = selectedConversation.messages.length
      if (currentLength > prevMessagesLengthRef.current) {
        scrollToBottom()
      }
      prevMessagesLengthRef.current = currentLength
    }
  }, [selectedConversation?.messages])

  const checkWhatsAppStatus = async () => {
    try {
      const companyId = localStorage.getItem("companyId")
      if (!companyId) {
        console.error("No se encontró companyId en localStorage")
        router.replace("/whatsapp-connect")
        return false
      }

      console.log("Verificando estado de WhatsApp para companyId:", companyId)
      const status = await axios.get("/api/whatsapp/status", { params: { companyId } }).then(res => res.data)
      console.log('Estado de WhatsApp:', status)
            
      if (!status.connected) {
        console.log('WhatsApp no está conectado, intentando reconectar...')
        const reconnectResult = await axios.post("/api/whatsapp/connect", { companyId }).then(res => res.data)
        console.log('Resultado de reconexión:', reconnectResult)
        
        if (!reconnectResult.connected) {
          setError('No se pudo conectar con WhatsApp. Por favor, intente nuevamente.')
          return false
        }

        // Establecer el número de teléfono después de la reconexión
        if (reconnectResult.phoneNumber) {
          setPhoneNumber(reconnectResult.phoneNumber)
        }
      } else {
        // Establecer el número de teléfono del estado actual
        if (status.phoneNumber) {
          setPhoneNumber(status.phoneNumber)
        }
      }
      
      setIsConnected(true)
      await loadConversations()
      return true
    } catch (error) {
      console.error('Error verificando estado de WhatsApp:', error)
      setError('Error al verificar el estado de WhatsApp')
      return false
    }
  }

  const startHeartbeat = () => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current)
    }

    heartbeatIntervalRef.current = setInterval(async () => {
      try {
        const companyId = localStorage.getItem('companyId')
        if (!companyId) return

        const status = await axios.get("/api/whatsapp/status", { params: { companyId } }).then(res => res.data)
        
        if (!status.connected && !isReconnecting) {
          console.log('Conexión perdida, reconectando...')
          await reconnectWhatsApp()
        }
      } catch (error) {
        console.error('Error en heartbeat:', error)
      }
    }, 30000) // Cada 30 segundos
  }

  const reconnectWhatsApp = async () => {
    if (isReconnecting) return
    
    setIsReconnecting(true)
    try {
      const companyId = localStorage.getItem('companyId')
      if (!companyId) return

      console.log('Iniciando reconexión de WhatsApp...')
      const reconnectResult = await axios.post("/api/whatsapp/connect", { companyId }).then(res => res.data)
      
      if (reconnectResult.connected) {
        console.log('Reconexión exitosa')
        setIsConnected(true)
      } else {
        console.error('Fallo en reconexión')
        // Intentar nuevamente en 5 segundos
        setTimeout(reconnectWhatsApp, 5000)
      }
    } catch (error) {
      console.error('Error en reconexión:', error)
      // Intentar nuevamente en 5 segundos
      setTimeout(reconnectWhatsApp, 5000)
    } finally {
      setIsReconnecting(false)
    }
  }

  useEffect(() => {
    checkWhatsAppStatus()
    startHeartbeat()

    return () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current)
      }
    }
  }, [router])

  const loadConversations = async () => {
    if (isRedirecting) {
      console.log("No se cargan conversaciones - isRedirecting:", isRedirecting)
      return
    }

    try {
      const companyId = localStorage.getItem("companyId")
      if (!companyId) {
        console.error("No se encontró companyId en localStorage")
        setError("No se encontró el ID de la compañía")
        setIsLoading(false)
        return
      }

      console.log("Cargando conversaciones para companyId:", companyId)
      const response = await axios.get("/api/conversations", {
        params: { companyId }
      })

      console.log("Respuesta de conversaciones:", response.data)
      
      // Asegurarnos de que conversations sea un array
      const conversationsData = Array.isArray(response.data) ? response.data : 
                              Array.isArray(response.data.conversations) ? response.data.conversations : []
      
      console.log("Conversaciones procesadas:", conversationsData)
      setConversations(conversationsData)

      if (conversationsData.length > 0 && !selectedConversation) {
        setSelectedConversation(conversationsData[0])
      }
      
      setIsLoading(false)
    } catch (error) {
      console.error("Error cargando conversaciones:", error)
      setError("Error al cargar las conversaciones")
      setConversations([]) // Asegurar que conversations sea un array vacío en caso de error
      setIsLoading(false)
        }
  }

  const handleConnectClick = () => {
    setIsRedirecting(true)
    router.push("/whatsapp-connect")
  }

  // Función para enviar mensaje
  const sendMessage = async () => {
    if (!message.trim() || !selectedConversation) {
      console.log('No se puede enviar el mensaje: mensaje vacío o sin conversación seleccionada')
      return
    }

    const companyId = localStorage.getItem('companyId')
    if (!companyId) {
      setError('No se encontró el ID de la empresa')
      return
    }

    try {
      if (!selectedConversation.senderPhone) {
        setError('Número de teléfono no disponible')
        return
      }

      const phoneNumber = selectedConversation.senderPhone.replace(/\D/g, '')
      if (!phoneNumber) {
        setError('Número de teléfono inválido')
        return
      }

      // Verificar y mantener conexión
      const status = await axios.get("/api/whatsapp/status", { params: { companyId } }).then(res => res.data)
      
      if (!status.connected) {
        console.log('WhatsApp desconectado, intentando reconectar...')
        await reconnectWhatsApp()
        // Verificar nuevamente después de la reconexión
        const newStatus = await axios.get("/api/whatsapp/status", { params: { companyId } }).then(res => res.data)
        if (!newStatus.connected) {
          throw new Error('No se pudo reconectar WhatsApp')
        }
      }

      const messageData = {
        to: phoneNumber,
        message: message.trim(),
        companyId
      }

      // Sistema de reintentos para el envío
      let retries = 3
      let lastError = null

      while (retries > 0) {
        try {
          const response = await axios.post('/api/whatsapp/send', messageData)
          if (response.data.success) {
            setMessage('')
            updateConversation(selectedConversation.id)
            return
          }
        } catch (error) {
          lastError = error
          console.log(`Intento fallido (${4-retries}/3):`, error)
          
          // Si es error de conexión, intentar reconectar
          if (axios.isAxiosError(error) && error.response?.status === 400) {
            await reconnectWhatsApp()
          }
          
          await new Promise(resolve => setTimeout(resolve, 1000))
          retries--
        }
      }

      throw lastError || new Error('Error al enviar el mensaje después de varios intentos')

    } catch (error) {
      console.error('Error completo:', error)
      if (axios.isAxiosError(error)) {
        const errorMessage = error.response?.data?.error || error.message
        console.error('Error al enviar mensaje:', errorMessage)
        setError(`Error al enviar mensaje: ${errorMessage}`)
      } else {
        setError('Error al enviar el mensaje')
      }
    }
  }

  const markAsRead = async (conversationId: string) => {
    try {
      await axios.post("/api/conversations/mark-read", { conversationId })
      updateConversation(conversationId)
    } catch (error) {
      console.error("Error marcando como leído:", error)
    }
  }

  // Función para actualizar una conversación específica
  const updateConversation = async (conversationId: string) => {
    try {
      console.log("Solicitando actualización de conversación:", conversationId)
      
      if (!conversationId) {
        console.error("ID de conversación inválido")
        return
      }

      const response = await axios.get(`/api/conversations/${conversationId}`)
      
      if (!response.data || !response.data.conversation) {
        console.error("Respuesta inválida del servidor:", response.data)
        return
      }

      const updatedConversation = response.data.conversation
      console.log("Conversación actualizada recibida:", updatedConversation)

      setConversations(prevConversations => {
        const newConversations = prevConversations.map(conv => {
          if (conv.id === conversationId) {
            // Si es la conversación seleccionada, no mostrar contador de no leídos
            const unreadCount = selectedConversation?.id === conversationId ? 0 : conv.unreadCount
            
            // Verificar si hay mensajes duplicados
            const currentMessages = conv.messages || []
            const newMessages = updatedConversation.messages || []
            
            const uniqueMessages = newMessages.filter((newMsg: any) => 
              !currentMessages.some((currentMsg: any) => 
                (currentMsg.messageId === newMsg.messageId) || 
                (currentMsg.timestamp === newMsg.timestamp && 
                 currentMsg.content === newMsg.content &&
                 currentMsg.direction === newMsg.direction)
              )
            )
            
            return {
              ...updatedConversation,
              unreadCount,
              messages: [...currentMessages, ...uniqueMessages]
            }
          }
          return conv
        })
        
        return newConversations.sort((a, b) => 
          new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime()
        )
      })

      if (selectedConversation?.id === conversationId) {
        setSelectedConversation(prev => {
          if (!prev) return updatedConversation
          
          const currentMessages = prev.messages || []
          const newMessages = updatedConversation.messages || []
          
          const uniqueMessages = newMessages.filter((newMsg: any) => 
            !currentMessages.some((currentMsg: any) => 
              (currentMsg.messageId === newMsg.messageId) || 
              (currentMsg.timestamp === newMsg.timestamp && 
               currentMsg.content === newMsg.content &&
               currentMsg.direction === newMsg.direction)
            )
          )
          
          return {
            ...updatedConversation,
            unreadCount: 0, // Siempre 0 para la conversación seleccionada
            messages: [...currentMessages, ...uniqueMessages]
          }
        })
      }
    } catch (error) {
      console.error("Error actualizando conversación:", error)
    }
  }

  // Efecto para actualizar la conversación seleccionada periódicamente
  useEffect(() => {
    if (selectedConversation) {
      const interval = setInterval(() => {
        updateConversation(selectedConversation.id)
      }, 2000) // Actualizar cada 2 segundos

      return () => clearInterval(interval)
    }
  }, [selectedConversation?.id])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-red-500 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
          >
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <div className="w-80 bg-white border-r shadow-lg">
        <div className="p-4 border-b bg-gradient-to-r from-blue-600 to-blue-700 text-white">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xl font-semibold">Conversaciones</h2>
            <button
              onClick={() => {
                const newValue = !selectedConversation?.aiEnabled
                if (selectedConversation) {
                  axios.post(`/api/conversations/${selectedConversation.id}/toggle-ai`, {
                    aiEnabled: newValue
                  }).then(() => {
                    updateConversation(selectedConversation.id)
                  })
                }
              }}
              className={`px-3 py-1 rounded-xl text-sm font-medium transition-all duration-200 ${
                selectedConversation?.aiEnabled
                  ? "bg-green-500 hover:bg-green-600 shadow-lg"
                  : "bg-gray-500 hover:bg-gray-600 shadow-lg"
              }`}
            >
              {selectedConversation?.aiEnabled ? "IA Activada" : "IA Desactivada"}
            </button>
          </div>
          <div className="flex items-center space-x-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
            <p className="text-sm text-blue-100">
              {phoneNumber ? `Número: ${phoneNumber}` : 'Conectando...'}
            </p>
          </div>
        </div>
        <div className="overflow-y-auto h-[calc(100vh-80px)]">
          {Array.isArray(conversations) && conversations.length > 0 ? (
            conversations.map((conversation) => (
              <div
                key={conversation.id}
                className={`p-4 border-b cursor-pointer transition-all duration-200 hover:bg-gray-50 ${
                  selectedConversation?.id === conversation.id 
                    ? "bg-blue-50 border-l-4 border-blue-500 shadow-inner" 
                    : ""
                }`}
                onClick={() => {
                  setSelectedConversation(conversation)
                  if (conversation.unreadCount > 0) {
                    markAsRead(conversation.id)
                  }
                }}
              >
                <div className="flex items-center space-x-3">
                  {conversation.senderImage ? (
                    <img
                      src={conversation.senderImage} 
                      alt={conversation.senderName || conversation.senderPhone}
                      className="w-12 h-12 rounded-full object-cover ring-2 ring-blue-500 shadow-lg"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center ring-2 ring-blue-500 shadow-lg">
                      <span className="text-white font-semibold text-lg">
                        {(conversation.senderName || conversation.senderPhone).charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center space-x-2">
                        <p className="font-medium text-gray-900 truncate">
                          {conversation.senderName || conversation.senderPhone}
                        </p>
                        {conversation.aiEnabled && (
                          <span className="px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded-full shadow-sm">
                            IA
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-gray-500">
                        {new Date(conversation.lastUpdated).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 truncate">
                      {conversation.messages?.[conversation.messages.length - 1]?.content || "Sin mensajes"}
                    </p>
                    {conversation.unreadCount > 0 && selectedConversation?.id !== conversation.id && (
                      <span className="inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white transform translate-y-1/2 bg-blue-600 rounded-full shadow-lg">
                        {conversation.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="p-8 text-center text-gray-500">
              <svg className="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <p className="text-lg font-medium">No hay conversaciones disponibles</p>
              <p className="text-sm mt-2">Los mensajes aparecerán aquí cuando recibas uno nuevo</p>
            </div>
          )}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col bg-gray-50">
        {selectedConversation ? (
          <>
            <div className="p-4 border-b bg-white shadow-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  {selectedConversation.senderImage ? (
                    <img 
                      src={selectedConversation.senderImage} 
                      alt={selectedConversation.senderName || selectedConversation.senderPhone}
                      className="w-12 h-12 rounded-full object-cover ring-2 ring-blue-500 shadow-lg"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center ring-2 ring-blue-500 shadow-lg">
                      <span className="text-white font-semibold text-lg">
                        {(selectedConversation.senderName || selectedConversation.senderPhone).charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">
                      {selectedConversation.senderName || selectedConversation.senderPhone}
                    </h2>
                    <p className="text-sm text-gray-500">
                      {selectedConversation.aiEnabled ? "Asistente IA activo" : "Asistente IA inactivo"}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    const newValue = !selectedConversation.aiEnabled
                    axios.post(`/api/conversations/${selectedConversation.id}/toggle-ai`, {
                      aiEnabled: newValue
                    }).then(() => {
                      updateConversation(selectedConversation.id)
                    })
                  }}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                    selectedConversation.aiEnabled
                      ? "bg-green-500 hover:bg-green-600 text-white shadow-lg"
                      : "bg-gray-200 hover:bg-gray-300 text-gray-700 shadow-lg"
                  }`}
                >
                  {selectedConversation.aiEnabled ? "IA Activada" : "IA Desactivada"}
                </button>
              </div>
            </div>
            <div 
              ref={chatContainerRef}
              className="flex-1 overflow-y-auto p-4 space-y-4"
              style={{ scrollBehavior: "smooth" }}
            >
              {selectedConversation.messages.map((msg, index) => (
                <div
                  key={index}
                  className={`flex ${
                    msg.direction === "out" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[70%] rounded-2xl p-3 shadow-lg ${
                      msg.direction === "out"
                        ? "bg-gradient-to-r from-blue-500 to-blue-600 text-white"
                        : "bg-white text-gray-800"
                    }`}
                  >
                    {msg.imageUrl && (
                      <img 
                        src={msg.imageUrl} 
                        alt="Imagen" 
                        className="max-w-full rounded-lg mb-2 shadow-md"
                      />
                    )}
                    <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                    <p className={`text-xs mt-1 ${msg.direction === "out" ? "text-blue-100" : "text-gray-500"}`}>
                      {new Date(msg.timestamp).toLocaleTimeString()}
                      {msg.isAI && (
                        <span className="ml-2 px-2 py-0.5 bg-blue-500 rounded-full text-white">
                          IA
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
            <div className="p-4 border-t bg-white shadow-lg">
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && sendMessage()}
                  placeholder="Escribe un mensaje..."
                  className="flex-1 border rounded-xl px-6 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm"
                />
                <button
                  onClick={sendMessage}
                  className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-6 py-3 rounded-xl hover:from-blue-600 hover:to-blue-700 transition-all duration-200 flex items-center space-x-2 shadow-lg"
                >
                  <span>Enviar</span>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <svg className="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <p className="text-gray-500 text-lg">Selecciona una conversación para comenzar</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
