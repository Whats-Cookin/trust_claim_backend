import { Request, Response, NextFunction } from 'express';

export const extractorAuth = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.split(' ')[1]; // Format: "Bearer <token>"

  if (!token || token !== process.env.EXTRACTOR_API_TOKEN) {
    return res.status(401).json({ message: 'Unauthorized: Invalid or missing token' });
  }

  next();
}; 