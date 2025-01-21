import React, { useRef, useMemo, useEffect, useState } from "react";
import { extend, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { PerlinNoise } from "./Perlin";
import { SIMULATION_PARAMS } from "./constants";
import { ParticleVis } from "./Visualizer";

interface ComputeSystem {
  program: WebGLProgram;
  particleBuffers: WebGLBuffer[];
  transformFeedbacks: WebGLTransformFeedback[];
  vao: WebGLVertexArrayObject[];
  currentIndex: number;
  visualizationBuffer: WebGLBuffer;
}

// Compute shaders
const COMPUTE_VERTEX_SHADER = `#version 300 es
precision highp float;

layout(location = 0) in vec4 positionHeight;
layout(location = 1) in vec4 velocityWater;

out vec4 vPositionHeight;
out vec4 vVelocityWater;

uniform sampler2D heightMap;
uniform float deltaTime;
uniform vec2 gridSize;

const float INERTIA = 0.05;
const float SEDIMENT_CAPACITY = 4.0;
const float MIN_SEDIMENT_CAPACITY = 0.01;
const float DEPOSITION_SPEED = 0.3;
const float EROSION_SPEED = 0.3;
const float EVAPORATION_SPEED = 0.01;
const float GRAVITY = 4.0;

vec2 calculateGradient(vec2 pos) {
  vec2 texelSize = 1.0 / gridSize;
  float h = texture(heightMap, pos / gridSize).r;
  float hL = texture(heightMap, (pos + vec2(-1.0, 0.0)) / gridSize).r;
  float hR = texture(heightMap, (pos + vec2(1.0, 0.0)) / gridSize).r;
  float hT = texture(heightMap, (pos + vec2(0.0, 1.0)) / gridSize).r;
  float hB = texture(heightMap, (pos + vec2(0.0, -1.0)) / gridSize).r;
  return vec2(hR - hL, hT - hB) * 0.5;
}

void main() {
  vec2 position = positionHeight.xy;
  float height = positionHeight.z;
  vec2 velocity = velocityWater.xy;
  float water = velocityWater.z;
  float sediment = velocityWater.w;

  vec2 gradient = calculateGradient(position);
  
  vec2 newVelocity = velocity * INERTIA - gradient * (1.0 - INERTIA);
  float speed = length(newVelocity);
  if (speed > 0.0) {
    newVelocity = normalize(newVelocity);
  }
  
  vec2 newPosition = position + newVelocity * deltaTime;
  
  vPositionHeight = positionHeight;
  vVelocityWater = velocityWater;
  
  if (newPosition.x < 0.0 || newPosition.x >= gridSize.x ||
      newPosition.y < 0.0 || newPosition.y >= gridSize.y) {
    return;
  }
  
  float newHeight = texture(heightMap, newPosition / gridSize).r;
  float heightDiff = newHeight - height;
  
  float newSpeed = sqrt(max(0.0, speed * speed + heightDiff * GRAVITY));
  float newWater = water * (1.0 - EVAPORATION_SPEED);
  
  float sedimentCapacity = max(
    MIN_SEDIMENT_CAPACITY,
    newSpeed * newWater * SEDIMENT_CAPACITY
  );
  
  float newSediment = sediment;
  float finalHeight = height;
  
  if (heightDiff > 0.0) {
    float deposit = min(heightDiff, sediment * DEPOSITION_SPEED);
    newSediment -= deposit;
    finalHeight += deposit;
  } else {
    float erosion = min(
      -heightDiff * EROSION_SPEED,
      sedimentCapacity - sediment
    );
    finalHeight -= erosion;
    newSediment += erosion;
  }
  
  vPositionHeight = vec4(newPosition, finalHeight, 0.0);
  vVelocityWater = vec4(newVelocity, newWater, newSediment);
  
  gl_Position = vec4(position / gridSize * 2.0 - 1.0, 0.0, 1.0);
  gl_PointSize = 1.0;
}`;

const COMPUTE_FRAGMENT_SHADER = `#version 300 es
precision highp float;
out vec4 fragColor;
void main() {
  fragColor = vec4(0.0);
}`;

// Update vertex shader to include scale uniform
const VERTEX_SHADER = `
  varying vec2 vUv;
  varying float vHeight;
  uniform sampler2D heightMap;
  uniform float terrainScale;

  void main() {
    vUv = uv;
    
    // Sample height from heightmap
    float height = texture2D(heightMap, uv).r;
    vHeight = height;
    
    // Create displaced position with configurable scale
    vec3 pos = position;
    pos.z += height * terrainScale;
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

// Updated fragment shader with configurable colors
const FRAGMENT_SHADER = `
  varying vec2 vUv;
  varying float vHeight;
  uniform vec3 colorLow;
  uniform vec3 colorHigh;
  
  void main() {
    // Create a smoother height-based color gradient
    vec3 color = mix(colorLow, colorHigh, smoothstep(0.0, 1.0, vHeight));
    
    // Add some basic shading based on height
    float shading = mix(0.7, 1.0, vHeight);
    color *= shading;
    
    gl_FragColor = vec4(color, 1.0);
  }
`;

// Separate compute shader setup into a custom hook for better organization
const useComputeShader = (
  gl: THREE.WebGLRenderer,
  particleData: Float32Array,
  computeVertexShader: string,
  computeFragmentShader: string
): ComputeSystem => {
  return useMemo(() => {
    const gl2 = gl.getContext() as WebGL2RenderingContext;
    if (!gl2) throw new Error("WebGL 2 is required");

    // Helper function to create and compile shaders
    const createShader = (type: number, source: string): WebGLShader => {
      const shader = gl2.createShader(type);
      if (!shader) throw new Error(`Failed to create ${type} shader`);

      gl2.shaderSource(shader, source);
      gl2.compileShader(shader);

      if (!gl2.getShaderParameter(shader, gl2.COMPILE_STATUS)) {
        const error = gl2.getShaderInfoLog(shader);
        gl2.deleteShader(shader);
        throw new Error(`Shader compilation error: ${error}`);
      }

      return shader;
    };

    // Create vertex and fragment shaders
    const vertexShader = createShader(gl2.VERTEX_SHADER, computeVertexShader);
    const fragmentShader = createShader(
      gl2.FRAGMENT_SHADER,
      computeFragmentShader
    );

    // Create and link program
    const program = gl2.createProgram();
    if (!program) throw new Error("Failed to create program");

    gl2.attachShader(program, vertexShader);
    gl2.attachShader(program, fragmentShader);

    // Set transform feedback varyings before linking
    gl2.transformFeedbackVaryings(
      program,
      ["vPositionHeight", "vVelocityWater"],
      gl2.SEPARATE_ATTRIBS
    );

    gl2.linkProgram(program);

    if (!gl2.getProgramParameter(program, gl2.LINK_STATUS)) {
      const error = gl2.getProgramInfoLog(program);
      gl2.deleteProgram(program);
      throw new Error(`Program link error: ${error}`);
    }

    // Clean up shaders
    // gl2.deleteShader(vertexShader);
    // gl2.deleteShader(fragmentShader);

    // Helper function to create buffers
    const createBuffer = (): WebGLBuffer => {
      const buffer = gl2.createBuffer();
      if (!buffer) throw new Error("Failed to create buffer");
      return buffer;
    };

    // Create buffers for particles
    const particleBuffers = Array(4)
      .fill(null)
      .map(() => createBuffer());
    const visualizationBuffer = createBuffer();

    // Calculate buffer sizes
    const positionBufferSize = SIMULATION_PARAMS.NUM_PARTICLES * 4 * 4; // 4 components * 4 bytes
    const velocityBufferSize = SIMULATION_PARAMS.NUM_PARTICLES * 4 * 4;

    // Initialize buffers with data
    gl2.bindBuffer(gl2.ARRAY_BUFFER, particleBuffers[0]);
    gl2.bufferData(
      gl2.ARRAY_BUFFER,
      particleData.slice(0, positionBufferSize),
      gl2.DYNAMIC_COPY
    );

    gl2.bindBuffer(gl2.ARRAY_BUFFER, particleBuffers[1]);
    gl2.bufferData(
      gl2.ARRAY_BUFFER,
      particleData.slice(positionBufferSize),
      gl2.DYNAMIC_COPY
    );

    // Initialize second set of buffers
    gl2.bindBuffer(gl2.ARRAY_BUFFER, particleBuffers[2]);
    gl2.bufferData(gl2.ARRAY_BUFFER, positionBufferSize, gl2.DYNAMIC_COPY);

    gl2.bindBuffer(gl2.ARRAY_BUFFER, particleBuffers[3]);
    gl2.bufferData(gl2.ARRAY_BUFFER, velocityBufferSize, gl2.DYNAMIC_COPY);

    // Initialize visualization buffer
    gl2.bindBuffer(gl2.ARRAY_BUFFER, visualizationBuffer);
    gl2.bufferData(
      gl2.ARRAY_BUFFER,
      positionBufferSize + velocityBufferSize,
      gl2.STATIC_DRAW
    );

    // Helper function to create transform feedbacks
    const createTransformFeedback = (): WebGLTransformFeedback => {
      const tf = gl2.createTransformFeedback();
      if (!tf) throw new Error("Failed to create transform feedback");
      return tf;
    };

    // Create transform feedbacks
    const transformFeedbacks = [
      createTransformFeedback(),
      createTransformFeedback(),
    ];

    // Helper function to create VAOs
    const createVAO = (): WebGLVertexArrayObject => {
      const vao = gl2.createVertexArray();
      if (!vao) throw new Error("Failed to create vertex array object");
      return vao;
    };

    // Create and set up VAOs
    const vaos = [createVAO(), createVAO()];

    // Set up VAOs
    for (let i = 0; i < 2; i++) {
      gl2.bindVertexArray(vaos[i]);

      // Clear any existing bindings
      gl2.bindBuffer(gl2.ARRAY_BUFFER, null);
      gl2.bindBuffer(gl2.TRANSFORM_FEEDBACK_BUFFER, null);

      // Position and height attribute
      gl2.bindBuffer(gl2.ARRAY_BUFFER, particleBuffers[i * 2]);
      gl2.enableVertexAttribArray(0);
      gl2.vertexAttribPointer(0, 4, gl2.FLOAT, false, 0, 0);

      // Velocity and water attribute
      gl2.bindBuffer(gl2.ARRAY_BUFFER, particleBuffers[i * 2 + 1]);
      gl2.enableVertexAttribArray(1);
      gl2.vertexAttribPointer(1, 4, gl2.FLOAT, false, 0, 0);

      gl2.bindBuffer(gl2.ARRAY_BUFFER, null);
    }

    // Set up transform feedbacks
    for (let i = 0; i < 2; i++) {
      // Clear bindings before setting up transform feedback
      gl2.bindBuffer(gl2.ARRAY_BUFFER, null);
      gl2.bindBuffer(gl2.TRANSFORM_FEEDBACK_BUFFER, null);
      gl2.bindTransformFeedback(gl2.TRANSFORM_FEEDBACK, null);

      // Set up transform feedback
      gl2.bindTransformFeedback(gl2.TRANSFORM_FEEDBACK, transformFeedbacks[i]);

      // Bind buffers for transform feedback
      gl2.bindBufferBase(
        gl2.TRANSFORM_FEEDBACK_BUFFER,
        0,
        particleBuffers[((i + 1) % 2) * 2]
      );
      gl2.bindBufferBase(
        gl2.TRANSFORM_FEEDBACK_BUFFER,
        1,
        particleBuffers[((i + 1) % 2) * 2 + 1]
      );

      // Clear transform feedback binding
      gl2.bindTransformFeedback(gl2.TRANSFORM_FEEDBACK, null);
    }

    // Final cleanup
    gl2.bindBuffer(gl2.ARRAY_BUFFER, null);
    gl2.bindBuffer(gl2.TRANSFORM_FEEDBACK_BUFFER, null);
    gl2.bindTransformFeedback(gl2.TRANSFORM_FEEDBACK, null);
    gl2.bindVertexArray(null);

    return {
      program,
      particleBuffers,
      transformFeedbacks,
      vao: vaos,
      currentIndex: 0,
      visualizationBuffer,
    };
  }, [gl, particleData, computeVertexShader, computeFragmentShader]);
};

const GPUTerrainErosion: React.FC = () => {
  const { gl } = useThree();
  const meshRef = useRef<THREE.Mesh>(null);
  const heightMapRef = useRef<THREE.DataTexture | null>(null);
  const [seed] = useState(89734908);

  // Initialize heightmap and particle data
  const [heightMap, particleData] = useMemo(() => {
    const perlin = new PerlinNoise(seed);
    const heightData = new Float32Array(
      SIMULATION_PARAMS.GRID_SIZE * SIMULATION_PARAMS.GRID_SIZE
    );

    // Enhanced terrain generation with multiple octaves
    const scale = 2.0;
    const octaves = 6;
    const persistence = 0.5;
    const lacunarity = 2.0;

    for (let i = 0; i < SIMULATION_PARAMS.GRID_SIZE; i++) {
      for (let j = 0; j < SIMULATION_PARAMS.GRID_SIZE; j++) {
        let amplitude = 1.0;
        let frequency = 1.0;
        let height = 0;

        for (let o = 0; o < octaves; o++) {
          const x = (i / SIMULATION_PARAMS.GRID_SIZE) * scale * frequency;
          const y = (j / SIMULATION_PARAMS.GRID_SIZE) * scale * frequency;

          height += perlin.noise(x, y) * amplitude;
          amplitude *= persistence;
          frequency *= lacunarity;
        }

        heightData[i + j * SIMULATION_PARAMS.GRID_SIZE] = height;
      }
    }

    // Normalize height values
    let min = heightData[0];
    let max = heightData[0];
    for (let i = 1; i < heightData.length; i++) {
      min = Math.min(min, heightData[i]);
      max = Math.max(max, heightData[i]);
    }
    const range = max - min;
    for (let i = 0; i < heightData.length; i++) {
      heightData[i] = (heightData[i] - min) / range;
    }

    const heightTexture = new THREE.DataTexture(
      heightData,
      SIMULATION_PARAMS.GRID_SIZE,
      SIMULATION_PARAMS.GRID_SIZE,
      THREE.RedFormat,
      THREE.FloatType
    );
    heightTexture.needsUpdate = true;
    heightMapRef.current = heightTexture;

    // Initialize particles with improved distribution
    const particles = new Float32Array(SIMULATION_PARAMS.NUM_PARTICLES * 8);
    for (let i = 0; i < SIMULATION_PARAMS.NUM_PARTICLES; i++) {
      const baseIndex = i * 8;
      // Distribute particles more evenly across the terrain
      particles[baseIndex] = Math.random() * SIMULATION_PARAMS.GRID_SIZE;
      particles[baseIndex + 1] = Math.random() * SIMULATION_PARAMS.GRID_SIZE;
      particles[baseIndex + 2] =
        heightData[
          Math.floor(particles[baseIndex]) +
            Math.floor(particles[baseIndex + 1]) * SIMULATION_PARAMS.GRID_SIZE
        ];
      // Initialize with small random velocities
      particles[baseIndex + 4] = (Math.random() - 0.5) * 0.1;
      particles[baseIndex + 5] = (Math.random() - 0.5) * 0.1;
      // Initial water and sediment values
      particles[baseIndex + 6] = 1.0;
      particles[baseIndex + 7] = 0.0;
    }

    return [heightTexture, particles];
  }, [seed]);

  // Set up compute system
  const computeSystem = useComputeShader(
    gl,
    particleData,
    COMPUTE_VERTEX_SHADER,
    COMPUTE_FRAGMENT_SHADER
  );

  // Animation loop with improved error handling
  useFrame(({ clock }) => {
    return;
    const gl2 = gl.getContext() as WebGL2RenderingContext;
    if (!gl2 || !meshRef.current || !heightMapRef.current) return;

    const deltaTime = Math.min(clock.getDelta(), 0.016);

    try {
      // CRITICAL: Make sure all buffers and transform feedbacks are unbound at the start
      gl2.bindBuffer(gl2.ARRAY_BUFFER, null);
      gl2.bindBuffer(gl2.TRANSFORM_FEEDBACK_BUFFER, null);
      gl2.bindBuffer(gl2.COPY_READ_BUFFER, null);
      gl2.bindBuffer(gl2.COPY_WRITE_BUFFER, null);
      gl2.bindTransformFeedback(gl2.TRANSFORM_FEEDBACK, null);
      gl2.bindVertexArray(null);

      // 1. Set up program state
      gl2.useProgram(computeSystem.program);

      // 2. Set up uniforms
      gl2.activeTexture(gl2.TEXTURE0);
      const glTexture = heightMapRef.current.source.data;
      if (glTexture instanceof WebGLTexture) {
        gl2.bindTexture(gl2.TEXTURE_2D, glTexture);
        const heightMapLoc = gl2.getUniformLocation(
          computeSystem.program,
          "heightMap"
        );
        if (heightMapLoc) gl2.uniform1i(heightMapLoc, 0);
      }

      const deltaTimeLoc = gl2.getUniformLocation(
        computeSystem.program,
        "deltaTime"
      );
      const gridSizeLoc = gl2.getUniformLocation(
        computeSystem.program,
        "gridSize"
      );
      if (deltaTimeLoc) gl2.uniform1f(deltaTimeLoc, deltaTime);
      if (gridSizeLoc) {
        gl2.uniform2f(
          gridSizeLoc,
          SIMULATION_PARAMS.GRID_SIZE,
          SIMULATION_PARAMS.GRID_SIZE
        );
      }

      // 3. Prepare for transform feedback
      gl2.enable(gl2.RASTERIZER_DISCARD);

      // 4. Bind VAO for input
      gl2.bindVertexArray(computeSystem.vao[computeSystem.currentIndex]);

      // 5. Set up transform feedback
      const nextIndex = 1 - computeSystem.currentIndex;
      gl2.bindTransformFeedback(
        gl2.TRANSFORM_FEEDBACK,
        computeSystem.transformFeedbacks[nextIndex]
      );

      // 6. Execute transform feedback
      gl2.beginTransformFeedback(gl2.POINTS);
      gl2.drawArrays(gl2.POINTS, 0, SIMULATION_PARAMS.NUM_PARTICLES);
      gl2.endTransformFeedback();

      // 7. Cleanup transform feedback state
      gl2.disable(gl2.RASTERIZER_DISCARD);
      gl2.bindTransformFeedback(gl2.TRANSFORM_FEEDBACK, null);
      gl2.bindVertexArray(null);

      // 8. Synchronize
      gl2.finish();

      // 9. Copy data for visualization - AFTER transform feedback is completely done
      gl2.bindBuffer(gl2.ARRAY_BUFFER, null); // Ensure no conflicting bindings
      gl2.bindBuffer(gl2.TRANSFORM_FEEDBACK_BUFFER, null);

      const positionBufferSize = SIMULATION_PARAMS.NUM_PARTICLES * 4 * 4;

      // Use separate copy buffers to avoid conflicts
      gl2.bindBuffer(
        gl2.COPY_READ_BUFFER,
        computeSystem.particleBuffers[nextIndex * 2]
      );
      gl2.bindBuffer(gl2.COPY_WRITE_BUFFER, computeSystem.visualizationBuffer);
      gl2.copyBufferSubData(
        gl2.COPY_READ_BUFFER,
        gl2.COPY_WRITE_BUFFER,
        0,
        0,
        positionBufferSize
      );

      // Update current index
      computeSystem.currentIndex = nextIndex;

      // Update terrain material
      const material = meshRef.current.material as THREE.ShaderMaterial;
      if (heightMapRef.current) {
        material.uniforms.heightMap.value = heightMapRef.current;
        heightMapRef.current.needsUpdate = true;
      }
    } catch (error) {
      console.error("Error in simulation step:", error);
    } finally {
      // Final cleanup - unbind EVERYTHING
      gl2.bindBuffer(gl2.ARRAY_BUFFER, null);
      gl2.bindBuffer(gl2.TRANSFORM_FEEDBACK_BUFFER, null);
      gl2.bindBuffer(gl2.COPY_READ_BUFFER, null);
      gl2.bindBuffer(gl2.COPY_WRITE_BUFFER, null);
      gl2.bindVertexArray(null);
      gl2.bindTexture(gl2.TEXTURE_2D, null);
      gl2.bindTransformFeedback(gl2.TRANSFORM_FEEDBACK, null);
      gl2.useProgram(null);
    }
  });

  return (
    <group>
      <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry
          args={[
            100,
            100,
            SIMULATION_PARAMS.GRID_SIZE - 1,
            SIMULATION_PARAMS.GRID_SIZE - 1,
          ]}
        />
        <shaderMaterial
          vertexShader={VERTEX_SHADER}
          fragmentShader={FRAGMENT_SHADER}
          uniforms={{
            heightMap: { value: heightMap },
            terrainScale: { value: 20.0 }, // Add scale uniform for height displacement
            colorLow: { value: new THREE.Color(0.2, 0.3, 0.8) },
            colorHigh: { value: new THREE.Color(0.8, 0.8, 0.3) },
          }}
        />
      </mesh>
      {/* <ParticleVis visualizationBuffer={computeSystem.visualizationBuffer} /> */}
    </group>
  );
};

export default GPUTerrainErosion;
