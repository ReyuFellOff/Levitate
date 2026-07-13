// xoxo/config/debugConfig.ts

export const debugConfig = {
  /** Inactivity timeout for the debug menu (ms). Buttons/dropdown are disabled after this. */
  sessionTimeoutMs: 3 * 60 * 1000,

  /** Whether to show the Process ID in the Cluster & Sharding section. */
  showProcessId: true,

  /** Fall back to a fake CPU usage range if the real reading returns 0 or fails. */
  enableCpuFallback: true,

  /** How long (ms) the CPU snapshot runs to compute real usage. Higher = more accurate. */
  cpuSampleIntervalMs: 150,

  /** Lower bound of the fake CPU range (percent). */
  fakeLowerCpuUsage: 3.0,

  /** Upper bound of the fake CPU range (percent). */
  fakeUpperCpuUsage: 5.0,

  /** Minimum total RAM (MB) reported. Clamps the displayed value up to this floor. */
  minTotalRamMB: 8092,
};

export default debugConfig;
