export async function readRequestTextWithLimit(
  request: Request,
  {
    maxBytes,
    tooLargeMessage,
  }: {maxBytes: number; tooLargeMessage: string},
) {
  const lengthHeader = request.headers.get('content-length');
  if (lengthHeader !== null) {
    const declaredLength = Number(lengthHeader);
    if (
      !Number.isFinite(declaredLength) ||
      declaredLength < 0 ||
      declaredLength > maxBytes
    ) {
      throw new Response(tooLargeMessage, {status: 413});
    }
  }

  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const {done, value} = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel();
      throw new Response(tooLargeMessage, {status: 413});
    }
    chunks.push(value);
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}
