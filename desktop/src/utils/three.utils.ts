import { Camera, Material, Mesh, Object3D, Scene, WebGLRenderer } from "three";

export class ShaderUtils {
  static init(
    renderer: WebGLRenderer,
    scene: Scene,
    camera: Camera,
    object: Object3D
  ): void {
    // renderer.compile(scene, camera); // Might be unnecessary, the shaders could already be compiled

    window.addEventListener("keydown", (event: KeyboardEvent) => {
      console.log("keydown", event.key);
      if (event.key === "f") {
        ShaderUtils.findAndOutputShader(
          renderer,
          object,
          "fragmentShader",
          "Fragment Shader"
        );
      }
      if (event.key === "v") {
        ShaderUtils.findAndOutputShader(
          renderer,
          object,
          "vertexShader",
          "Vertex Shader"
        );
      }
    });
  }

  private static findAndOutputShader(
    renderer: WebGLRenderer,
    object: Object3D,
    shaderIdentifier: string,
    shaderName: string
  ): void {
    if (!(object instanceof Mesh)) {
      throw new Error("Object is not a mesh");
    }
    const material = object.material as Material;
    console.log("renderer", renderer);
    // Three.js doesn't expose its internal renderer properties / shader sources
    // publicly, so we reach into private structures here.
    type ProgramEntry = [unknown, Record<string, WebGLShader>];
    type RendererInternals = {
      properties: { get: (m: Material) => { programs: Iterable<ProgramEntry> } };
      getContext: () => WebGLRenderingContext;
    };
    const internals = renderer as unknown as RendererInternals;
    const programs = internals.properties.get(material).programs;

    for (const program of programs) {
      const shaderSource = internals
        .getContext()
        .getShaderSource(program[1][shaderIdentifier]);

      ShaderUtils.outputShader(`// ----${shaderName} Code----`, shaderSource);
    }
  }

  private static outputShader(prefix: string, code: string): void {
    const formattedCode = code.replaceAll("\t", "  ");
    console.log(`${prefix}\n${formattedCode}`);
  }
}
