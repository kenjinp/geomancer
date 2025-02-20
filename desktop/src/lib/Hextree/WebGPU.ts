/// <reference types="@webgpu/types" />

/**
 * Custom WebGPU device wrapper that abstracts the device creation process.
 * Usage:
 *    const device = await GPUDevice.create();
 */
export class GPUDevice {
  /**
   * Creates and returns a GPUDevice instance from the navigator API.
   * Throws an error if WebGPU is not supported or adapter is not available.
   */
  static async create(): Promise<globalThis.GPUDevice> {
    if (!navigator.gpu) {
      throw new Error("WebGPU is not supported in this browser.");
    }
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      throw new Error("GPU adapter not available.");
    }
    const device = await adapter.requestDevice();
    return device;
  }
}
