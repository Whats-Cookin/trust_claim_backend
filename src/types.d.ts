declare global {
  interface HttpException extends Error {
    statusCode?: number;
    data?: string;
  }
}

export {};
