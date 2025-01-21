import { extend, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

// Custom shader material for transform feedback
class TransformMaterial extends THREE.ShaderMaterial {
  constructor() {
    super({
      uniforms: {
        u_data: { value: null },
      },
      vertexShader: `
        uniform sampler2D u_data;
        varying vec4 v_data;

        void main() {
          vec4 i_data = texelFetch(u_data, ivec2(gl_VertexID, 0), 0);
          v_data = mod(i_data + 1.0, 10.0);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec4 v_data;
        void main() {
          gl_FragColor = v_data;
        }
      `,
    });
  }
}

// Extend R3F with our custom material
extend({ TransformMaterial });

declare global {
  namespace JSX {
    interface IntrinsicElements {
      transformMaterial: typeof TransformMaterial;
    }
  }
}

interface TransformFeedbackProps {
  size?: number;
}

const cam = new THREE.Camera();

export const TransformFeedback: React.FC<TransformFeedbackProps> = ({
  size = 2,
}) => {
  const { gl } = useThree();
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<TransformMaterial>(null);
  const [currentBuffer, setCurrentBuffer] = useState<0 | 1>(0);

  // Create initial data texture
  const dataTexture = useMemo(() => {
    const width = size;
    const height = 1;
    const data = new Float32Array(size * 4);
    data.forEach((_, i) => {
      data[i] = i;
    });

    const texture = new THREE.DataTexture(
      data,
      width,
      height,
      THREE.RGBAFormat,
      THREE.FloatType
    );
    texture.needsUpdate = true;
    return texture;
  }, [size]);

  // Setup ping-pong render targets
  const renderTargets = useMemo(() => {
    return [
      new THREE.WebGLRenderTarget(size, 1, {
        format: THREE.RGBAFormat,
        type: THREE.FloatType,
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
      }),
      new THREE.WebGLRenderTarget(size, 1, {
        format: THREE.RGBAFormat,
        type: THREE.FloatType,
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
      }),
    ];
  }, [size]);

  // Initialize with the data texture
  useEffect(() => {
    if (!materialRef.current) return;

    // Initial render to first buffer
    materialRef.current.uniforms.u_data.value = dataTexture;
    gl.setRenderTarget(renderTargets[0]);
    gl.render(meshRef.current!, cam);
    gl.setRenderTarget(null);

    // Set the first buffer as the current texture
    materialRef.current.uniforms.u_data.value = renderTargets[0].texture;
  }, [dataTexture, gl, renderTargets]);

  // Animation loop
  useFrame(() => {
    if (!meshRef.current || !materialRef.current) return;

    const nextBuffer = currentBuffer === 0 ? 1 : 0;

    // Read from current buffer, write to next buffer
    materialRef.current.uniforms.u_data.value =
      renderTargets[currentBuffer].texture;
    gl.setRenderTarget(renderTargets[nextBuffer]);
    gl.render(meshRef.current, cam);
    gl.setRenderTarget(null);

    // Swap buffers
    setCurrentBuffer(nextBuffer);
  });

  // Cleanup
  useEffect(() => {
    return () => {
      renderTargets[0].dispose();
      renderTargets[1].dispose();
    };
  }, [renderTargets]);

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[2, 2]} />
      <transformMaterial ref={materialRef} />
    </mesh>
  );
};
