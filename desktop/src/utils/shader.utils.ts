import { IUniform } from "three";

// Using WebGLProgram instead of Shader since Three.js doesn't export a Shader type
// The shader parameter in onBeforeCompile is actually an internal type in Three.js
interface Shader {
  vertexShader: string;
  fragmentShader: string;
  uniforms: { [uniform: string]: IUniform };
}

export interface ShaderPatch {
  chunk: string; // The Three.js chunk name to replace/inject before/after
  glsl: string; // The GLSL code to inject directly
  mode: "replace" | "before" | "after"; // How to inject the code
  isGlobalDefinition?: boolean; // Whether this should be injected at the very top of the shader
}

/**
 * Utility class for managing shader modifications
 */
export class ShaderUtils {
  /**
   * Apply patches to a shader
   * @param shader The Three.js shader to modify
   * @param vertexPatches Array of patches to apply to the vertex shader
   * @param fragmentPatches Array of patches to apply to the fragment shader
   */
  static patchShader(
    shader: Shader,
    vertexPatches: ShaderPatch[] = [],
    fragmentPatches: ShaderPatch[] = [],
    uniforms: { [uniform: string]: IUniform } = {},
  ): void {
    // Add custom uniforms
    Object.keys(uniforms).forEach((key) => {
      shader.uniforms[key] = uniforms[key];
    });

    // First, collect global definitions
    let vertexDefinitions = "";
    let fragmentDefinitions = "";

    // Extract global definitions from vertex patches
    vertexPatches.forEach((patch) => {
      if (patch.isGlobalDefinition) {
        vertexDefinitions += patch.glsl + "\n";
      }
    });

    // Extract global definitions from fragment patches
    fragmentPatches.forEach((patch) => {
      if (patch.isGlobalDefinition) {
        fragmentDefinitions += patch.glsl + "\n";
      }
    });

    // Insert global definitions at the beginning of shaders
    if (vertexDefinitions) {
      shader.vertexShader = this.insertAfterVersion(shader.vertexShader, vertexDefinitions);
    }

    if (fragmentDefinitions) {
      shader.fragmentShader = this.insertAfterVersion(shader.fragmentShader, fragmentDefinitions);
    }

    // Apply remaining vertex patches
    for (const patch of vertexPatches) {
      if (!patch.isGlobalDefinition) {
        shader.vertexShader = this.applyPatch(
          shader.vertexShader,
          patch.chunk,
          patch.glsl,
          patch.mode,
        );
      }
    }

    // Apply remaining fragment patches
    for (const patch of fragmentPatches) {
      if (!patch.isGlobalDefinition) {
        shader.fragmentShader = this.applyPatch(
          shader.fragmentShader,
          patch.chunk,
          patch.glsl,
          patch.mode,
        );
      }
    }
  }

  /**
   * Insert code right after the #version directive, or at the beginning if no version found
   */
  private static insertAfterVersion(shader: string, code: string): string {
    // Check if there's a #version directive
    const versionMatch = shader.match(/(#version [^\n]+\n)/);
    if (versionMatch && versionMatch.index !== undefined) {
      const index = versionMatch.index + versionMatch[0].length;
      return shader.substring(0, index) + "\n" + code + shader.substring(index);
    }

    // If no #version, insert at the beginning
    return code + shader;
  }

  /**
   * Apply a single patch to shader code
   */
  private static applyPatch(
    shader: string,
    chunk: string,
    glsl: string,
    mode: "replace" | "before" | "after",
  ): string {
    // Handle special cases for simpler chunks
    if (chunk === "void main() {") {
      return shader.replace(
        "void main() {",
        mode === "replace"
          ? glsl
          : mode === "before"
            ? glsl + "\nvoid main() {"
            : "void main() {\n" + glsl,
      );
    }

    // Handle actual includes
    const includePattern = `#include <${chunk}>`;
    if (shader.includes(includePattern)) {
      return shader.replace(
        includePattern,
        mode === "replace"
          ? glsl
          : mode === "before"
            ? glsl + "\n" + includePattern
            : includePattern + "\n" + glsl,
      );
    }

    // Handle replacing arbitrary code chunks
    if (shader.includes(chunk)) {
      return shader.replace(
        chunk,
        mode === "replace" ? glsl : mode === "before" ? glsl + "\n" + chunk : chunk + "\n" + glsl,
      );
    }

    console.warn(`Chunk '${chunk}' not found in shader: ${chunk}`);
    console.log(shader);
    return shader;
  }
}
