"use client"

import { useState, useEffect } from "react"
import { QrCode, CheckCircle, Loader2, RefreshCw, Wifi, ArrowLeft } from "lucide-react"
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

      const response = await axios.post("/api/whatsapp/initialize", {
        companyId: companyId,
      })

      if (response.data.connected && response.data.phoneNumber) {
        setIsConnected(true)
        setPhoneNumber(response.data.phoneNumber)
        setTimeout(() => router.push("/chat"), 3000)
      } else if (response.data.qrCode) {
        setQrCode(response.data.qrCode)
      } else {
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

      await axios.post("/api/whatsapp/clear-session")
      await initializeWhatsApp(companyId)
    } catch (error: any) {
      console.error("Error al reintentar conexión:", error)
      setError(error.response?.data?.error || "Error al reintentar la conexión")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-green-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>

      {/* Grid pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:50px_50px]"></div>

      <div className="relative z-10 min-h-screen flex flex-col">
        {/* Header */}
        <div className="p-8">
          <Button variant="ghost" onClick={() => router.back()} className="text-white hover:bg-white/10 rounded-xl">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Volver
          </Button>
        </div>

        <div className="flex-1 flex items-center justify-center p-8">
          <div className="max-w-4xl w-full">
            {/* Header */}
            <div className="text-center mb-12">
              <div className="relative mb-8">
                <div className="w-24 h-24 bg-gradient-to-r from-green-500 to-blue-500 rounded-3xl flex items-center justify-center mx-auto">
                  <QrCode className="w-12 h-12 text-white" />
                </div>
                <div className="absolute top-0 right-1/2 transform translate-x-8 -translate-y-2">
                  <Wifi className="w-8 h-8 text-green-400 animate-pulse" />
                </div>
              </div>
              <h1 className="text-5xl font-black mb-4">
                Conectar
                <span className="block bg-gradient-to-r from-green-400 to-blue-400 bg-clip-text text-transparent">
                  WhatsApp
                </span>
              </h1>
              <p className="text-xl text-gray-300">Escanea el código QR para vincular tu cuenta de WhatsApp Business</p>
            </div>

            {error && (
              <div className="max-w-md mx-auto mb-8">
                <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6 text-center">
                  <div className="w-12 h-12 bg-red-500/20 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <span className="text-red-400 text-2xl">⚠️</span>
                  </div>
                  <p className="text-red-400 font-medium">{error}</p>
                </div>
              </div>
            )}

            {isLoading && !qrCode && !isConnected && (
              <div className="text-center">
                <div className="relative mb-8">
                  <div className="w-32 h-32 border-4 border-green-500/20 border-t-green-500 rounded-full animate-spin mx-auto"></div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 text-green-400" />
                  </div>
                </div>
                <h3 className="text-2xl font-bold mb-4">Preparando conexión...</h3>
                <p className="text-gray-400">Generando código QR seguro</p>
              </div>
            )}

            {qrCode && !isConnected && (
              <div className="grid lg:grid-cols-2 gap-12 items-center">
                {/* QR Code */}
                <div className="text-center">
                  <div className="relative inline-block">
                    <div className="bg-white p-8 rounded-3xl shadow-2xl">
                      <img src={qrCode || "/placeholder.svg"} alt="QR Code" className="w-80 h-80" />
                    </div>
                    <div className="absolute -top-4 -right-4 w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                      <span className="text-white text-sm font-bold">QR</span>
                    </div>
                  </div>
                  <Button
                    onClick={handleRetry}
                    variant="outline"
                    className="mt-8 border-white/20 text-white hover:bg-white/10 rounded-xl px-6 py-3"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Generar Nuevo QR
                  </Button>
                </div>

                {/* Instructions */}
                <div className="space-y-8">
                  <div>
                    <h3 className="text-3xl font-bold mb-6">Cómo conectar</h3>
                    <div className="space-y-6">
                      {[
                        { step: 1, text: "Abre WhatsApp en tu teléfono", icon: "📱" },
                        { step: 2, text: "Ve a Configuración → Dispositivos vinculados", icon: "⚙️" },
                        { step: 3, text: 'Toca "Vincular un dispositivo"', icon: "🔗" },
                        { step: 4, text: "Escanea este código QR", icon: "📷" },
                      ].map((item) => (
                        <div key={item.step} className="flex items-center space-x-4">
                          <div className="w-12 h-12 bg-gradient-to-r from-green-500 to-blue-500 rounded-xl flex items-center justify-center font-bold text-white">
                            {item.step}
                          </div>
                          <div className="flex-1">
                            <p className="text-lg text-gray-300">{item.text}</p>
                          </div>
                          <div className="text-2xl">{item.icon}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
                    <h4 className="font-bold text-lg mb-3 text-yellow-400">💡 Consejos importantes</h4>
                    <ul className="space-y-2 text-gray-300 text-sm">
                      <li>• Mantén tu teléfono cerca del código QR</li>
                      <li>• Asegúrate de tener buena conexión a internet</li>
                      <li>• El código QR expira después de unos minutos</li>
                      <li>• Si no funciona, genera un nuevo código</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {isConnected && (
              <div className="text-center">
                <div className="relative mb-8">
                  <div className="w-32 h-32 bg-gradient-to-r from-green-500 to-blue-500 rounded-full flex items-center justify-center mx-auto">
                    <CheckCircle className="w-16 h-16 text-white" />
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-r from-green-500 to-blue-500 rounded-full animate-ping opacity-20"></div>
                </div>
                <h3 className="text-4xl font-black mb-4">
                  ¡Conectado
                  <span className="block bg-gradient-to-r from-green-400 to-blue-400 bg-clip-text text-transparent">
                    Exitosamente!
                  </span>
                </h3>
                <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 max-w-md mx-auto mb-8">
                  <p className="text-green-400 font-bold text-lg">Número: {phoneNumber}</p>
                </div>
                <p className="text-gray-300 mb-4">Redirigiendo al chat en 3 segundos...</p>
                <div className="flex justify-center">
                  <div className="w-16 h-1 bg-gray-700 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-green-400 to-blue-400 rounded-full animate-pulse"></div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
