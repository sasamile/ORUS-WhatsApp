import fs from 'fs'
import path from 'path'

export class WhatsAppSessionManager {
  private static readonly AUTH_FOLDER = path.join(process.cwd(), "auth")
  private static readonly COMPANY_SESSION_FILE = path.join(process.cwd(), "company-session.json")

  static hasAuthSession(): boolean {
    try {
      return fs.existsSync(this.AUTH_FOLDER) && 
             fs.readdirSync(this.AUTH_FOLDER).length > 0
    } catch (error) {
      return false
    }
  }

  static clearAuthSession(): void {
    try {
      if (fs.existsSync(this.AUTH_FOLDER)) {
        fs.rmSync(this.AUTH_FOLDER, { recursive: true, force: true })
      }
    } catch (error) {
      console.error("Error clearing auth session:", error)
    }
  }

  static saveCompanySession(companyId: string, phoneNumber: string): void {
    try {
      const sessionData = {
        companyId,
        phoneNumber,
        timestamp: new Date().toISOString()
      }
      
      fs.writeFileSync(
        this.COMPANY_SESSION_FILE, 
        JSON.stringify(sessionData, null, 2)
      )
    } catch (error) {
      console.error("Error saving company session:", error)
    }
  }

  static getCompanySession(): {
    companyId?: string;
    phoneNumber?: string;
    timestamp?: string;
  } | null {
    try {
      if (!fs.existsSync(this.COMPANY_SESSION_FILE)) {
        return null
      }

      const data = fs.readFileSync(this.COMPANY_SESSION_FILE, 'utf8')
      return JSON.parse(data)
    } catch (error) {
      console.error("Error reading company session:", error)
      return null
    }
  }

  static clearCompanySession(): void {
    try {
      if (fs.existsSync(this.COMPANY_SESSION_FILE)) {
        fs.unlinkSync(this.COMPANY_SESSION_FILE)
      }
    } catch (error) {
      console.error("Error clearing company session:", error)
    }
  }

  static clearAllSessions(): void {
    this.clearAuthSession()
    this.clearCompanySession()
  }
}