import { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      studentId?: string | null
      isRegistered?: boolean
      currentStatus?: string
      isAdmin?: boolean
      validFrom?: string | null
      validUntil?: string | null
    } & DefaultSession["user"]
  }

  interface User {
    studentId?: string | null
    isRegistered?: boolean
    currentStatus?: string
    isAdmin?: boolean
    validFrom?: string | null
    validUntil?: string | null
  }
}