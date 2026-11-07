export function storeReturnPath(value: string | string[] | undefined) {
  if (value === "/#quick-practice") return value;
  return typeof value === "string" && /^\/paket(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)?$/.test(value) && value.length <= 87 ? value : "/";
}
