"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { QrCode, CheckCircle, Loader2, RefreshCw } from "lucide-react"
import { useRouter } from "next/navigation"
import axios from "axios"
import { Button } from "@/components/ui/button"

export default function WhatsAppConnectPage() {
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null)
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    // Obtener companyId del localStorage
    const storedCompanyId = localStorage.getItem("companyId")
    if (!storedCompanyId) {
      console.error("No se encontró el ID de la compañía")
      setError("No se encontró el ID de la compañía. Por favor, inicie sesión nuevamente.")
      return
    }
    setCompanyId(storedCompanyId)
  }, [])

  useEffect(() => {
    if (!companyId) return // No hacer nada si no hay companyId

    const checkStatus = async () => {
      try {
        const response = await axios.get("/api/whatsapp/status")
        const { connected, hasExistingSession, phoneNumber: statusPhoneNumber } = response.data

        console.log("Estado de WhatsApp:", response.data)

        // Solo considerar conectado si hay número de teléfono
        if (connected && statusPhoneNumber) {
          console.log("WhatsApp conectado con número:", statusPhoneNumber)
          setIsConnected(true)
          setPhoneNumber(statusPhoneNumber)
          setIsLoading(false)
          // Redirigir inmediatamente
          router.push("/chat")
          return
        }

        // Si no está conectado y no hay QR, inicializar
        if (!qrCode && !isConnected) {
          console.log("Iniciando conexión de WhatsApp...")
          await initializeWhatsApp()
        }
      } catch (error) {
        console.error("Error verificando estado:", error)
        setError("Error al verificar el estado de WhatsApp")
        setIsLoading(false)
      }
    }

    checkStatus()
  }, [companyId, router, qrCode, isConnected])

  const initializeWhatsApp = async () => {
    if (!companyId) {
      setError("No se encontró el ID de la compañía")
      return
    }

    try {
      setIsLoading(true)
      setError(null)
      setQrCode(null)
      setIsConnected(false)
      setPhoneNumber(null)

      console.log("Inicializando WhatsApp...")
      const response = await axios.post("/api/whatsapp/initialize", {
        companyId: companyId
      })

      console.log("Respuesta de inicialización:", response.data)

      // Solo considerar conectado si hay número de teléfono
      if (response.data.connected && response.data.phoneNumber) {
        console.log("WhatsApp conectado con número:", response.data.phoneNumber)
        setIsConnected(true)
        setPhoneNumber(response.data.phoneNumber)
        setIsLoading(false)
        router.push("/chat")
      } else if (response.data.qrCode) {
        console.log("Código QR recibido, mostrando...")
        setQrCode(response.data.qrCode)
        setIsLoading(false)
      } else {
        console.log("No se recibió código QR o número")
        setIsLoading(false)
        setError("No se pudo generar el código QR. Intente nuevamente.")
      }
    } catch (error: any) {
      console.error("Error al inicializar WhatsApp:", error)
      setError(error.response?.data?.message || "Error al conectar con WhatsApp")
      setIsLoading(false)
    }
  }

  const handleRetry = async () => {
    if (!companyId) {
      setError("No se encontró el ID de la compañía")
      return
    }

    try {
      setIsLoading(true)
      setError(null)
      setQrCode(null)
      setIsConnected(false)
      setPhoneNumber(null)
      
      // Limpiar todas las sesiones
      await axios.post("/api/whatsapp/clear-session")
      await axios.post("/api/whatsapp/clear-all-sessions")
      
      // Esperar un momento para asegurar que las sesiones se limpien
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      // Reiniciar la conexión
      await initializeWhatsApp()
    } catch (error: any) {
      console.error("Error al reintentar conexión:", error)
      setError(error.response?.data?.message || "Error al reintentar la conexión")
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 p-4">
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <QrCode className="w-6 h-6" />
              <span>Conectar WhatsApp</span>
            </CardTitle>
            <CardDescription>Escanea el código QR para conectar tu WhatsApp</CardDescription>
          </CardHeader>
          <CardContent className="text-center space-y-6">
            {error && (
              <div className="bg-red-50 p-4 rounded-lg text-red-700">
                <p>{error}</p>
              </div>
            )}

            {isLoading && !qrCode && !isConnected && (
              <div className="flex flex-col items-center space-y-4">
                <Loader2 className="w-8 h-8 animate-spin text-green-600" />
                <p>Generando código QR...</p>
              </div>
            )}

            {qrCode && !isConnected && (
              <div className="space-y-4">
                <div className="bg-white p-6 rounded-lg border-2 border-dashed border-gray-300">
                  <img 
                    src={qrCode} 
                    alt="QR Code" 
                    className="mx-auto w-64 h-64"
                  />
                </div>
                <div className="text-left bg-blue-50 p-4 rounded-lg">
                  <h3 className="font-semibold mb-2">Instrucciones:</h3>
                  <ol className="list-decimal list-inside space-y-1 text-sm">
                    <li>Abre WhatsApp en tu teléfono</li>
                    <li>Ve a Configuración → Dispositivos vinculados</li>
                    <li>Toca "Vincular un dispositivo"</li>
                    <li>Escanea este código QR</li>
                  </ol>
                </div>
                <Button 
                  variant="outline" 
                  onClick={handleRetry}
                  className="w-full"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Generar Nuevo QR
                </Button>
              </div>
            )}

            {isConnected && (
              <div className="space-y-4">
                <CheckCircle className="w-16 h-16 text-green-600 mx-auto" />
                <div className="bg-green-50 p-4 rounded-lg">
                  <h3 className="text-lg font-semibold text-green-800">¡Conectado exitosamente!</h3>
                  <p className="text-green-700">Número: {phoneNumber}</p>
                  <p className="text-sm text-green-600 mt-2">Redirigiendo al chat...</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
