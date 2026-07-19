import type { Request } from "express";
import { badRequest } from "./errors.js";

export function routeParam(request: Request, name: string): string {
  const value = request.params[name];
  if (typeof value !== "string" || value.length === 0) throw badRequest(`Route parameter ${name} is required`);
  return value;
}
