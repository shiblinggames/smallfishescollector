'use client'

import { Suspense, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { useGLTF, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'

function ShipModel({ url, color }: { url: string; color: string }) {
  const { scene } = useGLTF(url)
  const ref = useRef<THREE.Group>(null)

  useFrame((state) => {
    if (!ref.current) return
    ref.current.position.y = Math.sin(state.clock.elapsedTime * 0.8) * 0.04
  })

  return <primitive ref={ref} object={scene} />
}

export default function ShipViewer3D({ modelUrl, color }: { modelUrl: string; color: string }) {
  const hex = color ?? '#a07858'
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255

  return (
    <div style={{ width: '100%', height: 220, borderRadius: 14, overflow: 'hidden', background: 'rgba(255,255,255,0.03)' }}>
      <Canvas camera={{ position: [0, 0.6, 2.8], fov: 45 }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[4, 6, 4]} intensity={1.2} castShadow />
        <pointLight position={[0, 1, 0]} color={new THREE.Color(r, g, b)} intensity={0.8} distance={5} />
        <Suspense fallback={null}>
          <ShipModel url={modelUrl} color={hex} />
        </Suspense>
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
