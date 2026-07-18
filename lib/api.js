export async function fetchJson(url, options) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });

  if (!response.ok) {
    let message = "Request failed";
    try {
      const errorPayload = await response.json();
      message = errorPayload.error || message;
    } catch {
      // Keep generic error message.
    }
    throw new Error(message);
  }

  return response.json();
}
