import { z } from "zod";

export const CreateCredentialDto = z.object({
  email: z.string().optional(),
  context: z.string().nullable().optional(),
  id: z.string().nullable().optional(),
  type: z.array(z.string().nullable().optional()).optional().nullable(),
  issuer: z.object({
    id: z.string(),
    type: z.array(z.string().nullable().optional()).optional().nullable(),
  }),
  issuanceDate: z.coerce.date().nullable().optional(),
  expirationDate: z.coerce.date().nullable().optional(),
  credentialSubject: z
    .object({
      name: z.string().nullable().optional(),
      type: z.array(z.any()),
      evidenceLink: z.string(),
      evidenceDescription: z.string().nullable().optional(),
      duration: z.string().nullable().optional(),
      credentialType: z.string().nullable().optional(),
      achievement: z
        .array(
          z.object({
            id: z.string(),
            type: z.array(z.string()),
            criterial: z.any(),
            description: z.string().optional().nullable(),
            name: z.string().optional().nullable(),
            image: z
              .object({
                id: z.string().optional().nullable(),
                type: z.string().optional().nullable(),
              })
              .optional()
              .nullable(),
          }),
        )
        .optional()
        .nullable(),
    })
    .nullable()
    .optional(),
  proof: z.any().nullable().optional(),
  sameAs: z.any().nullable().optional(),
});

export type CreateCredentialDto = z.infer<typeof CreateCredentialDto>;
