import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import morgan from "morgan";
import createError from "http-errors";
const port = process.env.PORT || 9000;
import apiRoutes from "./routes/api.route";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(morgan("dev"));

app.use(cors());

app.use("/api", apiRoutes);

app.use((req, res, next) => {
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
