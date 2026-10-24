// Global OTel registration enables AI SDK telemetry even when a call omits
// settings. Apply this policy to every model call, including nested artifacts.
export const metadataOnlyTelemetry = Object.freeze({
  recordInputs: false,
  recordOutputs: false,
});
