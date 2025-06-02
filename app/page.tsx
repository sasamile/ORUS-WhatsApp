"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { MessageSquare, Building2, Smartphone, ArrowRight, CheckCircle } from "lucide-react"
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
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-blue-50 to-purple-50 p-4">
      <div className="max-w-4xl mx-auto">
       

        

        {/* Step 1: Company Registration */}
        {step === 1 && (
          <Card className="max-w-2xl mx-auto shadow-xl border-0">
            <CardHeader className="bg-gradient-to-r from-green-50 to-blue-50 border-b">
              <CardTitle className="flex items-center space-x-2 text-2xl">
                <Building2 className="w-8 h-8 text-green-600" />
                <span>Registro de Empresa</span>
              </CardTitle>
              <CardDescription className="text-lg">
                Completa la información de tu empresa para comenzar
              </CardDescription>
            </CardHeader>
            <CardContent className="p-8">
              <form onSubmit={handleCompanySubmit} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="companyName" className="text-lg font-medium">
                    Nombre de la empresa *
                  </Label>
                  <Input
                    id="companyName"
                    value={companyData.name}
                    onChange={(e) => setCompanyData((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="Ej: Mi Empresa S.A.S"
                    className="h-12 text-lg"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description" className="text-lg font-medium">
                    Descripción de la empresa *
                  </Label>
                  <Textarea
                    id="description"
                    value={companyData.description}
                    onChange={(e) => setCompanyData((prev) => ({ ...prev, description: e.target.value }))}
                    placeholder="Describe brevemente tu empresa, productos o servicios..."
                    rows={4}
                    className="text-lg"
                    required
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full h-12 text-lg font-semibold bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    "Registrando..."
                  ) : (
                    <span className="flex items-center justify-center space-x-2">
                      <span>Continuar con WhatsApp</span>
                      <ArrowRight className="w-5 h-5" />
                    </span>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Step 2: WhatsApp Connection */}
        {step === 2 && (
          <Card className="max-w-2xl mx-auto shadow-xl border-0">
            <CardHeader className="bg-gradient-to-r from-green-50 to-blue-50 border-b">
              <CardTitle className="flex items-center space-x-2 text-2xl">
                <Smartphone className="w-8 h-8 text-green-600" />
                <span>Conectar WhatsApp</span>
              </CardTitle>
              <CardDescription className="text-lg">
                Ahora conectaremos tu WhatsApp para recibir mensajes
              </CardDescription>
            </CardHeader>
            <CardContent className="p-8 text-center space-y-6">
              <div className="bg-green-50 p-8 rounded-xl border border-green-200">
                <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
                <h3 className="text-2xl font-semibold mb-2">¡Empresa registrada exitosamente!</h3>
                <p className="text-gray-600 text-lg mb-4">
                  Empresa: <strong>{companyData.name}</strong>
                </p>
              </div>
              <Button
                onClick={goToWhatsAppConnection}
                className="w-full h-12 text-lg font-semibold bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700"
              >
                <span className="flex items-center justify-center space-x-2">
                  <span>Conectar WhatsApp</span>
                  <ArrowRight className="w-5 h-5" />
                </span>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
