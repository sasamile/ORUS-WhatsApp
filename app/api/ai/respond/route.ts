import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { whatsappService } from "@/lib/whatsapp"
import OpenAI from "openai"
import { GoogleGenerativeAI } from "@google/generative-ai"

// Inicializar clientes de IA
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "")

interface Message {
  content: string
  direction: "in" | "out"
  timestamp: string
  isAI: boolean
  imageUrl?: string | null
}

interface ContactInfo {
  name?: string
  lastInteraction?: string
  preferences?: Record<string, any>
}

type ChatRole = "system" | "user" | "assistant" | "function" | "tool"

interface ChatMessage {
  role: ChatRole
  content: string
  name?: string
}

// Función auxiliar para extraer preferencias del mensaje
function extractPreferences(message: string): Record<string, any> {
  const preferences: Record<string, any> = {}
  
  // Extraer horarios mencionados
  const timePattern = /\b\d{1,2}:\d{2}\b/g
  const times = message.match(timePattern)
  if (times) {
    preferences.mentionedTimes = times
  }

  // Extraer fechas mencionadas
  const datePattern = /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g
  const dates = message.match(datePattern)
  if (dates) {
    preferences.mentionedDates = dates
  }

  // Extraer productos o servicios mencionados
  const productPattern = /(?:producto|servicio|item|artículo)\s+([^.,!?]+)/gi
  const products = Array.from(message.matchAll(productPattern)).map(match => match[1].trim())
  if (products.length > 0) {
    preferences.mentionedProducts = products
  }

  return preferences
}

// Función para extraer nombre del mensaje
function extractName(message: string): string | undefined {
  // Patrones comunes para identificar nombres
  const patterns = [
    /me llamo\s+([A-Za-zÀ-ÿ\s]+)/i,
    /mi nombre es\s+([A-Za-zÀ-ÿ\s]+)/i,
    /soy\s+([A-Za-zÀ-ÿ\s]+)/i,
    /^([A-Za-zÀ-ÿ\s]+)$/ // Si el mensaje completo parece un nombre
  ]

  for (const pattern of patterns) {
    const match = message.match(pattern)
    if (match && match[1]) {
      const name = match[1].trim()
      // Verificar que el nombre tenga al menos 2 caracteres y no sea muy largo
      if (name.length >= 2 && name.length <= 50) {
        return name
      }
    }
  }

  return undefined
}

export async function POST(request: NextRequest) {
  try {
    console.log("Iniciando procesamiento de mensaje...")
    const { conversationId, message, senderPhone } = await request.json()
    console.log("Datos recibidos:", { conversationId, message, senderPhone })

    if (!conversationId || !message || !senderPhone) {
      console.error("Faltan parámetros:", { conversationId, message, senderPhone })
      return NextResponse.json(
        { error: "Faltan parámetros requeridos" },
        { status: 400 }
      )
    }

    // Obtener la conversación y la compañía
    console.log("Buscando conversación con ID:", conversationId)
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { 
        company: true
      }
    })

    if (!conversation) {
      console.error("Conversación no encontrada:", conversationId)
      return NextResponse.json(
        { error: "Conversación no encontrada" },
        { status: 404 }
      )
    }

    console.log("Conversación encontrada:", {
      id: conversation.id,
      companyId: conversation.companyId,
      aiEnabled: conversation.aiEnabled
    })

    // Verificar que la compañía exista
    console.log("Buscando compañía con ID:", conversation.companyId)
    const company = await prisma.company.findUnique({
      where: { id: conversation.companyId }
    })

    if (!company) {
      console.error("Compañía no encontrada:", conversation.companyId)
      return NextResponse.json(
        { error: "Compañía no encontrada" },
        { status: 404 }
      )
    }

    console.log("Información de la empresa encontrada:", {
      companyId: company.id,
      companyName: company.name,
      companyDescription: company.description
    })

    // Verificar que la información de la empresa sea válida
    if (!company.name || !company.description) {
      console.error("Información de la empresa incompleta:", {
        name: company.name,
        description: company.description
      })
      return NextResponse.json(
        { error: "Información de la empresa incompleta" },
        { status: 400 }
      )
    }

    // Verificar API keys
    console.log("Verificando API keys...")
    if (!process.env.OPENAI_API_KEY) {
      console.error("No se encontró OPENAI_API_KEY")
      return NextResponse.json(
        { error: "Configuración de OpenAI incompleta" },
        { status: 500 }
      )
    }

    if (!process.env.GEMINI_API_KEY) {
      console.error("No se encontró GEMINI_API_KEY")
      return NextResponse.json(
        { error: "Configuración de Gemini incompleta" },
        { status: 500 }
      )
    }

    // Esperar 3 segundos para asegurarnos de que no hay más mensajes entrantes
    await new Promise(resolve => setTimeout(resolve, 3000))

    // Obtener los últimos mensajes para contexto
    const rawMessages = conversation.messages as unknown as Message[]
    const messages = Array.isArray(rawMessages) ? rawMessages : []
    const lastMessages = messages.slice(-5) // Últimos 5 mensajes para contexto

    console.log("Historial de mensajes:", lastMessages.map(m => ({
      direction: m.direction,
      content: m.content
    })))

    // Extraer nombre del mensaje actual si no hay nombre guardado
    let extractedName = conversation.senderName
    if (!extractedName) {
      extractedName = extractName(message) || senderPhone
    }

    // Preparar el contexto para la IA
    const context = {
      companyName: company.name,
      companyDescription: company.description,
      contactInfo: (conversation.contactInfo as ContactInfo) || {},
      senderName: extractedName,
      conversationHistory: lastMessages.map(msg => ({
        role: msg.direction === "in" ? "user" : "assistant" as ChatRole,
        content: msg.content
      }))
    }

    console.log("Contexto preparado para la IA:", {
      companyName: context.companyName,
      companyDescription: context.companyDescription,
      senderName: context.senderName,
      messageCount: context.conversationHistory.length
    })

    let aiResponse: string
    let contactInfo: ContactInfo = {}

    try {
      // Intentar primero con OpenAI
      console.log("Intentando generar respuesta con OpenAI...")
      const openaiMessages = [
        {
          role: "system" as const,
          content: `Eres un asistente virtual para ${context.companyName}. 
          ${context.companyDescription ? `Información de la empresa: ${context.companyDescription}` : ''}
          Tu objetivo es ayudar a los clientes de manera profesional y amigable.
          
          Instrucciones importantes:
          1. Si el cliente no ha proporcionado su nombre, pregúntale amablemente cómo se llama.
          2. Identifica y guarda información relevante sobre preferencias, horarios o necesidades.
          3. Responde de manera concisa y útil.
          4. Mantén un tono profesional pero amigable.
          5. Si el cliente menciona su nombre, asegúrate de usarlo en tus respuestas.
          6. Siempre responde en el contexto de ${context.companyName} y sus servicios/productos.`
        },
        ...context.conversationHistory.map(msg => ({
          role: msg.role as "user" | "assistant",
          content: msg.content
        })),
        { role: "user" as const, content: message }
      ]

      console.log("Mensajes enviados a OpenAI:", JSON.stringify(openaiMessages, null, 2))

      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: openaiMessages,
        temperature: 0.7,
        max_tokens: 150
      })

      if (!completion.choices[0]?.message?.content) {
        throw new Error("No se recibió respuesta de OpenAI")
      }

      aiResponse = completion.choices[0].message.content
      console.log("Respuesta generada con OpenAI:", aiResponse)
      
      // Extraer información del contacto del contexto y la respuesta
      contactInfo = {
        name: extractedName || undefined,
        lastInteraction: new Date().toISOString(),
        preferences: {
          ...(context.contactInfo.preferences || {}),
          ...extractPreferences(aiResponse)
        }
      }

    } catch (error: unknown) {
      console.error("Error detallado con OpenAI:", error)
      
      // Si OpenAI falla, intentar con Gemini
      console.log("Intentando generar respuesta con Gemini...")
      try {
        const model = genai.getGenerativeModel({ model: "gemini-pro" })
        const result = await model.generateContent([
          `Eres un asistente virtual para ${context.companyName}. 
          ${context.companyDescription ? `Información de la empresa: ${context.companyDescription}` : ''}
          Tu objetivo es ayudar a los clientes de manera profesional y amigable.
          
          Instrucciones importantes:
          1. Si el cliente no ha proporcionado su nombre, pregúntale amablemente cómo se llama.
          2. Identifica y guarda información relevante sobre preferencias, horarios o necesidades.
          3. Responde de manera concisa y útil.
          4. Mantén un tono profesional pero amigable.
          5. Si el cliente menciona su nombre, asegúrate de usarlo en tus respuestas.
          6. Siempre responde en el contexto de ${context.companyName} y sus servicios/productos.
          
          Historial de conversación:
          ${context.conversationHistory.map(msg => `${msg.role}: ${msg.content}`).join('\n')}
          
          Mensaje actual: ${message}`
        ])

        if (!result.response?.text()) {
          throw new Error("No se recibió respuesta de Gemini")
        }

        aiResponse = result.response.text()
        console.log("Respuesta generada con Gemini:", aiResponse)
        
        // Extraer información del contacto del contexto y la respuesta
        contactInfo = {
          name: extractedName || undefined,
          lastInteraction: new Date().toISOString(),
          preferences: {
            ...(context.contactInfo.preferences || {}),
            ...extractPreferences(aiResponse)
          }
        }
      } catch (geminiError: unknown) {
        console.error("Error detallado con Gemini:", geminiError)
        throw new Error(`Error con ambos modelos de IA: ${(error as Error).message}, ${(geminiError as Error).message}`)
      }
    }

    // Crear el mensaje de IA
    const aiMessage = {
      content: aiResponse,
      direction: "out",
      timestamp: new Date().toISOString(),
      isAI: true,
      imageUrl: null,
      messageId: `ai_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      read: true
    } as const

    // Actualizar la conversación con el nuevo mensaje y la información del contacto
    const updatedConversation = await prisma.$transaction(async (tx) => {
      // Obtener la conversación actualizada
      const currentConversation = await tx.conversation.findUnique({
        where: { id: conversationId },
        select: { messages: true }
      })

      if (!currentConversation) {
        throw new Error("Conversación no encontrada")
      }

      const currentMessages = Array.isArray(currentConversation.messages) ? currentConversation.messages : []
      
      // Verificar si el mensaje ya existe
      const messageExists = currentMessages.some((msg: any) => 
        msg.messageId === aiMessage.messageId || 
        (msg.timestamp === aiMessage.timestamp && 
         msg.content === aiMessage.content &&
         msg.direction === aiMessage.direction)
      )

      if (messageExists) {
        console.log("Mensaje ya existe, ignorando...")
        return currentConversation
      }

      // Actualizar la conversación
      return await tx.conversation.update({
        where: { id: conversationId },
        data: {
          messages: [...currentMessages, aiMessage] as any,
          contactInfo: {
            ...(conversation.contactInfo as ContactInfo || {}),
            ...contactInfo,
            name: contactInfo.name || conversation.senderName || conversation.senderPhone
          },
          senderName: contactInfo.name || conversation.senderName || conversation.senderPhone,
          lastUpdated: new Date()
        }
      })
    }, {
      maxWait: 5000, // 5 segundos máximo de espera
      timeout: 10000 // 10 segundos máximo de timeout
    })

    // Enviar la respuesta a través de WhatsApp
    console.log("Enviando respuesta por WhatsApp...")
    try {
      const sendResult = await whatsappService.sendMessage(
        conversation.companyId,
        senderPhone,
        aiResponse,
        true // Indicar que es una respuesta de IA
      )
      console.log("Resultado del envío por WhatsApp:", sendResult)
    } catch (whatsappError: unknown) {
      console.error("Error detallado enviando mensaje por WhatsApp:", whatsappError)
      throw new Error(`Error enviando mensaje por WhatsApp: ${(whatsappError as Error).message}`)
    }

    console.log("Respuesta enviada exitosamente")
    return NextResponse.json({ success: true, response: aiResponse })
  } catch (error: unknown) {
    console.error("Error detallado en la respuesta de IA:", error)
    return NextResponse.json(
      { 
        error: "Error procesando la respuesta de IA",
        details: (error as Error).message
      },
      { status: 500 }
    )
  }
}
