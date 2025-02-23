/// <reference types="@webgpu/types" />

let device: globalThis.GPUDevice | null = null;

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
    if (device) {
      return device;
    }
    if (!navigator.gpu) {
      throw new Error("WebGPU is not supported in this browser.");
    }
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      throw new Error("GPU adapter not available.");
    }
    device = await adapter.requestDevice();
    return device;
  }
}
