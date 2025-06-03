"use client"

import type React from "react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { MessageSquare, Building2, Smartphone, ArrowRight, CheckCircle, Zap, Users, Shield } from "lucide-react"
import { useRouter } from "next/navigation"

export default function HomePage() {
  const [step, setStep] = useState(1)
  const [companyData, setCompanyData] = useState({
    name: "",
    description: "",
  })
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const handleCompanySubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!companyData.name.trim() || !companyData.description.trim()) {
      alert("Por favor completa todos los campos")
      return
    }

    setIsLoading(true)
    try {
      const response = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(companyData),
      })

      if (response.ok) {
        const result = await response.json()
        localStorage.setItem("companyId", result.id)
        setStep(2)
      } else {
        alert("Error al registrar la empresa")
      }
    } catch (error) {
      console.error("Error:", error)
      alert("Error al registrar la empresa")
    } finally {
      setIsLoading(false)
    }
  }

  const goToWhatsAppConnection = () => {
    router.push("/whatsapp-connect")
  }

  return (
    <div className="min-h-screen bg-black text-white overflow-hidden relative">
      {/* Animated background */}
      <div className="absolute inset-0">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-green-500/10 rounded-full blur-3xl animate-pulse delay-500"></div>
      </div>

      {/* Grid pattern overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:50px_50px]"></div>

      <div className="relative z-10">
        {step === 1 && (
          <div className="min-h-screen flex">
            {/* Left side - Hero */}
            <div className="flex-1 flex flex-col justify-center px-12 lg:px-20">
              <div className="max-w-2xl">
                <div className="flex items-center space-x-3 mb-8">
                  <div className="relative">
                    <MessageSquare className="w-12 h-12 text-green-400" />
                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-400 rounded-full animate-ping"></div>
                  </div>
                  <span className="text-2xl font-bold bg-gradient-to-r from-green-400 to-blue-400 bg-clip-text text-transparent">
                    WhatsApp Business AI
                  </span>
                </div>

                <h1 className="text-6xl lg:text-7xl font-black mb-6 leading-tight">
                  Conecta tu
                  <span className="block bg-gradient-to-r from-green-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">
                    Negocio
                  </span>
                  al Futuro
                </h1>

                <p className="text-xl text-gray-300 mb-8 leading-relaxed">
                  Automatiza tus conversaciones de WhatsApp con inteligencia artificial avanzada. Responde a tus
                  clientes 24/7 y nunca pierdas una venta.
                </p>

                <div className="flex flex-wrap gap-6 mb-12">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-green-500/20 rounded-lg flex items-center justify-center">
                      <Zap className="w-4 h-4 text-green-400" />
                    </div>
                    <span className="text-gray-300">IA Avanzada</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center">
                      <Users className="w-4 h-4 text-blue-400" />
                    </div>
                    <span className="text-gray-300">Multi-usuario</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-purple-500/20 rounded-lg flex items-center justify-center">
                      <Shield className="w-4 h-4 text-purple-400" />
                    </div>
                    <span className="text-gray-300">100% Seguro</span>
                  </div>
                </div>

                <Button
                  onClick={() => document.getElementById("form-section")?.scrollIntoView({ behavior: "smooth" })}
                  className="bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600 text-white px-8 py-4 text-lg font-semibold rounded-2xl shadow-2xl hover:shadow-green-500/25 transition-all duration-300 transform hover:scale-105"
                >
                  Comenzar Ahora
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </div>
            </div>

            {/* Right side - Form */}
            <div className="flex-1 flex items-center justify-center p-12" id="form-section">
              <div className="w-full max-w-md">
                <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl">
                  <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-gradient-to-r from-green-500 to-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
                      <Building2 className="w-8 h-8 text-white" />
                    </div>
                    <h2 className="text-2xl font-bold mb-2">Registra tu Empresa</h2>
                    <p className="text-gray-400">Paso 1 de 2</p>
                  </div>

                  <form onSubmit={handleCompanySubmit} className="space-y-6">
                    <div className="space-y-2">
                      <Label htmlFor="companyName" className="text-white font-medium">
                        Nombre de la empresa
                      </Label>
                      <Input
                        id="companyName"
                        value={companyData.name}
                        onChange={(e) => setCompanyData((prev) => ({ ...prev, name: e.target.value }))}
                        placeholder="Ej: Mi Empresa S.A.S"
                        className="bg-white/10 border-white/20 text-white placeholder:text-gray-400 rounded-xl h-12 focus:bg-white/20 transition-all"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="description" className="text-white font-medium">
                        Descripción
                      </Label>
                      <Textarea
                        id="description"
                        value={companyData.description}
                        onChange={(e) => setCompanyData((prev) => ({ ...prev, description: e.target.value }))}
                        placeholder="Describe tu empresa..."
                        rows={4}
                        className="bg-white/10 border-white/20 text-white placeholder:text-gray-400 rounded-xl focus:bg-white/20 transition-all resize-none"
                        required
                      />
                    </div>
                    <Button
                      type="submit"
                      className="w-full bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600 text-white h-12 rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all duration-300"
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <div className="flex items-center space-x-2">
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          <span>Registrando...</span>
                        </div>
                      ) : (
                        "Continuar"
                      )}
                    </Button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="min-h-screen flex items-center justify-center p-8">
            <div className="max-w-2xl w-full text-center">
              <div className="relative mb-12">
                <div className="w-32 h-32 bg-gradient-to-r from-green-500 to-blue-500 rounded-full flex items-center justify-center mx-auto mb-8 relative">
                  <CheckCircle className="w-16 h-16 text-white" />
                  <div className="absolute inset-0 bg-gradient-to-r from-green-500 to-blue-500 rounded-full animate-ping opacity-20"></div>
                </div>
                <h1 className="text-5xl font-black mb-4">
                  ¡Empresa
                  <span className="block bg-gradient-to-r from-green-400 to-blue-400 bg-clip-text text-transparent">
                    Registrada!
                  </span>
                </h1>
                <p className="text-xl text-gray-300 mb-8">
                  <strong className="text-green-400">{companyData.name}</strong> ha sido configurada exitosamente
                </p>
              </div>

              <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 mb-8">
                <h3 className="text-2xl font-bold mb-4">Siguiente Paso</h3>
                <p className="text-gray-300 mb-6">
                  Ahora vamos a conectar tu WhatsApp Business para comenzar a recibir y responder mensajes
                  automáticamente
                </p>
                <div className="flex items-center justify-center space-x-4 text-sm text-gray-400">
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                    <span>Empresa registrada</span>
                  </div>
                  <div className="w-8 h-px bg-gray-600"></div>
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-gray-600 rounded-full"></div>
                    <span>Conectar WhatsApp</span>
                  </div>
                </div>
              </div>

              <Button
                onClick={goToWhatsAppConnection}
                className="bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600 text-white px-12 py-4 text-lg font-semibold rounded-2xl shadow-2xl hover:shadow-green-500/25 transition-all duration-300 transform hover:scale-105"
              >
                <Smartphone className="w-6 h-6 mr-3" />
                Conectar WhatsApp
                <ArrowRight className="w-5 h-5 ml-3" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
