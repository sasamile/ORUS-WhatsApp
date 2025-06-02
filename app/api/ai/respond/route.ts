import { type NextRequest, NextResponse } from "next/server"
import { generateText } from "ai"
import { openai } from "@ai-sdk/openai"
import { google } from "@ai-sdk/google"
import { prisma } from "@/lib/prisma"
import { whatsappService } from "@/lib/whatsapp"

export async function POST(request: NextRequest) {
  try {
    const { conversationId, message, senderPhone } = await request.json()

    // Get conversation and company info
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { company: true },
    })

    if (!conversation || !conversation.aiEnabled) {
      return NextResponse.json({ error: "AI not enabled for this conversation" }, { status: 400 })
    }

    // Get conversation history for context
    const messages = conversation.messages as any[]
    const recentMessages = messages.slice(-10) // Last 10 messages for context

    // Create context for AI
    const context = `
Eres un asistente de atención al cliente para ${conversation.company.name}.
Descripción de la empresa: ${conversation.company.description}

Historial de conversación reciente:
${recentMessages.map((m) => `${m.direction === "in" ? "Cliente" : "Empresa"}: ${m.content}`).join("\n")}

Responde de manera profesional, útil y amigable. Mantén las respuestas concisas pero informativas.
`

    // Try OpenAI first, fallback to Gemini
    let aiResponse: string
    try {
      const { text } = await generateText({
        model: openai("gpt-4o-mini"),
        system: context,
        prompt: `Cliente dice: ${message}`,
        maxTokens: 150,
      })
      aiResponse = text
    } catch (openaiError) {
      console.log("OpenAI failed, trying Gemini:", openaiError)
      try {
        const { text } = await generateText({
          model: google("gemini-1.5-flash"),
          system: context,
          prompt: `Cliente dice: ${message}`,
          maxTokens: 150,
        })
        aiResponse = text
      } catch (geminiError) {
        console.error("Both AI providers failed:", geminiError)
        aiResponse = "Lo siento, no puedo responder en este momento. Un agente humano te contactará pronto."
      }
    }

    // Send AI response via WhatsApp
    await whatsappService.sendMessage(senderPhone, aiResponse)

    // Save AI response to database
    const phoneNumber = whatsappService.getPhoneNumber()
    if (phoneNumber) {
      await saveMessage(phoneNumber, senderPhone, aiResponse, "out", true)
    }

    return NextResponse.json({ response: aiResponse })
  } catch (error) {
    console.error("Error generating AI response:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

async function saveMessage(
  companyPhone: string,
  senderPhone: string,
  content: string,
  direction: "in" | "out",
  isAI = false,
) {
  try {
    const company = await prisma.company.findFirst({
      where: { phoneNumber: companyPhone },
    })

    if (!company) return

    const timestamp = new Date().toISOString()
    const newMessage = {
      content,
      direction,
      timestamp,
      isAI,
    }

    const existingConversation = await prisma.conversation.findFirst({
      where: {
        companyId: company.id,
        senderPhone,
      },
    })

    if (existingConversation) {
      const updatedMessages = [...(existingConversation.messages as any[]), newMessage]
      await prisma.conversation.update({
        where: { id: existingConversation.id },
        data: {
          messages: updatedMessages,
          lastUpdated: new Date(),
        },
      })
    }
  } catch (error) {
    console.error("Error saving AI message:", error)
  }
}
