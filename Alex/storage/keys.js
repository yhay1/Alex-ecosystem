export function validateObjectKey(key) {
  if (
    typeof key !== "string"
    || key.length === 0
    || key.length > 1024
    || key.startsWith("/")
    || key.includes("\\")
    || key.includes("//")
    || key.split("/").some((part) => part === ".." || part === ".")
    || /[\u0000-\u001f\u007f]/.test(key)
  ) {
    throw new Error("Object key must be a safe relative path.");
  }

  return key;
}