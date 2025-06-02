"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { 
  Smartphone, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  RefreshCw,
  Trash2,
  Settings,
  Users
} from "lucide-react"
import axios from "axios"

interface CompanyWhatsApp {
  id: string
  name: string
  phoneNumber: string | null
  isActive: boolean
  lastConnection: string | null
  conversationCount: number
}

export default function WhatsAppAdminPage() {
  const [companies, setCompanies] = useState<CompanyWhatsApp[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  useEffect(() => {
    loadCompanies()
  }, [])

  const loadCompanies = async () => {
    try {
      setIsLoading(true)
      const response = await axios.get('/api/admin/whatsapp/companies')
      setCompanies(response.data)
      setError(null)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error cargando compañías')
    } finally {
      setIsLoading(false)
    }
  }

  const handleDisconnectCompany = async (companyId: string) => {
    if (!confirm('¿Estás seguro de que quieres desconectar WhatsApp para esta compañía?')) {
      return
    }

    try {
      setActionLoading(companyId)
      await axios.post('/api/whatsapp/disconnect', { companyId })
      await loadCompanies()
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error desconectando WhatsApp')
    } finally {
      setActionLoading(null)
    }
  }

  const handleClearSession = async (companyId: string) => {
    if (!confirm('¿Estás seguro de que quieres limpiar la sesión? Esto requerirá reconectar WhatsApp.')) {
      return
    }

    try {
      setActionLoading(companyId)
      await axios.post('/api/whatsapp/clear')
      await loadCompanies()
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error limpiando sesión')
    } finally {
      setActionLoading(null)
    }
  }

  const getStatusBadge = (company: CompanyWhatsApp) => {
    if (!company.phoneNumber) {
      return <Badge variant="secondary">Sin Conectar</Badge>
    }
    
    if (company.isActive) {
      return <Badge className="bg-green-500 hover:bg-green-600">Conectado</Badge>
    }
    
    return <Badge variant="destructive">Desconectado</Badge>
  }

  const formatLastConnection = (dateString: string | null) => {
    if (!dateString) return 'Nunca'
    
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffHours / 24)
    
    if (diffHours < 1) return 'Hace menos de 1 hora'
    if (diffHours < 24) return `Hace ${diffHours} horas`
    if (diffDays < 7) return `Hace ${diffDays} días`
    
    return date.toLocaleDateString()
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 p-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-center h-64">
            <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
            <span className="ml-2">Cargando administración de WhatsApp...</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Administración de WhatsApp
          </h1>
          <p className="text-gray-600">
            Gestiona las conexiones de WhatsApp para todas las compañías
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center">
                <Users className="h-8 w-8 text-blue-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Total Compañías</p>
                  <p className="text-2xl font-bold">{companies.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center">
                <CheckCircle className="h-8 w-8 text-green-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Conectadas</p>
                  <p className="text-2xl font-bold">
                    {companies.filter(c => c.phoneNumber && c.isActive).length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center">
                <XCircle className="h-8 w-8 text-red-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Desconectadas</p>
                  <p className="text-2xl font-bold">
                    {companies.filter(c => !c.phoneNumber || !c.isActive).length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center">
                <Smartphone className="h-8 w-8 text-purple-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Conversaciones</p>
                  <p className="text-2xl font-bold">
                    {companies.reduce((sum, c) => sum + c.conversationCount, 0)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Companies List */}
        <div className="grid gap-4">
          {companies.map((company) => (
            <Card key={company.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center space-x-2">
                      <span>{company.name}</span>
                      {getStatusBadge(company)}
                    </CardTitle>
                    <CardDescription>
                      {company.phoneNumber 
                        ? `WhatsApp: ${company.phoneNumber}` 
                        : 'Sin WhatsApp conectado'
                      }
                    </CardDescription>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => loadCompanies()}
                      disabled={actionLoading === company.id}
                    >
                      <RefreshCw className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div>
                    <p className="text-sm text-gray-600">Última Conexión</p>
                    <p className="font-medium">
                      {formatLastConnection(company.lastConnection)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Conversaciones</p>
                    <p className="font-medium">{company.conversationCount}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Estado</p>
                    <p className="font-medium">
                      {company.phoneNumber 
                        ? (company.isActive ? 'Activo' : 'Inactivo')
                        : 'Sin configurar'
                      }
                    </p>
                  </div>
                </div>

                <div className="flex space-x-2">
                  {company.phoneNumber ? (
                    <>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDisconnectCompany(company.id)}
                        disabled={actionLoading === company.id}
                      >
                        {actionLoading === company.id ? (
                          <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                        ) : (
                          <XCircle className="w-4 h-4 mr-2" />
                        )}
                        Desconectar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleClearSession(company.id)}
                        disabled={actionLoading === company.id}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Limpiar Sesión
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => window.open(`/whatsapp/connect?company=${company.id}`, '_blank')}
                    >
                      <Settings className="w-4 h-4 mr-2" />
                      Configurar WhatsApp
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {companies.length === 0 && (
          <Card>
            <CardContent className="text-center py-12">
              <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No hay compañías registradas
              </h3>
              <p className="text-gray-600">
                Registra compañías para poder gestionar sus conexiones de WhatsApp
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}