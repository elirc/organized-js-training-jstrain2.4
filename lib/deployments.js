export const DEPLOYMENT_TRANSITIONS = {
  BUILDING: ["DEPLOYING", "FAILED"],
  DEPLOYING: ["LIVE", "FAILED"],
  LIVE: ["ROLLED_BACK"],
  FAILED: ["ROLLED_BACK"],
  ROLLED_BACK: [],
};

export function canTransitionStatus(fromStatus, toStatus) {
  const allowed = DEPLOYMENT_TRANSITIONS[fromStatus] ?? [];
  return allowed.includes(toStatus);
}

export function toVersionNumber(version) {
  return version
    .replace(/^v/i, "")
    .split(".")
    .map((chunk) => Number.parseInt(chunk, 10) || 0);
}

export function compareVersions(a, b) {
  const parsedA = toVersionNumber(a);
  const parsedB = toVersionNumber(b);
  const maxLength = Math.max(parsedA.length, parsedB.length);

  for (let index = 0; index < maxLength; index += 1) {
    const aPart = parsedA[index] ?? 0;
    const bPart = parsedB[index] ?? 0;

    if (aPart > bPart) {
      return 1;
    }

    if (aPart < bPart) {
      return -1;
    }
  }

  return 0;
}

export function nextPatchVersion(existingVersions) {
  if (!existingVersions.length) {
    return "v1.0.0";
  }

  const sorted = [...existingVersions].sort(compareVersions);
  const latest = sorted[sorted.length - 1];
  const [major, minor, patch] = toVersionNumber(latest);

  return `v${major}.${minor}.${patch + 1}`;
}

export function maskedSecret(value) {
  if (!value) {
    return "";
  }

  if (value.length < 6) {
    return "*".repeat(value.length);
  }

  return `${value.slice(0, 2)}${"*".repeat(value.length - 4)}${value.slice(-2)}`;
}
