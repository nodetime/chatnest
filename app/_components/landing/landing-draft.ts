export const LANDING_DRAFT_KEY = "shuzhitan:landing-draft:v1";
const MAX_CHARACTERS = 8000;
const TTL_MS = 10 * 60 * 1000;

type DraftOwner = { id: string; type: string };
type StorageReader = Pick<Storage, "getItem" | "removeItem">;

export function createLandingDraft(
  text: string,
  ownerId: string | null,
  createdAt = Date.now()
) {
  if (!text.trim() || text.length > MAX_CHARACTERS) {
    return null;
  }
  return { createdAt, ownerId, text, version: 1 };
}

export function readLandingDraft(
  raw: string | null,
  owner: DraftOwner,
  now = Date.now()
): string | null {
  try {
    const draft = JSON.parse(raw ?? "null");
    if (
      draft?.version !== 1 ||
      typeof draft.text !== "string" ||
      !draft.text.trim() ||
      draft.text.length > MAX_CHARACTERS ||
      !Number.isSafeInteger(draft.createdAt) ||
      draft.createdAt > now ||
      now - draft.createdAt > TTL_MS ||
      !(
        draft.ownerId === owner.id ||
        (draft.ownerId === null && owner.type === "guest")
      )
    ) {
      return null;
    }
    return draft.text;
  } catch {
    return null;
  }
}

export function takeLandingDraft(
  storage: StorageReader,
  owner: DraftOwner,
  now = Date.now()
) {
  const raw = storage.getItem(LANDING_DRAFT_KEY);
  // Remove before projecting: blocked storage must never cause an implicit replay.
  storage.removeItem(LANDING_DRAFT_KEY);
  return readLandingDraft(raw, owner, now);
}
