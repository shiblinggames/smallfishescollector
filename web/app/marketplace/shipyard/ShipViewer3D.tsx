'use client'

import { Suspense, useRef, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { useGLTF, OrbitControls, Environment, MeshWobbleMaterial } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import * as THREE from 'three'

function WaterPlane({ color }: { color: THREE.Color }) {
  const ref = useRef<THREE.Mesh>(null)
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.9, 0]}>
      <planeGeometry args={[12, 12, 1, 1]} />
      {/* @ts-ignore — MeshWobbleMaterial props */}
      <MeshWobbleMaterial
        color={color}
        factor={0.18}
        speed={0.6}
        transparent
        opacity={0.18}
        roughness={0.1}
        metalness={0.4}
      />
    </mesh>
  )
}

function ShipModel({ url }: { url: string }) {
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
    bobRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.8) * 0.06
  })

  return (
    <group ref={bobRef}>
      <group scale={scale} position={[-center.x * scale, -center.y * scale, -center.z * scale]}>
        <primitive object={scene} />
      </group>
    </group>
  )
}

export default function ShipViewer3D({ modelUrl, color, height = 220 }: { modelUrl: string; color: string; height?: number }) {
  const hex = color ?? '#a07858'
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const threeColor = new THREE.Color(r, g, b)

  return (
    <div style={{ width: '100%', height }}>
      <Canvas
        camera={{ position: [0, 0.8, 3.5], fov: 40 }}
        gl={{ alpha: true, antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
        style={{ background: 'transparent' }}
      >
        <ambientLight intensity={0.4} />
        <directionalLight position={[4, 6, 4]} intensity={1.0} />
        <pointLight position={[0, 1, 1]} color={threeColor} intensity={1.2} distance={10} />
        <Environment preset="sunset" />
        <Suspense fallback={null}>
          <ShipModel url={modelUrl} />
          <WaterPlane color={threeColor} />
        </Suspense>
        <EffectComposer>
          <Bloom intensity={0.4} luminanceThreshold={0.3} luminanceSmoothing={0.9} mipmapBlur />
        </EffectComposer>
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
