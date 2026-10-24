// Setup a standard definition of what a Humanoid is. The rig
// allows to work with different skeletons with various joint
// naming convention. This makes it easier to build a system

import { type Joint } from './Joint'
import { Pose } from './Pose'
import { RigItem } from './RigItem'
import Vec3 from './Vec3'

import type * as THREE from 'three'

// that speaks a single language of whats what.
export class Rig {
  public readonly skel: THREE.Skeleton

  /**
   * The T-Pose of the rig, representing the default pose of the skeleton
   * Initially set by passing in the base skeleton data
   */
  public readonly tpose: Pose
  public readonly chains: Record<string, RigItem[]> = {}
  public scalar: number = 1.0

  constructor (skel: THREE.Skeleton) {
    this.skel = skel
    this.tpose = new Pose(skel)
    // this.tpose.debug();
  }

  fromConfig (cfg: Record<string, string[]>): this {
    for (const [k, chain_names] of Object.entries(cfg)) {
      if (chain_names.length === 0) {
        console.log('Error - Rig.fromConfig : No joint names for chain ', k)
        continue
      }

      // if all values in chain is empty, no point in building the rig item
      const all_values_empty = chain_names.every(name => name === '')
      if (all_values_empty) {
        continue
      }

      switch (k) {
        case 'pelvis' :
          this.buildItem(k, chain_names, new Vec3(0, 0, 1), new Vec3(0, 1, 0))
          this.buildRigScalar(k)
          break
        case 'spine' :
          // Swing: points up (Y+), Twist: forward (Z+)
          this.buildItem(k, chain_names, new Vec3(0, 1, 0), new Vec3(0, 0, 1))
          break
        case 'head' :
          this.buildItem(k, chain_names, new Vec3(0, 0, 1), new Vec3(0, 1, 0))
          break
        case 'armL' :
          // Swing: points left (X+), Twist: back (Z-)
          this.buildItem(k, chain_names, new Vec3(1, 0, 0), new Vec3(0, 0, -1))
          break
        case 'armR' :
          // Swing: points right (X-), Twist: back (Z-)
          this.buildItem(k, chain_names, new Vec3(-1, 0, 0), new Vec3(0, 0, -1))
          break
        case 'legL' :
        case 'legR' :
          // Both Legs pointing down and twist in same direction
          // Swing: forward (Z+), Twist: down (Y-)
          this.buildItem(k, chain_names, new Vec3(0, 0, 1), new Vec3(0, -1, 0))
          break
        case 'fingersThumbL' :
          // Thumb points more forward/outward
          this.buildItem(k, chain_names, new Vec3(0.5, 0, 0.866), new Vec3(0, -1, 0))
          break
        case 'fingersIndexL' :
        case 'fingersMiddleL' :
        case 'fingersRingL' :
        case 'fingersPinkyL' :
          // Fingers extend similar to left arm
          this.buildItem(k, chain_names, new Vec3(1, 0, 0), new Vec3(0, 0, -1))
          break
        // Right hand fingers
        case 'fingersThumbR' :
          // Thumb points more forward/outward (mirrored)
          this.buildItem(k, chain_names, new Vec3(-0.5, 0, 0.866), new Vec3(0, -1, 0))
          break
        case 'fingersIndexR' :
        case 'fingersMiddleR' :
        case 'fingersRingR' :
        case 'fingersPinkyR' :
          // Fingers extend forward from palm (mirrored twist)
          this.buildItem(k, chain_names, new Vec3(-1, 0, 0), new Vec3(0, 0, -1))
          break
      }
    }
    return this
  }

  // k = chain key like 'pelvis', 'armL', etc

  /**
   * Builds a rig item chain for a given key using the provided joint names, swing, and twist vectors.
   * @param k - The key representing the chain (e.g., 'pelvis', 'armL').
   * @param names - An array of joint names to be included in the chain.
   * @param swing - The swing vector for the joints in the chain.
   * @param twist - The twist vector for the joints in the chain.
   * @returns The current Rig instance for chaining.
   */
  buildItem (k: string, names: string[], swing: Vec3, twist: Vec3): this {
    const rig_items: RigItem[] = []
    let j

    // Companion Core: braços e dedos têm o "swing" ao longo do osso. O original supõe pose T (braço reto no eixo X);
    // num rig em pose A (braço para baixo) isso erra a referência e os braços giram demais (cruzam na frente).
    // Aqui a direção sai da posição real das juntas (junta → próxima), e o "twist" é endireitado contra ela.
    const along_bone = k === 'armL' || k === 'armR' || k.startsWith('fingers')
    const joints = names.map((n) => this.tpose.getJoint(n))

    for (let i = 0; i < names.length; i++) {
      j = joints[i]
      if (j === null) {
        // some bones won't be mapped, so they will just be empty placeholders
        // console.log('Error - Rig.buildLimb : Joint name not found in tpose, ', n)
        continue
      }

      if (along_bone) {
        const next = joints.slice(i + 1).find((x) => x !== null) ?? null
        const prev = [...joints.slice(0, i)].reverse().find((x) => x !== null) ?? null
        const dir = new Vec3()
        if (next !== null) dir.fromSub(next.world.pos, j.world.pos)
        else if (prev !== null) dir.fromSub(j.world.pos, prev.world.pos)
        if (Vec3.lenSqr(dir) > 1e-12) {
          dir.norm()
          // só troca se a direção real não for quase o contrário da esperada (rig estranho: mantém o original)
          if (Vec3.dot(dir, swing) > -0.2) {
            const tw = new Vec3(twist[0], twist[1], twist[2])
            const d = Vec3.dot(tw, dir)
            tw.sub(new Vec3(dir[0] * d, dir[1] * d, dir[2] * d))
            if (Vec3.lenSqr(tw) > 1e-8) {
              tw.norm()
              rig_items.push(new RigItem().fromJoint(j, dir, tw))
              continue
            }
          }
        }
      }

      rig_items.push(new RigItem().fromJoint(j, swing, twist))
    }

    this.chains[k] = rig_items
    return this
  }

  // This will only be used for the pelvis chain
  // it helps with calculations with hips where characters might have different heights
  private buildRigScalar (chain_key: string): this {
    const ch: RigItem[] = this.chains[chain_key]

    // the chain can come back empty when none of its configured joint names exist in
    // this skeleton. Keep the default scalar rather than throwing - the retarget will
    // be poor, but a badly mapped rig should not take the whole preview down
    if (ch === undefined || ch.length === 0) {
      console.warn(`Rig.buildRigScalar: chain "${chain_key}" resolved to no joints, keeping default scalar.`)
      return this
    }

    const j: Joint = this.tpose.joints[ch[0].idx]
    this.scalar = j.world.pos[1]
    return this
  }

  // debugSkelVectors (): void {
  //   // const bAry = this.skel.bones;
  //   const tran = new Transform()
  //   const v = new Vec3()

  //   for (const [chName, ch] of Object.entries(this.chains)) {
  //     for (const itm of ch) {
  //       getWorld(this.skel, itm.idx, tran)
  //       Debug.pnt.add(tran.pos, 0xffff00, 0.8)

  //       v.fromQuat(tran.rot, itm.swing).norm().scale(0.1).add(tran.pos)
  //       Debug.ln.add(tran.pos, v, 0xffff00)

  //       v.fromQuat(tran.rot, itm.twist).norm().scale(0.1).add(tran.pos)
  //       Debug.ln.add(tran.pos, v, 0xff00ff)
  //     }
  //   }
  // }

  // debugTPoseVectors (): void {
  //   // const bAry = this.skel.bones;
  //   const tran: Transform = new Transform()
  //   const v = new Vec3()

  //   for (const [chName, ch] of Object.entries(this.chains)) {
  //     for (const itm of ch) {
  //       this.tpose.getWorld(itm.idx, tran)
  //       // Debug.pnt.add(tran.pos, 0xffff00, 0.8)

  //       v.fromQuat(tran.rot, itm.swing).norm().scale(0.1).add(tran.pos)
  //       // Debug.ln.add(tran.pos, v, 0xffff00)

  //       v.fromQuat(tran.rot, itm.twist).norm().scale(0.1).add(tran.pos)
  //       // Debug.ln.add(tran.pos, v, 0xff00ff)
  //     }
  //   }
  // }
}
