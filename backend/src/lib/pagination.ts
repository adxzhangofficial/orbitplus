import type { Request } from "express";

export function pagination(request: Request): { limit: number; offset: number; page: number } {
  const page = Math.max(1, Number.parseInt(String(request.query.page ?? "1"), 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(String(request.query.limit ?? "25"), 10) || 25));
  return { page, limit, offset: (page - 1) * limit };
}

export function pageMeta(total: number, page: number, limit: number) {
  return { total, page, limit, pages: Math.ceil(total / limit) };
}
