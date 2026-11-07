export async function resolveSessionRevision({
  read,
  tokenRevision,
  userId,
}: {
  read: (userId: string) => Promise<number | null>;
  tokenRevision: number | undefined;
  userId: string;
}): Promise<number | null> {
  const currentRevision = await read(userId);
  if (
    currentRevision === null ||
    (tokenRevision !== undefined && tokenRevision !== currentRevision)
  ) {
    return null;
  }
  return currentRevision;
}
