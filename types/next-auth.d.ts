import { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      studentId?: string | null
      isRegistered?: boolean
      currentStatus?: string
      isAdmin?: boolean
    } & DefaultSession["user"]
  }

  interface User {
    studentId?: string | null
    isRegistered?: boolean
    currentStatus?: string
    isAdmin?: boolean
  }
}