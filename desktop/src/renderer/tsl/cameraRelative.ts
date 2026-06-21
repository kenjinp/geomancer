import { DetachedBindMode, Matrix4 } from "three";
import type * as THREE from "three/webgpu";

// Scratch matrices reused while rebasing skeletons (avoids per-frame allocs).
const _meshWorldInverse = new Matrix4();
const _boneMatrix = new Matrix4();

type SkeletonLike = {
  bones: THREE.Bone[];
  boneInverses: Matrix4[];
  boneMatrices: Float32Array;
  boneTexture?: { needsUpdate: boolean } | null;
  update: () => void;
};

type SkinnedMeshLike = THREE.Object3D & {
  isSkinnedMesh?: boolean;
  bindMode: typeof DetachedBindMode;
  bindMatrix: Matrix4;
  bindMatrixInverse: Matrix4;
  matrixWorld: Matrix4;
  skeleton: SkeletonLike;
};

/**
 * Rebase a skinned mesh's skeleton so its bone matrices stay near the origin.
 *
 * Linear-blend skinning happens on the GPU, but three uploads the bone matrices
 * (`boneWorld · inverseBind`) into a float32 buffer. When the mesh is millions
 * of metres from the world origin (our planet is centred at 0,0,0 with a
 * ~6.37e6 m radius) those matrices carry a huge translation and quantise to a
 * ~0.5 m grid, shattering the deformed mesh. Nothing downstream can recover it
 * because the damage is already baked into the bone buffer.
 *
 * Fix: switch the mesh to detached bind mode with identity bind matrices and
 * recompute each bone matrix relative to the mesh in float64
 * (`meshWorldⁱⁿᵛ · boneWorld · inverseBind`). The result is the exact same
 * mesh-local skinned position, but every uploaded matrix now has a small
 * (~metre-scale) translation, so float32 keeps full precision. The mesh's own
 * world matrix then places it via the standard view pipeline — identically to
 * the terrain — so the character moves in lock-step with the ground instead of
 * floating over it.
 */
function rebaseSkinnedMesh(mesh: SkinnedMeshLike): void {
  mesh.bindMode = DetachedBindMode;
  mesh.bindMatrix.identity();
  mesh.bindMatrixInverse.identity();

  const skeleton = mesh.skeleton;
  const { bones, boneInverses } = skeleton;

  skeleton.update = function () {
    _meshWorldInverse.copy(mesh.matrixWorld).invert();
    const boneMatrices = this.boneMatrices;
    for (let i = 0; i < bones.length; i++) {
      const bone = bones[i];
      _boneMatrix.multiplyMatrices(
        _meshWorldInverse,
        bone ? bone.matrixWorld : _boneMatrix.identity(),
      );
      _boneMatrix.multiply(boneInverses[i]);
      _boneMatrix.toArray(boneMatrices, i * 16);
    }
    if (this.boneTexture) this.boneTexture.needsUpdate = true;
  };
}

/**
 * Rebase every skinned mesh under `root` via {@link rebaseSkinnedMesh}. Use for
 * skinned characters that live far from the world origin (e.g. on a
 * planet-scale surface). Non-skinned meshes are left untouched: they render
 * correctly through the standard float32 view pipeline and stay aligned with
 * the (also float32) terrain.
 */
export function rebaseSkinnedMeshes(root: THREE.Object3D): void {
  root.traverse((child) => {
    const mesh = child as THREE.Object3D & { isSkinnedMesh?: boolean };
    if (mesh.isSkinnedMesh) {
      rebaseSkinnedMesh(mesh as unknown as SkinnedMeshLike);
    }
  });
}
