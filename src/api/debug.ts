import { Request, Response, Application } from 'express';

export function listRoutes(req: Request, res: Response) {
  const app = req.app as Application;
  const routes: any[] = [];

  // Express stores routes in app._router.stack
  app._router.stack.forEach((middleware: any) => {
    if (middleware.route) {
      // This is a route
      const methods