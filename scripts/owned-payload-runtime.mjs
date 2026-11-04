/** @param {string | undefined} value */
export function isOwnedPayloadRuntime(value) {
  try {
    const url = new URL(value ?? "http://invalid");
    return (
      url.protocol === "postgres:" &&
      url.hostname === "127.0.0.1" &&
      url.port === "5433" &&
      url.pathname === "/heymoro_native_api_acceptance" &&
      !url.search &&
      !url.hash &&
      /^heymoro_native_app_[a-f0-9]{12}$/.test(url.username) &&
      /^[a-f0-9]{64}$/.test(url.password)
    );
  } catch {
    return false;
  }
}

/** @param {string | undefined} value */
export function isOwnedChatnestRuntime(value) {
  try {
    const url = new URL(value ?? "http://invalid");
    return (
      url.protocol === "postgres:" &&
      url.hostname === "127.0.0.1" &&
      url.port === "55432" &&
      url.pathname === "/chatnest_platform_connected_acceptance" &&
      !url.search &&
      !url.hash &&
      /^chatnest_connected_app_[a-f0-9]{12}$/.test(url.username) &&
      /^[a-f0-9]{64}$/.test(url.password)
    );
  } catch {
    return false;
  }
}
