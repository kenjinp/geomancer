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
      return console.warn("Object is a Mesh, not a Material");
    }
    const material = object.material as Material;
    console.log("renderer", renderer);
    const programs = (renderer as any).properties.get(material).programs;

    for (const program of programs) {
      const shaderSource = (renderer as any)
        .getContext()
        .getShaderSource(program[1][shaderIdentifier]);
      ShaderUtils.outputShader(`// ----${shaderName} Code----`, shaderSource);
    }
  }

  private static outputShader(prefix: string, code: string): void {
    const formattedCode = code.replaceAll("\t", "  ");
    const lines = formattedCode.split("\n");

    const linedCode = lines
      .map((line, i) => {
        const lineNum = i + 1;
        // const padding = lineNum < 10 ? " " : "";
        return line;
      })
      .join("\n");

    console.log(`${prefix}\n${linedCode}`);
  }
}
