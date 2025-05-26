import { type RequestHandler, Router } from "express";
import { claimPostNormalizer } from "../../middlewares/normalizers";
import {
  claimPost,
  claimsGet,
  createCredential,
  claimsFeed,
  getNodeById,
  searchNodes,
  claimReport,
  getNodeForLoggedInUser,
  claimGetById,
  claimGraph,
  claimSearch,
  createClaimV2,

  expandGraph,

  expandGraphNode,

} from "../../controllers";
import { jwtVerify } from "../../middlewares";
import { claimsFeedV3, getAllClaims } from "../../controllers/api.controller";
import { claimPostSchema, joiValidator } from "../../middlewares/validators/claim.validator";
import { upload } from "../../middlewares/upload/multer.upload";

const router = Router();
console.log("setting up routes");
router.post("/claim", jwtVerify, claimPostNormalizer, joiValidator(claimPostSchema), claimPost);
router.post("/credential?", createCredential);
router.post("/claim/v2", upload as unknown as RequestHandler, jwtVerify, createClaimV2);
router.get("/claim/search", claimSearch);
router.get("/claim/:claimId?", claimGetById);
router.get("/claim_graph/:claimId", claimGraph);


// Replace the existing route with a custom handler
router.get("/claim_graph/:claimId/expand", (req, res, next) => {
  console.log("==== CLAIM_GRAPH EXPAND ROUTE CALLED ====");
  console.log("Params:", req.params);
  console.log("Query:", req.query);
  
  try {
    if (!req.params.claimId) {
      console.error("Missing claimId parameter");
      return res.status(400).json({
        error: "Missing claimId",
        message: "claimId is required in the URL path"
      });
    }
    
    if (req.query.type && req.query.type === 'test') {
      // For compatibility: if type=test is passed, use the old expandGraph
      console.log("Using legacy expandGraph handler with claimId:", req.params.claimId);
      expandGraph(req, res, next);
    } else {
      // Use our new node expansion system
      console.log("Using new expandGraphNode handler");
      // Extract the claimId and set it as nodeValue with nodeType=claim
      req.query.nodeType = "claim";
      req.query.nodeValue = req.params.claimId;
      
      // Forward to our standard graph expansion handler
      expandGraphNode(req, res, next);
    }
  } catch (error) {
    console.error("Error in claim_graph/expand route handler:", error);
    console.error("Stack:", error instanceof Error ? error.stack : "No stack trace");
    res.status(500).json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
  console.log("=========================================");
});


router.get("/claims-all", getAllClaims);
router.get("/claimsfeed", claimsGet);
router.get("/claimsfeed2", claimsFeed);
router.get("/claims/v3", claimsFeedV3);
router.get("/node/search", searchNodes);
router.get("/node/:nodeId?", getNodeById);
router.get("/my-node", getNodeForLoggedInUser);
router.get("/report/:claimId?", claimReport);

router.get("/graph/expand", expandGraphNode);
router.get("/graph/:claimId", claimGraph);
router.get("/graph/:claimId/expand", expandGraph);


export default router;
