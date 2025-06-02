import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'

interface WhatsAppStatus {
  connected: boolean
  phoneNumber: string | null
  qrCode: string | null
  hasExistingSession?: boolean
}

export function useWhatsAppConnection(companyId: string | null) {
  const [status, setStatus] = useState<WhatsAppStatus>({
    connected: false,
    phoneNumber: null,
    qrCode: null
  })
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reconnectAttempts, setReconnectAttempts] = useState(0)
  const MAX_RECONNECT_ATTEMPTS = 3

  const initialize = useCallback(async () => {
    if (!companyId) return

    try {
      setIsLoading(true)
      setError(null)
      
      console.log("Inicializando WhatsApp...")
      const response = await axios.post('/api/whatsapp/initialize', { companyId })
      console.log("Respuesta de inicialización:", response.data)
      
      if (response.data.connected) {
        setStatus(response.data)
        setReconnectAttempts(0)
        return { shouldRedirect: true }
      }
      
      if (response.data.qrCode) {
        setStatus(prev => ({ ...prev, qrCode: response.data.qrCode }))
      }
      
      return { shouldRedirect: false }
    } catch (err: any) {
      console.error("Error initializing WhatsApp:", err)
      setError(err.response?.data?.error || 'Error initializing WhatsApp')
      return { shouldRedirect: false }
    } finally {
      setIsLoading(false)
    }
  }, [companyId])

  const checkStatus = useCallback(async () => {
    if (!companyId) return

    try {
      const response = await axios.get('/api/whatsapp/status')
      const hasSession = await response.data.hasExistingSession
      
      console.log("Estado de WhatsApp:", response.data)
      
      if (response.data.connected) {
        setStatus(response.data)
        setError(null)
        setReconnectAttempts(0)
      } else if (hasSession && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        console.log("Hay sesión pero no está conectado, intentando reconectar...")
        try {
          await initialize()
          setReconnectAttempts(prev => prev + 1)
        } catch (error) {
          console.log("Reconexión fallida, esperando...")
          setError("Error al reconectar. Intentando nuevamente...")
        }
      } else {
        setStatus(response.data)
        if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
          setError("Máximo de intentos de reconexión alcanzado")
        }
      }
    } catch (err: any) {
      console.error("Error checking status:", err)
      setError(err.response?.data?.error || 'Error checking status')
    } finally {
      setIsLoading(false)
    }
  }, [companyId, reconnectAttempts, initialize])

  const disconnect = useCallback(async () => {
    if (!companyId) return

    try {
      setIsLoading(true)
      await axios.post('/api/whatsapp/disconnect', { companyId })
      setStatus({
        connected: false,
        phoneNumber: null,
        qrCode: null
      })
      setError(null)
      setReconnectAttempts(0)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error disconnecting WhatsApp')
    } finally {
      setIsLoading(false)
    }
  }, [companyId])

  const clearAndRestart = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      setStatus({
        connected: false,
        phoneNumber: null,
        qrCode: null,
        hasExistingSession: false
      })
      
      // Limpiar todas las sesiones usando el nuevo endpoint
      await axios.post('/api/whatsapp/clear-all-sessions', { companyId })
      
      // Esperar un momento para asegurar que las sesiones se limpien
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      // Reinicializar después de limpiar
      await initialize()
    } catch (err: any) {
      console.error("Error limpiando estado de WhatsApp:", err)
      setError(err.response?.data?.error || 'Error limpiando estado de WhatsApp')
    } finally {
      setIsLoading(false)
    }
  }, [companyId, initialize])

  useEffect(() => {
    if (companyId) {
      initialize()
    }
  }, [companyId, initialize])

  useEffect(() => {
    if (!status.connected && !error && companyId) {
      const interval = setInterval(checkStatus, 5000) // Aumentado a 5 segundos
      return () => clearInterval(interval)
    }
  }, [status.connected, error, companyId, checkStatus])

  return {
    status,
    isLoading,
    error,
    initialize,
    disconnect,
    clearAndRestart,
    checkStatus
  }
}