import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { sphereComputeShader } from "./SphereTesselation.wgsl";

interface SphereParams {
  levelOfDetail: number;
  radius: number;
}

export class SphereTessellation {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private device: GPUDevice;
  private computePipeline: GPUComputePipeline;
  private paramsBuffer: GPUBuffer;
  private vertexBuffer: GPUBuffer;
  private normalBuffer: GPUBuffer;
  private bindGroup: GPUBindGroup;
  private mesh: THREE.Mesh;
  private params: SphereParams = {
    levelOfDetail: 32,
    radius: 1.0,
  };

  constructor(canvas: HTMLCanvasElement) {
    this.initThree(canvas);
    this.initWebGPU();
  }

  private async initWebGPU() {
    if (!navigator.gpu) {
      throw new Error("WebGPU not supported");
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      throw new Error("No adapter found");
    }

    this.device = await adapter.requestDevice();

    // Create compute pipeline
    this.computePipeline = this.device.createComputePipeline({
      layout: "auto",
      compute: {
        module: this.device.createShaderModule({
          code: sphereComputeShader,
        }),
        entryPoint: "main",
      },
    });

    // Create buffers
    const vertexCount =
      this.params.levelOfDetail * this.params.levelOfDetail * 6;

    this.paramsBuffer = this.device.createBuffer({
      size: 8, // 2 * float32
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.vertexBuffer = this.device.createBuffer({
      size: vertexCount * 16, // vec4f
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });

    this.normalBuffer = this.device.createBuffer({
      size: vertexCount * 12, // vec3f
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });

    // Create bind group
    this.bindGroup = this.device.createBindGroup({
      layout: this.computePipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: { buffer: this.paramsBuffer },
        },
        {
          binding: 1,
          resource: { buffer: this.vertexBuffer },
        },
        {
          binding: 2,
          resource: { buffer: this.normalBuffer },
        },
      ],
    });
  }

  private initThree(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGPURenderer({ canvas });
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.camera.position.z = 5;

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);

    // Create initial sphere mesh
    const geometry = new THREE.BufferGeometry();
    const material = new THREE.MeshPhongMaterial({
      color: 0x156289,
      emissive: 0x072534,
      side: THREE.DoubleSide,
      flatShading: true,
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.scene.add(this.mesh);

    // Add lights
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(1, 1, 1);
    this.scene.add(light);

    const ambientLight = new THREE.AmbientLight(0x404040);
    this.scene.add(ambientLight);
  }

  public async compute() {
    console.log({ device: this.device });
    // Update params buffer
    this.device.queue.writeBuffer(
      this.paramsBuffer,
      0,
      new Float32Array([this.params.levelOfDetail, this.params.radius])
    );

    // Create command encoder and pass
    const commandEncoder = this.device.createCommandEncoder();
    const computePass = commandEncoder.beginComputePass();

    computePass.setPipeline(this.computePipeline);
    computePass.setBindGroup(0, this.bindGroup);
    computePass.dispatchWorkgroups(
      Math.ceil(
        (this.params.levelOfDetail * this.params.levelOfDetail * 6) / 256
      )
    );
    computePass.end();

    // Execute GPU commands
    this.device.queue.submit([commandEncoder.finish()]);

    // Read back the results and update Three.js geometry
    const vertexBuffer = await this.vertexBuffer.mapAsync(GPUMapMode.READ);
    const normalBuffer = await this.normalBuffer.mapAsync(GPUMapMode.READ);

    const vertices = new Float32Array(vertexBuffer);
    const normals = new Float32Array(normalBuffer);

    this.mesh.geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(vertices, 4)
    );
    this.mesh.geometry.setAttribute(
      "normal",
      new THREE.BufferAttribute(normals, 3)
    );
    this.mesh.geometry.computeBoundingSphere();

    this.vertexBuffer.unmap();
    this.normalBuffer.unmap();
  }

  public async render() {
    await this.renderer.renderAsync(this.scene, this.camera);
  }

  public animate = async () => {
    requestAnimationFrame(this.animate);
    this.controls.update();
    await this.render();
  };

  public updateParams(params: Partial<SphereParams>) {
    Object.assign(this.params, params);
    this.compute();
  }

  public resize(width: number, height: number) {
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  public dispose() {
    this.renderer.dispose();
  }
}
