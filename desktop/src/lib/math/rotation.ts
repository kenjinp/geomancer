import { Euler, Matrix4, Quaternion, Vector3 } from "three"

const tempQuat = new Quaternion()
const tempMatrix = new Matrix4()
export function rotateVectorByEuler(position: Vector3, euler: Euler): Vector3 {
  // Create a Quaternion from the Euler angles
  const quaternion = tempQuat.setFromEuler(euler)

  // Create a rotation matrix from the Quaternion
  const rotationMatrix = tempMatrix.makeRotationFromQuaternion(quaternion)

  // Apply the rotation to the position
  return position.applyMatrix4(rotationMatrix)
}
