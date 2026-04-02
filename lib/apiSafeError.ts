export function safeApiErrorMessage(internal: string, publicMessage = "요청을 처리할 수 없습니다."): string {
  return process.env.NODE_ENV === "production" ? publicMessage : internal;
}

export function safeApiErrorBody(
  internal: string,
  publicMessage = "요청을 처리할 수 없습니다."
): { error: string } {
  return { error: safeApiErrorMessage(internal, publicMessage) };
}
