import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

// Get image by ID and redirect to URL
export async function getImage(req: Request, res: Response): Promise<Response | void> {
  try {
    const { id } = req.params;
    const imageId = parseInt(id);
    
    if (isNaN(imageId) || imageId <= 0) {
      return res.status(400).json({ error: 'Invalid image ID' });
    }
    
    const image = await prisma.image.findUnique({
      where: { id: imageId }
    });
    
    if (!image) {
      return res.status(404).json({ error: 'Image not found' });
    }
    
    // If it's a data URL, serve it directly
    if (image.url.startsWith('data:')) {
      const contentType = (image.metadata as any)?.contentType || 'image/jpeg';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
      
      // Extract base64 data from data URL
      const base64Data = image.url.split(',')[1];
      const imageBuffer = Buffer.from(base64Data, 'base64');
      
      res.setHeader('Content-Length', imageBuffer.length);
      res.send(imageBuffer);
    } else if (image.url.includes('undefined.s3.undefined') || image.url === 'string') {
      // Handle broken AWS URLs or invalid URLs
      console.log(`Broken image URL detected for image ${imageId}: ${image.url}`);
      
      // Return a 1x1 transparent PNG as placeholder
      const transparentPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Content-Length', transparentPng.length);
      res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
      res.send(transparentPng);
    } else {
      // For valid external URLs, return a JSON response with the URL
      // This avoids CORS issues with redirects
      res.setHeader('Content-Type', 'application/json');
      res.json({ 
        imageUrl: image.url,
        message: 'External image URL - use this URL to fetch the image directly',
        id: imageId
      });
    }
  } catch (error) {
    console.error('Error serving image:', error);
    res.status(500).json({ error: 'Failed to serve image' });
  }
}

// Get image metadata without binary data
export async function getImageMetadata(req: Request, res: Response): Promise<Response | void> {
  try {
    const { id } = req.params;
    const imageId = parseInt(id);
    
    if (isNaN(imageId) || imageId <= 0) {
      return res.status(400).json({ error: 'Invalid image ID' });
    }
    
    const image = await prisma.image.findUnique({
      where: { id: imageId },
      select: {
        id: true,
        claimId: true,
        url: true,
        digestMultibase: true,
        metadata: true,
        effectiveDate: true,
        createdDate: true,
        owner: true,
        signature: true
      }
    });
    
    if (!image) {
      return res.status(404).json({ error: 'Image not found' });
    }
    
    // Extract contentType and filename from metadata for backward compatibility
    const metadata = image.metadata as any;
    const response = {
      ...image,
      contentType: metadata?.contentType || 'image/jpeg',
      filename: metadata?.filename || `image_${image.id}`
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error fetching image metadata:', error);
    res.status(500).json({ error: 'Failed to fetch image metadata' });
  }
} 