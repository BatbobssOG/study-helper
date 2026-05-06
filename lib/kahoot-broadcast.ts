// Sends a Supabase Realtime broadcast event via the REST API.
// Using REST (not WebSocket) is required in serverless Next.js API routes —
// a WebSocket handshake per invocation is too slow and unreliable.
export async function broadcast(
  sessionCode: string,
  event: string,
  payload: Record<string, unknown>
): Promise<void> {
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/realtime/v1/api/broadcast`
  await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'apikey':        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    },
    body: JSON.stringify({
      messages: [{
        topic:   `realtime:game:${sessionCode}`,
        event,
        payload,
      }],
    }),
  })
}
