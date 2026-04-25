'use client'

import { Suspense, useRef, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { useGLTF, OrbitControls, Environment } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import * as THREE from 'three'

// Bloom intensity and accent light intensity scale with tier
const TIER_BLOOM: number[]  = [0,    0,    0.3,  0.5,  1.0,  2.0,  3.5]
const TIER_LIGHT: number[]  = [0,    0,    0.6,  0.8,  1.8,  3.0,  5.0]

function HookModel({ url }: { url: string }) {
  const { scene } = useGLTF(url)
  const bobRef = useRef<THREE.Group>(null)

  const { scale, center } = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene)
    const sphere = new THREE.Sphere()
    box.getBoundingSphere(sphere)
    const c = new THREE.Vector3()
    box.getCenter(c)
    return { scale: sphere.radius > 0 ? 1.6 / sphere.radius : 1, center: c }
  }, [scene])

  useFrame((state) => {
    if (!bobRef.current) return
    bobRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.9) * 0.05
  })

  return (
    <group ref={bobRef}>
      <group scale={scale} position={[-center.x * scale, -center.y * scale, -center.z * scale]}>
        <primitive object={scene} />
      </group>
    </group>
  )
}

export default function HookViewer3D({ modelUrl, color, tier, height = 220 }: { modelUrl: string; color: string; tier: number; height?: number }) {
  const hex = color ?? '#a07858'
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255

  const bloomIntensity = TIER_BLOOM[Math.min(tier, TIER_BLOOM.length - 1)]
  const lightIntensity = TIER_LIGHT[Math.min(tier, TIER_LIGHT.length - 1)]
  const useBloom = bloomIntensity > 0

  return (
    <div style={{ width: '100%', height }}>
      <Canvas
        camera={{ position: [0, 0.8, 3.5], fov: 40 }}
        gl={{ alpha: true, antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
        style={{ background: 'transparent' }}
      >
        <ambientLight intensity={0.4} />
        <directionalLight position={[4, 6, 4]} intensity={1.0} />
        {lightIntensity > 0 && (
          <pointLight position={[0, 1, 1]} color={new THREE.Color(r, g, b)} intensity={lightIntensity} distance={8} />
        )}
        <Environment preset="warehouse" />
        <Suspense fallback={null}>
          <HookModel url={modelUrl} />
        </Suspense>
        {useBloom && (
          <EffectComposer>
            <Bloom intensity={bloomIntensity} luminanceThreshold={0.2} luminanceSmoothing={0.9} mipmapBlur />
          </EffectComposer>
        )}
        <OrbitControls
          autoRotate
          autoRotateSpeed={1.2}
          enableZoom={false}
          enablePan={false}
          minPolarAngle={Math.PI / 4}
          maxPolarAngle={Math.PI / 1.8}
        />
      </Canvas>
    </div>
  )
}
