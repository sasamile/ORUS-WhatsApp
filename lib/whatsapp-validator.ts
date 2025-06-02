import { prisma } from "./prisma"

export class WhatsAppValidator {
  static async validateCompanyAccess(companyId: string): Promise<{
    isValid: boolean;
    company?: any;
    message?: string;
  }> {
    try {
      const company = await prisma.company.findUnique({
        where: { id: companyId }
      })

      if (!company) {
        return {
          isValid: false,
          message: "Compañía no encontrada"
        }
      }

      return {
        isValid: true,
        company
      }
    } catch (error) {
      return {
        isValid: false,
        message: "Error validando acceso a la compañía"
      }
    }
  }

  static async validatePhoneNumberUniqueness(
    phoneNumber: string, 
    excludeCompanyId?: string
  ): Promise<{
    isUnique: boolean;
    conflictingCompany?: any;
    message?: string;
  }> {
    try {
      const whereClause: any = {
        phoneNumber: phoneNumber
      }

      if (excludeCompanyId) {
        whereClause.NOT = {
          id: excludeCompanyId
        }
      }

      const conflictingCompany = await prisma.company.findFirst({
        where: whereClause,
        select: {
          id: true,
          name: true,
          phoneNumber: true
        }
      })

      if (conflictingCompany) {
        return {
          isUnique: false,
          conflictingCompany,
          message: `Este número de WhatsApp ya está siendo usado por la compañía: ${conflictingCompany.name}`
        }
      }

      return {
        isUnique: true
      }
    } catch (error) {
      return {
        isUnique: false,
        message: "Error validando unicidad del número"
      }
    }
  }

  static async canCompanyUseWhatsApp(companyId: string): Promise<{
    canUse: boolean;
    reason?: string;
    currentPhone?: string;
  }> {
    try {
      const company = await prisma.company.findUnique({
        where: { id: companyId }
      })

      if (!company) {
        return {
          canUse: false,
          reason: "Compañía no encontrada"
        }
      }

      // Si ya tiene un número, verificar que no haya conflictos
      if (company.phoneNumber) {
        const uniquenessCheck = await this.validatePhoneNumberUniqueness(
          company.phoneNumber, 
          companyId
        )

        if (!uniquenessCheck.isUnique) {
          return {
            canUse: false,
            reason: "El número actual está en conflicto con otra compañía",
            currentPhone: company.phoneNumber
          }
        }
      }

      return {
        canUse: true,
        currentPhone: company.phoneNumber || undefined
      }
    } catch (error) {
      return {
        canUse: false,
        reason: "Error verificando permisos de WhatsApp"
      }
    }
  }

  static async getCompanyWhatsAppStatus(companyId: string): Promise<{
    hasWhatsApp: boolean;
    phoneNumber?: string;
    isActive?: boolean;
    lastConnection?: Date;
  }> {
    try {
      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: {
          phoneNumber: true,
          updatedAt: true
        }
      })

      if (!company || !company.phoneNumber) {
        return {
          hasWhatsApp: false
        }
      }

      return {
        hasWhatsApp: true,
        phoneNumber: company.phoneNumber,
        lastConnection: company.updatedAt
      }
    } catch (error) {
      return {
        hasWhatsApp: false
      }
    }
  }
}