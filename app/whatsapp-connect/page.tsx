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
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    const companyId = localStorage.getItem("companyId")
    if (!companyId) {
      setError("No se encontró el ID de la compañía")
      setIsLoading(false)
      return
    }
    initializeWhatsApp(companyId)
  }, [])

  const initializeWhatsApp = async (companyId: string) => {
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

      if (response.data.connected && response.data.phoneNumber) {
        console.log("WhatsApp conectado con número:", response.data.phoneNumber)
        setIsConnected(true)
        setPhoneNumber(response.data.phoneNumber)
        router.push("/chat")
      } else if (response.data.qrCode) {
        console.log("Código QR recibido, mostrando...")
        setQrCode(response.data.qrCode)
      } else {
        console.log("No se recibió código QR o número")
        setError("No se pudo generar el código QR. Intente nuevamente.")
      }
    } catch (error: any) {
      console.error("Error al inicializar WhatsApp:", error)
      setError(error.response?.data?.error || "Error al conectar con WhatsApp")
    } finally {
      setIsLoading(false)
    }
  }

  const handleRetry = async () => {
    const companyId = localStorage.getItem("companyId")
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
      
      // Limpiar sesión actual
      await axios.post("/api/whatsapp/clear-session")
      
      // Reiniciar la conexión
      await initializeWhatsApp(companyId)
    } catch (error: any) {
      console.error("Error al reintentar conexión:", error)
      setError(error.response?.data?.error || "Error al reintentar la conexión")
    } finally {
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
