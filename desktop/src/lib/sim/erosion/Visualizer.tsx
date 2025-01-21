import React, { useRef, useMemo, useEffect } from "react";
import { extend, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { SIMULATION_PARAMS } from "./constants";

const PARTICLE_VERTEX_SHADER = `
  attribute vec4 positionHeight;
  attribute vec4 velocityWater;
  
  varying vec4 vColor;
  
  void main() {
    // Get particle position and properties
    vec3 pos = vec3(positionHeight.xy, positionHeight.z * 2.0);
    float water = velocityWater.z;
    float sediment = velocityWater.w;
    
    // Color based on water content and sediment
    vColor = vec4(
      water,        // Red channel - water content
      sediment,     // Green channel - sediment content
      1.0 - water,  // Blue channel - inverse of water
      0.5          // Alpha - semi-transparent
    );
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = 2.0;
  }
`;

const PARTICLE_FRAGMENT_SHADER = `
  varying vec4 vColor;
  
  void main() {
    gl_FragColor = vColor;
  }
`;

// Update ParticleVis to use visualization buffer
export const ParticleVis: React.FC<{
  visualizationBuffer: WebGLBuffer;
}> = ({ visualizationBuffer }) => {
  const { gl } = useThree();
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();

    const positionArray = new Float32Array(SIMULATION_PARAMS.NUM_PARTICLES * 4);
    geo.setAttribute(
      "positionHeight",
      new THREE.BufferAttribute(positionArray, 4)
    );

    const velocityArray = new Float32Array(SIMULATION_PARAMS.NUM_PARTICLES * 4);
    geo.setAttribute(
      "velocityWater",
      new THREE.BufferAttribute(velocityArray, 4)
    );

    return geo;
  }, []);

  useFrame(() => {
    const gl2 = gl.getContext() as WebGL2RenderingContext;
    if (!gl2) return;

    // Read from visualization buffer
    gl2.bindBuffer(gl2.ARRAY_BUFFER, visualizationBuffer);
    const positionData = new Float32Array(SIMULATION_PARAMS.NUM_PARTICLES * 4);
    gl2.getBufferSubData(gl2.ARRAY_BUFFER, 0, positionData);

    // Update geometry attributes
    const positionAttr = geometry.getAttribute(
      "positionHeight"
    ) as THREE.BufferAttribute;
    positionAttr.array.set(positionData);
    positionAttr.needsUpdate = true;
  });

  return (
    <points geometry={geometry}>
      <shaderMaterial
        vertexShader={PARTICLE_VERTEX_SHADER}
        fragmentShader={PARTICLE_FRAGMENT_SHADER}
        transparent={true}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        vertexColors={true}
      />
    </points>
  );
};
