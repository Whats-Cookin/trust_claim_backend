import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { prisma } from '../lib/prisma';
import bcrypt from 'bcryptjs';

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Generate tokens
function generateTokens(userId: string) {
  const accessToken = jwt.sign(
    { userId, type: 'access' },
    process.env.ACCESS_SECRET || 'access-secret',
    { expiresIn: '1h' }
  );
  
  const refreshToken = jwt.sign(
    { userId, type: 'refresh' },
    process.env.REFRESH_SECRET || 'refresh-secret',
    { expiresIn: '7d' }
  );
  
  return { accessToken, refreshToken };
}

// Google OAuth login
export async function googleAuth(req: Request, res: Response) {
  try {
    const { googleAuthCode } = req.body;
    
    if (!googleAuthCode) {
      return res.status(400).json({ error: 'Google auth code required' });
    }
    
    // Verify the Google token
    const ticket = await googleClient.verifyIdToken({
      idToken: googleAuthCode,
      audience: process.env.GOOGLE_CLIENT_ID
    });
    
    const payload = ticket.getPayload();
    if (!payload) {
      return res.status(401).json({ error: 'Invalid Google token' });
    }
    
    const { email, name, picture, sub: googleId } = payload;
    
    // Find or create user
    let user = await prisma.user.findUnique({
      where: { email: email || '' }
    });
    
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: email || '',
          name: name || email?.split('@')[0] || 'User',
          googleId,
          profileImage: picture,
          provider: 'google'
        }
      });
    } else {
      // Update Google ID if not set
      if (!user.googleId) {
        await prisma.user.update({
          where: { id: user.id },
          data: { googleId, profileImage: picture }
        });
      }
    }
    
    const { accessToken, refreshToken } = generateTokens(user.id);
    
    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        profileImage: user.profileImage
      }
    });
  } catch (error) {
    console.error('Google auth error:', error);
    res.status(500).json({ error: 'Google authentication failed' });
  }
}

// Email/password login
export async function login(req: Request, res: Response) {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    
    const user = await prisma.user.findUnique({
      where: { email }
    });
    
    if (!user || !user.password) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const { accessToken, refreshToken } = generateTokens(user.id);
    
    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        profileImage: user.profileImage
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
}

// Register with email/password
export async function register(req: Request, res: Response) {
  try {
    const { email, password, name } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    
    // Check if user exists
    const existing = await prisma.user.findUnique({
      where: { email }
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
        password: hashedPassword,
        name: name || email.split('@')[0],
        provider: 'email'
      }
    });
    
    const { accessToken, refreshToken } = generateTokens(user.id);
    
    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
}

// Refresh token
export async function refreshToken(req: Request, res: Response) {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required' });
    }
    
    const decoded = jwt.verify(
      refreshToken,
      process.env.REFRESH_SECRET || 'refresh-secret'
    ) as any;
    
    if (decoded.type !== 'refresh') {
      return res.status(401).json({ error: 'Invalid token type' });
    }
    
    const tokens = generateTokens(decoded.userId);
    res.json(tokens);
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(401).json({ error: 'Invalid refresh token' });
  }
}

// GitHub OAuth (placeholder for now)
export async function githubAuth(req: Request, res: Response) {
  // TODO: Implement GitHub OAuth
  res.status(501).json({ error: 'GitHub auth not implemented yet' });
}

// Wallet auth (placeholder)
export async function walletAuth(req: Request, res: Response) {
  try {
    const { address, did } = req.body;
    
    if (!address) {
      return res.status(400).json({ error: 'Wallet address required' });
    }
    
    // Find or create user by wallet
    let user = await prisma.user.findUnique({
      where: { walletAddress: address }
    });
    
    if (!user) {
      user = await prisma.user.create({
        data: {
          walletAddress: address,
          did,
          name: `User ${address.slice(0, 6)}...${address.slice(-4)}`,
          provider: 'wallet'
        }
      });
    }
    
    const { accessToken, refreshToken } = generateTokens(user.id);
    
    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        walletAddress: user.walletAddress,
        name: user.name
      }
    });
  } catch (error) {
    console.error('Wallet auth error:', error);
    res.status(500).json({ error: 'Wallet authentication failed' });
  }
}
