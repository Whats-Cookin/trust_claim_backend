import express from 'express';
import { extractorAuth } from '../middlewares/extractorAuth';
import { joiValidator, claimPostSchema } from '../middlewares/validators/claim.validator';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

router.post(
  '/extractor-claims',
  extractorAuth,
  joiValidator(claimPostSchema), // ✅ This validates req.body before DB insert
  async (req, res) => {
    try {
      const claim = req.body;

      const newClaim = await prisma.claim.create({
        data: claim,
      });

      res.status(201).json({ message: 'Claim saved successfully', claim: newClaim });
    } catch (err) {
      console.error('Error saving claim:', err);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
);

export default router;
