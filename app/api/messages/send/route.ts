import { type NextRequest, NextResponse } from "next/server"
import { whatsappService } from "@/lib/whatsapp"
import { prisma } from "@/lib/prisma"

export async function POST(request: NextRequest) {
  try {
    const { to, message } = await request.json()

    if (!to || !message) {
      return NextResponse.json({ error: "To and message are required" }, { status: 400 })
    }

    // Send message via WhatsApp
    await whatsappService.sendMessage(to, message)

    // Save message to database
    const phoneNumber = whatsappService.getPhoneNumber()
    if (phoneNumber) {
      await saveMessage(phoneNumber, to, message, "out")
    }

    return NextResponse.json({ status: "sent" })
  } catch (error) {
    console.error("Error sending message:", error)
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

    // Find existing conversation
    const existingConversation = await prisma.conversation.findFirst({
      where: {
        companyId: company.id,
        senderPhone,
      },
    })

    if (existingConversation) {
      // Update existing conversation
      const updatedMessages = [...(existingConversation.messages as any[]), newMessage]
      await prisma.conversation.update({
        where: { id: existingConversation.id },
        data: {
          messages: updatedMessages,
          lastUpdated: new Date(),
        },
      })
    } else {
      // Create new conversation
      await prisma.conversation.create({
        data: {
          companyId: company.id,
          senderPhone,
          companyPhone,
          messages: [newMessage],
          lastUpdated: new Date(),
          aiEnabled: false,
        },
      })
    }
  } catch (error) {
    console.error("Error saving message:", error)
  }
}
