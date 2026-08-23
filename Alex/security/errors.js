export function safeErrorResponse(status = 500, message = "Request failed.") {
  const publicMessage = status >= 500 ? "Internal Server Error" : message;
  return new Response(JSON.stringify({ error: publicMessage }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function handleError(error) {
  void error;
  return safeErrorResponse();
}