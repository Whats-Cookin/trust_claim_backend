import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { prisma } from '../lib/prisma';
import bcrypt from 'bcryptjs';
import { generateVerificationToken } from './linkedin/verifyAge';

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Generate tokens - accept number for userId and optional did
function generateTokens(userId: number, did?: string) {
  const accessToken = jwt.sign(
    { userId: userId.toString(), type: 'access', did },
    process.env.ACCESS_SECRET || 'access-secret',
    { expiresIn: '1h' },
  );

  const refreshToken = jwt.sign(
    { userId: userId.toString(), type: 'refresh', did },
    process.env.REFRESH_SECRET || 'refresh-secret',
    { expiresIn: '7d' },
  );

  return { accessToken, refreshToken };
}

// Google OAuth login - supports both ID token and authorization code
export async function googleAuth(req: Request, res: Response): Promise<Response | void> {
  try {
    const { googleAuthCode, code, idToken } = req.body;

    let payload;

    // Support both flows:
    // 1. ID token from Google Sign-In (googleAuthCode or idToken)
    // 2. Authorization code from OAuth flow (code)

    if (googleAuthCode || idToken) {
      // Google Sign-In flow - we have an ID token
      const tokenToVerify = googleAuthCode || idToken;

      try {
        const ticket = await googleClient.verifyIdToken({
          idToken: tokenToVerify,
          audience: [process.env.GOOGLE_CLIENT_ID ?? '', process.env.ALLOWED_CLIENT_ID_2 ?? ''],
        });

        payload = ticket.getPayload();
        if (!payload) {
          return res.status(401).json({ error: 'Invalid Google token' });
        }
      } catch (error) {
        console.error('Token verification error:', error);
        return res.status(401).json({ error: 'Invalid Google token' });
      }
    } else if (code) {
      // OAuth 2.0 authorization code flow
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          client_id: process.env.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET,
          redirect_uri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/auth/google/callback',
          grant_type: 'authorization_code',
        }),
      });

      const tokenData = (await tokenResponse.json()) as any;

      if (tokenData.error || !tokenData.id_token) {
        console.error('Google token exchange error:', tokenData);
        return res.status(401).json({ error: 'Failed to exchange Google authorization code' });
      }

      // Verify the ID token we got from the exchange
      try {
        const ticket = await googleClient.verifyIdToken({
          idToken: tokenData.id_token,
          audience: [process.env.GOOGLE_CLIENT_ID ?? '', process.env.ALLOWED_CLIENT_ID_2 ?? ''],
        });

        payload = ticket.getPayload();
        if (!payload) {
          return res.status(401).json({ error: 'Invalid Google token' });
        }
      } catch (error) {
        console.error('Token verification error:', error);
        return res.status(401).json({ error: 'Invalid Google token' });
      }
    } else {
      return res.status(400).json({ error: 'Google auth code or ID token required' });
    }

    // Extract user info from payload
    const { email, name, picture, sub: googleId } = payload;

    // Find or create user
    let user = await prisma.user.findUnique({
      where: { email: email || '' },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: email || '',
          name: name || email?.split('@')[0] || 'User',
          authProviderId: googleId,
          authType: 'OAUTH' as const,
        },
      });
    } else {
      // Update Google ID if not set
      if (!user.authProviderId && user.authType === 'OAUTH') {
        await prisma.user.update({
          where: { id: user.id },
          data: { authProviderId: googleId },
        });
      }
    }

    const { accessToken, refreshToken } = generateTokens(user.id);

    return res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        profileImage: picture || null,
      },
      // Include the Google ID for DID purposes
      googleData: {
        googleId,
        email,
        name,
        picture,
      },
    });
  } catch (error) {
    console.error('Google auth error:', error);
    return res.status(500).json({ error: 'Google authentication failed' });
  }
}

// Email/password login
export async function login(req: Request, res: Response): Promise<Response | void> {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const { accessToken, refreshToken } = generateTokens(user.id);

    return res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        profileImage: null,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Login failed' });
  }
}

// Register with email/password
export async function register(req: Request, res: Response): Promise<Response | void> {
  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Check if user exists
    const existing = await prisma.user.findUnique({
      where: { email },
    });

    if (existing) {
      return res.status(409).json({ error: 'User already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: hashedPassword,
        name: name || email.split('@')[0],
        authType: 'PASSWORD' as const,
      },
    });

    const { accessToken, refreshToken } = generateTokens(user.id);

    return res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (error) {
    console.error('Register error:', error);
    return res.status(500).json({ error: 'Registration failed' });
  }
}

// Refresh token
export async function refreshToken(req: Request, res: Response): Promise<Response | void> {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required' });
    }

    const decoded = jwt.verify(refreshToken, process.env.REFRESH_SECRET || 'refresh-secret') as any;

    if (decoded.type !== 'refresh') {
      return res.status(401).json({ error: 'Invalid token type' });
    }

    const tokens = generateTokens(parseInt(decoded.userId));
    return res.json(tokens);
  } catch (error) {
    console.error('Refresh token error:', error);
    return res.status(401).json({ error: 'Invalid refresh token' });
  }
}

// GitHub OAuth
export async function githubAuth(req: Request, res: Response): Promise<Response | void> {
  try {
    const { code, client_id } = req.body;
    console.log('[GitHub Auth] Request body:', { code: code?.substring(0, 10) + '...', client_id });

    if (!code) {
      return res.status(400).json({ error: 'GitHub auth code required' });
    }

    let clientId: string | undefined;
    let clientSecret: string | undefined;

    // Check if client_id provided (new way)
    if (client_id) {
      console.log('[GitHub Auth] Looking up client_id in auth_apps table:', client_id);
      // Look up secret from auth_apps table
      const authApp = await prisma.authApp.findUnique({
        where: { clientId: client_id },
      });

      if (!authApp) {
        console.error('[GitHub Auth] Client ID not found in auth_apps table:', client_id);
        return res.status(400).json({ error: 'Invalid client_id' });
      }

      console.log('[GitHub Auth] Found auth app:', authApp.appName, authApp.provider);
      clientId = authApp.clientId;
      clientSecret = authApp.clientSecret;
    } else {
      // Fall back to env vars (existing way for backwards compatibility)
      console.log('[GitHub Auth] No client_id provided, using env vars');
      clientId = process.env.GITHUB_CLIENT_ID;
      clientSecret = process.env.GITHUB_CLIENT_SECRET;
    }

    if (!clientId || !clientSecret) {
      console.error('[GitHub Auth] Missing credentials:', { clientId: !!clientId, clientSecret: !!clientSecret });
      return res.status(500).json({ error: 'GitHub OAuth not configured' });
    }

    console.log('[GitHub Auth] Exchanging code with GitHub, client_id:', clientId);
    // Exchange code for access token
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      }),
    });

    const tokenData = (await tokenResponse.json()) as any;
    console.log('[GitHub Auth] GitHub response:', {
      status: tokenResponse.status,
      error: tokenData.error,
      error_description: tokenData.error_description,
      has_access_token: !!tokenData.access_token,
    });

    if (tokenData.error || !tokenData.access_token) {
      console.error('GitHub token error:', tokenData);
      return res.status(401).json({ error: 'Failed to get GitHub access token' });
    }

    // Get user info with the access token
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!userResponse.ok) {
      return res.status(401).json({ error: 'Failed to get GitHub user info' });
    }

    const githubUser = (await userResponse.json()) as any;

    // Find or create user
    let user = await prisma.user.findFirst({
      where: {
        authProviderId: githubUser.id.toString(),
        authType: 'GITHUB',
      },
    });

    if (!user) {
      // Check if email already exists with different auth
      if (githubUser.email) {
        const existingUser = await prisma.user.findUnique({
          where: { email: githubUser.email },
        });

        if (existingUser) {
          console.log('[GitHub Auth] Email already exists, linking accounts:', githubUser.email);
          // User exists with same email - this is OK! Just log them in
          user = existingUser;

          // Optionally update GitHub-specific info if not already set
          // Note: We don't have a githubUsername field in the schema currently
          // Could store in authProviderId if authType is not GITHUB
          if (existingUser.authType !== 'GITHUB') {
            console.log('[GitHub Auth] User authenticated with different method, keeping existing auth info');
          }
        }
      }

      // If still no user, create new one
      if (!user) {
        console.log('[GitHub Auth] Creating new user');
        user = await prisma.user.create({
          data: {
            email: githubUser.email,
            name: githubUser.name || githubUser.login,
            authType: 'GITHUB',
            authProviderId: githubUser.id.toString(),
          },
        });
      }
    }

    const { accessToken, refreshToken } = generateTokens(user.id);

    return res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        githubUsername: githubUser.login,
        profileImage: githubUser.avatar_url,
      },
      // Return GitHub data for the frontend to use
      githubData: {
        username: githubUser.login,
        profileUrl: githubUser.html_url,
        publicRepos: githubUser.public_repos,
        followers: githubUser.followers,
        following: githubUser.following,
        createdAt: githubUser.created_at,
        bio: githubUser.bio,
        company: githubUser.company,
        location: githubUser.location,
        hireable: githubUser.hireable,
        // Include the access token so frontend can make additional API calls
        accessToken: tokenData.access_token,
      },
    });
  } catch (error) {
    console.error('GitHub auth error:', error);
    return res.status(500).json({ error: 'GitHub authentication failed' });
  }
}

// LinkedIn OAuth
export async function linkedinAuth(req: Request, res: Response): Promise<Response | void> {
  try {
    const { code, client_id } = req.body;
    console.log('[LinkedIn Auth] Request body:', { code: code?.substring(0, 10) + '...', client_id });

    if (!code) {
      return res.status(400).json({ error: 'LinkedIn auth code required' });
    }

    let clientId: string | undefined;
    let clientSecret: string | undefined;

    // Check if client_id provided (new way)
    if (client_id) {
      console.log('[LinkedIn Auth] Looking up client_id in auth_apps table:', client_id);
      // Look up secret from auth_apps table
      const authApp = await prisma.authApp.findUnique({
        where: { clientId: client_id },
      });

      if (!authApp) {
        console.error('[LinkedIn Auth] Client ID not found in auth_apps table:', client_id);
        return res.status(400).json({ error: 'Invalid client_id' });
      }

      console.log('[LinkedIn Auth] Found auth app:', authApp.appName, authApp.provider);
      clientId = authApp.clientId;
      clientSecret = authApp.clientSecret;
    } else {
      // Fall back to env vars (existing way for backwards compatibility)
      console.log('[LinkedIn Auth] No client_id provided, using env vars');
      clientId = process.env.LINKEDIN_CLIENT_ID;
      clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
    }

    if (!clientId || !clientSecret) {
      console.error('[LinkedIn Auth] Missing credentials:', { clientId: !!clientId, clientSecret: !!clientSecret });
      return res.status(500).json({ error: 'LinkedIn OAuth not configured' });
    }

    console.log('[LinkedIn Auth] Exchanging code with LinkedIn, client_id:', clientId);
    // Exchange code for access token
    const tokenResponse = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: 'https://talent.linkedtrust.us/auth/linkedin/callback',
      }),
    });

    const tokenData = (await tokenResponse.json()) as any;
    console.log('[LinkedIn Auth] LinkedIn response:', {
      status: tokenResponse.status,
      error: tokenData.error,
      error_description: tokenData.error_description,
      has_access_token: !!tokenData.access_token,
    });

    if (tokenData.error || !tokenData.access_token) {
      console.error('LinkedIn token error:', tokenData);
      return res.status(401).json({ error: 'Failed to get LinkedIn access token' });
    }

    // Initialize user data
    let linkedinId: string | undefined;
    let email: string | null = null;
    let firstName = '';
    let lastName = '';
    let fullName = '';
    let profilePicture: string | null = null;

    // With OpenID Connect, decode the ID token if available
    if (tokenData.id_token) {
      try {
        // Decode the ID token (it's a JWT)
        const idTokenPayload = JSON.parse(
          Buffer.from(tokenData.id_token.split('.')[1], 'base64').toString()
        );
        
        console.log('[LinkedIn Auth] Decoded ID token:', {
          sub: idTokenPayload.sub,
          email: idTokenPayload.email,
          name: idTokenPayload.name,
        });
        
        // Extract user info from ID token
        linkedinId = idTokenPayload.sub; // This is the unique LinkedIn ID
        email = idTokenPayload.email || null;
        fullName = idTokenPayload.name || '';
        profilePicture = idTokenPayload.picture || null;
        
        // Try to split name into first/last
        const nameParts = fullName.split(' ');
        if (nameParts.length >= 2) {
          firstName = nameParts[0];
          lastName = nameParts.slice(1).join(' ');
        } else {
          firstName = fullName;
        }
      } catch (error) {
        console.error('[LinkedIn Auth] Failed to decode ID token:', error);
        // Fall back to userinfo endpoint
      }
    }
    
    // If no ID token or decode failed, try userinfo endpoint
    if (!linkedinId) {
      try {
        const userInfoResponse = await fetch('https://api.linkedin.com/v2/userinfo', {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
          },
        });

        if (!userInfoResponse.ok) {
          console.error('[LinkedIn Auth] Userinfo response not ok:', userInfoResponse.status);
          // Try legacy v2/me endpoint as last resort
          const legacyResponse = await fetch('https://api.linkedin.com/v2/me', {
            headers: {
              Authorization: `Bearer ${tokenData.access_token}`,
              'X-Restli-Protocol-Version': '2.0.0',
            },
          });
          
          if (!legacyResponse.ok) {
            return res.status(401).json({ error: 'Failed to get LinkedIn user info' });
          }
          
          const legacyUser = (await legacyResponse.json()) as any;
          linkedinId = legacyUser.id;
          firstName = legacyUser.localizedFirstName || '';
          lastName = legacyUser.localizedLastName || '';
          fullName = `${firstName} ${lastName}`.trim();
        } else {
          const userInfo = (await userInfoResponse.json()) as any;
          console.log('[LinkedIn Auth] UserInfo response:', userInfo);
          
          linkedinId = userInfo.sub;
          email = userInfo.email || null;
          fullName = userInfo.name || '';
          profilePicture = userInfo.picture || null;
          
          // Try to split name
          const nameParts = fullName.split(' ');
          if (nameParts.length >= 2) {
            firstName = nameParts[0];
            lastName = nameParts.slice(1).join(' ');
          } else {
            firstName = fullName;
          }
        }
      } catch (error) {
        console.error('[LinkedIn Auth] Failed to get user info:', error);
        return res.status(401).json({ error: 'Failed to get LinkedIn user info' });
      }
    }

    // Ensure we have at least a LinkedIn ID
    if (!linkedinId) {
      console.error('[LinkedIn Auth] No LinkedIn ID found');
      return res.status(401).json({ error: 'Failed to extract LinkedIn user ID' });
    }

    // Find or create user
    let user = await prisma.user.findFirst({
      where: {
        authProviderId: linkedinId,
        authType: 'OAUTH',
      },
    });

    if (!user) {
      // Check if email already exists with different auth
      if (email) {
        const existingUser = await prisma.user.findUnique({
          where: { email },
        });

        if (existingUser) {
          console.log('[LinkedIn Auth] Email already exists, linking accounts:', email);
          // User exists with same email - this is OK! Just log them in
          user = existingUser;

          // Optionally update LinkedIn-specific info if not already set
          if (existingUser.authType !== 'OAUTH') {
            console.log('[LinkedIn Auth] User authenticated with different method, keeping existing auth info');
          }
        }
      }

      // If still no user, create new one
      if (!user) {
        console.log('[LinkedIn Auth] Creating new user');
        user = await prisma.user.create({
          data: {
            email: email || `linkedin_${linkedinId}@linkedin.local`,
            name: fullName || 'LinkedIn User',
            authType: 'OAUTH',
            authProviderId: linkedinId,
          },
        });
      }
    }

    const { accessToken, refreshToken } = generateTokens(user.id);
    
    // Generate verification token for bookmarklet if we have linkedinId
    const verificationToken = linkedinId ? generateVerificationToken(user.id, linkedinId) : undefined;

    return res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        linkedinId: linkedinId,
        profileImage: profilePicture,
      },
      // Return LinkedIn data for the frontend to use
      linkedinData: {
        linkedinId,
        firstName,
        lastName,
        profileUrl: `https://www.linkedin.com/in/${linkedinId}`,
        profilePicture,
        // Include the access token so frontend can make additional API calls
        accessToken: tokenData.access_token,
        // Include verification token for bookmarklet
        verificationToken
      },
    });
  } catch (error) {
    console.error('LinkedIn auth error:', error);
    return res.status(500).json({ error: 'LinkedIn authentication failed' });
  }
}

// Wallet auth (placeholder)
export async function walletAuth(req: Request, res: Response): Promise<Response | void> {
  try {
    const { address, did } = req.body;

    if (!address) {
      return res.status(400).json({ error: 'Wallet address required' });
    }

    // Find or create user by wallet and optionally DID
    let user = await prisma.user.findFirst({
      where: {
        authProviderId: address,
        authType: 'PASSWORD' as const, // Using PASSWORD as a placeholder for wallet auth
      },
    });

    if (!user) {
      // Store DID in the name field temporarily or as part of authProviderId
      const displayName = did
        ? `${address.slice(0, 6)}...${address.slice(-4)} (${did.slice(0, 15)}...)`
        : `User ${address.slice(0, 6)}...${address.slice(-4)}`;

      user = await prisma.user.create({
        data: {
          authProviderId: did || address, // Prefer DID if available
          name: displayName,
          authType: 'PASSWORD' as const, // Using PASSWORD as a placeholder for wallet auth
        },
      });
    }

    const { accessToken, refreshToken } = generateTokens(user.id, did);

    return res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        walletAddress: address,
        did: did || undefined,
        name: user.name,
      },
    });
  } catch (error) {
    console.error('Wallet auth error:', error);
    return res.status(500).json({ error: 'Wallet authentication failed' });
  }
}
