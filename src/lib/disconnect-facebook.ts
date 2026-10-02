// Only report a disconnect after the server confirms the database write.
export async function disconnectFacebookPage(botId: string) {
  const response = await fetch(`/api/bots/${encodeURIComponent(botId)}/messenger/connect`, { method: 'DELETE' });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.success !== true) {
    throw new Error(result?.error || 'Failed to disconnect Facebook Page. Please try again.');
  }
}
