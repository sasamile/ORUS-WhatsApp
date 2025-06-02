"use client"

import { useEffect, useState, useRef } from "react"
import { useRouter } from "next/navigation"
import axios from "axios"

interface Message {
  content: string
  direction: "in" | "out"
  timestamp: string
  isAI: boolean
}

interface Conversation {
  id: string
  senderPhone: string
  senderName: string
  senderImage: string
  messages: Message[]
  lastUpdated: string
  aiEnabled: boolean
  unreadCount: number
  contactInfo: any
  companyPhone: string
}

export default function ChatPage() {
  const router = useRouter()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null)
  const [message, setMessage] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isRedirecting, setIsRedirecting] = useState(false)
  const [phoneNumber, setPhoneNumber] = useState("")

  // Referencias para el contenedor de mensajes
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const prevMessagesLengthRef = useRef<number>(0)

  // Función para verificar si el usuario está al final del chat
  const isAtBottom = () => {
    if (!chatContainerRef.current) return true
    const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current
    const threshold = 50 // píxeles desde el final
    return scrollHeight - scrollTop - clientHeight < threshold
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

  useEffect(() => {
    const checkConnection = async () => {
      try {
        const response = await fetch("/api/whatsapp/status")
        const data = await response.json()
        const hasSession = await data.hasExistingSession

        if (hasSession) {
          console.log("Sesión existente encontrada, conectando...")
          try {
            const initResponse = await fetch("/api/whatsapp/initialize", {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({ companyId: localStorage.getItem("companyId") })
            })
            const initData = await initResponse.json()
            
            if (initData.connected) {
              console.log("Conexión exitosa")
              setPhoneNumber(initData.phoneNumber)
              loadConversations()
              return
            }
          } catch (error) {
            console.error("Error al conectar:", error)
          }
        }

        if (!hasSession) {
          console.log("No hay sesión activa, redirigiendo...")
          router.replace("/whatsapp-connect")
          return
        }

        setPhoneNumber(data.phoneNumber)
        loadConversations()
      } catch (error) {
        console.error("Error verificando conexión:", error)
        const statusResponse = await fetch("/api/whatsapp/status")
        const statusData = await statusResponse.json()
        const hasSession = await statusData.hasExistingSession
        
        if (!hasSession) {
          router.replace("/whatsapp-connect")
        }
      }
    }

    checkConnection()
    // Verificar conexión cada 30 segundos
    const connectionInterval = setInterval(checkConnection, 30000)
    return () => clearInterval(connectionInterval)
  }, [router])

  useEffect(() => {
    loadConversations()
    // Actualizar conversaciones cada 5 segundos
    const interval = setInterval(loadConversations, 5000)
    return () => clearInterval(interval)
  }, [])

  // Configurar WebSocket para actualizaciones en tiempo real
  useEffect(() => {
    let ws: WebSocket | null = null
    let reconnectTimeout: NodeJS.Timeout

    const setupWebSocket = () => {
      try {
        // Obtener la URL base del servidor
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        const wsUrl = `${protocol}//${window.location.host}/ws`
        
        console.log("Intentando conectar WebSocket a:", wsUrl)
        
        // Cerrar conexión existente si hay una
        if (ws) {
          ws.close()
        }

        ws = new WebSocket(wsUrl)
        
        ws.onopen = () => {
          console.log("WebSocket conectado exitosamente")
          // Limpiar cualquier timeout de reconexión pendiente
          if (reconnectTimeout) {
            clearTimeout(reconnectTimeout)
          }
        }
        
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)
            console.log("Mensaje WebSocket recibido:", data)
            
            if (data && data.conversationId) {
              console.log("Actualizando conversación:", data.conversationId)
              updateConversation(data.conversationId)
            }
          } catch (error) {
            console.error("Error procesando mensaje WebSocket:", error)
          }
        }

        ws.onerror = (error) => {
          console.error("Error en WebSocket:", error)
          // Intentar reconectar en caso de error
          if (ws) {
            ws.close()
          }
        }

        ws.onclose = (event) => {
          console.log("WebSocket cerrado:", event.code, event.reason)
          // Intentar reconectar después de 2 segundos
          reconnectTimeout = setTimeout(setupWebSocket, 2000)
        }

      } catch (error) {
        console.error("Error configurando WebSocket:", error)
        // Intentar reconectar después de 2 segundos
        reconnectTimeout = setTimeout(setupWebSocket, 2000)
      }
    }

    // Iniciar la conexión
    setupWebSocket()

    // Limpiar al desmontar
    return () => {
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout)
      }
      if (ws) {
        ws.close()
      }
    }
  }, []) // Sin dependencias para evitar reconexiones innecesarias

  // Función para actualizar una conversación específica
  const updateConversation = async (conversationId: string) => {
    try {
      console.log("Solicitando actualización de conversación:", conversationId)
      const response = await axios.get(`/api/conversations/${conversationId}`)
      const updatedConversation = response.data.conversation
      console.log("Conversación actualizada recibida:", updatedConversation)

      setConversations(prevConversations => {
        const newConversations = prevConversations.map(conv => 
          conv.id === conversationId ? updatedConversation : conv
        )
        // Ordenar conversaciones por fecha de último mensaje
        return newConversations.sort((a, b) => 
          new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime()
        )
      })

      // Actualizar la conversación seleccionada si es la misma
      if (selectedConversation?.id === conversationId) {
        console.log("Actualizando conversación seleccionada con nuevos datos")
        setSelectedConversation(updatedConversation)
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

  const loadConversations = async () => {
    if (isRedirecting) return

    try {
      console.log("Cargando conversaciones...")
      
      const statusResponse = await axios.get("/api/whatsapp/status")
      const hasSession = await statusResponse.data.hasExistingSession
      const isConnected = statusResponse.data.connected

      if (!hasSession) {
        console.log("No hay sesión activa, redirigiendo...")
        setIsRedirecting(true)
        router.push("/whatsapp-connect")
        return
      }

      if (!isConnected && hasSession) {
        console.log("Reconectando...")
        try {
          const initResponse = await axios.post("/api/whatsapp/initialize", {
            companyId: localStorage.getItem("companyId")
          })
          
          if (initResponse.data.connected) {
            console.log("Reconexión exitosa")
            setPhoneNumber(initResponse.data.phoneNumber)
          } else {
            console.log("Esperando reconexión...")
            return
          }
        } catch (error) {
          console.error("Error al reconectar:", error)
          return
        }
      }

      const response = await axios.get("/api/conversations")
      
      if (response.data.error) {
        console.error("Error cargando conversaciones:", response.data.error)
        return
      }

      // Ordenar conversaciones por fecha de último mensaje
      const sortedConversations = response.data.conversations.sort((a: Conversation, b: Conversation) => 
        new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime()
      )

      setConversations(sortedConversations)

      // Si no hay conversación seleccionada y hay conversaciones, seleccionar la más reciente
      if (!selectedConversation && sortedConversations.length > 0) {
        setSelectedConversation(sortedConversations[0])
        if (sortedConversations[0].unreadCount > 0) {
          markAsRead(sortedConversations[0].id)
        }
      } else if (selectedConversation) {
        // Actualizar la conversación seleccionada si existe
        const updatedSelected = sortedConversations.find(
          (conv: Conversation) => conv.id === selectedConversation.id
        )
        if (updatedSelected) {
          setSelectedConversation(updatedSelected)
        }
      }

      setError(null)
      setIsLoading(false)
    } catch (error) {
      console.error("Error cargando conversaciones:", error)
      setIsLoading(false)
    }
  }

  const handleConnectClick = () => {
    setIsRedirecting(true)
    router.push("/whatsapp-connect")
  }

  // Función para enviar mensaje
  const sendMessage = async () => {
    if (!message.trim() || !selectedConversation) return

    try {
      const response = await axios.post("/api/whatsapp/send", {
        to: selectedConversation.senderPhone,
        message: message.trim()
      })

      // Actualizar la conversación inmediatamente
      if (response.data.conversationId) {
        updateConversation(response.data.conversationId)
        scrollToBottom() // Scroll al enviar mensaje
      }

      setMessage("")
    } catch (error) {
      console.error("Error enviando mensaje:", error)
      setError("Error al enviar el mensaje")
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando conversaciones...</p>
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
            onClick={handleConnectClick}
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
          >
            Conectar WhatsApp
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Lista de conversaciones */}
      <div className="w-1/3 border-r bg-white">
        <div className="p-4 border-b">
          <h2 className="text-xl font-semibold">Conversaciones</h2>
        </div>
        <div className="overflow-y-auto h-[calc(100vh-4rem)] scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
          {conversations.map((conv) => (
            <div
              key={conv.id}
              onClick={() => {
                setSelectedConversation(conv)
                if (conv.unreadCount > 0) {
                  markAsRead(conv.id)
                }
              }}
              className={`p-4 border-b cursor-pointer hover:bg-gray-50 ${
                selectedConversation?.id === conv.id ? "bg-blue-50" : ""
              }`}
            >
              <div className="flex items-center">
                <img
                  src={conv.senderImage || "/default-avatar.png"}
                  alt={conv.senderName}
                  className="w-12 h-12 rounded-full mr-3"
                />
                <div className="flex-1">
                  <div className="flex justify-between items-center">
                    <h3 className="font-medium">{conv.senderName || conv.senderPhone}</h3>
                    {conv.unreadCount > 0 && (
                      <span className="bg-blue-500 text-white text-xs px-2 py-1 rounded-full">
                        {conv.unreadCount}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 truncate">
                    {conv.messages[conv.messages.length - 1]?.content || "Sin mensajes"}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Área de chat */}
      <div className="flex-1 flex flex-col">
        {selectedConversation ? (
          <>
            <div className="p-4 border-b bg-white">
              <div className="flex items-center">
                <img
                  src={selectedConversation.senderImage || "/default-avatar.png"}
                  alt={selectedConversation.senderName}
                  className="w-10 h-10 rounded-full mr-3"
                />
                <div>
                  <h3 className="font-medium">{selectedConversation.senderName || selectedConversation.senderPhone}</h3>
                  <p className="text-sm text-gray-500">
                    {selectedConversation.contactInfo?.status || "Sin estado"}
                  </p>
                </div>
              </div>
            </div>

            <div 
              ref={chatContainerRef}
              className="flex-1 overflow-y-auto p-4 bg-gray-50 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent"
              style={{ scrollBehavior: "smooth" }}
            >
              {selectedConversation.messages.map((msg, index) => (
                <div
                  key={index}
                  className={`mb-4 flex ${
                    msg.direction === "out" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[70%] rounded-lg p-3 ${
                      msg.direction === "out"
                        ? "bg-blue-500 text-white"
                        : "bg-white text-gray-800"
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                    <p className="text-xs mt-1 opacity-70">
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <div className="p-4 border-t bg-white">
              <div className="flex">
                <input
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && sendMessage()}
                  placeholder="Escribe un mensaje..."
                  className="flex-1 border rounded-l-lg px-4 py-2 focus:outline-none focus:border-blue-500"
                />
                <button
                  onClick={sendMessage}
                  className="bg-blue-500 text-white px-6 py-2 rounded-r-lg hover:bg-blue-600"
                >
                  Enviar
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-gray-500">Selecciona una conversación para comenzar</p>
          </div>
        )}
      </div>
    </div>
  )
}
