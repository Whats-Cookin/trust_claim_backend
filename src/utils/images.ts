import sharp from "sharp";
import { z } from "zod";
import {
  CreateClaimV2Dto,
  ImageDto,
} from "../middlewares/validators/claim.validator";
import { getS3SignedUrl } from "./aws-s3";

export function parseImagesFromClaimDto(
  dto: CreateClaimV2Dto,
  urls: string[],
): ImageDto[] {
  if (!dto.imagesEffectiveDate) return [];

  const images: ImageDto[] = [];

  const { imagesCaption, imagesDescription, imagesEffectiveDate } = dto;

  // It had to be like that to help typescript infer the types on assigning
  const notArray =
    urls.length === 1 &&
    !Array.isArray(imagesEffectiveDate) &&
    !Array.isArray(imagesCaption) &&
    !Array.isArray(imagesDescription);

  const isArray =
    urls.length > 1 &&
    Array.isArray(imagesEffectiveDate) &&
    Array.isArray(imagesCaption) &&
    Array.isArray(imagesDescription);

  if (notArray) {
    const image: ImageDto = {
      url: urls[0],
      effectiveDate: imagesEffectiveDate,
      // TOOD:
      signature: "",
    };
    // if (imagesSignature) image.signature = imagesSignature;
    // if (imagesDigestMultibase) image.digestedMultibase = imagesDigestMultibase;
    if (imagesCaption || imagesDescription) {
      image.metadata = {};
      if (imagesCaption) image.metadata.caption = imagesCaption;
      if (imagesDescription) image.metadata.description = imagesDescription;
    }
    images.push(image);
  } else if (isArray) {
    for (let i = 0; i < imagesEffectiveDate.length; i++) {
      const image: ImageDto = {
        url: urls[i],
        effectiveDate: imagesEffectiveDate[i],
        signature: "",
      };
      // if (imagesDigestMultibase[i])
      //   image.digestedMultibase = imagesDigestMultibase[i] as string;
      // if (imagesCaption || imagesDescription) {
      //   image.metadata = {};
      //   if (imagesCaption) image.metadata.caption = imagesCaption[i] as string;
      //   if (imagesDescription)
      //     image.metadata.description = imagesDescription[i] as string;
      // }
      // TODO: remove this
      images.push(image);
    }
  }

  return images;
}

export function optimizeImage(img: Buffer): Promise<Buffer> {
  return sharp(img).jpeg({ quality: 80 }).toBuffer();
}

export async function getUrl(filenameOrUrl: string) {
  const { success } = z.string().url().safeParse(filenameOrUrl);
  if (success) return filenameOrUrl;
  return await getS3SignedUrl(filenameOrUrl);
}
