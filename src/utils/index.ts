import JWT from "jsonwebtoken";

export const generateJWT = (
  userId: number,
  email: string,
  tokenType: "access" | "refresh" | "passReset"
): string => {
  try {
    let secretVar: string;
    let expiresIn: string | undefined;
    switch (tokenType) {
      case "access":
        secretVar = "ACCESS_SECRET";
        expiresIn = "1h";
        break;
      case "refresh":
        secretVar = "REFRESH_SECRET";
        expiresIn = "1y";
        break;
      case "passReset":
        secretVar = "MAIL_SECRET";
        expiresIn = "24h";
        break;
    }

    const secret: string = process.env[secretVar] as string;
    const payload = { email };
    const options = {
      expiresIn,
      // need to set an issuer
      issuer: "",
      audience: userId,
    };

    const token = JWT.sign(payload, secret, options);

    // if (tokenType === "refresh" && bId) {
    //   // we set the token to redis
    //   redisClient.SADD(`bId:${userId}`, bId);
    //   redisClient.SET(
    //     `refreshToken:${userId}-${bId}`,
    //     token,
    //     "EX",
    //     365 * 24 * 60 * 60,
    //     (err, reply) => {
    //       // TODO should we keep the redis.print???
    //       redis.print(err, reply);
    //     }
    //   );
    // }
    return token;
  } catch (err) {
    throw err;
  }
};
