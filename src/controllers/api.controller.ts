import { NextFunction, Request, Response } from "express";
import createError from "http-errors";
import path from "node:path";
import { ulid } from "ulid";

import { prisma } from "../db/prisma";
import { passToExpressErrorHandler, poormansNormalizer, turnFalsyPropsToUndefined } from "../utils";

import axios from "axios";
import { config } from "../config";
import { ClaimDao, CredentialDao, NodeDao } from "../dao/api.dao";
import { ProtectedMulterRequest } from "../middlewares/upload/multer.upload";
import { CreateClaimV2Dto, ImageDto, CreateCredentialDto } from "../middlewares/validators";
import { uploadImageToS3 } from "../utils/aws-s3";
import { calculateBufferHash } from "../utils/hash";

const DEFAULT_LIMIT = 100;

const claimDao = new ClaimDao();
const nodeDao = new NodeDao();

export const claimPost = async (req: Request, res: Response, next: NextFunction) => {
  let claim;
  let claimData;
  let claimImages = [];

  try {
    const userId = (req as ModifiedRequest).userId;
    let rawClaim: any = turnFalsyPropsToUndefined(req.body);
    rawClaim = poormansNormalizer(rawClaim);
    rawClaim.effectiveDate = new Date(rawClaim.effectiveDate);

    claim = await claimDao.createClaim(userId, rawClaim);

    await processClaim(claim.id);

    const name = rawClaim.name;
    if (name) {
      claimData = await claimDao.createClaimData(claim.id, name);
    }

    if (rawClaim.images && rawClaim.images.length > 0) {
      claimImages = await claimDao.createImages(claim.id, userId, rawClaim.images);
    }
  } catch (err) {
    passToExpressErrorHandler(err, next);
  }

  return res.status(201).json({ claim, claimData, claimImages });
};

const credentialDao = new CredentialDao();
export const createCredential = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = CreateCredentialDto.safeParse(req.body);
    if (!result.success) {
      return next({ data: result.error.errors, statusCode: 422 });
    }

    const { context, id, type, issuer, issuanceDate, expirationDate, credentialSubject, proof, sameAs, achievement } =
      result.data;

    const credential = await credentialDao.createCredential({
      context,
      id,
      type,
      issuer,
      issuanceDate,
      expirationDate,
      credentialSubject,
      proof,
      sameAs,
    });

    const name = credentialSubject?.name || "Credential";
    const _achievement = (achievement?.[0] as { id: string } | undefined)?.id;
    const created = await createAndProcessClaim(
      {
        subject: name,
        claimAddress: id,
        name: name,
        object: "",
        claim: "",
        issuerId: issuer.id,
        effectiveDate: issuanceDate,
        statement: credentialSubject?.evidenceDescription || _achievement || "",
        sourceURI: credentialSubject?.evidenceLink || _achievement || "",
        images: [],
      },
      issuer.id,
    );

    return res.status(201).json({ message: "Credential created successfully!", credential, ...created });
  } catch (err) {
    passToExpressErrorHandler(err, next);
  }
};

export async function createClaimV2(req: Request, res: Response, next: NextFunction) {
  const _req = req as ProtectedMulterRequest;
  const { userId } = _req;

  const { files } = _req;
  const dtoRequestBody = files?.dto ?? {};
  const imagesRequestBody = files?.images ?? [];

  let body: any;

  if (Array.isArray(dtoRequestBody) && dtoRequestBody.length > 0) {
    body = JSON.parse(dtoRequestBody[0]?.buffer.toString("utf-8"));
  } else {
    return next({ message: "No DTO provided", statusCode: 400 });
  }

  const result = CreateClaimV2Dto.safeParse(body);
  if (!result.success) {
    return next({ data: result.error.errors, statusCode: 422 });
  }

  try {
    const { claim, claimData, claimImages } = await createAndProcessClaim(result.data, userId, imagesRequestBody);
    return res.status(201).json({ claim, claimData, claimImages });
  } catch (e) {
    return passToExpressErrorHandler(e, next);
  }
}

async function createAndProcessClaim(
  claim: CreateClaimV2Dto,
  userId: number | string,
  images: Express.Multer.File[] = [],
) {
  if (images.length !== claim.images.length) {
    throw new createError.UnprocessableEntity("Invalid images metadata");
  }

  const createdClaim = await claimDao.createClaimV2(userId, claim);

  await processClaim(createdClaim.id);

  const name = claim.name;
  let claimData = null;
  if (name) {
    claimData = await claimDao.createClaimData(createdClaim.id, name);
  }

  let awsImages: { hash: string; url: string }[];

  try {
    awsImages = await Promise.all(
      images.map(async (f) => {
        const filename = `${ulid()}${path.extname(f.originalname)}`;
        await uploadImageToS3(filename, f);
        return {
          hash: calculateBufferHash(f.buffer),
          url: `https://${config?.s3?.bucketName}.s3.${config?.s3?.region}.amazonaws.com/${filename}`,
        };
      }),
    );
  } catch (e) {
    const _e = e as Error;
    console.error("Error uploading the images:", _e.message);
    throw {
      ..._e,
      message: "Error uploading the images",
      statusCode: 500,
    };
  }

  const createdImages = claim.images.map((x, i) => ({
    ...x,
    url: awsImages[i].url,
    signature: awsImages[i].hash,
  })) as ImageDto[];

  const claimImages = await claimDao.createImagesV2(createdClaim.id, userId, createdImages);

  return {
    claim,
    claimData,
    claimImages,
  };
}

export const claimGetById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { claimId } = req.params;
    const id = Number(claimId);

    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid claim ID" });
    }

    const { claim, claimData, claimImages } = await claimDao.getClaimById(id);

    if (!claim) {
      throw new createError.NotFound("Not Found");
    }

    res.status(201).json({ claim, claimData, claimImages });
  } catch (err) {
    passToExpressErrorHandler(err, next);
  }
};

export const getAllClaims = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const claims = await prisma.claim.findMany();
    const claimsData = [];
    for (const claim of claims) {
      const data = await claimDao.getClaimData(claim.id as any);
      const images = await claimDao.getClaimImages(claim.id as any);
      claimsData.push({ data, claim, images });
    }
    const count = await prisma.claim.count({});

    res.status(201).json({ claimsData, count });
  } catch (err) {
    passToExpressErrorHandler(err, next);
  }
};

export const claimSearch = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { search, page = 1, limit = 10 } = req.query;

    let claims = [];
    let count;

    if (search) {
      const searchResult = await claimDao.searchClaims(search as string, Number(page), Number(limit));
      claims = searchResult.claimData;
      count = searchResult.count;
    } else {
      count = await prisma.claim.count();
      const claimsData = await prisma.claim.findMany({
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit) > 0 ? Number(limit) : undefined,
      });
      for (const claim of claimsData) {
        const data = await claimDao.getClaimData(claim.id);
        const images = await claimDao.getClaimImages(claim.id);
        const relatedNodes = await claimDao.getRelatedNodes(claim.id);
        claims.push({ data, claim, images, relatedNodes });
      }
    }

    res.status(200).json({ claims, count });
  } catch (err) {
    passToExpressErrorHandler(err, next);
  }
};

export const claimsGet = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = 0, limit = 0 } = req.query;

    const nodes = await nodeDao.getNodes(Number(page), Number(limit));
    res.status(200).json(nodes);
    return;
  } catch (err) {
    passToExpressErrorHandler(err, next);
  }
};
/*********************************************************************/

/* This is for initializing the graph for a given claim */
export const claimGraph = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { claimId } = req.params;
    const result = await nodeDao.getClaimGraph(claimId);
    res.status(200).json(result);
    return;
  } catch (err) {
    passToExpressErrorHandler(err, next);
  }
};

/* This is for the home feed and the search */
export const claimsFeed = async (req: Request, res: Response, next: NextFunction) => {
  try {
    let { page = 1, limit = 100, search = "" } = req.query;

    page = parseInt(page.toString());
    limit = parseInt(limit.toString());
    search = decodeURIComponent(search.toString());

    if (Number.isNaN(page) || Number.isNaN(limit) || limit < 0 || page - 1 < 0) {
      throw new createError.UnprocessableEntity("Invalid query string value");
    }

    if (limit > 10000) {
      throw new createError.UnprocessableEntity("The limit value is too high");
    }

    const offset = (page - 1) * limit;

    const feed_entries = await nodeDao.getFeedEntries(offset, limit, search);
    res.status(200).json(feed_entries);
    return;
  } catch (err) {
    passToExpressErrorHandler(err, next);
  }
};

export async function claimsFeedV3(req: Request, res: Response, next: NextFunction) {
  try {
    const { search, limit, nextPage } = parseAndValidateClaimsFeedV3Query(req.query);
    const feedEntries = await nodeDao.getFeedEntriesV3(limit, nextPage, search);
    return res.status(200).json(feedEntries);
  } catch (err) {
    passToExpressErrorHandler(err, next);
  }
}

function parseAndValidateClaimsFeedV3Query(query: Request["query"]): {
  limit: number;
  nextPage: string | null;
  search: string | null;
} {
  const limit = parseInt((query.limit || DEFAULT_LIMIT).toString());

  if (Number.isNaN(limit) || limit <= 0 || limit > 10000) {
    throw new createError.UnprocessableEntity("Invalid limit value");
  }

  const search = query.search ? decodeURIComponent(query.search.toString()) : null;

  const nextPage = query.nextPage?.toString() || null;

  return { limit, search, nextPage };
}

async function processClaim(claimId: string | number) {
  const { url } = config.dataPipeline;
  if (!url) return;

  try {
    await axios.post(`${url}/process_claim/${claimId}`);
  } catch (e) {
    console.error(`Error while processing a claim (${claimId}): ${e}`);
    throw e;
  }
}
