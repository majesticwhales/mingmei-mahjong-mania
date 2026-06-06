// SERVER SOURCE: server/src/lib/http-error.ts + server/src/middleware/error-handler.ts

export interface HttpErrorBody {
  error: string;
  message: string;
  details?: unknown;
}
