import { Request, Response, NextFunction } from "express";
import { passToExpressErrorHandler, turnFalsyPropsToUndefined } from "../utils";
import createError from "http-errors";

import { NodeDao, GetClaimReport } from "../dao/api.dao";

const nodeDao = new NodeDao();
/*********************************************************************/
// Function to get a node by its ID
export const getNodeById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { nodeId } = req.params;

    const node = await nodeDao.getNodeById(Number(nodeId));

    if (!node) {
      throw new createError.NotFound("Node does not exist");
    }

    res.status(201).json(node);
  } catch (err) {
    passToExpressErrorHandler(err, next);
  }
};

// Function to search for nodes
export const searchNodes = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { search, page = 1, limit = 10 } = req.query;
    let nodes;
    let count;

    if (search) {
      const searchResult = await nodeDao.searchNodes(
        search as string,
        Number(page),
        Number(limit)
      );
      nodes = searchResult.nodes;
      count = searchResult.count;
    }

    res.status(200).json({ nodes, count });
  } catch (err) {
    passToExpressErrorHandler(err, next);
  }
};

// this is fine, later we also want to find the nodes with their metamask DID - most of them will NOT be by their issuer id

// Most would be by their DID, most users will NOT identify by our user id, but by some external universal way

export const getNodeForLoggedInUser = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as ModifiedRequest).userId;
    const rawClaim: any = turnFalsyPropsToUndefined(req.body);

    // Find a single node connected to the user's claims
    const node = await nodeDao.getNodeForUser(userId, rawClaim);
    res.status(200).json({ node });
  } catch (err) {
    console.error(err);
    passToExpressErrorHandler(err, next);
  }
};

export const claimReport = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { claimId } = req.params;
    let { page = 1, limit = 100 } = req.query; // defaults provided here

    // Convert them to numbers
    page = Number(page);
    limit = Number(limit);

    const offset = (page - 1) * limit;

    const result = await GetClaimReport(claimId, offset, limit);

    //
    // TODO ALSO get other claims about the same subject ie about the subject url of the original claim
    // then ALSO get other claims about the nodes who were the source or issuer of the attestations
    // those can be separate PRs lets start with this one working and the design for it
    //

    res.status(200).json({
      data: result,
    });
    return;
  } catch (err) {
    passToExpressErrorHandler(err, next);
  }
};