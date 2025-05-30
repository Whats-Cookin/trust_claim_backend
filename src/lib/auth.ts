import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email?: string;
  };
}

// Simple JWT verification middleware
export function verifyToken(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    // Allow some endpoints without auth
    if (req.path.includes('/feed') || req.path.includes('/graph')) {
      return next();
    }
    return res.status(401).json({ error: 'No token provided' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.ACCESS_SECRET || 'access-secret') as any;
    req.user = {
      id: decoded.userId || decoded.id,
      email: decoded.email
    };
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid token' });
  }
}

// Generate user URI
export function getUserUri(userId: string): string {
  return `${process.env.BASE_URL || 'https://linkedtrust.us'}/users/${userId}`;
}
