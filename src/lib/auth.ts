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
          }>(
            `SELECT id, email, password_hash, name, role FROM users WHERE email = $1`,
            [credentials.email.toLowerCase()]
          );

          if (result.length === 0) {
            throw new Error('User not found');
          }

          const user = result[0];

          // Verify password
          if (!user.password_hash || !verifyHash(credentials.password, user.password_hash)) {
            throw new Error('Invalid password');
          }

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

      // OAuth (Google, Discord)
      if ((account?.provider === 'google' || account?.provider === 'discord') && user) {
        if (!user.email) {
          throw new Error(`${account.provider} login missing email`);
        }

        try {
          const existing = await query<{ id: string; role: string }>(
            `SELECT id, role FROM users WHERE email = $1`,
            [user.email.toLowerCase()]
          );

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
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  jwt: {
    secret: process.env.NEXTAUTH_SECRET,
    maxAge: 30 * 24 * 60 * 60, // 30 days
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
