const requiredStringFields = [
  "id",
  "name",
  "version",
  "route",
  "description",
];

export function validateManifest(manifest) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return { valid: false, errors: ["Manifest must be an object."] };
  }

  const errors = requiredStringFields
    .filter((field) => typeof manifest[field] !== "string" || manifest[field].length === 0)
    .map((field) => `${field} must be a non-empty string.`);

  if (typeof manifest.enabled !== "boolean") {
    errors.push("enabled must be a boolean.");
  }

  if (!manifest.seo || typeof manifest.seo !== "object" || Array.isArray(manifest.seo)) {
    errors.push("seo must be an object.");
  } else {
    for (const field of ["title", "description"]) {
      if (typeof manifest.seo[field] !== "string" || manifest.seo[field].length === 0) {
        errors.push(`seo.${field} must be a non-empty string.`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}