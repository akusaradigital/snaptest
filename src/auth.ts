import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

// Auth.js v5 - Google OAuth, JWT sessions (no DB adapter needed).
// Reads AUTH_SECRET, AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET from env automatically.
// Sesi login diset expired 7 hari demi keamanan.
export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [Google],
  trustHost: true,
  pages: { signIn: "/login" },
  session: {
    strategy: "jwt",
    maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
  },
});
