import { type NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import DiscordProvider from 'next-auth/providers/discord';
import CredentialsProvider from 'next-auth/providers/credentials';
import { query, transaction } from '@/lib/db';
import { verifyHash } from '@/lib/crypto';
import { logger } from '@/lib/logger';

/**
 * NextAuth Configuration
 * Handles user authentication with OAuth and credentials
 */

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    }),

    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID || '',
      clientSecret: process.env.DISCORD_CLIENT_SECRET || '',
    }),

    CredentialsProvider({
      name: 'Email',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Missing email or password');
        }

        try {
          // Query user by email
          const result = await query<{
            id: string;
            email: string;
            password_hash: string | null;
            name: string | null;
            role: string;
            email_verified: boolean;
            failed_login_attempts: number;
            locked_until: string | null;
          }>(
            `SELECT id, email, password_hash, name, role, email_verified,
                    failed_login_attempts, locked_until
             FROM users WHERE email = $1`,
            [credentials.email.toLowerCase()]
          );

          // Use a single generic error to avoid email enumeration
          const invalidCredentials = new Error('Invalid email or password');

          if (result.length === 0) {
            throw invalidCredentials;
          }

          const user = result[0];

          // Account lockout check
          if (user.locked_until && new Date(user.locked_until) > new Date()) {
            throw new Error('Account temporarily locked due to too many failed attempts. Try again later.');
          }

          // Verify password
          const passwordValid = user.password_hash && await verifyHash(credentials.password, user.password_hash);
          if (!passwordValid) {
            // Increment failure counter; lock after 10 failures for 15 minutes
            await query(
              `UPDATE users
               SET failed_login_attempts = failed_login_attempts + 1,
                   locked_until = CASE WHEN failed_login_attempts + 1 >= 10
                                       THEN NOW() + INTERVAL '15 minutes'
                                       ELSE locked_until END
               WHERE id = $1`,
              [user.id]
            );
            throw invalidCredentials;
          }

          // Enforce email verification for credentials users
          if (!user.email_verified) {
            throw new Error('Please verify your email before signing in. Check your inbox for a verification link.');
          }

          // Successful login — reset failure counter
          await query(
            `UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1`,
            [user.id]
          );

          logger.info('User authenticated with credentials', { userId: user.id });

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
          };
        } catch (error) {
          logger.error('Credentials authentication failed', error instanceof Error ? error : null);
          throw error;
        }
      },
    }),
  ],

  callbacks: {
    /**
     * Called when JWT is created or updated
     */
    async jwt({ token, user, account }) {
      // Always ensure token.id is a database UUID. Never fall back to provider IDs.
      const isUuid = (value: unknown) =>
        typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

      // On session refresh (not initial sign-in), validate that password hasn't changed since this JWT was issued.
      // This invalidates sessions after a password reset.
      if (!account && !user && token.id && isUuid(token.id)) {
        try {
          const rows = await query<{ password_changed_at: string | null }>(
            `SELECT password_changed_at FROM users WHERE id = $1`,
            [token.id]
          );
          if (rows.length > 0 && rows[0].password_changed_at) {
            const changedAt = new Date(rows[0].password_changed_at).getTime();
            const issuedAt = (token.iat as number ?? 0) * 1000;
            if (changedAt > issuedAt) {
              // Password changed after this token was issued — force re-login
              throw new Error('Session invalidated: password changed');
            }
          }
        } catch (err) {
          if (err instanceof Error && err.message.startsWith('Session invalidated')) throw err;
          logger.error('Failed to check password_changed_at', err instanceof Error ? err : null);
        }
      }

      // OAuth (Google, Discord)
      if ((account?.provider === 'google' || account?.provider === 'discord') && user) {
        if (!user.email) {
          throw new Error(`${account.provider} login missing email`);
        }

        try {
          const existing = await query<{ id: string; role: string; password_hash: string | null }>(
            `SELECT id, role, password_hash FROM users WHERE email = $1`,
            [user.email.toLowerCase()]
          );

          // Block OAuth sign-in for accounts that were registered with email+password.
          // Prevents an attacker from using OAuth to silently take over a credentials account.
          // The user must sign in with their password; they can link OAuth afterwards.
          if (existing.length > 0 && existing[0].password_hash) {
            throw new Error(
              'This email is registered with a password. Please sign in with your email and password.'
            );
          }

          const userId = existing[0]?.id
            ?? await createOAuthUser({
              email: user.email,
              name: user.name ?? '',
              provider: account.provider,
              providerAccountId: account.providerAccountId,
            });

          token.id = userId;
          token.sub = userId; // keep NextAuth subject aligned
          token.role = existing[0]?.role ?? 'user';
        } catch (error) {
          logger.error(`Failed to resolve ${account.provider} user ID`, error instanceof Error ? error : null);
          throw error;
        }
      }

      // Credentials or other non-OAuth flows
      if (!account && user?.id) {
        token.id = user.id;
        token.sub = user.id;
        token.role = (user as any).role ?? 'user';
      }

      // If id is still missing or invalid, stop the flow
      if (!isUuid(token.id)) {
        throw new Error('Invalid session id; expected database UUID');
      }

      return token;
    },

    /**
     * Called when session is accessed
     */
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        (session.user as any).role = token.role as string ?? 'user';
      }
      return session;
    },

    /**
     * Control access to sign-in
     */
    async signIn({ user, account }) {
      try {
        // Log sign in
        if (user.email) {
          logger.info('User signing in', {
            email: user.email,
            provider: account?.provider,
          });
        }

        return true;
      } catch (error) {
        logger.error('Sign in failed', error instanceof Error ? error : null);
        return false;
      }
    },
  },

  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },

  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60,   // 30-day absolute session lifetime
    updateAge: 24 * 60 * 60,      // Rotate token every 24h of activity — stolen tokens expire within a day
  },

  jwt: {
    secret: process.env.NEXTAUTH_SECRET,
    maxAge: 30 * 24 * 60 * 60,
  },

  events: {
    async signIn({ user, account }) {
      logger.info('Sign in event', {
        userId: user.id,
        provider: account?.provider,
      });
    },

    async signOut({ token }) {
      logger.info('Sign out event', {
        userId: token.id,
      });
    },

    async session() {
      // No logging on every session check to reduce spam
    },
  },
};

/**
 * Create user from OAuth provider
 */
async function createOAuthUser(data: {
  email: string;
  name: string;
  provider: string;
  providerAccountId: string;
}): Promise<string> {
  try {
    return await transaction(async client => {
      // Create user
      const userResult = await client.query(
        `INSERT INTO users (id, email, name, email_verified, email_verified_at, created_at)
         VALUES (gen_random_uuid(), $1, $2, TRUE, NOW(), NOW())
         RETURNING id`,
        [data.email.toLowerCase(), data.name]
      );

      const userId = userResult.rows[0].id;

      // Create OAuth account link
      await client.query(
        `INSERT INTO oauth_accounts (user_id, provider, provider_account_id, created_at)
         VALUES ($1, $2, $3, NOW())`,
        [userId, data.provider, data.providerAccountId]
      );

      logger.info('OAuth user created', {
        userId,
        email: data.email,
        provider: data.provider,
      });

      return userId;
    });
  } catch (error) {
    logger.error('Failed to create OAuth user', error instanceof Error ? error : null);
    throw error;
  }
}

/**
 * Type extensions for next-auth
 */
declare module 'next-auth' {
  interface User {
    id: string;
    role?: string;
  }

  interface Session {
    user: {
      id: string;
      role?: string;
      email?: string | null;
      name?: string | null;
      image?: string | null;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    role?: string;
  }
}
