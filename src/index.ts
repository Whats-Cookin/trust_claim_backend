import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import morgan from "morgan";
import createError from "http-errors";
import apiRoutes from "./routes/apiRoutes";
import authRoutes from "./routes/authRoutes";

const port = process.env.PORT || 9000;
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(morgan("dev"))

app.use(
  cors({
    origin: "*",
  })
);

app.use("/auth", authRoutes);
app.use("/api", apiRoutes);
// if nothing matches, this should be before the express error handler
app.use((_req, _res, next) => {
  next(new createError.NotFound());
});

app.use(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  (err: HttpException, _req: Request, res: Response, _next: NextFunction) => {
    const status: number = err.statusCode || 500;
    const { message, data } = err;
    res.status(status).json({ message, data });
  }
);

app.listen(port, () => {
  console.log(`Listening to requests in port - ${port}`);
});
